'use strict';

const fs = require('fs');
const path = require('path');

const progress = require('../tools/reference/progress.js');
const srs = require('../tools/reference/srs.js');

const T0 = 1760000000000;
const H = 3600000;
const D = 86400000;

const INTERVALS = [0, 4 * H, D, 3 * D, 7 * D, 14 * D, 30 * D];

// The reference always adds an n5-specific empty stats.gNewByDay map; the generic core has no such fixed map.
function withoutEmptyGrammarStats(doc) {
  const g = doc && doc.stats && doc.stats.gNewByDay;
  if (g && typeof g === 'object' && Object.keys(g).length === 0) delete doc.stats.gNewByDay;
  return doc;
}

function ref(fn, ...args) {
  try {
    if (fn === 'sanitize') return withoutEmptyGrammarStats(progress.sanitize(...args));
    if (fn === 'merge') return withoutEmptyGrammarStats(progress.merge(...args));
    if (fn === 'stableJson') return progress.stableJson(...args);
    if (fn === 'emptyProgress') return progress.emptyProgress(...args);
    if (fn === 'validRec') return progress.validRec(...args);
    if (fn === 'applyAnswer') return srs.applyAnswer(...args);
    if (fn === 'applyPractice') return srs.applyPractice(...args);
    if (fn === 'applyRelearn') return srs.applyRelearn(...args);
    if (fn === 'applyPlacement') return srs.applyPlacement(...args);
    if (fn === 'isDue') return srs.isDue(...args);
    if (fn === 'isNew') return srs.isNew(...args);
    if (fn === 'weakest') return srs.weakest(...args);
    if (fn === 'buildQueue') return srs.buildQueue(...args);
    if (fn === 'dayKey') return srs.dayKey(...args);
    if (fn === 'streak') return srs.streak(...args);
    if (fn === 'gapVerdict') return gapVerdictJs(...args);
    throw new Error('Unknown function: ' + fn);
  } catch (e) {
    console.error('Reference call failed:', fn, args, e);
    process.exit(1);
  }
}

function noonMsOf(dateKey) {
  const parts = dateKey.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2], 12);
}

// A number that is written to the vector file with a ".0" suffix (parsed as a float by Rust).
class Fl {
  constructor(n) { this.n = n; }
  toJSON() { return '__FLOAT__' + this.n + '__'; }
}

function toJson(obj) {
  return JSON.stringify(obj, null, 2).replace(/"__FLOAT__(-?\d+)__"/g, '$1.0') + '\n';
}

function assertUnique(cases, groupName) {
  const names = cases.map(c => c.name);
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) {
      console.error(`Duplicate case name '${n}' in ${groupName}`);
      process.exit(1);
    }
    seen.add(n);
  }
}

// ============================================================
// SRS.JSON
// ============================================================

// Seeded member pick of the scoped queue (mirror of groups::shuffle_entities / srs::pick_drill).
function fnv1aJs(text) {
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(text, 'utf8')) h = ((h ^ BigInt(b)) * 0x100000001b3n) & MASK64;
  return h;
}

