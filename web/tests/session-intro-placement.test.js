'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;
const MIN = 60000;
const TODAY = '2025-10-09';
const J = (x) => JSON.parse(JSON.stringify(x));
const tr = (k, v) => k + (v ? JSON.stringify(v) : '');

function mkItems(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({ id: 'g' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x', 'xy'], explanation: 'E' + i, tags: ['a'] });
  }
  out[0].retry = ['y'];
  return out;
}

function mkContent(course, n) {
  const items = mkItems(n || 4);
  return {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: Object.assign({ id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }, course)
  };
}

let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

async function setup(course, opts) {
  const o = opts || {};
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: o.settings || {}, exams: {} };
  const clock = { t: NOW };
  const counters = { noted: 0 };
  const store = {
    doc,
    update(fn) { fn(doc); },
    noteAnswer() { counters.noted++; },
    exportText() { return JSON.stringify(doc); }
  };
  const content = o.content || mkContent(course, o.n);
  const dojo = o.wrapDojo ? o.wrapDojo(await getDojo()) : await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  return { engine, doc, clock, store, content, counters, dojo };
}

const EXAM = { passMark: 0.5, minutes: 5, sections: [{ title: 'A', count: 4, tags: ['a'] }] };

function load(markup) {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  sb.DojoSession = DojoSession;
  if (markup) {
    sb.DojoExt.registerMarkup('ruby', { render: (s) => s, plain: (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1') });
    sb.DojoExt.use('ruby');
  }
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
}

function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return find(n.props.children, id);
}
function texts(n, out) {
  out = out || [];
  if (Array.isArray(n)) n.forEach((c) => texts(c, out));
  else if (n && typeof n === 'object' && n.props) texts(n.props.children, out);
  else if (n !== null && n !== undefined && n !== false) out.push(String(n));
  return out;
}
function classOf(n) { return n.props.class || n.props.className || ''; }

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  i.view = () => i.render(i.props, i.state);
  return i;
}

function sessionScreen(sb, session, course) {
  const win = { addEventListener() {}, removeEventListener() {} };
  return inst(sb.DojoApp._SessionScreen, { t: tr, session, now: () => NOW, win, course: course || {}, onEnd() {}, onExit() {} });
}

// ---- 1. Catalog + detail hook ----
test('DojoExt.detail hands the hook deep clones and swallows plugin errors', () => {
  const sb = load();
  const ext = sb.DojoExt;
  const item = { id: 'a', prompt: 'p', meta: { k: [1] } };
  const items = [item];
  const records = { a: { s: 1 } };
  ext.registerDetail((it, ctx) => {
    it.prompt = 'changed'; it.meta.k.push(2);
    ctx.items[0].prompt = 'changed'; ctx.records.a.s = 9;
    return 'vnode';
  });
  assert.strictEqual(ext.detail(item, { items, records, t: tr }), 'vnode');
  assert.deepStrictEqual(J(item), { id: 'a', prompt: 'p', meta: { k: [1] } });
  assert.strictEqual(items[0].prompt, 'p');
  assert.strictEqual(records.a.s, 1);
  ext.registerDetail(() => { throw new Error('boom'); });
  assert.strictEqual(ext.detail(item, { items, records }), null);
});

async function catalogSetup() {
  const sb = load(true);
  const content = mkContent({ units: [{ id: 'u', title: 'U1' }, { id: 'v', title: 'U2' }] }, 3);
  content.items[0].prompt = '{漢|かん}字';
  content.items[0].tags = ['kanji'];
  content.items[1].tags = ['kanji', 'extra'];
  content.items[2].unit = 'v';
  content.items[2].tags = ['other'];
  const t = await setup(null, { content });
  const cat = inst(sb.DojoApp._CatalogScreen, {
    t: tr, course: content.course, content, store: t.store, engine: t.engine, go() {}
  });
  return Object.assign(t, { sb, cat });
}

test('Catalog: units are tabs, tags filter, stage colour from progress', async () => {
  const c = await catalogSetup();
  assert.ok(find(c.cat.view(), 'topic-g1') && find(c.cat.view(), 'topic-g2'));
  assert.strictEqual(find(c.cat.view(), 'topic-g3'), null);
  find(c.cat.view(), 'tab-v').props.onClick();
  assert.ok(find(c.cat.view(), 'topic-g3'));
  assert.strictEqual(find(c.cat.view(), 'topic-g1'), null);
  find(c.cat.view(), 'tab-u').props.onClick();
  find(c.cat.view(), 'tag-extra').props.onClick();
  assert.ok(find(c.cat.view(), 'topic-g2'));
  assert.strictEqual(find(c.cat.view(), 'topic-g1'), null);
  assert.ok(classOf(find(c.cat.view(), 'topic-state-g2')).includes('new'));
  find(c.cat.view(), 'tag-extra').props.onClick();
  const s = c.engine.start('daily');
  const answeredId = s.current().item.id;
  s.answer({ text: 'x' });
  const cls = classOf(find(c.cat.view(), 'topic-state-' + answeredId));
  assert.ok(!cls.includes('new'), cls);
});

test('Catalog: search matches DojoExt.plain() text and the raw reading', async () => {
  const c = await catalogSetup();
  const search = (q) => { find(c.cat.view(), 'catalog-search').props.onInput({ target: { value: q } }); };
  search('漢字');
  assert.ok(find(c.cat.view(), 'topic-g1'));
  assert.strictEqual(find(c.cat.view(), 'topic-g2'), null);
  search('かん');
  assert.ok(find(c.cat.view(), 'topic-g1'));
  assert.strictEqual(find(c.cat.view(), 'topic-g2'), null);
  search('E2');
  assert.ok(find(c.cat.view(), 'topic-g2'));
});

test('Catalog detail: prompt, answers, explanation, stage and plugin hook with isolated clones', async () => {
  const c = await catalogSetup();
  let seen = null;
  c.sb.DojoExt.registerDetail((it, ctx) => { seen = { it, ctx }; it.prompt = 'MUTATED'; ctx.items.length = 0; return 'HOOK-OUT'; });
  find(c.cat.view(), 'topic-g2').props.children.props.onClick();
  const v = c.cat.view();
  assert.ok(find(v, 'catalog-detail'));
  assert.ok(texts(find(v, 'detail-prompt')).join('').includes('P2'));
  assert.ok(texts(find(v, 'detail-answers')).join('').includes('x'));
  assert.ok(texts(find(v, 'detail-explanation')).join('').includes('E2'));
  assert.ok(texts(find(v, 'detail-stage')).join('').includes('catalog.stage.new'));
  assert.deepStrictEqual(texts(find(v, 'detail-hook')), ['HOOK-OUT']);
  assert.ok(seen.ctx.items !== c.content.items);
  assert.strictEqual(c.content.items.length, 3);
  assert.strictEqual(c.content.items[1].prompt, 'P2');
  c.sb.DojoExt.registerDetail(() => { throw new Error('x'); });
  assert.strictEqual(find(c.cat.view(), 'detail-hook'), null);
});

// ---- 2. Theme ----
function fakeEnv() {
  const attrs = {};
  return { attrs, document: { documentElement: { setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; } } } };
}

