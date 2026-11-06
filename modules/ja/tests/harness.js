'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Nearest ancestor directory holding web/tests/app-harness.js; returns its web/ path.
function findWeb(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'web', 'tests', 'app-harness.js'))) return path.join(d, 'web');
    if (path.dirname(d) === d) throw new Error('web/tests/app-harness.js not found above ' + dir);
  }
}

const web = findWeb(__dirname);
const bundle = require(path.join(web, 'tests', 'load-bundle.js'));

module.exports = {
  web,
  appHarness: require(path.join(web, 'tests', 'app-harness.js')),
  jaExt: require(path.join(web, 'tests', 'ja-ext.js')),
  ext: require(path.join(web, 'ext.js')),
  loadBundle: bundle.loadBundle,
  readSource: bundle.readSource,
};
