'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { setup, NOW, DAY } = require('./fixtures.js');



function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}


























// ---- new question types ----
const NEW_ITEMS = [
  { id: 'n-multi', unit: 'u', tags: [], type: 'multi', prompt: 'Primes?', options: ['2', '4', '5', '9'], correct: [0, 2], explanation: 'e' },
  { id: 'n-match', unit: 'u', tags: [], type: 'match', prompt: 'Match', pairs: [{ left: 'FR', right: 'Paris' }, { left: 'IT', right: 'Rome' }, { left: 'ES', right: 'Madrid' }], distractors: ['Oslo', 'Bern'] },
  { id: 'n-order', unit: 'u', tags: [], type: 'order', prompt: 'Order', steps: ['one', 'two', 'three', 'four'] },
  { id: 'n-cloze', unit: 'u', tags: [], type: 'cloze', prompt: 'Fill', parts: ['Capital of IT is ', ['Rome', 'Roma'], ' and FR ', ['Paris'], '.'] },
  { id: 'n-num', unit: 'u', tags: [], type: 'numeric', prompt: 'Pi?', answer: 3.14, tolerance: 0.01, unitLabel: 'rad' },
  { id: 'n-num2', unit: 'u', tags: [], type: 'numeric', prompt: 'Two?', answer: 2 },
  { id: 'n-card', unit: 'u', tags: [], type: 'card', prompt: 'c', back: 'b' },
  { id: 'n-old', unit: 'u', tags: [], type: 'multi', prompt: 'old', options: ['a', 'b', 'c'], correct: [1], status: 'retired' }
];

