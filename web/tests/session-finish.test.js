'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');
const fs = require('fs');
const path = require('path');
const { makeT } = require('../ui/i18n.js');
const ru = require('../i18n/ru.json');
const en = require('../i18n/en.json');

const webDir = path.join(__dirname, '..');
const readWeb = (p) => fs.readFileSync(path.join(webDir, p), 'utf8');
// Returns the body of the first CSS rule whose selector is exactly `sel`.
const ruleBody = (css, sel) => {
  const m = css.match(new RegExp('(^|\\n)' + sel.replace(/[.[\]()]/g, '\\$&') + ' \\{([^}]*)\\}', 'g'));
  return m ? m.join('\n') : '';
};

const COURSE = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] };
const tr = (k) => k;

function mkItems(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 'i' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x'] });
  return out;
}

const key = (k) => ({ type: 'keydown', key: k, target: { tagName: 'BODY' }, preventDefault() {} });

// Real session screen with the window's listeners really dispatched (as in session-no-autoend.test.js).
async function mountPractice(t, items, limit) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const win = H.fakeWin([]);
  win.document = { visibilityState: 'visible', body: { tagName: 'BODY' } };
  win.addEventListener = (type, f) => { (win.listeners[type] = win.listeners[type] || []).push(f); };
  win.removeEventListener = (type, f) => { win.listeners[type] = (win.listeners[type] || []).filter((g) => g !== f); };
  win.fire = (ev) => { (win.listeners[ev.type] || []).slice().forEach((f) => f(ev)); };
  const m = await H.mount({ win, items, course: COURSE, setup(sb) {
    sb.setInterval = (f, n) => globalThis.setInterval(f, n);
    sb.clearInterval = (id) => globalThis.clearInterval(id);
    sb.setTimeout = (f, n) => globalThis.setTimeout(f, n);
  } });
  m.win = win;
  m.app.startMode('practice', { limit: limit });
  const screen = m.screen(m.sb.DojoApp._SessionScreen);
  screen.props = Object.assign({}, screen.props, { onEnd: (sum) => m.app.endSession(sum) });
  screen.componentDidMount();
  m.screen = screen;
  return m;
}

// Answers the current item with the given text, then presses Enter to move on.
function answerAndNext(m, text) {
  m.screen.answer({ text: text });
  m.win.fire(key('Enter'));
}

test('finish: after the last answer the run shows the four numbers', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'session', 'one answer left: still in the session');
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'results', 'queue empty: finish screen');
  const fin = m.app.state.summary.finish;
  assert.strictEqual(fin.answered, 2);
  assert.strictEqual(fin.right, 2);
  assert.strictEqual(fin.weakLeft, 0);
  assert.strictEqual(fin.denominator, 2);
  const v = m.sb.DojoApp._Results({ t: tr, byId: { i1: mkItems(2)[0], i2: mkItems(2)[1] }, go() {}, onAgain() {}, summary: m.app.state.summary });
  assert.ok(H.find(v, 'session-finish'), 'finish block rendered');
  assert.ok(H.text(H.find(v, 'finish-answered')).includes('2'), 'answered shows 2');
  assert.ok(H.text(H.find(v, 'finish-right')).includes('2'), 'right shows 2');
  assert.ok(H.text(H.find(v, 'finish-weak-left')).includes('0'), 'weak left shows 0');
  assert.ok(H.find(v, 'finish-next-due'), 'next due shown');
});

test('finish: no new round starts by itself after the last answer', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'x');
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'results');
  t.mock.timers.tick(60000);
  t.mock.timers.tick(600000);
  assert.strictEqual(m.app.state.screen, 'results', 'still on finish after waiting');
  assert.strictEqual(m.app.state.session, null, 'no session started again');
  assert.strictEqual(m.app.state.summary.answered, 2, 'no extra answers recorded');
});

