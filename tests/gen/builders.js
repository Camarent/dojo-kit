'use strict';

const { makeSrsCases } = require('./makeSrsCases.js');
const { makeSanitizeCases } = require('./makeSanitizeCases.js');
const { makeMergeCases } = require('./makeMergeCases.js');
const { makeDaysCases } = require('./makeDaysCases.js');
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
