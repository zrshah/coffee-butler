// Face: draws the hologram head and speaks lines.
// It doesn't decide anything; main.js tells it to wake, sleep, idle, or say a line.
//
// The head is a flat SVG drawing (design made in Figma Make) that fakes 3D:
// the longitude lines are recalculated every frame so the grid turns like a globe,
// and flips are faked by squashing the whole head through zero.

// --- Look and feel ---
// The drawing uses a 1200x800 canvas; the browser scales it to fit the screen.
const CX = 600, CY = 402, R = 296;  // head center and radius
const WAKE_FLIP_MS = 600;          // the power-up flip when someone arrives (the greeting waits for it)
const BLINK_EVERY_MS = [2500, 6000]; // random gap between blinks (min, max)
const BLINK_MS = 140;
const AWAY_OPACITY = 0.35;         // dimmer while idling
const LOOK_AROUND = 0.25;          // idle head turn, side to side (radians, ~14 degrees)
const BOB_HEIGHT = 8;              // gentle idle float up and down
// The glow is a blur, the most expensive thing to draw. Add ?glow=0 to the URL to try without it.
const GLOW = new URLSearchParams(location.search).get('glow') !== '0';

// Head wobble: a side-to-side tilt (ear toward shoulder), always on, livelier while talking.
const WOBBLE_ANGLE = 0.08;          // max tilt in radians when quiet (~5 degrees)
const WOBBLE_ANGLE_TALKING = 0.16;  // ~9 degrees while talking
const WOBBLE_SPEED = 2.2;           // quiet: about one wobble every 3 seconds
const WOBBLE_SPEED_TALKING = 5.5;   // talking: about one wobble a second
const WOBBLE_ANGLE_INDIAN = 0.3;    // ~17 degrees: the big, happy head bobble for en-IN lines
const WOBBLE_SPEED_INDIAN = 7;
const EXCITED_AFTER_WAKE_MS = 1800; // after waking, bobble like an Indian-accent line for this long
const NECK_LENGTH = R;              // the tilt pivots from this far below the head's center

// Grid density.
const GRID_RINGS = 17;          // latitude lines, top to bottom
const GRID_MERIDIANS = 24;      // longitude lines all the way around (about half are on the back)
const RING_TILT = 0.1;          // how open the rings look; we see the head from slightly above
const BACK_LINE_OPACITY = 0.22; // lines on the far side of the head show through faintly

// Tricks: every so often the head does a flip, a spin, or a bounce.
const TRICK_EVERY_MS = [6000, 12000]; // random gap between tricks (min, max); doubled while away
const TRICK_MS = { flip: 750, spin: 900, bounce: 900 };
const BOUNCE_HEIGHT = 110;

