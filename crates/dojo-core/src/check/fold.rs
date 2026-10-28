/// Maximum length for fold target strings (single char mappings).
pub const MAX_FOLD_TARGET_LEN: usize = 16;

/// Maximum number of fold entries.
pub const MAX_FOLD_PAIRS: usize = 256;

/// Endpoints of a range key such as "A-Z" (exactly three chars with '-' in the middle).
// Contract: `c.len() == 3` is tested before `c[0]`, `c[1]`, `c[2]` are read.
#[allow(clippy::indexing_slicing)]
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
            } else if let (Some((f1, f2)), Some((t1, _))) = (fold_range(from), fold_range(to))
                && c >= f1 && c <= f2
                    && let Some(m) = char::from_u32(t1 as u32 + (c as u32 - f1 as u32)) {
                        result.push(m);
                        continue 'chars;
                    }
        }
        result.push(c);
    }
    result
}

#[cfg(test)]
mod fold_tests {
    use super::*;
    use crate::check::{check_gap, normalize, Normalize};

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
