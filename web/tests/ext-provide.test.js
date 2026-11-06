'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle, bundleScripts } = require('./load-bundle.js');

// Vendor, ext and ui scripts only; the rest of the bundle needs a DOM.
const APP_FILES = bundleScripts().filter((f) => f.startsWith('ui/') || f.startsWith('ext') || f.startsWith('vendor/'));

function ext() {
  const warns = [];
  const sb = { console: { warn(...a) { warns.push(a); }, log() {} } };
  loadBundle(sb, { only: APP_FILES.filter((f) => f.startsWith('ext')) });
  return { E: sb.DojoExt, warns };
}

test('provide adds the function as DojoExt[name]', () => {
  const { E, warns } = ext();
  const fn = () => 'hi';
  assert.strictEqual(E.provide('greet', fn), true);
  assert.strictEqual(E.greet, fn);
  assert.strictEqual(warns.length, 0);
});

test('provide refuses a core name and keeps the core function', () => {
  const { E, warns } = ext();
  const core = E.getSetting;
  assert.strictEqual(E.provide('getSetting', () => 'x'), false);
  assert.strictEqual(E.getSetting, core);
  assert.strictEqual(warns.length, 1);
});

test('provide keeps the first of two provides with the same name', () => {
  const { E, warns } = ext();
  const a = () => 'a';
  const b = () => 'b';
  assert.strictEqual(E.provide('pick', a), true);
  assert.strictEqual(E.provide('pick', b), false);
  assert.strictEqual(E.pick, a);
  assert.strictEqual(warns.length, 1);
});

test('provide rejects a bad name or a non-function', () => {
  const { E } = ext();
  assert.throws(() => E.provide('', () => 1), /name required/);
  assert.throws(() => E.provide('x', 'nope'), /function required/);
});

test('registerFeedbackRows: the hook result replaces rows; null when unset or throwing', () => {
  const { E, warns } = ext();
  assert.strictEqual(E.feedbackRows({ prompt: 'p' }, {}), null);
  const rows = [{ kanji: '日', meaning: 'day', on: ['ニチ'], kun: [] }];
  E.registerFeedbackRows((item, ctx) => (ctx.examMode ? null : rows));
  assert.deepStrictEqual(E.feedbackRows({ prompt: 'p' }, { examMode: false }), rows);
  assert.strictEqual(E.feedbackRows({ prompt: 'p' }, { examMode: true }), null);
  E.registerFeedbackRows(() => { throw new Error('boom'); });
  assert.strictEqual(E.feedbackRows({ prompt: 'p' }, {}), null);
  assert.strictEqual(warns.length, 1);
});

test('registerFeedbackRows rejects a non-function', () => {
  const { E } = ext();
  assert.throws(() => E.registerFeedbackRows(null), /function required/);
});

test('reset clears the feedback rows hook', () => {
  const { E } = ext();
  E.registerFeedbackRows(() => []);
  E.reset();
  assert.strictEqual(E.feedbackRows({}, {}), null);
});

test('provide refuses inherited and prototype names', () => {
  const { E, warns } = ext();
  for (const n of ['__proto__', 'toString', 'hasOwnProperty', 'constructor']) {
    assert.strictEqual(E.provide(n, () => 1), false, n);
  }
  assert.strictEqual(warns.length, 4);
});

test('useInputScript without input-script gives a clear error, not a null throw', () => {
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['ext/registry.js', 'ext.js'] });
  assert.throws(() => sb.DojoExt.useInputScript(['x']), /input-script.js is not loaded/);
});
