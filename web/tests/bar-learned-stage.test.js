'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { getDojo, NOW } = require('./fixtures.js');

async function barLearned(course) {
  const dojo = await getDojo();
  const out = dojo.call('groupCounts', {
    course,
    items: [{ id: 'a1', unit: 'k', entity: 'a', tags: [] }],
    records: { a1: { s: 3, due: NOW + 1e9 } },
    now: NOW
  });
  return out.bars[0].learned;
}

test('home bar uses course.learnedStage when the bar has none', async () => {
  assert.strictEqual(await barLearned({ learnedStage: 2, bars: [{ title: 'T' }] }), 1);
});

test('home bar learnedStage wins over course.learnedStage', async () => {
  assert.strictEqual(await barLearned({ learnedStage: 2, bars: [{ title: 'T', learnedStage: 5 }] }), 0);
});

test('home bar defaults to stage 4 without any learnedStage', async () => {
  assert.strictEqual(await barLearned({ bars: [{ title: 'T' }] }), 0);
});
