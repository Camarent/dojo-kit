'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pluralForm } = require('../ui/i18n.js');

// Russian forms as the removed hand-written branch computed them (names in Latin).
function oldRuForm(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

test('Intl.PluralRules gives the old ru forms for every integer 0..1000', () => {
  for (let n = 0; n <= 1000; n++) {
    assert.strictEqual(pluralForm('ru', n), oldRuForm(n), 'n=' + n);
  }
});

test('en keeps one for 1 and other otherwise', () => {
  assert.strictEqual(pluralForm('en', 1), 'one');
  assert.strictEqual(pluralForm('en', 0), 'other');
  assert.strictEqual(pluralForm('en', 2), 'other');
});

test('ru branch is gone from ui/i18n.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'i18n.js'), 'utf8');
  assert.ok(!src.includes("'ru'"), 'ui/i18n.js still names ru');
});

test('this file has no Cyrillic (form names stay Latin)', () => {
  const src = fs.readFileSync(__filename, 'utf8');
  const cyrillic = [...src].filter((c) => c.charCodeAt(0) >= 0x0400 && c.charCodeAt(0) <= 0x04ff);
  assert.deepStrictEqual(cyrillic, []);
});
