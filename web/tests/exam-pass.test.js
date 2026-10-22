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

const ROOT = path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const SECTIONS = [{ title: 'A', count: 3, tags: ['a'] }, { title: 'B', count: 3, tags: ['b'] }];
const SCORING = [{ title: 'Part A', sections: ['A'], points: 60 }, { title: 'Part B', sections: ['B'], points: 60 }];

function items() {
  const out = [];
  ['a', 'b'].forEach((tag) => {
    for (let i = 1; i <= 3; i++) out.push({ id: tag + i, unit: 'u', type: 'gap', prompt: 'P ' + tag + i, answers: ['x'], tags: [tag] });
  });
  return out;
}

async function run(exam, solved) {
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const its = items();
  const content = { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], exam: Object.assign({ sections: SECTIONS }, exam) } };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  const s = engine.start('exam', {});
  for (let i = 0; i < 6; i++) {
    s.answer({ text: i < solved ? 'x' : 'wrong' });
    s.next();
  }
  return { sum: s.finish(), doc };
}

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb.DojoApp;
}
function texts(n, out) {
  out = out || [];
  if (Array.isArray(n)) n.forEach((c) => texts(c, out));
  else if (n && typeof n === 'object' && n.props) texts(n.props.children, out);
  else if (n !== null && n !== undefined && n !== false) out.push(String(n));
  return out;
}
function byId(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = byId(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id) return n;
  return byId(n.props.children, id);
}
const results = (summary) => loadApp()._Results({ t: (k) => k, byId: {}, go() {}, onAgain() {}, summary });

test('exam without passMark scores with the core default rule', async () => {
  const hi = await run({}, 4);
  assert.strictEqual(hi.sum.pass, true);
  const lo = await run({}, 3);
  assert.strictEqual(lo.sum.pass, false);
  assert.strictEqual(hi.sum.estimate, undefined);
});

test('pass {mode:points, scaled} marks the summary and history entry as estimate', async () => {
  const { sum, doc } = await run({ scoring: SCORING, pass: { mode: 'points', scaled: true } }, 6);
  assert.strictEqual(sum.estimate, true);
  assert.strictEqual(sum.pass, true);
  assert.strictEqual(doc.exams['exam-' + NOW].estimate, true);
  const r = results(sum);
  assert.strictEqual(texts(byId(r, 'exam-verdict')).join(''), 'results.pass_estimate');
  assert.ok(byId(r, 'exam-estimate'));
  const bad = results(Object.assign({}, sum, { pass: false }));
  assert.strictEqual(texts(byId(bad, 'exam-verdict')).join(''), 'results.fail_estimate');
});

test('passMark only (no pass rule) gives no estimate flag anywhere', async () => {
  const { sum, doc } = await run({ passMark: 0.5, scoring: SCORING }, 6);
  assert.strictEqual('estimate' in sum, false);
  assert.strictEqual('estimate' in doc.exams['exam-' + NOW], false);
  const r = results(sum);
  assert.strictEqual(texts(byId(r, 'exam-verdict')).join(''), 'results.pass');
  assert.strictEqual(byId(r, 'exam-estimate'), null);
});
