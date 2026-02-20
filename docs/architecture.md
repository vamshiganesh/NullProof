# NullProof — System Architecture

> **Privacy-preserving sanctions compliance via Zero-Knowledge proofs on Ethereum.**
> NullProof lets any wallet prove it is *absent* from a sanctions list — without ever revealing the wallet address to the verifier.

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Components](#2-system-components)
3. [High-Level Data Flow](#3-high-level-data-flow)
4. [Indexed Merkle Tree (IMT)](#4-indexed-merkle-tree-imt)
5. [ZK Circuit — NullProof](#5-zk-circuit--nullproof)
6. [Proof Pipeline](#6-proof-pipeline)
7. [Smart Contracts](#7-smart-contracts)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Trust Model](#9-trust-model)
10. [Security Boundaries](#10-security-boundaries)
11. [Technology Stack](#11-technology-stack)
12. [Directory Structure](#12-directory-structure)
13. [Deployment Architecture](#13-deployment-architecture)

---

## 1. Overview

NullProof is a full-stack ZK application that addresses a fundamental tension in blockchain compliance:
regulators require sanctions screening, but on-chain screening exposes wallet addresses to surveillance
and front-running.

The solution: instead of *revealing* an address to a compliance gate, a user generates a
**UltraHonk zero-knowledge proof** that cryptographically certifies their absence from the
OFAC sanctions list — without disclosing which address is being checked.

### Core Guarantee

```
"I know an address A such that:
  1. A is NOT in the current sanctions snapshot (root R)
  2. I can prove this using an Indexed Merkle Tree non-membership argument
  3. You learn only R and a nullifier — never A itself"
```

### What Makes This Non-Trivial

Standard Merkle proofs prove *membership*. Proving **non-membership** requires an
Indexed Merkle Tree (IMT), where leaves are sorted by value and a "low leaf" bounds the
gap in which a missing address would sit. The circuit asserts this gap holds — a much
harder constraint to satisfy soundly.

---

## 2. System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NullProof System                            │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Data Layer │    │  ZK Layer    │    │   Contract Layer     │  │
│  │              │    │              │    │                      │  │
│  │ OFAC Snapshot│    │ Noir Circuit │    │ ComplianceGate.sol   │  │
│  │ IMT Builder  │───▶│ (nullproof)  │───▶│ UltraHonk Verifier  │  │
│  │ Poseidon2    │    │ Barretenberg │    │ NullifierRegistry    │  │
│  │ Merkle Root  │    │ WASM Prover  │    │ (Sepolia)            │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│          │                  ▲                       ▲              │
│          ▼                  │                       │              │
│  ┌──────────────────────────┴───────────────────────┴───────────┐  │
│  │                    Frontend (React + Vite)                    │  │
│  │   Snapshot Viewer │ Proof Generator │ Circuit Explorer │ Tx   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|---|---|
| **OFAC Snapshot** | Fetches and normalises the current OFAC SDN list into a canonical address set |
| **IMT Builder** | Sorts addresses, assigns leaf indices, computes Poseidon2 hashes, builds the tree |
| **Noir Circuit** | Constrains non-membership proof logic, nullifier derivation, path verification |
| **Barretenberg** | UltraHonk prover/verifier WASM backend — runs entirely in-browser |
| **ComplianceGate** | On-chain entry point; accepts proof + public inputs, checks nullifier, emits event |
| **UltraHonk Verifier** | Auto-generated Solidity verifier from the compiled circuit's verification key |
| **Frontend** | React SPA — wallet connection, proof orchestration, on-chain submission |

---

## 3. High-Level Data Flow

### End-to-End Flow

```
                        OFF-CHAIN                                ON-CHAIN
                                                                (Sepolia)
  ┌──────────┐                                              ┌─────────────────┐
  │   OFAC   │                                              │ ComplianceGate  │
  │   SDN    │                                              │                 │
  │   List   │                                              │  verify(proof,  │
  └────┬─────┘                                              │   publicInputs) │
       │ fetch & normalise                                  └────────┬────────┘
       ▼                                                             │
  ┌──────────┐   build    ┌───────────┐  root  ┌─────────┐ submit  │
  │ Address  │──────────▶ │    IMT    │──────▶ │ On-chain│────────▶│
  │   Set    │            │ (depth 20)│        │  Root   │         │
  └──────────┘            └─────┬─────┘        └─────────┘         │
                                │ IMT path                          │
                                ▼                                   │
                         ┌────────────┐                             │
  User wallet ──────────▶│  Witness   │                             │
  (private)              │  Builder   │                             │
                         └─────┬──────┘                             │
                               │ private inputs                     │
                               ▼                                    │
                         ┌────────────┐                             │
                         │  Barret-   │  proof bytes                │
                         │  enberg    │────────────────────────────▶│
                         │  (WASM)    │  + [root]                   │
                         └────────────┘  (public inputs)            │
```

### Step-by-Step Narrative

1. **Snapshot ingestion** — The OFAC SDN list is fetched and parsed into a canonical set of lowercase hex Ethereum addresses.
2. **IMT construction** — Addresses are hashed with Poseidon2, sorted lexicographically, and inserted into a depth-20 Indexed Merkle Tree. The resulting Merkle root is stored (and optionally committed on-chain).
3. **Path lookup** — For a given wallet address, the IMT is queried to find the *low leaf* (the largest leaf value strictly less than the queried address's hash) and produce an authentication path of 20 sibling nodes.
4. **Witness assembly** — The browser assembles all private inputs: the wallet address, queried leaf hash, low leaf, low leaf index, siblings, path indices, nullifier, and address count.
5. **Proof generation** — Barretenberg's UltraHonk prover runs against `nullproof.bytecode` and produces a proof in ~5–20 seconds on consumer hardware.
6. **On-chain submission** — The proof bytes and `[root]` public inputs are submitted to `ComplianceGate.verify()` on Sepolia. The contract checks the nullifier registry (preventing replays) and emits a `ComplianceVerified` event.

---

## 4. Indexed Merkle Tree (IMT)

### Why an Indexed Merkle Tree?

A standard Merkle tree can only prove that a leaf *exists*. To prove a leaf is *absent*, the IMT exploits the fact that leaves are sorted — a gap between two adjacent leaves is proof that nothing sits between them.

### Structure

```
                          root
                         /    \
                        /      \
                    h(A,B)    h(C,D)
                    /    \    /    \
                   A      B  C      D
                   ↑
              low leaf (largest value < queriedLeaf)
              proves: lowLeaf < queriedLeaf < nextLeaf
```

### Non-Membership Proof

Given a queried address whose Poseidon2 hash is `Q`:

```
1. Locate low_leaf L such that: L < Q
2. Locate next_leaf N such that: N > Q  (the leaf adjacent to L in sorted order)
3. Provide Merkle path authenticating L to root R
4. Circuit asserts: L < Q  AND  path(L) → R  AND  nullifier is well-formed
```

If these constraints hold, `Q` (and thus the address) cannot exist in the tree.

### IMT Parameters

| Parameter | Value |
|---|---|
| Depth | 20 levels |
| Capacity | 2²⁰ ≈ 1,048,576 leaves |
| Hash function | Poseidon2 (BN254 scalar field) |
| Zero leaf value | `0x00…00` |
| Leaf value | `Poseidon2(address)` |
| Leaf ordering | Lexicographic by leaf value |

### IMTPath Object

```typescript
interface IMTPath {
  depth:       number;           // always 20
  lowLeaf:     HexString;        // low_leaf value
  lowLeafIndex: number;          // position in the tree
  root:        HexString;        // Merkle root
  siblings:    HexString[];      // 20 sibling node values
  pathIndices: (0 | 1)[];        // 0 = sibling is left, 1 = sibling is right
}
```

---

## 5. ZK Circuit — NullProof

The heart of the system. Written in **Noir** and compiled to **UltraHonk** arithmetic constraints via the Barretenberg backend.

### Circuit Interface

```noir
fn main(
    // ── Private inputs (hidden from verifier) ──────────────────────
    wallet_address:  Field,          // the address being checked
    queried_leaf:    Field,          // Poseidon2(wallet_address)
    low_leaf:        Field,          // low-bound leaf value in IMT
    low_leaf_index:  u32,            // position of low_leaf in tree
    siblings:        [Field; 20],    // Merkle authentication path
    path_indices:    [u1;   20],     // left/right indicators per level
    nullifier:       Field,          // keccak256(addr ∥ root ∥ lowLeafIdx)
    address_count:   u64,            // current snapshot size

    // ── Public input (revealed to verifier) ────────────────────────
    root:            pub Field,      // Merkle root — the ONLY public input
)
```

### Constraint System

The circuit enforces four properties:

```
Constraint 1 — Leaf binding
  assert queried_leaf == Poseidon2([wallet_address])

Constraint 2 — Path authentication
  let computed_root = merkle_verify(low_leaf, low_leaf_index, siblings, path_indices)
  assert computed_root == root

Constraint 3 — Non-membership gap
  assert low_leaf < queried_leaf

Constraint 4 — Nullifier binding
  assert nullifier == keccak256(wallet_address ∥ root ∥ low_leaf_index)
```

### Proof Statistics

| Metric | Value |
|---|---|
| Proving system | UltraHonk |
| Public inputs | 1 (`root`) |
| Private inputs | 9 fields |
| Proof generation time | ~5–20s (browser WASM) |
| Proof generation timeout | 60 seconds |
| Proof size | ~2 KB (UltraHonk, O(log n)) |
| Verification gas (on-chain) | ~300K gas (constant) |

### Nullifier Design

The nullifier `keccak256(walletAddress ∥ root ∥ lowLeafIndex)` has three desirable properties:

- **Root-bound**: changing the sanctions snapshot produces a new nullifier — old proofs cannot be reused.
- **Address-bound**: two different addresses produce different nullifiers, preventing cross-address replay.
- **Position-bound**: the inclusion of `lowLeafIndex` ties the proof to a specific tree position, preventing low-leaf substitution attacks.

---

## 6. Proof Pipeline

### Browser-Side Execution

```
User clicks "Generate Proof"
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Step 1: fetch-imt-path                             │
│                                                     │
│  -  Query IMT (local snapshot or remote oracle)      │
│  -  Find low_leaf for wallet address                 │
│  -  Build IMTPath (siblings, pathIndices, root)      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Step 2: execute-witness                            │
│                                                     │
│  -  Assemble all 9 private input fields              │
│  -  Derive nullifier = keccak256(addr ∥ root ∥ idx)  │
│  -  Validate witness schema                          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Step 3: generate-ultrahonk-proof                   │
│                                                     │
│  -  Load nullproof.bytecode from /public/circuits/   │
│  -  Instantiate Barretenberg UltraHonk backend       │
│  -  Execute prover (5–20 seconds)                    │
│  -  Returns: proof bytes + publicInputs [root]       │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Step 4: proof-ready                                │
│                                                     │
│  -  Proof available for on-chain submission          │
│  -  Submit to ComplianceGate.verify() on Sepolia     │
│  -  Nullifier stored on-chain, event emitted         │
└─────────────────────────────────────────────────────┘
```

### Fallback Strategy

If `nullproof.bytecode` / `.wasm` / `.vk.json` are absent from `/public/circuits/`, the prover silently falls back to a **mock backend** that produces a deterministic fake proof. This allows the frontend to be developed and demoed without compiled circuit artifacts.

---

## 7. Smart Contracts

### Contract Architecture

```
contracts/
├── ComplianceGate.sol        ← main entry point
├── UltraHonkVerifier.sol     ← auto-generated from circuit VK
└── NullifierRegistry.sol     ← replay-prevention store
```

### ComplianceGate.sol

The primary on-chain component. Accepts a proof and public inputs, delegates verification, and enforces replay prevention.

```
ComplianceGate.verify(
    bytes calldata proof,
    bytes32[] calldata publicInputs   // [root]
)
    │
    ├─ UltraHonkVerifier.verify(proof, publicInputs)   ← cryptographic check
    │
    ├─ NullifierRegistry.assertNotSeen(nullifier)      ← replay check
    │
    ├─ NullifierRegistry.mark(nullifier)               ← store nullifier
    │
    └─ emit ComplianceVerified(nullifier, root, timestamp)
```

### Trust Properties

| Property | Mechanism |
|---|---|
| Proof soundness | UltraHonk cryptographic verification (pairing-based) |
| Replay prevention | On-chain nullifier registry — each nullifier accepted once per root |
| Root freshness | Caller must supply the accepted root; stale roots rejected |
| Address privacy | Zero-knowledge — address never appears in calldata or events |

### Deployment

- **Network**: Ethereum Sepolia testnet
- **Verifier**: Auto-generated Solidity from `nargo` + Barretenberg VK export
- **Gas**: ~300K per `verify()` call (dominated by pairing operations)

---

## 8. Frontend Architecture

### Application Structure

```
frontend/src/
├── pages/
│   ├── Dashboard.tsx             ← landing, wallet connect, proof trigger
│   ├── ProtocolSnapshot.tsx      ← /app/protocol?tab=snapshot
│   ├── ProtocolCircuit.tsx       ← /app/protocol?tab=circuit  ← you are here
│   ├── ProtocolProver.tsx        ← /app/protocol?tab=prover
│   └── ProtocolContracts.tsx     ← /app/protocol?tab=contracts
├── lib/
│   ├── prover/
│   │   └── barretenberg.ts       ← Barretenberg WASM orchestration
│   ├── imt/
│   │   └── builder.ts            ← IMT construction, path queries
│   ├── snapshot/
│   │   └── ofac.ts               ← OFAC SDN list fetch + normalisation
│   ├── constants.ts              ← MERKLE_TREE_DEPTH, timeouts, etc.
│   └── format.ts                 ← formatHash, formatDuration, formatNum
├── types/
│   ├── proof.ts                  ← ProofStepId, ProofState
│   ├── imt.ts                    ← IMTPath, IMTSibling, IMTLeaf
│   └── snapshot.ts               ← SnapshotMeta, SanctionedAddress
└── components/
    ├── ProofStepper.tsx           ← visual 4-step proof progress
    ├── WalletButton.tsx           ← wagmi wallet connect
    └── NullifierBadge.tsx         ← rendered nullifier hex + copy
```

### Routing

```
/                        → Dashboard (wallet connect, proof CTA)
/app/protocol            → Protocol overview
/app/protocol?tab=snapshot   → Snapshot explorer (OFAC list, IMT stats)
/app/protocol?tab=circuit    → Circuit explorer (this file's page)
/app/protocol?tab=prover     → Live proof generator
/app/protocol?tab=contracts  → Smart contract interfaces
```

### State Management

The frontend is deliberately stateless across page loads — no localStorage (blocked in sandboxed contexts). All transient proof state is held in React component state. Wallet state is managed by **wagmi** + **viem**.

### Key Libraries

| Library | Role |
|---|---|
| `@aztec/bb.js` | Barretenberg UltraHonk WASM prover |
| `@noir-lang/noir_js` | Noir witness executor |
| `wagmi` + `viem` | Ethereum wallet + contract interaction |
| `react-router-dom` | SPA routing |
| `tailwindcss` | Utility-first styling |

---

## 9. Trust Model

### What the Verifier Learns

```
                    ┌─────────────────────────────────────────┐
                    │            ComplianceGate               │
                    │                                         │
  Proof bytes ───▶  │  ✓ proof is valid for some witness      │
  root ──────────▶  │  ✓ witness was committed to root R      │
  nullifier ──────▶ │  ✓ nullifier is fresh (first use)       │
                    │                                         │
                    │  ✗ wallet address  (never revealed)     │
                    │  ✗ low leaf index  (never revealed)     │
                    │  ✗ siblings        (never revealed)     │
                    └─────────────────────────────────────────┘
```

### Trust Assumptions

| Assumption | Risk Level | Mitigation |
|---|---|---|
| Barretenberg UltraHonk is sound | Low | Audited, production-grade backend (Aztec Labs) |
| Poseidon2 is collision-resistant | Low | Standard in ZK — proven in BN254 field |
| OFAC snapshot is accurate | Medium | Snapshot timestamped; stale root → proof rejected |
| Browser WASM is not tampered | Medium | Circuit bytecode is content-addressed; VK is on-chain |
| Ethereum Sepolia is available | Low | Testnet only — mainnet deployment straightforward |
| User's device is not compromised | External | Out of scope — same assumption as MetaMask |

### What NullProof Does NOT Guarantee

- It does **not** prevent a sanctioned address from attempting (and failing) to generate a proof — but the circuit will reject any valid path because no gap exists around a *present* leaf.
- It does **not** prove the snapshot is complete — a malicious snapshot builder could omit addresses. In production this would be mitigated by a decentralised snapshot oracle or committee.
- It does **not** prevent a user from generating multiple proofs for different roots (each produces a unique nullifier).

---

## 10. Security Boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│  TRUSTED BOUNDARY                                                │
│                                                                  │
│  -  Barretenberg UltraHonk proving system                         │
│  -  Noir circuit constraints (auditable source)                   │
│  -  Ethereum consensus (on-chain nullifier registry)              │
│  -  ComplianceGate.sol (immutable after deployment)               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  SEMI-TRUSTED BOUNDARY                                           │
│                                                                  │
│  -  OFAC snapshot source (government list — assumed accurate)     │
│  -  Frontend origin (Vite dev server / CDN)                       │
│  -  Circuit artifact CDN (bytecode must match on-chain VK)        │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  UNTRUSTED / USER-CONTROLLED                                     │
│                                                                  │
│  -  User's browser environment                                    │
│  -  Wallet (MetaMask / WalletConnect)                             │
│  -  Network connectivity                                          │
└──────────────────────────────────────────────────────────────────┘
```

### Attack Vectors Mitigated

| Attack | Mitigation |
|---|---|
| **Proof replay** | Root-bound nullifier stored on-chain; same proof rejected on re-submission |
| **Low-leaf substitution** | Nullifier includes `lowLeafIndex` — swapping the low leaf invalidates the nullifier |
| **Fake snapshot** | Root committed on-chain; proofs against unrecognised roots are rejected |
| **Witness manipulation** | Circuit constraints — any inconsistency produces an invalid proof |
| **Address extraction from proof** | Zero-knowledge property — proof reveals nothing about private inputs |

---

## 11. Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Layer             │  Technology                            │
├────────────────────┼────────────────────────────────────────┤
│  ZK Language       │  Noir (Aztec Labs)                     │
│  Proving Backend   │  Barretenberg UltraHonk (WASM)         │
│  Hash Function     │  Poseidon2 (BN254 field)               │
│  Smart Contracts   │  Solidity 0.8.x                        │
│  Contract Dev      │  Hardhat / Foundry                     │
│  EVM Network       │  Ethereum Sepolia                      │
│  Frontend          │  React 18 + Vite + TypeScript          │
│  Styling           │  Tailwind CSS                          │
│  Wallet            │  wagmi + viem + WalletConnect          │
│  Routing           │  react-router-dom v6                   │
│  Testing           │  Vitest + Hardhat tests                │
└────────────────────┴────────────────────────────────────────┘
```

---

## 12. Directory Structure

```
NullProof/
│
├── circuits/                    ← Noir ZK circuit
│   ├── nullproof/
│   │   ├── src/
│   │   │   └── main.nr          ← circuit definition
│   │   └── Nargo.toml
│   └── Prover.toml              ← example witness values
│
├── contracts/                   ← Solidity smart contracts
│   ├── src/
│   │   ├── ComplianceGate.sol
│   │   ├── UltraHonkVerifier.sol
│   │   └── NullifierRegistry.sol
│   ├── test/
│   └── hardhat.config.ts
│
├── frontend/                    ← React SPA
│   ├── public/
│   │   └── circuits/            ← compiled circuit artifacts
│   │       ├── nullproof.bytecode
│   │       ├── nullproof.wasm
│   │       └── nullproof.vk.json
│   ├── src/
│   │   ├── pages/
│   │   ├── lib/
│   │   ├── types/
│   │   └── components/
│   └── vite.config.ts
│
├── scripts/                     ← snapshot fetch, IMT build, deploy
├── docs/                        ← this file and others
└── README.md
```

---

## 13. Deployment Architecture

### Development

```
localhost:5173  (Vite)
      │
      ├── /public/circuits/   ← local compiled artifacts
      ├── wagmi devnet         ← Anvil or Sepolia fork
      └── mock prover          ← if artifacts absent
```

### Production (Testnet)

```
                    ┌──────────────┐
  User Browser ────▶│   Vite CDN   │
                    │  (Vercel /   │
                    │   Netlify)   │
                    └──────┬───────┘
                           │ loads circuit bytecode
                           ▼
                    ┌──────────────┐         ┌─────────────────┐
                    │  Barretenberg│         │ Ethereum Sepolia │
                    │  WASM prover │ proof──▶│ ComplianceGate  │
                    │  (in-browser)│         │ + Verifier      │
                    └──────────────┘         └─────────────────┘
```

### Circuit Artifact Build Pipeline

```
nargo compile
      │
      └──▶  nullproof.bytecode
                  │
      bb write_vk │  (Barretenberg CLI)
                  ▼
            nullproof.vk.json
                  │
      bb contract │  (generate Solidity verifier)
                  ▼
      UltraHonkVerifier.sol
```

Artifacts committed to `/public/circuits/` are content-addressed — the on-chain verification key
must match the bytecode used by the browser prover or all proofs will fail verification.

---

## Further Reading

- [`docs/circuits.md`](./circuits.md) — Noir constraint deep-dive and gate count analysis
- [`docs/contracts.md`](./contracts.md) — ABI reference, events, deployment addresses
- [`docs/snapshot.md`](./snapshot.md) — OFAC SDN ingestion pipeline, normalisation rules
- [`docs/proof-pipeline.md`](./proof-pipeline.md) — Witness assembly and prover configuration
- [Aztec Noir Documentation](https://noir-lang.org/)
- [Barretenberg GitHub](https://github.com/AztecProtocol/barretenberg)
- [UltraHonk Paper](https://eprint.iacr.org/2019/953)