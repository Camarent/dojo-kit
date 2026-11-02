'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadBundle, bundleScripts } = require('./load-bundle.js');

// Vendor, ext and ui scripts only; the rest of the bundle needs a DOM.
const APP_FILES = bundleScripts().filter((f) => f.startsWith('ui/') || f.startsWith('ext') || f.startsWith('vendor/'));

function ext() {
  const warns = [];
  const sb = { console: { warn(...a) { warns.push(a); }, log() {} } };
  loadBundle(sb, { only: APP_FILES.filter((f) => f.startsWith('ext')) });
  return { E: sb.DojoExt, warns };
}

function provider(name) {
  return { name, openRef() { return Promise.resolve(null); } };
}

test('registerStorage stores the provider and getStorageProvider returns it', () => {
  const { E } = ext();
  assert.strictEqual(E.getStorageProvider(), null);
  const p = provider('a');
  E.registerStorage(p);
  assert.strictEqual(E.getStorageProvider(), p);
});

test('a second registerStorage replaces the provider and warns', () => {
  const { E, warns } = ext();
  const a = provider('a');
  const b = provider('b');
  E.registerStorage(a);
  assert.strictEqual(warns.length, 0);
  E.registerStorage(b);
  assert.strictEqual(E.getStorageProvider(), b);
  assert.strictEqual(warns.length, 1);
});

test('registerStorage rejects a value without openRef', () => {
  const { E } = ext();
  assert.throws(() => E.registerStorage(null), /openRef/);
  assert.throws(() => E.registerStorage({}), /openRef/);
  assert.strictEqual(E.getStorageProvider(), null);
});

test('reset clears the storage provider', () => {
  const { E } = ext();
  E.registerStorage(provider('a'));
  E.reset();
  assert.strictEqual(E.getStorageProvider(), null);
});

// App wiring: start() must hand the registered provider to DojoStorage.createStore.
// createStore is stubbed to record its options and to fail the load, so start() stops there.
function startApp(registerProvider) {
  const created = [];
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: APP_FILES });
  vm.runInContext('preact.render = function () {};', sb);
  sb.DojoStorage = {
    createStore(o) {
      created.push(o);
      return { load() { return Promise.reject(new Error('stop')); } };
    }
  };
  sb.DojoMigrate = { create() { return null; } };
  if (registerProvider) sb.DojoExt.registerStorage(registerProvider);
  const content = { v: 1, version: 't', lock: [], items: [], course: { id: 'c', title: 'C', units: [], exams: [] } };
  return Promise.resolve()
    .then(() => sb.DojoApp.start({ root: {}, content, dojo: {}, lang: 'en', i18n: null, win: {} }))
    .catch(() => {})
    .then(() => created);
}

test('app passes the registered storage provider to createStore', async () => {
  const p = provider('a');
  const created = await startApp(p);
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].storageProvider, p);
});

test('app without a registered provider passes null (default unchanged)', async () => {
  const created = await startApp(null);
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].storageProvider, null);
});
