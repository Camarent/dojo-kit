'use strict';

const { srsApplyAnswerPart1, srsApplyPracticePart1, srsApplyRelearnPart1, srsIsDuePart1, srsWeakestPart1 } = require('./srsA.js');
const { srsBuildQueuePart1, srsApplyPlacementPart1, srsApplyPlacementPart2, srsApplyPlacementPart3, srsLadderPart1, srsLadderPart2 } = require('./srsB.js');

function makeSrsCases() {
  const kit = {};
  srsApplyAnswerPart1(kit);
  srsApplyPracticePart1(kit);
  srsApplyRelearnPart1(kit);
  srsIsDuePart1(kit);
  srsWeakestPart1(kit);
  srsBuildQueuePart1(kit);
  srsApplyPlacementPart1(kit);
  srsApplyPlacementPart2(kit);
  srsApplyPlacementPart3(kit);
  srsLadderPart1(kit);
  srsLadderPart2(kit);
  return { groups: kit.groups };
}

module.exports = { makeSrsCases };
