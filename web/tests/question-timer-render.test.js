'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

// Mounts the QuestionTimer component from the node-required module (so its
// lines count for coverage) with a fake clock and a fake interval.
const QT = require('../ui/question-timer.js');
let ivs = [];
let cleared = [];
globalThis.setInterval = (fn) => { ivs.push(fn); return ivs.length; };
globalThis.clearInterval = (id) => { cleared.push(id); };

function mount(props) {
  ivs = [];
  cleared = [];
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  globalThis.preact = sb.preact;
  globalThis.htm = sb.htm;
  const C = QT.create().QuestionTimer;
  const inst = new C(props);
  inst.props = props;
  inst.state = {};
  inst.setState = (patch) => { Object.assign(inst.state, patch); };
  inst.componentDidMount();
  return { inst, ivs, cleared, tick: () => ivs[0]() };
}

function findNode(node, pred) {
  if (!node || typeof node !== 'object') return null;
  if (pred(node)) return node;
  const kids = node.props && node.props.children;
  const list = Array.isArray(kids) ? kids : [kids];
  for (const k of list) {
    const hit = findNode(k, pred);
    if (hit) return hit;
  }
  return null;
}

function barWidth(inst) {
  const v = inst.render(inst.props, inst.state);
  const span = findNode(v, (n) => n.type === 'span' && n.props && n.props.style && n.props.style.width !== undefined);
  return span.props.style.width;
}

function rootClass(inst) {
  return inst.render(inst.props, inst.state).props.class;
}

test('render: bar width shrinks as the clock advances', () => {
  let t = 0;
  const m = mount({ now: () => t, limitMs: 5000, canStart: () => true, onStart() {}, onExpire() {}, stopped: false, t: null });
  assert.strictEqual(barWidth(m.inst), '100%');
  t = 2500;
  m.tick();
  assert.strictEqual(barWidth(m.inst), '50%');
  t = 4000;
  m.tick();
  assert.strictEqual(barWidth(m.inst), '20%');
});

test('render: bar is visible and not waiting while running', () => {
  let t = 0;
  const m = mount({ now: () => t, limitMs: 5000, canStart: () => true, onStart() {}, onExpire() {}, stopped: false, t: null });
  t = 1000;
  m.tick();
  const v = m.inst.render(m.inst.props, m.inst.state);
  assert.strictEqual(v.props['data-testid'], 'qtimer');
  assert.ok(findNode(v, (n) => n.props && n.props.role === 'progressbar'));
  assert.ok(!/waiting/.test(rootClass(m.inst)));
});

test('render: bar waits before playback allows the clock to start', () => {
  let t = 0;
  const m = mount({ now: () => t, limitMs: 5000, canStart: () => false, onStart() {}, onExpire() {}, stopped: false, t: null });
  assert.ok(/waiting/.test(rootClass(m.inst)));
  assert.strictEqual(barWidth(m.inst), '100%');
});

test('expiry: onExpire fires exactly once at the limit', () => {
  let t = 0;
  let n = 0;
  const m = mount({ now: () => t, limitMs: 5000, canStart: () => true, onStart() {}, onExpire: () => n++, stopped: false, t: null });
  t = 4999;
  m.tick();
  assert.strictEqual(n, 0);
  t = 5000;
  m.tick();
  m.tick();
  t = 9000;
  m.tick();
  assert.strictEqual(n, 1);
});

test('canStart false keeps the clock stopped', () => {
  let t = 0;
  let started = 0;
  let expired = 0;
  const m = mount({ now: () => t, limitMs: 5000, canStart: () => false, onStart: () => started++, onExpire: () => expired++, stopped: false, t: null });
  t = 10000;
  m.tick();
  assert.strictEqual(started, 0);
  assert.strictEqual(expired, 0);
  assert.strictEqual(m.inst.state.fraction, 1);
});

test('unmount clears the interval and stops expiry', () => {
  let t = 0;
  let n = 0;
  const m = mount({ now: () => t, limitMs: 5000, canStart: () => true, onStart() {}, onExpire: () => n++, stopped: false, t: null });
  m.inst.componentWillUnmount();
  assert.deepStrictEqual(m.cleared, [1]);
  t = 9000;
  m.tick();
  assert.strictEqual(n, 0);
});
