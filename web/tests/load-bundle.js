'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '..');
const DEFAULT_BUNDLE = path.join(WEB, 'bundle.json');

function readSource(relPath, root = WEB) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

// Web scripts of modules/ja, as paths relative to web/; loadBundle puts them at the "@modules" marker.
const JA_DIR = path.join(WEB, '..', 'modules', 'ja');
const JA_SCRIPTS = JSON.parse(fs.readFileSync(path.join(JA_DIR, 'module.json'), 'utf8')).web.scripts
  .map((s) => path.relative(WEB, path.join(JA_DIR, s)));

function bundleScripts(bundle = DEFAULT_BUNDLE) {
  const b = typeof bundle === 'string' ? JSON.parse(fs.readFileSync(bundle, 'utf8')) : bundle;
  return b.scripts.filter((s) => s !== '@course' && s !== '@modules');
}

// Bundle scripts with "@modules" replaced by the ja module scripts and "@course" dropped.
function withModules(bundle) {
  const b = typeof bundle === 'string' ? JSON.parse(fs.readFileSync(bundle, 'utf8')) : bundle;
  return b.scripts.flatMap((s) => (s === '@modules' ? JA_SCRIPTS : s === '@course' ? [] : [s]));
}

// Source text for script `f`: the override when given, else the file under `root`.
function sourceOf(f, override, root) {
  return override[f] !== undefined ? override[f] : readSource(f, root);
}

// bundle: path to a bundle.json or a { scripts } object (default web/bundle.json).
// root: directory the script paths resolve against (default web/).
function loadBundle(sandbox, { skip = [], only, override = {}, bundle = DEFAULT_BUNDLE, root = WEB } = {}) {
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  sandbox.console = sandbox.console || { warn() {}, log: console.log };
  const scripts = only || withModules(bundle);
  for (const f of scripts) {
    if (skip.includes(f)) continue;
    vm.runInContext(sourceOf(f, override, root), sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadBundle, bundleScripts, readSource };
