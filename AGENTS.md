# Coffee Butler Hologram

An old Android tablet mounted above the espresso machine shows a floating blue wireframe "hologram" head. When someone comes to make coffee, it wakes up and makes funny comments as the house butler. Full plan: the "Coffee Hologram: Project Plan" doc.

## Who you're working with

Zain is learning software engineering by building this. He writes and runs the code in VS Code; you act as a senior engineer pairing with him.

- Work in small, testable steps. One milestone at a time.
- Explain the *why* behind each decision in plain language. Define new terms in one sentence the first time they come up.
- When something breaks, explain what the error means and how you're diagnosing it before fixing it.
- After each chunk of work, give a short "What just happened": what changed, why, one alternative not chosen, and 1 to 3 concepts with plain definitions.
- Prefer letting Zain type the code himself when he asks to; otherwise keep changes small enough to read in one sitting.

## Architecture

Three independent parts. Keep them separate so the sensor can be swapped without touching anything else. All app code lives in `workspace/app/` (interview notes are in `workspace/interviews/`).

1. **Sensor** (`sensor.js`): detects someone nearby and emits one `presence` event (an object, so a later version can add a `who` field for recognizing family members). V1 uses camera motion detection (frame differencing on a ~64x48 frame every ~200ms). V2 swaps in an M5Stack sensor over Bluetooth or MQTT.
2. **Brain** (`brain.js`): a state machine plus phrase selection.
3. **Face** (`face.js`): renders the hologram head and plays audio clips. The head is an SVG drawing designed in Figma Make (export kept in `~/Downloads/Holographic Floating Head Design`), with faked 3D: longitude lines are recomputed each frame so it can turn, and flips squash the head through zero.

## State machine

- **Sleeping:** screen pure black, camera watching. Motion → Present: the face wakes with a quick spin/flip, then says a greeting.
- **Present:** each visit follows a short script: greeting → at most one smart or useful middle line → goodbye. ~7s of no motion → goodbye line → Away.
- **Away:** face idles quietly. Motion → Present (welcome-back line). No motion for 2 to 3 min → Sleeping.

All timings are starting guesses; keep them as named constants at the top of the file so they're easy to tune (e.g. `GOODBYE_AFTER_MS = 7000`). Watch out: someone standing still while a shot pulls may read as "gone"; check this against real motion scores in Milestone 2.

The brain remembers recent visit times (in `localStorage`) so greetings can react to context, e.g. "Oh, that time already again for another cup?"

## Character and phrases

One character: the house butler, a comedian who switches accents (British, Indian, Nigerian, others) the way a comic does voices. Jokes are about the coffee and the people, never about the accents. Lines are pre-generated audio clips, grouped by category. V1: greeting, middle (smart lines + maintenance reminders like emptying the grounds or refilling water in the right place), goodbye, welcome back. Later: time of day, snacks (pantry sensor). Store phrase metadata in `phrases.json`; avoid repeating a line until most others have played. Start with 15 to 20 lines (Zain writes some, Claude suggests some); some early repetition is fine. Audience is family; all treated the same in V1.

## Constraints

- Plain HTML/CSS/JavaScript with ES modules. No build step, no framework. The face is plain SVG (Three.js was used until 2026-10-16; see git history). Design tools like Figma Make output React/Vite projects: port the drawing into `face.js`, don't adopt their build setup.
- The tablet is old: keep rendering light, test on the real device early. Baseline (M1): a 24x16 wireframe sphere at pixel ratio 1 runs at ~30+ fps on the A7 Lite, including the flip. Not much headroom, so check fps whenever the face gets more detail. The SVG face's glow blur is the most expensive part; `?glow=0` turns it off to compare fps.
- Camera access requires a secure context: `localhost` (Live Server) for local testing, GitHub Pages (HTTPS) for the tablet.
- A web page can't turn the screen off. "Sleeping" is a black screen; use the Wake Lock API so the tablet doesn't dim and stop the camera.

## Milestones

1. Pipeline: hello-world page on GitHub Pages, opened on the tablet; spinning Three.js sphere to test WebGL speed, including a fast flip like the wake-up animation. Device: Galaxy Tab A7 Lite.
2. Motion detection with a live on-screen motion score.
3. State machine with timers, shown as plain text.
4. The hologram face: wireframe sphere, blinking, bobbing, talking mouth.
5. Voice and phrases: categories, audio clips in several accents, wired to the brain.
6. Mount: kiosk fullscreen, Wake Lock, plugged in.

## Status (2026-10-15)

Milestone 1 done and tested on the tablet. Milestones 2 to 6 are built and tested on a Mac (brain unit tests: `node --test workspace/app/brain.test.js`; page checked in headless Chrome with a fake camera), **not yet on the tablet**. Next: one round of tablet testing, then tune `MOTION_SCORE_THRESHOLD`, `GOODBYE_AFTER_MS`, and fps.

- Voice: every phrase has an `audio` clip in `workspace/app/audio/`, generated free with Microsoft Edge voices by `uv run --with edge-tts python workspace/tools/make_voices.py` (rerun after editing phrases; a phrase can override its voice with a `voice` field). Browser text-to-speech is only the fallback for phrases without a clip. Zain may later replace some clips with ElevenLabs or his own recordings.
- The debug readout (state, camera status, motion % with 5s peak, fps, last line, plus a live view of the sensor's 64x48 frame with changed pixels in red) shows by default; add `?debug=0` to the URL to hide it.
- Press M on a computer to fake motion.

