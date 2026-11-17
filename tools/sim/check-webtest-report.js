#!/usr/bin/env node
'use strict';

// Read-only check of a web-tester report (webtest-final.md).
// Usage: check-webtest-report.js <report.md> <app>...
// Needs one "## <app>" section per given app, each with a row per CHECKS name:
//   | check | PASS|FAIL | evidence |
// and one line "VERDICT: PASS" or "VERDICT: FAIL" that agrees with the rows.
// Exit 0 when valid; exit 1 and one line per problem otherwise.

const fs = require('fs');

const CHECKS = [
  'viewport 390x844',
  'session 10 answers',
  'exit and return counters',
  'plan block numbers',
  'finish screen reached',
  'no kana word split',
  'buttons visible unclipped',
  'no internal field on catalog card',
];
const RESULTS = ['PASS', 'FAIL'];
const VERDICT_PREFIX = 'VERDICT: ';

function sections(text) {
  const out = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      current = line.slice(3).trim();
      out.set(current, []);
    } else if (current !== null && line.startsWith('|')) {
      out.get(current).push(line.split('|').slice(1, -1).map((c) => c.trim()));
    }
  }
  return out;
}

function verdictOf(text) {
  const lines = text.split('\n').filter((l) => l.startsWith(VERDICT_PREFIX));
  return lines.map((l) => l.slice(VERDICT_PREFIX.length).trim());
}

function check(text, apps) {
  const problems = [];
  const secs = sections(text);
  let allPass = true;
  for (const app of apps) {
    if (!secs.has(app)) {
      problems.push(`missing section: ${app}`);
      allPass = false;
      continue;
    }
    const rows = secs.get(app);
    for (const name of CHECKS) {
      const row = rows.find((cells) => cells[0] === name);
      if (!row) {
        problems.push(`${app}: missing check: ${name}`);
        allPass = false;
        continue;
      }
      const [, result, evidence] = row;
      if (!RESULTS.includes(result)) {
        problems.push(`${app}: ${name}: result must be PASS or FAIL, got "${result}"`);
        allPass = false;
      } else if (result === 'FAIL') {
        allPass = false;
      }
      if (!evidence || evidence === 'ok') {
        problems.push(`${app}: ${name}: evidence missing (need screenshot path or DOM fact)`);
      }
    }
  }
  const verdicts = verdictOf(text);
  if (verdicts.length !== 1) {
    problems.push(`expected exactly one "${VERDICT_PREFIX}" line, found ${verdicts.length}`);
  } else if (verdicts[0] !== 'PASS' && verdicts[0] !== 'FAIL') {
    problems.push(`verdict must be PASS or FAIL, got "${verdicts[0]}"`);
  } else if ((verdicts[0] === 'PASS') !== allPass) {
    problems.push(`verdict ${verdicts[0]} disagrees with rows (all PASS: ${allPass})`);
  }
  return problems;
}

function main(argv) {
  const file = argv[2];
  const apps = argv.slice(3);
  if (!file || apps.length === 0) {
    process.stdout.write('usage: check-webtest-report.js <report.md> <app>...\n');
    return 1;
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    process.stdout.write(`cannot read ${file}: ${err.code || err.message}\n`);
    return 1;
  }
  const problems = check(text, apps);
  for (const p of problems) process.stdout.write(`${p}\n`);
  if (problems.length === 0) process.stdout.write(`ok: ${file}\n`);
  return problems.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = { check, CHECKS };
