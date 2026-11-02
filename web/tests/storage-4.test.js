'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
const KEY = 'dojo.demo.progress.v1';
let dojo;

test.before(async () => {
    checkWasmFresh();
    dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

function mockLocal(init) {
  const m = new Map(Object.entries(init || {}));
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

function mockClaude(opts) {
  opts = opts || {};
  const c = { sets: [], uses: [], uidCalls: 0, remote: opts.remote || null, listeners: [], failures: opts.failures || [], latency: opts.latency || null };
  const ref = {
    get: async () => ({ exists: c.remote !== null, data: () => c.remote }),
    set: async (body) => {
      c.sets.push(body);
      if (c.latency) await c.latency();
      const f = c.failures.shift();
      if (f) throw f;
      c.remote = JSON.parse(JSON.stringify(body));
    },
    onSnapshot: (cb) => { c.listeners.push(cb); return () => { c.listeners = c.listeners.filter((x) => x !== cb); }; }
  };
  c.paths = [];
  c.use = async (name) => {
    c.uses.push(name);
    if (opts.rejectUse) throw new Error('nope');
    if (name === 'db') return { doc: (p) => { c.paths.push(p); return ref; } };
    return { id: async () => { c.uidCalls++; return 'u1'; } };
  };
  c.emit = (doc, pending) => c.listeners.forEach((cb) => cb({ exists: true, data: () => doc, metadata: { hasPendingWrites: !!pending } }));
  return c;
}

function rec(s, last) { return { s, due: last + 1000, ok: 1, bad: 0, last }; }
function doc(items, extra) {
  const d = dojo.call('emptyProgress', {});
  d.course = COURSE;
  d.items = items;
  d.t = Math.max(0, ...Object.values(items).map((r) => r.last));
  return Object.assign(d, extra || {});
}

function make(o) {
  o = o || {};
  const clock = { t: o.t || 1000000 };
  const timers = [];
  const statuses = [];
  const remoteChanges = [];
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: o.dojo || dojo,
    now: () => clock.t,
    localStorage: o.ls === undefined ? mockLocal() : o.ls,
    claude: o.claude === undefined ? null : o.claude,
    onStatus: (s) => statuses.push(s),
    onRemoteChange: () => remoteChanges.push(1),
    random: () => 0,
    setTimeoutFn: (fn) => { if (o.instantTimers) { Promise.resolve().then(fn); return 0; } timers.push(fn); return timers.length; },
    clearTimeoutFn: () => {},
    maxDocBytes: o.maxDocBytes
  });
  return { store, clock, timers, statuses, remoteChanges };
}

const tick = () => new Promise((r) => setImmediate(r));





























function mockWindow() {
  const l = {};
  const add = (n, f) => { (l[n] = l[n] || []).push(f); };
  const rm = (n, f) => { l[n] = (l[n] || []).filter((x) => x !== f); };
  const fire = (n) => (l[n] || []).slice().forEach((f) => f());
  const win = { addEventListener: add, removeEventListener: rm, document: { visibilityState: 'visible', addEventListener: add, removeEventListener: rm } };
  return { win, fire };
}



// ---- data-safety regressions (dev-8b) ----

test('safety: update after detach schedules no timer and leaves cloud mode', async () => {
  const claude = mockClaude();
  const { store, timers } = make({ claude });
  await store.load();
  claude.sets.length = 0;
  store.detach();
  store.update((d) => { d.items.a = rec(1, 700); });
  assert.strictEqual(timers.length, 0);
  assert.strictEqual(claude.listeners.length, 0);
  await store.flush();
  assert.strictEqual(claude.sets.length, 0);
});

test('safety: detach during an in-flight load leaves no subscription', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  const p = store.load();
  store.detach();
  await p;
  assert.strictEqual(claude.listeners.length, 0);
  assert.strictEqual(store.status, 'local');
});

test('safety: load twice keeps exactly one subscription', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  await store.load();
  assert.strictEqual(claude.listeners.length, 1);
  const p1 = store.load();
  const p2 = store.load();
  await Promise.all([p1, p2]);
  assert.strictEqual(claude.listeners.length, 1);
});

