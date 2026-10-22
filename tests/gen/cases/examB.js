'use strict';

const { sampleJs, scoreJs } = require('../utils.js');

function examScorePart1(kit) {
  // stimulus-free section next to a group: unchanged greedy
  kit.repairCase('sample_repair_single_group_exact', [3], 3, 9);

  // examOnly tiers (EU-1)
  const eo = (id, extra) => Object.assign({ id, unit: 'u1', tags: [], type: 't1' }, extra);
  const eoCase = (name, candidates, sections) => {
    const input = { candidates, sections, seed: '42' };
    kit.sampleCases.push({ name, input, expect: sampleJs(input), source: 'spec' });
  };
  eoCase('exam_only_enough_to_fill_section', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3', { examOnly: true }), eo('c4')], [{ title: 's1', count: 3 }]);
  eoCase('exam_only_too_few_fill_from_regular', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3'), eo('c4')], [{ title: 's1', count: 4 }]);
  eoCase('exam_only_two_sections_shared_pool', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3'), eo('c4')], [{ title: 's1', count: 2 }, { title: 's2', count: 2 }]);
  eoCase('exam_only_stimulus_group_whole', [eo('g1-1', { type: 'choice', stimulus: 's1', examOnly: true }), eo('g1-2', { type: 'choice', stimulus: 's1' }), eo('g1-3', { type: 'choice', stimulus: 's1' }), eo('c1')], [{ title: 's1', count: 3 }]);
  eoCase('no_exam_only_same_as_before', [eo('c1'), eo('c2'), eo('c3')], [{ title: 's1', count: 2 }]);
  eoCase('all_exam_only_same_as_unflagged', [eo('c1', { examOnly: true }), eo('c2', { examOnly: true }), eo('c3', { examOnly: true })], [{ title: 's1', count: 2 }]);

  kit.groups.push({ fn: 'sample', cases: kit.sampleCases });

  // score cases
  kit.scoreCases = [];

  kit.scoreCases.push({
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

  kit.scoreCases.push({
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
}

function examScorePart2(kit) {
  kit.scoreCases.push({
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

  kit.scoreCases.push({
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
}

function examScorePart3(kit) {
  kit.scoreCases.push({
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

  kit.scoreCases.push({
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

  kit.scoreCases.push({
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
  kit.jlptSections = [
    { title: 's12', start: 0, count: 120 },
    { title: 'l', start: 120, count: 60 }
  ];
}

function examScorePart4(kit) {
  kit.jlptScoring = [
    { title: 'Language knowledge', sections: ['s12'], points: 120, minPoints: 38 },
    { title: 'Listening', sections: ['l'], points: 60, minPoints: 19 }
  ];
  const jlptInput = (name, s12Raw, lRaw, passMark, mode) => {
    const results = [];
    for (let i = 0; i < 120; i++) results.push({ id: 'a' + i, correct: i < s12Raw });
    for (let i = 0; i < 60; i++) results.push({ id: 'b' + i, correct: i < lRaw });
    const input = { results, total: 180, passMark, sections: kit.jlptSections, scoring: kit.jlptScoring, passPoints: 80, pass: mode ? { mode } : undefined };
    kit.scoreCases.push({ name, input, expect: scoreJs(input), source: 'spec' });
  };
  jlptInput('jlpt_pass', 70, 30, 0.0);
  jlptInput('jlpt_pass_exactly_80', 40, 40, 0.0);
  jlptInput('jlpt_fail_total_79', 40, 39, 0.0);
  jlptInput('jlpt_fail_part_minimum', 100, 18, 0.0);
  jlptInput('jlpt_points_mode_ignores_pass_mark', 70, 30, 0.9, 'points');

  // percent mode case with passMark: 0 - the check must be === undefined (not ||)
  kit.scoreCases.push({
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
  kit.scoreCases.push({
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

  kit.scoreCases.push({
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
}

function examScorePart5(kit) {
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
  kit.scoreCases.push({
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
    sections: kit.jlptSections,
    scoring: kit.jlptScoring,
    passPoints: 80
  };
  for (let i = 0; i < 120; i++) jlptScaledInput.results.push({ id: 'a' + i, correct: i < 70 });
  for (let i = 0; i < 60; i++) jlptScaledInput.results.push({ id: 'b' + i, correct: i < 30 });
  kit.scoreCases.push({
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
    sections: kit.jlptSections,
    scoring: kit.jlptScoring,
    passPoints: 80
  };
  for (let i = 0; i < 120; i++) jlptUnscaledInput.results.push({ id: 'a' + i, correct: i < 70 });
  for (let i = 0; i < 60; i++) jlptUnscaledInput.results.push({ id: 'b' + i, correct: i < 30 });
  kit.scoreCases.push({
    name: 'points_unscaled_no_estimate',
    input: jlptUnscaledInput,
    expect: scoreJs(jlptUnscaledInput),
    source: 'spec'
  });

  kit.roundingInput = (name, rawCorrect) => {
    const results = [];
    for (let i = 0; i < 8; i++) results.push({ id: 'r' + i, correct: i < rawCorrect });
    const input = {
      results, total: 8, passMark: 0.0,
      sections: [{ title: 's', start: 0, count: 8 }],
      scoring: [{ title: 'P', sections: ['s'], points: 60 }]
    };
    kit.scoreCases.push({ name, input, expect: scoreJs(input), source: 'spec' });
  };
}

function examScorePart6(kit) {
  kit.roundingInput('parts_rounding_7_5_up', 1);
  kit.roundingInput('parts_rounding_22_5_up', 3);
  kit.roundingInput('parts_rounding_zero_raw', 0);

  kit.scoreCases.push((() => {
    const input = {
      results: [{ id: 'q', correct: true }], total: 1, passMark: 0.5,
      sections: [{ title: 's', start: 0, count: 0 }],
      scoring: [{ title: 'P', sections: ['s'], points: 10 }]
    };
    return { name: 'parts_zero_total_gives_zero_points', input, expect: scoreJs(input), source: 'spec' };
  })());

  kit.groups.push({ fn: 'score', cases: kit.scoreCases });
}

module.exports = { examScorePart1, examScorePart2, examScorePart3, examScorePart4, examScorePart5, examScorePart6 };
