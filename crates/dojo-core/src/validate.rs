use crate::check::{Normalize, normalize};
use crate::content::{DetailConfig, DetailField, TagLabel, ClozePart, Course, ExamConfig, Item, ItemType, SpeechConfig, Speak, parse_course, parse_items, parse_stimuli, parse_intros};
use crate::content::{PassMode, PassBasis};
use crate::exam::resolve_mode;
use crate::lock::IdLock;
use std::collections::{HashMap, HashSet};

/// Diagnostic severity; errors make a course invalid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

impl Severity {
    /// Lowercase name: `error` or `warning`.
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Error => "error",
            Severity::Warning => "warning",
        }
    }
}

/// One finding; `line` is 1-based, 0 when the finding has no line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub severity: Severity,
    pub code: &'static str,
    pub file: String,
    pub line: usize,
    pub message: String,
}

/// A content file handed to the validator; `name` is the path shown in diagnostics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFile {
    pub name: String,
    pub text: String,
}

/// Every validator code with its severity and a one-line description.
pub const CODES: [(&str, Severity, &str); 90] = [
    ("parse_error", Severity::Error, "course.json or a content line does not match the format"),
    ("duplicate_unit", Severity::Error, "two units share an id"),
    ("no_units", Severity::Error, "course has no units"),
    ("bad_drop", Severity::Error, "srs.dropOnWrong must be an integer from 0 to 10"),
    ("scope_by_type", Severity::Error, "srsByType cannot set scope or drill (an entity spans item types)"),
    ("bad_drill", Severity::Error, "srs.drill must be an integer from 1 to 5"),
    ("mixed_entity_scope", Severity::Warning, "entity spans units with different srs.scope; it stays per-item"),
    ("bad_ladder", Severity::Error, "ladder needs >= 2 entries, first 0, non-negative, non-decreasing"),
    ("bad_placement", Severity::Error, "placement.perUnit < 1"),
    ("bad_learned_stage", Severity::Error, "learnedStage must be >= 1"),
    ("bad_pass_mark", Severity::Error, "exam.passMark outside 0..=1"),
    ("bad_exam_section", Severity::Error, "section count 0, unknown unit, type not enabled, or type is self-rated"),
    ("exam_too_big", Severity::Warning, "section count exceeds the active matching items"),
    ("exam_few_unique", Severity::Warning, "fewer than 20% of an exam section's questions come from examOnly units"),
    ("srs_by_type_unknown", Severity::Error, "srsByType key is not an item type"),
    ("duplicate_id", Severity::Error, "id used twice across files"),
    ("bad_id", Severity::Error, "id must match ^[a-z][a-z0-9]*-[0-9]+$"),
    ("bad_course_id", Severity::Error, "id must match ^[a-z0-9][a-z0-9_-]{0,47}$"),
    ("bad_unit_id", Severity::Error, "unit id must match ^[a-z0-9][a-z0-9_-]{0,47}$"),
    ("unknown_unit", Severity::Error, "item unit is not in course.units"),
    ("type_not_enabled", Severity::Error, "item type is not in course.types"),
    ("empty_prompt", Severity::Error, "prompt is blank"),
    ("choice_few_options", Severity::Error, "choice has fewer than 2 options"),
    ("choice_answer_out_of_range", Severity::Error, "choice answer index is not an option"),
    ("choice_duplicate_options", Severity::Error, "two options are equal after normalization"),
    ("gap_no_answers", Severity::Error, "gap has no answers"),
    ("gap_empty_answer", Severity::Error, "a gap answer is empty after normalization"),
    ("card_empty_back", Severity::Error, "card back is blank"),
    ("multi_few_options", Severity::Error, "multi has fewer than 3 options"),
    ("multi_duplicate_options", Severity::Error, "two options are equal after normalization"),
    ("multi_bad_correct", Severity::Error, "multi correct list empty, has duplicates, out of range, or not fewer than options"),
    ("match_pair_count", Severity::Error, "match pair count outside 2..=8"),
    ("match_duplicate_left", Severity::Error, "match has duplicate lefts after normalization"),
    ("match_duplicate_right", Severity::Error, "match has duplicate rights (including distractors) after normalization"),
    ("order_step_count", Severity::Error, "order step count outside 2..=10"),
    ("order_duplicate_step", Severity::Error, "order has duplicate steps after normalization"),
    ("cloze_no_blank", Severity::Error, "cloze has no blanks"),
    ("cloze_too_many_blanks", Severity::Error, "cloze has more than 10 blanks"),
    ("cloze_empty_alternative", Severity::Error, "cloze has an empty alternative after normalization"),
    ("cloze_empty_parts", Severity::Error, "cloze has no non-empty text or alternatives"),
    ("numeric_bad_answer", Severity::Error, "numeric answer is not finite"),
    ("numeric_bad_tolerance", Severity::Error, "numeric tolerance is negative or not finite"),
    ("duplicate_prompt", Severity::Warning, "same type and prompt as an earlier active item"),
    ("answer_in_prompt", Severity::Warning, "an answer of >= 3 chars appears in the prompt"),
    ("prompt_too_long", Severity::Warning, "prompt longer than 600 characters"),
    ("unit_empty", Severity::Warning, "unit has no active items"),
    ("cloze_many_blanks", Severity::Warning, "cloze has more than 5 blanks"),
    ("match_many_pairs", Severity::Warning, "match has more than 6 pairs"),
    ("order_many_steps", Severity::Warning, "order has more than 7 steps"),
    ("item_type_changed", Severity::Warning, "item type changed from the locked type"),
    ("id_removed", Severity::Error, "id in ids.lock is missing from the content"),
    ("retired_id_reused", Severity::Error, "active item uses an id retired in ids.lock"),
    ("bad_plugin_path", Severity::Error, "plugin path is absolute or contains '..'"),
    ("bad_fold", Severity::Error, "fold entry has empty from, or range lengths differ"),
    ("fold_too_large", Severity::Error, "fold target string or pair count exceeds the limit"),
    ("unknown_stimulus", Severity::Error, "item references a stimulus id that does not exist"),
    ("duplicate_stimulus", Severity::Error, "two stimuli share an id"),
    ("bad_breakdown", Severity::Error, "breakdown config is invalid"),
    ("bad_speech", Severity::Error, "speech config: rate/pitch out of range, empty voice label, empty lines, or empty text"),
    ("unknown_voice", Severity::Error, "speak line references a voice label not defined in speech.voices"),
    ("unknown_section", Severity::Error, "a timing or scoring section references a section title that does not exist"),
    ("bad_exam", Severity::Error, "bad exam: duplicate id, empty timing group, 0 minutes, 0/negative points, minPoints > points, negative passPoints, section covered by multiple timing groups, or empty scoring sections"),
    ("stimulus_group_split", Severity::Warning, "items sharing a stimulus differ in unit, tags, type, or include a card"),
    ("bad_retry", Severity::Error, "retry field: retry reading equals an answer (after normalization)"),
    ("bad_unit_settings", Severity::Error, "unit has negative newPerDay, empty srs ladder, non-increasing srs ladder, negative srs ladder value"),
    ("placement_unused", Severity::Warning, "unit has placement:false but course.placement is absent"),
    ("foreign_script", Severity::Warning, "text contains letters from a script that is not Latin, Cyrillic, Hiragana, Katakana, or CJK"),
    ("prompt_type_mismatch", Severity::Warning, "prompt asks to write/type but item type has no text input, or asks to choose/pick on a gap item"),
    ("ambiguous_answer", Severity::Warning, "gap with several non-ASCII answers and no disambiguation hint in the prompt, choice/multi option with '/' outside brackets, or duplicate options"),
    ("order_blanks_mismatch", Severity::Warning, "number of ___ blanks in prompt differs from number of steps"),
    ("unknown_unit_in_group", Severity::Error, "group references a unit id that does not exist"),
    ("unit_in_two_groups", Severity::Error, "unit is in two groups"),
    ("two_extra_new_groups", Severity::Error, "more than one group has extraNew: true"),
    ("entity_spans_groups", Severity::Warning, "entity spans units of different groups"),
    ("unit_cap_in_group", Severity::Warning, "unit newPerDay is ignored because the unit is in a group (the group cap applies)"),
    ("duplicate_intro", Severity::Error, "two intros share an id"),
    ("bad_intro", Severity::Error, "intro has an empty id or no title/text/meta"),
    ("intro_unknown_entity", Severity::Warning, "intro id matches no item entity"),
    ("unknown_tag_kind", Severity::Warning, "tagLabels entry has a kind other than public or internal"),
    ("bad_voice_pattern", Severity::Error, "speech.voices[role].prefer entry is empty or not a valid regular expression"),
    ("unknown_input_script", Severity::Error, "inputScript names an unknown script or is empty"),
    ("bar_matches_zero", Severity::Warning, "bar/extraTags match 0 items"),
    ("empty_detail_key", Severity::Error, "detail field has an empty key"),
    ("empty_detail_glyph", Severity::Error, "detail glyph path must not be empty"),
    ("unknown_detail_type", Severity::Error, "detail field has an unknown type (must be text, list, objects, table, or pairs)"),
    ("bad_detail_keys", Severity::Error, "detail field keys must be two non-empty strings and only on type pairs"),
    ("bad_pass_rule", Severity::Error, "pass.mode is points but scoring is empty"),
    ("pass_mark_ignored", Severity::Warning, "pass.mode resolves to points but passMark is set"),
    ("pass_rule_no_source", Severity::Warning, "pass.basis is official but source is missing"),
    ("pass_rule_default", Severity::Warning, "no pass rule, passMark, or scoring is present"),
];

