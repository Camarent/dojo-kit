use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// How typed answers are compared. Defaults: trim and collapse spaces, case-insensitive, keep punctuation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct Normalize {
    pub case_sensitive: bool,
    pub trim: bool,
    pub collapse_spaces: bool,
    pub strip_punctuation: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fold: Vec<(String, String)>,
}

impl Default for Normalize {
    fn default() -> Self {
        Normalize { case_sensitive: false, trim: true, collapse_spaces: true, strip_punctuation: false, fold: Vec::new() }
    }
}

/// Lowercases, strips punctuation, collapses whitespace and trims, each step only when enabled in `opts`.
/// fold mappings are applied after case folding and before strip-punctuation/collapse/trim.
pub fn normalize(text: &str, opts: &Normalize) -> String {
    let mut result = text.to_string();
    if !opts.case_sensitive {
        result = result.to_lowercase();
    }
    result = apply_fold(&result, &opts.fold);
    if opts.strip_punctuation {
        result.retain(|c| {
            let is_alphanumeric = c.is_alphanumeric();
            let is_whitespace = c.is_whitespace();
            is_alphanumeric || is_whitespace
        });
    }
    if opts.collapse_spaces {
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
    if opts.trim {
        result = result.trim().to_string();
    }

    result
}

/// Maximum length for fold target strings (single char mappings).
pub const MAX_FOLD_TARGET_LEN: usize = 16;

/// Maximum number of fold entries.
pub const MAX_FOLD_PAIRS: usize = 256;

/// Endpoints of a range key such as "A-Z" (exactly three chars with '-' in the middle).
fn fold_range(key: &str) -> Option<(char, char)> {
    let c: Vec<char> = key.chars().collect();
    (c.len() == 3 && c[1] == '-').then(|| (c[0], c[2]))
}

/// True when a fold entry is well-formed: a single char -> any string, or a range "A-Z" -> "a-z"
/// whose two sides cover the same number of chars.
pub fn fold_entry_ok(from: &str, to: &str) -> bool {
    if from.chars().count() == 1 {
        return true;
    }
    match (fold_range(from), fold_range(to)) {
        (Some((f1, f2)), Some((t1, t2))) => f1 <= f2 && t1 <= t2 && f2 as u32 - f1 as u32 == t2 as u32 - t1 as u32,
        _ => false,
    }
}

/// Apply fold mappings: single char -> string ("" deletes), or range "A-Z" -> "a-z" mapped char by char.
/// The first matching entry wins; malformed entries are ignored (reported by the validator).
/// Returns the input unchanged if fold entries exceed limits.
pub fn apply_fold(text: &str, fold: &[(String, String)]) -> String {
    if fold.is_empty() {
        return text.to_string();
    }
    // Check limits
    if fold.len() > MAX_FOLD_PAIRS {
        return text.to_string();
    }
    for (from, to) in fold {
        if from.chars().count() == 1 && to.chars().count() > MAX_FOLD_TARGET_LEN {
            return text.to_string();
        }
    }
    
    let mut result = String::with_capacity(text.len());
    'chars: for c in text.chars() {
        for (from, to) in fold {
            if !fold_entry_ok(from, to) {
                continue;
            }
            if from.chars().count() == 1 {
                if from.starts_with(c) {
                    result.push_str(to);
                    continue 'chars;
                }
            } else if let (Some((f1, f2)), Some((t1, _))) = (fold_range(from), fold_range(to)) {
                if c >= f1 && c <= f2 {
                    if let Some(m) = char::from_u32(t1 as u32 + (c as u32 - f1 as u32)) {
                        result.push(m);
                        continue 'chars;
                    }
                }
            }
        }
        result.push(c);
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
}

/// Correct iff `sequence` is exactly `0..step_count` in order.
pub fn check_order(step_count: usize, sequence: &[usize]) -> OrderResult {
    let max_len = step_count.max(sequence.len());
    let mut first_wrong = None;
    
    for p in 0..max_len {
        let expected_val = if p < step_count { Some(p) } else { None };
        match (sequence.get(p), expected_val) {
            (Some(&actual), Some(exp)) if actual == exp => {}
            (None, None) => {}
            _ => {
                first_wrong = Some(p);
                break;
            }
        }
    }
    
    let correct = first_wrong.is_none();
    OrderResult { correct, first_wrong }
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

/// Result of a numeric check; `parsed` is the number read from the input, if any.
#[derive(Debug, Clone, PartialEq)]
pub struct NumericResult {
    pub correct: bool,
    pub parsed: Option<f64>,
}

/// Correct iff |parsed - answer| <= tolerance + 1e-9 * max(1, |answer|); never panics on bad input.
pub fn check_numeric(answer: f64, tolerance: f64, input: &str) -> NumericResult {
    let trimmed = input.trim();
    
    if trimmed.is_empty() {
        return NumericResult { correct: false, parsed: None };
    }
    
    let normalized = normalize_numeric_str(trimmed);
    
    let parsed = match normalized {
        Some(s) => {
            if !is_valid_numeric_string(&s) {
                return NumericResult { correct: false, parsed: None };
            }
            match s.parse::<f64>() {
                Ok(v) if v.is_finite() => Some(v),
                _ => None,
            }
        }
        None => None,
    };
    
    let correct = match parsed {
        Some(v) => {
            let slack = 1e-9 * answer.abs().max(1.0);
            (v - answer).abs() <= tolerance + slack
        }
        None => false,
    };
    
    NumericResult { correct, parsed }
}

fn normalize_numeric_str(s: &str) -> Option<String> {
    if s.contains(char::is_whitespace) {
        return None;
    }
    
    let has_dot = s.contains('.');
    let comma_count = s.chars().filter(|&c| c == ',').count();
    
    if has_dot {
        if comma_count > 0 {
            return None;
        }
        return Some(s.to_string());
    }
    
    if comma_count > 1 {
        return None;
    }
    
    if comma_count == 1 {
        return Some(s.replace(',', "."));
    }
    
    Some(s.to_string())
}

fn is_valid_numeric_string(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    
    let mut i = 0;
    let n = bytes.len();
    
    if i < n && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }
    
    let mut has_digit = false;
    let mut has_dot = false;
    
    while i < n && bytes[i] != b'e' && bytes[i] != b'E' {
        if bytes[i] == b'.' {
            if has_dot {
                return false;
            }
            has_dot = true;
            i += 1;
        } else if bytes[i].is_ascii_digit() {
            has_digit = true;
            i += 1;
        } else {
            return false;
        }
    }
    
    if !has_digit {
        return false;
    }
    
    if i < n {
        if bytes[i] == b'e' || bytes[i] == b'E' {
            i += 1;
            if i < n && (bytes[i] == b'+' || bytes[i] == b'-') {
                i += 1;
            }
            if i >= n || !bytes[i].is_ascii_digit() {
                return false;
            }
            while i < n && bytes[i].is_ascii_digit() {
                i += 1;
            }
        }
    }
    
    i == n
}

#[cfg(test)]
mod fold_tests {
    use super::*;

    fn fold(pairs: &[(&str, &str)]) -> Normalize {
        Normalize { fold: pairs.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect(), ..Normalize::default() }
    }

    #[test]
    fn fold_maps_kana_table() {
        assert_eq!(normalize("アイ", &fold(&[("ア", "あ"), ("イ", "い")])), "あい");
    }

    #[test]
    fn fold_maps_yo_to_ye() {
        assert_eq!(normalize("Ёлка", &fold(&[("ё", "е")])), "елка");
    }

    #[test]
    fn fold_range_maps_char_by_char() {
        let o = Normalize { case_sensitive: true, ..fold(&[("A-Z", "a-z")]) };
        assert_eq!(normalize("ABC xyz", &o), "abc xyz");
    }

    #[test]
    fn fold_empty_target_deletes() {
        assert_eq!(normalize("はい。", &fold(&[("。", "")])), "はい");
    }

    #[test]
    fn fold_runs_before_strip_punctuation() {
        let o = Normalize { strip_punctuation: true, ..fold(&[("!", "x")]) };
        assert_eq!(normalize("a!", &o), "ax");
    }

    #[test]
    fn empty_fold_is_identical() {
        assert_eq!(normalize("  Ёлка  A ", &fold(&[])), normalize("  Ёлка  A ", &Normalize::default()));
    }

    #[test]
    fn fold_entry_validity() {
        assert!(fold_entry_ok("a", ""));
        assert!(fold_entry_ok("A-Z", "a-z"));
        assert!(!fold_entry_ok("", "a"));
        assert!(!fold_entry_ok("A-Z", "a-y"));
        assert!(!fold_entry_ok("ab", "c"));
    }

    #[test]
    fn gap_matches_after_fold() {
        assert!(check_gap(&["あい".to_string()], "アイ", &fold(&[("ア", "あ"), ("イ", "い")])));
    }

    #[test]
    fn fold_limits_pair_count() {
        // 256 pairs is the limit
        let mut pairs = Vec::new();
        for i in 0..256 {
            pairs.push((format!("a{i}"), format!("b{i}")));
        }
        let o = Normalize { fold: pairs, ..Normalize::default() };
        // Should return input unchanged when at limit
        let input = "test";
        assert_eq!(normalize(input, &o), input);
        
        // Exceeding the limit should return input unchanged
        let mut too_many = Vec::new();
        for i in 0..257 {
            too_many.push((format!("x{i}"), format!("y{i}")));
        }
        let o2 = Normalize { fold: too_many, ..Normalize::default() };
        assert_eq!(normalize(input, &o2), input);
    }

    #[test]
    fn fold_limits_target_length() {
        // 16 chars is the limit for single-char fold targets
        let long_target = "a".repeat(17);
        let o = Normalize { fold: vec![("b".to_string(), long_target)], ..Normalize::default() };
        let input = "btest";
        assert_eq!(normalize(input, &o), input);
        
        // At limit (16 chars) should work
        let at_limit = "c".repeat(16);
        let o2 = Normalize { fold: vec![("d".to_string(), at_limit)], ..Normalize::default() };
        assert_eq!(normalize("d", &o2), "cccccccccccccccc");
    }

    #[test]
    fn fold_200k_char_case() {
        // Test the specific case from the audit: 200k char target
        let long_target = "a".repeat(200_000);
        let o = Normalize { fold: vec![("x".to_string(), long_target)], ..Normalize::default() };
        let input = "xtest";
        // Should return input unchanged without panic
        assert_eq!(normalize(input, &o), input);
    }
}
