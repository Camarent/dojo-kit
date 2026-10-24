//! Adaptive per-question timer (contract 12.2). Inputs are normalised like the JS reference.

const FAST_RATIO: f64 = 0.8;

fn round4(x: f64) -> f64 {
    (x * 1e4).round() / 1e4
}

fn finite(v: Option<f64>) -> Option<f64> {
    v.filter(|x| x.is_finite())
}

fn norm_scale(v: Option<f64>) -> f64 {
    finite(v).map_or(1.0, |x| x.clamp(0.5, 2.0))
}

fn norm_streak(v: Option<f64>) -> f64 {
    finite(v).filter(|x| *x >= 0.0).map_or(0.0, f64::floor)
}

/// Raw (unnormalised) timer inputs.
#[derive(Default, Clone, Copy)]
pub struct TimerIn {
    pub scale: Option<f64>,
    pub streak: Option<f64>,
    pub answer_ms: Option<f64>,
    pub limit_ms: Option<f64>,
}

/// Outcome of one timed answer: `(scale, streak)` after normalising the stored values.
/// Only `correct == true` counts as correct; `fast` means `answer_ms <= 0.8 * limit_ms`.
pub fn timer_next(input: &TimerIn, correct: bool) -> (f64, f64) {
    let scale = norm_scale(input.scale);
    let streak = norm_streak(input.streak);
    if !correct {
        return (round4((scale * 1.2).min(2.0)), 0.0);
    }
    let fast = matches!((finite(input.answer_ms), finite(input.limit_ms)), (Some(a), Some(l)) if a <= FAST_RATIO * l);
    if !fast {
        return (round4(scale), 0.0);
    }
    let n = streak + 1.0;
    if n >= 3.0 {
        return (round4((scale * 0.9).max(0.5)), 0.0);
    }
    (round4(scale), n)
}

/// Question time limit in ms: `clamp(round(base * scale), 1500, 60000)`.
pub fn timer_limit(base_ms: Option<f64>, scale: Option<f64>) -> f64 {
    let base = finite(base_ms).unwrap_or(8000.0);
    (base * norm_scale(scale)).round().clamp(1500.0, 60000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrong_grows_and_caps() {
        assert_eq!(timer_next(&TimerIn { scale: Some(1.0), streak: Some(2.0), ..Default::default() }, false), (1.2, 0.0));
        assert_eq!(timer_next(&TimerIn { scale: Some(1.9), ..Default::default() }, false), (2.0, 0.0));
    }

    #[test]
    fn third_fast_correct_shrinks() {
        assert_eq!(timer_next(&TimerIn { scale: Some(1.2), streak: Some(2.0), answer_ms: Some(10.0), limit_ms: Some(100.0) }, true), (1.08, 0.0));
    }

    #[test]
    fn missing_times_are_not_fast() {
        assert_eq!(timer_next(&TimerIn { scale: Some(1.0), streak: Some(2.0), limit_ms: Some(100.0), ..Default::default() }, true), (1.0, 0.0));
    }

    #[test]
    fn limit_clamps_and_defaults() {
        assert_eq!(timer_limit(Some(8000.0), Some(1.2)), 9600.0);
        assert_eq!(timer_limit(None, None), 8000.0);
        assert_eq!(timer_limit(Some(10.0), Some(1.0)), 1500.0);
    }
}