const MAX_PROMPT_CHARS: usize = 600;
const MIN_LEAK_CHARS: usize = 3;
const COURSE_FILE: &str = "course.json";
const LOCK_FILE: &str = "ids.lock";

const ALL_TYPES: [ItemType; 8] =
    [ItemType::Choice, ItemType::Gap, ItemType::Card, ItemType::Multi, ItemType::Match, ItemType::Order, ItemType::Cloze, ItemType::Numeric];

fn type_name(t: ItemType) -> &'static str {
    t.as_str()
}

fn parse_type(name: &str) -> Option<ItemType> {
    ALL_TYPES.into_iter().find(|t| t.as_str() == name)
}

fn is_valid_id(id: &str) -> bool {
    let Some((head, tail)) = id.split_once('-') else {
        return false;
    };
    let mut chars = head.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_lowercase());
    first_ok
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && !tail.is_empty()
        && tail.chars().all(|c| c.is_ascii_digit())
}

fn validate_fold(fold: &[(String, String)], file: &str, line: usize, sink: &mut Sink) {
    use crate::check::{MAX_FOLD_PAIRS, MAX_FOLD_TARGET_LEN};
    
    if fold.len() > MAX_FOLD_PAIRS {
        sink.error("fold_too_large", file, line, format!("fold has {} entries, maximum is {}", fold.len(), MAX_FOLD_PAIRS));
        return;
    }
    
    for (from, to) in fold {
        if from.is_empty() {
            sink.error("bad_fold", file, line, "fold entry has an empty 'from'".to_string());
        } else if !crate::check::fold_entry_ok(from, to) {
            sink.error("bad_fold", file, line, format!("fold entry '{from}' -> '{to}' is neither a single char nor a range like 'A-Z' -> 'a-z' of equal length"));
        } else if from.chars().count() == 1 && to.chars().count() > MAX_FOLD_TARGET_LEN {
            sink.error("fold_too_large", file, line, format!("fold target '{to}' is {} chars, maximum is {} chars for single-char entries", to.chars().count(), MAX_FOLD_TARGET_LEN));
        }
    }
}

/// True when `id` matches `^[a-z0-9][a-z0-9_-]{0,47}$` (course and unit ids).
pub fn is_valid_course_id(id: &str) -> bool {
    let len = id.len();
    if len == 0 || len > 48 {
        return false;
    }
    let mut chars = id.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    first_ok && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

fn check_plugin_path(path: &str, kind: &str, sink: &mut Sink) {
    let absolute = path.starts_with('/') || path.starts_with('\\') || path.as_bytes().get(1) == Some(&b':');
    if absolute || path.split(['/', '\\']).any(|seg| seg == "..") {
        sink.error("bad_plugin_path", COURSE_FILE, 0, format!("plugins.{kind} path '{}' is absolute or contains '..'", path));
    }
}

fn ladder_problem(ladder: &[i64]) -> Option<&'static str> {
    if ladder.len() < 2 {
        Some("has fewer than 2 entries")
    } else if ladder.iter().any(|&x| x < 0) {
        Some("has a negative entry")
    } else if ladder[0] != 0 {
        Some("must start with 0")
    } else if ladder.windows(2).any(|w| w[1] < w[0]) {
        Some("is not non-decreasing")
    } else {
        None
    }
}

