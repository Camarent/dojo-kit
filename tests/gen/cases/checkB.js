'use strict';

const { vec } = require('../utils.js');


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

  kit.checkMultiCases.push(vec('exact_set_equal_different_order', { correct: [0, 1, 2], selected: [2, 1, 0] }, true, 'spec'));

  kit.checkMultiCases.push(vec('duplicates_in_selected', { correct: [0, 1, 2], selected: [2, 1, 0, 0] }, true, 'spec'));

  kit.checkMultiCases.push(vec('empty_selected_empty_correct', { correct: [], selected: [] }, true, 'spec'));

  kit.checkMultiCases.push(vec('empty_selected_non_empty_correct', { correct: [0, 1], selected: [] }, false, 'spec'));

  kit.checkMultiCases.push(vec('out_of_range_index_in_selected', { correct: [0, 1], selected: [0, 2] }, false, 'spec'));

  kit.checkMultiCases.push(vec('subset_not_equal', { correct: [0, 1, 2], selected: [0, 1] }, false, 'spec'));
}

function checkCheckMatchPart1(kit) {
  kit.checkMultiCases.push(vec('superset_not_equal', { correct: [0, 1], selected: [0, 1, 2] }, false, 'spec'));

  kit.checkMultiCases.push(vec('single_element_match', { correct: [3], selected: [3] }, true, 'spec'));

  kit.checkMultiCases.push(vec('duplicates_in_both', { correct: [1, 1, 2], selected: [2, 1, 1] }, true, 'spec'));

  kit.checkMultiCases.push(vec('different_sets', { correct: [0, 1], selected: [2, 3] }, false, 'spec'));

  kit.groups.push({ fn: 'checkMulti', cases: kit.checkMultiCases });

  // checkMatch cases
  kit.checkMatchCases = [];

  kit.checkMatchCases.push(vec('identity_mapping_correct', { pairCount: 3, mapping: [0, 1, 2] }, { correct: true, wrong: [] }, 'spec'));

  kit.checkMatchCases.push(vec('one_wrong_pair', { pairCount: 3, mapping: [0, 2, 2] }, { correct: false, wrong: [1] }, 'spec'));

  kit.checkMatchCases.push(vec('short_mapping_missing_entry', { pairCount: 3, mapping: [0, 1] }, { correct: false, wrong: [2] }, 'spec'));

  kit.checkMatchCases.push(vec('long_mapping_not_correct', { pairCount: 2, mapping: [0, 1, 2] }, { correct: false, wrong: [] }, 'spec'));
}

function checkCheckOrderPart1(kit) {
  kit.checkMatchCases.push(vec('pair_count_0_empty_mapping', { pairCount: 0, mapping: [] }, { correct: true, wrong: [] }, 'spec'));

  kit.checkMatchCases.push(vec('all_wrong', { pairCount: 2, mapping: [1, 0] }, { correct: false, wrong: [0, 1] }, 'spec'));

  kit.checkMatchCases.push(vec('first_pair_wrong', { pairCount: 3, mapping: [1, 1, 2] }, { correct: false, wrong: [0] }, 'spec'));

  kit.checkMatchCases.push(vec('partial_correct', { pairCount: 4, mapping: [0, 1, 3, 3] }, { correct: false, wrong: [2] }, 'spec'));

  kit.checkMatchCases.push(vec('empty_mapping_non_zero_pair_count', { pairCount: 2, mapping: [] }, { correct: false, wrong: [0, 1] }, 'spec'));

  kit.checkMatchCases.push(vec('identity_with_extra', { pairCount: 2, mapping: [0, 1, 0] }, { correct: false, wrong: [] }, 'spec'));

  kit.groups.push({ fn: 'checkMatch', cases: kit.checkMatchCases });

  // checkOrder cases
  kit.checkOrderCases = [];

  kit.checkOrderCases.push(vec('correct_order', { stepCount: 3, sequence: [0, 1, 2] }, { correct: true, firstWrong: null }, 'spec'));

  kit.checkOrderCases.push(vec('reversed_order', { stepCount: 3, sequence: [2, 1, 0] }, { correct: false, firstWrong: 0 }, 'spec'));
}

