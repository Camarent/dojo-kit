use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// How typed answers are compared. Defaults: trim and collapse spaces, case-insensitive, keep punctuation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(from = "NormalizeWire", into = "NormalizeWire")]
pub struct Normalize {
    flags: NormFlags,
    pub fold: Vec<(String, String)>,
}

/// The four independent on/off options of `Normalize`, one bit each.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NormFlags(u8);

const CASE_SENSITIVE: u8 = 1;
const TRIM: u8 = 2;
const COLLAPSE_SPACES: u8 = 4;
const STRIP_PUNCTUATION: u8 = 8;

impl Normalize {
    #[must_use]
    pub fn case_sensitive(&self) -> bool {
        self.flags.has(CASE_SENSITIVE)
    }

    #[must_use]
    pub fn trim(&self) -> bool {
        self.flags.has(TRIM)
    }

    #[must_use]
    pub fn collapse_spaces(&self) -> bool {
        self.flags.has(COLLAPSE_SPACES)
    }

    #[must_use]
    pub fn strip_punctuation(&self) -> bool {
        self.flags.has(STRIP_PUNCTUATION)
    }

    #[must_use]
    pub fn with_case_sensitive(self, on: bool) -> Self {
        self.with_flag(CASE_SENSITIVE, on)
    }

    #[must_use]
    pub fn with_trim(self, on: bool) -> Self {
        self.with_flag(TRIM, on)
    }

    #[must_use]
    pub fn with_collapse_spaces(self, on: bool) -> Self {
        self.with_flag(COLLAPSE_SPACES, on)
    }

    #[must_use]
    pub fn with_strip_punctuation(self, on: bool) -> Self {
        self.with_flag(STRIP_PUNCTUATION, on)
    }

    fn with_flag(self, bit: u8, on: bool) -> Self {
        let flags = self.flags.set(bit, on);
        Normalize { flags, ..self }
    }
}

impl Default for Normalize {
    fn default() -> Self {
        Normalize { flags: NormFlags(TRIM | COLLAPSE_SPACES), fold: Vec::new() }
    }
}

/// course.json shape of `Normalize`: the four camelCase booleans plus `fold`.
/// `Option` only so the four fields stay out of clippy's bool-struct lint; every field is `Some`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
struct NormalizeWire {
    #[serde(deserialize_with = "bool_only")]
    #[schemars(with = "bool")]
    case_sensitive: Option<bool>,
    #[serde(deserialize_with = "bool_only")]
    #[schemars(with = "bool")]
    trim: Option<bool>,
    #[serde(deserialize_with = "bool_only")]
    #[schemars(with = "bool")]
    collapse_spaces: Option<bool>,
    #[serde(deserialize_with = "bool_only")]
    #[schemars(with = "bool")]
    strip_punctuation: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    fold: Vec<(String, String)>,
}

fn bool_only<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<bool>, D::Error> {
    bool::deserialize(d).map(Some)
}

impl Default for NormalizeWire {
    fn default() -> Self {
        Normalize::default().into()
    }
}

impl From<NormalizeWire> for Normalize {
    fn from(w: NormalizeWire) -> Self {
        let on = |v: Option<bool>| v.unwrap_or(false);
        let flags = NormFlags(0)
            .set(CASE_SENSITIVE, on(w.case_sensitive))
            .set(TRIM, on(w.trim))
            .set(COLLAPSE_SPACES, on(w.collapse_spaces))
            .set(STRIP_PUNCTUATION, on(w.strip_punctuation));
        Normalize { flags, fold: w.fold }
    }
}

impl From<Normalize> for NormalizeWire {
    fn from(n: Normalize) -> Self {
        NormalizeWire {
            case_sensitive: Some(n.case_sensitive()),
            trim: Some(n.trim()),
            collapse_spaces: Some(n.collapse_spaces()),
            strip_punctuation: Some(n.strip_punctuation()),
            fold: n.fold,
        }
    }
}

impl NormFlags {
    fn has(self, bit: u8) -> bool {
        self.0 & bit != 0
    }

    fn set(mut self, bit: u8, on: bool) -> Self {
        if on {
            self.0 |= bit;
        } else {
            self.0 &= !bit;
        }
        self
    }
}

/// Lowercases, strips punctuation, collapses whitespace and trims, each step only when enabled in `opts`.
/// fold mappings are applied after case folding and before strip-punctuation/collapse/trim.
pub fn normalize(text: &str, opts: &Normalize) -> String {
    let mut result = text.to_string();
    if !opts.case_sensitive() {
        result = result.to_lowercase();
    }
    result = apply_fold(&result, &opts.fold);
    if opts.strip_punctuation() {
        result.retain(|c| {
            let is_alphanumeric = c.is_alphanumeric();
            let is_whitespace = c.is_whitespace();
            is_alphanumeric || is_whitespace
        });
    }
    if opts.collapse_spaces() {
        let mut collapsed = String::with_capacity(result.len());
        let mut in_whitespace = false;
        for c in result.chars() {
            if c.is_whitespace() {
                if !in_whitespace {
                    collapsed.push(' ');
                    in_whitespace = true;
                }
            } else {
                collapsed.push(c);
                in_whitespace = false;
            }
        }
        result = collapsed;
    }
    if opts.trim() {
        result = result.trim().to_string();
    }

    result
}


