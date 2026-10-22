'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

// WCAG relative luminance formula
function getLuminance(hex) {
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Apply gamma correction
  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  // Calculate relative luminance
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// WCAG contrast ratio formula
function getContrast(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Parse CSS to extract variable values from specific blocks
function extractVariablesFromBlock(css, blockStart, blockEnd) {
  const startIdx = css.indexOf(blockStart);
  if (startIdx === -1) return {};
  
  const endIdx = css.indexOf(blockEnd, startIdx);
  if (endIdx === -1) return {};
  
  const blockContent = css.slice(startIdx, endIdx);
  const variables = {};
  
  // Match variable declarations
  const varRegex = /--(\w[\w-]*)\s*:\s*([^;\n]+)/g;
  let match;
  while ((match = varRegex.exec(blockContent)) !== null) {
    variables[match[1]] = match[2].trim();
  }
  
  return variables;
}

test('tokens.css defines --track-border in all theme blocks', () => {
  const css = read('styles/tokens.css');

  // Check :root block
  const rootVars = extractVariablesFromBlock(css, ':root {', '}');
  assert.ok(rootVars['track-border'], 'Light theme :root should define --track-border');

  // Check :root[data-theme="light"] block
  const lightVars = extractVariablesFromBlock(css, ':root[data-theme="light"] {', '}');
  assert.ok(lightVars['track-border'], 'Light theme [data-theme="light"] should define --track-border');

  // Check dark media query block
  const darkMediaVars = extractVariablesFromBlock(css, ':root:not([data-theme="light"]) {', '}');
  assert.ok(darkMediaVars['track-border'], 'Dark media theme should define --track-border');

  // Check [data-theme="dark"] block
  const darkDataVars = extractVariablesFromBlock(css, ':root[data-theme="dark"] {', '}');
  assert.ok(darkDataVars['track-border'], '[data-theme="dark"] should define --track-border');
});

test('Light --track-border equals light --border', () => {
  const css = read('styles/tokens.css');

  const rootVars = extractVariablesFromBlock(css, ':root {', '}');
  const lightVars = extractVariablesFromBlock(css, ':root[data-theme="light"] {', '}');

  // Use root block for light theme comparison
  const lightTrackBorder = rootVars['track-border'];
  const lightBorder = rootVars['border'];

  assert.strictEqual(lightTrackBorder, lightBorder, 
    `Light --track-border (${lightTrackBorder}) should equal --border (${lightBorder})`);

  // Also check [data-theme="light"] block
  assert.strictEqual(lightVars['track-border'], lightVars['border'], 
    `Light [data-theme="light"] --track-border should equal --border`);
});

test('Dark theme --track-border has >= 3.0 contrast against --bg', () => {
  const css = read('styles/tokens.css');

  // Check dark media query block
  const darkMediaVars = extractVariablesFromBlock(css, ':root:not([data-theme="light"]) {', '}');
  const darkMediaBg = darkMediaVars['bg'];
  const darkMediaTrackBorder = darkMediaVars['track-border'];
  
  assert.ok(darkMediaBg, 'Dark media block should have --bg');
  assert.ok(darkMediaTrackBorder, 'Dark media block should have --track-border');
  
  const contrastMedia = getContrast(darkMediaTrackBorder, darkMediaBg);
  assert.ok(contrastMedia >= 3.0, 
    `Dark media --track-border (${darkMediaTrackBorder}) vs --bg (${darkMediaBg}) contrast ${contrastMedia.toFixed(2)}:1 should be >= 3.0:1`);

  // Check [data-theme="dark"] block
  const darkDataVars = extractVariablesFromBlock(css, ':root[data-theme="dark"] {', '}');
  const darkDataBg = darkDataVars['bg'];
  const darkDataTrackBorder = darkDataVars['track-border'];
  
  assert.ok(darkDataBg, '[data-theme="dark"] block should have --bg');
  assert.ok(darkDataTrackBorder, '[data-theme="dark"] block should have --track-border');
  
  const contrastData = getContrast(darkDataTrackBorder, darkDataBg);
  assert.ok(contrastData >= 3.0, 
    `Dark data --track-border (${darkDataTrackBorder}) vs --bg (${darkDataBg}) contrast ${contrastData.toFixed(2)}:1 should be >= 3.0:1`);
});

test('app.css .progress-bar uses var(--track-border)', () => {
  const css = read('styles/app.css');

  // Find .progress-bar rule with border (not the ones with just flex-basis)
  const progressBarMatch = css.match(/\.progress-bar\s*\{[^}]*border[^}]*\}/);
  assert.ok(progressBarMatch, 'app.css should contain .progress-bar rule with border');

  const rule = progressBarMatch[0];
  assert.ok(rule.includes('var(--track-border)'), 
    '.progress-bar rule should use var(--track-border)');
  assert.ok(!rule.includes('var(--border)'), 
    '.progress-bar rule should not use var(--border)');
});
