'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { getDojo, setup, NOW, DAY, TODAY } = require('./fixtures.js');

function correctInput(item) {
  if (item.type === 'choice') return { index: item.answer };
  if (item.type === 'gap') return { text: item.answers[0] };
  return { rating: 'known' };
}

function wrongInput(item) {
  if (item.type === 'choice') return { index: (item.answer + 1) % item.options.length };
  if (item.type === 'gap') return { text: 'zzz-wrong' };
  return { rating: 'again' };
}

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

test('gap accepts alternatives and normalization options', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { types: ['gap'], units: ['geo'] });
  assert.strictEqual(s.current().item.id, 'geo-4');
  const r1 = s.answer({ text: '  roma ' });
  assert.strictEqual(r1.correct, true);
  assert.strictEqual(r1.expected, 'Rome');
  assert.deepStrictEqual(r1.accepted, ['Rome', 'Roma']);
  s.next();
  assert.strictEqual(s.current().item.id, 'geo-5');
  assert.strictEqual(s.answer({ text: 'africa' }).correct, false);
});

test('card: back hidden until reveal; rating again counts as wrong', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { types: ['card'], units: ['geo'] });
  assert.deepStrictEqual(s.current().view, {});
  s.reveal();
  assert.deepStrictEqual(s.current().view, { back: 'Madrid' });
  const r = s.answer({ rating: 'again' });
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.expected, 'Madrid');
  s.next();
  assert.deepStrictEqual(s.current().view, {});
  assert.strictEqual(s.answer({ rating: 'known' }).correct, true);
  assert.deepStrictEqual(s.answer({ rating: 'maybe' }), { error: 'already_answered' });
});

test('wrong answer is re-queued once at the end', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { units: ['math'], types: ['gap'] });
  s.answer(wrongInput(s.current().item));
  s.next();
  s.answer(correctInput(s.current().item));
  const c = s.next();
  assert.strictEqual(c.item.id, 'math-4');
  assert.strictEqual(s.answer(wrongInput(c.item)).correct, false);
  assert.strictEqual(s.next(), null);
  assert.strictEqual(s.done, true);
  const sum = s.finish();
  assert.strictEqual(sum.answered, 2);
  assert.strictEqual(sum.correct, 1);
  assert.strictEqual(sum.total, 2);
});

test('relearn copy answered correctly promotes a stage 0 item via applyRelearn', async () => {
  const t = await setup();
  const s = t.engine.start('daily');
  const first = s.current().item;
  assert.strictEqual(first.id, 'geo-1');
  s.answer(wrongInput(first));
  assert.strictEqual(t.doc.items['geo-1'].s, 0);
  while (s.index < s.total - 1) s.next();
  s.next();
  const copy = s.current();
  assert.strictEqual(copy.item.id, 'geo-1');
  const r = s.answer(correctInput(copy.item));
  assert.strictEqual(r.correct, true);
  assert.strictEqual(t.doc.items['geo-1'].s, 1);
  assert.strictEqual(t.doc.items['geo-1'].bad, 1);
  assert.strictEqual(t.doc.items['geo-1'].due, NOW + 4 * 3600000);
});

test('daily answers use applyAnswer and count newByDay only for unseen items', async () => {
  const t = await setup();
  t.doc.items['math-1'] = { s: 1, due: NOW - 1, ok: 1, bad: 0, last: NOW - DAY };
  const s = t.engine.start('daily');
  assert.strictEqual(s.current().item.id, 'math-1');
  s.answer({ index: 1 });
  assert.strictEqual(t.doc.items['math-1'].s, 2);
  assert.strictEqual(t.doc.stats.newByDay[TODAY], undefined);
  s.next();
  s.answer(correctInput(s.current().item));
  assert.strictEqual(t.doc.stats.newByDay[TODAY], 1);
  assert.strictEqual(t.doc.items['geo-1'].s, 1);
});

test('double answer and answering when finished return errors', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { tags: ['oceans'] });
  assert.strictEqual(s.answer({ index: 2 }).correct, true);
  assert.deepStrictEqual(s.answer({ index: 2 }), { error: 'already_answered' });
  assert.strictEqual(t.doc.items['geo-3'].ok, 1);
  assert.strictEqual(s.next(), null);
  assert.deepStrictEqual(s.answer({ index: 2 }), { error: 'finished' });
});

