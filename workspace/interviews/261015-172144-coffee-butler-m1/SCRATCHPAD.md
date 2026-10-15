# Interview Scratchpad - coffee-butler-m1

## Context
- Date: 2026-10-15
- Reference: AGENTS.md

## Emerging Themes
- Butler as helpful as well as funny: maintenance reminders
- 'Smart' means reacting to context (time since last cup, cups today), not AI
- Learning project: Zain wants to type the code himself
- Family-only audience; future ambition to recognize individuals

## Requirements Captured
- Tablet: Samsung Galaxy Tab A7 Lite
- Hosting: GitHub Pages (needs walkthrough)
- Zain types the code, Claude guides
- Audience V1: family members only, all treated the same (no identity)
- NEW: wake-up animation. On Sleeping -> Present the screen powers up and the head does a spin/flip before the greeting line (not in AGENTS.md yet; belongs to the face, triggered by the brain's state change)
- Per-visit script (replaces 'a line every 30-45s'): greeting -> 0-1 smart/useful middle line -> goodbye
- NEW category: goodbye (e.g. "All right, well, come visit me soon")
- NEW category: reminders/useful tips (empty the grounds/drip tray, don't pour water in the wrong place when refilling)
- NEW: context-aware greetings that know the visit history (e.g. "Oh, that time already again for another cup?"). The brain needs to remember recent visit times, probably in localStorage.
- Usage: ~7 coffee visits/day across the family
- Lines: Zain writes some, Claude suggests some; start with ~15-20 total
- Success = someone walks up, head flips in, says something funny, people laugh

## Constraints
- Live Server not installed yet; install before local testing
- A7 Lite is a low-end device (budget GPU), so rendering must stay light

## Decisions Made
- Some repetition is acceptable early on ("they can repeat a little bit")
- Goodbye plays ~7s after motion stops (named constant, e.g. GOODBYE_AFTER_MS = 7000). Present -> (7s still) -> goodbye -> Away.
- GitHub Pages for HTTPS hosting
- "I type, you guide" coding mode

## Tensions / Trade-offs
- 7s is short. Someone standing still waiting for a shot to pull makes almost no motion, so the butler could say goodbye while they're still there. Check against real motion scores in M2 before trusting 7s.
- Goodbye vs detection: the butler only knows someone left after ~20s of no motion, so a goodbye then plays to an empty room. Options: guess the end (e.g. motion dropping), say it at that moment anyway, or put the goodbye into the middle of the visit.
- ~3 lines per visit x 7 visits = ~21 lines/day, still about the size of the whole starting set. Templates ("cup number {n} today") stretch it further.
- Math: 7 visits x (1 greeting + 2-4 mid-session lines at the 30-45s cadence) = roughly 20-35 lines a day, so the whole 15-20 set could be used up in one day. Either talk less per visit or plan to keep adding lines.
- 15-20 lines split across ~5 categories is only 3-4 per category, so repeats come fast. Maybe start with fewer categories (greeting + mid-session) and add the rest later.
- The flip animation is a burst of 3D motion on a low-end GPU (A7 Lite). The M1 sphere test should include a quick spin to check it.
- Laughter is the success metric, so joke quality is the riskiest part, more than the tech
- Future per-person recognition vs V1 'presence only' sensor. Keep the `presence` event shaped so it could later carry an optional `who` field without changing brain/face contracts.
- Recognition would mean collecting family images/footage: a privacy question for later

## Areas to Dig Deeper
- [x] Who uses it: family
- [x] What 'V1 done' looks like: wake + flip + funny line + laughter
- [x] Who writes the jokes: Zain + Claude suggestions, 15-20 to start
- [x] Visits per day: ~7
- [x] Chattiness: in between. Greeting, one smart middle line, goodbye
- [x] Goodbye timing: ~7s after motion stops
- [ ] Which reminders, and do any need real state (e.g. a 'refill water' clue)?
- [ ] Reaction speed: how fast after walking up should it wake?
- [ ] GitHub account state
- [ ] Timeline / pace
- [ ] Audio clip generation approach (deferred to M5?)
- [ ] Privacy expectations for camera

## Key Quotes
- "oh, that time already again for another cup of coffee"
- "all right, well, come visit me soon"
- "someone walking up and the screen powering up, maybe doing a little spin or flip, the head flipping, and then saying something funny, and everyone laughing"
- "It would be really cool in the future to recognize each family member exactly... But that's for a version down the line."

## Open Questions
- V2+: face recognition per family member (training set of images/footage); deferred
- Does branch name master vs main matter? (git says main is the main branch)
