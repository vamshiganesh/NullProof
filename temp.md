Here's the full picture of how to get everything running. The project has four independent parts that can be started in different combinations depending on what you want to do.

Prerequisites
Node / pnpm (required for everything frontend/oracle)

node --version   # must be ≥ 20
npm install -g pnpm@latest
Noir + Barretenberg (required only to recompile the circuit)

# Install noirup then pull the latest nargo
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup
# Install Barretenberg CLI
bbup
Foundry (required only for contracts)

curl -L https://foundry.paradigm.xyz | bash
foundryup
Path 1 — Frontend only (fastest, mock proof mode)
This requires nothing but Node. The prover gracefully falls back to a mock backend when circuit artifacts are absent.

cd /home/ubuntu/projects/nullproof
pnpm install
pnpm dev
Opens at http://localhost:5173. Proof generation will use a deterministic fake proof — fine for UI development and demos.

Path 2 — Frontend with real ZK proofs
You need nargo and bb installed first (see prerequisites above).

# 1. Compile the Noir circuit and push artifacts to frontend/public/circuits/
pnpm circuit:compile
# 2. Start the frontend — it now picks up the real bytecode
pnpm dev
The circuit:compile script (scripts/build-circuit.sh) does three things:

nargo compile → circuit/target/nullproof_non_membership.json
bb write_vk + bb write_solidity_verifier → contracts/src/HonkVerifier.sol
Copies nullproof.json + extracts nullproof.bytecode → frontend/public/circuits/
Path 3 — Contracts (local Anvil)
# Terminal 1 — start a local EVM node
pnpm contracts:anvil
# Terminal 2 — compile and deploy
pnpm contracts:build
pnpm contracts:deploy:local
For Sepolia, fill in contracts/.env (copy from .env.example) with your private key, RPC URL, and Etherscan key, then:

pnpm contracts:deploy:sepolia
After deploying, run pnpm sync:abis to regenerate the TypeScript ABIs the frontend imports.

Path 4 — Oracle (on-chain root publisher)
The oracle fetches the OFAC SDN list, builds the IMT, pushes the root to SanctionsList.sol, and writes the snapshot JSON that the frontend prover reads.

1. Configure env:

cp oracle/.env.example oracle/.env
# edit oracle/.env:
#   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#   ORACLE_PRIVATE_KEY=0x...
#   SANCTIONS_LIST_ADDRESS=0x...  (after contracts are deployed)
2. Run it:

pnpm oracle:run      # run once and exit
# or
pnpm oracle:dev      # tsx watch — restarts on file changes
The oracle writes its output to frontend/data/imt-snapshot.json (configured by SNAPSHOT_PATH in .env). The frontend prover reads from there.

Typical full-stack startup sequence
1.  pnpm install                  # install all workspace deps
2.  pnpm circuit:compile          # build Noir → artifacts
3.  pnpm contracts:anvil          # start local chain (new terminal)
4.  pnpm contracts:build          # compile Solidity
5.  pnpm contracts:deploy:local   # deploy to Anvil
6.  pnpm sync:abis                # regenerate frontend ABIs
7.  pnpm oracle:run               # build IMT snapshot
8.  pnpm dev                      # start Vite frontend
For just the frontend + mock proofs it collapses to: pnpm install && pnpm dev.

What's already filled in
Notably, oracle/.env already has an RPC URL and private key committed — so the oracle can run against Sepolia as soon as a SANCTIONS_LIST_ADDRESS is deployed there. You'll want to rotate that private key before any public deployment.








Good. I have everything I need. Here's the full plan.

What the reference designs establish
Design system shift (current vs reference):

Token	Current	Reference
Background
Blue-tinted #050816
Pure near-black #0d0d0d
Accent green
Tailwind emerald-500
Brighter, purer #22ff66 neon
Cards
Blue-tinted dark panels
#161616 with #2a2a2a borders
Layout
Sidebar + TopNav
Top navbar only (no sidebar)
Nav links
Wrong routes, wrong style
Horizontal: Dashboard · Proofs · Ledger · Protocol · Integrations, active = green underline
Typography
Mixed
Monospace labels in #666, white values, green accents
The sidebar needs to be removed entirely — this is a structural change that touches AppShell in App.tsx.

