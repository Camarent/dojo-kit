'use strict';
const path = require('node:path');

const webTests = path.resolve(__dirname, '..', '..', '..', 'web', 'tests');

module.exports = {
  appHarness: require(path.join(webTests, 'app-harness.js')),
  jaExt: require(path.join(webTests, 'ja-ext.js')),
  loadBundle: require(path.join(webTests, 'load-bundle.js')).loadBundle,
};
