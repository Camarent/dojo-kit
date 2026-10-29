/*
 * ui/play-button.js — PlayButton component (speech or audio clip playback button).
 * Extracted from ui/common.js. Exposed as root.DojoPlayButton, or module.exports under node.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);

  var Speech = root.DojoSpeech || null;

  function trackText(elapsedMs, totalMs) {
    var e = Math.min(elapsedMs, totalMs || elapsedMs);
    return (Math.max(0, e) / 1000).toFixed(1) + ' / ' + ((totalMs || 0) / 1000).toFixed(1) + ' s';
  }

  function renderTrack(track, elapsed, t) {
    var total = track.ms || 0;
    var e = Math.max(0, total ? Math.min(elapsed, total) : elapsed);
    var pct = total ? Math.round(e / total * 100) : 0;
    return html`<div class="ptrack" data-testid="play-track" role="progressbar" aria-label=${t('audio.track')} aria-valuemin="0" aria-valuemax=${Math.round(total / 100) / 10} aria-valuenow=${Math.round(e / 100) / 10} aria-valuetext=${trackText(e, total)}>
      <span class="ptrack-fill" style=${{ width: pct + '%' }}></span><span class="ptrack-text">${trackText(e, total)}</span></div>`;
  }

  function debugOn(a) {
    var loc = root.location;
    return !!(a && a.debug) || !!(loc && /(^|[#&])debug\b/.test(loc.hash || ''));
  }

  function renderDebug() {
    var A = root.DojoAudio;
    var d = A && A.status ? A.status() : {};
    return html`<p class="notice" data-testid="audio-debug">audio: manifest ${d.manifest}; packs ${d.packs}; ctx ${d.ctx}; decode ${d.decodeError || '-'}; play ${d.playError || '-'}; path ${d.path || '-'}; step ${d.step || '-'}; err ${d.err || '-'}</p>`;
  }

  function playClip(btn, p) {
    var A = root.DojoAudio;
    A.unlock();
    btn.setState({ playing: true, failed: false, track: null });
    var fin = function (ok, superseded) {
      if (superseded) { if (!btn.gone) btn.setState({ playing: false, track: null }); return; }
      // a failed clip releases the question timer at once (contract 12.2); in exams `played` stays the once-only lock
      if (ok) p.audio.played[p.pid] = true;
      else if (p.audio.exam) (p.audio.released || (p.audio.released = {}))[p.pid] = true;
      else p.audio.played[p.pid] = true;
      if (!btn.gone) btn.setState({ playing: false, played: ok || btn.state.played, failed: !ok, track: null });
    };
    var onStart = function (info) { if (!btn.gone) btn.setState({ track: { ms: info.ms, at: Date.now() } }); };
    var id;
    if (p.dict && p.dict.clip) id = p.dict.clip(p.clip.sid, p.clip.ids);
    else {
      var key = p.clip.sid + '|' + p.clip.ids.join(',');
      if (btn.stickyKey !== key) { btn.stickyKey = key; btn.stickyId = A.pick(p.clip.sid, p.clip.ids, Math.random); }
      id = btn.stickyId;
    }
    A.play(id, { onStart: onStart }).then(function (r) { fin(true, !!(r && r.superseded)); }, function () {
      fin(false);
      if (!p.lines.length) p.audio.onFail();
      else Speech.play(p.lines, p.audio.cfg, { onEnd: function () {}, onError: function () {} }, p.audio.win);
    });
  }

  function playLabel(p, s, once, loading, t) {
    var exam = p.audio.exam;
    var label = once ? t('speech.played') : s.playing ? (exam ? t('speech.playing') : t('speech.stop')) : t('speech.play');
    if (loading || (p.clip && s.playing && !exam)) label = t('audio.loading');
    return label;
  }

  function glyphEl(p, s, loading) {
    if (loading) return html`<span class="spin" data-testid="play-spin" aria-hidden="true">◌</span>`;
    return html`<span aria-hidden="true">${s.playing && !p.audio.exam ? '■' : '▶'}</span>`;
  }

  function buttonEl(self, p, s, label, once, spent, loading) {
    var exam = p.audio.exam;
    return html`<button type="button" class=${p.clip ? 'btn icon play big-play' : 'btn icon play'} data-testid=${p.testid} aria-label=${label} title=${label}
        disabled=${once || (exam && s.playing) || spent} onClick=${function () { self.click(); }}>${glyphEl(p, s, loading)}</button>`;
  }

  function extrasEl(self, p, s, t, left) {
    var extra = [];
    if (left !== null) extra.push(html`<span class="replays muted" data-testid="play-replays" role="status">${t('audio.replays', { n: left })}</span>`);
    if (p.clip && s.playing && s.track) extra.push(renderTrack(s.track, (s.now || Date.now()) - s.track.at, t));
    if (p.clip && debugOn(p.audio)) extra.push(renderDebug());
    return extra;
  }

  function failedEl(p, t) {
    return html`<span class="notice" role="status" data-testid=${p.testid + '-failed'}>${t('audio.failed')}</span>`;
  }

  class PlayButton extends Component {
    constructor(props) {
      super(props);
      this.state = { playing: false, played: false };
    }
    componentDidMount() { var self = this; this.iv = setInterval(function () { if (self.state.track) self.setState({ now: Date.now() }); }, 100); }
    componentWillUnmount() { this.gone = true; clearInterval(this.iv); }
    click() {
      var p = this.props;
      var self = this;
      if (this.state.playing) {
        if (p.clip) root.DojoAudio.stop(); else Speech.stop(p.audio.win);
        this.setState({ playing: false });
        return;
      }
      if (p.dict && !p.dict.take()) return;
      if (p.clip) { playClip(this, p); return; }
      var r = Speech.play(p.lines, p.audio.cfg, {
        onEnd: function () { p.audio.played[p.pid] = true; if (!self.gone) self.setState({ playing: false, played: true }); },
        onError: function () { if (!self.gone) self.setState({ playing: false }); p.audio.onFail(); }
      }, p.audio.win);
      if (r.ok) this.setState({ playing: true });
      else p.audio.onFail();
    }
    render(p, s) {
      var t = p.audio.t;
      var once = p.audio.exam && (s.played || p.audio.played[p.pid]);
      var loading = p.audio.status === 'loading' || (!!p.clip && s.playing && !s.track);
      var left = p.dict && p.dict.remaining ? p.dict.remaining() : null;
      var spent = !s.playing && !!p.dict && p.dict.exhausted();
      var label = spent ? t('audio.noreplay') : playLabel(p, s, once, loading, t);
      var btn = buttonEl(this, p, s, label, once, spent, loading);
      var extra = extrasEl(this, p, s, t, left);
      if (!s.failed) return extra.length ? [btn].concat(extra) : btn;
      return [btn].concat(extra).concat([failedEl(p, t)]);
    }
  }

  var api = { PlayButton: PlayButton };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DojoPlayButton = api;
  }
})(typeof self !== 'undefined' ? self : this);