export function createFace(container) {
  container.innerHTML = headSvg();
  const svg = container.querySelector('svg');
  const head = svg.querySelector('.head');
  const frontMeridians = svg.querySelector('.meridians-front');
  const backMeridians = svg.querySelector('.meridians-back');
  const face = svg.querySelector('.face');
  const eyes = svg.querySelector('.eyes');
  const brows = svg.querySelector('.brows');
  const mouth = svg.querySelector('.mouth');

  let mode = 'sleeping'; // 'sleeping' | 'awake' | 'away'
  let running = false;
  let wakeStartedAt = -Infinity;
  let wakeDone = Promise.resolve();
  let talking = false;
  let accent = null;           // accent of the line being said, e.g. 'en-IN'
  let excitedUntil = -Infinity;
  let trick = null;            // { kind, startedAt } while a trick is playing
  let nextTrickAt = Infinity;
  let nextBlinkAt = performance.now() + 2000;
  let lastFrameAt = performance.now();
  let wobblePhase = 0;
  let wobbleAngle = WOBBLE_ANGLE;
  let browLift = 0;

  // FPS counter for the debug display.
  let frames = 0, fpsWindowStart = performance.now(), fps = 0;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = Math.min(0.1, (now - lastFrameAt) / 1000); // cap: first frame after sleeping
    lastFrameAt = now;

    // Wake-up: flip a full turn and grow from small, easing to a stop.
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

    const slow = mode === 'away' ? 0.5 : 1;
    const flip = wakeFlip + trickFlip;                              // around the side-to-side axis
    const turn = Math.sin(t * 0.4 * slow) * LOOK_AROUND + trickSpin; // around the up-down axis

    // Head wobble. We advance a "phase" by speed x time-since-last-frame instead of
    // using sin(t * speed) directly, so switching speeds doesn't make the head jump.
    // Big bobble: just after waking, and while saying an Indian-accent line.
    const bigBobble = now < excitedUntil || (talking && accent === 'en-IN');
    const speed = bigBobble ? WOBBLE_SPEED_INDIAN : talking ? WOBBLE_SPEED_TALKING : WOBBLE_SPEED;
    const targetAngle = bigBobble ? WOBBLE_ANGLE_INDIAN : talking ? WOBBLE_ANGLE_TALKING : WOBBLE_ANGLE;
    wobblePhase += dt * speed * slow;
    wobbleAngle += (targetAngle - wobbleAngle) * Math.min(1, dt * 4); // ease toward target
    const tiltDegrees = Math.sin(wobblePhase) * wobbleAngle * (180 / Math.PI);

    // Whole head: float and hop, tilt from the "neck", then scale around the center.
    // A flip is faked by squashing the height through zero (cos goes 1 -> -1 -> 1).
    const y = Math.sin(t * 1.5 * slow) * BOB_HEIGHT - hop;
    const sx = size * (1 + squash * 0.5);
    const sy = size * (1 - squash) * Math.cos(flip);
    head.setAttribute('transform',
      `translate(0 ${y}) rotate(${tiltDegrees} ${CX} ${CY + NECK_LENGTH}) ` +
      `translate(${CX} ${CY}) scale(${sx} ${sy}) translate(${-CX} ${-CY})`);

    // The grid turns like a globe, and the face slides across and narrows with it.
    drawMeridians(turn);
    const faceShift = R * 0.85 * Math.sin(turn);
    face.setAttribute('transform',
      `translate(${CX + faceShift} 0) scale(${Math.cos(turn)} 1) translate(${-CX} 0)`);
    // Hide the face while its back is toward us (mid-flip or mid-spin).
    face.style.visibility = Math.cos(turn) > 0 && Math.cos(flip) > 0 ? 'visible' : 'hidden';

    // Blink: squash the eyes flat for a moment.
    const blinking = now >= nextBlinkAt && now < nextBlinkAt + BLINK_MS;
    if (now >= nextBlinkAt + BLINK_MS) nextBlinkAt = now + randomBetween(...BLINK_EVERY_MS);
    eyes.setAttribute('transform', blinking ? 'translate(0 355) scale(1 0.08) translate(0 -355)' : '');

    // Brows go up when excited and lift now and then while talking.
    const browTarget = bigBobble ? 12 : talking ? 7 * Math.abs(Math.sin(t * 2.1)) : 0;
    browLift += (browTarget - browLift) * Math.min(1, dt * 6);
    brows.setAttribute('transform', `translate(0 ${-browLift})`);

    // Talking: fake mouth movement while a line plays.
    const open = talking ? 0.55 + 0.9 * Math.abs(Math.sin(t * 14) * Math.sin(t * 5.3)) : 1;
    mouth.setAttribute('transform', `translate(0 525) scale(1 ${open}) translate(0 -525)`);

    frames++;
    if (now - fpsWindowStart >= 1000) {
      fps = frames;
      frames = 0;
      fpsWindowStart = now;
    }
  }

  // Longitude lines: each is half an ellipse from the top of the head to the bottom.
  // A line at angle "lon" around the head sits R*sin(lon) from the middle,
  // and is on the front when cos(lon) is positive.
  function drawMeridians(turn) {
    let front = '', back = '';
    for (let i = 0; i < GRID_MERIDIANS; i++) {
      const lon = turn + (i / GRID_MERIDIANS) * Math.PI * 2;
      const rx = Math.abs(R * Math.sin(lon)).toFixed(1);
      const side = Math.sin(lon) > 0 ? 1 : 0; // which way the arc bulges
      const arc = `M${CX} ${CY - R}A${rx} ${R} 0 0 ${side} ${CX} ${CY + R}`;
      if (Math.cos(lon) > 0) front += arc;
      else back += arc;
    }
    frontMeridians.setAttribute('d', front);
    backMeridians.setAttribute('d', back);
  }

  function scheduleTrick(now) {
    const gap = randomBetween(...TRICK_EVERY_MS) * (mode === 'away' ? 2 : 1);
    nextTrickAt = now + gap;
  }

  function wake() {
    mode = 'awake';
    svg.style.opacity = 1;
    svg.style.visibility = 'visible';
    wakeStartedAt = performance.now();
    excitedUntil = wakeStartedAt + WAKE_FLIP_MS + EXCITED_AFTER_WAKE_MS;
    // Land the flip with a bounce, then do tricks on the usual schedule.
    trick = { kind: 'bounce', startedAt: wakeStartedAt + WAKE_FLIP_MS };
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
    wakeDone = new Promise(resolve => setTimeout(resolve, WAKE_FLIP_MS));
    return wakeDone;
  }

  // Sleeping: stop drawing entirely (saves power) and show pure black.
  function sleep() {
    mode = 'sleeping';
    stopTalking();
    running = false;
    svg.style.visibility = 'hidden';
    trick = null;
    nextTrickAt = Infinity;
  }

  function idle() {
    mode = 'away';
    svg.style.opacity = AWAY_OPACITY;
  }

  function lookAlive() {
    mode = 'awake';
    svg.style.opacity = 1;
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
      currentAudio = clips.get(phrase.audio) ?? new Audio(phrase.audio);
      currentAudio.currentTime = 0;
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

  // Download every clip up front, so the first time a line plays there's no wait.
  const clips = new Map();
  function preload(phrases) {
    for (const { audio } of phrases) {
      if (!audio || clips.has(audio)) continue;
      const clip = new Audio(audio);
      clip.preload = 'auto';
      clip.load();
      clips.set(audio, clip);
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

  sleep();
  return { wake, sleep, idle, lookAlive, say, preload, getFps: () => (mode === 'sleeping' ? 0 : fps) };
}

// Latitude rings, split into front halves (lower arcs) and back halves (upper arcs).
// They never move relative to the head, so they're built once.
function ringPaths() {
  let front = '', back = '';
  for (let i = 1; i <= GRID_RINGS; i++) {
    const lat = (i / (GRID_RINGS + 1)) * Math.PI; // 0 = top of the head, PI = bottom
    const y = (CY - R * Math.cos(lat)).toFixed(1);
    const rx = (R * Math.sin(lat)).toFixed(1);
    const ry = (R * Math.sin(lat) * RING_TILT).toFixed(1);
    const left = `M${CX - rx} ${y}`, right = `${CX + +rx} ${y}`;
    front += `${left}A${rx} ${ry} 0 0 0 ${right}`;
    back += `${left}A${rx} ${ry} 0 0 1 ${right}`;
  }
  return { front, back };
}

// The drawing itself, from the Figma Make design. Classes are the parts frame() moves.
function headSvg() {
  const rings = ringPaths();
  return `
<svg viewBox="0 0 1200 800" style="display:block;width:100vw;height:100vh" aria-hidden="true">
  <style>
    .signal-break { animation: signal 7.2s steps(1, end) infinite; }
    @keyframes signal {
      0%, 68%, 72%, 100% { transform: translateX(0); opacity: 0.55; }
      69% { transform: translateX(20px); opacity: 0.9; }
      70% { transform: translateX(-12px); opacity: 0.28; }
      71% { transform: translateX(6px); opacity: 0.75; }
    }
  </style>
  <defs>
    <radialGradient id="sphere-depth" cx="46%" cy="38%" r="66%">
      <stop offset="0" stop-color="#1279a6" stop-opacity="0.12" />
      <stop offset="0.68" stop-color="#063650" stop-opacity="0.06" />
      <stop offset="1" stop-color="#01070b" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="wire-light" gradientUnits="userSpaceOnUse" x1="375" y1="153" x2="825" y2="651">
      <stop stop-color="#b8f4ff" stop-opacity="0.86" />
      <stop offset="0.48" stop-color="#39bce8" stop-opacity="0.58" />
      <stop offset="1" stop-color="#08729f" stop-opacity="0.38" />
    </linearGradient>
    <linearGradient id="face-light" x1="0" x2="1">
      <stop stop-color="#e0fbff" />
      <stop offset="0.5" stop-color="#68ddff" />
      <stop offset="1" stop-color="#1da7e1" />
    </linearGradient>
    <pattern id="fine-scan" width="5" height="5" patternUnits="userSpaceOnUse">
      <rect width="5" height="1" fill="#d4f9ff" opacity="0.12" />
    </pattern>
    <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur result="blur" stdDeviation="5" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <clipPath id="sphere-clip"><circle cx="${CX}" cy="${CY}" r="${R}" /></clipPath>
  </defs>

  <g class="head">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#sphere-depth)" />

    <g fill="none" stroke="url(#wire-light)" stroke-width="1.45">
      <g opacity="${BACK_LINE_OPACITY}">
        <path d="${rings.back}" />
        <path class="meridians-back" />
      </g>
      <g opacity="0.66">
        <path d="${rings.front}" />
        <path class="meridians-front" />
      </g>
    </g>

    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="url(#wire-light)" stroke-width="3" />
    <circle cx="${CX}" cy="${CY}" r="${R - 7}" fill="none" stroke="#49c9ed" stroke-opacity="0.18" />

    <g class="face" ${GLOW ? 'filter="url(#soft-glow)"' : ''}>
      <g class="brows" fill="none" stroke="#68dcf9" stroke-linecap="round" stroke-width="7">
        <path d="M452 314Q505 287 547 314" />
        <path d="M650 309Q707 281 753 320" />
      </g>
      <g class="eyes">
        <path d="M447 355Q501 316 557 355Q506 405 447 355Z" fill="url(#face-light)" fill-opacity="0.74" stroke="#b9f5ff" stroke-width="3" />
        <path d="M646 353Q704 309 761 356Q707 406 646 353Z" fill="url(#face-light)" fill-opacity="0.74" stroke="#b9f5ff" stroke-width="3" />
        <ellipse cx="518" cy="354" rx="13" ry="18" fill="#00131e" />
        <ellipse cx="717" cy="353" rx="13" ry="18" fill="#00131e" />
        <circle cx="523" cy="348" r="4" fill="#e6fcff" />
        <circle cx="722" cy="347" r="4" fill="#e6fcff" />
        <path d="M447 355Q501 316 557 355Q506 405 447 355ZM646 353Q704 309 761 356Q707 406 646 353Z" fill="url(#fine-scan)" />
      </g>
      <g class="mouth">
        <path d="M503 512Q580 555 691 500Q645 561 554 550Q519 543 503 512Z" fill="#00090e" stroke="#72e3ff" stroke-linejoin="round" stroke-width="5" />
        <path d="M531 531Q611 552 671 515" fill="none" stroke="#d9faff" stroke-linecap="round" stroke-opacity="0.75" stroke-width="4" />
      </g>
    </g>

    <g clip-path="url(#sphere-clip)">
      <g class="signal-break">
        <rect x="301" y="444" width="598" height="5" fill="#8be9ff" opacity="0.28" />
        <rect x="369" y="447" width="422" height="2" fill="#d6faff" opacity="0.48" />
      </g>
    </g>
  </g>
</svg>`;
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
