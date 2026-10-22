'use strict';


function checkCheckChoicePart1(kit) {
  kit.groups.push({ fn: 'gapVerdict', cases: kit.gapVerdictCases });

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

  kit.groups.push({ fn: 'checkChoice', cases: checkChoiceCases });

  // checkMulti cases
  kit.checkMultiCases = [];

  kit.checkMultiCases.push({
    name: 'exact_set_equal_different_order',
    input: { correct: [0, 1, 2], selected: [2, 1, 0] },
    expect: true,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'duplicates_in_selected',
    input: { correct: [0, 1, 2], selected: [2, 1, 0, 0] },
    expect: true,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'empty_selected_empty_correct',
    input: { correct: [], selected: [] },
    expect: true,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'empty_selected_non_empty_correct',
    input: { correct: [0, 1], selected: [] },
    expect: false,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'out_of_range_index_in_selected',
    input: { correct: [0, 1], selected: [0, 2] },
    expect: false,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'subset_not_equal',
    input: { correct: [0, 1, 2], selected: [0, 1] },
    expect: false,
    source: 'spec'
  });
}

function checkCheckMatchPart1(kit) {
  kit.checkMultiCases.push({
    name: 'superset_not_equal',
    input: { correct: [0, 1], selected: [0, 1, 2] },
    expect: false,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'single_element_match',
    input: { correct: [3], selected: [3] },
    expect: true,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'duplicates_in_both',
    input: { correct: [1, 1, 2], selected: [2, 1, 1] },
    expect: true,
    source: 'spec'
  });

  kit.checkMultiCases.push({
    name: 'different_sets',
    input: { correct: [0, 1], selected: [2, 3] },
    expect: false,
    source: 'spec'
  });

  kit.groups.push({ fn: 'checkMulti', cases: kit.checkMultiCases });

  // checkMatch cases
  kit.checkMatchCases = [];

  kit.checkMatchCases.push({
    name: 'identity_mapping_correct',
    input: { pairCount: 3, mapping: [0, 1, 2] },
    expect: { correct: true, wrong: [] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'one_wrong_pair',
    input: { pairCount: 3, mapping: [0, 2, 2] },
    expect: { correct: false, wrong: [1] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'short_mapping_missing_entry',
    input: { pairCount: 3, mapping: [0, 1] },
    expect: { correct: false, wrong: [2] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'long_mapping_not_correct',
    input: { pairCount: 2, mapping: [0, 1, 2] },
    expect: { correct: false, wrong: [] },
    source: 'spec'
  });
}

function checkCheckOrderPart1(kit) {
  kit.checkMatchCases.push({
    name: 'pair_count_0_empty_mapping',
    input: { pairCount: 0, mapping: [] },
    expect: { correct: true, wrong: [] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'all_wrong',
    input: { pairCount: 2, mapping: [1, 0] },
    expect: { correct: false, wrong: [0, 1] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'first_pair_wrong',
    input: { pairCount: 3, mapping: [1, 1, 2] },
    expect: { correct: false, wrong: [0] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'partial_correct',
    input: { pairCount: 4, mapping: [0, 1, 3, 3] },
    expect: { correct: false, wrong: [2] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'empty_mapping_non_zero_pair_count',
    input: { pairCount: 2, mapping: [] },
    expect: { correct: false, wrong: [0, 1] },
    source: 'spec'
  });

  kit.checkMatchCases.push({
    name: 'identity_with_extra',
    input: { pairCount: 2, mapping: [0, 1, 0] },
    expect: { correct: false, wrong: [] },
    source: 'spec'
  });

  kit.groups.push({ fn: 'checkMatch', cases: kit.checkMatchCases });

  // checkOrder cases
  kit.checkOrderCases = [];

  kit.checkOrderCases.push({
    name: 'correct_order',
    input: { stepCount: 3, sequence: [0, 1, 2] },
    expect: { correct: true, firstWrong: null },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'reversed_order',
    input: { stepCount: 3, sequence: [2, 1, 0] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });
}

function checkCheckClozePart1(kit) {
  kit.checkOrderCases.push({
    name: 'one_swap_first_wrong',
    input: { stepCount: 3, sequence: [1, 0, 2] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'sequence_too_short',
    input: { stepCount: 3, sequence: [0, 1] },
    expect: { correct: false, firstWrong: 2 },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'sequence_too_long',
    input: { stepCount: 2, sequence: [0, 1, 2] },
    expect: { correct: false, firstWrong: 2 },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'step_count_0_empty_sequence',
    input: { stepCount: 0, sequence: [] },
    expect: { correct: true, firstWrong: null },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'all_wrong_from_start',
    input: { stepCount: 4, sequence: [1, 2, 3, 0] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'correct_until_last',
    input: { stepCount: 3, sequence: [0, 1, 0] },
    expect: { correct: false, firstWrong: 2 },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'single_element_correct',
    input: { stepCount: 1, sequence: [0] },
    expect: { correct: true, firstWrong: null },
    source: 'spec'
  });

  kit.checkOrderCases.push({
    name: 'empty_sequence_non_zero_step_count',
    input: { stepCount: 2, sequence: [] },
    expect: { correct: false, firstWrong: 0 },
    source: 'spec'
  });

  kit.groups.push({ fn: 'checkOrder', cases: kit.checkOrderCases });

  // checkCloze cases
  kit.checkClozeCases = [];
}

function checkCheckClozePart2(kit) {
  kit.checkClozeCases.push({
    name: 'all_blanks_match',
    input: { blanks: [['Paris'], ['Rome']], inputs: ['Paris', 'Rome'] },
    expect: { correct: true, results: [true, true] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'second_alternative_matches',
    input: { blanks: [['Paris', 'paris']], inputs: ['paris'] },
    expect: { correct: true, results: [true] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'case_sensitive_fail',
    input: { blanks: [['Paris']], inputs: ['paris'], opts: { caseSensitive: true, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: { correct: false, results: [false] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'input_missing_for_blank',
    input: { blanks: [['Paris'], ['Rome']], inputs: ['Paris'] },
    expect: { correct: false, results: [true, false] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'empty_blanks_list',
    input: { blanks: [], inputs: [] },
    expect: { correct: false, results: [] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'extra_inputs_ignored',
    input: { blanks: [['Paris']], inputs: ['Paris', 'extra'] },
    expect: { correct: true, results: [true] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'wrong_answer',
    input: { blanks: [['Paris']], inputs: ['London'] },
    expect: { correct: false, results: [false] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'multiple_blanks_all_correct',
    input: { blanks: [['A', 'a'], ['B', 'b'], ['C', 'c']], inputs: ['a', 'B', 'c'] },
    expect: { correct: true, results: [true, true, true] },
    source: 'spec'
  });

  kit.checkClozeCases.push({
    name: 'one_blank_wrong',
    input: { blanks: [['A'], ['B'], ['C']], inputs: ['A', 'X', 'C'] },
    expect: { correct: false, results: [true, false, true] },
    source: 'spec'
  });
}

module.exports = { checkCheckChoicePart1, checkCheckMatchPart1, checkCheckOrderPart1, checkCheckClozePart1, checkCheckClozePart2 };
