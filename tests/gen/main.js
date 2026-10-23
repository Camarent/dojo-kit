'use strict';

const fs = require('fs');
const path = require('path');

const { toJson, assertUnique } = require('./utils.js');
const { makeSrsCases, makeSanitizeCases, makeMergeCases, makeDaysCases, makeCheckCases, makeExamCases, makeGroupsCases } = require('./builders.js');

function writeVectors(vectorsDir, data) {
  const { srsData, sanitizeData, mergeData, daysData, checkData, examData, groupsData } = data;
  fs.writeFileSync(path.join(vectorsDir, 'srs.json'), toJson(srsData));
  fs.writeFileSync(path.join(vectorsDir, 'sanitize.json'), toJson(sanitizeData));
  fs.writeFileSync(path.join(vectorsDir, 'merge.json'), toJson(mergeData));
  fs.writeFileSync(path.join(vectorsDir, 'days.json'), toJson(daysData));
  fs.writeFileSync(path.join(vectorsDir, 'check.json'), toJson(checkData));
  fs.writeFileSync(path.join(vectorsDir, 'exam.json'), toJson(examData));
  fs.writeFileSync(path.join(vectorsDir, 'groups.json'), toJson(groupsData));
}

function countAllCases(data) {
  const { srsData, sanitizeData, mergeData, daysData, checkData, examData, groupsData } = data;
  let total = 0, refCount = 0, specCount = 0;

  for (const group of srsData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const c of sanitizeData.cases) {
    total++;
    if (c.source === 'reference') refCount++;
    else specCount++;
  }

  for (const c of mergeData.cases) {
    total++;
    if (c.source === 'reference') refCount++;
    else specCount++;
  }

  for (const group of daysData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const group of checkData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const group of examData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  for (const group of groupsData.groups) {
    for (const c of group.cases) {
      total++;
      if (c.source === 'reference') refCount++;
      else specCount++;
    }
  }

  return { total, refCount, specCount };
}

function validateAllUnique(data) {
  const { srsData, sanitizeData, mergeData, daysData, checkData, examData, groupsData } = data;
  for (const group of srsData.groups) {
    assertUnique(group.cases, `srs/${group.fn}`);
  }
  assertUnique(sanitizeData.cases, 'sanitize');
  assertUnique(mergeData.cases, 'merge');
  for (const group of daysData.groups) {
    assertUnique(group.cases, `days/${group.fn}`);
  }
  for (const group of checkData.groups) {
    assertUnique(group.cases, `check/${group.fn}`);
  }
  for (const group of examData.groups) {
    assertUnique(group.cases, `exam/${group.fn}`);
  }
  for (const group of groupsData.groups) {
    assertUnique(group.cases, `groups/${group.fn}`);
  }
}

function main() {
  const vectorsDir = path.join(__dirname, '../vectors');
  if (!fs.existsSync(vectorsDir)) {
    fs.mkdirSync(vectorsDir);
  }

  // Generate all files
  const srsData = makeSrsCases();
  const sanitizeData = makeSanitizeCases();
  const mergeData = makeMergeCases();
  const daysData = makeDaysCases();
  const checkData = makeCheckCases();
  const examData = makeExamCases();
  const groupsData = makeGroupsCases();

  // Validate uniqueness
  const data = { srsData, sanitizeData, mergeData, daysData, checkData, examData, groupsData };
  validateAllUnique(data);

  // Count cases
  const { total, refCount, specCount } = countAllCases(data);

  // Write output files
  writeVectors(vectorsDir, data);

  console.log(`vectors: ${total} cases (${refCount} reference, ${specCount} spec)`);
}

module.exports = { main };