test('Settings: theme select writes settings.theme with a timestamp and sets data-theme; auto clears it', async () => {
  const sb = load();
  const t = await setup();
  const win = fakeEnv();
  const set = inst(sb.DojoApp._SettingsScreen, { t: tr, store: t.store, engine: { globalNewPerDay: () => 10, unitSettings: () => ({}), unitConfig: () => ({ dropByType: {} }) }, content: t.content, course: t.content.course, now: () => NOW, win, status: 'ok', go() {}, onDataChanged() {} });
  const sel = () => find(set.view(), 'theme-select');
  sel().props.onChange({ target: { value: 'dark' } });
  assert.strictEqual(t.doc.settings.theme, 'dark');
  assert.strictEqual(t.doc.settings.ts.theme, NOW);
  assert.strictEqual(win.attrs['data-theme'], 'dark');
  sel().props.onChange({ target: { value: 'light' } });
  assert.strictEqual(win.attrs['data-theme'], 'light');
  sel().props.onChange({ target: { value: 'auto' } });
  assert.strictEqual(t.doc.settings.theme, 'auto');
  assert.strictEqual('data-theme' in win.attrs, false);
  assert.deepStrictEqual(texts(sel()), ['settings.theme.auto', 'settings.theme.light', 'settings.theme.dark']);
});

