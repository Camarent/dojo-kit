'use strict';
// Feedback 'accepted' line (Also accepted) renders each accepted answer through DojoExt.textAll: marked kanji become ruby, no raw markup.
// Japanese text is built from code points: core-latin test forbids raw Han/kana in source.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const jp = (...cps) => String.fromCodePoint(...cps);
const NANA = jp(0x4e03);
const SHI = jp(0x3057, 0x3061);
const MARKED = '{' + NANA + '|' + SHI + '}';

// Test double for the ruby markup: '{base|reading}' -> <ruby>base<rt>reading</rt></ruby>.
const fakeRuby = {
  render(str, h) {
    const out = [];
    let last = 0;
    const re = /\{([^|{}]+)\|([^|{}]+)\}/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) out.push(str.slice(last, m.index));
      out.push(h('ruby', null, m[1], h('rt', null, m[2])));
      last = m.index + m[0].length;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  },
  plain(str) { return str.replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '$1'); },
};

async function extraOf(accepted) {
  const item = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'Prompt', answers: accepted.slice() };
  const m = await H.mount({ items: [item] });
  m.sb.DojoExt.registerMarkup('ruby', fakeRuby);
  m.sb.DojoExt.use('ruby');
  const def = m.sb.DojoTypes.get('gap');
  return H.expand(def.Extra({ result: { accepted }, t: (k) => k }));
}

function rubies(n) { let c = 0; H.walk(n, (x) => { if (x.type === 'ruby') c += 1; }); return c; }

test('accepted ruby: marked kanji in an accepted answer render as ruby, no raw markup', async () => {
  const tree = await extraOf([MARKED, SHI]);
  const el = H.find(tree, 'accepted');
  assert.ok(el, 'accepted line exists');
  assert.strictEqual(rubies(el), 1, 'one ruby node for the one marked kanji');
  const txt = H.text(el);
  assert.ok(!/[{}|]/.test(txt), 'no braces or bar in the text');
  assert.ok(txt.includes(' / '), 'answers joined with " / "');
});

test('accepted plain: a plain-text accepted list has no ruby and keeps its text', async () => {
  const tree = await extraOf([SHI, jp(0x3057, 0x3061, 0x3087)]);
  const el = H.find(tree, 'accepted');
  assert.ok(el, 'accepted line exists');
  assert.strictEqual(rubies(el), 0, 'no ruby for plain answers');
  assert.strictEqual(H.text(el), 'session.accepted: ' + SHI + ' / ' + jp(0x3057, 0x3061, 0x3087));
});
