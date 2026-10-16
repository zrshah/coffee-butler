// Face: draws the hologram head and speaks lines.
// It doesn't decide anything; main.js tells it to wake, sleep, idle, or say a line.
import * as THREE from 'three';

// --- Look and feel ---
const HOLOGRAM_BLUE = 0x4cc9f0;
const WAKE_FLIP_MS = 900;          // the power-up spin when someone arrives
const BLINK_EVERY_MS = [2500, 6000]; // random gap between blinks (min, max)
const BLINK_MS = 140;
const AWAY_OPACITY = 0.35;         // dimmer while idling

export function createFace(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  camera.position.z = 5;

  // Pixel ratio 1: the A7 Lite does ~30+ fps like this (Milestone 1 test).
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  // Additive blending makes overlapping lines glow brighter, like light.
  const material = new THREE.MeshBasicMaterial({
    color: HOLOGRAM_BLUE, wireframe: true, transparent: true,
    opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const solid = new THREE.MeshBasicMaterial({
    color: HOLOGRAM_BLUE, transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
  });

  const head = new THREE.Group();
  scene.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14), material));

  const eyeGeometry = new THREE.SphereGeometry(0.11, 8, 6);
  const leftEye = new THREE.Mesh(eyeGeometry, solid);
  const rightEye = new THREE.Mesh(eyeGeometry, solid);
  leftEye.position.set(-0.38, 0.25, 1.12);
  rightEye.position.set(0.38, 0.25, 1.12);
  head.add(leftEye, rightEye);

  // The mouth is a ring squashed flat; stretching it taller "opens" it.
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 24), solid);
  mouth.position.set(0, -0.35, 1.1);
  mouth.scale.y = 0.15;
  head.add(mouth);

  let mode = 'sleeping'; // 'sleeping' | 'awake' | 'away'
  let wakeStartedAt = -Infinity;
  let wakeDone = Promise.resolve();
  let talking = false;
  let nextBlinkAt = performance.now() + 2000;

  // FPS counter for the debug display.
  let frames = 0, fpsWindowStart = performance.now(), fps = 0;

  function frame(now) {
    const t = now / 1000;

    // Wake-up: spin a full turn and grow from small, easing to a stop.
    const wakeProgress = Math.min(1, (now - wakeStartedAt) / WAKE_FLIP_MS);
    const eased = 1 - Math.pow(1 - wakeProgress, 3);
    head.rotation.x = (1 - eased) * -Math.PI * 2;
    head.scale.setScalar(0.2 + 0.8 * eased);

    // Gentle idle life: bob up and down, look slightly side to side.
    const slow = mode === 'away' ? 0.5 : 1;
    head.position.y = Math.sin(t * 1.5 * slow) * 0.06;
    head.rotation.y = Math.sin(t * 0.4 * slow) * 0.25;

    // Blink: squash the eyes flat for a moment.
    const blinking = now >= nextBlinkAt && now < nextBlinkAt + BLINK_MS;
    if (now >= nextBlinkAt + BLINK_MS) nextBlinkAt = now + randomBetween(...BLINK_EVERY_MS);
    leftEye.scale.y = rightEye.scale.y = blinking ? 0.1 : 1;

    // Talking: fake mouth movement while a line plays.
    mouth.scale.y = talking ? 0.3 + 0.9 * Math.abs(Math.sin(t * 14) * Math.sin(t * 5.3)) : 0.15;

    renderer.render(scene, camera);

    frames++;
    if (now - fpsWindowStart >= 1000) {
      fps = frames;
      frames = 0;
      fpsWindowStart = now;
    }
  }

  function setOpacity(value) {
    material.opacity = solid.opacity = value;
  }

  function wake() {
    mode = 'awake';
    setOpacity(1);
    renderer.domElement.style.visibility = 'visible';
    wakeStartedAt = performance.now();
    renderer.setAnimationLoop(frame);
    wakeDone = new Promise(resolve => setTimeout(resolve, WAKE_FLIP_MS));
    return wakeDone;
  }

  // Sleeping: stop drawing entirely (saves power) and show pure black.
  function sleep() {
    mode = 'sleeping';
    stopTalking();
    renderer.setAnimationLoop(null);
    renderer.domElement.style.visibility = 'hidden';
  }

  function idle() {
    mode = 'away';
    setOpacity(AWAY_OPACITY);
  }

  function lookAlive() {
    mode = 'awake';
    setOpacity(1);
  }

  // Say a line: play its audio clip if it has one, otherwise use the
  // browser's built-in text-to-speech as a stand-in until clips exist.
  async function say(phrase) {
    await wakeDone; // never talk mid-flip
    stopTalking();
    talking = true;
    // Each line gets a number; a late "finished" from an older, cancelled line is ignored.
    const myLine = ++lineNumber;
    const done = () => {
      if (myLine !== lineNumber) return;
      talking = false;
      clearTimeout(talkTimer);
    };
    // Backup in case the browser never reports "finished" (Android sometimes doesn't):
    // stop the mouth after roughly how long the line should take to say.
    talkTimer = setTimeout(done, 1500 + phrase.text.split(' ').length * 450);
    if (phrase.audio) {
      currentAudio = new Audio(phrase.audio);
      currentAudio.onended = currentAudio.onerror = done;
      currentAudio.play().catch(done);
    } else if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(phrase.text);
      const voice = pickVoice(phrase.accent);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? phrase.accent ?? 'en-GB';
      utterance.onend = utterance.onerror = done;
      speechSynthesis.speak(utterance);
    } else {
      setTimeout(done, 2000);
    }
  }

  let currentAudio = null;
  let talkTimer = null;
  let lineNumber = 0;
  function stopTalking() {
    talking = false;
    clearTimeout(talkTimer);
    currentAudio?.pause();
    currentAudio = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  sleep();
  return { wake, sleep, idle, lookAlive, say, getFps: () => (mode === 'sleeping' ? 0 : fps) };
}

// Find an installed voice for an accent like "en-IN". Falls back to any English voice.
// Which accents exist depends on the device; Android usually has en-GB, en-IN, en-US, en-AU.
function pickVoice(accent) {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  const norm = v => v.lang.replace('_', '-').toLowerCase();
  const want = (accent ?? '').toLowerCase();
  return voices.find(v => norm(v) === want)
    ?? voices.find(v => norm(v).startsWith('en-gb'))
    ?? voices.find(v => norm(v).startsWith('en'))
    ?? null;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
