'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./settings-ui-helpers.js');
const { loadBundle } = require('./load-bundle.js');

function app() {
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-screen.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-timer.js', 'ui/settings-sections.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app.js'] });
  return sb;
}

async function tree() {
  const content = H.mkContent([{ id: 'u1', title: 'U1' }]);
  content.course.timer = { baseMs: 8000 };
  const env = await H.setup(content, {});
  const sb = app();
  const i = H.renderSettings(sb, env.engine, content, env.doc, null, (k) => H.mkI18n().en[k] || k);
  return i.render(i.props, i.state || {});
}

const order = (n, out = []) => {
  if (Array.isArray(n)) n.forEach((c) => order(c, out));
  else if (n && n.props) { if (n.props['data-testid']) out.push(n.props['data-testid']); order(n.props.children, out); }
  return out;
};

test('timer section precedes export section', async () => {
  const ids = order(await tree());
  const ti = ids.indexOf('timer-settings');
  assert.ok(ti >= 0);
  assert.ok(ti < ids.findIndex((x) => /export/.test(x)));
});

test('value text carries unit; min/max labels present', async () => {
  const tr = await tree();
  assert.strictEqual(H.allText(H.find(tr, 'timer-base-value')).join(''), '8 s');
  assert.ok(H.find(tr, 'timer-min') && H.find(tr, 'timer-max'));
});

test('i18n keys exist in en and ru with {n}', () => {
  const { en, ru } = H.mkI18n();
  for (const k of ['settings.timer.unit', 'settings.timer.min', 'settings.timer.max']) {
    assert.ok(en[k] && ru[k] && en[k].includes('{n}') && ru[k].includes('{n}'), k);
  }
});
