'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { topicHelpers } = require('../session/topics.js');

// Fake session context: one course with topics; dojo.call answers itemAspects with the map of item a.
function ctxWith(topics) {
  return {
    course: { topics: topics },
    items: [{ id: 'a', unit: 'u1', tags: ['meaning'] }],
    store: { doc: { settings: {} } },
    dojo: { call: function () { return { a: 'meaning' }; } },
  };
}

function argsOf(topics, uncapped) {
  const h = {};
  topicHelpers(ctxWith(topics), h);
  return h.topicArgs(uncapped);
}

test('topicArgs passes course poolAspects as pools', () => {
  const args = argsOf({ units: ['u1'], aspects: [{ id: 'meaning', tags: ['meaning'] }], poolAspects: ['meaning'] }, false);
  assert.deepStrictEqual(args.pools, ['meaning']);
});

test('topicArgs gives empty pools when the course has no poolAspects', () => {
  const args = argsOf({ units: ['u1'], aspects: [{ id: 'meaning', tags: ['meaning'] }] }, false);
  assert.deepStrictEqual(args.pools, []);
});

test('topicArgs keeps aspects and cap next to pools', () => {
  const args = argsOf({ units: ['u1'], aspects: [{ id: 'meaning', tags: ['meaning'] }], poolAspects: ['meaning'], sessionCap: 5 }, false);
  assert.deepStrictEqual(args.aspects, { a: 'meaning' });
  assert.strictEqual(args.cap, 5);
});

test('topicArgs uncapped (home count) has cap null and still passes pools', () => {
  const args = argsOf({ units: ['u1'], aspects: [{ id: 'meaning', tags: ['meaning'] }], poolAspects: ['meaning'], sessionCap: 5 }, true);
  assert.strictEqual(args.cap, null);
  assert.deepStrictEqual(args.pools, ['meaning']);
});

test('topicArgs is null without course topics', () => {
  const h = {};
  topicHelpers(ctxWith(undefined), h);
  assert.strictEqual(h.topicArgs(false), null);
});
