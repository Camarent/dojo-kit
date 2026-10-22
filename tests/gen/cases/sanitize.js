'use strict';

const { T0 } = require('../const.js');
const { Fl } = require('../utils.js');
const { ref } = require('../ref.js');

function sanitizePartPart1(kit) {
  kit.cases = [];

  // reference kit.cases
  kit.cases.push({
    name: 'foreign_doc_v2',
    input: { v: 2, t: 0, items: {} },
    expect: ref('sanitize', { v: 2, t: 0, items: {} }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'non_object_number',
    input: 42,
    expect: ref('sanitize', 42),
    source: 'reference'
  });

  kit.cases.push({
    name: 'non_object_string',
    input: 'hello',
    expect: ref('sanitize', 'hello'),
    source: 'reference'
  });

  kit.cases.push({
    name: 'missing_items',
    input: { v: 1, t: 0 },
    expect: ref('sanitize', { v: 1, t: 0 }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'valid_doc_kept',
    input: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    expect: ref('sanitize', { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'unknown_top_level_field_kept',
    input: { v: 1, t: 0, items: {}, course: 'demo' },
    expect: ref('sanitize', { v: 1, t: 0, items: {}, course: 'demo' }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'unknown_field_inside_record_kept',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0, last: 0, x: 1 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0, last: 0, x: 1 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'string_numeric_s_not_valid',
    input: { v: 1, items: { a: { s: '3', due: T0, ok: 0, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: '3', due: T0, ok: 0, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'item_value_null_kept',
    input: { v: 1, items: { a: null } },
    expect: ref('sanitize', { v: 1, items: { a: null } }),
    source: 'reference'
  });
}

function sanitizePartPart2(kit) {
  kit.cases.push({
    name: 'invalid_record_kept',
    input: { v: 1, items: { a: { x: 1 } } },
    expect: ref('sanitize', { v: 1, items: { a: { x: 1 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'negative_s_to_0',
    input: { v: 1, items: { a: { s: -1, due: T0, ok: 0, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: -1, due: T0, ok: 0, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'fractional_s_truncated',
    input: { v: 1, items: { a: { s: 2.7, due: T0, ok: 0, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 2.7, due: T0, ok: 0, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'ok_fractional_truncated',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 2.7, bad: 0, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 2.7, bad: 0, last: 0 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'bad_fractional_truncated',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 2.7, last: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 2.7, last: 0 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'last_missing_to_0',
    input: { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0 } } },
    expect: ref('sanitize', { v: 1, items: { a: { s: 1, due: T0, ok: 0, bad: 0 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'stats_day_bad_format_dropped',
    input: { v: 1, items: {}, stats: { days: { 'bad-format': 5, '2026-01-01': 3 } } },
    expect: ref('sanitize', { v: 1, items: {}, stats: { days: { 'bad-format': 5, '2026-01-01': 3 } } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'new_per_day_99_to_50',
    input: { v: 1, items: {}, settings: { newPerDay: 99 } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { newPerDay: 99 } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'new_per_day_neg_5_to_0',
    input: { v: 1, items: {}, settings: { newPerDay: -5 } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { newPerDay: -5 } }),
    source: 'reference'
  });
}

function sanitizePartPart3(kit) {
  kit.cases.push({
    name: 'new_per_day_missing_to_10',
    input: { v: 1, items: {}, settings: {} },
    expect: ref('sanitize', { v: 1, items: {}, settings: {} }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'placement_done_truthy_to_true',
    input: { v: 1, items: {}, settings: { placementDone: 1 } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { placementDone: 1 } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 'settings_ts_non_object_removed',
    input: { v: 1, items: {}, settings: { ts: 'bad' } },
    expect: ref('sanitize', { v: 1, items: {}, settings: { ts: 'bad' } }),
    source: 'reference'
  });

  kit.cases.push({
    name: 't_as_string_12_to_12',
    input: { v: 1, items: {}, t: '12' },
    expect: ref('sanitize', { v: 1, items: {}, t: '12' }),
    source: 'reference'
  });

  // spec kit.cases
  kit.cases.push({
    name: 'no_stage_clamp',
    input: { v: 1, items: { 'a-1': { s: 9, due: 1, ok: 0, bad: 0, last: 0 } } },
    expect: { v: 1, t: 0, resetAt: 0, items: { 'a-1': { s: 9, due: 1, ok: 0, bad: 0, last: 0 } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  kit.cases.push({
    name: 'ps_is_unknown_field',
    input: { v: 1, items: { 'gp-1': { s: 3, due: 1, ps: 7 } } },
    expect: { v: 1, t: 0, resetAt: 0, items: { 'gp-1': { s: 3, due: 1, ok: 0, bad: 0, last: 0, ps: 7 } }, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  kit.cases.push({
    name: 'custom_stats_map_kept',
    input: { v: 1, items: {}, stats: { studyDays: { '2026-01-02': 3, bad: 1 }, note: 'x' } },
    expect: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {}, studyDays: { '2026-01-02': 3 }, note: 'x' }, settings: { newPerDay: 10, placementDone: false, t: 0 } },
    source: 'spec'
  });

  kit.cases.push({
    name: 'course_field_kept',
    input: { v: 1, items: {}, course: 'demo' },
    expect: { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 }, course: 'demo' },
    source: 'spec'
  });

  kit.dflt = { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 10, placementDone: false, t: 0 } };
  kit.withSettings = (st) => Object.assign({}, kit.dflt, { settings: Object.assign({}, kit.dflt.settings, st) });
}

function sanitizePartPart4(kit) {
  kit.cases.push({
    name: 'float_due_becomes_integer',
    input: { v: 1, items: { a: { s: 2, due: new Fl(T0), ok: 1, bad: 0, last: new Fl(T0) } } },
    expect: Object.assign({}, kit.dflt, { items: { a: { s: 2, due: T0, ok: 1, bad: 0, last: T0 } } }),
    source: 'spec'
  });

  [['string', 'abc'], ['null', null], ['bool', true]].forEach(([label, v]) => {
    kit.cases.push({
      name: 'settings_newperday_not_number_' + label,
      input: { v: 1, items: {}, settings: { newPerDay: v } },
      expect: kit.dflt,
      source: 'spec'
    });
  });

  kit.cases.push({
    name: 'settings_t_string',
    input: { v: 1, items: {}, settings: { t: '12' } },
    expect: kit.withSettings({ t: 12 }),
    source: 'spec'
  });

  kit.cases.push({
    name: 'bad_date_keys_dropped',
    input: { v: 1, items: {}, stats: { days: { '----------': 1, '20-4-01-12': 2, '2026-01-02': 3 } } },
    expect: Object.assign({}, kit.dflt, { stats: { days: { '2026-01-02': 3 }, newByDay: {} } }),
    source: 'spec'
  });

  kit.cases.push({
    name: 'stats_non_daymap_object_kept',
    input: { v: 1, items: {}, stats: { obj: { a: 1 }, note: 'x' } },
    expect: Object.assign({}, kit.dflt, { stats: { days: {}, newByDay: {}, obj: { a: 1 }, note: 'x' } }),
    source: 'spec'
  });
}

function makeSanitizeCases() {
  const kit = {};
  sanitizePartPart1(kit);
  sanitizePartPart2(kit);
  sanitizePartPart3(kit);
  sanitizePartPart4(kit);
  return { fn: 'sanitize', cases: kit.cases };
}

// ============================================================
// MERGE.JSON
// ============================================================


module.exports = { makeSanitizeCases };
