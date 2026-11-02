/*
 * ui/session-feedback.js — answer, don't-know, override and feedback-panel methods shared by SessionScreen and PlacementSession.
 * Globals expected: preact, htm, DojoTypes, DojoExt, DojoSpeech, DojoCommon, DojoDetail.
 * createShared({ kanjiRows, tagInfo }) returns the method table; `this` is the host component.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  function loadDep(name, file) {
    return root[name] || (typeof require !== 'undefined' ? require(file) : null);
  }

  var DojoExt = root.DojoExt || {};
  var DojoTypes = root.DojoTypes || {};
  var DojoCommon = loadDep('DojoCommon', './common.js') || {};
  var DojoDetail = loadDep('DojoDetail', './detail.js') || {};
  var Speech = root.DojoSpeech || null;

  var renderTextAll = DojoCommon.renderTextAll;
  var speechCfg = DojoCommon.speechCfg;
  var cls = DojoCommon.cls;
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;

  // Methods shared by SessionScreen and PlacementSession; `this` is the host component
  // (needs props, state, setState, isExam(), isExamMode(), overrideAnswer()).
  function revealedLine(s, t) {
    var st = s.cur && s.cur.stimulus;
    if (!st || !st.hideText || !st.text) return null;
    return html`<p data-testid="revealed-text">${t('session.revealed')} <span class="pre">${st.text}</span></p>`;
  }

  // Flag button for the heard clip: never in exam mode, only when a clip was heard for this item.
  function heardClipId(host, p, s) {
    var A = root.DojoAudio;
    var st = s.cur && s.cur.stimulus;
    var engine = p.engine;
    if (host.isExam() || !st || !A || !A.heardClip || !engine || !engine.flagClip) return null;
    return A.heardClip(st.id, s.audioMark) || null;
  }

  function flagButton(host, p, s) {
    var t = p.t;
    var engine = p.engine;
    var id = heardClipId(host, p, s);
    if (!id) return null;
    var on = !!(engine.isClipFlagged && engine.isClipFlagged(id));
    return html`<button type="button" class="btn secondary" data-testid="btn-flag-clip" onClick=${function () { engine.flagClip(id, !on); host.setState({}); }}>${t(on ? 'session.flagClipDone' : 'session.flagClip')}</button>`;
  }

  function answer(input, picked) {
    if (this.state.result || this.answeredOn === this.state.cur) return;
    var guard = DojoExt.beforeSubmit ? DojoExt.beforeSubmit(this.state.cur.item, input) : null;
    if (guard && typeof guard.message === 'string') { this.setState({ guard: guard.message }); return; }
    var r = this.props.session.answer(input);
    if (r.error) { this.setState({ error: r.error }); return; }
    if (r.verdict === 'retry') { this.setState({ retry: true, error: null, guard: null }); return; }
    this.answeredOn = this.state.cur;
    this.setState({ result: r, picked: picked, error: null, guard: null, answered: this.state.answered + 1 });
  }

  function dontKnowAnswer() {
    if (this.state.result || this.answeredOn === this.state.cur) return;
    var r = this.props.session.dontKnow();
    if (r.error) { this.setState({ error: r.error }); return; }
    this.answeredOn = this.state.cur;
    this.setState({ result: r, error: null, guard: null, answered: this.state.answered + 1 });
  }

  function overrideAnswer() {
    if (this.overriddenOn === this.state.result) return;
    this.overriddenOn = this.state.result;
    var r = this.props.session.overrideLast();
    if (r.error) { this.setState({ error: r.error }); return; }
    this.setState({ result: r, error: null, guard: null });
  }

  function audioProps(p, s) {
    var self = this;
    if (!Speech) return null;
    var cfg = speechCfg(p.course, p.store);
    return { t: p.t, win: p.win, cfg: cfg, exam: this.isExam(), uiLang: p.lang, debug: !!(p.store && p.store.doc && p.store.doc.settings && p.store.doc.settings.debug), played: this.played || (this.played = {}), released: this.released || (this.released = {}),
      status: s.speechFail ? 'failed' : Speech.status(cfg, p.win),
      onFail: function () { self.setState({ speechFail: true }); } };
  }

  function renderDontKnow(p, s) {
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

  function createShared(deps) {
    var kanjiRows = deps.kanjiRows;
    var tagInfo = deps.tagInfo;
    return {
    answer: answer,
    dontKnowAnswer: dontKnowAnswer,
    overrideAnswer: overrideAnswer,
    audioProps: audioProps,
    renderDontKnow: renderDontKnow,
    // Wrong-answer extras: entity intro body (plugin intro hook or title + text), else plugin detail hook and the declarative
    // detail, then the item's tags. Correct answers get only the plugin detail hook output (ctx.correct true); null when
    // there is nothing to show.
    feedbackDetail: function (p, s) { return feedbackDetail(p, s, tagInfo); },
    renderFeedback: function (p, s) {
      var t = p.t;
      var res = s.result;
      var exam = this.isExam();
      var body = null;
      if (res && exam) {
        body = html`<p class="muted" data-testid="recorded">${t('session.recorded')}</p>`;
      } else if (res) {
        body = resultBody(this, p, s, kanjiRows);
      } else if (s.retry) {
        body = html`<div class="feedback retry" data-testid="feedback-retry" role="status"><b>${t('session.retry')}</b> <span data-testid="retry-message">${t('session.retry.message')}</span></div>`;
      }
      return html`<div class="feedback-slot">${body}</div>`;
    }
    };
  }

  function entityIntroOf(session, item) {
    try { return session.entityIntro ? session.entityIntro(item) : null; } catch { return null; }
  }

  function feedbackCtx(p, s, correct, intro) {
    return { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: p.t, h: h, feedback: true, correct: correct, timedOut: !!(s.result && s.result.timedOut), expected: s.result ? s.result.expected : undefined, intro: intro };
  }

  function correctDetail(item, ctx) {
    var shown = DojoExt.detail ? DojoExt.detail(item, ctx) : null;
    return shown ? html`<section class="feedback-detail" data-testid="feedback-detail"><div data-testid="detail-hook">${shown}</div></section>` : null;
  }

  function wrongDetailBody(p, item, ctx, intro) {
    var unit = (p.course.units || []).filter(function (u) { return u.id === item.unit; })[0] || null;
    var decl = renderDeclarativeDetail(p.course, unit, item, p.t, true);
    if (intro) return renderIntroBody({ intro: intro, item: item, ctx: ctx, decl: decl, all: true });
    var hook = DojoExt.detail ? DojoExt.detail(item, ctx) : null;
    return hook ? html`<div data-testid="detail-hook">${hook}</div>` : decl;
  }

  function itemTags(p, item, tagInfo) {
    return (item.tags || []).filter(function (tg) { return typeof tg === 'string' && !tagInfo({ tagLabels: p.course.tagLabels }, tg).internal; });
  }

  function feedbackDetail(p, s, tagInfo) {
    var item = s.cur && s.cur.item;
    if (!item) return null;
    var correct = !!(s.result && s.result.correct);
    var intro = entityIntroOf(p.session, item);
    var ctx = feedbackCtx(p, s, correct, intro);
    if (correct) return correctDetail(item, ctx);
    var body = wrongDetailBody(p, item, ctx, intro);
    var tags = itemTags(p, item, tagInfo);
    if (!body && !tags.length) return null;
    return html`<section class="feedback-detail" data-testid="feedback-detail">
      ${body}
      ${tags.length ? html`<p class="tags" data-testid="feedback-tags">${tags.map(function (tg) { return html`<span class="chip tag" key=${tg}>${tagInfo({ tagLabels: p.course.tagLabels }, tg).label}</span>`; })}</p>` : null}
    </section>`;
  }

  function verdictText(def, res, t) {
    if (def.verdict) return def.verdict(res, t);
    if (res.correct) return t('session.correct');
    return res.timedOut ? t('session.timedOut') : t('session.wrong');
  }

  function expectedLine(def, res, t) {
    if (def.hideExpected || res.correct) return null;
    return html`<p data-testid="expected">${t('session.expected')} <span class="pre">${renderTextAll(res.expected)}</span></p>`;
  }

  function overrideButton(host, p, s) {
    var res = s.result;
    var showOverride = !res.correct && !res.timedOut && host.props.session.canOverride && host.props.session.canOverride();
    if (!showOverride) return null;
    return html`<button type="button" class="btn" data-testid="btn-override" onClick=${function () { host.overrideAnswer(); }}>${p.t('session.override')}</button>`;
  }

  function resultBody(host, p, s, kanjiRows) {
    var t = p.t;
    var res = s.result;
    var def = DojoTypes.get(s.cur.item.type) || {};
    return html`<div class=${cls('feedback', res.correct ? 'right' : 'wrong')} data-testid="feedback" role="status">
        <b data-testid="verdict">${verdictText(def, res, t)}</b>
        ${expectedLine(def, res, t)}
        ${revealedLine(s, t)}
        ${root.DojoClipText ? root.DojoClipText.render(s, t, p.lang) : null}
        ${def.Extra ? h(def.Extra, { result: res, t: t, raw: s.qstate && s.qstate.text }) : null}
        ${res.explanation ? html`<p class="pre" data-testid="explanation">${renderTextAll(res.explanation)}</p>` : null}
        ${host.feedbackDetail(p, s)}
        ${kanjiRows(p, s, host.isExamMode())}
        ${overrideButton(host, p, s)}
        ${flagButton(host, p, s)}
      </div>`;
  }

  var api = { createShared: createShared, flagButton: flagButton };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionFeedback = api;
})(typeof self !== 'undefined' ? self : this);
