// Runs every golden vector through the compiled wasm. Usage: node tests/wasm-smoke.js [path/to/dojo_wasm.wasm]
'use strict';
const fs = require('fs');
const path = require('path');
const { load, DojoError } = require('../web/dojo-wasm.js');

const MAX_BYTES = 512 * 1024;
const wasmPath = process.argv[2] || path.join(__dirname, '../target/wasm32-unknown-unknown/release/dojo_wasm.wasm');
const bytes = fs.readFileSync(wasmPath);

function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && same(a[k], b[k]));
  }
  return a === b;
}

async function main() {
  const failures = [];
  if (bytes.length > MAX_BYTES) failures.push(`wasm is ${bytes.length} bytes, budget ${MAX_BYTES}`);
  
  // Check WASM size is under 360 KB
  if (bytes.length >= 360000) failures.push(`wasm is ${bytes.length} bytes, must be under 360000`);

  // Scan for custom "name" section
  function readLEB128(buf, offset) {
    let start = offset;
    let value = 0;
    let shift = 0;
    while (true) {
      const byte = buf[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return [value, offset - start];
  }
  {
    const buf = bytes;
    let pos = 8; // skip magic + version
    while (pos < buf.length) {
      const sectionId = buf[pos++];
      const [sectionSize, bytesRead] = readLEB128(buf, pos);
      pos += bytesRead;
      const sectionEnd = pos + sectionSize;
      if (sectionId === 0) { // custom section
        const [nameLen, lenBytesRead] = readLEB128(buf, pos);
        pos += lenBytesRead;
        const name = Buffer.from(buf.subarray(pos, pos + nameLen)).toString('utf8');
        if (name === 'name') failures.push('wasm contains a "name" custom section; check strip = "symbols" in Cargo.toml');
      }
      pos = sectionEnd;
    }
  }
  
  const dojo = await load(bytes);
  let total = 0;
  for (const file of ['sanitize', 'merge', 'srs', 'days', 'check', 'exam']) {
    const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', file + '.json'), 'utf8'));
    for (const group of doc.groups || [doc]) {
      for (const c of group.cases) {
        total++;
        try {
          const got = dojo.call(group.fn, c.input);
          if (!same(got, c.expect)) failures.push(`${group.fn}/${c.name}: ${JSON.stringify(got)}`);
        } catch (e) {
          failures.push(`${group.fn}/${c.name}: threw ${e.message}`);
        }
      }
    }
  }
  for (const [name, args, code] of [['nope', {}, 'unknown_function'], ['applyAnswer', {}, 'bad_args']]) {
    try {
      dojo.call(name, args);
      failures.push(`${name}: did not throw`);
    } catch (e) {
      if (!(e instanceof DojoError) || e.code !== code) failures.push(`${name}: wrong error ${e.code}`);
    }
  }
  const big = { items: {}, stats: {}, v: 1, pad: 'é'.repeat(200000) };
  if (dojo.call('sanitize', big).pad.length !== 200000) failures.push('large UTF-8 document did not round-trip');
  console.log(`wasm-smoke: ${total} vectors, ${bytes.length} bytes, ${failures.length} failures`);
  failures.forEach((f) => console.log('  FAIL ' + f));
  process.exit(failures.length ? 1 : 0);
}

main();
