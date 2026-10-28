'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sp = require('../speech.js');

function mk(voices, over) {
  const handlers = {};
  const timers = [];
  const win = {
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    handlers, timers, spoken: []
  };
  win.speechSynthesis = Object.assign({
    getVoices: () => voices,
    speak: (u) => win.spoken.push(u),
    cancel() {},
    addEventListener: (n, f) => { handlers[n] = f; }
  }, over || {});
  return win;
}

test('status: empty voices ok until voiceschanged then no_voice', () => {
  const w = mk([]);
  assert.strictEqual(sp.status({}, w), 'ok');
  w.handlers.voiceschanged();
  assert.strictEqual(sp.status({}, w), 'no_voice');
  assert.strictEqual(sp.status({}, {}), 'unavailable');
});

test('status: addEventListener that throws is ignored; getVoices throwing = empty', () => {
  const w = mk([], { addEventListener() { throw new Error('x'); }, getVoices() { throw new Error('y'); } });
  assert.strictEqual(sp.status({}, w), 'ok');
  assert.strictEqual(sp.available(w), true);
  const w2 = mk([{ name: 'a', lang: 'en-US' }]);
  assert.strictEqual(sp.status({ lang: 'ja' }, w2), 'no_voice');
  assert.strictEqual(sp.status({ speech: { lang: 'en' } }, w2), 'ok');
});

test('lines: string, lines array, blank and bad input', () => {
  assert.deepStrictEqual(sp.lines({ speak: 'hi' }).map((l) => l.text), ['hi']);
  assert.deepStrictEqual(sp.lines({ speak: '  ' }), []);
  assert.deepStrictEqual(sp.lines({ speak: { lines: [{ text: 'a', voice: 'v' }, { text: ' ' }, null, { text: 3 }] } }), [{ text: 'a', voice: 'v' }]);
  assert.deepStrictEqual(sp.lines(null), []);
  assert.deepStrictEqual(sp.lines({}), []);
});

test('play: unavailable, empty, no_voice', () => {
  assert.strictEqual(sp.play([{ text: 'a' }], {}, {}, {}).reason, 'unavailable');
  assert.strictEqual(sp.play([], {}, {}, mk([])).reason, 'empty');
  assert.strictEqual(sp.play(null, {}, {}, mk([])).reason, 'empty');
  assert.strictEqual(sp.play([{ text: 'a' }], { lang: 'ja' }, null, mk([{ name: 'a', lang: 'en' }])).reason, 'no_voice');
});

test('play: options, end callback, error callback, cancel errors ignored', () => {
  const w = mk([{ name: 'Kyoko', lang: 'ja-JP' }]);
  const ev = [];
  const cfg = { lang: 'ja', pitch: 5, speech: { rate: 1.2, voices: { f: { name: 'Kyoko', pitch: 1, rate: 0.9 } } } };
  const r = sp.play([{ text: 'a', voice: 'f' }, { text: 'b' }], cfg, { onEnd: () => ev.push('end'), onError: (e) => ev.push(e.error) }, w);
  assert.ok(r.ok);
  const [u1, u2] = w.spoken;
  assert.strictEqual(u1.pitch, 1);
  assert.strictEqual(u1.rate, 0.9);
  assert.strictEqual(u2.pitch, 2);
  assert.strictEqual(u2.rate, 1.2);
  u1.onstart();
  u2.onend();
  assert.deepStrictEqual(ev, ['end']);
  // error path
  const w2 = mk([{ name: 'K', lang: 'ja' }]);
  const ev2 = [];
  sp.play([{ text: 'a' }], { lang: 'ja' }, { onError: (e) => ev2.push(e.error) }, w2);
  w2.spoken[0].onerror({ error: 'canceled' });
  w2.spoken[0].onerror({ error: 'boom' });
  assert.deepStrictEqual(ev2, ['boom']);
  // no cb at all
  const w3 = mk([{ name: 'K', lang: 'ja' }]);
  sp.play([{ text: 'a' }], { lang: 'ja' }, undefined, w3);
  w3.spoken[0].onend();
  w3.spoken[0].onerror({ error: 'x' });
});

test('play: watchdog fires no-start; stale/started watchdog silent; speak throwing', () => {
  const w = mk([{ name: 'K', lang: 'ja' }]);
  const ev = [];
  sp.play([{ text: 'a' }], { lang: 'ja' }, { onError: (e) => ev.push(e.error) }, w);
  w.timers[0]();
  assert.deepStrictEqual(ev, ['no-start']);
  const w2 = mk([{ name: 'K', lang: 'ja' }]);
  sp.play([{ text: 'a' }], { lang: 'ja' }, { onError: (e) => ev.push('bad') }, w2);
  w2.spoken[0].onstart();
  w2.timers[0]();
  assert.deepStrictEqual(ev, ['no-start']);
  const w3 = mk([{ name: 'K', lang: 'ja' }], { speak() { throw new Error('s'); } });
  assert.strictEqual(sp.play([{ text: 'a' }], {}, {}, w3).reason, 'unavailable');
  const w4 = mk([{ name: 'K', lang: 'ja' }]);
  sp.play([{ text: 'a' }], {}, {}, w4);
  sp.stop(w4);
  w4.timers[0]();
  sp.stop({});
  sp.stop(mk([], { cancel() { throw new Error('x'); } }));
});
