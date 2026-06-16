# NullProof Privacy Architecture

## Layers

| Layer | What is hidden | Mechanism |
|-------|----------------|-----------|
| ZK proof | Wallet address in calldata | Address is a private witness; only Merkle root (+ nullifier after Phase 2) are public |
| Relayer | User EOA on Etherscan `From` | Relayer hot wallet broadcasts `SubmissionRouter.submitCompliant` |
| Router | User in `NullifierConsumed` | ComplianceGate sees `msg.sender` = SubmissionRouter contract |

## Phase 1 flow

1. User generates proof in browser (unchanged).
2. User signs EIP-712 `AuthorizeNullifier` off-chain (not published on-chain).
3. Browser `POST /api/submit` to relayer with proof + signature.
4. Relayer runs `checkCompliant`, then broadcasts via router.
5. Etherscan shows relayer address as transaction sender.

## What the relayer learns

- Off-chain: signer address from EIP-712 (Phase 1 only).
- On-chain: nothing beyond public proof calldata (nullifier, root).

After Phase 2, EIP-712 auth can be disabled (`REQUIRE_RELAYER_AUTH=false`) because nullifier is bound in-circuit.

## Dev fallback

Set `VITE_ALLOW_DIRECT_SUBMIT=true` to submit directly from the wallet when the relayer is not running.

## Deploy checklist (Sepolia)

1. Set `RELAYER_ADDRESS` in `contracts/.env`.
2. `forge script script/Deploy.s.sol --sig "deployRouter()" --broadcast ...`
3. Fund relayer wallet with Sepolia ETH.
4. Copy `SUBMISSION_ROUTER_ADDRESS` to `oracle/.env` and `frontend/.env.local`.
5. Set `RELAYER_PRIVATE_KEY`, `COMPLIANCE_GATE_ADDRESS` in `oracle/.env`.
6. Run `pnpm oracle:api` and `pnpm dev`.
