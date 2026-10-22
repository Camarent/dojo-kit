use super::Sink;
use crate::check::{Normalize, normalize};
use crate::content::{Item, ItemType};
use std::collections::HashSet;

/// Whitelisted Unicode script ranges (Latin, Cyrillic, Hiragana, Katakana, CJK)
/// Returns true if char is in a whitelisted script or is common punctuation/digit
/// Also returns the script name if it's a known non-whitelisted script
pub(super) fn check_char_script(c: char) -> Option<String> {
    let code = c as u32;
    
    // Whitelisted: Latin (including extended), Cyrillic, Hiragana, Katakana, CJK
    // Also: digits, common punctuation, whitespace
    if c.is_ascii() {
        return None; // ASCII is always allowed
    }
    
    match code {
        // Latin-1 punctuation/symbols (« » ° etc.) and Latin Extended
        0x0080..=0x00BF | 0x00C0..=0x024F | 0x1E00..=0x1EFF => None,
        // Cyrillic and Cyrillic Extended
        0x0400..=0x052F | 0xA640..=0xA69F | 0x1C80..=0x1C8F => None,
        // Greek (common in math)
        0x0370..=0x03FF | 0x1F00..=0x1FFF => None,
        // Hiragana
        0x3040..=0x309F => None,
        // Katakana
        0x30A0..=0x30FF => None,
        // CJK Unified Ideographs and extensions
        0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0x20000..=0x2A6DF | 0x2A700..=0x2B73F | 0x2B740..=0x2B81F | 0x2B820..=0x2CEAF => None,
        // CJK Symbols, Punctuation, Radicals
        0x3000..=0x303F | 0x2E80..=0x2EFF | 0x2F00..=0x2FDF | 0x2FF0..=0x2FFF | 0x31C0..=0x31EF | 0x3200..=0x32FF | 0x3300..=0x33FF => None,
        // Halfwidth and Fullwidth Forms (includes Latin compat)
        0xFF00..=0xFFEF => None,
        // Combining marks (diacritics)
        0x0300..=0x036F | 0x1DC0..=0x1DFF | 0x20D0..=0x20FF | 0xFE00..=0xFE0F => None,
        // Common punctuation ranges
        0x2000..=0x206F | 0x20A0..=0x20CF | 0x2100..=0x214F | 0x2150..=0x218F | 0x2190..=0x21FF | 0x2200..=0x22FF | 0x2300..=0x23FF | 0x2500..=0x257F | 0x2580..=0x259F | 0x25A0..=0x25FF | 0x2600..=0x26FF | 0x2700..=0x27BF => None,
        
        // Known non-whitelisted scripts
        // Arabic
        0x0600..=0x06FF | 0x0750..=0x077F | 0x08A0..=0x08FF | 0xFB50..=0xFDFF | 0xFE70..=0xFEFF => Some("Arabic".to_string()),
        // Hebrew
        0x0590..=0x05FF | 0xFB1D..=0xFB4F => Some("Hebrew".to_string()),
        // Devanagari
        0x0900..=0x097F => Some("Devanagari".to_string()),
        // Bengali
        0x0980..=0x09FF => Some("Bengali".to_string()),
        // Thai
        0x0E00..=0x0E7F => Some("Thai".to_string()),
        // Korean (Hangul)
        0xAC00..=0xD7AF | 0x1100..=0x11FF | 0x3130..=0x318F | 0xA960..=0xA97F | 0xD7B0..=0xD7FF => Some("Hangul".to_string()),
        // Tamil
        0x0B80..=0x0BFF => Some("Tamil".to_string()),
        // Telugu
        0x0C00..=0x0C7F => Some("Telugu".to_string()),
        // Malayalam
        0x0D00..=0x0D7F => Some("Malayalam".to_string()),
        // Sinhala
        0x0D80..=0x0DFF => Some("Sinhala".to_string()),
        // Lao
        0x0E80..=0x0EFF => Some("Lao".to_string()),
        // Tibetan
        0x0F00..=0x0FFF => Some("Tibetan".to_string()),
        // Myanmar
        0x1000..=0x109F | 0xA9E0..=0xA9FF | 0xAA60..=0xAA7F | 0xAA80..=0xAADF => Some("Myanmar".to_string()),
        // Ethiopic
        0x1200..=0x137F | 0x1380..=0x139F | 0x2D80..=0x2DDF | 0xAB00..=0xAB2F => Some("Ethiopic".to_string()),
        // Khmer
        0x1780..=0x17FF | 0x19E0..=0x19FF => Some("Khmer".to_string()),
        // Mongolian
        0x1800..=0x18AF => Some("Mongolian".to_string()),
        
        // For any other non-whitelisted character, return a generic identifier
        _ => Some(format!("U+{:04X}", code)),
    }
}

/// Check if text contains characters from non-whitelisted scripts
pub(super) fn has_foreign_script(text: &str, whitelisted_scripts: &HashSet<String>) -> bool {
    for c in text.chars() {
        if let Some(script_name) = check_char_script(c) {
            if !whitelisted_scripts.contains(&script_name) {
                return true;
            }
        }
    }
    false
}

