'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;
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


function load(markup) {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/ruby-dict.js', 'ext/registry.js','ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  sb.DojoSession = DojoSession;
  if (markup) {
    sb.DojoExt.registerMarkup('ruby', { render: (s) => s, plain: (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1') });
    sb.DojoExt.use('ruby');
  }
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-boundary.js']).concat(['ui/session-panels.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app-screens.js']).concat(['ui/app.js']) });
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





// ---- 2. Theme ----
function fakeEnv() {
  const attrs = {};
  return { attrs, document: { documentElement: { setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; } } } };
}




// ---- 3. Requeue counter ----


// ---- 4. More new ----



// ---- 5. Exam countdown ----


// ---- 6. allowOverride ----





// ---- 7. gap retry ----



// ---- 8. introNew ----


// ---- 9. deferred fixes ----

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
