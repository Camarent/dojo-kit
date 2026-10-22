'use strict';


function checkNormalizePart1(kit) {
  kit.groups = [];

  // normalize cases
  kit.normalizeCases = [];

  kit.normalizeCases.push({
    name: 'default_trim_lowercase',
    input: { text: '  Paris ' },
    expect: 'paris',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'case_sensitive_on',
    input: { text: '  Paris ', opts: { caseSensitive: true, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'Paris',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'collapse_spaces',
    input: { text: 'new   york', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'new york',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'collapse_off_keeps_double_space',
    input: { text: 'new  york', opts: { caseSensitive: false, trim: true, collapseSpaces: false, stripPunctuation: false } },
    expect: 'new  york',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'trim_off_keeps_leading_space',
    input: { text: ' paris', opts: { caseSensitive: false, trim: false, collapseSpaces: true, stripPunctuation: false } },
    expect: ' paris',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'strip_punctuation',
    input: { text: "Don't!", opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: true } },
    expect: 'dont',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'punctuation_kept_by_default',
    input: { text: "Don't!" },
    expect: "don't!",
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'cyrillic',
    input: { text: 'МОСКВА', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'москва',
    source: 'spec'
  });
}

function checkNormalizePart2(kit) {
  kit.normalizeCases.push({
    name: 'accented_latin',
    input: { text: 'Café', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'café',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'cafe_not_equal_cafe',
    input: { text: 'cafe', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'cafe',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'fold_kana_table',
    input: { text: 'アイ', opts: { fold: [['ア', 'あ'], ['イ', 'い']] } },
    expect: 'あい',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'fold_yo_to_ye',
    input: { text: 'Ёлка', opts: { fold: [['ё', 'е']] } },
    expect: 'елка',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'fold_range_case_sensitive',
    input: { text: 'ABC xyz', opts: { caseSensitive: true, fold: [['A-Z', 'a-z']] } },
    expect: 'abc xyz',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'fold_delete',
    input: { text: 'はい。', opts: { fold: [['。', '']] } },
    expect: 'はい',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'digits',
    input: { text: '42' },
    expect: '42',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'digits_with_space',
    input: { text: '4 2', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: '4 2',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'strip_punctuation_comma',
    input: { text: 'a,b', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: true } },
    expect: 'ab',
    source: 'spec'
  });
}

function checkCheckGapPart1(kit) {
  kit.normalizeCases.push({
    name: 'empty_input',
    input: { text: '' },
    expect: '',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'tab_and_newline',
    input: { text: 'a\tb\nc', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'a b c',
    source: 'spec'
  });

  kit.normalizeCases.push({
    name: 'non_breaking_space',
    input: { text: 'a\u00A0b', opts: { caseSensitive: false, trim: true, collapseSpaces: true, stripPunctuation: false } },
    expect: 'a b',
    source: 'spec'
  });

  kit.groups.push({ fn: 'normalize', cases: kit.normalizeCases });

  // checkGap cases
  kit.checkGapCases = [];

  kit.checkGapCases.push({
    name: 'multiple_accepted_answers_second_matches',
    input: { answers: ['Paris', 'paris'], input: 'paris' },
    expect: true,
    source: 'spec'
  });

  kit.checkGapCases.push({
    name: 'empty_answers',
    input: { answers: [], input: 'paris' },
    expect: false,
    source: 'spec'
  });

  kit.checkGapCases.push({
    name: 'empty_input',
    input: { answers: ['paris'], input: '' },
    expect: false,
    source: 'spec'
  });

  kit.checkGapCases.push({
    name: 'empty_input_matches_empty_answer',
    input: { answers: [''], input: '' },
    expect: true,
    source: 'spec'
  });

  kit.checkGapCases.push({
    name: 'digits_match',
    input: { answers: ['42'], input: '42' },
    expect: true,
    source: 'spec'
  });
}

function checkGapVerdictPart1(kit) {
  kit.checkGapCases.push({
    name: 'digits_with_space_no_match',
    input: { answers: ['42'], input: '4 2', opts: { collapseSpaces: false } },
    expect: false,
    source: 'spec'
  });

  kit.checkGapCases.push({
    name: 'cyrillic_case_insensitive',
    input: { answers: ['МОСКВА'], input: 'москва' },
    expect: true,
    source: 'spec'
  });

  kit.checkGapCases.push({
    name: 'accented_latin_match',
    input: { answers: ['café'], input: 'Café' },
    expect: true,
    source: 'spec'
  });

  kit.groups.push({ fn: 'checkGap', cases: kit.checkGapCases });

  // gapVerdict cases
  kit.gapVerdictCases = [];

  kit.gapVerdictCases.push({
    name: 'input_matches_answer',
    input: { answers: ['Paris'], retry: [], input: 'Paris' },
    expect: 'ok',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'input_matches_retry',
    input: { answers: ['Paris'], retry: ['Pariz'], input: 'Pariz' },
    expect: 'retry',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'input_matches_neither',
    input: { answers: ['Paris'], retry: ['Pariz'], input: 'London' },
    expect: 'wrong',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'empty_retry_treated_as_no_retry',
    input: { answers: ['Paris'], input: 'London' },
    expect: 'wrong',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'normalization_applies_to_retry',
    input: { answers: ['Paris'], retry: ['Pariz'], input: 'pariz', opts: { caseSensitive: false } },
    expect: 'retry',
    source: 'spec'
  });
}

function checkGapVerdictPart2(kit) {
  kit.gapVerdictCases.push({
    name: 'case_sensitive_retry_no_match',
    input: { answers: ['Paris'], retry: ['paris'], input: 'PARIS', opts: { caseSensitive: true } },
    expect: 'wrong',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'retry_answer_overlap_checked_first',
    input: { answers: ['Paris'], retry: ['Paris'], input: 'Paris' },
    expect: 'ok',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'multiple_answers_match',
    input: { answers: ['Paris', 'Roma'], retry: ['Pariz'], input: 'Roma' },
    expect: 'ok',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'multiple_retry_match',
    input: { answers: ['Paris'], retry: ['Pariz', 'Londinium'], input: 'Londinium' },
    expect: 'retry',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'fold_applies_to_input_and_answer',
    input: { answers: ['Ёлка'], retry: [], input: 'елка', opts: { fold: [['ё', 'е']] } },
    expect: 'ok',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'fold_applies_to_retry',
    input: { answers: ['Paris'], retry: ['Ёлка'], input: 'елка', opts: { fold: [['ё', 'е']] } },
    expect: 'retry',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'fold_absent_distinguishes_yo',
    input: { answers: ['Ёлка'], retry: [], input: 'елка' },
    expect: 'wrong',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'case_and_space_normalized',
    input: { answers: ['New York'], retry: ['Nu York'], input: '  NEW   york ' },
    expect: 'ok',
    source: 'spec'
  });

  kit.gapVerdictCases.push({
    name: 'space_normalized_retry',
    input: { answers: ['New York'], retry: ['Nu York'], input: ' nu \t YORK  ' },
    expect: 'retry',
    source: 'spec'
  });
}

module.exports = { checkNormalizePart1, checkNormalizePart2, checkCheckGapPart1, checkGapVerdictPart1, checkGapVerdictPart2 };
