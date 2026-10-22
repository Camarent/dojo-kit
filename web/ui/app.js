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
  var DojoI18n = root.DojoI18n || (typeof require !== 'undefined' ? require('./i18n.js') : null) || {};

  // ---------- helpers ----------


  // Load common UI helpers from common.js
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};

  // Load detail rendering helpers
  var DojoDetail = root.DojoDetail || (typeof require !== 'undefined' ? require('./detail.js') : null) || {};

  // Load catalog and home modules
  var DojoCatalog = root.DojoCatalog || (typeof require !== 'undefined' ? require('./catalog.js') : null) || {};
  var DojoHome = root.DojoHome || (typeof require !== 'undefined' ? require('./home.js') : null) || {};

  // Alias from catalog and home
  var CatalogScreen = DojoCatalog.CatalogScreen;
  var GroupCard = DojoHome.GroupCard;
  var Home = DojoHome.Home;

  // Alias moved functions to preserve existing references
  var renderText = DojoCommon.renderText;
  var answerReadings = DojoCommon.answerReadings;
  var renderPrompt = DojoCommon.renderPrompt;
  var renderTextAll = DojoCommon.renderTextAll;
  var renderPromptEl = DojoCommon.renderPromptEl;
  var renderPromptLine = DojoCommon.renderPromptLine;
  var speechLines = DojoCommon.speechLines;
  var speechCfg = DojoCommon.speechCfg;
  var PlayButton = DojoCommon.PlayButton;
  var Playback = DojoCommon.Playback;
  var cls = DojoCommon.cls;
  var Chip = DojoCommon.Chip;
  var Stepper = DojoCommon.Stepper;
  var Dialog = DojoCommon.Dialog;
  var StatusChip = DojoCommon.StatusChip;
  var ProgressBar = DojoCommon.ProgressBar;
  var ProgressMeter = DojoCommon.ProgressMeter;
  var Notice = DojoCommon.Notice;
  var Loading = DojoCommon.Loading;
  var daysLeft = DojoCommon.daysLeft;
  var applyTheme = DojoCommon.applyTheme;
  var Speech = root.DojoSpeech || null;

  // Alias from DojoDetail, or use local definitions if not available
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;
  var getMetaValue = DojoDetail.getMetaValue || function(item, key) {
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
  };
  var resolvePath = DojoDetail.resolvePath || function(obj, path) {
    if (!obj || typeof obj !== 'object' || !path || typeof path !== 'string') return null;
    var parts = path.split('.');
    var value = obj;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (value === null || typeof value !== 'object') return null;
      if (!Object.prototype.hasOwnProperty.call(value, part)) return null;
      value = value[part];
    }
    return value;
  };
  var topicStage = DojoDetail.topicStage || function(es) {
    if (!es || !es.started) return 'new';
    return es.minStage >= 2 ? 'review' : 'learning';
  };
  var topicState = DojoDetail.topicState || function(es) {
    if (!es || !es.started) return 'new';
    if (es.due) return 'due';
    return es.learned ? 'learned' : 'learning';
  };
  var topicMastery = DojoDetail.topicMastery || function(es) {
    return es && es.members ? Math.round(100 * es.atLearned / es.members) : 0;
  };
  var topicTitle = DojoDetail.topicTitle || function(item, intro) {
    var m = item.meta || {};
    if (m.title) return m.title;
    if (intro && typeof intro.title === 'string' && intro.title) return intro.title;
    if (typeof item.prompt === 'string' && item.prompt) return item.prompt;
    return item.entity || item.id;
  };

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

  function fmtExamDate(lang, key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return '';
    try {
      return new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
    } catch (e) { return key; }
  }

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

  function orderedGroupIds(course, groups) {
    var ids = (course.groups || []).map(function (g) { return g.id; }).filter(function (id) { return groups[id] !== undefined; });
    Object.keys(groups).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
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


  // ---------- Home ----------

  

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
    var cfgOrLang = p.course.breakdown;
    if (cfgOrLang === undefined) return null;
    var breakdown = DojoExt.kanjiBreakdown(item, p.content.items, cfgOrLang);
    if (!breakdown || !breakdown.length) return null;
    var t = p.t;
    return html`<ul class="kanji-rows" data-testid="kanji-rows">
      <li class="muted" data-testid="kanji-label">${t('session.kanji')}</li>
      ${breakdown.map(function (k) {
        var onRead = (Array.isArray(k.on) && k.on.length > 0) ? k.on.join(' / ') : null;
        var kunRead = (Array.isArray(k.kun) && k.kun.length > 0) ? k.kun.join(' / ') : null;
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
      var body = html`<div class=${cls('feedback', res.correct ? 'right' : 'wrong')} data-testid="feedback" role="status">
        <b data-testid="verdict">${def && def.verdict ? def.verdict(res, t) : (res.correct ? t('session.correct') : t('session.wrong'))}</b>
        ${!def || !def.hideExpected ? html`<p data-testid="expected">${t('session.expected')} <span class="pre">${renderTextAll(res.expected)}</span></p>` : null}
        ${def && def.Extra ? h(def.Extra, { result: res, t: t }) : null}
        ${res.explanation ? html`<p class="pre" data-testid="explanation">${renderTextAll(res.explanation)}</p>` : null}
        ${kanjiRows(p, s, false)}
      </div>`;
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

  var DojoSessionScreen = root.DojoSessionScreen || (typeof require !== 'undefined' ? require('./session-screen.js') : null) || {};
  var DojoResults = root.DojoResults || (typeof require !== 'undefined' ? require('./results.js') : null) || {};
  var sessionParts = DojoSessionScreen.create({ Stimulus: Stimulus, kanjiRows: kanjiRows, tagInfo: tagInfo, captionFor: captionFor, fmtClock: fmtClock });
  var SessionBoundary = sessionParts.SessionBoundary;
  var SessionScreen = sessionParts.SessionScreen;
  var Results = DojoResults.create({ percent: percent, fmtClock: fmtClock }).Results;

  // ---------- Settings ----------

  function resolveLabel(label, lang) {
    if (typeof label === 'string') return label;
    if (label && typeof label === 'object') {
      if (typeof label[lang] === 'string') return label[lang];
      if (typeof label[DojoI18n.primaryTag(lang)] === 'string') return label[DojoI18n.primaryTag(lang)];
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
      var result = this.getEffectiveUnitSettings(unitId);
      var effective = result.effective;
      var override = result.override;
      var courseUnit = result.courseUnit;
      var unit = courseUnit || { id: unitId, title: unitId };
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
    var t = DojoI18n.makeT(i18n, DojoI18n.pickLang(i18n, 'en'));
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
    var t = DojoI18n.makeT(i18n, opts.lang || course.uiLanguage || 'en');
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

  root.DojoApp = { start: start, fail: fail, _makeT: DojoI18n.makeT, _pickLang: DojoI18n.pickLang, _Stimulus: Stimulus, _SessionScreen: SessionScreen, _Results: Results, _Home: Home, _App: App, _CatalogScreen: CatalogScreen, _SettingsScreen: SettingsScreen, _PlacementSession: PlacementSession, _PracticeSetup: PracticeSetup, _ProgressBar: ProgressBar, _daysLeft: daysLeft, _applyTheme: applyTheme, _pluralForm: DojoI18n.pluralForm, _renderPluginSettings: renderPluginSettings };
})(typeof self !== 'undefined' ? self : this);
