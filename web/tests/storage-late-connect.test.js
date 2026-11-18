'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
const PATH = 'data/users/u1/progress-demo';
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

// Fake cloud shared by every store in one test: one remote doc and the paths opened.
function fakeCloud() {
  const cloud = { remote: null, paths: [], dbReady: true, onSnapshotThrows: false };
  cloud.ref = {
    get: async () => (cloud.remote === null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(JSON.stringify(cloud.remote)) }),
    set: async (body) => { cloud.remote = JSON.parse(JSON.stringify(body)); },
    onSnapshot: () => { if (cloud.onSnapshotThrows) throw new Error('listener down'); return () => {}; }
  };
  return cloud;
}

function fakeClaude(cloud) {
  return {
    use: async (name) => {
      if (name === 'db') return cloud.dbReady ? { doc: (p) => { cloud.paths.push(p); return cloud.ref; } } : null;
      return { id: async () => 'u1' };
    }
  };
}

function mockLocal() {
  const m = new Map();
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

// Each store gets its own local storage; timers are queued, never run by the clock.
function make(o) {
  const statuses = [];
  const warnings = [];
  const timers = [];
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: mockLocal(),
    claude: o.claude,
    onStatus: (s) => statuses.push(s),
    onRemoteChange: () => {},
    onWarn: (where, err) => warnings.push({ where, err }),
    random: () => 0,
    connectRetryDelaysMs: o.connectRetryDelaysMs,
    setTimeoutFn: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeoutFn: () => {}
  });
  return { store, statuses, warnings, timers };
}

function settle() {
  return new Promise((r) => setImmediate(r));
}

test('claude absent at boot, then appears during a retry: connects to the cloud', async () => {
  const cloud = fakeCloud();
  let late = null;
  const t = make({ claude: () => late, connectRetryDelaysMs: [5] });
  await t.store.load();
  assert.strictEqual(t.store.status, 'syncing');
  late = fakeClaude(cloud);
  t.timers.shift().fn();
  await settle();
  assert.strictEqual(t.store.status, 'cloud');
  assert.deepStrictEqual(cloud.paths, [PATH]);
});

test('db unavailable at boot, then available during a retry: connects to the cloud', async () => {
  const cloud = fakeCloud();
  cloud.dbReady = false;
  const t = make({ claude: fakeClaude(cloud), connectRetryDelaysMs: [5] });
  await t.store.load();
  assert.strictEqual(t.store.status, 'syncing');
  assert.deepStrictEqual(t.timers.map((x) => x.ms), [5]);
  cloud.dbReady = true;
  t.timers.shift().fn();
  await settle();
  assert.strictEqual(t.store.status, 'cloud');
  assert.deepStrictEqual(cloud.paths, [PATH]);
});

test('fresh empty local doc with non-empty remote and late claude: store.doc equals remote', async () => {
  const cloud = fakeCloud();
  const writer = make({ claude: fakeClaude(cloud), connectRetryDelaysMs: [] });
  await writer.store.load();
  writer.store.update((d) => { d.items = { q1: { ok: true } }; });
  await writer.store.flush();
  assert.ok(cloud.remote, 'remote doc written');

  let late = null;
  const reader = make({ claude: () => late, connectRetryDelaysMs: [5] });
  await reader.store.load();
  assert.strictEqual(reader.store.status, 'syncing');
  late = fakeClaude(cloud);
  reader.timers.shift().fn();
  await settle();
  assert.strictEqual(reader.store.status, 'cloud');
  assert.deepStrictEqual(reader.store.doc, writer.store.doc);
  assert.deepStrictEqual(reader.store.doc.items, { q1: { ok: true } });
});

test('claude absent after all retries: status local, no timer left', async () => {
  const t = make({ claude: () => null, connectRetryDelaysMs: [5, 7] });
  await t.store.load();
  assert.deepStrictEqual(t.timers.map((x) => x.ms), [5]);
  t.timers.shift().fn();
  await settle();
  assert.deepStrictEqual(t.timers.map((x) => x.ms), [7]);
  t.timers.shift().fn();
  await settle();
  assert.strictEqual(t.store.status, 'local');
  assert.strictEqual(t.timers.length, 0);
  assert.ok(!t.statuses.includes('cloud'), 'got ' + t.statuses.join(','));
});

test('attachRemote throws: status error and onWarn called with the error', async () => {
  const cloud = fakeCloud();
  cloud.onSnapshotThrows = true;
  const t = make({ claude: fakeClaude(cloud), connectRetryDelaysMs: [5] });
  await t.store.load();
  assert.strictEqual(t.store.status, 'error');
  assert.strictEqual(t.timers.length, 0, 'no retry after a non-absent error');
  const hit = t.warnings.find((w) => w.where === 'store.connect');
  assert.ok(hit, 'onWarn got store.connect, got ' + t.warnings.map((w) => w.where).join(','));
  assert.strictEqual(hit.err.message, 'listener down');
});