function newContent(exam) {
  const items = JSON.parse(JSON.stringify(NEW_ITEMS));
  const course = { units: [{ id: 'u', title: 'U' }] };
  if (exam) course.exam = exam;
  return { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
}

async function newSetup(exam, extra) {
  return setup(Object.assign({ content: newContent(exam) }, extra || {}));
}

function goTo(session, id) {
  for (let c = session.current(); c; c = session.next()) if (c.item.id === id) return c;
  throw new Error('item not in queue: ' + id);
}

async function sessionWith(id, n) {
  let seq = n;
  const t = await newSetup(null, { random: () => ((seq++ * 0.6180339) % 1) });
  const s = t.engine.start('practice', { limit: 50 });
  return { t, s, c: goTo(s, id) };
}

// Builds the correct input from the view by label lookup.
function solve(item, view) {
  const idOf = (list, label) => list.find((x) => x.label === label).id;
  if (item.type === 'multi') return { ids: item.correct.map((i) => idOf(view.options, item.options[i])) };
  if (item.type === 'match') return { mapping: view.lefts.map((l) => idOf(view.rights, item.pairs.find((p) => p.left === l.label).right)) };
  if (item.type === 'order') return { sequence: item.steps.map((st) => idOf(view.steps, st)) };
}

test('match: correct in any order, wrong detail, bad input, distractors shown', async () => {
  for (let n = 0; n < 200; n++) {
    const { s, c } = await sessionWith('n-match', n);
    assert.strictEqual(c.view.lefts.length, 3);
    assert.deepStrictEqual(c.view.rights.map((x) => x.label).sort(), ['Bern', 'Madrid', 'Oslo', 'Paris', 'Rome']);
    const r = s.answer(solve(c.item, c.view));
    assert.strictEqual(r.correct, true);
    assert.strictEqual(r.expected, 'FR = Paris; IT = Rome; ES = Madrid');
    assert.deepStrictEqual(r.detail, { wrong: [] });
  }
  const { t, s, c } = await sessionWith('n-match', 5);
  const good = solve(c.item, c.view).mapping;
  for (const bad of [{ mapping: good.slice(1) }, { mapping: [0, 1, null] }, { mapping: [0, 1, 7] }, { mapping: [0, 1, undefined] }, { mapping: 'x' }, {}]) {
    assert.deepStrictEqual(s.answer(bad), { error: 'bad_input' });
  }
  assert.deepStrictEqual(t.doc.items, {});
  const oslo = c.view.rights.find((x) => x.label === 'Oslo').id;
  const swapped = good.slice();
  swapped[0] = oslo;
  const r = s.answer({ mapping: swapped });
  assert.strictEqual(r.correct, false);
  assert.deepStrictEqual(r.detail, { wrong: [c.view.lefts[0].label] });
});

test('order: correct in any order, never shown pre-solved, detail, bad input', async () => {
  for (let n = 0; n < 200; n++) {
    const { s, c } = await sessionWith('n-order', n);
    assert.notDeepStrictEqual(c.view.steps.map((x) => x.label), ['one', 'two', 'three', 'four']);
    const r = s.answer(solve(c.item, c.view));
    assert.strictEqual(r.correct, true);
    assert.strictEqual(r.expected, '1. one; 2. two; 3. three; 4. four');
    assert.deepStrictEqual(r.detail, { firstWrong: null });
  }
  const { t, s, c } = await sessionWith('n-order', 2);
  const good = solve(c.item, c.view).sequence;
  for (const bad of [{ sequence: good.slice(1) }, { sequence: [good[0], good[0], good[1], good[2]] }, { sequence: [0, 1, 2, 4] }, { sequence: 'x' }, {}]) {
    assert.deepStrictEqual(s.answer(bad), { error: 'bad_input' });
  }
  assert.deepStrictEqual(t.doc.items, {});
  const swapped = good.slice();
  [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  const r = s.answer({ sequence: swapped });
  assert.strictEqual(r.correct, false);
  assert.deepStrictEqual(r.detail, { firstWrong: 2 });
});

test('order rotates an identity shuffle for two steps', async () => {
  const content = newContent();
  content.items.push({ id: 'n-two', unit: 'u', tags: [], type: 'order', prompt: 'o', steps: ['a', 'b'] });
  for (let n = 0; n < 200; n++) {
    let seq = n;
    const t = await setup({ content, random: () => ((seq++ * 0.6180339) % 1) });
    const c = goTo(t.engine.start('practice', { limit: 50 }), 'n-two');
    assert.deepStrictEqual(c.view.steps.map((x) => x.label), ['b', 'a']);
  }
});

test('shuffles are deterministic per session id and item', async () => {
  const a = await sessionWith('n-match', 7);
  const a2 = await sessionWith('n-match', 7);
  assert.deepStrictEqual(a.c.view, a2.c.view);
  assert.deepStrictEqual(a.s.current().view, a.s.current().view);
  const views = new Set();
  for (let n = 0; n < 30; n++) views.add(JSON.stringify((await sessionWith('n-multi', n)).c.view));
  assert.ok(views.size > 1);
});

test('cloze: correct, per-blank results, bad input, no answers in view', async () => {
  const { s, c } = await sessionWith('n-cloze', 1);
  assert.deepStrictEqual(s.answer({ inputs: ['x'] }), { error: 'bad_input' });
  assert.deepStrictEqual(s.answer({ inputs: ['a', 3] }), { error: 'bad_input' });
  assert.deepStrictEqual(s.answer({}), { error: 'bad_input' });
  const r = s.answer({ inputs: [' roma ', 'Lyon'] });
  assert.strictEqual(r.correct, false);
  assert.deepStrictEqual(r.detail, { results: [true, false] });
  assert.strictEqual(r.expected, 'Capital of IT is Rome and FR Paris.');
  const g = await sessionWith('n-cloze', 2);
  assert.strictEqual(g.s.answer({ inputs: ['Roma', 'paris'] }).correct, true);
  assert.ok(c);
});

test('numeric: tolerance, comma decimal, unparsable, expected string', async () => {
  const { s } = await sessionWith('n-num', 1);
  assert.deepStrictEqual(s.answer({ text: 5 }), { error: 'bad_input' });
  const r = s.answer({ text: '3,15' });
  assert.strictEqual(r.correct, true);
  assert.deepStrictEqual(r.detail, { parsed: 3.15 });
  assert.strictEqual(r.expected, '3.14 rad (±0.01)');
  const w = await sessionWith('n-num', 2);
  const bad = w.s.answer({ text: 'abc' });
  assert.strictEqual(bad.correct, false);
  assert.deepStrictEqual(bad.detail, { parsed: null });
  const z = await sessionWith('n-num2', 2);
  const zr = z.s.answer({ text: '2' });
  assert.strictEqual(zr.correct, true);
  assert.strictEqual(zr.expected, '2');
});

test('new types drive progress like choice and gap', async () => {
  const ok = await sessionWith('n-multi', 1);
  ok.s.answer(solve(ok.c.item, ok.c.view));
  assert.strictEqual(ok.t.doc.items['n-multi'].ok, 1);
  const bad = await sessionWith('n-num2', 1);
  bad.s.answer({ text: '9' });
  assert.strictEqual(bad.t.doc.items['n-num2'].bad, 1);
  assert.deepStrictEqual(bad.s.answer({ text: '2' }), { error: 'already_answered' });
});

test('exam mode records new types without feedback and scores them; card excluded', async () => {
  const t = await newSetup({ passMark: 0.5, sections: [{ title: 'All', count: 6 }] });
  const s = t.engine.start('exam');
  assert.strictEqual(s.total, 6);
  let first = true;
  for (let c = s.current(); c; c = s.next()) {
    assert.notStrictEqual(c.item.type, 'card');
    const input = c.item.type === 'cloze' ? { inputs: ['Rome', 'Paris'] }
      : c.item.type === 'numeric' ? { text: String(c.item.answer) }
      : solve(c.item, c.view);
    assert.deepStrictEqual(s.answer(first ? input : input), { recorded: true });
    first = false;
  }
  const sum = s.finish();
  assert.strictEqual(sum.raw, 6);
  assert.strictEqual(sum.pass, true);
});

test('practice, weak and daily queues include new types; retired skipped', async () => {
  const t = await newSetup();
  const practice = ids(t.engine.start('practice', { limit: 50 }));
  assert.ok(['n-multi', 'n-match', 'n-order', 'n-cloze', 'n-num'].every((i) => practice.includes(i)));
  assert.ok(!practice.includes('n-old'));
  t.doc.settings.newPerDay = 50;
  const daily = ids(t.engine.start('daily'));
  assert.ok(daily.includes('n-order') && !daily.includes('n-old'));
  t.doc.items['n-match'] = { s: 0, due: NOW + DAY, ok: 0, bad: 2, last: NOW - 1 };
  t.doc.items['n-old'] = { s: 0, due: NOW + DAY, ok: 0, bad: 5, last: NOW - 1 };
  assert.deepStrictEqual(ids(t.engine.start('weak')), ['n-match']);
});
