/*
 * ui/session-screen.js — SessionBoundary and SessionScreen components
 * Globals expected: preact, htm, DojoTypes, DojoExt, DojoSpeech, DojoCommon, DojoDetail.
 * create(deps) takes { Stimulus, kanjiRows, tagInfo, captionFor, fmtClock } and returns { SessionBoundary, SessionScreen }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var Fragment = preact.Fragment;
  var html = htm.bind(h);

  var DojoExt = root.DojoExt || {};
  var DojoTypes = root.DojoTypes || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var DojoDetail = root.DojoDetail || (typeof require !== 'undefined' ? require('./detail.js') : null) || {};
  var Speech = root.DojoSpeech || null;

  var renderText = DojoCommon.renderText;
  var renderTextAll = DojoCommon.renderTextAll;
  var renderPromptEl = DojoCommon.renderPromptEl;
  var renderPromptLine = DojoCommon.renderPromptLine;
  var speechLines = DojoCommon.speechLines;
  var speechCfg = DojoCommon.speechCfg;
  var Playback = DojoCommon.Playback;
  var cls = DojoCommon.cls;
  var Dialog = DojoCommon.Dialog;
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;


  // Methods shared by SessionScreen and PlacementSession; `this` is the host component
  // (needs props, state, setState, isExam(), isExamMode(), overrideAnswer()).
  function createShared(deps) {
    var kanjiRows = deps.kanjiRows;
    var tagInfo = deps.tagInfo;
    return {
    answer: function (input, picked) {
      if (this.state.result || this.answeredOn === this.state.cur) return;
      var guard = DojoExt.beforeSubmit ? DojoExt.beforeSubmit(this.state.cur.item, input) : null;
      if (guard && typeof guard.message === 'string') { this.setState({ guard: guard.message }); return; }
      var r = this.props.session.answer(input);
      if (r.error) { this.setState({ error: r.error }); return; }
      if (r.verdict === 'retry') { this.setState({ retry: true, error: null, guard: null }); return; }
      this.answeredOn = this.state.cur;
      this.setState({ result: r, picked: picked, error: null, guard: null, answered: this.state.answered + 1 });
    },
    dontKnowAnswer: function () {
      if (this.state.result || this.answeredOn === this.state.cur) return;
      var r = this.props.session.dontKnow();
      if (r.error) { this.setState({ error: r.error }); return; }
      this.answeredOn = this.state.cur;
      this.setState({ result: r, error: null, guard: null, answered: this.state.answered + 1 });
    },
    audioProps: function (p, s) {
      var self = this;
      if (!Speech) return null;
      var cfg = speechCfg(p.course, p.store);
      return { t: p.t, win: p.win, cfg: cfg, exam: this.isExam(), uiLang: p.lang, played: this.played || (this.played = {}),
        status: s.speechFail ? 'unavailable' : Speech.status(cfg, p.win),
        onFail: function () { self.setState({ speechFail: true }); } };
    },
    renderDontKnow: function (p, s) {
      var t = p.t;
      var session = p.session;
      var item = s.cur && s.cur.item;
      if (!item || s.result || s.retry) return null;
      if (!session.canDontKnow || !session.canDontKnow()) return null;
      var self = this;
      return html`<div class="row end">
        <button type="button" class="btn secondary" data-testid="btn-dont-know" onClick=${function () { self.dontKnowAnswer(); }}>${t('session.dontKnow')}</button>
      </div>`;
    },
    // Wrong-answer extras: entity intro body (plugin intro hook or title + text), else plugin detail hook and the declarative
    // detail, then the item's tags. Null for correct answers and when there is nothing to show.
    feedbackDetail: function (p, s) {
      var item = s.cur && s.cur.item;
      var session = p.session;
      if (!item || (s.result && s.result.correct)) return null;
      var ctx = { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: p.t, h: h };
      var unit = (p.course.units || []).filter(function (u) { return u.id === item.unit; })[0] || null;
      var decl = renderDeclarativeDetail(p.course, unit, item, p.t, true);
      var intro = session.entityIntro ? session.entityIntro(item) : null;
      var body = null;
      if (intro) {
        body = renderIntroBody({ intro: intro, item: item, ctx: ctx, decl: decl, all: true });
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
    },
    renderFeedback: function (p, s) {
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
    };
  }

  function create(deps) {
    var Stimulus = deps.Stimulus;
    var kanjiRows = deps.kanjiRows;
    var tagInfo = deps.tagInfo;
    var captionFor = deps.captionFor;
    var fmtClock = deps.fmtClock;
    var shared = createShared(deps);

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
      if (s.introCard) { this.onIntroKey(e, tag, advance); return; }
      if (s.result && advance) { this.onAdvanceKey(e, tag); return; }
      this.onTypeKey(e, s);
    }
    onIntroKey(e, tag, advance) {
      if (advance && tag !== 'BUTTON' && tag !== 'A' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); this.introDone(); }
    }
    onAdvanceKey(e, tag) {
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
    }
    onTypeKey(e, s) {
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
    renderQuestion(p, s) {
      var def = DojoTypes.get(s.cur.item.type);
      if (!def) return html`<p class="notice bad" role="alert" data-testid="unsupported-type">${p.t('session.unsupported')}</p>`;
      return h(def.Question, this.questionProps(p, s));
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
            var introBody = renderIntroBody({ intro: card, item: cur.item, ctx: { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: t, h: h }, decl: renderDeclarativeDetail(p.course, (p.course.units || []).find(function (u) { return u.id === cur.item.unit; }) || null, cur.item, p.t) });
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
    ['answer', 'dontKnowAnswer', 'audioProps', 'renderDontKnow', 'feedbackDetail', 'renderFeedback'].forEach(function (k) { SessionScreen.prototype[k] = shared[k]; });

    return { SessionBoundary: SessionBoundary, SessionScreen: SessionScreen };
  }

  var api = { create: create, createShared: createShared };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionScreen = api;
})(typeof self !== 'undefined' ? self : this);
