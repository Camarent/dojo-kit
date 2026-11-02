'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
require('../session.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');
const { readSource, bundleScripts } = require('./load-bundle.js');

const ROOT = path.join(__dirname, '..', '..');
const NOW = 1760000000000;



let dojoP;
function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

































function sizedStore(maxDocBytes) {
  const sets = [];
  const ref = { get: async () => ({ exists: false, data: () => null }), set: async (b) => { sets.push(b); }, onSnapshot: () => () => {} };
  const claude = { use: async (n) => (n === 'db' ? { doc: () => ref } : { id: async () => 'u1' }) };
  return loadDojo().then((dojo) => {
    const store = DojoStorage.createStore({
      courseId: 'c', dojo, now: () => NOW, localStorage: null, claude,
      setTimeoutFn: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeoutFn: () => {}, maxDocBytes
    });
    return { store, sets };
  });
}

function bigDraft() {
  const answers = [];
  for (let i = 0; i < 40; i++) answers.push({ i, c: true, g: 'g'.repeat(150) });
  return { sid: 's1', examId: 'm1', ids: ['a1'], sections: [], index: 0, group: 0, remainingMs: [1], elapsedMs: 1, answers, startedAt: NOW, updatedAt: NOW };
}

test('storage oversize: g is stripped, then an open draft is dropped (no tombstone), exams untouched', async () => {
  const mid = await sizedStore(2200);
  await mid.store.load();
  mid.store.update((d) => { d.examDraft = bigDraft(); });
  await mid.store.flush();
  const body = mid.sets[mid.sets.length - 1];
  assert.ok(body.examDraft.answers.length === 40 && body.examDraft.answers.every((a) => a.g === undefined));
  assert.strictEqual(mid.store.doc.examDraft.answers[0].g.length, 150);

  const small = await sizedStore(900);
  await small.store.load();
  small.store.update((d) => { d.examDraft = bigDraft(); d.exams = { 'exam-1': { date: '2025-01-01', raw: 1, total: 2, fraction: 0.5, pass: true, mode: 'exam' } }; });
  await small.store.flush();
  const b2 = small.sets[small.sets.length - 1];
  assert.strictEqual(b2.examDraft, undefined);
  assert.strictEqual(small.store.doc.examDraft.sid, 's1');
  assert.ok(b2.exams['exam-1']);
});

test('UI: every resume string exists in every locale and app.js has no hard-coded resume text', () => {
  const dir = path.join(ROOT, 'web', 'i18n');
  // Concatenate all UI sources from bundle.json
  const uiSources = bundleScripts().filter((s) => s.startsWith('ui/')).map((f) => readSource(f)).join('\n');
  const keys = Array.from(new Set((uiSources.match(/t\('(home\.resume\.[a-z.]+)'/g) || []).map((m) => m.slice(3, -1))));
  assert.ok(keys.length >= 6);
  const locales = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(locales.length >= 2);
  for (const f of locales) {
    const tr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of keys) assert.ok(typeof tr[k] === 'string' && tr[k].length, f + ' lacks ' + k);
  }
  assert.ok(!/>\s*(Resume|Start over|Discard)\s*</.test(uiSources));
});
