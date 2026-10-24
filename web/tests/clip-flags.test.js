'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const DojoStorage = require('../storage.js');
const ClipFlags = require('../session/clip-flags.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
let dojoP;
function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}
function mockLocal() {
  const data = {};
  return { getItem: (k) => data[k], setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; }, clear: () => {} };
}
const STIMS = [
  { id: 's1', text: 'T', hideText: true, audio: ['a-1', 'a-2'] },
  { id: 's2', text: 'T', hideText: true, audio: ['b-1'], speak: { lines: [{ text: 'hello' }] } },
  { id: 's3', text: 'T', hideText: true, audio: ['c-1'] }
];
function content() {
  return {
    v: 1, version: 't', lock: ['q1'],
    items: [{ id: 'q1', unit: 'u', type: 'gap', prompt: 'P', answers: ['x'], tags: ['x'], stimulus: 's1' }],
    stimuli: STIMS,
    course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }
  };
}
function device(dojo, clock) {
  const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => clock.t, localStorage: mockLocal(), claude: null });
  const engine = DojoSession.createEngine({ dojo, store, content: content(), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { store, engine };
}
function fake(settings) {
  const store = { doc: { settings: settings || {} }, update(fn) { const d = JSON.parse(JSON.stringify(store.doc)); fn(d); store.doc = d; } };
  return { store, flags: ClipFlags.create({ store, now: () => NOW }) };
}

test('set and unset: true, null tombstone, ts written', () => {
  const { store, flags } = fake();
  assert.deepStrictEqual(flags.setFlag('a-1', true), {});
  assert.strictEqual(store.doc.settings['clipFlag:a-1'], true);
  assert.strictEqual(store.doc.settings.ts['clipFlag:a-1'], NOW);
  assert.deepStrictEqual(flags.flagged(), ['a-1']);
  assert.ok(flags.isFlagged('a-1'));
  flags.setFlag('a-1', true);
  flags.setFlag('a-0', true);
  assert.deepStrictEqual(flags.flagged(), ['a-0', 'a-1']);
  flags.setFlag('a-1', false);
  assert.strictEqual(store.doc.settings['clipFlag:a-1'], null);
  assert.ok(!flags.isFlagged('a-1'));
  assert.ok(!flags.isFlagged(5));
  assert.deepStrictEqual(flags.flagged(), ['a-0']);
  const before = store.doc;
  flags.setFlag('never', false);
  assert.strictEqual(store.doc, before);
});

test('invalid id returns error and writes nothing', () => {
  const { store, flags } = fake();
  const before = store.doc;
  for (const bad of ['', 'A', '-a', 'a b', 'x'.repeat(65), null, 7]) assert.deepStrictEqual(flags.setFlag(bad, true), { error: 'invalid_clip_id' });
  assert.strictEqual(store.doc, before);
});

test('filterStimulus: partial, all flagged with speak, without speak, unflagged same object', () => {
  const { flags } = fake();
  assert.strictEqual(flags.filterStimulus(null), null);
  assert.strictEqual(flags.filterStimulus({ id: 'x' }).id, 'x');
  assert.strictEqual(flags.filterStimulus(STIMS[0]), STIMS[0]);
  flags.setFlag('a-1', true);
  const p = flags.filterStimulus(STIMS[0]);
  assert.notStrictEqual(p, STIMS[0]);
  assert.deepStrictEqual(p.audio, ['a-2']);
  assert.strictEqual(p.hideText, true);
  assert.deepStrictEqual(STIMS[0].audio, ['a-1', 'a-2']);
  flags.setFlag('b-1', true);
  const sp = flags.filterStimulus(STIMS[1]);
  assert.deepStrictEqual(sp.audio, []);
  assert.strictEqual(sp.hideText, true);
  flags.setFlag('c-1', true);
  const ns = flags.filterStimulus(STIMS[2]);
  assert.deepStrictEqual(ns.audio, []);
  assert.strictEqual(ns.hideText, undefined);
  assert.strictEqual(STIMS[2].hideText, true);
});

test('engine exposes flag API and stimulusOf filters', async () => {
  const dojo = await loadDojo();
  const d = device(dojo, { t: NOW });
  assert.deepStrictEqual(d.engine.flagClip('Bad', true), { error: 'invalid_clip_id' });
  d.engine.flagClip('a-1', true);
  assert.ok(d.engine.isClipFlagged('a-1'));
  assert.deepStrictEqual(d.engine.flaggedClips(), ['a-1']);
});

test('merge via real WASM: flag kept, newer un-flag wins, reset doc keeps flags', async () => {
  const dojo = await loadDojo();
  const ca = { t: NOW };
  const cb = { t: NOW };
  const A = device(dojo, ca);
  const B = device(dojo, cb);
  A.engine.flagClip('a-1', true);
  B.store.importText(A.store.exportText());
  assert.strictEqual(B.store.doc.settings['clipFlag:a-1'], true);
  cb.t = NOW + 100;
  B.engine.flagClip('a-1', false);
  A.store.importText(B.store.exportText());
  assert.ok(!A.engine.isClipFlagged('a-1'));
  assert.strictEqual(A.store.doc.settings['clipFlag:a-1'], null);
  ca.t = NOW + 200;
  A.engine.flagClip('a-2', true);
  await A.store.reset();
  assert.ok(A.engine.isClipFlagged('a-2'));
  const san = dojo.call('sanitize', A.store.doc);
  assert.strictEqual(san.settings['clipFlag:a-2'], true);
  assert.strictEqual(san.settings['clipFlag:a-1'], null);
});
