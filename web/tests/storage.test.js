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
const PATH = 'data/users/u1/progress-demo';
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
































// ---- data-safety regressions (dev-8b) ----

test('load: empty everywhere gives a valid empty doc with course', async () => {
  const { store, statuses } = make({ claude: mockClaude() });
  await store.load();
  assert.strictEqual(store.doc.course, COURSE);
  assert.strictEqual(store.doc.v, 1);
  assert.deepStrictEqual(store.doc.items, {});
  assert.strictEqual(store.status, 'cloud');
  assert.ok(statuses.includes('syncing'));
});

test('load: local only is kept and pushed to the cloud', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(doc({ a: rec(1, 500) })) });
  const claude = mockClaude();
  const { store } = make({ ls, claude });
  await store.load();
  assert.deepStrictEqual(Object.keys(store.doc.items), ['a']);
  assert.deepStrictEqual(Object.keys(claude.remote.items), ['a']);
  assert.deepStrictEqual(claude.paths, [PATH]);
});

test('load: cloud only is taken over and saved locally', async () => {
  const ls = mockLocal();
  const claude = mockClaude({ remote: doc({ b: rec(2, 600) }) });
  const { store } = make({ ls, claude });
  await store.load();
  assert.deepStrictEqual(Object.keys(store.doc.items), ['b']);
  assert.deepStrictEqual(Object.keys(JSON.parse(ls.map.get(KEY)).items), ['b']);
  assert.strictEqual(claude.sets.length, 0);
});

test('db path is data/users/<uid>/progress-<courseId> and has an even number of segments', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  assert.deepStrictEqual(claude.paths, [PATH]);
  assert.strictEqual(claude.paths[0].split('/').length % 2 === 0, true);
});

test('load: diverged local and cloud are merged and both sides written', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(doc({ a: rec(1, 500) })) });
  const claude = mockClaude({ remote: doc({ b: rec(2, 600) }) });
  const { store, remoteChanges } = make({ ls, claude });
  await store.load();
  assert.deepStrictEqual(Object.keys(store.doc.items).sort(), ['a', 'b']);
  assert.deepStrictEqual(Object.keys(JSON.parse(ls.map.get(KEY)).items).sort(), ['a', 'b']);
  assert.deepStrictEqual(Object.keys(claude.remote.items).sort(), ['a', 'b']);
  assert.strictEqual(remoteChanges.length, 1);
});

test('load: unreadable local is backed up exactly once and start is empty', async () => {
  const ls = mockLocal({ [KEY]: '{not json' });
  const { store } = make({ ls });
  await store.load();
  store.update((d) => { d.items.x = rec(1, 900); });
  store.update((d) => { d.items.y = rec(1, 901); });
  const backups = [...ls.map.keys()].filter((k) => k.startsWith(KEY + '.unreadable.'));
  assert.deepStrictEqual(backups, [KEY + '.unreadable.1000000']);
  assert.strictEqual(ls.map.get(backups[0]), '{not json');
  assert.deepStrictEqual(Object.keys(store.doc.items).sort(), ['x', 'y']);
});

test('load: absent claude gives local; rejecting use gives local', async () => {
  const a = make({ claude: null });
  await a.store.load();
  assert.strictEqual(a.store.status, 'local');
  const b = make({ claude: mockClaude({ rejectUse: true }) });
  await b.store.load();
  assert.strictEqual(b.store.status, 'local');
});

test('load: broken localStorage is tolerated', async () => {
  const ls = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const { store } = make({ ls });
  await store.load();
  store.update((d) => { d.items.a = rec(1, 5); });
  assert.ok(store.doc.items.a);
});

test('load: foreign remote doc gives foreign and nothing is written remotely', async () => {
  const claude = mockClaude({ remote: { hello: 'world' } });
  const { store } = make({ claude });
  await store.load();
  assert.strictEqual(store.status, 'foreign');
  store.update((d) => { d.items.a = rec(1, 5); });
  await store.flush();
  assert.strictEqual(claude.sets.length, 0);
});

test('load: remote doc of another course is foreign', async () => {
  const claude = mockClaude({ remote: doc({ b: rec(2, 600) }, { course: 'other' }) });
  const { store } = make({ claude });
  await store.load();
  assert.strictEqual(store.status, 'foreign');
  assert.strictEqual(claude.sets.length, 0);
});

test('update writes local immediately; flush writes the course path', async () => {
  const ls = mockLocal();
  const claude = mockClaude();
  const { store } = make({ ls, claude });
  await store.load();
  claude.sets.length = 0;
  store.update((d) => { d.items.a = rec(1, 700); });
  assert.ok(JSON.parse(ls.map.get(KEY)).items.a);
  assert.strictEqual(store.doc.t, 1000000);
  await store.flush();
  assert.strictEqual(claude.sets.length, 1);
  assert.ok(claude.remote.items.a);
  assert.strictEqual(claude.remote.course, COURSE);
  assert.strictEqual(store.status, 'cloud');
});

test('two quick updates give one coalesced write after the in-flight one', async () => {
  let release;
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  claude.sets.length = 0;
  claude.latency = () => new Promise((r) => { release = r; });
  store.update((d) => { d.items.a = rec(1, 700); });
  const first = store.flush();
  await tick();
  store.update((d) => { d.items.b = rec(1, 701); });
  const second = store.flush();
  store.update((d) => { d.items.c = rec(1, 702); });
  const third = store.flush();
  assert.strictEqual(claude.sets.length, 1);
  claude.latency = null;
  release();
  await Promise.all([first, second, third]);
  assert.strictEqual(claude.sets.length, 2);
  assert.deepStrictEqual(Object.keys(claude.remote.items).sort(), ['a', 'b', 'c']);
});

test('noteAnswer flushes every flushEvery-th answer', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  claude.sets.length = 0;
  store.update((d) => { d.items.a = rec(1, 700); });
  for (let i = 0; i < 4; i++) store.noteAnswer();
  assert.strictEqual(claude.sets.length, 0);
  store.noteAnswer();
  await tick();
  assert.strictEqual(claude.sets.length, 1);
});
