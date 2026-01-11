mod utils {
    mod address;
}

mod hash {
    mod poseidon;
}

mod imt {
    mod membership;
    mod non_membership;
}

use crate::imt::non_membership::assert_non_membership;

fn main(
    query_value: Field,
    low_leaf_value: Field,
    low_leaf_next_value: Field,
    low_leaf_next_index: Field,
    siblings: [Field; 20],
    path_indices: [u1; 20],
    pub root: Field,
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