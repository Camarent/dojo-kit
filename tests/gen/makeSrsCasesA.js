'use strict';

const { T0, H, D, INTERVALS } = require('./const.js');
const { Fl } = require('./utils.js');
const { ref } = require('./ref.js');

function srsApplyAnswerPart1(kit) {
  kit.groups = [];

  // applyAnswer
  kit.applyAnswerCases = [];

  kit.applyAnswerCases.push({
    name: 'null_rec_correct',
    input: { rec: null, correct: true, now: T0 },
    expect: ref('applyAnswer', null, true, T0),
    source: 'reference'
  });

  kit.applyAnswerCases.push({
    name: 'null_rec_wrong',
    input: { rec: null, correct: false, now: T0 },
    expect: ref('applyAnswer', null, false, T0),
    source: 'reference'
  });

  for (let s = 0; s <= 5; s++) {
    const rec = { s: s, due: T0 - INTERVALS[s], ok: 1, bad: 0, last: T0 - INTERVALS[s] };
    kit.applyAnswerCases.push({
      name: `stage_${s}_correct`,
      input: { rec: rec, correct: true, now: T0 },
      expect: ref('applyAnswer', rec, true, T0),
      source: 'reference'
    });
  }

  kit.applyAnswerCases.push({
    name: 'stage_6_correct_capped',
    input: { rec: { s: 6, due: T0 - INTERVALS[6], ok: 1, bad: 0, last: T0 - INTERVALS[6] }, correct: true, now: T0 },
    expect: ref('applyAnswer', { s: 6, due: T0 - INTERVALS[6], ok: 1, bad: 0, last: T0 - INTERVALS[6] }, true, T0),
    source: 'reference'
  });

  kit.applyAnswerCases.push({
    name: 'stage_3_wrong_to_1',
    input: { rec: { s: 3, due: T0 - INTERVALS[3], ok: 1, bad: 0, last: T0 - INTERVALS[3] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 3, due: T0 - INTERVALS[3], ok: 1, bad: 0, last: T0 - INTERVALS[3] }, false, T0),
    source: 'reference'
  });

  kit.applyAnswerCases.push({
    name: 'stage_1_wrong_ok_gt_0_floor_1',
    input: { rec: { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1] }, false, T0),
    source: 'reference'
  });

  kit.applyAnswerCases.push({
    name: 'stage_1_wrong_ok_0_bad_0_to_0',
    input: { rec: { s: 1, due: T0 - INTERVALS[1], ok: 0, bad: 0, last: T0 - INTERVALS[1] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 0, bad: 0, last: T0 - INTERVALS[1] }, false, T0),
    source: 'reference'
  });

  kit.applyAnswerCases.push({
    name: 'stage_2_wrong_never_learned',
    input: { rec: { s: 2, due: T0 - INTERVALS[2], ok: 0, bad: 0, last: T0 - INTERVALS[2] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 2, due: T0 - INTERVALS[2], ok: 0, bad: 0, last: T0 - INTERVALS[2] }, false, T0),
    source: 'reference'
  });
}

