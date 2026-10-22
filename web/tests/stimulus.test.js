'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function baseContent(extra) {
  const item = (id, stimulus) => Object.assign({ id, unit: 'u', type: 'gap', prompt: 'P ' + id, answers: ['a'], tags: [] }, stimulus ? { stimulus } : {});
  return Object.assign({
    v: 1, version: 't', lock: ['a', 'b', 'c'],
    course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], newPerDay: 10 },
    items: [item('a', 's1'), item('b', 'nope'), item('c')]
  }, extra || {});
}

async function engineFor(content) {
  checkWasmFresh();
  const wasm = checkWasmFresh();
  const dojo = await DojoWasm.load(fs.readFileSync(wasm));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { load: () => doc, update: (fn) => fn(doc), noteAnswer() {}, doc };
  return DojoSession.createEngine({ dojo, store, content, now: () => 1760000000000, today: () => '2025-10-09', random: () => 0.5 });
}

async function currents(content, mode) {
  const s = (await engineFor(content)).start(mode || 'daily');
  const out = {};
  for (let c = s.current(); c; c = s.current()) {
    out[c.item.id] = c.stimulus;
    s.reveal();
    s.answer({ text: 'a' });
    s.next();
  }
  return out;
}

test('current() exposes stimulus by id; unknown or absent is null', async () => {
  const st = { id: 's1', title: 'T', text: 'Line1\nLine2' };
  const got = await currents(baseContent({ stimuli: [st] }));
  assert.deepStrictEqual(got.a, st);
  assert.strictEqual(got.b, null);
  assert.strictEqual(got.c, null);
});

test('no stimuli key: every current() stimulus is null', async () => {
  const got = await currents(baseContent());
  assert.deepStrictEqual(got, { a: null, b: null, c: null });
});

test('stimulus available in exam mode', async () => {
  const content = baseContent({ stimuli: [{ id: 's1', text: 'X' }] });
  content.course.exam = { passMark: 0.5, sections: [{ title: 'S', count: 3 }] };
  const s = (await engineFor(content)).start('exam');
  const seen = [];
  for (let c = s.current(); c; c = s.current()) { seen.push(c.stimulus && c.stimulus.id); s.next(); }
  assert.ok(seen.includes('s1'));
});

function loadApp() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext("self.DojoExt = { text: function (s) { return { marked: s }; } };", sandbox);
  vm.runInContext(read('ui/common.js'), sandbox, { filename: 'ui/common.js' });
  vm.runInContext(read('ui/session-screen.js'), sandbox, { filename: 'ui/session-screen.js' });
  vm.runInContext(read('ui/results.js'), sandbox, { filename: 'ui/results.js' });
  vm.runInContext(read('ui/placement.js'), sandbox, { filename: 'ui/placement.js' });
  vm.runInContext(read('ui/app.js'), sandbox, { filename: 'ui/app.js' });
  return sandbox.DojoApp._Stimulus;
}

function find(v, id) {
  if (!v || typeof v !== 'object') return null;
  if (v.props && v.props['data-testid'] === id) return v;
  const ch = v.props && v.props.children;
  for (const c of [].concat(ch === undefined ? [] : ch)) { const f = find(c, id); if (f) return f; }
  return null;
}

test('Stimulus renders nothing without stimulus', () => {
  const Stimulus = loadApp();
  assert.strictEqual(Stimulus({ stimulus: null }), null);
});

test('Stimulus renders title and text through DojoExt.text with class stimulus', () => {
  const Stimulus = loadApp();
  const v = Stimulus({ stimulus: { id: 's', title: 'Ti', text: 'a\nb' } });
  assert.ok(find(v, 'stimulus'));
  assert.match(String(find(v, 'stimulus').props.class), /\bstimulus\b/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(find(v, 'stimulus-title').props.children)), { marked: 'Ti' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(find(v, 'stimulus-text').props.children)), { marked: 'a\nb' });
});

test('Stimulus without title omits the title; hideText omits the text', () => {
  const Stimulus = loadApp();
  assert.strictEqual(find(Stimulus({ stimulus: { id: 's', text: 'x' } }), 'stimulus-title'), null);
  const v = Stimulus({ stimulus: { id: 's', title: 'Ti', text: 'secret', hideText: true } });
  assert.ok(find(v, 'stimulus-title'));
  assert.strictEqual(find(v, 'stimulus-text'), null);
});

test('stimulus CSS class is defined', () => {
  assert.match(read('styles/app.css'), /\.stimulus\s*\{/);
});
