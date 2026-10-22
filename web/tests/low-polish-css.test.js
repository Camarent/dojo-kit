'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

// WCAG relative luminance formula
function getLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const a = [r, g, b].map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
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

// Simple CSS parser: extract rules as { selector, declarations }
function parseCSS(css) {
  const rules = [];
  let i = 0;
  
  while (i < css.length) {
    // Skip whitespace and comments
    if (css[i].match(/\s/)) { i++; continue; }
    if (css[i] === '/' && css[i+1] === '*') {
      const end = css.indexOf('*/', i);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (css[i] === '@') {
      // Skip at-rules (media queries, etc.)
      const brace = css.indexOf('{', i);
      if (brace === -1) break;
      let depth = 1;
      let j = brace + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        if (css[j] === '}') depth--;
        j++;
      }
      i = j;
      continue;
    }
    
    // Parse selector
    const selectorStart = i;
    while (i < css.length && css[i] !== '{') {
      if (css[i] === '/' && css[i+1] === '*') {
        // Skip comment in selector
        const end = css.indexOf('*/', i);
        if (end === -1) break;
        i = end + 2;
        continue;
      }
      i++;
    }
    if (i >= css.length) break;
    
    const selector = css.slice(selectorStart, i).trim();
    if (!selector) { i++; continue; }
    
    // Parse declarations
    i++; // skip '{'
    const declStart = i;
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      if (css[i] === '}') depth--;
      i++;
    }
    
    const declarations = css.slice(declStart, i - 1).trim();
    rules.push({ selector, declarations });
  }
  
  return rules;
}

// Extract variable values from theme blocks
function extractVariablesFromBlock(css, blockStart, blockEnd) {
  const startIdx = css.indexOf(blockStart);
  if (startIdx === -1) return {};
  
  const endIdx = css.indexOf(blockEnd, startIdx);
  if (endIdx === -1) return {};
  
  const blockContent = css.slice(startIdx, endIdx);
  const variables = {};
  
  const varRegex = /--(\w[\w-]*)\s*:\s*([^;\n]+)/g;
  let match;
  while ((match = varRegex.exec(blockContent)) !== null) {
    variables[match[1]] = match[2].trim();
  }
  
  return variables;
}

// Get all CSS (app.css + tokens.css for variables)
const appCSS = read('styles/app.css');
const tokensCSS = read('styles/tokens.css');
const appRules = parseCSS(appCSS);

// Helper to find rule by selector
test('parseCSS finds rules', () => {
  const btnRules = appRules.filter(r => r.selector === '.btn:disabled');
  assert.ok(btnRules.length > 0, 'Should find .btn:disabled rule');
});

// Test Finding 13: disabled primary button
test('.btn:disabled primary has outlined/ghost style with var tokens', () => {
  const disabledRules = appRules.filter(r => r.selector === '.btn.primary:disabled');
  assert.ok(disabledRules.length > 0, 'Should have .btn.primary:disabled rule');
  
  const rule = disabledRules[0];
  assert.ok(rule.declarations.includes('background: transparent') || 
           rule.declarations.includes('background:transparent'),
           'Should have background: transparent');
  assert.ok(rule.declarations.includes('var(--control-border)'),
           'Should use var(--control-border)');
  assert.ok(rule.declarations.includes('var(--fg-muted)'),
           'Should use var(--fg-muted)');
});

test('.actions-row has disabled-primary sizing rule', () => {
  const actionsRowRules = appRules.filter(r => r.selector === '.actions-row .btn:disabled');
  assert.ok(actionsRowRules.length > 0, 'Should have .actions-row .btn:disabled rule');
  
  const rule = actionsRowRules[0];
  // Check for flex sizing declaration
  assert.ok(rule.declarations.includes('flex:') || 
           rule.declarations.includes('flex-grow') ||
           rule.declarations.includes('flex-shrink'),
           'Should have flex sizing declaration to prevent stretching');
});

// Test Finding 15: tab strip and chips
test('.catalog-tabs has scrollbar-width: none', () => {
  const catalogTabsRules = appRules.filter(r => r.selector === '.catalog-tabs');
  assert.ok(catalogTabsRules.length > 0, 'Should have .catalog-tabs rule');
  
  const rule = catalogTabsRules[0];
  assert.ok(rule.declarations.includes('scrollbar-width: none') ||
           rule.declarations.includes('scrollbar-width:none'),
           'Should have scrollbar-width: none');
});

test('.catalog-tabs::-webkit-scrollbar has display: none', () => {
  const scrollbarRules = appRules.filter(r => r.selector === '.catalog-tabs::-webkit-scrollbar');
  assert.ok(scrollbarRules.length > 0, 'Should have .catalog-tabs::-webkit-scrollbar rule');
  
  const rule = scrollbarRules[0];
  assert.ok(rule.declarations.includes('display: none') ||
           rule.declarations.includes('display:none'),
           'Should have display: none');
});

