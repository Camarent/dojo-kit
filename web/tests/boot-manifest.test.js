'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');
const fakeRoot = {};
globalThis.self = fakeRoot;
const DojoSession = require('../session.js');
const DojoAudio = require('../audio.js');
const BOOT = fs.readFileSync(path.join(__dirname, '../boot.js'), 'utf8');

const NOW = 1760000000000;
function mockLocal() {
  const data = {};
  return { getItem: (k) => data[k], setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; }, clear: () => {} };
}
function content(audio) {
  const c = {
    v: 1, version: 't', lock: ['q1'],
    items: [{ id: 'q1', unit: 'u', type: 'gap', prompt: 'P', answers: ['x'], tags: ['x'], stimulus: 's1' }],
    stimuli: [{ id: 's1', text: 'T', hideText: true, audio: ['a-1', 'b-1'] }],
    course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }
  };
  if (audio) c.course.audio = { base: 'aud/' };
  return c;
}
// Runs the real boot.js; DojoApp.start builds the engine and records it.
async function runBoot(cont, manifestFetch) {
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const requests = [];
  const sb = { requests, started: null, failed: null };
  sb.self = sb;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.document = { getElementById: () => ({}) };
  sb.localStorage = mockLocal();
  sb.DojoWasm = { load: async () => dojo };
  sb.DojoAudio = DojoAudio;
  sb.fetch = (url) => {
    requests.push(url);
    if (url === 'data/content.json') return Promise.resolve({ ok: true, json: async () => cont });
    return manifestFetch(url);
  };
  sb.DojoApp = {
    start: (o) => {
      const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => NOW, localStorage: mockLocal(), claude: null });
      store.update((d) => { d.settings = d.settings || {}; d.settings['clipFlag:a-1'] = true; d.settings['heard:a-1'] = 7; d.settings['heard:c-1'] = 3; });
      sb.started = DojoSession.createEngine({ dojo, store, content: o.content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
    },
    fail: (_, e) => { sb.failed = e; }
  };
  vm.runInNewContext(BOOT, vm.createContext(sb));
  for (let i = 0; i < 50 && !sb.started && !sb.failed; i++) await new Promise((r) => setTimeout(r, 10));
  return sb;
}

test('boot loads manifest: first build carries flag and heard order', async () => {
  const m = { clips: { 'b-1': { pack: 'p', text: 't', supersedes: ['a-1'] } } };
  const sb = await runBoot(content(true), () => Promise.resolve({ ok: true, json: async () => m }));
  assert.ok(sb.started);
  assert.ok(sb.requests.includes('aud/manifest.json'));
  assert.ok(!sb.requests.some((u) => /pack/.test(u)));
  assert.strictEqual(sb.started.isClipFlagged('b-1'), true);
  assert.strictEqual(DojoAudio.pick('s1', ['b-1', 'c-1'], () => 0), 'c-1');
});

test('manifest fetch failure at boot: no throw, app starts', async () => {
  const sb = await runBoot(content(true), () => Promise.reject(new Error('net')));
  assert.ok(sb.started);
  assert.strictEqual(sb.failed, null);
  assert.strictEqual(DojoAudio.clipMeta('b-1'), null);
});

test('course without audio makes no manifest request', async () => {
  const sb = await runBoot(content(false), () => Promise.reject(new Error('unexpected')));
  assert.ok(sb.started);
  assert.deepStrictEqual(sb.requests, ['data/content.json']);
});
