/*
 * ui/clip-flags-section.js — settings section "Flagged recordings": lists flagged clips still used by content, un-flag per row,
 * "Copy ids" shows a textarea with the JSON list (paste pattern, no download).
 * render(p, t, self) -> section or null; p = settings props ({ engine, content }), self = settings host (state.clipFlagsText).
 * Globals expected: preact, htm, DojoAudio (optional, clip text).
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  function contentClips(p) {
    var out = {};
    var any = false;
    ((p.content && p.content.stimuli) || []).forEach(function (st) {
      if (!st || !Array.isArray(st.audio)) return;
      st.audio.forEach(function (id) { out[id] = true; any = true; });
    });
    return { ids: out, any: any };
  }

  function listedIds(p, flagged) {
    var clips = contentClips(p);
    return flagged.filter(function (id) { return clips.ids[id]; });
  }

  function clipLabel(id) {
    var A = root.DojoAudio;
    var m = A && A.clipMeta ? A.clipMeta(id) : null;
    return m && typeof m.text === 'string' && m.text ? m.text : id;
  }

  function render(p, t, self) {
    var eng = p.engine || {};
    var flagged = eng.flaggedClips ? eng.flaggedClips() : [];
    if (!contentClips(p).any && !flagged.length) return null;
    var ids = listedIds(p, flagged);
    var text = self.state.clipFlagsText;
    function copy() {
      var list = ids.slice().sort();
      self.setState({ clipFlagsText: list.length ? JSON.stringify({ v: 1, ids: list }) : '' });
    }
    return html`<section class="settings-section" data-testid="clip-flags">
      <h2>${t('settings.clipFlags')}</h2>
      <p class="muted">${t('settings.clipFlags.hint')}</p>
      ${ids.length ? html`<ul>${ids.map(function (id) {
        return html`<li key=${id}><span class="pre">${clipLabel(id)}</span>
          <button type="button" class="btn secondary" data-testid="btn-clip-unflag" onClick=${function () { eng.flagClip(id, false); self.setState({ clipFlagsText: null }); }}>${t('settings.clipFlags.unflag')}</button></li>`;
      })}</ul>` : html`<p class="muted" data-testid="clip-flags-empty">${t('settings.clipFlags.empty')}</p>`}
      ${ids.length ? html`<div class="row"><button type="button" class="btn" data-testid="btn-clip-copy" onClick=${copy}>${t('settings.clipFlags.copy')}</button></div>` : null}
      ${text != null ? html`<textarea data-testid="clip-flags-ids" readonly rows="4" value=${text}></textarea>` : null}
    </section>`;
  }

  var api = { render: render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoClipFlagsSection = api;
})(typeof self !== 'undefined' ? self : this);
