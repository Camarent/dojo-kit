'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
// Keys read only by course plugins (ctx.t); listed in the reference so courses can translate them.
const PLUGIN_KEYS = new Set([]);
const PLURAL = /\.(one|few|many|other)$/;

function sources() {
  const files = [];
  ['ui', 'types', '.'].forEach((d) => {
    const dir = path.join(web, d);
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => files.push(path.join(dir, f)));
  });
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

// Literals referenced in code; a literal ending with '.' (or cut by ${) is a dynamic prefix.
function referenced(src) {
  const exact = new Set();
  const prefixes = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*?)(\1\s*\+|\1|\$\{)/g;
  let m;
  while ((m = re.exec(src))) {
    exact.add(m[2]);
    if (m[2].endsWith('.') || m[3] === '${' || m[3].endsWith('+')) prefixes.push(m[2]);
  }
  return { exact, prefixes };
}

function unusedKeys(dict, src) {
  const { exact, prefixes } = referenced(src);
  return Object.keys(dict).filter((k) => {
    const base = k.replace(PLURAL, '');
    if (PLUGIN_KEYS.has(k) || exact.has(k) || exact.has(base)) return false;
    return !prefixes.some((p) => p && k.startsWith(p));
  });
}

['en', 'ru'].forEach((lang) => {
  test('every ' + lang + '.json key is referenced in web code', () => {
    const dict = JSON.parse(fs.readFileSync(path.join(web, 'i18n', lang + '.json'), 'utf8'));
    assert.deepStrictEqual(unusedKeys(dict, sources()), []);
  });
});

test('guard detects an unused key (mutation)', () => {
  const src = "t('a.b'); t('dyn.' + x);";
  assert.deepStrictEqual(unusedKeys({ 'a.b': 1, 'dyn.x': 1, 'zz.unused': 1 }, src), ['zz.unused']);
});
