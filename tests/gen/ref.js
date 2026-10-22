'use strict';

const progress = require('../../tools/reference/progress.js');
const srs = require('../../tools/reference/srs.js');
const { gapVerdictJs } = require('./oracles/check.js');

// The reference always adds an n5-specific empty stats.gNewByDay map; the generic core has no such fixed map.
function withoutEmptyGrammarStats(doc) {
  const g = doc && doc.stats && doc.stats.gNewByDay;
  if (g && typeof g === 'object' && Object.keys(g).length === 0) delete doc.stats.gNewByDay;
  return doc;
}

function ref(fn, ...args) {
  try {
    if (fn === 'sanitize') return withoutEmptyGrammarStats(progress.sanitize(...args));
    if (fn === 'merge') return withoutEmptyGrammarStats(progress.merge(...args));
    if (fn === 'stableJson') return progress.stableJson(...args);
    if (fn === 'emptyProgress') return progress.emptyProgress(...args);
    if (fn === 'validRec') return progress.validRec(...args);
    if (fn === 'applyAnswer') return srs.applyAnswer(...args);
    if (fn === 'applyPractice') return srs.applyPractice(...args);
    if (fn === 'applyRelearn') return srs.applyRelearn(...args);
    if (fn === 'applyPlacement') return srs.applyPlacement(...args);
    if (fn === 'isDue') return srs.isDue(...args);
    if (fn === 'isNew') return srs.isNew(...args);
    if (fn === 'weakest') return srs.weakest(...args);
    if (fn === 'buildQueue') return srs.buildQueue(...args);
    if (fn === 'dayKey') return srs.dayKey(...args);
    if (fn === 'streak') return srs.streak(...args);
    if (fn === 'gapVerdict') return gapVerdictJs(...args);
    throw new Error('Unknown function: ' + fn);
  } catch (e) {
    console.error('Reference call failed:', fn, args, e);
    process.exit(1);
  }
}

module.exports = { ref, withoutEmptyGrammarStats };