function pickDrillJs(members, n, courseId, day, entity) {
  const list = members.slice();
  if (list.length > 1) {
    let state = fnv1aJs(courseId + '|' + day + '|' + entity);
    for (let i = list.length - 1; i >= 1; i--) {
      const r = splitmix64Js(state);
      state = r.newState;
      const j = Number(r.value % BigInt(i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list.slice(0, Math.max(n, 1));
}

function makeSrsCases() {
  const groups = [];

  // applyAnswer
  const applyAnswerCases = [];

  applyAnswerCases.push({
    name: 'null_rec_correct',
    input: { rec: null, correct: true, now: T0 },
    expect: ref('applyAnswer', null, true, T0),
    source: 'reference'
  });

  applyAnswerCases.push({
    name: 'null_rec_wrong',
    input: { rec: null, correct: false, now: T0 },
    expect: ref('applyAnswer', null, false, T0),
    source: 'reference'
  });

  for (let s = 0; s <= 5; s++) {
    const rec = { s: s, due: T0 - INTERVALS[s], ok: 1, bad: 0, last: T0 - INTERVALS[s] };
    applyAnswerCases.push({
      name: `stage_${s}_correct`,
      input: { rec: rec, correct: true, now: T0 },
      expect: ref('applyAnswer', rec, true, T0),
      source: 'reference'
    });
  }

  applyAnswerCases.push({
    name: 'stage_6_correct_capped',
    input: { rec: { s: 6, due: T0 - INTERVALS[6], ok: 1, bad: 0, last: T0 - INTERVALS[6] }, correct: true, now: T0 },
    expect: ref('applyAnswer', { s: 6, due: T0 - INTERVALS[6], ok: 1, bad: 0, last: T0 - INTERVALS[6] }, true, T0),
    source: 'reference'
  });

  applyAnswerCases.push({
    name: 'stage_3_wrong_to_1',
    input: { rec: { s: 3, due: T0 - INTERVALS[3], ok: 1, bad: 0, last: T0 - INTERVALS[3] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 3, due: T0 - INTERVALS[3], ok: 1, bad: 0, last: T0 - INTERVALS[3] }, false, T0),
    source: 'reference'
  });

  applyAnswerCases.push({
    name: 'stage_1_wrong_ok_gt_0_floor_1',
    input: { rec: { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1] }, false, T0),
    source: 'reference'
  });

  applyAnswerCases.push({
    name: 'stage_1_wrong_ok_0_bad_0_to_0',
    input: { rec: { s: 1, due: T0 - INTERVALS[1], ok: 0, bad: 0, last: T0 - INTERVALS[1] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 0, bad: 0, last: T0 - INTERVALS[1] }, false, T0),
    source: 'reference'
  });

  applyAnswerCases.push({
    name: 'stage_2_wrong_never_learned',
    input: { rec: { s: 2, due: T0 - INTERVALS[2], ok: 0, bad: 0, last: T0 - INTERVALS[2] }, correct: false, now: T0 },
    expect: ref('applyAnswer', { s: 2, due: T0 - INTERVALS[2], ok: 0, bad: 0, last: T0 - INTERVALS[2] }, false, T0),
    source: 'reference'
  });

  applyAnswerCases.push({
    name: 'rec_with_extra_field_preserved',
    input: { rec: { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1], x: 1 }, correct: true, now: T0 },
    expect: ref('applyAnswer', { s: 1, due: T0 - INTERVALS[1], ok: 1, bad: 0, last: T0 - INTERVALS[1], x: 1 }, true, T0),
    source: 'reference'
  });

  // Custom ladder spec cases for applyAnswer
  const ladder = [0, D, 2 * D];
  const maxStageLadder = 2;

  // stage 2 correct stays 2 with due = now + 2D
  applyAnswerCases.push({
    name: 'custom_ladder_stage_2_correct',
    input: { rec: { s: 2, due: T0 - ladder[2], ok: 1, bad: 0, last: T0 - ladder[2] }, correct: true, now: T0, ladder: ladder },
    expect: { s: 2, due: T0 + ladder[2], ok: 2, bad: 0, last: T0 },
    source: 'spec'
  });

  // stage 2 wrong -> floor 1 (because ever learned: s>0) with due = now + D
  applyAnswerCases.push({
    name: 'custom_ladder_stage_2_wrong',
    input: { rec: { s: 2, due: T0 - ladder[2], ok: 1, bad: 0, last: T0 - ladder[2] }, correct: false, now: T0, ladder: ladder },
    expect: { s: 1, due: T0 + ladder[1], ok: 1, bad: 1, last: T0 },
    source: 'spec'
  });

  // stage 0 correct -> stage 1 with due = now + D
  applyAnswerCases.push({
    name: 'custom_ladder_stage_0_correct',
    input: { rec: { s: 0, due: T0 - ladder[0], ok: 0, bad: 0, last: T0 - ladder[0] }, correct: true, now: T0, ladder: ladder },
    expect: { s: 1, due: T0 + ladder[1], ok: 1, bad: 0, last: T0 },
    source: 'spec'
  });

  const floatRec = { s: 2, due: new Fl(T0 - INTERVALS[2]), ok: 1, bad: 0, last: new Fl(T0 - INTERVALS[2]) };
  applyAnswerCases.push({
    name: 'float_due_correct',
    input: { rec: floatRec, correct: true, now: T0 },
    expect: { s: 3, due: T0 + INTERVALS[3], ok: 2, bad: 0, last: T0 },
    source: 'spec'
  });

  applyAnswerCases.push({
    name: 'empty_ladder_null_rec_correct',
    input: { rec: null, correct: true, now: T0, ladder: [] },
    expect: { s: 0, due: T0, ok: 1, bad: 0, last: T0 },
    source: 'spec'
  });

  groups.push({ fn: 'applyAnswer', cases: applyAnswerCases });

  // applyPractice
  const applyPracticeCases = [];

  applyPracticeCases.push({
    name: 'not_due_correct',
    input: { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, correct: true, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, true, T0),
    source: 'reference'
  });

  applyPracticeCases.push({
    name: 'not_due_wrong',
    input: { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, correct: false, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D }, false, T0),
    source: 'reference'
  });

  applyPracticeCases.push({
    name: 'due_correct',
    input: { rec: { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, correct: true, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 - H, ok: 1, bad: 0, last: T0 - INTERVALS[1] }, true, T0),
    source: 'reference'
  });

  applyPracticeCases.push({
    name: 'rec_null',
    input: { rec: null, correct: true, now: T0 },
    expect: ref('applyPractice', null, true, T0),
    source: 'reference'
  });

  applyPracticeCases.push({
    name: 'rec_with_extra_fields',
    input: { rec: { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D, x: 1 }, correct: true, now: T0 },
    expect: ref('applyPractice', { s: 1, due: T0 + INTERVALS[1], ok: 1, bad: 0, last: T0 - D, x: 1 }, true, T0),
    source: 'reference'
  });

  groups.push({ fn: 'applyPractice', cases: applyPracticeCases });

  // applyRelearn
  const applyRelearnCases = [];

  applyRelearnCases.push({
    name: 'stage_0_rec_to_stage_1',
    input: { rec: { s: 0, due: T0 - INTERVALS[0], ok: 0, bad: 1, last: T0 - INTERVALS[0] }, now: T0 },
    expect: ref('applyRelearn', { s: 0, due: T0 - INTERVALS[0], ok: 0, bad: 1, last: T0 - INTERVALS[0] }, T0),
    source: 'reference'
  });

  applyRelearnCases.push({
    name: 'stage_3_rec_unchanged',
    input: { rec: { s: 3, due: T0 - INTERVALS[3], ok: 5, bad: 1, last: T0 - INTERVALS[3] }, now: T0 },
    expect: ref('applyRelearn', { s: 3, due: T0 - INTERVALS[3], ok: 5, bad: 1, last: T0 - INTERVALS[3] }, T0),
    source: 'reference'
  });

  applyRelearnCases.push({
    name: 'rec_null',
    input: { rec: null, now: T0 },
    expect: ref('applyRelearn', null, T0),
    source: 'reference'
  });

  applyRelearnCases.push({
    name: 'single_step_ladder_stage_0',
    input: { rec: { s: 0, due: T0, ok: 2, bad: 1, last: T0 - D }, now: T0, ladder: [0] },
    expect: { s: 1, due: T0, ok: 2, bad: 1, last: T0 },
    source: 'spec'
  });

  groups.push({ fn: 'applyRelearn', cases: applyRelearnCases });

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

  groups.push({ fn: 'isDue', cases: isDueCases });

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

  groups.push({ fn: 'isNew', cases: isNewCases });

  // weakest
  const weakestCases = [];

  const items1 = {
    i1: { s: 1, due: T0 + H, ok: 5, bad: 1, last: T0 - D },
    i2: { s: 2, due: T0 + 2 * H, ok: 3, bad: 2, last: T0 - 2 * D },
    i3: { s: 3, due: T0 + 3 * H, ok: 10, bad: 3, last: T0 - 3 * D },
    i4: { s: 0, due: T0 + 4 * H, ok: 2, bad: 4, last: T0 - 4 * D },
    i5: { s: 4, due: T0 + 5 * H, ok: 8, bad: 5, last: T0 - 5 * D },
    i6: { s: 5, due: T0 + 6 * H, ok: 15, bad: 6, last: T0 - 6 * D }
  };

  weakestCases.push({
    name: 'limit_3',
    input: { items: items1, limit: 3 },
    expect: ref('weakest', items1, 3, undefined),
    source: 'reference'
  });

  weakestCases.push({
    name: 'limit_omitted',
    input: { items: items1 },
    expect: ref('weakest', items1, undefined, undefined),
    source: 'reference'
  });

  weakestCases.push({
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

  weakestCases.push({
    name: 'bad_0_excluded',
    input: { items: itemsNoBad, limit: 3 },
    expect: ref('weakest', itemsNoBad, 3, undefined),
    source: 'reference'
  });

  weakestCases.push({
    name: 'valid_ids_zero_is_falsy',
    input: { items: items1, validIds: { i1: 0, i2: 1 } },
    expect: ['i2'],
    source: 'spec'
  });

  weakestCases.push({
    name: 'missing_s_gets_no_bonus',
    input: { items: { b: { s: 5, due: T0, ok: 0, bad: 1, last: T0 }, a: { due: T0, ok: 0, bad: 1, last: T0 } } },
    expect: ['b', 'a'],
    source: 'spec'
  });

  groups.push({ fn: 'weakest', cases: weakestCases });

  // buildQueue
  const buildQueueCases = [];

  const order = ['a', 'b', 'c', 'd', 'e'];
  const itemsDue = {
    a: { s: 1, due: T0 + 2 * D, ok: 1, bad: 0, last: T0 - INTERVALS[1] },
    b: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 - INTERVALS[2] },
    c: { s: 3, due: T0 + 3 * D, ok: 3, bad: 0, last: T0 - INTERVALS[3] }
  };

  buildQueueCases.push({
    name: 'due_sorted_ascending',
    input: { items: itemsDue, order: order, now: T0, newAllowance: 0 },
    expect: ref('buildQueue', itemsDue, order, T0, 0),
    source: 'reference'
  });

  const itemsFresh = {
    b: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 - INTERVALS[2] },
    c: { s: 3, due: T0 + 3 * D, ok: 3, bad: 0, last: T0 - INTERVALS[3] }
  };

  buildQueueCases.push({
    name: 'fresh_limited_by_new_allowance',
    input: { items: itemsFresh, order: order, now: T0, newAllowance: 2 },
    expect: ref('buildQueue', itemsFresh, order, T0, 2),
    source: 'reference'
  });

  const itemsUnknown = {
    a: { s: 1, due: T0 + 2 * D, ok: 1, bad: 0, last: T0 - INTERVALS[1] },
    b: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 - INTERVALS[2] },
    unknown: { s: 1, due: T0 + 5 * D, ok: 1, bad: 0, last: T0 - INTERVALS[1] }
  };

  buildQueueCases.push({
    name: 'unknown_ids_ignored',
    input: { items: itemsUnknown, order: order, now: T0, newAllowance: 0 },
    expect: ref('buildQueue', itemsUnknown, order, T0, 0),
    source: 'reference'
  });

  buildQueueCases.push({
    name: 'new_allowance_0',
    input: { items: {}, order: order, now: T0, newAllowance: 0 },
    expect: ref('buildQueue', {}, order, T0, 0),
    source: 'reference'
  });

  buildQueueCases.push({
    name: 'empty_items',
    input: { items: {}, order: order, now: T0, newAllowance: 5 },
    expect: ref('buildQueue', {}, order, T0, 5),
    source: 'reference'
  });

  buildQueueCases.push({
    name: 'float_due_sorted_ascending',
    input: {
      items: {
        a: { s: 1, due: new Fl(T0 - 2 * D), ok: 1, bad: 0, last: T0 - D },
        b: { s: 2, due: new Fl(T0 - 3 * D), ok: 2, bad: 0, last: T0 - D },
        c: { s: 3, due: new Fl(T0 + D), ok: 3, bad: 0, last: T0 - D }
      },
      order: ['a', 'b', 'c', 'd'], now: T0, newAllowance: 1
    },
    expect: { due: ['b', 'a'], fresh: ['d'] },
    source: 'spec'
  });

  // applyPlacement
  const applyPlacementCases = [];

  // known=true: move to stage 4 with spread
  applyPlacementCases.push({
    name: 'known_unseen_to_stage_4',
    input: { rec: null, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', null, true, T0, undefined, 1),
    source: 'reference'
  });

  applyPlacementCases.push({
    name: 'known_new_rec_to_stage_4',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, undefined, 1),
    source: 'reference'
  });

  // Stage already at 4 should stay unchanged (idempotent)
  applyPlacementCases.push({
    name: 'known_stage_4_unchanged',
    input: { rec: { s: 4, due: T0 + INTERVALS[4], ok: 5, bad: 1, last: T0 }, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 4, due: T0 + INTERVALS[4], ok: 5, bad: 1, last: T0 }, true, T0, undefined, 1),
    source: 'reference'
  });

  // Stage past 4 should stay unchanged (never lower)
  applyPlacementCases.push({
    name: 'known_stage_5_unchanged',
    input: { rec: { s: 5, due: T0 + INTERVALS[5], ok: 10, bad: 2, last: T0 }, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 5, due: T0 + INTERVALS[5], ok: 10, bad: 2, last: T0 }, true, T0, undefined, 1),
    source: 'reference'
  });

  // known=false: return record unchanged
  applyPlacementCases.push({
    name: 'unknown_null_rec_unchanged',
    input: { rec: null, known: false, now: T0, seed: '1' },
    expect: ref('applyPlacement', null, false, T0, undefined, 1),
    source: 'reference'
  });

  applyPlacementCases.push({
    name: 'unknown_existing_rec_unchanged',
    input: { rec: { s: 2, due: T0 + INTERVALS[2], ok: 3, bad: 1, last: T0 }, known: false, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 2, due: T0 + INTERVALS[2], ok: 3, bad: 1, last: T0 }, false, T0, undefined, 1),
    source: 'reference'
  });

  // Custom ladder with fewer than 5 stages
  const shortLadder = [0, 4 * H, D, 3 * D]; // max stage = 3
  applyPlacementCases.push({
    name: 'known_short_ladder_to_max_stage_3',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, ladder: shortLadder, seed: '1' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, shortLadder, 1),
    source: 'reference'
  });

  // Deterministic spread: same seed gives same result
  applyPlacementCases.push({
    name: 'deterministic_spread_same_seed',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, seed: '42' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, undefined, 42),
    source: 'spec'
  });

  // Different seeds give different results
  applyPlacementCases.push({
    name: 'deterministic_spread_diff_seed',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, seed: '99' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, undefined, 99),
    source: 'spec'
  });

  const placeRec = { s: 0, due: T0, ok: 0, bad: 0, last: T0 };
  for (const big of ['18446744073709551615', '12345678901234567890', '9007199254740993']) {
    applyPlacementCases.push({
      name: 'large_seed_' + big,
      input: { rec: placeRec, known: true, now: T0, seed: big },
      expect: ref('applyPlacement', placeRec, true, T0, undefined, big),
      source: 'spec'
    });
  }
  for (const st of [1, 3]) {
    const r = { s: st, due: T0, ok: 2, bad: 0, last: T0 };
    applyPlacementCases.push({
      name: 'known_from_stage_' + st + '_to_4',
      input: { rec: r, known: true, now: T0, seed: '7' },
      expect: ref('applyPlacement', r, true, T0, undefined, '7'),
      source: 'spec'
    });
  }
  {
    const r = { s: 0, due: T0, ok: 0, bad: 0, last: T0, ps: 7 };
    applyPlacementCases.push({
      name: 'known_keeps_extra_fields',
      input: { rec: r, known: true, now: T0, seed: '5' },
      expect: ref('applyPlacement', r, true, T0, undefined, '5'),
      source: 'spec'
    });
    const one = [0];
    applyPlacementCases.push({
      name: 'known_single_entry_ladder_unchanged',
      input: { rec: placeRec, known: true, now: T0, ladder: one, seed: '5' },
      expect: ref('applyPlacement', placeRec, true, T0, one, '5'),
      source: 'spec'
    });
  }

  groups.push({ fn: 'applyPlacement', cases: applyPlacementCases });

  // Per-unit new caps: independent oracle (spec: a fresh id is taken only while its unit's count < cap and total < allowance).
  const unitQueueOracle = (items, ord, allowance, caps, itemUnits) => {
    const due = ord.filter((id) => items[id] && items[id].due <= T0)
      .sort((x, y) => items[x].due - items[y].due);
    const used = {};
    const fresh = [];
    for (const id of ord) {
      if (fresh.length >= allowance) break;
      if (items[id]) continue;
      const u = itemUnits[id];
      if (u !== undefined && Object.prototype.hasOwnProperty.call(caps, u)) {
        if ((used[u] || 0) >= caps[u]) continue;
        used[u] = (used[u] || 0) + 1;
      }
      fresh.push(id);
    }
    return { due: due, fresh: fresh };
  };
  const uOrder = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'];
  const uUnits = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B', b3: 'B', c1: 'C' };
  const uItems = { b1: { s: 1, due: T0 - D, ok: 1, bad: 0, last: T0 - 2 * D } };
  const addUnitCase = (name, allowance, caps, items, itemUnits) => {
    buildQueueCases.push({
      name: name,
      input: { items: items, order: uOrder, now: T0, newAllowance: allowance, unitNewCaps: caps, itemUnits: itemUnits },
      expect: unitQueueOracle(items, uOrder, allowance, caps, itemUnits),
      source: 'spec'
    });
  };
  addUnitCase('unit_cap_zero_blocks_unit', 10, { A: 0 }, {}, uUnits);
  addUnitCase('unit_cap_below_global', 10, { A: 1, B: 2 }, {}, uUnits);
  addUnitCase('global_cap_binding', 2, { A: 5, B: 5 }, {}, uUnits);
  addUnitCase('unit_without_cap_unlimited', 10, { A: 1 }, {}, uUnits);
  addUnitCase('existing_records_not_counted_as_new', 10, { B: 1 }, uItems, uUnits);
  addUnitCase('empty_caps_unchanged', 3, {}, {}, uUnits);
  buildQueueCases.push({
    name: 'absent_unit_caps_unchanged',
    input: { items: {}, order: uOrder, now: T0, newAllowance: 4, itemUnits: uUnits },
    expect: { due: [], fresh: ['a1', 'a2', 'a3', 'b1'] },
    source: 'spec'
  });

  // Group caps over entities (Rust-side spec cases, append-only).
  const gOrder = ['k1a', 'k1b', 'k1c', 'k1d', 'k2a', 'k2b', 'k3a', 'x1'];
  const gUnits = { k1a: 'kanji', k1b: 'kanji', k1c: 'kanji', k1d: 'kanji', k2a: 'kanji', k2b: 'kanji', k3a: 'kanji', x1: 'other' };
  const gEnt = { k1a: 'K1', k1b: 'K1', k1c: 'K1', k1d: 'K1', k2a: 'K2', k2b: 'K2', k3a: 'K3' };
  const addGroupCase = (name, allowance, cap, usedMap, items, expect) => {
    buildQueueCases.push({
      name: name,
      input: {
        items: items, order: gOrder, now: T0, newAllowance: allowance, itemUnits: gUnits, itemEntities: gEnt,
        groupNewCaps: { kv: cap }, groupUnits: { kv: ['kanji'] }, used: usedMap, day: '2025-01-01', courseId: 'c'
      },
      expect: expect,
      source: 'spec'
    });
  };
  addGroupCase('group_cap_counts_entities', 5, 2, {}, {}, { due: [], fresh: ['k1a', 'k1b', 'k1c', 'k1d', 'k2a', 'k2b', 'x1'] });
  addGroupCase('group_cap_never_splits_entity', 5, 1, {}, {}, { due: [], fresh: ['k1a', 'k1b', 'k1c', 'k1d', 'x1'] });
  addGroupCase('group_used_reduces_cap', 5, 2, { 'newBy:g:kv': 1 }, {}, { due: [], fresh: ['k1a', 'k1b', 'k1c', 'k1d', 'x1'] });
  addGroupCase('group_started_entity_new_items_free', 5, 1, {}, { k1a: { s: 1, due: T0 + D, ok: 1, bad: 0, last: T0 - D } },
    { due: [], fresh: ['k1b', 'k1c', 'k1d', 'k2a', 'k2b', 'x1'] });
  addGroupCase('group_exempt_from_global_allowance', 0, 1, {}, {}, { due: [], fresh: ['k1a', 'k1b', 'k1c', 'k1d'] });
  buildQueueCases.push({
    name: 'absent_group_args_unchanged',
    input: { items: {}, order: gOrder, now: T0, newAllowance: 3, itemUnits: gUnits, itemEntities: gEnt },
    expect: { due: [], fresh: ['k1a', 'k1b', 'k1c'] },
    source: 'spec'
  });

  // Scoped (srs.scope "entity") queues: one slot per entity (spec cases, append-only).
  const sOrder = ['a1', 'a2', 'a3', 'b1', 'b2', 'x1'];
  const sEnt = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B', x1: 'X' };
  const sMembers = { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2'] };
  const pick = (e, n) => pickDrillJs(sMembers[e], n, 'c', '2025-01-01', e);
  const sRec = (s, due) => ({ s: s, due: due, ok: s, bad: 0, last: T0 - D });
  const addScoped = (name, extra, items, allowance, expect, withScope) => {
    const input = { items: items, order: sOrder, now: T0, newAllowance: allowance, itemEntities: sEnt, day: '2025-01-01', courseId: 'c' };
    if (withScope !== false) input.scopedMembers = sMembers;
    Object.assign(input, extra);
    buildQueueCases.push({ name: name, input: input, expect: expect, source: 'spec' });
  };
  addScoped('scoped_due_one_slot', {},
    { a1: sRec(2, T0 - 2 * D), a2: sRec(2, T0 + D), b1: sRec(1, T0 - 3 * D), b2: sRec(1, T0 - 3 * D) }, 0,
    { due: [...pick('B', 1), ...pick('A', 1)], fresh: [], drills: { B: pick('B', 1), A: pick('A', 1) } });
  addScoped('scoped_fresh_costs_one', {}, {}, 1, { due: [], fresh: pick('A', 1), drills: { A: pick('A', 1) } });
  addScoped('started_entity_new_member_not_fresh', {}, { a1: sRec(2, T0 + D), a2: sRec(2, T0 + D) }, 5,
    { due: [], fresh: [...pick('B', 1), 'x1'], drills: { B: pick('B', 1) } });
  addScoped('scoped_group_cap_entities',
    { itemUnits: { a1: 'U', a2: 'U', a3: 'U', b1: 'U', b2: 'U', x1: 'U' }, groupNewCaps: { g: 1 }, groupUnits: { g: ['U'] }, used: {} },
    {}, 0, { due: [], fresh: pick('A', 1), drills: { A: pick('A', 1) } });
  addScoped('scoped_drill_2_deterministic', { scopedDrill: { A: 2 } }, {}, 5,
    { due: [], fresh: [...pick('A', 2), ...pick('B', 1), 'x1'], drills: { A: pick('A', 2), B: pick('B', 1) } });
  addScoped('no_scope_key_absent', {}, {}, 5, { due: [], fresh: ['a1', 'a2', 'a3', 'b1', 'b2'] }, false);
  addScoped('scoped_empty_members_has_drills_key', { scopedMembers: {} }, {}, 2, { due: [], fresh: ['a1', 'a2'], drills: {} }, false);

  groups.push({ fn: 'buildQueue', cases: buildQueueCases });

  const lfuCourse = (units, srs, srsByType) => {
    const c = { id: 'c', title: 'C', uiLanguage: 'en', units: units };
    if (srs) c.srs = srs;
    if (srsByType) c.srsByType = srsByType;
    return c;
  };
  const ladderCases = [];
  const addLadder = (name, course, unitId, expect, itemType) => {
    const input = { course: course, unitId: unitId };
    if (itemType !== undefined) input.itemType = itemType;
    ladderCases.push({ name: name, input: input, expect: expect, source: 'spec' });
  };
  const L_UNIT = [0, H, D];
  const L_COURSE = [0, 2 * H, 2 * D, 5 * D];
  const L_TYPE = [0, 3 * H, 4 * D];
  addLadder('unit_ladder_wins', lfuCourse([{ id: 'u', title: 'U', srs: { ladder: L_UNIT } }], { ladder: L_COURSE }), 'u', L_UNIT);
  addLadder('falls_back_to_course_ladder', lfuCourse([{ id: 'u', title: 'U' }], { ladder: L_COURSE }), 'u', L_COURSE);
  addLadder('unit_with_only_new_per_day_falls_back', lfuCourse([{ id: 'u', title: 'U', newPerDay: 2 }], { ladder: L_COURSE }), 'u', L_COURSE);
  addLadder('unknown_unit_uses_course_ladder', lfuCourse([{ id: 'u', title: 'U', srs: { ladder: L_UNIT } }], { ladder: L_COURSE }), 'zzz', L_COURSE);
  addLadder('no_ladders_uses_default', lfuCourse([{ id: 'u', title: 'U' }]), 'u', INTERVALS);
  addLadder('other_unit_keeps_own_ladder', lfuCourse([{ id: 'u', title: 'U', srs: { ladder: L_UNIT } }, { id: 'v', title: 'V' }]), 'v', INTERVALS);
  // itemType tests
  addLadder('unit_wins_over_srs_by_type', lfuCourse([{ id: 'u', title: 'U', srs: { ladder: L_UNIT } }], { ladder: L_COURSE }, { choice: { ladder: L_TYPE } }), 'u', L_UNIT, 'choice');
  addLadder('srs_by_type_wins_over_course', lfuCourse([{ id: 'u', title: 'U' }], { ladder: L_COURSE }, { choice: { ladder: L_TYPE } }), 'u', L_TYPE, 'choice');
  addLadder('srs_by_type_falls_back_to_course', lfuCourse([{ id: 'u', title: 'U' }], { ladder: L_COURSE }, { gap: { ladder: L_TYPE } }), 'u', L_COURSE, 'choice');
  addLadder('srs_by_type_with_no_item_type_uses_course', lfuCourse([{ id: 'u', title: 'U' }], { ladder: L_COURSE }, { choice: { ladder: L_TYPE } }), 'u', L_COURSE);
  groups.push({ fn: 'ladderForUnit', cases: ladderCases });

  // entityView / applyEntity (srs.scope "entity"): spec cases with literal expectations.
  const M3 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const R = (s, due, ok, bad, last, extra) => Object.assign({ s: s, due: due, ok: ok, bad: bad, last: last }, extra || {});
  const viewCases = [];
  const addView = (name, members, records, expect) => viewCases.push({ name: name, input: { members: members, records: records }, expect: expect, source: 'spec' });
  addView('empty_null', M3, {}, null);
  addView('null_records_missing', M3, { a: null, b: null }, null);
  addView('mixed_min_s_min_due_max_counts', M3,
    { a: R(3, T0 + D, 2, 1, 100), b: R(1, T0 - 5, 5, 0, 200) }, R(1, T0 - 5, 5, 1, 200));
  addView('extras_from_latest', M3,
    { a: R(2, T0, 1, 0, 100, { x: 'old', y: 1 }), b: R(2, T0, 1, 0, 200, { x: 'new' }) }, R(2, T0, 1, 0, 200, { x: 'new' }));
  addView('retired_member_ignored', [{ id: 'a' }, { id: 'r', status: 'retired' }],
    { a: R(3, T0, 3, 0, 100), r: R(0, T0 - 1, 0, 0, 900) }, R(3, T0, 3, 0, 100));
  groups.push({ fn: 'entityView', cases: viewCases });

  const entCases = [];
  const addEnt = (name, input, expect) => entCases.push({
    name: name, input: Object.assign({ members: M3, records: {}, mode: 'answer', correct: true, now: T0, dropOnWrong: 1 }, input),
    expect: expect, source: 'spec'
  });
  const all3 = (rec) => ({ a: rec, b: rec, c: rec });
  const sync = (s, ok, bad) => R(s, T0 - 1, ok, bad, T0 - D);
  addEnt('new_entity_correct', {}, all3(R(1, T0 + 4 * H, 1, 0, T0)));
  addEnt('synced_correct', { records: all3(sync(2, 2, 0)) }, all3(R(3, T0 + 3 * D, 3, 0, T0)));
  addEnt('drift_self_heals', { records: { a: R(4, T0 + D, 5, 0, T0 - H), b: sync(2, 4, 0), c: sync(2, 4, 0) } }, all3(R(3, T0 + 3 * D, 6, 0, T0)));
  addEnt('wrong_drop_once', { correct: false, records: all3(sync(3, 3, 1)) }, all3(R(2, T0 + D, 3, 2, T0)));
  addEnt('old_client_wrong_counts_once', { correct: false, records: { a: R(2, T0 - 1, 1, 2, T0 - D), b: R(3, T0 - 1, 2, 1, T0 - D), c: R(3, T0 - 1, 2, 1, T0 - D) } },
    all3(R(1, T0 + 4 * H, 2, 3, T0)));
  addEnt('new_member_inherits', { records: { a: sync(3, 3, 0), b: sync(3, 3, 0) } }, all3(R(4, T0 + 7 * D, 4, 0, T0)));
  addEnt('retired_excluded', { members: [{ id: 'a' }, { id: 'b' }, { id: 'r', status: 'retired' }], records: { a: sync(2, 2, 0), b: sync(2, 2, 0), r: R(0, T0 - 1, 0, 0, T0 - 1) } },
    { a: R(3, T0 + 3 * D, 3, 0, T0), b: R(3, T0 + 3 * D, 3, 0, T0) });
  addEnt('unknown_fields_per_member', { records: { a: Object.assign(sync(2, 2, 0), { x: 1 }), b: sync(2, 2, 0), c: sync(2, 2, 0) } },
    { a: R(3, T0 + 3 * D, 3, 0, T0, { x: 1 }), b: R(3, T0 + 3 * D, 3, 0, T0), c: R(3, T0 + 3 * D, 3, 0, T0) });
  addEnt('practice_not_due_correct', { mode: 'practice', records: all3(R(3, T0 + D, 3, 0, T0 - H)) }, all3(R(3, T0 + D, 4, 0, T0)));
  addEnt('practice_due_correct_advances', { mode: 'practice', records: all3(sync(3, 3, 0)) }, all3(R(4, T0 + 7 * D, 4, 0, T0)));
  addEnt('relearn_s0', { mode: 'relearn', records: all3(R(0, T0 - 1, 1, 2, T0 - D)) }, all3(R(1, T0 + 4 * H, 1, 2, T0)));
  addEnt('relearn_s_gt0_noop', { mode: 'relearn', records: all3(sync(2, 2, 0)) }, {});
  addEnt('relearn_no_records_noop', { mode: 'relearn' }, {});
  addEnt('placement_known_same_for_all', { mode: 'placement', correct: true, seed: '1' },
    (() => { const p = ref('applyPlacement', null, true, T0, undefined, 1); return all3(p); })());
  addEnt('placement_unknown_noop', { mode: 'placement', correct: false, seed: '1' }, {});
  addEnt('ladder_top_clamped', { records: all3(sync(6, 6, 0)) }, all3(R(6, T0 + 30 * D, 7, 0, T0)));
  addEnt('custom_drop_2', { correct: false, dropOnWrong: 2, records: all3(sync(4, 4, 0)) }, all3(R(2, T0 + D, 4, 1, T0)));
  addEnt('drop_never_below_one_when_learned', { correct: false, dropOnWrong: 5, records: all3(sync(2, 2, 0)) }, all3(R(1, T0 + 4 * H, 2, 1, T0)));
  groups.push({ fn: 'applyEntity', cases: entCases });

  return { groups: groups };
}