/// Whitelisted Unicode script ranges (Latin, Cyrillic, Hiragana, Katakana, CJK)
/// Returns true if char is in a whitelisted script or is common punctuation/digit
/// Also returns the script name if it's a known non-whitelisted script
fn check_char_script(c: char) -> Option<String> {
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
fn has_foreign_script(text: &str, whitelisted_scripts: &HashSet<String>) -> bool {
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
fn get_prompt_type_mismatch_data() -> &'static [(&'static str, &'static [ItemType])] {
    &[("write", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
      ("type", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
      ("напишите", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
      ("choose", &[ItemType::Gap]),
      ("pick", &[ItemType::Gap]),
      ("выберите", &[ItemType::Gap]),]
}

/// Check for prompt type mismatch
fn check_prompt_type_mismatch(prompt: &str, item_type: ItemType, sink: &mut Sink, file: &str, line: usize, id: &str) {
    let mismatch_data = get_prompt_type_mismatch_data();
    let prompt_lower = prompt.to_lowercase();
    
    for (trigger_word, incompatible_types) in mismatch_data {
        if prompt_lower.contains(trigger_word) && incompatible_types.contains(&item_type) {
            sink.warning("prompt_type_mismatch", file, line, format!("item '{id}' prompt contains '{trigger_word}' but type '{}' has no text input", type_name(item_type)));
            return; // Only report one mismatch per item
        }
    }
}

/// Check if a string contains '/' or '／' outside of brackets (ASCII or full-width)
fn has_slash_outside_brackets(s: &str) -> bool {
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
fn check_ambiguous_answer(item: &Item, sink: &mut Sink, file: &str, line: usize) {
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
fn check_order_blanks_mismatch(item: &Item, sink: &mut Sink, file: &str, line: usize) {
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

const INPUT_SCRIPTS: &[&str] = &["non-latin", "han", "hiragana", "katakana", "cyrillic", "greek", "arabic", "hebrew", "hangul", "devanagari", "thai"];

/// Structural regex check (no regex engine in core): empty, dangling escape, unbalanced groups or classes, quantifier with nothing to repeat.
fn regex_problem(pat: &str) -> Option<String> {
    if pat.is_empty() {
        return Some("empty".to_string());
    }
    let mut depth = 0i32;
    let mut in_class = false;
    let mut can_repeat = false;
    let mut prev = ' ';
    let mut chars = pat.chars();
    while let Some(c) = chars.next() {
        let before = prev;
        prev = c;
        if c == '\\' {
            if chars.next().is_none() {
                return Some("dangling backslash".to_string());
            }
            can_repeat = true;
            continue;
        }
        if in_class {
            if c == ']' {
                in_class = false;
                can_repeat = true;
            }
            continue;
        }
        match c {
            '[' => in_class = true,
            '(' => { depth += 1; can_repeat = false; }
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return Some("unmatched ')'".to_string());
                }
                can_repeat = true;
            }
            '|' => can_repeat = false,
            '*' | '+' | '?' => {
                if !can_repeat && !(c == '?' && before == '(') {
                    return Some(format!("nothing to repeat before '{c}'"));
                }
                if c != '?' { can_repeat = true; }
            }
            _ => can_repeat = true,
        }
    }
    if in_class {
        return Some("unterminated '['".to_string());
    }
    if depth != 0 {
        return Some("unmatched '('".to_string());
    }
    None
}

fn validate_speech_config(speech: &SpeechConfig, file: &str, sink: &mut Sink) {
    if let Some(rate) = speech.rate {
        if !(0.1..=10.0).contains(&rate) {
            sink.error("bad_speech", file, 0, format!("speech.rate {} is outside 0.1..10", rate));
        }
    }
    if let Some(voices) = &speech.voices {
        for (label, voice) in voices {
            if label.is_empty() {
                sink.error("bad_speech", file, 0, "speech.voices has an empty label".to_string());
            }
            if voice.match_.as_deref() == Some("") {
                sink.error("bad_speech", file, 0, format!("speech.voices.{}.match is empty", label));
            }
            for (i, pat) in voice.prefer.iter().flatten().enumerate() {
                if let Some(why) = regex_problem(pat) {
                    sink.error("bad_voice_pattern", file, 0, format!("speech.voices.{}.prefer[{}] '{}': {}", label, i, pat, why));
                }
            }
            if let Some(pitch) = voice.pitch {
                if pitch < 0.0 || pitch > 2.0 {
                    sink.error("bad_speech", file, 0, format!("speech.voices.{}.pitch {} is outside 0..2", label, pitch));
                }
            }
            if let Some(rate) = voice.rate {
                if !(0.1..=10.0).contains(&rate) {
                    sink.error("bad_speech", file, 0, format!("speech.voices.{}.rate {} is outside 0.1..10", label, rate));
                }
            }
        }
    }
}

fn validate_speak(speak: &Speak, voices: Option<&std::collections::BTreeMap<String, crate::content::VoiceConfig>>, file: &str, stim_line: usize, sink: &mut Sink) {
    if speak.lines.is_empty() {
        sink.error("bad_speech", file, stim_line, "speak has no lines".to_string());
    }
    for (idx, speak_line) in speak.lines.iter().enumerate() {
        if speak_line.text.is_empty() {
            sink.error("bad_speech", file, stim_line, format!("speak.lines[{}] has empty text", idx));
        }
        if let Some(voice_label) = &speak_line.voice {
            if voice_label.is_empty() {
                sink.error("bad_speech", file, stim_line, format!("speak.lines[{}] has empty voice label", idx));
            } else if let Some(voices_map) = voices {
                if !voices_map.contains_key(voice_label) {
                    sink.error("unknown_voice", file, stim_line, format!("speak.lines[{}] references unknown voice '{}'", idx, voice_label));
                }
            } else {
                // If voices is not defined, any named voice is unknown
                sink.error("unknown_voice", file, stim_line, format!("speak.lines[{}] references unknown voice '{}'", idx, voice_label));
            }
        }
    }
}

struct Sink {
    out: Vec<Diagnostic>,
}

impl Sink {
    fn push(&mut self, severity: Severity, code: &'static str, file: &str, line: usize, message: String) {
        self.out.push(Diagnostic { severity, code, file: file.to_string(), line, message });
    }

    fn error(&mut self, code: &'static str, file: &str, line: usize, message: String) {
        self.push(Severity::Error, code, file, line, message);
    }

    fn warning(&mut self, code: &'static str, file: &str, line: usize, message: String) {
        self.push(Severity::Warning, code, file, line, message);
    }
}

fn check_course(course: &Course, sink: &mut Sink) {
    if !is_valid_course_id(&course.id) {
        sink.error("bad_course_id", COURSE_FILE, 0, format!("course id '{}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$", course.id));
    }
    let mut seen = HashSet::new();
    let has_placement = course.placement.is_some();
    for unit in &course.units {
        if !is_valid_course_id(&unit.id) {
            sink.error("bad_unit_id", COURSE_FILE, 0, format!("unit id '{}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$", unit.id));
        }
        if !seen.insert(unit.id.as_str()) {
            sink.error("duplicate_unit", COURSE_FILE, 0, format!("unit id '{}' is used more than once", unit.id));
        }
        if unit.new_per_day.is_some_and(|n| n < 0) {
            sink.error("bad_unit_settings", COURSE_FILE, 0, format!("unit '{}' has a negative newPerDay", unit.id));
        }
        if let Some(ladder) = unit.srs.as_ref().and_then(|s| s.ladder.as_ref()) {
            if let Some(problem) = ladder_problem(ladder) {
                sink.error("bad_unit_settings", COURSE_FILE, 0, format!("unit '{}' srs.ladder {problem}", unit.id));
            }
        }
        if unit.placement == Some(false) && !has_placement {
            sink.warning("placement_unused", COURSE_FILE, 0, format!("unit '{}' has placement:false but course.placement is absent", unit.id));
        }
    }
    if course.units.is_empty() {
        sink.error("no_units", COURSE_FILE, 0, "course has no units".to_string());
    }
    if let Some(plugins) = &course.plugins {
        for path in &plugins.scripts {
            check_plugin_path(path, "scripts", sink);
        }
        for path in &plugins.styles {
            check_plugin_path(path, "styles", sink);
        }
    }
    if let Some(norm) = &course.normalize {
        validate_fold(&norm.fold, COURSE_FILE, 0, sink);
    }
    if let Some(speech) = &course.speech {
        validate_speech_config(speech, COURSE_FILE, sink);
    }
    if let Some(scripts) = &course.input_script {
        if scripts.is_empty() {
            sink.error("unknown_input_script", COURSE_FILE, 0, "inputScript is empty".to_string());
        }
        for name in scripts {
            if !INPUT_SCRIPTS.contains(&name.as_str()) {
                sink.error("unknown_input_script", COURSE_FILE, 0, format!("inputScript '{}' is not one of {}", name, INPUT_SCRIPTS.join(", ")));
            }
        }
    }
    if let Some(labels) = &course.tag_labels {
        for (tag, label) in labels {
            if let TagLabel::Detail(d) = label {
                if let Some(kind) = d.kind.as_deref() {
                    if kind != "public" && kind != "internal" {
                        sink.warning("unknown_tag_kind", COURSE_FILE, 0, format!("tagLabels.{tag}.kind '{kind}' is not 'public' or 'internal'"));
                    }
                }
            }
        }
    }
    if let Some(placement) = &course.placement {
        if placement.per_unit < 1 {
            sink.error("bad_placement", COURSE_FILE, 0, format!("placement.perUnit must be >= 1, got {}", placement.per_unit));
        }
        if placement.mode != "check" && placement.mode != "self" {
            sink.error("bad_placement", COURSE_FILE, 0, format!("placement.mode must be 'check' or 'self', got '{}'", placement.mode));
        }
    }
    if let Some(ls) = course.learned_stage {
        if ls < 1 {
            sink.error("bad_learned_stage", COURSE_FILE, 0, format!("learnedStage must be >= 1, got {}", ls));
        }
    }
    
    // Validate groups
    check_groups(course, sink);
    
    // Validate bars
    check_bars(course, sink);
    
    // Validate detail config
    check_detail_config(&course.detail, COURSE_FILE, sink);
    for unit in &course.units {
        check_detail_config(&unit.detail, COURSE_FILE, sink);
    }
    
    // Validate scripts field - just check that it's a valid list (no structural validation needed)
    // The actual validation happens during foreign script checking
    if !course.scripts.is_empty() {
        // For now, just ensure it's not excessive
        if course.scripts.len() > 20 {
            sink.error("bad_course_id", COURSE_FILE, 0, "course.scripts has too many entries (> 20)".to_string());
        }
    }

    if let Some(ladder) = course.srs.as_ref().and_then(|s| s.ladder.as_ref()) {
        if let Some(problem) = ladder_problem(ladder) {
            sink.error("bad_ladder", COURSE_FILE, 0, format!("srs.ladder {problem}"));
        }
    }
    if let Some(map) = &course.srs_by_type {
        for (key, cfg) in map {
            if parse_type(key).is_none() {
                sink.error("srs_by_type_unknown", COURSE_FILE, 0, format!("srsByType key '{key}' is not an item type"));
            }
            if let Some(problem) = cfg.ladder.as_ref().and_then(|l| ladder_problem(l)) {
                sink.error("bad_ladder", COURSE_FILE, 0, format!("srsByType.{key}.ladder {problem}"));
            }
            if cfg.scope.is_some() || cfg.drill.is_some() {
                sink.error("scope_by_type", COURSE_FILE, 0, format!("srsByType.{key} cannot set scope or drill"));
            }
        }
    }

    let drops = course
        .srs
        .iter()
        .map(|s| ("srs".to_string(), s))
        .chain(course.srs_by_type.iter().flatten().map(|(k, s)| (format!("srsByType.{k}"), s)))
        .chain(course.units.iter().filter_map(|u| u.srs.as_ref().map(|s| (format!("unit '{}' srs", u.id), s))));
    for (place, cfg) in drops {
        if cfg.drop_on_wrong.is_some_and(|d| !(0..=10).contains(&d)) {
            sink.error("bad_drop", COURSE_FILE, 0, format!("{place}.dropOnWrong must be an integer from 0 to 10"));
        }
        if cfg.drill.is_some_and(|d| !(1..=5).contains(&d)) {
            sink.error("bad_drill", COURSE_FILE, 0, format!("{place}.drill must be an integer from 1 to 5"));
        }
    }

    // Exam ids: exams[] ids are required and unique; the legacy exam is always "default".
    let mut seen_exam_ids: HashSet<String> = HashSet::new();
    for exam in &course.exams {
        if exam.id.is_empty() {
            sink.error("bad_id", COURSE_FILE, 0, "exams[] entry has no id".to_string());
        } else if !is_valid_course_id(&exam.id) {
            sink.error("bad_id", COURSE_FILE, 0, format!("exam id '{}' must match exam id rules", exam.id));
        }
        if !seen_exam_ids.insert(exam.id.clone()) {
            sink.error("bad_exam", COURSE_FILE, 0, format!("duplicate exam id '{}'", exam.id));
        }
    }
    if let Some(legacy) = &course.exam {
        if !legacy.id.is_empty() && legacy.id != "default" {
            sink.error("bad_exam", COURSE_FILE, 0, format!("legacy exam id must be 'default' (or omitted), got '{}'", legacy.id));
        }
        if !seen_exam_ids.insert("default".to_string()) {
            sink.error("bad_exam", COURSE_FILE, 0, "duplicate exam id 'default' (legacy exam conflicts with exams[])".to_string());
        }
    }

    let all_exams: Vec<(&str, &ExamConfig)> = course
        .exam
        .iter()
        .map(|e| ("default", e))
        .chain(course.exams.iter().map(|e| (e.id.as_str(), e)))
        .collect();

    for (id, exam) in all_exams {
        if let Some(pm) = exam.pass_mark {
            if !(0.0..=1.0).contains(&pm) {
                sink.error("bad_pass_mark", COURSE_FILE, 0, format!("exam '{id}': passMark {} is not within 0..=1", pm));
            }
        }
        
        // Validate pass rule
        let has_scoring = !exam.scoring.is_empty();
        let resolved_mode = resolve_mode(exam.pass.as_ref(), has_scoring);
        
        // bad_pass_rule: pass.mode == points and scoring is empty
        // pass_mark_ignored: resolve_mode(..) == points and pass_mark is Some
        // Check these together since they both use the mode
        if let Some(pass) = &exam.pass {
            if let Some(mode) = pass.mode {
                if mode == PassMode::Points && exam.scoring.is_empty() {
                    sink.error("bad_pass_rule", COURSE_FILE, 0, format!("exam '{id}': pass.mode is points but scoring is empty"));
                }
            }
            
            // pass_mark_ignored: check when pass is present
            if resolved_mode == PassMode::Points && exam.pass_mark.is_some() {
                sink.warning("pass_mark_ignored", COURSE_FILE, 0, format!("exam '{id}': pass.mode resolves to points but passMark is set"));
            }
            
            // pass_rule_no_source: basis == official and source is None or trim() is empty
            if let Some(basis) = pass.basis {
                if basis == PassBasis::Official {
                    if pass.source.as_ref().map_or(true, |s| s.trim().is_empty()) {
                        sink.warning("pass_rule_no_source", COURSE_FILE, 0, format!("exam '{id}': pass.basis is official but source is missing"));
                    }
                }
            }
        } else {
            // pass_mark_ignored: also check when pass is not present but mode defaults to points
            if resolved_mode == PassMode::Points && exam.pass_mark.is_some() {
                sink.warning("pass_mark_ignored", COURSE_FILE, 0, format!("exam '{id}': pass.mode resolves to points but passMark is set"));
            }
        }
        
        // pass_rule_default: pass_mark is None, pass is None, and scoring is empty
        if exam.pass_mark.is_none() && exam.pass.is_none() && exam.scoring.is_empty() {
            sink.warning("pass_rule_default", COURSE_FILE, 0, format!("exam '{id}': no pass rule, passMark, or scoring is present"));
        }

        let mut title_counts: HashMap<&str, usize> = HashMap::new();
        for s in &exam.sections {
            *title_counts.entry(s.title.as_str()).or_default() += 1;
        }
        let mut dup_reported: HashSet<String> = HashSet::new();
        let mut check_known = |sink: &mut Sink, what: String, title: &str| {
            match title_counts.get(title) {
                None => sink.error("unknown_section", COURSE_FILE, 0, format!("exam '{id}': {what} references unknown section '{title}'")),
                Some(&n) if n > 1 && dup_reported.insert(title.to_string()) => {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': section title '{title}' appears {n} times but is referenced by timing/scoring"))
                }
                Some(_) => {}
            }
        };

        if let Some(timing) = &exam.timing {
            if timing.is_empty() {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing has empty groups list"));
            }
            let mut section_to_group: HashMap<&str, usize> = HashMap::new();
            for (tg_idx, tg) in timing.iter().enumerate() {
                if tg.minutes == 0 {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{tg_idx}].minutes is 0"));
                }
                if tg.sections.is_empty() {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{tg_idx}].sections is empty"));
                }
                for section_title in &tg.sections {
                    check_known(sink, format!("timing[{tg_idx}].sections"), section_title);
                    if let Some(prev_idx) = section_to_group.insert(section_title.as_str(), tg_idx) {
                        sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': section '{section_title}' appears in both timing[{prev_idx}] and timing[{tg_idx}]"));
                    }
                }
            }
            // Validate timing group section contiguity and non-overlapping
            if let Some(timing) = &exam.timing {
                // Build a map from section title to its index in exam.sections
                let section_to_idx: HashMap<&str, usize> = exam.sections.iter().enumerate().map(|(idx, s)| (s.title.as_str(), idx)).collect();
                
                // First, build the ranges for each timing group
                let mut group_ranges: Vec<(usize, usize)> = Vec::new();
                for (tg_idx, tg) in timing.iter().enumerate() {
                    // Get indices for all sections in this group (only those that exist)
                    let mut indices: Vec<usize> = tg.sections.iter().filter_map(|st| section_to_idx.get(st.as_str())).copied().collect();
                    if indices.is_empty() {
                        continue; // all sections are unknown, already reported
                    }
                    indices.sort();
                    let range = (*indices.first().unwrap(), *indices.last().unwrap());
                    group_ranges.push(range);
                    
                    // Check contiguity: each index should be exactly one more than the previous
                    if indices.len() == tg.sections.len() && tg.sections.len() >= 2 {
                        for i in 1..indices.len() {
                            if indices[i] != indices[i-1] + 1 {
                                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{tg_idx}] sections are not consecutive in exam section order"));
                                break;
                            }
                        }
                    }
                }
                
                // Check for overlapping ranges
                for (i, &(min1, max1)) in group_ranges.iter().enumerate() {
                    for (j, &(min2, max2)) in group_ranges.iter().enumerate() {
                        if j <= i {
                            continue;
                        }
                        // Ranges overlap if: min1 <= max2 && min2 <= max1
                        if min1 <= max2 && min2 <= max1 {
                            sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{i}] and timing[{j}] have overlapping section ranges"));
                        }
                    }
                }
            }
        }

        let mut section_to_part: HashMap<&str, usize> = HashMap::new();
        for (part_idx, part) in exam.scoring.iter().enumerate() {
            if part.points == 0 {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': scoring[{part_idx}].points is 0"));
            }
            if let Some(min_p) = part.min_points {
                if min_p > part.points {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': scoring[{part_idx}].minPoints {min_p} > points {}", part.points));
                }
            }
            if part.sections.is_empty() {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': scoring[{part_idx}].sections is empty"));
            }
            for section_title in &part.sections {
                check_known(sink, format!("scoring[{part_idx}].sections"), section_title);
                if let Some(prev_idx) = section_to_part.insert(section_title.as_str(), part_idx) {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': section '{section_title}' is covered by scoring[{prev_idx}] and scoring[{part_idx}]"));
                }
            }
        }

        if let Some(pp) = exam.pass_points {
            if pp < 0 {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': passPoints {pp} is negative"));
            }
        }

        for section in &exam.sections {
            let title = &section.title;
            if section.count == 0 {
                sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' has count 0"));
            }
            for unit in section.units.iter().flatten() {
                if !course.units.iter().any(|u| &u.id == unit) {
                    sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' uses unknown unit '{unit}'"));
                }
            }
            for t in section.types.iter().flatten() {
                match parse_type(t) {
                    None => sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' uses unknown type '{t}'")),
                    Some(ty) if ty.is_self_rated() => {
                        sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' type '{t}' is self-rated and cannot be auto-scored"))
                    }
                    Some(ty) if course.types.as_ref().is_some_and(|ts| !ts.contains(&ty)) => {
                        sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' type '{t}' is not enabled in course.types"))
                    }
                    Some(_) => {}
                }
            }
        }
    }
    if let Some(breakdown) = &course.breakdown {
        if breakdown.key.as_ref().map_or(true, |k| k.trim().is_empty()) ||
           breakdown.meaning.as_ref().map_or(true, |m| m.trim().is_empty()) {
            sink.error("bad_breakdown", COURSE_FILE, 0, "breakdown key and meaning must be non-empty strings".to_string());
        }
        for (i, reading) in breakdown.readings.iter().enumerate() {
            if reading.trim().is_empty() {
                sink.error("bad_breakdown", COURSE_FILE, 0, format!("breakdown readings[{}] must be a non-empty string", i));
            }
        }
    }
}

fn check_exam_sizes(course: &Course, items: &[(&str, usize, &Item)], sink: &mut Sink) {
    let all_exams: Vec<&ExamConfig> = course.exam.iter().chain(course.exams.iter()).collect();

    for exam in all_exams {
        for section in &exam.sections {
            let matching = items
                .iter()
                .filter(|(_, _, item)| !item.is_retired())
                .filter(|(_, _, item)| section.units.as_ref().is_none_or(|u| u.iter().any(|x| x == item.unit())))
                .filter(|(_, _, item)| section.tags.as_ref().is_none_or(|t| item_tags(item).iter().any(|x| t.contains(x))))
                .filter(|(_, _, item)| section.types.as_ref().is_none_or(|t| t.iter().any(|x| x == type_name(item.item_type()))))
                .count();
            if section.count > matching {
                sink.warning(
                    "exam_too_big",
                    COURSE_FILE,
                    0,
                    format!("exam section '{}' wants {} items but only {} active items match", section.title, section.count, matching),
                );
            }
            
            // Count examOnly items
            let exam_only_count = items
                .iter()
                .filter(|(_, _, item)| !item.is_retired())
                .filter(|(_, _, item)| section.units.as_ref().is_none_or(|u| u.iter().any(|x| x == item.unit())))
                .filter(|(_, _, item)| section.tags.as_ref().is_none_or(|t| item_tags(item).iter().any(|x| t.contains(x))))
                .filter(|(_, _, item)| section.types.as_ref().is_none_or(|t| t.iter().any(|x| x == type_name(item.item_type()))))
                .filter(|(_, _, item)| {
                    course.units.iter().any(|u| u.id == item.unit() && u.exam_only == Some(true))
                })
                .count();
            
            // Check if we have enough examOnly items (at least 20% of section.count)
            if section.count > 0 {
                let target = (section.count * 20 + 99) / 100;
                if exam_only_count < target {
                    sink.warning(
                        "exam_few_unique",
                        COURSE_FILE,
                        0,
                        format!("exam section '{}' has only {} examOnly items out of {} required", section.title, exam_only_count, target),
                    );
                }
            }
        }
    }
}

fn check_groups(course: &Course, sink: &mut Sink) {
    
    let unit_ids: HashSet<String> = course.units.iter().map(|u| u.id.clone()).collect();
    let mut unit_to_group: HashMap<String, String> = HashMap::new();
    let mut extra_new_count = 0;
    
    for group in &course.groups {
        // Check group id is valid
        if !is_valid_course_id(&group.id) {
            sink.error("bad_course_id", COURSE_FILE, 0, format!("group id '{}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$", group.id));
        }
        
        // Check for duplicate group ids
        // (We'll check this implicitly by the HashMap insertion)
        
        // Check units exist
        for unit_id in &group.units {
            if !unit_ids.contains(unit_id) {
                sink.error("unknown_unit_in_group", COURSE_FILE, 0, format!("group '{}' references unknown unit '{}'", group.id, unit_id));
            }
        }
        
        // Track unit to group mapping
        for unit_id in &group.units {
            if let Some(existing_group) = unit_to_group.insert(unit_id.clone(), group.id.clone()) {
                sink.error("unit_in_two_groups", COURSE_FILE, 0, format!("unit '{}' is in both group '{}' and group '{}'", unit_id, existing_group, group.id));
            }
        }
        
        for unit in &course.units {
            if unit.new_per_day.is_some() && group.units.contains(&unit.id) {
                sink.warning("unit_cap_in_group", COURSE_FILE, 0, format!("unit '{}' has newPerDay but is in group '{}': the unit cap is ignored", unit.id, group.id));
            }
        }

        // Check extra_new
        if group.extra_new == Some(true) {
            extra_new_count += 1;
        }
    }
    
    // Check at most one group has extra_new: true
    if extra_new_count > 1 {
        sink.error("two_extra_new_groups", COURSE_FILE, 0, format!("{} groups have extraNew: true, maximum is 1", extra_new_count));
    }
}

fn check_bars(course: &Course, sink: &mut Sink) {
    
    let unit_ids: HashSet<String> = course.units.iter().map(|u| u.id.clone()).collect();
    
    for bar in &course.bars {
        // Check bar title is non-empty
        if bar.title.is_empty() {
            sink.error("bad_course_id", COURSE_FILE, 0, "bar title must not be empty".to_string());
        }
        
        // Check units exist
        for unit_id in &bar.units {
            if !unit_ids.contains(unit_id.as_str()) {
                sink.error("bad_course_id", COURSE_FILE, 0, format!("bar references unknown unit '{}'", unit_id));
            }
        }
        
        // Check learned_stage if present
        if let Some(ls) = bar.learned_stage {
            if ls < 1 {
                sink.error("bad_learned_stage", COURSE_FILE, 0, format!("bar learnedStage must be >= 1, got {}", ls));
            }
        }
    }
}

fn check_detail_config(config: &Option<DetailConfig>, file: &str, sink: &mut Sink) {
    if let Some(cfg) = config {
        check_detail_fields(&cfg.fields, file, sink);
        if let Some(ref glyph) = cfg.glyph {
            if glyph.is_empty() {
                sink.error("empty_detail_glyph", file, 0, "detail glyph path must not be empty".to_string());
            }
        }
    }
}

fn check_detail_fields(fields: &[DetailField], file: &str, sink: &mut Sink) {
    for field in fields {
        // Validate key is non-empty
        if field.key.is_empty() {
            sink.error("empty_detail_key", file, 0, "detail field key must not be empty".to_string());
        }
        
        if let Some(ref typ) = field.r#type {
            if !matches!(typ.as_str(), "text" | "list" | "objects" | "table" | "pairs") {
                sink.error("unknown_detail_type", file, 0, format!("detail field `{}` has unknown type `{}`", field.key, typ));
            }
        }

        if let Some(ref keys) = field.keys {
            if field.r#type.as_deref() != Some("pairs") {
                sink.error("bad_detail_keys", file, 0, format!("detail field `{}` has `keys` but is not type `pairs`", field.key));
            } else if keys.len() != 2 || keys.iter().any(|k| k.is_empty()) {
                sink.error("bad_detail_keys", file, 0, format!("detail field `{}` keys must be two non-empty strings", field.key));
            }
        }

        // Recursively validate nested fields for objects type
        if let Some(ref nested) = field.fields {
            check_detail_fields(nested, file, sink);
        }
    }
}

