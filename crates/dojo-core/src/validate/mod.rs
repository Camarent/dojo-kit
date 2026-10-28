use crate::content::{DetailConfig, DetailField, Course, ExamConfig, Item, ItemType, parse_course, parse_items};
use crate::lock::IdLock;
use std::collections::{HashMap, HashSet};

pub use crate::diagnostic::{Diagnostic, Severity};

/// A content file handed to the validator; `name` is the path shown in diagnostics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFile {
    pub name: String,
    pub text: String,
}

mod audio;
mod codes;
mod exam;
mod files;
mod groups;
mod items;
mod course;
mod order_split;
mod quality;
mod speech;
mod dupes;
use course::check_course;
pub use codes::CODES;
pub use files::check_audio_files;

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

    let stimuli_info = files::check_stimuli_file(stimuli, course.as_ref(), &mut course_sink);
    files::check_intros_file(intros, &all, &mut course_sink);

    let ctx = files::ItemCtx { course: course.as_ref(), stimuli: &stimuli_info };
    let file_diags = files::check_item_files(files, &parsed, &ctx);

    if let Some(c) = &course {
        files::check_course_totals(c, &all, &mut course_sink);
    }

    let mut out = course_sink.out;
    out.extend(file_diags.into_iter().flatten());
    files::check_ids_and_lock(&all, lock, &mut out);
    out
}
