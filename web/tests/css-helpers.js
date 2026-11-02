'use strict';
// Shared helpers for tests that read CSS source text.

// Split `css` into rules. Each rule is { selector, declarations, media }; media is null for top-level rules, else the
// at-rule prelude (e.g. '@media (max-width: 600px)') of the block the rule sits in. Rules inside @media are included
// only with { media: true }. Other at-rules are skipped whole.
const isCommentAt = (src, i) => src[i] === '/' && src[i + 1] === '*';

// Index of the first char at or after `i` that is neither whitespace nor part of a comment; -1 when a comment is unterminated.
function skipSpace(src, i) {
  let j = i;
  while (j < src.length) {
    if (/\s/.test(src[j])) j++;
    else if (isCommentAt(src, j)) {
      const end = src.indexOf('*/', j);
      if (end === -1) return -1;
      j = end + 2;
    } else break;
  }
  return j;
}

// Index just past the '}' that closes the '{' at `brace` (src.length if unclosed).
function blockEnd(src, brace) {
  let depth = 1;
  let j = brace + 1;
  while (j < src.length && depth > 0) {
    if (src[j] === '{') depth++;
    if (src[j] === '}') depth--;
    j++;
  }
  return j;
}

function parseCSS(css, opts) {
  const withMedia = !!(opts && opts.media);
  const rules = [];
  (function walk(src, media) {
    const mediaOK = withMedia && media === null;
    let i = skipSpace(src, 0);
    while (i !== -1 && i < src.length) {
      const brace = src.indexOf('{', i);
      if (brace === -1) return;
      const j = blockEnd(src, brace);
      const head = src.slice(i, brace).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const body = src.slice(brace + 1, j - 1);
      if (head.startsWith('@')) {
        if (mediaOK && head.startsWith('@media')) walk(body, head);
      } else if (head) {
        rules.push({ selector: head, declarations: body.trim(), media });
      }
      i = skipSpace(src, j);
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
