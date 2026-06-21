/**
 * index.ts
 *
 * Oracle entry point. Runs the full pipeline once on startup, then
 * reschedules via cron. Steps:
 *   1. buildCircuitSnapshot — fetch OFAC + build CircuitIMT (sanctions-imt.json)
 *   2. publishRoot          — broadcast updateRoot() to Sepolia
 *   3. writeManifest        — write imt-manifest.json for freshness checks
 */

import { createRequire }    from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath }    from "node:url";

import { buildCircuitSnapshot } from "./buildCircuitSnapshot.js";
import { publishRoot, RootUnchangedError } from "./publishRoot.js";
import { writeManifest }        from "./writeSnapshot.js";

// ── Env ───────────────────────────────────────────────────────────────────────

const require   = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const dotenv = require("dotenv") as { config: (o: { path: string }) => void };
  dotenv.config({ path: resolve(__dirname, "../.env") });
} catch {
  // Running in production with env vars injected directly — fine
}

// ── Logger ────────────────────────────────────────────────────────────────────

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

const MIN_ADDRESS_COUNT = Number(process.env["MIN_ADDRESS_COUNT"] ?? 50);

async function runPipeline(): Promise<void> {
  log("info", "pipeline.start");

  // ── Step 1: Build circuit-exact snapshot (writes sanctions-imt.json) ────────
  log("info", "snapshot.build.start");
  const snapshot = await buildCircuitSnapshot();
  log("info", "snapshot.build.done", {
    root:         snapshot.root,
    addressCount: snapshot.addressCount,
    builtAt:      snapshot.builtAt,
  });

  if (snapshot.addressCount < MIN_ADDRESS_COUNT) {
    throw new Error(
      `Sanity check failed: only ${snapshot.addressCount} addresses parsed ` +
      `(minimum ${MIN_ADDRESS_COUNT}). Feed may be empty or malformed.`,
    );
  }

  // ── Step 2: Publish root ───────────────────────────────────────────────────
  log("info", "publish.start", {
    root:         snapshot.root,
    addressCount: snapshot.addressCount,
  });

  let publish: Awaited<ReturnType<typeof publishRoot>>;
  try {
    publish = await publishRoot(snapshot.root, snapshot.addressCount);
    log("info", "publish.done", {
      txHash:      publish.txHash,
      blockNumber: publish.blockNumber,
      gasUsed:     publish.gasUsed.toString(),
    });
  } catch (err) {
    if (err instanceof RootUnchangedError) {
      log("info", "publish.skipped", { reason: err.message, root: err.root });
      publish = {
        txHash:       "",
        blockNumber:  0,
        previousRoot: err.previousRoot,
        newRoot:      err.root,
        addressCount: snapshot.addressCount,
        gasUsed:      0n,
        publishedAt:  new Date(),
      };
    } else {
      throw err;
    }
  }

  // ── Step 3: Write manifest ─────────────────────────────────────────────────
  log("info", "manifest.write.start");
  const written = await writeManifest(snapshot, publish);
  log("info", "manifest.write.done", {
    snapshotPath: written.snapshotPath,
    manifestPath: written.manifestPath,
    bytesWritten: written.bytesWritten,
  });

  log("info", "pipeline.done", { root: snapshot.root, txHash: publish.txHash });
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/** GitHub Actions / one-shot runs: no local cron, exit with pipeline status. */
const RUN_ONCE =
  process.env["RUN_ONCE"] === "true" ||
  process.env["GITHUB_ACTIONS"] === "true";

async function startScheduler(): Promise<void> {
  if (RUN_ONCE) {
    try {
      await runPipeline();
    } catch (err) {
      log("error", "pipeline.failed", { error: String(err) });
      process.exit(1);
    }
    return;
  }

  const cronExpr = process.env["CRON_SCHEDULE"] ?? "5 0 * * *";

  type CronScheduler = { schedule: (expr: string, fn: () => void) => void };
  let cron: CronScheduler | undefined = undefined;
  try {
    cron = require("node-cron") as CronScheduler;
  } catch {
    log("warn", "node-cron not installed — running once and exiting");
  }

  try {
    await runPipeline();
  } catch (err) {
    log("error", "pipeline.failed", { error: String(err) });
    process.exit(1);
  }

  if (cron === undefined) return;
  const cronSafe = cron;

  log("info", "scheduler.start", { cron: cronExpr });
  cronSafe.schedule(cronExpr, async () => {
    try {
      await runPipeline();
    } catch (err) {
      log("error", "pipeline.failed", { error: String(err) });
    }
  });
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

await startScheduler();
