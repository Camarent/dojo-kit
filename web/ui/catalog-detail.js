/*
 * ui/catalog-detail.js — CatalogScreen detail dialog: glyph, play button, body (intro, answers, stats).
 * Globals expected: preact, htm, DojoExt, DojoCommon, DojoDetail, DojoTopicLevels.
 * Functions take the CatalogScreen instance as `self` (self.ca, self.introOf, self.hookCtx, self.unitById, self.labelOf, self.ordOf, self.setState, self.state).
 */
(function (root) {
  'use strict';

  var html = htm.bind(preact.h);

  // Load dependencies
  var DojoExt = root.DojoExt || {};
  function loadDep(name, file) {
    return root[name] || (typeof require !== 'undefined' ? require(file) : null);
  }
  var DojoCommon = loadDep('DojoCommon', './common.js') || {};
  var DojoDetail = loadDep('DojoDetail', './detail.js') || {};
  var DojoTopicLevels = loadDep('DojoTopicLevels', './topic-levels.js') || {};

  // Alias from DojoCommon
  var renderText = DojoCommon.renderText;

  // Alias from DojoDetail
  var renderDeclarativeDetail = DojoDetail.renderDeclarativeDetail;
  var renderIntroBody = DojoDetail.renderIntroBody;
  var resolvePath = DojoDetail.resolvePath;

  function detailGlyph(self, p, d) {
    var cfg = (self.unitById[d.unit] && self.unitById[d.unit].detail) || p.course.detail;
    if (!cfg || typeof cfg.glyph !== 'string' || cfg.glyph === '') return null;
    var v = resolvePath(d, cfg.glyph);
    return typeof v === 'string' && v !== '' ? html`<span class="glyph-ch" data-testid="detail-glyph">${v}</span>` : null;
  }

  function detailPlay(self, p, d) {
    if (!self.ca || !self.ca.isAudioNumeric(d)) return null;
    return self.ca.playButton(p, d, self.ca.audioProps(p, function () { self.setState({ speechFail: true }); }, self.state.speechFail));
  }

  function introOut(self, dIntro, d) {
    return dIntro && DojoExt.intro ? DojoExt.intro(dIntro, d, self.hookCtx()) : null;
  }

  function renderDetailBody(self, p, t, d) {
    var rec = p.engine.record(d);
    var dIntro = self.introOf(d);
    var dIntroOut = introOut(self, dIntro, d);
    var detailHookOut = DojoExt.detail(d, self.hookCtx({ introRendered: !!dIntroOut }));
    var dDecl = !detailHookOut ? renderDeclarativeDetail(p.course, self.unitById[d.unit] || null, d, p.t) : null;
    return html`<article class="qcard">
          ${dIntro ? html`<section class="intro" data-testid="detail-intro">${renderIntroBody({ intro: dIntro, item: d, ctx: self.hookCtx(), decl: dDecl, all: false, pre: dIntroOut })}</section>` : null}
          ${dIntro ? null : dDecl}
          ${detailPlay(self, p, d)}
          <p data-testid="detail-answers"><b>${t('session.expected')}</b> <span class="pre">${renderText(p.engine.expected(d))}</span></p>
          ${d.explanation ? html`<p class="pre" data-testid="detail-explanation">${renderText(d.explanation)}</p>` : null}
          <p class="muted" data-testid="detail-stage">${t('catalog.stage')}: ${t('catalog.stage.' + p.engine.stage(d))}</p>
          ${DojoTopicLevels.renderTopicLevels(p.course, d.entity || d.id, p.engine.topicLevels(), t)}
          ${DojoDetail.renderRecordStats(rec, rec ? p.now() : 0, t)}
          ${detailHookOut ? html`<div data-testid="detail-hook">${detailHookOut}</div>` : null}
        </article>`;
  }

  function renderDetail(self, p, s, t, d) {
    var close = function () { self.setState({ detailItem: null }); };
    return html`<div class="overlay" data-testid="catalog-detail" onClick=${close}>
        <div class="dialog catalog-detail-dialog" role="dialog" aria-modal="true" onClick=${function (e) { e.stopPropagation(); }}>
          <div class="catalog-detail-header" data-testid="catalog-detail-header">
            <button type="button" class="btn icon" data-testid="btn-close-detail" onClick=${close}>${t('close')}</button>
            ${detailGlyph(self, p, d)}
            <h2 data-testid="detail-title">${renderText(self.labelOf(d).text)}${self.ordOf(d) ? ' #' + self.ordOf(d) : ''}</h2>
          </div>
          ${renderDetailBody(self, p, t, d)}
        </div>
      </div>`;
  }

  var api = { renderDetail: renderDetail, renderDetailBody: renderDetailBody, detailGlyph: detailGlyph, detailPlay: detailPlay };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoCatalogDetail = api;
})(typeof self !== 'undefined' ? self : this);
