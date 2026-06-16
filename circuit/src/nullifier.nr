use crate::hash::poseidon::hash_triple;

/// Bind the public nullifier to private witness data.
/// nullifier = hash_triple(query_value, root, validity_epoch)
pub fn assert_nullifier_binding(
    query_value: u64,
    validity_epoch: u64,
    root: Field,
    nullifier: Field,
) {
    let expected = hash_triple(
        query_value as Field,
        root,
        validity_epoch as Field,
    );
    assert(expected == nullifier);
}

#[test]
fn test_nullifier_binding_accepts_valid() {
    let query_value: u64 = 12345;
    let epoch: u64 = 42;
    let root: Field = 999;
    let nullifier = hash_triple(query_value as Field, root, epoch as Field);
    assert_nullifier_binding(query_value, epoch, root, nullifier);
}

#[test(should_fail)]
fn test_nullifier_binding_rejects_wrong_nullifier() {
    let query_value: u64 = 12345;
    let epoch: u64 = 42;
    let root: Field = 999;
    assert_nullifier_binding(query_value, epoch, root, 0);
}
