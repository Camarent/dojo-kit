'use strict';
const { loadBundle } = require('./load-bundle.js');

function fakeWin(voices, opts) {
  const spoken = [];
  const win = { spoken, cancels: 0 };
  win.SpeechSynthesisUtterance = function (text) { this.text = text; };
  win.setTimeout = function (fn, delay) { return setTimeout(fn, delay); };
  win.clearTimeout = function (id) { clearTimeout(id); };
  if (!(opts && opts.noApi)) {
    win.speechSynthesis = {
      getVoices: () => voices,
      speak: (u) => spoken.push(u),
      cancel() { win.cancels++; spoken.length = 0; }
    };
  }
  return win;
}
const J = (x) => JSON.parse(JSON.stringify(x));
const V = (name, lang) => ({ name, lang });

function load(markup) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/input-script.js', 'ext.js'] });
  if (markup) {
    sb.DojoExt.registerMarkup('alt', { render: (s) => s, plain: (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1') });
    sb.DojoExt.use('alt');
  }
  loadBundle(sb, { only: ['speech.js', 'ui/answer-block.js', 'types/registry.js', 'types/gap.js','ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog-detail.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-boundary.js']).concat(['ui/session-panels.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-plugin.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app-screens.js']).concat(['ui/app.js']) });
  return sb;
}

module.exports = { fakeWin, J, V, load };