function checkCheckClozePart1(kit) {
  kit.checkOrderCases.push(vec('one_swap_first_wrong', { stepCount: 3, sequence: [1, 0, 2] }, { correct: false, firstWrong: 0 }, 'spec'));

  kit.checkOrderCases.push(vec('sequence_too_short', { stepCount: 3, sequence: [0, 1] }, { correct: false, firstWrong: 2 }, 'spec'));

  kit.checkOrderCases.push(vec('sequence_too_long', { stepCount: 2, sequence: [0, 1, 2] }, { correct: false, firstWrong: 2 }, 'spec'));

  kit.checkOrderCases.push(vec('step_count_0_empty_sequence', { stepCount: 0, sequence: [] }, { correct: true, firstWrong: null }, 'spec'));

  kit.checkOrderCases.push(vec('all_wrong_from_start', { stepCount: 4, sequence: [1, 2, 3, 0] }, { correct: false, firstWrong: 0 }, 'spec'));

  kit.checkOrderCases.push(vec('correct_until_last', { stepCount: 3, sequence: [0, 1, 0] }, { correct: false, firstWrong: 2 }, 'spec'));

  kit.checkOrderCases.push(vec('single_element_correct', { stepCount: 1, sequence: [0] }, { correct: true, firstWrong: null }, 'spec'));

  kit.checkOrderCases.push(vec('empty_sequence_non_zero_step_count', { stepCount: 2, sequence: [] }, { correct: false, firstWrong: 0 }, 'spec'));

  kit.groups.push({ fn: 'checkOrder', cases: kit.checkOrderCases });

  // checkCloze cases
  kit.checkClozeCases = [];
}

function checkCheckClozePart2(kit) {
  kit.checkClozeCases.push(vec('all_blanks_match', { blanks: [['Paris'], ['Rome']], inputs: ['Paris', 'Rome'] }, { correct: true, results: [true, true] }, 'spec'));

  kit.checkClozeCases.push(vec('second_alternative_matches', { blanks: [['Paris', 'paris']], inputs: ['paris'] }, { correct: true, results: [true] }, 'spec'));

  kit.checkClozeCases.push(vec('case_sensitive_fail', { blanks: [['Paris']], inputs: ['paris'], opts: { caseSensitive: true, trim: true, collapseSpaces: true, stripPunctuation: false } }, { correct: false, results: [false] }, 'spec'));

  kit.checkClozeCases.push(vec('input_missing_for_blank', { blanks: [['Paris'], ['Rome']], inputs: ['Paris'] }, { correct: false, results: [true, false] }, 'spec'));

  kit.checkClozeCases.push(vec('empty_blanks_list', { blanks: [], inputs: [] }, { correct: false, results: [] }, 'spec'));

  kit.checkClozeCases.push(vec('extra_inputs_ignored', { blanks: [['Paris']], inputs: ['Paris', 'extra'] }, { correct: true, results: [true] }, 'spec'));

  kit.checkClozeCases.push(vec('wrong_answer', { blanks: [['Paris']], inputs: ['London'] }, { correct: false, results: [false] }, 'spec'));

  kit.checkClozeCases.push(vec('multiple_blanks_all_correct', { blanks: [['A', 'a'], ['B', 'b'], ['C', 'c']], inputs: ['a', 'B', 'c'] }, { correct: true, results: [true, true, true] }, 'spec'));

  kit.checkClozeCases.push(vec('one_blank_wrong', { blanks: [['A'], ['B'], ['C']], inputs: ['A', 'X', 'C'] }, { correct: false, results: [true, false, true] }, 'spec'));
}

module.exports = { checkCheckChoicePart1, checkCheckMatchPart1, checkCheckOrderPart1, checkCheckClozePart1, checkCheckClozePart2 };
