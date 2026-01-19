/**
 * writeSnapshot.ts
 *
 * Serialises the IMT snapshot to a JSON file consumed by the frontend prover.
 * Also writes a lightweight manifest (imt-manifest.json) with just the root
 * and metadata — so the frontend can check freshness without loading the full
 * snapshot.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve }  from "node:path";
import { fileURLToPath }     from "node:url";

import type { IMTSnapshot }  from "./buildIMT.js";
import type { PublishResult } from "./publishRoot.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotManifest {
  root:          string;
  addressCount:  number;
  builtAt:       string;
  publishedAt:   string;
  txHash:        string;
  blockNumber:   number;
}

export interface WriteSnapshotResult {
  snapshotPath:  string;
  manifestPath:  string;
  bytesWritten:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveOutputPath(envPath: string | undefined, fallback: string): string {
  const raw = envPath?.trim() || fallback;
  // Resolve relative to oracle/ root (one level up from src/)
  return resolve(__dirname, "..", raw);
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Write the full IMT snapshot + lightweight manifest to disk.
 *
 * @param snapshot - Output of buildIMT()
 * @param publish  - Output of publishRoot()
 */
export async function writeSnapshot(
  snapshot: IMTSnapshot,
  publish:  PublishResult,
): Promise<WriteSnapshotResult> {
  // ── 1. Resolve output paths ────────────────────────────────────────────────
  const snapshotPath = resolveOutputPath(
    process.env["SNAPSHOT_PATH"],
    "../frontend/data/imt-snapshot.json",
  );

  const manifestPath = snapshotPath.replace(
    "imt-snapshot.json",
    "imt-manifest.json",
  );

  // ── 2. Build manifest ──────────────────────────────────────────────────────
  const manifest: SnapshotManifest = {
    root:         snapshot.root,
    addressCount: snapshot.addressCount,
    builtAt:      snapshot.builtAt,
    publishedAt:  publish.publishedAt.toISOString(),
    txHash:       publish.txHash,
    blockNumber:  publish.blockNumber,
  };

  // ── 3. Write both files ────────────────────────────────────────────────────
  await ensureDir(snapshotPath);
  await ensureDir(manifestPath);

  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const manifestJson = JSON.stringify(manifest, null, 2);

  await writeFile(snapshotPath, snapshotJson, "utf-8");
  await writeFile(manifestPath, manifestJson, "utf-8");

  return {
    snapshotPath,
    manifestPath,
    bytesWritten: snapshotJson.length + manifestJson.length,
  };
}
