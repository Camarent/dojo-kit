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

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const MIN = 60000;

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  ['registry', 'card', 'choice', 'cloze', 'gap', 'match', 'multi', 'numeric', 'order'].map((n) => 'types/' + n + '.js').concat(['ui/common.js']).concat(['ui/detail.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']).forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  return sb;
}
function walk(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = walk(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id) return n;
  return walk(n.props.children, id);
}
function allText(n) {
  if (Array.isArray(n)) return n.map(allText).join('');
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n !== 'object') return String(n);
  return n.props ? allText(n.props.children) : '';
}
const tr = (k, v) => k + (v ? JSON.stringify(v) : '');

const ITEMS = [
  { id: 'a1', unit: 'u', type: 'gap', prompt: 'A1', answers: ['x'], tags: ['a'] },
  { id: 'a2', unit: 'u', type: 'gap', prompt: 'A2', answers: ['x'], tags: ['a'] },
  { id: 'b1', unit: 'u', type: 'gap', prompt: 'B1', answers: ['x'], tags: ['b'] },
  { id: 'b2', unit: 'u', type: 'gap', prompt: 'B2', answers: ['x'], tags: ['b'] },
  { id: 'c1', unit: 'u', type: 'choice', prompt: 'C1', options: ['p', 'q', 'r', 's'], answer: 1 }
];
let dojoP;
async function setup() {
  const sb = loadApp();
  dojoP = dojoP || DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const dojo = await dojoP;
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, status: 'ok', update(fn) { fn(doc); }, flush() {}, noteAnswer() {}, exportText: () => '' };
  const course = {
    id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], placement: { mode: 'self' },
    exams: [{ id: 'timed', passMark: 0.5, sections: [{ title: 'A', count: 2, tags: ['a'] }, { title: 'B', count: 2, tags: ['b'] }],
      timing: [{ sections: ['A'], minutes: 10 }, { sections: ['B'], minutes: 20 }] }]
  };
  const content = { v: 1, version: 't', lock: ITEMS.map((i) => i.id), items: ITEMS, course };
  const clock = { t: NOW };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { sb, App: sb.DojoApp, engine, store, doc, course, clock };
}
function screen(x, session) {
  const props = { t: tr, session, now: () => x.clock.t, win: {}, course: x.course, byId: {}, dojo: null };
  const sc = new x.App._SessionScreen(props);
  sc.setState = function (patch) { this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch); };
  sc.state = Object.assign({}, sc.state, { cur: session.current() });
  return sc;
}
const key = (k, tag) => ({ key: k, target: { tagName: tag || 'BODY' }, preventDefault() { this.prevented = true; } });

test('Enter advances only after an answer and not from a focused button', async () => {
  const x = await setup();
  const s = x.engine.start('practice', { types: ['gap'] });
  const sc = screen(x, s);
  const first = sc.state.cur;
  sc.onKey(key('Enter'));
  assert.strictEqual(sc.state.cur, first, 'no result yet: Enter does nothing');
  sc.answer({ text: 'x' });
  assert.ok(sc.state.result);
  sc.onKey(key('Enter', 'BUTTON'));
  assert.strictEqual(sc.state.cur, first, 'button handles its own Enter');
  const e = key('Enter', 'INPUT');
  sc.onKey(e);
  assert.notStrictEqual(sc.state.cur, first);
  assert.strictEqual(sc.state.result, null);
  assert.ok(e.prevented);
});

test('keys 1-4 pick a choice option, ignored in inputs and after the result', async () => {
  const x = await setup();
  const s = x.engine.start('practice', { types: ['choice'] });
  const sc = screen(x, s);
  sc.onKey(key('2', 'INPUT'));
  assert.strictEqual(sc.state.result, null);
  sc.onKey(key('2'));
  assert.ok(sc.state.result);
  assert.strictEqual(sc.state.picked, sc.state.cur.view.options[1].index);
  const done = sc.state.result;
  sc.onKey(key('3'));
  assert.strictEqual(sc.state.result, done);
});

test('timed exam: timer switches to the next group budget immediately on the first question of the group', async () => {
  const x = await setup();
  const s = x.engine.start('exam', { examId: 'timed' });
  const sc = screen(x, s);
  sc.state.remaining = s.deadline - x.clock.t;
  assert.strictEqual(sc.state.remaining, 10 * MIN);
  sc.answer({ text: 'x' }); sc.next();
  sc.answer({ text: 'x' }); x.clock.t += 2000; sc.next();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.group)), { index: 1, count: 2 });
  assert.strictEqual(sc.state.remaining, 20 * MIN - 0, 'part-2 budget shown without waiting for a tick');
});

test('stale import error is cleared when the textarea is edited', async () => {
  const x = await setup();
  const props = { t: tr, store: x.store, engine: { globalNewPerDay: () => 10, unitSettings: () => ({}), unitConfig: () => ({ dropByType: {} }) },
    content: { items: ITEMS, course: x.course }, course: x.course, now: () => NOW, win: { document: { documentElement: { setAttribute() {}, removeAttribute() {} } } }, status: 'ok', go() {}, onDataChanged() {} };
  const set = new x.App._SettingsScreen(props);
  set.setState = function (patch) { this.state = Object.assign({}, this.state, patch); };
  set.state.importMsg = { kind: 'bad', text: 'ERR' };
  set.state.importText = 'junk';
  const v = () => set.render(set.props, set.state);
  assert.ok(walk(v(), 'import-msg'));
  walk(v(), 'import-text').props.onInput({ target: { value: 'junk2' } });
  assert.strictEqual(walk(v(), 'import-msg'), null);
});

test('Home exam line has no trailing separator without minutes or sections', async () => {
  const x = await setup();
  const home = { counts: { due: 0, newToday: 0, active: 0, byUnit: {} }, streak: 0, weak: false };
  const line = (exam) => allText(walk(x.App._Home({ t: tr, course: { title: 'C', units: [] }, home, exams: [exam], status: 'ok', notice: null, go() {}, onStart() {}, examDaysLeft: null }), 'exam-box'));
  const t1 = line({ id: 'e', title: 'T', sections: [], minutes: 90 });
  assert.ok(t1.includes('home.exam.minutes{"n":90}') && !t1.includes('·'), t1);
  assert.ok(line({ id: 'e', title: 'T', sections: ['S'], minutes: 90 }).includes('home.exam.minutes{"n":90} · S'));
});

test('unit settings help text explains the multiplier and the day preview (en, ru)', () => {
  for (const l of ['en', 'ru']) {
    const d = JSON.parse(read('i18n/' + l + '.json'));
    assert.ok(/×3/.test(d['settings.unitSettings.ladderPace.hint']), l);
    assert.ok(d['settings.unitSettings.ladderPreview'].length > 25, l);
  }
});
