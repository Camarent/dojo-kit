'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Dictation = require('../ui/dictation.js');

const LISTEN = { id: 's1', text: 'x', hideText: true, audio: ['c1'] };
function mkAudio() {
  const a = { plays: [], stops: 0, unlocks: 0, ready: () => true, pick: (s, ids) => ids[0], stop() { a.stops++; }, unlock() { a.unlocks++; } };
  a.play = (id) => { a.plays.push(id); return Promise.resolve({}); };
  return a;
}
function mkWin() {
  const l = {};
  return { l, navigator: {}, addEventListener(n, f) { l[n] = f; }, removeEventListener(n) { delete l[n]; } };
}

test('gesture event unlocks audio; r replays within budget; other keys do not', () => {
  const a = mkAudio();
  const w = mkWin();
  const d = Dictation.create({ win: w, audio: a, random: () => 0 });
  d.open({ stimulus: LISTEN, timer: { replays: 1 }, onEnd() {} });
  assert.strictEqual(a.plays.length, 0);
  w.l.click();
  assert.strictEqual(a.unlocks, 1);
  assert.ok(d.onKey({ key: 'r', preventDefault() {} }));
  assert.ok(d.onKey({ key: 'r' }));
  assert.strictEqual(a.plays.length, 2);
  assert.ok(!d.onKey({ key: 'r', ctrlKey: true }));
  assert.ok(!d.onKey({ key: 'x' }));
  d.stop();
  assert.strictEqual(a.stops, 1);
  assert.strictEqual(w.l.click, undefined);
  assert.ok(!d.onKey({ key: 'r' }));
});

test('stop without win/audio.stop; open for non-listening stimulus', () => {
  const d = Dictation.create({ audio: { ready: () => true } });
  d.open({ stimulus: { id: 'x' } });
  assert.strictEqual(d.remaining(), null);
  assert.ok(d.take());
  assert.ok(!d.replay());
  d.stop();
  Dictation.create({}).stop();
});
