'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ext = require('../ext.js');

const gap = (...answers) => ({ type: 'gap', answers });
const MSG = 'use the course script';

test.beforeEach(() => ext.reset());

test('blocks Latin input when an accepted answer is in a listed script', () => {
  ext.useInputScript(['cyrillic'], MSG);
  assert.deepStrictEqual(ext.beforeSubmit(gap('привет'), { text: 'privet' }), { message: MSG });
  assert.strictEqual(ext.beforeSubmit(gap('привет'), { text: 'привет' }), null);
});

test('non-latin covers every listed script; Latin answers are never blocked', () => {
  ext.useInputScript(['non-latin'], MSG);
  for (const a of ['日本', 'にほん', 'カナ', 'γειά', 'مرحبا', 'שלום', '안녕', 'नमस्ते', 'สวัสดี']) {
    assert.deepStrictEqual(ext.beforeSubmit(gap(a), { text: 'x' }), { message: MSG }, a);
  }
  assert.strictEqual(ext.beforeSubmit(gap('hello'), { text: 'hallo' }), null);
});

test('only listed scripts count', () => {
  ext.useInputScript(['han'], MSG);
  assert.strictEqual(ext.beforeSubmit(gap('привет'), { text: 'privet' }), null);
  assert.deepStrictEqual(ext.beforeSubmit(gap('привет', '日本'), { text: 'x' }), { message: MSG });
});

test('cloze blanks and multi-blank inputs are checked', () => {
  ext.useInputScript(['non-latin'], MSG);
  const cloze = { type: 'cloze', parts: ['a ', ['に', 'ni'], ' b'] };
  assert.deepStrictEqual(ext.beforeSubmit(cloze, { inputs: ['ni'] }), { message: MSG });
  assert.strictEqual(ext.beforeSubmit(cloze, { inputs: ['に'] }), null);
});

test('other item types, no option, unknown names: no block; guard never alters input', () => {
  assert.strictEqual(ext.beforeSubmit(gap('日本'), { text: 'x' }), null);
  assert.strictEqual(ext.useInputScript(['klingon'], MSG), false);
  assert.strictEqual(ext.beforeSubmit(gap('日本'), { text: 'x' }), null);
  ext.useInputScript(['han'], MSG);
  assert.strictEqual(ext.beforeSubmit({ type: 'choice', options: ['日本'] }, { text: 'x' }), null);
  const input = { text: 'x' };
  ext.beforeSubmit(gap('日本'), input);
  assert.deepStrictEqual(input, { text: 'x' });
});

test('script guard runs before the plugin guard; plugin guard still works without it', () => {
  ext.registerBeforeSubmit(() => ({ message: 'plugin' }));
  assert.deepStrictEqual(ext.beforeSubmit(gap('a'), {}), { message: 'plugin' });
  ext.useInputScript(['han'], MSG);
  assert.deepStrictEqual(ext.beforeSubmit(gap('日本'), { text: 'x' }), { message: MSG });
});
