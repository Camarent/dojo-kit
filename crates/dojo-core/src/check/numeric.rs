/// Result of a numeric check; `parsed` is the number read from the input, if any.
#[derive(Debug, Clone, PartialEq)]
pub struct NumericResult {
    pub correct: bool,
    pub parsed: Option<f64>,
}

/// Correct iff |parsed - answer| <= tolerance + 1e-9 * max(1, |answer|); never panics on bad input.
pub fn check_numeric(answer: f64, tolerance: f64, input: &str) -> NumericResult {
    let trimmed = input.trim();
    
    if trimmed.is_empty() {
        return NumericResult { correct: false, parsed: None };
    }
    
    let normalized = normalize_numeric_str(trimmed);
    
    let parsed = match normalized {
        Some(s) => {
            if !is_valid_numeric_string(&s) {
                return NumericResult { correct: false, parsed: None };
            }
            match s.parse::<f64>() {
                Ok(v) if v.is_finite() => Some(v),
                _ => None,
            }
        }
        None => None,
    };
    
    let correct = match parsed {
        Some(v) => {
            let slack = 1e-9 * answer.abs().max(1.0);
            (v - answer).abs() <= tolerance + slack
        }
        None => false,
    };
    
    NumericResult { correct, parsed }
}

fn normalize_numeric_str(s: &str) -> Option<String> {
    if s.contains(char::is_whitespace) {
        return None;
    }
    
    let has_dot = s.contains('.');
    let comma_count = s.chars().filter(|&c| c == ',').count();
    
    if has_dot {
        if comma_count > 0 {
            return None;
        }
        return Some(s.to_string());
    }
    
    if comma_count > 1 {
        return None;
    }
    
    if comma_count == 1 {
        return Some(s.replace(',', "."));
    }
    
    Some(s.to_string())
}

// Contract: every `bytes[i]` read is preceded by `i < n` (or `i >= n ||`) in the same condition or loop.
#[allow(clippy::indexing_slicing)]
fn is_valid_numeric_string(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    
    let mut i = 0;
    let n = bytes.len();
    
    if i < n && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }
    
    let mut has_digit = false;
    let mut has_dot = false;
    
    while i < n && bytes[i] != b'e' && bytes[i] != b'E' {
        if bytes[i] == b'.' {
            if has_dot {
                return false;
            }
            has_dot = true;
            i += 1;
        } else if bytes[i].is_ascii_digit() {
            has_digit = true;
            i += 1;
        } else {
            return false;
        }
    }
    
    if !has_digit {
        return false;
    }
    
    if i < n {
        if bytes[i] == b'e' || bytes[i] == b'E' {
            i += 1;
            if i < n && (bytes[i] == b'+' || bytes[i] == b'-') {
                i += 1;
            }
            if i >= n || !bytes[i].is_ascii_digit() {
                return false;
            }
            while i < n && bytes[i].is_ascii_digit() {
                i += 1;
            }
        }
    }
    
    i == n
}
