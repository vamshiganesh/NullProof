use crate::imt::membership::{
    assert_membership,
    leaf_from_fields,
    verify_membership,
    IndexedLeaf,
};
use crate::utils::address::{
    as_query_value,
    assert_value_is_strictly_between,
};

pub fn build_low_leaf(
    low_leaf_value: u64,
    low_leaf_next_value: u64,
    low_leaf_next_index: u64
) -> IndexedLeaf {
    leaf_from_fields(low_leaf_value, low_leaf_next_value, low_leaf_next_index)
}

pub fn assert_non_membership(
    query_value: u64,
    low_leaf_value: u64,
    low_leaf_next_value: u64,
    low_leaf_next_index: u64,
    siblings: [Field; 20],
    path_indices: [u1; 20],
    root: Field
) {
    let low_leaf = build_low_leaf(
        low_leaf_value,
        low_leaf_next_value,
        low_leaf_next_index,
    );

    assert_membership(low_leaf, siblings, path_indices, root);

    assert_value_is_strictly_between(
        as_query_value(query_value),
        as_query_value(low_leaf.value),
        as_query_value(low_leaf.next_value),
    );
}

pub fn verify_non_membership(
    query_value: u64,
    low_leaf_value: u64,
    low_leaf_next_value: u64,
    low_leaf_next_index: u64,
    siblings: [Field; 20],
    path_indices: [u1; 20],
    root: Field
) -> bool {
    let low_leaf = build_low_leaf(
        low_leaf_value,
        low_leaf_next_value,
        low_leaf_next_index,
    );

    let membership_holds = verify_membership(
        low_leaf,
        siblings,
        path_indices,
        root,
    );

    let interval_holds =
        (query_value > low_leaf.value) & (query_value < low_leaf.next_value);

    membership_holds & interval_holds
}
