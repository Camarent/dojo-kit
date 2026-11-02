'use strict';

const { T0, H, D, INTERVALS } = require('../const.js');
const { Fl, vec } = require('../utils.js');
const { ref } = require('../ref.js');

function srsApplyAnswerPart1(kit) {
  kit.groups = [];

  // applyAnswer
  kit.applyAnswerCases = [];

  kit.applyAnswerCases.push(vec('null_rec_correct', { rec: null, correct: true, now: T0 }, ref('applyAnswer', null, true, T0), 'reference'));

  kit.applyAnswerCases.push(vec('null_rec_wrong', { rec: null, correct: false, now: T0 }, ref('applyAnswer', null, false, T0), 'reference'));

  for (let s = 0; s <= 5; s++) {
    const rec = { s: s, due: T0 - INTERVALS[s], ok: 1, bad: 0, last: T0 - INTERVALS[s] };
    kit.applyAnswerCases.push(vec(`stage_${s}_correct`, { rec: rec, correct: true, now: T0 }, ref('applyAnswer', rec, true, T0), 'reference'));
  }

  kit.applyAnswerCases.push(vec('stage_6_correct_capped', { rec: { s: 6, due: T0 - INTERVALS[6], ok: 1, bad: 0, last: T0 - INTERVALS[6] }, correct: true, now: T0 }, ref('applyAnswer', { s: 6, due: T0 - INTERVALS[6], ok: 1, bad: 0, last: T0 - INTERVALS[6] }, true, T0), 'reference'));

  kit.applyAnswerCases.push(vec('stage_3_wrong_to_1', { rec: { s: 3, due: T0 - INTERVALS[3], ok: 1, bad: 0, last: T0 - INTERVALS[3] }, correct: false, now: T0 }, ref('applyAnswer', { s: 3, due: T0 - INTERVALS[3], ok: 1, bad: 0, last: T0 - INTERVALS[3] }, false, T0), 'reference'));

  kit.applyAnswerCases.push(vec('stage_1_wrong_ok_gt_0_floor_1', { rec: { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1] }, correct: false, now: T0 }, ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1] }, false, T0), 'reference'));

  kit.applyAnswerCases.push(vec('stage_1_wrong_ok_0_bad_0_to_0', { rec: { s: 1, due: T0 - INTERVALS[1], ok: 0, bad: 0, last: T0 - INTERVALS[1] }, correct: false, now: T0 }, ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 0, bad: 0, last: T0 - INTERVALS[1] }, false, T0), 'reference'));

  kit.applyAnswerCases.push(vec('stage_2_wrong_never_learned', { rec: { s: 2, due: T0 - INTERVALS[2], ok: 0, bad: 0, last: T0 - INTERVALS[2] }, correct: false, now: T0 }, ref('applyAnswer', { s: 2, due: T0 - INTERVALS[2], ok: 0, bad: 0, last: T0 - INTERVALS[2] }, false, T0), 'reference'));
}

function srsApplyPracticePart1(kit) {
  kit.applyAnswerCases.push(vec('rec_with_extra_field_preserved', { rec: { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1], x: 1 }, correct: true, now: T0 }, ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1], x: 1 }, true, T0), 'reference'));

  // Custom kit.ladder spec cases for applyAnswer
  kit.ladder = [0, D, 2 * D];

  // stage 2 correct stays 2 with due = now + 2D
  kit.applyAnswerCases.push(vec('custom_ladder_stage_2_correct', { rec: { s: 2, due: T0 - kit.ladder[2], ok: 1, bad: 0, last: T0 - kit.ladder[2] }, correct: true, now: T0, ladder: kit.ladder }, { s: 2, due: T0 + kit.ladder[2], ok: 2, bad: 0, last: T0 }, 'spec'));

  // stage 2 wrong -> floor 1 (because ever learned: s>0) with due = now + D
  kit.applyAnswerCases.push(vec('custom_ladder_stage_2_wrong', { rec: { s: 2, due: T0 - kit.ladder[2], ok: 1, bad: 0, last: T0 - kit.ladder[2] }, correct: false, now: T0, ladder: kit.ladder }, { s: 1, due: T0 + kit.ladder[1], ok: 1, bad: 1, last: T0 }, 'spec'));

  // stage 0 correct -> stage 1 with due = now + D
  kit.applyAnswerCases.push(vec('custom_ladder_stage_0_correct', { rec: { s: 0, due: T0 - kit.ladder[0], ok: 0, bad: 0, last: T0 - kit.ladder[0] }, correct: true, now: T0, ladder: kit.ladder }, { s: 1, due: T0 + kit.ladder[1], ok: 1, bad: 0, last: T0 }, 'spec'));

  const floatRec = { s: 2, due: new Fl(T0 - INTERVALS[2]), ok: 1, bad: 0, last: new Fl(T0 - INTERVALS[2]) };
  kit.applyAnswerCases.push(vec('float_due_correct', { rec: floatRec, correct: true, now: T0 }, { s: 3, due: T0 + INTERVALS[3], ok: 2, bad: 0, last: T0 }, 'spec'));

  kit.applyAnswerCases.push(vec('empty_ladder_null_rec_correct', { rec: null, correct: true, now: T0, ladder: [] }, { s: 0, due: T0, ok: 1, bad: 0, last: T0 }, 'spec'));

  kit.groups.push({ fn: 'applyAnswer', cases: kit.applyAnswerCases });

  // applyPractice
  kit.applyPracticeCases = [];

  kit.applyPracticeCases.push(vec('not_due_correct', { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, correct: true, now: T0 }, ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, true, T0), 'reference'));
}

