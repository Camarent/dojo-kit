'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const en = JSON.parse(read('i18n/en.json'));
const ru = JSON.parse(read('i18n/ru.json'));
const FORMS = { en: ['one', 'other'], ru: ['one', 'few', 'many'] };
const PLURAL = /^(.*)\.(one|few|many|other)$/;

function bases(dict) {
  const out = {};
  Object.keys(dict).forEach((k) => {
    const m = PLURAL.exec(k);
    const base = m ? m[1] : k;
    (out[base] = out[base] || { forms: [], plural: !!m });
    if (m) out[base].forms.push(m[2]);
  });
  return out;
}

test('en and ru have identical keys (plural forms folded)', () => {
  assert.deepStrictEqual(Object.keys(bases(en)).sort(), Object.keys(bases(ru)).sort());
});

test('no empty values', () => {
  [en, ru].forEach((d) => Object.keys(d).forEach((k) => assert.ok(typeof d[k] === 'string' && d[k].trim() !== '', k)));
});

test('plural keys carry the forms each language needs', () => {
  [['en', en], ['ru', ru]].forEach(([lang, dict]) => {
    const b = bases(dict);
    Object.keys(b).filter((k) => b[k].plural).forEach((k) => {
      assert.deepStrictEqual(b[k].forms.slice().sort(), FORMS[lang].slice().sort(), lang + ':' + k);
    });
  });
  const pe = bases(en);
  const pr = bases(ru);
  Object.keys(pe).forEach((k) => assert.strictEqual(pe[k].plural, pr[k].plural, 'plural mismatch ' + k));
});

test('every placeholder in en appears in ru for the same key', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) || []);
  const fold = (d) => { const o = {}; Object.keys(d).forEach((k) => { const m = PLURAL.exec(k); (o[m ? m[1] : k] = o[m ? m[1] : k] || []).push(d[k]); }); return o; };
  const fe = fold(en);
  const fr = fold(ru);
  Object.keys(fe).forEach((k) => {
    const ruText = fr[k].join(' ');
    fe[k].join(' ').match(/\{\w+\}/g) && vars(fe[k].join(' ')).forEach((v) => assert.ok(ruText.includes(v), k + ' ' + v));
  });
});

test('ui sources avoid innerHTML, dangerouslySetInnerHTML, document.write and eval', () => {
  const files = ['boot.js'].concat(fs.readdirSync(path.join(web, 'ui')).filter((f) => f.endsWith('.js')).map((f) => 'ui/' + f));
  files.forEach((f) => {
    assert.ok(!/innerHTML|dangerouslySetInnerHTML|document\.write|\beval\s*\(|new Function/.test(read(f)), f);
  });
});

function loadApp() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/app.js']) });
  return sandbox.DojoApp;
}

test('t() tries full tag, primary subtag, then en, then the key', () => {
  const app = loadApp();
  const i18n = { en: { a: 'en-a', b: 'en-b', c: 'en-c' }, pt: { a: 'pt-a', b: 'pt-b' }, 'pt-BR': { a: 'br-a' } };
  const t = app._makeT(i18n, 'pt-BR');
  assert.strictEqual(t('a'), 'br-a');
  assert.strictEqual(t('b'), 'pt-b');
  assert.strictEqual(t('c'), 'en-c');
  assert.strictEqual(t('zzz'), 'zzz');
  assert.strictEqual(app._makeT({ en: { x: 'v {n}' }, pt: {} }, 'pt-BR')('x', { n: 3 }), 'v 3');
});

test('plural forms: ru one/few/many, en one/other', () => {
  const app = loadApp();
  const f = (l, n) => app._pluralForm(l, n);
  assert.deepStrictEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => f('ru', n)), ['one', 'few', 'many', 'many', 'many', 'one', 'few', 'many', 'many']);
  assert.deepStrictEqual([0, 1, 2].map((n) => f('en', n)), ['other', 'one', 'other']);
});

test('every i18n key referenced by t(...) in ui sources exists in en and ru', () => {
  const have = (d) => new Set(Object.keys(d).map((k) => { const m = PLURAL.exec(k); return m ? m[1] : k; }));
  const files = ['boot.js'].concat(fs.readdirSync(path.join(web, 'ui')).filter((f) => f.endsWith('.js')).map((f) => 'ui/' + f));
  const missing = [];
  files.forEach((f) => {
    const src = read(f);
    const re = /\bt\(\s*(['"])([A-Za-z0-9_.]+)\1(\s*\+)?/g;
    let m;
    while ((m = re.exec(src))) {
      const key = m[2];
      const prefix = !!m[3];
      [['en', en], ['ru', ru]].forEach(([lang, d]) => {
        const ks = have(d);
        const ok = prefix ? Array.from(ks).some((k) => k.startsWith(key)) : ks.has(key);
        if (!ok) missing.push(f + ' ' + lang + ' ' + key + (prefix ? '*' : ''));
      });
    }
  });
  assert.deepStrictEqual(missing, []);
});

test('new wording strings are present', () => {
  assert.strictEqual(ru['session.expected'], 'Правильно:');
  assert.strictEqual(ru['settings.theme'], 'Оформление');
  assert.strictEqual(en['session.expected'], 'Correct:');
});