fn check_entity_spans_groups(
    course: &Course,
    items: &[(&str, usize, &Item)],
    sink: &mut Sink,
) {
    use std::collections::HashMap;
    
    // Build unit -> group mapping
    let mut unit_to_group: HashMap<&str, &str> = HashMap::new();
    for group in &course.groups {
        for unit_id in &group.units {
            unit_to_group.insert(unit_id.as_str(), group.id.as_str());
        }
    }
    
    // Build entity -> units mapping
    let mut entity_units: HashMap<String, HashSet<&str>> = HashMap::new();
    for (_file, _line, item) in items {
        if let Some(entity_id) = item.entity() {
            let unit_id = item.unit();
            entity_units.entry(entity_id.to_string()).or_default().insert(unit_id);
        }
    }
    
    // Check entities that span multiple units
    for (entity_id, units) in &entity_units {
        if units.len() > 1 {
            // Check if these units belong to different groups
            let mut groups: HashSet<&str> = HashSet::new();
            for unit_id in units {
                if let Some(group_id) = unit_to_group.get(unit_id) {
                    groups.insert(group_id);
                }
            }
            if groups.len() > 1 {
                sink.warning(
                    "entity_spans_groups",
                    COURSE_FILE,
                    0,
                    format!("entity '{}' spans units across {} different groups", entity_id, groups.len()),
                );
            }
        }
    }
}

