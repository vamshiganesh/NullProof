/**
 * index.ts
 *
 * Oracle entry point. Runs the full pipeline once on startup, then
 * reschedules via cron. Steps:
 *   1. fetchOFACAddresses  — download + parse OFAC SDN XML
 *   2. buildIMT            — hash addresses, build depth-20 IMT
 *   3. publishRoot         — broadcast updateRoot() to Sepolia
 *   4. writeSnapshot       — serialise tree to frontend/data/
 */

import { createRequire }      from "node:module";
import { writeFile }          from "node:fs/promises";
import { resolve, dirname }   from "node:path";
import { fileURLToPath }      from "node:url";

import { fetchOFACAddresses } from "./fetchOFAC.js";
import { buildIMT }           from "./buildIMT.js";
import { publishRoot }        from "./publishRoot.js";
import { writeSnapshot }      from "./writeSnapshot.js";

// ── Env ───────────────────────────────────────────────────────────────────────

// Load .env before anything else
const require    = createRequire(import.meta.url);
const __dirname  = dirname(fileURLToPath(import.meta.url));

try {
  // dotenv is a common dep — use dynamic require so missing it is non-fatal
  const dotenv = require("dotenv") as { config: (o: { path: string }) => void };
  dotenv.config({ path: resolve(__dirname, "../.env") });
} catch {
  // Running in production with env vars injected directly — fine
}

// ── Logger (inline — avoids circular dep before logger.ts exists) ─────────────

function log(level: "info" | "warn" | "error", msg: string, meta?: unknown): void {
  const line = JSON.stringify({
    ts:    new Date().toISOString(),
    level,
    msg,
    ...(meta !== undefined ? { meta } : {}),
  });
  if (level === "error") process.stderr.write(line + "\n");
  else                   process.stdout.write(line + "\n");
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

const MIN_ADDRESS_COUNT = Number(process.env["MIN_ADDRESS_COUNT"] ?? 100);

async function runPipeline(): Promise<void> {
  log("info", "pipeline.start");

  // ── Step 1: Fetch ──────────────────────────────────────────────────────────
  log("info", "ofac.fetch.start");
  const ofac = await fetchOFACAddresses();
  log("info", "ofac.fetch.done", {
    addressCount: ofac.addressCount,
    sourceUrl:    ofac.sourceUrl,
    fetchedAt:    ofac.fetchedAt.toISOString(),
  });

  if (ofac.addressCount < MIN_ADDRESS_COUNT) {
    throw new Error(
      `Sanity check failed: only ${ofac.addressCount} addresses parsed ` +
      `(minimum ${MIN_ADDRESS_COUNT}). Feed may be empty or malformed.`,
    );
  }

  // ── Step 2: Build IMT ──────────────────────────────────────────────────────
  log("info", "imt.build.start", { addressCount: ofac.addressCount });
  const { root, tree, snapshot } = buildIMT(ofac.addresses);
  log("info", "imt.build.done", { root });

  // ── Step 3: Publish root ───────────────────────────────────────────────────
  log("info", "publish.start", { root, addressCount: ofac.addressCount });
  const publish = await publishRoot(root, ofac.addressCount);
  log("info", "publish.done", {
    txHash:      publish.txHash,
    blockNumber: publish.blockNumber,
    gasUsed:     publish.gasUsed.toString(),
  });

  // ── Step 4: Write snapshot ─────────────────────────────────────────────────
  log("info", "snapshot.write.start");
  const written = await writeSnapshot(snapshot, publish);
  log("info", "snapshot.write.done", {
    snapshotPath: written.snapshotPath,
    manifestPath: written.manifestPath,
    bytesWritten: written.bytesWritten,
  });

  log("info", "pipeline.done", { root, txHash: publish.txHash });
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

async function startScheduler(): Promise<void> {
  const cronExpr = process.env["CRON_SCHEDULE"] ?? "5 0 * * *";

  // Dynamically import node-cron — add to deps only if needed
  type CronScheduler = { schedule: (expr: string, fn: () => void) => void };
  let cron: CronScheduler | undefined = undefined;
  try {
    cron = require("node-cron") as CronScheduler;
  } catch {
    log("warn", "node-cron not installed — running once and exiting");
  }

  // Always run immediately on startup
  try {
    await runPipeline();
  } catch (err) {
    log("error", "pipeline.failed", { error: String(err) });
    if (!cron) process.exit(1);
  }

  if (cron === undefined) return;
  const cronSafe = cron;

  log("info", "scheduler.start", { cron: cronExpr });
  cronSafe.schedule(cronExpr, async () => {
    try {
      await runPipeline();
    } catch (err) {
      log("error", "pipeline.failed", { error: String(err) });
      // Don't exit — keep scheduler alive for next run
    }
  });
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

await startScheduler();