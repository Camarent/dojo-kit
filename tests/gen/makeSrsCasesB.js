'use strict';

const { T0, H, D, INTERVALS } = require('./const.js');
const { Fl, pickDrillJs } = require('./utils.js');
const { ref } = require('./ref.js');
const { unitQueueOracle } = require('./oracles/srs.js');

function srsBuildQueuePart1(kit) {
  kit.groups.push({ fn: 'weakest', cases: kit.weakestCases });

  // buildQueue
  kit.buildQueueCases = [];

  kit.order = ['a', 'b', 'c', 'd', 'e'];
  const itemsDue = {
    a: { s: 1, due: T0 + 2 * D, ok: 1, bad: 0, last: T0 - INTERVALS[1] },
    b: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 - INTERVALS[2] },
    c: { s: 3, due: T0 + 3 * D, ok: 3, bad: 0, last: T0 - INTERVALS[3] }
  };

  kit.buildQueueCases.push({
    name: 'due_sorted_ascending',
    input: { items: itemsDue, order: kit.order, now: T0, newAllowance: 0 },
    expect: ref('buildQueue', itemsDue, kit.order, T0, 0),
    source: 'reference'
  });

  const itemsFresh = {
    b: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 - INTERVALS[2] },
    c: { s: 3, due: T0 + 3 * D, ok: 3, bad: 0, last: T0 - INTERVALS[3] }
  };

  kit.buildQueueCases.push({
    name: 'fresh_limited_by_new_allowance',
    input: { items: itemsFresh, order: kit.order, now: T0, newAllowance: 2 },
    expect: ref('buildQueue', itemsFresh, kit.order, T0, 2),
    source: 'reference'
  });

  const itemsUnknown = {
    a: { s: 1, due: T0 + 2 * D, ok: 1, bad: 0, last: T0 - INTERVALS[1] },
    b: { s: 2, due: T0 + D, ok: 2, bad: 0, last: T0 - INTERVALS[2] },
    unknown: { s: 1, due: T0 + 5 * D, ok: 1, bad: 0, last: T0 - INTERVALS[1] }
  };

  kit.buildQueueCases.push({
    name: 'unknown_ids_ignored',
    input: { items: itemsUnknown, order: kit.order, now: T0, newAllowance: 0 },
    expect: ref('buildQueue', itemsUnknown, kit.order, T0, 0),
    source: 'reference'
  });

  kit.buildQueueCases.push({
    name: 'new_allowance_0',
    input: { items: {}, order: kit.order, now: T0, newAllowance: 0 },
    expect: ref('buildQueue', {}, kit.order, T0, 0),
    source: 'reference'
  });

  kit.buildQueueCases.push({
    name: 'empty_items',
    input: { items: {}, order: kit.order, now: T0, newAllowance: 5 },
    expect: ref('buildQueue', {}, kit.order, T0, 5),
    source: 'reference'
  });

  kit.buildQueueCases.push({
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
}

function srsApplyPlacementPart1(kit) {
  // applyPlacement
  kit.applyPlacementCases = [];

  // known=true: move to stage 4 with spread
  kit.applyPlacementCases.push({
    name: 'known_unseen_to_stage_4',
    input: { rec: null, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', null, true, T0, undefined, 1),
    source: 'reference'
  });

  kit.applyPlacementCases.push({
    name: 'known_new_rec_to_stage_4',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, undefined, 1),
    source: 'reference'
  });

  // Stage already at 4 should stay unchanged (idempotent)
  kit.applyPlacementCases.push({
    name: 'known_stage_4_unchanged',
    input: { rec: { s: 4, due: T0 + INTERVALS[4], ok: 5, bad: 1, last: T0 }, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 4, due: T0 + INTERVALS[4], ok: 5, bad: 1, last: T0 }, true, T0, undefined, 1),
    source: 'reference'
  });

  // Stage past 4 should stay unchanged (never lower)
  kit.applyPlacementCases.push({
    name: 'known_stage_5_unchanged',
    input: { rec: { s: 5, due: T0 + INTERVALS[5], ok: 10, bad: 2, last: T0 }, known: true, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 5, due: T0 + INTERVALS[5], ok: 10, bad: 2, last: T0 }, true, T0, undefined, 1),
    source: 'reference'
  });

  // known=false: return record unchanged
  kit.applyPlacementCases.push({
    name: 'unknown_null_rec_unchanged',
    input: { rec: null, known: false, now: T0, seed: '1' },
    expect: ref('applyPlacement', null, false, T0, undefined, 1),
    source: 'reference'
  });

  kit.applyPlacementCases.push({
    name: 'unknown_existing_rec_unchanged',
    input: { rec: { s: 2, due: T0 + INTERVALS[2], ok: 3, bad: 1, last: T0 }, known: false, now: T0, seed: '1' },
    expect: ref('applyPlacement', { s: 2, due: T0 + INTERVALS[2], ok: 3, bad: 1, last: T0 }, false, T0, undefined, 1),
    source: 'reference'
  });

  // Custom kit.ladder with fewer than 5 stages
  const shortLadder = [0, 4 * H, D, 3 * D]; // max stage = 3
  kit.applyPlacementCases.push({
    name: 'known_short_ladder_to_max_stage_3',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, ladder: shortLadder, seed: '1' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, shortLadder, 1),
    source: 'reference'
  });

  // Deterministic spread: same seed gives same result
  kit.applyPlacementCases.push({
    name: 'deterministic_spread_same_seed',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, seed: '42' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, undefined, 42),
    source: 'spec'
  });
}

