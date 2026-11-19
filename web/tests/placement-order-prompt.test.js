'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sb = { console: { warn() {}, log() {} } };
  sb.setTimeout = (f) => f();
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'speech.js', 'types/registry.js', 'ui/answer-block.js', 'types/order.js', 'ui/common.js', 'ui/session-feedback.js', 'ui/session-screen.js', 'ui/placement.js'] });
  return sb;
}

// Collect every vnode carrying the given data-testid; `expand` is the question component to call through.
function findTestId(node, testid, expand, out) {
  out = out || [];
  if (node && typeof node === 'object') {
    if (Array.isArray(node)) node.forEach((c) => findTestId(c, testid, expand, out));
    else {
      if (node.props && node.props['data-testid'] === testid) out.push(node);
      if (node.type === expand) findTestId(expand(node.props), testid, expand, out);
      else if (node.props) findTestId(node.props.children, testid, expand, out);
    }
  }
  return out;
}

const steps = [{ label: 'I', id: 'a' }, { label: 'at', id: 'b' }, { label: 'home', id: 'c' }];
const view = { steps: steps };

function renderCheckCard(prompt) {
  const sb = load();
  const create = sb.DojoPlacement.create({ Stimulus: () => null, fbRows: () => [], tagInfo: {} });
  const item = { id: 'o1', type: 'order', unit: 'u', tags: [], prompt: prompt, steps: steps };
  const cur = { item: item, view: view, stimulus: null, position: 1, total: 2 };
  const session = { placementMode: 'check', current: () => cur };
  const p = { t: (k) => k, session: session, win: {}, course: {}, store: null, lang: 'en', onEnd() {}, onExit() {} };
  const screen = new create.PlacementSession(p);
  screen.props = p;
  screen.state = { cur: cur, qstate: { placed: [] }, result: null, picked: null, confirm: null };
  const s = screen.state;
  const vnode = screen.renderCheck({ p: p, s: s, t: p.t, cur: cur, last: false });
  return { vnode: vnode, expand: sb.DojoTypes.get('order').Question };
}

test('order item with ___ prompt shows the prompt once in check mode', () => {
  const r = renderCheckCard('I ___ at ___ ___。');
  assert.strictEqual(findTestId(r.vnode, 'prompt', r.expand).length, 1, 'exactly one prompt element');
});

test('order sentence and slot rules do not clip trailing text', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'types-order.css'), 'utf8');
  const sentence = css.match(/\.order-sentence\s*\{[^}]*\}/)[0];
  const slot = css.match(/\.order-slot\s*\{[^}]*\}/)[0];
  assert.ok(!/overflow:\s*(hidden|clip)/.test(sentence), '.order-sentence must not clip');
  assert.ok(!/overflow:\s*(hidden|clip)/.test(slot), '.order-slot must not clip');
  assert.ok(slot.includes('max-width: 100%'), '.order-slot caps width at its line');
});

test('order item prompt renders the sentence slots once', () => {
  const r = renderCheckCard('I ___ at ___ ___。');
  assert.strictEqual(findTestId(r.vnode, 'order-slot-0', r.expand).length, 1, 'slot 0 rendered once');
});
