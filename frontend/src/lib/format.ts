import { formatEther, formatUnits } from "viem";

// ---------------------------------------------------------------------------
// Hash / address formatting
// ---------------------------------------------------------------------------

/**
 * Truncates a 0x hash or address for display.
 * formatHash("0xabc...def", 6, 4) → "0xabc...def"
 * Default: first 6 + last 4 chars  → "0x1234…5678"
 */
export function formatHash(
  hash: string,
  prefixChars = 6,
  suffixChars = 4,
): string {
  if (!hash) return "";
  if (hash.length <= prefixChars + suffixChars) return hash;
  return `${hash.slice(0, prefixChars)}…${hash.slice(-suffixChars)}`;
}

/**
 * Alias for formatHash — semantically clearer when used on addresses.
 * formatAddress("0xAbCd...1234") → "0xAbCd…1234"
 */
export const formatAddress = (address: string): string =>
  formatHash(address, 6, 4);

// ---------------------------------------------------------------------------
// ETH / token amounts
// ---------------------------------------------------------------------------

/**
 * Formats a bigint wei value to a human-readable ETH string.
 * formatETH(1_000_000_000_000_000_000n) → "1.0000 ETH"
 * formatETH(0n)                         → "0.0000 ETH"
 */
export function formatETH(wei: bigint, decimals = 4): string {
  const value = formatEther(wei);
  return `${parseFloat(value).toFixed(decimals)} ETH`;
}

/**
 * Formats a bigint token amount with a custom decimal count and symbol.
 * formatToken(1_500_000n, 6, "USDC", 2) → "1.50 USDC"
 */
export function formatToken(
  amount: bigint,
  tokenDecimals: number,
  symbol: string,
  displayDecimals = 2,
): string {
  const value = formatUnits(amount, tokenDecimals);
  return `${parseFloat(value).toFixed(displayDecimals)} ${symbol}`;
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/**
 * Formats a plain number or bigint with locale-aware thousands separators.
 * formatNum(1234567)   → "1,234,567"
 * formatNum(1234567n)  → "1,234,567"
 * formatNum(0.9876, 2) → "0.99"
 */
export function formatNum(
  value: number | bigint,
  maximumFractionDigits = 0,
): string {
  const n = typeof value === "bigint" ? Number(value) : value;
  return n.toLocaleString("en-US", { maximumFractionDigits });
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable relative time string from a Unix timestamp (seconds).
 * timeAgo(Date.now() / 1000 - 30)    → "30s ago"
 * timeAgo(Date.now() / 1000 - 3700)  → "1h ago"
 * timeAgo(Date.now() / 1000 - 90000) → "1d ago"
 */
export function timeAgo(unixSeconds: number | bigint): string {
  const ts = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  const diffSeconds = Math.floor(Date.now() / 1000 - ts);

  if (diffSeconds < 0)   return "just now";
  if (diffSeconds < 60)  return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  if (diffSeconds < 2_592_000) return `${Math.floor(diffSeconds / 86_400)}d ago`;
  if (diffSeconds < 31_536_000) return `${Math.floor(diffSeconds / 2_592_000)}mo ago`;
  return `${Math.floor(diffSeconds / 31_536_000)}y ago`;
}

/**
 * Formats a Unix timestamp (seconds) as a locale date+time string.
 * formatTimestamp(1700000000) → "Nov 14, 2023, 10:13 PM"
 */
export function formatTimestamp(
  unixSeconds: number | bigint,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  const ts = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  return new Date(ts * 1000).toLocaleString("en-US", options);
}

/**
 * Formats a seconds-duration into a human-readable string.
 * formatDuration(86400n)  → "24h"
 * formatDuration(3600)    → "1h"
 * formatDuration(90)      → "1m 30s"
 */
export function formatDuration(seconds: number | bigint): string {
  const s = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (s < 60)     return `${s}s`;
  if (s < 3600)   return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ""}`.trim();
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

// ---------------------------------------------------------------------------
// Proof / nullifier specific
// ---------------------------------------------------------------------------

/**
 * Formats a bytes32 nullifier for compact display.
 * Shows first 10 + last 6 chars to give more uniqueness signal than a plain address.
 * formatNullifier("0xabcdef...123456") → "0xabcdef…123456"
 */
export const formatNullifier = (nullifier: string): string =>
  formatHash(nullifier, 10, 6);

/**
 * Returns "Valid" | "Expired" | "Unknown" for a proof root timestamp
 * given the current validity window in seconds.
 */
export function proofStatus(
  rootTimestamp: bigint,
  validityWindow: bigint,
): "Valid" | "Expired" | "Unknown" {
  if (rootTimestamp === 0n) return "Unknown";
  const expiresAt = rootTimestamp + validityWindow;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  return nowSeconds <= expiresAt ? "Valid" : "Expired";
}
