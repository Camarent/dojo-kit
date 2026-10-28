//! `order_split_word`: an order step in a Japanese course must be a chunk, not a bare ending or case particle.

use super::Sink;
use crate::content::{Course, Item};

/// Warn for every order step (index >= 1) that is a bare ending or case particle. Only for a `contentLanguage` with a table in `lang/`.
pub(super) fn check_order_split(item: &Item, course: Option<&Course>, sink: &mut Sink, file: &str, line: usize) {
    let Item::Order(o) = item else { return };
    let Some(is_fragment) = course.and_then(|c| c.content_language.as_deref()).and_then(super::lang::fragment_check) else {
        return;
    };
    for (k, step) in o.steps.iter().enumerate().skip(1) {
        if is_fragment(step.trim()) {
            sink.warning(
                "order_split_word",
                file,
                line,
                format!("item '{}' step {} '{}' is a word fragment; join it with its word", o.id, k + 1, step),
            );
        }
    }
}
