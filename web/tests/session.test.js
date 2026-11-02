'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadContent, setup, NOW, DAY, TODAY } = require('./fixtures.js');

function correctInput(item) {
  if (item.type === 'choice') return { index: item.answer };
  if (item.type === 'gap') return { text: item.answers[0] };
  return { rating: 'known' };
}


function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}


























// ---- new question types ----





// Builds the correct input from the view by label lookup.

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