fn check_mixed_entity_scope(course: &Course, items: &[(&str, usize, &Item)], sink: &mut Sink) {
    use crate::content::SrsScope;
    let scoped = |unit: &str| {
        let own = course.units.iter().find(|u| u.id == unit).and_then(|u| u.srs.as_ref()).and_then(|s| s.scope);
        own.or(course.srs.as_ref().and_then(|s| s.scope)) == Some(SrsScope::Entity)
    };
    let mut flags: std::collections::BTreeMap<&str, (bool, bool)> = std::collections::BTreeMap::new();
    for (_, _, item) in items.iter().filter(|(_, _, i)| !i.is_retired()) {
        let e = item.entity().unwrap_or_else(|| item.id());
        let f = flags.entry(e).or_default();
        if scoped(item.unit()) { f.0 = true } else { f.1 = true }
    }
    for (e, (a, b)) in flags {
        if a && b {
            sink.warning("mixed_entity_scope", COURSE_FILE, 0, format!("entity '{e}' spans units with different srs.scope; it stays per-item"));
        }
    }
}

fn check_bar_matches(
    course: &Course,
    items: &[(&str, usize, &Item)],
    sink: &mut Sink,
) {
    use std::collections::{HashMap, HashSet};
    
    // Build item unit and tags lookup
    let mut item_meta: HashMap<String, (String, Vec<String>)> = HashMap::new();
    for (_file, _line, item) in items {
        let tags = item.tags().cloned().unwrap_or_default();
        item_meta.insert(item.id().to_string(), (item.unit().to_string(), tags));
    }
    
    // Check each bar
    for bar in &course.bars {
        // Check if bar matches any items
        let mut matches_any = false;
        
        for (_item_id, (unit_id, tags)) in &item_meta {
            // Check unit filter
            if !bar.units.is_empty() && !bar.units.iter().any(|u| u == unit_id) {
                continue;
            }
            
            // Check tag filter
            if !bar.tags.is_empty() {
                let tag_set: HashSet<&str> = bar.tags.iter().map(|s| s.as_str()).collect();
                let item_tag_set: HashSet<&str> = tags.iter().map(|s| s.as_str()).collect();
                if !tag_set.iter().all(|t| item_tag_set.contains(t)) {
                    continue;
                }
            }
            
            matches_any = true;
            break;
        }
        
        if !matches_any {
            sink.warning(
                "bar_matches_zero",
                COURSE_FILE,
                0,
                format!("bar '{}' matches 0 items", bar.title),
            );
        }
    }
    
    // Check extraTags from groups
    for group in &course.groups {
        if !group.extra_tags.is_empty() {
            // Check if extraTags match any items
            let mut matches_any = false;
            
            for (_item_id, (unit_id, tags)) in &item_meta {
                // Only check items in this group's units
                if !group.units.iter().any(|u| u == unit_id) {
                    continue;
                }
                
                // Check if item has all extra_tags
                let tag_set: HashSet<&str> = group.extra_tags.iter().map(|s| s.as_str()).collect();
                let item_tag_set: HashSet<&str> = tags.iter().map(|s| s.as_str()).collect();
                if tag_set.iter().all(|t| item_tag_set.contains(t)) {
                    matches_any = true;
                    break;
                }
            }
            
            if !matches_any {
                sink.warning(
                    "bar_matches_zero",
                    COURSE_FILE,
                    0,
                    format!("group '{}' extraTags match 0 items", group.id),
                );
            }
        }
    }
}

