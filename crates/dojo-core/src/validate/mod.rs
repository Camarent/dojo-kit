use crate::check::{Normalize, normalize};
use crate::content::{DetailConfig, DetailField, ClozePart, Course, ExamConfig, Item, ItemType, parse_course, parse_items, parse_stimuli, parse_intros};
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

mod codes;
mod exam;
mod groups;
mod course;
mod quality;
mod speech;
use course::check_course;
use quality::*;
use speech::*;
use groups::{check_bar_matches, check_entity_spans_groups, check_mixed_entity_scope};
pub use codes::CODES;

const MAX_PROMPT_CHARS: usize = 600;
const MIN_LEAK_CHARS: usize = 3;
const COURSE_FILE: &str = "course.json";
const LOCK_FILE: &str = "ids.lock";

fn parse_type(name: &str) -> Option<ItemType> {
    ItemType::ALL.into_iter().find(|t| t.as_str() == name)
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

pub use crate::slug::is_valid_course_id;

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
                        format!("item '{id}' has type '{}' which is not in course.types", item.item_type().as_str()),
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
                let key = (item.item_type().as_str(), normalize(item_prompt(item), norm_opts), item_body(item));
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
        exam::check_exam_sizes(c, &all, &mut course_sink);
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

    out.extend(crate::supersedes::check_supersedes(&all, lock));

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
                    let current_type = item.item_type().as_str();
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
