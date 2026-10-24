'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { setup, NOW } = require('./fixtures.js');
const { loadBundle, bundleScripts } = require('./load-bundle.js');
const QT = require('../ui/question-timer.js');

function content(course, units) {
  const us = units || [{ id: 'u1', title: 'U1' }];
  const items = [];
  us.forEach((u) => {
    for (let i = 1; i <= 5; i++) items.push({ id: u.id + '-' + i, unit: u.id, type: 'gap', prompt: 'Q' + i, answers: ['a' + i], explanation: 'e' });
  });
  return { v: 1, version: 't', lock: items.map((i) => i.id), items, course: Object.assign({ id: 'c', title: 'C', units: us }, course || {}) };
}
const T = { baseMs: 8000, adaptive: true, replays: 1 };

async function run(course, units, doc) {
  const env = await setup({ content: content(course, units), doc });
  const s = env.engine.start('daily', {});
  return Object.assign(env, { s });
}
function answerRight(env) {
  const cur = env.s.current();
  return env.s.answer({ text: 'a' + cur.item.id.split('-')[1] });
}
function startTimed(env) {
  const cur = env.s.current();
  return { cur, limit: env.s.timerStart(cur.item) };
}

test('limit precedence: setting > unit timer > course timer > 8000', async () => {
  let env = await run({ timer: { baseMs: 5000, adaptive: true, replays: 1 } }, [{ id: 'u1', title: 'U', timer: { baseMs: 3000, adaptive: true, replays: 1 } }]);
  assert.strictEqual(startTimed(env).limit, 3000);
  env = await run({ timer: { baseMs: 5000, adaptive: true, replays: 1 } });
  assert.strictEqual(startTimed(env).limit, 5000);
  env = await run({ timer: T });
  assert.strictEqual(startTimed(env).limit, 8000);
  env.doc.settings['timer:baseMs'] = 12000;
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 12000);
  env.doc.settings['timer:baseMs'] = 999999;
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 30000);
  env.doc.settings['timer:baseMs'] = 5;
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 2000);
});

test('no timer field: no limit and no settings written', async () => {
  const env = await run({});
  assert.strictEqual(startTimed(env).limit, null);
  answerRight(env);
  assert.strictEqual(env.doc.settings['timer:scale'], undefined);
});

test('wrong answer raises the scale, 3 fast correct lower it', async () => {
  const env = await run({ timer: T });
  startTimed(env);
  env.s.answer({ text: 'zzz' });
  assert.strictEqual(env.doc.settings['timer:scale'], 1.2);
  assert.strictEqual(env.doc.settings['timer:streak'], 0);
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 9600);
  for (let i = 0; i < 3; i++) {
    env.s.next();
    startTimed(env);
    env.clock.t += 100;
    answerRight(env);
  }
  assert.strictEqual(env.doc.settings['timer:scale'], 1.08);
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 8640);
});

test('slow correct answer keeps the scale and resets the streak', async () => {
  const env = await run({ timer: T });
  startTimed(env);
  env.clock.t += 100;
  answerRight(env);
  assert.strictEqual(env.doc.settings['timer:streak'], 1);
  env.s.next();
  startTimed(env);
  env.clock.t += 7000;
  answerRight(env);
  assert.strictEqual(env.doc.settings['timer:streak'], 0);
  assert.strictEqual(env.doc.settings['timer:scale'], 1);
});

test('timeout grades wrong with timedOut and raises the scale', async () => {
  const env = await run({ timer: T });
  startTimed(env);
  env.clock.t += 9000;
  const r = env.s.answerTimed({ text: '' });
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.timedOut, true);
  assert.strictEqual(env.doc.settings['timer:scale'], 1.2);
});

test('expiry with the correct field contents counts as correct, not timed out', async () => {
  const env = await run({ timer: T });
  startTimed(env);
  env.clock.t += 9000;
  const r = env.s.answerTimed({ text: 'a' + env.s.current().item.id.split('-')[1] });
  assert.strictEqual(r.correct, true);
  assert.ok(!r.timedOut);
});

