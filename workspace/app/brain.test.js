// Run with:  node --test workspace/app/brain.test.js
// Tests the brain with fake time, so no camera or waiting needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrain, pickPhrase, GOODBYE_AFTER_MS, SLEEP_AFTER_MS, MIDDLE_LINE_AFTER_MS, SOON_AGAIN_MS,
} from './brain.js';

const phrases = [
  { id: 'g1', category: 'greeting', text: 'hello' },
  { id: 'g-first', category: 'greeting', when: 'firstToday', text: 'first' },
  { id: 'g-again', category: 'greeting', when: 'again', text: 'again' },
  { id: 'm1', category: 'middle', text: 'tip' },
  { id: 'b1', category: 'goodbye', text: 'bye' },
  { id: 'w1', category: 'welcomeBack', text: 'back' },
];

function fakeStorage() {
  const data = {};
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

function setup(storage = fakeStorage()) {
  const said = [];
  const brain = createBrain({ phrases, storage, onSay: p => said.push(p.category), random: () => 0 });
  return { brain, said, storage };
}

const NOON = new Date('2026-10-15T12:00:00').getTime();

test('a full visit: greet, middle line, goodbye, sleep', () => {
  const { brain, said } = setup();
  brain.presence(NOON);
  assert.equal(brain.getState(), 'present');

  // Keep moving long enough for the middle line.
  for (let t = NOON; t <= NOON + MIDDLE_LINE_AFTER_MS; t += 1000) { brain.presence(t); brain.tick(t); }
  const lastMove = NOON + MIDDLE_LINE_AFTER_MS;

  brain.tick(lastMove + GOODBYE_AFTER_MS);
  assert.equal(brain.getState(), 'away');

  brain.tick(lastMove + SLEEP_AFTER_MS);
  assert.equal(brain.getState(), 'sleeping');
  assert.deepEqual(said, ['greeting', 'middle', 'goodbye']);
});

test('a short visit gets no middle line', () => {
  const { brain, said } = setup();
  brain.presence(NOON);
  brain.tick(NOON + GOODBYE_AFTER_MS);
  assert.deepEqual(said, ['greeting', 'goodbye']);
});

test('coming back while away gets a welcome-back line', () => {
  const { brain, said } = setup();
  brain.presence(NOON);
  brain.tick(NOON + GOODBYE_AFTER_MS);
  brain.presence(NOON + GOODBYE_AFTER_MS + 5000);
  assert.equal(brain.getState(), 'present');
  assert.deepEqual(said, ['greeting', 'goodbye', 'welcomeBack']);
});

test('greeting knows first-of-day vs. back again', () => {
  const storage = fakeStorage();
  const lines = [];
  const make = () => createBrain({
    phrases: phrases.filter(p => p.category !== 'greeting' || p.when), // only context lines
    storage, onSay: p => lines.push(p.id),
  });
  make().presence(NOON);
  make().presence(NOON + SOON_AGAIN_MS - 1);
  assert.deepEqual(lines, ['g-first', 'g-again']);
});

test('pickPhrase avoids recently played lines', () => {
  const pool = [1, 2, 3, 4].map(n => ({ id: `p${n}`, category: 'x' }));
  const played = { p1: 400, p2: 300, p3: 200 }; // p4 never played, p3 oldest
  const picks = new Set();
  for (const r of [0, 0.99]) picks.add(pickPhrase(pool, 'x', null, played, () => r).id);
  assert.deepEqual([...picks].sort(), ['p3', 'p4']);
});
