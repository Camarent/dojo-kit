'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { checkOld } = require('../tools/check-progress.js');

const run = (o, n) => { const p = []; checkOld(o, n, p); return p; };

test('checkOld: type change, retire flips, answer change', () => {
  const old = { lock: { ids: ['a', 'b', 'c', 'd', 'g'], retired: ['b'], types: { a: 'choice' } }, items: [
    { id: 'a', type: 'choice', answer: 1 }, { id: 'g', type: 'gap', answers: ['x'] }, { id: 'c', type: 'choice', answer: 1 }] };
  const neu = { lock: { ids: ['a', 'b', 'c', 'g'], retired: ['c'], types: { a: 'gap' } }, items: [
    { id: 'a', type: 'gap', answer: 1 }, { id: 'g', type: 'gap', answers: ['y'] }, { id: 'c', type: 'choice', answer: 1 }] };
  const p = run(old, neu);
  assert.ok(p.includes('removed id: d'));
  assert.ok(p.includes('type changed: a choice -> gap'));
  assert.ok(p.includes('un-retired id: b'));
  assert.ok(p.includes('id became retired: c'));
  assert.ok(p.includes('answer changed: g x -> y'));
});

test('checkOld: object-form items, lockless ids, clean', () => {
  const o = { items: { a: { type: 'choice', answer: 2 } } };
  assert.deepStrictEqual(run(o, { items: { a: { type: 'choice', answer: 2 } }, lock: { ids: ['a'] } }), []);
  assert.ok(run(o, { items: {} }).includes('removed id: a'));
  assert.deepStrictEqual(run({}, {}), []);
});