test('a late answer after expiry is ignored', async () => {
  const env = await run({ timer: T });
  startTimed(env);
  env.clock.t += 8001;
  assert.deepStrictEqual(answerRight(env), { error: 'timed_out' });
  assert.strictEqual(env.doc.items[env.s.current().item.id], undefined);
  assert.strictEqual(env.s.answerTimed({ text: '' }).timedOut, true);
});

test('adaptive:false never writes the scale and uses it as 1', async () => {
  const env = await run({ timer: { baseMs: 8000, adaptive: false, replays: 1 } });
  startTimed(env);
  env.s.answer({ text: 'zzz' });
  assert.strictEqual(env.doc.settings['timer:scale'], undefined);
  assert.strictEqual(env.doc.settings['timer:streak'], undefined);
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 8000);
});

test('exams and placement carry no timer', async () => {
  const c = content({ timer: T, exam: { questions: 3, minutes: 5 } });
  const env = await setup({ content: c });
  const ex = env.engine.start('exam', {});
  if (!ex.error) assert.strictEqual(ex.timerStart, undefined);
  const pl = content({ timer: T, placement: { perUnit: 2 } });
  const env2 = await setup({ content: pl });
  const p = env2.engine.start('placement', {});
  if (!p.error) assert.strictEqual(p.timerStart, undefined);
});

test('controller: clock waits for playback, replay does not restart it, expiry fires once', () => {
  let t = 1000;
  let ready = false;
  const ev = [];
  const c = QT.controller({ now: () => t, limitMs: 5000, canStart: () => ready, onStart: () => ev.push('start'), onExpire: () => ev.push('expire') });
  t += 10000;
  c.poll();
  assert.deepStrictEqual(ev, []);
  ready = true;
  c.poll();
  assert.deepStrictEqual(ev, ['start']);
  ready = false;
  t += 4999;
  assert.ok(c.poll().running);
  t += 1;
  c.poll();
  c.poll();
  assert.deepStrictEqual(ev, ['start', 'expire']);
});

test('controller: stop prevents expiry', () => {
  let t = 0;
  let n = 0;
  const c = QT.controller({ now: () => t, limitMs: 100, canStart: () => true, onStart() {}, onExpire: () => n++ });
  c.poll();
  c.stop();
  t += 500;
  c.poll();
  assert.strictEqual(n, 0);
});

test('settings row is hidden for courses without timer and shown with one', () => {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/settings-timer.js'] });
  const r = sb.DojoSettingsTimer.create().renderTimerSettings;
  const set = [];
  const self = { setSetting: (k, v) => set.push([k, v]) };
  const mk = (course) => ({ course, store: { doc: { settings: {} } }, t: (k) => k });
  assert.strictEqual(r(mk({ units: [{ id: 'a' }] }), self), null);
  assert.ok(r(mk({ timer: T }), self));
  assert.ok(r(mk({ units: [{ id: 'a', timer: T }] }), self));
});

const OTHER_TYPES = [
  { type: 'choice', options: ['a', 'b', 'c'], answer: 0 },
  { type: 'card', back: 'x', answers: ['x'] },
  { type: 'multi', options: ['2', '4', '5'], correct: [0, 2] },
  { type: 'order', steps: ['one', 'two', 'three'] },
  { type: 'match', pairs: [{ left: 'FR', right: 'Paris' }, { left: 'IT', right: 'Rome' }, { left: 'ES', right: 'Madrid' }], distractors: ['Oslo'] }
];
for (const def of OTHER_TYPES) {
  test('expiry grades a ' + def.type + ' item wrong with timedOut', async () => {
    const c = content({ timer: T });
    c.items = [Object.assign({ id: 'u1-1', unit: 'u1', prompt: 'P', explanation: 'e' }, def)];
    c.lock = ['u1-1'];
    const env = await setup({ content: c });
    const s = env.engine.start('daily', {});
    s.timerStart(s.current().item);
    env.clock.t += 9000;
    assert.deepStrictEqual(s.answer({ index: 0 }), { error: 'timed_out' });
    const r = s.answerTimed({});
    assert.strictEqual(r.error, undefined);
    assert.strictEqual(r.correct, false);
    assert.strictEqual(r.timedOut, true);
    assert.strictEqual(env.doc.settings['timer:scale'], 1.2);
  });
}

