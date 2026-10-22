'use strict';

const { examSplitmix64Part1, examSamplePart1, examSamplePart2, examSamplePart3, examSamplePart4 } = require('./makeExamCasesA.js');
const { examScorePart1, examScorePart2, examScorePart3, examScorePart4, examScorePart5, examScorePart6 } = require('./makeExamCasesB.js');

function makeExamCases() {
  const kit = {};
  examSplitmix64Part1(kit);
  examSamplePart1(kit);
  examSamplePart2(kit);
  examSamplePart3(kit);
  examSamplePart4(kit);
  examScorePart1(kit);
  examScorePart2(kit);
  examScorePart3(kit);
  examScorePart4(kit);
  examScorePart5(kit);
  examScorePart6(kit);
  return { groups: kit.groups };
}

module.exports = { makeExamCases };
