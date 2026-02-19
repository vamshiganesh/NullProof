#!/usr/bin/env tsx
// =============================================================================
// scripts/benchmark.ts
//
// Purpose : Run N proof generations against the NullProof circuit,
//           record per-run timing, and report P50 / P95 / P99 / min / max.
//
// Usage   : pnpm benchmark
//           tsx scripts/benchmark.ts [options]
//
// Options:
//   --runs <n>          Number of proof generations to run  (default: 10)
//   --warmup <n>        Warm-up runs excluded from stats    (default: 1)
//   --concurrency <n>   Parallel provers per batch          (default: 1)
//   --output <path>     Write JSON report to file           (default: none)
//   --csv <path>        Write CSV timings to file           (default: none)
//   --wallet <addr>     Fixed wallet address to prove       (default: random)
//   --verbose           Print per-run details               (default: false)
//   --help              Show this message
//
// Requirements: Node ≥ 18, tsx, Barretenberg WASM artifacts in
//               frontend/public/circuits/
// =============================================================================

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Resolve repo root and artifact paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, "..");

const CIRCUITS_DIR   = path.join(REPO_ROOT, "frontend", "public", "circuits");
const BYTECODE_PATH  = path.join(CIRCUITS_DIR, "nullproof.bytecode");
const VK_PATH        = path.join(REPO_ROOT, "circuit", "target", "vk");

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const isTTY = process.stdout.isTTY;
const c = {
  reset:  isTTY ? "\x1b[0m"  : "",
  bold:   isTTY ? "\x1b[1m"  : "",
  dim:    isTTY ? "\x1b[2m"  : "",
  green:  isTTY ? "\x1b[32m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  red:    isTTY ? "\x1b[31m" : "",
  cyan:   isTTY ? "\x1b[36m" : "",
};

const log = {
  step:  (msg: string) => console.log(`\n${c.bold}▶ ${msg}${c.reset}`),
  ok:    (msg: string) => console.log(`  ${c.green}✓${c.reset} ${msg}`),
  warn:  (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`),
  error: (msg: string) => console.error(`  ${c.red}✗${c.reset} ${msg}`),
  info:  (msg: string) => console.log(`  ${c.dim}${msg}${c.reset}`),
  raw:   (msg: string) => console.log(msg),
};

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    runs:        { type: "string",  default: "10"  },
    warmup:      { type: "string",  default: "1"   },
    concurrency: { type: "string",  default: "1"   },
    output:      { type: "string"                   },
    csv:         { type: "string"                   },
    wallet:      { type: "string"                   },
    verbose:     { type: "boolean", default: false  },
    help:        { type: "boolean", default: false  },
  },
  strict: true,
  allowPositionals: false,
});

if (args.help) {
  const header = fs.readFileSync(__filename, "utf8")
    .split("\n")
    .filter(l => l.startsWith("//"))
    .slice(0, 22)
    .map(l => l.replace(/^\/\/ ?/, ""))
    .join("\n");
  console.log(header);
  process.exit(0);
}

const RUNS        = Math.max(1,  parseInt(args.runs        as string, 10));
const WARMUP      = Math.max(0,  parseInt(args.warmup      as string, 10));
const CONCURRENCY = Math.max(1,  parseInt(args.concurrency as string, 10));
const VERBOSE     = args.verbose as boolean;
const OUTPUT_PATH = args.output  as string | undefined;
const CSV_PATH    = args.csv     as string | undefined;
const FIXED_WALLET= args.wallet  as string | undefined;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RunResult {
  run:         number;       // 1-based run index (includes warmup)
  isWarmup:    boolean;
  walletAddr:  string;
  durationMs:  number;
  success:     boolean;
  error?:      string;
  proofBytes?: number;       // byte length of the proof
}

interface Stats {
  count:   number;
  minMs:   number;
  maxMs:   number;
  meanMs:  number;
  p50Ms:   number;
  p75Ms:   number;
  p95Ms:   number;
  p99Ms:   number;
  stddevMs: number;
  totalMs:  number;
}

interface BenchmarkReport {
  meta: {
    timestamp:    string;
    runs:         number;
    warmupRuns:   number;
    concurrency:  number;
    circuitName:  string;
    bytecodeSize: number;
    nodeVersion:  string;
    platform:     string;
    arch:         string;
  };
  stats:   Stats;
  results: RunResult[];
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function computeStats(durations: number[]): Stats {
  const sorted = [...durations].sort((a, b) => a - b);
  const count  = sorted.length;
  const total  = sorted.reduce((s, v) => s + v, 0);
  const mean   = total / count;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count;

  return {
    count,
    minMs:    sorted[0]!,
    maxMs:    sorted[count - 1]!,
    meanMs:   mean,
    p50Ms:    percentile(sorted, 50),
    p75Ms:    percentile(sorted, 75),
    p95Ms:    percentile(sorted, 95),
    p99Ms:    percentile(sorted, 99),
    stddevMs: Math.sqrt(variance),
    totalMs:  total,
  };
}

function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(2)}m`;
  if (ms >= 1_000)  return `${(ms / 1_000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function fmtFixed(ms: number): string {
  return ms.toFixed(1).padStart(8);
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
function renderBar(current: number, total: number, width = 28): string {
  const pct   = current / total;
  const filled = Math.round(pct * width);
  const bar   = "█".repeat(filled) + "░".repeat(width - filled);
  return `[${bar}] ${current}/${total}`;
}

// ---------------------------------------------------------------------------
// Random Ethereum address generator
// ---------------------------------------------------------------------------
function randomAddress(): string {
  const bytes = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
  );
  return `0x${bytes.join("")}`;
}

// ---------------------------------------------------------------------------
// Prover loader — lazy import so the script can do preflight before loading
// the heavy WASM module
// ---------------------------------------------------------------------------
async function loadProver() {
  // Dynamic import — resolves against the monorepo structure.
  // Adjust the path if your prover module lives elsewhere.
  const proverPath = path.join(
    REPO_ROOT,
    "frontend",
    "src",
    "lib",
    "prover",
    "barretenberg.ts",
  );

  try {
    const mod = await import(proverPath);
    if (typeof mod.generateProof !== "function") {
      throw new Error("generateProof export not found in prover module");
    }
    return mod as {
      generateProof: (walletAddress: string) => Promise<{
        proof:        Uint8Array;
        publicInputs: string[];
      }>;
    };
  } catch (err) {
    throw new Error(
      `Failed to load prover module from ${proverPath}:\n${(err as Error).message}\n\n` +
      `Ensure frontend/src/lib/prover/barretenberg.ts exports generateProof().`,
    );
  }
}

// ---------------------------------------------------------------------------
// Single proof run
// ---------------------------------------------------------------------------
async function runOnce(
  prover: Awaited<ReturnType<typeof loadProver>>,
  walletAddress: string,
  runIndex: number,
  isWarmup: boolean,
): Promise<RunResult> {
  const t0 = performance.now();

  try {
    const result = await prover.generateProof(walletAddress);
    const durationMs = performance.now() - t0;

    return {
      run:        runIndex,
      isWarmup,
      walletAddr: walletAddress,
      durationMs,
      success:    true,
      proofBytes: result.proof.byteLength,
    };
  } catch (err) {
    return {
      run:        runIndex,
      isWarmup,
      walletAddr: walletAddress,
      durationMs: performance.now() - t0,
      success:    false,
      error:      (err as Error).message,
    };
  }
}

// ---------------------------------------------------------------------------
// Batch runner with concurrency
// ---------------------------------------------------------------------------
async function runBatch(
  prover:      Awaited<ReturnType<typeof loadProver>>,
  wallets:     string[],
  startIndex:  number,
  isWarmup:    boolean,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < wallets.length; i += CONCURRENCY) {
    const chunk = wallets.slice(i, i + CONCURRENCY);
    const batch = chunk.map((addr, j) =>
      runOnce(prover, addr, startIndex + i + j, isWarmup),
    );
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Progress reporter
// ---------------------------------------------------------------------------
function reportProgress(result: RunResult, completedSoFar: number, totalRuns: number) {
  const tag     = result.isWarmup ? `${c.yellow}warm-up${c.reset}` : `${c.cyan}run${c.reset}`;
  const status  = result.success
    ? `${c.green}✓${c.reset} ${fmtMs(result.durationMs)}`
    : `${c.red}✗${c.reset} ${result.error?.slice(0, 60) ?? "error"}`;
  const bar     = renderBar(completedSoFar, totalRuns);
  const bytes   = result.proofBytes != null ? ` (${result.proofBytes}B)` : "";

  if (VERBOSE) {
    console.log(
      `  ${tag} #${String(result.run).padStart(3)} │ ${status}${bytes} │ ${bar}`,
    );
  } else {
    // Overwrite same line in TTY
    if (isTTY) {
      process.stdout.write(
        `\r  ${bar}  ${c.dim}last: ${fmtMs(result.durationMs)}${c.reset}   `,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Stats table renderer
// ---------------------------------------------------------------------------
function renderStatsTable(stats: Stats): void {
  const w = 14;
  const line = "─".repeat(42);

  console.log(`\n  ${c.bold}Timing Statistics (ms)${c.reset}`);
  console.log(`  ${line}`);

  const row = (label: string, ms: number, highlight = false) => {
    const val = fmtFixed(ms);
    const bar = "▇".repeat(Math.min(20, Math.round((ms / stats.maxMs) * 20)));
    const hl  = highlight ? c.yellow + c.bold : c.reset;
    console.log(
      `  ${hl}${label.padEnd(w)}${c.reset}` +
      `${c.cyan}${val}${c.reset} ms  ` +
      `${c.dim}${bar}${c.reset}`,
    );
  };

  row("min",    stats.minMs);
  row("mean",   stats.meanMs);
  row("p50",    stats.p50Ms);
  row("p75",    stats.p75Ms);
  row("p95",    stats.p95Ms,  true);   // highlighted — key SLA metric
  row("p99",    stats.p99Ms);
  row("max",    stats.maxMs);
  console.log(`  ${line}`);
  row("stddev", stats.stddevMs);
  console.log(`  ${c.dim}total wall time: ${fmtMs(stats.totalMs)}${c.reset}`);
  console.log(`  ${c.dim}sample size    : ${stats.count} proof(s)${c.reset}`);
}

// ---------------------------------------------------------------------------
// P95 assessment
// ---------------------------------------------------------------------------
const P95_BUDGET_MS = 60_000; // 60 s — matches PROOF_GENERATION_TIMEOUT_MS

function assessP95(p95Ms: number): void {
  const pct = ((p95Ms / P95_BUDGET_MS) * 100).toFixed(1);
  if (p95Ms <= P95_BUDGET_MS * 0.5) {
    log.ok(`P95 ${fmtMs(p95Ms)} is well within the ${fmtMs(P95_BUDGET_MS)} budget (${pct}% used) ✓`);
  } else if (p95Ms <= P95_BUDGET_MS * 0.8) {
    log.ok(`P95 ${fmtMs(p95Ms)} is within budget (${pct}% of ${fmtMs(P95_BUDGET_MS)}) — monitor on slower machines`);
  } else if (p95Ms <= P95_BUDGET_MS) {
    log.warn(`P95 ${fmtMs(p95Ms)} is close to the ${fmtMs(P95_BUDGET_MS)} budget (${pct}% used) — consider optimising`);
  } else {
    log.error(`P95 ${fmtMs(p95Ms)} EXCEEDS the ${fmtMs(P95_BUDGET_MS)} budget — proof generation will timeout in production`);
  }
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------
function writeJsonReport(report: BenchmarkReport, filePath: string): void {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(report, null, 2), "utf8");
  log.ok(`JSON report → ${abs}`);
}

function writeCsvReport(results: RunResult[], filePath: string): void {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const header = "run,isWarmup,walletAddr,durationMs,success,proofBytes,error";
  const rows = results.map(r =>
    [
      r.run,
      r.isWarmup ? "1" : "0",
      r.walletAddr,
      r.durationMs.toFixed(3),
      r.success ? "1" : "0",
      r.proofBytes ?? "",
      r.error ? `"${r.error.replace(/"/g, "'")}"` : "",
    ].join(","),
  );

  fs.writeFileSync(abs, [header, ...rows].join("\n") + "\n", "utf8");
  log.ok(`CSV timings → ${abs}`);
}

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------
function preflight(): void {
  log.step("Preflight checks");

  // Bytecode artifact
  if (!fs.existsSync(BYTECODE_PATH)) {
    log.error(`Circuit bytecode not found: ${BYTECODE_PATH}`);
    log.info ("Run 'pnpm circuit:compile' first to generate circuit artifacts.");
    process.exit(1);
  }
  const bytecodeSize = fs.statSync(BYTECODE_PATH).size;
  log.ok(`Bytecode: ${BYTECODE_PATH} (${(bytecodeSize / 1024).toFixed(1)} KB)`);

  // VK artifact (non-fatal — warn only)
  if (!fs.existsSync(VK_PATH)) {
    log.warn(`Verification key not found at ${VK_PATH} — proof verification will be skipped`);
  } else {
    log.ok(`VK: ${VK_PATH}`);
  }

  // Node version check
  const [major] = process.versions.node.split(".").map(Number);
  if ((major ?? 0) < 18) {
    log.error(`Node.js ≥ 18 required (found ${process.version})`);
    process.exit(1);
  }
  log.ok(`Node.js ${process.version}`);

  // Config summary
  log.info(`Runs: ${RUNS} (+${WARMUP} warmup)  concurrency: ${CONCURRENCY}`);
  if (FIXED_WALLET) log.info(`Fixed wallet: ${FIXED_WALLET}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("");
  console.log(`${c.bold}    Repo root : ${REPO_ROOT}${c.reset}`);
  console.log("");
  console.log(`${c.bold}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║     NullProof — benchmark.ts             ║${c.reset}`);
  console.log(`${c.bold}╚══════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${new Date().toISOString()}`);

  preflight();

  // ── Load prover ────────────────────────────────────────────────────────
  log.step("Loading prover (Barretenberg WASM)");
  const prover = await loadProver();
  log.ok("Prover loaded");

  // ── Generate wallet addresses ──────────────────────────────────────────
  const totalRuns  = WARMUP + RUNS;
  const wallets    = Array.from({ length: totalRuns }, (_, i) =>
    FIXED_WALLET ?? randomAddress(),
  );

  // ── Warmup ─────────────────────────────────────────────────────────────
  const allResults: RunResult[] = [];

  if (WARMUP > 0) {
    log.step(`Warm-up (${WARMUP} run${WARMUP > 1 ? "s" : ""} — excluded from stats)`);
    const warmupWallets = wallets.slice(0, WARMUP);
    const warmupResults = await runBatch(prover, warmupWallets, 1, true);

    for (const r of warmupResults) {
      allResults.push(r);
      reportProgress(r, allResults.length, totalRuns);
    }
    if (!VERBOSE && isTTY) process.stdout.write("\n");

    const warmupFailed = warmupResults.filter(r => !r.success);
    if (warmupFailed.length > 0) {
      log.warn(`${warmupFailed.length} warmup run(s) failed — prover may not be fully initialised`);
      warmupFailed.forEach(r => log.info(`  run #${r.run}: ${r.error}`));
    } else {
      log.ok(`Warm-up complete (${warmupResults.map(r => fmtMs(r.durationMs)).join(", ")})`);
    }
  }

  // ── Benchmark runs ─────────────────────────────────────────────────────
  log.step(`Benchmark (${RUNS} run${RUNS > 1 ? "s" : ""}${CONCURRENCY > 1 ? `, concurrency ${CONCURRENCY}` : ""})`);

  const benchWallets = wallets.slice(WARMUP);
  const benchResults = await runBatch(prover, benchWallets, WARMUP + 1, false);

  for (const r of benchResults) {
    allResults.push(r);
    reportProgress(r, allResults.length, totalRuns);
  }
  if (!VERBOSE && isTTY) process.stdout.write("\n");

  // ── Stats ──────────────────────────────────────────────────────────────
  log.step("Results");

  const successfulRuns = benchResults.filter(r => r.success);
  const failedRuns     = benchResults.filter(r => !r.success);

  if (failedRuns.length > 0) {
    log.warn(`${failedRuns.length}/${RUNS} run(s) failed:`);
    failedRuns.forEach(r => log.info(`  run #${r.run}: ${r.error}`));
  }

  if (successfulRuns.length === 0) {
    log.error("All benchmark runs failed. Cannot compute statistics.");
    process.exit(1);
  }

  const durations = successfulRuns.map(r => r.durationMs);
  const stats     = computeStats(durations);

  renderStatsTable(stats);

  // ── P95 assessment ─────────────────────────────────────────────────────
  log.step("P95 Assessment");
  assessP95(stats.p95Ms);

  if (successfulRuns.length < RUNS) {
    log.warn(`Only ${successfulRuns.length}/${RUNS} runs succeeded — P95 may not be representative`);
  }

  // ── Proof size summary ─────────────────────────────────────────────────
  const proofSizes = successfulRuns
    .map(r => r.proofBytes)
    .filter((b): b is number => b != null);

  if (proofSizes.length > 0) {
    const avgBytes = proofSizes.reduce((s, v) => s + v, 0) / proofSizes.length;
    log.ok(`Proof size: ${proofSizes[0]} bytes (avg ${avgBytes.toFixed(0)}B across ${proofSizes.length} runs)`);
  }

  // ── Build report ───────────────────────────────────────────────────────
  const bytecodeSize = fs.statSync(BYTECODE_PATH).size;

  const report: BenchmarkReport = {
    meta: {
      timestamp:    new Date().toISOString(),
      runs:         RUNS,
      warmupRuns:   WARMUP,
      concurrency:  CONCURRENCY,
      circuitName:  "nullproof_non_membership",
      bytecodeSize,
      nodeVersion:  process.version,
      platform:     process.platform,
      arch:         process.arch,
    },
    stats,
    results: allResults,
  };

  // ── Write outputs ──────────────────────────────────────────────────────
  if (OUTPUT_PATH) {
    log.step("Writing report");
    writeJsonReport(report, OUTPUT_PATH);
  }

  if (CSV_PATH) {
    if (!OUTPUT_PATH) log.step("Writing report");
    writeCsvReport(allResults, CSV_PATH);
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  console.log("");
  const exitCode = failedRuns.length > 0 || stats.p95Ms > P95_BUDGET_MS ? 1 : 0;

  if (exitCode === 0) {
    console.log(`${c.green}${c.bold}✔ benchmark.ts completed — P95 within budget${c.reset}`);
  } else {
    console.log(`${c.yellow}${c.bold}⚠  benchmark.ts completed with warnings — review P95 and failures above${c.reset}`);
  }

  console.log("");
  console.log(`  ${c.dim}To save results: tsx scripts/benchmark.ts --output reports/bench-$(date +%Y%m%d).json --csv reports/bench-$(date +%Y%m%d).csv${c.reset}`);
  console.log("");

  process.exit(exitCode);
}

main().catch(err => {
  log.error(`Unhandled error: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});