function srsApplyPracticePart1(kit) {
  kit.applyAnswerCases.push({
    name: 'rec_with_extra_field_preserved',
    input: { rec: { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1], x: 1 }, correct: true, now: T0 },
    expect: ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1], x: 1 }, true, T0),
    source: 'reference'
  });

  // Custom kit.ladder spec cases for applyAnswer
  kit.ladder = [0, D, 2 * D];

  // stage 2 correct stays 2 with due = now + 2D
  kit.applyAnswerCases.push({
    name: 'custom_ladder_stage_2_correct',
    input: { rec: { s: 2, due: T0 - kit.ladder[2], ok: 1, bad: 0, last: T0 - kit.ladder[2] }, correct: true, now: T0, ladder: kit.ladder },
    expect: { s: 2, due: T0 + kit.ladder[2], ok: 2, bad: 0, last: T0 },
    source: 'spec'
  });

  // stage 2 wrong -> floor 1 (because ever learned: s>0) with due = now + D
  kit.applyAnswerCases.push({
    name: 'custom_ladder_stage_2_wrong',
    input: { rec: { s: 2, due: T0 - kit.ladder[2], ok: 1, bad: 0, last: T0 - kit.ladder[2] }, correct: false, now: T0, ladder: kit.ladder },
    expect: { s: 1, due: T0 + kit.ladder[1], ok: 1, bad: 1, last: T0 },
    source: 'spec'
  });

  // stage 0 correct -> stage 1 with due = now + D
  kit.applyAnswerCases.push({
    name: 'custom_ladder_stage_0_correct',
    input: { rec: { s: 0, due: T0 - kit.ladder[0], ok: 0, bad: 0, last: T0 - kit.ladder[0] }, correct: true, now: T0, ladder: kit.ladder },
    expect: { s: 1, due: T0 + kit.ladder[1], ok: 1, bad: 0, last: T0 },
    source: 'spec'
  });

  const floatRec = { s: 2, due: new Fl(T0 - INTERVALS[2]), ok: 1, bad: 0, last: new Fl(T0 - INTERVALS[2]) };
  kit.applyAnswerCases.push({
    name: 'float_due_correct',
    input: { rec: floatRec, correct: true, now: T0 },
    expect: { s: 3, due: T0 + INTERVALS[3], ok: 2, bad: 0, last: T0 },
    source: 'spec'
  });

  kit.applyAnswerCases.push({
    name: 'empty_ladder_null_rec_correct',
    input: { rec: null, correct: true, now: T0, ladder: [] },
    expect: { s: 0, due: T0, ok: 1, bad: 0, last: T0 },
    source: 'spec'
  });

  kit.groups.push({ fn: 'applyAnswer', cases: kit.applyAnswerCases });

  // applyPractice
  kit.applyPracticeCases = [];

  kit.applyPracticeCases.push({
    name: 'not_due_correct',
    input: { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, correct: true, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, true, T0),
    source: 'reference'
  });
}

function srsApplyRelearnPart1(kit) {
  kit.applyPracticeCases.push({
    name: 'not_due_wrong',
    input: { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, correct: false, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, false, T0),
    source: 'reference'
  });

  kit.applyPracticeCases.push({
    name: 'due_correct',
    input: { rec: { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, correct: true, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, true, T0),
    source: 'reference'
  });

  kit.applyPracticeCases.push({
    name: 'rec_null',
    input: { rec: null, correct: true, now: T0 },
    expect: ref('applyPractice', null, true, T0),
    source: 'reference'
  });

  kit.applyPracticeCases.push({
    name: 'rec_with_extra_fields',
    input: { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D, x: 1 }, correct: true, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D, x: 1 }, true, T0),
    source: 'reference'
  });

  kit.groups.push({ fn: 'applyPractice', cases: kit.applyPracticeCases });

  // applyRelearn
  kit.applyRelearnCases = [];

  kit.applyRelearnCases.push({
    name: 'stage_0_rec_to_stage_1',
    input: { rec: { s: 0, due: T0 - INTERVALS[0], ok: 0, bad: 1, last: T0 - INTERVALS[0] }, now: T0 },
    expect: ref('applyRelearn', { s: 0, due: T0 - INTERVALS[0], ok: 0, bad: 1, last: T0 - INTERVALS[0] }, T0),
    source: 'reference'
  });

  kit.applyRelearnCases.push({
    name: 'stage_3_rec_unchanged',
    input: { rec: { s: 3, due: T0 - INTERVALS[3], ok: 5, bad: 1, last: T0 - INTERVALS[3] }, now: T0 },
    expect: ref('applyRelearn', { s: 3, due: T0 - INTERVALS[3], ok: 5, bad: 1, last: T0 - INTERVALS[3] }, T0),
    source: 'reference'
  });

  kit.applyRelearnCases.push({
    name: 'rec_null',
    input: { rec: null, now: T0 },
    expect: ref('applyRelearn', null, T0),
    source: 'reference'
  });

  kit.applyRelearnCases.push({
    name: 'single_step_ladder_stage_0',
    input: { rec: { s: 0, due: T0, ok: 2, bad: 1, last: T0 - D }, now: T0, ladder: [0] },
    expect: { s: 1, due: T0, ok: 2, bad: 1, last: T0 },
    source: 'spec'
  });
}

