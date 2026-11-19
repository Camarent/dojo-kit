'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { mount, find, text } = require('./app-harness.js');

const ROOT = path.join(__dirname, '..', '..');
const STEPS = ['no-claude', 'no-use', 'db-null', 'user-null', 'no-uid', 'open-error', 'refused', 'write-too-large', 'write-error', 'ok'];

async function settingsWith(reason, opts) {
  const items = [{ id: 'u1-1', unit: 'u1', type: 'gap', prompt: 'Q', answers: ['a'], explanation: 'e' }];
  const m = await mount(Object.assign({ items }, opts));
  m.app.setSyncReason(reason);
  m.app.go('settings');
  return { m, scr: m.screen(m.sb.DojoApp._SettingsScreen) };
}

const chipTitle = (scr) => find(scr.view(), 'status-chip').props.title;

// C2: ru dictionary, detail is shown in parentheses in the line and in the chip title
test('C2: ru reason with detail renders the line and the chip title', async () => {
  const { m, scr } = await settingsWith({ step: 'write-too-large', detail: '183 KB, doc 118 KB' }, { lang: 'ru' });
  // ru text comes from the dictionary: the test file itself stays free of Cyrillic (tests/core-latin.test.js)
  const expected = m.t('about.status') + ': ' + m.t('sync.step.write-too-large') + ' (183 KB, doc 118 KB)';
  assert.strictEqual(text(find(scr.view(), 'sync-reason')), expected);
  assert.strictEqual(chipTitle(scr), expected);
});

// C3: empty detail gives no parentheses
test('C3: empty detail renders no parentheses', async () => {
  const { scr } = await settingsWith({ step: 'ok', detail: '' });
  const line = text(find(scr.view(), 'sync-reason'));
  assert.ok(!line.includes('('), line);
  assert.ok(line.endsWith(': working'), line);
});

// C3: null reason renders no line and keeps the default chip tip
test('C3: null reason renders no sync-reason line and default chip tip', async () => {
  const { m, scr } = await settingsWith(null);
  assert.strictEqual(find(scr.view(), 'sync-reason'), null);
  assert.strictEqual(chipTitle(scr), m.t('status.ok.tip'));
});

// C4: every step renders a real dictionary text, no raw key and no 'undefined'
for (const step of STEPS) {
  test(`C4: step ${step} renders a resolved line`, async () => {
    const { scr } = await settingsWith({ step: step, detail: 'd' });
    const line = text(find(scr.view(), 'sync-reason'));
    assert.ok(!line.includes('sync.step.'), line);
    assert.ok(!line.includes('undefined'), line);
  });
}

// Dictionary keys used by the helper exist in both languages
test('C4: every sync.step key exists in en and ru', () => {
  for (const lang of ['en', 'ru']) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'i18n', lang + '.json'), 'utf8'));
    for (const step of STEPS) assert.ok(dict['sync.step.' + step], lang + ' ' + step);
  }
});
