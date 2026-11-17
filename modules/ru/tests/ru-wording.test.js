'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { appHarness: H, en, ru } = require('./harness.js');

const NOW = H.NOW;
const DAY = 24 * 60 * 60 * 1000;
const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

test('new wording strings are present', () => {
  assert.strictEqual(ru['session.expected'], 'Правильно:');
  assert.strictEqual(ru['settings.theme'], 'Оформление');
  assert.strictEqual(en['session.expected'], 'Correct:');
});

test('ru speech.novoice quotes the language name instead of inflecting it', () => {
  assert.strictEqual(
    ru['speech.novoice'],
    'Для языка «{lang}» на этом устройстве нет голоса. Установите его в системных настройках речи.',
  );
});

test('ru session.override uses the "count as correct" label', () => {
  assert.strictEqual(ru['session.override'], 'Засчитать (опечатка)');
});

test('ru audio.replays plural forms all read "Повторов осталось: {n}"', () => {
  ['one', 'few', 'many'].forEach((form) => {
    assert.strictEqual(ru['audio.replays.' + form], 'Повторов осталось: {n}', form);
  });
});

test('russian counter is plural-aware and has the noreplay text', () => {
  const t = H.loadApp().DojoApp._makeT({ en, ru }, 'ru');
  assert.strictEqual(t('audio.replays', { n: 1 }), 'Повторов осталось: 1');
  assert.strictEqual(t('audio.replays', { n: 2 }), 'Повторов осталось: 2');
  assert.strictEqual(t('audio.replays', { n: 0 }), 'Повторов осталось: 0');
  assert.strictEqual(t('audio.noreplay'), 'Повторов больше нет');
});

test('catalog card shows no detail-due row even when due is in the future', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { s: 1, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW - DAY };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.ok(H.find(v, 'catalog-detail'), 'positive control: card is open');
  assert.strictEqual(H.find(v, 'detail-due'), null, 'due is an internal field, not shown on the card');
});
