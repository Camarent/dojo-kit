/*
 * ui/session-panels.js — session screen panels: top bar, intro card, action row and dialogs.
 * Globals expected: preact, htm, DojoCommon, DojoDetail.
 * Each renderer takes the SessionScreen instance `sc` first, then the render props `p` and state `s`.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  // Global first, then CommonJS require in Node tests; `fallback` when neither exists.
  function dep(name, file, fallback) {
    return root[name] || (typeof require !== 'undefined' ? require(file) : fallback);
  }

  var DojoCommon = dep('DojoCommon', './common.js', {});
  var DojoDetail = dep('DojoDetail', './detail.js', {});

  function renderTopbar(sc, p, s) {
    var t = p.t;
    var session = p.session;
    var cur = s.cur;
    return html`<div class="topbar">
          <button type="button" class="btn icon-btn" data-testid="btn-exit" aria-label=${t('session.exit')} title=${t('session.exit')} onClick=${function () { sc.setState({ confirm: 'exit' }); }}><span aria-hidden="true">×</span></button>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${cur.total} aria-valuenow=${cur.position}>
            <span style=${{ width: Math.round(100 * (cur.position - (s.result ? 0 : 1)) / cur.total) + '%' }}></span>
          </div>
          <span class="count" data-testid="progress">${Math.min(cur.position, session.initialTotal)} / ${session.initialTotal}</span>
          <span class=${DojoCommon.cls('badge retry', session.retryCount() === 0 && 'empty')} data-testid="retry-badge">${t('session.retries', { n: session.retryCount() })}</span>
          ${session.group && session.group.count > 1 ? html`<span class="count" data-testid="group">${t('session.group', { n: session.group.index + 1, total: session.group.count })}</span>` : null}
          ${s.remaining !== null ? html`<span class=${DojoCommon.cls('timer', s.remaining < 60000 && 'low')} data-testid="timer">${sc.deps.fmtClock(s.remaining)}</span>` : null}
        </div>`;
  }

  function renderIntroCard(sc, p, s, audio) {
    var t = p.t;
    var cur = s.cur;
    var card = s.introCard;
    var introBody = DojoDetail.renderIntroBody({ intro: card, item: cur.item, all: true, ctx: { items: (p.content && p.content.items) || [], records: (p.store && p.store.doc.items) || {}, t: t, h: h }, decl: DojoDetail.renderDeclarativeDetail(p.course, (p.course.units || []).find(function (u) { return u.id === cur.item.unit; }) || null, cur.item, p.t, true) });
    var body = introBody;
    if (audio && card.speak) {
      body = html`<div class="qline">
                <div class="qbody">${introBody}</div>
                <${DojoCommon.Playback} audio=${audio} lines=${DojoCommon.speechLines(card)} testid="play-intro" pid=${'n:' + card.id} />
              </div>`;
    }
    return html`<article class="qcard intro-card" data-testid="intro-card">
          <span class="badge" data-testid="intro-label">${t('intro.label')}</span>
          ${body}
        </article>
        <div class="row end">
          <button type="button" class="btn primary" data-testid="btn-intro-done" data-arrow-own ref=${function (el) { sc.introBtn = el; }}
            onClick=${function () { sc.introDone(); }}>${t('intro.gotit')}</button>
        </div>`;
  }

  function renderActions(sc, p, s) {
    var t = p.t;
    var exam = sc.isExam();
    var examMode = sc.isExamMode();
    var last = s.cur.position >= s.cur.total;
    return html`<div class="row actions-row">
          ${sc.renderDontKnow(p, s)}
          ${examMode ? html`<button type="button" class="btn" data-testid="btn-finish" onClick=${function () { sc.setState({ confirm: 'finish' }); }}>${t('session.finish')}</button>` : null}
          <button type="button" class="btn primary big" disabled=${!exam && !s.result} data-testid="btn-next" data-arrow-own
            ref=${function (el) { sc.nextBtn = el; }}
            title=${t('session.next.withArrow')} aria-label=${t('session.next.withArrow')}
            onClick=${function () { if (examMode && last) sc.setState({ confirm: 'finish' }); else sc.next(); }}>${examMode && last ? t('session.finish') : t('session.next')}</button>
        </div>`;
  }

  function renderDialogs(sc, p, s) {
    var t = p.t;
    var unanswered = p.session.total - p.session.answered;
    var Dialog = DojoCommon.Dialog;
    if (s.confirm === 'exit') {
      return html`<${Dialog} testid="dlg-exit" title=${t('session.exit.title')} body=${t('session.exit.body')}
        cancelLabel=${t('session.stay')} confirmLabel=${t('session.exit')} danger=${true}
        onCancel=${function () { sc.setState({ confirm: null }); }} onConfirm=${function () { p.onExit(); }} />`;
    }
    if (s.confirm === 'finish') {
      return html`<${Dialog} testid="dlg-finish" title=${t('session.finish.title')}
        body=${unanswered > 0 ? t('session.finish.unanswered', { n: unanswered }) : t('session.finish.all')}
        cancelLabel=${t('session.stay')} confirmLabel=${t('session.finish')}
        onCancel=${function () { sc.setState({ confirm: null }); }} onConfirm=${function () { sc.setState({ confirm: null }); sc.finish(); }} />`;
    }
    return null;
  }

  var api = { renderTopbar: renderTopbar, renderIntroCard: renderIntroCard, renderActions: renderActions, renderDialogs: renderDialogs };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionPanels = api;
})(typeof self !== 'undefined' ? self : this);