/// True when `input` equals any accepted answer after normalizing both sides.
pub fn check_gap(answers: &[String], input: &str, opts: &Normalize) -> bool {
    if answers.is_empty() {
        return false;
    }
    let normalized_input = normalize(input, opts);
    answers.iter().any(|a| normalize(a, opts) == normalized_input)
}

/// Verdict for gap items: returns "ok", "retry", or "wrong".
/// - "ok" = input matches an entry of `answers`
/// - "retry" = input matches a `retry` reading and no answer
/// - "wrong" otherwise
pub fn gap_verdict(answers: &[String], retry: &[String], input: &str, opts: &Normalize) -> &'static str {
    let normalized_input = normalize(input, opts);
    
    // Check if input matches any answer
    if answers.iter().any(|a| normalize(a, opts) == normalized_input) {
        return "ok";
    }
    
    // Check if input matches any retry reading
    if retry.iter().any(|r| normalize(r, opts) == normalized_input) {
        return "retry";
    }
    
    "wrong"
}

/// True when `selected` is the correct option index.
pub fn check_choice(answer: usize, selected: usize) -> bool {
    answer == selected
}

/// True when the selected set of option indices equals `correct` (order and duplicates ignored).
pub fn check_multi(correct: &[usize], selected: &[usize]) -> bool {
    let mut correct_sorted = correct.to_vec();
    correct_sorted.sort_unstable();
    correct_sorted.dedup();
    let mut selected_sorted = selected.to_vec();
    selected_sorted.sort_unstable();
    selected_sorted.dedup();
    correct_sorted == selected_sorted
}

/// Result of a match check; `wrong` lists the indices of lefts linked to a wrong right.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchResult {
    pub correct: bool,
    pub wrong: Vec<usize>,
}

/// Correct iff `mapping[i] == i` for every pair; a mapping of the wrong length is incorrect.
pub fn check_match(pair_count: usize, mapping: &[usize]) -> MatchResult {
    let mut wrong = Vec::new();
    let mut correct = true;
    
    if mapping.len() != pair_count {
        correct = false;
    }
    
    for i in 0..pair_count {
        match mapping.get(i) {
            Some(&val) if val == i => {}
            _ => {
                wrong.push(i);
                correct = false;
            }
        }
    }
    
    MatchResult { correct, wrong }
}

/// Result of an order check; `first_wrong` is the first position holding the wrong step.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrderResult {
    pub correct: bool,
    pub first_wrong: Option<usize>,
    /// `Some(i)` when alternative `i` matched exactly; `None` for the canonical order or a wrong answer.
    pub matched: Option<usize>,
}

/// First position where `sequence` differs from `expected` (a length mismatch counts as a difference), or `None` if equal.
/// Single order_alt rule: JS grading calls `checkOrder` (this module via wasm), so web and Rust cannot diverge.
fn order_first_diff(expected: &[usize], sequence: &[usize]) -> Option<usize> {
    let max_len = expected.len().max(sequence.len());
    (0..max_len).find(|&p| expected.get(p) != sequence.get(p))
}

/// First position where `sequence` differs from `0..step_count`, without materialising the range.
fn canonical_first_diff(step_count: usize, sequence: &[usize]) -> Option<usize> {
    let shared = step_count.min(sequence.len());
    if let Some(p) = sequence.iter().take(shared).enumerate().position(|(p, &s)| s != p) {
        return Some(p);
    }
    if step_count == sequence.len() { None } else { Some(shared) }
}

/// Correct iff `sequence` is exactly `0..step_count` or exactly one of `alt`.
/// `first_wrong` is measured against the accepted order sharing the longest prefix with `sequence` (tie: canonical).
pub fn check_order(step_count: usize, sequence: &[usize], alt: &[Vec<usize>]) -> OrderResult {
    let mut best_diff = canonical_first_diff(step_count, sequence);
    let mut best_idx: Option<usize> = None;
    for (i, a) in alt.iter().enumerate() {
        let d = order_first_diff(a, sequence);
        let better = match (d, best_diff) {
            (None, Some(_)) => true,
            (Some(x), Some(y)) => x > y,
            _ => false,
        };
        if better {
            best_diff = d;
            best_idx = Some(i);
        }
    }
    OrderResult { correct: best_diff.is_none(), first_wrong: best_diff, matched: best_idx.filter(|_| best_diff.is_none()) }
}

/// Result of a cloze check; `results` holds one verdict per blank.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClozeResult {
    pub correct: bool,
    pub results: Vec<bool>,
}

/// Correct iff every input matches one alternative of its blank under `opts`.
pub fn check_cloze(blanks: &[Vec<String>], inputs: &[String], opts: &Normalize) -> ClozeResult {
    let mut results = Vec::with_capacity(blanks.len());
    
    for (i, blank) in blanks.iter().enumerate() {
        let input = inputs.get(i);
        let verdict = match input {
            Some(input_str) => check_gap(blank, input_str, opts),
            None => false,
        };
        results.push(verdict);
    }
    
    let correct = !blanks.is_empty() && results.iter().all(|&v| v);
    ClozeResult { correct, results }
}

mod fold;
mod numeric;
pub use fold::*;
pub use numeric::*;
