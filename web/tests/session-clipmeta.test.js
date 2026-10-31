'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

// session.js resolves root as `self` when defined: give it a root we control.
const fakeRoot = {};
globalThis.self = fakeRoot;
const DojoSession = require('../session.js');
const DojoAudio = require('../audio.js');
fakeRoot.DojoAudio = DojoAudio;

const NOW = 1760000000000;
function mockLocal() {
  const data = {};
  return { getItem: (k) => data[k], setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; }, clear: () => {} };
}
function build(dojo) {
  const content = {
    v: 1, version: 't', lock: ['q1'],
    items: [{ id: 'q1', unit: 'u', type: 'gap', prompt: 'P', answers: ['x'], tags: ['x'], stimulus: 's1' }],
    stimuli: [{ id: 's1', text: 'T', hideText: true, audio: ['a-1', 'b-1'] }],
    course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }
  };
  const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => NOW, localStorage: mockLocal(), claude: null });
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  return { store, engine };
}

test('clipMeta null before manifest: no throw, no inheritance', async () => {
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  DojoAudio.configure({ manifest: null, fetch: () => Promise.reject(new Error('x')) });
  const { store, engine } = build(dojo);
  store.update((d) => { d.settings = d.settings || {}; d.settings['clipFlag:a-1'] = true; });
  assert.strictEqual(DojoAudio.clipMeta('b-1'), null);
  assert.strictEqual(engine.isClipFlagged('b-1'), false);
});

test('flag and heard carry from retired id to successor via DojoAudio manifest', async () => {
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  DojoAudio.configure({ manifest: { clips: { 'b-1': { pack: 'p', text: 't', supersedes: ['a-1'] } } } });
  const { store, engine } = build(dojo);
  store.update((d) => {
    d.settings = d.settings || {};
    d.settings['clipFlag:a-1'] = true;
    d.settings['heard:a-1'] = 7;
    d.settings['heard:c-1'] = 3;
  });
  assert.strictEqual(engine.isClipFlagged('b-1'), true);
  // heard carry: b-1 inherits 7 from a-1, so older-heard c-1 (3) is picked; without carry never-heard b-1 would win
  assert.strictEqual(DojoAudio.pick('s1', ['b-1', 'c-1'], () => 0), 'c-1');
  assert.deepStrictEqual(engine.flaggedClips(), ['a-1']);
  assert.strictEqual(DojoAudio.clipMeta('b-1').supersedes[0], 'a-1');
});