The 7-prompt plan
#	Screen(s)	What gets written	Complexity
1
Foundation + Landing
globals.css design token overhaul · TopNav (landing variant) · Landing.tsx full page (hero, stat cards, protocol flow, footer)
High
2
App shell + Dashboard
Remove sidebar from AppShell · rewrite TopNav (app variant with horizontal links) · Dashboard.tsx (compliance status, generate button, sanctions list card, how-it-works panel, contract address)
High
3
Proofs — Generating
ProofGenerate.tsx two-column (left: IMT tree canvas visualizer with animated nodes/edges, right: step pipeline with live progress + circuit stats)
Very High
4
Proofs — Ready + Deposit Confirmed
ProofReady.tsx (centered proof data card, Proceed to Deposit / Copy buttons, expiry banner) · DepositConfirmed.tsx (transaction receipt card, Back to Dashboard / View on Etherscan)
Medium
5
Ledger
Ledger.tsx two-column (left: deposit amount input + transaction details + Confirm button, right: attached proof panel with VALID badge + proof hash/nullifier/window)
High
6
Protocol
Protocol.tsx with two tabs: ① Statistics (4 KPI cards + root history table + benchmark bar chart + contracts table) ② Circuit Explorer (constraint node graph with Poseidon Hashing / Merkle Verification / Range Checks nodes + cluster details panel)
Very High
7
Radar
Radar.tsx (left: grid-canvas sanctions map with animated red dots + green USER_WALLET node, right: Protocol Intelligence panel with VALID badge + network metrics + radar filters + node legend)
High
What's NOT changing
The entire logic layer stays untouched — stores, hooks, prover, wagmi config, contracts, circuit. Only .tsx files and globals.css are touched.



SANCTIONS_LIST_ADDRESS is the on-chain address of the SanctionsList.sol contract after it's been deployed to Sepolia. You don't "acquire" it from anywhere external — you generate it yourself by running the deployment script.

Here's the full picture:

The value comes from deploying your own contracts. The flow is:

Deploy the Verifier first (generated from your Noir circuit):

nargo compile
bb write_vk --scheme ultra_honk -b circuit/target/nullproof.json -o circuit/target/vk
bb contract --scheme ultra_honk -k circuit/target/vk -o contracts/src/Verifier.sol
forge script script/Deploy.s.sol --sig "deployVerifier()" --broadcast --rpc-url $SEPOLIA_RPC_URL ...
Deploy SanctionsList + ComplianceGate using the deployment script in contracts/script/Deploy.s.sol:

forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
This requires these env vars in contracts/.env:

DEPLOYER_PRIVATE_KEY — wallet that pays gas
ORACLE_ADDRESS — the public address derived from your ORACLE_PRIVATE_KEY in oracle/.env
VERIFIER_ADDRESS — from step 1 above
SEPOLIA_RPC_URL
The deploy script prints the addresses on completion:

SanctionsList:   0xAbCd...
ComplianceGate:  0x1234...
Copy those addresses into:

oracle/.env → SANCTIONS_LIST_ADDRESS=0xAbCd...
frontend/.env.local → VITE_SANCTIONS_LIST_ADDRESS=0xAbCd... and VITE_COMPLIANCE_GATE_ADDRESS=0x1234...
So right now the value is blank because the contracts haven't been deployed yet. Once you run that Foundry script against Sepolia (using the deployer wallet with some SepoliaETH), you'll get the address.




The problem is that $SEPOLIA_RPC_URL is not set in the shell — the .env file exists but the shell hasn't loaded it. forge script doesn't auto-source .env by default.

But there's also a second problem you'll hit immediately after: VERIFIER_ADDRESS is set to the zero address (0x0000...0000), which the deploy script validates against and will reject.

So fix both before running:

Step 1 — Load the env vars into your shell:

cd /home/ubuntu/projects/nullproof/contracts
source .env
Step 2 — You need a real VERIFIER_ADDRESS first

The Verifier.sol contract needs to be deployed separately before you can deploy SanctionsList + ComplianceGate. Check if contracts/src/Verifier.sol exists:

ls contracts/src/Verifier.sol
If it's there (or you've copied it from circuit/target/Verifier.sol), deploy it with:

source .env
forge create contracts/src/Verifier.sol:HonkVerifier \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
This will print the deployed address. Copy that address into contracts/.env as VERIFIER_ADDRESS=0xYourNewAddress.

