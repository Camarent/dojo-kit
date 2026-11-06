//! Extension point for language or course-specific validator rules.
//!
//! A module adds codes, word lists and checks on top of the built-in validator.
//! Every method except `id` has a no-op default, so a module overrides only what it needs.
//! Modules are passed to [`super::validate_with_modules`]; the built-in rules run regardless.

use super::{Diagnostic, Severity};
use crate::content::{Course, Item, ItemType};

/// A validator extension. Object-safe: the validator holds `Box<dyn ValidatorModule>`.
pub trait ValidatorModule {
    /// Stable module name, for diagnostics and tests.
    fn id(&self) -> &'static str;

    /// Codes this module can emit: `(code, severity, one-line description)`.
    fn codes(&self) -> &'static [(&'static str, Severity, &'static str)] {
        &[]
    }

    /// Word-fragment test for order steps of `language` (the course `contentLanguage`).
    /// `None` when the module has no table for that language.
    fn fragment_check(&self, _language: &str) -> Option<fn(&str) -> bool> {
        None
    }

    /// Extra prompt trigger words: a prompt containing a word (lowercase match) is a
    /// `prompt_type_mismatch` for the listed item types.
    fn prompt_triggers(&self) -> &'static [(&'static str, &'static [ItemType])] {
        &[]
    }

    /// Extra words that mark a gap prompt as disambiguated (lowercase match), like "any" or "one of".
    fn disambiguation_words(&self) -> &'static [&'static str] {
        &[]
    }

    /// Course-wide checker run on every active item. `None` when the module has nothing to check.
    fn course_checker(&self, _course: &Course, _items: &[&Item]) -> Option<Box<dyn ItemChecker>> {
        None
    }
}

/// Per-item check returned by [`ValidatorModule::course_checker`].
pub trait ItemChecker {
    /// Findings for one active item at `file:line`. `course` is `None` when `course.json` did not parse.
    fn check(&self, item: &Item, course: Option<&Course>, file: &str, line: usize) -> Vec<Diagnostic>;
}
