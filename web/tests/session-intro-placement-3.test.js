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
(x) => JSON.parse(JSON.stringify(x));
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
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-boundary.js']).concat(['ui/session-panels.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
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




// ---- 3. Requeue counter ----


// ---- 4. More new ----



// ---- 5. Exam countdown ----


// ---- 6. allowOverride ----





// ---- 7. gap retry ----



// ---- 8. introNew ----


// ---- 9. deferred fixes ----

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
