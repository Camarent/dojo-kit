'use strict';

const { checkNormalizePart1, checkNormalizePart2, checkCheckGapPart1, checkGapVerdictPart1, checkGapVerdictPart2 } = require('./checkA.js');
const { checkCheckChoicePart1, checkCheckMatchPart1, checkCheckOrderPart1, checkCheckClozePart1, checkCheckClozePart2 } = require('./checkB.js');
const { checkCheckNumericPart1, checkCheckNumericPart2 } = require('./checkC.js');

function makeCheckCases() {
  const kit = {};
  checkNormalizePart1(kit);
  checkNormalizePart2(kit);
  checkCheckGapPart1(kit);
  checkGapVerdictPart1(kit);
  checkGapVerdictPart2(kit);
  checkCheckChoicePart1(kit);
  checkCheckMatchPart1(kit);
  checkCheckOrderPart1(kit);
  checkCheckClozePart1(kit);
  checkCheckClozePart2(kit);
  checkCheckNumericPart1(kit);
  checkCheckNumericPart2(kit);
  return { groups: kit.groups };
}

module.exports = { makeCheckCases };
