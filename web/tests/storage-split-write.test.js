'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
const MAIN = 'data/users/u1/progress-' + COURSE;
/** Measured server limit (owner test): a set above this is rejected with invalid_argument. */
const SERVER_LIMIT = 139000;
const BUDGET = 120000;
const NOW = 1000000;
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

/** Per-path mock of the artifact db: every set is recorded; sets above SERVER_LIMIT are rejected. */
function mockDb() {
  const db = { docs: new Map(), sets: [], rejected: 0, fail: null };
  function ref(path) {
    return {
      get: async () => { const d = db.docs.get(path); return { exists: d !== undefined, data: () => d }; },
      set: async (body) => {
        const bytes = Buffer.byteLength(JSON.stringify(body));
        db.sets.push({ path, bytes, items: Object.keys(body.items || {}).length, parts: body.parts });
        const injected = db.fail && db.fail(path);
        if (injected) throw injected;
        if (bytes > SERVER_LIMIT) { db.rejected++; throw { code: 'invalid_argument' }; }
        db.docs.set(path, JSON.parse(JSON.stringify(body)));
      },
      onSnapshot: () => () => {}
    };
  }
  db.claude = { use: async (name) => (name === 'db' ? { doc: (p) => ref(p) } : { id: async () => 'u1' }) };
  return db;
}

function rec(s, last) { return { s, due: last + 1000, ok: 1, bad: 0, last }; }

/** Synthetic course of n records; ids sort in insertion order. */
function courseItems(n) {
  const items = {};
  for (let i = 0; i < n; i++) items['demo-lesson-item-sentence-' + String(i).padStart(5, '0')] = rec(1, 700 + (i % 500));
  return items;
}

function makeStore(db, extra) {
  return DojoStorage.createStore(Object.assign({
    courseId: COURSE,
    dojo,
    now: () => NOW,
    localStorage: { getItem: () => null, setItem: () => {} },
    claude: db.claude,
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {}
  }, extra || {}));
}

/** Loads a store on db, puts n records into it, flushes; returns the store. */
async function writeCourse(db, n) {
  const store = makeStore(db);
  await store.load();
  db.sets.length = 0;
  store.update((d) => { Object.assign(d.items, courseItems(n)); });
  await store.flush();
  return store;
}

function partPaths(k) {
  const out = [];
  for (let i = 1; i <= k; i++) out.push(MAIN + '.part' + i);
  return out;
}

test('C2 small course: one set, no parts key, format unchanged', async () => {
  const db = mockDb();
  const store = await writeCourse(db, 5);
  assert.strictEqual(db.sets.length, 1);
  assert.strictEqual(db.sets[0].path, MAIN);
  assert.strictEqual(db.sets[0].parts, undefined);
  assert.strictEqual(store.status, 'cloud');
  assert.strictEqual(store.reason.step, 'ok');
});

test('C2 2271-record course: parts first then main, every set within budget, no rejection', async (t) => {
  const db = mockDb();
  const store = await writeCourse(db, 2271);
  t.diagnostic('body bytes ' + Buffer.byteLength(JSON.stringify(store.doc)) + '; sets ' + db.sets.map((s) => s.path.split('/').pop() + ' ' + s.bytes).join(', '));
  const main = db.sets[db.sets.length - 1];
  assert.strictEqual(main.path, MAIN);
  const k = main.parts;
  assert.ok(k >= 2, 'expected at least 2 parts, got ' + k);
  assert.deepStrictEqual(db.sets.slice(0, -1).map((s) => s.path), partPaths(k));
  for (const s of db.sets) assert.ok(s.bytes <= BUDGET, s.path + ' ' + s.bytes);
  assert.strictEqual(db.rejected, 0);
  assert.strictEqual(store.status, 'cloud');
  assert.strictEqual(store.reason.step, 'ok');
});

test('C2 10000-record course: parts first then main, every set within budget, no rejection', async () => {
  const db = mockDb();
  const store = await writeCourse(db, 10000);
  const main = db.sets[db.sets.length - 1];
  assert.strictEqual(main.path, MAIN);
  const k = main.parts;
  assert.ok(k >= 2);
  assert.deepStrictEqual(db.sets.slice(0, -1).map((s) => s.path), partPaths(k));
  for (const s of db.sets) assert.ok(s.bytes <= BUDGET, s.path + ' ' + s.bytes);
  assert.strictEqual(db.rejected, 0);
  assert.strictEqual(store.status, 'cloud');
});

test('C3 round trip: a second store on the same db loads the writer records', async () => {
  const db = mockDb();
  const writer = await writeCourse(db, 2271);
  const reader = makeStore(db);
  await reader.load();
  assert.deepStrictEqual(reader.doc.items, writer.doc.items);
  assert.strictEqual(reader.doc.parts, undefined);
});

test('C4 migration: pre-change single doc of 2271 records gets split on the next flush', async () => {
  const db = mockDb();
  const legacy = { v: 1, course: COURSE, t: 1, resetAt: 0, items: courseItems(2271), stats: { days: {}, newByDay: {} }, settings: {} };
  db.docs.set(MAIN, JSON.parse(JSON.stringify(legacy)));
  const store = makeStore(db);
  await store.load();
  assert.strictEqual(Object.keys(store.doc.items).length, 2271);
  db.sets.length = 0;
  store.update((d) => { d.items['added'] = rec(1, 900); });
  await store.flush();
  const main = db.sets[db.sets.length - 1];
  assert.strictEqual(main.path, MAIN);
  assert.ok(main.parts >= 2, 'expected parts, got ' + main.parts);
  assert.strictEqual(db.rejected, 0);
  const reader = makeStore(db);
  await reader.load();
  const expected = Object.assign(courseItems(2271), { added: rec(1, 900) });
  assert.deepStrictEqual(reader.doc.items, expected);
});

test('C5 invalid_argument on part 1: status error (not local), reason write-too-large, main kept', async () => {
  const db = mockDb();
  const store = await writeCourse(db, 2271);
  const mainBefore = JSON.parse(JSON.stringify(db.docs.get(MAIN)));
  db.fail = (path) => (path === MAIN + '.part1' ? { code: 'invalid_argument' } : null);
  store.update((d) => { d.items['late'] = rec(1, 950); });
  await store.flush();
  assert.strictEqual(store.status, 'error');
  assert.strictEqual(store.reason.step, 'write-too-large');
  assert.match(store.reason.detail, /\d+ KB/);
  assert.deepStrictEqual(db.docs.get(MAIN), mainBefore);
  assert.strictEqual(store.doc.items.late !== undefined, true);
  assert.strictEqual(Object.keys(store.doc.items).length, 2272);
});

test('C5 revoked on part 1: status local, reason write-error', async () => {
  const db = mockDb();
  const store = await writeCourse(db, 2271);
  db.fail = (path) => (path === MAIN + '.part1' ? { code: 'revoked' } : null);
  store.update((d) => { d.items['late'] = rec(1, 950); });
  await store.flush();
  assert.strictEqual(store.status, 'local');
  assert.strictEqual(store.reason.step, 'write-error');
  assert.strictEqual(store.reason.detail, 'revoked');
});

