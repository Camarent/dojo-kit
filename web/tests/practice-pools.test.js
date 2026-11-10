'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { practiceHelpers } = require('../session/weighted-queue.js');
const { topicHelpers } = require('../session/topics.js');

// Synthetic items: topic t1 has two pattern + one order item, topic t2 has one pattern item.
const ASP = { p1: 'pattern', p2: 'pattern', o1: 'order', q1: 'pattern' };
const ENT = { p1: 't1', p2: 't1', o1: 't1', q1: 't2' };

function queueOf(poolAspects) {
  const items = Object.keys(ASP).map((id) => ({ id, unit: 'u', tags: [] }));
  const ctx = {
    course: { topics: { units: ['u'], poolAspects } },
    items,
    itemEntities: ENT,
    now: () => 1000,
    fn: {
      records: () => ({}),
      activeItems: () => items,
      onlyTagsKeep: (ids) => ids,
    },
    dojo: { call: (name) => (name === 'itemAspects' ? ASP : false) },
  };
  const h = { preferShared: (ids) => ids };
  practiceHelpers(ctx, h);
  topicHelpers(ctx, h);
  return h.practiceQueue({});
}

test('practice with poolAspects keeps one item per topic x aspect pool', () => {
  assert.deepStrictEqual(queueOf(['pattern', 'order']), ['p1', 'o1', 'q1']);
});

test('practice with poolAspects lets a topic give two items for two aspects', () => {
  const q = queueOf(['pattern', 'order']).filter((id) => ENT[id] === 't1');
  assert.deepStrictEqual(q.sort(), ['o1', 'p1']);
});

test('practice without poolAspects is unchanged', () => {
  assert.deepStrictEqual(queueOf(undefined), ['p1', 'p2', 'o1', 'q1']);
});
