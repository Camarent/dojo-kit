'use strict';

const progress = require('../../../tools/reference/progress.js');
const { T0, D } = require('../const.js');
const { ref } = require('../ref.js');
const { draftExpectAll } = require('../oracles/srs.js');

function mergePartPart1(kit) {
  kit.cases = [];

  // reference kit.cases
  kit.addRefCase = function addRefCase(name, input) {
    const result = ref('merge', input.a, input.b);
    const commutes = ref('stableJson', result) === ref('stableJson', ref('merge', input.b, input.a));
    kit.cases.push({
      name: name,
      input: input,
      expect: result,
      source: 'reference',
      commutes: commutes
    });
  };

  // identical docs
  const doc1 = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  kit.addRefCase('identical_docs', { a: doc1, b: JSON.parse(JSON.stringify(doc1)) }, null);

  // disjoint ids union
  const docA = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  const docB = ref('sanitize', { v: 1, t: 20, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: {}, settings: {} });
  kit.addRefCase('disjoint_ids_union', { a: docA, b: docB }, null);

  // same id later last wins
  const docC1 = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  const docC2 = ref('sanitize', { v: 1, t: 20, items: { a: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 + D } }, stats: {}, settings: {} });
  kit.addRefCase('same_id_later_last_wins', { a: docC1, b: docC2 }, null);

  // same id equal last higher s wins
  const docD1 = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  const docD2 = ref('sanitize', { v: 1, t: 20, items: { a: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  kit.addRefCase('same_id_equal_last_higher_s_wins', { a: docD1, b: docD2 }, null);

  // newer resetAt drops older records and older-side stats/exams
  const docE1 = ref('sanitize', { v: 1, t: 10, resetAt: 5, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: 0 } }, stats: { days: { '2026-01-01': 5 } }, settings: {} });
  const docE2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: { days: { '2026-01-02': 3 } }, settings: {} });
  kit.addRefCase('newer_reset_at_drops_older', { a: docE1, b: docE2 }, null);

  // equal resetAt
  const docF1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: { days: { '2026-01-01': 5 } }, settings: {} });
  const docF2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: { days: { '2026-01-02': 3 } }, settings: {} });
  kit.addRefCase('equal_reset_at', { a: docF1, b: docF2 }, null);

  // stats days max per day for days and newByDay
  const docG1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: { days: { '2026-01-01': 5 }, newByDay: { '2026-01-01': 3 } }, settings: {} });
  const docG2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: { days: { '2026-01-01': 3 }, newByDay: { '2026-01-01': 5 } }, settings: {} });
  kit.addRefCase('stats_days_max_per_day', { a: docG1, b: docG2 }, null);

  // settings per field by ts
  const docH1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 10, ts: { newPerDay: 5 }, t: 5 } });
  const docH2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 20, ts: { newPerDay: 15 }, t: 15 } });
  kit.addRefCase('settings_per_field_by_ts', { a: docH1, b: docH2 }, null);

  // settings tie -> newer t
  const docI1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 10, t: 10 } });
  const docI2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: {}, settings: { newPerDay: 20, t: 20 } });
  kit.addRefCase('settings_tie_newer_t', { a: docI1, b: docI2 }, null);

  // placementDone OR-ed
  kit.docJ1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, stats: {}, settings: { placementDone: false, t: 10 } });
}

