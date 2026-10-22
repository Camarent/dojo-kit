/*
 * ui/common.js — Common UI helpers and components. Extracted from ui/app.js.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};
  var DojoI18n = root.DojoI18n || (typeof require !== 'undefined' ? require('./i18n.js') : null) || {};

  // ---------- helpers ----------

  function renderText(str) {
    return DojoExt.text ? DojoExt.text(str) : str;
  }

  function answerReadings(item) {
    var out = [];
    if (!item) return out;
    if (Array.isArray(item.answers)) out = item.answers.slice();
    else if (Array.isArray(item.parts)) {
      item.parts.forEach(function (p) { if (Array.isArray(p)) out = out.concat(p); });
    }
    return out;
  }

  function renderPrompt(str, item) {
    return DojoExt.text ? DojoExt.text(str, { annotate: true, hide: answerReadings(item) }) : str;
  }

  function renderTextAll(str) {
    return DojoExt.textAll ? DojoExt.textAll(str) : renderText(str);
  }

  function renderPromptEl(item, big) {
    return html`<p class=${cls('qtext', big && 'big')} data-testid="prompt">${renderPrompt(item.prompt, item)}</p>`;
  }

  var Speech = root.DojoSpeech || null;

  function speechLines(x) { return Speech ? Speech.lines(x) : []; }

  function speechCfg(course, store) {
    var settings = store && store.doc && store.doc.settings;
    if (Speech && Speech.effective) return Speech.effective(course, settings);
    return { speech: course && course.speech, lang: course && course.contentLanguage };
  }

  class PlayButton extends Component {
    constructor(props) {
      super(props);
      this.state = { playing: false, played: false };
    }
    componentWillUnmount() { this.gone = true; }
    click() {
      var p = this.props;
      var self = this;
      if (this.state.playing) {
        Speech.stop(p.audio.win);
        this.setState({ playing: false });
        return;
      }
      var r = Speech.play(p.lines, p.audio.cfg, {
        onEnd: function () { p.audio.played[p.pid] = true; if (!self.gone) self.setState({ playing: false, played: true }); },
        onError: function () { if (!self.gone) self.setState({ playing: false }); p.audio.onFail(); }
      }, p.audio.win);
      if (r.ok) this.setState({ playing: true });
      else p.audio.onFail();
    }
    render(p, s) {
      var t = p.audio.t;
      var exam = p.audio.exam;
      var once = exam && (s.played || p.audio.played[p.pid]);
      var label = once ? t('speech.played') : s.playing ? (exam ? t('speech.playing') : t('speech.stop')) : t('speech.play');
      var self = this;
      return html`<button type="button" class="btn icon play" data-testid=${p.testid} aria-label=${label} title=${label}
        disabled=${once || (exam && s.playing)} onClick=${function () { self.click(); }}><span aria-hidden="true">${s.playing && !exam ? '\u25A0' : '\u25B6'}</span></button>`;
    }
  }

  function renderPromptLine(promptEl, item, audio, lines) {
    var pb = html`<${Playback} audio=${audio} lines=${lines} testid="play-item" pid=${'i:' + item.id} />`;
    if (!lines.length) return promptEl;
    if (audio && audio.status === 'ok') return html`<div class="qline">${promptEl}${pb}</div>`;
    return [promptEl, pb];
  }

  function Playback(p) {
    var a = p.audio;
    if (a.status !== 'ok') {
      var spoken = (a.cfg && a.cfg.speech && a.cfg.speech.lang) || (a.cfg && a.cfg.lang);
      var displayLang = spoken;
      if (a.uiLang && spoken) {
        try {
          displayLang = new Intl.DisplayNames([a.uiLang], { type: 'language' }).of(spoken);
        } catch (e) { /* ignore */ }
      }
      return html`<p class="notice" role="status" data-testid=${p.testid + '-notice'}>${a.t('speech.novoice', { lang: displayLang })}</p>`;
    }
    return h(PlayButton, { key: p.pid, pid: p.pid, lines: p.lines, audio: a, testid: p.testid });
  }

  function cls() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  // ---------- small components ----------

  function Chip(p) {
    return html`<button type="button" class=${cls('chip', p.on && 'on')} aria-pressed=${p.on ? 'true' : 'false'}
      data-testid=${p.testid} onClick=${p.onClick}>${p.children}</button>`;
  }

  function Stepper(p) {
    var v = p.value;
    return html`<div class="stepper" data-testid=${p.testid} role="group" aria-label=${p.label}>
      <button type="button" class="btn icon" aria-label=${p.decLabel} disabled=${v <= p.min}
        data-testid=${p.testid + '-dec'} onClick=${function () { p.onChange(Math.max(p.min, v - p.step)); }}>−</button>
      <output class="stepper-value" data-testid=${p.testid + '-value'}>${v}</output>
      <button type="button" class="btn icon" aria-label=${p.incLabel} disabled=${v >= p.max}
        data-testid=${p.testid + '-inc'} onClick=${function () { p.onChange(Math.min(p.max, v + p.step)); }}>+</button>
    </div>`;
  }

  class Dialog extends Component {
    componentDidMount() {
      if (this.cancelBtn) this.cancelBtn.focus();
    }
    render(p) {
      var self = this;
      return html`<div class="overlay" data-testid=${p.testid}>
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
          <h2 id="dlg-title">${p.title}</h2>
          ${p.body ? html`<p>${p.body}</p>` : null}
          <div class="row end">
            <button type="button" class="btn" data-testid=${p.testid + '-cancel'} ref=${function (el) { self.cancelBtn = el; }}
              onClick=${p.onCancel}>${p.cancelLabel}</button>
            <button type="button" class=${cls('btn', p.danger ? 'danger' : 'primary')} data-testid=${p.testid + '-confirm'}
              onClick=${p.onConfirm}>${p.confirmLabel}</button>
          </div>
        </div>
      </div>`;
    }
  }

  function StatusChip(p) {
    var t = p.t;
    var s = p.status;
    return html`<span class=${cls('status', 'status-' + s)} data-testid="status-chip" data-status=${s}
      title=${t('status.' + s + '.tip')}><i class="dot" aria-hidden="true"></i>${t('status.' + s)}</span>`;
  }

  function ProgressBar(p) {
    var counts = p.counts;
    var total = counts.total || 0;
    if (total === 0) return null;
    var fresh = counts.fresh || 0;
    var learning = counts.learning || 0;
    var learned = counts.learned || 0;
    var newPct = fresh / total * 100;
    var learningPct = learning / total * 100;
    var learnedPct = learned / total * 100;
    var segments = [];
    if (learned > 0) {
      segments.push({ className: 'progress-segment learned', style: 'width: ' + learnedPct.toFixed(1) + '%' });
    }
    if (learning > 0) {
      segments.push({ className: 'progress-segment learning', style: 'width: ' + learningPct.toFixed(1) + '%' });
    }
    if (fresh > 0) {
      segments.push({ className: 'progress-segment new', style: 'width: ' + newPct.toFixed(1) + '%' });
    }
    var sum = segments.reduce(function (s, seg) { return s + parseFloat(seg.style.match(/width: (\d+\.?\d*)%/)[1]); }, 0);
    if (segments.length > 0) {
      var last = segments[segments.length - 1];
      var lastWidth = 100 - sum + parseFloat(last.style.match(/width: (\d+\.?\d*)%/)[1]);
      if (lastWidth < 0) lastWidth = 0;
      last.style = 'width: ' + lastWidth.toFixed(1) + '%';
    }
    var children = segments.map(function (s) {
      return h('span', Object.assign({ 'aria-hidden': 'true' }, s));
    });
    var attrs = { className: 'progress-bar', role: 'img', 'aria-label': p.ariaLabel };
    if (p.meter) {
      attrs.role = 'progressbar';
      attrs['aria-valuemin'] = 0;
      attrs['aria-valuemax'] = total;
      attrs['aria-valuenow'] = learned;
    }
    return h('div', attrs, children);
  }

  // Titled progress row: caption with explicit words + 8px segmented bar (learned / in progress / remaining).
  function ProgressMeter(p) {
    var t = p.t;
    var total = p.total || 0;
    var learned = p.learned || 0;
    var started = p.started || 0;
    var left = Math.max(0, total - learned - started);
    var vars = { learned: learned, started: started, left: left, total: total };
    return html`<div class="meter" data-testid=${p.testid}>
      ${p.title !== undefined || p.due > 0 ? html`<div class="meter-head">
        ${p.title !== undefined ? html`<span class="bar-title">${renderText(p.title)}</span>` : null}
        ${p.due > 0 ? html`<span class="meter-due" data-testid=${p.dueTestid}>${t('home.unit.due', { n: p.due })}</span>` : null}
      </div>` : null}
      <p class="muted meter-caption">${t(p.short ? 'bar.caption.short' : 'bar.caption', vars)}</p>
      ${total > 0 ? html`<${ProgressBar} meter=${true} counts=${{ total: total, fresh: left, learning: started, learned: learned }} ariaLabel=${t('bar.aria', vars)} />` : null}
    </div>`;
  }

  function Notice(p) {
    return p.text ? html`<p class="notice" role="status" data-testid="notice">${p.text}</p>` : null;
  }

  function Loading(p) {
    return html`<main class="screen center" data-testid="loading"><p class="muted">${p.t('loading')}</p></main>`;
  }

  function daysLeft(examDate, todayKey) {
    var re = /^(\d{4})-(\d{2})-(\d{2})$/;
    var a = re.exec(examDate || '');
    var b = re.exec(todayKey || '');
    if (!a || !b) return null;
    var diff = Math.round((Date.UTC(+a[1], +a[2] - 1, +a[3]) - Date.UTC(+b[1], +b[2] - 1, +b[3])) / 86400000);
    return diff >= 0 ? diff : null;
  }

  function applyTheme(win, theme) {
    var el = win && win.document && win.document.documentElement;
    if (!el) return;
    if (theme === 'light' || theme === 'dark') el.setAttribute('data-theme', theme);
    else el.removeAttribute('data-theme');
  }

  // ---------- API ----------

  var api = {
    // render helpers
    renderText: renderText,
    renderPrompt: renderPrompt,
    renderTextAll: renderTextAll,
    renderPromptEl: renderPromptEl,
    renderPromptLine: renderPromptLine,
    answerReadings: answerReadings,
    speechLines: speechLines,
    speechCfg: speechCfg,
    cls: cls,
    // components
    PlayButton: PlayButton,
    Playback: Playback,
    Chip: Chip,
    Stepper: Stepper,
    Dialog: Dialog,
    StatusChip: StatusChip,
    ProgressBar: ProgressBar,
    ProgressMeter: ProgressMeter,
    Notice: Notice,
    Loading: Loading,
    // utilities
    daysLeft: daysLeft,
    applyTheme: applyTheme
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DojoCommon = api;
  }
})(typeof self !== 'undefined' ? self : this);
