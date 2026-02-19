#!/usr/bin/env bash
# =============================================================================
# scripts/build-circuit.sh
#
# Purpose : Compile the NullProof Noir circuit, codegen the Solidity verifier,
#           and distribute artifacts to contracts/ and frontend/public/.
#
# Usage   : bash scripts/build-circuit.sh [--skip-frontend]
#           pnpm circuit:compile
#
# Steps
# ─────
#   1. Preflight  — check nargo is installed, print version
#   2. Compile    — nargo compile → circuit/target/nullproof_non_membership.json
#   3. Verifier   — nargo codegen-verifier → copy HonkVerifier.sol to contracts/src/
#   4. Frontend   — copy circuit JSON + extract bytecode → frontend/public/circuits/
#
# Flags
# ─────
#   --skip-frontend   Skip step 4 (useful in pure contracts CI pipelines)
#
# Exit codes
# ──────────
#   0  All steps succeeded
#   1  A required tool is missing or a step failed
# =============================================================================

set -euo pipefail

# ─── Colour helpers ──────────────────────────────────────────────────────────

BOLD=$'\033[1m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
RESET=$'\033[0m'

log_step()  { echo ""; echo "${BOLD}${CYAN}▶ $*${RESET}"; }
log_ok()    { echo "  ${GREEN}✓${RESET} $*"; }
log_warn()  { echo "  ${YELLOW}⚠${RESET}  $*"; }
log_error() { echo "  ${RED}✗${RESET}  $*" >&2; }
log_info()  { echo "    $*"; }

# ─── Parse flags ─────────────────────────────────────────────────────────────

SKIP_FRONTEND=false
for arg in "$@"; do
  case "$arg" in
    --skip-frontend) SKIP_FRONTEND=true ;;
    *) log_error "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ─── Resolve repo root ───────────────────────────────────────────────────────
# This script may be invoked from any working directory (e.g. a CI runner that
# calls `bash scripts/build-circuit.sh` from a different cwd).  We normalise
# to the repo root so all relative paths below are predictable.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

log_info "Repo root : ${REPO_ROOT}"

# ─── Directory / file constants ──────────────────────────────────────────────

CIRCUIT_DIR="${REPO_ROOT}/circuit"
TARGET_DIR="${CIRCUIT_DIR}/target"

# nargo compile output (ACIR + witness map)
CIRCUIT_ARTIFACT="${TARGET_DIR}/nullproof_non_membership.json"

# nargo codegen-verifier output location
# Noir ≥ 0.30: contract lands in circuit/target/contract/HonkVerifier.sol
# Noir < 0.30: contract lands in circuit/contract/plonk_vk.sol
# We probe both and accept whichever exists.
GENERATED_VERIFIER_CANDIDATES=(
  "${TARGET_DIR}/contract/HonkVerifier.sol"
  "${TARGET_DIR}/contract/plonk_vk.sol"
  "${CIRCUIT_DIR}/contract/plonk_vk.sol"
  "${CIRCUIT_DIR}/contract/HonkVerifier.sol"
)

# Destination in the contracts package
CONTRACTS_SRC="${REPO_ROOT}/contracts/src"
DEST_VERIFIER="${CONTRACTS_SRC}/HonkVerifier.sol"

# Frontend circuit artifacts directory (served at /circuits/ by Vite)
FRONTEND_CIRCUITS="${REPO_ROOT}/frontend/public/circuits"

# ─── Timestamp banner ────────────────────────────────────────────────────────

echo ""
echo "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo "${BOLD}║     NullProof — build-circuit.sh         ║${RESET}"
echo "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# =============================================================================
# STEP 1 — Preflight
# =============================================================================

log_step "Preflight checks"

if ! command -v nargo &>/dev/null; then
  log_error "nargo is not installed or not on PATH."
  log_info  "Install Noir:  curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash"
  log_info  "Then run:      noirup"
  exit 1
fi

NARGO_VERSION="$(nargo --version 2>&1 | head -n1)"
log_ok "nargo found: ${NARGO_VERSION}"

if [[ ! -f "${CIRCUIT_DIR}/Nargo.toml" ]]; then
  log_error "circuit/Nargo.toml not found — are you running from the repo root?"
  exit 1
fi

CIRCUIT_NAME="$(grep '^name' "${CIRCUIT_DIR}/Nargo.toml" | head -n1 | sed 's/.*= *"\(.*\)"/\1/')"
log_ok "Circuit name: ${CIRCUIT_NAME}"

# =============================================================================
# STEP 2 — nargo compile
# =============================================================================

log_step "Compiling circuit (nargo compile)"

mkdir -p "${TARGET_DIR}"

(
  cd "${CIRCUIT_DIR}"
  nargo compile
)

if [[ ! -f "${CIRCUIT_ARTIFACT}" ]]; then
  log_error "Expected artifact not found after nargo compile: ${CIRCUIT_ARTIFACT}"
  log_info  "Ensure Nargo.toml package.name matches 'nullproof_non_membership'."
  exit 1
fi

ARTIFACT_SIZE=$(du -sh "${CIRCUIT_ARTIFACT}" | cut -f1)
log_ok "Compiled → circuit/target/nullproof_non_membership.json (${ARTIFACT_SIZE})"

# =============================================================================
# STEP 3 — bb write_vk + bb write_solidity_verifier → contracts/src/HonkVerifier.sol
# =============================================================================

log_step "Generating Solidity verifier (bb write_solidity_verifier)"

