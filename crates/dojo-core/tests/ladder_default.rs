use dojo_core::srs::{DAY, DEFAULT_LADDER};
mod common;
use common::*;

#[test]
fn default_ladder_has_five_steps() {
    assert_eq!(DEFAULT_LADDER, [0, DAY, 5 * DAY, 10 * DAY, 30 * DAY]);
}

#[test]
fn bad_ladder_cases_fire() {
    for ladder in ["[0]", "[10,20]", "[0,5,5]", "[0,5,3]", "[0,1.5]"] {
        let course = with_course(&format!(r#""srs":{{"ladder":{ladder}}}"#));
        fires(&course, &[CHOICE], "bad_ladder");
    }
}

#[test]
fn good_ladder_is_clean() {
    let course = with_course(r#""srs":{"ladder":[0,5,10]}"#);
    assert_eq!(run(&course, &[CHOICE]), vec![]);
}
