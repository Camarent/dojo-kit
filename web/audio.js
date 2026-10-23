/*
 * audio.js — DojoAudio: clip playback from audio packs. Global DojoAudio (UMD). Never throws into the UI.
 *   configure({ base, override, manifest, win, fetch })  base = override > base > 'data/audio/' (trailing '/' added); manifest = object, or null to fetch <base>manifest.json on first use
 *   ready()                  true after configure
 *   pick(stimulusId, ids, random) -> id   random() in [0,1); never the id picked last for that stimulus when ids.length > 1
 *   play(clipId) -> Promise<{ms}>         resolves at playback end, rejects on any failure; each pack is fetched and decoded to bytes once
 *   stop()                   stops the clip being played; its promise resolves
 *   unlock()                 resumes the AudioContext (call from a user tap)
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoAudio = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DEFAULT_BASE = 'data/audio/';
  var st = null;
  var last = {};

  function configure(o) {
    o = o || {};
    var base = o.override || o.base || DEFAULT_BASE;
    if (base.charAt(base.length - 1) !== '/') base += '/';
    st = { base: base, manifest: o.manifest || null, mp: null, packs: {}, win: o.win || root, fetch: o.fetch || null, ctx: null, stopFn: null };
    last = {};
  }

  function ready() { return !!st; }

  function pick(sid, ids, random) {
    var pool = ids.filter(function (id) { return id !== last[sid]; });
    if (!pool.length) pool = ids;
    var r = random();
    var id = pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
    last[sid] = id;
    return id;
  }

  function get(url) {
    var f = st.fetch || st.win.fetch.bind(st.win);
    return f(url).then(function (res) {
      if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
      return res;
    });
  }

  function manifest() {
    if (st.manifest) return Promise.resolve(st.manifest);
    if (!st.mp) st.mp = get(st.base + 'manifest.json').then(function (r) { return r.json(); });
    return st.mp;
  }

  function b64bytes(text) {
    var bin = (st.win.atob || root.atob || globalThis.atob).call(null, text.replace(/\s+/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadPack(m, idx) {
    var pack = m.packs[idx];
    if (!pack) return Promise.reject(new Error('audio: no pack ' + idx));
    if (!st.packs[idx]) {
      st.packs[idx] = get(st.base + pack.file).then(function (res) {
        if (pack.enc === 'base64') return res.text().then(b64bytes);
        return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
      });
      st.packs[idx].catch(function () { delete st.packs[idx]; });
    }
    return st.packs[idx];
  }

  function context() {
    var W = st.win;
    var C = W.AudioContext || W.webkitAudioContext;
    if (!C) return null;
    if (!st.ctx) st.ctx = new C();
    return st.ctx;
  }

  function viaContext(ctx, bytes, ms) {
    return new Promise(function (resolve, reject) {
      var copy = bytes.slice().buffer;
      var done = function (buf) {
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.onended = function () { st.stopFn = null; resolve({ ms: ms }); };
        st.stopFn = function () { try { src.stop(); } catch (e) { /* ignore */ } };
        src.start(0);
      };
      var p = ctx.decodeAudioData(copy, done, reject);
      if (p && typeof p.then === 'function') p.then(done, reject);
    });
  }

  function viaElement(bytes, clip) {
    var W = st.win;
    return new Promise(function (resolve, reject) {
      var url = W.URL.createObjectURL(new W.Blob([bytes], { type: clip.mime }));
      var a = new W.Audio(url);
      var fin = function (fn, v) { st.stopFn = null; W.URL.revokeObjectURL(url); fn(v); };
      a.onended = function () { fin(resolve, { ms: clip.ms }); };
      a.onerror = function () { fin(reject, new Error('audio: playback failed')); };
      st.stopFn = function () { a.pause(); fin(resolve, { ms: clip.ms }); };
      Promise.resolve(a.play()).catch(function (e) { fin(reject, e); });
    });
  }

  function play(clipId) {
    if (!st) return Promise.reject(new Error('audio: not configured'));
    return manifest().then(function (m) {
      var clip = m.clips && m.clips[clipId];
      if (!clip) throw new Error('audio: unknown clip ' + clipId);
      return loadPack(m, clip.pack).then(function (bytes) {
        var part = bytes.slice(clip.off, clip.off + clip.len);
        var ctx = context();
        if (!ctx) return viaElement(part, clip);
        return viaContext(ctx, part, clip.ms).catch(function () { return viaElement(part, clip); });
      });
    });
  }

  function stop() { if (st && st.stopFn) st.stopFn(); }

  function unlock() {
    try {
      var ctx = st && context();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* ignore */ }
  }

  return { configure: configure, ready: ready, pick: pick, play: play, stop: stop, unlock: unlock };
});
