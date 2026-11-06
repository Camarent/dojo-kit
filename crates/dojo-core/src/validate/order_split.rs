//! `order_split_word`: an order step in a Japanese course must be a chunk, not a bare ending or case particle.

use super::{Sink, ValidatorModule};
use crate::content::{Course, Item};

/// Warn for every order step (index >= 1) that is a bare ending or case particle. Only for a `contentLanguage` with a table in `lang/` or in a module.
pub(super) fn check_order_split(item: &Item, course: Option<&Course>, sink: &mut Sink, file: &str, line: usize, modules: &[Box<dyn ValidatorModule>]) {
    let Item::Order(o) = item else { return };
    let Some(language) = course.and_then(|c| c.content_language.as_deref()) else {
        return;
    };
    let Some(is_fragment) = super::lang::fragment_check(language).or_else(|| modules.iter().find_map(|m| m.fragment_check(language))) else {
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
