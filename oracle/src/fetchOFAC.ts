/**
 * fetchOFAC.ts
 *
 * Downloads the OFAC SDN XML feed and extracts every Ethereum address.
 * Returns a deduplicated, checksummed array of addresses.
 */

import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { getAddress, isAddress } from "ethers";

// ── Types ────────────────────────────────────────────────────────────────────

/** A single SDN entry as parsed from the XML */
interface SdnEntry {
  uid:        number;
  lastName:   string;
  sdnType:    string;
  idList?:    { id: IdEntry | IdEntry[] };
}

interface IdEntry {
  idType:   string;
  idNumber: string;
}

interface SdnXml {
  sdnList: {
    sdnEntry: SdnEntry | SdnEntry[];
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SDN_URL =
  "https://www.treasury.gov/ofac/downloads/sdn.xml";

/** OFAC labels the id type as one of these strings for crypto addresses */
const ETH_ID_TYPES = new Set([
  "Digital Currency Address - ETH",
  "Digital Currency Address - ETHW", // ETH PoW fork — same address space
]);

// ── Main export ───────────────────────────────────────────────────────────────

export interface FetchOFACResult {
  addresses:    string[];   // checksummed ETH addresses
  addressCount: number;
  fetchedAt:    Date;
  sourceUrl:    string;
}

/**
 * Fetch the OFAC SDN XML feed and return all Ethereum addresses found.
 *
 * @param sdnUrl - Override the feed URL (defaults to OFAC_SDN_URL env var
 *                 or the official Treasury download URL).
 */
export async function fetchOFACAddresses(
  sdnUrl?: string,
): Promise<FetchOFACResult> {
  const url =
    sdnUrl ??
    process.env["OFAC_SDN_URL"] ??
    DEFAULT_SDN_URL;

  // ── 1. Download ────────────────────────────────────────────────────────────
  const response = await axios.get<string>(url, {
    responseType:       "text",
    timeout:            60_000,          // 60 s — XML is ~10 MB
    decompress:         true,
    headers: {
      "Accept-Encoding": "gzip, deflate",
      "User-Agent":      "nullproof-oracle/1.0 (+https://github.com/nullproof)",
    },
  });

  const xml = response.data;

  // ── 2. Parse ───────────────────────────────────────────────────────────────
  // parseTagValue:false keeps element text as strings instead of converting
  // "0x..." Ethereum hex addresses to JavaScript numbers in scientific notation.
  const parser = new XMLParser({
    ignoreAttributes:        false,
    parseAttributeValue:     true,
    parseTagValue:           false,
    isArray: (tagName) =>
      tagName === "sdnEntry" || tagName === "id",
  });

  const parsed = parser.parse(xml) as SdnXml;
  const entries = normaliseArray(parsed?.sdnList?.sdnEntry);

  // ── 3. Extract ETH addresses ───────────────────────────────────────────────
  const seen  = new Set<string>();
  const addrs: string[] = [];

  for (const entry of entries) {
    const ids = normaliseArray(entry.idList?.id);

    for (const id of ids) {
      if (!ETH_ID_TYPES.has(id.idType)) continue;

      const raw = id.idNumber.trim();

      // Validate it's actually an EVM address before checksumming
      if (!isAddress(raw)) continue;

      const checksummed = getAddress(raw);
      if (seen.has(checksummed)) continue;

      seen.add(checksummed);
      addrs.push(checksummed);
    }
  }

  return {
    addresses:    addrs,
    addressCount: addrs.length,
    fetchedAt:    new Date(),
    sourceUrl:    url,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure a value that may be a single object or an array is always an array */
function normaliseArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}