/*
 * audio.js — DojoAudio: clip playback from audio packs. Global DojoAudio (UMD). Never throws into the UI.
 *   configure({ base, override, manifest, win, fetch })  base = override > base > 'data/audio/' (trailing '/' added); manifest = object, or null to fetch <base>manifest.json on first use
 *   ready()                  true after configure
 *   pick(stimulusId, ids, random) -> id   random() in [0,1); never the id picked last for that stimulus when ids.length > 1
 *   play(clipId[, {onStart({ms})}]) -> Promise<{ms}>  resolves at playback end, rejects on any failure; each pack is fetched and decoded to bytes once.
 *                            ms = manifest ms, or the measured duration (decoded buffer / Audio.duration) when the manifest ms is 0 or missing; onStart gets it when playback begins
 *   mark() -> n              audio sequence number; call at item start
 *   bindHeard({get(id)->number|undefined, set(id)})  persists last-heard per clip; pick prefers never-heard, then oldest-heard (ties random); set fires once per pick when playback starts
 *   heardClip(stimulusId, since) -> id|null  id picked last for the stimulus whose playback started after mark() value `since`
 *   clipMeta(id) -> {text, tr, mt}|null  manifest clip fields (null before load / unknown id)
 *   duration(clipId) -> ms|null  last known duration of a clip (manifest or measured)
 *   status() -> {manifest, packs, ctx, decodeError, playError}  plain strings for the debug line
 *   preload() -> Promise      fetches manifest and all packs (errors recorded in status(), never thrown)
 *   stop()                   stops the clip being played; its promise resolves
 *   unlock()                 call from a user tap: creates/resumes the AudioContext, plays a silent buffer, primes an Audio element, starts preload()
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
  var plays = 0;
  var startedAt = {};

  function configure(o) {
    o = o || {};
    var base = o.override || o.base || DEFAULT_BASE;
    if (base.charAt(base.length - 1) !== '/') base += '/';
    st = { base: base, manifest: o.manifest || null, mp: null, packs: {}, win: o.win || root, fetch: o.fetch || null, ctx: null, el: null, stopFn: null, seq: 0, active: null, measured: {}, mdone: null, pdone: {}, info: { manifest: 'idle', packs: {}, decodeError: '', playError: '', step: 'idle', err: '', path: '' } };
    last = {}; plays = 0; startedAt = {}; picked = {};
  }

  function ready() { return !!st; }

  var heard = null, picked = {};
  function bindHeard(h) { heard = h || null; }
  function heardOf(id) { var v = heard && heard.get(id); return typeof v === 'number' ? v : -Infinity; }
  function noteStart(id) { startedAt[id] = ++plays; if (picked[id]) { delete picked[id]; if (heard) heard.set(id); } }

  function pick(sid, ids, random) {
    var pool = ids.filter(function (id) { return id !== last[sid]; });
    if (!pool.length) pool = ids;
    var oldest = Math.min.apply(null, pool.map(heardOf));
    pool = pool.filter(function (id) { return heardOf(id) === oldest; });
    var id = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    last[sid] = id; picked[id] = true;
    return id;
  }
  function errName(e) { return (e && (e.name || e.message)) || String(e); }
  function errFull(e) { return e && e.name ? e.name + (e.message ? ': ' + e.message : '') : String(e); }
  function step(n, e) { if (st) { st.info.step = n; if (e) st.info.err = errFull(e); } }
  var DECODE_TIMEOUT_MS = 3000;

  function get(url) {
    var f = st.fetch || st.win.fetch.bind(st.win);
    return f(url).then(function (res) {
      if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
      return res;
    });
  }

  function manifest() {
    if (st.manifest) return Promise.resolve(st.manifest);
    if (!st.mp) {
      st.info.manifest = 'loading';
      st.mp = get(st.base + 'manifest.json').then(function (r) { return r.json(); }).then(function (m) { st.info.manifest = 'ok'; st.mdone = m; return m; }, function (e) { st.info.manifest = 'error ' + errName(e); throw e; });
    }
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
      st.info.packs[idx] = 'loading';
      st.packs[idx] = get(st.base + pack.file).then(function (res) {
        if (pack.enc === 'base64') return res.text().then(b64bytes);
        return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
      });
      st.packs[idx].then(function (b) { st.info.packs[idx] = 'ok'; st.pdone[idx] = b; }, function (e) { st.info.packs[idx] = 'error ' + errName(e); delete st.packs[idx]; });
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

  // Callback form only (older Safari has no promise form); a decode that never answers rejects after DECODE_TIMEOUT_MS.
  function viaContext(ctx, bytes, clip, opts) {
    return new Promise(function (resolve, reject) {
      var copy = bytes.slice().buffer;
      var fired = false;
      var timer = null;
      var settle = function () { fired = true; if (timer) (st.win.clearTimeout || clearTimeout)(timer); };
      var done = function (buf) {
        if (fired) return;
        settle();
        if (clip.seq !== st.seq) { resolve({ ms: 0, superseded: true }); return; }
        step('decode-ok');
        var ms = clip.ms > 0 ? clip.ms : (buf && buf.duration > 0 ? Math.round(buf.duration * 1000) : 0);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        var mine = function () { try { src.stop(); } catch (e) { /* ignore */ } };
        src.onended = function () { if (st.stopFn === mine) st.stopFn = null; step('ended'); resolve({ ms: ms }); };
        st.stopFn = mine;
        st.measured[clip.id] = ms;
        step('start');
        src.start(0);
        if (opts && opts.onStart) opts.onStart({ ms: ms });
      };
      var fail = function (e) {
        if (fired) return;
        settle();
        st.info.decodeError = errName(e);
        step('decode-err', e);
        reject(e);
      };
      step('decode-start');
      timer = (st.win.setTimeout || setTimeout)(function () { fail(Object.assign(new Error('decodeAudioData timed out'), { name: 'DecodeTimeout' })); }, DECODE_TIMEOUT_MS);
      try {
        var p = ctx.decodeAudioData(copy, done, fail);
        if (p && typeof p.catch === 'function') p.catch(function () { /* reported through the callback */ });
      } catch (e) { fail(e); }
    });
  }

  function toDataUrl(bytes, mime) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:' + mime + ';base64,' + (st.win.btoa || root.btoa || globalThis.btoa).call(null, bin);
  }

  function viaElement(bytes, clip, opts) {
    var W = st.win;
    return new Promise(function (resolve, reject) {
      var a = opts && opts.fresh ? new W.Audio() : (st.el || new W.Audio());
      var blobUrl = null;
      var ms = clip.ms;
      var mine = function () { a.pause(); fin(resolve, { ms: ms }); };
      var cleanup = function () { if (blobUrl) { W.URL.revokeObjectURL(blobUrl); blobUrl = null; } };
      var fin = function (fn, v) { if (st.stopFn === mine) st.stopFn = null; a.onended = a.onerror = null; try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ } cleanup(); fn(v); };
      var begin = function (url, isBlob) {
        st.info.path = isBlob ? 'blob' : 'data';
        step('element-play');
        a.onended = function () { step('ended'); fin(resolve, { ms: ms }); };
        a.onerror = function () { retryOr(new Error('audio: playback failed')); };
        a.src = url;
        var r;
        try { r = a.play(); } catch (e) { retryOr(e); return; }
        Promise.resolve(r).then(function () {
          if (clip.seq !== st.seq) return;
          if (!(ms > 0) && a.duration > 0 && isFinite(a.duration)) ms = Math.round(a.duration * 1000);
          st.measured[clip.id] = ms;
          if (opts && opts.onStart) opts.onStart({ ms: ms });
        }, function (e) { st.info.playError = errName(e); retryOr(e); });
      };
      var retryOr = function (e) {
        if (blobUrl) { cleanup(); begin(toDataUrl(bytes, clip.mime), false); return; }
        st.info.playError = st.info.playError || errName(e);
        step('play-err', e);
        fin(reject, e);
      };
      st.stopFn = mine;
      blobUrl = W.URL.createObjectURL(new W.Blob([bytes], { type: clip.mime }));
      begin(blobUrl, true);
    });
  }

  // Safari/iOS: decodeAudioData fails on sliced MP3 (owner phone test), so the Audio element is the primary path there.
  function elementFirst() {
    var W = st.win;
    var ua = (W.navigator && W.navigator.userAgent) || '';
    if (/iP(hone|ad|od)/.test(ua)) return true;
    if (/Safari/.test(ua) && !/Chrome|Chromium|Android|Edg|OPR/.test(ua)) return true;
    return !W.AudioContext && !!W.webkitAudioContext;
  }

  function startClip(clip, bytes, opts, seq) {
    if (seq !== st.seq) return Promise.resolve({ ms: 0, superseded: true });
    clip = Object.assign({ seq: seq }, clip); var part = bytes.slice(clip.off, clip.off + clip.len);
    if (elementFirst() || !context()) return viaElement(part, clip, opts);
    st.info.path = 'webaudio';
    return viaContext(context(), part, clip, opts).catch(function () {
      if (seq !== st.seq) return { ms: 0, superseded: true };
      return viaElement(part, clip, opts);
    });
  }

  // When manifest and pack are already loaded (preload ran) play() reaches the Audio element synchronously, inside the tap.
  // One active playback: the same clip requested while active shares it; another clip stops and releases the previous one first.
  function play(clipId, opts) {
    if (!st) return Promise.reject(new Error('audio: not configured'));
    if (st.active && st.active.id === clipId) return st.active.promise;
    stop();
    var seq = ++st.seq, mine = st, o0 = opts;
    opts = Object.assign({}, o0, { onStart: function (i) { noteStart(clipId); if (o0 && o0.onStart) o0.onStart(i); } });
    var rec = { id: clipId, promise: null };
    rec.promise = playNow(clipId, opts, seq);
    mine.active = rec;
    var clear = function () { if (mine.active === rec) mine.active = null; };
    rec.promise.then(clear, clear);
    return rec.promise;
  }

  function playNow(clipId, opts, seq) {
    step('fetch');
    var fail = function (e) { st.info.playError = st.info.playError || errName(e); step('play-err', e); throw e; };
    var m0 = st.mdone || st.manifest;
    var c0 = m0 && m0.clips && m0.clips[clipId];
    if (c0 && st.pdone[c0.pack]) {
      var o = Object.assign({}, opts, { fresh: true });
      try { return startClip(Object.assign({ id: clipId }, c0), st.pdone[c0.pack], o, seq).catch(fail); } catch (e) { return Promise.reject(e); }
    }
    return manifest().then(function (m) {
      var clip = m.clips && m.clips[clipId];
      if (!clip) throw new Error('audio: unknown clip ' + clipId);
      return loadPack(m, clip.pack).then(function (bytes) { return startClip(Object.assign({ id: clipId }, clip), bytes, opts, seq); });
    }).catch(fail);
  }
  function mark() { return plays; }
  function heardClip(sid, since) {
    var id = last[sid];
    return startedAt[id] > (since === undefined ? Infinity : since) ? id : null;
  }
  function clipMeta(id) {
    var m = st && (st.mdone || st.manifest), c = m && m.clips && m.clips[id];
    return c ? { text: c.text, tr: c.tr, mt: !!c.mt, supersedes: Array.isArray(c.supersedes) ? c.supersedes.filter(function (s) { return typeof s === 'string'; }) : [] } : null;
  }
  function duration(clipId) {
    if (!st) return null;
    if (st.measured[clipId] > 0) return st.measured[clipId];
    var c = st.manifest && st.manifest.clips && st.manifest.clips[clipId];
    return c && c.ms > 0 ? c.ms : null;
  }

  function status() {
    var i = st ? st.info : { manifest: 'idle', packs: {}, decodeError: '', playError: '' };
    var packs = Object.keys(i.packs).sort().map(function (k) { return k + ':' + i.packs[k]; }).join(' ');
    return { manifest: i.manifest, packs: packs || 'none', ctx: st && st.ctx ? st.ctx.state : 'none', decodeError: i.decodeError, playError: i.playError, step: i.step || 'idle', err: i.err || '', path: i.path || '-' };
  }

  function preload() {
    if (!st) return Promise.resolve();
    return manifest().then(function (m) {
      return Promise.all((m.packs || []).map(function (_, i) { return loadPack(m, i); }));
    }).then(function () {}, function () {});
  }

  function stop() { if (st) { st.seq++; if (st.stopFn) st.stopFn(); } }

  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  function unlock() {
    try {
      if (!st) return;
      step('tap');
      try { var nav = st.win.navigator; if (nav && nav.audioSession) nav.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
      var ctx = context();
      if (ctx) {
        if (ctx.state === 'suspended') { step('resume'); ctx.resume(); }
        if (ctx.createBuffer && ctx.createBufferSource) {
          var b = ctx.createBufferSource();
          b.buffer = ctx.createBuffer(1, 1, 22050);
          b.connect(ctx.destination);
          b.start(0);
        }
      }
      if (!st.el && st.win.Audio) {
        st.el = new st.win.Audio();
        st.el.src = SILENT;
        var r = st.el.play();
        if (r && r.then) r.then(function () { try { st.el.pause(); st.el.currentTime = 0; } catch (e) { /* ignore */ } }, function () {});
      }
      preload();
    } catch (e) { /* ignore */ }
  }

  return { configure: configure, ready: ready, bindHeard: bindHeard, pick: pick, play: play, duration: duration, status: status, mark: mark, heardClip: heardClip, clipMeta: clipMeta, preload: preload, stop: stop, unlock: unlock };
});
