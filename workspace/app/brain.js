// Brain: decides what state the butler is in and what to say.
// It never touches the camera or the screen. It is told about motion and
// the passing of time, and it calls onState / onSay to report decisions.
// Time is passed in (`now`) so tests can fake it.

// --- Timings (starting guesses; tune after living with it) ---
export const GOODBYE_AFTER_MS = 7_000;       // still for this long while Present -> goodbye, go Away
export const SLEEP_AFTER_MS = 150_000;       // still for this long while Away -> Sleeping
export const MIDDLE_LINE_AFTER_MS = 20_000;  // a visit this long gets one smart/useful line
export const SOON_AGAIN_MS = 2 * 60 * 60_000; // another visit within 2h counts as "again"
export const QUIET_BETWEEN_LINES_MS = 15_000; // a line this soon after the last one is skipped

const VISITS_KEY = 'butler.visits';
const PLAYED_KEY = 'butler.played';

export const SLEEPING = 'sleeping';
export const PRESENT = 'present';
export const AWAY = 'away';

export function createBrain({ phrases, storage, onState = () => {}, onSay = () => {}, random = Math.random }) {
  let state = SLEEPING;
  let lastMotionAt = 0;
  let visitStartedAt = 0;
  let saidMiddleLine = false;
  let lastLineAt = -Infinity;

  function setState(next) {
    const prev = state;
    state = next;
    onState(next, prev);
  }

  function say(category, now, context = null) {
    // Spacing: stay quiet if we just spoke (e.g. a walk-by, or stepping away and straight back).
    if (now - lastLineAt < QUIET_BETWEEN_LINES_MS) return;
    const phrase = pickPhrase(phrases, category, context, loadJSON(storage, PLAYED_KEY, {}), random);
    if (!phrase) return;
    const played = loadJSON(storage, PLAYED_KEY, {});
    played[phrase.id] = now;
    storage.setItem(PLAYED_KEY, JSON.stringify(played));
    lastLineAt = now;
    onSay(phrase);
  }

  // Called by the sensor whenever someone moves.
  function presence(now) {
    lastMotionAt = now;
    if (state === SLEEPING) {
      const context = greetingContext(now);
      recordVisit(now);
      visitStartedAt = now;
      saidMiddleLine = false;
      setState(PRESENT);
      say('greeting', now, context);
    } else if (state === AWAY) {
      setState(PRESENT);
      say('welcomeBack', now);
    }
  }

  // Called regularly (e.g. twice a second) so timers can fire.
  function tick(now) {
    const stillFor = now - lastMotionAt;
    if (state === PRESENT) {
      if (stillFor >= GOODBYE_AFTER_MS) {
        say('goodbye', now);
        setState(AWAY);
      } else if (!saidMiddleLine && now - visitStartedAt >= MIDDLE_LINE_AFTER_MS) {
        saidMiddleLine = true;
        say('middle', now);
      }
    } else if (state === AWAY && stillFor >= SLEEP_AFTER_MS) {
      setState(SLEEPING);
    }
  }

  // "firstToday" if no visit yet today, "again" if the last visit was recent.
  function greetingContext(now) {
    const visits = loadJSON(storage, VISITS_KEY, []);
    const last = visits[visits.length - 1];
    if (!last || new Date(last).toDateString() !== new Date(now).toDateString()) return 'firstToday';
    if (now - last <= SOON_AGAIN_MS) return 'again';
    return null;
  }

  function recordVisit(now) {
    const visits = loadJSON(storage, VISITS_KEY, []);
    visits.push(now);
    storage.setItem(VISITS_KEY, JSON.stringify(visits.slice(-50))); // keep it small
  }

  return { presence, tick, getState: () => state };
}

// Pick a line from a category without repeating recent ones.
// Lines tagged with a matching `when` (e.g. "again") join the general pool.
// Among those, choose randomly from the least-recently-played half,
// so a line can't come back until most of the others have had a turn.
export function pickPhrase(phrases, category, context, played, random = Math.random) {
  const pool = phrases.filter(p => p.category === category && (!p.when || p.when === context));
  if (pool.length === 0) return null;
  pool.sort((a, b) => (played[a.id] ?? 0) - (played[b.id] ?? 0));
  const oldestHalf = pool.slice(0, Math.ceil(pool.length / 2));
  return oldestHalf[Math.floor(random() * oldestHalf.length)];
}

function loadJSON(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
