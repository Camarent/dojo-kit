//! Pure text helpers for `dojo build`: encoding, hashing, escaping, template filling.

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
use serde_json::Value;

/// Standard base64 with padding.
pub fn base64(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], chunk.get(1).copied().unwrap_or(0), chunk.get(2).copied().unwrap_or(0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(char::from(B64[((n >> (18 - 6 * i)) & 63) as usize]));
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// FNV-1a 64-bit hash.
pub fn fnv1a64(data: &[u8]) -> u64 {
    data.iter().fold(0xcbf2_9ce4_8422_2325, |h, &b| (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3))
}

/// Escapes text for HTML element content and attribute values.
pub fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// Rewrites every case-insensitive `</script` to `<\/script`, and every `<!--` followed
/// later by a case-insensitive `<script` to `<\!--`; other `<!--` stay untouched.
pub fn escape_script_text(s: &str) -> String {
    let s = escape_ci(s, "</script", "<\\/");
    let lower = s.to_ascii_lowercase();
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    for (i, _) in lower.match_indices("<!--") {
        if lower[i + 4..].contains("<script") {
            out.push_str(&s[last..i]);
            out.push_str("<\\!");
            last = i + 2;
        }
    }
    out.push_str(&s[last..]);
    out
}

/// Rewrites every case-insensitive `</style` in CSS text to `<\/style`.
pub fn escape_style_text(s: &str) -> String {
    escape_ci(s, "</style", "<\\/")
}

/// Replaces the first two bytes of each case-insensitive match of `pat` with `rep`.
fn escape_ci(s: &str, pat: &str, rep: &str) -> String {
    let lower = s.to_ascii_lowercase();
    let consumed = 2;
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    for (i, _) in lower.match_indices(pat) {
        out.push_str(&s[last..i]);
        out.push_str(rep);
        last = i + consumed;
    }
    out.push_str(&s[last..]);
    out
}

/// `<script>` element holding `text`, with `</script` escaped.
pub fn script_tag(text: &str) -> String {
    format!("<script>{}</script>", escape_script_text(text))
}

/// Compact JSON safe inside a `<script>` element: `</` becomes `<\/`, U+2028/U+2029 become escapes.
pub fn json_for_script(v: &Value) -> String {
    let s = serde_json::to_string(v).unwrap_or_default();
    s.replace("</", "<\\/").replace("<!--", "<\\!--").replace('\u{2028}', "\\u2028").replace('\u{2029}', "\\u2029")
}

/// HTML comment containing `texts`, with every `--` sequence broken.
pub fn license_comment(texts: &[String]) -> String {
    let mut body = texts.join("\n\n");
    while body.contains("--") {
        body = body.replace("--", "- -");
    }
    format!("<!--\n{body}\n-->")
}

/// Replaces each marker (which must occur exactly once in `template`) by its value, in a single pass.
pub fn fill_template(template: &str, parts: &[(&str, String)]) -> Result<String, String> {
    let mut spots: Vec<(usize, usize, &str)> = Vec::new();
    for (marker, value) in parts {
        let found: Vec<usize> = template.match_indices(marker).map(|(i, _)| i).collect();
        match found.as_slice() {
            [i] => spots.push((*i, marker.len(), value.as_str())),
            [] => return Err(format!("template marker {marker} is missing")),
            _ => return Err(format!("template marker {marker} occurs {} times", found.len())),
        }
    }
    spots.sort_by_key(|s| s.0);
    let mut out = String::with_capacity(template.len());
    let mut last = 0;
    for (i, len, value) in spots {
        out.push_str(&template[last..i]);
        out.push_str(value);
        last = i + len;
    }
    out.push_str(&template[last..]);
    Ok(out)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[0, 0x61, 0x73, 0x6d, 0xff, 0xfe]), "AGFzbf/+");
    }

    #[test]
    fn fnv_vectors() {
        assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a64(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a64(b"foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn script_escaping() {
        assert_eq!(script_tag("a</script>b</SCRIPT >"), "<script>a<\\/script>b<\\/SCRIPT ></script>");
        assert_eq!(script_tag("<!-- x <ScRipt"), "<script><\\!-- x <ScRipt</script>");
        assert_eq!(script_tag("/<!--/u; a<!--b"), "<script>/<!--/u; a<!--b</script>");
        assert_eq!(escape_style_text("a</STYLE >b</style>"), "a<\\/STYLE >b<\\/style>");
        assert_eq!(html_escape("<a & \"b\">"), "&lt;a &amp; &quot;b&quot;&gt;");
        let v = serde_json::json!({"k": "</b>\u{2028}"});
        assert_eq!(json_for_script(&v), "{\"k\":\"<\\/b>\\u2028\"}");
        let v2 = serde_json::json!({"k": "<!--"});
        assert_eq!(json_for_script(&v2), "{\"k\":\"<\\!--\"}");
    }

    #[test]
    fn license_dashes_broken() {
        let c = license_comment(&["a --- b".to_string()]);
        assert!(!c.trim_start_matches("<!--").trim_end_matches("-->").contains("--"));
    }

    #[test]
    fn markers_replaced_once() {
        let t = "<A>x<B>";
        let out = fill_template(t, &[("<A>", "1<B>".to_string()), ("<B>", "2".to_string())]).unwrap();
        assert_eq!(out, "1<B>x2");
        assert!(fill_template("<A>", &[("<A>", String::new()), ("<B>", String::new())]).unwrap_err().contains("<B>"));
        assert!(fill_template("<A><A>", &[("<A>", String::new())]).unwrap_err().contains("2 times"));
    }
}
