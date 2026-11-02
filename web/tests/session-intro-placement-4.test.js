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
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-boundary.js']).concat(['ui/session-panels.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
}

function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return find(n.props.children, id);
}

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  i.view = () => i.render(i.props, i.state);
  return i;
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