// ============================================================
// SANITIZE.JSON
// ============================================================

function makeSanitizeCases() {
  const cases = [];

  // reference cases
  cases.push({
    name: 'foreign_doc_v2',
    input: { v: 2, t: 0, items: {} },
    expect: ref('sanitize', { v: 2, t: 0, items: {} }),
    source: 'reference'
  });

  cases.push({
    name: 'non_object_number',
    input: 42,
    expect: ref('sanitize', 42),
    source: 'reference'
  });

  cases.push({
    name: 'non_object_string',
    input: 'hello',
    expect: ref('sanitize', 'hello'),
    source: 'reference'
  });

  cases.push({
    name: 'missing_items',
    input: { v: 1, t: 0 },
    expect: ref('sanitize', { v: 1, t: 0 }),
    source: 'reference'
  });

  cases.push({
    name: 'valid_doc_kept',
    input: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    expect: ref('sanitize', { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } }),
    source: 'reference'
  });

  cases.push({
    name: 'unknown_top_level_field_kept',
    input: { v: 1, t: 0, items: {}, course: 'demo' },
    expect: ref('sanitize', { v: 1, t: 0, items: {}, course: 'demo' }),
    source: 'reference'
  });

  cases.push({
    name: 'unknown_field_inside_record_kept',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0, last: 0, x: 1 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0, last: 0, x: 1 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'string_numeric_s_not_valid',
    input: { v: 1, items: { a: { s: '3', due: T0, ok: 0, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: '3', due: T0, ok: 0, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'item_value_null_kept',
    input: { v: 1, items: { a: null } },
    expect: ref('sanitize', { v: 1, items: { a: null } }),
    source: 'reference'
  });

  cases.push({
    name: 'invalid_record_kept',
    input: { v: 1, items: { a: { x: 1 } } },
    expect: ref('sanitize', { v: 1, items: { a: { x: 1 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'negative_s_to_0',
    input: { v: 1, items: { a: { s: -1, due: T0, ok: 0, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: -1, due: T0, ok: 0, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'fractional_s_truncated',
    input: { v: 1, items: { a: { s: 2.7, due: T0, ok: 0, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 2.7, due: T0, ok: 0, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'ok_fractional_truncated',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 2.7, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 2.7, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'bad_fractional_truncated',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 2.7, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 2.7, last: 0 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'last_missing_to_0',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'stats_day_bad_format_dropped',
    input: { v: 1, items: {}, stats: { days: { 'bad-format': 5, '2026-01-01': 3 } } },
    expect: ref('sanitize', { v: 1, items: {}, stats: { days: { 'bad-format': 5, '2026-01-01': 3 } } }),
    source: 'reference'
  });

  cases.push({
    name: 'new_per_day_99_to_50',
    input: { v: 1, items: {}, settings: { newPerDay: 99 } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { newPerDay: 99 } }),
    source: 'reference'
  });

  cases.push({
    name: 'new_per_day_neg_5_to_0',
    input: { v: 1, items: {}, settings: { newPerDay: -5 } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { newPerDay: -5 } }),
    source: 'reference'
  });

  cases.push({
    name: 'new_per_day_missing_to_10',
    input: { v: 1, items: {}, settings: {} },
    expect: ref('sanitize', { v: 1, items: {}, settings: {} }),
    source: 'reference'
  });

  cases.push({
    name: 'placement_done_truthy_to_true',
    input: { v: 1, items: {}, settings: { placementDone: 1 } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { placementDone: 1 } }),
    source: 'reference'
  });

  cases.push({
    name: 'settings_ts_non_object_removed',
    input: { v: 1, items: {}, settings: { ts: 'bad' } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { ts: 'bad' } }),
    source: 'reference'
  });

  cases.push({
    name: 't_as_string_12_to_12',
    input: { v: 1, items: {}, t: '12' },
    expect: ref('sanitize', { v: 1, items: {}, t: '12' }),
    source: 'reference'
  });

  // spec cases
  cases.push({
    name: 'no_stage_clamp',
    input: { v: 1, items: { 'a-1': { s: 9, due: 1, ok: 0, bad: 0, last: 0 } } },
    expect: { v: 1, t: 0, resetAt: 0, items: { 'a-1': { s: 9, due: 1, ok: 0, bad: 0, last: 0 } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  cases.push({
    name: 'ps_is_unknown_field',
    input: { v: 1, items: { 'gp-1': { s: 3, due: 1, ps: 7 } } },
    expect: { v: 1, t: 0, resetAt: 0, items: { 'gp-1': { s: 3, due: 1, ok: 0, bad: 0, last: 0, ps: 7 } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  cases.push({
    name: 'custom_stats_map_kept',
    input: { v: 1, items: {}, stats: { studyDays: { '2026-01-02': 3, bad: 1 }, note: 'x' } },
    expect: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {}, studyDays: { '2026-01-02': 3 }, note: 'x' }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  cases.push({
    name: 'course_field_kept',
    input: { v: 1, items: {}, course: 'demo' },
    expect: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 }, course: 'demo' },
    source: 'spec'
  });

  const dflt = { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } };
  const withSettings = (st) => Object.assign({}, dflt, { settings: Object.assign({}, dflt.settings, st) });

  cases.push({
    name: 'float_due_becomes_integer',
    input: { v: 1, items: { a: { s: 2, due: new Fl(T0), ok: 1, bad: 0, last: new Fl(T0) } } },
    expect: Object.assign({}, dflt, { items: { a: { s: 2, due: T0, ok: 1, bad: 0, last: T0 } } }),
    source: 'spec'
  });

  [['string', 'abc'], ['null', null], ['bool', true]].forEach(([label, v]) => {
    cases.push({
      name: 'settings_newperday_not_number_' + label,
      input: { v: 1, items: {}, settings: { newPerDay: v } },
      expect: dflt,
      source: 'spec'
    });
  });

  cases.push({
    name: 'settings_t_string',
    input: { v: 1, items: {}, settings: { t: '12' } },
    expect: withSettings({ t: 12 }),
    source: 'spec'
  });

  cases.push({
    name: 'bad_date_keys_dropped',
    input: { v: 1, items: {}, stats: { days: { '----------': 1, '20-4-01-12': 2, '2026-01-02': 3 } } },
    expect: Object.assign({}, dflt, { stats: { days: { '2026-01-02': 3 }, newByDay: {} } }),
    source: 'spec'
  });

  cases.push({
    name: 'stats_non_daymap_object_kept',
    input: { v: 1, items: {}, stats: { obj: { a: 1 }, note: 'x' } },
    expect: Object.assign({}, dflt, { stats: { days: {}, newByDay: {}, obj: { a: 1 }, note: 'x' } }),
    source: 'spec'
  });

  return { fn: 'sanitize', cases: cases };
}

// ============================================================
// MERGE.JSON
// ============================================================

function makeMergeCases() {
  const cases = [];

  // reference cases
  function addRefCase(name, input, expect) {
    const result = ref('merge', input.a, input.b);
    const commutes = ref('stableJson', result) === ref('stableJson', ref('merge', input.b, input.a));
    cases.push({
      name: name,
      input: input,
      expect: result,
      source: 'reference',
      commutes: commutes
    });
  }

  // identical docs
  const doc1 = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  addRefCase('identical_docs', { a: doc1, b: JSON.parse(JSON.stringify(doc1)) }, null);

  // disjoint ids union
  const docA = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  const docB = ref('sanitize', { v: 1, t: 20, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: {}, settings: {} });
  addRefCase('disjoint_ids_union', { a: docA, b: docB }, null);

  // same id later last wins
  const docC1 = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  const docC2 = ref('sanitize', { v: 1, t: 20, items: { a: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 + D } }, stats: {}, settings: {} });
  addRefCase('same_id_later_last_wins', { a: docC1, b: docC2 }, null);

  // same id equal last higher s wins
  const docD1 = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  const docD2 = ref('sanitize', { v: 1, t: 20, items: { a: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  addRefCase('same_id_equal_last_higher_s_wins', { a: docD1, b: docD2 }, null);

  // newer resetAt drops older records and older-side stats/exams
  const docE1 = ref('sanitize', { v: 1, t: 10, resetAt: 5, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: 0 } }, stats: { days: { '2026-01-01': 5 } }, settings: {} });
  const docE2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: { days: { '2026-01-02': 3 } }, settings: {} });
  addRefCase('newer_reset_at_drops_older', { a: docE1, b: docE2 }, null);

  // equal resetAt
  const docF1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: { days: { '2026-01-01': 5 } }, settings: {} });
  const docF2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: { days: { '2026-01-02': 3 } }, settings: {} });
  addRefCase('equal_reset_at', { a: docF1, b: docF2 }, null);

  // stats days max per day for days and newByDay
  const docG1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: { days: { '2026-01-01': 5 }, newByDay: { '2026-01-01': 3 } }, settings: {} });
  const docG2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: { days: { '2026-01-01': 3 }, newByDay: { '2026-01-01': 5 } }, settings: {} });
  addRefCase('stats_days_max_per_day', { a: docG1, b: docG2 }, null);

  // settings per field by ts
  const docH1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 10, ts: { newPerDay: 5 }, t: 5 } });
  const docH2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 20, ts: { newPerDay: 15 }, t: 15 } });
  addRefCase('settings_per_field_by_ts', { a: docH1, b: docH2 }, null);

  // settings tie -> newer t
  const docI1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 10, t: 10 } });
  const docI2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 20, t: 20 } });
  addRefCase('settings_tie_newer_t', { a: docI1, b: docI2 }, null);

  // placementDone OR-ed
  const docJ1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: {}, settings: { placementDone: false, t: 10 } });
  const docJ2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: {}, settings: { placementDone: true, t: 20 } });
  addRefCase('placement_done_or_ed', { a: docJ1, b: docJ2 }, null);

  // unknown top-level field from newer t side wins
  const docK1 = ref('sanitize', { v: 1, t: 10, items: {}, extraField: 'x' });
  const docK2 = ref('sanitize', { v: 1, t: 20, items: {}, extraField: 'y' });
  addRefCase('unknown_top_level_newer_wins', { a: docK1, b: docK2 }, null);

  // exams union by key
  const docL1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, exams: { 'e1-100': { exam: 'e1', date: 100 } } });
  const docL2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, exams: { 'e2-200': { exam: 'e2', date: 200 } } });
  addRefCase('exams_union_by_key', { a: docL1, b: docL2 }, null);

  // exams absent on both
  const docM1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {} });
  const docM2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {} });
  addRefCase('exams_absent_on_both', { a: docM1, b: docM2 }, null);

  // empty doc + full doc (both orders)
  const empty = ref('sanitize', { v: 1, items: {}, stats: {}, settings: {} });
  const full = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  addRefCase('empty_plus_full_a', { a: empty, b: full }, null);
  addRefCase('empty_plus_full_b', { a: full, b: empty }, null);

  // non-commutative case: tie with differing unknown top-level fields
  const docN1 = ref('sanitize', { v: 1, t: 20, items: {}, extraField: 'x' });
  const docN2 = ref('sanitize', { v: 1, t: 20, items: {}, extraField: 'y' });
  addRefCase('non_commutative_course_tie', { a: docN1, b: docN2 }, null);

  // spec cases
  cases.push({
    name: 'merge_ps_not_special',
    input: {
      a: ref('sanitize', { v: 1, items: { a: { s: 2, due: T0, ok: 1, bad: 0, last: T0, ps: 6 } }, stats: {}, settings: {} }),
      b: ref('sanitize', { v: 1, items: { a: { s: 3, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} })
    },
    expect: { v: 1, t: 0, resetAt: 0, items: { a: { s: 3, due: T0, ok: 1, bad: 0, last: T0 } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  cases.push({
    name: 'merge_custom_stats_map_max',
    input: {
      a: ref('sanitize', { v: 1, items: {}, stats: { studyDays: { '2026-01-01': 3, '2026-01-02': 5 } }, settings: {} }),
      b: ref('sanitize', { v: 1, items: {}, stats: { studyDays: { '2026-01-01': 7, '2026-01-03': 2 } }, settings: {} })
    },
    expect: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {}, studyDays: { '2026-01-01': 7, '2026-01-02': 5, '2026-01-03': 2 } }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  cases.push({
    name: 'merge_course_mismatch',
    input: {
      a: ref('sanitize', { v: 1, items: {}, course: 'x' }),
      b: ref('sanitize', { v: 1, items: {}, course: 'y' })
    },
    expect: { error: 'course_mismatch' },
    source: 'spec'
  });

  cases.push({
    name: 'merge_import_never_resets',
    input: {
      a: ref('sanitize', { v: 1, t: 10, resetAt: 0, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} }),
      b: ref('sanitize', { v: 1, t: 20, resetAt: 0, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: {}, settings: {} })
    },
    expect: { v: 1, t: 20, resetAt: 0, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 }, b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  const mdoc = (t, stats, settings, extra) => Object.assign(
    { v: 1, t: t, resetAt: 0, items: {}, stats: Object.assign({ days: {}, newByDay: {} }, stats), settings: Object.assign({ newPerDay: 10, placementDone: false, t: 0 }, settings) },
    extra);
  const mdocExpect = (t, stats, settings, extra) => mdoc(t, stats, settings, extra);

  cases.push({
    name: 'merge_non_daymap_stats_newer_wins',
    input: { a: mdoc(10, { note: 'old', obj: { a: 1 } }), b: mdoc(20, { note: 'new' }) },
    expect: mdocExpect(20, { note: 'new', obj: { a: 1 } }),
    source: 'spec'
  });

  cases.push({
    name: 'merge_non_daymap_stats_older_loses_swapped',
    input: { a: mdoc(20, { note: 'old', obj: { a: 1 } }), b: mdoc(10, { note: 'new' }) },
    expect: mdocExpect(20, { note: 'old', obj: { a: 1 } }),
    source: 'spec'
  });

  cases.push({
    name: 'merge_course_one_side_only',
    input: { a: mdoc(0, {}, {}, { course: 'demo' }), b: mdoc(0, {}, {}) },
    expect: mdocExpect(0, {}, {}, { course: 'demo' }),
    commutes: true,
    source: 'spec'
  });

  cases.push({
    name: 'merge_settings_ts_missing_field_falls_back_to_t',
    input: { a: mdoc(0, {}, { newPerDay: 5, t: 100, ts: { other: 1 } }), b: mdoc(0, {}, { newPerDay: 20, t: 50 }) },
    expect: mdocExpect(0, {}, { newPerDay: 5, t: 100 }),
    source: 'spec'
  });

  cases.push({
    name: 'merge_non_object_input_null',
    input: { a: null, b: mdoc(0, {}, {}) },
    expect: { error: 'invalid_document' },
    source: 'spec'
  });

  cases.push({
    name: 'merge_non_object_input_array',
    input: { a: [], b: mdoc(0, {}, {}) },
    expect: { error: 'invalid_document' },
    source: 'spec'
  });

  cases.push({
    name: 'merge_fractional_t_kept',
    input: { a: mdoc(10.5, {}, {}), b: mdoc(3, {}, {}) },
    expect: mdocExpect(10.5, {}, {}),
    source: 'spec'
  });

  // examDraft cases (F9a). The expectation is computed by an independent JS oracle from the design rules.
  const BOUND = 32;
  const isValidDraft = (d) => d !== null && typeof d === 'object' && !Array.isArray(d) && typeof d.sid === 'string' && typeof d.updatedAt === 'number';
  const isClosedDraft = (d) => typeof d.closed === 'string';
  const withoutClosedSids = (d) => { const c = JSON.parse(JSON.stringify(d)); delete c.closedSids; return c; };
  // Sort key of a candidate: greater key wins. Closed reason "expired" is the bottom reason.
  const draftKey = (d) => {
    const closed = isClosedDraft(d);
    const tail = closed
      ? [d.closed === 'expired' ? 0 : 1, d.closed]
      : [Array.isArray(d.answers) ? d.answers.length : 0, progress.stableJson(withoutClosedSids(d))];
    return [d.updatedAt, d.sid, closed ? 1 : 0].concat(tail);
  };
  const keyCmp = (ka, kb) => {
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  };
  // Expected merged doc for a LIST of docs (n-ary, so every fold order must equal it): generic merge from the
  // reference for everything but examDraft; examDraft = greatest candidate + bounded set of closed sids.
  const draftExpectAll = (docs) => {
    let out = JSON.parse(JSON.stringify(docs[0]));
    for (let i = 1; i < docs.length; i++) out = JSON.parse(JSON.stringify(ref('merge', out, docs[i])));
    const reset = Math.max.apply(null, docs.map((d) => d.resetAt || 0));
    const fresh = (t) => reset === 0 || t >= reset;
    const valid = docs.map((d) => d.examDraft).filter(isValidDraft);
    const closedAt = {};
    const cands = [];
    valid.forEach((d) => {
      (Array.isArray(d.closedSids) ? d.closedSids : []).filter(isValidDraft).forEach((e) => {
        if (!fresh(e.updatedAt)) return;
        closedAt[e.sid] = Math.max(closedAt[e.sid] === undefined ? -Infinity : closedAt[e.sid], e.updatedAt);
        cands.push({ sid: e.sid, updatedAt: e.updatedAt, closed: 'expired' });
      });
      if (!fresh(d.updatedAt)) return;
      if (isClosedDraft(d)) {
        closedAt[d.sid] = Math.max(closedAt[d.sid] === undefined ? -Infinity : closedAt[d.sid], d.updatedAt);
        cands.push({ sid: d.sid, updatedAt: d.updatedAt, closed: d.closed });
      } else {
        cands.push(d);
      }
    });
    if (!cands.length) {
      if (valid.length) delete out.examDraft;
      return out;
    }
    const best = cands.reduce((m, d) => (keyCmp(draftKey(d), draftKey(m)) > 0 ? d : m));
    const list = Object.keys(closedAt)
      .map((sid) => ({ sid: sid, updatedAt: closedAt[sid] }))
      .sort((x, y) => keyCmp([x.updatedAt, x.sid], [y.updatedAt, y.sid]))
      .slice(-BOUND);
    const slot = JSON.parse(JSON.stringify(best));
    delete slot.closedSids;
    if (list.length) slot.closedSids = list;
    out.examDraft = slot;
    return out;
  };
  const sj = (x) => JSON.stringify(progress.stableJson(x));
  const draftExpect = (a, b) => draftExpectAll([a, b]);
  const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations(xs.slice(0, i).concat(xs.slice(i + 1))).map((p) => [x].concat(p))));
  const dcase = (name, a, b) => {
    const expect = draftExpect(a, b);
    if (sj(draftExpect(b, a)) !== sj(expect)) throw new Error('examDraft oracle not commutative: ' + name);
    cases.push({ name: name, input: { a: a, b: b }, expect: expect, source: 'spec' });
  };
  // Join property over a set of docs: every permutation, folded left through the oracle's pairwise merge, equals the
  // n-ary result; emits the pairwise (partial, next) cases of the first order and the reversed one.
  const dset = (name, docs) => {
    const want = sj(draftExpectAll(docs));
    permutations(docs).forEach((order) => {
      const folded = order.slice(1).reduce((acc, d) => draftExpect(acc, d), order[0]);
      if (sj(folded) !== sj(draftExpectAll(order)) || sj(draftExpectAll(order)) !== want) throw new Error('examDraft oracle not a join: ' + name);
    });
    [docs, docs.slice().reverse()].forEach((order, k) => {
      const partial = draftExpect(order[0], order[1]);
      const rest = order.slice(2).reduce((acc, d) => draftExpect(acc, d), partial);
      cases.push({ name: name + '_fold' + (k + 1) + '_pair', input: { a: partial, b: order[2] }, expect: draftExpect(partial, order[2]), source: 'spec' });
      if (sj(rest) !== want) throw new Error('examDraft fold mismatch: ' + name);
    });
    cases.push({ name: name + '_right_nested', input: { a: docs[0], b: draftExpect(docs[1], docs[2]) }, expect: draftExpectAll(docs), source: 'spec' });
  };
  const dd = (t, d, extra) => mdoc(t, {}, {}, Object.assign({ examDraft: d }, extra));
  const open = (sid, at, extra) => Object.assign({ sid: sid, updatedAt: at }, extra);
  const closedD = (sid, at, why) => ({ sid: sid, updatedAt: at, closed: why });
  const ans = (n) => Array.from({ length: n }, (_, i) => ({ i: i, c: i % 2 === 0, g: 'x' + i }));

  dcase('merge_examDraft_absent_on_both', mdoc(5, {}, {}), mdoc(7, {}, {}));
  dcase('merge_examDraft_one_side_only', dd(1, open('s1', 100)), mdoc(9, {}, {}));
  dcase('merge_examDraft_one_side_only_b', mdoc(9, {}, {}), dd(1, open('s1', 100)));
  dcase('merge_examDraft_same_sid_closed_wins_order1', dd(1, open('s1', 100, { answers: ans(1) })), dd(2, closedD('s1', 50, 'finished')));
  dcase('merge_examDraft_same_sid_closed_wins_order2', dd(2, closedD('s1', 50, 'finished')), dd(1, open('s1', 100, { answers: ans(1) })));
  dcase('merge_examDraft_same_sid_closed_older_clock_skew', dd(9, open('s1', 1000)), dd(1, closedD('s1', 1, 'abandoned')));
  dcase('merge_examDraft_same_sid_later_updatedAt_wins', dd(9, open('s1', 100, { index: 1 })), dd(1, open('s1', 200, { index: 2 })));
  dcase('merge_examDraft_same_sid_tie_more_answers', dd(1, open('s1', 100, { answers: ans(1) })), dd(1, open('s1', 100, { answers: ans(3) })));
  dcase('merge_examDraft_same_sid_full_tie_stable_json', dd(1, open('s1', 100, { index: 1 })), dd(1, open('s1', 100, { index: 2 })));
  dcase('merge_examDraft_newer_updatedAt_wins', dd(1, open('s1', 100)), dd(1, open('s2', 200)));
  dcase('merge_examDraft_newer_open_beats_older_closed_other_sid', dd(1, closedD('s1', 100, 'finished')), dd(1, open('s2', 200)));
  dcase('merge_examDraft_tie_closed_wins', dd(1, open('s9', 100)), dd(1, closedD('s2', 100, 'abandoned')));
  dcase('merge_examDraft_tie_larger_sid_wins', dd(1, open('s1', 100)), dd(1, open('s2', 100)));
  dcase('merge_examDraft_resetAt_drops_draft', dd(1, open('s1', 50), { resetAt: 100 }), mdoc(10, {}, {}, { resetAt: 100 }));
  dcase('merge_examDraft_resetAt_drops_draft_other_side_reset', dd(1, open('s1', 50)), mdoc(10, {}, {}, { resetAt: 100 }));
  dcase('merge_examDraft_resetAt_keeps_newer_draft', dd(1, open('s1', 50)), dd(1, open('s2', 100), { resetAt: 100 }));
  dcase('merge_examDraft_resetAt_keeps_fresh_closed', dd(1, closedD('s1', 150, 'finished'), { resetAt: 100 }), mdoc(10, {}, {}));
  dcase('merge_examDraft_invalid_missing_sid', dd(1, { updatedAt: 100 }), mdoc(2, {}, {}));
  dcase('merge_examDraft_invalid_missing_updatedAt', dd(1, { sid: 's1' }), mdoc(2, {}, {}));
  dcase('merge_examDraft_invalid_vs_valid_valid_wins', dd(9, { updatedAt: 100 }), dd(1, open('s1', 1)));
  dcase('merge_examDraft_invalid_both_larger_t_wins', dd(1, { sid: 7, updatedAt: 1 }), dd(2, { updatedAt: 'x' }));
  dcase('merge_examDraft_unknown_fields_survive', dd(1, open('s1', 100, { customField: 'value', anotherField: 42, nested: { k: [1, null] } })), mdoc(2, {}, {}));
  dcase('merge_examDraft_sanitize_keeps_draft', dd(1, open('s1', 100, { answers: [{ i: 0, c: true, g: 'answer', extra: 1 }], sections: [{ title: 'T', start: 0, count: 1 }] })), dd(0, open('s1', 100, { answers: [{ i: 0, c: true, g: 'answer', extra: 1 }], sections: [{ title: 'T', start: 0, count: 1 }] })));

  const X = open('s1', 100), Y = closedD('s1', 50, 'finished'), Z = open('s2', 75);
  dset('merge_examDraft_join_reviewer_xyz', [dd(1, X), dd(1, Y), dd(1, Z)]);
  dset('merge_examDraft_join_two_closed_one_open', [dd(1, closedD('s1', 10, 'finished')), dd(2, closedD('s2', 20, 'abandoned')), dd(3, open('s1', 30, { answers: ans(2) }))]);
  dset('merge_examDraft_join_ties_and_reasons', [dd(1, closedD('s1', 5, 'finished')), dd(1, open('s1', 5, { answers: ans(1) })), dd(1, closedD('s1', 5, 'abandoned'))]);
  dset('merge_examDraft_join_with_closedSids_and_reset', [dd(1, open('s3', 40, { closedSids: [{ sid: 's1', updatedAt: 30 }, { sid: 's2', updatedAt: 5 }] }), { resetAt: 10 }), dd(2, open('s1', 35)), dd(0, closedD('s3', 8, 'expired'))]);
  dcase('merge_examDraft_closedSids_union_and_dead_slot', dd(1, open('s2', 60, { closedSids: [{ sid: 's1', updatedAt: 10 }] })), dd(1, closedD('s2', 20, 'finished')));
  dcase('merge_examDraft_closedSids_bounded_keeps_newest', dd(1, Object.assign(open('s99', 1000), { closedSids: Array.from({ length: 32 }, (_, i) => ({ sid: 'c' + String(i).padStart(2, '0'), updatedAt: 100 + i })) })), dd(1, closedD('old', 1, 'finished')));

  return { fn: 'merge', cases: cases };
}

// ============================================================
// DAYS.JSON
// ============================================================

function makeDaysCases() {
  const groups = [];

  // dayKey
  const dayKeyCases = [];

  // Reference cases with tzOffsetMin = 0 (not passed to ref)
  // Use noon UTC timestamps for timezone-proof results
  dayKeyCases.push({
    name: 'date_2024_01_01',
    input: { ms: Date.UTC(2024, 0, 1, 12) },
    expect: ref('dayKey', Date.UTC(2024, 0, 1, 12)),
    source: 'reference'
  });

  dayKeyCases.push({
    name: 'date_2025_10_09',
    input: { ms: Date.UTC(2025, 9, 9, 12) },
    expect: ref('dayKey', Date.UTC(2025, 9, 9, 12)),
    source: 'reference'
  });

  dayKeyCases.push({
    name: 'leap_day_2024_02_29_noon',
    input: { ms: Date.UTC(2024, 1, 29, 12) },
    expect: ref('dayKey', Date.UTC(2024, 1, 29, 12)),
    source: 'reference'
  });

  dayKeyCases.push({
    name: 'year_end_2026_12_31_23_59_59',
    input: { ms: 1798761599000 },
    expect: ref('dayKey', 1798761599000),
    source: 'reference'
  });

  dayKeyCases.push({
    name: 'date_2026_06_15',
    input: { ms: Date.UTC(2026, 5, 15, 12) },
    expect: ref('dayKey', Date.UTC(2026, 5, 15, 12)),
    source: 'reference'
  });

  dayKeyCases.push({
    name: 'year_end_2025_12_31_noon',
    input: { ms: Date.UTC(2025, 11, 31, 12) },
    expect: ref('dayKey', Date.UTC(2025, 11, 31, 12)),
    source: 'reference'
  });

  // Spec cases with tzOffsetMin
  dayKeyCases.push({
    name: 'offset_60_to_2026_01_01',
    input: { ms: 1767225599000, tzOffsetMin: 60 },
    expect: '2026-01-01',
    source: 'spec'
  });

  dayKeyCases.push({
    name: 'offset_neg_300_to_2025_12_31',
    input: { ms: 1767225599000, tzOffsetMin: -300 },
    expect: '2025-12-31',
    source: 'spec'
  });

  groups.push({ fn: 'dayKey', cases: dayKeyCases });

  // streak
  const streakCases = [];

  // today studied
  streakCases.push({
    name: 'today_studied',
    input: { days: { '2026-01-01': 5 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2026-01-01': 5 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // only yesterday studied
  streakCases.push({
    name: 'only_yesterday_studied',
    input: { days: { '2025-12-31': 3 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2025-12-31': 3 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // neither studied
  streakCases.push({
    name: 'neither_studied',
    input: { days: { '2025-12-30': 2 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2025-12-30': 2 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // gap in the middle
  streakCases.push({
    name: 'gap_in_middle',
    input: { days: { '2026-01-01': 5, '2025-12-31': 3, '2025-12-29': 2 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2026-01-01': 5, '2025-12-31': 3, '2025-12-29': 2 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // month boundary
  streakCases.push({
    name: 'month_boundary_2026_03_01',
    input: { days: { '2026-03-01': 5, '2026-02-28': 3, '2026-02-27': 2 }, todayKey: '2026-03-01' },
    expect: ref('streak', { '2026-03-01': 5, '2026-02-28': 3, '2026-02-27': 2 }, noonMsOf('2026-03-01')),
    source: 'reference'
  });

  // year boundary
  streakCases.push({
    name: 'year_boundary_2027_01_01',
    input: { days: { '2027-01-01': 5, '2026-12-31': 3 }, todayKey: '2027-01-01' },
    expect: ref('streak', { '2027-01-01': 5, '2026-12-31': 3 }, noonMsOf('2027-01-01')),
    source: 'reference'
  });

  // leap day crossing
  streakCases.push({
    name: 'leap_day_crossing_2024_03_01',
    input: { days: { '2024-03-01': 5, '2024-02-29': 3 }, todayKey: '2024-03-01' },
    expect: ref('streak', { '2024-03-01': 5, '2024-02-29': 3 }, noonMsOf('2024-03-01')),
    source: 'reference'
  });

  streakCases.push({
    name: 'float_count_truthy',
    input: { days: { '2026-01-01': new Fl(2) }, todayKey: '2026-01-01' },
    expect: 1,
    source: 'spec'
  });

  streakCases.push({
    name: 'zero_count_falsy',
    input: { days: { '2026-01-01': 0 }, todayKey: '2026-01-01' },
    expect: 0,
    source: 'spec'
  });

  groups.push({ fn: 'streak', cases: streakCases });

  return { groups: groups };
}

// ============================================================
// CHECK EXAM REFERENCE IMPLEMENTATIONS
// ============================================================

// u64 constants for splitmix64
const SPLITMIX64_INC = 0x9e3779b97f4a7c15n;
const SPLITMIX64_MUL1 = 0xbf58476d1ce4e5b9n;
const SPLITMIX64_MUL2 = 0x94d049bb133111ebn;

// Mask for 64-bit unsigned integers
const MASK64 = (1n << 64n) - 1n;

function splitmix64Js(state) {
  // This function simulates the Rust splitmix64 which both updates state and returns a value
  // state is passed by reference and mutated, then a value is returned
  // In JS we need to return both, but for simplicity we'll have the caller handle it
  // Actually, let's make this return { newState, value }
  const newState = (state + SPLITMIX64_INC) & MASK64;
  let z = newState;
  z = (z ^ (z >> 30n)) & MASK64;
  z = (z * SPLITMIX64_MUL1) & MASK64;
  z = (z ^ (z >> 27n)) & MASK64;
  z = (z * SPLITMIX64_MUL2) & MASK64;
  const result = (z ^ (z >> 31n)) & MASK64;
  return { newState, value: result };
}

function normalizeJs(text, opts) {
  let result = text;
  
  // Defaults
  const caseSensitive = opts && opts.caseSensitive !== undefined ? opts.caseSensitive : false;
  const trim = opts && opts.trim !== undefined ? opts.trim : true;
  const collapseSpaces = opts && opts.collapseSpaces !== undefined ? opts.collapseSpaces : true;
  const stripPunctuation = opts && opts.stripPunctuation !== undefined ? opts.stripPunctuation : false;

  // Step 1: lowercase if not case sensitive
  if (!caseSensitive) {
    result = result.toLowerCase();
  }

  // Step 1b: fold mappings (single char -> string, or range "A-Z" -> "a-z")
  if (opts && opts.fold && opts.fold.length) {
    const chars = Array.from(result);
    result = chars.map((c) => {
      for (const [from, to] of opts.fold) {
        const f = Array.from(from);
        if (f.length === 1) {
          if (f[0] === c) return to;
        } else {
          const t = Array.from(to);
          if (f[1] === '-' && c.codePointAt(0) >= f[0].codePointAt(0) && c.codePointAt(0) <= f[2].codePointAt(0)) {
            return String.fromCodePoint(t[0].codePointAt(0) + c.codePointAt(0) - f[0].codePointAt(0));
          }
        }
      }
      return c;
    }).join('');
  }

  // Step 2: strip punctuation
  if (stripPunctuation) {
    result = result.replace(/[^\p{L}\p{N}\s]/gu, '');
  }

  // Step 3: collapse whitespace
  if (collapseSpaces) {
    result = result.replace(/\s+/g, ' ');
  }

  // Step 4: trim
  if (trim) {
    result = result.trim();
  }

  return result;
}

function checkGapJs(input, opts) {
  const answers = input.answers || [];
  const text = input.input;
  
  if (answers.length === 0) {
    return false;
  }
  
  const normalizedInput = normalizeJs(text, opts);
  for (const a of answers) {
    if (normalizeJs(a, opts) === normalizedInput) {
      return true;
    }
  }
  return false;
}

function gapVerdictJs(input, opts) {
  const answers = input.answers || [];
  const retry = input.retry || [];
  const text = input.input;
  
  const normalizedInput = normalizeJs(text, opts);
  
  // Check if input matches any answer
  for (const a of answers) {
    if (normalizeJs(a, opts) === normalizedInput) {
      return 'ok';
    }
  }
  
  // Check if input matches any retry reading
  for (const r of retry) {
    if (normalizeJs(r, opts) === normalizedInput) {
      return 'retry';
    }
  }
  
  return 'wrong';
}

function checkChoiceJs(input) {
  return input.answer === input.selected;
}

function drawTierJs(groupsIn, count, stateIn) {
  let state = stateIn;
  const groupList = groupsIn.slice();
  for (let i = groupList.length - 1; i > 0; i--) {
    const { newState, value } = splitmix64Js(state);
    state = newState;
    const j = Number(value % BigInt(i + 1));
    [groupList[i], groupList[j]] = [groupList[j], groupList[i]];
  }
  const sizes = groupList.map(g => g.length);
  let chosen = [];
  let left = count;
  sizes.forEach((sz, i) => {
    if (left > 0 && sz <= left) { chosen.push(i); left -= sz; }
  });
  if (left > 0 && sizes.some(sz => sz > 1)) {
    // best[i][s]: largest sum <= s reachable from groups i.. (recursive, independent of the Rust table)
    const memo = new Map();
    const best = (i, s) => {
      if (i >= sizes.length || s <= 0) return 0;
      const key = i * 100000 + s;
      if (memo.has(key)) return memo.get(key);
      let r = best(i + 1, s);
      if (sizes[i] <= s) r = Math.max(r, sizes[i] + best(i + 1, s - sizes[i]));
      memo.set(key, r);
      return r;
    };
    const target = best(0, count);
    if (target > count - left) {
      chosen = [];
      let s = target;
      for (let i = 0; i < sizes.length && s > 0; i++) {
        if (sizes[i] <= s && best(i + 1, s - sizes[i]) === s - sizes[i]) {
          chosen.push(i);
          s -= sizes[i];
        }
      }
      left = count - target;
    }
  }
  const picked = [];
  for (const i of chosen) for (const c of groupList[i]) picked.push(c);
  return { picked, left, state };
}

function sampleJs(input) {
  const candidates = input.candidates || [];
  const sections = input.sections || [];
  let seed = BigInt(input.seed);
  
  const used = new Set();
  const ids = [];
  const short = [];
  const sectionsOut = [];
  let startIdx = 0;

  for (const section of sections) {
    const sectionStart = startIdx;
    // Build pool: candidates not in used, passing filters, grouped by stimulus
    // Each candidate with a stimulus goes into a group with that stimulus id
    // Candidates without a stimulus are each their own group
    const groups = [];
    const stimToIndex = new Map();
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      
      // units filter
      if (section.units !== undefined && section.units !== null) {
        if (section.units.length === 0) continue;
        if (!section.units.includes(c.unit)) continue;
      }
      
      // tags filter
      if (section.tags !== undefined && section.tags !== null) {
        if (section.tags.length === 0) continue;
        if (!c.tags.some(t => section.tags.includes(t))) continue;
      }
      
      // types filter
      if (section.types !== undefined && section.types !== null) {
        if (section.types.length === 0) continue;
        if (!section.types.includes(c.type)) continue;
      }
      
      const stim = c.stimulus;
      if (stim !== undefined && stim !== null) {
        if (!stimToIndex.has(stim)) {
          stimToIndex.set(stim, groups.length);
          groups.push([]);
        }
        groups[stimToIndex.get(stim)].push(c);
      } else {
        // No stimulus: each candidate is its own group
        groups.push([c]);
      }
    }

    // Tier split: a group is examOnly if ANY member is; examOnly tier is drawn first.
    const tierOf = (g) => g.some(c => c.examOnly === true);
    const tiers = [groups.filter(tierOf), groups.filter(g => !tierOf(g))];
    let remaining = section.count;
    let state = seed;
    for (const tierGroups of tiers) {
      if (tierGroups.length === 0) continue;
      if (tierGroups !== tiers[0] && tiers[0].length > 0 && remaining === 0) continue; // tier 2 not drawn once tier 1 filled the section
      const r = drawTierJs(tierGroups, remaining, state);
      state = r.state;
      remaining = r.left;
      for (const c of r.picked) { used.add(c.id); ids.push(c.id); }
    }
    seed = state;
    const count = section.count;

    const sectionCount = count - remaining;
    sectionsOut.push({ title: section.title, start: sectionStart, count: sectionCount });
    startIdx += sectionCount;
    
    if (remaining > 0) {
      short.push({ title: section.title, shortBy: remaining });
    }
  }

  return { ids, short, sections: sectionsOut };
}

function scoreJs(input) {
  const results = input.results || [];
  const total = input.total || 0;
  const passMark = input.passMark === undefined ? 0.6 : input.passMark;

  const raw = results.filter(r => r.correct).length;
  const fraction = total === 0 ? 0.0 : raw / total;

  // mode = input.pass && input.pass.mode ? input.pass.mode : (input.scoring ? 'points' : 'percent')
  const mode = input.pass && input.pass.mode ? input.pass.mode : (input.scoring ? 'points' : 'percent');

  let pass;
  let parts, totalPoints;

  if (input.scoring) {
    totalPoints = 0;
    parts = input.scoring.map(part => {
      let partRaw = 0;
      let partTotal = 0;
      for (const title of part.sections) {
        const sr = input.sections.find(x => x.title === title);
        partTotal += sr.count;
        partRaw += results.slice(sr.start, sr.start + sr.count).filter(r => r.correct).length;
      }
      const points = partTotal === 0 ? 0 : Math.round(part.points * partRaw / partTotal);
      totalPoints += points;
      const partPass = part.minPoints === undefined || points >= part.minPoints;
      return { title: part.title, raw: partRaw, total: partTotal, points, pass: partPass };
    });
  }

  if (mode === 'percent') {
    pass = total > 0 && fraction >= passMark;
  } else {
    // points mode
    pass = parts.every(p => p.pass) && (input.passPoints === undefined || totalPoints >= input.passPoints);
  }

  const out = { raw, total, fraction, pass };
  if (parts) {
    out.parts = parts;
    out.totalPoints = totalPoints;
  }
  if (mode === 'points' && input.pass && input.pass.scaled === true) {
    out.estimate = true;
  }
  return out;
}

// ============================================================
// CHECK.JSON CASES
// ============================================================

function makeCheckCases() {
  const groups = [];

  // normalize cases
  const normalizeCases = [];

  normalizeCases.push({
    name: 'default_trim_lowercase',
    input: { text: '  Paris ' },
    expect: 'paris',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'case_sensitive_on',
    input: { text: '  Paris ', opts: { caseSensitive: true, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'Paris',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'collapse_spaces',
    input: { text: 'new   york', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'new york',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'collapse_off_keeps_double_space',
    input: { text: 'new  york', opts: { caseSensitive: false, trim: true, collapseSpaces: false, stripPunctuation: false } },
    expect: 'new  york',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'trim_off_keeps_leading_space',
    input: { text: ' paris', opts: { caseSensitive: false, trim: false, collapseSpaces: true, stripPunctuation: false } },
    expect: ' paris',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'strip_punctuation',
    input: { text: "Don't!", opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: true } },
    expect: 'dont',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'punctuation_kept_by_default',
    input: { text: "Don't!" },
    expect: "don't!",
    source: 'spec'
  });

  normalizeCases.push({
    name: 'cyrillic',
    input: { text: 'МОСКВА', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'москва',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'accented_latin',
    input: { text: 'Café', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'café',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'cafe_not_equal_cafe',
    input: { text: 'cafe', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'cafe',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'fold_kana_table',
    input: { text: 'アイ', opts: { fold: [['ア', 'あ'], ['イ', 'い']] } },
    expect: 'あい',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'fold_yo_to_ye',
    input: { text: 'Ёлка', opts: { fold: [['ё', 'е']] } },
    expect: 'елка',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'fold_range_case_sensitive',
    input: { text: 'ABC xyz', opts: { caseSensitive: true, fold: [['A-Z', 'a-z']] } },
    expect: 'abc xyz',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'fold_delete',
    input: { text: 'はい。', opts: { fold: [['。', '']] } },
    expect: 'はい',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'digits',
    input: { text: '42' },
    expect: '42',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'digits_with_space',
    input: { text: '4 2', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: '4 2',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'strip_punctuation_comma',
    input: { text: 'a,b', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: true } },
    expect: 'ab',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'empty_input',
    input: { text: '' },
    expect: '',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'tab_and_newline',
    input: { text: 'a\tb\nc', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'a b c',
    source: 'spec'
  });

  normalizeCases.push({
    name: 'non_breaking_space',
    input: { text: 'a\u00A0b', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'a b',
    source: 'spec'
  });

  groups.push({ fn: 'normalize', cases: normalizeCases });

  // checkGap cases
  const checkGapCases = [];

  checkGapCases.push({
    name: 'multiple_accepted_answers_second_matches',
    input: { answers: ['Paris', 'paris'], input: 'paris' },
    expect: true,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'empty_answers',
    input: { answers: [], input: 'paris' },
    expect: false,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'empty_input',
    input: { answers: ['paris'], input: '' },
    expect: false,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'empty_input_matches_empty_answer',
    input: { answers: [''], input: '' },
    expect: true,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'digits_match',
    input: { answers: ['42'], input: '42' },
    expect: true,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'digits_with_space_no_match',
    input: { answers: ['42'], input: '4 2', opts: { collapseSpaces: false } },
    expect: false,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'cyrillic_case_insensitive',
    input: { answers: ['МОСКВА'], input: 'москва' },
    expect: true,
    source: 'spec'
  });

  checkGapCases.push({
    name: 'accented_latin_match',
    input: { answers: ['café'], input: 'Café' },
    expect: true,
    source: 'spec'
  });

  groups.push({ fn: 'checkGap', cases: checkGapCases });

  // gapVerdict cases
  const gapVerdictCases = [];

  gapVerdictCases.push({
    name: 'input_matches_answer',
    input: { answers: ['Paris'], retry: [], input: 'Paris' },
    expect: 'ok',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'input_matches_retry',
    input: { answers: ['Paris'], retry: ['Pariz'], input: 'Pariz' },
    expect: 'retry',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'input_matches_neither',
    input: { answers: ['Paris'], retry: ['Pariz'], input: 'London' },
    expect: 'wrong',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'empty_retry_treated_as_no_retry',
    input: { answers: ['Paris'], input: 'London' },
    expect: 'wrong',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'normalization_applies_to_retry',
    input: { answers: ['Paris'], retry: ['Pariz'], input: 'pariz', opts: { caseSensitive: false } },
    expect: 'retry',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'case_sensitive_retry_no_match',
    input: { answers: ['Paris'], retry: ['paris'], input: 'PARIS', opts: { caseSensitive: true } },
    expect: 'wrong',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'retry_answer_overlap_checked_first',
    input: { answers: ['Paris'], retry: ['Paris'], input: 'Paris' },
    expect: 'ok',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'multiple_answers_match',
    input: { answers: ['Paris', 'Roma'], retry: ['Pariz'], input: 'Roma' },
    expect: 'ok',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'multiple_retry_match',
    input: { answers: ['Paris'], retry: ['Pariz', 'Londinium'], input: 'Londinium' },
    expect: 'retry',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'fold_applies_to_input_and_answer',
    input: { answers: ['Ёлка'], retry: [], input: 'елка', opts: { fold: [['ё', 'е']] } },
    expect: 'ok',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'fold_applies_to_retry',
    input: { answers: ['Paris'], retry: ['Ёлка'], input: 'елка', opts: { fold: [['ё', 'е']] } },
    expect: 'retry',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'fold_absent_distinguishes_yo',
    input: { answers: ['Ёлка'], retry: [], input: 'елка' },
    expect: 'wrong',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'case_and_space_normalized',
    input: { answers: ['New York'], retry: ['Nu York'], input: '  NEW   york ' },
    expect: 'ok',
    source: 'spec'
  });

  gapVerdictCases.push({
    name: 'space_normalized_retry',
    input: { answers: ['New York'], retry: ['Nu York'], input: ' nu \t YORK  ' },
    expect: 'retry',
    source: 'spec'
  });

  groups.push({ fn: 'gapVerdict', cases: gapVerdictCases });

  // checkChoice cases
  const checkChoiceCases = [];

  checkChoiceCases.push({
    name: 'same_answer',
    input: { answer: 5, selected: 5 },
    expect: true,
    source: 'spec'
  });

  checkChoiceCases.push({
    name: 'different_answer',
    input: { answer: 5, selected: 3 },
    expect: false,
    source: 'spec'
  });

  groups.push({ fn: 'checkChoice', cases: checkChoiceCases });

  // checkMulti cases
  const checkMultiCases = [];

  checkMultiCases.push({
    name: 'exact_set_equal_different_order',
    input: { correct: [0, 1, 2], selected: [2, 1, 0] },
    expect: true,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'duplicates_in_selected',
    input: { correct: [0, 1, 2], selected: [2, 1, 0, 0] },
    expect: true,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'empty_selected_empty_correct',
    input: { correct: [], selected: [] },
    expect: true,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'empty_selected_non_empty_correct',
    input: { correct: [0, 1], selected: [] },
    expect: false,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'out_of_range_index_in_selected',
    input: { correct: [0, 1], selected: [0, 2] },
    expect: false,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'subset_not_equal',
    input: { correct: [0, 1, 2], selected: [0, 1] },
    expect: false,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'superset_not_equal',
    input: { correct: [0, 1], selected: [0, 1, 2] },
    expect: false,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'single_element_match',
    input: { correct: [3], selected: [3] },
    expect: true,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'duplicates_in_both',
    input: { correct: [1, 1, 2], selected: [2, 1, 1] },
    expect: true,
    source: 'spec'
  });

  checkMultiCases.push({
    name: 'different_sets',
    input: { correct: [0, 1], selected: [2, 3] },
    expect: false,
    source: 'spec'
  });

  groups.push({ fn: 'checkMulti', cases: checkMultiCases });

  // checkMatch cases
  const checkMatchCases = [];

  checkMatchCases.push({
    name: 'identity_mapping_correct',
    input: { pairCount: 3, mapping: [0, 1, 2] },
    expect: { correct: true, wrong: [] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'one_wrong_pair',
    input: { pairCount: 3, mapping: [0, 2, 2] },
    expect: { correct: false, wrong: [1] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'short_mapping_missing_entry',
    input: { pairCount: 3, mapping: [0, 1] },
    expect: { correct: false, wrong: [2] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'long_mapping_not_correct',
    input: { pairCount: 2, mapping: [0, 1, 2] },
    expect: { correct: false, wrong: [] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'pair_count_0_empty_mapping',
    input: { pairCount: 0, mapping: [] },
    expect: { correct: true, wrong: [] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'all_wrong',
    input: { pairCount: 2, mapping: [1, 0] },
    expect: { correct: false, wrong: [0, 1] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'first_pair_wrong',
    input: { pairCount: 3, mapping: [1, 1, 2] },
    expect: { correct: false, wrong: [0] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'partial_correct',
    input: { pairCount: 4, mapping: [0, 1, 3, 3] },
    expect: { correct: false, wrong: [2] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'empty_mapping_non_zero_pair_count',
    input: { pairCount: 2, mapping: [] },
    expect: { correct: false, wrong: [0, 1] },
    source: 'spec'
  });

  checkMatchCases.push({
    name: 'identity_with_extra',
    input: { pairCount: 2, mapping: [0, 1, 0] },
    expect: { correct: false, wrong: [] },
    source: 'spec'
  });

  groups.push({ fn: 'checkMatch', cases: checkMatchCases });

  // checkOrder cases
  const checkOrderCases = [];

  checkOrderCases.push({
    name: 'correct_order',
    input: { stepCount: 3, sequence: [0, 1, 2] },
    expect: { correct: true, firstWrong: null },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'reversed_order',
    input: { stepCount: 3, sequence: [2, 1, 0] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'one_swap_first_wrong',
    input: { stepCount: 3, sequence: [1, 0, 2] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'sequence_too_short',
    input: { stepCount: 3, sequence: [0, 1] },
    expect: { correct: false, firstWrong: 2 },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'sequence_too_long',
    input: { stepCount: 2, sequence: [0, 1, 2] },
    expect: { correct: false, firstWrong: 2 },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'step_count_0_empty_sequence',
    input: { stepCount: 0, sequence: [] },
    expect: { correct: true, firstWrong: null },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'all_wrong_from_start',
    input: { stepCount: 4, sequence: [1, 2, 3, 0] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'correct_until_last',
    input: { stepCount: 3, sequence: [0, 1, 0] },
    expect: { correct: false, firstWrong: 2 },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'single_element_correct',
    input: { stepCount: 1, sequence: [0] },
    expect: { correct: true, firstWrong: null },
    source: 'spec'
  });

  checkOrderCases.push({
    name: 'empty_sequence_non_zero_step_count',
    input: { stepCount: 2, sequence: [] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  groups.push({ fn: 'checkOrder', cases: checkOrderCases });

  // checkCloze cases
  const checkClozeCases = [];

  checkClozeCases.push({
    name: 'all_blanks_match',
    input: { blanks: [['Paris'], ['Rome']], inputs: ['Paris', 'Rome'] },
    expect: { correct: true, results: [true, true] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'second_alternative_matches',
    input: { blanks: [['Paris', 'paris']], inputs: ['paris'] },
    expect: { correct: true, results: [true] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'case_sensitive_fail',
    input: { blanks: [['Paris']], inputs: ['paris'], opts: { caseSensitive: true, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: { correct: false, results: [false] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'input_missing_for_blank',
    input: { blanks: [['Paris'], ['Rome']], inputs: ['Paris'] },
    expect: { correct: false, results: [true, false] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'empty_blanks_list',
    input: { blanks: [], inputs: [] },
    expect: { correct: false, results: [] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'extra_inputs_ignored',
    input: { blanks: [['Paris']], inputs: ['Paris', 'extra'] },
    expect: { correct: true, results: [true] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'wrong_answer',
    input: { blanks: [['Paris']], inputs: ['London'] },
    expect: { correct: false, results: [false] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'multiple_blanks_all_correct',
    input: { blanks: [['A', 'a'], ['B', 'b'], ['C', 'c']], inputs: ['a', 'B', 'c'] },
    expect: { correct: true, results: [true, true, true] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'one_blank_wrong',
    input: { blanks: [['A'], ['B'], ['C']], inputs: ['A', 'X', 'C'] },
    expect: { correct: false, results: [true, false, true] },
    source: 'spec'
  });

  checkClozeCases.push({
    name: 'all_empty_inputs',
    input: { blanks: [['A'], ['B']], inputs: ['', ''] },
    expect: { correct: false, results: [false, false] },
    source: 'spec'
  });

  groups.push({ fn: 'checkCloze', cases: checkClozeCases });

  // checkNumeric cases
  const checkNumericCases = [];

  checkNumericCases.push({
    name: 'comma_as_decimal_1_5',
    input: { answer: 1.5, input: '1,5' },
    expect: { correct: true, parsed: 1.5 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'comma_as_decimal_1_000',
    input: { answer: 1.0, input: '1,000' },
    expect: { correct: true, parsed: 1.0 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'space_invalid',
    input: { answer: 0.0, input: '1 000' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'plus_sign',
    input: { answer: 2.0, input: '+2' },
    expect: { correct: true, parsed: 2.0 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'scientific_notation',
    input: { answer: 1000.0, input: '1e3' },
    expect: { correct: true, parsed: 1000.0 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'dot_five',
    input: { answer: 0.5, input: '.5' },
    expect: { correct: true, parsed: 0.5 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'five_dot',
    input: { answer: 5.0, input: '5.' },
    expect: { correct: true, parsed: 5.0 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'empty_string',
    input: { answer: 0.0, input: '' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'abc_invalid',
    input: { answer: 0.0, input: 'abc' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'double_minus_invalid',
    input: { answer: 0.0, input: '--1' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'tolerance_boundary_exact',
    input: { answer: 1.0, tolerance: 0.5, input: '1.5' },
    expect: { correct: true, parsed: 1.5 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'float_slack_0_3',
    input: { answer: 0.30000000000000004, input: '0.3' },
    expect: { correct: true, parsed: 0.3 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'negative_answer_correct',
    input: { answer: -2.0, input: '-2' },
    expect: { correct: true, parsed: -2.0 },
    source: 'spec'
  });

  checkNumericCases.push({
    name: 'negative_input_wrong',
    input: { answer: 2.0, input: '-2' },
    expect: { correct: false, parsed: -2.0 },
    source: 'spec'
  });

  groups.push({ fn: 'checkNumeric', cases: checkNumericCases });

  return { groups: groups };
}

// ============================================================
// EXAM.JSON CASES
// ============================================================

function makeExamCases() {
  const groups = [];

  // splitmix64 cases
  const splitmix64Cases = [];

  splitmix64Cases.push({
    name: 'seed_0_n_5',
    input: { seed: '0', n: 5 },
    expect: (() => {
      let state = 0n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  splitmix64Cases.push({
    name: 'seed_1_n_5',
    input: { seed: '1', n: 5 },
    expect: (() => {
      let state = 1n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  splitmix64Cases.push({
    name: 'seed_42_n_5',
    input: { seed: '42', n: 5 },
    expect: (() => {
      let state = 42n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  splitmix64Cases.push({
    name: 'seed_u64_max_n_5',
    input: { seed: '18446744073709551615', n: 5 },
    expect: (() => {
      let state = 18446744073709551615n;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { newState, value } = splitmix64Js(state);
        state = newState;
        results.push(value.toString());
      }
      return results;
    })(),
    source: 'spec'
  });

  groups.push({ fn: 'splitmix64', cases: splitmix64Cases });

  // sample cases
  const sampleCases = [];

  sampleCases.push({
    name: 'single_section',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'two_sections_sharing_pool',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' },
        { id: 'c4', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [
        { title: 's1', count: 2 },
        { title: 's2', count: 2 }
      ],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' },
        { id: 'c4', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [
        { title: 's1', count: 2 },
        { title: 's2', count: 2 }
      ],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'filter_by_unit',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u2', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: ['u1'] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u2', tags: [], type: 't1' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: ['u1'] }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'filter_by_tag',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: ['tag1'], type: 't1' },
        { id: 'c2', unit: 'u1', tags: ['tag2'], type: 't1' },
        { id: 'c3', unit: 'u1', tags: ['tag1'], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, tags: ['tag1'] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: ['tag1'], type: 't1' },
        { id: 'c2', unit: 'u1', tags: ['tag2'], type: 't1' },
        { id: 'c3', unit: 'u1', tags: ['tag1'], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, tags: ['tag1'] }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'filter_by_type',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't2' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, types: ['t1'] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't2' },
        { id: 'c3', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, types: ['t1'] }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'shortage',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 5 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 5 }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'count_0',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 0 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 0 }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'empty_candidates',
    input: {
      candidates: [],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [],
      sections: [{ title: 's1', count: 2 }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'same_seed_same_input',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '100'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2 }],
      seed: '100'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'different_seeds_differ',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 1 }],
      seed: '101'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' },
        { id: 'c2', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 1 }],
      seed: '101'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'large_pool',
    input: {
      candidates: Array.from({ length: 30 }, (_, i) => ({
        id: `c${i + 1}`,
        unit: 'u1',
        tags: [],
        type: 't1'
      })),
      sections: [{ title: 's1', count: 10 }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: Array.from({ length: 30 }, (_, i) => ({
        id: `c${i + 1}`,
        unit: 'u1',
        tags: [],
        type: 't1'
      })),
      sections: [{ title: 's1', count: 10 }],
      seed: '42'
    }),
    source: 'spec'
  });

  sampleCases.push({
    name: 'empty_filter_list_passes_nothing',
    input: {
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: [] }],
      seed: '42'
    },
    expect: sampleJs({
      candidates: [
        { id: 'c1', unit: 'u1', tags: [], type: 't1' }
      ],
      sections: [{ title: 's1', count: 2, units: [] }],
      seed: '42'
    }),
    source: 'spec'
  });

  // F10a: stimulus-group fill repair
  const grp = (stim, n) => Array.from({ length: n }, (_, k) => ({ id: `${stim}-${k + 1}`, unit: 'u1', tags: [], type: 'choice', stimulus: stim }));
  const repairCase = (name, sizes, count, seed) => {
    const input = {
      candidates: sizes.flatMap((n, i) => grp(`g${i + 1}`, n)),
      sections: [{ title: 's1', count }],
      seed: String(seed)
    };
    sampleCases.push({ name, input, expect: sampleJs(input), source: 'f10a' });
  };
  // groups 3,2,2 into 4: greedy stalls at 3 whenever the 3-group comes first; repair gives 2+2
  for (const seed of [1, 2, 3, 4, 5, 6]) repairCase(`sample_repair_fills_seed_${seed}`, [3, 2, 2], 4, seed);
  // groups 2,2,2,2 into 5: several optimal subsets (sum 4), the shuffle picks which
  for (const seed of [7, 8]) repairCase(`sample_repair_tie_seed_${seed}`, [2, 2, 2, 2], 5, seed);
  // groups 4,4 into 5: best sum is 4, still short
  repairCase('sample_repair_unfixable_still_short', [4, 4], 5, 42);
  // stimulus-free section next to a group: unchanged greedy
  repairCase('sample_repair_single_group_exact', [3], 3, 9);

  // examOnly tiers (EU-1)
  const eo = (id, extra) => Object.assign({ id, unit: 'u1', tags: [], type: 't1' }, extra);
  const eoCase = (name, candidates, sections) => {
    const input = { candidates, sections, seed: '42' };
    sampleCases.push({ name, input, expect: sampleJs(input), source: 'spec' });
  };
  eoCase('exam_only_enough_to_fill_section', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3', { examOnly: true }), eo('c4')], [{ title: 's1', count: 3 }]);
  eoCase('exam_only_too_few_fill_from_regular', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3'), eo('c4')], [{ title: 's1', count: 4 }]);
  eoCase('exam_only_two_sections_shared_pool', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3'), eo('c4')], [{ title: 's1', count: 2 }, { title: 's2', count: 2 }]);
  eoCase('exam_only_stimulus_group_whole', [eo('g1-1', { type: 'choice', stimulus: 's1', examOnly: true }), eo('g1-2', { type: 'choice', stimulus: 's1' }), eo('g1-3', { type: 'choice', stimulus: 's1' }), eo('c1')], [{ title: 's1', count: 3 }]);
  eoCase('no_exam_only_same_as_before', [eo('c1'), eo('c2'), eo('c3')], [{ title: 's1', count: 2 }]);
  eoCase('all_exam_only_same_as_unflagged', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3', { examOnly: true })], [{ title: 's1', count: 2 }]);

  groups.push({ fn: 'sample', cases: sampleCases });

  // score cases
  const scoreCases = [];

  scoreCases.push({
    name: 'all_correct',
    input: {
      results: [
        { id: 'q1', correct: true },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true }
      ],
      total: 3,
      passMark: 0.7
    },
    expect: scoreJs({
      results: [
        { id: 'q1', correct: true },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true }
      ],
      total: 3,
      passMark: 0.7
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'none_correct',
    input: {
      results: [
        { id: 'q1', correct: false },
        { id: 'q2', correct: false }
      ],
      total: 2,
      passMark: 0.5
    },
    expect: scoreJs({
      results: [
        { id: 'q1', correct: false },
        { id: 'q2', correct: false }
      ],
      total: 2,
      passMark: 0.5
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'boundary_exactly_at_pass_mark',
    input: {
      results: [
        { id: 'q1', correct: true },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true },
        { id: 'q4', correct: true },
        { id: 'q5', correct: true },
        { id: 'q6', correct: true },
        { id: 'q7', correct: true }
      ],
      total: 10,
      passMark: 0.7
    },
    expect: scoreJs({
      results: [
        { id: 'q1', correct: true },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true },
        { id: 'q4', correct: true },
        { id: 'q5', correct: true },
        { id: 'q6', correct: true },
        { id: 'q7', correct: true }
      ],
      total: 10,
      passMark: 0.7
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'just_below_pass_mark',
    input: {
      results: [
        { id: 'q1', correct: true },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true },
        { id: 'q4', correct: true },
        { id: 'q5', correct: true },
        { id: 'q6', correct: true },
        { id: 'q7', correct: false }
      ],
      total: 10,
      passMark: 0.7
    },
    expect: scoreJs({
      results: [
        { id: 'q1', correct: true },
        { id: 'q2', correct: true },
        { id: 'q3', correct: true },
        { id: 'q4', correct: true },
        { id: 'q5', correct: true },
        { id: 'q6', correct: true },
        { id: 'q7', correct: false }
      ],
      total: 10,
      passMark: 0.7
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'total_0',
    input: {
      results: [],
      total: 0,
      passMark: 0.5
    },
    expect: scoreJs({
      results: [],
      total: 0,
      passMark: 0.5
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'unanswered_questions',
    input: {
      results: [
        { id: 'q1', correct: true }
      ],
      total: 5,
      passMark: 0.5
    },
    expect: scoreJs({
      results: [
        { id: 'q1', correct: true }
      ],
      total: 5,
      passMark: 0.5
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'duplicate_ids_count_each',
    input: {
      results: [
        { id: 'q1', correct: true },
        { id: 'q1', correct: true }
      ],
      total: 2,
      passMark: 0.5
    },
    expect: scoreJs({
      results: [
        { id: 'q1', correct: true },
        { id: 'q1', correct: true }
      ],
      total: 2,
      passMark: 0.5
    }),
    source: 'spec'
  });

  // scoring cases (JLPT-shaped: s12 120 questions of 1 point, min 38; l 60 questions, min 19; passPoints 80)
  const jlptSections = [
    { title: 's12', start: 0, count: 120 },
    { title: 'l', start: 120, count: 60 }
  ];
  const jlptScoring = [
    { title: 'Language knowledge', sections: ['s12'], points: 120, minPoints: 38 },
    { title: 'Listening', sections: ['l'], points: 60, minPoints: 19 }
  ];
  const jlptInput = (name, s12Raw, lRaw, passMark, mode) => {
    const results = [];
    for (let i = 0; i < 120; i++) results.push({ id: 'a' + i, correct: i < s12Raw });
    for (let i = 0; i < 60; i++) results.push({ id: 'b' + i, correct: i < lRaw });
    const input = { results, total: 180, passMark, sections: jlptSections, scoring: jlptScoring, passPoints: 80, pass: mode ? { mode } : undefined };
    scoreCases.push({ name, input, expect: scoreJs(input), source: 'spec' });
  };
  jlptInput('jlpt_pass', 70, 30, 0.0);
  jlptInput('jlpt_pass_exactly_80', 40, 40, 0.0);
  jlptInput('jlpt_fail_total_79', 40, 39, 0.0);
  jlptInput('jlpt_fail_part_minimum', 100, 18, 0.0);
  jlptInput('jlpt_points_mode_ignores_pass_mark', 70, 30, 0.9, 'points');

  // percent mode case with passMark: 0 - the check must be === undefined (not ||)
  scoreCases.push({
    name: 'percent_mode_pass_mark_zero',
    input: {
      results: Array(3).fill(null).map((_, i) => ({ id: 'q' + i, correct: false })),
      total: 3,
      passMark: 0,
      pass: { mode: 'percent' },
    },
    expect: scoreJs({
      results: Array(3).fill(null).map((_, i) => ({ id: 'q' + i, correct: false })),
      total: 3,
      passMark: 0,
      pass: { mode: 'percent' }
    }),
    source: 'spec'
  });

  // default passMark is 0.6
  scoreCases.push({
    name: 'default_pass_mark_6_of_10',
    input: {
      results: Array(6).fill(null).map((_, i) => ({ id: 'q' + i, correct: true })).concat(Array(4).fill(null).map((_, i) => ({ id: 'q' + (i + 6), correct: false }))),
      total: 10
    },
    expect: scoreJs({
      results: Array(6).fill(null).map((_, i) => ({ id: 'q' + i, correct: true })).concat(Array(4).fill(null).map((_, i) => ({ id: 'q' + (i + 6), correct: false }))),
      total: 10
    }),
    source: 'spec'
  });

  scoreCases.push({
    name: 'default_pass_mark_5_of_10',
    input: {
      results: Array(5).fill(null).map((_, i) => ({ id: 'q' + i, correct: true })).concat(Array(5).fill(null).map((_, i) => ({ id: 'q' + (i + 5), correct: false }))),
      total: 10
    },
    expect: scoreJs({
      results: Array(5).fill(null).map((_, i) => ({ id: 'q' + i, correct: true })).concat(Array(5).fill(null).map((_, i) => ({ id: 'q' + (i + 5), correct: false }))),
      total: 10
    }),
    source: 'spec'
  });

  // percent mode with scoring: pass.mode = 'percent', so passMark is used and parts minPoints are ignored for pass
  const percentModeInput = {
    results: [
      { id: 'a0', correct: true },
      { id: 'a1', correct: true },
      { id: 'a2', correct: true },
      { id: 'a3', correct: false }
    ],
    total: 4,
    passMark: 0.5,
    pass: { mode: 'percent' },
    sections: [{ title: 's', start: 0, count: 4 }],
    scoring: [{ title: 'P', sections: ['s'], points: 10, minPoints: 100 }]
  };
  scoreCases.push({
    name: 'percent_mode_with_scoring_ignores_points',
    input: percentModeInput,
    expect: scoreJs(percentModeInput),
    source: 'spec'
  });

  // points scaled sets estimate
  const jlptScaledInput = {
    results: [],
    total: 180,
    passMark: 0.0,
    pass: { mode: 'points', scaled: true },
    sections: jlptSections,
    scoring: jlptScoring,
    passPoints: 80
  };
  for (let i = 0; i < 120; i++) jlptScaledInput.results.push({ id: 'a' + i, correct: i < 70 });
  for (let i = 0; i < 60; i++) jlptScaledInput.results.push({ id: 'b' + i, correct: i < 30 });
  scoreCases.push({
    name: 'points_scaled_sets_estimate',
    input: jlptScaledInput,
    expect: scoreJs(jlptScaledInput),
    source: 'spec'
  });

  // points unscaled no estimate
  const jlptUnscaledInput = {
    results: [],
    total: 180,
    passMark: 0.0,
    pass: { mode: 'points' },
    sections: jlptSections,
    scoring: jlptScoring,
    passPoints: 80
  };
  for (let i = 0; i < 120; i++) jlptUnscaledInput.results.push({ id: 'a' + i, correct: i < 70 });
  for (let i = 0; i < 60; i++) jlptUnscaledInput.results.push({ id: 'b' + i, correct: i < 30 });
  scoreCases.push({
    name: 'points_unscaled_no_estimate',
    input: jlptUnscaledInput,
    expect: scoreJs(jlptUnscaledInput),
    source: 'spec'
  });

  const roundingInput = (name, rawCorrect) => {
    const results = [];
    for (let i = 0; i < 8; i++) results.push({ id: 'r' + i, correct: i < rawCorrect });
    const input = {
      results, total: 8, passMark: 0.0,
      sections: [{ title: 's', start: 0, count: 8 }],
      scoring: [{ title: 'P', sections: ['s'], points: 60 }]
    };
    scoreCases.push({ name, input, expect: scoreJs(input), source: 'spec' });
  };
  roundingInput('parts_rounding_7_5_up', 1);
  roundingInput('parts_rounding_22_5_up', 3);
  roundingInput('parts_rounding_zero_raw', 0);

  scoreCases.push((() => {
    const input = {
      results: [{ id: 'q', correct: true }], total: 1, passMark: 0.5,
      sections: [{ title: 's', start: 0, count: 0 }],
      scoring: [{ title: 'P', sections: ['s'], points: 10 }]
    };
    return { name: 'parts_zero_total_gives_zero_points', input, expect: scoreJs(input), source: 'spec' };
  })());

  groups.push({ fn: 'score', cases: scoreCases });

  return { groups: groups };
}

// ============================================================
// MAIN
// ============================================================

function main() {
  const vectorsDir = path.join(__dirname, 'vectors');
  if (!fs.existsSync(vectorsDir)) {
    fs.mkdirSync(vectorsDir);
  }

  // Generate all files
  const srsData = makeSrsCases();
  const sanitizeData = makeSanitizeCases();
  const mergeData = makeMergeCases();
  const daysData = makeDaysCases();
  const checkData = makeCheckCases();
  const examData = makeExamCases();

  // Self-check: unique names within each group
  for (const group of srsData.groups) {
    assertUnique(group.cases, `srs/${group.fn}`);
  }
  assertUnique(sanitizeData.cases, 'sanitize');
  assertUnique(mergeData.cases, 'merge');
  for (const group of daysData.groups) {
    assertUnique(group.cases, `days/${group.fn}`);
  }
  for (const group of checkData.groups) {
    assertUnique(group.cases, `check/${group.fn}`);
  }
  for (const group of examData.groups) {
    assertUnique(group.cases, `exam/${group.fn}`);
  }

  // Count reference vs spec
  let total = 0, refCount = 0, specCount = 0;

  for (const group of srsData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const c of sanitizeData.cases) {
    total++;
    if (c.source === 'reference') refCount++;
    else specCount++;
  }

  for (const c of mergeData.cases) {
    total++;
    if (c.source === 'reference') refCount++;
    else specCount++;
  }

  for (const group of daysData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const group of checkData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const group of examData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  // Write files
  fs.writeFileSync(path.join(vectorsDir, 'srs.json'), toJson(srsData));
  fs.writeFileSync(path.join(vectorsDir, 'sanitize.json'), toJson(sanitizeData));
  fs.writeFileSync(path.join(vectorsDir, 'merge.json'), toJson(mergeData));
  fs.writeFileSync(path.join(vectorsDir, 'days.json'), toJson(daysData));
  fs.writeFileSync(path.join(vectorsDir, 'check.json'), toJson(checkData));
  fs.writeFileSync(path.join(vectorsDir, 'exam.json'), toJson(examData));

  console.log(`vectors: ${total} cases (${refCount} reference, ${specCount} spec)`);
}

main();
