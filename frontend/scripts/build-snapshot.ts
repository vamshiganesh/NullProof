// frontend/scripts/build-snapshot.ts
//
// Fetches the LIVE OFAC SDN list, extracts every sanctioned Ethereum address,
// maps each to the circuit's u64 value space, builds the Indexed Merkle Tree,
// and writes a snapshot consumed by the in-browser prover.
//
// Uses fast-xml-parser (same as the oracle) for robust, complete extraction.
// Includes both "ETH" and "ETHW" id types — ETHW shares the same address
// space as ETH so any ETHW-tagged address is a valid ETH address.
//
// Run from the frontend/ directory:
//   node --experimental-strip-types scripts/build-snapshot.ts [/path/to/sdn.xml]
//
// Or via npm script (fetches live data):
//   pnpm snapshot

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";
import { getAddress, isAddress } from "ethers";

import { addressToValue, CircuitIMT, TREE_DEPTH } from "../src/lib/prover/circuitImt.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Official OFAC SDN feed
const SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";

// OFAC tags Ethereum addresses under both ETH and ETHW.
// ETHW (EthereumPoW fork) uses the exact same address format and address
// space, so an ETHW-tagged address is identical to its ETH equivalent.
const ETH_ID_TYPES = new Set([
  "Digital Currency Address - ETH",
  "Digital Currency Address - ETHW",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdEntry {
  idType:   string;
  idNumber: string;
}

interface SdnEntry {
  uid:      number;
  lastName: string;
  sdnType:  string;
  idList?:  { id: IdEntry | IdEntry[] };
}

interface SdnXml {
  sdnList: { sdnEntry: SdnEntry | SdnEntry[] };
}

interface SanctionEntry {
  address: string; // checksummed 0x address
  value:   string; // u64 fingerprint as decimal string
}

interface Snapshot {
  source:       string;
  fetchedAt:    string;
  builtAt:      string;
  depth:        number;
  addressCount: number;
  root:         string;
  entries:      SanctionEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// ---------------------------------------------------------------------------
// XML loading
// ---------------------------------------------------------------------------

async function loadXml(): Promise<string> {
  // Accept a pre-downloaded file via env var or CLI arg (CI caches, sandboxes).
  const localPath = process.env["OFAC_XML_PATH"] ?? process.argv[2];
  if (localPath) {
    console.log(`Reading OFAC SDN from local file: ${localPath}`);
    return readFileSync(localPath, "utf-8");
  }

  console.log("Fetching OFAC SDN list from treasury.gov…");
  const res = await fetch(SDN_URL, {
    headers: { "User-Agent": "nullproof-oracle/1.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`OFAC fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const fetchedAt = new Date();
  const xml = await loadXml();
  console.log(`Loaded ${(xml.length / 1_000_000).toFixed(1)} MB of SDN XML`);

  // Parse the full XML document (robust — handles all whitespace / nesting)
  // parseTagValue:false keeps element text as strings instead of converting
  // "0x098B..." hex addresses to JavaScript numbers (scientific notation).
  const parser = new XMLParser({
    ignoreAttributes:    false,
    parseAttributeValue: true,
    parseTagValue:       false,
    isArray: (tagName) => tagName === "sdnEntry" || tagName === "id",
  });

  const parsed = parser.parse(xml) as SdnXml;
  const entries = normaliseArray(parsed?.sdnList?.sdnEntry);

  // Extract all ETH + ETHW addresses (same address space)
  const seen  = new Set<string>();
  const addrs: string[] = [];

  for (const entry of entries) {
    const ids = normaliseArray(entry.idList?.id);
    for (const id of ids) {
      if (!ETH_ID_TYPES.has(id.idType)) continue;
      const raw = String(id.idNumber ?? "").trim();
      if (!isAddress(raw)) continue;
      const checksummed = getAddress(raw);
      if (seen.has(checksummed)) continue;
      seen.add(checksummed);
      addrs.push(checksummed);
    }
  }

  console.log(`Extracted ${addrs.length} unique sanctioned ETH addresses`);
  if (addrs.length === 0) {
    throw new Error(
      "Sanity check failed: zero ETH addresses parsed. " +
      "The XML may be malformed or the OFAC format may have changed."
    );
  }

  // Map to circuit u64 values, dedupe collisions, sort ascending
  const byValue = new Map<bigint, string>();
  for (const addr of addrs) {
    const v = addressToValue(addr);
    if (!byValue.has(v)) byValue.set(v, addr);
  }

  const sortedValues = Array.from(byValue.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const sanctionEntries: SanctionEntry[] = sortedValues.map((v) => ({
    address: byValue.get(v)!,
    value:   v.toString(),
  }));

  // Build circuit-exact IMT and compute root
  const tree = CircuitIMT.fromValues(sortedValues);
  const root = "0x" + tree.root.toString(16).padStart(64, "0");

  console.log(`IMT root:              ${root}`);
  console.log(`Leaf count (w/ sentinels): ${tree.leaves.length}`);

  const snapshot: Snapshot = {
    source:       SDN_URL,
    fetchedAt:    fetchedAt.toISOString(),
    builtAt:      new Date().toISOString(),
    depth:        TREE_DEPTH,
    addressCount: sanctionEntries.length,
    root,
    entries:      sanctionEntries,
  };

  const outPath = resolve(__dirname, "../public/data/sanctions-imt.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");

  console.log(`Wrote snapshot  → ${outPath}`);
  console.log(`Done. ${sanctionEntries.length} ETH addresses, root ${root.slice(0, 18)}…`);
  console.log(
    `\nNote: The OFAC SDN list has 17,600+ total entries, but only ~${sanctionEntries.length}` +
    ` are Ethereum wallet addresses. All others are individuals, organizations,` +
    ` physical addresses, Bitcoin/USDT/XRP wallets, etc. — none of which can be` +
    ` compared against an Ethereum wallet address.`
  );
}

main().catch((e) => {
  console.error("Snapshot build failed:", e);
  process.exit(1);
});
