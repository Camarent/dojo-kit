'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const TARGET_WASM = path.join(ROOT, 'target', 'wasm32-unknown-unknown', 'release', 'dojo_wasm.wasm');
const CRATES_SRC = path.join(ROOT, 'crates');

/// Check if the WASM file is fresh (newer than all Rust source files).
/// Returns the WASM path if fresh, throws an error if stale.
function checkWasmFresh() {
    if (!fs.existsSync(TARGET_WASM)) {
        throw new Error(`WASM not found at ${TARGET_WASM}. Run: scripts/build-wasm.sh`);
    }

    const wasmMtime = fs.statSync(TARGET_WASM).mtimeMs;

    if (newestRustMtime(wasmMtime) > wasmMtime) {
        throw new Error(
            `WASM at ${TARGET_WASM} is stale (older than Rust source files). ` +
            `Run: scripts/build-wasm.sh`
        );
    }
    
    return TARGET_WASM;
}

/// Newest mtime among the Rust sources of the wasm crates; `floor` when none is newer.
function newestRustMtime(floor) {
    const crates = ['dojo-core', 'dojo-wasm'];
    let newest = floor;
    for (const crate of crates) {
        const srcDir = path.join(CRATES_SRC, crate, 'src');
        if (!fs.existsSync(srcDir)) continue;
        for (const file of walkSync(srcDir, '.rs')) {
            newest = Math.max(newest, fs.statSync(file).mtimeMs);
        }
    }
    return newest;
}

/// Recursively walk a directory and return all files matching an extension.
function walkSync(dir, ext) {
    const results = [];
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...walkSync(fullPath, ext));
        } else if (fullPath.endsWith(ext)) {
            results.push(fullPath);
        }
    }
    return results;
}

module.exports = { checkWasmFresh, TARGET_WASM, ROOT };
