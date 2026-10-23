'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function mkTimer() {
  const sb = { setInterval() {}, clearInterval() {} };
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(read('vendor/preact.min.js'), sb);
  vm.runInContext(read('vendor/htm.umd.js'), sb);
  vm.runInContext(read('ui/question-timer.js'), sb);
  return sb.DojoQuestionTimer.create().QuestionTimer;
}
const t = (k, v) => (v ? k + ':' + v.n : k);
function renderState(QT, state) {
  const props = { limitMs: 8000, t, canStart: () => true };
  const c = new QT(props);
  const v = c.render(props, state);
  return { cls: v.props.class, kids: [].concat(v.props.children) };
}
function find(v, pred) {
  if (!v || typeof v !== 'object') return null;
  if (pred(v)) return v;
  for (const k of [].concat(v.props && v.props.children)) { const r = find(k, pred); if (r) return r; }
  return null;
}
function secs(QT, left) {
  const props = { limitMs: 8000, t };
  const v = new QT(props).render(props, { fraction: left / 8000, left, waiting: false });
  return find(v, (n) => n.props && n.props['data-testid'] === 'qtimer-secs').props.children;
}

test('seconds text is ceil(left/1000)', () => {
  const QT = mkTimer();
  assert.strictEqual(secs(QT, 6500), 'session.timer.seconds:7');
  assert.strictEqual(secs(QT, 7000), 'session.timer.seconds:7');
  assert.strictEqual(secs(QT, 100), 'session.timer.seconds:1');
});

test('waiting class before start, number shows the full limit, hidden from AT', () => {
  const QT = mkTimer();
  const props = { limitMs: 8000, t };
  const w = new QT(props).render(props, {});
  assert.match(w.props.class, /waiting/);
  assert.strictEqual(find(w, (n) => n.props && n.props['data-testid'] === 'qtimer-secs').props.children, 'session.timer.seconds:8');
  assert.strictEqual(find(w, (n) => n.props && n.props['data-testid'] === 'qtimer-secs').props['aria-hidden'], 'true');
  const r = new QT(props).render(props, { fraction: 0.5, left: 4000, waiting: false });
  assert.doesNotMatch(r.props.class, /waiting/);
  const bar = find(r, (n) => n.props && n.props.role === 'progressbar');
  assert.strictEqual(bar.props['aria-label'], 'session.timer');
  assert.strictEqual(bar.props['aria-valuenow'], 50);
});

test('slot is rendered for timed items with or without a running bar, absent when untimed', () => {
  const sb = { setInterval() {}, clearInterval() {} };
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(read('ui/question-timer.js'), sb);
  const h = (tag, props, child) => ({ tag, props, child });
  const bar = sb.DojoQuestionTimer.slot(h, 5000, { bar: 1 });
  const after = sb.DojoQuestionTimer.slot(h, 5000, null);
  assert.strictEqual(bar.props['data-testid'], 'qtimer-slot');
  assert.strictEqual(after.props['data-testid'], 'qtimer-slot');
  assert.strictEqual(after.props.class, 'qtimer-slot');
  assert.strictEqual(sb.DojoQuestionTimer.slot(h, null, null), null);
});

test('slot sits inside the question card, not between topbar and card', () => {
  const src = read('ui/session-screen.js');
  const card = src.slice(src.indexOf('renderQuestionCard('));
  const i = card.indexOf('QTimer.slot(');
  assert.ok(i > 0 && i < card.indexOf('</article>'));
  assert.ok(!/\$\{card \? null : this\.renderQTimer/.test(src));
});

test('slot has fixed height and the session track is thinner than the timer bar', () => {
  const css = read('styles/app.css');
  assert.match(css, /\.qtimer-slot \{[^}]*height: 22px/);
  const h = (re) => +re.exec(css)[1];
  assert.ok(h(/\n\.progress \{[^}]*height: (\d+)px/) < h(/\.qtimer-bar \{[^}]*height: (\d+)px/));
  for (const l of ['en', 'ru']) assert.ok(JSON.parse(read('i18n/' + l + '.json'))['session.timer.seconds'].includes('{n}'));
});