test('applyTheme: stored theme is applied at start, unknown value behaves as auto', () => {
  const sb = load();
  const win = fakeEnv();
  sb.DojoApp._applyTheme(win, 'dark');
  assert.strictEqual(win.attrs['data-theme'], 'dark');
  sb.DojoApp._applyTheme(win, 'neon');
  assert.strictEqual('data-theme' in win.attrs, false);
  sb.DojoApp._applyTheme(win, undefined);
  assert.strictEqual('data-theme' in win.attrs, false);
});

test('start() applies the saved theme before rendering', async () => {
  const sb = load();
  const win = fakeEnv();
  win.addEventListener = () => {};
  const doc = { settings: { theme: 'dark' } };
  sb.DojoMigrate = { create: () => () => null };
  sb.DojoStorage = { createStore: () => ({ doc, load: () => Promise.resolve(), attachLifecycle() {} }) };
  sb.DojoSession = { createEngine: () => ({}) };
  sb.preact.render = () => {};
  await sb.DojoApp.start({ root: {}, content: { course: { id: 'c' }, items: [] }, win, now: () => NOW, dojo: {} });
  assert.strictEqual(win.attrs['data-theme'], 'dark');
});

// ---- 3. Requeue counter ----
test('requeue counter: total stays initial, retry copies are counted separately', async () => {
  const t = await setup(null, { n: 3 });
  const s = t.engine.start('daily');
  assert.strictEqual(s.initialTotal, 3);
  assert.strictEqual(s.retryCount(), 0);
  s.answer({ text: 'zzz' });
  assert.strictEqual(s.retryCount(), 1);
  assert.strictEqual(s.initialTotal, 3);
  s.next();
  s.answer({ text: 'x' });
  s.next();
  s.answer({ text: 'x' });
  s.next();
  assert.strictEqual(s.current().position, 4);
  assert.strictEqual(s.initialTotal, 3);
  assert.strictEqual(s.retryCount(), 1);
});

test('requeue counter UI: shows position / initial total and a +N badge', async () => {
  const sb = load();
  const t = await setup(null, { n: 3 });
  const ui = sessionScreen(sb, t.engine.start('daily'));
  assert.match(find(ui.view(), 'retry-badge').props.class, /\bempty\b/);
  assert.strictEqual(texts(find(ui.view(), 'progress')).join('').replace(/\s+/g, ''), '1/3');
  ui.answer({ text: 'zzz' });
  ui.next(); ui.answer({ text: 'x' });
  ui.next(); ui.answer({ text: 'x' });
  ui.next();
  assert.strictEqual(texts(find(ui.view(), 'progress')).join('').replace(/\s+/g, ''), '3/3');
  assert.deepStrictEqual(texts(find(ui.view(), 'retry-badge')), ['session.retries{"n":1}']);
});

