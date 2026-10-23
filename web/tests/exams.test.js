'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const ROOT = path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const MIN = 60000;

function items() {
  const out = [];
  ['a', 'b'].forEach((tag) => {
    for (let i = 1; i <= 3; i++) out.push({ id: tag + i, unit: 'u', type: 'gap', prompt: 'P ' + tag + i, answers: ['x'], tags: [tag] });
  });
  return out;
}

function examCfg(extra) {
  return Object.assign({
    passMark: 0.5,
    sections: [{ title: 'A', count: 3, tags: ['a'] }, { title: 'B', count: 3, tags: ['b'] }]
  }, extra || {});
}

function content(course) {
  const its = items();
  return { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: Object.assign({ id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }, course) };
}

let dojoP;
async function setup(course, extra) {
  if (!dojoP) {
    checkWasmFresh();
    dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const engine = DojoSession.createEngine(Object.assign({
    dojo: await dojoP, store, content: content(course), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5
  }, extra || {}));
  return { engine, doc, clock };
}

const tick = () => new Promise((r) => setImmediate(r));
function solveCurrent(s) { return s.answer({ text: 'x' }); }

const TIMED = { timing: [{ sections: ['A'], minutes: 10 }, { sections: ['B'], minutes: 20 }] };

test('picker data lists legacy exam as default plus exams[]', async () => {
  const t = await setup({ exam: examCfg({ minutes: 5 }), exams: [{ id: 'm1', title: 'Mock 1', note: 'estimate', ...examCfg(TIMED) }] });
  const list = t.engine.exams();
  assert.deepStrictEqual(list.map((e) => e.id), ['default', 'm1']);
  assert.deepStrictEqual(list[1], {
    id: 'm1', title: 'Mock 1', note: 'estimate', sections: ['A', 'B'], minutes: 30, timed: true,
    groups: [{ sections: ['A'], minutes: 10 }, { sections: ['B'], minutes: 20 }]
  });
  assert.strictEqual(list[0].timed, true);
  assert.deepStrictEqual((await setup({})).engine.exams(), []);
});

test('timer groups: one countdown per group, expiry jumps to next group, last expiry finishes', async () => {
  const t = await setup({ exams: [{ id: 'm1', ...examCfg(TIMED) }] });
  const s = t.engine.start('exam', { examId: 'm1' });
  assert.strictEqual(s.examId, 'm1');
  assert.strictEqual(s.deadline, NOW + 10 * MIN);
  assert.deepStrictEqual(s.group, { index: 0, count: 2 });
  solveCurrent(s);
  s.next();
  assert.deepStrictEqual(s.expire(), { jumped: false, finished: false });
  t.clock.t = NOW + 10 * MIN;
  assert.deepStrictEqual(s.expire(), { jumped: true, finished: false });
  assert.strictEqual(s.index, 3);
  assert.ok(s.current().item.id.startsWith('b'));
  assert.strictEqual(s.deadline, NOW + 30 * MIN);
  assert.deepStrictEqual(s.group, { index: 1, count: 2 });
  t.clock.t = NOW + 30 * MIN;
  assert.deepStrictEqual(s.expire(), { jumped: false, finished: true });
  const sum = s.finish();
  assert.strictEqual(sum.raw, 1);
  assert.strictEqual(sum.total, 6);
});

test('finishing a group early starts the next group clock on entry', async () => {
  const t = await setup({ exams: [{ id: 'm1', ...examCfg(TIMED) }] });
  const s = t.engine.start('exam', { examId: 'm1' });
  t.clock.t = NOW + 2 * MIN;
  for (let i = 0; i < 3; i++) { solveCurrent(s); s.next(); }
  assert.deepStrictEqual(s.group, { index: 1, count: 2 });
  assert.strictEqual(s.deadline, NOW + 22 * MIN);
});

test('without timing the single global timer is unchanged', async () => {
  const t = await setup({ exam: examCfg({ minutes: 5 }) });
  const s = t.engine.start('exam');
  assert.strictEqual(s.deadline, NOW + 5 * MIN);
  assert.strictEqual(s.group, undefined);
  assert.strictEqual(s.examId, undefined);
  t.clock.t = NOW + 5 * MIN;
  assert.deepStrictEqual(s.expire(), { jumped: false, finished: true });
});

test('training: untimed, feedback shown, nothing written to doc.exams', async () => {
  const t = await setup({ exams: [{ id: 'm1', ...examCfg(TIMED) }] });
  const s = t.engine.start('exam', { examId: 'm1', training: true });
  assert.strictEqual(s.deadline, undefined);
  assert.strictEqual(s.training, true);
  const r = solveCurrent(s);
  assert.strictEqual(r.correct, true);
  assert.deepStrictEqual(s.expire(), { jumped: false, finished: false });
  const sum = s.finish();
  assert.strictEqual(sum.training, true);
  assert.deepStrictEqual(t.doc.exams, {});
});

test('unknown examId is no_exam', async () => {
  const t = await setup({ exams: [{ id: 'm1', ...examCfg() }] });
  assert.deepStrictEqual(t.engine.start('exam', { examId: 'zz' }), { error: 'no_exam' });
});

const SCORING = {
  scoring: [{ title: 'Part A', sections: ['A'], points: 60, minPoints: 10 }, { title: 'Part B', sections: ['B'], points: 60 }],
  passPoints: 50, note: 'estimate'
};

test('result has parts, total points, pass; entry stores examId and parts', async () => {
  const t = await setup({ exams: [{ id: 'm1', ...examCfg(Object.assign({}, TIMED, SCORING)) }] });
  const s = t.engine.start('exam', { examId: 'm1' });
  for (let i = 0; i < 3; i++) { solveCurrent(s); s.next(); }
  const sum = s.finish();
  assert.deepStrictEqual(sum.parts.map((p) => [p.title, p.raw, p.total, p.points, p.pass]),
    [['Part A', 3, 3, 60, true], ['Part B', 0, 3, 0, true]]);
  assert.strictEqual(sum.totalPoints, 60);
  assert.strictEqual(sum.passPoints, 50);
  assert.strictEqual(sum.note, 'estimate');
  assert.strictEqual(sum.examId, 'm1');
  const entry = t.doc.exams['exam-' + NOW];
  assert.strictEqual(entry.examId, 'm1');
  assert.strictEqual(entry.totalPoints, 60);
  assert.deepStrictEqual(entry.parts, sum.parts);
});

test('legacy exam entry keeps its old shape', async () => {
  const t = await setup({ exam: examCfg() });
  const s = t.engine.start('exam');
  s.finish();
  assert.deepStrictEqual(t.doc.exams['exam-' + NOW], { date: '2025-10-09', raw: 0, total: 6, fraction: 0, pass: false, mode: 'exam' });
});

function wakeNav(log, fail) {
  return {
    wakeLock: {
      request(kind) {
        log.push('request:' + kind);
        if (fail) return Promise.reject(new Error('denied'));
        return Promise.resolve({ release() { log.push('release'); return Promise.resolve(); } });
      }
    }
  };
}

test('wake lock requested for a timed exam and released on finish', async () => {
  const log = [];
  const t = await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: wakeNav(log) });
  const s = t.engine.start('exam');
  await tick();
  assert.deepStrictEqual(log, ['request:screen']);
  s.finish();
  assert.deepStrictEqual(log, ['request:screen', 'release']);
  s.release();
  assert.strictEqual(log.length, 2);
});