function mergePartPart2(kit) {
  const docJ2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, stats: {}, settings: { placementDone: true, t: 20 } });
  kit.addRefCase('placement_done_or_ed', { a: kit.docJ1, b: docJ2 }, null);

  // unknown top-level field from newer t side wins
  const docK1 = ref('sanitize', { v: 1, t: 10, items: {}, extraField: 'x' });
  const docK2 = ref('sanitize', { v: 1, t: 20, items: {}, extraField: 'y' });
  kit.addRefCase('unknown_top_level_newer_wins', { a: docK1, b: docK2 }, null);

  // exams union by key
  const docL1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {}, exams: { 'e1-100': { exam: 'e1', date: 100 } } });
  const docL2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {}, exams: { 'e2-200': { exam: 'e2', date: 200 } } });
  kit.addRefCase('exams_union_by_key', { a: docL1, b: docL2 }, null);

  // exams absent on both
  const docM1 = ref('sanitize', { v: 1, t: 10, resetAt: 10, items: {} });
  const docM2 = ref('sanitize', { v: 1, t: 20, resetAt: 10, items: {} });
  kit.addRefCase('exams_absent_on_both', { a: docM1, b: docM2 }, null);

  // empty doc + full doc (both orders)
  const empty = ref('sanitize', { v: 1, items: {}, stats: {}, settings: {} });
  const full = ref('sanitize', { v: 1, t: 10, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} });
  kit.addRefCase('empty_plus_full_a', { a: empty, b: full }, null);
  kit.addRefCase('empty_plus_full_b', { a: full, b: empty }, null);

  // non-commutative case: tie with differing unknown top-level fields
  const docN1 = ref('sanitize', { v: 1, t: 20, items: {}, extraField: 'x' });
  const docN2 = ref('sanitize', { v: 1, t: 20, items: {}, extraField: 'y' });
  kit.addRefCase('non_commutative_course_tie', { a: docN1, b: docN2 }, null);

  // spec kit.cases
  kit.cases.push({
    name: 'merge_ps_not_special',
    input: {
      a: ref('sanitize', { v: 1, items: { a: { s: 2, due: T0, ok: 1, bad: 0, last: T0, ps: 6 } }, stats: {}, settings: {} }),
      b: ref('sanitize', { v: 1, items: { a: { s: 3, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} })
    },
    expect: { v: 1, t: 0, resetAt: 0, items: { a: { s: 3, due: T0, ok: 1, bad: 0, last: T0 } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_custom_stats_map_max',
    input: {
      a: ref('sanitize', { v: 1, items: {}, stats: { studyDays: { '2026-01-01': 3, '2026-01-02': 5 } }, settings: {} }),
      b: ref('sanitize', { v: 1, items: {}, stats: { studyDays: { '2026-01-01': 7, '2026-01-03': 2 } }, settings: {} })
    },
    expect: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {}, studyDays: { '2026-01-01': 7, '2026-01-02': 5, '2026-01-03': 2 } }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_course_mismatch',
    input: {
      a: ref('sanitize', { v: 1, items: {}, course: 'x' }),
      b: ref('sanitize', { v: 1, items: {}, course: 'y' })
    },
    expect: { error: 'course_mismatch' },
    source: 'spec'
  });
}

function mergePartPart3(kit) {
  kit.cases.push({
    name: 'merge_import_never_resets',
    input: {
      a: ref('sanitize', { v: 1, t: 10, resetAt: 0, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 } }, stats: {}, settings: {} }),
      b: ref('sanitize', { v: 1, t: 20, resetAt: 0, items: { b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: {}, settings: {} })
    },
    expect: { v: 1, t: 20, resetAt: 0, items: { a: { s: 1, due: T0, ok: 1, bad: 0, last: T0 }, b: { s: 2, due: T0 + D, ok: 1, bad: 0, last: T0 + D } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  kit.mdoc = (t, stats, settings, extra) => Object.assign(
    { v: 1, t: t, resetAt: 0, items: {}, stats: Object.assign({ days: {}, newByDay: {} }, stats), settings: Object.assign({ newPerDay: 10, placementDone: false, t: 0 }, settings) },
    extra);
  const mdocExpect = (t, stats, settings, extra) => kit.mdoc(t, stats, settings, extra);

  kit.cases.push({
    name: 'merge_non_daymap_stats_newer_wins',
    input: { a: kit.mdoc(10, { note: 'old', obj: { a: 1 } }), b: kit.mdoc(20, { note: 'new' }) },
    expect: mdocExpect(20, { note: 'new', obj: { a: 1 } }),
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_non_daymap_stats_older_loses_swapped',
    input: { a: kit.mdoc(20, { note: 'old', obj: { a: 1 } }), b: kit.mdoc(10, { note: 'new' }) },
    expect: mdocExpect(20, { note: 'old', obj: { a: 1 } }),
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_course_one_side_only',
    input: { a: kit.mdoc(0, {}, {}, { course: 'demo' }), b: kit.mdoc(0, {}, {}) },
    expect: mdocExpect(0, {}, {}, { course: 'demo' }),
    commutes: true,
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_settings_ts_missing_field_falls_back_to_t',
    input: { a: kit.mdoc(0, {}, { newPerDay: 5, t: 100, ts: { other: 1 } }), b: kit.mdoc(0, {}, { newPerDay: 20, t: 50 }) },
    expect: mdocExpect(0, {}, { newPerDay: 5, t: 100 }),
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_non_object_input_null',
    input: { a: null, b: kit.mdoc(0, {}, {}) },
    expect: { error: 'invalid_document' },
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_non_object_input_array',
    input: { a: [], b: kit.mdoc(0, {}, {}) },
    expect: { error: 'invalid_document' },
    source: 'spec'
  });

  kit.cases.push({
    name: 'merge_fractional_t_kept',
    input: { a: kit.mdoc(10.5, {}, {}), b: kit.mdoc(3, {}, {}) },
    expect: mdocExpect(10.5, {}, {}),
    source: 'spec'
  });
}

function mergePartPart4(kit) {
  // examDraft kit.cases (F9a). The expectation is computed by an independent JS oracle from the design rules.
  kit.draftExpectAll = (docs) => draftExpectAll(docs, ref);
  kit.sj = (x) => JSON.stringify(progress.stableJson(x));
}

function mergePartPart5(kit) {
  const draftExpect = (a, b) => kit.draftExpectAll([a, b]);
  const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations(xs.slice(0, i).concat(xs.slice(i + 1))).map((p) => [x].concat(p))));
  const dcase = (name, a, b) => {
    const expect = draftExpect(a, b);
    if (kit.sj(draftExpect(b, a)) !== kit.sj(expect)) throw new Error('examDraft oracle not commutative: ' + name);
    kit.cases.push({ name: name, input: { a: a, b: b }, expect: expect, source: 'spec' });
  };
  // Join property over a set of docs: every permutation, folded left through the oracle's pairwise merge, equals the
  // n-ary result; emits the pairwise (partial, next) kit.cases of the first order and the reversed one.
  const dset = (name, docs) => {
    const want = kit.sj(kit.draftExpectAll(docs));
    permutations(docs).forEach((order) => {
      const folded = order.slice(1).reduce((acc, d) => draftExpect(acc, d), order[0]);
      if (kit.sj(folded) !== kit.sj(kit.draftExpectAll(order)) || kit.sj(kit.draftExpectAll(order)) !== want) throw new Error('examDraft oracle not a join: ' + name);
    });
    [docs, docs.slice().reverse()].forEach((order, k) => {
      const partial = draftExpect(order[0], order[1]);
      const rest = order.slice(2).reduce((acc, d) => draftExpect(acc, d), partial);
      kit.cases.push({ name: name + '_fold' + (k + 1) + '_pair', input: { a: partial, b: order[2] }, expect: draftExpect(partial, order[2]), source: 'spec' });
      if (kit.sj(rest) !== want) throw new Error('examDraft fold mismatch: ' + name);
    });
    kit.cases.push({ name: name + '_right_nested', input: { a: docs[0], b: draftExpect(docs[1], docs[2]) }, expect: kit.draftExpectAll(docs), source: 'spec' });
  };
  const dd = (t, d, extra) => kit.mdoc(t, {}, {}, Object.assign({ examDraft: d }, extra));
  const open = (sid, at, extra) => Object.assign({ sid: sid, updatedAt: at }, extra);
  const closedD = (sid, at, why) => ({ sid: sid, updatedAt: at, closed: why });
  const ans = (n) => Array.from({ length: n }, (_, i) => ({ i: i, c: i % 2 === 0, g: 'x' + i }));

  dcase('merge_examDraft_absent_on_both', kit.mdoc(5, {}, {}), kit.mdoc(7, {}, {}));
  dcase('merge_examDraft_one_side_only', dd(1, open('s1', 100)), kit.mdoc(9, {}, {}));
  dcase('merge_examDraft_one_side_only_b', kit.mdoc(9, {}, {}), dd(1, open('s1', 100)));
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
  dcase('merge_examDraft_resetAt_drops_draft', dd(1, open('s1', 50), { resetAt: 100 }), kit.mdoc(10, {}, {}, { resetAt: 100 }));
  dcase('merge_examDraft_resetAt_drops_draft_other_side_reset', dd(1, open('s1', 50)), kit.mdoc(10, {}, {}, { resetAt: 100 }));
  dcase('merge_examDraft_resetAt_keeps_newer_draft', dd(1, open('s1', 50)), dd(1, open('s2', 100), { resetAt: 100 }));
  dcase('merge_examDraft_resetAt_keeps_fresh_closed', dd(1, closedD('s1', 150, 'finished'), { resetAt: 100 }), kit.mdoc(10, {}, {}));
  dcase('merge_examDraft_invalid_missing_sid', dd(1, { updatedAt: 100 }), kit.mdoc(2, {}, {}));
  dcase('merge_examDraft_invalid_missing_updatedAt', dd(1, { sid: 's1' }), kit.mdoc(2, {}, {}));
  dcase('merge_examDraft_invalid_vs_valid_valid_wins', dd(9, { updatedAt: 100 }), dd(1, open('s1', 1)));
  dcase('merge_examDraft_invalid_both_larger_t_wins', dd(1, { sid: 7, updatedAt: 1 }), dd(2, { updatedAt: 'x' }));
  dcase('merge_examDraft_unknown_fields_survive', dd(1, open('s1', 100, { customField: 'value', anotherField: 42, nested: { k: [1, null] } })), kit.mdoc(2, {}, {}));
  dcase('merge_examDraft_sanitize_keeps_draft', dd(1, open('s1', 100, { answers: [{ i: 0, c: true, g: 'answer', extra: 1 }], sections: [{ title: 'T', start: 0, count: 1 }] })), dd(0, open('s1', 100, { answers: [{ i: 0, c: true, g: 'answer', extra: 1 }], sections: [{ title: 'T', start: 0, count: 1 }] })));

  const X = open('s1', 100), Y = closedD('s1', 50, 'finished'), Z = open('s2', 75);
  dset('merge_examDraft_join_reviewer_xyz', [dd(1, X), dd(1, Y), dd(1, Z)]);
  dset('merge_examDraft_join_two_closed_one_open', [dd(1, closedD('s1', 10, 'finished')), dd(2, closedD('s2', 20, 'abandoned')), dd(3, open('s1', 30, { answers: ans(2) }))]);
  dset('merge_examDraft_join_ties_and_reasons', [dd(1, closedD('s1', 5, 'finished')), dd(1, open('s1', 5, { answers: ans(1) })), dd(1, closedD('s1', 5, 'abandoned'))]);
  dset('merge_examDraft_join_with_closedSids_and_reset', [dd(1, open('s3', 40, { closedSids: [{ sid: 's1', updatedAt: 30 }, { sid: 's2', updatedAt: 5 }] }), { resetAt: 10 }), dd(2, open('s1', 35)), dd(0, closedD('s3', 8, 'expired'))]);
  dcase('merge_examDraft_closedSids_union_and_dead_slot', dd(1, open('s2', 60, { closedSids: [{ sid: 's1', updatedAt: 10 }] })), dd(1, closedD('s2', 20, 'finished')));
  dcase('merge_examDraft_closedSids_bounded_keeps_newest', dd(1, Object.assign(open('s99', 1000), { closedSids: Array.from({ length: 32 }, (_, i) => ({ sid: 'c' + String(i).padStart(2, '0'), updatedAt: 100 + i })) })), dd(1, closedD('old', 1, 'finished')));
}

function makeMergeCases() {
  const kit = {};
  mergePartPart1(kit);
  mergePartPart2(kit);
  mergePartPart3(kit);
  mergePartPart4(kit);
  mergePartPart5(kit);
  return { fn: 'merge', cases: kit.cases };
}

// ============================================================
// DAYS.JSON
// ============================================================


module.exports = { makeMergeCases };
