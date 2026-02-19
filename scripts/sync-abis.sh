#!/usr/bin/env bash
# =============================================================================
# scripts/sync-abis.sh
#
# Purpose : forge build → extract ABI arrays from Foundry artifacts →
#           copy to frontend/src/lib/chain/abis/
#
# Usage   : bash scripts/sync-abis.sh [--force] [--skip-build]
#           pnpm sync:abis
#
# Flags:
#   --force        Always overwrite destination ABIs even if checksums match
#   --skip-build   Skip 'forge build'; use whatever is already in contracts/out/
#
# Output layout:
#   frontend/src/lib/chain/abis/
#     ComplianceGate.json       ← ABI array only (not the full forge artifact)
#     HonkVerifier.json
#     SanctionsList.json
#     index.ts                  ← re-export barrel, auto-generated
#
# Requirements: bash ≥ 4, forge, jq
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ── Colours ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET="\033[0m"; C_BOLD="\033[1m"
  C_GREEN="\033[0;32m"; C_YELLOW="\033[0;33m"
  C_RED="\033[0;31m";   C_CYAN="\033[0;36m"
  C_DIM="\033[2m"
else
  C_RESET=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_DIM=""
fi

log_step()  { echo -e "\n${C_BOLD}▶ $*${C_RESET}"; }
log_ok()    { echo -e "  ${C_GREEN}✓${C_RESET} $*"; }
log_warn()  { echo -e "  ${C_YELLOW}⚠${C_RESET}  $*"; }
log_error() { echo -e "  ${C_RED}✗${C_RESET} $*" >&2; }
log_info()  { echo -e "  ${C_DIM}$*${C_RESET}"; }
log_skip()  { echo -e "  ${C_CYAN}↷${C_RESET} $* ${C_DIM}(unchanged)${C_RESET}"; }

# ── Arg parsing ───────────────────────────────────────────────────────────────
FLAG_FORCE=0
FLAG_SKIP_BUILD=0

for arg in "$@"; do
  case "${arg}" in
    --force)       FLAG_FORCE=1       ;;
    --skip-build)  FLAG_SKIP_BUILD=1  ;;
    --help|-h)
      grep '^#' "$0" | head -20 | sed 's/^# \?//'
      exit 0
      ;;
    *)
      log_error "Unknown flag: ${arg}  (use --force | --skip-build | --help)"
      exit 1
      ;;
  esac
done

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${REPO_ROOT}/contracts"
FORGE_OUT="${CONTRACTS_DIR}/out"
DEST_DIR="${REPO_ROOT}/frontend/src/lib/chain/abis"
INDEX_FILE="${DEST_DIR}/index.ts"

# ── Contracts to sync ─────────────────────────────────────────────────────────
# Format: "ContractName:SourceFile.sol"
# Source file is the .sol filename that defines the contract (used to locate
# the artifact at out/<SourceFile.sol>/<ContractName>.json).
declare -a CONTRACTS_TO_SYNC=(
  "ComplianceGate:ComplianceGate.sol"
  "HonkVerifier:HonkVerifier.sol"
  "SanctionsList:SanctionsList.sol"
)

# ── Header ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${C_BOLD}    Repo root : ${REPO_ROOT}${C_RESET}"
echo ""
echo -e "${C_BOLD}╔══════════════════════════════════════════╗${C_RESET}"
echo -e "${C_BOLD}║     NullProof — sync-abis.sh             ║${C_RESET}"
echo -e "${C_BOLD}╚══════════════════════════════════════════╝${C_RESET}"
echo -e "  $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
[[ "${FLAG_SKIP_BUILD}" == "1" ]] && log_info "Mode: --skip-build (reusing existing artifacts)"
[[ "${FLAG_FORCE}"      == "1" ]] && log_info "Mode: --force (overwriting all ABIs regardless of checksum)"

# =============================================================================
# STEP 1 — Preflight checks
# =============================================================================
log_step "Preflight checks"

# forge
if ! command -v forge &>/dev/null; then
  log_error "'forge' not found. Install Foundry: https://getfoundry.sh"
  exit 1
