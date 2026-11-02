use super::Sink;
use crate::content::{Speak, SpeechConfig};

pub(super) const INPUT_SCRIPTS: &[&str] = &["non-latin", "han", "hiragana", "katakana", "cyrillic", "greek", "arabic", "hebrew", "hangul", "devanagari", "thai"];

/// Structural regex check (no regex engine in core): empty, dangling escape, unbalanced groups or classes, quantifier with nothing to repeat.
pub(super) fn regex_problem(pat: &str) -> Option<String> {
    if pat.is_empty() {
        return Some("empty".to_string());
    }
    let mut depth = 0i32;
    let mut in_class = false;
    let mut can_repeat = false;
    let mut prev = ' ';
    let mut chars = pat.chars();
    while let Some(c) = chars.next() {
        let before = prev;
        prev = c;
        if c == '\\' {
            if chars.next().is_none() {
                return Some("dangling backslash".to_string());
            }
            can_repeat = true;
            continue;
        }
        if in_class {
            if c == ']' {
                in_class = false;
                can_repeat = true;
            }
            continue;
        }
        match c {
            '[' => in_class = true,
            '(' => { depth += 1; can_repeat = false; }
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return Some("unmatched ')'".to_string());
                }
                can_repeat = true;
            }
            '|' => can_repeat = false,
            '*' | '+' | '?' => {
                if !can_repeat && !(c == '?' && before == '(') {
                    return Some(format!("nothing to repeat before '{c}'"));
                }
                if c != '?' { can_repeat = true; }
            }
            _ => can_repeat = true,
        }
    }
    if in_class {
        return Some("unterminated '['".to_string());
    }
    if depth != 0 {
        return Some("unmatched '('".to_string());
    }
    None
}

pub(super) fn validate_speech_config(speech: &SpeechConfig, file: &str, sink: &mut Sink) {
    if let Some(rate) = speech.rate
        && !(0.1..=10.0).contains(&rate) {
            sink.error("bad_speech", file, 0, format!("speech.rate {} is outside 0.1..10", rate));
        }
    if let Some(voices) = &speech.voices {
        for (label, voice) in voices {
            if label.is_empty() {
                sink.error("bad_speech", file, 0, "speech.voices has an empty label".to_string());
            }
            if voice.match_.as_deref() == Some("") {
                sink.error("bad_speech", file, 0, format!("speech.voices.{}.match is empty", label));
            }
            for (i, pat) in voice.prefer.iter().flatten().enumerate() {
                if let Some(why) = regex_problem(pat) {
                    sink.error("bad_voice_pattern", file, 0, format!("speech.voices.{}.prefer[{}] '{}': {}", label, i, pat, why));
                }
            }
            if let Some(pitch) = voice.pitch
                && (pitch < 0.0 || pitch > 2.0) {
                    sink.error("bad_speech", file, 0, format!("speech.voices.{}.pitch {} is outside 0..2", label, pitch));
                }
            if let Some(rate) = voice.rate
                && !(0.1..=10.0).contains(&rate) {
                    sink.error("bad_speech", file, 0, format!("speech.voices.{}.rate {} is outside 0.1..10", label, rate));
                }
        }
    }
}

pub(super) fn validate_speak(speak: &Speak, voices: Option<&std::collections::BTreeMap<String, crate::content::VoiceConfig>>, file: &str, stim_line: usize, sink: &mut Sink) {
    if speak.lines.is_empty() {
        sink.error("bad_speech", file, stim_line, "speak has no lines".to_string());
    }
    for (idx, speak_line) in speak.lines.iter().enumerate() {
        if speak_line.text.is_empty() {
            sink.error("bad_speech", file, stim_line, format!("speak.lines[{}] has empty text", idx));
        }
        if let Some(voice_label) = &speak_line.voice {
            if voice_label.is_empty() {
                sink.error("bad_speech", file, stim_line, format!("speak.lines[{}] has empty voice label", idx));
            } else if let Some(voices_map) = voices {
                if !voices_map.contains_key(voice_label) {
                    sink.error("unknown_voice", file, stim_line, format!("speak.lines[{}] references unknown voice '{}'", idx, voice_label));
                }
            } else {
                // If voices is not defined, any named voice is unknown
                sink.error("unknown_voice", file, stim_line, format!("speak.lines[{}] references unknown voice '{}'", idx, voice_label));
            }
        }
    }
}
