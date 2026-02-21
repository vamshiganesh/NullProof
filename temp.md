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