Step 3 — Then run the main deployment:

source .env   # reload so VERIFIER_ADDRESS is now set
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
The output will print both SanctionsList and ComplianceGate addresses — those go into oracle/.env and frontend/.env.local.

bash (71-72)
 

You're already inside contracts/, so the path contracts/src/Verifier.sol is wrong — it's looking for contracts/contracts/src/. Run it without the contracts/ prefix:

ls src/Verifier.sol
If that also says not found, copy it from where it was already generated:

cp /home/ubuntu/projects/nullproof/circuit/target/Verifier.sol \
   /home/ubuntu/projects/nullproof/contracts/src/Verifier.sol
Then check what the contract is named inside that file so you use the right name in forge create:

grep "^contract " /home/ubuntu/projects/nullproof/contracts/src/Verifier.sol
That will tell you the exact contract name (e.g. HonkVerifier or UltraHonkVerifier) to use in the forge create command. Then proceed with:

source .env
forge create src/Verifier.sol:<ContractNameFromAbove> \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY



For a **ZK dev** or **Web3/blockchain dev** portfolio, the goal is not “most features” — it is **one coherent story** with clear cryptographic and on-chain reasoning. Here is what I would prioritize, how big each upgrade is, and what I can build for you.

---

## What interviewers actually want to see

| Role | They look for |
|------|----------------|
| **ZK dev** | Circuit design, public vs private inputs, soundness, nullifier binding *in-circuit*, verifier integration, honest threat model |
| **Web3 dev** | Solidity patterns, atomic protocol integration, testing, deployment, relayer/meta-tx architecture, production tradeoffs |

NullProof already has a real Noir circuit + on-chain verifier. The gap is **privacy architecture** and **integration realism**. Upgrades should close that gap, not add buzzwords.

---

## Recommended portfolio plan (3 phases)

### Phase 1 — Relayer + SubmissionRouter  
**Priority: High for Web3 · Medium for ZK · Do this first**

**Why:** Fixes the Etherscan problem, shows you understand Ethereum’s identity model (`tx.from` ≠ ZK privacy), and is shippable in days.

| Area | Changes |
|------|---------|
| **Contracts** | New `SubmissionRouter.sol` (~40–60 LOC), deploy script, 5–8 Foundry tests |
| **Backend** | New `oracle/` or `relayer/` service: 1 POST route, EIP-712 verify, `checkCompliant` simulate, broadcast tx (~150–250 LOC) |
| **Frontend** | Replace `writeAssertCompliant` direct wallet path with relay API + optional EIP-712 sign (~80–120 LOC across Ledger, ProofReady, DepositForm) |
| **Config** | Relayer private key, router address in `.env`, Sepolia faucet funding |
| **Docs** | 1 architecture diagram + threat model section in README |

**Effort:** ~2–4 days focused work  
**Interview line:** *“ZK hides the address in the proof; the relayer hides it in the transaction layer.”*

**Skip for now:** ERC-4337, ERC-2771 on Gate (wrong tool for this privacy goal).

---

### Phase 2 — In-circuit nullifier binding  
**Priority: Highest for ZK · High for Web3**

**Why:** This is the upgrade that turns NullProof from “ZK demo with off-chain hacks” into a **real ZK privacy story**. Employers will ask why nullifier is SHA-256 in JS — this answers it cryptographically.

| Area | Changes |
|------|---------|
| **Circuit** | Extend `circuit/src/main.nr`: add `nullifier` as public output, constrain `nullifier = hash(address, root, epoch)` inside Noir (~30–80 LOC + Poseidon wiring) |
| **Prover** | Remove off-chain `deriveNullifier` as source of truth; witness includes nullifier from circuit public outputs (~50 LOC) |
| **Contracts** | Redeploy `HonkVerifier`; optionally Gate checks `publicInputs` include nullifier or add second public input (~20–40 LOC if needed) |
| **Scripts** | Regenerate verifier artifact, update `frontend` ABI/bytecode paths |
| **Tests** | Circuit tests (nargo), Foundry tests with new verifier (~100 LOC) |
| **Docs** | Before/after threat model — this is gold for ZK interviews |

**Effort:** ~1–2 weeks (circuit + regen + deploy + migration)  
**Interview line:** *“Nullifier ownership is proven in-circuit; the relayer never sees an address.”*

