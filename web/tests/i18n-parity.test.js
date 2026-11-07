'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, '..', 'i18n');
const PACKS = 'packs.json';
const PLURAL = /^(.*)\.(one|few|many|other)$/;
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(i18nDir, f), 'utf8'));
const bases = (dict) => [...new Set(Object.keys(dict).map((k) => { const m = PLURAL.exec(k); return m ? m[1] : k; }))].sort();
const dicts = fs.readdirSync(i18nDir).filter((f) => f.endsWith('.json') && f !== PACKS).sort();
const en = readJson('en.json');

test('every web/i18n dictionary has the en.json keys (plural families folded)', () => {
  const packLangs = Object.keys(readJson(PACKS));
  ['fr', 'ru', 'ja'].forEach((lang) => {
    assert.ok(packLangs.includes(lang) && dicts.includes(lang + '.json'), 'pack ' + lang + ' missing from packs.json or dictionaries: ' + dicts.join(','));
  });
  const want = bases(en);
  dicts.forEach((f) => {
    const got = bases(readJson(f));
    assert.deepStrictEqual({ file: f, missing: want.filter((k) => !got.includes(k)), extra: got.filter((k) => !want.includes(k)) },
      { file: f, missing: [], extra: [] });
  });
});

test('no empty values in any dictionary', () => {
  dicts.forEach((f) => {
    const d = readJson(f);
    Object.keys(d).forEach((k) => assert.ok(typeof d[k] === 'string' && d[k].trim() !== '', f + ' ' + k));
  });
});

test('packs.json names only existing dictionaries', () => {
  const packs = readJson(PACKS);
  Object.keys(packs).forEach((lang) => {
    assert.ok(dicts.includes(lang + '.json'), 'pack ' + lang + ' has no dictionary');
    packs[lang].modules.forEach((m) => assert.ok(dicts.includes(m + '.json'), lang + ' -> ' + m));
  });
});
