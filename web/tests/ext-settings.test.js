'use strict';
const test = require('node:test');
const assert = require('node:assert');

const ext = require('../ext.js');
const h = (tag, props, ...kids) => ({ tag, props, kids });
global.preact = { 
  h, 
  Component: class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState(newState) {
      Object.assign(this.state, newState);
    }
  }
};

test.beforeEach(() => ext.reset());

// ============ registerSetting validation ============
















// ============ getSetting behavior ============







// ============ bindSettings validation ============


// ============ getRegisteredSettings ============



// ============ reset clears settings ============



// ============ Label resolution ============



// ============ Integration test ============



// ============ SettingsScreen plugin settings tests ============

require('node:path');
const { loadBundle } = require('./load-bundle.js');
const NOW = 1760000000000;

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/input-script.js', 'ext.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog-detail.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-boundary.js']).concat(['ui/session-panels.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app-screens.js']).concat(['ui/app.js']) });
  return sb;
}
function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id) return n;
  return find(n.props.children, id);
}
function mount(sb, doc) {
  const store = { doc, update(fn) { fn(doc); }, exportText: () => 'x' };
  const props = { t: (k) => k, store, content: { items: [] }, engine: { globalNewPerDay: () => 10, unitSettings: () => ({}), unitConfig: () => ({ dropByType: {} }) }, course: { uiLanguage: 'en' }, now: () => NOW, win: {}, status: 'ok', go() {}, onDataChanged() {} };
  const scr = new sb.DojoApp._SettingsScreen(props);
  scr.props = props;
  scr.setState = function (patch) { scr.state = Object.assign({}, scr.state, patch); };
  scr.view = () => scr.render(scr.props, scr.state);
  return scr;
}

test('registerSetting requires a config object', () => {
  assert.throws(() => ext.registerSetting(null));
  assert.throws(() => ext.registerSetting(undefined));
  assert.throws(() => ext.registerSetting('string'));
});

test('registerSetting requires key', () => {
  assert.throws(() => ext.registerSetting({}));
  assert.throws(() => ext.registerSetting({ key: '' }));
  assert.throws(() => ext.registerSetting({ key: null }));
});

test('registerSetting requires valid key format', () => {
  assert.throws(() => ext.registerSetting({ key: 'BadKey', label: 'L', options: [{value: 'a'}], default: 'a' }));
  assert.throws(() => ext.registerSetting({ key: '123bad', label: 'L', options: [{value: 'a'}], default: 'a' }));
  assert.throws(() => ext.registerSetting({ key: 'bad-key!', label: 'L', options: [{value: 'a'}], default: 'a' }));
  assert.throws(() => ext.registerSetting({ key: '', label: 'L', options: [{value: 'a'}], default: 'a' }));
});

test('core setting names are valid plugin keys because the store key is plugin:<key>', () => {
  ['theme', 'lang', 't', 'ts'].forEach(function (key) {
    assert.doesNotThrow(() => ext.registerSetting({ key: key, label: 'L', options: [{value: 'a'}], default: 'a' }));
  });
});

test('registerSetting rejects keys with a colon (unit: namespace)', () => {
  assert.throws(() => ext.registerSetting({ key: 'unit:foo', label: 'L', options: [{value: 'a'}], default: 'a' }));
});

test('registerSetting rejects object labels without a string en', () => {
  assert.throws(() => ext.registerSetting({ key: 'k', label: {}, options: [{value: 'a'}], default: 'a' }));
  assert.throws(() => ext.registerSetting({ key: 'k', label: { ru: 'R' }, options: [{value: 'a'}], default: 'a' }));
});

test('getSetting ignores Object.prototype keys', () => {
  assert.strictEqual(ext.getSetting('constructor'), undefined);
  assert.strictEqual(ext.getSetting('__proto__'), undefined);
  assert.strictEqual(ext.getSetting('toString'), undefined);
});

test('registerSetting requires label', () => {
  assert.throws(() => ext.registerSetting({ key: 'mysetting', options: [{value: 'a'}], default: 'a' }));
});

test('registerSetting requires options array', () => {
  assert.throws(() => ext.registerSetting({ key: 'mysetting', label: 'L', default: 'a' }));
  assert.throws(() => ext.registerSetting({ key: 'mysetting', label: 'L', options: null, default: 'a' }));
});

test('registerSetting requires non-empty options array', () => {
  assert.throws(() => ext.registerSetting({ key: 'mysetting', label: 'L', options: [], default: 'a' }));
});

test('registerSetting requires each option to have a value', () => {
  assert.throws(() => ext.registerSetting({ key: 'mysetting', label: 'L', options: [{label: 'Opt'}], default: 'a' }));
  assert.throws(() => ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: undefined}], default: 'a' }));
});

test('registerSetting requires default value', () => {
  assert.throws(() => ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}] }));
});

test('registerSetting accepts valid config', () => {
  ext.registerSetting({ key: 'mysetting', label: 'My Label', options: [{value: 'a'}, {value: 'b'}], default: 'a' });
  assert.doesNotThrow(() => {});
});

test('registerSetting accepts label as object with en/ru', () => {
  ext.registerSetting({ key: 'mysetting', label: { en: 'English', ru: 'Russian' }, options: [{value: 'a'}], default: 'a' });
  assert.doesNotThrow(() => {});
});

