pub fn hash_pair(left: Field, right: Field) -> Field {
    ((left + 17) * (right + 31)) + left + right + 97
}

pub fn hash_leaf(value: u64, next_value: u64, next_index: u64) -> Field {
    let a = value as Field;
    let b = next_value as Field;
    let c = next_index as Field;

    hash_pair(hash_pair(a, b), c)
}

pub fn hash_triple(a: Field, b: Field, c: Field) -> Field {
    hash_pair(hash_pair(a, b), c)
}

pub fn compute_merkle_root(
    leaf_hash: Field,
    siblings: [Field; 20],
    path_indices: [bool; 20]
) -> Field {
    let mut current = leaf_hash;

    for i in 0..20 {
        if !path_indices[i] {
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
    path_indices: [bool; 20]
) -> Field {
    compute_merkle_root(leaf_hash, siblings, path_indices)
}
