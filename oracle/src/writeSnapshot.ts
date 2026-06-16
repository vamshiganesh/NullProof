/**
 * writeSnapshot.ts
 *
 * Writes imt-manifest.json beside sanctions-imt.json so the frontend can
 * check snapshot freshness without loading the full entry list.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve }  from "node:path";
import { fileURLToPath }     from "node:url";

import type { CircuitSnapshot } from "./buildCircuitSnapshot.js";
import type { PublishResult }   from "./publishRoot.js";

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

function resolveManifestPath(): string {
  const envPath = process.env["MANIFEST_PATH"]?.trim();
  if (envPath) {
    return resolve(__dirname, "..", envPath);
  }
  return resolve(
    __dirname,
    "../../frontend/public/data/imt-manifest.json",
  );
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Write the lightweight manifest after a successful on-chain publish.
 * The full snapshot lives at frontend/public/data/sanctions-imt.json.
 */
export async function writeManifest(
  snapshot: CircuitSnapshot,
  publish:  PublishResult,
): Promise<WriteSnapshotResult> {
  const snapshotPath = resolve(
    __dirname,
    "../../frontend/public/data/sanctions-imt.json",
  );
  const manifestPath = resolveManifestPath();

  const manifest: SnapshotManifest = {
    root:         snapshot.root,
    addressCount: snapshot.addressCount,
    builtAt:      snapshot.builtAt,
    publishedAt:  publish.publishedAt.toISOString(),
    txHash:       publish.txHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
    blockNumber:  publish.blockNumber,
  };

  await ensureDir(manifestPath);

  const manifestJson = JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, manifestJson, "utf-8");

  return {
    snapshotPath,
    manifestPath,
    bytesWritten: manifestJson.length,
  };
}
