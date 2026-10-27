'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const frameworkRoot = require('./fw-root.js');

/** Main (non-worktree) checkout of the framework; falls back to the framework root. */
function mainCheckoutRoot(root = frameworkRoot()) {
  try {
    const common = execFileSync('git', ['-c', 'safe.directory=*', '-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.basename(common) === '.git') return path.dirname(common);
  } catch (e) { /* not a git checkout */ }
  return root;
}

/** Directory for dated owner exports: <main>/workspace/progress/<course>; legacy <main>/workspace/<course>-progress used if the new one is missing. */
function realExportsDir(course) {
  const ws = path.join(mainCheckoutRoot(), 'workspace');
  const dir = path.join(ws, 'progress', course);
  const legacy = path.join(ws, `${course}-progress`);
  if (!fs.existsSync(dir) && fs.existsSync(legacy)) {
    console.warn(`legacy location: ${legacy} (move exports to ${dir})`);
    return legacy;
  }
  return dir;
}

/**
 * Real progress exports for a course, oldest first.
 * Env <COURSE>_REAL_EXPORT (path; non-alphanumerics become '_') wins and yields only that file;
 * else every *.json in realExportsDir sorted by name. Returns [] when none.
 */
function findRealExports(course) {
  const envName = `${course.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_REAL_EXPORT`;
  const env = process.env[envName] && process.env[envName].trim();
  if (env) return [path.resolve(env)];
  const dir = realExportsDir(course);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

/**
 * Per-file report lines and verdict for a gate run. results: [{file, exercised}].
 * none = exports exist but none exercised migration; fail = none && strict.
 */
function summarizeGate(results, strict = realGateStrict()) {
  const lines = results.map((r) => `${path.basename(r.file)}: ${r.exercised ? 'exercised' : 'invariants-only'}`);
  const none = results.length > 0 && !results.some((r) => r.exercised);
  if (none) lines.push('NO EXPORT EXERCISED MIGRATION');
  return { lines, none, fail: none && !!strict };
}

/** True when REAL_GATE_STRICT=1: a missing export must fail the gate. */
function realGateStrict() {
  return process.env.REAL_GATE_STRICT === '1';
}

module.exports = { findRealExports, summarizeGate, realExportsDir, mainCheckoutRoot, realGateStrict };
