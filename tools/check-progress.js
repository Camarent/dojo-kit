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
  const ctx = {
    oldLock: lockOf(oldContent),
    newLock: lockOf(content),
    oldItems: itemMap(oldContent),
    newItems: itemMap(content),
  };
  const oldIds = ctx.oldLock.ids.length ? ctx.oldLock.ids : [...ctx.oldItems.keys()];
  for (const id of oldIds) checkOldId(id, ctx, problems);
}

function checkOldId(id, ctx, problems) {
  if (!ctx.newLock.ids.includes(id)) {
    problems.push(`removed id: ${id}`);
    return;
  }
  checkOldType(id, ctx, problems);
  checkOldRetired(id, ctx, problems);
  const oldItem = ctx.oldItems.get(id);
  const newItem = ctx.newItems.get(id);
  if (oldItem && newItem && answerOf(oldItem) !== answerOf(newItem)) {
    problems.push(`answer changed: ${id} ${answerOf(oldItem)} -> ${answerOf(newItem)}`);
  }
}

function checkOldType(id, ctx, problems) {
  const oldType = ctx.oldLock.types[id] ?? ctx.oldItems.get(id)?.type;
  const newType = ctx.newLock.types[id] ?? ctx.newItems.get(id)?.type;
  if (oldType !== undefined && oldType !== newType) {
    problems.push(`type changed: ${id} ${oldType} -> ${newType}`);
  }
}

function checkOldRetired(id, ctx, problems) {
  const wasRetired = ctx.oldLock.retired.includes(id);
  const isRetired = ctx.newLock.retired.includes(id);
  if (wasRetired && !isRetired) problems.push(`un-retired id: ${id}`);
  else if (!wasRetired && isRetired) problems.push(`id became retired: ${id}`);
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
