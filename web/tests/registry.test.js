'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const bundle = JSON.parse(read('bundle.json'));

function fresh() {
  delete require.cache[require.resolve('../types/registry.js')];
  return require('../types/registry.js');
}
const def = () => ({ Question() {}, canSubmit() { return true; }, initialState() { return {}; } });

test('register/get/names', () => {
  const R = fresh();
  assert.deepStrictEqual(R.names(), []);
  assert.strictEqual(R.get('x'), null);
  const d = def();
  R.register('a', d);
  R.register('b', def());
  assert.strictEqual(R.get('a'), d);
  assert.deepStrictEqual(R.names(), ['a', 'b']);
  R.register('a', def());
  assert.deepStrictEqual(R.names(), ['a', 'b']);
});

test('register rejects incomplete definitions', () => {
  const R = fresh();
  assert.throws(() => R.register('', def()));
  assert.throws(() => R.register('a', { Question() {} }));
  assert.throws(() => R.register('a', null));
  assert.strictEqual(R.get('toString'), null);
});

test('every file listed in bundle.json exists', () => {
  ['scripts', 'styles', 'licenses'].forEach((k) => (bundle[k] || []).filter((f) => f !== '@course').forEach((f) => {
    assert.ok(fs.existsSync(path.join(web, f)), f + ' missing');
  }));
});

test('type scripts load before ui/app.js in registry, choice, gap, card order', () => {
  const s = bundle.scripts;
  const order = s.filter((f) => /^types\/(registry|choice|gap|card)\.js$|^ui\/app\.js$/.test(f)).map((f) => path.basename(f, '.js'));
  assert.deepStrictEqual(order, ['registry', 'choice', 'gap', 'card', 'app']);
});

test('ui/app.js holds no question-type internals', () => {
  const app = read('ui/app.js');
  ['btn-known', 'btn-again"', 'btn-show', 'gap-input', 'gap-form', 'card-back', 'option-', "'choice'", "'gap'", "'card'"].forEach((needle) => {
    assert.ok(!app.includes(needle), 'app.js still references ' + needle);
  });
});