test('finish: a wrong answer re-queues once, then the run finishes', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'nope');
  assert.strictEqual(m.app.state.screen, 'session', 'wrong answer: the repeat keeps the run open');
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'session', 'repeat still pending');
  answerAndNext(m, 'nope');
  assert.strictEqual(m.app.state.screen, 'results', 'a second wrong answer on the repeat does not re-queue again');
  // Repeat answers are not in the review: answered counts the first answer of each item.
  const fin = m.app.state.summary.finish;
  assert.strictEqual(fin.answered, 2);
  assert.strictEqual(fin.right, 1);
  assert.strictEqual(fin.denominator, 3, 'planned 2 plus one repeat');
});

// Counts in the weak-left tile: Russian forms come from the plural keys, so the label agrees with the number.
test('finish: weak-left label picks the Russian plural form for each count', () => {
  const t = makeT({ ru, en }, 'ru');
  assert.strictEqual(t('finish.weakLeft', { n: 1 }), ru['finish.weakLeft.one']);
  assert.strictEqual(t('finish.weakLeft', { n: 2 }), ru['finish.weakLeft.few']);
  assert.strictEqual(t('finish.weakLeft', { n: 5 }), ru['finish.weakLeft']);
  assert.strictEqual(t('finish.weakLeft', { n: 21 }), ru['finish.weakLeft.one']);
});

test('finish: the rendered weak-left tile uses the plural form of its count', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'x');
  answerAndNext(m, 'x');
  const fin = m.app.state.summary.finish;
  const summary = Object.assign({}, m.app.state.summary, { finish: Object.assign({}, fin, { weakLeft: 2 }) });
  const i18nT = makeT({ ru, en }, 'ru');
  const v = m.sb.DojoApp._Results({ t: i18nT, byId: { i1: mkItems(2)[0], i2: mkItems(2)[1] }, go() {}, onAgain() {}, summary: summary });
  assert.ok(H.text(H.find(v, 'finish-weak-left')).includes(ru['finish.weakLeft.few']), 'two weak units use the few form');
});

test('finish: the four tiles keep their order answered, right, weak-left, next-due', () => {
  const src = readWeb('ui/session-finish.js');
  const pos = ['finish-answered', 'finish-right', 'finish-weak-left', 'finish-next-due'].map((id) => src.indexOf(id));
  assert.ok(pos.every((p) => p > 0), 'every tile present');
  assert.deepStrictEqual(pos, pos.slice().sort((a, b) => a - b));
});

test('finish: stat values and catalogue titles may wrap, no nowrap overflow rule', () => {
  const css = readWeb('styles/app.css');
  assert.ok(!/white-space:\s*nowrap/.test(ruleBody(css, '.stat b')));
  assert.ok(!/white-space:\s*nowrap/.test(ruleBody(css, '.catalog-prompt')));
  assert.match(ruleBody(css, '.catalog-prompt'), /white-space:\s*normal/);
});

test('finish: shared dialog is capped at the viewport height and scrolls', () => {
  const css = readWeb('styles/app.css');
  const body = ruleBody(css, '.dialog');
  assert.match(body, /max-height:\s*calc\(100vh - 2 \* var\(--space-4\)\)/);
  assert.match(body, /max-height:\s*calc\(100dvh - 2 \* var\(--space-4\)\)/);
  assert.match(body, /overflow-y:\s*auto/);
  assert.match(ruleBody(css, '.dialog > h2:first-child'), /position:\s*sticky/);
  assert.match(ruleBody(css, '.dialog > .row.end'), /position:\s*sticky/);
});

test('finish: the session-finish tile passes the count so the plural form is picked', () => {
  assert.ok(readWeb('ui/session-finish.js').includes("t('finish.weakLeft', { n: f.weakLeft })"));
});

test('finish: checkbox control is at least 24px', () => {
  const body = ruleBody(readWeb('styles/app.css'), 'input[type=checkbox]');
  assert.match(body, /min-width:\s*24px/);
  assert.match(body, /min-height:\s*24px/);
});
