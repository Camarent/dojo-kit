/*
 * ui/placement.js — PracticeSetup, PlacementScreen, PlacementSession components
 * Globals expected: preact, htm, DojoTypes, DojoCommon.
 * create(deps) takes { uniqueSorted, tagInfo, toggle, Stimulus, kanjiRows } and returns { PracticeSetup, PlacementScreen, PlacementSession }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var renderText = DojoCommon.renderText;
  var renderPromptEl = DojoCommon.renderPromptEl;
  var renderPromptLine = DojoCommon.renderPromptLine;
  var speechLines = DojoCommon.speechLines;
  var speechCfg = DojoCommon.speechCfg;
  var Chip = DojoCommon.Chip;
  var Stepper = DojoCommon.Stepper;
  var Dialog = DojoCommon.Dialog;
  var Notice = DojoCommon.Notice;
  var DojoSessionScreen = root.DojoSessionScreen || (typeof require !== 'undefined' ? require('./session-screen.js') : null) || {};
  var Speech = root.DojoSpeech || null;

  function create(deps) {
    var uniqueSorted = deps.uniqueSorted;
    var tagInfo = deps.tagInfo;
    var toggle = deps.toggle;
    var Stimulus = deps.Stimulus;
    var kanjiRows = deps.kanjiRows;
    var shared = DojoSessionScreen.createShared({ kanjiRows: kanjiRows, tagInfo: tagInfo });

  class PracticeSetup extends Component {
    constructor(props) {
      super(props);
      this.state = { units: [], tags: [], types: [], count: 20 };
      // Content is immutable for this screen: compute the chip sources once.
      var active = props.content.items.filter(DojoCommon.isActive);
      var tagSet = new Set();
      active.forEach(function (it) { (it.tags || []).forEach(function (tag) { tagSet.add(tag); }); });
      this.tags = uniqueSorted(Array.from(tagSet)).filter(function (tag) { return !tagInfo(props.course, tag).internal; });
      this.types = uniqueSorted(active.map(function (it) { return it.type; }));
      this.unitIds = DojoCommon.visibleUnits(props.course.units, DojoCommon.countActiveByUnit(props.content.items)).map(function (u) { return u.id; });
      this.unitById = Object.create(null);
      (props.course.units || []).forEach(function (u) { if (!this.unitById[u.id]) this.unitById[u.id] = u; }, this);
    }
    render(p, s) {
      var t = p.t;
      var self = this;
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
        ${group(t('practice.units'), 'units', self.unitIds, function (id) {
          var u = self.unitById[id];
          return u ? renderText(u.title) : id;
        })}
        ${group(t('practice.tags'), 'tags', self.tags, function (x) { return tagInfo(p.course, x).label; })}
        ${group(t('practice.types'), 'types', self.types, function (x) { return t('type.' + x); })}
        <div class="group">
          <label class="legend-like">${t('practice.count')}</label>
          <${Stepper} testid="count" label=${t('practice.count')} value=${s.count} min=${5} max=${50} step=${5}
            decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} onChange=${function (v) { self.setState({ count: v }); }} />
        </div>
        <div class="row setup-actions">
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
      return { cur: cur, result: null, picked: null, qstate: def ? def.initialState(cur.view) : {}, error: null, guard: null, retry: false, speechFail: false, answered: 0 };
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
        if (self.state.confirm) return;
        if (self.isCheckMode()) self.focusCheck(); else self.focusSelf();
      }, 0);
    }
    focusSelf() {
      var btn = this.knownBtn || this.unknownBtn;
      if (btn && btn.focus) btn.focus();
    }
    refocusLost(s, box, doc, active, had) {
      var lost = doc && (!active || active === doc.body);
      if (!(had && lost && !s.result && box && box.querySelector)) return;
      var re = box.querySelector('[data-refocus]');
      if (re && re.focus) { re.focus(); this.hadFocus = true; }
    }
    focusCheck() {
      var s = this.state;
      var last = this.lastFocus;
      var box = this.qbox;
      var doc = this.props.win && this.props.win.document;
      var active = doc && doc.activeElement;
      var inBox = !!(box && active && box.contains && box.contains(active));
      var had = this.hadFocus;
      this.hadFocus = inBox;
      if (last && last.cur === s.cur && last.answered === !!s.result) {
        this.refocusLost(s, box, doc, active, had);
        return;
      }
      this.lastFocus = { cur: s.cur, answered: !!s.result };
      var el = s.result ? this.nextBtn : this.input;
      if (!el && !s.result && box && box.querySelector) el = box.querySelector('[data-autofocus]');
      if (el && el.focus) { el.focus(); this.hadFocus = !s.result; }
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
      var audio = this.audioProps(p, s);
      var itemLines = [];
      
      var def = DojoTypes.get(cur.item.type);
      var questionEl = def ? h(def.Question, this.questionProps(p, s)) : html`<p class="notice bad" role="alert" data-testid="unsupported-type">${t('session.unsupported')}</p>`;
      
      return html`<main class="screen session" data-testid="session" data-mode="placement">
        <div class="topbar">
          <button type="button" class="btn" data-testid="btn-exit" onClick=${function () { self.setState({ confirm: 'exit' }); }}>${t('session.exit')}</button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${cur.total} aria-valuenow=${cur.position}>
            <span style=${{ width: Math.round(100 * (cur.position - (s.result ? 0 : 1)) / cur.total) + '%' }}></span>
          </div>
          <span class="count" data-testid="progress">${cur.position} / ${cur.total}</span>
        </div>
        <article class="qcard" ref=${function (el) { self.qbox = el; }}>
          <${Stimulus} stimulus=${cur.stimulus} audio=${audio} />
          ${renderPromptLine(renderPromptEl(cur.item, false), cur.item, audio, itemLines)}
          ${questionEl}
        </article>
        ${s.result ? this.renderFeedback(p, s) : null}
        ${s.error ? html`<p class="notice bad" role="alert" data-testid="session-error">${t('session.error', { code: s.error })}</p>` : null}
        ${this.renderDontKnow(p, s)}
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
    
    questionProps(p, s) {
      var self = this;
      return {
        item: s.cur.item, view: s.cur.view, result: s.result, picked: s.picked, exam: false, t: p.t,
        state: s.qstate,
        setState: function (patch) { self.setState({ qstate: Object.assign({}, self.state.qstate, patch) }); },
        onSubmit: function (input, picked) { self.submit(input, picked); },
        onReveal: function () { /* no reveal in placement */ },
        inputRef: function (el) { self.input = el; }
      };
    }
    isExam() { return false; }
    isExamMode() { return false; }
  }

    PlacementSession.prototype.submit = shared.answer;
    ['dontKnowAnswer', 'audioProps', 'renderDontKnow', 'feedbackDetail', 'renderFeedback'].forEach(function (k) { PlacementSession.prototype[k] = shared[k]; });

    return { PracticeSetup: PracticeSetup, PlacementScreen: PlacementScreen, PlacementSession: PlacementSession };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoPlacement = api;
})(typeof self !== 'undefined' ? self : this);