fn item_tags(item: &Item) -> &[String] {
    match item {
        Item::Choice(i) => &i.tags,
        Item::Gap(i) => &i.tags,
        Item::Card(i) => &i.tags,
        Item::Multi(i) => &i.tags,
        Item::Match(i) => &i.tags,
        Item::Order(i) => &i.tags,
        Item::Cloze(i) => &i.tags,
        Item::Numeric(i) => &i.tags,
    }
}

fn item_prompt(item: &Item) -> &str {
    match item {
        Item::Choice(i) => &i.prompt,
        Item::Gap(i) => &i.prompt,
        Item::Card(i) => &i.prompt,
        Item::Multi(i) => &i.prompt,
        Item::Match(i) => &i.prompt,
        Item::Order(i) => &i.prompt,
        Item::Cloze(i) => &i.prompt,
        Item::Numeric(i) => &i.prompt,
    }
}

fn contains_leak(norm_prompt: &str, norm_answer: &str) -> bool {
    norm_answer.chars().count() >= MIN_LEAK_CHARS && norm_prompt.contains(norm_answer)
}

fn item_body(item: &Item) -> String {
    let norm = Normalize::default();
    let join = |parts: Vec<&str>| parts.into_iter().map(|p| normalize(p, &norm)).collect::<Vec<_>>().join("\u{1f}");
    match item {
        Item::Choice(_) | Item::Gap(_) | Item::Card(_) => String::new(),
        Item::Multi(m) => join(m.options.iter().map(String::as_str).collect()),
        Item::Match(m) => join(m.pairs.iter().flat_map(|p| [p.left.as_str(), p.right.as_str()]).chain(m.distractors.iter().map(String::as_str)).collect()),
        Item::Order(o) => join(o.steps.iter().map(String::as_str).collect()),
        Item::Cloze(c) => join(
            c.parts
                .iter()
                .flat_map(|p| match p {
                    ClozePart::Text(t) => vec![t.as_str()],
                    ClozePart::Blank(alts) => std::iter::once("\u{1e}").chain(alts.iter().map(String::as_str)).collect(),
                })
                .collect(),
        ),
        Item::Numeric(n) => n.answer.to_string(),
    }
}

fn check_item_body(item: &Item, file: &str, line: usize, sink: &mut Sink) {
    let default = Normalize::default();
    let id = item.id();
    if item_prompt(item).trim().is_empty() {
        sink.error("empty_prompt", file, line, format!("item '{id}' has an empty prompt"));
    }
    match item {
        Item::Choice(c) => {
            if c.options.len() < 2 {
                sink.error("choice_few_options", file, line, format!("item '{id}' has fewer than 2 options"));
            }
            if c.answer >= c.options.len() {
                sink.error(
                    "choice_answer_out_of_range",
                    file,
                    line,
                    format!("item '{id}' answer {} is outside {} options", c.answer, c.options.len()),
                );
            }
            let mut seen = HashSet::new();
            let mut reported = false;
            for o in &c.options {
                if !seen.insert(normalize(o, &default)) && !reported {
                    reported = true;
                    sink.error("choice_duplicate_options", file, line, format!("item '{id}' has duplicate options ('{o}')"));
                }
            }
        }
        Item::Gap(g) => {
            if let Some(ref norm) = g.normalize {
                validate_fold(&norm.fold, file, line, sink);
            }
            let opts = g.normalize.clone().unwrap_or_default();
            if g.answers.is_empty() {
                sink.error("gap_no_answers", file, line, format!("item '{id}' has no answers"));
            }
            if g.answers.iter().any(|a| normalize(a, &opts).is_empty()) {
                sink.error("gap_empty_answer", file, line, format!("item '{id}' has an empty answer"));
            }
            // Validate retry field
            if !g.retry.is_empty() {
                // Check if any retry reading equals an answer (after normalization)
                for r in &g.retry {
                    let norm_r = normalize(r, &opts);
                    if norm_r.is_empty() {
                        sink.error("gap_empty_answer", file, line, format!("item '{id}' has an empty retry reading"));
                    }
                    for a in &g.answers {
                        if normalize(a, &opts) == norm_r {
                            sink.error("bad_retry", file, line, format!("item '{id}' retry reading '{}' equals an answer", r));
                        }
                    }
                }
            }
        }
        Item::Card(c) => {
            if c.back.trim().is_empty() {
                sink.error("card_empty_back", file, line, format!("item '{id}' has an empty back"));
            }
        }
        Item::Multi(m) => {
            if m.options.len() < 3 {
                sink.error("multi_few_options", file, line, format!("item '{id}' has fewer than 3 options"));
            }
            let mut seen_options = HashSet::new();
            if let Some(o) = m.options.iter().find(|o| !seen_options.insert(normalize(o, &default))) {
                sink.error("multi_duplicate_options", file, line, format!("item '{id}' has duplicate options ('{o}')"));
            }
            if m.correct.is_empty() {
                sink.error("multi_bad_correct", file, line, format!("item '{id}' has no correct answers"));
            } else {
                let mut seen = HashSet::new();
                let mut has_dup = false;
                let mut has_oob = false;
                for &c in &m.correct {
                    if c >= m.options.len() {
                        has_oob = true;
                    }
                    if !seen.insert(c) {
                        has_dup = true;
                    }
                }
                if has_dup {
                    sink.error("multi_bad_correct", file, line, format!("item '{id}' correct list has duplicates"));
                }
                if has_oob {
                    sink.error("multi_bad_correct", file, line, format!("item '{id}' correct list has out-of-range indices"));
                }
                if m.correct.len() >= m.options.len() {
                    sink.error("multi_bad_correct", file, line, format!("item '{id}' correct list must be fewer than options"));
                }
            }
        }
        Item::Match(m) => {
            if m.pairs.len() < 2 || m.pairs.len() > 8 {
                sink.error("match_pair_count", file, line, format!("item '{id}' has {} pairs, expected 2..=8", m.pairs.len()));
            } else if m.pairs.len() > 6 {
                sink.warning("match_many_pairs", file, line, format!("item '{id}' has {} pairs (> 6)", m.pairs.len()));
            }
            let norm = Normalize::default();
            let mut seen_left = HashSet::new();
            let mut seen_right = HashSet::new();
            let mut dup_left = false;
            let mut dup_right = false;
            for p in &m.pairs {
                if !seen_left.insert(normalize(&p.left, &norm)) {
                    dup_left = true;
                }
                if !seen_right.insert(normalize(&p.right, &norm)) {
                    dup_right = true;
                }
            }
            for d in &m.distractors {
                if !seen_right.insert(normalize(d, &norm)) {
                    dup_right = true;
                }
            }
            if dup_left {
                sink.error("match_duplicate_left", file, line, format!("item '{id}' has duplicate lefts"));
            }
            if dup_right {
                sink.error("match_duplicate_right", file, line, format!("item '{id}' has duplicate rights or distractors"));
            }
        }
        Item::Order(o) => {
            if o.steps.len() < 2 || o.steps.len() > 10 {
                sink.error("order_step_count", file, line, format!("item '{id}' has {} steps, expected 2..=10", o.steps.len()));
            } else if o.steps.len() > 7 {
                sink.warning("order_many_steps", file, line, format!("item '{id}' has {} steps (> 7)", o.steps.len()));
            }
            let norm = Normalize::default();
            let mut seen = HashSet::new();
            let mut has_dup = false;
            for s in &o.steps {
                if !seen.insert(normalize(s, &norm)) {
                    has_dup = true;
                }
            }
            if has_dup {
                sink.error("order_duplicate_step", file, line, format!("item '{id}' has duplicate steps"));
            }
        }
        Item::Cloze(c) => {
            if let Some(ref norm) = c.normalize {
                validate_fold(&norm.fold, file, line, sink);
            }
            let norm = c.normalize.clone().unwrap_or_default();
            let blank_count = c.parts.iter().filter(|p| matches!(p, ClozePart::Blank(_))).count();
            if blank_count == 0 {
                sink.error("cloze_no_blank", file, line, format!("item '{id}' has no blanks"));
            } else if blank_count > 10 {
                sink.error("cloze_too_many_blanks", file, line, format!("item '{id}' has {} blanks, expected <= 10", blank_count));
            } else if blank_count > 5 {
                sink.warning("cloze_many_blanks", file, line, format!("item '{id}' has {} blanks (> 5)", blank_count));
            }
            let mut has_empty_alt = false;
            let mut has_content = false;
            for p in &c.parts {
                match p {
                    ClozePart::Text(t) => {
                        if !normalize(t, &norm).is_empty() {
                            has_content = true;
                        }
                    }
                    ClozePart::Blank(alts) => {
                        if alts.is_empty() {
                            has_empty_alt = true;
                        }
                        for a in alts {
                            if normalize(a, &norm).is_empty() {
                                has_empty_alt = true;
                            } else {
                                has_content = true;
                            }
                        }
                    }
                }
            }
            if has_empty_alt {
                sink.error("cloze_empty_alternative", file, line, format!("item '{id}' has an empty alternative"));
            }
            if !has_content {
                sink.error("cloze_empty_parts", file, line, format!("item '{id}' has no non-empty parts"));
            }
        }
        Item::Numeric(n) => {
            if !n.answer.is_finite() {
                sink.error("numeric_bad_answer", file, line, format!("item '{id}' answer is not finite"));
            }
            if let Some(tol) = n.tolerance {
                if !tol.is_finite() || tol < 0.0 {
                    sink.error("numeric_bad_tolerance", file, line, format!("item '{id}' tolerance is negative or not finite"));
                }
            }
        }
    }
    if item_prompt(item).chars().count() > MAX_PROMPT_CHARS {
        sink.warning("prompt_too_long", file, line, format!("item '{id}' prompt is longer than {MAX_PROMPT_CHARS} characters"));
    }
}

