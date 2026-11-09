/*
 * ui/settings.js — SettingsScreen, renderPluginSettings
 * Globals expected: preact, htm, DojoExt, DojoSpeech, DojoCommon, DojoSettingsSections, DojoSettingsPlugin, DojoSettingsDialogs.
 * create(deps) takes { renderSpeechSettings } and returns { SettingsScreen, renderPluginSettings }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var Component = preact.Component;
  var html = htm.bind(h);
  var Speech = root.DojoSpeech || null;

  function dep(name, file) {
    return root[name] || (typeof require !== 'undefined' ? require(file) : null) || {};
  }

  var DojoSettingsSections = dep('DojoSettingsSections', './settings-sections.js');
  var DojoSettingsPlugin = dep('DojoSettingsPlugin', './settings-plugin.js');
  var DojoSettingsDialogs = dep('DojoSettingsDialogs', './settings-dialogs.js');
  var DojoClipFlagsSection = dep('DojoClipFlagsSection', './clip-flags-section.js');
  var DojoCommon = dep('DojoCommon', './common.js');
  var StatusChip = DojoCommon.StatusChip;
  var Notice = DojoCommon.Notice;
  var applyTheme = DojoCommon.applyTheme;
  var speechCfg = DojoCommon.speechCfg;
  var timerMod = root.DojoSettingsTimer || null;
  var renderTimerSettings = timerMod ? timerMod.create().renderTimerSettings : function () { return null; };

  // Section renderers and the speech block, set by create(); render() reads them from here.
  class SettingsScreen extends Component {
    constructor(props) {
      super(props);
      this.state = { exportText: props.store.exportText(), importText: '', importMsg: null, copied: null, resetStep: 0, resetDone: false, unitDialog: null, unitSettingsCache: null, groupDialog: null };
      this._onKeyDown = this._onKeyDown.bind(this);
    }
    componentDidMount() {
      var self = this;
      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', this._onKeyDown);
      }
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.addEventListener) {
        this._onVoices = function () { self.setState({ voicesTick: (self.state.voicesTick || 0) + 1 }); };
        ss.addEventListener('voiceschanged', this._onVoices);
      }
    }
    testSpeech(role) {
      var p = this.props;
      if (!Speech) return;
      var sample = null;
      var items = p.content.items;
      for (var i = 0; i < items.length && !sample; i++) {
        var ln = typeof items[i].speak === 'string' ? Speech.lines(items[i]) : [];
        if (ln.length) sample = ln[0].text;
      }
      var line = { text: sample || p.t('settings.speech.testText') };
      if (role) line.voice = role;
      Speech.stop(p.win);
      Speech.play([line], speechCfg(p.course, p.store), {}, p.win);
    }
    componentWillUnmount() {
      var ss = this.props.win && this.props.win.speechSynthesis;
      if (ss && ss.removeEventListener && this._onVoices) ss.removeEventListener('voiceschanged', this._onVoices);
      if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', this._onKeyDown);
      }
    }
    _onKeyDown(e) {
      if (e.key === 'Escape') {
        if (this.state.groupDialog) {
          e.preventDefault();
          this.closeGroupDialog();
        } else if (this.state.unitDialog) {
          e.preventDefault();
          this.closeUnitDialog();
        }
      }
    }
    setNewPerDay(v) {
      var p = this.props;
      p.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.newPerDay = v;
        doc.settings.ts = doc.settings.ts || {};
        doc.settings.ts.newPerDay = p.now();
      });
      this.setState({ exportText: p.store.exportText() });
    }
    setSetting(key, value) {
      var p = this.props;
      p.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings[key] = value; // null is a tombstone; the fresh ts below lets the clear win a merge
        doc.settings.ts = doc.settings.ts || {};
        doc.settings.ts[key] = p.now();
      });
      this.setState({ exportText: p.store.exportText() });
    }
    setTheme(theme) {
      this.setSetting('theme', theme);
      applyTheme(this.props.win, theme);
    }
    copy() {
      var self = this;
      var text = this.state.exportText;
      var nav = this.props.win.navigator;
      function fallback() {
        var ok;
        try {
          self.exportArea.focus();
          self.exportArea.select();
          ok = !!self.props.win.document.execCommand('copy');
        } catch { ok = false; }
        self.setState({ copied: ok ? 'ok' : 'manual' });
      }
      if (nav && nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(text).then(function () { self.setState({ copied: 'ok' }); }, fallback);
      } else fallback();
    }
    doImport() {
      var r = this.props.store.importText(this.state.importText);
      var msg;
      if (r.ok) msg = { kind: 'ok', text: this.props.t('import.ok', { n: r.added }) };
      else if (r.code === 'other_course') msg = { kind: 'bad', text: this.props.t('import.other_course') };
      else if (r.code === 'invalid_json' || r.code === 'not_progress') msg = { kind: 'bad', text: this.props.t('import.invalid') };
      else msg = { kind: 'bad', text: this.props.t('import.failed') };
      this.setState({ importMsg: msg, exportText: this.props.store.exportText(), importText: r.ok ? '' : this.state.importText });
      if (r.ok) this.props.onDataChanged();
    }
    doReset() {
      var self = this;
      this.props.store.reset();
      this.setState({ resetStep: 0, resetDone: true, exportText: this.props.store.exportText(), importMsg: null });
      this.props.onDataChanged();
      void self;
    }
    render(p, s) {
      var t = p.t;
      var self = this;
      var sec = SettingsScreen.parts.sec;
      var renderSpeechSettings = SettingsScreen.parts.renderSpeechSettings;
      var renderPluginSettings = SettingsScreen.parts.renderPluginSettings;
      return html`<main class="screen settings-screen" data-testid="settings">
        <header class="head"><h1>${t('settings.title')}</h1><${StatusChip} t=${t} status=${p.status} /></header>
        <${Notice} text=${p.notice} />
        ${sec.sectionNewPerDay(p, t, self)}
        ${sec.sectionTheme(p, t, self)}
        ${sec.sectionExamDate(p, t, self)}
        ${sec.sectionUnits(p, t, self)}
        ${sec.sectionGroups(p, t, self)}
        ${sec.sectionPlacement(p, t)}
        ${renderTimerSettings(p, self)}
        ${sec.sectionTopics(p, self)}
        ${sec.sectionExport(s, t, self)}
        ${sec.sectionImport(s, t, self)}
        ${sec.sectionReset(s, t, self)}
        ${renderSpeechSettings(p, self)}
        ${renderPluginSettings(p, self)}
        ${DojoClipFlagsSection.render ? DojoClipFlagsSection.render(p, t, self) : null}
        ${sec.sectionAbout(p, t)}
        <div class="row"><button type="button" class="btn" data-testid="btn-back" onClick=${function () { p.go('home'); }}>${t('back')}</button></div>
        ${sec.unitDialogView(s, t, self)}
        ${sec.groupDialogView(s, t, self)}
      </main>`;
    }
  }

  function create(deps) {
    var sec = DojoSettingsSections.create();
    var plugin = DojoSettingsPlugin.create();
    SettingsScreen.parts = { sec: sec, renderSpeechSettings: deps.renderSpeechSettings, renderPluginSettings: plugin.renderPluginSettings };
    DojoSettingsDialogs.create().install(SettingsScreen);
    return { SettingsScreen: SettingsScreen, renderPluginSettings: plugin.renderPluginSettings };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettings = api;
})(typeof self !== 'undefined' ? self : this);
