mod utils;
mod hash;
mod imt;
mod nullifier;

use imt::non_membership::assert_non_membership;
use nullifier::assert_nullifier_binding;

fn main(
    query_value: u64,
    low_leaf_value: u64,
    low_leaf_next_value: u64,
    low_leaf_next_index: u64,
    siblings: [Field; 20],
    path_indices: [bool; 20],
    validity_epoch: u64,
    root: pub Field,
    nullifier: pub Field,
) {
    assert_non_membership(
        query_value,
        low_leaf_value,
        low_leaf_next_value,
        low_leaf_next_index,
        siblings,
        path_indices,
        root,
    );

    assert_nullifier_binding(query_value, validity_epoch, root, nullifier);
}