test('wake lock released on leave, also when granted after release', async () => {
  const log = [];
  const t = await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: wakeNav(log) });
  const s = t.engine.start('exam');
  s.release();
  await tick();
  assert.deepStrictEqual(log, ['request:screen', 'release']);
});

test('wake lock absent, rejecting or throwing never throws; untimed and training do not request', async () => {
  const none = await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: null });
  none.engine.start('exam').finish();
  const empty = await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: {} });
  empty.engine.start('exam').finish();
  const rej = await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: wakeNav([], true) });
  const s = rej.engine.start('exam');
  await tick();
  s.finish();
  const thrower = { wakeLock: { request() { throw new Error('boom'); } } };
  (await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: thrower })).engine.start('exam').finish();
  const log = [];
  (await setup({ exam: examCfg() }, { navigator: wakeNav(log) })).engine.start('exam').finish();
  (await setup({ exam: examCfg({ minutes: 5 }) }, { navigator: wakeNav(log) })).engine.start('exam', { training: true }).finish();
  assert.deepStrictEqual(log, []);
});

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb.DojoApp;
}

function texts(n, out) {
  out = out || [];
  if (Array.isArray(n)) n.forEach((c) => texts(c, out));
  else if (n && typeof n === 'object' && n.props) texts(n.props.children, out);
  else if (n !== null && n !== undefined && n !== false) out.push(String(n));
  return out;
}
function byId(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = byId(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id) return n;
  return byId(n.props.children, id);
}
const tr = (k, v) => k + (v ? JSON.stringify(v) : '');

