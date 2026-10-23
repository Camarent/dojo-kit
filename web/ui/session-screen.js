/*
 * ui/session-screen.js — SessionBoundary and SessionScreen components
 * Globals expected: preact, htm, DojoTypes, DojoExt, DojoSpeech, DojoCommon, DojoDetail, DojoSessionFeedback.
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
  var renderPromptEl = DojoCommon.renderPromptEl;
  var renderPromptLine = DojoCommon.renderPromptLine;
  var speechLines = DojoCommon.speechLines;
  var Playback = DojoCommon.Playback;
  var cls = DojoCommon.cls;
  var Dialog = DojoCommon.Dialog;
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;

  var createShared = (root.DojoSessionFeedback || (typeof require !== 'undefined' ? require('./session-feedback.js') : {})).createShared;
  var QTimer = (root.DojoQuestionTimer || (typeof require !== 'undefined' ? require('./question-timer.js') : null));
  var QuestionTimer = QTimer ? QTimer.create().QuestionTimer : null;
  var Dictation = root.DojoDictation || (typeof require !== 'undefined' ? require('./dictation.js') : null);
  var SessionFocus = (root.DojoSessionFocus || (typeof require !== 'undefined' ? require('./session-focus.js') : {}));

  function create(deps) {
    var Stimulus = deps.Stimulus;
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
      if (Dictation) Dictation.sync(this);
      this.focusSoon();
    }
    componentWillUnmount() {
      this.props.win.removeEventListener('keydown', this.onKey);
      this.props.win.removeEventListener('pointerdown', this.onModality);
      if (Speech) Speech.stop(this.props.win);
      if (this.timer) clearInterval(this.timer);
      if (this.dict) this.dict.stop();
      if (this.onHide) {
        this.props.win.removeEventListener('visibilitychange', this.onHide);
        this.props.win.removeEventListener('pagehide', this.onHide);
      }
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.removeEventListener && this._onVoices) ss.removeEventListener('voiceschanged', this._onVoices);
      if (this.props.session.release) this.props.session.release();
    }
    componentDidUpdate() { if (Dictation) Dictation.sync(this); this.focusSoon(); }
    onModality(e) { SessionFocus.onModality(this,e); }
    focusSoon() { SessionFocus.focusSoon(this); }
    refocusLost(s,box,doc,active,had) { SessionFocus.refocusLost(this,s,box,doc,active,had); }
    focusTarget(s,box) { return SessionFocus.focusTarget(this,s,box); }
    applyFocus() { SessionFocus.applyFocus(this); }
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
    timeout() {
      var q = this.state.qstate;
      if (this.state.result || !this.state.cur) return;
      var r = this.props.session.answerTimed({ text: q && typeof q.text === 'string' ? q.text : '' });
      if (r.error || r.retry) return;
      this.answeredOn = this.state.cur;
      this.setState({ result: r, picked: q && q.text, error: null, guard: null, answered: this.state.answered + 1 });
    }
    renderQTimer(p, s, audio) {
      var self = this;
      var session = p.session;
      var item = s.cur.item;
      var limit = session.timerLimit && !s.result && !s.showIntro ? session.timerLimit(item) : null;
      if (!limit || !QuestionTimer) return null;
      var st = s.cur.stimulus;
      var pids = ['i:' + item.id].concat(st ? ['s:' + st.id] : []);
      var hasAudio = !!audio && audio.status === 'ok' && (speechLines(item).length > 0 || (st && (speechLines(st).length > 0 || (st.audio && st.audio.length > 0))));
      var canStart = function () { return !hasAudio || pids.some(function (k) { return self.played && self.played[k]; }); };
      return h(QuestionTimer, { key: 'qt' + s.cur.position, now: p.now, limitMs: limit, canStart: canStart,
        onStart: function () { session.timerStart(item); }, onExpire: function () { self.timeout(); }, stopped: !!s.result });
    }
    isExamMode() { return this.props.session.mode==='exam'; }
    isExam() { return this.props.session.mode==='exam'&&!this.props.session.training; }
    onInputNav(e) { SessionFocus.onInputNav(this,e); }
    onKey(e) {
      this.onModality(e);
      var s = this.state;
      if (s.confirm || !s.cur || DojoTypes.keyBlocked(e, {allowInput: true})) return;
      if (this.dict && this.dict.onKey(e)) return;
      var tag = e.target && e.target.tagName;
      var advance = e.key === 'Enter' || e.key === 'ArrowRight';
      if (s.introCard) { this.onIntroKey(e, tag, advance); return; }
      if (s.result && advance) { this.onAdvanceKey(e, tag); return; }
      this.onInputNav(e);
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
        item: s.cur.item, view: s.cur.view, stimulus: s.cur.stimulus, result: s.result, picked: s.picked, exam: this.isExam(), t: p.t,
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
    renderTopbar(p, s) {
      var self = this;
      var t = p.t;
      var session = p.session;
      var cur = s.cur;
      return html`<div class="topbar">
          <button type="button" class="btn icon-btn" data-testid="btn-exit" aria-label=${t('session.exit')} title=${t('session.exit')} onClick=${function () { self.setState({ confirm: 'exit' }); }}><span aria-hidden="true">\u00d7</span></button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${cur.total} aria-valuenow=${cur.position}>
            <span style=${{ width: Math.round(100 * (cur.position - (s.result ? 0 : 1)) / cur.total) + '%' }}></span>
          </div>
          <span class="count" data-testid="progress">${Math.min(cur.position, session.initialTotal)} / ${session.initialTotal}</span>
          ${session.retryCount() > 0 ? html`<span class="badge retry" data-testid="retry-badge">${t('session.retries', { n: session.retryCount() })}</span>` : null}
          ${session.group && session.group.count > 1 ? html`<span class="count" data-testid="group">${t('session.group', { n: session.group.index + 1, total: session.group.count })}</span>` : null}
          ${s.remaining !== null ? html`<span class=${cls('timer', s.remaining < 60000 && 'low')} data-testid="timer">${fmtClock(s.remaining)}</span>` : null}
        </div>`;
    }
    renderIntroCard(p, s, audio) {
      var self = this;
      var t = p.t;
      var cur = s.cur;
      var card = s.introCard;
      var introBody = renderIntroBody({ intro: card, item: cur.item, ctx: { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: t, h: h }, decl: renderDeclarativeDetail(p.course, (p.course.units || []).find(function (u) { return u.id === cur.item.unit; }) || null, cur.item, p.t) });
      var body = introBody;
      if (audio && card.speak) {
        body = html`<div class="qline">
                <div class="qbody">${introBody}</div>
                <${Playback} audio=${audio} lines=${speechLines(card)} testid="play-intro" pid=${'n:' + card.id} />
              </div>`;
      }
      return html`<article class="qcard intro-card" data-testid="intro-card">
          <span class="badge" data-testid="intro-label">${t('intro.label')}</span>
          ${body}
        </article>
        <div class="row end">
          <button type="button" class="btn primary" data-testid="btn-intro-done" ref=${function (el) { self.introBtn = el; }}
            onClick=${function () { self.introDone(); }}>${t('intro.gotit')}</button>
        </div>`;
    }
    renderQuestionCard(p, s, audio) {
      var introText = function (item) { return DojoExt.preAnswerText ? DojoExt.preAnswerText(item, item.explanation) : item.explanation; };
      var self = this;
      var cur = s.cur;
      var itemLines = audio ? speechLines(cur.item) : [];
      var caption = captionFor(p.course, cur.item, p.t);
      var def = DojoTypes.get(cur.item.type);
      var showPlainPrompt = !def || !def.ownsPrompt || !def.ownsPrompt(cur.item, cur.view);
      var plainPrompt = typeof cur.item.prompt === 'string' ? (DojoExt.plain ? DojoExt.plain(cur.item.prompt) : cur.item.prompt) : '';
      var bigPrompt = plainPrompt.length > 0 && plainPrompt.length <= 6 && plainPrompt.indexOf('\n') < 0;
      return html`<article class="qcard">
          ${s.showIntro && introText(cur.item) ? html`<div class="intro" data-testid="intro">${renderText(introText(cur.item))}</div>` : null}
          <${Stimulus} stimulus=${cur.stimulus} audio=${audio} dict=${this.dict} />
          ${caption ? html`<p class="qcaption" data-testid="caption">${caption}</p>` : null}
          ${showPlainPrompt ? renderPromptLine(renderPromptEl(cur.item, bigPrompt), cur.item, audio, itemLines)
            : renderPromptLine(null, cur.item, audio, itemLines)}
          <div style="display: contents" ref=${function (el) { self.qbox = el; }}>${this.renderQuestion(p, s)}</div>
        </article>`;
    }
    renderActions(p, s) {
      var self = this;
      var t = p.t;
      var exam = this.isExam();
      var examMode = this.isExamMode();
      var last = s.cur.position >= s.cur.total;
      return html`<div class="row actions-row">
          ${this.renderDontKnow(p, s)}
          ${examMode ? html`<button type="button" class="btn" data-testid="btn-finish" onClick=${function () { self.setState({ confirm: 'finish' }); }}>${t('session.finish')}</button>` : null}
          <button type="button" class="btn primary" disabled=${!exam && !s.result} data-testid="btn-next"
            ref=${function (el) { self.nextBtn = el; }}
            title=${t('session.next.withArrow')} aria-label=${t('session.next.withArrow')}
            onClick=${function () { if (examMode && last) self.setState({ confirm: 'finish' }); else self.next(); }}>${examMode && last ? t('session.finish') : t('session.next')}</button>
        </div>`;
    }
    renderDialogs(p, s) {
      var self = this;
      var t = p.t;
      var unanswered = p.session.total - p.session.answered;
      if (s.confirm === 'exit') {
        return html`<${Dialog} testid="dlg-exit" title=${t('session.exit.title')} body=${t('session.exit.body')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('session.exit')} danger=${true}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { p.onExit(); }} />`;
      }
      if (s.confirm === 'finish') {
        return html`<${Dialog} testid="dlg-finish" title=${t('session.finish.title')}
          body=${unanswered > 0 ? t('session.finish.unanswered', { n: unanswered }) : t('session.finish.all')}
          cancelLabel=${t('session.stay')} confirmLabel=${t('session.finish')}
          onCancel=${function () { self.setState({ confirm: null }); }} onConfirm=${function () { self.setState({ confirm: null }); self.finish(); }} />`;
      }
      return null;
    }
    render(p, s) {
      if (!s.cur) return null;
      var card = s.introCard;
      var audio = this.audioProps(p, s);
      return html`<main class="screen session" data-testid="session" data-mode=${p.session.mode}>
        ${this.renderTopbar(p, s)}
        ${p.session.warnings ? html`<p class="notice" data-testid="exam-short">${p.t('session.short')}</p>` : null}
        ${card ? null : this.renderQTimer(p, s, audio)}
        ${card ? this.renderIntroCard(p, s, audio) : this.renderQuestionCard(p, s, audio)}
        ${card ? null : this.renderFeedback(p, s)}
        ${s.guard ? html`<p class="notice bad" role="alert" data-testid="guard-message">${s.guard}</p>` : null}
        ${s.error ? html`<p class="notice bad" role="alert" data-testid="session-error">${p.t('session.error', { code: s.error })}</p>` : null}
        ${card ? null : this.renderActions(p, s)}
        ${this.renderDialogs(p, s)}
      </main>`;
    }
  }
    ['answer', 'dontKnowAnswer', 'overrideAnswer', 'audioProps', 'renderDontKnow', 'feedbackDetail', 'renderFeedback'].forEach(function (k) { SessionScreen.prototype[k] = shared[k]; });

    return { SessionBoundary: SessionBoundary, SessionScreen: SessionScreen };
  }

  var api = { create: create, createShared: createShared };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionScreen = api;
})(typeof self !== 'undefined' ? self : this);
