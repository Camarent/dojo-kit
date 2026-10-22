'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '..');
const DEFAULT_BUNDLE = path.join(WEB, 'bundle.json');

function readSource(relPath, root = WEB) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function bundleScripts(bundle = DEFAULT_BUNDLE) {
  const b = typeof bundle === 'string' ? JSON.parse(fs.readFileSync(bundle, 'utf8')) : bundle;
  return b.scripts.filter((s) => s !== '@course');
}

// bundle: path to a bundle.json or a { scripts } object (default web/bundle.json).
// root: directory the script paths resolve against (default web/).
function loadBundle(sandbox, { skip = [], only, override = {}, bundle = DEFAULT_BUNDLE, root = WEB } = {}) {
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  sandbox.console = sandbox.console || { warn() {}, log: console.log };
  const scripts = only ? only : bundleScripts(bundle);
  for (const f of scripts) {
    if (skip.includes(f)) continue;
    const src = override[f] !== undefined ? override[f] : readSource(f, root);
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadBundle, bundleScripts, readSource };
