/*
 * ui/app.js — Preact + htm UI. Defines window.DojoApp = { start(opts), fail(root, err) }.
 * Globals expected: preact, htm, DojoStorage, DojoSession, DojoTypes, DojoExt (question UIs live in types/*.js). Course text is rendered through DojoExt.text.
 * Sections: helpers, small components, Home, PracticeSetup, Session, Results, Settings, App, start/fail.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var Fragment = preact.Fragment;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};

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
  // Play/status cfg: course speech merged with the learner's speech:* settings.
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

  function Stimulus(p) {
    var st = p.stimulus;
    if (!st) return null;
    var audio = p.audio;
    var lines = audio ? speechLines(st) : [];
    var speakable = lines.length > 0;
    var showText = !st.hideText || (speakable && audio.status !== 'ok');
    return html`<section class="stimulus" data-testid="stimulus">
      ${st.title ? html`<h2 class="stimulus-title" data-testid="stimulus-title">${renderText(st.title)}</h2>` : null}
      ${speakable && showText ? html`
        <div class="qline">
          <p class="qbody stimulus-text" data-testid="stimulus-text">${renderText(st.text)}</p>
          <${Playback} audio=${audio} lines=${lines} testid="play-stimulus" pid=${'s:' + st.id} />
        </div>
      ` : null}
      ${showText && !speakable ? html`<p class="stimulus-text" data-testid="stimulus-text">${renderText(st.text)}</p>` : null}
      ${speakable && !showText ? html`<${Playback} audio=${audio} lines=${lines} testid="play-stimulus" pid=${'s:' + st.id} />` : null}
    </section>`;
  }

  function primaryTag(lang) { return String(lang || 'en').split('-')[0]; }

  function pluralForm(lang, n) {
    if (primaryTag(lang) === 'ru') {
      var m10 = n % 10;
      var m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    }
    return n === 1 ? 'one' : 'other';
  }

  function makeT(i18n, lang) {
    var langs = [lang];
    if (primaryTag(lang) !== lang) langs.push(primaryTag(lang));
    if (lang !== 'en' && primaryTag(lang) !== 'en') langs.push('en');
    function find(key, n) {
      for (var i = 0; i < langs.length; i++) {
        var dict = (i18n && i18n[langs[i]]) || {};
        if (typeof n === 'number') {
          var forms = [pluralForm(langs[i], n), 'other', 'many'];
          for (var j = 0; j < forms.length; j++) {
            if (dict[key + '.' + forms[j]] !== undefined) return dict[key + '.' + forms[j]];
          }
        }
        if (dict[key] !== undefined) return dict[key];
      }
      return key;
    }
    return function t(key, vars) {
      var text = find(key, vars && typeof vars.n === 'number' ? vars.n : undefined);
      return text.replace(/\{(\w+)\}/g, function (m, name) {
        return vars && vars[name] !== undefined ? String(vars[name]) : m;
      });
    };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function localDay(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmtClock(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + pad2(s % 60);
  }

  function percent(fraction) { return Math.round((fraction || 0) * 100); }

  function uniqueSorted(list) {
    var seen = {};
    list.forEach(function (x) { seen[x] = true; });
    return Object.keys(seen).sort();
  }

  function toggle(list, value) {
    return list.indexOf(value) >= 0 ? list.filter(function (x) { return x !== value; }) : list.concat([value]);
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

  function fmtExamDate(lang, key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return '';
    try {
      return new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
    } catch (e) { return key; }
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

  // ---------- Catalog ----------

  var CATALOG_PAGE = 50;
  var CATALOG_TAGS_SHOWN = 12;
  var STAGES = ['new', 'learning', 'review'];

  function tagInfo(course, tag) {
    if (typeof DojoSession !== 'undefined' && DojoSession.tagInfo) return DojoSession.tagInfo(course, tag);
    var e = course && course.tagLabels && Object.prototype.hasOwnProperty.call(course.tagLabels, tag) ? course.tagLabels[tag] : null;
    var label = typeof e === 'string' ? e : e && typeof e.label === 'string' ? e.label : '';
    return { label: label || String(tag).toUpperCase(), internal: !!(e && typeof e === 'object' && e.kind === 'internal') };
  }

  function collectStrings(v, out, depth) {
    if (typeof v === 'string') out.push(v);
    else if (depth < 6 && Array.isArray(v)) v.forEach(function (x) { collectStrings(x, out, depth + 1); });
    else if (depth < 6 && v && typeof v === 'object') Object.keys(v).forEach(function (k) { collectStrings(v[k], out, depth + 1); });
    return out;
  }

  // Caption above the question: course.captions[tag] for the first matching tag, then captions[type], then the built-in type caption.
  function captionFor(course, item, t) {
    var caps = course && course.captions && typeof course.captions === 'object' ? course.captions : null;
    var has = function (k) { return caps && Object.prototype.hasOwnProperty.call(caps, k) && typeof caps[k] === 'string' && caps[k]; };
    var tags = item.tags || [];
    for (var i = 0; i < tags.length; i++) if (has(tags[i])) return caps[tags[i]];
    if (has(item.type)) return caps[item.type];
    var key = 'session.caption.' + item.type;
    var out = t(key);
    return out === key ? '' : out;
  }

  // Intro card body: plugin hook output, else title + text. all=true uses renderTextAll.
  // pre: when provided, use this pre-computed intro hook output instead of calling DojoExt.intro.
  function renderIntroBody(intro, item, ctx, decl, all, pre) {
    var r = all ? renderTextAll : renderText;
    var out = pre !== undefined ? pre : (DojoExt.intro ? DojoExt.intro(intro, item, ctx) : null);
    if (out) return html`<div class="intro-hook" data-testid="intro-hook">${out}</div>`;
    return html`<div class="intro-default">
      ${intro.title ? html`<h3 class="intro-title" data-testid="intro-title">${r(intro.title)}</h3>` : null}
      ${intro.text ? html`<div class="intro-text pre" data-testid="intro-text">${r(intro.text)}</div>` : null}
      ${decl || null}
    </div>`;
  }

  // Helper to get nested value from item.meta by dot-separated key path
  function getMetaValue(item, key) {
    if (!item || !item.meta || typeof item.meta !== 'object') return null;
    var parts = key.replace(/^meta\./, "").split('.');
    var value = item.meta;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (value === null || typeof value !== 'object') return null;
      if (!Object.prototype.hasOwnProperty.call(value, part)) return null;
      value = value[part];
    }
    return value;
  }

  // Render declarative detail fields from item.meta. all=true uses renderTextAll.
  function renderDeclarativeDetail(course, unit, item, t, all) {
    var r = all ? renderTextAll : renderText;
    // Try unit.detail first, then course.detail
    var detailConfig = (unit && unit.detail) || (course && course.detail);
    if (!detailConfig || !detailConfig.fields || !detailConfig.fields.length) return null;
    
    var fields = detailConfig.fields;
    var rendered = [];
    
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field || !field.key) continue;
      
      var value = getMetaValue(item, field.key);
      // Skip missing or empty fields
      if (value === null || value === undefined || value === '') continue;
      
      var label = field.label || (field.labelKey && t ? t(field.labelKey) : field.key);
      var type = field.type || 'text';
      var content = null;
      
      if (type === 'text') {
        // Render as text with markup
        if (typeof value === 'string') {
          content = html`<span data-testid=${'detail-' + field.key}>${r(value)}</span>`;
        } else {
          content = html`<span data-testid=${'detail-' + field.key}>${String(value)}</span>`;
        }
      } else if (type === 'list') {
        // Render as unordered list
        if (Array.isArray(value) && value.length > 0) {
          content = html`<ul data-testid=${'detail-' + field.key + '-list'}>${value.map(function (v) {
            return html`<li>${typeof v === 'string' ? r(v) : String(v)}</li>`;
          })}</ul>`;
        }
      } else if (type === 'objects') {
        // Render as rows of "k: v"
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          var rows = [];
          for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              rows.push(html`<tr data-testid=${'detail-' + field.key + '-' + k}><td>${k}:</td><td>${typeof value[k] === 'string' ? r(value[k]) : String(value[k])}</td></tr>`);
            }
          }
          if (rows.length > 0) {
            content = html`<table class="detail-objects" data-testid=${'detail-' + field.key + '-table'}>${rows}</table>`;
          }
        }
      }
      
      if (content) {
        rendered.push(html`<div class="detail-field" data-testid=${'detail-field-' + field.key}><b>${label}:</b> ${content}</div>`);
      }
    }
    
    if (rendered.length === 0) return null;
    return html`<section class="declarative-detail" data-testid="declarative-detail">${rendered}</section>`;
  }

  // Entity stage for the stage filter: new = no member has a record; review = every member has min stage >= 2; else learning.
  function topicStage(es) {
    if (!es || !es.started) return 'new';
    return es.minStage >= 2 ? 'review' : 'learning';
  }
  // Chip state: new / learning / due (any member due) / learned (all members at or above learnedStage).
  function topicState(es) {
    if (!es || !es.started) return 'new';
    if (es.due) return 'due';
    return es.learned ? 'learned' : 'learning';
  }
  // Mastery % = members at or above learnedStage / members.
  function topicMastery(es) {
    return es && es.members ? Math.round(100 * es.atLearned / es.members) : 0;
  }
  // Pick topic title: meta.title > entity intro title > item.prompt > item.entity > item.id.
  function topicTitle(item, intro) {
    var m = item.meta || {};
    if (m.title) return m.title;
    if (intro && typeof intro.title === 'string' && intro.title) return intro.title;
    if (typeof item.prompt === 'string' && item.prompt) return item.prompt;
    return item.entity || item.id;
  }

  class CatalogScreen extends Component {
    constructor(props) {
      super(props);
      var units = props.course.units || [];
      this.state = { search: '', selectedUnit: units.length ? units[0].id : null, selectedTags: [], selectedStages: [], tagsOpen: false, limit: CATALOG_PAGE, detailItem: null };
      this.items = props.content.items.filter(function (it) { return it.status !== 'retired'; });
      this.introById = Object.create(null);
      var ib = this.introById;
      (props.content.intros || []).forEach(function (i) { if (i && typeof i.id === 'string') ib[i.id] = i; });
      this.unitById = Object.create(null);
      var ub = this.unitById;
      (props.course.units || []).forEach(function (u) { if (u && typeof u.id === 'string') ub[u.id] = u; });
      this.index = this.buildIndex();
      this.onKey = this.onKey.bind(this);
    }
    componentDidMount() { this.props.win.addEventListener('keydown', this.onKey); this.updateScrollLock(); }
    componentDidUpdate() { this.updateScrollLock(); }
    componentWillUnmount() { this.props.win.removeEventListener('keydown', this.onKey); this.clearScrollLock(); }
    updateScrollLock() {
      var body = this.props.win.document.documentElement;
      if (body) {
        if (this.state.detailItem) body.classList.add('dojo-no-scroll');
        else body.classList.remove('dojo-no-scroll');
      }
    }
    clearScrollLock() {
      var body = this.props.win.document.documentElement;
      if (body) body.classList.remove('dojo-no-scroll');
    }
    onKey(e) {
      var d = this.state.detailItem;
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && d) {
        e.preventDefault();
        this.setState({ detailItem: null });
        return;
      }
      var dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d || !dir || DojoTypes.keyBlocked(e)) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var id = d.entity || d.id;
      var list = this.topics();
      var at = list.findIndex(function (r) { return r.id === id; });
      var to = list[at + dir];
      if (at < 0 || !to) return;
      e.preventDefault();
      this.setState({ detailItem: to.item });
    }
    introOf(item) { return this.introById[item.entity || item.id] || null; }
    buildIndex() {
      var e = this.props.engine;
      var self = this;
      var idx = {};
      this.items.forEach(function (item) {
        var parts = [item.prompt, e.expected(item), item.explanation];
        if (Array.isArray(item.answers)) parts = parts.concat(item.answers);
        collectStrings(item.meta, parts, 0);
        var intro = self.introOf(item);
        if (intro) parts.push(intro.title, intro.text);
        var strs = parts.filter(function (x) { return typeof x === 'string'; });
        idx[item.id] = (strs.map(function (x) { return DojoExt.plain(x); }).join('\n') + '\n' + strs.join('\n')).toLowerCase();
      });
      return idx;
    }
    filtered() {
      var s = this.state;
      var idx = this.index;
      var q = s.search.trim().toLowerCase();
      return this.items.filter(function (it) {
        if (s.selectedUnit && it.unit !== s.selectedUnit) return false;
        if (!s.selectedTags.every(function (tag) { return (it.tags || []).indexOf(tag) >= 0; })) return false;
        return !q || idx[it.id].indexOf(q) >= 0;
      });
    }
    topics() {
      var s = this.state;
      var by = Object.create(null);
      this.props.engine.entityStates().forEach(function (es) { by[es.id] = es; });
      var order = [];
      var first = Object.create(null);
      this.filtered().forEach(function (it) {
        var id = it.entity || it.id;
        if (!first[id]) { first[id] = it; order.push(id); }
      });
      return order.map(function (id) { return { id: id, item: first[id], es: by[id] }; }).filter(function (r) {
        return !s.selectedStages.length || s.selectedStages.indexOf(topicStage(r.es)) >= 0;
      });
    }
    allTags() {
      var sel = this.state.selectedUnit;
      var course = this.props.course;
      var seen = {};
      this.items.forEach(function (it) {
        if (sel && it.unit !== sel) return;
        (it.tags || []).forEach(function (tag) { seen[tag] = true; });
      });
      return Object.keys(seen).filter(function (tag) { return !tagInfo(course, tag).internal; }).sort();
    }
    // Any filter change resets the page.
    filter(patch) { this.setState(Object.assign({ limit: CATALOG_PAGE }, patch)); }
    render(p, s) {
      var t = p.t;
      var self = this;
      var all = this.topics();
      var items = all.slice(0, s.limit);
      var tags = this.allTags();
      var shown = s.tagsOpen ? tags : tags.filter(function (tag, i) { return i < CATALOG_TAGS_SHOWN || s.selectedTags.indexOf(tag) >= 0; });
      var d = s.detailItem;
      var dIntro = d ? this.introOf(d) : null;
      var dIntroOut = dIntro && DojoExt.intro ? DojoExt.intro(dIntro, d, this.hookCtx()) : null;
      var detailHookOut = d ? DojoExt.detail(d, this.hookCtx({ introRendered: !!dIntroOut })) : null;
      var dDecl = d && !detailHookOut ? renderDeclarativeDetail(p.course, this.unitById[d.unit] || null, d, p.t) : null;
      return html`<main class="screen" data-testid="catalog">
        <header class="head">
          <h1>${t('catalog.title')}</h1>
          <button type="button" class="btn" data-testid="btn-back" onClick=${function () { p.go('home'); }}>${t('back')}</button>
        </header>
        <div class="catalog-tabs" role="tablist" aria-label=${t('catalog.units')}>
          <button type="button" key="__all" class=${cls('btn', !s.selectedUnit && 'primary')}
            data-testid="tab-all" role="tab" aria-selected=${!s.selectedUnit}
            onClick=${function () { self.filter({ selectedUnit: null, selectedTags: [] }); }}>${t('catalog.all')}</button>
          ${(p.course.units || []).map(function (unit) {
            return html`<button type="button" key=${unit.id} class=${cls('btn', s.selectedUnit === unit.id && 'primary')}
              data-testid=${'tab-' + unit.id} role="tab" aria-selected=${s.selectedUnit === unit.id}
              onClick=${function () { self.filter({ selectedUnit: unit.id, selectedTags: [] }); }}>${renderText(unit.title)}</button>`;
          })}
        </div>
        <div class="catalog-filters">
          <input type="search" class="field catalog-search" placeholder=${t('catalog.search')} aria-label=${t('catalog.search')}
            data-testid="catalog-search" name="catalog-search" value=${s.search}
            onInput=${function (e) { self.filter({ search: e.target.value }); }} />
          <div class="chips" data-testid="stage-filters">
            ${STAGES.map(function (st) {
              return html`<${Chip} key=${'st-' + st} on=${s.selectedStages.indexOf(st) >= 0} testid=${'filter-stage-' + st}
                onClick=${function () { self.filter({ selectedStages: toggle(s.selectedStages, st) }); }}>${t('catalog.stage.' + st)}<//>`;
            })}
          </div>
          <div class="chips" data-testid="tag-chips">
            ${shown.map(function (tag) {
              return html`<${Chip} key=${'tag-' + tag} on=${s.selectedTags.indexOf(tag) >= 0} testid=${'tag-' + tag}
                onClick=${function () { self.filter({ selectedTags: toggle(s.selectedTags, tag) }); }}>${tagInfo(p.course, tag).label}<//>`;
            })}
            ${tags.length > CATALOG_TAGS_SHOWN ? html`<button type="button" key="tags-more" class="chip" data-testid="tag-more"
              onClick=${function () { self.setState({ tagsOpen: !s.tagsOpen }); }}>${s.tagsOpen ? t('catalog.tags.less') : t('catalog.tags.more', { n: tags.length - shown.length })}</button>` : null}
          </div>
        </div>
        <p class="muted catalog-count" data-testid="catalog-count">${t('catalog.topics.count', { n: all.length })}</p>
        ${s.search.trim() && all.length === 0 ? html`<p class="muted" data-testid="catalog-empty">${t('catalog.empty')}</p>` : null}
        <ul class="catalog-list" data-testid="catalog-list">
          ${items.map(function (r) {
            var state = topicState(r.es);
            return html`<li key=${'topic-' + r.id} data-testid=${'topic-' + r.id} class="catalog-item">
              <button type="button" class="catalog-btn" onClick=${function () { self.setState({ detailItem: r.item }); }}>
                <span class=${'catalog-state ' + state} data-testid=${'topic-state-' + r.id}>${t('catalog.state.' + state)}</span>
                <span class="catalog-prompt" data-testid=${'topic-label-' + r.id}>${renderText(topicTitle(r.item, self.introOf(r.item)))}</span>
                <span class="muted catalog-mastery" data-testid=${'topic-mastery-' + r.id}>${topicMastery(r.es)}%</span>
              </button>
            </li>`;
          })}
        </ul>
        ${all.length > items.length ? html`<button type="button" class="btn catalog-more" data-testid="catalog-more"
          onClick=${function () { self.setState({ limit: s.limit + CATALOG_PAGE }); }}>${t('catalog.more', { n: all.length - items.length })}</button>` : null}
        ${d ? html`<div class="overlay" data-testid="catalog-detail" onClick=${function () { self.setState({ detailItem: null }); }}>
          <div class="dialog catalog-detail-dialog" role="dialog" aria-modal="true" onClick=${function (e) { e.stopPropagation(); }}>
            <div class="catalog-detail-header" data-testid="catalog-detail-header">
              <button type="button" class="btn icon" data-testid="btn-close-detail" onClick=${function () { self.setState({ detailItem: null }); }}>${t('close')}</button>
              ${d.meta && typeof d.meta.kanji === 'string' && d.meta.kanji ? html`<span class="kanji-ch" data-testid="detail-glyph">${d.meta.kanji}</span>` : null}
              <h2>${t('catalog.detail')}</h2>
            </div>
            <article class="qcard">
              ${dIntro ? html`<section class="intro" data-testid="detail-intro">${renderIntroBody(dIntro, d, self.hookCtx(), dDecl, false, dIntroOut)}</section>` : null}
              ${!dIntro && dDecl ? dDecl : null}
              <p class="qtext" data-testid="detail-prompt">${renderText(d.prompt)}</p>
              <p data-testid="detail-answers"><b>${t('session.expected')}</b> <span class="pre">${renderText(p.engine.expected(d))}</span></p>
              ${d.explanation ? html`<p class="pre" data-testid="detail-explanation">${renderText(d.explanation)}</p>` : null}
              <p class="muted" data-testid="detail-stage">${t('catalog.stage')}: ${t('catalog.stage.' + p.engine.stage(d))}</p>
              ${(function () {
                var rec = p.engine.record(d);
                if (!rec) return null;
                var now = p.now();
                var due = rec.due;
                var days = due > now ? Math.ceil((due - now) / 86400000) : 0;
                var dueText = function () { return due <= now ? t('catalog.dueNow') : t('catalog.dueIn', { n: days }); };
                var okN = rec.ok || 0, badN = rec.bad || 0, stepN = rec.s || 0;
                return html`<p class="muted" data-testid="detail-step">${t('catalog.step', { s: stepN })} · ${dueText()}</p>
                  <p class="muted" data-testid="detail-due">${t('catalog.due')}: ${dueText()}</p>
                  <p class="muted" data-testid="detail-counts">${t('catalog.counts', { ok: okN, bad: badN })}</p>`;
              })()}
              ${detailHookOut ? html`<div data-testid="detail-hook">${detailHookOut}</div>` : null}
            </article>
          </div>
        </div>` : null}
      </main>`;
    }
    hookCtx(extra) {
      var p = this.props;
      return Object.assign({ items: p.content.items, records: p.store.doc.items || {}, t: p.t, h: h }, extra);
    }
    hook(item, extra) {
      var out = DojoExt.detail(item, this.hookCtx(extra));
      return out ? html`<div data-testid="detail-hook">${out}</div>` : null;
    }
  }

  // ---------- Home ----------

  function GroupCard(p) {
    var t = p.t;
    var g = p.group;
    var isExtraNew = g.extraNew === true;
    var total = g.total || 0;
    var due = g.due || 0;
    var fresh = g.fresh || 0;
    var newToday = g.newToday || 0;
    var canStart = due + newToday > 0;
    var labels = p.tagLabels;
    return html`<li key=${g.id} class="group-card" data-testid=${'group-' + g.id}>
      <h3 class="group-title">${renderText(g.title)}</h3>
      <div class="group-counts">
        <span class="group-stat" data-testid=${'group-' + g.id + '-due'}>${t('home.group.stat.due')} <b class="group-due">${due}</b></span>
        <span class="group-stat" data-testid=${'group-' + g.id + '-new'}>${t('home.group.stat.new')} <b>${newToday}</b></span>
      </div>
      <p class="muted group-notstarted" data-testid=${'group-' + g.id + '-notstarted'}>${t('home.group.notStarted', { n: fresh, total: total })}</p>
      <div class="group-actions">
        <button type="button" class="btn primary" disabled=${!canStart} 
          data-testid=${'btn-start-group-' + g.id}
          onClick=${function () { p.onStart('daily', { groupId: g.id }); }}>
          ${t('home.group.start')}${due + newToday > 0 ? html`<span class="group-start-count"> · ${due + newToday}</span>` : null}
        </button>
        ${isExtraNew ? html`<div class="row wrap extra-new-buttons" data-testid=${'group-' + g.id + '-extra'}>
          <button type="button" class="btn small" data-testid=${'btn-extra-5-' + g.id} onClick=${function () { p.onMoreNew(5); }}>${t('home.moreNew', { n: 5 })}</button>
          <button type="button" class="btn small" data-testid=${'btn-extra-10-' + g.id} onClick=${function () { p.onMoreNew(10); }}>${t('home.moreNew', { n: 10 })}</button>
          <button type="button" class="btn small" data-testid=${'btn-extra-20-' + g.id} onClick=${function () { p.onMoreNew(20); }}>${t('home.moreNew', { n: 20 })}</button>
        </div>` : null}
      </div>
      ${isExtraNew || (g.extraTags && g.extraTags.length > 0) ? html`<div class="group-toggles">
        ${isExtraNew ? html`<label class="chip toggles" data-testid=${'toggle-random-' + g.id}>
          <input type="checkbox"
            checked=${g.extraRandom === true}
            name=${'random-' + g.id}
            onChange=${function () { p.onGroupSetting(g.id, 'extraRandom', g.extraRandom === true ? null : true); }} />
          <span>${t('home.group.randomOrder')}</span>
        </label>` : null}
        ${g.extraTags && g.extraTags.length > 0 ? html`<label class="chip toggles" data-testid=${'toggle-onlyTags-' + g.id}>
          <input type="checkbox"
            checked=${g.onlyTags === true}
            name=${'onlyTags-' + g.id}
            onChange=${function () { p.onGroupSetting(g.id, 'onlyTags', g.onlyTags === true ? null : true); }} />
          <span>${t('home.group.onlyTags', { tag: g.extraTags.map(function (tag) { return tagInfo({ tagLabels: labels }, tag).label; }).join(', ') })}</span>
        </label>` : null}
      </div>` : null}
    </li>`;
  }

  function orderedGroupIds(course, groups) {
    var ids = (course.groups || []).map(function (g) { return g.id; }).filter(function (id) { return groups[id] !== undefined; });
    Object.keys(groups).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  function Home(p) {
    var t = p.t;
    var d = p.home;
    var c = d.counts;
    var course = p.course;
    var canReview = c.due + c.newToday > 0;
    var exams = p.exams || [];
    var hasPlacement = course.placement !== undefined;
    var placementDone = !!d.placementDone;
    var resume = p.resume;
    var groups = c.groups;
    var bars = c.bars;
    var hasGroups = groups && Object.keys(groups).length > 0;
    var hasBars = bars && bars.length > 0;
    var sumDue = c.summary ? c.summary.due : c.due;
    var sumNew = c.summary ? c.summary.newToday : c.newToday;
    var weakList = p.engine && p.engine.weakList && p.engine.weakList(8) || [];
    var hasWeak = weakList.length > 0;
    
    // For backward compatibility: find the extraNew group if it exists
    var extraNewGroup = null;
    if (course.groups) {
      for (var i = 0; i < course.groups.length; i++) {
        if (course.groups[i].extraNew === true) {
          extraNewGroup = course.groups[i].id;
          break;
        }
      }
    }
    
    return html`<main class="screen" data-testid="home">
      <header class="head">
        <h1>${course.title}</h1>
        <${StatusChip} t=${t} status=${p.status} />
      </header>
      <${Notice} text=${p.notice} />
      ${p.examDaysLeft !== null ? html`<p class=${cls('exam-countdown', p.examDaysLeft <= 7 && 'soon')} data-testid="exam-countdown">${t('home.exam.countdown', { n: p.examDaysLeft }) + (fmtExamDate(p.lang, p.examDate) ? ' · ' + fmtExamDate(p.lang, p.examDate) : '')}</p>` : null}
      ${resume ? html`<section class="resume-box" data-testid="resume-box">
        <p data-testid="resume-text">${t('home.resume.exam', { n: resume.answered, total: resume.total, ms: fmtClock(resume.remainingMs) })}</p>
        <div class="row">
          <button type="button" class="btn primary" data-testid="btn-resume" onClick=${function () { p.onResume(); }}>${t('home.resume.start')}</button>
          <button type="button" class="btn" data-testid="btn-startover" onClick=${function () { p.onStartOver(); }}>${t('home.resume.startover')}</button>
          <button type="button" class="btn" data-testid="btn-discard" onClick=${function () { p.onDiscard(); }}>${t('home.resume.discard')}</button>
        </div>
      </section>` : null}
      <section class="stats" aria-label=${t('home.stats')}>
        <div class="stat" data-testid="stat-streak"><b>${d.streak}</b><span>${t('n.days', { n: d.streak })}</span></div>
        <div class="stat" data-testid="stat-due"><b>${sumDue}</b><span>${t('n.due', { n: sumDue })}</span></div>
        <div class="stat" data-testid="stat-new" title=${t('home.stat.newHint')}><b>${sumNew}</b><span>${t('n.new', { n: sumNew })}</span></div>
      </section>
      ${c.summary && hasGroups ? html`<p class="muted stats-note" data-testid="stats-note">${t('home.stat.newHint')}</p>` : null}
      ${c.summary ? html`<p class="muted session-count" data-testid="session-count">${t('home.session.count', { n: c.summary.queue })}</p>` : null}
      <section class="actions">
        ${c.fresh > c.newToday && !hasGroups ? html`<div class="row wrap more-new" data-testid="more-new">
          <button type="button" class="btn" data-testid="btn-more-5" onClick=${function () { p.onMoreNew(5); }}>${t('home.moreNew', { n: 5 })}</button>
          <button type="button" class="btn" data-testid="btn-more-10" onClick=${function () { p.onMoreNew(10); }}>${t('home.moreNew', { n: 10 })}</button>
          <button type="button" class="btn" data-testid="btn-more-20" onClick=${function () { p.onMoreNew(20); }}>${t('home.moreNew', { n: 20 })}</button>
        </div>` : null}
        ${hasPlacement && !placementDone ? html`<button type="button" class="btn primary big" data-testid="btn-placement"
          onClick=${function () { p.onPlacement(); }}>${t('home.placement')}</button>` : null}
        <button type="button" class="btn primary big" disabled=${!canReview} data-testid="btn-review"
          onClick=${function () { p.onStart('daily', {}); }}>${t('home.review')}</button>
        ${canReview ? null : html`<p class="muted" data-testid="review-hint">${t('home.review.empty')}</p>`}
        <div class="row wrap">
          <button type="button" class="btn" data-testid="btn-practice" onClick=${function () { p.go('practice'); }}>${t('home.practice')}</button>
          ${hasWeak ? html`<button type="button" class="btn" data-testid="btn-weak" aria-label=${t('home.weak') + ' ' + t('home.weak.count', { n: weakList.length })}
            onClick=${function () { p.onStart('weak', {}); }}>${t('home.weak')}</button>` : null}
          <button type="button" class="btn" data-testid="btn-settings" onClick=${function () { p.go('settings'); }}>${t('home.settings')}</button>
          <button type="button" class="btn" data-testid="btn-catalog" onClick=${function () { p.go('catalog'); }}>${t('home.catalog')}</button>
        </div>
        ${hasWeak ? html`<div class="weak-chips-block">
          <h3 class="weak-title" id="weak-title" data-testid="weak-title">${t('home.weakspots')}</h3>
          <ul class="chips weak-chips" data-testid="weak-chips" aria-labelledby="weak-title">
            ${weakList.map(function (item) {
              var plain = DojoExt.plain(item.prompt || '');
              var truncated = plain.length > 24 ? plain.slice(0, 24) + '\u2026' : plain;
              return html`<li><span class="chip" title=${plain}>${truncated}</span></li>`;
            })}
          </ul>
        </div>` : null}
      </section>
      ${hasGroups ? html`<section aria-labelledby="groups-title">
        <h2 id="groups-title">${t('home.groups')}</h2>
        <ul class="groups" data-testid="groups">
          ${orderedGroupIds(course, groups).map(function (gid) {
            var g = course.groups.filter(function (gr) { return gr.id === gid; })[0] || { id: gid, title: gid };
            var gc = groups[gid];
            var overrides = p.engine.groupSettings ? p.engine.groupSettings(gid) : {};
            var merged = Object.assign({}, g, gc, overrides);
            return h(GroupCard, {
              t: t, group: merged, tagLabels: course.tagLabels,
              onStart: p.onStart, onGroupSetting: p.onGroupSetting, onMoreNew: p.onMoreNew
            });
          })}
        </ul>
      </section>` : null}
      ${exams.length ? html`<section class="exams" aria-labelledby="exams-title">
        <h2 id="exams-title">${t('home.exams')}</h2>
        ${exams.map(function (exam) {
          return html`<div class="exam-box" key=${exam.id} data-testid=${exams.length > 1 ? 'exam-' + exam.id : 'exam-box'}>
          <div>
            <b>${exam.title || t('home.exam')}</b>
            <p class="muted">${[exam.minutes ? t('home.exam.minutes', { n: exam.minutes }) : '', exam.sections.join(', ')].filter(Boolean).join(' · ')}</p>
            ${exam.note ? html`<p class="muted">${exam.note}</p>` : null}
          </div>
          <div class="row wrap">
            ${exam.timed ? html`<button type="button" class="btn" data-testid=${'btn-training-' + exam.id}
              onClick=${function () { p.onStart('exam', { examId: exam.id, training: true }); }}>${t('home.exam.training')}</button>` : null}
            <button type="button" class="btn" data-testid=${exams.length > 1 ? 'btn-exam-' + exam.id : 'btn-exam'}
              onClick=${function () { p.onStart('exam', exams.length > 1 ? { examId: exam.id } : {}); }}>${t('home.exam.start')}</button>
          </div>
        </div>`;
        })}
      </section>` : null}
      ${hasBars ? html`<section aria-labelledby="bars-title">
        <h2 id="bars-title">${t('home.bars')}</h2>
        <ul class="bars" data-testid="bars">
          ${bars.map(function (bar) {
            return html`<li key=${bar.title} class="bar-item" data-testid=${'bar-' + bar.title}>
              <${ProgressMeter} t=${t} title=${bar.title} learned=${bar.learned} started=${bar.started} total=${bar.total} />
            </li>`;
          })}
        </ul>
      </section>` : null}
      ${!hasGroups ? html`<section aria-labelledby="units-title">
        <h2 id="units-title">${t('home.units')}</h2>
        ${c.active === 0 ? html`<p class="muted" data-testid="empty-course">${t('home.empty')}</p>` : html`<ul class="units" data-testid="units">
          ${c.totals && c.totals.total > 0 ? html`<li class="total-progress" data-testid="total-progress">
            <${ProgressBar} counts=${c.totals} ariaLabel=${t('progress.aria', c.totals)} />
          </li>` : null}
          ${(course.units || []).map(function (u) {
            var r = c.byUnit[u.id] || { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 };
            return html`<li key=${u.id} data-testid=${'unit-' + u.id}>
              <span class="unit-title">${renderText(u.title)}</span>
              ${r.total > 0 ? html`<${ProgressBar} counts=${r} ariaLabel=${t('progress.aria', r)} />` : null}
              <span class="unit-nums"><span title=${t('unit.total')}>${r.total}</span>
                <span class=${r.due ? 'due' : ''} title=${t('unit.due')}>${r.due}</span>
                <span title=${t('unit.new')}>${r.fresh}</span></span>
            </li>`;
          })}
        </ul>
        <p class="muted legend">${t('unit.legend')}</p>`}
      </section>` : null}
      ${hasGroups ? html`<section aria-labelledby="other-title">
        <h2 id="other-title">${t('home.ungrouped')}</h2>
        ${(function () {
          var inGroup = {};
          (course.groups || []).forEach(function (g) {
            (g.units || []).forEach(function (u) { inGroup[u] = true; });
          });
          var ungroupedUnits = (course.units || []).filter(function (u) { return !inGroup[u.id]; });
          if (ungroupedUnits.length === 0) return null;
          var row = function (u) {
            var r = c.byUnit[u.id] || { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 };
            return html`<li key=${u.id} class="bar-item" data-testid=${'unit-' + u.id}>
              <${ProgressMeter} t=${t} short=${true} title=${u.title} learned=${r.learned} started=${r.learning} total=${r.total} due=${r.due} dueTestid=${'unit-' + u.id + '-due'} />
            </li>`;
          };
          var study = ungroupedUnits.filter(function (u) { return u.newPerDay !== 0; });
          var examUnits = ungroupedUnits.filter(function (u) { return u.newPerDay === 0; });
          return html`${study.length ? html`<ul class="bars" data-testid="other-units">${study.map(row)}</ul>` : null}
            ${examUnits.length ? html`<details class="exam-units" data-testid="exam-units">
              <summary>${t('home.examUnits')}</summary>
              <ul class="bars">${examUnits.map(row)}</ul>
            </details>` : null}`;
        })()}
      </section>` : null}
    </main>`;
  }

  // ---------- Practice setup ----------

  class PracticeSetup extends Component {
    constructor(props) {
      super(props);
      this.state = { units: [], tags: [], types: [], count: 20 };
    }
    render(p, s) {
      var t = p.t;
      var self = this;
      var active = p.content.items.filter(function (it) { return it.status !== 'retired'; });
      var tags = uniqueSorted(active.reduce(function (a, it) { return a.concat(it.tags || []); }, [])).filter(function (tag) { return !tagInfo(p.course, tag).internal; });
      var types = uniqueSorted(active.map(function (it) { return it.type; }));
      function group(title, key, values, label) {
        if (!values.length) return null;
        return html`<fieldset class="group" data-testid=${'group-' + key}>
          <legend>${title}</legend>
          <div class="chips">${values.map(function (v) {
            return html`<${Chip} key=${v} on=${s[key].indexOf(v) >= 0} testid=${'chip-' + key + '-' + v}
              onClick=${function () { var o = {}; o[key] = toggle(s[key], v); self.setState(o); }}>${label(v)}<//>`;
          })}</div>
        </fieldset>`;
      }
      return html`<main class="screen" data-testid="practice">
        <header class="head"><h1>${t('practice.title')}</h1></header>
        <${Notice} text=${p.notice} />
        <p class="muted">${t('practice.hint')}</p>
        ${group(t('practice.units'), 'units', (p.course.units || []).map(function (u) { return u.id; }), function (id) {
          var u = (p.course.units || []).filter(function (x) { return x.id === id; })[0];
          return u ? renderText(u.title) : id;
        })}
        ${group(t('practice.tags'), 'tags', tags, function (x) { return tagInfo(p.course, x).label; })}
        ${group(t('practice.types'), 'types', types, function (x) { return t('type.' + x); })}
        <div class="group">
          <label class="legend-like">${t('practice.count')}</label>
          <${Stepper} testid="count" label=${t('practice.count')} value=${s.count} min=${5} max=${50} step=${5}
            decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} onChange=${function (v) { self.setState({ count: v }); }} />
        </div>
        <div class="row">
          <button type="button" class="btn" data-testid="btn-back" onClick=${function () { p.go('home'); }}>${t('back')}</button>
          <button type="button" class="btn primary" data-testid="btn-start" onClick=${function () {
            var opts = { limit: s.count };
            ['units', 'tags', 'types'].forEach(function (k) { if (s[k].length) opts[k] = s[k]; });
            p.onStart('practice', opts);
          }}>${t('practice.start')}</button>
        </div>
      </main>`;
    }
  }

  // ---------- Placement ----------

  class PlacementScreen extends Component {
    constructor(props) {
      super(props);
      this.state = { confirm: null, started: false };
    }
    start() {
      this.setState({ started: true });
      this.props.onStart();
    }
    render(p, s) {
      var t = p.t;
      var self = this;
      if (s.started) {
        return null;
      }
      var mode = p.course && p.course.placement && p.course.placement.mode ? p.course.placement.mode : 'check';
      var introKey = 'placement.intro.' + mode;
      return html`<main class="screen" data-testid="placement">
        <header class="head"><h1>${t('placement.title')}</h1></header>
        <p class="muted" data-testid="placement-intro">${t(introKey)}</p>
        <div class="row">
          <button type="button" class="btn" data-testid="btn-back" onClick=${function () { p.go('home'); }}>${t('back')}</button>
          <button type="button" class="btn primary" data-testid="btn-start-placement" onClick=${function () { self.start(); }}>${t('home.placement.start')}</button>
        </div>
      </main>`;
    }
  }

  // ---------- Placement Session ----------

  function kanjiRows(p, s, examMode) {
    var item = s.cur && s.cur.item;
    if (!item || !s.result || examMode || !DojoExt.kanjiBreakdown || !p.content || !p.content.items) return null;
    var breakdown = DojoExt.kanjiBreakdown(item, p.content.items, p.course.contentLanguage);
    if (!breakdown || !breakdown.length) return null;
    var t = p.t;
    return html`<ul class="kanji-rows" data-testid="kanji-rows">
      <li class="muted" data-testid="kanji-label">${t('session.kanji')}</li>
      ${breakdown.map(function (k) {
        var onRead = (Array.isArray(k.on) && k.on.length > 0) ? k.on.join(' / ') : null;
        var kunRead = (Array.isArray(k.kun) && k.kun.length > 0) ? k.kun.join(' / ') : null;
        var readings = [];
        if (onRead) readings.push(onRead);
        if (kunRead) readings.push(kunRead);
        var readStr = readings.join(' / ');
        return html`<li class="kanji-row-grid" data-testid="kanji-row">
          <span class="kanji-ch" data-testid="kanji-ch">${k.kanji}</span>
          <span class="kanji-mean" data-testid="kanji-mean">${k.meaning}</span>
          ${onRead || kunRead ? html`<span class="kanji-read muted" data-testid="kanji-read">
            ${onRead ? html`<span data-testid="kanji-on">${onRead}</span>` : null}
            ${onRead && kunRead ? ' / ' : ''}
            ${kunRead ? html`<span data-testid="kanji-kun">${kunRead}</span>` : null}
          </span>` : null}
        </li>`;
      })}
    </ul>`;
  }

  class PlacementSession extends Component {
    constructor(props) {
      super(props);
      var isCheckMode = this.isCheckMode(props);
      if (isCheckMode) {
        this.state = this.freshCheck(props.session.current());
      } else {
        this.state = this.fresh(props.session.current());
      }
      this.state.confirm = null;
      this.finishing = false;
      this.lastFocus = null;
      this.hadFocus = false;
    }
    isCheckMode(props) {
      var p = props || this.props;
      var session = p.session;
      return session && session.placementMode === 'check';
    }
    fresh(cur) {
      return { cur: cur, result: null, error: null };
    }
    freshCheck(cur) {
      var def = cur && DojoTypes.get(cur.item.type);
      return { cur: cur, result: null, picked: null, qstate: def ? def.initialState(cur.view) : {}, error: null, guard: null, retry: false, speechFail: false };
    }
    componentDidMount() {
      var self = this;
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.addEventListener) {
        this._onVoices = function () { self.forceUpdate(); };
        ss.addEventListener('voiceschanged', this._onVoices);
      }
      this.focusSoon();
    }
    componentWillUnmount() {
      if (Speech) Speech.stop(this.props.win);
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.removeEventListener && this._onVoices) ss.removeEventListener('voiceschanged', this._onVoices);
    }
    componentDidUpdate() { this.focusSoon(); }
    focusSoon() {
      var self = this;
      setTimeout(function () {
        var s = self.state;
        if (s.confirm) return;
        if (self.isCheckMode()) {
          var def = DojoTypes.get(s.cur.item.type);
          var last = self.lastFocus;
          var box = self.qbox;
          var doc = self.props.win && self.props.win.document;
          var active = doc && doc.activeElement;
          var inBox = !!(box && active && box.contains && box.contains(active));
          var had = self.hadFocus;
          self.hadFocus = inBox;
          if (last && last.cur === s.cur && last.answered === !!s.result) {
            var lost = doc && (!active || active === doc.body);
            if (had && lost && !s.result && box && box.querySelector) {
              var re = box.querySelector('[data-refocus]');
              if (re && re.focus) { re.focus(); self.hadFocus = true; }
            }
            return;
          }
          self.lastFocus = { cur: s.cur, answered: !!s.result };
          var el = s.result ? self.nextBtn : self.input;
          if (!el && !s.result && box && box.querySelector) el = box.querySelector('[data-autofocus]');
          if (el && el.focus) { el.focus(); self.hadFocus = !s.result; }
        } else {
          var btn = self.knownBtn || self.unknownBtn;
          if (btn && btn.focus) btn.focus();
        }
      }, 0);
    }
    answerCheck(input, picked) {
      var guard = DojoExt.beforeSubmit ? DojoExt.beforeSubmit(this.state.cur.item, input) : null;
      if (guard && typeof guard.message === 'string') { this.setState({ guard: guard.message }); return; }
      var r = this.props.session.answer(input);
      if (r.error) { this.setState({ error: r.error }); return; }
      if (r.verdict === 'retry') { this.setState({ retry: true, error: null, guard: null }); return; }
      this.setState({ result: r, picked: picked, error: null, guard: null });
    }
    answer(known) {
      if (this.state.result) return;
      var r = this.props.session.answer({ rating: known ? 'known' : 'again' });
      if (r.error) { this.setState({ error: r.error }); return; }
      this.setState({ result: r, error: null });
    }
    next() {
      var session = this.props.session;
      if (this.advancedFrom === this.state.cur) return;
      this.advancedFrom = this.state.cur;
      if (Speech) Speech.stop(this.props.win);
      var cur = session.next();
      if (session.done || !cur) { this.finish(); return; }
      var isCheck = this.isCheckMode();
      if (isCheck) {
        this.setState(this.freshCheck(cur));
      } else {
        this.setState(this.fresh(cur));
      }
    }
    finish() {
      if (this.finishing) return;
      var sum = this.props.session.finish();
      if (sum.error) { this.setState({ confirm: null, error: sum.error }); return; }
      this.finishing = true;
      this.props.onEnd(sum);
    }
    render(p, s) {
      var self = this;
      var t = p.t;
      var session = p.session;
      var cur = s.cur;
      if (!cur) return null;
      var isCheck = this.isCheckMode();
      var last = cur.position >= cur.total;
      
      if (isCheck) {
        return this.renderCheck(p, s, t, session, cur, last);
      } else {
        return this.renderSelf(p, s, t, session, cur, last);
      }
    }
    
    renderSelf(p, s, t, session, cur, last) {
      var self = this;
      var audio = null;
      var itemLines = [];
      if (Speech) {
        var cfg = speechCfg(p.course, p.store);
        audio = { t: t, win: p.win, cfg: cfg, uiLang: p.lang, exam: false, played: {}, status: Speech.status(cfg, p.win), onFail: function () {} };
        itemLines = speechLines(cur.item);
      }
      return html`<main class="screen session" data-testid="session" data-mode="placement">
        <div class="topbar">
          <button type="button" class="btn icon-btn" data-testid="btn-exit" aria-label=${t('session.exit')} title=${t('session.exit')} onClick=${function () { self.setState({ confirm: 'exit' }); }}><span aria-hidden="true">\u00d7</span></button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${cur.total} aria-valuenow=${cur.position}>
            <span style=${{ width: Math.round(100 * (cur.position - (s.result ? 0 : 1)) / cur.total) + '%' }}></span>
          </div>
          <span class="count" data-testid="progress">${cur.position} / ${cur.total}</span>
        </div>
        <article class="qcard">
          <${Stimulus} stimulus=${cur.stimulus} audio=${audio} />
          ${renderPromptLine(renderPromptEl(cur.item, false), cur.item, audio, itemLines)}
        </article>
        ${s.result ? html`<p class="notice" data-testid="recorded">${t('session.recorded')}</p>` : null}
        ${s.error ? html`<p class="notice bad" role="alert" data-testid="session-error">${t('session.error', { code: s.error })}</p>` : null}
        <div class="row center" style="gap: 1rem; justify-content: center;">
          <button type="button" class="btn primary big" data-testid="placement-known"
            ref=${function (el) { self.knownBtn = el; }}
            disabled=${!!s.result} onClick=${function () { self.answer(true); }}>${t('placement.known')}</button>
          <button type="button" class="btn big" data-testid="placement-unknown"
            ref=${function (el) { self.unknownBtn = el; }}
            disabled=${!!s.result} onClick=${function () { self.answer(false); }}>${t('placement.unknown')}</button>
        </div>
        <div class="row end" style=${s.result ? '' : 'opacity: 0;'}>
          <button type="button" class="btn primary" data-testid="btn-next"
            onClick=${function () { if (last) self.setState({ confirm: 'finish' }); else self.next(); }}>${last ? t('placement.finish') : t('session.next')}</button>
        </div>
        ${s.confirm === 'exit' ? html`<${Dialog} testid="dlg-exit" title=${t('session.exit.title')} body=${t('session.exit.body')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('session.exit')} danger=${true}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { p.onExit(); }} />` : null}
        ${s.confirm === 'finish' ? html`<${Dialog} testid="dlg-finish" title=${t('session.finish.title')}
          body=${t('session.finish.all')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('placement.finish')}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { self.setState({ confirm: null }); self.finish(); }} />` : null}
      </main>`;
    }
    
    renderCheck(p, s, t, session, cur, last) {
      var self = this;
      var audio = null;
      var itemLines = [];
      if (Speech) {
        var cfg = speechCfg(p.course, p.store);
        audio = { t: t, win: p.win, cfg: cfg, uiLang: p.lang, exam: false, played: this.played || (this.played = {}),
          status: s.speechFail ? 'unavailable' : Speech.status(cfg, p.win),
          onFail: function () { self.setState({ speechFail: true }); } };
      }
      
      var def = DojoTypes.get(cur.item.type);
      var questionEl = def ? h(def.Question, this.questionPropsCheck(p, s)) : html`<p class="notice bad" role="alert" data-testid="unsupported-type">${t('session.unsupported')}</p>`;
      
      return html`<main class="screen session" data-testid="session" data-mode="placement">
        <div class="topbar">
          <button type="button" class="btn" data-testid="btn-exit" onClick=${function () { self.setState({ confirm: 'exit' }); }}>${t('session.exit')}</button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${cur.total} aria-valuenow=${cur.position}>
            <span style=${{ width: Math.round(100 * (cur.position - (s.result ? 0 : 1)) / cur.total) + '%' }}></span>
          </div>
          <span class="count" data-testid="progress">${cur.position} / ${cur.total}</span>
        </div>
        <article class="qcard" ref=${function (el) { self.qbox = el; }}>
          <${Stimulus} stimulus=${cur.stimulus} audio=${this.audioPropsCheck(p, s, audio)} />
          ${renderPromptLine(renderPromptEl(cur.item, false), cur.item, audio, itemLines)}
          ${questionEl}
        </article>
        ${this.renderFeedbackCheck(p, s, t, def)}
        ${s.error ? html`<p class="notice bad" role="alert" data-testid="session-error">${t('session.error', { code: s.error })}</p>` : null}
        ${this.renderDontKnowCheck(p, s, t, session)}
        ${s.result ? html`<div class="row end">
          <button type="button" class="btn primary" data-testid="btn-next" ref=${function (el) { self.nextBtn = el; }}
            onClick=${function () { if (last) self.setState({ confirm: 'finish' }); else self.next(); }}>${last ? t('placement.finish') : t('session.next')}</button>
        </div>` : null}
        ${s.confirm === 'exit' ? html`<${Dialog} testid="dlg-exit" title=${t('session.exit.title')} body=${t('session.exit.body')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('session.exit')} danger=${true}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { p.onExit(); }} />` : null}
        ${s.confirm === 'finish' ? html`<${Dialog} testid="dlg-finish" title=${t('session.finish.title')}
          body=${t('session.finish.all')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('placement.finish')}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { self.setState({ confirm: null }); self.finish(); }} />` : null}
      </main>`;
    }
    
    questionPropsCheck(p, s) {
      var self = this;
      return {
        item: s.cur.item, view: s.cur.view, result: s.result, picked: s.picked, exam: false, t: p.t,
        state: s.qstate,
        setState: function (patch) { self.setState({ qstate: Object.assign({}, self.state.qstate, patch) }); },
        onSubmit: function (input, picked) { self.answerCheck(input, picked); },
        onReveal: function () { /* no reveal in placement */ },
        inputRef: function (el) { self.input = el; }
      };
    }
    
    audioPropsCheck(p, s, audio) {
      if (!audio) return null;
      var pid = 'i:' + (s.cur && s.cur.item && s.cur.item.id);
      var played = this.played || (this.played = {});
      var self = this;
      return { t: p.t, win: p.win, cfg: audio.cfg, exam: false, played: played,
        status: s.speechFail ? 'unavailable' : audio.status,
        onFail: function () { self.setState({ speechFail: true }); },
        pid: pid };
    }
    
    renderFeedbackCheck(p, s, t, def) {
      var res = s.result;
      if (!res) return null;
      var exam = false;
      var body = null;
      if (res) {
        var self = this;
        var showOverride = false;
        body = html`<div class=${cls('feedback', res.correct ? 'right' : 'wrong')} data-testid="feedback" role="status">
          <b data-testid="verdict">${def && def.verdict ? def.verdict(res, t) : (res.correct ? t('session.correct') : t('session.wrong'))}</b>
          ${!def || !def.hideExpected ? html`<p data-testid="expected">${t('session.expected')} <span class="pre">${renderTextAll(res.expected)}</span></p>` : null}
          ${def && def.Extra ? h(def.Extra, { result: res, t: t }) : null}
          ${res.explanation ? html`<p class="pre" data-testid="explanation">${renderTextAll(res.explanation)}</p>` : null}
          ${kanjiRows(p, s, false)}
          ${showOverride ? html`<button type="button" class="btn" data-testid="btn-override" onClick=${function () { self.overrideAnswer(); }}>${t('session.override')}</button>` : null}
        </div>`;
      } else if (s.retry) {
        body = html`<div class="feedback retry" data-testid="feedback-retry" role="status"><b>${t('session.retry')}</b> <span data-testid="retry-message">${t('session.retry.message')}</span></div>`;
      }
      return html`<div class="feedback-slot">${body}</div>`;
    }
    
    renderDontKnowCheck(p, s, t, session) {
      var item = s.cur && s.cur.item;
      if (!item || s.result || s.retry) return null;
      if (!session.canDontKnow || !session.canDontKnow()) return null;
      var self = this;
      return html`<button type="button" class="btn secondary" data-testid="btn-dont-know" onClick=${function () { self.dontKnowAnswer(); }}>${t('session.dontKnow')}</button>`;
    }
    
    dontKnowAnswer() {
      var r = this.props.session.dontKnow();
      if (r.error) { this.setState({ error: r.error }); return; }
      this.setState({ result: r, error: null, guard: null });
    }
  }

  // ---------- Session error boundary ----------

  // A render error inside a session screen shows a recoverable message; 'continue' remounts the screen on the
  // session's current item (a second failure on the same item moves past it).
  class SessionBoundary extends Component {
    constructor(props) {
      super(props);
      this.state = { error: null, epoch: 0 };
      this.failedAt = null;
    }
    componentDidCatch(err) {
      var cur = this.props.session.current && this.props.session.current();
      var pos = cur ? cur.position : -1;
      this.again = this.failedAt === pos;
      this.failedAt = pos;
      this.setState({ error: err });
    }
    resume() {
      var session = this.props.session;
      var finished = false;
      if (this.again) {
        session.next();
        finished = !!session.done;
        this.failedAt = null;
      }
      if (finished) { this.setState({ error: null }); this.props.onFinish(); return; }
      this.setState({ error: null, epoch: this.state.epoch + 1 });
    }
    render(p, s) {
      var self = this;
      if (!s.error) return h(Fragment, { key: s.epoch }, p.children);
      var t = p.t;
      return html`<main class="screen" data-testid="render-error" role="alert">
        <header class="head"><h1>${t('session.crash.title')}</h1></header>
        <p>${t('session.crash.body')}</p>
        <details><summary>${t('error.details')}</summary><pre class="pre mono">${String(s.error && (s.error.message || s.error))}</pre></details>
        <div class="row end">
          <button type="button" class="btn primary" data-testid="btn-continue" onClick=${function () { self.resume(); }}>${t('session.crash.continue')}</button>
          <button type="button" class="btn" data-testid="btn-crash-exit" onClick=${function () { p.onExit(); }}>${t('session.exit')}</button>
        </div>
      </main>`;
    }
  }

  // ---------- Session ----------

  class SessionScreen extends Component {
    constructor(props) {
      super(props);
      this.state = this.fresh(props.session.current());
      this.state.confirm = null;
      this.state.remaining = props.session.deadline ? props.session.deadline - props.now() : null;
      this.state.answered = 0;
      this.finishing = false;
      this.onKey = this.onKey.bind(this);
      this.onModality = this.onModality.bind(this);
    }
    initialQState(cur) {
      var def = cur && DojoTypes.get(cur.item.type);
      return def ? def.initialState(cur.view) : {};
    }
    fresh(cur) {
      var session = this.props.session;
      var card = cur && session.introFor ? session.introFor(cur.item) : null;
      var showIntro = !card && !!(cur && session.shouldShowIntro(cur.item));
      return { cur: cur, result: null, picked: null, qstate: this.initialQState(cur), error: null, guard: null, retry: false, speechFail: false, showIntro: showIntro, introCard: card };
    }
    componentDidMount() {
      var self = this;
      this.props.win.addEventListener('keydown', this.onKey);
      this.props.win.addEventListener('pointerdown', this.onModality);
      if (this.props.session.deadline !== undefined) {
        this.timer = setInterval(function () { self.tick(); }, 500);
      }
      if (this.props.session.saveDraft) {
        this.onHide = function (ev) {
          var d = self.props.win.document;
          if (!d || d.visibilityState === 'hidden' || ev.type === 'pagehide') self.props.session.saveDraft();
        };
        this.props.win.addEventListener('visibilitychange', this.onHide);
        this.props.win.addEventListener('pagehide', this.onHide);
      }
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.addEventListener) {
        this._onVoices = function () { self.forceUpdate(); };
        ss.addEventListener('voiceschanged', this._onVoices);
      }
      this.focusSoon();
    }
    componentWillUnmount() {
      this.props.win.removeEventListener('keydown', this.onKey);
      this.props.win.removeEventListener('pointerdown', this.onModality);
      if (Speech) Speech.stop(this.props.win);
      if (this.timer) clearInterval(this.timer);
      if (this.onHide) {
        this.props.win.removeEventListener('visibilitychange', this.onHide);
        this.props.win.removeEventListener('pagehide', this.onHide);
      }
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.removeEventListener && this._onVoices) ss.removeEventListener('voiceschanged', this._onVoices);
      if (this.props.session.release) this.props.session.release();
    }
    componentDidUpdate() { this.focusSoon(); }
    onModality(e) {
      this.kbd = e.type === 'keydown';
      var box = this.qbox;
      if (this.kbd && box && box.querySelectorAll) {
        var marked = box.querySelectorAll('[data-nofocusring]');
        for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-nofocusring');
      }
    }
    focusSoon() {
      var self = this;
      setTimeout(function () {
        var s = self.state;
        if (s.confirm) return;
        var last = self.lastFocus;
        var box = self.qbox;
        var doc = self.props.win && self.props.win.document;
        var active = doc && doc.activeElement;
        var inBox = !!(box && active && box.contains && box.contains(active));
        var had = self.hadFocus;
        self.hadFocus = inBox;
        if (last && last.cur === s.cur && last.answered === !!s.result && last.intro === !!s.introCard) {
          var lost = doc && (!active || active === doc.body);
          if (had && lost && !s.result && box && box.querySelector) {
            var re = box.querySelector('[data-refocus]');
            if (re && re.focus) { re.focus(); self.hadFocus = true; }
          }
          return;
        }
        self.lastFocus = { cur: s.cur, answered: !!s.result, intro: !!s.introCard };
        var el = s.introCard ? self.introBtn : s.result ? self.nextBtn : self.input;
        if (!el && !s.result && box && box.querySelector) el = box.querySelector('[data-autofocus]');
        if (el && el.focus) {
          if (!self.kbd && el.setAttribute) el.setAttribute('data-nofocusring', '');
          el.focus();
          self.hadFocus = !s.result;
        }
      }, 0);
    }
    tick() {
      var session = this.props.session;
      if (this.finishing) return;
      if (session.tickDraft) session.tickDraft();
      var left = session.deadline - this.props.now();
      if (left <= 0 && session.expire) {
        var r = session.expire();
        if (r.finished) { this.setState({ remaining: 0 }); this.finish(); return; }
        if (r.jumped) {
          if (Speech) Speech.stop(this.props.win);
          this.setState(Object.assign(this.fresh(session.current()), { remaining: Math.max(0, session.deadline - this.props.now()) }));
          return;
        }
      } else if (left <= 0) { this.setState({ remaining: 0 }); this.finish(); return; }
      this.setState({ remaining: Math.max(0, left) });
    }
    isExamMode() { return this.props.session.mode === 'exam'; }
    isExam() { return this.props.session.mode === 'exam' && !this.props.session.training; }
    onKey(e) {
      this.onModality(e);
      var s = this.state;
      if (s.confirm || !s.cur || DojoTypes.keyBlocked(e, {allowInput: true})) return;
      var tag = e.target && e.target.tagName;
      var advance = e.key === 'Enter' || e.key === 'ArrowRight';
      if (s.introCard) {
        if (advance && tag !== 'BUTTON' && tag !== 'A' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); this.introDone(); }
        return;
      }
      if (s.result && advance) {
        if (e.key === 'ArrowRight' && e.target === this.nextBtn) {
          e.preventDefault();
          this.next();
          return;
        }
        if (tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (tag === 'INPUT' && e.key === 'ArrowRight') return;
        if (tag === 'BUTTON') return;
        e.preventDefault();
        this.next();
        return;
      }
      var def = DojoTypes.get(s.cur.item.type);
      if (!def || !def.onKey) return;
      var hit = def.onKey(e, this.questionProps(this.props, s));
      if (hit) { e.preventDefault(); this.answer(hit.input, hit.picked); }
    }
    introDone() {
      var card = this.state.introCard;
      if (!card || this.introDoneOn === card) return;
      this.introDoneOn = card;
      this.props.session.markIntroSeen(card.id);
      this.setState({ introCard: null });
    }
    overrideAnswer() {
      if (this.overriddenOn === this.state.result) return;
      this.overriddenOn = this.state.result;
      var r = this.props.session.overrideLast();
      if (r.error) { this.setState({ error: r.error }); return; }
      this.setState({ result: r, error: null, guard: null });
    }
    answer(input, picked) {
      if (this.state.result || this.answeredOn === this.state.cur) return;
      var guard = DojoExt.beforeSubmit ? DojoExt.beforeSubmit(this.state.cur.item, input) : null;
      if (guard && typeof guard.message === 'string') { this.setState({ guard: guard.message }); return; }
      var r = this.props.session.answer(input);
      if (r.error) { this.setState({ error: r.error }); return; }
      if (r.verdict === 'retry') { this.setState({ retry: true, error: null, guard: null }); return; }
      this.answeredOn = this.state.cur;
      this.setState({ result: r, picked: picked, error: null, guard: null, answered: this.state.answered + 1 });
    }
    dontKnowAnswer() {
      if (this.state.result || this.answeredOn === this.state.cur) return;
      var r = this.props.session.dontKnow();
      if (r.error) { this.setState({ error: r.error }); return; }
      this.answeredOn = this.state.cur;
      this.setState({ result: r, error: null, guard: null, answered: this.state.answered + 1 });
    }
    reveal() {
      this.props.session.reveal();
      this.setState({ cur: this.props.session.current() });
    }
    next() {
      var session = this.props.session;
      if (this.advancedFrom === this.state.cur) return;
      this.advancedFrom = this.state.cur;
      if (Speech) Speech.stop(this.props.win);
      var cur = session.next();
      if (session.done || !cur) { this.finish(); return; }
      var next = this.fresh(cur);
      if (session.deadline !== undefined) next.remaining = Math.max(0, session.deadline - this.props.now());
      this.setState(next);
    }
    finish() {
      if (this.finishing) return;
      var sum = this.props.session.finish();
      if (sum.error) { this.setState({ confirm: null, error: sum.error }); return; }
      this.finishing = true;
      this.props.onEnd(sum);
    }
    questionProps(p, s) {
      var self = this;
      return {
        item: s.cur.item, view: s.cur.view, result: s.result, picked: s.picked, exam: this.isExam(), t: p.t,
        state: s.qstate,
        setState: function (patch) { self.setState({ qstate: Object.assign({}, self.state.qstate, patch) }); },
        onSubmit: function (input, picked) { self.answer(input, picked); },
        onReveal: function () { self.reveal(); },
        inputRef: function (el) { self.input = el; }
      };
    }
    audioProps(p, s) {
      var self = this;
      if (!Speech) return null;
      var cfg = speechCfg(p.course, p.store);
      return { t: p.t, win: p.win, cfg: cfg, exam: this.isExam(), uiLang: p.lang, played: this.played || (this.played = {}),
        status: s.speechFail ? 'unavailable' : Speech.status(cfg, p.win),
        onFail: function () { self.setState({ speechFail: true }); } };
    }
    renderQuestion(p, s) {
      var def = DojoTypes.get(s.cur.item.type);
      if (!def) return html`<p class="notice bad" role="alert" data-testid="unsupported-type">${p.t('session.unsupported')}</p>`;
      return h(def.Question, this.questionProps(p, s));
    }
    renderDontKnow(p, s) {
      var t = p.t;
      var session = p.session;
      var item = s.cur && s.cur.item;
      if (!item || s.result || s.retry) return null;
      if (!session.canDontKnow || !session.canDontKnow()) return null;
      var self = this;
      return html`<div class="row end">
        <button type="button" class="btn secondary" data-testid="btn-dont-know" onClick=${function () { self.dontKnowAnswer(); }}>${t('session.dontKnow')}</button>
      </div>`;
    }
    // Wrong-answer extras: entity intro body (plugin intro hook or title + text), else plugin detail hook and the declarative
    // detail, then the item's tags. Null for correct answers and when there is nothing to show.
    feedbackDetail(p, s) {
      var item = s.cur && s.cur.item;
      var session = p.session;
      if (!item || (s.result && s.result.correct)) return null;
      var ctx = { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: p.t, h: h };
      var unit = (p.course.units || []).filter(function (u) { return u.id === item.unit; })[0] || null;
      var decl = renderDeclarativeDetail(p.course, unit, item, p.t, true);
      var intro = session.entityIntro ? session.entityIntro(item) : null;
      var body = null;
      if (intro) {
        body = renderIntroBody(intro, item, ctx, decl, true);
      } else {
        var hook = DojoExt.detail ? DojoExt.detail(item, ctx) : null;
        body = hook ? html`<div data-testid="detail-hook">${hook}</div>` : decl;
      }
      var tags = (item.tags || []).filter(function (tg) { return typeof tg === 'string' && !tagInfo({ tagLabels: p.course.tagLabels }, tg).internal; });
      if (!body && !tags.length) return null;
      return html`<section class="feedback-detail" data-testid="feedback-detail">
        ${body}
        ${tags.length ? html`<p class="tags" data-testid="feedback-tags">${tags.map(function (tg) { return html`<span class="chip tag" key=${tg}>${tagInfo({ tagLabels: p.course.tagLabels }, tg).label}</span>`; })}</p>` : null}
      </section>`;
    }
    renderFeedback(p, s) {
      var t = p.t;
      var res = s.result;
      var exam = this.isExam();
      var body = null;
      if (res && exam) {
        body = html`<p class="muted" data-testid="recorded">${t('session.recorded')}</p>`;
      } else if (res) {
        var def = DojoTypes.get(s.cur.item.type) || {};
        var self = this;
        var showOverride = !res.correct && this.props.session.canOverride && this.props.session.canOverride();
        body = html`<div class=${cls('feedback', res.correct ? 'right' : 'wrong')} data-testid="feedback" role="status">
          <b data-testid="verdict">${def.verdict ? def.verdict(res, t) : (res.correct ? t('session.correct') : t('session.wrong'))}</b>
          ${!def.hideExpected && !res.correct ? html`<p data-testid="expected">${t('session.expected')} <span class="pre">${renderTextAll(res.expected)}</span></p>` : null}
          ${def.Extra ? h(def.Extra, { result: res, t: t }) : null}
          ${res.explanation ? html`<p class="pre" data-testid="explanation">${renderTextAll(res.explanation)}</p>` : null}
          ${this.feedbackDetail(p, s)}
          ${kanjiRows(p, s, this.isExamMode())}
          ${showOverride ? html`<button type="button" class="btn" data-testid="btn-override" onClick=${function () { self.overrideAnswer(); }}>${t('session.override')}</button>` : null}
        </div>`;
      } else if (s.retry) {
        body = html`<div class="feedback retry" data-testid="feedback-retry" role="status"><b>${t('session.retry')}</b> <span data-testid="retry-message">${t('session.retry.message')}</span></div>`;
      }
      return html`<div class="feedback-slot">${body}</div>`;
    }
    render(p, s) {
      var self = this;
      var t = p.t;
      var session = p.session;
      var cur = s.cur;
      if (!cur) return null;
      var exam = this.isExam();
      var examMode = this.isExamMode();
      var last = cur.position >= cur.total;
      var unanswered = session.total - session.answered;
      var audio = this.audioProps(p, s);
      var itemLines = audio ? speechLines(cur.item) : [];
      
      var showIntro = s.showIntro;
      var card = s.introCard;
      var caption = captionFor(p.course, cur.item, t);
      var plainPrompt = typeof cur.item.prompt === 'string' ? (DojoExt.plain ? DojoExt.plain(cur.item.prompt) : cur.item.prompt) : '';
      var bigPrompt = plainPrompt.length > 0 && plainPrompt.length <= 6 && plainPrompt.indexOf('\n') < 0;

      return html`<main class="screen session" data-testid="session" data-mode=${session.mode}>
        <div class="topbar">
          <button type="button" class="btn icon-btn" data-testid="btn-exit" aria-label=${t('session.exit')} title=${t('session.exit')} onClick=${function () { self.setState({ confirm: 'exit' }); }}><span aria-hidden="true">\u00d7</span></button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${cur.total} aria-valuenow=${cur.position}>
            <span style=${{ width: Math.round(100 * (cur.position - (s.result ? 0 : 1)) / cur.total) + '%' }}></span>
          </div>
          <span class="count" data-testid="progress">${Math.min(cur.position, session.initialTotal)} / ${session.initialTotal}</span>
          ${session.retryCount() > 0 ? html`<span class="badge retry" data-testid="retry-badge">${t('session.retries', { n: session.retryCount() })}</span>` : null}
          ${session.group && session.group.count > 1 ? html`<span class="count" data-testid="group">${t('session.group', { n: session.group.index + 1, total: session.group.count })}</span>` : null}
          ${s.remaining !== null ? html`<span class=${cls('timer', s.remaining < 60000 && 'low')} data-testid="timer">${fmtClock(s.remaining)}</span>` : null}
        </div>
        ${session.warnings ? html`<p class="notice" data-testid="exam-short">${t('session.short')}</p>` : null}
        ${card ? html`<article class="qcard intro-card" data-testid="intro-card">
          <span class="badge" data-testid="intro-label">${t('intro.label')}</span>
          ${(function () {
            var introBody = renderIntroBody(card, cur.item, { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: t, h: h }, renderDeclarativeDetail(p.course, (p.course.units || []).find(function (u) { return u.id === cur.item.unit; }) || null, cur.item, p.t));
            var speakable = audio && card.speak;
            if (speakable) {
              return html`<div class="qline">
                <div class="qbody">${introBody}</div>
                <${Playback} audio=${audio} lines=${speechLines(card)} testid="play-intro" pid=${'n:' + card.id} />
              </div>`;
            }
            return introBody;
          })()}
        </article>
        <div class="row end">
          <button type="button" class="btn primary" data-testid="btn-intro-done" ref=${function (el) { self.introBtn = el; }}
            onClick=${function () { self.introDone(); }}>${t('intro.gotit')}</button>
        </div>` : html`<article class="qcard">
          ${showIntro ? html`<div class="intro" data-testid="intro">${renderText(cur.item.explanation)}</div>` : null}
          <${Stimulus} stimulus=${cur.stimulus} audio=${audio} />
          ${caption ? html`<p class="qcaption" data-testid="caption">${caption}</p>` : null}
          ${renderPromptLine(renderPromptEl(cur.item, bigPrompt), cur.item, audio, itemLines)}
          <div style="display: contents" ref=${function (el) { self.qbox = el; }}>${this.renderQuestion(p, s)}</div>
        </article>`}
        ${card ? null : this.renderFeedback(p, s)}
        ${s.guard ? html`<p class="notice bad" role="alert" data-testid="guard-message">${s.guard}</p>` : null}
        ${s.error ? html`<p class="notice bad" role="alert" data-testid="session-error">${t('session.error', { code: s.error })}</p>` : null}
        ${card ? null : html`<div class="row actions-row">
          ${this.renderDontKnow(p, s)}
          ${examMode ? html`<button type="button" class="btn" data-testid="btn-finish" onClick=${function () { self.setState({ confirm: 'finish' }); }}>${t('session.finish')}</button>` : null}
          <button type="button" class="btn primary" disabled=${!exam && !s.result} data-testid="btn-next"
            ref=${function (el) { self.nextBtn = el; }}
            title=${t('session.next.withArrow')} aria-label=${t('session.next.withArrow')}
            onClick=${function () { if (examMode && last) self.setState({ confirm: 'finish' }); else self.next(); }}>${examMode && last ? t('session.finish') : t('session.next')}</button>
        </div>`}
        ${s.confirm === 'exit' ? html`<${Dialog} testid="dlg-exit" title=${t('session.exit.title')} body=${t('session.exit.body')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('session.exit')} danger=${true}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { p.onExit(); }} />` : null}
        ${s.confirm === 'finish' ? html`<${Dialog} testid="dlg-finish" title=${t('session.finish.title')}
          body=${unanswered > 0 ? t('session.finish.unanswered', { n: unanswered }) : t('session.finish.all')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('session.finish')}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { self.setState({ confirm: null }); self.finish(); }} />` : null}
      </main>`;
    }
  }

  // ---------- Results ----------

  function Results(p) {
    var t = p.t;
    var sum = p.summary;
    var exam = sum.mode === 'exam';
    var isPlacement = sum.mode === 'placement';
    var missed = sum.review.filter(function (r) { return !r.correct; });
    var total = exam ? sum.total : sum.answered;
    var pct = exam ? percent(sum.fraction) : percent(total ? sum.correct / total : 0);
    var raw = exam ? sum.raw : sum.correct;
    function label(r, value) {
      return value === 'known' ? t('session.known') : value === 'again' ? t('session.again') : value === '-' ? t('session.dontKnow') : value;
    }
    return html`<main class="screen" data-testid="results">
      <header class="head"><h1>${t('results.title')}</h1></header>
      ${isPlacement ? html`<p class="banner good" data-testid="placement-result">${t('results.placement')}</p>` : null}
      ${exam ? html`<p class=${cls('banner', sum.pass ? 'good' : 'bad')} data-testid="exam-verdict">${sum.estimate ? (sum.pass ? t('results.pass_estimate') : t('results.fail_estimate')) : (sum.pass ? t('results.pass') : t('results.fail'))}</p>` : null}
      ${exam && sum.estimate ? html`<p class="notice" data-testid="exam-estimate">${t('results.estimate_note')}</p>` : null}
      ${exam && sum.training ? html`<p class="notice" data-testid="exam-training">${t('results.training')}</p>` : null}
      ${!isPlacement ? html`<section class="stats">
        <div class="stat" data-testid="score"><b>${raw} / ${total}</b><span>${t('results.score')}</span></div>
        <div class="stat" data-testid="percent"><b>${pct}%</b><span>${t('results.percent')}</span></div>
        <div class="stat" data-testid="time"><b>${fmtClock(sum.durationMs)}</b><span>${t('results.time')}</span></div>
      </section>` : null}
      ${!isPlacement && raw === 0 && total > 0 ? html`<p class="notice" data-testid="results-hint">${t('results.hint')}</p>` : null}
      ${exam && sum.parts && sum.parts.length ? html`<section data-testid="exam-parts">
        <h2>${t('results.parts')}</h2>
        <ul class="parts">
          ${sum.parts.map(function (part, i) {
            return html`<li key=${i} data-testid=${'part-' + i}>
              <b>${part.title}</b>: <span>${part.raw} / ${part.total}</span> · <span>${t('results.points', { n: part.points })}</span> · <span class=${part.pass ? 'good' : 'bad'}>${part.pass ? t('results.pass') : t('results.fail')}</span>
            </li>`;
          })}
        </ul>
        <p data-testid="exam-total-points"><b>${t('results.total_points', { n: sum.totalPoints })}</b>${sum.passPoints !== undefined ? ' · ' + t('results.pass_points', { n: sum.passPoints }) : ''}</p>
      </section>` : null}
      ${exam && sum.note ? html`<p class="notice" data-testid="exam-note">${sum.note}</p>` : null}
      ${exam && sum.short && sum.short.length ? html`<p class="notice">${t('session.short')}</p>` : null}
      ${!isPlacement ? html`<section>
        <h2>${t('results.missed')}</h2>
        ${missed.length === 0 && (!sum.skipped || sum.skipped.length === 0) ? html`<p class="muted" data-testid="no-missed">${t('results.none')}</p>` : html`<ul class="missed" data-testid="missed">
          ${missed.map(function (r) {
            var item = p.byId[r.id];
            return html`<li key=${r.id} data-testid=${'missed-' + r.id}>
              <p class="qtext">${item ? renderText(item.prompt) : r.id}</p>
              <p class="pre"><span class="muted">${t('results.given')}:</span> ${renderText(label(r, r.given))}</p>
              <p class="pre"><span class="muted">${t('session.expected')}</span> ${renderText(r.expected)}</p>
            </li>`;
          })}
          ${sum.skipped && sum.skipped.length > 0 ? sum.skipped.map(function (id) {
            var item = p.byId[id];
            return html`<li key=${id} data-testid=${'skipped-' + id} class="skipped">
              <p class="qtext">${item ? renderText(item.prompt) : id}</p>
              <p class="muted" data-testid="skipped-label">${t('results.skipped')}</p>
            </li>`;
          }) : null}
        </ul>`}
      </section>` : null}
      <div class="row results-actions">
        <button type="button" class="btn" data-testid="btn-home" onClick=${function () { p.go('home'); }}>${t('results.home')}</button>
        ${!isPlacement ? html`<button type="button" class="btn primary btn-again-session" data-testid="btn-again-session" onClick=${p.onAgain}>${t('results.again')}</button>` : null}
      </div>
    </main>`;
  }

  // ---------- Settings ----------

  function resolveLabel(label, lang) {
    if (typeof label === 'string') return label;
    if (label && typeof label === 'object') {
      if (typeof label[lang] === 'string') return label[lang];
      if (typeof label[primaryTag(lang)] === 'string') return label[primaryTag(lang)];
      if (typeof label.en === 'string') return label.en;
    }
    return '';
  }

  function renderPluginSettings(p, self) {
    var registeredSettings = DojoExt.getRegisteredSettings ? DojoExt.getRegisteredSettings() : [];
    if (registeredSettings.length === 0) return null;

    var t = p.t;
    var doc = p.store.doc;
    var lang = p.lang || (p.course && p.course.uiLanguage) || 'en';

    return html`<section class="group" data-testid="plugin-settings">
      <h2>${t('settings.plugins')}</h2>
      ${registeredSettings.map(function (setting) {
        var currentValue = doc.settings && doc.settings['plugin:' + setting.key];
        var effectiveValue = setting.default;
        setting.options.forEach(function (o) { if (o.value === currentValue) effectiveValue = currentValue; });
        var selId = 'plugin-setting-' + setting.key;
        var label = resolveLabel(setting.label, lang);
        return html`<div class="setting-row" key=${setting.key} data-testid="plugin-setting-${setting.key}">
          <label for=${selId}>${label}</label>
          <select class="field" id=${selId} data-testid="select-${setting.key}" value=${effectiveValue}
            onChange=${function (e) {
              var raw = e.target.value;
              var match = setting.options.filter(function (o) { return String(o.value) === raw; })[0];
              if (match) self.setSetting('plugin:' + setting.key, match.value);
            }}>
            ${setting.options.map(function (opt) {
              var optLabel = resolveLabel(opt.label || opt.value, lang);
              return html`<option key=${opt.value} value=${opt.value}>${optLabel}</option>`;
            })}
          </select>
        </div>`;
      })}
    </section>`;
  }

  function speechVoices(win) {
    var ss = win && win.speechSynthesis;
    var list = ss && typeof ss.getVoices === 'function' ? ss.getVoices() : [];
    return Array.prototype.slice.call(list || []);
  }

  function renderSpeechSettings(p, self) {
    var course = p.course || {};
    if (!Speech || !(course.speech || course.contentLanguage)) return null;
    var t = p.t;
    var settings = (p.store.doc && p.store.doc.settings) || {};
    var voices = speechVoices(p.win);
    if (voices.length === 0) {
      return html`<section class="group" data-testid="speech-settings">
        <h2>${t('settings.speech')}</h2>
        <p class="notice" role="status" data-testid="speech-novoices">${t('settings.speech.novoices')}</p>
      </section>`;
    }
    var lang = String(Speech.langOf({ speech: course.speech, lang: course.contentLanguage }) || '').toLowerCase().split(/[-_]/)[0];
    var pool = lang ? voices.filter(function (v) { return String(v.lang || '').toLowerCase().split(/[-_]/)[0] === lang; }) : voices;
    if (pool.length === 0) pool = voices;
    var roles = Object.keys((course.speech && course.speech.voices) || {});
    function voiceRow(key, label, role) {
      var cur = typeof settings[key] === 'string' && settings[key] !== '' ? settings[key] : '';
      var known = !cur || pool.some(function (v) { return v.name === cur; });
      var id = 'speech-' + key.replace(/[^a-z0-9]+/gi, '-');
      return html`<div class="setting-row" key=${key}>
        <label for=${id}>${label}</label>
        <div class="row">
          <select class="field" id=${id} data-testid=${'speech-voice-' + (role || 'default')} value=${cur}
            onChange=${function (e) { self.setSetting(key, e.target.value === '' ? null : e.target.value); }}>
            <option key="auto" value="">${t('settings.speech.auto')}</option>
            ${known ? null : html`<option key="missing" value=${cur}>${t('settings.speech.missing', { name: cur })}</option>`}
            ${pool.map(function (v) { return html`<option key=${'v:' + v.name} value=${v.name}>${v.name + (v.lang ? ' (' + v.lang + ')' : '')}</option>`; })}
          </select>
          <button type="button" class="btn" data-testid=${'speech-test-' + (role || 'default')}
            onClick=${function () { self.testSpeech(role); }}>${t('settings.speech.test')}</button>
        </div>
      </div>`;
    }
    function rangeRow(key, label, min, max) {
      var v = typeof settings[key] === 'number' ? settings[key] : 1;
      var id = 'speech-' + key.replace(/[^a-z0-9]+/gi, '-');
      return html`<div class="setting-row" key=${key}>
        <label for=${id}>${label}: <output data-testid=${'speech-' + key.split(':')[1] + '-value'}>${v}</output></label>
        <input type="range" class="field" id=${id} data-testid=${'speech-' + key.split(':')[1]} min=${min} max=${max} step="0.1" value=${v}
          onChange=${function (e) { var n = parseFloat(e.target.value); if (isFinite(n)) self.setSetting(key, Math.min(max, Math.max(min, n))); }} />
      </div>`;
    }
    return html`<section class="group speech-settings" data-testid="speech-settings">
      <h2>${t('settings.speech')}</h2>
      <p class="muted">${t('settings.speech.hint')}</p>
      ${voiceRow('speech:voice', t('settings.speech.voice.default'), null)}
      ${roles.map(function (role) { return voiceRow('speech:voice:' + role, t('settings.speech.voice.role', { role: role }), role); })}
      ${rangeRow('speech:rate', t('settings.speech.rate'), 0.5, 1.5)}
      ${rangeRow('speech:pitch', t('settings.speech.pitch'), 0, 2)}
    </section>`;
  }

  class SettingsScreen extends Component {
    constructor(props) {
      super(props);
      this.state = { exportText: props.store.exportText(), importText: '', importMsg: null, copied: null, resetStep: 0, resetDone: false, unitDialog: null, unitSettingsCache: null, groupDialog: null };
      this._onKeyDown = this._onKeyDown.bind(this);
    }
    componentDidMount() {
      var self = this;
      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', this._onKeyDown);
      }
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.addEventListener) {
        this._onVoices = function () { self.setState({ voicesTick: (self.state.voicesTick || 0) + 1 }); };
        ss.addEventListener('voiceschanged', this._onVoices);
      }
    }
    testSpeech(role) {
      var p = this.props;
      if (!Speech) return;
      var sample = null;
      var items = p.content.items;
      for (var i = 0; i < items.length && !sample; i++) {
        var ln = typeof items[i].speak === 'string' ? Speech.lines(items[i]) : [];
        if (ln.length) sample = ln[0].text;
      }
      var line = { text: sample || p.t('settings.speech.testText') };
      if (role) line.voice = role;
      Speech.stop(p.win);
      Speech.play([line], speechCfg(p.course, p.store), {}, p.win);
    }
    componentWillUnmount() {
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.removeEventListener && this._onVoices) ss.removeEventListener('voiceschanged', this._onVoices);
      if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', this._onKeyDown);
      }
    }
    _onKeyDown(e) {
      if (e.key === 'Escape') {
        if (this.state.groupDialog) {
          e.preventDefault();
          this.closeGroupDialog();
        } else if (this.state.unitDialog) {
          e.preventDefault();
          this.closeUnitDialog();
        }
      }
    }
    setNewPerDay(v) {
      var p = this.props;
      p.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.newPerDay = v;
        doc.settings.ts = doc.settings.ts || {};
        doc.settings.ts.newPerDay = p.now();
      });
      this.setState({ exportText: p.store.exportText() });
    }
    setSetting(key, value) {
      var p = this.props;
      p.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings[key] = value; // null is a tombstone; the fresh ts below lets the clear win a merge
        doc.settings.ts = doc.settings.ts || {};
        doc.settings.ts[key] = p.now();
      });
      this.setState({ exportText: p.store.exportText() });
    }
    setTheme(theme) {
      this.setSetting('theme', theme);
      applyTheme(this.props.win, theme);
    }
    copy() {
      var self = this;
      var text = this.state.exportText;
      var nav = this.props.win.navigator;
      function fallback() {
        var ok = false;
        try {
          self.exportArea.focus();
          self.exportArea.select();
          ok = !!self.props.win.document.execCommand('copy');
        } catch (e) { ok = false; }
        self.setState({ copied: ok ? 'ok' : 'manual' });
      }
      if (nav && nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(text).then(function () { self.setState({ copied: 'ok' }); }, fallback);
      } else fallback();
    }
    doImport() {
      var r = this.props.store.importText(this.state.importText);
      var msg;
      if (r.ok) msg = { kind: 'ok', text: this.props.t('import.ok', { n: r.added }) };
      else if (r.code === 'other_course') msg = { kind: 'bad', text: this.props.t('import.other_course') };
      else if (r.code === 'invalid_json' || r.code === 'not_progress') msg = { kind: 'bad', text: this.props.t('import.invalid') };
      else msg = { kind: 'bad', text: this.props.t('import.failed') };
      this.setState({ importMsg: msg, exportText: this.props.store.exportText(), importText: r.ok ? '' : this.state.importText });
      if (r.ok) this.props.onDataChanged();
    }
    doReset() {
      var self = this;
      this.props.store.reset();
      this.setState({ resetStep: 0, resetDone: true, exportText: this.props.store.exportText(), importMsg: null });
      this.props.onDataChanged();
      void self;
    }
    // Course-resolved value (WASM unitConfig, no user overrides). ladderScale has no course level: 1 = unscaled.
    getCourseUnitValue(unitId, field) {
      var p = this.props;
      if (field === 'ladderScale') return 1;
      var resolved = p.engine.unitConfig(unitId);
      if (field === 'newPerDay') {
        return typeof resolved.newPerDay === 'number' ? resolved.newPerDay : p.engine.globalNewPerDay();
      }
      if (field === 'dropOnWrong') {
        // srsByType is per item type: a unit whose items share one type shows that type's drop.
        var types = {};
        p.content.items.forEach(function (it) { if (it.unit === unitId && it.status !== 'retired') types[it.type] = true; });
        var names = Object.keys(types);
        if (names.length === 1 && typeof resolved.dropByType[names[0]] === 'number') return resolved.dropByType[names[0]];
      }
      return resolved[field];
    }
    getEffectiveUnitSettings(unitId) {
      var p = this.props;
      var override = p.engine.unitSettings(unitId);
      var courseUnit = null;
      var units = p.course.units || [];
      for (var i = 0; i < units.length; i++) {
        if (units[i].id === unitId) {
          courseUnit = units[i];
          break;
        }
      }
      var effective = {
        newPerDay: override.newPerDay !== undefined ? override.newPerDay : this.getCourseUnitValue(unitId, 'newPerDay'),
        ladderScale: override.ladderScale !== undefined ? override.ladderScale : this.getCourseUnitValue(unitId, 'ladderScale'),
        dropOnWrong: override.dropOnWrong !== undefined ? override.dropOnWrong : this.getCourseUnitValue(unitId, 'dropOnWrong'),
        newOrder: override.newOrder !== undefined ? override.newOrder : this.getCourseUnitValue(unitId, 'newOrder')
      };
      return { effective: effective, override: override, courseUnit: courseUnit };
    }
    unitSettingsSummary(unitId) {
      var t = this.props.t;
      var eff = this.getEffectiveUnitSettings(unitId);
      var e = eff.effective;
      var course = {
        newPerDay: this.getCourseUnitValue(unitId, 'newPerDay'),
        ladderScale: this.getCourseUnitValue(unitId, 'ladderScale'),
        dropOnWrong: this.getCourseUnitValue(unitId, 'dropOnWrong'),
        newOrder: this.getCourseUnitValue(unitId, 'newOrder')
      };
      var parts = [];
      var paceKey = eff.override.ladderScale === undefined ? 'settings.unitSettings.ladderPace.option.asInCourse' : 'settings.unitSettings.pace.x' + e.ladderScale;
      var pace = t(paceKey);
      if (pace && e.ladderScale !== course.ladderScale) parts.push(pace);
      var drop = e.dropOnWrong <= 3 ? t('settings.unitSettings.drop.' + e.dropOnWrong) : t('settings.unitSettings.dropN', { n: e.dropOnWrong });
      if (drop && e.dropOnWrong !== course.dropOnWrong) parts.push(drop);
      if (e.newPerDay !== undefined && e.newPerDay !== course.newPerDay) parts.push(e.newPerDay + '/' + t('duration.day.short'));
      var order = t('settings.unitSettings.order.' + e.newOrder);
      if (order && e.newOrder !== course.newOrder) parts.push(order);
      if (parts.length === 0) return '';
      return parts.join(', ');
    }
    formatLadderPreview(ladder, t) {
      if (!ladder || ladder.length === 0) return '';
      var parts = [];
      for (var i = 1; i < ladder.length; i++) {
        parts.push(Math.round(ladder[i] / 86400000) + t('duration.day.short'));
      }
      return parts.join(', ');
    }
    getLadderPreview(unitId) {
      var p = this.props;
      return this.formatLadderPreview(p.engine.unitLadder(unitId), p.t);
    }
    openUnitDialog(unitId) {
      var self = this;
      var result = this.getEffectiveUnitSettings(unitId);
      var effective = result.effective;
      var override = result.override;
      var courseUnit = result.courseUnit;
      var unit = courseUnit || { id: unitId, title: unitId };
      var p = this.props;
      var courseDefaults = {
        newPerDay: this.getCourseUnitValue(unitId, 'newPerDay'),
        ladderScale: this.getCourseUnitValue(unitId, 'ladderScale'),
        dropOnWrong: this.getCourseUnitValue(unitId, 'dropOnWrong'),
        newOrder: this.getCourseUnitValue(unitId, 'newOrder')
      };
      this.setState({
        unitDialog: {
          initial: Object.assign({}, override),
          unitId: unitId,
          unitTitle: DojoExt.plain ? DojoExt.plain(unit.title) : unit.title,
          effective: effective,
          override: override,
          course: {
            newPerDay: courseDefaults.newPerDay !== undefined ? courseDefaults.newPerDay : undefined,
            ladderScale: courseDefaults.ladderScale,
            dropOnWrong: courseDefaults.dropOnWrong !== undefined ? courseDefaults.dropOnWrong : undefined,
            newOrder: courseDefaults.newOrder !== undefined ? courseDefaults.newOrder : undefined
          },
          ladderPreview: this.getLadderPreview(unitId)
        }
      });
    }
    closeUnitDialog(keep) {
      var d = this.state.unitDialog;
      if (d && !keep && d.initial) {
        var patch = {};
        ['newPerDay', 'ladderScale', 'dropOnWrong', 'newOrder'].forEach(function (f) { patch[f] = d.initial[f] !== undefined ? d.initial[f] : null; });
        var r = this.props.engine.setUnitSetting(d.unitId, patch);
        if (!r.error) { this.props.onDataChanged(); this.setState({ exportText: this.props.store.exportText() }); }
      }
      this.setState({ unitDialog: null });
    }
    setUnitSettingField(unitId, field, value) {
      var p = this.props;
      var patch = {};
      patch[field] = value;
      var result = p.engine.setUnitSetting(unitId, patch);
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.unitSettings.error', { field: field, error: result.error }) });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        unitDialog: this.state.unitDialog ? Object.assign({}, this.state.unitDialog, {
          effective: this.getEffectiveUnitSettings(unitId).effective,
          override: p.engine.unitSettings(unitId),
          ladderPreview: this.getLadderPreview(unitId)
        }) : null
      });
    }
    resetUnitSettings(unitId) {
      var p = this.props;
      var result = p.engine.setUnitSetting(unitId, { newPerDay: null, ladderScale: null, dropOnWrong: null, newOrder: null });
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.unitSettings.reset.error') });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        unitDialog: null
      });
    }
    // Group settings helpers
    getEffectiveGroupSettings(groupId) {
      var p = this.props;
      var courseGroups = p.course.groups || [];
      var courseGroup = null;
      for (var i = 0; i < courseGroups.length; i++) {
        if (courseGroups[i].id === groupId) {
          courseGroup = courseGroups[i];
          break;
        }
      }
      var override = p.engine.groupSettings ? p.engine.groupSettings(groupId) : {};
      var effective = {
        newPerDay: override.newPerDay !== undefined ? override.newPerDay : (courseGroup ? courseGroup.newPerDay : undefined),
        newOrder: override.newOrder !== undefined ? override.newOrder : (courseGroup ? courseGroup.newOrder : 'file'),
        onlyTags: override.onlyTags !== undefined ? override.onlyTags : (courseGroup ? courseGroup.onlyTags : undefined)
      };
      return { effective: effective, override: override, courseGroup: courseGroup };
    }
    groupSettingsSummary(groupId) {
      var t = this.props.t;
      var eff = this.getEffectiveGroupSettings(groupId);
      var e = eff.effective;
      var courseGroup = eff.courseGroup;
      var courseDefaults = {
        newPerDay: courseGroup ? courseGroup.newPerDay : undefined,
        newOrder: courseGroup ? courseGroup.newOrder : 'file',
        onlyTags: courseGroup ? courseGroup.onlyTags : undefined
      };
      var parts = [];
      if (e.newPerDay !== undefined && e.newPerDay !== courseDefaults.newPerDay) {
        parts.push(e.newPerDay + '/' + t('duration.day.short'));
      }
      var order = t('settings.unitSettings.order.' + (e.newOrder || 'file'));
      if (order && e.newOrder !== courseDefaults.newOrder) parts.push(order);
      if (e.onlyTags !== undefined && JSON.stringify(e.onlyTags) !== JSON.stringify(courseDefaults.onlyTags)) {
        parts.push(t('settings.groupSettings.onlyTags') + ': ' + e.onlyTags);
      }
      if (parts.length === 0) return '';
      return parts.join(', ');
    }
    openGroupDialog(groupId) {
      var result = this.getEffectiveGroupSettings(groupId);
      var effective = result.effective;
      var override = result.override;
      var courseGroup = result.courseGroup || { id: groupId, title: groupId };
      var p = this.props;
      var courseDefaults = {
        newPerDay: courseGroup.newPerDay !== undefined ? courseGroup.newPerDay : undefined,
        newOrder: courseGroup.newOrder !== undefined ? courseGroup.newOrder : 'file',
        onlyTags: courseGroup.onlyTags !== undefined ? courseGroup.onlyTags : undefined
      };
      this.setState({
        groupDialog: {
          initial: Object.assign({}, override),
          groupId: groupId,
          groupTitle: DojoExt.plain ? DojoExt.plain(courseGroup.title) : courseGroup.title,
          effective: effective,
          override: override,
          course: courseDefaults,
          extraTags: courseGroup.extraTags || []
        }
      });
    }
    closeGroupDialog(keep) {
      var d = this.state.groupDialog;
      if (d && !keep && d.initial) {
        var patch = {};
        ['newPerDay', 'newOrder', 'onlyTags', 'extraRandom'].forEach(function (f) { patch[f] = d.initial[f] !== undefined ? d.initial[f] : null; });
        var r = this.props.engine.setGroupSetting(d.groupId, patch);
        if (!r.error) { this.props.onDataChanged(); this.setState({ exportText: this.props.store.exportText() }); }
      }
      this.setState({ groupDialog: null });
    }
    setGroupSettingField(groupId, field, value) {
      var p = this.props;
      var patch = {};
      patch[field] = value;
      var result = p.engine.setGroupSetting(groupId, patch);
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.groupSettings.error', { field: field, error: result.error }) });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        groupDialog: this.state.groupDialog ? Object.assign({}, this.state.groupDialog, {
          effective: this.getEffectiveGroupSettings(groupId).effective,
          override: p.engine.groupSettings ? p.engine.groupSettings(groupId) : {}
        }) : null
      });
    }
    resetGroupSettings(groupId) {
      var p = this.props;
      var result = p.engine.setGroupSetting(groupId, { newPerDay: null, newOrder: null, onlyTags: null, extraRandom: null });
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.groupSettings.reset.error') });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        groupDialog: null
      });
    }
    ladderScaleToValue(scale) {
      if (scale === 0.5) return '0.5';
      if (scale === 0.75) return '0.75';
      if (scale === 1) return '1';
      if (scale === 1.5) return '1.5';
      if (scale === 2) return '2';
      if (scale === 3) return '3';
      return String(scale);
    }
    ladderScaleFromValue(value) {
      if (value === '0.5') return 0.5;
      if (value === '0.75') return 0.75;
      if (value === '1') return 1;
      if (value === '1.5') return 1.5;
      if (value === '2') return 2;
      if (value === '3') return 3;
      return parseFloat(value) || 1;
    }
    render(p, s) {
      var t = p.t;
      var self = this;
      var doc = p.store.doc;
      var perDay = doc.settings && typeof doc.settings.newPerDay === 'number' ? doc.settings.newPerDay : p.engine.globalNewPerDay();
      var theme = doc.settings && doc.settings.theme ? doc.settings.theme : 'auto';
      var examDate = doc.settings && doc.settings.examDate ? doc.settings.examDate : '';
      var retired = p.content.items.filter(function (it) { return it.status === 'retired'; }).length;
      return html`<main class="screen settings-screen" data-testid="settings">
        <header class="head"><h1>${t('settings.title')}</h1><${StatusChip} t=${t} status=${p.status} /></header>
        <${Notice} text=${p.notice} />
        <section class="group">
          <h2>${t('settings.newperday')}</h2>
          <p class="muted">${t('settings.newperday.hint')}</p>
          <${Stepper} testid="newperday" label=${t('settings.newperday')} value=${perDay} min=${0} max=${50} step=${1}
            decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} onChange=${function (v) { self.setNewPerDay(v); }} />
        </section>
        <section class="group">
          <h2><label for="theme-select">${t('settings.theme')}</label></h2>
          <p class="muted">${t('settings.theme.hint')}</p>
          <select id="theme-select" class="field" data-testid="theme-select" value=${theme}
            onChange=${function (e) { self.setTheme(e.target.value); }}>
            ${['auto', 'light', 'dark'].map(function (v) {
              return html`<option key=${v} value=${v} selected=${theme === v}>${t('settings.theme.' + v)}</option>`;
            })}
          </select>
        </section>
        <section class="group">
          <h2><label for="exam-date">${t('settings.examDate')}</label></h2>
          <p class="muted">${t('settings.examDate.hint')}</p>
          <input id="exam-date" type="date" class="field" data-testid="exam-date" value=${examDate}
            onChange=${function (e) { self.setSetting('examDate', e.target.value || ''); }} />
        </section>
        ${p.engine ? html`<section class="group" data-testid="unit-settings">
          <h2>${t('settings.unitSettings')}</h2>
          <p class="muted">${t('settings.unitSettings.hint')}</p>
          <ul class="unit-settings-list" data-testid="unit-settings-list">
            ${(p.course.units || []).map(function (unit) {
              var override = p.engine.unitSettings(unit.id);
              var hasOverride = Object.keys(override).length > 0;
              var settings = self.getEffectiveUnitSettings(unit.id).effective;
              var summary = self.unitSettingsSummary(unit.id);
              return html`<li key=${unit.id} class="unit-settings-row" data-testid=${'unit-settings-row-' + unit.id}>
                <button type="button" class="btn unit-settings-btn" data-testid=${'btn-unit-settings-' + unit.id}
                  onClick=${function () { self.openUnitDialog(unit.id); }}>
                  <span class="unit-settings-title">${renderText(unit.title)}</span>
                  ${summary ? html`<span class="muted small unit-settings-summary" data-testid=${'unit-settings-summary-' + unit.id}>${summary}</span>` : null}
                  ${hasOverride ? html`<span class="unit-settings-override" data-testid=${'override-marker-' + unit.id} aria-label=${t('settings.unitSettings.overrideMarker')} title=${t('settings.unitSettings.overrideMarker')}>${t('settings.unitSettings.overrideMarker')}</span>` : null}
                </button>
              </li>`;
            })}
          </ul>
        </section>` : null}
        ${(p.course.groups || []).length > 0 && p.engine && p.engine.setGroupSetting ? html`<section class="group" data-testid="group-settings">
          <h2>${t('settings.groupSettings')}</h2>
          <p class="muted">${t('settings.groupSettings.hint')}</p>
          <ul class="unit-settings-list" data-testid="group-settings-list">
            ${(p.course.groups || []).map(function (group) {
              var override = p.engine.groupSettings ? p.engine.groupSettings(group.id) : {};
              var hasOverride = Object.keys(override).length > 0;
              var summary = self.groupSettingsSummary(group.id);
              return html`<li key=${group.id} class="unit-settings-row" data-testid=${'group-settings-row-' + group.id}>
                <button type="button" class="btn unit-settings-btn" data-testid=${'btn-group-settings-' + group.id}
                  onClick=${function () { self.openGroupDialog(group.id); }}>
                  <span class="unit-settings-title">${renderText(group.title)}</span>
                  ${summary ? html`<span class="muted small unit-settings-summary" data-testid=${'group-settings-summary-' + group.id}>${summary}</span>` : null}
                  ${hasOverride ? html`<span class="unit-settings-override" data-testid=${'override-marker-' + group.id} aria-label=${t('settings.unitSettings.overrideMarker')} title=${t('settings.unitSettings.overrideMarker')}>${t('settings.unitSettings.overrideMarker')}</span>` : null}
                </button>
              </li>`;
            })}
          </ul>
        </section>` : null}
        ${p.course.placement !== undefined ? html`<section class="group">
          <h2>${t('home.placement')}</h2>
          <p class="muted">${t('placement.intro')}</p>
          <button type="button" class="btn" data-testid="btn-settings-placement" onClick=${function () { p.onPlacement(); }}>${t('home.placement')}</button>
        </section>` : null}
        <section class="group">
          <h2>${t('settings.export')}</h2>
          <p class="muted">${t('settings.export.hint')}</p>
          <textarea class="field mono" readOnly rows="5" data-testid="export-text" aria-label=${t('settings.export')} value=${s.exportText}
            ref=${function (el) { self.exportArea = el; }} onFocus=${function (e) { e.target.select(); }}></textarea>
          <div class="row">
            <button type="button" class="btn" data-testid="btn-copy" onClick=${function () { self.copy(); }}>${t('settings.copy')}</button>
            ${s.copied ? html`<span class="muted" role="status" data-testid="copy-msg">${s.copied === 'ok' ? t('settings.copied') : t('settings.copy.manual')}</span>` : null}
          </div>
        </section>
        <section class="group">
          <h2>${t('settings.import')}</h2>
          <p class="muted">${t('settings.import.hint')}</p>
          <textarea class="field mono" rows="4" data-testid="import-text" aria-label=${t('settings.import')} value=${s.importText}
            autocomplete="off" spellcheck=${false} onInput=${function (e) { self.setState({ importText: e.target.value, importMsg: null }); }}></textarea>
          <div class="row">
            <button type="button" class="btn" disabled=${s.importText.trim() === ''} data-testid="btn-import" onClick=${function () { self.doImport(); }}>${t('settings.import.btn')}</button>
            ${s.importMsg ? html`<span class=${s.importMsg.kind} role="status" data-testid="import-msg">${s.importMsg.text}</span>` : null}
          </div>
        </section>
        <section class="group">
          <h2>${t('settings.reset')}</h2>
          <p class="muted">${t('settings.reset.hint')}</p>
          ${s.resetStep === 0 ? html`<div class="row"><button type="button" class="btn danger" data-testid="btn-reset"
            onClick=${function () { self.setState({ resetStep: 1, resetDone: false }); }}>${t('settings.reset.btn')}</button>
            ${s.resetDone ? html`<span class="good" role="status" data-testid="reset-msg">${t('settings.reset.done')}</span>` : null}</div>` : html`<div class="confirm-box" data-testid="reset-confirm">
            <p><b>${t('settings.reset.sure')}</b></p>
            <div class="row">
              <button type="button" class="btn" data-testid="btn-reset-cancel" onClick=${function () { self.setState({ resetStep: 0 }); }}>${t('cancel')}</button>
              <button type="button" class="btn danger" data-testid="btn-reset-confirm" onClick=${function () { self.doReset(); }}>${t('settings.reset.confirm')}</button>
            </div></div>`}
        </section>
        ${renderSpeechSettings(p, self)}
        ${renderPluginSettings(p, self)}
        <section class="group" data-testid="about">
          <h2>${t('settings.about')}</h2>
          <dl class="about">
            <dt>${t('about.course')}</dt><dd>${p.course.title}</dd>
            <dt>${t('about.version')}</dt><dd class="mono" data-testid="about-version">${p.content.version || '-'}</dd>
            <dt>${t('about.items')}</dt><dd>${t('about.items.value', { total: p.content.items.length, retired: retired })}</dd>
            <dt>${t('about.status')}</dt><dd>${t('status.' + p.status)}</dd>
          </dl>
        </section>
        <div class="row"><button type="button" class="btn" data-testid="btn-back" onClick=${function () { p.go('home'); }}>${t('back')}</button></div>
        ${s.unitDialog ? html`<div class="overlay" data-testid="unit-settings-dialog">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="unit-settings-dialog-title" tabIndex="-1">
            <h2 id="unit-settings-dialog-title" data-testid="unit-settings-dialog-title">${t('settings.unitSettings.dialogTitle', { title: s.unitDialog.unitTitle })}</h2>
            <div class="group">
              <label class="legend-like" for="unit-newperday-stepper">${t('settings.unitSettings.newPerDay')}</label>
              <p class="muted small">${t('settings.unitSettings.newPerDay.hint')}</p>
              <${Stepper} testid="unit-newperday" id="unit-newperday-stepper" label=${t('settings.unitSettings.newPerDay')} 
                value=${s.unitDialog.effective.newPerDay} min=${0} max=${50} step=${1}
                decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} 
                onChange=${function (v) { self.setUnitSettingField(s.unitDialog.unitId, 'newPerDay', v === s.unitDialog.course.newPerDay ? null : v); }} />
            </div>
            <div class="group">
              <label for=${'ladder-pace-' + s.unitDialog.unitId} class="legend-like">${t('settings.unitSettings.ladderPace')}</label>
              <p class="muted small">${t('settings.unitSettings.ladderPace.hint')}</p>
              <select id=${'ladder-pace-' + s.unitDialog.unitId} class="field" data-testid="unit-ladder-pace"
                value=${self.ladderScaleToValue(s.unitDialog.effective.ladderScale)}
                onChange=${function (e) { 
                  var value = self.ladderScaleFromValue(e.target.value);
                  self.setUnitSettingField(s.unitDialog.unitId, 'ladderScale', value === s.unitDialog.course.ladderScale ? null : value); 
                }}>
                ${['0.5', '0.75', '1', '1.5', '2', '3'].map(function (v) {
                  var labelKey = 'settings.unitSettings.ladderPace.option.';
                  if (v === '0.5') labelKey += 'muchDenser';
                  else if (v === '0.75') labelKey += 'denser';
                  else if (v === '1') labelKey += 'asInCourse';
                  else if (v === '1.5') labelKey += 'longer';
                  else if (v === '2') labelKey += 'muchLonger';
                  else if (v === '3') labelKey += 'x3';
                  return html`<option key=${v} value=${v}>${t(labelKey)}</option>`;
                })}
              </select>
              <p class="muted small" data-testid="ladder-preview">${t('settings.unitSettings.ladderPreview', { ladder: s.unitDialog.ladderPreview })}</p>
            </div>
            <div class="group">
              <label for=${'on-wrong-' + s.unitDialog.unitId} class="legend-like">${t('settings.unitSettings.onWrong')}</label>
              <p class="muted small">${t('settings.unitSettings.onWrong.hint')}</p>
              <select id=${'on-wrong-' + s.unitDialog.unitId} class="field" data-testid="unit-on-wrong"
                value=${String(s.unitDialog.effective.dropOnWrong)}
                onChange=${function (e) { 
                  var value = parseInt(e.target.value, 10);
                  self.setUnitSettingField(s.unitDialog.unitId, 'dropOnWrong', value === s.unitDialog.course.dropOnWrong ? null : value); 
                }}>
                ${[0, 1, 2, 3].concat(s.unitDialog.effective.dropOnWrong > 3 ? [s.unitDialog.effective.dropOnWrong] : []).map(function (v) {
                  var labelKey = 'settings.unitSettings.onWrong.option.';
                  if (v === 0) labelKey += 'keep';
                  else labelKey += 'drop' + v;
                  return html`<option key=${v} value=${v}>${v > 3 ? t('settings.unitSettings.dropN', { n: v }) : t(labelKey)}</option>`;
                })}
              </select>
            </div>
            <div class="group">
              <label for=${'new-order-' + s.unitDialog.unitId} class="legend-like">${t('settings.unitSettings.newOrder')}</label>
              <p class="muted small">${t('settings.unitSettings.newOrder.hint')}</p>
              <select id=${'new-order-' + s.unitDialog.unitId} class="field" data-testid="unit-new-order"
                value=${s.unitDialog.effective.newOrder}
                onChange=${function (e) { 
                  var value = e.target.value;
                  self.setUnitSettingField(s.unitDialog.unitId, 'newOrder', value === s.unitDialog.course.newOrder ? null : value); 
                }}>
                ${['file', 'random'].map(function (v) {
                  return html`<option key=${v} value=${v}>${t('settings.unitSettings.newOrder.option.' + v)}</option>`;
                })}
              </select>
            </div>
            <div class="row end">
              <button type="button" class="btn" data-testid="btn-unit-reset-cancel" onClick=${function () { self.closeUnitDialog(); }}>${t('cancel')}</button>
              <button type="button" class="btn primary" data-testid="btn-unit-save" onClick=${function () { self.closeUnitDialog(true); }}>${t('save')}</button>
              <button type="button" class="btn danger" data-testid="btn-unit-reset" 
                disabled=${Object.keys(s.unitDialog.override).length === 0}
                onClick=${function () { self.resetUnitSettings(s.unitDialog.unitId); }}>${t('settings.unitSettings.reset')}</button>
            </div>
          </div>
        </div>` : null}
        ${s.groupDialog ? html`<div class="overlay" data-testid="group-settings-dialog">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="group-settings-dialog-title" tabIndex="-1">
            <h2 id="group-settings-dialog-title" data-testid="group-settings-dialog-title">${t('settings.groupSettings.dialogTitle', { title: s.groupDialog.groupTitle })}</h2>
            <div class="group">
              <label class="legend-like" for="group-newperday-stepper">${t('settings.groupSettings.newPerDay')}</label>
              <p class="muted small">${t('settings.groupSettings.newPerDay.hint')}</p>
              <${Stepper} testid="group-newperday" id="group-newperday-stepper" label=${t('settings.groupSettings.newPerDay')} 
                value=${s.groupDialog.effective.newPerDay !== undefined ? s.groupDialog.effective.newPerDay : 0} min=${0} max=${50} step=${1}
                decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} 
                onChange=${function (v) { self.setGroupSettingField(s.groupDialog.groupId, 'newPerDay', v === s.groupDialog.course.newPerDay ? null : v); }} />
            </div>
            <div class="group">
              <label for=${'group-new-order-' + s.groupDialog.groupId} class="legend-like">${t('settings.groupSettings.newOrder')}</label>
              <p class="muted small">${t('settings.groupSettings.newOrder.hint')}</p>
              <select id=${'group-new-order-' + s.groupDialog.groupId} class="field" data-testid="group-new-order"
                value=${s.groupDialog.effective.newOrder || 'file'}
                onChange=${function (e) { 
                  var value = e.target.value;
                  self.setGroupSettingField(s.groupDialog.groupId, 'newOrder', value === s.groupDialog.course.newOrder ? null : value); 
                }}>
                ${['file', 'random'].map(function (v) {
                  return html`<option key=${v} value=${v}>${t('settings.unitSettings.newOrder.option.' + v)}</option>`;
                })}
              </select>
            </div>
            ${s.groupDialog.extraTags && s.groupDialog.extraTags.length > 0 ? html`<div class="group">
              <label for=${'group-onlyTags-' + s.groupDialog.groupId} class="legend-like">${t('settings.groupSettings.onlyTags')}</label>
              <p class="muted small">${t('settings.groupSettings.onlyTags.hint')}</p>
              <select id=${'group-onlyTags-' + s.groupDialog.groupId} class="field" data-testid="group-onlyTags"
                value=${s.groupDialog.effective.onlyTags !== undefined ? (s.groupDialog.effective.onlyTags === true ? 'true' : 'false') : 'default'}
                onChange=${function (e) { 
                  var value = e.target.value === 'true' ? true : e.target.value === 'false' ? false : null;
                  self.setGroupSettingField(s.groupDialog.groupId, 'onlyTags', value === s.groupDialog.course.onlyTags ? null : value); 
                }}>
                <option value="default">${t('settings.unitSettings.noOverride')}</option>
                <option value="true">${t('session.known')}</option>
                <option value="false">${t('session.dontKnow')}</option>
              </select>
            </div>` : null}
            <div class="row end">
              <button type="button" class="btn" data-testid="btn-group-reset-cancel" onClick=${function () { self.closeGroupDialog(); }}>${t('cancel')}</button>
              <button type="button" class="btn primary" data-testid="btn-group-save" onClick=${function () { self.closeGroupDialog(true); }}>${t('save')}</button>
              <button type="button" class="btn danger" data-testid="btn-group-reset" 
                disabled=${Object.keys(s.groupDialog.override).length === 0}
                onClick=${function () { self.resetGroupSettings(s.groupDialog.groupId); }}>${t('settings.groupSettings.reset')}</button>
            </div>
          </div>
        </div>` : null}
      </main>`;
    }
  }

  // ---------- App ----------

  class App extends Component {
    constructor(props) {
      super(props);
      this.state = { screen: 'home', status: props.store.status, notice: null, session: null, summary: null, home: null, placementIntro: false, confirmNew: null };
      this.state.home = this.homeData();
      this.lastStart = null;
    }
    homeData() {
      var p = this.props;
      var doc = p.store.doc;
      var streak = 0;
      try { streak = p.dojo.call('streak', { days: (doc.stats && doc.stats.days) || {}, todayKey: p.today() }); } catch (e) { streak = 0; }
      var weak = false;
      try { weak = !p.engine.start('weak', { limit: 1 }).error; } catch (e) { weak = false; }
      var pl = p.engine.placement ? p.engine.placement() : { done: false };
      var resume = null;
      var draft = p.engine.examDraft ? p.engine.examDraft() : null;
      if (draft) {
        resume = { examId: draft.examId, answered: draft.answers.length, total: draft.ids.length, remainingMs: draft.remainingMs[draft.group] };
      }
      return { counts: p.engine.counts(), streak: streak, weak: weak, placementDone: pl.done, resume: resume };
    }
    scrollTop() {
      var w = this.props.win;
      if (w && typeof w.scrollTo === 'function') { try { w.scrollTo(0, 0); } catch (e) { /* no scroll */ } }
    }
    setStatus(status) { this.setState({ status: status }); }
    remoteChanged() {
      this.setState({ home: this.homeData() });
    }
    refresh() { this.setState({ home: this.homeData() }); }
    go(screen) {
      this.setState({ screen: screen, notice: null, session: null, placementIntro: false, home: screen === 'home' ? this.homeData() : this.state.home });
      this.scrollTop();
    }
    endSession(summary) {
      this.props.store.flush();
      this.setState({ screen: 'results', summary: summary, session: null });
      this.scrollTop();
    }
    finishBroken(session) {
      var sum = session.finish();
      if (sum && !sum.error) this.endSession(sum); else this.exitSession();
    }
    exitSession() {
      if (this.state.session && this.state.session.abandon) this.state.session.abandon();
      this.props.store.flush();
      this.go('home');
    }
    again() {
      if (this.lastStart) this.startMode(this.lastStart.mode, this.lastStart.opts);
      else this.go('home');
    }
    addMoreNew(count) {
      this.props.engine.moreNew(count);
      this.refresh();
    }
    setGroupSetting(gid, field, value) {
      var patch = {};
      patch[field] = value;
      var result = this.props.engine.setGroupSetting(gid, patch);
      if (result.error) {
        this.setState({ notice: this.props.t('settings.groupSettings.error', { field: field, error: result.error }) });
        return;
      }
      this.refresh();
    }
    startPlacement() {
      var session = this.props.engine.start('placement', {});
      if (session.error) {
        this.setState({ notice: this.props.t('start.' + session.error), placementIntro: false });
        return;
      }
      this.lastStart = { mode: 'placement', opts: {} };
      this.setState({ screen: 'session', session: session, notice: null, placementIntro: false });
      this.scrollTop();
    }
    showPlacementIntro() {
      this.setState({ placementIntro: true });
    }
    resumeExam() {
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (!draft) { this.refresh(); return; }
      var session = this.props.engine.start('exam', { examId: draft.examId, resume: draft });
      if (session.error) {
        this.setState({ notice: this.props.t('start.' + session.error), home: this.homeData() });
        return;
      }
      this.lastStart = { mode: 'exam', opts: { examId: draft.examId } };
      if (session.done) {
        var sum = session.finish();
        if (sum.error) { this.setState({ notice: this.props.t('session.error', { code: sum.error }), home: this.homeData() }); return; }
        this.endSession(sum);
        return;
      }
      this.setState({ screen: 'session', session: session, notice: null });
      this.scrollTop();
    }
    discardDraft() {
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (draft) this.props.engine.discardDraft(draft.sid);
      this.refresh();
    }
    startOver() {
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (!draft) return;
      this.props.engine.discardDraft(draft.sid);
      this.setState({ home: this.homeData() });
      this.startMode('exam', { examId: draft.examId }, true);
    }
    startMode(mode, opts, confirmed) {
      var resume = this.state.home && this.state.home.resume;
      if (!confirmed && mode === 'exam' && !opts.training && resume) {
        this.setState({ confirmNew: { mode: mode, opts: opts } });
        return;
      }
      var session = this.props.engine.start(mode, opts);
      if (session.error) {
        this.setState({ notice: this.props.t('start.' + session.error) });
        return;
      }
      this.lastStart = { mode: mode, opts: opts };
      this.setState({ screen: 'session', session: session, notice: null });
      this.scrollTop();
    }
    confirmNewCancel() {
      this.setState({ confirmNew: null });
    }
    confirmNewProceed() {
      var c = this.state.confirmNew;
      if (!c) return;
      this.setState({ confirmNew: null });
      var draft = this.props.engine.examDraft ? this.props.engine.examDraft() : null;
      if (draft) this.props.engine.discardDraft(draft.sid);
      this.startMode(c.mode, c.opts, true);
    }
    render(p, s) {
      var self = this;
      var common = { t: p.t, course: p.course, status: s.status, notice: s.notice, dojo: p.dojo, go: function (x) { self.go(x); } };
      var body;
      var home = s.home || {};
      if (s.confirmNew) {
        body = h(Dialog, {
          testid: 'confirm-new-exam',
          title: p.t('home.resume.confirm.title'),
          body: p.t('home.resume.confirm.body'),
          confirmLabel: p.t('home.resume.confirm.yes'),
          danger: false,
          cancelLabel: p.t('cancel'),
          onConfirm: function () { self.confirmNewProceed(); },
          onCancel: function () { self.confirmNewCancel(); }
        });
      } else if (s.placementIntro) {
        body = h(PlacementScreen, Object.assign({ onStart: function () { self.startPlacement(); } }, common));
      } else if (s.screen === 'practice') {
        body = h(PracticeSetup, Object.assign({ content: p.content, onStart: function (m, o) { self.startMode(m, o); } }, common));
      } else if (s.screen === 'session' && s.session && s.session.mode === 'placement') {
        body = h(SessionBoundary, { key: s.session.id, t: p.t, session: s.session, onExit: function () { self.exitSession(); }, onFinish: function () { self.finishBroken(s.session); } },
          h(PlacementSession, { t: p.t, lang: p.lang, session: s.session, now: p.now, win: p.win, course: p.course, store: p.store,
            onEnd: function (sum) { self.endSession(sum); }, onExit: function () { self.exitSession(); } }));
      } else if (s.screen === 'session') {
        body = h(SessionBoundary, { key: s.session.id, t: p.t, session: s.session, onExit: function () { self.exitSession(); }, onFinish: function () { self.finishBroken(s.session); } },
          h(SessionScreen, { t: p.t, lang: p.lang, session: s.session, now: p.now, win: p.win, course: p.course, content: p.content, store: p.store,
            onEnd: function (sum) { self.endSession(sum); }, onExit: function () { self.exitSession(); } }));
      } else if (s.screen === 'results') {
        var isPlacement = s.summary && s.summary.mode === 'placement';
        body = h(Results, Object.assign({ summary: s.summary, byId: p.byId, onAgain: function () { self.again(); }, isPlacement: isPlacement }, common));
      } else if (s.screen === 'settings') {
        body = h(SettingsScreen, Object.assign({ lang: p.lang, store: p.store, content: p.content, engine: p.engine, now: p.now, win: p.win,
          onDataChanged: function () { self.refresh(); }, onPlacement: function () { self.showPlacementIntro(); },
          onNotice: function (n) { self.setState({ notice: n.text }); } }, common));
      } else if (s.screen === 'catalog') {
        body = h(CatalogScreen, Object.assign({ content: p.content, store: p.store, engine: p.engine, now: p.now, win: p.win }, common));
      } else {
        var doc = p.store.doc;
        var examDate = doc.settings && doc.settings.examDate ? doc.settings.examDate : null;
        var examDaysLeft = daysLeft(examDate, p.today());
        body = h(Home, Object.assign({ home: home, engine: p.engine, exams: p.engine.exams ? p.engine.exams() : [], onStart: function (m, o) { self.startMode(m, o); }, onPlacement: function () { self.showPlacementIntro(); }, onMoreNew: function (n) { self.addMoreNew(n); }, onGroupSetting: function (gid, field, value) { self.setGroupSetting(gid, field, value); }, examDate: examDate, examDaysLeft: examDaysLeft, lang: p.lang, resume: home.resume, onResume: function () { self.resumeExam(); }, onStartOver: function () { self.startOver(); }, onDiscard: function () { self.discardDraft(); } }, common));
      }
      return html`<div class="app">${body}</div>`;
    }
  }

  // ---------- start / fail ----------

  function pickLang(i18n, lang) {
    if (i18n && i18n[lang]) return lang;
    if (i18n && i18n[primaryTag(lang)]) return primaryTag(lang);
    var keys = Object.keys(i18n || {}).filter(function (k) { return k !== 'en'; });
    return keys.length ? keys[0] : 'en';
  }

  function ErrorScreen(p) {
    var t = p.t;
    return html`<div class="app"><main class="screen" data-testid="error" role="alert">
      <header class="head"><h1>${t('error.title')}</h1></header>
      <p>${t('error.body')}</p>
      <details data-testid="error-details"><summary>${t('error.details')}</summary><pre class="pre mono">${p.message}</pre></details>
    </main></div>`;
  }

  function fail(rootEl, err) {
    var i18n = root.__DOJO_I18N__ || null;
    var t = makeT(i18n, pickLang(i18n, 'en'));
    var message = err && (err.stack || err.message) ? (err.name ? err.name + ': ' : '') + (err.message || String(err)) : String(err);
    try { preact.render(null, rootEl); } catch (e) { /* tree already broken */ }
    try { rootEl.textContent = ''; } catch (e) { /* no DOM */ }
    try {
      preact.render(h(ErrorScreen, { t: t, message: message }), rootEl);
    } catch (e) {
      try { rootEl.textContent = 'Error: ' + message; } catch (e2) { /* no DOM */ }
    }
  }

  function start(opts) {
    var rootEl = opts.root;
    var content = opts.content;
    var course = content.course;
    var now = opts.now || Date.now;
    var win = opts.win || root;
    var i18n = opts.i18n || root.__DOJO_I18N__ || null;
    var t = makeT(i18n, opts.lang || course.uiLanguage || 'en');
    if (DojoExt.use) DojoExt.use(course.markup);
    if (DojoExt.useRuby) DojoExt.useRuby(course.ruby, content.items);
    if (DojoExt.useInputScript) DojoExt.useInputScript(course.inputScript, t('guard.script'));
    var holder = { app: null };
    try { if (rootEl && rootEl.setAttribute && (course.contentLanguage || course.uiLanguage)) rootEl.setAttribute('lang', course.contentLanguage || course.uiLanguage); } catch (e) { /* no DOM */ }
    preact.render(h(Loading, { t: t }), rootEl);
    function today() { return localDay(now()); }
    var store = DojoStorage.createStore({
      courseId: course.id,
      dojo: opts.dojo,
      now: now,
      localStorage: opts.localStorage || null,
      claude: opts.claude || null,
      onStatus: function (s) { if (holder.app) holder.app.setStatus(s); },
      onRemoteChange: function () { if (holder.app) holder.app.remoteChanged(); }
    });
    return store.load().then(function () {
      applyTheme(win, store.doc.settings && store.doc.settings.theme);
      if (DojoExt.bindSettings) {
        DojoExt.bindSettings(function (key) {
          return store.doc.settings && store.doc.settings[key];
        });
      }
      var engine = DojoSession.createEngine({ dojo: opts.dojo, store: store, content: content, now: now, today: today, random: Math.random });
      store.attachLifecycle(win);
      var byId = {};
      content.items.forEach(function (it) { byId[it.id] = it; });
      preact.render(h(App, { ref: function (a) { holder.app = a; }, t: t, lang: opts.lang || course.uiLanguage || 'en', store: store, engine: engine, dojo: opts.dojo,
        content: content, course: course, byId: byId, now: now, today: today, win: win }), rootEl);
      return { store: store, engine: engine };
    }).catch(function (e) { fail(rootEl, e); });
  }

  root.DojoApp = { start: start, fail: fail, _makeT: makeT, _pickLang: pickLang, _Stimulus: Stimulus, _SessionScreen: SessionScreen, _SessionBoundary: SessionBoundary, _Results: Results, _Home: Home, _App: App, _CatalogScreen: CatalogScreen, _SettingsScreen: SettingsScreen, _PlacementSession: PlacementSession, _PracticeSetup: PracticeSetup, _ProgressBar: ProgressBar, _daysLeft: daysLeft, _applyTheme: applyTheme, _pluralForm: pluralForm, _renderPluginSettings: renderPluginSettings };
})(typeof self !== 'undefined' ? self : this);
