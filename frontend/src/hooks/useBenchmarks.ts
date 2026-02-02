import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkEntry {
  label:       string;   // e.g. "Proof Generation"
  medianMs:    number;
  p95Ms:       number;
  p99Ms:       number;
  samples:     number;
}

export interface BenchmarkSnapshot {
  capturedAt:   string;   // ISO-8601 timestamp
  version:      string;   // circuit/prover version tag
  environment:  string;   // e.g. "MacBook M2 / Chrome 124"
  entries:      BenchmarkEntry[];
}

type BenchmarkStatus = "idle" | "loading" | "success" | "error";

export interface UseBenchmarksReturn {
  snapshot:   BenchmarkSnapshot | null;
  status:     BenchmarkStatus;
  isLoading:  boolean;
  isSuccess:  boolean;
  isError:    boolean;
  error:      string | null;
  refetch:    () => void;
}

// ---------------------------------------------------------------------------
// Default snapshot path — place the file at /public/benchmarks.json
// ---------------------------------------------------------------------------

const SNAPSHOT_PATH = "/benchmarks.json";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBenchmarks(path: string = SNAPSHOT_PATH): UseBenchmarksReturn {
  const [snapshot, setSnapshot] = useState<BenchmarkSnapshot | null>(null);
  const [status,   setStatus]   = useState<BenchmarkStatus>("idle");
  const [error,    setError]    = useState<string | null>(null);
  const [tick,     setTick]     = useState(0);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    setError(null);

    fetch(path)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load benchmarks: HTTP ${res.status}`);
        }
        return res.json() as Promise<BenchmarkSnapshot>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.entries || !Array.isArray(data.entries)) {
          throw new Error("benchmarks.json is malformed: missing entries array");
        }
        setSnapshot(data);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error loading benchmarks");
        setStatus("error");
      });

    return () => { cancelled = true; };
  }, [path, tick]);

  const refetch = () => setTick((t) => t + 1);

  return {
    snapshot,
    status,
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError:   status === "error",
    error,
    refetch,
  };
}
