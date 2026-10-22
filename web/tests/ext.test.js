'use strict';
const test = require('node:test');
const assert = require('node:assert');

const ext = require('../ext.js');
const h = (tag, props, ...kids) => ({ tag, props, kids });
global.preact = { h };

const rubyDef = {
  render: (s, hh) => hh('b', null, s.toUpperCase()),
  plain: (s) => s.toLowerCase(),
};

test.beforeEach(() => ext.reset());

test('without a hook text and plain return the input unchanged', () => {
  assert.strictEqual(ext.text('a <b>'), 'a <b>');
  assert.strictEqual(ext.plain('a <b>'), 'a <b>');
  assert.strictEqual(ext.beforeSubmit({}, { text: 'x' }), null);
  assert.strictEqual(ext.detail({}, {}), null);
});

test('use selects a registered markup; render builds vnodes and plain gives text', () => {
  ext.registerMarkup('up', rubyDef);
  assert.strictEqual(ext.use('up'), true);
  assert.deepStrictEqual(ext.text('ab'), { tag: 'b', props: null, kids: ['AB'] });
  assert.strictEqual(ext.plain('AB'), 'ab');
});

test('registering a markup does not activate it', () => {
  ext.registerMarkup('up', rubyDef);
  assert.strictEqual(ext.text('ab'), 'ab');
});

test('unknown markup name warns and falls back to plain text', () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try {
    assert.strictEqual(ext.use('nope'), false);
  } finally {
    console.warn = orig;
  }
  assert.strictEqual(warns.length, 1);
  assert.strictEqual(ext.text('ab'), 'ab');
});

test('a throwing render falls back to the original text', () => {
  ext.registerMarkup('bad', { render() { throw new Error('x'); }, plain() { throw new Error('x'); } });
  const orig = console.warn;
  console.warn = () => {};
  try {
    ext.use('bad');
    assert.strictEqual(ext.text('ab'), 'ab');
    assert.strictEqual(ext.plain('ab'), 'ab');
  } finally {
    console.warn = orig;
  }
});

test('registerMarkup rejects incomplete definitions', () => {
  assert.throws(() => ext.registerMarkup('', rubyDef));
  assert.throws(() => ext.registerMarkup('x', { render() {} }));
});

test('beforeSubmit can block and otherwise passes; returned input is ignored', () => {
  ext.registerBeforeSubmit((item, input) => {
    if (input.text === 'bad') return { message: 'no latin' };
    if (input.text === 'ア') return { input: { text: 'あ' } };
    return null;
  });
  assert.deepStrictEqual(ext.beforeSubmit({}, { text: 'bad' }), { message: 'no latin' });
  assert.strictEqual(ext.beforeSubmit({}, { text: 'ア' }), null);
  assert.strictEqual(ext.beforeSubmit({}, { text: 'ok' }), null);
});

test('before_submit_mutation_does_not_change_graded_input', () => {
  ext.registerBeforeSubmit((item, input) => {
    if (input.text) input.text = 'mutated';
    if (item.id) item.id = 'mutated';
    return null;
  });
  const item = { id: 'a-1', type: 'choice' };
  const input = { text: 'original' };
  const originalItem = JSON.parse(JSON.stringify(item));
  const originalInput = JSON.parse(JSON.stringify(input));
  ext.beforeSubmit(item, input);
  assert.deepStrictEqual(item, originalItem);
  assert.deepStrictEqual(input, originalInput);
});

test('detail returns the hook vnode or null', () => {
  ext.registerDetail((item, ctx) => (item.id === 'a' ? ctx.h('i', null, 'x') : undefined));
  assert.deepStrictEqual(ext.detail({ id: 'a' }, { h }), { tag: 'i', props: null, kids: ['x'] });
  assert.strictEqual(ext.detail({ id: 'b' }, { h }), null);
});

test('before_submit_guard_still_runs_with_undefined_input', () => {
  let seen = 'unset';
  ext.registerBeforeSubmit((item, input) => { seen = input; return { message: 'blocked' }; });
  assert.deepStrictEqual(ext.beforeSubmit({ a: 1 }, undefined), { message: 'blocked' });
  assert.strictEqual(seen, undefined);
});