function srsIsDuePart1(kit) {
  kit.groups.push({ fn: 'applyRelearn', cases: kit.applyRelearnCases });

  // isDue
  const isDueCases = [];

  isDueCases.push({
    name: 'due_equals_now',
    input: { rec: { s: 1, due: T0, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, now: T0 },
    expect: ref('isDue', { s: 1, due: T0, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, T0),
    source: 'reference'
  });

  isDueCases.push({
    name: 'due_lt_now',
    input: { rec: { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, now: T0 },
    expect: ref('isDue', { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, T0),
    source: 'reference'
  });

  isDueCases.push({
    name: 'due_gt_now',
    input: { rec: { s: 1, due: T0 + H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, now: T0 },
    expect: ref('isDue', { s: 1, due: T0 + H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, T0),
    source: 'reference'
  });

  isDueCases.push({
    name: 'rec_null',
    input: { rec: null, now: T0 },
    expect: ref('isDue', null, T0),
    source: 'reference'
  });

  isDueCases.push({
    name: 'float_due_equals_now',
    input: { rec: { s: 1, due: new Fl(T0), ok: 1, bad: 0, last: new Fl(T0 - INTERVALS[1]) }, now: T0 },
    expect: true,
    source: 'spec'
  });

  kit.groups.push({ fn: 'isDue', cases: isDueCases });

  // isNew
  const isNewCases = [];

  isNewCases.push({
    name: 'rec_exists',
    input: { rec: { s: 1, due: T0, ok: 1, bad: 0, last: T0 - INTERVALS[1] } },
    expect: ref('isNew', { s: 1, due: T0, ok: 1, bad: 0, last: T0 - INTERVALS[1] }),
    source: 'reference'
  });

  isNewCases.push({
    name: 'rec_null',
    input: { rec: null },
    expect: ref('isNew', null),
    source: 'reference'
  });

  kit.groups.push({ fn: 'isNew', cases: isNewCases });
}

function srsWeakestPart1(kit) {
  // weakest
  kit.weakestCases = [];

  const items1 = {
    i1: { s: 1, due: T0 + H, ok: 5, bad: 1, last: T0 - D },
    i2: { s: 2, due: T0 + 2 * H, ok: 3, bad: 2, last: T0 - 2 * D },
    i3: { s: 3, due: T0 + 3 * H, ok: 10, bad: 3, last: T0 - 3 * D },
    i4: { s: 0, due: T0 + 4 * H, ok: 2, bad: 4, last: T0 - 4 * D },
    i5: { s: 4, due: T0 + 5 * H, ok: 8, bad: 5, last: T0 - 5 * D },
    i6: { s: 5, due: T0 + 6 * H, ok: 15, bad: 6, last: T0 - 6 * D }
  };

  kit.weakestCases.push({
    name: 'limit_3',
    input: { items: items1, limit: 3 },
    expect: ref('weakest', items1, 3, undefined),
    source: 'reference'
  });

  kit.weakestCases.push({
    name: 'limit_omitted',
    input: { items: items1 },
    expect: ref('weakest', items1, undefined, undefined),
    source: 'reference'
  });

  kit.weakestCases.push({
    name: 'valid_ids_filter',
    input: { items: items1, limit: 3, validIds: { i1: true, i2: true, i3: true, i4: false, i5: false, i6: false } },
    expect: ref('weakest', items1, 3, { i1: true, i2: true, i3: true, i4: false, i5: false, i6: false }),
    source: 'reference'
  });

  // Items with bad=0 are excluded
  const itemsNoBad = {
    i1: { s: 1, due: T0 + H, ok: 5, bad: 0, last: T0 - D },
    i2: { s: 2, due: T0 + 2 * H, ok: 3, bad: 0, last: T0 - 2 * D }
  };

  kit.weakestCases.push({
    name: 'bad_0_excluded',
    input: { items: itemsNoBad, limit: 3 },
    expect: ref('weakest', itemsNoBad, 3, undefined),
    source: 'reference'
  });

  kit.weakestCases.push({
    name: 'valid_ids_zero_is_falsy',
    input: { items: items1, validIds: { i1: 0, i2: 1 } },
    expect: ['i2'],
    source: 'spec'
  });

  kit.weakestCases.push({
    name: 'missing_s_gets_no_bonus',
    input: { items: { b: { s: 5, due: T0, ok: 0, bad: 1, last: T0 }, a: { due: T0, ok: 0, bad: 1, last: T0 } } },
    expect: ['b', 'a'],
    source: 'spec'
  });
}

module.exports = { srsApplyAnswerPart1, srsApplyPracticePart1, srsApplyRelearnPart1, srsIsDuePart1, srsWeakestPart1 };