# Ensure bb is available
if ! command -v bb &>/dev/null; then
  log_error "'bb' (Barretenberg CLI) not found. Run: bbup"
  exit 1
fi
log_ok "bb found: $(bb --version 2>&1 | head -n1)"

# Generate the EVM-compatible verification key
(
  cd "${CIRCUIT_DIR}"
  bb write_vk \
    -b "${TARGET_DIR}/nullproof_non_membership.json" \
    -o "${TARGET_DIR}" \
    -t evm
)

log_ok "VK saved → ${TARGET_DIR}/vk"

# Generate the Solidity verifier from the VK file
(
  cd "${CIRCUIT_DIR}"
  bb write_solidity_verifier \
    -k "${TARGET_DIR}/vk" \
    -o "${TARGET_DIR}/Verifier.sol"
)

GENERATED_VERIFIER="${TARGET_DIR}/Verifier.sol"

if [[ ! -f "${GENERATED_VERIFIER}" ]]; then
  log_warn "bb write_solidity_verifier ran but Verifier.sol was not found."
  log_warn "Skipping contracts/src/ copy. Copy manually from ${TARGET_DIR}/"
else
  mkdir -p "${CONTRACTS_SRC}"

  cp "${GENERATED_VERIFIER}" "${DEST_VERIFIER}"
  VERIFIER_SIZE=$(du -sh "${DEST_VERIFIER}" | cut -f1)
  log_ok "Verifier copied → contracts/src/HonkVerifier.sol (${VERIFIER_SIZE})"

  if grep -q "function verify(" "${DEST_VERIFIER}"; then
    log_ok "HonkVerifier.sol contains verify() — interface looks correct"
  else
    log_warn "HonkVerifier.sol does not contain a verify() function — check manually."
  fi
fi

# =============================================================================
# STEP 4 — Copy artifacts to frontend/public/circuits/
# =============================================================================

if [[ "${SKIP_FRONTEND}" == "true" ]]; then
  log_step "Frontend artifact copy — SKIPPED (--skip-frontend)"
else
  log_step "Copying circuit artifacts → frontend/public/circuits/"

  mkdir -p "${FRONTEND_CIRCUITS}"

  # 4a. Copy the full circuit JSON (ACIR + witness map)
  FRONTEND_CIRCUIT_JSON="${FRONTEND_CIRCUITS}/nullproof.json"
  cp "${CIRCUIT_ARTIFACT}" "${FRONTEND_CIRCUIT_JSON}"
  log_ok "Circuit JSON → frontend/public/circuits/nullproof.json"

  # 4b. Extract the bytecode field and write it as a standalone hex file.
  #     The in-browser Barretenberg prover (barretenberg.ts) fetches
  #     /circuits/nullproof.bytecode and passes it directly to bb.js.
  #     We use python3 for reliable JSON parsing; fall back to node if absent.
  FRONTEND_BYTECODE="${FRONTEND_CIRCUITS}/nullproof.bytecode"

  if command -v python3 &>/dev/null; then
    python3 - "${CIRCUIT_ARTIFACT}" "${FRONTEND_BYTECODE}" <<'PYEOF'
import json, sys
artifact_path, out_path = sys.argv[1], sys.argv[2]
with open(artifact_path) as f:
    data = json.load(f)
# Noir ACIR artifact: bytecode lives at .bytecode (base64 string in newer Noir)
# or .circuit.bytecode in older versions.
bytecode = (
    data.get("bytecode")
    or data.get("circuit", {}).get("bytecode")
    or ""
)
if not bytecode:
    print("WARNING: could not locate bytecode field in ACIR artifact", file=sys.stderr)
    sys.exit(1)
with open(out_path, "w") as f:
    f.write(bytecode)
PYEOF
    log_ok "Bytecode extracted → frontend/public/circuits/nullproof.bytecode"

  elif command -v node &>/dev/null; then
    node - "${CIRCUIT_ARTIFACT}" "${FRONTEND_BYTECODE}" <<'JSEOF'
const fs = require("fs");
const [, , srcPath, outPath] = process.argv;
const data = JSON.parse(fs.readFileSync(srcPath, "utf8"));
const bytecode = data.bytecode ?? data.circuit?.bytecode ?? "";
if (!bytecode) {
  console.error("WARNING: could not locate bytecode field in ACIR artifact");
  process.exit(1);
}
fs.writeFileSync(outPath, bytecode);
JSEOF
    log_ok "Bytecode extracted via node → frontend/public/circuits/nullproof.bytecode"

  else
    log_warn "Neither python3 nor node found — skipping bytecode extraction."
    log_warn "frontend/public/circuits/nullproof.bytecode will not be created."
    log_warn "The in-browser prover will fall back to the mock backend."
  fi

  # 4c. Summary of frontend artifacts
  echo ""
  log_info "Frontend circuits directory contents:"
  ls -lh "${FRONTEND_CIRCUITS}" | tail -n +2 | while IFS= read -r line; do
    log_info "  ${line}"
  done
fi

# =============================================================================
# Done
# =============================================================================

echo ""
echo "${BOLD}${GREEN}✔ build-circuit.sh completed successfully${RESET}"
echo ""
echo "  Next steps:"
echo "  1.  pnpm sync:abis        — rebuild ABIs after forge build"
echo "  2.  pnpm contracts:test   — run Foundry tests against the new verifier"
echo "  3.  pnpm dev              — start the frontend (uses the new bytecode)"
echo ""