'use strict';

function groupCountsCase(name, course, stage) {
  return {
    name,
    input: {
      course,
      items: [{ id: 'a1', unit: 'k', entity: 'a', tags: [] }],
      records: { a1: { s: stage, due: 9999 } },
      now: 0
    },
    expect: { groups: {}, bars: [{ title: 'T', learned: 1, started: 0, total: 1 }] },
    source: 'spec'
  };
}

function makeGroupsCases() {
  const cases = [
    groupCountsCase('bar_learned_stage_from_course', { learnedStage: 2, bars: [{ title: 'T' }] }, 3),
    groupCountsCase('bar_learned_stage_bar_wins_over_course', { learnedStage: 5, bars: [{ title: 'T', learnedStage: 3 }] }, 3),
    groupCountsCase('bar_learned_stage_default_four', { bars: [{ title: 'T' }] }, 4)
  ];
  return { groups: [{ fn: 'groupCounts', cases }] };
}

module.exports = { makeGroupsCases };
