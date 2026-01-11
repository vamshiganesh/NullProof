use std::hash::poseidon2;

pub fn hash_pair(left: Field, right: Field) -> Field {
    poseidon2::Poseidon2::hash([left, right])
}

pub fn hash_leaf(value: Field, next_value: Field, next_index: Field) -> Field {
    poseidon2::Poseidon2::hash([value, next_value, next_index])
}

pub fn hash_triple(a: Field, b: Field, c: Field) -> Field {
    poseidon2::Poseidon2::hash([a, b, c])
}

pub fn compute_merkle_root(
    leaf_hash: Field,
    siblings: [Field; 20],
    path_indices: [u1; 20]
) -> Field {
    let mut current = leaf_hash;

    for i in 0..20 {
        if path_indices[i] == 0 {
            current = hash_pair(current, siblings[i]);
        } else {
            current = hash_pair(siblings[i], current);
        }
    }

    current
}

pub fn fold_merkle_path(
    leaf_hash: Field,
    siblings: [Field; 20],
    path_indices: [u1; 20]
) -> Field {
    compute_merkle_root(leaf_hash, siblings, path_indices)
}