test('adaptive:false ignores a stored scale in the limit', async () => {
  const env = await run({ timer: { baseMs: 8000, adaptive: false, replays: 1 } });
  env.doc.settings['timer:scale'] = 2;
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 8000);
});

test('stored scale applies to the limit when adaptive', async () => {
  const env = await run({ timer: T });
  env.doc.settings['timer:scale'] = 2;
  assert.strictEqual(env.s.timerLimit(env.s.current().item), 16000);
});

test('session screen: clock waits for the stimulus playback only when audio can play', () => {
  const sb = { console };
  const only = bundleScripts().filter((f) => /^(vendor\/p|vendor\/h|ext|types\/(registry|gap)|ui\/)/.test(f));
  loadBundle(sb, { only });
  const item = { id: 'i1', unit: 'u', type: 'gap' };
  const mk = (stimulus, audio) => {
    const scr = new sb.DojoApp._SessionScreen({ session: { mode: 'daily', timerLimit: () => 5000, timerStart() {}, current: () => null }, now: () => 0, win: {} });
    scr.played = {};
    const s = { cur: { item, stimulus, position: 1 }, result: null };
    return { scr, vnode: scr.renderQTimer({ session: scr.props.session, now: () => 0 }, s, audio) };
  };
  const st = { id: 's1', audio: ['c1'] };
  let m = mk(st, { status: 'ok' });
  assert.strictEqual(m.vnode.props.canStart(), false);
  m.scr.played['s:s1'] = true;
  assert.strictEqual(m.vnode.props.canStart(), true);
  assert.strictEqual(mk(st, { status: 'unavailable' }).vnode.props.canStart(), true);
  assert.strictEqual(mk(null, { status: 'ok' }).vnode.props.canStart(), true);
});

test('session screen: no timer after the answer, timer while the question is open', () => {
  const sb = { console };
  const only = bundleScripts().filter((f) => /^(vendor\/p|vendor\/h|ext|types\/(registry|gap)|ui\/)/.test(f));
  loadBundle(sb, { only });
  const item = { id: 'i1', unit: 'u', type: 'gap' };
  const scr = new sb.DojoApp._SessionScreen({ session: { mode: 'daily', timerLimit: () => 5000, timerStart() {}, current: () => null }, now: () => 0, win: {} });
  scr.played = {};
  const open = { cur: { item, stimulus: null, position: 1 }, result: null };
  const done = { cur: { item, stimulus: null, position: 1 }, result: { correct: true } };
  assert.ok(scr.renderQTimer({ session: scr.props.session, now: () => 0 }, open, null));
  assert.strictEqual(scr.renderQTimer({ session: scr.props.session, now: () => 0 }, done, null), null);
});

test('same base time for items of different complexity within a unit', async () => {
  const env = await run({ timer: T });
  const items = [
    { id: 'u1-1', unit: 'u1', type: 'gap', prompt: 'x', answers: ['1'] },
    { id: 'u1-2', unit: 'u1', type: 'gap', prompt: 'a much longer prompt with 123456 digits and more words', answers: ['a', 'b', 'c', 'd'] },
  ];
  const limits = items.map((it) => env.s.timerLimit(it));
  assert.strictEqual(limits[0], 8000);
  assert.strictEqual(limits[1], limits[0]);
});
