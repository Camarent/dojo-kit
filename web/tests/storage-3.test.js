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
function flaky(ls, name, times) {
  let n = times;
  const orig = ls[name];
  ls[name] = (...a) => { if (n-- > 0) throw new Error('boom'); return orig(...a); };
  return ls;
}

test('paste: an import never lowers a stage or drops an item', async () => {
  const s = make();
  await s.store.load();
  s.store.update((d) => { d.items.a = rec(5, 700); d.items.keep = rec(1, 701); });
  s.store.importText(JSON.stringify(doc({ a: rec(2, 600) })));
  assert.strictEqual(s.store.doc.items.a.s, 5);
  assert.ok(s.store.doc.items.keep);
});

test('reset sets resetAt and drops items; older export does not resurrect them', async () => {
  const s = make();
  await s.store.load();
  s.store.update((d) => { d.items.a = rec(3, 700); d.stats.days['2026-01-01'] = 4; });
  const old = s.store.exportText();
  s.clock.t = 2000000;
  await s.store.reset();
  assert.strictEqual(s.store.doc.resetAt, 2000000);
  assert.deepStrictEqual(s.store.doc.items, {});
  assert.deepStrictEqual(s.store.doc.stats.days, {});
  assert.strictEqual(s.store.doc.course, COURSE);
  assert.strictEqual(s.store.importText(old).added, 0);
  assert.deepStrictEqual(s.store.doc.items, {});
  s.store.update((d) => { d.resetAt = 5; });
  assert.strictEqual(s.store.doc.resetAt, 2000000);
});

test('wasm failure: a throwing merge leaves load resolved, status error, doc and storage unchanged', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(doc({ a: rec(1, 500) })) });
  const claude = mockClaude({ remote: doc({ b: rec(2, 600) }) });
  const broken = { call: (name, args) => { if (name === 'merge') throw new Error('trap'); return dojo.call(name, args); } };
  const { store } = make({ ls, claude, dojo: broken });
  const stored = ls.map.get(KEY);
  await store.load();
  assert.strictEqual(store.status, 'error');
  assert.deepStrictEqual(Object.keys(store.doc.items), ['a']);
  assert.strictEqual(ls.map.get(KEY), stored);
  assert.strictEqual(claude.sets.length, 0);
});

test('wasm failure: update with a throwing merge keeps doc and storage', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(doc({ a: rec(1, 500) })) });
  const broken = { call: (name, args) => { if (name === 'merge') throw new Error('trap'); return dojo.call(name, args); } };
  const { store } = make({ ls, dojo: broken });
  await store.load();
  const stored = ls.map.get(KEY);
  const before = store.exportText();
  store.update((d) => { d.items.z = rec(1, 900); });
  assert.strictEqual(store.status, 'error');
  assert.strictEqual(store.exportText(), before);
  assert.strictEqual(ls.map.get(KEY), stored);
});

test('lifecycle: pagehide and hidden visibilitychange flush; detach stops it', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  const { win, fire } = mockWindow();
  store.attachLifecycle(win);
  claude.sets.length = 0;
  store.update((d) => { d.items.a = rec(1, 700); });
  fire('visibilitychange');
  await tick();
  assert.strictEqual(claude.sets.length, 0);
  win.document.visibilityState = 'hidden';
  fire('visibilitychange');
  await tick();
  assert.strictEqual(claude.sets.length, 1);
  store.update((d) => { d.items.b = rec(1, 701); });
  fire('pagehide');
  await tick();
  assert.strictEqual(claude.sets.length, 2);
  store.detach();
  store.update((d) => { d.items.c = rec(1, 702); });
  fire('pagehide');
  fire('visibilitychange');
  await tick();
  assert.strictEqual(claude.sets.length, 2);
});

test('safety: getItem failing once never lets update overwrite the stored doc', async () => {
  const stored = JSON.stringify(doc({ a: rec(1, 500), b: rec(1, 600) }));
  const ls = mockLocal({ [KEY]: stored });
  const { store } = make({ ls });
  await store.load();
  flaky(ls, 'getItem', 1);
  store.update((d) => { d.items.z = rec(1, 900); });
  assert.strictEqual(store.status, 'error');
  assert.strictEqual(ls.map.get(KEY), stored);
  store.update((d) => { d.items.y = rec(1, 901); });
  assert.deepStrictEqual(Object.keys(JSON.parse(ls.map.get(KEY)).items).sort(), ['a', 'b', 'y', 'z']);
});

test('safety: unreadable raw whose backup failed is not overwritten; retried backup succeeds', async () => {
  const ls = mockLocal({ [KEY]: '{not json' });
  const { store } = make({ ls });
  flaky(ls, 'setItem', 2);
  await store.load();
  assert.strictEqual(store.status, 'error');
  store.update((d) => { d.items.a = rec(1, 700); });
  assert.strictEqual(ls.map.get(KEY), '{not json');
  assert.strictEqual([...ls.map.keys()].filter((k) => k.includes('.unreadable.')).length, 0);
  store.update((d) => { d.items.b = rec(1, 701); });
  assert.strictEqual([...ls.map.keys()].filter((k) => k.includes('.unreadable.')).length, 1);
  assert.deepStrictEqual(Object.keys(JSON.parse(ls.map.get(KEY)).items).sort(), ['a', 'b']);
});

test('safety: quota error on setItem sets status error and keeps the in-memory doc', async () => {
  const ls = mockLocal();
  const { store } = make({ ls });
  await store.load();
  flaky(ls, 'setItem', 1);
  store.update((d) => { d.items.a = rec(1, 700); });
  assert.strictEqual(store.status, 'error');
  assert.ok(store.doc.items.a);
});

test('safety: commit throwing inside applyRemote leaves doc unchanged and cloud off', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(doc({ a: rec(1, 500) })) });
  const claude = mockClaude({ remote: doc({ r: rec(1, 800) }) });
  let calls = 0;
  const flaky2 = { call: (n, a) => { if (n === 'sanitize' && ++calls === 3) throw new Error('trap'); return dojo.call(n, a); } };
  const s2 = make({ ls, claude, dojo: flaky2 });
  await s2.store.load();
  assert.strictEqual(s2.store.status, 'error');
  assert.ok(!s2.store.doc.items.r);
  assert.strictEqual(claude.sets.length, 0);
});

test('safety: throwing onRemoteChange does not drop cloud mode', async () => {
  const claude = mockClaude({ remote: doc({ r: rec(1, 800) }) });
  const statuses = [];
  const store = DojoStorage.createStore({
    courseId: COURSE, dojo, now: () => 1000000, localStorage: mockLocal(), claude,
    onStatus: (s) => statuses.push(s), onRemoteChange: () => { throw new Error('ui'); },
    setTimeoutFn: () => 1, clearTimeoutFn: () => {}
  });
  await store.load();
  assert.strictEqual(store.status, 'cloud');
  assert.strictEqual(claude.listeners.length, 1);
  claude.emit(doc({ r: rec(1, 800), q: rec(1, 900) }));
  assert.strictEqual(store.status, 'cloud');
  assert.ok(store.doc.items.q);
});
