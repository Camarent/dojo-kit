'use strict';


function checkCheckNumericPart1(kit) {
  kit.checkClozeCases.push({
    name: 'all_empty_inputs',
    input: { blanks: [['A'], ['B']], inputs: ['', ''] },
    expect: { correct: false, results: [false, false] },
    source: 'spec'
  });

  kit.groups.push({ fn: 'checkCloze', cases: kit.checkClozeCases });

  // checkNumeric cases
  kit.checkNumericCases = [];

  kit.checkNumericCases.push({
    name: 'comma_as_decimal_1_5',
    input: { answer: 1.5, input: '1,5' },
    expect: { correct: true, parsed: 1.5 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'comma_as_decimal_1_000',
    input: { answer: 1.0, input: '1,000' },
    expect: { correct: true, parsed: 1.0 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'space_invalid',
    input: { answer: 0.0, input: '1 000' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'plus_sign',
    input: { answer: 2.0, input: '+2' },
    expect: { correct: true, parsed: 2.0 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'scientific_notation',
    input: { answer: 1000.0, input: '1e3' },
    expect: { correct: true, parsed: 1000.0 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'dot_five',
    input: { answer: 0.5, input: '.5' },
    expect: { correct: true, parsed: 0.5 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'five_dot',
    input: { answer: 5.0, input: '5.' },
    expect: { correct: true, parsed: 5.0 },
    source: 'spec'
  });
}

function checkCheckNumericPart2(kit) {
  kit.checkNumericCases.push({
    name: 'empty_string',
    input: { answer: 0.0, input: '' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'abc_invalid',
    input: { answer: 0.0, input: 'abc' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'double_minus_invalid',
    input: { answer: 0.0, input: '--1' },
    expect: { correct: false, parsed: null },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'tolerance_boundary_exact',
    input: { answer: 1.0, tolerance: 0.5, input: '1.5' },
    expect: { correct: true, parsed: 1.5 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'float_slack_0_3',
    input: { answer: 0.30000000000000004, input: '0.3' },
    expect: { correct: true, parsed: 0.3 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'negative_answer_correct',
    input: { answer: -2.0, input: '-2' },
    expect: { correct: true, parsed: -2.0 },
    source: 'spec'
  });

  kit.checkNumericCases.push({
    name: 'negative_input_wrong',
    input: { answer: 2.0, input: '-2' },
    expect: { correct: false, parsed: -2.0 },
    source: 'spec'
  });

  kit.groups.push({ fn: 'checkNumeric', cases: kit.checkNumericCases });
}

module.exports = { checkCheckNumericPart1, checkCheckNumericPart2 };
