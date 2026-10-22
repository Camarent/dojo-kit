'use strict';

const { makeSrsCases } = require('./cases/srs.js');
const { makeSanitizeCases } = require('./cases/sanitize.js');
const { makeMergeCases } = require('./cases/merge.js');
const { makeDaysCases } = require('./cases/days.js');
const { makeCheckCases } = require('./makeCheckCases.js');
const { makeExamCases } = require('./makeExamCases.js');

module.exports = {
  makeSrsCases,
  makeSanitizeCases,
  makeMergeCases,
  makeDaysCases,
  makeCheckCases,
  makeExamCases
};