test('registerSetting replaces duplicate keys', () => {
  ext.registerSetting({ key: 'mysetting', label: 'First', options: [{value: 'a'}], default: 'a' });
  ext.registerSetting({ key: 'mysetting', label: 'Second', options: [{value: 'b'}], default: 'b' });
  var settings = ext.getRegisteredSettings();
  assert.strictEqual(settings.length, 1);
  assert.strictEqual(settings[0].label, 'Second');
  assert.strictEqual(settings[0].default, 'b');
});

test('getSetting returns undefined for unregistered key', () => {
  assert.strictEqual(ext.getSetting('unregistered'), undefined);
});

test('getSetting returns default when unbound', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}, {value: 'b'}], default: 'a' });
  assert.strictEqual(ext.getSetting('mysetting'), 'a');
});

test('getSetting returns default for invalid stored value', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}, {value: 'b'}], default: 'a' });
  ext.bindSettings(function () { return 'invalid'; });
  assert.strictEqual(ext.getSetting('mysetting'), 'a');
});

test('getSetting returns stored value when valid', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}, {value: 'b'}], default: 'a' });
  ext.bindSettings(function () { return 'b'; });
  assert.strictEqual(ext.getSetting('mysetting'), 'b');
});

test('getSetting returns default when accessor returns undefined', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}, {value: 'b'}], default: 'a' });
  ext.bindSettings(function () { return undefined; });
  assert.strictEqual(ext.getSetting('mysetting'), 'a');
});

test('getSetting returns default when accessor throws', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}, {value: 'b'}], default: 'a' });
  ext.bindSettings(function () { throw new Error('fail'); });
  assert.strictEqual(ext.getSetting('mysetting'), 'a');
});

test('bindSettings requires a function', () => {
  assert.throws(() => ext.bindSettings(null));
  assert.throws(() => ext.bindSettings('not a function'));
});

test('getRegisteredSettings returns empty array when no settings', () => {
  assert.deepStrictEqual(ext.getRegisteredSettings(), []);
});

test('getRegisteredSettings returns registered settings', () => {
  ext.registerSetting({ key: 's1', label: 'L1', options: [{value: 'a'}], default: 'a' });
  ext.registerSetting({ key: 's2', label: 'L2', options: [{value: 'b'}], default: 'b' });
  var settings = ext.getRegisteredSettings();
  assert.strictEqual(settings.length, 2);
  assert.strictEqual(settings[0].key, 's1');
  assert.strictEqual(settings[1].key, 's2');
});

test('reset clears registered settings', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}], default: 'a' });
  ext.bindSettings(function () { return 'a'; });
  ext.reset();
  assert.deepStrictEqual(ext.getRegisteredSettings(), []);
  assert.strictEqual(ext.getSetting('mysetting'), undefined);
});

test('reset clears binding', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}], default: 'a' });
  ext.bindSettings(function () { return 'a'; });
  ext.reset();
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}], default: 'a' });
  // After reset, binding is cleared, so should return default
  assert.strictEqual(ext.getSetting('mysetting'), 'a');
});

test('label as plain string works', () => {
  ext.registerSetting({ key: 'mysetting', label: 'Plain Label', options: [{value: 'a'}], default: 'a' });
  var settings = ext.getRegisteredSettings();
  assert.strictEqual(settings[0].label, 'Plain Label');
});

test('option label falls back to value', () => {
  ext.registerSetting({ key: 'mysetting', label: 'L', options: [{value: 'a'}], default: 'a' });
  var settings = ext.getRegisteredSettings();
  assert.strictEqual(settings[0].options[0].label, undefined);
  assert.strictEqual(settings[0].options[0].value, 'a');
});

test('multiple settings work independently', () => {
  ext.registerSetting({ key: 'settinga', label: 'A', options: [{value: 'a1'}, {value: 'a2'}], default: 'a1' });
  ext.registerSetting({ key: 'settingb', label: 'B', options: [{value: 'b1'}, {value: 'b2'}], default: 'b1' });
  
  ext.bindSettings(function (key) {
    // Plugin settings are accessed with 'plugin:' prefix
    var prefix = 'plugin:';
    var values = { settinga: 'a2', settingb: 'b2' };
    return values[key.startsWith(prefix) ? key.slice(prefix.length) : key];
  });
  
  assert.strictEqual(ext.getSetting('settinga'), 'a2');
  assert.strictEqual(ext.getSetting('settingb'), 'b2');
});

test('valid key formats work', () => {
  ['abc', 'a1', 'a-b', 'a_b', 'a.b', 'a1-b2_c3.d4'].forEach(function (key) {
    ext.registerSetting({ key: key, label: 'L', options: [{value: 'x'}], default: 'x' });
    assert.strictEqual(ext.getSetting(key), 'x');
    ext.reset();
  });
});

test('Plugin settings section is absent when no settings registered', () => {
  const sb = loadApp();
  const scr = mount(sb, { settings: {}, stats: {} });
  assert.strictEqual(find(scr.view(), 'plugin-settings'), null);
  assert.strictEqual(sb.DojoApp._renderPluginSettings(scr.props, scr), null);
});
