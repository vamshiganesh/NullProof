use crate::hash::poseidon::{compute_merkle_root, hash_leaf};
use crate::utils::address::{
    assert_monotonic_pair,
    assert_values_not_equal,
    as_query_value,
};

pub struct IndexedLeaf {
    pub value: Field,
    pub next_value: Field,
    pub next_index: Field,
}

pub fn leaf_from_fields(value: Field, next_value: Field, next_index: Field) -> IndexedLeaf {
    IndexedLeaf {
        value,
        next_value,
        next_index,
    }
}

pub fn commit_leaf(leaf: IndexedLeaf) -> Field {
    hash_leaf(leaf.value, leaf.next_value, leaf.next_index)
}

pub fn assert_valid_leaf_structure(leaf: IndexedLeaf) {
    assert_monotonic_pair(as_query_value(leaf.value), as_query_value(leaf.next_value));
    assert_values_not_equal(as_query_value(leaf.value), as_query_value(leaf.next_index));
}

pub fn compute_leaf_root(leaf: IndexedLeaf, siblings: [Field; 20], path_indices: [u1; 20]) -> Field {
    let leaf_hash = commit_leaf(leaf);
    compute_merkle_root(leaf_hash, siblings, path_indices)
}

pub fn verify_membership(
    leaf: IndexedLeaf,
    siblings: [Field; 20],
    path_indices: [u1; 20],
    expected_root: Field
) -> bool {
    assert_valid_leaf_structure(leaf);
    let computed_root = compute_leaf_root(leaf, siblings, path_indices);
    computed_root == expected_root
}

pub fn assert_membership(
    leaf: IndexedLeaf,
    siblings: [Field; 20],
    path_indices: [u1; 20],
    expected_root: Field
) {
    assert_valid_leaf_structure(leaf);
    let computed_root = compute_leaf_root(leaf, siblings, path_indices);
    assert(computed_root == expected_root);
}