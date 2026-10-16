// Face: draws the hologram head and speaks lines.
// It doesn't decide anything; main.js tells it to wake, sleep, idle, or say a line.
import * as THREE from 'three';

// --- Look and feel ---
const HOLOGRAM_BLUE = 0x4cc9f0;
const WAKE_FLIP_MS = 900;          // the power-up spin when someone arrives
const BLINK_EVERY_MS = [2500, 6000]; // random gap between blinks (min, max)
const BLINK_MS = 140;
const AWAY_OPACITY = 0.35;         // dimmer while idling

// Head wobble: a side-to-side tilt (ear toward shoulder), always on, livelier while talking.
const WOBBLE_ANGLE = 0.08;          // max tilt in radians when quiet (~5 degrees)
const WOBBLE_ANGLE_TALKING = 0.16;  // ~9 degrees while talking
const WOBBLE_SPEED = 2.2;           // quiet: about one wobble every 3 seconds
const WOBBLE_SPEED_TALKING = 5.5;   // talking: about one wobble a second
const NECK_LENGTH = 1.2;            // the tilt pivots from this far below the head's center
const WOBBLE_ANGLE_INDIAN = 0.3;    // ~17 degrees: the big, happy head bobble for en-IN lines
const WOBBLE_SPEED_INDIAN = 7;
const EXCITED_AFTER_WAKE_MS = 1800; // after waking, bobble like an Indian-accent line for this long

// Grid density: lines around (longitude) and top-to-bottom (latitude).
// M1 baseline was a 24x16 sphere at ~30 fps on the tablet; check fps after changing these.
const HEAD_RADIUS = 1.2;
const GRID_AROUND = 36;
const GRID_DOWN = 24;
const BACK_LINE_OPACITY = 0.18;    // lines on the far side of the head show through faintly

