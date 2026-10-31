use super::*;
use crate::check;

pub(super) fn check_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "normalize" => Ok(Value::String(check::normalize(text(a, "text")?, &normalize_opts(a)?))),
        "checkGap" => {
            let answers = strings(field(a, "answers")?, "answers")?;
            Ok(Value::Bool(check::check_gap(&answers, text(a, "input")?, &normalize_opts(a)?)))
        }
        "gapVerdict" => {
            let answers = strings(field(a, "answers")?, "answers")?;
            let retry = opt_strings(a, "retry")?.unwrap_or_default();
            let verdict = check::gap_verdict(&answers, &retry, text(a, "input")?, &normalize_opts(a)?);
            Ok(Value::String(verdict.to_string()))
        }
        "checkChoice" => {
            let (answer, selected) = (int(a, "answer")?, int(a, "selected")?);
            Ok(Value::Bool(answer >= 0 && answer == selected))
        }
        "checkMulti" => Ok(Value::Bool(check::check_multi(&indices(field(a, "correct")?, "correct")?, &indices(field(a, "selected")?, "selected")?))),
        "checkMatch" => {
            let r = check::check_match(count(a, "pairCount")?, &indices(field(a, "mapping")?, "mapping")?);
            Ok(json!({ "correct": r.correct, "wrong": r.wrong }))
        }
        "checkOrder" => {
            let alt = match a.get("altOrders") {
                None | Some(Value::Null) => vec![],
                Some(v) => v
                    .as_array()
                    .ok_or_else(|| bad("`altOrders` must be an array of integer arrays"))?
                    .iter()
                    .map(|o| indices(o, "altOrders"))
                    .collect::<Result<Vec<_>, _>>()?,
            };
            let r = check::check_order(count(a, "stepCount")?, &indices(field(a, "sequence")?, "sequence")?, &alt);
            Ok(json!({ "correct": r.correct, "firstWrong": r.first_wrong, "matched": r.matched }))
        }
        "checkCloze" => {
            let blanks = field(a, "blanks")?
                .as_array()
                .ok_or_else(|| bad("`blanks` must be an array of string arrays"))?
                .iter()
                .map(|b| strings(b, "blanks"))
                .collect::<Result<Vec<_>, _>>()?;
            let r = check::check_cloze(&blanks, &strings(field(a, "inputs")?, "inputs")?, &normalize_opts(a)?);
            Ok(json!({ "correct": r.correct, "results": r.results }))
        }
        "checkNumeric" => {
            let answer = field(a, "answer")?.as_f64().ok_or_else(|| bad("`answer` must be a number"))?;
            let tolerance = match a.get("tolerance") {
                None | Some(Value::Null) => 0.0,
                Some(t) => t.as_f64().ok_or_else(|| bad("`tolerance` must be a number"))?,
            };
            let r = check::check_numeric(answer, tolerance, text(a, "input")?);
            Ok(json!({ "correct": r.correct, "parsed": r.parsed }))
        }
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

