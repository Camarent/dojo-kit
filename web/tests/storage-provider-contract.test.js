'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createFakeProvider } = require('./storage-fake-provider.js');
const adapters = require('../storage/adapters.js');

const COURSE = 'contract-course';
const KEY = 'progress';

/**
 * Contract every storage provider must pass. makeProvider(opts) -> { provider, injectError(code, n) }.
 * opts.absent: the provider must reject openRef with {kind:'absent'} (capability missing).
 * injectError: makes the next n writes fail with the given error code (e.g. 'unavailable').
 */
function runContract(makeProvider) {
  test('openRef resolves { ref, snap, partRef, partSnaps } with the expected shape', async () => {
    const { provider } = makeProvider({});
    assert.strictEqual(typeof provider.name, 'string');
    const o = await provider.openRef({ courseId: COURSE, key: KEY });
    assert.strictEqual(typeof o.ref.get, 'function');
    assert.strictEqual(typeof o.ref.set, 'function');
    assert.strictEqual(typeof o.snap.exists, 'boolean');
    assert.strictEqual(typeof o.partRef, 'function');
    assert.ok(Array.isArray(o.partSnaps));
  });

  test('load after save returns the saved doc unchanged (v:1)', async () => {
    const { provider } = makeProvider({});
    const first = await provider.openRef({ courseId: COURSE, key: KEY });
    const body = { v: 1, t: 5, items: { a: { n: 1 } }, settings: {} };
    await first.ref.set(body, first.snap.version);
    const again = await provider.openRef({ courseId: COURSE, key: KEY });
    assert.strictEqual(again.snap.exists, true);
    assert.deepStrictEqual(again.snap.data(), body);
    assert.strictEqual(again.snap.data().v, 1);
  });

  test('a write based on a stale version is rejected with a conflict', async () => {
    const { provider } = makeProvider({});
    const a = await provider.openRef({ courseId: COURSE, key: 'conflict' });
    const b = await provider.openRef({ courseId: COURSE, key: 'conflict' });
    await a.ref.set({ v: 1, t: 1 }, a.snap.version);
    await assert.rejects(b.ref.set({ v: 1, t: 2 }, b.snap.version), (e) => e.kind === 'refused' && e.code === 'conflict');
    const latest = await provider.openRef({ courseId: COURSE, key: 'conflict' });
    assert.strictEqual(latest.snap.data().t, 1);
  });

  test('offline (code unavailable) is retried by adapters.setWithRetry and then saves', async () => {
    const { provider, injectError } = makeProvider({});
    const o = await provider.openRef({ courseId: COURSE, key: 'retry' });
    injectError('unavailable', 1);
    const s = {
      courseId: COURSE,
      random: () => 0,
      setTimer: (fn) => setImmediate(fn),
      clearTimer: (h) => clearImmediate(h),
      retryTimer: null,
      retryCancel: null,
      ref: o.ref,
      warn() {},
    };
    const db = adapters.dbAdapter(s);
    await db.setWithRetry(o.ref, { v: 1, t: 9 });
    const again = await provider.openRef({ courseId: COURSE, key: 'retry' });
    assert.deepStrictEqual(again.snap.data(), { v: 1, t: 9 });
  });

  test('a non-retryable error is not retried and surfaces to the caller', async () => {
    const { provider, injectError } = makeProvider({});
    const o = await provider.openRef({ courseId: COURSE, key: 'fatal' });
    injectError('revoked', 1);
    const s = {
      courseId: COURSE,
      random: () => 0,
      setTimer: (fn) => setImmediate(fn),
      clearTimer: (h) => clearImmediate(h),
      retryTimer: null,
      retryCancel: null,
      ref: o.ref,
      warn() {},
    };
    await assert.rejects(adapters.dbAdapter(s).setWithRetry(o.ref, { v: 1 }), (e) => e.code === 'revoked');
  });

  test('absent capability: openRef rejects with {kind:"absent"}', async () => {
    const { provider } = makeProvider({ absent: true });
    await assert.rejects(provider.openRef({ courseId: COURSE, key: KEY }), (e) => e.kind === 'absent');
  });
}

runContract((opts) => {
  const provider = createFakeProvider({ absent: !!opts.absent });
  return { provider, injectError: (code, n) => provider.injectError(code, n) };
});
