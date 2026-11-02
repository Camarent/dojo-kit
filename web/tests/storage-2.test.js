'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
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

() => new Promise((r) => setImmediate(r));
































// ---- data-safety regressions (dev-8b) ----

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
