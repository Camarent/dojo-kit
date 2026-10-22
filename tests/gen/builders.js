'use strict';

const { makeSrsCases } = require('./cases/srs.js');
const { makeSanitizeCases } = require('./cases/sanitize.js');
const { makeMergeCases } = require('./cases/merge.js');
const { makeDaysCases } = require('./cases/days.js');
const { makeCheckCases } = require('./cases/check.js');
const { makeExamCases } = require('./cases/exam.js');
const { makeGroupsCases } = require('./cases/groups.js');

module.exports = {
  makeSrsCases,
  makeSanitizeCases,
  makeMergeCases,
  makeDaysCases,
  makeCheckCases,
  makeExamCases,
  makeGroupsCases
};
