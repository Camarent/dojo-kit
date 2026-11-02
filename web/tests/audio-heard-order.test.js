'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ClipFlags = require('../session/clip-flags.js');

function load() {
  delete require.cache[require.resolve('../audio.js')];
  return require('../audio.js');
}
function mkFlags(settings, clock) {
  const store = { doc: { settings: settings || {} }, update(fn) { fn(this.doc); } };
  return ClipFlags.create({ store, now: () => clock.t });
}
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');
const IDS = ['a-1', 'a-2', 'a-3'];
const noRandom = () => 0;
const MANIFEST = { v: 1, packs: [{ file: 'p0.bin', bytes: 40, enc: 'raw' }], clips: { 'a-1': { pack: 0, off: 4, len: 8, ms: 700, mime: 'audio/wav' }, 'a-2': { pack: 0, off: 4, len: 8, ms: 700, mime: 'audio/wav' } } };
const BYTES = Buffer.from(Uint8Array.from({ length: 40 }, (_, i) => i + 1));
const fetchFn = async (url) => (url.endsWith('manifest.json')
  ? { ok: true, json: async () => MANIFEST }
  : { ok: true, arrayBuffer: async () => BYTES.buffer.slice(BYTES.byteOffset, BYTES.byteOffset + BYTES.length) });
const win = {
  Audio: class { play() { setImmediate(() => this.onended && this.onended()); return Promise.resolve(); } pause() {} },
  Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }
};
function setup(settings) {
  const A = load();
  A.configure({ win, fetch: fetchFn });
  const flags = mkFlags(settings, { t: 1000 });
  A.bindHeard({ get: flags.heardAt, set: flags.markHeard });
  return { A, flags };
}

test('sequence: three questions cover all clips, fourth gets the oldest-heard', () => {
  const { A, flags } = setup();
  const seen = [];
  for (let i = 0; i < 3; i++) { const id = A.pick('s' + i, IDS, noRandom); seen.push(id); flags.markHeard(id); }
  assert.deepStrictEqual(seen.slice().sort(), IDS);
  assert.strictEqual(A.pick('s9', IDS, noRandom), seen[0]);
});

test('flagged clips (filtered out of the pool) are never picked', () => {
  const { A, flags } = setup();
  flags.markHeard('a-1');
  assert.strictEqual(A.pick('f', ['a-1', 'a-3'], noRandom), 'a-3');
});

test('save/load roundtrip through sanitize keeps the heard map; old save without the key works', async () => {
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const settings = {};
  const probe = mkFlags(settings, { t: 7 });
  probe.markHeard('a-2');
  const clean = dojo.call('sanitize', { v: 1, t: 1, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings });
  assert.strictEqual(mkFlags(clean.settings, { t: 1 }).heardAt('a-2'), settings['heard:a-2']);
  const old = dojo.call('sanitize', { v: 1, items: {}, stats: {}, settings: { newPerDay: 10 } });
  const A = load();
  A.configure({ win, fetch: fetchFn });
  const f = mkFlags(old.settings, { t: 1 });
  A.bindHeard({ get: f.heardAt, set: f.markHeard });
  assert.strictEqual(f.heardAt('a-2'), undefined);
  assert.ok(IDS.includes(A.pick('o', IDS, noRandom)));
});

test('playback start records heard once per pick; replay of the same clip does not re-record', async () => {
  const { A, flags } = setup();
  const id = A.pick('q', ['a-1', 'a-2'], noRandom);
  await A.play(id);
  const first = flags.heardAt(id);
  assert.ok(first > 0);
  await A.play(id);
  assert.strictEqual(flags.heardAt(id), first);
});

test('markHeard values strictly increase even within one millisecond', () => {
  const { flags } = setup();
  flags.markHeard('a-1'); flags.markHeard('a-2');
  assert.ok(flags.heardAt('a-2') > flags.heardAt('a-1'));
});
