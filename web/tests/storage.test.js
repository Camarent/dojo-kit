'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
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
    setTimeoutFn: (fn, ms) => { if (o.instantTimers) { Promise.resolve().then(fn); return 0; } timers.push(fn); return timers.length; },
    clearTimeoutFn: () => {},
    maxDocBytes: o.maxDocBytes
  });
  return { store, clock, timers, statuses, remoteChanges };
}

const tick = () => new Promise((r) => setImmediate(r));

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

test('failure with code unavailable retries once', async () => {
  const claude = mockClaude({ failures: [] });
  const { store } = make({ claude, instantTimers: true });
  await store.load();
  claude.sets.length = 0;
  claude.failures.push({ code: 'unavailable' });
  store.update((d) => { d.items.a = rec(1, 700); });
  await store.flush();
  assert.strictEqual(claude.sets.length, 2);
  assert.strictEqual(store.status, 'cloud');
  claude.failures.push({ code: 'unavailable' }, { code: 'unavailable' });
  store.update((d) => { d.items.b = rec(1, 701); });
  await store.flush();
  assert.strictEqual(claude.sets.length, 4);
  assert.strictEqual(store.status, 'error');
});

test('failure with code revoked switches to local mode', async () => {
  const claude = mockClaude();
  const { store } = make({ claude });
  await store.load();
  claude.failures.push({ code: 'revoked' });
  store.update((d) => { d.items.a = rec(1, 700); });
  await store.flush();
  assert.strictEqual(store.status, 'local');
  const n = claude.sets.length;
  store.update((d) => { d.items.b = rec(1, 701); });
  await store.flush();
  assert.strictEqual(claude.sets.length, n);
});

test('shrink guard blocks a write', async () => {
  const claude = mockClaude({ remote: doc({ a: rec(1, 500), b: rec(1, 501) }) });
  let armed = false;
  const shrinking = { call: (name, args) => {
    const r = dojo.call(name, args);
    if (armed && name === 'merge' && r.items) { const items = Object.assign({}, r.items); delete items.a; delete items.b; return Object.assign({}, r, { items }); }
    return r;
  } };
  const { store } = make({ claude, dojo: shrinking });
  await store.load();
  armed = true;
  store.update((d) => { d.items.c = rec(1, 700); });
  await store.flush();
  assert.strictEqual(claude.sets.length, 0);
  assert.strictEqual(store.status, 'error');
});

test('oversize doc drops day maps in the written body', async () => {
  const claude = mockClaude();
  const { store } = make({ claude, maxDocBytes: 1400 });
  await store.load();
  store.update((d) => {
    d.stats.days['2026-01-01'] = 5;
    d.stats.newByDay['2026-01-01'] = 2;
    for (let i = 0; i < 20; i++) d.items['id-' + i] = rec(1, 700 + i);
    for (let i = 0; i < 30; i++) d.stats.days['2026-02-' + i] = i;
  });
  await store.flush();
  const body = claude.sets[claude.sets.length - 1];
  assert.deepStrictEqual(body.stats.days, {});
  assert.deepStrictEqual(body.stats.newByDay, {});
  assert.strictEqual(Object.keys(body.items).length, 20);
});

test('snapshot with pending writes is ignored; remote snapshot changes the doc once', async () => {
  const claude = mockClaude();
  const { store, remoteChanges } = make({ claude });
  await store.load();
  claude.sets.length = 0;
  claude.emit(doc({ r: rec(2, 800) }), true);
  assert.deepStrictEqual(store.doc.items, {});
  assert.strictEqual(remoteChanges.length, 0);
  claude.emit(doc({ r: rec(2, 800) }), false);
  assert.ok(store.doc.items.r);
  assert.strictEqual(remoteChanges.length, 1);
  claude.emit(doc({ r: rec(2, 800) }), false);
  assert.strictEqual(remoteChanges.length, 1);
  assert.strictEqual(claude.sets.length, 0);
});

test('paste: export then import into an empty store gives equal docs', async () => {
  const a = make();
  await a.store.load();
  a.store.update((d) => { d.items.a = rec(3, 700); d.stats.days['2026-01-01'] = 4; });
  const text = a.store.exportText();
  const b = make();
  await b.store.load();
  assert.deepStrictEqual(b.store.importText(text), { ok: true, added: 1 });
  assert.strictEqual(b.store.exportText(), text);
  assert.deepStrictEqual(b.store.doc, a.store.doc);
});

