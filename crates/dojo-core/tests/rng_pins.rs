use dojo_core::groups::shuffle_entities;
use dojo_core::exam::splitmix64;

fn take5(seed: u64) -> Vec<u64> {
    let mut s = seed;
    (0..5).map(|_| splitmix64(&mut s)).collect()
}

#[test]
fn splitmix64_pins() {
    assert_eq!(take5(0), [16294208416658607535, 7960286522194355700, 487617019471545679, 17909611376780542444, 1961750202426094747]);
    assert_eq!(take5(1), [10451216379200822465, 13757245211066428519, 17911839290282890590, 8196980753821780235, 8195237237126968761]);
    assert_eq!(take5(u64::MAX), [16490336266968443936, 16834447057089888969, 4048727598324417001, 7862637804313477842, 13015481187462834606]);
}

#[test]
fn shuffle_entities_pin() {
    let mut v: Vec<String> = "abcdef".chars().map(|c| c.to_string()).collect();
    shuffle_entities(&mut v, "c", "d", "g");
    assert_eq!(v.concat(), "bcaedf");
}
