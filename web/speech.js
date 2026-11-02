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
(function (root) {
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

  function byName(voices, name) {
    if (typeof name !== 'string' || name === '') return null;
    return voices.filter(function (v) { return v.name === name; })[0] || null;
  }

  function byMatch(voices, pool, match, rank) {
    if (!match) return null;
    var m = String(match).toLowerCase();
    var hit = function (v) { return String(v.name || '').toLowerCase().indexOf(m) >= 0 || tag(v.lang).indexOf(m) >= 0; };
    return best(pool.filter(hit), rank) || best(voices.filter(hit), rank);
  }

  function pickVoice(voices, lang, match, opts) {
    var rank = makeRank(opts && opts.role, opts && opts.prefer);
    var named = byName(voices, opts && opts.name);
    if (named) return named;
    var pool = langVoices(voices, lang);
    var found = byMatch(voices, pool, match, rank);
    if (found) return found;
    var full = tag(lang);
    var exactPool = pool.filter(function(v) { return tag(v.lang) === full; });
    return best(exactPool.length > 0 ? exactPool : pool, rank);
  }

  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function nonEmptyString(v) { return typeof v === 'string' && v !== ''; }
  function firstFinite(a, b, dflt) { return finite(a) ? a : finite(b) ? b : dflt; }

  function multipliers(st) {
    return {
      rate: finite(st['speech:rate']) ? clamp(st['speech:rate'], 0.5, 1.5) : null,
      pitch: finite(st['speech:pitch']) ? clamp(st['speech:pitch'], 0, 2) : null
    };
  }

  function roleConfig(role, base, st, mul) {
    var vc = Object.assign({}, base.voices[role]);
    if (mul.rate !== null) vc.rate = clamp(firstFinite(vc.rate, base.rate, 1) * mul.rate, 0.1, 10);
    if (mul.pitch !== null) vc.pitch = clamp(firstFinite(vc.pitch, undefined, 1) * mul.pitch, 0, 2);
    if (nonEmptyString(st['speech:voice:' + role])) vc.name = st['speech:voice:' + role];
    return vc;
  }

  function effective(course, settings) {
    var c = course || {};
    var st = settings || {};
    var base = c.speech || {};
    var mul = multipliers(st);
    var speech = Object.assign({}, base);
    if (mul.rate !== null) speech.rate = clamp(firstFinite(base.rate, undefined, 1) * mul.rate, 0.1, 10);
    if (nonEmptyString(st['speech:voice'])) speech.voiceName = st['speech:voice'];
    var roles = {};
    Object.keys(base.voices || {}).forEach(function (role) { roles[role] = roleConfig(role, base, st, mul); });
    if (base.voices || Object.keys(roles).length) speech.voices = roles;
    var out = { speech: speech, lang: c.contentLanguage };
    if (mul.pitch !== null) out.pitch = mul.pitch;
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
    var r = { s: s, w: getWin(win), cb: cb, cfg: cfg, voices: voiceList(s), mine: ++token, watchdog: null, started: false };
    try {
      s.cancel();
      list.forEach(function (line, i) { speakLine(r, line, i === list.length - 1); });
      r.watchdog = r.w.setTimeout(function () { onWatchdog(r); }, 2500);
    } catch {
      clearWatchdog(r);
      token++;
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true };
  }

  function clearWatchdog(r) {
    if (r.watchdog === null) return;
    r.w.clearTimeout(r.watchdog);
    r.watchdog = null;
  }

  function cancelQuietly(s) { try { s.cancel(); } catch { /* ignore */ } }

  function onWatchdog(r) {
    if (r.started || r.mine !== token) return;
    clearWatchdog(r);
    token++;
    cancelQuietly(r.s);
    if (r.cb.onError) r.cb.onError({ error: 'no-start' });
  }

  function onUtteranceError(r, e) {
    clearWatchdog(r);
    var code = e && e.error;
    if (r.mine !== token || code === 'canceled' || code === 'interrupted') return;
    token++;
    cancelQuietly(r.s);
    if (r.cb.onError) r.cb.onError(e);
  }

  function pitchFor(vc, cfg) {
    if (typeof vc.pitch === 'number') return vc.pitch;
    return cfg && typeof cfg.pitch === 'number' ? clamp(cfg.pitch, 0, 2) : undefined;
  }

  function setDefined(o, key, v) { if (v !== undefined) o[key] = v; }

  function configure(u, line, cfg, voices) {
    var sp = (cfg && cfg.speech) || {};
    var lang = langOf(cfg);
    var vc = (sp.voices && line.voice && sp.voices[line.voice]) || {};
    if (lang) u.lang = lang;
    setDefined(u, 'rate', num(vc.rate, sp.rate));
    setDefined(u, 'pitch', pitchFor(vc, cfg));
    var nameWanted = vc.name || (line.voice ? undefined : sp.voiceName);
    var v = pickVoice(voices, lang, vc.match, { name: nameWanted, role: line.voice, prefer: vc.prefer });
    if (v) assignVoice(u, v, lang);
  }

  function assignVoice(u, v, lang) {
    u.voice = v;
    if (!lang && v.lang) u.lang = v.lang;
  }

  function speakLine(r, line, last) {
    var u = new r.w.SpeechSynthesisUtterance(line.text);
    configure(u, line, r.cfg, r.voices);
    u.onstart = function () { r.started = true; clearWatchdog(r); };
    u.onerror = function (e) { onUtteranceError(r, e); };
    if (last) u.onend = function () { if (r.mine === token && r.cb.onEnd) r.cb.onEnd(); };
    r.s.speak(u);
  }

  var api = { available: available, lines: lines, status: status, diag: diag, play: play, stop: stop, pickVoice: pickVoice, effective: effective, langOf: langOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSpeech = api;
})(typeof self !== 'undefined' ? self : this);