test('Results renders parts, total points, pass points and note; legacy summary still renders', () => {
  const App = loadApp();
  const base = { mode: 'exam', raw: 3, total: 6, fraction: 0.5, pass: true, durationMs: 1000, review: [], short: [] };
  const rich = App._Results({ t: tr, byId: {}, go() {}, onAgain() {}, summary: Object.assign({}, base, {
    parts: [{ title: 'Part A', raw: 3, total: 3, points: 60, pass: true }, { title: 'Part B', raw: 0, total: 3, points: 0, pass: false }],
    totalPoints: 60, passPoints: 50, note: 'estimate' }) });
  const all = texts(rich).join('');
  assert.ok(byId(rich, 'part-1') && byId(rich, 'exam-parts'));
  assert.ok(all.includes('Part A') && all.includes('3 / 3') && all.includes('results.points{"n":60}'));
  assert.ok(all.includes('results.total_points{"n":60}') && all.includes('results.pass_points{"n":50}'));
  assert.ok(all.includes('estimate'));
  const old = App._Results({ t: tr, byId: {}, go() {}, onAgain() {}, summary: base });
  assert.ok(byId(old, 'exam-verdict'));
  assert.strictEqual(byId(old, 'exam-parts'), null);
  assert.strictEqual(byId(old, 'exam-note'), null);
});

test('Home: single exam starts directly, several show a picker', () => {
  const App = loadApp();
  const course = { title: 'C', units: [] };
  const home = { counts: { due: 0, newToday: 0, active: 0, byUnit: {} }, streak: 0, weak: false };
  const started = [];
  const render = (exams) => App._Home({ t: tr, course, home, exams, status: 'ok', notice: null, go() {}, onStart: (m, o) => started.push([m, o]) });
  const single = render([{ id: 'default', sections: ['A'], minutes: 5, timed: true }]);
  byId(single, 'btn-exam').props.onClick();
  byId(single, 'btn-training-default').props.onClick();
  const multi = render([{ id: 'm1', title: 'One', sections: ['A'], timed: false }, { id: 'm2', title: 'Two', note: 'n2', sections: ['A', 'B'], minutes: 30, timed: true }]);
  assert.ok(texts(multi).join('|').includes('Two') && texts(multi).includes('n2'));
  byId(multi, 'btn-exam-m2').props.onClick();
  assert.strictEqual(byId(multi, 'btn-training-m1'), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(started)), [['exam', {}], ['exam', { examId: 'default', training: true }], ['exam', { examId: 'm2' }]]);
  assert.strictEqual(byId(render([]), 'exam-box'), null);
});
