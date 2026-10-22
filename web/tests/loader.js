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
    
    // Check all Rust source files in crates/
    const crates = ['dojo-core', 'dojo-wasm'];
    let newestRust = wasmMtime;
    
    for (const crate of crates) {
        const srcDir = path.join(CRATES_SRC, crate, 'src');
        if (fs.existsSync(srcDir)) {
            const files = walkSync(srcDir, '.rs');
            for (const file of files) {
                const mtime = fs.statSync(file).mtimeMs;
                if (mtime > newestRust) {
                    newestRust = mtime;
                }
            }
        }
    }
    
    if (newestRust > wasmMtime) {
        throw new Error(
            `WASM at ${TARGET_WASM} is stale (older than Rust source files). ` +
            `Run: scripts/build-wasm.sh`
        );
    }
    
    return TARGET_WASM;
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