function srsApplyPlacementPart2(kit) {
  // Different seeds give different results
  kit.applyPlacementCases.push({
    name: 'deterministic_spread_diff_seed',
    input: { rec: { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, known: true, now: T0, seed: '99' },
    expect: ref('applyPlacement', { s: 0, due: T0, ok: 0, bad: 0, last: T0 }, true, T0, undefined, 99),
    source: 'spec'
  });

  const placeRec = { s: 0, due: T0, ok: 0, bad: 0, last: T0 };
  for (const big of ['18446744073709551615', '12345678901234567890', '9007199254740993']) {
    kit.applyPlacementCases.push({
      name: 'large_seed_' + big,
      input: { rec: placeRec, known: true, now: T0, seed: big },
      expect: ref('applyPlacement', placeRec, true, T0, undefined, big),
      source: 'spec'
    });
  }
  for (const st of [1, 3]) {
    const r = { s: st, due: T0, ok: 2, bad: 0, last: T0 };
    kit.applyPlacementCases.push({
      name: 'known_from_stage_' + st + '_to_4',
      input: { rec: r, known: true, now: T0, seed: '7' },
      expect: ref('applyPlacement', r, true, T0, undefined, '7'),
      source: 'spec'
    });
  }
  {
    const r = { s: 0, due: T0, ok: 0, bad: 0, last: T0, ps: 7 };
    kit.applyPlacementCases.push({
      name: 'known_keeps_extra_fields',
      input: { rec: r, known: true, now: T0, seed: '5' },
      expect: ref('applyPlacement', r, true, T0, undefined, '5'),
      source: 'spec'
    });
    const one = [0];
    kit.applyPlacementCases.push({
      name: 'known_single_entry_ladder_unchanged',
      input: { rec: placeRec, known: true, now: T0, ladder: one, seed: '5' },
      expect: ref('applyPlacement', placeRec, true, T0, one, '5'),
      source: 'spec'
    });
  }

  kit.groups.push({ fn: 'applyPlacement', cases: kit.applyPlacementCases });

  // Per-unit new caps: independent oracle (spec: a fresh id is taken only while its unit's count < cap and total < allowance).
  kit.unitQueueOracle = unitQueueOracle;
}

function srsApplyPlacementPart3(kit) {
  const uOrder = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'];
  const uUnits = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B', b3: 'B', c1: 'C' };
  const uItems = { b1: { s: 1, due: T0 - D, ok: 1, bad: 0, last: T0 - 2 * D } };
  const addUnitCase = (name, allowance, caps, items, itemUnits) => {
    kit.buildQueueCases.push({
      name: name,
      input: { items: items, order: uOrder, now: T0, newAllowance: allowance, unitNewCaps: caps, itemUnits: itemUnits },
      expect: kit.unitQueueOracle({ items, ord: uOrder, allowance, caps, itemUnits }),
      source: 'spec'
    });
  };
  addUnitCase('unit_cap_zero_blocks_unit', 10, { A: 0 }, {}, uUnits);
  addUnitCase('unit_cap_below_global', 10, { A: 1, B: 2 }, {}, uUnits);
  addUnitCase('global_cap_binding', 2, { A: 5, B: 5 }, {}, uUnits);
  addUnitCase('unit_without_cap_unlimited', 10, { A: 1 }, {}, uUnits);
  addUnitCase('existing_records_not_counted_as_new', 10, { B: 1 }, uItems, uUnits);
  addUnitCase('empty_caps_unchanged', 3, {}, {}, uUnits);
  kit.buildQueueCases.push({
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
    kit.buildQueueCases.push({
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
  kit.buildQueueCases.push({
    name: 'absent_group_args_unchanged',
    input: { items: {}, order: gOrder, now: T0, newAllowance: 3, itemUnits: gUnits, itemEntities: gEnt },
    expect: { due: [], fresh: ['k1a', 'k1b', 'k1c'] },
    source: 'spec'
  });

  // Scoped (srs.scope "entity") queues: one slot per entity (spec cases, append-only).
  const sOrder = ['a1', 'a2', 'a3', 'b1', 'b2', 'x1'];
  const sEnt = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B', x1: 'X' };
  const sMembers = { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2'] };
  kit.pick = (e, n) => pickDrillJs({ members: sMembers[e], n, courseId: 'c', day: '2025-01-01', entity: e });
  kit.sRec = (s, due) => ({ s: s, due: due, ok: s, bad: 0, last: T0 - D });
  kit.addScoped = (name, extra, items, allowance, expect, withScope) => {
    const input = { items: items, order: sOrder, now: T0, newAllowance: allowance, itemEntities: sEnt, day: '2025-01-01', courseId: 'c' };
    if (withScope !== false) input.scopedMembers = sMembers;
    Object.assign(input, extra);
    kit.buildQueueCases.push({ name: name, input: input, expect: expect, source: 'spec' });
  };
}

function srsLadderPart1(kit) {
  kit.addScoped('scoped_due_one_slot', {},
    { a1: kit.sRec(2, T0 - 2 * D), a2: kit.sRec(2, T0 + D), b1: kit.sRec(1, T0 - 3 * D), b2: kit.sRec(1, T0 - 3 * D) }, 0,
    { due: [...kit.pick('B', 1), ...kit.pick('A', 1)], fresh: [], drills: { B: kit.pick('B', 1), A: kit.pick('A', 1) } });
  kit.addScoped('scoped_fresh_costs_one', {}, {}, 1, { due: [], fresh: kit.pick('A', 1), drills: { A: kit.pick('A', 1) } });
  kit.addScoped('started_entity_new_member_not_fresh', {}, { a1: kit.sRec(2, T0 + D), a2: kit.sRec(2, T0 + D) }, 5,
    { due: [], fresh: [...kit.pick('B', 1), 'x1'], drills: { B: kit.pick('B', 1) } });
  kit.addScoped('scoped_group_cap_entities',
    { itemUnits: { a1: 'U', a2: 'U', a3: 'U', b1: 'U', b2: 'U', x1: 'U' }, groupNewCaps: { g: 1 }, groupUnits: { g: ['U'] }, used: {} },
    {}, 0, { due: [], fresh: kit.pick('A', 1), drills: { A: kit.pick('A', 1) } });
  kit.addScoped('scoped_drill_2_deterministic', { scopedDrill: { A: 2 } }, {}, 5,
    { due: [], fresh: [...kit.pick('A', 2), ...kit.pick('B', 1), 'x1'], drills: { A: kit.pick('A', 2), B: kit.pick('B', 1) } });
  kit.addScoped('no_scope_key_absent', {}, {}, 5, { due: [], fresh: ['a1', 'a2', 'a3', 'b1', 'b2'] }, false);
  kit.addScoped('scoped_empty_members_has_drills_key', { scopedMembers: {} }, {}, 2, { due: [], fresh: ['a1', 'a2'], drills: {} }, false);

  kit.groups.push({ fn: 'buildQueue', cases: kit.buildQueueCases });

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
  kit.groups.push({ fn: 'ladderForUnit', cases: ladderCases });

  // entityView / applyEntity (srs.scope "entity"): spec cases with literal expectations.
  kit.M3 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  kit.R = (s, due, ok, bad, last, extra) => Object.assign({ s: s, due: due, ok: ok, bad: bad, last: last }, extra || {});
  const viewCases = [];
  const addView = (name, members, records, expect) => viewCases.push({ name: name, input: { members: members, records: records }, expect: expect, source: 'spec' });
  addView('empty_null', kit.M3, {}, null);
  addView('null_records_missing', kit.M3, { a: null, b: null }, null);
  addView('mixed_min_s_min_due_max_counts', kit.M3,
    { a: kit.R(3, T0 + D, 2, 1, 100), b: kit.R(1, T0 - 5, 5, 0, 200) }, kit.R(1, T0 - 5, 5, 1, 200));
  addView('extras_from_latest', kit.M3,
    { a: kit.R(2, T0, 1, 0, 100, { x: 'old', y: 1 }), b: kit.R(2, T0, 1, 0, 200, { x: 'new' }) }, kit.R(2, T0, 1, 0, 200, { x: 'new' }));
  addView('retired_member_ignored', [{ id: 'a' }, { id: 'r', status: 'retired' }],
    { a: kit.R(3, T0, 3, 0, 100), r: kit.R(0, T0 - 1, 0, 0, 900) }, kit.R(3, T0, 3, 0, 100));
  kit.groups.push({ fn: 'entityView', cases: viewCases });

  kit.entCases = [];
}

function srsLadderPart2(kit) {
  const addEnt = (name, input, expect) => kit.entCases.push({
    name: name, input: Object.assign({ members: kit.M3, records: {}, mode: 'answer', correct: true, now: T0, dropOnWrong: 1 }, input),
    expect: expect, source: 'spec'
  });
  const all3 = (rec) => ({ a: rec, b: rec, c: rec });
  const sync = (s, ok, bad) => kit.R(s, T0 - 1, ok, bad, T0 - D);
  addEnt('new_entity_correct', {}, all3(kit.R(1, T0 + 4 * H, 1, 0, T0)));
  addEnt('synced_correct', { records: all3(sync(2, 2, 0)) }, all3(kit.R(3, T0 + 3 * D, 3, 0, T0)));
  addEnt('drift_self_heals', { records: { a: kit.R(4, T0 + D, 5, 0, T0 - H), b: sync(2, 4, 0), c: sync(2, 4, 0) } }, all3(kit.R(3, T0 + 3 * D, 6, 0, T0)));
  addEnt('wrong_drop_once', { correct: false, records: all3(sync(3, 3, 1)) }, all3(kit.R(2, T0 + D, 3, 2, T0)));
  addEnt('old_client_wrong_counts_once', { correct: false, records: { a: kit.R(2, T0 - 1, 1, 2, T0 - D), b: kit.R(3, T0 - 1, 2, 1, T0 - D), c: kit.R(3, T0 - 1, 2, 1, T0 - D) } },
    all3(kit.R(1, T0 + 4 * H, 2, 3, T0)));
  addEnt('new_member_inherits', { records: { a: sync(3, 3, 0), b: sync(3, 3, 0) } }, all3(kit.R(4, T0 + 7 * D, 4, 0, T0)));
  addEnt('retired_excluded', { members: [{ id: 'a' }, { id: 'b' }, { id: 'r', status: 'retired' }], records: { a: sync(2, 2, 0), b: sync(2, 2, 0), r: kit.R(0, T0 - 1, 0, 0, T0 - 1) } },
    { a: kit.R(3, T0 + 3 * D, 3, 0, T0), b: kit.R(3, T0 + 3 * D, 3, 0, T0) });
  addEnt('unknown_fields_per_member', { records: { a: Object.assign(sync(2, 2, 0), { x: 1 }), b: sync(2, 2, 0), c: sync(2, 2, 0) } },
    { a: kit.R(3, T0 + 3 * D, 3, 0, T0, { x: 1 }), b: kit.R(3, T0 + 3 * D, 3, 0, T0), c: kit.R(3, T0 + 3 * D, 3, 0, T0) });
  addEnt('practice_not_due_correct', { mode: 'practice', records: all3(kit.R(3, T0 + D, 3, 0, T0 - H)) }, all3(kit.R(3, T0 + D, 4, 0, T0)));
  addEnt('practice_due_correct_advances', { mode: 'practice', records: all3(sync(3, 3, 0)) }, all3(kit.R(4, T0 + 7 * D, 4, 0, T0)));
  addEnt('relearn_s0', { mode: 'relearn', records: all3(kit.R(0, T0 - 1, 1, 2, T0 - D)) }, all3(kit.R(1, T0 + 4 * H, 1, 2, T0)));
  addEnt('relearn_s_gt0_noop', { mode: 'relearn', records: all3(sync(2, 2, 0)) }, {});
  addEnt('relearn_no_records_noop', { mode: 'relearn' }, {});
  addEnt('placement_known_same_for_all', { mode: 'placement', correct: true, seed: '1' },
    (() => { const p = ref('applyPlacement', null, true, T0, undefined, 1); return all3(p); })());
  addEnt('placement_unknown_noop', { mode: 'placement', correct: false, seed: '1' }, {});
  addEnt('ladder_top_clamped', { records: all3(sync(6, 6, 0)) }, all3(kit.R(6, T0 + 30 * D, 7, 0, T0)));
  addEnt('custom_drop_2', { correct: false, dropOnWrong: 2, records: all3(sync(4, 4, 0)) }, all3(kit.R(2, T0 + D, 4, 1, T0)));
  addEnt('drop_never_below_one_when_learned', { correct: false, dropOnWrong: 5, records: all3(sync(2, 2, 0)) }, all3(kit.R(1, T0 + 4 * H, 2, 1, T0)));
  kit.groups.push({ fn: 'applyEntity', cases: kit.entCases });
}

module.exports = { srsBuildQueuePart1, srsApplyPlacementPart1, srsApplyPlacementPart2, srsApplyPlacementPart3, srsLadderPart1, srsLadderPart2 };
