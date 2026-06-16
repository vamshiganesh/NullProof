/**
 * buildCircuitSnapshot.ts
 *
 * Builds the circuit-exact OFAC snapshot consumed by the in-browser prover
 * (`frontend/public/data/sanctions-imt.json`). Uses the same script as
 * `pnpm snapshot` so the Merkle root matches CircuitIMT / Noir proofs.
 */

import { execFile } from "node:child_process";
import { readFile }  from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "../..");
const SNAPSHOT_PATH = resolve(
  REPO_ROOT,
  "frontend/public/data/sanctions-imt.json",
);

export interface CircuitSnapshot {
  source:       string;
  fetchedAt:    string;
  builtAt:      string;
  depth:        number;
  addressCount: number;
  root:         string;
  entries:      Array<{ address: string; value: string }>;
}

/**
 * Run `pnpm --filter nullproof-frontend snapshot` and return the parsed JSON.
 */
export async function buildCircuitSnapshot(): Promise<CircuitSnapshot> {
  try {
    await execFileAsync(
      "pnpm",
      ["--filter", "nullproof-frontend", "snapshot"],
      {
        cwd:       REPO_ROOT,
        env:       {
          ...process.env,
          // Forward local OFAC XML path when treasury.gov is unreachable.
          ...(process.env["OFAC_XML_PATH"]
            ? { OFAC_XML_PATH: process.env["OFAC_XML_PATH"] }
            : {}),
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
  } catch (err) {
    // If live fetch failed but a recent snapshot exists, reuse it for publish.
    try {
      const raw = await readFile(SNAPSHOT_PATH, "utf-8");
      const existing = JSON.parse(raw) as CircuitSnapshot;
      if (existing.root && existing.addressCount > 0) {
        console.warn(
          "buildCircuitSnapshot: snapshot build failed — reusing existing sanctions-imt.json",
        );
        return existing;
      }
    } catch {
      /* no fallback */
    }
    throw err;
  }

  const raw = await readFile(SNAPSHOT_PATH, "utf-8");
  const snap = JSON.parse(raw) as CircuitSnapshot;

  if (!snap.root || typeof snap.addressCount !== "number") {
    throw new Error(
      "buildCircuitSnapshot: sanctions-imt.json missing root or addressCount",
    );
  }

  return snap;
}

export { SNAPSHOT_PATH };
