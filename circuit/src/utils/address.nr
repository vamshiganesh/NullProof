pub type QueryValue = u64;

pub fn as_query_value(value: u64) -> QueryValue {
    value
}

pub fn values_equal(lhs: QueryValue, rhs: QueryValue) -> bool {
    lhs == rhs
}

pub fn value_is_strictly_between(
    candidate: QueryValue,
    lower_bound: QueryValue,
    upper_bound: QueryValue
) -> bool {
    (candidate > lower_bound) & (candidate < upper_bound)
}

pub fn value_is_greater_than(lhs: QueryValue, rhs: QueryValue) -> bool {
    lhs > rhs
}

pub fn value_is_less_than(lhs: QueryValue, rhs: QueryValue) -> bool {
    lhs < rhs
}

pub fn assert_values_not_equal(lhs: QueryValue, rhs: QueryValue) {
    assert(lhs != rhs);
}

pub fn assert_value_is_strictly_between(
    candidate: QueryValue,
    lower_bound: QueryValue,
    upper_bound: QueryValue
) {
    assert(candidate > lower_bound);
    assert(candidate < upper_bound);
}

pub fn assert_monotonic_pair(current: QueryValue, next: QueryValue) {
    assert(current < next);
}