// Tricks: every so often the head does a flip, a spin, or a bounce.
const TRICK_EVERY_MS = [6000, 12000]; // random gap between tricks (min, max); doubled while away
const TRICK_MS = { flip: 750, spin: 750, bounce: 900 };
const BOUNCE_HEIGHT = 0.45;

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
  const glow = { color: HOLOGRAM_BLUE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const frontLines = new THREE.LineBasicMaterial({ ...glow, opacity: 1 });
  const backLines = new THREE.LineBasicMaterial({ ...glow, opacity: BACK_LINE_OPACITY, depthTest: false });
  const solid = new THREE.MeshBasicMaterial({ ...glow, opacity: 1 });

  const head = new THREE.Group();
  scene.add(head);
  // Draw the grid twice: once faintly with no depth check (so the back shows through),
  // once brightly, where an invisible inner sphere hides the back half.
  const grid = makeGridGeometry(HEAD_RADIUS, GRID_AROUND, GRID_DOWN);
  const back = new THREE.LineSegments(grid, backLines);
  const blocker = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS * 0.9, 16, 12),
    new THREE.MeshBasicMaterial({ colorWrite: false }), // writes depth only, draws nothing
  );
  const front = new THREE.LineSegments(grid, frontLines);
  back.renderOrder = 0;
  blocker.renderOrder = 1;
  front.renderOrder = 2;
  head.add(back, blocker, front);

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
  let lastFrameAt = performance.now();
  let wobblePhase = 0;
  let wobbleAngle = WOBBLE_ANGLE;
  let accent = null;           // accent of the line being said, e.g. 'en-IN'
  let excitedUntil = -Infinity;
  let trick = null;            // { kind, startedAt } while a trick is playing
  let nextTrickAt = Infinity;

  // FPS counter for the debug display.
  let frames = 0, fpsWindowStart = performance.now(), fps = 0;

  function frame(now) {
    const t = now / 1000;

    // Wake-up: spin a full turn and grow from small, easing to a stop.
    const wakeProgress = Math.min(1, Math.max(0, (now - wakeStartedAt) / WAKE_FLIP_MS));
    const eased = 1 - Math.pow(1 - wakeProgress, 3);
    const wakeFlip = (1 - eased) * -Math.PI * 2;
    const size = 0.2 + 0.8 * eased;

    // Tricks: start one when it's due (never mid-sentence), play it, then schedule the next.
    if (!trick && !talking && now >= nextTrickAt) {
      trick = { kind: pick(['flip', 'spin', 'bounce']), startedAt: now };
    }
    let trickFlip = 0, trickSpin = 0, hop = 0, squash = 0;
    if (trick && now >= trick.startedAt) {
      const p = Math.min(1, (now - trick.startedAt) / TRICK_MS[trick.kind]);
      const smooth = p * p * (3 - 2 * p); // "smoothstep": starts slow, speeds up, ends slow
      if (trick.kind === 'flip') trickFlip = smooth * Math.PI * 2;
      if (trick.kind === 'spin') trickSpin = smooth * Math.PI * 2;
      if (trick.kind === 'bounce') {
        // Two hops, the second one lower. |sin| makes each hop an arch.
        const arch = Math.abs(Math.sin(p * Math.PI * 2));
        hop = arch * BOUNCE_HEIGHT * (1 - p * 0.5);
        squash = 0.15 * Math.pow(1 - arch, 6); // flatten a little when "touching the floor"
      }
      if (p >= 1) {
        trick = null;
        scheduleTrick(now);
      }
    }

    // Gentle idle life: bob up and down, look slightly side to side.
    const slow = mode === 'away' ? 0.5 : 1;
    head.rotation.x = wakeFlip + trickFlip;
    head.rotation.y = Math.sin(t * 0.4 * slow) * 0.25 + trickSpin;
    head.scale.set(size * (1 + squash * 0.5), size * (1 - squash), size * (1 + squash * 0.5));

    // Head wobble. We advance a "phase" by speed x time-since-last-frame instead of
    // using sin(t * speed) directly, so switching speeds doesn't make the head jump.
    // Big bobble: just after waking, and while saying an Indian-accent line.
    const dt = Math.min(0.1, (now - lastFrameAt) / 1000); // cap: first frame after sleeping
    lastFrameAt = now;
    const bigBobble = now < excitedUntil || (talking && accent === 'en-IN');
    const speed = bigBobble ? WOBBLE_SPEED_INDIAN : talking ? WOBBLE_SPEED_TALKING : WOBBLE_SPEED;
    const targetAngle = bigBobble ? WOBBLE_ANGLE_INDIAN : talking ? WOBBLE_ANGLE_TALKING : WOBBLE_ANGLE;
    wobblePhase += dt * speed * slow;
    wobbleAngle += (targetAngle - wobbleAngle) * Math.min(1, dt * 4); // ease toward target
    head.rotation.z = Math.sin(wobblePhase) * wobbleAngle;
    // Pivot from the "neck": when the top tilts left, the whole head swings left too.
    head.position.x = -Math.sin(head.rotation.z) * NECK_LENGTH;
    head.position.y = Math.sin(t * 1.5 * slow) * 0.06 + hop;

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
    frontLines.opacity = solid.opacity = value;
    backLines.opacity = value * BACK_LINE_OPACITY;
  }

  function wake() {
    mode = 'awake';
    setOpacity(1);
    renderer.domElement.style.visibility = 'visible';
    wakeStartedAt = performance.now();
    excitedUntil = wakeStartedAt + WAKE_FLIP_MS + EXCITED_AFTER_WAKE_MS;
    // Land the flip with a bounce, then do tricks on the usual schedule.
    trick = { kind: 'bounce', startedAt: wakeStartedAt + WAKE_FLIP_MS };
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
    trick = null;
    nextTrickAt = Infinity;
  }

  function scheduleTrick(now) {
    const gap = randomBetween(...TRICK_EVERY_MS) * (mode === 'away' ? 2 : 1);
    nextTrickAt = now + gap;
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
    accent = phrase.accent;
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

// A globe-style grid: latitude rings plus longitude lines, as pairs of points
// for LineSegments. Unlike wireframe: true, this has no diagonal triangle edges.
function makeGridGeometry(radius, around, down) {
  const points = [];
  const at = (lat, lon) => [
    radius * Math.sin(lat) * Math.sin(lon),
    radius * Math.cos(lat),
    radius * Math.sin(lat) * Math.cos(lon),
  ];
  for (let i = 0; i <= down; i++) {
    for (let j = 0; j < around; j++) {
      const lat = (i / down) * Math.PI;
      const lon = (j / around) * Math.PI * 2;
      const nextLon = ((j + 1) / around) * Math.PI * 2;
      const nextLat = ((i + 1) / down) * Math.PI;
      if (i > 0 && i < down) points.push(...at(lat, lon), ...at(lat, nextLon)); // ring segment
      if (i < down) points.push(...at(lat, lon), ...at(nextLat, lon));          // longitude segment
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
