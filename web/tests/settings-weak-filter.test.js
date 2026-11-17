'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const KEY = 'session:weakFilter';
const TOPICS = { units: ['a'], aspects: [{ id: 'meaning', tags: ['m'] }, { id: 'form', tags: ['f'] }] };
let dojoP;

function gap(id, entity, tag) { return { id, unit: 'a', type: 'gap', prompt: id, answers: ['x'], entity, tags: [tag] }; }

// 2 topics (T1, T2) x 2 aspects (meaning, form); every item is weak.
async function setup(filter) {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const its = [gap('t1m', 'T1', 'm'), gap('t1f', 'T1', 'f'), gap('t2m', 'T2', 'm'), gap('t2f', 'T2', 'f')];
  const items = {};
  its.forEach((i) => { items[i.id] = { s: 0, due: NOW - 1000, ok: 0, bad: 2, last: NOW - 5000 }; });
  const settings = filter === undefined ? {} : { [KEY]: filter };
  const doc = { v: 1, t: 0, items, stats: { days: {}, newByDay: {} }, settings, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const course = { id: 'c', title: 'C', units: [{ id: 'a', title: 'A' }], topics: TOPICS };
  const content = { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course };
  const engine = DojoSession.createEngine({ dojo: await dojoP, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  return engine;
}

async function weak(filter) {
  const engine = await setup(filter);
  return engine.weakList(10).map((r) => r.id).sort();
}

test('no filter: all weak units', async () => {
  assert.deepStrictEqual(await weak(undefined), ['t1f', 't1m', 't2f', 't2m']);
});

test('topic only', async () => {
  assert.deepStrictEqual(await weak({ topic: 'T1' }), ['t1f', 't1m']);
});

test('aspect only', async () => {
  assert.deepStrictEqual(await weak({ aspect: 'form' }), ['t1f', 't2f']);
});

test('topic and aspect', async () => {
  assert.deepStrictEqual(await weak({ topic: 'T2', aspect: 'meaning' }), ['t2m']);
});

test('invalid stored value behaves as no filter', async () => {
  assert.deepStrictEqual(await weak({ topic: 5 }), ['t1f', 't1m', 't2f', 't2m']);
  assert.deepStrictEqual(await weak('x'), ['t1f', 't1m', 't2f', 't2m']);
});

test('weakFilterOptions lists topics and aspects of the course', async () => {
  const engine = await setup(undefined);
  const o = engine.weakFilterOptions();
  assert.deepStrictEqual(o.topics, ['T1', 'T2']);
  assert.deepStrictEqual(o.aspects.map((a) => a.id), ['meaning', 'form']);
});

test('settings pickers store session:weakFilter and clear it', async () => {
  const H = require('./settings-ui-helpers.js');
  const { loadBundle } = require('./load-bundle.js');
  const content = H.mkContent([{ id: 'a', title: 'A' }]);
  content.course.topics = TOPICS;
  const env = await H.setup(content, {});
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/input-script.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog-detail.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-boundary.js', 'ui/session-panels.js', 'ui/session-screen.js', 'ui/session-finish.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-timer.js', 'ui/settings-topics.js', 'ui/settings-sections.js', 'ui/settings-plugin.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app-screens.js', 'ui/app.js'] });
  const i = H.renderSettings({ sb, engine: env.engine, content, doc: env.doc, t: (k) => H.mkI18n().en[k] || k });
  const tr = i.render(i.props, i.state || {});
  H.find(tr, 'weak-filter-aspect').props.onChange({ target: { value: 'form' } });
  assert.strictEqual(JSON.stringify(env.doc.settings[KEY]), JSON.stringify({ topic: '', aspect: 'form' }));
  H.find(i.render(i.props, i.state || {}), 'weak-filter-aspect').props.onChange({ target: { value: '' } });
  assert.strictEqual(env.doc.settings[KEY], null);
});
