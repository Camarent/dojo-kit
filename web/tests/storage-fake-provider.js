'use strict';
/*
 * In-memory storage provider for tests. Implements the provider interface from the
 * storage seam (see web/tests/storage-provider-contract.test.js, runContract):
 *   provider = { name, openRef({courseId, key}) -> Promise<{ref, snap, partRef, partSnaps}> }
 *   ref.get() -> Promise<snap>   snap = { exists, version, data() }
 *   ref.set(body, expect?) -> Promise<void>; expect = version the writer read; mismatch rejects.
 * Errors: {kind:'absent'} when the capability is missing; {kind:'refused', code:'conflict'} on a
 * stale version; {code:'unavailable'} for injected offline failures.
 * Test controls (not part of the interface): injectError(code, n) fails the next n writes;
 * opts.absent makes openRef reject with {kind:'absent'}; opts.ignoreVersion disables the conflict check.
 */

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function createFakeProvider(opts) {
  const o = opts || {};
  const stores = new Map();
  const pending = [];

  function store(key) {
    if (!stores.has(key)) stores.set(key, { doc: undefined, version: 0 });
    return stores.get(key);
  }

  function snapOf(st) {
    return { exists: st.version > 0, version: st.version, data() { return clone(st.doc); } };
  }

  function makeRef(st) {
    return {
      get() { return Promise.resolve(snapOf(st)); },
      set(body, expect) {
        return Promise.resolve().then(function () {
          if (pending.length) throw { code: pending.shift() };
          if (!o.ignoreVersion && expect !== undefined && expect !== st.version) {
            throw { kind: 'refused', code: 'conflict' };
          }
          st.doc = clone(body);
          st.version += 1;
        });
      }
    };
  }

  return {
    name: 'fake',
    injectError(code, n) { for (let i = 0; i < (n || 1); i++) pending.push(code); },
    openRef(args) {
      if (o.absent) return Promise.reject({ kind: 'absent', step: 'no-capability' });
      const key = args.courseId + '/' + args.key;
      const st = store(key);
      const ref = makeRef(st);
      const parts = new Map();
      function partRef(k) {
        if (!parts.has(k)) parts.set(k, makeRef(store(key + '#' + k)));
        return parts.get(k);
      }
      return ref.get().then(function (snap) {
        return { ref: ref, snap: snap, partRef: partRef, partSnaps: [] };
      });
    }
  };
}

module.exports = { createFakeProvider };
