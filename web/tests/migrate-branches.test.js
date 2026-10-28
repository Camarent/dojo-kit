'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../migrate.js');

const items = [{ id: 'b', supersedes: ['a'] }, { id: 'a', status: 'retired' }, null, { id: 'c' }];
function quiet(fn) {
  const orig = console.warn;
  const msgs = [];
  console.warn = (m) => msgs.push(m);
  try { fn(msgs); } finally { console.warn = orig; }
}

test('migrate: no supersedes link never calls core', () => {
  const dojo = { call() { throw new Error('called'); } };
  assert.strictEqual(M.create({ dojo, items: [{ id: 'x', status: 'retired' }] })({ a: 1 }), null);
  assert.strictEqual(M.create({ dojo }).call(null, {}), null);
});

test('migrate: returns doc, null doc, missing doc field', () => {
  const dojo = { call: (n, a) => (a.doc.fail ? {} : { doc: { ok: 1 } }) };
  const m = M.create({ dojo, items });
  assert.strictEqual(m(null), null);
  assert.deepStrictEqual(m({}), { ok: 1 });
  assert.strictEqual(m({ fail: 1 }), null);
});

test('migrate: refusal and throw disable with a warning', () => {
  quiet((msgs) => {
    const m = M.create({ dojo: { call: () => ({ error: 'e', message: 'msg' }) }, items });
    assert.strictEqual(m({}), null);
    assert.strictEqual(m({}), null);
    assert.deepStrictEqual(msgs, ['progress migration disabled: msg']);
    const m2 = M.create({ dojo: { call: () => { throw new Error('boom'); } }, items });
    assert.strictEqual(m2({}), null);
    const m3 = M.create({ dojo: { call: () => null }, items });
    assert.strictEqual(m3({}), null);
    const m4 = M.create({ dojo: { call: () => ({ error: 'only' }) }, items });
    assert.strictEqual(m4({}), null);
    const m5 = M.create({ dojo: { call: () => { throw null; } }, items });
    assert.strictEqual(m5({}), null);
  });
});
