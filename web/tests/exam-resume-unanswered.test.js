'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;
const MIN = 60000;

function items(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push({ id: 'q' + i, unit: 'u', type: 'gap', prompt: 'P ' + i, answers: ['x'], tags: ['t'] });
  }
  return out;
}

const SECTIONS = [{ title: 'S', count: 10, tags: ['t'] }];
const EXAM = { id: 'm1', passMark: 0.5, sections: SECTIONS, minutes: 30 };

let dojoP;
async function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return await dojoP;
}

function content(exams) {
  const its = items(10);
  const course = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] };
  if (exams) course.exams = exams;
  return { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: course };
}

function freshDoc() {
  return { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
}

async function setup(exams) {
  const dojo = await loadDojo();
  const doc = freshDoc();
  const clock = { t: NOW };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content: content(exams || [EXAM]), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { engine, doc, clock, dojo, store };
}

function solve(s) { return s.answer({ text: 'x' }); }

test('session.answered is initialized to 0 for new exam', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  assert.strictEqual(s.answered, 0);
  assert.strictEqual(s.total, 10);
});

test('session.answered increments on each answer', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  
  solve(s);
  assert.strictEqual(s.answered, 1);
  
  s.next();
  solve(s);
  assert.strictEqual(s.answered, 2);
  
  s.next();
  solve(s);
  assert.strictEqual(s.answered, 3);
});

test('session.answered is restored from draft on resume', async () => {
  const t = await setup();
  const s1 = t.engine.start('exam', { examId: 'm1' });
  
  solve(s1);
  s1.next();
  solve(s1);
  s1.next();
  solve(s1);
  s1.saveDraft();
  
  const draft = t.doc.examDraft;
  assert.strictEqual(draft.answers.length, 3, 'Draft should have 3 answers');
  
  const s2 = t.engine.start('exam', { examId: 'm1', resume: draft });
  assert.strictEqual(s2.answered, 3, 'Resumed session should have answered = 3');
  assert.strictEqual(s2.total, 10);
});

test('unanswered count is total - answered', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  
  solve(s);
  s.next();
  solve(s);
  s.next();
  solve(s);
  
  const unanswered = s.total - s.answered;
  assert.strictEqual(unanswered, 7, 'Should have 7 unanswered (10 - 3 = 7)');
});

test('unanswered count after resume is correct', async () => {
  const t = await setup();
  const s1 = t.engine.start('exam', { examId: 'm1' });
  
  solve(s1);
  s1.next();
  solve(s1);
  s1.next();
  solve(s1);
  s1.saveDraft();
  
  const draft = t.doc.examDraft;
  const s2 = t.engine.start('exam', { examId: 'm1', resume: draft });
  
  const unanswered = s2.total - s2.answered;
  assert.strictEqual(unanswered, 7, 'Should have 7 unanswered after resume (10 - 3 = 7)');
});

test('unanswered count updates after answering more questions after resume', async () => {
  const t = await setup();
  const s1 = t.engine.start('exam', { examId: 'm1' });
  
  solve(s1);
  s1.next();
  solve(s1);
  s1.saveDraft();
  
  const draft = t.doc.examDraft;
  const s2 = t.engine.start('exam', { examId: 'm1', resume: draft });
  assert.strictEqual(s2.answered, 2);
  
  solve(s2);
  assert.strictEqual(s2.answered, 3);
  
  s2.next();
  solve(s2);
  assert.strictEqual(s2.answered, 4);
  
  const unanswered = s2.total - s2.answered;
  assert.strictEqual(unanswered, 6, 'Should have 6 unanswered (10 - 4 = 6)');
});

test('session.answered matches draft.answers.length after save', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  
  solve(s);
  assert.strictEqual(s.answered, 1);
  s.saveDraft();
  assert.strictEqual(t.doc.examDraft.answers.length, 1);
  
  s.next();
  solve(s);
  assert.strictEqual(s.answered, 2);
  s.saveDraft();
  assert.strictEqual(t.doc.examDraft.answers.length, 2);
});

test('session.answered works with dontKnow', async () => {
  const t = await setup();
  const course = content([EXAM]).course;
  course.dontKnow = true;
  const engine = DojoSession.createEngine({ 
    dojo: await loadDojo(), 
    store: { doc: freshDoc(), update(fn) { fn(this.doc); }, noteAnswer() {} }, 
    content: { ...content([EXAM]), course: course },
    now: () => NOW, 
    today: () => '2025-10-09', 
    random: () => 0.5 
  });
  
  const s = engine.start('exam', { examId: 'm1', training: true });
  assert.strictEqual(s.answered, 0);
  
  s.dontKnow();
  assert.strictEqual(s.answered, 1);
  
  s.next();
  s.dontKnow();
  assert.strictEqual(s.answered, 2);
});

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js', 'ui/app.js'] });
  return sb.DojoApp;
}

function findId(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = findId(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return findId(n.props.children, id);
}

test('finish dialog text shows total - answered after resume', async () => {
  const t = await setup();
  const s1 = t.engine.start('exam', { examId: 'm1' });
  solve(s1); s1.next(); solve(s1); s1.next(); solve(s1);
  s1.saveDraft();
  const s2 = t.engine.start('exam', { examId: 'm1', resume: t.doc.examDraft });
  const App = loadApp();
  const props = { t: (k, v) => k + (v ? JSON.stringify(v) : ''), session: s2, now: () => NOW, win: {}, course: content([EXAM]).course, byId: {}, dojo: null };
  const sc = new App._SessionScreen(props);
  sc.state = Object.assign({}, sc.state, { cur: s2.current(), confirm: 'finish' });
  const dlg = findId(sc.render(sc.props, sc.state), 'dlg-finish');
  assert.ok(dlg, 'finish dialog rendered');
  assert.strictEqual(dlg.props.body, 'session.finish.unanswered{"n":7}');
});
