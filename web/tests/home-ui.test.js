'use strict';
// Mutation coverage: summary from item counts (c.due) -> 'summary equals the cards' fails;
// ProgressMeter without `started` / left = total - learned only -> 'caption segments sum to total' fails.
const test = require('node:test');
const assert = require('node:assert');
const { read, find, findAll, text, walk, mount, NOW } = require('./app-harness.js');

const DAY = 86400000;
function gap(id, unit, entity) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (entity) it.entity = entity;
  return it;
}
const ITEMS = [
  gap('k1', 'kanji', 'E1'), gap('v1', 'vocab', 'E1'), gap('k2', 'kanji', 'E2'), gap('v2', 'vocab', 'E2'),
  gap('k3', 'kanji', 'E3'), gap('k4', 'kanji', 'E4'),
  gap('g1', 'grammar'), gap('g2', 'grammar'), gap('g3', 'grammar'),
  gap('o1', 'other'), gap('o2', 'other'), gap('o3', 'other'),
  gap('x1', 'exam-a'), gap('x2', 'exam-a')
];
const COURSE = {
  learnedStage: 1,
  units: [{ id: 'kanji', title: 'Kanji' }, { id: 'vocab', title: 'Vocab' }, { id: 'grammar', title: 'Grammar' },
    { id: 'other', title: 'Other unit' }, { id: 'exam-a', title: 'Exam A', newPerDay: 0 }],
  groups: [{ id: 'kv', title: 'KV', units: ['kanji', 'vocab'], newPerDay: 2 }, { id: 'gr', title: 'GR', units: ['grammar'], newPerDay: 1 }],
  bars: [{ title: 'Kanji bar', units: ['kanji'], learnedStage: 1 }]
};
const due = { s: 0, due: NOW - DAY };
const later = { s: 1, due: NOW + 9 * DAY };
const young = { s: 0, due: NOW + 9 * DAY };

async function home(lang, extraDoc) {
  const m = await mount({ items: ITEMS, course: COURSE, lang, settings: extraDoc || {} });
  // E1 learned (both items), E2 both items due, g1 started, o1 due, o2 learned
  Object.assign(m.doc.items, { k1: later, v1: later, k2: due, v2: due, g1: young, o1: due, o2: later, x1: due });
  m.app.refresh();
  return m;
}
const num = (n) => Number(text(n).match(/\d+/)[0]);

test('summary equals the group cards plus ungrouped units (entities, not items)', async () => {
  const m = await home('en');
  const c = m.engine.counts();
  const tree = m.tree();
  const cards = Object.keys(c.groups).map((id) => c.groups[id]);
  const ungroupedDue = c.byUnit.other.due + c.byUnit['exam-a'].due;
  const cardsDue = cards.reduce((s, g) => s + g.due, 0);
  assert.ok(c.due > cardsDue + ungroupedDue, 'item-level due differs from entity-level due');
  assert.strictEqual(c.summary.due, cardsDue + ungroupedDue);
  assert.strictEqual(num(find(tree, 'stat-due').props.children[0]), cardsDue + ungroupedDue);
  const cardsNew = cards.reduce((s, g) => s + g.newToday, 0);
  assert.ok(c.summary.newToday >= cardsNew);
  assert.strictEqual(num(find(tree, 'stat-new').props.children[0]), c.summary.newToday);
  Object.keys(c.groups).forEach((id) => {
    assert.strictEqual(num(find(tree, 'group-' + id + '-due')), c.groups[id].due);
    assert.strictEqual(num(find(tree, 'group-' + id + '-new')), c.groups[id].newToday);
  });
});

test('summary new = group newToday + fresh ungrouped items in the queue; no summary without groups', async () => {
  const m = await home('en');
  const c = m.engine.counts();
  const ids = m.engine.start('daily', {}).total;
  assert.strictEqual(ids, c.summary.queue);
  assert.strictEqual(c.summary.newToday, c.groups.kv.newToday + c.groups.gr.newToday + 1);
  const plain = await mount({ items: ITEMS, course: { units: COURSE.units } });
  assert.strictEqual(plain.engine.counts().summary, undefined);
  assert.strictEqual(find(plain.tree(), 'session-count'), null);
});

test('bars: caption segments sum to total; started = recorded but not learned', async () => {
  const m = await home('en');
  const b = m.engine.counts().bars[0];
  assert.deepStrictEqual(b, { title: 'Kanji bar', learned: 1, started: 1, total: 4 });
  const row = find(m.tree(), 'bar-Kanji bar');
  assert.ok(text(row).includes('Learned 1 · In progress 1 · Left 2 · total 4'), text(row));
  const bar = (() => { let r = null; walk(row, (n) => { if (n.props.role === 'progressbar') r = n; }); return r; })();
  assert.strictEqual(bar.props['aria-valuenow'], 1);
  assert.strictEqual(bar.props['aria-valuemax'], 4);
  const widths = bar.props.children.map((s) => parseFloat(s.props.style.match(/width: ([\d.]+)%/)[1]));
  assert.ok(Math.abs(widths.reduce((a, x) => a + x, 0) - 100) < 0.2, widths.join(','));
});

