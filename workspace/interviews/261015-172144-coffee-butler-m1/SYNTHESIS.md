# Coffee Butler: Requirements Synthesis

## What This Is

A pre-Milestone-1 interview with Zain to settle who the butler is for, what "working" means, and how it should talk. It refines the plan in AGENTS.md. Most changes are to the Brain (the state machine and phrase selection).

## Key Requirements

1. **Audience:** family members only, all treated the same. No identity detection in V1.
2. **Success moment:** someone walks up, the screen wakes, the head does a spin/flip, it says something funny, and people laugh.
3. **Wake animation:** on Sleeping -> Present, the face plays a short spin/flip before the greeting line.
4. **Per-visit script:** greeting, then at most one smart or useful middle line, then a goodbye. This replaces "a new line every 30-45s".
5. **Goodbye:** plays ~7s after motion stops, then the brain goes to Away.
6. **Context-aware greetings:** the brain remembers recent visit times (e.g. in `localStorage`) so lines can react, e.g. "Oh, that time already again for another cup?"
7. **Reminder lines:** practical tips such as emptying the grounds/drip tray and putting the water in the right place when refilling.
8. **Starting phrase set:** 15-20 lines. Zain writes some and Claude suggests some.

## Constraints

- Device: Samsung Galaxy Tab A7 Lite. Modern Chrome, but a budget GPU, so rendering must stay light.
- HTTPS is required for the camera: GitHub Pages for the tablet, Live Server (`localhost`) for local testing.
- Usage: ~7 visits/day, so ~21 lines/day against a 15-20 line set.

## Decisions

- Hosting: GitHub Pages (Zain needs a setup walkthrough).
- Working style: Zain types the code; Claude guides and explains.
- `GOODBYE_AFTER_MS = 7000` as a named, tunable constant.
- Some repetition of lines in the first days is acceptable.

## Architecture / Approach

- Sensor -> Brain -> Face separation is unchanged.
- The `presence` event is an object (e.g. `{ type: 'presence' }`) so a later version can add `who` without changing the brain or face.
- Brain states stay Sleeping / Present / Away. Present now runs a short script (greeting -> optional middle line -> goodbye on 7s of stillness) instead of a timed stream of lines.
- Phrase categories for V1: greeting, middle (smart + reminders), goodbye, welcome back. Time-of-day and snacks come later.

## What's Deferred

- Recognizing individual family members (training images/footage), plus the privacy questions that come with it.
- Time-of-day and snack (pantry sensor) categories.
- How the audio clips will be generated (Milestone 5).

## Risks to Watch

- **Standing still reads as gone:** someone waiting for a shot to pull barely moves, so a 7s goodbye could fire while they're still there. Check against real motion scores in Milestone 2.
- **Flip on a weak GPU:** the Milestone 1 sphere test should include a fast spin to check for stutter.
- **Jokes are the hard part:** laughter is the success metric, so line quality matters more than the code.

## Key Quotes

> "someone walking up and the screen powering up, maybe doing a little spin or flip, the head flipping, and then saying something funny, and everyone laughing"

> "oh, that time already again for another cup of coffee"

> "all right, well, come visit me soon"

## Next Steps

1. Install the Live Server VS Code extension.
2. Milestone 1: hello-world page plus a spinning Three.js sphere (including a fast flip) on GitHub Pages, opened on the A7 Lite.
3. Milestone 2: when the motion score is on screen, test whether standing still reads as "gone".