test('.catalog-tabs edge-fade background still present', () => {
  const catalogTabsRules = appRules.filter(r => r.selector === '.catalog-tabs');
  assert.ok(catalogTabsRules.length > 0, 'Should have .catalog-tabs rule');
  
  const rule = catalogTabsRules[0];
  assert.ok(rule.declarations.includes('linear-gradient'),
           'Should still have edge-fade background with linear-gradient');
});

test('catalog-state chip has font-size >= 0.75rem and padding', () => {
  const chipRules = appRules.filter(r => r.selector === '.catalog-state');
  assert.ok(chipRules.length > 0, 'Should have .catalog-state rule');
  
  const rule = chipRules[0];
  // Check font-size >= 0.75rem
  const fontSizeMatch = rule.declarations.match(/font-size:\s*([\d.]+rem)/);
  assert.ok(fontSizeMatch, 'Should have font-size declaration');
  const fontSize = parseFloat(fontSizeMatch[1]);
  assert.ok(fontSize >= 0.75, `Font size ${fontSize}rem should be >= 0.75rem`);
  
  // Check padding exists
  assert.ok(rule.declarations.includes('padding:'),
           'Should have padding declaration');
});

// Test Finding 14: selects
test('select has all required declarations', () => {
  const selectRules = appRules.filter(r => r.selector === 'select');
  assert.ok(selectRules.length > 0, 'Should have select rule');
  
  const rule = selectRules[0];
  const required = [
    'accent-color: var(--accent)',
    'min-height: var(--tap)',
    'border: 1px solid var(--control-border)',
    'border-radius: var(--radius-sm)',
    'background: var(--surface)'
  ];
  
  for (const decl of required) {
    // Normalize whitespace
    const normalizedDecl = decl.replace(/\s+/g, ' ').trim();
    assert.ok(rule.declarations.includes(normalizedDecl) ||
             rule.declarations.includes(normalizedDecl.replace(/\s/g, '')),
             `Should have declaration: ${decl}`);
  }
});

// Test tokens exist
test('all required tokens exist in at least one theme block', () => {
  const requiredTokens = ['accent', 'tap', 'control-border', 'radius-sm', 'fg-muted', 'surface'];
  
  // Check :root block (inherited by all)
  const rootVars = extractVariablesFromBlock(tokensCSS, ':root {', '}');
  for (const token of requiredTokens) {
    assert.ok(rootVars[token], `Light theme :root should define --${token}`);
  }
  
  // Check :root[data-theme="dark"] block - some tokens may be inherited from :root
  const darkVars = extractVariablesFromBlock(tokensCSS, ':root[data-theme="dark"] {', '}');
  const darkMediaVars = extractVariablesFromBlock(tokensCSS, ':root:not([data-theme="light"]) {', '}');
  
  // For dark theme, check both blocks - tokens can be in either
  for (const token of requiredTokens) {
    assert.ok(darkVars[token] || darkMediaVars[token] || rootVars[token],
      `[data-theme="dark"] or media query or :root should define --${token}`);
  }
});

// Contrast check: --fg-muted on --surface >= 4.5
test('--fg-muted on --surface contrast >= 4.5 in light theme', () => {
  const rootVars = extractVariablesFromBlock(tokensCSS, ':root {', '}');
  const fgMutedLight = rootVars['fg-muted'];
  const surfaceLight = rootVars['surface'];
  
  const contrastLight = getContrast(fgMutedLight, surfaceLight);
  assert.ok(contrastLight >= 4.5,
    `Light theme --fg-muted (${fgMutedLight}) on --surface (${surfaceLight}) contrast ${contrastLight.toFixed(2)}:1 should be >= 4.5:1`);
});

test('--fg-muted on --surface contrast >= 4.5 in dark theme', () => {
  const darkVars = extractVariablesFromBlock(tokensCSS, ':root[data-theme="dark"] {', '}');
  const fgMutedDark = darkVars['fg-muted'];
  const surfaceDark = darkVars['surface'];
  
  const contrastDark = getContrast(fgMutedDark, surfaceDark);
  assert.ok(contrastDark >= 4.5,
    `Dark theme --fg-muted (${fgMutedDark}) on --surface (${surfaceDark}) contrast ${contrastDark.toFixed(2)}:1 should be >= 4.5:1`);
});

// Mutation check: test that removing scrollbar-width breaks the test
test('scrollbar-width removal from .catalog-tabs should break test', () => {
  const catalogTabsRules = appRules.filter(r => r.selector === '.catalog-tabs');
  assert.ok(catalogTabsRules.length > 0, 'Should have .catalog-tabs rule');
  
  const rule = catalogTabsRules[0];
  // This assertion will fail if scrollbar-width: none is removed
  assert.ok(rule.declarations.includes('scrollbar-width: none') ||
           rule.declarations.includes('scrollbar-width:none'),
           'Mutation check: .catalog-tabs must have scrollbar-width: none - removing it breaks this test');
});
