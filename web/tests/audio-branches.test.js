'use strict';
const test = require('node:test');
const assert = require('node:assert');

function fresh() {
  const p = require.resolve('../audio.js');
  delete require.cache[p];
  return require(p);
}

test('before configure: not ready, null meta/duration, idle status, no-op stop/unlock/preload', async () => {
  const A = fresh();
  assert.strictEqual(A.ready(), false);
  assert.strictEqual(A.clipMeta('x'), null);
  assert.strictEqual(A.duration('x'), null);
  assert.strictEqual(A.status().manifest, 'idle');
  assert.strictEqual(A.status().packs, 'none');
  assert.strictEqual(A.status().ctx, 'none');
  A.stop();
  A.unlock();
  await A.preload();
});

test('configure: base normalisation, manifest meta and duration', () => {
  const A = fresh();
  A.configure({ base: 'x', manifest: { clips: { a: { text: 't', tr: 'r', mt: 1, ms: 500 }, b: { ms: 0 } }, packs: [] } });
  assert.ok(A.ready());
  assert.deepStrictEqual(A.clipMeta('a'), { text: 't', tr: 'r', mt: true, supersedes: [] });
  assert.strictEqual(A.clipMeta('zz'), null);
  assert.strictEqual(A.duration('a'), 500);
  assert.strictEqual(A.duration('b'), null);
  assert.strictEqual(A.duration('zz'), null);
  assert.strictEqual(A.status().step, 'idle');
  A.stop();
  A.configure({});
  assert.strictEqual(A.duration('a'), null);
});

test('pick: avoids last id, prefers never/oldest heard, single id', () => {
  const A = fresh();
  A.configure({});
  const heard = {};
  const sets = [];
  A.bindHeard({ get: (id) => heard[id], set: (id) => sets.push(id) });
  assert.strictEqual(A.pick('s', ['a'], () => 0), 'a');
  assert.strictEqual(A.pick('s', ['a'], () => 0.99), 'a');
  const first = A.pick('t', ['a', 'b'], () => 0);
  const second = A.pick('t', ['a', 'b'], () => 0);
  assert.notStrictEqual(first, second);
  heard.a = 5; heard.b = 1; heard.c = 1;
  A.pick('u', ['a', 'b', 'c'], () => 0.9);
  const x = A.pick('v', ['a', 'b', 'c'], () => 0.9);
  assert.ok(x === 'b' || x === 'c');
  A.bindHeard(null);
  assert.ok(A.pick('w', ['a', 'b'], () => 0.5));
  assert.strictEqual(A.heardClip('s'), null);
});

test('unlock: suspended context resumes, Audio element primed, throwing nav ignored', () => {
  const A = fresh();
  const calls = [];
  class Ctx {
    constructor() { this.state = 'suspended'; this.destination = {}; }
    resume() { calls.push('resume'); }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() { calls.push('start'); } }; }
  }
  class Aud { play() { calls.push('aud'); return Promise.resolve(); } pause() { calls.push('pause'); } }
  const win = { AudioContext: Ctx, Audio: Aud, get navigator() { throw new Error('nav'); } };
  A.configure({ win, manifest: { clips: {}, packs: [] } });
  A.unlock();
  assert.ok(calls.includes('aud'));
  A.unlock();
  const win2 = { navigator: { audioSession: {} }, Audio: class { play() { return undefined; } } };
  A.configure({ win: win2, manifest: { clips: {}, packs: [] } });
  A.unlock();
  assert.strictEqual(win2.navigator.audioSession.type, 'playback');
});