fi
FORGE_VERSION="$(forge --version 2>&1 | head -n1)"
log_ok "forge found: ${FORGE_VERSION}"

# jq
if ! command -v jq &>/dev/null; then
  log_error "'jq' not found. Install it:"
  log_info  "  Ubuntu/Debian : sudo apt-get install jq"
  log_info  "  macOS         : brew install jq"
  exit 1
fi
JQ_VERSION="$(jq --version 2>&1)"
log_ok "jq found: ${JQ_VERSION}"

# contracts/ directory
if [[ ! -d "${CONTRACTS_DIR}" ]]; then
  log_error "contracts/ directory not found at ${CONTRACTS_DIR}"
  exit 1
fi
log_ok "contracts dir: ${CONTRACTS_DIR}"

# foundry.toml present
if [[ ! -f "${CONTRACTS_DIR}/foundry.toml" ]]; then
  log_error "foundry.toml not found in ${CONTRACTS_DIR}"
  exit 1
fi

# Resolve actual out dir from foundry.toml (handles custom [profile.default] out = "...")
CUSTOM_OUT="$(grep -E '^\s*out\s*=' "${CONTRACTS_DIR}/foundry.toml" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
if [[ -n "${CUSTOM_OUT}" ]]; then
  FORGE_OUT="${CONTRACTS_DIR}/${CUSTOM_OUT}"
  log_info "foundry.toml overrides out dir → ${FORGE_OUT}"
fi

# =============================================================================
# STEP 2 — forge build
# =============================================================================
log_step "Building contracts (forge build)"

if [[ "${FLAG_SKIP_BUILD}" == "1" ]]; then
  if [[ ! -d "${FORGE_OUT}" ]]; then
    log_error "--skip-build was set but ${FORGE_OUT} does not exist. Run without --skip-build first."
    exit 1
  fi
  log_warn "Skipping forge build — using existing artifacts in ${FORGE_OUT}"
else
  (
    cd "${CONTRACTS_DIR}"
    # --force re-compiles everything, not just dirty files.
    # Without --force foundry uses its cache which is correct for normal runs.
    forge build --silent
  )
  log_ok "forge build completed"
fi

if [[ ! -d "${FORGE_OUT}" ]]; then
  log_error "Expected forge artifacts at ${FORGE_OUT} but directory is missing."
  log_info  "Ensure foundry.toml [profile.default] out is set correctly."
  exit 1
fi

# =============================================================================
# STEP 3 — Prepare destination directory
# =============================================================================
log_step "Preparing destination: ${DEST_DIR}"

mkdir -p "${DEST_DIR}"
log_ok "ABI destination ready"

# =============================================================================
# STEP 4 — Extract ABIs and copy
# =============================================================================
log_step "Syncing ABIs"

SYNCED=0
SKIPPED=0
FAILED=0
SYNCED_NAMES=()