This pairs perfectly with Phase 1: relayer accepts **proof only**, no EIP-712 address signature.

---

### Phase 3 — Reference `CompliantVault` (protocol integration)  
**Priority: High for Web3 · Medium for ZK**

**Why:** Shows you read your own contract comments — Gate was meant to be called **inside** `deposit()`, not as a standalone user tx.

| Area | Changes |
|------|---------|
| **Contracts** | `CompliantVault.sol`: `deposit(proof, publicInputs, nullifier)` → `gate.assertCompliant()` → credit internal balance (~80–120 LOC) |
| **Tests** | Happy path, replay, expired root, paused gate, double deposit (~150–200 LOC Foundry) |
| **Frontend** | New “Demo deposit” flow or extend Ledger to deposit ETH through vault (~100–150 LOC) |
| **Docs** | “How integrators use NullProof” — 1-page integration guide |

**Effort:** ~3–5 days  
**Interview line:** *“Compliance is atomic with the DeFi action — revert if proof invalid.”*

Optional stretch: vault called **via relayer** so even the deposit `from` is not the user (stronger privacy, more moving parts).

---

## What I would **not** prioritize for job hunting

| Upgrade | Verdict |
|---------|---------|
| **ERC-4337 + bundler** | High effort, weak privacy story, interviewers will poke holes |
| **Private mempool / Flashbots** | Good ops detail, low portfolio signal unless MEV/infra role |
| **More UI polish** | Nice, but doesn’t differentiate for ZK/Web3 roles |

---

## Suggested timeline (portfolio-ready)

```text
Week 1     Phase 1 — Relayer + Router (demo works, Etherscan clean)
Week 2–3   Phase 2 — In-circuit nullifier (ZK centerpiece)
Week 4     Phase 3 — CompliantVault + integration docs
Ongoing    README: threat model, architecture diagram, “what ZK proves vs what chain sees”
```

Total meaningful diff: **~15–25 files touched**, **2 new contracts**, **1 small backend service**, **circuit v2**.

---

## How to present it on a resume / in interviews

**One-liner:**  
*NullProof — ZK OFAC non-membership proofs with private on-chain submission and DeFi-gated compliance.*

**Talking points (in order):**
1. Indexed Merkle Tree non-membership in Noir (UltraHonk)  
2. On-chain verification via deployed Honk verifier + ComplianceGate  
3. Nullifier anti-replay with epoch-based renewal  
4. Relayer + router for submission privacy (Phase 1)  
5. In-circuit nullifier binding (Phase 2) — *this is your ZK differentiator*  
6. Reference vault integration (Phase 3) — *this is your Web3 differentiator*

---

## Can I build this?

**Yes — with Agent mode enabled**, I can implement all three phases in your repo:

| Phase | Can build? | Notes |
|-------|------------|--------|
| **1 — Relayer + Router** | Yes | Fully in-repo: contract, relayer service, frontend wiring, tests |
| **2 — In-circuit nullifier** | Yes | Requires Noir circuit edits, verifier regen (`nargo`/`bb`), redeploy — I can do it if your toolchain runs in the environment |
| **3 — CompliantVault** | Yes | Solidity + Foundry tests + frontend deposit flow |

**Ask mode (now):** I can only plan and explain — no edits.

**Agent mode:** I can implement incrementally, phase by phase, with tests and docs.

**Honest limits:**
- Sepolia deploy and faucet funding need your keys/RPC  
- Phase 2 needs the Noir/Barretenberg pipeline to succeed locally (I've seen your repo has `circuit/`, `oracle/`, prover worker — should be feasible)  
- I won’t claim “perfect anonymity” — I’ll document what each layer actually hides

---

## My recommendation for **your** goal

If you want **one role**:

- **ZK-focused:** Do **Phase 2 first** (or Phase 1 + 2 back-to-back). Phase 3 is bonus.  
- **Web3-focused:** Do **Phase 1 + 3**. Phase 2 is what separates you from generic dApp devs.  
- **Best overall:** **All three**, in the order above — that’s a complete, defensible portfolio piece.

Switch to **Agent mode** and say which phase to start with (I’d start with **Phase 1** for a quick visible win, then **Phase 2** for the ZK credibility).