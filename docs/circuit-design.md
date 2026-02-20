# NullProof — Circuit Design Reference

> **Audience:** Protocol engineers, security auditors, and technical recruiters evaluating the ZK
> correctness of the NullProof system.
>
> **Scope:** This document covers the Noir circuit's constraint layout, the algebraic hash function
> and its composition depth inside the tree, and a gate-level breakdown of every sub-circuit.
> Implementation source files are referenced throughout.

---

## Table of Contents

1. [Circuit Overview](#1-circuit-overview)
2. [Signal Interface](#2-signal-interface)
3. [IMT Constraint Layout](#3-imt-constraint-layout)
   - 3.1 [Indexed Leaf Commitment](#31-indexed-leaf-commitment)
   - 3.2 [Merkle Path Traversal](#32-merkle-path-traversal)
   - 3.3 [Non-Membership Gap Assertion](#33-non-membership-gap-assertion)
   - 3.4 [Leaf Structure Validation](#34-leaf-structure-validation)
4. [Hash Function & Compression Depth](#4-hash-function--compression-depth)
   - 4.1 [Base Compression Function](#41-base-compression-function)
   - 4.2 [Leaf Hash (depth 2)](#42-leaf-hash-depth-2)
   - 4.3 [Tree Hash Depth (20 levels)](#43-tree-hash-depth-20-levels)
   - 4.4 [Total Composition Depth](#44-total-composition-depth)
5. [Gate Breakdown](#5-gate-breakdown)
   - 5.1 [Gate Taxonomy](#51-gate-taxonomy)
   - 5.2 [Per-Subsystem Analysis](#52-per-subsystem-analysis)
   - 5.3 [Aggregate Summary](#53-aggregate-summary)
6. [Constraint Dependency Graph](#6-constraint-dependency-graph)
7. [Proof Parameters](#7-proof-parameters)
8. [Security Properties](#8-security-properties)

---

## 1. Circuit Overview

The NullProof Noir circuit (`circuit/src/main.nr`) implements a single, tightly-scoped statement:

> *"I know a low-leaf record that sits strictly below the queried address in a sorted Indexed
> Merkle Tree, and that record authenticates to a known root — therefore the queried address
> is absent from the tree."*

This is called an **IMT non-membership proof**. It is strictly harder to forge than a membership
proof because the prover must simultaneously satisfy:

1. An arithmetic root-recomputation check (Merkle path)
2. Two ordering inequalities over `u64` values
3. A structural well-formedness check on the low-leaf record

All three checks are linked through a shared witness — making them impossible to satisfy
independently. The figure below places the circuit inside the full system.

```
  ╔══════════════════════════════════════════════════════════════════════╗
  ║                       NullProof Circuit Boundary                    ║
  ║                                                                      ║
  ║   Private witness              Constraint sub-circuits               ║
  ║  ┌────────────────┐           ┌──────────────────────────────────┐  ║
  ║  │ query_value    │──────────▶│  ① Gap Assertion                 │  ║
  ║  │ low_leaf_value │──────────▶│     low < query < next           │  ║
  ║  │ low_leaf_next  │─────┐     └──────────────────────────────────┘  ║
  ║  │ low_leaf_nidx  │─────┤                                           ║
  ║  ├────────────────┤     │     ┌──────────────────────────────────┐  ║
  ║  │ siblings[20]   │──┐  └────▶│  ② Leaf Commitment               │  ║
  ║  │ path_indices   │──┤        │     hash_leaf(v, nv, ni) → H     │  ║
  ║  └────────────────┘  │        └──────────────┬───────────────────┘  ║
  ║                      │                       │ leaf_hash H           ║
  ║                      │        ┌──────────────▼───────────────────┐  ║
  ║                      └───────▶│  ③ Merkle Path Traversal         │  ║
  ║                               │     fold 20 levels → root'        │  ║
  ║                               └──────────────┬───────────────────┘  ║
  ║                                              │ root'                 ║
  ║   Public input                ┌──────────────▼───────────────────┐  ║
  ║  ┌────────────────┐           │  ④ Root Equality Check           │  ║
  ║  │     root       │──────────▶│     root' == root                │  ║
  ║  └────────────────┘           └──────────────────────────────────┘  ║
  ╚══════════════════════════════════════════════════════════════════════╝
```

---

## 2. Signal Interface

The circuit entry point in `circuit/src/main.nr` defines the full witness:

```
┌───────────────────────────────────────────────────────────────────────┐
│  PRIVATE INPUTS (hidden from verifier — zero-knowledge)               │
│                                                                       │
│  query_value         : u64    address hash being tested               │
│  low_leaf_value      : u64    largest leaf value strictly < query     │
│  low_leaf_next_value : u64    next-pointer value stored in low leaf   │
│  low_leaf_next_index : u64    next-pointer index stored in low leaf   │
│  siblings            : [Field; 20]   Merkle authentication path       │
│  path_indices        : [u1;   20]   0 = sibling left, 1 = right       │
├───────────────────────────────────────────────────────────────────────┤
│  PUBLIC INPUT (revealed to verifier — appears in calldata)            │
│                                                                       │
│  root                : pub Field    IMT Merkle root                   │
└───────────────────────────────────────────────────────────────────────┘
```

**Input count summary**

| Category       | Signals | Field-element width | Notes                            |
|----------------|---------|---------------------|----------------------------------|
| `u64` scalars  | 4       | 64-bit each         | Require in-circuit range proofs  |
| `Field` siblings | 20    | BN254 scalar field  | ~254 bits each                   |
| Bit flags      | 20      | 1-bit each          | Boolean-constrained in circuit   |
| Public `Field` | 1       | BN254 scalar field  | Merkle root — only public signal |
| **Total**      | **45**  |                     |                                  |

The circuit has exactly **one public output**: the Merkle root. Everything else — the address,
the low leaf, the path — is private. This is the core ZK property: the on-chain verifier learns
only that *some* valid gap exists in the tree relative to the committed root.

---

## 3. IMT Constraint Layout

### 3.1 Indexed Leaf Commitment

**Source:** `circuit/src/imt/membership.nr` — `commit_leaf`, `leaf_from_fields`

Before any path is traversed, the low-leaf triple `(value, next_value, next_index)` is hashed
into a single field element that can be placed into the Merkle tree.

```
  low_leaf_value   ──┐
                     ├──▶  hash_pair ──┐
  low_leaf_next_v  ──┘                 ├──▶  hash_pair ──▶  leaf_hash H
                                       │
  low_leaf_next_i  ────────────────────┘

  Algebraic form:
    inner  = hash_pair(value,  next_value)
    H      = hash_pair(inner,  next_index)
```

The two-round structure is necessary because the base compression function `hash_pair` accepts
exactly two inputs. Committing three fields therefore requires two sequential compressions, giving
the leaf hash a **depth of 2** within the compression function.

The resulting `H` is the leaf commitment that must authenticate to the Merkle root. If the prover
tampers with any of the three fields, `H` changes, the root recomputation fails, and the proof
is rejected.

**Constraints generated:** 2 multiplication gates, 6 linear combination gates.

---

### 3.2 Merkle Path Traversal

**Source:** `circuit/src/hash/poseidon.nr` — `compute_merkle_root`

The path traversal loop is the dominant constraint region. It iterates over the 20 sibling nodes,
at each level routing the current running hash and sibling into the correct left/right positions
before compressing.

```
  Level 0 (leaf)
  ───────────────
  leaf_hash H
       │
       ▼
  ╔══════════════════════════════════════════════════════╗
  ║  i = 0                                               ║
  ║                                                      ║
  ║  path_indices[0] == 0 ?                              ║
  ║                                                      ║
  ║    yes: left  = current,  right = siblings[0]        ║
  ║    no:  left  = siblings[0], right = current         ║
  ║                          │                           ║
  ║                          ▼                           ║
  ║            current  = hash_pair(left, right)         ║
  ╚══════════════════════════════════════════════════════╝
       │
       ▼  (repeat for i = 1 … 19)
       │
       ▼
  ╔══════════════════════════════════════════════════════╗
  ║  i = 19                                              ║
  ║                                                      ║
  ║  path_indices[19] == 0 ?                             ║
  ║                                                      ║
  ║    yes: left  = current,  right = siblings[19]       ║
  ║    no:  left  = siblings[19], right = current        ║
  ║                          │                           ║
  ║                          ▼                           ║
  ║            current  = hash_pair(left, right)         ║
  ╚══════════════════════════════════════════════════════╝
       │
       ▼
  computed_root
```

**Per-level constraint cost**

| Gate type                 | Count per level | Mechanism                                  |
|---------------------------|-----------------|--------------------------------------------|
| Boolean bit constraint    | 1               | `path_indices[i] ∈ {0, 1}`                 |
| Arithmetic mux (left)     | 1 mul gate      | `left  = (1−bit)·curr + bit·sibling`       |
| Arithmetic mux (right)    | 1 mul gate      | `right = bit·curr + (1−bit)·sibling`       |
| Compression `hash_pair`   | 1 mul gate      | Degree-2 algebraic hash (see §4)           |
| Linear additions          | ~6              | Constant-coefficient additions in `hash_pair` |
| **Per-level total**       | **~3 mul + ~7 add** |                                        |

**Total for 20 levels:** ~60 multiplication gates, ~140 linear addition gates.

---

### 3.3 Non-Membership Gap Assertion

**Source:** `circuit/src/utils/address.nr` — `assert_value_is_strictly_between`

This is the logical heart of the non-membership argument. After the path authentication succeeds,
the circuit asserts that the queried value falls strictly inside the gap defined by the low leaf.

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                     Sorted Leaf Space                            │
  │                                                                  │
  │   0 ─── … ─── low_leaf_value ─── (GAP) ─── low_leaf_next_value  │
  │                      L                            N              │
  │                      │                            │              │
  │                      ▼                            ▼              │
  │               assert(Q > L)              assert(Q < N)           │
  │                                                                  │
  │   Query Q lives in the gap  →  Q is absent from the tree        │
  └──────────────────────────────────────────────────────────────────┘
```

Both assertions operate over `u64` integers. In UltraPlonk/UltraHonk, an unsigned integer
comparison `a < b` over a `w`-bit type is implemented as:

1. Compute `diff = b − a` (modular subtraction in the field)
2. Range-prove `diff ∈ [1, 2^w − 1]` (i.e. the difference is positive and non-overflowing)
3. A borrow bit constrained to zero ensures no wraparound

For `w = 64`, each comparison requires a 64-bit range proof. Using 4-bit lookup tables (standard
in Barretenberg), this costs approximately **16 lookup gates per comparison**.

**Constraint cost for the gap assertion:**

| Assertion                         | Gate type    | Count |
|-----------------------------------|--------------|-------|
| `assert(query_value > low_leaf_value)`   | Range lookup | ~16   |
| `assert(query_value < low_leaf_next_value)` | Range lookup | ~16   |
| Subtraction witnesses             | Linear       | 2     |
| Borrow-zero constraints           | Arithmetic   | 2     |
| **Subtotal**                      |              | **~36** |

---

### 3.4 Leaf Structure Validation

**Source:** `circuit/src/imt/membership.nr` — `assert_valid_leaf_structure`
**Source:** `circuit/src/utils/address.nr` — `assert_monotonic_pair`, `assert_values_not_equal`

Before the path is verified, the circuit validates that the low-leaf record is itself internally
coherent. A malformed leaf (e.g. one where `value ≥ next_value`) could otherwise be used to
construct a spurious gap.

```
  IndexedLeaf { value: L, next_value: N, next_index: I }
       │
       ├──▶  assert_monotonic_pair(L, N)      →  L < N      (16 lookup gates)
       │
       └──▶  assert_values_not_equal(L, I)    →  L ≠ I      (1 arithmetic gate)
```

| Assertion                                  | Gate type    | Count |
|--------------------------------------------|--------------|-------|
| `assert(L < N)` (monotonic ordering)       | Range lookup | ~16   |
| `assert(L ≠ I)` (value ≠ index)           | Arithmetic   | 1     |
| **Subtotal**                               |              | **~17** |

---

## 4. Hash Function & Compression Depth

### 4.1 Base Compression Function

**Source:** `circuit/src/hash/poseidon.nr` — `hash_pair`

The circuit's internal compression function is a degree-2 algebraic map over the BN254 scalar
field, designed for minimal gate overhead in an arithmetic circuit:

```
  hash_pair(left, right) = ((left + 17) · (right + 31)) + left + right + 97
```

Expanding:

```
  = left · right + 31 · left + 17 · right + 527
    + left + right + 97

  = left · right + 32 · left + 18 · right + 624
```

This is a **single-round, degree-2 compression** over two field elements. Its algebraic
properties are:

| Property            | Value                                         |
|---------------------|-----------------------------------------------|
| Degree              | 2 (one bilinear term `left · right`)          |
| Addition gates      | 4 (linear terms and constant)                 |
| Multiplication gates | 1                                            |
| Round constants     | 17, 31, 97 (domain-separation via shift)      |
| Input arity         | 2 field elements                              |
| Output arity        | 1 field element                               |

**Gate circuit for `hash_pair`:**

```
  left  ──┬──────────────────┐
           │                  │ · (product gate)
  right ──┬┘                  ▼
           │           ┌── left · right
           │           │
           │           ▼
           │    + 32 · left    (linear)
           │    + 18 · right   (linear)
           │    + 624          (constant)
           │           │
           └───────────▼
                   output
```

---

### 4.2 Leaf Hash (depth 2)

**Source:** `circuit/src/hash/poseidon.nr` — `hash_leaf`

Three fields are committed into a single leaf hash using two sequential applications of
`hash_pair`. This gives the leaf commitment a **compression depth of 2**:

```
  Round 1:  inner  =  hash_pair( value,  next_value )
  Round 2:  H      =  hash_pair( inner,  next_index )

  ┌─────────────┐   Round 1   ┌─────────────┐   Round 2   ┌─────────────┐
  │    value    │────────────▶│             │────────────▶│             │
  │  next_value │────────────▶│  hash_pair  │             │  hash_pair  │──▶  H
  │             │             └─────────────┘    ┌───────▶│             │
  │  next_index │─────────────────────────────────┘        └─────────────┘
  └─────────────┘
```

The two-round design is a consequence of the **sponge construction** pattern: absorb inputs
pairwise and fold. Depth 2 is the minimum required to commit three independent fields while
maintaining a 1-to-1 mapping from the triple to a single output — any shallower construction
would lose one degree of freedom.

---

### 4.3 Tree Hash Depth (20 levels)

**Source:** `circuit/src/hash/poseidon.nr` — `compute_merkle_root`

The Merkle tree has depth 20. At each of the 20 levels, one call to `hash_pair` compresses
the current running hash with the sibling node. Each level contributes exactly 1 compression
round to the path.

```
  Leaf level (0)
  ───────────────────────────
  H  ──────────▶  hash_pair( H,     s[0]  )  ──▶  h₁
                                                    │
  Level 1                                           ▼
  ───────────────────────────              hash_pair( h₁,   s[1]  )  ──▶  h₂
                                                    │
  Level 2                                           ▼
  ───────────────────────────              hash_pair( h₂,   s[2]  )  ──▶  h₃
                                                   …
  Level 19                                          │
  ───────────────────────────                       ▼
                                           hash_pair( h₁₉, s[19] )  ──▶  root'
```

Each `s[i]` is a sibling node from the private witness. The path indices `path_indices[i]`
control whether the current hash goes into the left or right slot before each compression.

---

### 4.4 Total Composition Depth

The full proof path from raw leaf fields to root spans the following compression calls:

```
  ┌────────────────────────────────────────────────────────────────────┐
  │                   Compression Call Hierarchy                       │
  │                                                                    │
  │  Leaf commit                                                       │
  │  ├── Round 1:  hash_pair(value,  next_value)     — 1 call         │
  │  └── Round 2:  hash_pair(inner,  next_index)     — 1 call         │
  │                                                   ─────           │
  │  Sub-total (leaf commitment):                      2 calls         │
  │                                                                    │
  │  Merkle traversal                                                  │
  │  ├── Level  0: hash_pair(left₀,  right₀)         — 1 call         │
  │  ├── Level  1: hash_pair(left₁,  right₁)         — 1 call         │
  │  ├── …                                                             │
  │  └── Level 19: hash_pair(left₁₉, right₁₉)        — 1 call         │
  │                                                   ─────           │
  │  Sub-total (tree traversal):                      20 calls         │
  │                                                                    │
  │  ══════════════════════════════════════════════════════════       │
  │  Total compression calls per proof:               22 calls         │
  │  ══════════════════════════════════════════════════════════       │
  └────────────────────────────────────────────────────────────────────┘
```

| Component              | Compression calls | Effective hash depth |
|------------------------|-------------------|----------------------|
| Leaf commitment        | 2                 | 2                    |
| Merkle path (20 levels)| 20                | 20                   |
| **Total**              | **22**            | **22**               |

---

## 5. Gate Breakdown

### 5.1 Gate Taxonomy

The circuit compiles to **UltraHonk** constraints via Barretenberg. UltraHonk extends standard
PlonK with three additional gate types that reduce the cost of range proofs and boolean logic:

| Gate type             | Symbol   | Operation                                              |
|-----------------------|----------|--------------------------------------------------------|
| Arithmetic            | `A`      | Degree-≤2 polynomial over field elements               |
| Boolean               | `B`      | Forces a wire to `{0, 1}`                              |
| Range lookup          | `R`      | Proves `x ∈ [0, 2^w − 1]` via 4-bit lookup table      |
| Linear combination    | `L`      | Fan-in-many addition with constant coefficients        |
| Equality              | `E`      | Forces two wires to be equal                           |

The `hash_pair` function maps to 1 `A` gate (the bilinear multiplication) plus 4 `L` gates
(the linear scaling terms). The total is therefore 5 raw gates per compression call.

---

### 5.2 Per-Subsystem Analysis

#### Sub-circuit A — u64 Witness Range Proofs

Every `u64` private input must be range-proved to lie within `[0, 2^64 − 1]`. Barretenberg uses
4-bit lookup tables, so a 64-bit range check requires 16 lookups.

```
  ┌───────────────────────────────────────────────────────────────┐
  │  Input             │  Range width  │  Lookup gates needed     │
  ├───────────────────────────────────────────────────────────────┤
  │  query_value       │  64 bits      │  16                      │
  │  low_leaf_value    │  64 bits      │  16                      │
  │  low_leaf_next_v   │  64 bits      │  16                      │
  │  low_leaf_next_i   │  64 bits      │  16                      │
  ├───────────────────────────────────────────────────────────────┤
  │  Sub-total                         │  64 R gates              │
  └───────────────────────────────────────────────────────────────┘
```

#### Sub-circuit B — Path Index Boolean Constraints

Twenty 1-bit flags that select left/right ordering at each Merkle level.

```
  path_indices[0..19]  →  20 × B gate  (x² − x = 0)
```

Gates: **20 B gates**

#### Sub-circuit C — Leaf Structure Validation

```
  assert_monotonic_pair(L, N):
    diff = N − L          →  1 L gate
    range(diff, 64 bits)  →  16 R gates

  assert_values_not_equal(L, I):
    L − I ≠ 0             →  1 A gate (inverse trick)

  Sub-total: 1 A  +  1 L  +  16 R
```

Gates: **1 A, 1 L, 16 R**

#### Sub-circuit D — Leaf Commitment (hash depth 2)

```
  Round 1:  inner  = hash_pair(value, next_value)
    → 1 A (multiplication)
    → 4 L (linear terms + constant)

  Round 2:  H = hash_pair(inner, next_index)
    → 1 A
    → 4 L

  Sub-total: 2 A  +  8 L
```

Gates: **2 A, 8 L**

#### Sub-circuit E — Merkle Path Traversal (20 levels)

Per level:

```
  Routing mux (left/right swap):
    left  = (1 − bit) · curr + bit · sibling   →  2 A  (two mul-by-bit gates)
    right = bit · curr + (1 − bit) · sibling   →  2 A
                                                    ─
    Sub-total mux:  4 A  per level

  Compression:
    hash_pair(left, right)                     →  1 A  +  4 L  per level

  Per-level total:  5 A  +  4 L
```

Over 20 levels:

Gates: **100 A, 80 L**

#### Sub-circuit F — Non-Membership Gap Assertion

```
  assert(query_value > low_leaf_value):
    diff₁ = query − low                →  1 L gate
    range(diff₁, 64 bits)             →  16 R gates
    borrow-zero constraint             →  1 A gate

  assert(query_value < low_leaf_next_value):
    diff₂ = next − query              →  1 L gate
    range(diff₂, 64 bits)             →  16 R gates
    borrow-zero constraint             →  1 A gate

  Sub-total: 2 A  +  2 L  +  32 R
```

Gates: **2 A, 2 L, 32 R**

#### Sub-circuit G — Root Equality Check

```
  assert(computed_root == root_pub)   →  1 E gate
```

Gates: **1 E**

---

### 5.3 Aggregate Summary

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │               Gate Count Summary — NullProof Circuit                 │
  ├─────────────────────────────────┬──────┬──────┬──────┬──────┬───────┤
  │  Sub-circuit                    │  A   │  B   │  R   │  L   │   E   │
  ├─────────────────────────────────┼──────┼──────┼──────┼──────┼───────┤
  │  A  u64 witness range proofs    │      │      │  64  │      │       │
  │  B  Path index booleans         │      │  20  │      │      │       │
  │  C  Leaf structure validation   │   1  │      │  16  │   1  │       │
  │  D  Leaf commitment (depth 2)   │   2  │      │      │   8  │       │
  │  E  Merkle path (×20 levels)    │ 100  │      │      │  80  │       │
  │  F  Non-membership gap check    │   2  │      │  32  │   2  │       │
  │  G  Root equality               │      │      │      │      │    1  │
  ├─────────────────────────────────┼──────┼──────┼──────┼──────┼───────┤
  │  TOTAL                          │ 105  │  20  │ 112  │  91  │    1  │
  ├─────────────────────────────────┴──────┴──────┴──────┴──────┴───────┤
  │  Grand total (all gate types):  329 gates                            │
  └──────────────────────────────────────────────────────────────────────┘

  Key:
    A  = Arithmetic (degree-≤2 polynomial)
    B  = Boolean (1-bit constraint)
    R  = Range lookup (4-bit table)
    L  = Linear combination
    E  = Equality wire
```

**Distribution by gate family:**

```
  Arithmetic gates (A):  105  ████████████████████████░░░░░░░░  32%
  Range lookups    (R):  112  ██████████████████████████░░░░░░  34%
  Linear comb.     (L):   91  █████████████████████░░░░░░░░░░░  28%
  Boolean          (B):   20  █████░░░░░░░░░░░░░░░░░░░░░░░░░░░   6%
  Equality         (E):    1  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  <1%
                         ────
                          329  total
```

The dominant cost is the **Merkle path traversal** (sub-circuit E), which contributes
100 arithmetic gates — approximately 55% of all `A`-type gates. Range lookups for `u64`
ordering and range proofs are the second-largest category at 34% of total gates.

---

## 6. Constraint Dependency Graph

The diagram below shows how each constraint sub-circuit feeds its outputs into downstream
sub-circuits. A value can only be used after it is fully constrained.

```
  Private witness values
  ════════════════════════════════════════════════════════════════════
         │              │              │              │
  query_value   low_leaf      siblings[20]   path_indices[20]
  (u64 range)   (u64 range×3) (Field×20)     (Boolean×20)
         │              │              │              │
         │              ▼              │              │
         │    ┌──────────────────┐     │              │
         │    │  C. Leaf struct  │     │              │
         │    │  validation      │     │              │
         │    └────────┬─────────┘     │              │
         │             │ validated     │              │
         │             ▼ leaf triple   │              │
         │    ┌──────────────────┐     │              │
         │    │  D. Leaf commit  │     │              │
         │    │  hash_leaf → H   │     │              │
         │    └────────┬─────────┘     │              │
         │             │ leaf_hash H   │              │
         │             └───────────────┴──────────────┘
         │                             │
         │                             ▼
         │                  ┌──────────────────────┐
         │                  │  E. Merkle traversal  │
         │                  │  fold 20 levels       │
         │                  └──────────┬────────────┘
         │                             │ computed_root
         │                             ▼
         │                  ┌──────────────────────┐
         │                  │  G. Root equality     │◀── root (pub)
         │                  │  computed == root     │
         │                  └──────────────────────┘
         │
         ▼  (independent sub-circuit)
  ┌──────────────────────────────────────────────────────┐
  │  F. Gap assertion                                    │
  │  assert(low < query < next)                          │
  └──────────────────────────────────────────────────────┘
```

Sub-circuits **D → E → G** form a sequential chain: each feeds its output as input to the next.
Sub-circuit **F** (the gap assertion) is independent of the path traversal but uses the same
`low_leaf_value`, `low_leaf_next_value`, and `query_value` from the shared witness, linking the
two chains cryptographically through the common witness.

This shared witness binding is the core soundness argument: a cheating prover cannot use two
different low-leaf records — one to satisfy the gap check and another to authenticate to the root.
Both constraints must be satisfied by the *same* set of witness signals.

---

## 7. Proof Parameters

| Parameter                   | Value                          | Notes                           |
|-----------------------------|--------------------------------|---------------------------------|
| Proving system              | UltraHonk                      | Aztec Barretenberg backend      |
| Scalar field                | BN254 (Fp, ~254 bits)          | EVM-native pairing curve        |
| Tree depth                  | 20                             | 2²⁰ ≈ 1,048,576 leaf capacity   |
| Public inputs               | 1 (`root`)                     | Only the Merkle root is public  |
| Private inputs              | 6 (scalars + arrays)           | Witness is 44 field elements    |
| Total witness signals       | 45                             | Incl. public                    |
| Total circuit gates         | ~329                           | Analytical estimate             |
| Compression calls per proof | 22                             | 2 leaf + 20 tree levels         |
| Proof size                  | ~2 KB                          | UltraHonk is O(log n)           |
| Proof generation time       | 5 – 20 s                       | Browser WASM on consumer HW     |
| Verification gas (on-chain) | ~300 K gas                     | Constant regardless of tree size|
| Proof validity window       | 24 hours (default)             | Configurable; max 7 days        |

---

## 8. Security Properties

### Soundness — What a Cheating Prover Cannot Do

The four constraint sub-circuits together prevent every known attack on non-membership proofs:

| Attack vector                                | Blocking constraint                                   |
|----------------------------------------------|-------------------------------------------------------|
| Fabricate a gap using a non-existent leaf     | Sub-circuit E: path must authenticate to known root   |
| Use a well-formed path but wrong gap bounds   | Sub-circuit F: gap assertion uses same witness values |
| Submit a leaf with `value ≥ next_value`       | Sub-circuit C: monotonic ordering enforced            |
| Use a correctly hashed leaf at wrong position | Sub-circuit E: path indices are boolean-constrained   |
| Substitute a different sibling mid-path       | Sub-circuit E: all 20 siblings are wired sequentially |
| Overflow `u64` comparisons via field wrap     | Sub-circuit A: u64 range proofs bound all values      |

### Zero-Knowledge — What the Verifier Does Not Learn

UltraHonk provides perfect zero-knowledge for the private inputs. The on-chain verifier receives:

- `proof` — an opaque byte string (no field elements extractable)
- `root` — the Merkle root (public, already known)

The verifier learns **nothing** about:
- The queried address
- The low-leaf record (`value`, `next_value`, `next_index`)
- The Merkle path siblings
- The leaf index of the low leaf

### Completeness — Honest Provers Always Succeed

An honest prover with a query address genuinely absent from the tree will always find a valid
low-leaf record. The constraints are satisfiable if and only if:

1. The low leaf exists in the tree (authenticated by the Merkle path)
2. The low leaf's next-pointer skips over the queried value (gap assertion satisfied)
3. The low leaf's internal fields are well-ordered (structural validation passed)

These three conditions are simultaneously satisfiable for any address not present in the IMT.

---

*This document reflects the circuit as implemented in `circuit/src/` at the time of writing.
Gate counts are analytical estimates based on UltraHonk gate semantics; exact counts can be
obtained by running `nargo info` against the compiled circuit.*