fn fold_norm<'a>(item_norm: Option<&'a Normalize>, course_norm: Option<&'a Normalize>) -> Option<&'a Normalize> {
    item_norm.filter(|n| !n.fold.is_empty()).or(course_norm.filter(|n| !n.fold.is_empty()))
}

fn check_leak(item: &Item, file: &str, line: usize, sink: &mut Sink, course_norm: Option<&Normalize>, stimulus_hide_text: &HashSet<String>) {
    // Skip leak check if the item has a stimulus with hideText: true
    if let Some(stim_id) = item.stimulus() {
        if stimulus_hide_text.contains(stim_id) {
            return;
        }
    }
    let leaked = match item {
        Item::Gap(g) => {
            let opts = fold_norm(g.normalize.as_ref(), course_norm).cloned().or_else(|| g.normalize.clone()).unwrap_or_default();
            let prompt = normalize(&g.prompt, &opts);
            g.answers.iter().find(|a| contains_leak(&prompt, &normalize(a, &opts))).cloned()
        }
        Item::Choice(c) => {
            let opts = fold_norm(None, course_norm).cloned().unwrap_or_default();
            let prompt = normalize(&c.prompt, &opts);
            c.options.get(c.answer).filter(|a| contains_leak(&prompt, &normalize(a, &opts))).cloned()
        }
        Item::Card(_) | Item::Multi(_) | Item::Match(_) | Item::Order(_) | Item::Cloze(_) | Item::Numeric(_) => None,
    };
    if let Some(answer) = leaked {
        sink.warning("answer_in_prompt", file, line, format!("item '{}' prompt contains its answer '{answer}'", item.id()));
    }
}

/// Checks that items sharing a stimulus have consistent properties.
fn check_stimulus_groups(items: &[(&str, usize, &Item)], sink: &mut Sink) {
    use std::collections::BTreeMap;
    use crate::content::ItemType;
    
    // Group items by stimulus id
    let mut by_stimulus: BTreeMap<&str, Vec<&Item>> = BTreeMap::new();
    for (_, _, item) in items {
        if let Some(stim_id) = item.stimulus() {
            by_stimulus.entry(stim_id).or_default().push(item);
        }
    }
    
    for (stim_id, stim_items) in &by_stimulus {
        if stim_items.len() < 2 {
            continue; // need at least 2 items to have a split
        }
        
        let first_item = stim_items[0];
        let first_unit = first_item.unit();
        let first_type = first_item.item_type();
        let sorted_tags = |i: &Item| -> Vec<String> { let mut t = i.tags().cloned().unwrap_or_default(); t.sort(); t };
        let first_tags = sorted_tags(first_item);
        
        let mut has_card = first_type == ItemType::Card;
        let mut has_unit_diff = false;
        let mut has_type_diff = false;
        let mut has_tags_diff = false;
        
        for item in stim_items.iter().skip(1) {
            let unit = item.unit();
            let itype = item.item_type();
            
            if itype == ItemType::Card {
                has_card = true;
            }
            
            if unit != first_unit {
                has_unit_diff = true;
            }
            if itype != first_type {
                has_type_diff = true;
            }
            if sorted_tags(item) != first_tags {
                has_tags_diff = true;
            }
        }
        
        if has_card || has_unit_diff || has_type_diff || has_tags_diff {
            let mut message = format!("stimulus '{stim_id}' items have inconsistent properties: ");
            if has_card {
                message.push_str("includes card type, ");
            }
            if has_unit_diff {
                message.push_str("units differ, ");
            }
            if has_type_diff {
                message.push_str("types differ, ");
            }
            if has_tags_diff {
                message.push_str("tags differ, ");
            }
            // Remove trailing comma-space
            if message.ends_with(", ") {
                message = message[..message.len()-2].to_string();
            }
            // Report on the first item in the group
            if let Some((file, line, _)) = items.iter().find(|(_, _, item)| item.stimulus() == Some(*stim_id)) {
                sink.warning("stimulus_group_split", *file, *line, message);
            }
        }
    }
}

/// Validates a course; `files` are content files in the order they should be reported. Never panics.
pub fn validate(course_text: &str, files: &[SourceFile], lock: Option<&IdLock>) -> Vec<Diagnostic> {
    validate_with_stimuli(course_text, files, lock, None)
}

/// Like [`validate`], also checking `stimuli.jsonl` and the items' `stimulus` references.
pub fn validate_with_stimuli(course_text: &str, files: &[SourceFile], lock: Option<&IdLock>, stimuli: Option<&SourceFile>) -> Vec<Diagnostic> {
    validate_all(course_text, files, lock, stimuli, None)
}

