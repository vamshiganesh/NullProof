mod utils;
mod hash;
mod imt;

use imt::non_membership::assert_non_membership;

fn main(
    query_value: u64,
    low_leaf_value: u64,
    low_leaf_next_value: u64,
    low_leaf_next_index: u64,
    siblings: [Field; 20],
    path_indices: [bool; 20],
    root: pub Field,
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
}
