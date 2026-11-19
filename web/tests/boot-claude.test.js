'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const BOOT = fs.readFileSync(path.join(__dirname, '../boot.js'), 'utf8');

function content() {
  return {
    v: 1, version: 't', lock: [], items: [], stimuli: [],
    course: { id: 'c', title: 'C', uiLanguage: 'en', units: [] }
  };
}

// Runs the real boot.js in a fresh context; resolves with the opts DojoApp.start receives.
function runBoot(sb) {
  let resolveStart;
  const started = new Promise((resolve) => { resolveStart = resolve; });
  sb.self = sb;
  sb.document = { getElementById: () => ({}) };
  sb.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
  sb.DojoWasm = { load: async () => ({}) };
  sb.fetch = () => Promise.resolve({ ok: true, json: async () => content() });
  sb.DojoApp = {
    start: (o) => resolveStart(o),
    fail: (_, e) => { throw e; }
  };
  vm.runInNewContext(BOOT, vm.createContext(sb));
  return started;
}

// Bounded wait: boot that never reaches start fails by assertion, not by hang.
async function bounded(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: 'boot did not reach DojoApp.start' })), 10000);
  });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer); }
}

test('boot passes a late-resolving claude getter to DojoApp.start', async () => {
  const sb = {};
  const opts = await bounded(runBoot(sb));
  assert.strictEqual(typeof opts.claude, 'function');
  assert.strictEqual(opts.claude(), null);
  const fakeClaude = { name: 'late' };
  sb.claude = fakeClaude;
  assert.strictEqual(opts.claude(), fakeClaude);
});
