//! `slug::is_valid_course_id` agrees with the former validate.rs body on 30 samples.

use dojo_core::slug::is_valid_course_id as slug_is_valid;

fn old_is_valid_course_id(id: &str) -> bool {
    let len = id.len();
    if len == 0 || len > 48 {
        return false;
    }
    let mut chars = id.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    first_ok && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

#[test]
fn parity_30_samples() {
    let samples = [
        // Valid ids
        ("demo", true),
        ("my-course", true),
        ("a", true),
        ("0", true),
        ("a-b", true),
        ("a_b", true),
        ("my-course_123", true),
        ("a1-b2-c3", true),
        ("course", true),
        ("test_123", true),
        // Empty
        ("", false),
        // Uppercase
        ("Demo", false),
        ("MyCourse", false),
        ("ABC", false),
        // 48 chars (max valid)
        (&"a".repeat(48), true),
        // 49 chars (too long)
        (&"a".repeat(49), false),
        // Leading dash
        ("-abc", false),
        ("-course", false),
        // Leading underscore
        ("_abc", false),
        ("_course", false),
        // Spaces (invalid)
        ("a b", false),
        ("my course", false),
        // Dots (invalid)
        ("a.b", false),
        ("my.course", false),
        // Single hyphen/underscore
        ("-", false),
        ("_", false),
        // Mixed valid
        ("a-b_c", true),
        ("0-1_2", true),
        ("a-", true),
        ("é", false),
    ];

    for (input, expected) in samples {
        let old_result = old_is_valid_course_id(input);
        let new_result = slug_is_valid(input);
        
        assert_eq!(
            old_result, expected,
            "Old implementation disagrees with expected for '{input}'"
        );
        assert_eq!(
            new_result, expected,
            "New implementation disagrees with expected for '{input}'"
        );
        assert_eq!(
            old_result, new_result,
            "Parity failure for '{input}': old={}, new={}",
            old_result, new_result
        );
    }
}
