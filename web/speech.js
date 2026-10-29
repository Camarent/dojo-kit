/*
 * speech.js — DojoSpeech: speech synthesis playback. Global DojoSpeech (UMD, like ext.js). Never throws.
 *   cfg = { speech: course.speech | undefined, lang: course contentLanguage | undefined }; win defaults to the global window.
 *   available(win)                 true when win.speechSynthesis and SpeechSynthesisUtterance exist
 *   lines(x)                       [{ text, voice }] for a stimulus ({speak:{lines}}) or an item ({speak: string}); [] when x has no speak. Text goes through DojoExt.plain
 *   status(cfg, win)               'ok' | 'unavailable' | 'no_voice' (voices are known and none matches the language); empty voice list treated as 'ok' until voiceschanged has fired, then 'no_voice'
 *   play(lines, cfg, cb, win)      queues one utterance per line; cb = { onEnd(), onError(err) }; returns { ok: true } or { ok: false, reason: 'unavailable' | 'no_voice' | 'empty' }; a watchdog calls onError if no start event arrives within ~2.5 s
  *   stop(win)                      cancels playback; callbacks of the cancelled playback are not called
 *   pickVoice(voices, lang, match, opts) best voice for lang; opts = { name, role, prefer: [regex source] } (course speech.voices[role].prefer, case-insensitive, earlier = better, invalid skipped). Order: exact voice name (any language), name|lang substring match, then the best of the language pool by prefer match then DojoExt.voiceRank(voice, role), then localService === true, then list order
 *   diag(cfg, win)                 { api, voices, lang, matching } for the settings line: api as available(win); voices = voice count (0 without API); lang = langOf(cfg) or ''; matching = voices for lang. Never throws
 *   effective(course, settings)    cfg for play/status from course.speech and learner settings: "speech:rate" and "speech:pitch" (numbers, multiply the course values; rate 0.5..1.5, pitch 0..2), "speech:voice" (name for lines without a role), "speech:voice:<role>" (name for that role); null/invalid = course default. Does not modify its input
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSpeech = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var token = 0;
  var voicesChanged = new WeakMap();

  function getWin(win) { return win || (typeof window !== 'undefined' ? window : root); }

  function synth(win) {
    var w = getWin(win);
    return w && w.speechSynthesis && typeof w.SpeechSynthesisUtterance === 'function' ? w.speechSynthesis : null;
  }

  function available(win) {
    var s = synth(win);
    if (s && !voicesChanged.has(s) && s.addEventListener) {
      try {
        s.addEventListener('voiceschanged', function () { voicesChanged.set(s, true); });
      } catch { /* ignore */ }
      voicesChanged.set(s, false);
    }
    return !!s;
  }

  function plain(str) {
    var ext = root.DojoExt || (typeof DojoExt !== 'undefined' ? DojoExt : null);
    return ext && ext.plain ? ext.plain(str) : str;
  }

  function lines(x) {
    var out = [];
    var sp = x && x.speak;
    if (typeof sp === 'string') {
      if (sp.trim() !== '') out.push({ text: plain(sp), voice: undefined });
    } else if (sp && Array.isArray(sp.lines)) {
      sp.lines.forEach(function (l) {
        if (l && typeof l.text === 'string' && l.text.trim() !== '') out.push({ text: plain(l.text), voice: l.voice });
      });
    }
    return out;
  }

  function tag(s) { return String(s || '').toLowerCase().replace('_', '-'); }
  function primary(s) { return tag(s).split('-')[0]; }

  function voiceList(s) {
    try { return Array.prototype.slice.call(s.getVoices() || []); } catch { return []; }
  }

  function langOf(cfg) { return (cfg && cfg.speech && cfg.speech.lang) || (cfg && cfg.lang) || undefined; }

  function langVoices(voices, lang) {
    if (!lang) return voices;
    var p = primary(lang);
    return voices.filter(function (v) { return primary(v.lang) === p; });
  }

  function status(cfg, win) {
    var s = synth(win);
    if (!s) return 'unavailable';
    var voices = voiceList(s);
    if (voices.length === 0) {
      if (voicesChanged.get(s)) return 'no_voice';
      if (!voicesChanged.has(s) && s.addEventListener) {
        try {
          s.addEventListener('voiceschanged', function () { voicesChanged.set(s, true); });
        } catch { /* ignore */ }
        voicesChanged.set(s, false);
      }
      return 'ok';
    }
    return langVoices(voices, langOf(cfg)).length === 0 ? 'no_voice' : 'ok';
  }

  function diag(cfg, win) {
    var out = { api: false, voices: 0, lang: '', matching: 0 };
    try {
      out.api = !!synth(win);
      var s = synth(win);
      var list = s ? voiceList(s) : [];
      out.voices = list.length;
      out.lang = String(langOf(cfg) || '');
      out.matching = langVoices(list, out.lang).length;
    } catch { /* keep defaults */ }
    return out;
  }

  function extRank(voice, role) {
    var ext = root.DojoExt || (typeof DojoExt !== 'undefined' ? DojoExt : null);
    return ext && ext.voiceRank ? ext.voiceRank(voice, role) : 0;
  }

  // prefer: regex source strings, most preferred first; an invalid pattern is skipped. Declarative score dominates the DojoExt.voiceRank hook.
  function compilePrefer(prefer) {
    var out = [];
    (Array.isArray(prefer) ? prefer : []).forEach(function (src) {
      if (typeof src !== 'string' || src === '') return;
      try { out.push(new RegExp(src, 'i')); } catch { /* invalid pattern: ignored */ }
    });
    return out;
  }

  function makeRank(role, prefer) {
    var res = compilePrefer(prefer);
    return function (voice) {
      var p = 0;
      for (var i = 0; i < res.length; i++) {
        if (res[i].test(String((voice && voice.name) || ''))) { p = res.length - i; break; }
      }
      return p * 1e9 + extRank(voice, role);
    };
  }

  // Highest rank, then localService, then list order.
  function best(list, rank) {
    var out = null;
    var outRank = 0;
    list.forEach(function (v) {
      var r = rank(v);
      var better = out === null || r > outRank || (r === outRank && v.localService === true && out.localService !== true);
      if (better) { out = v; outRank = r; }
    });
    return out;
  }

  function pickVoice(voices, lang, match, opts) {
    var rank = makeRank(opts && opts.role, opts && opts.prefer);
    var name = opts && opts.name;
    if (typeof name === 'string' && name !== '') {
      var named = voices.filter(function (v) { return v.name === name; });
      if (named.length > 0) return named[0];
    }
    var pool = langVoices(voices, lang);
    if (match) {
      var m = String(match).toLowerCase();
      var hit = function (v) { return String(v.name || '').toLowerCase().indexOf(m) >= 0 || tag(v.lang).indexOf(m) >= 0; };
      var found = best(pool.filter(hit), rank) || best(voices.filter(hit), rank);
      if (found) return found;
    }
    var full = tag(lang);
    var exactPool = pool.filter(function(v) { return tag(v.lang) === full; });
    return best(exactPool.length > 0 ? exactPool : pool, rank);
  }

  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function effective(course, settings) {
    var c = course || {};
    var st = settings || {};
    var base = c.speech || {};
    var rateMul = finite(st['speech:rate']) ? clamp(st['speech:rate'], 0.5, 1.5) : null;
    var pitchMul = finite(st['speech:pitch']) ? clamp(st['speech:pitch'], 0, 2) : null;
    var speech = Object.assign({}, base);
    if (rateMul !== null) speech.rate = clamp((finite(base.rate) ? base.rate : 1) * rateMul, 0.1, 10);
    var defName = st['speech:voice'];
    if (typeof defName === 'string' && defName !== '') speech.voiceName = defName;
    var roles = {};
    var baseVoices = base.voices || {};
    Object.keys(baseVoices).forEach(function (role) {
      var vc = Object.assign({}, baseVoices[role]);
      if (rateMul !== null) vc.rate = clamp((finite(vc.rate) ? vc.rate : finite(base.rate) ? base.rate : 1) * rateMul, 0.1, 10);
      if (pitchMul !== null) vc.pitch = clamp((finite(vc.pitch) ? vc.pitch : 1) * pitchMul, 0, 2);
      var nm = st['speech:voice:' + role];
      if (typeof nm === 'string' && nm !== '') vc.name = nm;
      roles[role] = vc;
    });
    if (base.voices || Object.keys(roles).length) speech.voices = roles;
    var out = { speech: speech, lang: c.contentLanguage };
    if (pitchMul !== null) out.pitch = pitchMul;
    return out;
  }

  function num(a, b) { return typeof a === 'number' ? a : (typeof b === 'number' ? b : undefined); }

  function stop(win) {
    token++;
    var s = synth(win);
    if (s) { try { s.cancel(); } catch { /* ignore */ } }
  }

  function play(list, cfg, cb, win) {
    cb = cb || {};
    var s = synth(win);
    if (!s) return { ok: false, reason: 'unavailable' };
    if (!list || list.length === 0) return { ok: false, reason: 'empty' };
    if (status(cfg, win) === 'no_voice') return { ok: false, reason: 'no_voice' };
    var w = getWin(win);
    var sp = (cfg && cfg.speech) || {};
    var lang = langOf(cfg);
    var voices = voiceList(s);
    var mine = ++token;
    var watchdog = null;
    var started = false;
    function clearWatchdog() {
      if (watchdog !== null) {
        w.clearTimeout(watchdog);
        watchdog = null;
      }
    }
    function onStart() {
      started = true;
      clearWatchdog();
    }
    function onErrorFromUtterance(e) {
      clearWatchdog();
      var code = e && e.error;
      if (mine !== token || code === 'canceled' || code === 'interrupted') return;
      token++;
      try { s.cancel(); } catch { /* ignore */ }
      if (cb.onError) cb.onError(e);
    }
    try {
      s.cancel();
      list.forEach(function (line, i) {
        var u = new w.SpeechSynthesisUtterance(line.text);
        var vc = (sp.voices && line.voice && sp.voices[line.voice]) || {};
        var nameWanted = vc.name || (line.voice ? undefined : sp.voiceName);
        if (lang) u.lang = lang;
        var rate = num(vc.rate, sp.rate);
        if (rate !== undefined) u.rate = rate;
        var pitch = typeof vc.pitch === 'number' ? vc.pitch : (cfg && typeof cfg.pitch === 'number' ? clamp(cfg.pitch, 0, 2) : undefined);
        if (pitch !== undefined) u.pitch = pitch;
        var v = pickVoice(voices, lang, vc.match, { name: nameWanted, role: line.voice, prefer: vc.prefer });
        if (v) { u.voice = v; if (!lang && v.lang) u.lang = v.lang; }
        u.onstart = onStart;
        u.onerror = onErrorFromUtterance;
        if (i === list.length - 1) {
          u.onend = function () { if (mine === token && cb.onEnd) cb.onEnd(); };
        }
        s.speak(u);
      });
      watchdog = w.setTimeout(function () {
        if (started || mine !== token) return;
        clearWatchdog();
        token++;
        try { s.cancel(); } catch { /* ignore */ }
        if (cb.onError) cb.onError({ error: 'no-start' });
      }, 2500);
    } catch {
      clearWatchdog();
      token++;
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true };
  }

  return { available: available, lines: lines, status: status, diag: diag, play: play, stop: stop, pickVoice: pickVoice, effective: effective, langOf: langOf };
});