test('safety: attachLifecycle keeps the cloud subscription', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  store.attachLifecycle(mockWindow().win);
  assert.strictEqual(claude.listeners.length, 1);
  assert.strictEqual(store.status, 'cloud');
});

test('safety: update result that is not a progress doc is rejected', async () => {
  const ls = mockLocal();
  const { store } = make({ ls });
  await store.load();
  store.update((d) => { d.items.a = rec(1, 700); });
  const before = store.exportText();
  const saved = ls.map.get(KEY);
  store.update((d) => { d.items = 'garbage'; });
  assert.strictEqual(store.status, 'error');
  assert.strictEqual(store.exportText(), before);
  assert.strictEqual(ls.map.get(KEY), saved);
});

test('safety: reset with a clock behind resetAt still wins the merge', async () => {
  const ls = mockLocal();
  const { store, clock } = make({ ls, t: 5000 });
  await store.load();
  store.update((d) => { d.items.a = rec(1, 4000); });
  await store.reset();
  const first = store.doc.resetAt;
  clock.t = 1000;
  store.update((d) => { d.items.b = rec(1, 900); });
  await store.reset();
  assert.ok(store.doc.resetAt > first);
  assert.deepStrictEqual(Object.keys(store.doc.items), []);
  assert.deepStrictEqual(Object.keys(JSON.parse(ls.map.get(KEY)).items), []);
});

test('safety: revocation during an in-flight write goes local and ignores the late result', async () => {
  let release;
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  claude.failures.push({ code: 'revoked' });
  claude.latency = () => new Promise((r) => { release = r; });
  store.update((d) => { d.items.a = rec(1, 700); });
  const w = store.flush();
  await tick();
  release();
  await w;
  assert.strictEqual(store.status, 'local');
  assert.strictEqual(claude.listeners.length, 0);
  assert.ok(store.doc.items.a);
});

test('safety: revocation during the retry wait cancels the retry', async () => {
  const claude = mockClaude();
  const { store, timers } = make({ claude });
  await store.load();
  claude.failures.push({ code: 'unavailable' });
  timers.length = 0;
  store.update((d) => { d.items.a = rec(1, 700); });
  const before = claude.sets.length;
  const w = store.flush();
  await tick();
  assert.strictEqual(claude.sets.length, before + 1);
  store.detach();
  await w;
  timers.forEach((f) => f());
  await tick();
  assert.strictEqual(claude.sets.length, before + 1);
  assert.strictEqual(store.status, 'local');
});

test('safety: a snapshot arriving during a write keeps remote knowledge and the dirty flag', async () => {
  let release;
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  claude.latency = () => new Promise((r) => { release = r; });
  store.update((d) => { d.items.a = rec(1, 700); });
  const w = store.flush();
  await tick();
  store.update((d) => { d.items.b = rec(1, 701); });
  claude.emit(doc({ r: rec(1, 800) }));
  assert.ok(store.doc.items.r);
  release();
  await w;
  claude.latency = null;
  await store.flush();
  const last = claude.sets[claude.sets.length - 1];
  assert.deepStrictEqual(Object.keys(last.items).sort(), ['a', 'b', 'r']);
});

test('safety: body still over maxDocBytes after day maps are dropped is not written (status error, doc kept)', async () => {
  const claude = mockClaude();
  const { store } = make({ claude, maxDocBytes: 300 });
  await store.load();
  claude.sets.length = 0;
  store.update((d) => { for (let i = 0; i < 20; i++) d.items['id-' + i] = rec(1, 700 + i); });
  await store.flush();
  assert.strictEqual(claude.sets.length, 0);
  assert.strictEqual(store.status, 'error');
  assert.strictEqual(Object.keys(store.doc.items).length, 20);
});

test('sortKeys does not assign to __proto__', () => {
  const { sortKeys } = require('../storage.js');
  const input = { a: 1, '__proto__': { malicious: true } };
  const result = sortKeys(input);
  assert.deepStrictEqual(Object.keys(result).sort(), ['a']);
  assert.strictEqual(result.a, 1);
  assert.strictEqual(result.__proto__, undefined);
});
