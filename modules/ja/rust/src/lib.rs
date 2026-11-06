//! Japanese validator module: `ruby_on_skip_kanji` / `ruby_missing` and the word tables behind `order_split_word`.

mod lang;
mod ruby;

use dojo_core::content::{Course, Item};
use dojo_core::validate::{ItemChecker, Severity, ValidatorModule};

const RUBY_CODES: &[(&str, Severity, &str)] = &[
    ("ruby_on_skip_kanji", Severity::Warning, "a {base|reading} ruby whose kanji the course ruby skip set already hides"),
    ("ruby_missing", Severity::Warning, "a kanji drill item (ruby drillTags/drillUnits) has a kanji in its prompt with no {base|reading} ruby"),
];

/// The `ja` validator module.
pub struct Ja;

impl ValidatorModule for Ja {
    fn id(&self) -> &'static str {
        "ja"
    }

    fn codes(&self) -> &'static [(&'static str, Severity, &'static str)] {
        RUBY_CODES
    }

    fn fragment_check(&self, language: &str) -> Option<fn(&str) -> bool> {
        match language {
            "ja" => Some(lang::is_fragment),
            _ => None,
        }
    }

    fn course_checker(&self, course: &Course, items: &[&Item]) -> Option<Box<dyn ItemChecker>> {
        course.ruby.as_ref()?;
        let skip = ruby::skip_set(course, items.iter().copied());
        Some(Box::new(ruby::RubyChecker { skip }))
    }
}
