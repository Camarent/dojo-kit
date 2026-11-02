'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const mk = (id, extra) => Object.assign({ id, unit: 'u1', type: 'gap', prompt: 'Write', answers: ['x'] }, extra);
const STIM = [{ id: 's1', text: 'alpha' }, { id: 's2', text: 'beta' }, { id: 's3', text: 'gamma' }];
const course = { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U' }] };

async function results(items, stimuli) {
  const m = await H.mount({ items, course, stimuli });
  const byId = {}; items.forEach((i) => { byId[i.id] = i; });
  const review = items.slice(0, 2).map((i) => ({ id: i.id, correct: false, given: 'z', expected: 'x' }));
  const summary = { mode: 'practice', raw: 0, total: 3, pct: 0, durationMs: 0, review, skipped: [items[2].id], fraction: 0, correct: 0, answered: 3 };
  return H.text(m.sb.DojoApp._Results({ t: m.t, byId, stimuli, go() {}, onAgain() {}, summary }));
}

test('results rows with duplicate prompts show stimulus texts', async () => {
  const items = [mk('a', { stimulus: 's1' }), mk('b', { stimulus: 's2' }), mk('c', { stimulus: 's3' })];
  const txt = await results(items, STIM);
  for (const w of ['alpha', 'beta', 'gamma']) assert.ok(txt.includes(w), w);
});

test('results unique prompts unchanged', async () => {
  const items = [mk('a', { prompt: 'P1', stimulus: 's1' }), mk('b', { prompt: 'P2' }), mk('c', { prompt: 'P3' })];
  const txt = await results(items, STIM);
  assert.ok(txt.includes('P1') && !txt.includes('alpha'));
});

test('itemLabel falls back to numeric answer then prompt', async () => {
  const m = await H.mount({ items: [mk('a')], course });
  const sh = m.sb.DojoStimulus.create();
  const d = sh.dupeSet(['Write', 'Write']);
  assert.strictEqual(sh.itemLabel({ prompt: 'Write', answer: 42 }, null, d), '42');
  assert.strictEqual(sh.itemLabel({ prompt: 'Write' }, null, d), 'Write');
  assert.strictEqual(sh.itemLabel({ prompt: 'Write', answer: 42 }, null, {}), 'Write');
});

test('home weak chips show stimulus texts and weakList keeps id+prompt', async () => {
  const items = [mk('a', { stimulus: 's1' }), mk('b', { stimulus: 's2' }), mk('c', { stimulus: 's3' })];
  const m = await H.mount({ items, course, stimuli: STIM });
  items.forEach((i) => { m.doc.items[i.id] = { s: 0, bad: 1, due: H.NOW - 86400000 }; });
  m.app.refresh();
  const chips = H.text(H.find(m.tree(), 'weak-chips'));
  for (const w of ['alpha', 'beta', 'gamma']) assert.ok(chips.includes(w), w + ' in ' + chips);
});

test('prompts named like Object.prototype keys are not duplicates', async () => {
  const m = await H.mount({ items: [mk('a')], course });
  const sh = m.sb.DojoStimulus.create();
  const d = sh.dupeSet(['constructor', 'toString']);
  assert.strictEqual(sh.itemLabel({ prompt: 'constructor', answer: 7 }, 'zzz', d), 'constructor');
  assert.strictEqual(sh.itemLabel({ prompt: 'constructor', answer: 7 }, 'zzz', {}), 'constructor');
});

test('results rows show numeric answer when prompts repeat and no stimulus', async () => {
  const items = [mk('a', { answer: 11 }), mk('b', { answer: 22 }), mk('c', { answer: 33 })];
  const txt = await results(items, []);
  for (const w of ['11', '22', '33']) assert.ok(txt.includes(w), w);
});
