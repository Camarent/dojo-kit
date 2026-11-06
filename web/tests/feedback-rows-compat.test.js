'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Real registry + ext, then the stimulus UI that renders feedback rows. No ja module loaded.
function loadStimulus() {
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext.js'] });
  vm.runInContext(read('ui/stimulus.js'), sb, { filename: 'ui/stimulus.js' });
  return { E: sb.DojoExt, shared: sb.DojoStimulus.create() };
}

function find(v, id) {
  if (!v || typeof v !== 'object') return null;
  if (Array.isArray(v)) { for (const c of v) { const f = find(c, id); if (f) return f; } return null; }
  if (v.props && v.props['data-testid'] === id) return v;
  return find(v.props && v.props.children, id);
}

const P = { t: (k) => k, content: { items: [] }, course: {} };
const S = { cur: { item: { id: 'a', prompt: 'P' } }, result: { ok: true } };

test('core maps legacy kanji field to ch without the ja module', () => {
  const { E, shared } = loadStimulus();
  E.registerFeedbackRows(() => [{ kanji: 'D', meaning: 'day', on: [], kun: [] }]);
  const rows = E.feedbackRows({ prompt: 'p' }, { examMode: false });
  assert.strictEqual(rows[0].ch, 'D');
  const v = shared.fbRows(P, S, false);
  assert.strictEqual(find(v, 'fb-ch').props.children, 'D');
  assert.strictEqual(find(v, 'fb-mean').props.children, 'day');
});

test('feedback rows are not shown in exam mode, even from a registered plugin', () => {
  const { E, shared } = loadStimulus();
  let calls = 0;
  E.registerFeedbackRows(() => { calls++; return [{ ch: 'D', meaning: 'day' }]; });
  assert.strictEqual(shared.fbRows(P, S, true), null);
  assert.strictEqual(calls, 0);
  assert.ok(find(shared.fbRows(P, S, false), 'fb-rows'));
});
