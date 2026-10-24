//! errorWeighted scheduler: deterministic weighted sampling (CONTRACT 12.4).
use crate::rng::splitmix64;
use serde_json::{Map, Value};
use std::collections::HashSet;

const DAY_MS: f64 = 86_400_000.0;
const WORST_MAX: usize = 5;
const WORST_MIN_E: f64 = 0.3;
/// Box factors, a table because `powf` may differ by 1 ulp across platforms.
pub const BOXF: [f64; 6] = [1.0, std::f64::consts::FRAC_1_SQRT_2, 0.5, 0.35355339059327373, 0.25, 0.17677669529663687];

pub struct WeightedIn<'a> {
    pub ids: Vec<&'a str>,
    pub records: Option<&'a Map<String, Value>>,
    pub now: f64,
    pub seed: &'a str,
    pub limit: f64,
    pub new_allowance: f64,
}

/// `seed` must be 1..=20 ASCII digits and fit in u64.
pub fn parse_seed(seed: &str) -> Result<u64, String> {
    if seed.is_empty() || seed.len() > 20 || !seed.bytes().all(|b| b.is_ascii_digit()) {
        return Err("`seed` must be a decimal u64 string".into());
    }
    seed.parse().map_err(|_| "`seed` must be a decimal u64 string".to_string())
}

/// Finite number -> max(0, floor(x)), else 0.
fn count(x: f64) -> usize {
    if x.is_finite() { x.floor().max(0.0) as usize } else { 0 }
}

fn e_of(rec: &Map<String, Value>) -> f64 {
    match rec.get("e").and_then(Value::as_f64) {
        Some(e) => e.clamp(0.0, 1.0),
        None => 0.5,
    }
}

/// Unrounded weight; `None` is a new item.
pub fn weight(rec: Option<&Map<String, Value>>, now: f64) -> f64 {
    let (e, b, stale) = match rec {
        None => (0.5, 0, 7.0),
        Some(r) => {
            let b = match r.get("s").and_then(Value::as_f64) {
                Some(s) if s > 0.0 => s.floor().min(5.0) as usize,
                _ => 0,
            };
            let stale = match r.get("last").and_then(Value::as_f64) {
                Some(l) => ((now - l) / DAY_MS).floor().clamp(0.0, 7.0),
                None => 7.0,
            };
            (e_of(r), b, stale)
        }
    };
    ((0.15 + e) * BOXF[b]) * (1.0 + ((0.5 * stale) / 7.0))
}

/// splitmix64 output -> r in [0, 1).
pub fn unit_random(v: u64) -> f64 {
    (v >> 11) as f64 / 9007199254740992.0
}

/// First index whose running sum exceeds `r * total`; the last index if none.
pub fn draw_index(weights: &[f64], r: f64) -> usize {
    let total = weights.iter().fold(0.0, |a, w| a + w);
    let target = r * total;
    let mut run = 0.0;
    for (i, w) in weights.iter().enumerate() {
        run += w;
        if run > target {
            return i;
        }
    }
    weights.len().saturating_sub(1)
}

fn record_of<'a>(records: Option<&'a Map<String, Value>>, id: &str) -> Option<&'a Map<String, Value>> {
    records?.get(id)?.as_object()
}

fn worst_first<'a>(cands: &[&'a str], records: Option<&Map<String, Value>>) -> Vec<&'a str> {
    let mut worst: Vec<(f64, &str)> = cands
        .iter()
        .filter_map(|id| {
            let rec = record_of(records, id)?;
            rec.get("e").and_then(Value::as_f64)?;
            let e = e_of(rec);
            (e >= WORST_MIN_E).then_some((e, *id))
        })
        .collect();
    worst.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    worst.into_iter().take(WORST_MAX).map(|x| x.1).collect()
}

fn sample<'a>(mut pool: Vec<&'a str>, mut weights: Vec<f64>, mut state: u64, want: usize) -> Vec<&'a str> {
    let mut out = Vec::new();
    while out.len() < want && !pool.is_empty() {
        let at = draw_index(&weights, unit_random(splitmix64(&mut state)));
        out.push(pool.remove(at));
        weights.remove(at);
    }
    out
}

fn candidates<'a>(input: &WeightedIn<'a>) -> Vec<&'a str> {
    let mut seen = HashSet::new();
    let mut fresh = count(input.new_allowance);
    let mut out = Vec::new();
    for id in input.ids.iter().filter(|id| seen.insert(**id)) {
        if record_of(input.records, id).is_some() {
            out.push(*id);
        } else if fresh > 0 {
            fresh -= 1;
            out.push(*id);
        }
    }
    out
}

/// Ordered ids for an errorWeighted session; `Err` for a bad seed.
pub fn weighted_queue<'a>(input: &WeightedIn<'a>) -> Result<Vec<&'a str>, String> {
    let state = parse_seed(input.seed)?;
    let limit = count(input.limit);
    let cands = candidates(input);
    let mut head = worst_first(&cands, input.records);
    head.truncate(limit);
    let pool: Vec<&str> = cands.iter().copied().filter(|id| !head.contains(id)).collect();
    let weights = pool.iter().map(|id| weight(record_of(input.records, id), input.now)).collect();
    let rest = limit - head.len();
    head.extend(sample(pool, weights, state, rest));
    Ok(head)
}
