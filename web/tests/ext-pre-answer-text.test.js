'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function ext() {
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  return sb.DojoExt;
}

test('preAnswerText returns the text unchanged without a hook', () => {
  assert.strictEqual(ext().preAnswerText({ id: 'a' }, 'x\n\ny'), 'x\n\ny');
});

test('preAnswerText applies the registered hook; non-string or throwing hook falls back to the text', () => {
  const E = ext();
  E.registerPreAnswerText((item, t) => t.split('\n\n')[0]);
  assert.strictEqual(E.preAnswerText({ id: 'a' }, 'x\n\ny'), 'x');
  E.registerPreAnswerText(() => 5);
  assert.strictEqual(E.preAnswerText({ id: 'a' }, 'x'), 'x');
  E.registerPreAnswerText(() => { throw new Error('boom'); });
  assert.strictEqual(E.preAnswerText({ id: 'a' }, 'x'), 'x');
});