// ---- 4. More new ----
test('more-new: extra allowance for today, newByDay untouched, daily queue grows', async () => {
  const t = await setup(null, { n: 4, settings: { newPerDay: 1 } });
  assert.strictEqual(t.engine.counts().newToday, 1);
  assert.strictEqual(t.engine.counts().fresh, 4);
  assert.strictEqual(t.engine.start('daily').total, 1);
  t.engine.moreNew(2);
  assert.strictEqual(t.engine.counts().newToday, 3);
  assert.strictEqual(t.engine.start('daily').total, 3);
  t.engine.moreNew(20);
  assert.strictEqual(t.engine.start('daily').total, 4);
  assert.deepStrictEqual(t.doc.stats.newByDay, {});
  assert.strictEqual(t.doc.stats.extraNewByDay[TODAY], 22);
  t.engine.moreNew(-5);
  t.engine.moreNew(0);
  assert.strictEqual(t.doc.stats.extraNewByDay[TODAY], 22);
});

test('more-new: the extra allowance is used up as new items are answered', async () => {
  const t = await setup(null, { n: 4, settings: { newPerDay: 1 } });
  t.engine.moreNew(1);
  const s = t.engine.start('daily');
  assert.strictEqual(s.total, 2);
  s.answer({ text: 'x' }); s.next(); s.answer({ text: 'x' });
  assert.strictEqual(t.engine.counts().newToday, 0);
});

test('Home: +5/+10/+20 buttons appear only when more new items exist and call onMoreNew', () => {
  const App = load().DojoApp;
  const home = (c) => ({ counts: Object.assign({ due: 0, newToday: 2, fresh: 5, active: 5, byUnit: {} }, c), streak: 0, weak: false });
  const got = [];
  const render = (c) => App._Home({ t: tr, course: { title: 'C', units: [] }, home: home(c), exams: [], status: 'ok', notice: null, go() {}, onStart() {}, onMoreNew: (n) => got.push(n), examDaysLeft: null });
  const v = render();
  find(v, 'btn-more-5').props.onClick();
  find(v, 'btn-more-10').props.onClick();
  find(v, 'btn-more-20').props.onClick();
  assert.deepStrictEqual(got, [5, 10, 20]);
  assert.strictEqual(find(render({ fresh: 2 }), 'more-new'), null);
});

// ---- 5. Exam countdown ----
test('exam countdown: days between local today and settings.examDate', () => {
  const App = load().DojoApp;
  assert.strictEqual(App._daysLeft('2025-10-20', TODAY), 11);
  assert.strictEqual(App._daysLeft(TODAY, TODAY), 0);
  assert.strictEqual(App._daysLeft('2026-01-01', '2025-12-31'), 1);
  assert.strictEqual(App._daysLeft('2025-10-01', TODAY), null);
  assert.strictEqual(App._daysLeft('', TODAY), null);
  assert.strictEqual(App._daysLeft('garbage', TODAY), null);
});

test('Home: countdown line only when a date is set; Settings saves the date', async () => {
  const sb = load();
  const base = { t: tr, course: { title: 'C', units: [] }, home: { counts: { due: 0, newToday: 0, fresh: 0, active: 0, byUnit: {} }, streak: 0, weak: false }, exams: [], status: 'ok', notice: null, go() {}, onStart() {} };
  assert.strictEqual(find(sb.DojoApp._Home(Object.assign({ examDaysLeft: null }, base)), 'exam-countdown'), null);
  assert.deepStrictEqual(texts(find(sb.DojoApp._Home(Object.assign({ examDaysLeft: 11 }, base)), 'exam-countdown')), ['home.exam.countdown{"n":11}']);
  const t = await setup();
  const set = inst(sb.DojoApp._SettingsScreen, { t: tr, store: t.store, engine: { globalNewPerDay: () => 10, unitSettings: () => ({}), unitConfig: () => ({ dropByType: {} }) }, content: t.content, course: t.content.course, now: () => NOW, win: fakeEnv(), status: 'ok', go() {}, onDataChanged() {} });
  find(set.view(), 'exam-date').props.onChange({ target: { value: '2026-03-01' } });
  assert.strictEqual(t.doc.settings.examDate, '2026-03-01');
  find(set.view(), 'exam-date').props.onChange({ target: { value: '' } });
  assert.strictEqual(t.doc.settings.examDate, '');
  assert.strictEqual(t.doc.settings.ts.examDate, NOW);
});

