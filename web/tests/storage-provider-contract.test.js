'use strict';
const nodeTest = require('node:test');
const assert = require('node:assert');
const { createFakeProvider } = require('./storage-fake-provider.js');
const adapters = require('../storage/adapters.js');

const COURSE = 'contract-course';
const KEY = 'progress';

/**
 * Contract every storage provider must pass. makeProvider(opts) -> { provider, injectError(code, n) }.
 * opts.absent: the provider must reject openRef with {kind:'absent'} (capability missing).
 * injectError: makes the next n writes fail with the given error code (e.g. 'unavailable').
 * caps.conflicts / caps.errors / caps.absent (default true): false leaves out the stale-write, the
 * error-injection (retry, fatal) and the absent-capability tests for a provider that cannot express them.
 */
function runContract(label, makeProvider, caps) {
  const c = Object.assign({ conflicts: true, errors: true, absent: true }, caps);
  const test = (name, fn) => nodeTest(label + ': ' + name, fn);
  const when = (on, name, fn) => { if (on) test(name, fn); };
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

  when(c.conflicts, 'a write based on a stale version is rejected with a conflict', async () => {
    const { provider } = makeProvider({});
    const a = await provider.openRef({ courseId: COURSE, key: 'conflict' });
    const b = await provider.openRef({ courseId: COURSE, key: 'conflict' });
    await a.ref.set({ v: 1, t: 1 }, a.snap.version);
    await assert.rejects(b.ref.set({ v: 1, t: 2 }, b.snap.version), (e) => e.kind === 'refused' && e.code === 'conflict');
    const latest = await provider.openRef({ courseId: COURSE, key: 'conflict' });
    assert.strictEqual(latest.snap.data().t, 1);
  });

  when(c.errors, 'offline (code unavailable) is retried by adapters.setWithRetry and then saves', async () => {
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

  when(c.errors, 'a non-retryable error is not retried and surfaces to the caller', async () => {
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

  when(c.absent, 'absent capability: openRef rejects with {kind:"absent"}', async () => {
    const { provider } = makeProvider({ absent: true });
    await assert.rejects(provider.openRef({ courseId: COURSE, key: KEY }), (e) => e.kind === 'absent');
  });
}

/*
 * Built-in adapters run through the same contract. The built-in artifact and local paths store
 * no version (C5: stored shape unchanged), so the stale-write conflict is a capability of versioned
 * providers only; caps.conflicts false leaves out that one test. The local adapter has no error
 * injection and no absent capability. Adding a version precondition to the live paths is a separate,
 * reviewed change.
 */
function memDb(pendingErrors) {
  const docs = new Map();
  function doc(path) {
    return {
      get() { const d = docs.get(path); return Promise.resolve({ exists: d !== undefined, data() { return JSON.parse(JSON.stringify(d)); } }); },
      set(body) {
        return Promise.resolve().then(() => {
          if (pendingErrors.length) throw { code: pendingErrors.shift() };
          docs.set(path, JSON.parse(JSON.stringify(body)));
        });
      }
    };
  }
  return { doc };
}

function artifactProvider(opts) {
  const pending = [];
  const db = memDb(pending);
  const claude = {
    use(name) {
      if (opts.absent) return Promise.resolve(null);
      return Promise.resolve(name === 'db' ? db : { id: () => 'u1' });
    }
  };
  const s = { courseId: COURSE, claude, warn() {} };
  const provider = { name: 'artifact', openRef: () => adapters.dbAdapter(s).openRef() };
  return { provider, injectError: (code, n) => { for (let i = 0; i < n; i++) pending.push(code); } };
}

function localProvider() {
  const mem = new Map();
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
  const s = {
    ls, key: KEY, now: () => 0, warn() {},
    sanitize: (d) => d, withCourse: (d) => d, foreignCourse: () => false
  };
  const local = adapters.localAdapter(s);
  const provider = {
    name: 'local',
    openRef() {
      const d = local.readLocal();
      const ref = {
        get: () => Promise.resolve({ exists: !!local.readLocal(), data: () => local.readLocal() }),
        set: (body) => Promise.resolve().then(() => { local.writeLocal(body); })
      };
      return Promise.resolve({
        ref, snap: { exists: !!d, data: () => d }, partRef: () => ref, partSnaps: []
      });
    }
  };
  return { provider };
}

runContract('fake provider', (opts) => {
  const provider = createFakeProvider({ absent: !!opts.absent });
  return { provider, injectError: (code, n) => provider.injectError(code, n) };
});
runContract('built-in artifact', artifactProvider, { conflicts: false });
runContract('built-in local', localProvider, { conflicts: false, errors: false, absent: false });
