export interface IMTSnapshot {
  root: string;
  depth: number;
  leaves: string[];
  addressCount: number;
  builtAt: string;
}

export interface RootUpdate {
  root: string;
  previousRoot?: string;
  addressCount: number;
  changedCount?: number;
  txHash?: string;
  blockNumber?: number;
  publishedAt: string;
}

export interface BenchmarkRun {
  id: string;
  generatedAt: string;
  durationMs: number;
  durationSeconds: number;
  circuitName: string;
  provingSystem: "UltraHonk";
  constraintCount: number;
  addressCount: number;
  root: string;
  status: "success" | "failed";
  errorMessage?: string;
}

export interface SnapshotManifest {
  root: string;
  addressCount: number;
  builtAt: string;
  publishedAt: string;
  txHash: string;
  blockNumber: number;
}

export interface BenchmarkSummary {
  totalRuns: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  latestDurationMs: number;
  successRate: number;
}