// ---- 6. allowOverride ----
test('Catalog: search matches every alternate answer of a gap item', async () => {
  const sb = load(true);
  const content = mkContent(null, 2);
  content.items[1].answers = ['x', 'altanswer'];
  const t = await setup(null, { content });
  const cat = inst(sb.DojoApp._CatalogScreen, { t: tr, course: content.course, content, store: t.store, engine: t.engine, go() {} });
  find(cat.view(), 'catalog-search').props.onInput({ target: { value: 'ALTANSWER' } });
  assert.ok(find(cat.view(), 'topic-g2'));
  assert.strictEqual(find(cat.view(), 'topic-g1'), null);
});

test('override after a wrong answer: record equals a correct answer (ok, stage, bad) and the wrong-answer record is not kept', async () => {
  const wrong = await setup(null, { n: 3 });
  const s = wrong.engine.start('daily');
  s.answer({ text: 'xz' });
  const synced = J(wrong.doc);
  assert.strictEqual(synced.items.g1.bad, 1);
  s.overrideLast();
  const right = await setup(null, { n: 3 });
  right.engine.start('daily').answer({ text: 'x' });
  assert.deepStrictEqual(J(wrong.doc.items.g1), J(right.doc.items.g1));
});

test('override restores the pre-answer record, applies the right verdict once, never double counts', async () => {
  const wrong = await setup(null, { n: 3 });
  const s = wrong.engine.start('daily');
  s.answer({ text: 'xz' });
  const wrongRec = J(wrong.doc.items.g1);
  assert.strictEqual(s.canOverride(), true);
  assert.strictEqual(s.retryCount(), 1);
  const r = s.overrideLast();
  assert.strictEqual(r.correct, true);
  assert.strictEqual(s.canOverride(), false);
  assert.strictEqual(s.overrideLast().error, 'no_override');
  assert.strictEqual(s.retryCount(), 0);

  const right = await setup(null, { n: 3 });
  right.engine.start('daily').answer({ text: 'x' });
  assert.notDeepStrictEqual(wrongRec, J(right.doc.items.g1));
  assert.deepStrictEqual(J(wrong.doc.items.g1), J(right.doc.items.g1));
  assert.deepStrictEqual(J(wrong.doc.stats), J(right.doc.stats));
  s.next();
  assert.strictEqual(s.current().total, 3);
  s.answer({ text: 'x' }); s.next(); s.answer({ text: 'x' }); s.next();
  assert.strictEqual(s.done, true);
  const sum = s.finish();
  assert.strictEqual(sum.correct, 3);
  assert.strictEqual(sum.review.length, 3);
});

test('override: off when course.allowOverride is false, for non-typed answers, in every exam', async () => {
  const off = await setup({ allowOverride: false }, { n: 3 });
  const so = off.engine.start('daily');
  so.answer({ text: 'xz' });
  assert.strictEqual(so.canOverride(), false);
  assert.strictEqual(so.overrideLast().error, 'no_override');

  const choice = mkContent(null, 2);
  choice.items[0] = { id: 'g1', unit: 'u', type: 'choice', prompt: 'P', options: ['a', 'b'], answer: 0 };
  const c = await setup(null, { content: choice });
  const sc = c.engine.start('daily');
  sc.answer({ index: 1 });
  assert.strictEqual(sc.canOverride(), false);

  for (const training of [false, true]) {
    const e = await setup({ exam: EXAM }, { n: 4 });
    const se = e.engine.start('exam', { training });
    se.answer({ text: 'xz' });
    assert.strictEqual(se.canOverride(), false);
    assert.strictEqual(se.overrideLast().error, 'no_override');
  }
});