test('stats.days increments once per answer and noteAnswer is called', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { units: ['math'], types: ['gap'] });
  s.answer(correctInput(s.current().item));
  assert.strictEqual(t.doc.stats.days[TODAY], 1);
  s.next();
  s.answer(wrongInput(s.current().item));
  assert.strictEqual(t.doc.stats.days[TODAY], 2);
  assert.strictEqual(t.notes(), 2);
});

test('finish is idempotent and reports a review', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { tags: ['oceans'] });
  s.answer({ index: 1 });
  const sum = s.finish();
  assert.strictEqual(s.finish(), sum);
  assert.deepStrictEqual(sum.review, [{ id: 'geo-3', correct: false, given: 'Indian', expected: 'Pacific' }]);
  assert.strictEqual(sum.mode, 'practice');
});

test('wasm failure yields engine error and leaves doc unchanged', async () => {
  const real = await getDojo();
  let broken = false;
  const dojo = {
    call(name, args) {
      if (broken) throw new DojoWasm.DojoError('trap', 'boom');
      return real.call(name, args);
    }
  };
  const t = await setup({ dojo });
  const s = t.engine.start('practice', { units: ['geo'], types: ['gap'] });
  const snapshot = JSON.stringify(t.doc);
  broken = true;
  assert.deepStrictEqual(s.answer({ text: 'Rome' }), { error: 'engine' });
  assert.strictEqual(JSON.stringify(t.doc), snapshot);
  assert.strictEqual(t.notes(), 0);
  assert.deepStrictEqual(t.engine.start('daily'), { error: 'engine' });
});

test('unknown mode returns an error', async () => {
  const t = await setup();
  assert.deepStrictEqual(t.engine.start('nope'), { error: 'unknown_mode' });
});

test('SELF_RATED excludes only card from exam candidates; new types sampled', async () => {
  const t = await newSetup({ passMark: 0.5, sections: [{ title: 'All', count: 6 }] });
  const s = t.engine.start('exam');
  const list = ids(s);
  assert.deepStrictEqual(list.slice().sort(), ['n-cloze', 'n-match', 'n-multi', 'n-num', 'n-num2', 'n-order']);
});

test('views never leak authored indices or answers', async () => {
  for (const id of ['n-multi', 'n-match', 'n-order', 'n-cloze', 'n-num']) {
    const { c } = await sessionWith(id, 1);
    const json = JSON.stringify(c.view);
    assert.ok(!/"index"|"correct"|"answer"/.test(json), id);
  }
  const { c } = await sessionWith('n-cloze', 1);
  assert.deepStrictEqual(c.view.segments.filter((x) => 'blank' in x).map((x) => x.blank), [0, 1]);
  assert.ok(!JSON.stringify(c.view).includes('Rome') && !JSON.stringify(c.view).includes('Paris'));
  assert.strictEqual(c.view.blanks, 2);
  assert.deepStrictEqual((await sessionWith('n-num', 1)).c.view, { unitLabel: 'rad' });
  assert.deepStrictEqual((await sessionWith('n-num2', 1)).c.view, { unitLabel: null });
});

test('multi: correct, wrong detail, bad input, any display order', async () => {
  for (let n = 0; n < 200; n++) {
    const { s, c } = await sessionWith('n-multi', n);
    const r = s.answer(solve(c.item, c.view));
    assert.strictEqual(r.correct, true);
    assert.strictEqual(r.expected, '2, 5');
    assert.deepStrictEqual(r.detail, { missing: [], extra: [] });
  }
  const { t, s, c } = await sessionWith('n-multi', 3);
  const id = (label) => c.view.options.find((o) => o.label === label).id;
  for (const bad of [{ ids: [9] }, { ids: [-1] }, { ids: [id('2'), id('2')] }, { ids: 'x' }, {}, null, { ids: [0.5] }]) {
    assert.deepStrictEqual(s.answer(bad), { error: 'bad_input' });
  }
  assert.deepStrictEqual(t.doc.items, {});
  const r = s.answer({ ids: [id('2'), id('9')] });
  assert.strictEqual(r.correct, false);
  assert.deepStrictEqual(r.detail, { missing: ['5'], extra: ['9'] });
  assert.ok(t.doc.items['n-multi']);
});
