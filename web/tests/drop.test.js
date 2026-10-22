'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');

test.describe('dropOnWrong API', () => {
  test.it('applyAnswer with no drop uses default 2', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const rec = { s: 3, ok: 1, bad: 0, due: 1000, last: 1000 };
    const result = dojo.call('applyAnswer', { rec, correct: false, now: 1000 });
    assert.equal(result.s, 1);
    assert.equal(result.bad, 1);
  });

  test.it('applyAnswer with drop=1 at stage 3 goes to stage 2', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const rec = { s: 3, ok: 1, bad: 0, due: 1000, last: 1000 };
    const result = dojo.call('applyAnswer', { rec, correct: false, now: 1000, drop: 1 });
    assert.equal(result.s, 2);
    assert.equal(result.bad, 1);
  });

  test.it('applyAnswer with drop=2 at stage 3 goes to stage 1', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const rec = { s: 3, ok: 1, bad: 0, due: 1000, last: 1000 };
    const result = dojo.call('applyAnswer', { rec, correct: false, now: 1000, drop: 2 });
    assert.equal(result.s, 1);
    assert.equal(result.bad, 1);
  });

  test.it('applyAnswer with drop=3 at stage 3 goes to stage 1 (floor)', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const rec = { s: 3, ok: 1, bad: 0, due: 1000, last: 1000 };
    const result = dojo.call('applyAnswer', { rec, correct: false, now: 1000, drop: 3 });
    assert.equal(result.s, 1);
    assert.equal(result.bad, 1);
  });

  test.it('dropForUnit resolves from unit srs', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const course = { id: 'c', title: 'C', uiLanguage: 'en', srs: { dropOnWrong: 1 }, units: [{ id: 'u', title: 'U', srs: { dropOnWrong: 2 } }] };
    const drop = dojo.call('dropForUnit', { course, unitId: 'u' });
    assert.equal(drop, 2);
  });

  test.it('dropForUnit resolves from course srs when unit not found', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const course = { id: 'c', title: 'C', uiLanguage: 'en', srs: { dropOnWrong: 1 }, units: [{ id: 'u', title: 'U' }] };
    const drop = dojo.call('dropForUnit', { course, unitId: 'unknown' });
    assert.equal(drop, 1);
  });

  test.it('dropForUnit defaults to 1 when no config', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const course = { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u', title: 'U' }] };
    const drop = dojo.call('dropForUnit', { course, unitId: 'u' });
    assert.equal(drop, 1);
  });

  test.it('dropForUnit resolves from srsByType', async () => {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const course = { id: 'c', title: 'C', uiLanguage: 'en', srs: { dropOnWrong: 1 }, srsByType: { choice: { dropOnWrong: 3 } }, units: [{ id: 'u', title: 'U' }] };
    const drop = dojo.call('dropForUnit', { course, unitId: 'u', itemType: 'choice' });
    assert.equal(drop, 3);
  });
});

test.describe('dropOnWrong through session.js', () => {
  const DojoSession = require('../session.js');
  const NOW = 1760000000000;

  async function wrongAt3(course, mode) {
    const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    const item = { id: 'u-1', unit: 'u', type: 'gap', prompt: 'Q', answers: ['right'], explanation: 'e' };
    const content = { v: 1, course, items: [item], version: 't', lock: ['u-1'] };
    const doc = { v: 1, t: 0, items: { 'u-1': { s: 3, ok: 2, bad: 0, due: NOW - 1000, last: NOW - 5000 } }, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
    const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
    const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
    const s = engine.start(mode || 'daily');
    s.answer({ text: 'wrong' });
    return doc.items['u-1'];
  }

  test.it('no config: stage 3 -> 2', async () => {
    const rec = await wrongAt3({ units: [{ id: 'u', title: 'U' }] });
    assert.equal(rec.s, 2);
  });

  test.it('course srs.dropOnWrong 2: stage 3 -> 1', async () => {
    const rec = await wrongAt3({ srs: { dropOnWrong: 2 }, units: [{ id: 'u', title: 'U' }] });
    assert.equal(rec.s, 1);
  });

  test.it('unit override wins over course', async () => {
    const rec = await wrongAt3({ srs: { dropOnWrong: 2 }, units: [{ id: 'u', title: 'U', srs: { dropOnWrong: 0 } }] });
    assert.equal(rec.s, 3);
  });

  test.it('practice mode uses the resolved drop too', async () => {
    const rec = await wrongAt3({ srs: { dropOnWrong: 2 }, units: [{ id: 'u', title: 'U' }] }, 'practice');
    assert.equal(rec.s, 1);
  });
});

test.describe('web always sends an explicit drop', () => {
  const DojoSession = require('../session.js');
  const NOW = 1760000000000;

  for (const mode of ['daily', 'practice']) {
    test.it(mode + ': every applyAnswer/applyPractice call carries an integer drop', async () => {
      const real = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
      const calls = [];
      const dojo = { call(name, args) { calls.push([name, args]); return real.call(name, args); } };
      const items = ['a', 'b'].map((id) => ({ id: id, unit: 'u', type: 'gap', prompt: 'Q', answers: ['right'], explanation: 'e' }));
      const content = { v: 1, course: { units: [{ id: 'u', title: 'U' }] }, items: items, version: 't', lock: ['a', 'b'] };
      const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
      const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
      const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
      const s = engine.start(mode);
      s.answer({ text: 'wrong' });
      s.next();
      s.answer({ text: 'right' });
      const graded = calls.filter((c) => c[0] === 'applyAnswer' || c[0] === 'applyPractice');
      assert.ok(graded.length >= 2);
      graded.forEach((c) => assert.ok(Number.isInteger(c[1].drop) && c[1].drop >= 0, c[0] + ' drop: ' + c[1].drop));
    });
  }
});