test('override UI: button after a wrong typed answer outside exams, absent in exams', async () => {
  const sb = load();
  const t = await setup(null, { n: 3 });
  const ui = sessionScreen(sb, t.engine.start('daily'));
  ui.answer({ text: 'xz' });
  assert.ok(find(ui.view(), 'feedback').props.class.includes('wrong'));
  const btn = find(ui.view(), 'btn-override');
  assert.ok(btn);
  btn.props.onClick();
  assert.strictEqual(find(ui.view(), 'btn-override'), null);
  assert.strictEqual(ui.state.result.correct, true);
  assert.ok(find(ui.view(), 'feedback').props.class.includes('right'));

  const e = await setup({ exam: EXAM }, { n: 4 });
  const ue = sessionScreen(sb, e.engine.start('exam', { training: true }));
  ue.answer({ text: 'zzz' });
  assert.ok(find(ue.view(), 'feedback'));
  assert.strictEqual(find(ue.view(), 'btn-override'), null);

  const real = await setup({ exam: EXAM }, { n: 4 });
  const ur = sessionScreen(sb, real.engine.start('exam'));
  ur.answer({ text: 'zzz' });
  assert.ok(find(ur.view(), 'recorded'));
  assert.strictEqual(find(ur.view(), 'btn-override'), null);
});

// ---- 7. gap retry ----
test('gap retry: not recorded, not counted, not advanced, can be answered again', async () => {
  const t = await setup(null, { n: 3 });
  const s = t.engine.start('daily');
  assert.strictEqual(s.current().item.id, 'g1');
  const r = s.answer({ text: 'y' });
  assert.strictEqual(r.verdict, 'retry');
  assert.deepStrictEqual(t.doc.items, {});
  assert.deepStrictEqual(t.doc.stats, { days: {}, newByDay: {} });
  assert.strictEqual(t.counters.noted, 0);
  assert.strictEqual(s.current().item.id, 'g1');
  assert.strictEqual(s.retryCount(), 0);
  assert.strictEqual(s.canOverride(), false);
  assert.strictEqual(s.answer({ text: 'x' }).correct, true);
  assert.ok(t.doc.items.g1);
});

test('gap retry: an item without retry readings behaves as before; exams never hint', async () => {
  const t = await setup(null, { n: 3 });
  const s = t.engine.start('daily');
  s.next();
  assert.strictEqual(s.answer({ text: 'y' }).correct, false);

  const e = await setup({ exam: EXAM }, { n: 4 });
  const se = e.engine.start('exam');
  const out = [];
  while (se.current()) { out.push(se.answer({ text: 'y' })); se.next(); }
  assert.ok(out.every((x) => x.recorded === true && x.verdict === undefined));
  assert.strictEqual(se.finish().correct, 0);
});

test('gap retry UI: shows the message, keeps the question open and does not advance', async () => {
  const sb = load();
  const t = await setup(null, { n: 3 });
  const ui = sessionScreen(sb, t.engine.start('daily'));
  ui.answer({ text: 'y' });
  assert.strictEqual(ui.state.result, null);
  assert.ok(find(ui.view(), 'feedback-retry'));
  assert.strictEqual(find(ui.view(), 'btn-next').props.disabled, true);
  ui.answer({ text: 'x' });
  assert.strictEqual(find(ui.view(), 'feedback-retry'), null);
  assert.strictEqual(ui.state.result.correct, true);
});

// ---- 8. introNew ----
test('introNew: explanation once per new item, only when opted in', async () => {
  const off = await setup(null, { n: 3 });
  assert.strictEqual(off.engine.start('daily').shouldShowIntro(off.content.items[0]), false);

  const t = await setup({ introNew: true }, { n: 3 });
  const s = t.engine.start('daily');
  assert.strictEqual(s.shouldShowIntro(t.content.items[0]), true);
  assert.strictEqual(s.shouldShowIntro(t.content.items[0]), false);
  assert.strictEqual(s.shouldShowIntro(Object.assign({}, t.content.items[1], { explanation: undefined })), false);
  t.doc.items.g3 = { s: 1, due: NOW + 1, ok: 1, bad: 0, last: NOW };
  assert.strictEqual(s.shouldShowIntro(t.content.items[2]), false);

  const e = await setup({ introNew: true, exam: EXAM }, { n: 4 });
  assert.strictEqual(e.engine.start('exam').shouldShowIntro(e.content.items[0]), false);
});