test('paste: importing the same text twice adds 0 the second time', async () => {
  const a = make();
  await a.store.load();
  a.store.update((d) => { d.items.a = rec(3, 700); d.items.b = rec(1, 701); });
  const b = make();
  await b.store.load();
  assert.strictEqual(b.store.importText(a.store.exportText()).added, 2);
  assert.strictEqual(b.store.importText(a.store.exportText()).added, 0);
});

test('paste_import_never_sets_resetAt', async () => {
  const s = make();
  await s.store.load();
  const incoming = doc({ a: rec(1, 700) }, { resetAt: 5000000 });
  const r = s.store.importText(JSON.stringify(incoming));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.store.doc.resetAt, 0);
  assert.ok(s.store.doc.items.a);
  s.store.reset();
  const resetAt = s.store.doc.resetAt;
  s.store.importText(JSON.stringify(doc({ b: rec(1, 700) }, { resetAt: 1 })));
  assert.strictEqual(s.store.doc.resetAt, resetAt);
});

test('import of a pre-reset export does not restore stats', async () => {
  const s = make();
  await s.store.load();
  s.store.update((d) => { d.items.a = rec(3, 700); d.stats.days['2026-01-01'] = 4; d.stats.newByDay['2026-01-01'] = 2; });
  const old = s.store.exportText();
  await s.store.reset();
  const resetAt = s.store.doc.resetAt;
  s.store.importText(old);
  assert.deepStrictEqual(s.store.doc.items, {});
  assert.deepStrictEqual(s.store.doc.stats.days, {});
  assert.deepStrictEqual(s.store.doc.stats.newByDay, {});
  assert.strictEqual(s.store.doc.resetAt, resetAt);
});

test('import with a later resetAt keeps resetAt and own items', async () => {
  const s = make();
  await s.store.load();
  s.store.update((d) => { d.items.a = rec(1, 700); });
  const resetAt = s.store.doc.resetAt;
  const incoming = doc({ b: rec(1, 701) }, { resetAt: resetAt + 1000 });
  s.store.importText(JSON.stringify(incoming));
  assert.strictEqual(s.store.doc.resetAt, resetAt);
  assert.ok(s.store.doc.items.a);
});

test('paste: other course, invalid JSON and non-progress JSON are rejected', async () => {
  const s = make();
  await s.store.load();
  s.store.update((d) => { d.items.a = rec(1, 700); });
  const before = s.store.exportText();
  assert.deepStrictEqual(s.store.importText(JSON.stringify(doc({ z: rec(1, 1) }, { course: 'other' }))), { ok: false, code: 'other_course' });
  assert.deepStrictEqual(s.store.importText('{oops'), { ok: false, code: 'invalid_json' });
  assert.deepStrictEqual(s.store.importText('{"a":1}'), { ok: false, code: 'not_progress' });
  assert.deepStrictEqual(s.store.importText('[1]'), { ok: false, code: 'not_progress' });
  assert.strictEqual(s.store.exportText(), before);
});

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

function mockWindow() {
  const l = {};
  const add = (n, f) => { (l[n] = l[n] || []).push(f); };
  const rm = (n, f) => { l[n] = (l[n] || []).filter((x) => x !== f); };
  const fire = (n) => (l[n] || []).slice().forEach((f) => f());
  const win = { addEventListener: add, removeEventListener: rm, document: { visibilityState: 'visible', addEventListener: add, removeEventListener: rm } };
  return { win, fire };
}

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


// ---- data-safety regressions (dev-8b) ----
function flaky(ls, name, times) {
  let n = times;
  const orig = ls[name];
  ls[name] = (...a) => { if (n-- > 0) throw new Error('boom'); return orig(...a); };
  return ls;
}

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

test('sortKeys removes prototype and constructor keys', () => {
  const { sortKeys } = require('../storage.js');
  const input = { b: 2, constructor: { x: 1 }, prototype: { y: 2 } };
  const result = sortKeys(input);
  assert.deepStrictEqual(Object.keys(result).sort(), ['b']);
  assert.strictEqual(result.b, 2);
});
