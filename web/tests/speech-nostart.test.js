'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function fakeWin(voices, opts) {
  const spoken = [];
  const win = { spoken, cancels: 0 };
  win.SpeechSynthesisUtterance = function (text) { this.text = text; };
  if (!(opts && opts.noApi)) {
    win.speechSynthesis = {
      getVoices: () => voices,
      speak: (u) => spoken.push(u),
      cancel() { win.cancels++; spoken.length = 0; }
    };
  }
  return win;
}
const J = (x) => JSON.parse(JSON.stringify(x));
const V = (name, lang) => ({ name, lang });

function load() {
  const sb = { console };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  ['speech.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  return sb;
}

// Helper to create a win with speech synthesis that can fire events
function fakeWinWithEvents(voices, opts) {
  const spoken = [];
  const listeners = {};
  const win = { spoken, cancels: 0, listeners };
  win.SpeechSynthesisUtterance = function (text) { 
    this.text = text;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  };
  win.setTimeout = function (fn, delay) {
    return setTimeout(fn, delay);
  };
  win.clearTimeout = function (id) {
    clearTimeout(id);
  };
  
  if (!(opts && opts.noApi)) {
    const ss = {
      getVoices: () => voices,
      speak: function(u) { spoken.push(u); return u; },
      cancel() { win.cancels++; spoken.length = 0; },
      addEventListener: function(name, fn) {
        (listeners[name] = listeners[name] || []).push(fn);
      }
    };
    win.speechSynthesis = ss;
  }
  return win;
}

test('Empty voices + voiceschanged fired -> status no_voice', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([]);
  const cfg = { lang: 'ja' };
  assert.strictEqual(S.status(cfg, win), 'ok');
  const listeners = win.listeners['voiceschanged'] || [];
  listeners.forEach((fn) => fn());
  assert.strictEqual(S.status(cfg, win), 'no_voice');
});

test('Empty voices + voiceschanged not fired -> status ok', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([]);
  const cfg = { lang: 'ja' };
  assert.strictEqual(S.status(cfg, win), 'ok');
});

test('Start never fires -> onError called exactly once; timer cleared', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([V('Kyoko', 'ja-JP')]);
  let errorCalled = 0;
  const cfg = { lang: 'ja' };
  const lines = [{ text: 'test' }];
  
  S.play(lines, cfg, { onError: () => { errorCalled++; } }, win);
  
  assert.strictEqual(win.spoken.length, 1, 'utterance should be queued');
  
  // Fast-forward time by 3 seconds to trigger watchdog
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(errorCalled, 1, 'onError should be called once');
      resolve();
    }, 3000);
  });
});

test('Start fires -> no error', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([V('Kyoko', 'ja-JP')]);
  let errorCalled = 0;
  let endCalled = 0;
  const cfg = { lang: 'ja' };
  const lines = [{ text: 'test' }];
  
  S.play(lines, cfg, { 
    onError: () => { errorCalled++; },
    onEnd: () => { endCalled++; }
  }, win);
  
  assert.strictEqual(win.spoken.length, 1);
  const u = win.spoken[0];
  
  // Fire start event
  if (u.onstart) u.onstart();
  
  // Fire end event
  if (u.onend) u.onend();
  
  assert.strictEqual(errorCalled, 0, 'onError should not be called');
  assert.strictEqual(endCalled, 1, 'onEnd should be called');
});

test('Voices arrive late (after voiceschanged) -> status ok', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([V('Kyoko', 'ja-JP')]);
  const cfg = { lang: 'ja' };
  assert.strictEqual(S.status(cfg, win), 'ok');
});

test('Empty voices with no speech synthesis -> unavailable', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWin([], { noApi: true });
  const cfg = { lang: 'ja' };
  assert.strictEqual(S.status(cfg, win), 'unavailable');
});

test('Watchdog timer is cleared on start event', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([V('Kyoko', 'ja-JP')]);
  let errorCalled = 0;
  const cfg = { lang: 'ja' };
  const lines = [{ text: 'test' }];
  
  S.play(lines, cfg, { onError: () => { errorCalled++; } }, win);
  
  const u = win.spoken[0];
  
  // Fire start event immediately
  if (u.onstart) u.onstart();
  
  // Wait to see if error is not called
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(errorCalled, 0, 'onError should not be called when start fires');
      resolve();
    }, 3000);
  });
});

test('Watchdog timer is cleared on error event', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([V('Kyoko', 'ja-JP')]);
  let errorCalled = 0;
  const cfg = { lang: 'ja' };
  const lines = [{ text: 'test' }];
  
  S.play(lines, cfg, { onError: () => { errorCalled++; } }, win);
  
  const u = win.spoken[0];
  
  // Fire error event immediately
  if (u.onerror) u.onerror({ error: 'some-error' });
  
  // Wait to see if error is only called once
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(errorCalled, 1, 'onError should be called once for the utterance error');
      resolve();
    }, 3000);
  });
});

test('status() called twice registers one listener', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([]);
  const cfg = { lang: 'ja' };
  S.status(cfg, win);
  const count1 = (win.listeners['voiceschanged'] || []).length;
  S.status(cfg, win);
  const count2 = (win.listeners['voiceschanged'] || []).length;
  assert.strictEqual(count1, 1, 'should have one listener after first call');
  assert.strictEqual(count2, 1, 'should still have one listener after second call');
});

test('Two different fake windows do not share the flag', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win1 = fakeWinWithEvents([]);
  const win2 = fakeWinWithEvents([]);
  const cfg = { lang: 'ja' };
  
  assert.strictEqual(S.status(cfg, win1), 'ok');
  assert.strictEqual(S.status(cfg, win2), 'ok');
  
  // Fire voiceschanged on win1
  const listeners1 = win1.listeners['voiceschanged'] || [];
  listeners1.forEach((fn) => fn());
  
  // win1 should now be no_voice
  assert.strictEqual(S.status(cfg, win1), 'no_voice');
  // win2 should still be ok
  assert.strictEqual(S.status(cfg, win2), 'ok');
});

test('A synth that never fires the event keeps ok', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([]);
  const cfg = { lang: 'ja' };
  
  // Call status multiple times without firing the event
  assert.strictEqual(S.status(cfg, win), 'ok');
  assert.strictEqual(S.status(cfg, win), 'ok');
  assert.strictEqual(S.status(cfg, win), 'ok');
});

test('available() also registers the listener', () => {
  const sb = load();
  const S = sb.DojoSpeech;
  const win = fakeWinWithEvents([]);
  
  assert.strictEqual(S.available(win), true);
  const count = (win.listeners['voiceschanged'] || []).length;
  assert.strictEqual(count, 1, 'available should register a listener');
});
