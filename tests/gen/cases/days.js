'use strict';

const { Fl, noonMsOf } = require('../utils.js');
const { ref } = require('../ref.js');

function daysDayKeyPart1(kit) {
  kit.groups = [];

  // dayKey
  kit.dayKeyCases = [];

  // Reference cases with tzOffsetMin = 0 (not passed to ref)
  // Use noon UTC timestamps for timezone-proof results
  kit.dayKeyCases.push({
    name: 'date_2024_01_01',
    input: { ms: Date.UTC(2024, 0, 1, 12) },
    expect: ref('dayKey', Date.UTC(2024, 0, 1, 12)),
    source: 'reference'
  });

  kit.dayKeyCases.push({
    name: 'date_2025_10_09',
    input: { ms: Date.UTC(2025, 9, 9, 12) },
    expect: ref('dayKey', Date.UTC(2025, 9, 9, 12)),
    source: 'reference'
  });

  kit.dayKeyCases.push({
    name: 'leap_day_2024_02_29_noon',
    input: { ms: Date.UTC(2024, 1, 29, 12) },
    expect: ref('dayKey', Date.UTC(2024, 1, 29, 12)),
    source: 'reference'
  });

  kit.dayKeyCases.push({
    name: 'year_end_2026_12_31_23_59_59',
    input: { ms: 1798761599000 },
    expect: ref('dayKey', 1798761599000),
    source: 'reference'
  });

  kit.dayKeyCases.push({
    name: 'date_2026_06_15',
    input: { ms: Date.UTC(2026, 5, 15, 12) },
    expect: ref('dayKey', Date.UTC(2026, 5, 15, 12)),
    source: 'reference'
  });

  kit.dayKeyCases.push({
    name: 'year_end_2025_12_31_noon',
    input: { ms: Date.UTC(2025, 11, 31, 12) },
    expect: ref('dayKey', Date.UTC(2025, 11, 31, 12)),
    source: 'reference'
  });

  // Spec cases with tzOffsetMin
  kit.dayKeyCases.push({
    name: 'offset_60_to_2026_01_01',
    input: { ms: 1767225599000, tzOffsetMin: 60 },
    expect: '2026-01-01',
    source: 'spec'
  });

  kit.dayKeyCases.push({
    name: 'offset_neg_300_to_2025_12_31',
    input: { ms: 1767225599000, tzOffsetMin: -300 },
    expect: '2025-12-31',
    source: 'spec'
  });
}

function daysStreakPart1(kit) {
  kit.groups.push({ fn: 'dayKey', cases: kit.dayKeyCases });

  // streak
  kit.streakCases = [];

  // today studied
  kit.streakCases.push({
    name: 'today_studied',
    input: { days: { '2026-01-01': 5 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2026-01-01': 5 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // only yesterday studied
  kit.streakCases.push({
    name: 'only_yesterday_studied',
    input: { days: { '2025-12-31': 3 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2025-12-31': 3 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // neither studied
  kit.streakCases.push({
    name: 'neither_studied',
    input: { days: { '2025-12-30': 2 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2025-12-30': 2 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // gap in the middle
  kit.streakCases.push({
    name: 'gap_in_middle',
    input: { days: { '2026-01-01': 5, '2025-12-31': 3, '2025-12-29': 2 }, todayKey: '2026-01-01' },
    expect: ref('streak', { '2026-01-01': 5, '2025-12-31': 3, '2025-12-29': 2 }, noonMsOf('2026-01-01')),
    source: 'reference'
  });

  // month boundary
  kit.streakCases.push({
    name: 'month_boundary_2026_03_01',
    input: { days: { '2026-03-01': 5, '2026-02-28': 3, '2026-02-27': 2 }, todayKey: '2026-03-01' },
    expect: ref('streak', { '2026-03-01': 5, '2026-02-28': 3, '2026-02-27': 2 }, noonMsOf('2026-03-01')),
    source: 'reference'
  });

  // year boundary
  kit.streakCases.push({
    name: 'year_boundary_2027_01_01',
    input: { days: { '2027-01-01': 5, '2026-12-31': 3 }, todayKey: '2027-01-01' },
    expect: ref('streak', { '2027-01-01': 5, '2026-12-31': 3 }, noonMsOf('2027-01-01')),
    source: 'reference'
  });

  // leap day crossing
  kit.streakCases.push({
    name: 'leap_day_crossing_2024_03_01',
    input: { days: { '2024-03-01': 5, '2024-02-29': 3 }, todayKey: '2024-03-01' },
    expect: ref('streak', { '2024-03-01': 5, '2024-02-29': 3 }, noonMsOf('2024-03-01')),
    source: 'reference'
  });
}

function daysStreakPart2(kit) {
  kit.streakCases.push({
    name: 'float_count_truthy',
    input: { days: { '2026-01-01': new Fl(2) }, todayKey: '2026-01-01' },
    expect: 1,
    source: 'spec'
  });

  kit.streakCases.push({
    name: 'zero_count_falsy',
    input: { days: { '2026-01-01': 0 }, todayKey: '2026-01-01' },
    expect: 0,
    source: 'spec'
  });

  kit.groups.push({ fn: 'streak', cases: kit.streakCases });
}

function makeDaysCases() {
  const kit = {};
  daysDayKeyPart1(kit);
  daysStreakPart1(kit);
  daysStreakPart2(kit);
  return { groups: kit.groups };
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


module.exports = { makeDaysCases };
