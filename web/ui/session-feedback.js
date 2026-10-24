/*
 * ui/session-feedback.js — answer, don't-know, override and feedback-panel methods shared by SessionScreen and PlacementSession.
 * Globals expected: preact, htm, DojoTypes, DojoExt, DojoSpeech, DojoCommon, DojoDetail.
 * createShared({ kanjiRows, tagInfo }) returns the method table; `this` is the host component.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  var DojoExt = root.DojoExt || {};
  var DojoTypes = root.DojoTypes || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var DojoDetail = root.DojoDetail || (typeof require !== 'undefined' ? require('./detail.js') : null) || {};
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
  function flagButton(host, p, s) {
    var t = p.t;
    var A = root.DojoAudio;
    var st = s.cur && s.cur.stimulus;
    var engine = p.engine;
    if (host.isExam() || !st || !A || !A.heardClip || !engine || !engine.flagClip) return null;
    var id = A.heardClip(st.id, s.audioMark);
    if (!id) return null;
    var on = !!(engine.isClipFlagged && engine.isClipFlagged(id));
    return html`<button type="button" class="btn secondary" data-testid="btn-flag-clip" onClick=${function () { engine.flagClip(id, !on); host.setState({}); }}>${t(on ? 'session.flagClipDone' : 'session.flagClip')}</button>`;
  }

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
    overrideAnswer: function () {
      if (this.overriddenOn === this.state.result) return;
      this.overriddenOn = this.state.result;
      var r = this.props.session.overrideLast();
      if (r.error) { this.setState({ error: r.error }); return; }
      this.setState({ result: r, error: null, guard: null });
    },
    audioProps: function (p, s) {
      var self = this;
      if (!Speech) return null;
      var cfg = speechCfg(p.course, p.store);
      return { t: p.t, win: p.win, cfg: cfg, exam: this.isExam(), uiLang: p.lang, debug: !!(p.store && p.store.doc && p.store.doc.settings && p.store.doc.settings.debug), played: this.played || (this.played = {}), released: this.released || (this.released = {}),
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
    // detail, then the item's tags. Correct answers get only the plugin detail hook output (ctx.correct true); null when
    // there is nothing to show.
    feedbackDetail: function (p, s) {
      var item = s.cur && s.cur.item;
      var session = p.session;
      if (!item) return null;
      var correct = !!(s.result && s.result.correct);
      var ctx = { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: p.t, h: h, feedback: true, correct: correct, timedOut: !!(s.result && s.result.timedOut), expected: s.result ? s.result.expected : undefined };
      if (correct) {
        var shown = DojoExt.detail ? DojoExt.detail(item, ctx) : null;
        return shown ? html`<section class="feedback-detail" data-testid="feedback-detail"><div data-testid="detail-hook">${shown}</div></section>` : null;
      }
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
        var showOverride = !res.correct && !res.timedOut && this.props.session.canOverride && this.props.session.canOverride();
        body = html`<div class=${cls('feedback', res.correct ? 'right' : 'wrong')} data-testid="feedback" role="status">
          <b data-testid="verdict">${def.verdict ? def.verdict(res, t) : (res.correct ? t('session.correct') : res.timedOut ? t('session.timedOut') : t('session.wrong'))}</b>
          ${!def.hideExpected && !res.correct ? html`<p data-testid="expected">${t('session.expected')} <span class="pre">${renderTextAll(res.expected)}</span></p>` : null}
          ${revealedLine(s, t)}
          ${root.DojoClipText ? root.DojoClipText.render(s, t, p.lang) : null}
          ${def.Extra ? h(def.Extra, { result: res, t: t, raw: s.qstate && s.qstate.text }) : null}
          ${res.explanation ? html`<p class="pre" data-testid="explanation">${renderTextAll(res.explanation)}</p>` : null}
          ${this.feedbackDetail(p, s)}
          ${kanjiRows(p, s, this.isExamMode())}
          ${showOverride ? html`<button type="button" class="btn" data-testid="btn-override" onClick=${function () { self.overrideAnswer(); }}>${t('session.override')}</button>` : null}
          ${flagButton(this, p, s)}
        </div>`;
      } else if (s.retry) {
        body = html`<div class="feedback retry" data-testid="feedback-retry" role="status"><b>${t('session.retry')}</b> <span data-testid="retry-message">${t('session.retry.message')}</span></div>`;
      }
      return html`<div class="feedback-slot">${body}</div>`;
    }
    };
  }

  var api = { createShared: createShared, flagButton: flagButton };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionFeedback = api;
})(typeof self !== 'undefined' ? self : this);
