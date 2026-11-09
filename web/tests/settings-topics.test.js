'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./settings-ui-helpers.js');
const { loadBundle } = require('./load-bundle.js');

const KEY = 'topics:sessionCap';

function app() {
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/input-script.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-boundary.js', 'ui/session-panels.js', 'ui/session-screen.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-timer.js', 'ui/settings-topics.js', 'ui/settings-sections.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app-screens.js', 'ui/app.js'] });
  return sb;
}

// Renders the Settings screen; with `topics` the course gets a topics block (sessionCap as given).
async function screen(topics) {
  const content = H.mkContent([{ id: 'u1', title: 'U1' }]);
  if (topics) content.course.topics = topics;
  const env = await H.setup(content, {});
  const sb = app();
  const i = H.renderSettings({ sb, engine: env.engine, content, doc: env.doc, t: (k) => H.mkI18n().en[k] || k });
  return { tr: i.render(i.props, i.state || {}), doc: env.doc };
}

// Fires the input's onChange with a raw string value, as the browser does.
function typeValue(tr, value) {
  H.find(tr, 'topics-cap').props.onChange({ target: { value: value } });
}

test('hidden without course.topics', async () => {
  const { tr } = await screen(null);
  assert.strictEqual(H.find(tr, 'topics-settings'), null);
});

test('shows the course default when no setting is stored', async () => {
  const { tr } = await screen({ sessionCap: 20 });
  const input = H.find(tr, 'topics-cap');
  assert.ok(input);
  assert.strictEqual(input.props.value, 20);
  assert.strictEqual(input.props.placeholder, '20');
});

test('saving 15 stores the number 15', async () => {
  const { tr, doc } = await screen({ sessionCap: 20 });
  typeValue(tr, '15');
  assert.strictEqual(doc.settings[KEY], 15);
});

test('saving 0 stores 0 (no limit)', async () => {
  const { tr, doc } = await screen({ sessionCap: 20 });
  typeValue(tr, '0');
  assert.strictEqual(doc.settings[KEY], 0);
});

test('reset stores null (tombstone = course default)', async () => {
  const { tr, doc } = await screen({ sessionCap: 20 });
  typeValue(tr, '15');
  H.find(tr, 'topics-cap-reset').props.onClick();
  assert.strictEqual(doc.settings[KEY], null);
});

test('invalid -3 is rejected and stores nothing', async () => {
  const { tr, doc } = await screen({ sessionCap: 20 });
  typeValue(tr, '-3');
  assert.ok(!doc.settings || !(KEY in doc.settings));
});

test('non-integer and empty input store nothing', async () => {
  const { tr, doc } = await screen({ sessionCap: 20 });
  typeValue(tr, '2.5');
  typeValue(tr, '');
  assert.ok(!doc.settings || !(KEY in doc.settings));
});

test('i18n keys exist in every locale', () => {
  const dicts = ['en', 'ru', 'ja', 'fr'].map((l) => require('../i18n/' + l + '.json'));
  for (const k of ['settings.topics.cap', 'settings.topics.hint', 'settings.topics.default']) {
    for (const d of dicts) assert.ok(typeof d[k] === 'string' && d[k].length > 0, k);
  }
});
