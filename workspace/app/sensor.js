// Sensor: watches the camera and announces when someone is nearby.
// It only knows about pixels. It has no idea what the butler does with the news.
//
// How: every SAMPLE_EVERY_MS, shrink the camera frame to a tiny grayscale image,
// compare it to the previous one, and count how many pixels changed.
// That percentage is the "motion score".

// --- Tuning knobs (starting guesses; adjust after testing on the tablet) ---
const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 48;
const SAMPLE_EVERY_MS = 200;
const PIXEL_CHANGE_THRESHOLD = 25; // how different (0-255) a pixel must be to count as "changed"
export const MOTION_SCORE_THRESHOLD = 2;  // % of pixels that must change to count as motion
const FRAMES_IN_A_ROW = 2;         // ignore single-frame flickers (e.g. camera noise)

// The sensor is an EventTarget: other code can listen for its events, like a button's 'click'.
//   'score'    -> every sample, detail = { score }          (for the debug display)
//   'presence' -> when motion is detected, detail = { score, at }
// Later versions can add fields such as `who` to 'presence' without breaking the brain.
// With preview: true, `sensor.preview` is a tiny canvas showing what the sensor sees,
// with changed pixels in red. Handy for tuning on the tablet.
export function createCameraSensor({ preview = false } = {}) {
  const events = new EventTarget();
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const previewCanvas = preview ? document.createElement('canvas') : null;
  if (previewCanvas) {
    previewCanvas.width = SAMPLE_WIDTH;
    previewCanvas.height = SAMPLE_HEIGHT;
  }
  const previewCtx = previewCanvas?.getContext('2d');
  let status = 'off';

  let previous = null; // the last frame's grayscale pixels
  let motionFrames = 0;

  async function start() {
    status = 'starting';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
        audio: false,
      });
    } catch (err) {
      status = `error: ${err.name}`;
      throw err;
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    // Kept in the page but invisible; some browsers pause hidden-by-display:none videos.
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    await video.play();
    status = `on (${video.videoWidth}x${video.videoHeight})`;
    setInterval(sample, SAMPLE_EVERY_MS);
  }

  function sample() {
    if (video.readyState < 2) return; // no frame yet
    ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const rgba = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;

    // Convert to grayscale: one brightness number per pixel.
    const gray = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
    }

    if (previous) {
      let changed = 0;
      const shown = previewCtx?.createImageData(SAMPLE_WIDTH, SAMPLE_HEIGHT);
      for (let i = 0; i < gray.length; i++) {
        const moved = Math.abs(gray[i] - previous[i]) > PIXEL_CHANGE_THRESHOLD;
        if (moved) changed++;
        if (shown) {
          shown.data.set(moved ? [255, 40, 40, 255] : [gray[i], gray[i], gray[i], 255], i * 4);
        }
      }
      if (shown) previewCtx.putImageData(shown, 0, 0);
      const score = (changed / gray.length) * 100;
      events.dispatchEvent(new CustomEvent('score', { detail: { score } }));

      motionFrames = score >= MOTION_SCORE_THRESHOLD ? motionFrames + 1 : 0;
      if (motionFrames >= FRAMES_IN_A_ROW) {
        events.dispatchEvent(new CustomEvent('presence', { detail: { score, at: Date.now() } }));
      }
    }
    previous = gray;
  }

  return {
    start,
    preview: previewCanvas,
    getStatus: () => status,
    addEventListener: events.addEventListener.bind(events),
    // For testing without a camera (or with a keyboard): pretend someone moved.
    simulatePresence() {
      events.dispatchEvent(new CustomEvent('presence', { detail: { score: 100, at: Date.now() } }));
    },
  };
}