for entry in "${CONTRACTS_TO_SYNC[@]}"; do
  CONTRACT_NAME="${entry%%:*}"
  SOURCE_FILE="${entry##*:}"

  ARTIFACT="${FORGE_OUT}/${SOURCE_FILE}/${CONTRACT_NAME}.json"
  DEST_ABI="${DEST_DIR}/${CONTRACT_NAME}.json"

  # Check artifact exists
  if [[ ! -f "${ARTIFACT}" ]]; then
    log_warn "Artifact not found — skipping ${CONTRACT_NAME}"
    log_info  "  Expected: ${ARTIFACT}"
    log_info  "  Check that ${SOURCE_FILE} defines a contract named '${CONTRACT_NAME}'"
    (( FAILED++ )) || true
    continue
  fi

  # Validate that .abi key exists and is an array
  ABI_TYPE="$(jq -r '.abi | type' "${ARTIFACT}" 2>/dev/null || echo "null")"
  if [[ "${ABI_TYPE}" != "array" ]]; then
    log_error "Artifact for ${CONTRACT_NAME} has no valid .abi array (got: ${ABI_TYPE})"
    log_info  "  ${ARTIFACT}"
    (( FAILED++ )) || true
    continue
  fi

  # Extract ABI array — pretty-printed, deterministic key order
  EXTRACTED_ABI="$(jq --sort-keys '.abi' "${ARTIFACT}")"

  # Checksum comparison — skip write if identical and --force not set
  if [[ -f "${DEST_ABI}" && "${FLAG_FORCE}" == "0" ]]; then
    EXISTING_HASH="$(sha256sum "${DEST_ABI}" | cut -d' ' -f1)"
    NEW_HASH="$(echo "${EXTRACTED_ABI}" | sha256sum | cut -d' ' -f1)"
    if [[ "${EXISTING_HASH}" == "${NEW_HASH}" ]]; then
      ENTRY_COUNT="$(jq 'length' "${DEST_ABI}")"
      log_skip "${CONTRACT_NAME}.json (${ENTRY_COUNT} entries)"
      (( SKIPPED++ )) || true
      SYNCED_NAMES+=("${CONTRACT_NAME}")
      continue
    fi
  fi

  # Write ABI
  echo "${EXTRACTED_ABI}" > "${DEST_ABI}"

  ENTRY_COUNT="$(jq 'length' "${DEST_ABI}")"
  FILE_SIZE="$(du -sh "${DEST_ABI}" | cut -f1)"
  log_ok "${CONTRACT_NAME}.json — ${ENTRY_COUNT} ABI entries (${FILE_SIZE})"
  (( SYNCED++ )) || true
  SYNCED_NAMES+=("${CONTRACT_NAME}")
done

# =============================================================================
# STEP 5 — Generate index.ts barrel
# =============================================================================
log_step "Generating ${INDEX_FILE}"

{
  echo "// AUTO-GENERATED by scripts/sync-abis.sh — do not edit manually"
  echo "// Last synced: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""
  for name in "${SYNCED_NAMES[@]}"; do
    CAMEL_NAME="$(echo "${name}" | sed 's/./\l&/')"
    echo "export { default as ${CAMEL_NAME}Abi } from './${name}.json';"
  done
  echo ""
  echo "// Re-export all ABI filenames as a const tuple for tooling"
  echo "export const ABI_CONTRACT_NAMES = ["
  for name in "${SYNCED_NAMES[@]}"; do
    echo "  '${name}',"
  done
  echo "] as const;"
  echo ""
  echo "export type AbiContractName = (typeof ABI_CONTRACT_NAMES)[number];"
} > "${INDEX_FILE}"

log_ok "index.ts written (${#SYNCED_NAMES[@]} exports)"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "  ${C_BOLD}Summary${C_RESET}"
echo -e "  ${C_GREEN}✓${C_RESET} Synced  : ${SYNCED}"
echo -e "  ${C_DIM}↷${C_RESET} Skipped : ${SKIPPED} (unchanged)"
if [[ "${FAILED}" -gt 0 ]]; then
  echo -e "  ${C_RED}✗${C_RESET} Failed  : ${FAILED} — check warnings above"
fi

echo ""
echo -e "  ${C_DIM}Destination: ${DEST_DIR}${C_RESET}"
echo ""
ls -lh "${DEST_DIR}"
echo ""

if [[ "${FAILED}" -gt 0 ]]; then
  echo -e "  ${C_YELLOW}⚠${C_RESET}  Some contracts were not synced. See warnings above."
  echo -e "  ${C_DIM}Re-run after fixing to ensure the frontend uses correct ABIs.${C_RESET}"
  exit 1
fi

echo -e "${C_GREEN}${C_BOLD}✔ sync-abis.sh completed successfully${C_RESET}"
echo ""
echo -e "  ${C_DIM}Next steps:${C_RESET}"
echo -e "  ${C_DIM}1.  pnpm contracts:test  — run Foundry tests${C_RESET}"
echo -e "  ${C_DIM}2.  pnpm dev             — start frontend (picks up new ABIs)${C_RESET}"
echo -e "  ${C_DIM}3.  git add frontend/src/lib/chain/abis/ && git commit${C_RESET}"
echo ""