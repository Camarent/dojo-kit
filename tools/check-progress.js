#!/usr/bin/env node
'use strict';

// Generic: works for any course.
// Read-only check that published progress survives a new build.
// Usage: check-progress.js --content <new content.json> [--old-content <published content.json>] [--export <file.json>]...
// Exit 0 when no problems, 1 otherwise. Prints one summary line and one line per problem.

const fs = require('fs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function itemList(content) {
  const items = content.items || [];
  return Array.isArray(items) ? items : Object.entries(items).map(([id, it]) => ({ id, ...it }));
}

function itemMap(content) {
  return new Map(itemList(content).map((it) => [it.id, it]));
}

function lockOf(content) {
  const lock = content.lock || {};
  return { ids: lock.ids || [], retired: lock.retired || [], types: lock.types || {} };
}

// Correct answer as a string: numeric `answer`, gap first accepted reading.
function answerOf(item) {
  if (item.type === 'gap') return String((item.answers || [])[0]);
  return String(item.answer);
}

function checkInternal(content, problems) {
  const lock = lockOf(content);
  const ids = new Set(itemList(content).map((it) => it.id));
  for (const id of lock.ids) if (!ids.has(id)) problems.push(`lock id without item: ${id}`);
  for (const id of ids) if (!lock.ids.includes(id)) problems.push(`item not in lock: ${id}`);
}

function checkOld(oldContent, content, problems) {
  const oldLock = lockOf(oldContent);
  const newLock = lockOf(content);
  const oldItems = itemMap(oldContent);
  const newItems = itemMap(content);
  const oldIds = oldLock.ids.length ? oldLock.ids : [...oldItems.keys()];
  for (const id of oldIds) {
    if (!newLock.ids.includes(id)) {
      problems.push(`removed id: ${id}`);
      continue;
    }
    const oldType = oldLock.types[id] ?? oldItems.get(id)?.type;
    const newType = newLock.types[id] ?? newItems.get(id)?.type;
    if (oldType !== undefined && oldType !== newType) {
      problems.push(`type changed: ${id} ${oldType} -> ${newType}`);
    }
    if (oldLock.retired.includes(id) && !newLock.retired.includes(id)) {
      problems.push(`un-retired id: ${id}`);
    } else if (!oldLock.retired.includes(id) && newLock.retired.includes(id)) {
      problems.push(`id became retired: ${id}`);
    }
    const oldItem = oldItems.get(id);
    const newItem = newItems.get(id);
    if (oldItem && newItem && answerOf(oldItem) !== answerOf(newItem)) {
      problems.push(`answer changed: ${id} ${answerOf(oldItem)} -> ${answerOf(newItem)}`);
    }
  }
}

function checkExport(file, content, problems) {
  const exp = readJson(file);
  if (exp.course !== content.course.id) {
    problems.push(`${file}: foreign course ${exp.course} (expected ${content.course.id})`);
  }
  const ids = itemMap(content);
  for (const id of Object.keys(exp.items || {})) {
    if (!ids.has(id)) problems.push(`${file}: unknown id in export: ${id}`);
  }
  return Object.keys(exp.items || {}).length;
}

function parseArgs(argv) {
  const args = { exports: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--content') args.content = val;
    else if (key === '--old-content') args.oldContent = val;
    else if (key === '--export') args.exports.push(val);
    else throw new Error(`unknown argument: ${key}`);
  }
  if (!args.content) throw new Error('missing --content');
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`check-progress: ${e.message}`);
    return 1;
  }
  const content = readJson(args.content);
  const problems = [];
  checkInternal(content, problems);
  if (args.oldContent) checkOld(readJson(args.oldContent), content, problems);
  let records = 0;
  for (const file of args.exports) records += checkExport(file, content, problems);
  const summary = `check-progress: ${problems.length} problem(s), ${itemList(content).length} items, ${args.exports.length} export(s), ${records} record(s)`;
  console.log(summary);
  for (const p of problems) console.log(`  - ${p}`);
  return problems.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, checkOld, checkInternal, checkExport };
