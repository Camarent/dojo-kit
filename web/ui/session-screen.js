/*
 * ui/session-screen.js — SessionBoundary and SessionScreen components
 * Globals expected: preact, htm, DojoTypes, DojoExt, DojoSpeech, DojoCommon, DojoDetail, DojoSessionFeedback.
 * create(deps) takes { Stimulus, fbRows, tagInfo, captionFor, fmtClock } and returns { SessionBoundary, SessionScreen }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);

  // Global first, then CommonJS require in Node tests; `fallback` when neither exists.
  function dep(name, file, fallback) {
    return root[name] || (typeof require !== 'undefined' ? require(file) : fallback);
  }

  var DojoExt = root.DojoExt || {};
  var DojoTypes = root.DojoTypes || {};
  var DojoCommon = dep('DojoCommon', './common.js', {});
  var Speech = root.DojoSpeech;
  var hasPlayableSource = function (st) { return (root.DojoStimulus || require('./stimulus.js')).hasPlayableSource(st); };
  var SessionFeedback = dep('DojoSessionFeedback', './session-feedback.js', {});
  var createShared = SessionFeedback.createShared;
  var QTimer = dep('DojoQuestionTimer', './question-timer.js', null);
  var QuestionTimer = QTimer ? QTimer.create().QuestionTimer : null;
  var Dictation = dep('DojoDictation', './dictation.js', null);
  var SessionFocus = dep('DojoSessionFocus', './session-focus.js', {});
  var SessionBoundary = dep('DojoSessionBoundary', './session-boundary.js', {}).SessionBoundary;
  var Panels = dep('DojoSessionPanels', './session-panels.js', {});

  // ---------- Session ----------

  // Pure helpers (no `this`).

  function introTextOf(item) {
    return DojoExt.preAnswerText ? DojoExt.preAnswerText(item, item.explanation) : item.explanation;
  }

  // The intro shows only when it has text that does not leak the answer.
  function introAllowed(item) {
    var pre = introTextOf(item);
    var U = root.DojoSessionUtil;
    return !!pre && !(U && U.leaksAnswer && U.leaksAnswer(item, pre));
  }

  function audioMarkNow() {
    return root.DojoAudio && root.DojoAudio.mark ? root.DojoAudio.mark() : 0;
  }

  // True when the question's audio is needed before its timer may start.
  function hasAudioFor(item, st, audio) {
    if (!audio) return false;
    if (hasPlayableSource(st)) return true;
    var ready = audio.status === 'ok' || !!(st && st.hideText);
    return ready && (DojoCommon.speechLines(item).length > 0 || !!(st && !st.hideText && st.audio && st.audio.length > 0));
  }

  function plainPromptOf(item) {
    if (typeof item.prompt !== 'string') return '';
    return DojoExt.plain ? DojoExt.plain(item.prompt) : item.prompt;
  }

  // Caption; dropped for a numeric item whose plain prompt already shows the text.
  function captionOf(captionFor, p, item, promptShown) {
    var caption = captionFor(p.course, item, p.t);
    if (item.type === 'numeric' && promptShown && !(p.course && p.course.captions && p.course.captions.numeric)) return '';
    return caption;
  }

  // Prompt line: the plain prompt (large when short) or none when the question type owns its prompt.
  function promptLine(cur, showPlain, plain, audio) {
    var itemLines = audio ? DojoCommon.speechLines(cur.item) : [];
    if (!showPlain) return DojoCommon.renderPromptLine(null, cur.item, audio, itemLines);
    var bigPrompt = plain.length > 0 && plain.length <= 6 && plain.indexOf('\n') < 0;
    return DojoCommon.renderPromptLine(DojoCommon.renderPromptEl(cur.item, bigPrompt), cur.item, audio, itemLines);
  }

  // Base class; create() subclasses it and sets `deps` on the subclass prototype.
  class SessionScreenBase extends Component {
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
      if (showIntro) showIntro = introAllowed(cur.item);
      return { cur: cur, result: null, picked: null, qstate: this.initialQState(cur), error: null, guard: null, retry: false, speechFail: false, showIntro: showIntro, introCard: card, audioMark: audioMarkNow() };
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
    refocusLost(s,box,env) { SessionFocus.refocusLost(this,s,box,env); }
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
      var limit = session.timerLimit && !s.showIntro ? session.timerLimit(item) : null;
      if (!limit || !QuestionTimer || s.result) return null;
      var st = s.cur.stimulus;
      var pids = ['i:' + item.id].concat(st ? ['s:' + st.id] : []);
      var hasAudio = hasAudioFor(item, st, audio);
      var canStart = function () { return !hasAudio || pids.some(function (k) { return (self.played && self.played[k]) || (self.released && self.released[k]); }); };
      return h(QuestionTimer, { key: 'qt' + s.cur.position, now: p.now, limitMs: limit, canStart: canStart,
        onStart: function () { session.timerStart(item); }, onExpire: function () { self.timeout(); }, stopped: !!s.result, t: p.t });
    }
    isExamMode() { return this.props.session.mode==='exam'; }
    isExam() { return this.props.session.mode==='exam'&&!this.props.session.training; }
    onInputNav(e) { SessionFocus.onInputNav(this,e); }
    onKey(e) {
      this.onModality(e);
      var s = this.state;
      if (s.confirm || !s.cur || DojoTypes.keyBlocked(e, {allowInput: true})) return;
      if (this.dict && this.dict.onKey(e)) return;
      this.onNavKey(e, s);
    }
    onNavKey(e, s) {
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
    renderTopbar(p, s) { return Panels.renderTopbar(this, p, s); }
    renderIntroCard(p, s, audio) { return Panels.renderIntroCard(this, p, s, audio); }
    renderQuestionCard(p, s, audio) {
      var self = this;
      var cur = s.cur;
      var def = DojoTypes.get(cur.item.type);
      var showPlainPrompt = !def || !def.ownsPrompt || !def.ownsPrompt(cur.item, cur.view);
      var plain = plainPromptOf(cur.item);
      var caption = captionOf(this.deps.captionFor, p, cur.item, showPlainPrompt && plain.length > 0);
      var intro = s.showIntro && introTextOf(cur.item);
      return html`<article class="qcard">
          ${intro ? html`<div class="intro" data-testid="intro">${DojoCommon.renderText(intro)}</div>` : null}
          <${this.deps.Stimulus} stimulus=${cur.stimulus} audio=${audio} dict=${this.dict} />
          ${caption ? html`<p class="qcaption" data-testid="caption">${caption}</p>` : null}
          ${promptLine(cur, showPlainPrompt, plain, audio)}
          <div style="display: contents" ref=${function (el) { self.qbox = el; }}>${QTimer ? QTimer.slot(h, p.session.timerLimit && p.session.timerLimit(cur.item), this.renderQTimer(p, s, audio)) : null}${this.renderQuestion(p, s)}</div>
        </article>`;
    }
    renderActions(p, s) { return Panels.renderActions(this, p, s); }
    renderDialogs(p, s) { return Panels.renderDialogs(this, p, s); }
    render(p, s) {
      if (!s.cur) return null;
      var card = s.introCard;
      var audio = this.audioProps(p, s);
      return html`<main class="screen session" data-testid="session" data-mode=${p.session.mode}>
        ${this.renderTopbar(p, s)}
        ${p.session.warnings ? html`<p class="notice" data-testid="exam-short">${p.t('session.short')}</p>` : null}
        ${card ? this.renderIntroCard(p, s, audio) : this.renderQuestionCard(p, s, audio)}
        ${card ? null : this.renderFeedback(p, s)}
        ${s.guard ? html`<p class="notice bad" role="alert" data-testid="guard-message">${s.guard}</p>` : null}
        ${s.error ? html`<p class="notice bad" role="alert" data-testid="session-error">${p.t('session.error', { code: s.error })}</p>` : null}
        ${card ? null : this.renderActions(p, s)}
        ${this.renderDialogs(p, s)}
      </main>`;
    }
  }

  function create(deps) {
    var shared = createShared(deps);
    // One subclass per create() call, so each call keeps its own deps.
    class SessionScreen extends SessionScreenBase {}
    SessionScreen.prototype.deps = deps;
    ['answer', 'dontKnowAnswer', 'overrideAnswer', 'audioProps', 'renderDontKnow', 'feedbackDetail', 'renderFeedback'].forEach(function (k) { SessionScreen.prototype[k] = shared[k]; });

    return { SessionBoundary: SessionBoundary, SessionScreen: SessionScreen };
  }

  var api = { create: create, createShared: createShared };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionScreen = api;
})(typeof self !== 'undefined' ? self : this);
