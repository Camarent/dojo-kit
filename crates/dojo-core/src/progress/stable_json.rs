use serde_json::Value;

use super::{json_number, utf16_cmp};

fn write_stable(v: &Value, out: &mut String) {
    match v {
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| utf16_cmp(a.0, b.0));
            out.push('{');
            for (i, (key, value)) in entries.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String(key.clone()).to_string());
                out.push(':');
                write_stable(value, out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_stable(item, out);
            }
            out.push(']');
        }
        Value::Number(n) if !n.is_i64() && !n.is_u64() => out.push_str(&json_number(n.as_f64().unwrap_or(0.0)).to_string()),
        other => out.push_str(&other.to_string()),
    }
}

/// Compact JSON text with object keys sorted recursively and whole numbers printed without a fraction.
pub fn stable_json(v: &Value) -> String {
    let mut out = String::new();
    write_stable(v, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_json_prints_whole_floats_without_fraction() {
        let doc: Value = serde_json::from_str(r#"{"b":2.0,"a":[1.5,3.0]}"#).unwrap();
        assert_eq!(stable_json(&doc), r#"{"a":[1.5,3],"b":2}"#);
    }
}
