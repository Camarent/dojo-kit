//! Per-language word tables used by generic checks, looked up by `contentLanguage`.

mod ja;

/// Returns the "is a bare word fragment" predicate for a content language, or `None` when no table exists.
pub(super) fn fragment_check(language: &str) -> Option<fn(&str) -> bool> {
    match language {
        "ja" => Some(ja::is_fragment),
        _ => None,
    }
}