/// Like [`validate_with_stimuli`], also checking `intros.jsonl`.
pub fn validate_all(
    course_text: &str,
    files: &[SourceFile],
    lock: Option<&IdLock>,
    stimuli: Option<&SourceFile>,
    intros: Option<&SourceFile>,
) -> Vec<Diagnostic> {
    let mut course_sink = Sink { out: Vec::new() };
    let course = match parse_course(course_text) {
        Ok(c) => {
            check_course(&c, &mut course_sink);
            Some(c)
        }
        Err(errors) => {
            for e in errors {
                course_sink.error("parse_error", COURSE_FILE, e.line, e.message);
            }
            None
        }
    };

    let parsed: Vec<_> = files.iter().map(|f| parse_items(&f.text)).collect();
    let all: Vec<(&str, usize, &Item)> = files
        .iter()
        .zip(&parsed)
        .flat_map(|(f, p)| p.items.iter().map(move |(line, item)| (f.name.as_str(), *line, item)))
        .collect();

    // Validate stimuli.jsonl if present
    let mut stimulus_hide_text: HashSet<String> = HashSet::new();
    let mut stimulus_map: HashMap<String, (String, usize)> = HashMap::new();

    if let Some(stim_file) = stimuli {
        let stim_parsed = parse_stimuli(&stim_file.text);
        for e in &stim_parsed.errors {
            course_sink.error("parse_error", &stim_file.name, e.line, e.message.clone());
        }
        let mut seen_stim_ids: HashSet<String> = HashSet::new();
        for (line, stim) in &stim_parsed.stimuli {
            let stim_id = stim.id.clone();
            if !seen_stim_ids.insert(stim_id.clone()) {
                course_sink.error("duplicate_stimulus", &stim_file.name, *line, format!("stimulus id '{stim_id}' is used more than once"));
            }
            if stim.hide_text == Some(true) {
                stimulus_hide_text.insert(stim_id.clone());
            }
            if let Some(ref speak) = stim.speak {
                if let Some(ref course) = course {
                    validate_speak(speak, course.speech.as_ref().and_then(|s| s.voices.as_ref()), &stim_file.name, *line, &mut course_sink);
                }
            }
            stimulus_map.insert(stim_id, (stim_file.name.clone(), *line));
        }
    }

    if let Some(intro_file) = intros {
        let ip = parse_intros(&intro_file.text);
        for e in &ip.errors {
            course_sink.error("parse_error", &intro_file.name, e.line, e.message.clone());
        }
        let entities: HashSet<&str> = all.iter().map(|(_, _, it)| it.entity().unwrap_or_else(|| it.id())).collect();
        let mut seen_intro: HashSet<&str> = HashSet::new();
        for (line, intro) in &ip.stimuli {
            if intro.id.trim().is_empty() || (intro.title.is_none() && intro.text.is_none() && intro.meta.is_none()) {
                course_sink.error("bad_intro", &intro_file.name, *line, "intro needs a non-empty id and a title, text or meta".to_string());
            }
            if !seen_intro.insert(intro.id.as_str()) {
                course_sink.error("duplicate_intro", &intro_file.name, *line, format!("intro id '{}' is used more than once", intro.id));
            }
            if !intro.id.trim().is_empty() && !entities.contains(intro.id.as_str()) {
                course_sink.warning("intro_unknown_entity", &intro_file.name, *line, format!("intro '{}' matches no item entity", intro.id));
            }
        }
    }

    let mut file_diags: Vec<Vec<Diagnostic>> = Vec::new();
    let mut first_id: HashMap<&str, (&str, usize)> = HashMap::new();
    let mut first_prompt: HashMap<(&str, String, String), (&str, usize)> = HashMap::new();
    for (file, p) in files.iter().zip(&parsed) {
        let name = file.name.as_str();
        let mut sink = Sink { out: Vec::new() };
        for e in &p.errors {
            sink.error("parse_error", name, e.line, e.message.clone());
        }
        for (line, item) in &p.items {
            let line = *line;
            let id = item.id();
            match first_id.get(id) {
                Some((f, l)) => sink.error("duplicate_id", name, line, format!("id '{id}' already used at {f}:{l}")),
                None => {
                    first_id.insert(id, (name, line));
                }
            }
            if !is_valid_id(id) {
                sink.error("bad_id", name, line, format!("id '{id}' must match ^[a-z][a-z0-9]*-[0-9]+$"));
            }
            if let Some(c) = &course {
                if !c.units.iter().any(|u| u.id == item.unit()) {
                    sink.error("unknown_unit", name, line, format!("item '{id}' uses unknown unit '{}'", item.unit()));
                }
                if c.types.as_ref().is_some_and(|ts| !ts.contains(&item.item_type())) {
                    sink.error(
                        "type_not_enabled",
                        name,
                        line,
                        format!("item '{id}' has type '{}' which is not in course.types", type_name(item.item_type())),
                    );
                }
            }
            check_item_body(item, name, line, &mut sink);

            // Validate item speak field
            if let Some(speak_text) = item.speak() {
                if speak_text.is_empty() {
                    sink.error("bad_speech", name, line, "item speak field is empty".to_string());
                }
            }

            // Check for unknown stimulus references
            if let Some(stim_id) = item.stimulus() {
                if !stimulus_map.contains_key(stim_id) {
                    sink.error("unknown_stimulus", name, line, format!("item '{id}' references unknown stimulus '{}'", stim_id));
                }
            }

            // New validation checks for active items
            if !item.is_retired() {
                // Check prompt type mismatch
                check_prompt_type_mismatch(item_prompt(item), item.item_type(), &mut sink, name, line, id);
                
                // Check ambiguous answer
                check_ambiguous_answer(item, &mut sink, name, line);
                
                // Check order blanks mismatch
                check_order_blanks_mismatch(item, &mut sink, name, line);
                
                // Check foreign scripts
                if let Some(ref c) = course {
                    let whitelisted_scripts: HashSet<String> = c.scripts.iter().cloned().collect();
                    let mut has_foreign = false;
                    
                    // Check prompt
                    if has_foreign_script(item_prompt(item), &whitelisted_scripts) {
                        has_foreign = true;
                    }
                    
                    // Check based on item type
                    match item {
                        Item::Choice(c) => {
                            if !has_foreign && c.options.iter().any(|opt| has_foreign_script(opt, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                            if !has_foreign && c.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Gap(g) => {
                            if !has_foreign && g.answers.iter().any(|ans| has_foreign_script(ans, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                            if !has_foreign && g.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Multi(m) => {
                            if !has_foreign && m.options.iter().any(|opt| has_foreign_script(opt, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                            if !has_foreign && m.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Card(c) => {
                            if !has_foreign && has_foreign_script(&c.back, &whitelisted_scripts) {
                                has_foreign = true;
                            }
                            if !has_foreign && c.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Match(m) => {
                            if !has_foreign && m.pairs.iter().any(|p| has_foreign_script(&p.left, &whitelisted_scripts) || has_foreign_script(&p.right, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                            if !has_foreign && m.distractors.iter().any(|d| has_foreign_script(d, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                            if !has_foreign && m.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Order(o) => {
                            if !has_foreign && o.steps.iter().any(|step| has_foreign_script(step, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                            if !has_foreign && o.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Cloze(c) => {
                            if !has_foreign {
                                for part in &c.parts {
                                    match part {
                                        crate::content::ClozePart::Text(t) => {
                                            if has_foreign_script(t, &whitelisted_scripts) {
                                                has_foreign = true;
                                                break;
                                            }
                                        }
                                        crate::content::ClozePart::Blank(alts) => {
                                            if alts.iter().any(|alt| has_foreign_script(alt, &whitelisted_scripts)) {
                                                has_foreign = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            if !has_foreign && c.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                        Item::Numeric(n) => {
                            if !has_foreign && n.explanation.as_ref().is_some_and(|exp| has_foreign_script(exp, &whitelisted_scripts)) {
                                has_foreign = true;
                            }
                        }
                    }
                    
                    if has_foreign {
                        sink.warning("foreign_script", name, line, format!("item '{id}' contains characters from a non-whitelisted script"));
                    }
                }
                
                let item_norm = match item {
                    Item::Gap(g) => g.normalize.as_ref(),
                    Item::Cloze(c) => c.normalize.as_ref(),
                    _ => None,
                };
                let course_norm = course.as_ref().and_then(|c| c.normalize.as_ref());
                let default_norm = Normalize::default();
                let norm_opts = fold_norm(item_norm, course_norm).unwrap_or(&default_norm);
                let key = (type_name(item.item_type()), normalize(item_prompt(item), norm_opts), item_body(item));
                match first_prompt.get(&key) {
                    Some((f, l)) => sink.warning("duplicate_prompt", name, line, format!("item '{id}' repeats the prompt at {f}:{l}")),
                    None => {
                        first_prompt.insert(key, (name, line));
                    }
                }
                check_leak(item, name, line, &mut sink, course_norm, &stimulus_hide_text);
            }
        }
        sink.out.sort_by_key(|d| d.line);
        file_diags.push(sink.out);
    }

    if let Some(c) = &course {
        check_exam_sizes(c, &all, &mut course_sink);
        let used: HashSet<&str> = all.iter().filter(|(_, _, i)| !i.is_retired()).map(|(_, _, i)| i.unit()).collect();
        let mut reported = HashSet::new();
        for unit in &c.units {
            if !used.contains(unit.id.as_str()) && reported.insert(unit.id.as_str()) {
                course_sink.warning("unit_empty", COURSE_FILE, 0, format!("unit '{}' has no active items", unit.id));
            }
        }
        // Check placement: if course.placement is set, at least one included unit must have active items
        if c.placement.is_some() {
            let has_placement_unit_with_items = c.units.iter().any(|u| {
                u.placement != Some(false) && used.contains(u.id.as_str())
            });
            if !has_placement_unit_with_items {
                course_sink.error("bad_placement", COURSE_FILE, 0, "course.placement is set but no unit with placement != false has active items".to_string());
            }
        }
        // Check stimulus groups for consistency
        check_stimulus_groups(&all, &mut course_sink);
        
        // Check entity spans groups
        check_entity_spans_groups(c, &all, &mut course_sink);
        
        check_mixed_entity_scope(c, &all, &mut course_sink);

        // Check bar/extraTags matches
        check_bar_matches(c, &all, &mut course_sink);
    }

    let mut out = course_sink.out;
    out.extend(file_diags.into_iter().flatten());

    if let Some(lock) = lock {
        let present: HashSet<&str> = all.iter().map(|(_, _, i)| i.id()).collect();
        let retired: HashSet<&str> = lock.retired.iter().map(String::as_str).collect();
        let mut found: Vec<(&str, Diagnostic)> = Vec::new();
        for id in lock.ids.iter().filter(|id| !present.contains(id.as_str())) {
            let message = format!("id '{id}' is in ids.lock but missing from the content");
            found.push((id, Diagnostic { severity: Severity::Error, code: "id_removed", file: LOCK_FILE.to_string(), line: 0, message }));
        }
        for (file, line, item) in &all {
            if !item.is_retired() && retired.contains(item.id()) {
                let message = format!("id '{}' was retired in ids.lock and cannot be reused", item.id());
                found.push((item.id(), Diagnostic { severity: Severity::Error, code: "retired_id_reused", file: file.to_string(), line: *line, message }));
            }
            if !item.is_retired() {
                if let Some(locked_type) = lock.types.get(item.id()) {
                    let current_type = type_name(item.item_type());
                    if locked_type.as_str() != current_type {
                        let message = format!(
                            "id '{}' type changed from '{}' to '{}'",
                            item.id(), locked_type, current_type
                        );
                        found.push((item.id(), Diagnostic { severity: Severity::Warning, code: "item_type_changed", file: file.to_string(), line: *line, message }));
                    }
                }
            }
        }
        found.sort_by(|a, b| (a.0, a.1.code, &a.1.file, a.1.line).cmp(&(b.0, b.1.code, &b.1.file, b.1.line)));
        out.extend(found.into_iter().map(|(_, d)| d));
    }
    out
}
