// main.js: connects Sensor -> Brain -> Face. The only file that knows all three.
import { createCameraSensor, MOTION_SCORE_THRESHOLD } from './sensor.js';
import { createBrain, SLEEPING, PRESENT, AWAY } from './brain.js';
import { createFace } from './face.js';

const TICK_EVERY_MS = 500;
const PEAK_WINDOW_MS = 5000; // the readout shows the highest motion score from this long ago until now
// Debug readout on by default while tuning. Add ?debug=0 to the address to hide it.
const SHOW_DEBUG = new URLSearchParams(location.search).get('debug') !== '0';

const startScreen = document.getElementById('start');
const debugEl = document.getElementById('debug');
const face = createFace(document.getElementById('stage'));

let lastScore = 0;
let recentScores = []; // { score, at } for the peak in the debug readout
let lastLine = '';

const phrases = await (await fetch('phrases.json')).json();
const brain = createBrain({
  phrases,
  storage: localStorage,
  onState(next, prev) {
    if (next === PRESENT && prev === SLEEPING) face.wake();
    else if (next === PRESENT) face.lookAlive();
    else if (next === AWAY) face.idle();
    else if (next === SLEEPING) face.sleep();
  },
  onSay(phrase) {
    lastLine = `[${phrase.category}/${phrase.accent}] ${phrase.text}`;
    face.say(phrase);
  },
});

const sensor = createCameraSensor({ preview: SHOW_DEBUG });
if (sensor.preview) document.body.appendChild(Object.assign(sensor.preview, { id: 'camera-preview' }));
sensor.addEventListener('score', e => {
  const now = Date.now();
  lastScore = e.detail.score;
  recentScores.push({ score: lastScore, at: now });
  recentScores = recentScores.filter(s => now - s.at <= PEAK_WINDOW_MS);
});
sensor.addEventListener('presence', e => brain.presence(e.detail.at));

// Browsers only allow sound, fullscreen and wake lock after a tap.
startScreen.addEventListener('click', async () => {
  startScreen.remove();
  document.documentElement.requestFullscreen?.().catch(() => {});
  keepScreenOn();
  primeSpeech();
  face.preload(phrases);
  try {
    await sensor.start();
  } catch (err) {
    lastLine = `Camera error: ${err.name}. Press M to fake motion.`;
  }
}, { once: true });

// Keyboard shortcut for testing on a computer: M = pretend someone moved.
addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') sensor.simulatePresence();
});

setInterval(() => {
  brain.tick(Date.now());
  if (SHOW_DEBUG) {
    debugEl.textContent =
      `state: ${brain.getState()}\n` +
      `camera: ${sensor.getStatus()}\n` +
      `motion: ${lastScore.toFixed(1)}% (peak 5s: ${peakScore().toFixed(1)}%, needs ${MOTION_SCORE_THRESHOLD}%)\n` +
      `fps: ${face.getFps()}\n` +
      `last line: ${lastLine}`;
  }
}, TICK_EVERY_MS);

function peakScore() {
  return Math.max(0, ...recentScores.map(s => s.score));
}

// Wake Lock stops the tablet dimming (which would also stop the camera).
// The browser drops the lock when the page is hidden, so re-request when visible.
let wakeLock = null;
async function keepScreenOn() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch (err) {
    lastLine = `Wake lock failed: ${err.name}`;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock?.released !== false) keepScreenOn();
});

// Android Chrome only speaks after speech has been started from a tap,
// so say "nothing" once during the start tap to unlock it.
function primeSpeech() {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}