function srsApplyRelearnPart1(kit) {
  kit.applyPracticeCases.push(vec('not_due_wrong', { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, correct: false, now: T0 }, ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, false, T0), 'reference'));

  kit.applyPracticeCases.push(vec('due_correct', { rec: { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, correct: true, now: T0 }, ref('applyPractice', { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, true, T0), 'reference'));

  kit.applyPracticeCases.push(vec('rec_null', { rec: null, correct: true, now: T0 }, ref('applyPractice', null, true, T0), 'reference'));

  kit.applyPracticeCases.push(vec('rec_with_extra_fields', { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D, x: 1 }, correct: true, now: T0 }, ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D, x: 1 }, true, T0), 'reference'));

  kit.groups.push({ fn: 'applyPractice', cases: kit.applyPracticeCases });

  // applyRelearn
  kit.applyRelearnCases = [];

  kit.applyRelearnCases.push(vec('stage_0_rec_to_stage_1', { rec: { s: 0, due: T0 - INTERVALS[0], ok: 0, bad: 1, last: T0 - INTERVALS[0] }, now: T0 }, ref('applyRelearn', { s: 0, due: T0 - INTERVALS[0], ok: 0, bad: 1, last: T0 - INTERVALS[0] }, T0), 'reference'));

  kit.applyRelearnCases.push(vec('stage_3_rec_unchanged', { rec: { s: 3, due: T0 - INTERVALS[3], ok: 5, bad: 1, last: T0 - INTERVALS[3] }, now: T0 }, ref('applyRelearn', { s: 3, due: T0 - INTERVALS[3], ok: 5, bad: 1, last: T0 - INTERVALS[3] }, T0), 'reference'));

  kit.applyRelearnCases.push(vec('rec_null', { rec: null, now: T0 }, ref('applyRelearn', null, T0), 'reference'));

  kit.applyRelearnCases.push(vec('single_step_ladder_stage_0', { rec: { s: 0, due: T0, ok: 2, bad: 1, last: T0 - D }, now: T0, ladder: [0] }, { s: 1, due: T0, ok: 2, bad: 1, last: T0 }, 'spec'));
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

  kit.weakestCases.push(vec('limit_3', { items: items1, limit: 3 }, ref('weakest', items1, 3, undefined), 'reference'));

  kit.weakestCases.push(vec('limit_omitted', { items: items1 }, ref('weakest', items1, undefined, undefined), 'reference'));

  kit.weakestCases.push(vec('valid_ids_filter', { items: items1, limit: 3, validIds: { i1: true, i2: true, i3: true, i4: false, i5: false, i6: false } }, ref('weakest', items1, 3, { i1: true, i2: true, i3: true, i4: false, i5: false, i6: false }), 'reference'));

  // Items with bad=0 are excluded
  const itemsNoBad = {
    i1: { s: 1, due: T0 + H, ok: 5, bad: 0, last: T0 - D },
    i2: { s: 2, due: T0 + 2 * H, ok: 3, bad: 0, last: T0 - 2 * D }
  };

  kit.weakestCases.push(vec('bad_0_excluded', { items: itemsNoBad, limit: 3 }, ref('weakest', itemsNoBad, 3, undefined), 'reference'));

  kit.weakestCases.push(vec('valid_ids_zero_is_falsy', { items: items1, validIds: { i1: 0, i2: 1 } }, ['i2'], 'spec'));

  kit.weakestCases.push(vec('missing_s_gets_no_bonus', { items: { b: { s: 5, due: T0, ok: 0, bad: 1, last: T0 }, a: { due: T0, ok: 0, bad: 1, last: T0 } } }, ['b', 'a'], 'spec'));
}

module.exports = { srsApplyAnswerPart1, srsApplyPracticePart1, srsApplyRelearnPart1, srsIsDuePart1, srsWeakestPart1 };
