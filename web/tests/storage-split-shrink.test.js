'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const parts = require('../storage/parts.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
const MAIN = 'data/users/u1/progress-demo';
const RECORDS = 2271;
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

const tick = () => new Promise((r) => setImmediate(r));

/** Per-path mock db: docs Map path -> data, listeners per path, one ref object per path. */
function mockDb() {
  const docs = new Map();
  const listeners = new Map();
  const refs = new Map();
  const c = { docs, listeners, sets: [], paths: [] };
  function ref(p) {
    if (!refs.has(p)) {
      refs.set(p, {
        get: async () => ({ exists: docs.has(p), data: () => docs.get(p) }),
        set: async (body) => { c.sets.push({ path: p, body }); docs.set(p, JSON.parse(JSON.stringify(body))); },
        onSnapshot: (cb) => {
          if (!listeners.has(p)) listeners.set(p, []);
          listeners.get(p).push(cb);
          return () => { listeners.set(p, listeners.get(p).filter((x) => x !== cb)); };
        }
      });
    }
    return refs.get(p);
  }
  c.emit = (p, doc, pending) => (listeners.get(p) || []).slice().forEach((cb) =>
    cb({ exists: true, data: () => doc, metadata: { hasPendingWrites: !!pending } }));
  c.claude = {
    use: async (name) => (name === 'db'
      ? { doc: (p) => { c.paths.push(p); return ref(p); } }
      : { id: async () => 'u1' })
  };
  return c;
}

function memLocal() {
  const m = new Map();
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

/** Synthetic records exambunpou-100.. ; shape as the progress records of storage tests. */
function items(n, from) {
  const out = {};
  for (let i = from || 0; i < (from || 0) + n; i++) {
    const last = 1700000000000 + i;
    out[`exambunpou-${100 + i}`] = { bad: 0, due: last + 1000, last, ok: 1, s: 1 };
  }
  return out;
}

function progressDoc(its) {
  const d = dojo.call('emptyProgress', {});
  d.course = COURSE;
  d.items = its;
  d.t = Math.max(0, ...Object.values(its).map((r) => r.last));
  return dojo.call('sanitize', d);
}

/** Puts body on MAIN as parts split at budget; returns the split. */
function splitInto(db, body, budget) {
  const sp = parts.splitItems(body, budget);
  if (!sp) throw new Error('split failed');
  db.docs.set(MAIN, sp.main);
  sp.parts.forEach((p, i) => db.docs.set(parts.partPath(MAIN, i + 1), p));
  return sp;
}

/** Budget that cuts body into exactly n parts (greedy fill, id order). */
function budgetFor(body, n) {
  for (let b = Math.ceil(parts.byteSize(body) / n); ; b += 500) {
    const sp = parts.splitItems(body, b);
    if (sp && sp.parts.length === n) return b;
  }
}

function make(db, nowMs) {
  const warnings = [];
  const ls = memLocal();
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo,
    now: () => nowMs || 1000000,
    localStorage: ls,
    claude: db.claude,
    onStatus: () => {},
    onRemoteChange: () => {},
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    onWarn: (where, err) => warnings.push({ where, err })
  });
  return { store, ls, warnings };
}

test('C1: main shrinks from 3 parts to 1; a late snapshot of old part 2 leaves store.doc unchanged and only part 1 stays watched', async () => {
  const db = mockDb();
  const body = progressDoc(items(RECORDS));
  const sp = splitInto(db, body, budgetFor(body, 3));
  const p1 = parts.partPath(MAIN, 1);
  const p2 = parts.partPath(MAIN, 2);
  const p3 = parts.partPath(MAIN, 3);
  const part2 = db.docs.get(p2);
  const { store } = make(db);
  await store.load();
  assert.strictEqual((db.listeners.get(p2) || []).length, 1);
  assert.strictEqual((db.listeners.get(p3) || []).length, 1);
  const oldPart2Cb = db.listeners.get(p2)[0];

  db.emit(MAIN, Object.assign({}, sp.main, { parts: 1 }));
  await tick();
  assert.strictEqual((db.listeners.get(p2) || []).length, 0);
  assert.strictEqual((db.listeners.get(p3) || []).length, 0);
  assert.strictEqual((db.listeners.get(p1) || []).length, 1);
  /** Same as s.partUnsubs.length === 1: exactly one part watcher is left (s is private to createStore). */
  const watchedParts = [p1, p2, p3].reduce((n, p) => n + (db.listeners.get(p) || []).length, 0);
  assert.strictEqual(watchedParts, 1);

  const before =JSON.parse(JSON.stringify(store.doc));
  const extra = { bad: 0, due: 1800000001000, last: 1800000000000, ok: 1, s: 1 };
  const stale = Object.assign({}, part2, { items: Object.assign({}, part2.items, { 'exambunpou-9999': extra }) });
  /** Late delivery: the callback registered before the shrink still fires once. */
  oldPart2Cb({ exists: true, data: () => stale, metadata: { hasPendingWrites: false } });
  await tick();
  assert.deepStrictEqual(store.doc, before);
  assert.strictEqual(store.doc.items['exambunpou-9999'], undefined);
  assert.strictEqual(db.docs.has(p2), true);
});

test('C1b: a write that shrinks 3 parts to 1 drops p2/p3 watchers; a late old part 2 snapshot leaves store.doc unchanged', async () => {
  const db = mockDb();
  const body = progressDoc(items(RECORDS));
  const sp = splitInto(db, body, budgetFor(body, 3));
  const p2 = parts.partPath(MAIN, 2);
  const p3 = parts.partPath(MAIN, 3);
  const part2 = db.docs.get(p2);
  /** now is after every record's last, so reset clears them all. */
  const { store } = make(db, 1900000000000);
  await store.load();
  const oldPart2Cb = db.listeners.get(p2)[0];

  /** reset is the one explicit shrink the write path accepts: the body drops to a single doc. */
  await store.reset();
  assert.ok(!db.docs.get(MAIN).parts);
  assert.strictEqual((db.listeners.get(p2) || []).length, 0);
  assert.strictEqual((db.listeners.get(p3) || []).length, 0);

  const before = JSON.parse(JSON.stringify(store.doc));
  const extra = { bad: 0, due: 1800000001000, last: 1800000000000, ok: 1, s: 1 };
  const stale = Object.assign({}, part2, { items: Object.assign({}, part2.items, { 'exambunpou-9999': extra }) });
  oldPart2Cb({ exists: true, data: () => stale, metadata: { hasPendingWrites: false } });
  await tick();
  assert.deepStrictEqual(store.doc, before);
  assert.strictEqual(store.doc.items['exambunpou-9999'], undefined);
  assert.ok(sp.parts.length === 3);
});