test('bar fill: learned segment comes first, then in progress, then left (fill starts at the left)', async () => {
  const m = await home('en');
  const row = find(m.tree(), 'bar-Kanji bar');
  let bar = null;
  walk(row, (n) => { if (n.props.role === 'progressbar') bar = n; });
  const order = bar.props.children.map((s) => s.props.className.replace('progress-segment ', ''));
  assert.strictEqual(order.join(','), 'learned,learning,new');
  const css = read('styles/app.css');
  const rule = css.match(/^\.progress-bar \{[^}]*\}/m)[0];
  assert.ok(/display: flex/.test(rule) && !/row-reverse|direction: rtl/.test(rule), rule);
  assert.ok(!/\.progress-segment[^{]*\{[^}]*margin-left: auto/.test(css));
});

test('stat labels never break mid-word; new-today note explains other sections', async () => {
  const css = read('styles/app.css');
  const rule = css.match(/\.stat span \{[^}]*\}/)[0];
  assert.ok(/overflow-wrap: normal/.test(rule) && /hyphens: none/.test(rule) && !/anywhere|break-all/.test(rule), rule);
  const m = await home('en');
  assert.ok(text(find(m.tree(), 'stats-note')).length > 0);
  assert.ok(JSON.parse(read('i18n/ru.json'))['home.stat.newHint'].length > 0);
});

for (const lang of ['en', 'ru']) {
  test('Home texts (' + lang + '): no undefined or raw keys; labelled group card; other sections', async () => {
    const m = await home(lang, { examDate: '2025-10-16' });
    const tree = m.tree();
    const all = text(tree);
    assert.ok(!/undefined|NaN|\[object/.test(all), all);
    const keys = Object.keys(JSON.parse(read('i18n/en.json')));
    assert.ok(!keys.some((k) => all.includes(k)), 'raw key in output');
    const card = text(find(tree, 'group-kv'));
    assert.ok(/· \d+/.test(text(find(tree, 'btn-start-group-kv'))), 'start button shows count');
    assert.ok(card.length > 0);
    assert.strictEqual(findAll(tree, /^group-.*-hint$/).length, 0);
    assert.ok(find(tree, 'session-count'));
    const other = find(tree, 'other-units');
    assert.ok(other && find(other, 'unit-other') && !find(other, 'unit-exam-a'));
    const ex = find(tree, 'exam-units');
    assert.ok(ex && find(ex, 'unit-exam-a'), 'exam units collapsed in details');
    assert.strictEqual(ex.type, 'details');
    assert.ok(find(tree, 'unit-other-due'), 'due chip for a due unit');
    assert.ok(!find(tree, 'unit-o2-due'));
    assert.ok(!/legend|Total, due|Всего, к/.test(all));
    const cd = text(find(tree, 'exam-countdown'));
    assert.ok(lang === 'en' ? /^7 days until the exam · /.test(cd) && /2025/.test(cd) : /^До экзамена 7 дней · /.test(cd) && /2025/.test(cd), cd);
  });
}

test('no due chip when the unit has nothing due; countdown never uses the notice class', async () => {
  const m = await home('en', { examDate: '2025-12-01' });
  const tree = m.tree();
  assert.strictEqual(find(tree, 'unit-exam-a-due') === null, false, 'exam-a has a due item');
  const cd = find(tree, 'exam-countdown');
  assert.ok(!/notice/.test(String(cd.props.class || cd.props.className)));
  assert.ok(!/soon/.test(String(cd.props.class || cd.props.className)), '>7 days is not accented');
});

test('CSS: progress-bar is 8px, never sized by flex basis; no hard-coded colors outside tokens', () => {
  const css = read('styles/app.css');
  const rules = css.split('}').map((r) => r.trim()).filter((r) => /\.progress-bar\b/.test(r.split('{')[0]));
  assert.ok(rules.length > 0);
  const main = rules.find((r) => /^\.progress-bar\s*\{/.test(r));
  assert.ok(/height: 8px/.test(main) && /flex: none/.test(main), main);
  rules.forEach((r) => {
    const sel = r.split('{')[0];
    if (/\.units|\.total-progress/.test(sel)) return; // row-direction wrapping lists: basis is a width
    assert.ok(!/flex(-basis)?:/.test(r.split('{')[1].replace('flex: none', '')), 'no flex basis on ' + sel);
  });
  css.split('\n').filter((l) => /meter|progress|bar|group|exam-|session-count/.test(l)).forEach((l) => assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(l), 'hex color: ' + l));
  const tokens = read('styles/tokens.css');
  assert.strictEqual((tokens.match(/--meter-started:/g) || []).length, 4, 'light, light-theme, dark media, dark theme');
  ['learning', 'learned'].forEach((k) => {
    const r = css.match(new RegExp('\\.progress-segment\\.' + k + ' \\{[^}]*\\}'))[0];
    assert.ok(!/--warn|--good/.test(r), r);
  });
});
