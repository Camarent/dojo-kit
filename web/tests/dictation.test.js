'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const H = require('./app-harness.js');
const loadApp = H.loadApp;
const { loadBundle } = require('./load-bundle.js');
const Dictation = require('../ui/dictation.js');

const ROOT = path.join(__dirname, '..', '..');
const LISTEN = { id: 's1', text: 'x', hideText: true, audio: ['c1', 'c2'] };
const T1 = { baseMs: 8000, adaptive: true, replays: 1 };

function fakeAudio() {
  const a = { plays: [], ok: true, ready: () => true, pick: (sid, ids) => ids[0], stop() {} };
  a.play = (id) => { a.plays.push(id); return a.ok ? Promise.resolve({ ms: 1 }) : Promise.reject(new Error('x')); };
  return a;
}
function gestureWin(active) {
  return { navigator: { userActivation: { hasBeenActive: active } }, addEventListener() {}, removeEventListener() {} };
}
const tick = () => new Promise((r) => setImmediate(r));

test('numeric input uses inputmode numeric for a listening stimulus, decimal otherwise', () => {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/numeric.js'] });
  const def = sb.DojoTypes.get('numeric');
  assert.strictEqual(def.inputMode(LISTEN), 'numeric');
  assert.strictEqual(def.inputMode(null), 'decimal');
  assert.strictEqual(def.inputMode({ id: 's', text: 'x', audio: ['c1'] }), 'decimal');
  assert.strictEqual(def.inputMode({ id: 's', hideText: true }), 'decimal');
  const props = (stimulus) => ({ t: (k) => k, result: null, state: { text: '' }, view: {}, setState() {}, onSubmit() {}, stimulus });
  const find = (n, f) => { if (!n || typeof n !== 'object') return null; if (n.props && n.props['data-testid'] === 'numeric-input') return n; const c = n.props && n.props.children; for (const x of [].concat(c || [])) { const r = find(x, f); if (r) return r; } return null; };
  assert.strictEqual(find(def.Question(props(LISTEN))).props.inputmode, 'numeric');
  assert.strictEqual(find(def.Question(props(undefined))).props.inputmode, 'decimal');
});

test('opens with one autoplay after a gesture, none without it or for non-listening stimuli', () => {
  let a = fakeAudio();
  Dictation.create({ win: gestureWin(true), audio: a }).open({ stimulus: LISTEN, timer: T1 });
  assert.deepStrictEqual(a.plays, ['c1']);
  a = fakeAudio();
  Dictation.create({ win: gestureWin(false), audio: a }).open({ stimulus: LISTEN, timer: T1 });
  assert.deepStrictEqual(a.plays, []);
  a = fakeAudio();
  Dictation.create({ win: gestureWin(true), audio: a }).open({ stimulus: { id: 's', text: 'x', audio: ['c1'] }, timer: T1 });
  assert.deepStrictEqual(a.plays, []);
});

test('key r replays at most timer.replays times per question', () => {
  const a = fakeAudio();
  const ctl = Dictation.create({ win: gestureWin(true), audio: a });
  ctl.open({ stimulus: LISTEN, timer: T1 });
  const key = { key: 'r', preventDefault() {} };
  assert.strictEqual(ctl.onKey(key), true);
  assert.strictEqual(a.plays.length, 2);
  ctl.onKey(key);
  ctl.onKey(key);
  assert.strictEqual(a.plays.length, 2, 'replay limit reached');
  ctl.open({ stimulus: LISTEN, timer: T1 });
  assert.strictEqual(a.plays.length, 3, 'a new question resets the budget');
  assert.strictEqual(ctl.onKey({ key: 'r', ctrlKey: true }), false);
  assert.strictEqual(Dictation.replayBudget({ replays: 0 }), 0);
  const zero = Dictation.create({ win: gestureWin(true), audio: fakeAudio() });
  zero.open({ stimulus: LISTEN, timer: { replays: 0 } });
  assert.strictEqual(zero.replay(), false);
});

