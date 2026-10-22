/// Checks if a course id matches `^[a-z0-9][a-z0-9_-]{0,47}$`:
/// length 1..=48, first character `[a-z0-9]`, rest `[a-z0-9_-]`.
pub fn is_valid_course_id(id: &str) -> bool {
    let len = id.len();
    if len == 0 || len > 48 {
        return false;
    }
    let mut chars = id.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    first_ok && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_invalid() {
        assert!(!is_valid_course_id(""));
    }

    #[test]
    fn too_long_is_invalid() {
        let id = "a".repeat(49);
        assert!(!is_valid_course_id(&id));
    }

    #[test]
    fn max_length_is_valid() {
        let id = "a".repeat(48);
        assert!(is_valid_course_id(&id));
    }

    #[test]
    fn first_char_must_be_alphanumeric() {
        assert!(!is_valid_course_id("-abc"));
        assert!(!is_valid_course_id("_abc"));
        assert!(is_valid_course_id("a-bc"));
        assert!(is_valid_course_id("0-bc"));
    }

    #[test]
    fn rest_can_be_alphanumeric_hyphen_underscore() {
        assert!(is_valid_course_id("a"));
        assert!(is_valid_course_id("abc"));
        assert!(is_valid_course_id("a-b"));
        assert!(is_valid_course_id("a_b"));
        assert!(is_valid_course_id("a-_"));
        assert!(is_valid_course_id("0-1"));
        assert!(!is_valid_course_id("a b"));
        assert!(!is_valid_course_id("a.b"));
    }

    #[test]
    fn single_char_valid() {
        assert!(is_valid_course_id("a"));
        assert!(is_valid_course_id("0"));
        assert!(!is_valid_course_id("-"));
        assert!(!is_valid_course_id("_"));
    }

    #[test]
    fn demo_is_valid() {
        assert!(is_valid_course_id("demo"));
    }

    #[test]
    fn mixed_valid() {
        assert!(is_valid_course_id("my-course_123"));
    }

    #[test]
    fn upper_case_invalid() {
        assert!(!is_valid_course_id("Demo"));
        assert!(!is_valid_course_id("MyCourse"));
    }
}
