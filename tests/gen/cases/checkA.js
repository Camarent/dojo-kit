'use strict';

const { vec } = require('../utils.js');


function checkNormalizePart1(kit) {
  kit.groups = [];

  // normalize cases
  kit.normalizeCases = [];

  kit.normalizeCases.push(vec('default_trim_lowercase', { text: '  Paris ' }, 'paris', 'spec'));

  kit.normalizeCases.push(vec('case_sensitive_on', { text: '  Paris ', opts: { caseSensitive: true, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'Paris', 'spec'));

  kit.normalizeCases.push(vec('collapse_spaces', { text: 'new   york', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'new york', 'spec'));

  kit.normalizeCases.push(vec('collapse_off_keeps_double_space', { text: 'new  york', opts: { caseSensitive: false, trim: true, collapseSpaces: false, stripPunctuation: false } }, 'new  york', 'spec'));

  kit.normalizeCases.push(vec('trim_off_keeps_leading_space', { text: ' paris', opts: { caseSensitive: false, trim: false, collapseSpaces: true, stripPunctuation: false } }, ' paris', 'spec'));

  kit.normalizeCases.push(vec('strip_punctuation', { text: "Don't!", opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: true } }, 'dont', 'spec'));

  kit.normalizeCases.push(vec('punctuation_kept_by_default', { text: "Don't!" }, "don't!", 'spec'));

  kit.normalizeCases.push(vec('cyrillic', { text: 'МОСКВА', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'москва', 'spec'));
}

function checkNormalizePart2(kit) {
  kit.normalizeCases.push(vec('accented_latin', { text: 'Café', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'café', 'spec'));

  kit.normalizeCases.push(vec('cafe_not_equal_cafe', { text: 'cafe', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'cafe', 'spec'));

  kit.normalizeCases.push(vec('fold_kana_table', { text: 'アイ', opts: { fold: [['ア', 'あ'], ['イ', 'い']] } }, 'あい', 'spec'));

  kit.normalizeCases.push(vec('fold_yo_to_ye', { text: 'Ёлка', opts: { fold: [['ё', 'е']] } }, 'елка', 'spec'));

  kit.normalizeCases.push(vec('fold_range_case_sensitive', { text: 'ABC xyz', opts: { caseSensitive: true, fold: [['A-Z', 'a-z']] } }, 'abc xyz', 'spec'));

  kit.normalizeCases.push(vec('fold_delete', { text: 'はい。', opts: { fold: [['。', '']] } }, 'はい', 'spec'));

  kit.normalizeCases.push(vec('digits', { text: '42' }, '42', 'spec'));

  kit.normalizeCases.push(vec('digits_with_space', { text: '4 2', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, '4 2', 'spec'));

  kit.normalizeCases.push(vec('strip_punctuation_comma', { text: 'a,b', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: true } }, 'ab', 'spec'));
}

function checkCheckGapPart1(kit) {
  kit.normalizeCases.push(vec('empty_input', { text: '' }, '', 'spec'));

  kit.normalizeCases.push(vec('tab_and_newline', { text: 'a\tb\nc', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'a b c', 'spec'));

  kit.normalizeCases.push(vec('non_breaking_space', { text: 'a\u00A0b', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } }, 'a b', 'spec'));

  kit.groups.push({ fn: 'normalize', cases: kit.normalizeCases });

  // checkGap cases
  kit.checkGapCases = [];

  kit.checkGapCases.push(vec('multiple_accepted_answers_second_matches', { answers: ['Paris', 'paris'], input: 'paris' }, true, 'spec'));

  kit.checkGapCases.push(vec('empty_answers', { answers: [], input: 'paris' }, false, 'spec'));

  kit.checkGapCases.push(vec('empty_input', { answers: ['paris'], input: '' }, false, 'spec'));

  kit.checkGapCases.push(vec('empty_input_matches_empty_answer', { answers: [''], input: '' }, true, 'spec'));

  kit.checkGapCases.push(vec('digits_match', { answers: ['42'], input: '42' }, true, 'spec'));
}

function checkGapVerdictPart1(kit) {
  kit.checkGapCases.push(vec('digits_with_space_no_match', { answers: ['42'], input: '4 2', opts: { collapseSpaces: false } }, false, 'spec'));

  kit.checkGapCases.push(vec('cyrillic_case_insensitive', { answers: ['МОСКВА'], input: 'москва' }, true, 'spec'));

  kit.checkGapCases.push(vec('accented_latin_match', { answers: ['café'], input: 'Café' }, true, 'spec'));

  kit.groups.push({ fn: 'checkGap', cases: kit.checkGapCases });

  // gapVerdict cases
  kit.gapVerdictCases = [];

  kit.gapVerdictCases.push(vec('input_matches_answer', { answers: ['Paris'], retry: [], input: 'Paris' }, 'ok', 'spec'));

  kit.gapVerdictCases.push(vec('input_matches_retry', { answers: ['Paris'], retry: ['Pariz'], input: 'Pariz' }, 'retry', 'spec'));

  kit.gapVerdictCases.push(vec('input_matches_neither', { answers: ['Paris'], retry: ['Pariz'], input: 'London' }, 'wrong', 'spec'));

  kit.gapVerdictCases.push(vec('empty_retry_treated_as_no_retry', { answers: ['Paris'], input: 'London' }, 'wrong', 'spec'));

  kit.gapVerdictCases.push(vec('normalization_applies_to_retry', { answers: ['Paris'], retry: ['Pariz'], input: 'pariz', opts: { caseSensitive: false } }, 'retry', 'spec'));
}

function checkGapVerdictPart2(kit) {
  kit.gapVerdictCases.push(vec('case_sensitive_retry_no_match', { answers: ['Paris'], retry: ['paris'], input: 'PARIS', opts: { caseSensitive: true } }, 'wrong', 'spec'));

  kit.gapVerdictCases.push(vec('retry_answer_overlap_checked_first', { answers: ['Paris'], retry: ['Paris'], input: 'Paris' }, 'ok', 'spec'));

  kit.gapVerdictCases.push(vec('multiple_answers_match', { answers: ['Paris', 'Roma'], retry: ['Pariz'], input: 'Roma' }, 'ok', 'spec'));

  kit.gapVerdictCases.push(vec('multiple_retry_match', { answers: ['Paris'], retry: ['Pariz', 'Londinium'], input: 'Londinium' }, 'retry', 'spec'));

  kit.gapVerdictCases.push(vec('fold_applies_to_input_and_answer', { answers: ['Ёлка'], retry: [], input: 'елка', opts: { fold: [['ё', 'е']] } }, 'ok', 'spec'));

  kit.gapVerdictCases.push(vec('fold_applies_to_retry', { answers: ['Paris'], retry: ['Ёлка'], input: 'елка', opts: { fold: [['ё', 'е']] } }, 'retry', 'spec'));

  kit.gapVerdictCases.push(vec('fold_absent_distinguishes_yo', { answers: ['Ёлка'], retry: [], input: 'елка' }, 'wrong', 'spec'));

  kit.gapVerdictCases.push(vec('case_and_space_normalized', { answers: ['New York'], retry: ['Nu York'], input: '  NEW   york ' }, 'ok', 'spec'));

  kit.gapVerdictCases.push(vec('space_normalized_retry', { answers: ['New York'], retry: ['Nu York'], input: ' nu \t YORK  ' }, 'retry', 'spec'));
}

module.exports = { checkNormalizePart1, checkNormalizePart2, checkCheckGapPart1, checkGapVerdictPart1, checkGapVerdictPart2 };
