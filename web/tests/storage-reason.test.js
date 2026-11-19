'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

function mockLocal() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

// claude whose use(name) is answered by fn(name); a throw or rejection counts as use() failing.
function claudeUse(fn) {
  return { use: async (name) => fn(name) };
}

function dbOk(getFn) {
  return {
    doc: () => ({
      get: getFn || (async () => ({ exists: false, data: () => null })),
      set: async () => {},
      onSnapshot: () => () => {}
    })
  };
}

const userOk = { id: async () => 'u1' };

function build(claude, extra) {
  const reasons = [];
  const store = DojoStorage.createStore(Object.assign({
    courseId: COURSE,
    dojo,
    now: () => 1000000,
    localStorage: mockLocal(),
    claude,
    onStatus: () => {},
    onRemoteChange: () => {},
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    onReason: (r) => reasons.push(r)
  }, extra || {}));
  return { store, reasons };
}

async function loadReason(claude, extra) {
  const { store, reasons } = build(claude, extra);
  await store.load();
  assert.ok(store.reason, 'store.reason is set after load');
  assert.strictEqual(reasons[reasons.length - 1], store.reason, 'opts.onReason got the same object');
  return store.reason;
}

test('no-claude: missing claude records step no-claude', async () => {
  const r = await loadReason(null);
  assert.strictEqual(r.step, 'no-claude');
});

test('no-use: claude.use rejects records step no-use', async () => {
  const r = await loadReason(claudeUse(() => { throw new Error('nope'); }));
  assert.strictEqual(r.step, 'no-use');
});

test('db-null: db capability resolves null records step db-null', async () => {
  const r = await loadReason(claudeUse((n) => (n === 'db' ? null : userOk)));
  assert.strictEqual(r.step, 'db-null');
});

test('user-null: user capability resolves null records step user-null', async () => {
  const r = await loadReason(claudeUse((n) => (n === 'db' ? dbOk() : null)));
  assert.strictEqual(r.step, 'user-null');
});

test('no-uid: empty uid records step no-uid', async () => {
  const r = await loadReason(claudeUse((n) => (n === 'db' ? dbOk() : { id: async () => '' })));
  assert.strictEqual(r.step, 'no-uid');
});

test('open-error: a failing open records step open-error with the error code', async () => {
  const failing = dbOk(async () => { throw { code: 'boom' }; });
  const r = await loadReason(claudeUse((n) => (n === 'db' ? failing : userOk)));
  assert.strictEqual(r.step, 'open-error');
  assert.strictEqual(r.detail, 'boom');
});

test('refused: a remote of another course records step refused with code foreign', async () => {
  const otherCourse = dbOk(async () => ({ exists: true, data: () => ({ course: 'other-course', items: {} }) }));
  const r = await loadReason(claudeUse((n) => (n === 'db' ? otherCourse : userOk)));
  assert.strictEqual(r.step, 'refused');
  assert.strictEqual(r.detail, 'foreign');
});

test('write-error: a failed write records step write-error with the error code', async () => {
  const failingSet = {
    doc: () => ({
      get: async () => ({ exists: false, data: () => null }),
      set: async () => { throw { code: 'permission-denied' }; },
      onSnapshot: () => () => {}
    })
  };
  const { store, reasons } = build(claudeUse((n) => (n === 'db' ? failingSet : userOk)));
  await store.load();
  store.update((d) => { d.items.a = { s: 1, due: 2, ok: 1, bad: 0, last: 1 }; });
  await store.flush();
  assert.strictEqual(store.reason.step, 'write-error');
  assert.strictEqual(store.reason.detail, 'permission-denied');
  assert.strictEqual(reasons[reasons.length - 1], store.reason);
});

test('ok: attached cloud records step ok', async () => {
  const r = await loadReason(claudeUse((n) => (n === 'db' ? dbOk() : userOk)));
  assert.strictEqual(r.step, 'ok');
});

test('detail is cut to 200 characters', async () => {
  const longCode = 'x'.repeat(300);
  const failing = dbOk(async () => { throw { code: longCode }; });
  const r = await loadReason(claudeUse((n) => (n === 'db' ? failing : userOk)));
  assert.strictEqual(r.detail.length, 200);
});

// localStorage whose setItem always throws, so a local write fails and the store calls failed().
function failingLocal() {
  return { getItem: () => null, setItem: () => { throw new Error('quota'); } };
}

test('local write failure without a reason records step local-error', async () => {
  const { store, reasons } = build(null, { localStorage: failingLocal() });
  store.update((d) => { d.items.a = { s: 1, due: 2, ok: 1, bad: 0, last: 1 }; });
  assert.strictEqual(store.reason.step, 'local-error');
  assert.strictEqual(store.reason.detail, '');
  assert.strictEqual(store.status, 'error');
  assert.strictEqual(reasons[reasons.length - 1], store.reason);
});

test('local write failure after an ok reason records step local-error', async () => {
  const { store } = build(claudeUse((n) => (n === 'db' ? dbOk() : userOk)), { localStorage: failingLocal() });
  await store.load();
  assert.strictEqual(store.reason.step, 'ok');
  store.update((d) => { d.items.a = { s: 1, due: 2, ok: 1, bad: 0, last: 1 }; });
  assert.strictEqual(store.reason.step, 'local-error');
});

test('local write failure keeps an existing reason', async () => {
  const { store } = build(null, { localStorage: failingLocal() });
  await store.load();
  assert.strictEqual(store.reason.step, 'no-claude');
  store.update((d) => { d.items.a = { s: 1, due: 2, ok: 1, bad: 0, last: 1 }; });
  assert.strictEqual(store.reason.step, 'no-claude');
});

test('uid path from an error message never reaches the reason', async () => {
  const failing = dbOk(async () => { throw { message: 'data/users/uid-SECRET123/progress-demo', code: 'boom' }; });
  const r = await loadReason(claudeUse((n) => (n === 'db' ? failing : { id: async () => 'uid-SECRET123' })));
  assert.strictEqual(r.detail, 'boom');
  assert.ok(!JSON.stringify(r).includes('SECRET123'));
});
