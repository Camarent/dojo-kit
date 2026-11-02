'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { K } = require('../session/util.js');

const RUST_SRC = path.join(__dirname, '..', '..', 'crates', 'dojo-core', 'src');

function rustFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return rustFiles(p);
    return e.name.endsWith('.rs') ? [p] : [];
  });
}

function rustConstants(name) {
  if (!fs.existsSync(RUST_SRC)) throw new Error(`missing ${RUST_SRC}`);
  const re = new RegExp(`const ${name}: i64 = (\\d+);`, 'g');
  return rustFiles(RUST_SRC).flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(re)].map((m) => Number(m[1])));
}

for (const name of ['DEFAULT_NEW_PER_DAY', 'DEFAULT_LEARNED_STAGE']) {
  test(`JS ${name} equals the Rust constant`, () => {
    const found = rustConstants(name);
    assert.strictEqual(found.length, 1, `expected one Rust definition of ${name}`);
    assert.strictEqual(K[name], found[0]);
  });
}
