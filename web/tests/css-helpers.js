'use strict';
// Shared helpers for tests that read CSS source text.

// Split `css` into rules. Each rule is { selector, declarations, media }; media is null for top-level rules, else the
// at-rule prelude (e.g. '@media (max-width: 600px)') of the block the rule sits in. Rules inside @media are included
// only with { media: true }. Other at-rules are skipped whole.
function parseCSS(css, opts) {
  const withMedia = !!(opts && opts.media);
  const rules = [];
  (function walk(src, media) {
    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      if (src[i] === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i);
        if (end === -1) return;
        i = end + 2;
        continue;
      }
      const brace = src.indexOf('{', i);
      if (brace === -1) return;
      let depth = 1;
      let j = brace + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        if (src[j] === '}') depth--;
        j++;
      }
      const head = src.slice(i, brace).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const body = src.slice(brace + 1, j - 1);
      if (head.startsWith('@')) {
        if (withMedia && head.startsWith('@media') && media === null) walk(body, head);
      } else if (head) {
        rules.push({ selector: head, declarations: body.trim(), media });
      }
      i = j;
    }
  })(css, null);
  return rules;
}

// Full text of the first block whose prelude starts with `query` ('@media (max-width: 600px)'), or null.
function mediaBlock(css, query) {
  const start = css.indexOf(query);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  if (open === -1) return null;
  let depth = 1;
  for (let i = open + 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.substring(start, i + 1);
  }
  return null;
}

// First top-level rule whose selector equals `selector` exactly, as { properties, selector, declarations, media }, or null.
function ruleFor(css, selector) {
  const r = parseCSS(css).find((x) => x.selector === selector);
  return r ? Object.assign({ properties: r.declarations }, r) : null;
}

module.exports = { parseCSS, mediaBlock, ruleFor };