test('introNew UI: the explanation is shown before the first try, not on the retry copy', async () => {
  const sb = load();
  const t = await setup({ introNew: true }, { n: 2 });
  const ui = sessionScreen(sb, t.engine.start('daily'));
  assert.deepStrictEqual(texts(find(ui.view(), 'intro')), ['E1']);
  ui.answer({ text: 'zzz' });
  ui.next();
  assert.deepStrictEqual(texts(find(ui.view(), 'intro')), ['E2']);
  ui.answer({ text: 'x' });
  ui.next();
  assert.strictEqual(ui.state.cur.item.id, 'g1');
  assert.strictEqual(find(ui.view(), 'intro'), null);
  const plain = sessionScreen(sb, (await setup(null, { n: 2 })).engine.start('daily'));
  assert.strictEqual(find(plain.view(), 'intro'), null);
});

// ---- 9. deferred fixes ----
test('timer expiry: unanswered questions are listed as skipped, answered ones are not', async () => {
  const t = await setup({ exam: EXAM }, { n: 4 });
  const s = t.engine.start('exam');
  const answeredId = s.current().item.id;
  s.answer({ text: 'x' });
  t.clock.t += 6 * MIN;
  assert.deepStrictEqual(J(s.expire()), { jumped: false, finished: true });
  const sum = s.finish();
  assert.strictEqual(sum.skipped.length, 3);
  assert.ok(!sum.skipped.includes(answeredId));
  assert.strictEqual(new Set(sum.skipped).size, 3);
  assert.strictEqual(sum.answered, 1);

  const t2 = await setup({ exam: EXAM }, { n: 4 });
  const s2 = t2.engine.start('exam');
  s2.answer({ text: 'x' }); s2.next();
  t2.clock.t += 6 * MIN;
  s2.expire();
  assert.strictEqual(s2.finish().skipped.length, 3);

  const t3 = await setup({ exam: EXAM }, { n: 4 });
  const s3 = t3.engine.start('exam');
  while (s3.current()) { s3.answer({ text: 'x' }); s3.next(); }
  assert.deepStrictEqual(s3.finish().skipped, []);
});

test('timed groups: a group that runs out skips its unanswered questions', async () => {
  const exam = { passMark: 0.5, sections: [{ title: 'A', count: 2, tags: ['a'] }, { title: 'B', count: 2, tags: ['b'] }], timing: [{ sections: ['A'], minutes: 5 }, { sections: ['B'], minutes: 5 }] };
  const content = mkContent({ exam }, 4);
  content.items[2].tags = ['b']; content.items[3].tags = ['b'];
  const t = await setup(null, { content });
  const s = t.engine.start('exam');
  t.clock.t += 6 * MIN;
  assert.strictEqual(s.expire().jumped, true);
  s.answer({ text: 'x' }); s.next();
  t.clock.t += 6 * MIN;
  assert.strictEqual(s.expire().finished, true);
  assert.strictEqual(s.finish().skipped.length, 3);
});

test('Results: "Nothing missed" only when nothing was missed or skipped; skipped are listed next to missed', async () => {
  const sb = load();
  const t = await setup({ exam: EXAM }, { n: 4 });
  const s = t.engine.start('exam');
  s.answer({ text: 'x' });
  t.clock.t += 6 * MIN;
  s.expire();
  const sum = s.finish();
  const byId = {};
  t.content.items.forEach((i) => { byId[i.id] = i; });
  const render = (summary) => sb.DojoApp._Results({ t: tr, byId, go() {}, onAgain() {}, summary });
  const v = render(sum);
  assert.strictEqual(find(v, 'no-missed'), null);
  sum.skipped.forEach((id) => assert.ok(find(v, 'skipped-' + id), id));
  const withMissed = render(Object.assign({}, sum, { review: [{ id: 'g1', correct: false, given: 'q', expected: 'x' }] }));
  assert.ok(find(withMissed, 'missed-g1'));
  assert.ok(find(withMissed, 'skipped-' + sum.skipped[0]));
  assert.ok(find(render(Object.assign({}, sum, { skipped: [] })), 'no-missed'));
});

