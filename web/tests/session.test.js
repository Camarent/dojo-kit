'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadContent, getDojo, setup, NOW, DAY, TODAY, ROOT } = require('./fixtures.js');

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

test('counts on demo content', async () => {
  const { engine } = await setup();
  const c = engine.counts();
  assert.strictEqual(c.total, 17);
  assert.strictEqual(c.active, 16);
  assert.strictEqual(c.due, 0);
  assert.strictEqual(c.newToday, 10);
  assert.deepStrictEqual(c.byUnit.geo, { total: 7, due: 0, fresh: 7, learning: 0, learned: 0 });
  assert.deepStrictEqual(c.byUnit.math, { total: 7, due: 0, fresh: 7, learning: 0, learned: 0 });
  assert.deepStrictEqual(c.totals, { total: 16, fresh: 16, learning: 0, learned: 0 });
});

test('daily queue respects newPerDay and newByDay[today]', async () => {
  const t = await setup();
  const s = t.engine.start('daily');
  assert.strictEqual(s.total, 10);
  t.doc.stats.newByDay[TODAY] = 7;
  assert.strictEqual(t.engine.start('daily').total, 3);
  t.doc.settings.newPerDay = 2;
  assert.deepStrictEqual(t.engine.start('daily'), { error: 'empty' });
});

test('daily puts due items first ordered by due and never queues retired', async () => {
  const t = await setup();
  t.doc.items['math-2'] = { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY };
  t.doc.items['geo-3'] = { s: 1, due: NOW - 5000, ok: 1, bad: 0, last: NOW - DAY };
  t.doc.items['geo-8'] = { s: 1, due: NOW - 9000, ok: 1, bad: 0, last: NOW - DAY };
  t.doc.settings.newPerDay = 100;
  const list = ids(t.engine.start('daily'));
  assert.deepStrictEqual(list.slice(0, 2), ['geo-3', 'math-2']);
  assert.ok(!list.includes('geo-8'));
  assert.strictEqual(list.length, 2 + 12);
});

test('practice filters by unit, tag and type and honours limit', async () => {
  const t = await setup();
  assert.deepStrictEqual(ids(t.engine.start('practice', { units: ['math'], types: ['gap'] })), ['math-4', 'math-5']);
  assert.deepStrictEqual(ids(t.engine.start('practice', { tags: ['oceans'] })), ['geo-3']);
  assert.strictEqual(t.engine.start('practice', { limit: 3 }).total, 3);
  assert.strictEqual(t.engine.start('practice').total, 14);
  assert.ok(!ids(t.engine.start('practice', { units: ['geo'] })).includes('geo-8'));
  assert.deepStrictEqual(t.engine.start('practice', { tags: ['nothing'] }), { error: 'empty' });
});

test('practice lists due first then least recently seen', async () => {
  const t = await setup();
  t.doc.items['geo-1'] = { s: 2, due: NOW + DAY, ok: 1, bad: 0, last: NOW - 10 };
  t.doc.items['geo-2'] = { s: 2, due: NOW + DAY, ok: 1, bad: 0, last: NOW - 20 };
  t.doc.items['geo-3'] = { s: 1, due: NOW - 1, ok: 1, bad: 0, last: NOW - 5 };
  const list = ids(t.engine.start('practice', { units: ['geo'], types: ['choice'] }));
  assert.deepStrictEqual(list, ['geo-3', 'geo-2', 'geo-1']);
});

test('practice uses applyPractice: not-due correct keeps stage and due, ok+1', async () => {
  const t = await setup();
  t.doc.items['geo-1'] = { s: 2, due: NOW + DAY, ok: 3, bad: 0, last: NOW - DAY };
  const s = t.engine.start('practice', { tags: ['capitals'], types: ['choice'] });
  assert.strictEqual(s.current().item.id, 'geo-2');
  s.answer(correctInput(s.current().item));
  s.next();
  assert.strictEqual(s.current().item.id, 'geo-1');
  assert.strictEqual(s.answer({ index: 0 }).correct, true);
  assert.deepStrictEqual(t.doc.items['geo-1'], { s: 2, due: NOW + DAY, ok: 4, bad: 0, last: NOW });
  assert.strictEqual(t.doc.items['geo-2'].s, 1);
});

test('weak lists only items with bad > 0', async () => {
  const t = await setup();
  assert.deepStrictEqual(t.engine.start('weak'), { error: 'empty' });
  t.doc.items['geo-1'] = { s: 1, due: NOW + DAY, ok: 1, bad: 2, last: NOW };
  t.doc.items['geo-2'] = { s: 1, due: NOW + DAY, ok: 5, bad: 0, last: NOW };
  t.doc.items['geo-8'] = { s: 1, due: NOW + DAY, ok: 0, bad: 9, last: NOW };
  assert.deepStrictEqual(ids(t.engine.start('weak')), ['geo-1']);
});

