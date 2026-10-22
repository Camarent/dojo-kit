#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Finds and returns the dojo-kit framework root directory.
 * 
 * If the DOJO_KIT_ROOT environment variable is set and points to a directory
 * containing web/dojo-wasm.js, returns that directory.
 * Otherwise, walks up from __dirname until web/dojo-wasm.js is found.
 * Throws if no valid root is found.
 */
function frameworkRoot(startDir) {
  const start = path.resolve(startDir || __dirname);

  const envRoot = process.env.DOJO_KIT_ROOT;
  if (envRoot && envRoot.trim()) {
    const wasmPath = path.join(envRoot, 'web', 'dojo-wasm.js');
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`DOJO_KIT_ROOT (${envRoot}) does not contain web/dojo-wasm.js`);
    }
    return path.resolve(envRoot);
  }

  let current = start;
  while (true) {
    const wasmPath = path.join(current, 'web', 'dojo-wasm.js');
    if (fs.existsSync(wasmPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`dojo-kit framework root not found: set DOJO_KIT_ROOT or run from inside a tree containing web/dojo-wasm.js (startDir: ${start})`);
    }
    current = parent;
  }
}

module.exports = frameworkRoot;