test('Home: a single legacy exam starts directly without a picker', () => {
  const App = load().DojoApp;
  const started = [];
  const v = App._Home({ t: tr, course: { title: 'C', units: [] }, home: { counts: { due: 0, newToday: 0, active: 0, byUnit: {} }, streak: 0, weak: false },
    exams: [{ id: 'default', sections: ['A'], timed: false }], status: 'ok', notice: null, go() {}, onStart: (m, o) => started.push([m, J(o)]) });
  find(v, 'btn-exam').props.onClick();
  assert.deepStrictEqual(started, [['exam', {}]]);
});

test('placement: known/unknown are disabled after an answer and a second answer is ignored', async () => {
  const t = await setup({ placement: { mode: 'self' } }, { n: 3 });
  const s = t.engine.start('placement', { seed: 'S1' });
  const ui = inst(load().DojoApp._PlacementSession, { t: tr, session: s, now: () => NOW, win: {}, course: t.content.course, onEnd() {}, onExit() {} });
  assert.strictEqual(find(ui.view(), 'placement-known').props.disabled, false);
  find(ui.view(), 'placement-known').props.onClick();
  assert.strictEqual(find(ui.view(), 'placement-known').props.disabled, true);
  assert.strictEqual(find(ui.view(), 'placement-unknown').props.disabled, true);
  ui.answer(false);
  assert.strictEqual(ui.state.error, null);
  assert.strictEqual(Object.keys(t.doc.items).length, 1);
  ui.next();
  assert.strictEqual(find(ui.view(), 'placement-known').props.disabled, false);
});

test('placement: per-item seed derives from session.seed and the item id', async () => {
  const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(); };
  const seeds = [];
  const wrapDojo = (d) => ({ call: (name, args) => { if (name === 'applyPlacement') seeds.push(args.seed); return d.call(name, args); } });
  const t = await setup({ placement: { mode: 'self' } }, { n: 3, wrapDojo });
  const s = t.engine.start('placement', { seed: 'S1' });
  assert.strictEqual(s.seed, 'S1');
  const ids = [];
  while (s.current()) { ids.push(s.current().item.id); s.answer({ rating: 'known' }); s.next(); }
  assert.deepStrictEqual(seeds, ids.map((id) => fnv('S1|' + id)));
  const seeds1 = seeds.splice(0);
  const s2 = t.engine.start('placement', { seed: 'S2' });
  while (s2.current()) { s2.answer({ rating: 'again' }); s2.next(); }
  assert.notDeepStrictEqual(seeds, seeds1);
});

test('placement check: renderFeedback does not throw on right or wrong answers', async () => {
  const t = await setup({ placement: { mode: 'self' } }, { n: 3 });
  const s = t.engine.start('placement', { seed: 'S1' });
  const ui = inst(load().DojoApp._PlacementSession, { t: tr, session: s, now: () => NOW, win: {}, course: t.content.course, content: t.content, onEnd() {}, onExit() {} });
  const item = t.content.items[0];
  [true, false].forEach((correct) => {
    const res = { correct, expected: 'x', given: 'y' };
    let v;
    assert.doesNotThrow(() => { v = ui.renderFeedback(ui.props, { cur: { item }, result: res }); });
    assert.ok(find(v, 'feedback'));
    const str = JSON.stringify(v);
    assert.ok(!/undefined|\[object/.test(str), str);
  });
});