test('playback end marks the stimulus played and focuses the input', async () => {
  const a = fakeAudio();
  let focused = 0;
  const screen = { props: { win: gestureWin(true), course: { units: [{ id: 'u1', timer: T1 }] } }, state: { cur: { item: { unit: 'u1' }, stimulus: LISTEN } }, input: { focus() { focused++; } } };
  Dictation.sync(screen, a);
  await tick();
  assert.deepStrictEqual(a.plays, ['c1']);
  assert.strictEqual(focused, 1);
  assert.strictEqual(screen.played['s:s1'], true);
  Dictation.sync(screen, a);
  assert.strictEqual(a.plays.length, 1, 'same question: no second autoplay');
  assert.strictEqual(screen.dict.replay(), true);
  assert.strictEqual(screen.dict.replay(), false);
});

test('a failed playback does not mark the stimulus played', async () => {
  const a = fakeAudio();
  a.ok = false;
  const screen = { props: { win: gestureWin(true), course: { units: [{ id: 'u1' }] } }, state: { cur: { item: { unit: 'u1' }, stimulus: LISTEN } }, input: { focus() {} } };
  Dictation.sync(screen, a);
  await tick();
  assert.strictEqual(screen.played && screen.played['s:s1'], undefined);
});

test('after a timeout the feedback shows the timed-out notice and the plugin hook gets expected', async () => {
  const items = [{ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87, stimulus: 's1' }];
  const m = await H.mount({ items, stimuli: [LISTEN], course: { units: [{ id: 'u1', title: 'U1' }], timer: T1 } });
  let seen = null;
  m.sb.DojoExt.registerDetail((item, ctx) => { seen = { timedOut: ctx.timedOut, expected: ctx.expected }; return ctx.h('span', null, 'x'); });
  m.app.startMode('practice', { types: ['numeric'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  ss.state.qstate = { text: '12' };
  ss.timeout();
  const v = ss.view();
  assert.strictEqual(H.find(v, 'timed-out'), null);
  assert.strictEqual(H.text(H.find(v, 'verdict')), 'Time is up');
  assert.ok(H.find(v, 'expected'), 'correct answer shown');
  assert.strictEqual(seen.timedOut, true);
  assert.strictEqual(String(seen.expected), '87');
});

test('a plain wrong answer has no timed-out notice', async () => {
  const items = [{ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87 }];
  const m = await H.mount({ items, course: { units: [{ id: 'u1', title: 'U1' }] } });
  m.app.startMode('practice', { types: ['numeric'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  ss.answer({ text: '12' }, '12');
  const v = ss.view();
  assert.ok(H.find(v, 'feedback'));
  assert.strictEqual(H.find(v, 'timed-out'), null);
});

test('examples/listening validates and builds', () => {
  const dojo = path.join(ROOT, 'dojo');
  const course = path.join(ROOT, 'examples', 'listening');
  const v = spawnSync(dojo, ['validate', course], { encoding: 'utf8' });
  assert.strictEqual(v.status, 0, v.stdout + v.stderr);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'listening-'));
  try {
    const b = spawnSync(dojo, ['build', course, '--out', out], { encoding: 'utf8' });
    assert.strictEqual(b.status, 0, b.stdout + b.stderr);
    assert.ok(fs.existsSync(path.join(out, 'listening', 'data', 'audio', 'manifest.json')));
    assert.ok(fs.statSync(path.join(course, 'audio', 'pack-00.mp3')).size < 100 * 1024);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('a key press counts as the first gesture and no keydown listener is added', () => {
  const added = [];
  const win = { navigator: { userActivation: { hasBeenActive: false } }, addEventListener: (n) => added.push(n), removeEventListener() {} };
  const a = fakeAudio();
  const ctl = Dictation.create({ win, audio: a });
  assert.ok(!added.includes('keydown'));
  ctl.onKey({ key: 'x' });
  ctl.open({ stimulus: LISTEN, timer: T1 });
  assert.deepStrictEqual(a.plays, ['c1']);
});

test('a timeout with an empty field shows no invalid-number error', async () => {
  const items = [{ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87, stimulus: 's1' }];
  const m = await H.mount({ items, stimuli: [LISTEN], course: { units: [{ id: 'u1', title: 'U1' }], timer: T1 } });
  m.app.startMode('practice', { types: ['numeric'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  ss.state.qstate = { text: '' };
  ss.timeout();
  const v = ss.view();
  assert.ok(H.find(v, 'verdict'));
  assert.strictEqual(H.find(v, 'numeric-invalid'), null);
});

test('the play button shares the replay budget with key r', async () => {
  const a = fakeAudio();
  const d = Dictation.create({ win: gestureWin(true), audio: a });
  d.open({ stimulus: LISTEN, timer: T1 });
  assert.strictEqual(d.exhausted(), false);
  assert.strictEqual(d.take(), true);
  assert.strictEqual(d.exhausted(), true);
  assert.strictEqual(d.take(), false);
  assert.strictEqual(d.replay(), false);
  const u = Dictation.create({ win: gestureWin(true), audio: a });
  u.open({ stimulus: LISTEN, timer: null });
  assert.strictEqual(u.take(), true);
  assert.strictEqual(u.take(), true);
  assert.strictEqual(u.exhausted(), false);
});

test('examples/listening explanations are grammatical for 1', () => {
  const t = fs.readFileSync(path.join(ROOT, 'examples', 'listening', 'content', 'beeps.jsonl'), 'utf8');
  assert.ok(!/\b1 beeps/.test(t));
});

test('the first play is free: replays 0 still allows one play, button enabled before it', () => {
  const a = fakeAudio();
  const d = Dictation.create({ win: gestureWin(false), audio: a });
  d.open({ stimulus: LISTEN, timer: { replays: 0 } });
  assert.strictEqual(d.exhausted(), false, 'enabled before the first play');
  assert.strictEqual(d.take(), true, 'first manual play');
  assert.strictEqual(d.exhausted(), true);
  assert.strictEqual(d.take(), false);
  const b = Dictation.create({ win: gestureWin(true), audio: fakeAudio() });
  b.open({ stimulus: LISTEN, timer: T1 });
  assert.strictEqual(b.take(), true, 'autoplay was the first play; one replay left');
  assert.strictEqual(b.take(), false);
});

test('PlayButton click asks the dictation controller before playing', () => {
  const C = loadApp().DojoCommon;
  let takes = 0;
  const audio = { t: (k) => k, played: {}, win: {}, cfg: {}, onFail() { fails++; } };
  let fails = 0;
  const btn = new C.PlayButton({ lines: ['x'], pid: 'p', audio, testid: 'p', dict: { take() { takes++; return false; }, exhausted: () => false } });
  btn.setState = function (s) { this.state = Object.assign({}, this.state, s); };
  btn.click();
  assert.strictEqual(takes, 1);
  assert.strictEqual(btn.state.playing, false);
  assert.strictEqual(fails, 0, 'refused play does not reach speech');
});

test('the session screen passes its controller to the stimulus play button', async () => {
  const items = [{ id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 3, stimulus: 's1' }];
  const stimuli = [{ id: 's1', text: 'x', hideText: true, audio: ['c1'] }];
  const m = await H.mount({ items, stimuli, course: { units: [{ id: 'u1', title: 'U1' }] } });
  m.sb.DojoAudio = { ready: () => true, unlock() {}, stop() {}, pick: (s, ids) => ids[0], play: () => Promise.resolve({}) };
  m.app.startMode('practice', { types: ['numeric'] });
  const ss = m.screen(m.sb.DojoApp._SessionScreen);
  ss.audioProps = () => ({ status: 'ok', t: (k) => k, played: {}, win: {}, cfg: {}, exam: false, onFail() {} });
  ss.dict = { take: () => true, exhausted: () => false, stop() {}, onKey: () => false };
  let btn = null;
  H.walk(ss.view(), (n) => { if (n.props.pid === 's:s1') btn = n; });
  assert.ok(btn, 'play button rendered');
  assert.strictEqual(btn.props.dict, ss.dict);
});