/// Word lists for prompt type mismatch detection (lowercase matched)
/// Maps from trigger words to the item types they're incompatible with
pub(super) fn get_prompt_type_mismatch_data() -> &'static [(&'static str, &'static [ItemType])] {
    &[("write", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
      ("type", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
      ("напишите", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
      ("choose", &[ItemType::Gap]),
      ("pick", &[ItemType::Gap]),
      ("выберите", &[ItemType::Gap]),]
}

/// Check for prompt type mismatch
pub(super) fn check_prompt_type_mismatch(prompt: &str, item_type: ItemType, sink: &mut Sink, file: &str, line: usize, id: &str) {
    let mismatch_data = get_prompt_type_mismatch_data();
    let prompt_lower = prompt.to_lowercase();
    
    for (trigger_word, incompatible_types) in mismatch_data {
        if prompt_lower.contains(trigger_word) && incompatible_types.contains(&item_type) {
            sink.warning("prompt_type_mismatch", file, line, format!("item '{id}' prompt contains '{trigger_word}' but type '{}' has no text input", item_type.as_str()));
            return; // Only report one mismatch per item
        }
    }
}

/// Check if a string contains '/' or '／' outside of brackets (ASCII or full-width)
pub(super) fn has_slash_outside_brackets(s: &str) -> bool {
    let mut depth: usize = 0;
    for c in s.chars() {
        match c {
            '(' | '（' => depth += 1,
            ')' | '）' => depth = depth.saturating_sub(1),
            '/' | '／' => {
                if depth == 0 {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

/// Check for ambiguous answers
pub(super) fn check_ambiguous_answer(item: &Item, sink: &mut Sink, file: &str, line: usize) {
    let id = item.id();
    
    match item {
        Item::Gap(g) => {
            // (a) gap with several accepted answers in a non-ASCII script (readings, meanings), unless the prompt contains a disambiguation hint
            if g.answers.len() > 1 && g.answers.iter().any(|a| !a.is_ascii()) {
                let prompt_lower = g.prompt.to_lowercase();
                let has_disambiguation = g.prompt.chars().any(|c| c.is_ascii_digit()) 
                    || prompt_lower.contains("любой")
                    || prompt_lower.split(|c: char| !c.is_alphanumeric()).any(|w| w == "any")
                    || prompt_lower.contains("one of")
                    || prompt_lower.contains("или");
                if !has_disambiguation {
                    sink.warning("ambiguous_answer", file, line, format!("item '{id}' gap has {} answers but no disambiguation hint in prompt", g.answers.len()));
                }
            }
        }
        Item::Choice(c) => {
            // (b) choice options containing "/" outside brackets
            for (idx, opt) in c.options.iter().enumerate() {
                if has_slash_outside_brackets(opt) {
                    sink.warning("ambiguous_answer", file, line, format!("item '{id}' choice option[{idx}] has '/' between alternatives: '{opt}'; split into separate options or reword with \"or\"/\"или\" (a '/' inside parentheses is fine)"));
                }
            }
            // (c) two options of one choice item that are equal after normalization
            let default = Normalize::default();
            let mut seen = HashSet::new();
            for opt in &c.options {
                let norm = normalize(opt, &default);
                if !seen.insert(norm) {
                    sink.warning("ambiguous_answer", file, line, format!("item '{id}' choice has duplicate options after normalization"));
                    return;
                }
            }
        }
        Item::Multi(m) => {
            // (b) multi options containing "/" outside brackets
            for (idx, opt) in m.options.iter().enumerate() {
                if has_slash_outside_brackets(opt) {
                    sink.warning("ambiguous_answer", file, line, format!("item '{id}' multi option[{idx}] has '/' between alternatives: '{opt}'; split into separate options or reword with \"or\"/\"или\" (a '/' inside parentheses is fine)"));
                }
            }
            // (c) duplicate options after normalization
            let default = Normalize::default();
            let mut seen = HashSet::new();
            for opt in &m.options {
                let norm = normalize(opt, &default);
                if !seen.insert(norm) {
                    sink.warning("ambiguous_answer", file, line, format!("item '{id}' multi has duplicate options after normalization"));
                    return;
                }
            }
        }
        _ => {}
    }
}

/// Check for order blanks mismatch
pub(super) fn check_order_blanks_mismatch(item: &Item, sink: &mut Sink, file: &str, line: usize) {
    if let Item::Order(o) = item {
        // Only apply when the prompt contains ___
        if !o.prompt.contains("___") {
            return;
        }
        
        // Count the number of ___ slots in the prompt
        let blank_count = o.prompt.matches("___").count();
        let step_count = o.steps.len();
        
        // Check if there's a fixed field (not currently in OrderItem, but we can still check)
        // For now, just warn if blank count != step count
        if blank_count != step_count {
            sink.warning("order_blanks_mismatch", file, line, format!("item '{}' has {} blanks but {} steps", item.id(), blank_count, step_count));
        }
        // If steps has more entries than blanks and there is no fixed field, warn
        // Since we don't have a fixed field yet, we'll just use the simple check above
    }
}
