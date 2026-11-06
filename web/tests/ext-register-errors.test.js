'use strict';
const test = require('node:test');
const assert = require('node:assert');
const reg = require('../ext/registry.js');

test('registerIntro / registerPreAnswerText require a function', () => {
  assert.throws(() => reg.registerIntro('x'), /registerIntro: function required/);
  assert.throws(() => reg.registerPreAnswerText(null), /registerPreAnswerText: function required/);
  reg.registerIntro(() => null);
  reg.registerPreAnswerText(() => null);
  reg.registerIntro(() => null);
});

test('preAnswerText: no hook, string result, non-string result, throwing hook', () => {
  const ext = require('../ext.js');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.strictEqual(ext.preAnswerText({ id: 'a' }, 'txt'), 'txt');
    ext.registerPreAnswerText((it, t) => t + '!');
    assert.strictEqual(ext.preAnswerText({ id: 'a' }, 'txt'), 'txt!');
    ext.registerPreAnswerText(() => 5);
    assert.strictEqual(ext.preAnswerText({ id: 'a' }, 'txt'), 'txt');
    ext.registerPreAnswerText(() => { throw new Error('x'); });
    assert.strictEqual(ext.preAnswerText({ id: 'a' }, 'txt'), 'txt');
  } finally { console.warn = warn; }
});