test('exam samples per section, deterministic for fixed now, with deadline', async () => {
  const t = await setup();
  const a = t.engine.start('exam');
  const b = (await setup()).engine.start('exam');
  assert.strictEqual(a.total, 8);
  assert.strictEqual(a.deadline, NOW + 10 * 60000);
  assert.strictEqual(a.warnings, undefined);
  const listA = ids(a);
  assert.deepStrictEqual(listA, ids(b));
  const types = new Set(listA.map((id) => t.content.items.find((i) => i.id === id).type));
  assert.ok(!types.has('card'));
  assert.strictEqual(listA.filter((id) => id.startsWith('geo')).length, 4);
});

test('exam short section yields warnings; absent minutes means untimed', async () => {
  const content = loadContent();
  content.course.exam = { passMark: 0.5, sections: [{ title: 'Math', count: 9, units: ['math'], types: ['gap'] }] };
  const t = await setup({ content });
  const s = t.engine.start('exam');
  assert.deepStrictEqual(s.warnings, [{ title: 'Math', shortBy: 7 }]);
  assert.strictEqual(s.deadline, undefined);
  assert.strictEqual(s.total, 2);
});

test('exam samples a 4-question stimulus group whole and in order', async () => {
  const content = loadContent();
  const mk = (id, extra) => Object.assign({ id, unit: 'math', type: 'gap', prompt: 'p', answer: ['1'] }, extra);
  const grp = ['g1', 'g2', 'g3', 'g4'];
  content.items = [mk('a1'), mk('a2'), mk('a3')].concat(grp.map((id) => mk(id, { stimulus: 's1' })));
  content.stimuli = [{ id: 's1', title: 'T', text: 'Passage' }];
  content.course.exam = { passMark: 0.5, sections: [{ title: 'All', count: 4, units: ['math'] }] };
  let whole = 0;
  for (let n = 0; n < 12; n++) {
    const t = await setup({ content, now: NOW + n * 7919 });
    const got = ids(t.engine.start('exam'));
    if (got.some((x) => grp.indexOf(x) >= 0)) {
      assert.deepStrictEqual(got, grp);
      whole++;
    }
  }
  assert.ok(whole > 0);
});

test('exam without config returns no_exam', async () => {
  const content = loadContent();
  delete content.course.exam;
  const t = await setup({ content });
  assert.deepStrictEqual(t.engine.start('exam'), { error: 'no_exam' });
});

test('exam answer reveals nothing; finish scores unanswered as wrong and writes doc.exams', async () => {
  const t = await setup();
  const s = t.engine.start('exam');
  for (let i = 0; i < 4; i++) {
    const r = s.answer(correctInput(s.current().item));
    assert.deepStrictEqual(r, { recorded: true });
    s.next();
  }
  t.clock.t = NOW + 5000;
  const sum = s.finish();
  assert.strictEqual(sum.raw, 4);
  assert.strictEqual(sum.total, 8);
  assert.strictEqual(sum.fraction, 0.5);
  assert.strictEqual(sum.pass, false);
  assert.deepStrictEqual(sum.short, []);
  assert.deepStrictEqual(t.doc.exams['exam-' + (NOW + 5000)], {
    date: TODAY, raw: 4, total: 8, fraction: 0.5, pass: false, mode: 'exam'
  });
  assert.strictEqual(s.finish(), sum);
  assert.strictEqual(Object.keys(t.doc.exams).length, 1);
});

test('choice shuffle is deterministic per session id and maps index to the original option', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { units: ['geo'], types: ['choice'] });
  const cur = s.current();
  const again = s.current();
  assert.deepStrictEqual(cur.view, again.view);
  const labels = cur.view.options.map((o) => o.label).sort();
  assert.deepStrictEqual(labels, cur.item.options.slice().sort());
  cur.view.options.forEach((o) => assert.strictEqual(cur.item.options[o.index], o.label));
  const shown = cur.view.options.findIndex((o) => o.index === cur.item.answer);
  const r = s.answer({ index: cur.view.options[shown].index });
  assert.strictEqual(r.correct, true);
  assert.strictEqual(r.expected, cur.item.options[cur.item.answer]);
});

test('choice: correct answer is not always displayed first across 200 sessions', async () => {
  let n = 0;
  const t = await setup({ random: () => (n++ * 0.00499) % 1 });
  const positions = new Set();
  const ids200 = new Set();
  for (let i = 0; i < 200; i++) {
    const s = t.engine.start('practice', { tags: ['oceans'] });
    ids200.add(s.id);
    const c = s.current();
    positions.add(c.view.options.findIndex((o) => o.index === c.item.answer));
  }
  assert.strictEqual(ids200.size, 200);
  assert.ok(positions.size > 1);
});

test('choice rejects out-of-range index with bad_input', async () => {
  const t = await setup();
  const s = t.engine.start('practice', { tags: ['oceans'] });
  assert.deepStrictEqual(s.answer({ index: 9 }), { error: 'bad_input' });
  assert.deepStrictEqual(s.answer(null), { error: 'bad_input' });
  assert.deepStrictEqual(t.doc.items, {});
});

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
