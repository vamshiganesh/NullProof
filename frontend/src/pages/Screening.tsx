// frontend/src/pages/Screening.tsx
//
// Route: /app/screening — Address Screening (off-chain, read-only)
//
// Lets anyone paste ANY Ethereum address and check it against the live OFAC
// sanctions snapshot using the exact Indexed Merkle Tree non-membership logic
// the ZK circuit uses. This is purely a client-side computation:
//   • No wallet connection required
//   • No transaction, no on-chain submission, no nullifier
//   • Identical tree math to the circuit (circuitImt.ts) so the verdict matches
//     what a real proof would assert
//
// Two verdicts:
//   CLEAR      — address is NOT a leaf; we surface the non-membership witness
//                (low-leaf interval lowValue < query < nextValue) as evidence.
//   SANCTIONED — address IS a leaf; no non-membership proof can be built.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button, Card } from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { formatHash } from "@/lib/format";
import { addrUrl } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SanctionsSnapshot {
  source:       string;
  fetchedAt:    string;
  builtAt:      string;
  depth:        number;
  addressCount: number;
  root:         string;
  entries:      { address: string; value: string }[];
}

interface ClearResult {
  verdict:          "clear";
  address:          string;
  queryValue:       string;
  lowLeafValue:     string;
  lowLeafNextValue: string;
  lowLeafIndex:     number;
  root:             string;
}

interface SanctionedResult {
  verdict:       "sanctioned";
  address:       string;
  queryValue:    string;
  matchedEntry:  { address: string; value: string } | null;
}

type ScreenResult = ClearResult | SanctionedResult;

type Phase = "idle" | "checking" | "done" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function shortValue(v: string): string {
  // u64 decimal — group with thin separators for readability
  return BigInt(v).toLocaleString("en-US");
}

// Snapshot is cached at module scope across mounts (it never changes per build).
let _snapshotCache: SanctionsSnapshot | null = null;

async function loadSnapshot(): Promise<SanctionsSnapshot> {
  if (_snapshotCache) return _snapshotCache;
  const res = await fetch("/data/sanctions-imt.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load OFAC snapshot (HTTP ${res.status})`);
  const snap = (await res.json()) as SanctionsSnapshot;
  if (!Array.isArray(snap.entries)) throw new Error("Snapshot has no entries array");
  _snapshotCache = snap;
  return snap;
}

// ---------------------------------------------------------------------------
// Icons (inline, stroke-based to match the app)
// ---------------------------------------------------------------------------

function ShieldCheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M14 14l-3.2-3.2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  mono = true,
  accent = false,
}: {
  label:   string;
  value:   React.ReactNode;
  mono?:   boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[11px] uppercase tracking-widest text-[#646464] shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={[
          "text-right text-[13px] break-all",
          mono ? "font-mono" : "",
          accent ? "text-emerald-400" : "text-[#d4d4d4]",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Off-chain badge
// ---------------------------------------------------------------------------

function OffChainNote() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2.5">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-sky-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 5.5v3M8 11h.01" />
      </svg>
      <span className="text-[12px] text-[#a0a0a0]">
        Read-only · runs entirely in your browser · <span className="text-[#d4d4d4]">no wallet</span> and <span className="text-[#d4d4d4]">no on-chain submission</span>. This is a lookup tool, not an attestation.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Screening() {
  const [input, setInput]     = useState("");
  const [phase, setPhase]     = useState<Phase>("idle");
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<ScreenResult | null>(null);
  const [meta, setMeta]       = useState<{ addressCount: number; builtAt: string; root: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Warm the snapshot + populate meta on mount (so the header shows live stats).
  useEffect(() => {
    let cancelled = false;
    void loadSnapshot()
      .then((s) => {
        if (cancelled) return;
        setMeta({ addressCount: s.addressCount, builtAt: s.builtAt, root: s.root });
      })
      .catch(() => { /* surfaced on first check */ });
    return () => { cancelled = true; };
  }, []);

  const runScreen = useCallback(async (raw: string) => {
    const address = raw.trim();
    setError(null);
    setResult(null);

    if (!ADDRESS_RE.test(address)) {
      setPhase("error");
      setError("Enter a valid 42-character Ethereum address (0x + 40 hex characters).");
      return;
    }

    setPhase("checking");
    try {
      const [snapshot, imt] = await Promise.all([
        loadSnapshot(),
        import("@/lib/prover/circuitImt"),
      ]);

      const { CircuitIMT, addressToValue } = imt;
      const values     = snapshot.entries.map((e) => BigInt(e.value));
      const tree       = CircuitIMT.fromValues(values, snapshot.depth);
      const queryValue = addressToValue(address);

      // Ground-truth direct membership check (authoritative by address string).
      const lower = address.toLowerCase();
      const directMatch =
        snapshot.entries.find((e) => e.address.toLowerCase() === lower) ?? null;

      try {
        const witness = tree.nonMembershipWitness(queryValue);
        // No exception → not a leaf → CLEAR.
        // (If a direct match somehow existed we'd have thrown SANCTIONED; guard anyway.)
        if (directMatch) {
          setResult({
            verdict:      "sanctioned",
            address,
            queryValue:   queryValue.toString(),
            matchedEntry: directMatch,
          });
        } else {
          setResult({
            verdict:          "clear",
            address,
            queryValue:       witness.queryValue.toString(),
            lowLeafValue:     witness.lowLeafValue.toString(),
            lowLeafNextValue: witness.lowLeafNextValue.toString(),
            lowLeafIndex:     witness.lowLeafIndex,
            root:             "0x" + witness.root.toString(16).padStart(64, "0"),
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "SANCTIONED") {
          setResult({
            verdict:      "sanctioned",
            address,
            queryValue:   queryValue.toString(),
            matchedEntry: directMatch,
          });
        } else {
          throw e;
        }
      }

      setPhase("done");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Screening failed unexpectedly.");
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void runScreen(input);
    },
    [input, runScreen],
  );

  // Load a sample sanctioned address for one-click demo.
  const handleSample = useCallback(async () => {
    try {
      const snap = await loadSnapshot();
      const sample = snap.entries[0];
      if (!sample) return;
      setInput(sample.address);
      inputRef.current?.focus();
      void runScreen(sample.address);
    } catch {
      /* ignore */
    }
  }, [runScreen]);

  const reset = useCallback(() => {
    setInput("");
    setResult(null);
    setError(null);
    setPhase("idle");
    inputRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 py-8 sm:px-8">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-white">Address Screening</h1>
          <p className="mt-1 text-[13px] text-[#646464]">
            Check any wallet against the live OFAC sanctions list using the circuit&apos;s Indexed Merkle Tree
          </p>
        </div>
        {meta && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[18px] font-bold leading-none text-white">{meta.addressCount}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-[#646464]">Sanctioned</p>
            </div>
            <div className="h-8 w-px bg-[#262626]" />
            <div>
              <p className="font-mono text-[13px] leading-none text-emerald-400">{formatHash(meta.root, 6, 4)}</p>
              <p className="mt-1.5 text-[10px] uppercase tracking-widest text-[#646464]">Merkle root</p>
            </div>
          </div>
        )}
      </div>

      <OffChainNote />

      {/* ── Input ───────────────────────────────────────────────────── */}
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="screen-addr" className="text-[11px] uppercase tracking-widest text-[#646464]">
            Wallet address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a5a5a]">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                id="screen-addr"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="0x0000000000000000000000000000000000000000"
                spellCheck={false}
                autoComplete="off"
                className={[
                  "h-11 w-full rounded-lg border bg-[#0d0d0d] pl-9 pr-3",
                  "font-mono text-[13px] text-[#e0e0e0] placeholder:text-[#3a3a3a]",
                  "transition-colors outline-none",
                  "border-[#2a2a2a] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30",
                ].join(" ")}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={phase === "checking"}
              className="sm:w-44"
            >
              {phase === "checking" ? "Screening…" : "Screen Address"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <button
              type="button"
              onClick={handleSample}
              className="text-[12px] text-sky-400 transition-colors hover:text-sky-300"
            >
              Try a sanctioned address →
            </button>
            {(result || error) && (
              <button
                type="button"
                onClick={reset}
                className="text-[12px] text-[#646464] transition-colors hover:text-[#a0a0a0]"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </Card>

      {/* ── Error ───────────────────────────────────────────────────── */}
      {phase === "error" && error && (
        <Card accent="rose">
          <div className="flex items-start gap-3">
            <AlertIcon className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <p className="text-[13px] font-semibold text-rose-300">Could not screen address</p>
              <p className="mt-1 text-[12px] text-[#a0a0a0]">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Result: SANCTIONED ──────────────────────────────────────── */}
      {phase === "done" && result?.verdict === "sanctioned" && (
        <Card accent="rose" className="border-rose-500/30">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10">
                  <AlertIcon className="h-6 w-6 text-rose-400" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-rose-300">Sanctioned</h2>
                  <p className="text-[12px] text-[#a0a0a0]">This address is on the OFAC list</p>
                </div>
              </div>
              <Badge variant="error" label="FLAGGED" />
            </div>

            <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-[12.5px] leading-relaxed text-[#c4a0a0]">
              The address maps to a leaf that exists in the sanctions tree. A non-membership
              proof <span className="font-semibold text-rose-300">cannot</span> be generated —
              the ZK circuit would reject any attempt, exactly as it does on-chain.
            </p>

            <div className="divide-y divide-[#1f1f1f] rounded-lg border border-[#1f1f1f] bg-[#0d0d0d] px-4">
              <DetailRow
                label="Address"
                value={
                  <a href={addrUrl(result.address)} target="_blank" rel="noreferrer" className="text-rose-300 underline decoration-rose-500/30 underline-offset-2 hover:text-rose-200">
                    {result.address}
                  </a>
                }
              />
              <DetailRow label="u64 fingerprint" value={shortValue(result.queryValue)} />
              {result.matchedEntry && (
                <DetailRow label="Matched leaf value" value={shortValue(result.matchedEntry.value)} />
              )}
              <DetailRow label="Verdict" value={<span className="text-rose-300">Member of sanctions tree</span>} mono={false} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Result: CLEAR ───────────────────────────────────────────── */}
      {phase === "done" && result?.verdict === "clear" && (
        <Card accent="emerald" className="border-emerald-500/30">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
                  <ShieldCheckIcon className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-emerald-300">Clear</h2>
                  <p className="text-[12px] text-[#a0a0a0]">Not found on the OFAC list</p>
                </div>
              </div>
              <Badge variant="valid" label="NON-SANCTIONED" />
            </div>

            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-[12.5px] leading-relaxed text-[#9ec4ad]">
              A valid non-membership witness exists: the address fingerprint falls strictly
              between two adjacent leaves, so it cannot itself be a leaf. This is the same
              proof the circuit would build before generating a ZK attestation.
            </p>

            {/* Interval visualization */}
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0d] p-4">
              <p className="mb-3 text-[11px] uppercase tracking-widest text-[#646464]">
                Non-membership interval
              </p>
              <div className="flex items-center gap-2 font-mono text-[12px]">
                <span className="rounded bg-[#161616] px-2 py-1 text-[#a0a0a0]" title="Low leaf value">
                  {shortValue(result.lowLeafValue)}
                </span>
                <span className="text-[#5a5a5a]">&lt;</span>
                <span className="rounded bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-400" title="Your address fingerprint">
                  {shortValue(result.queryValue)}
                </span>
                <span className="text-[#5a5a5a]">&lt;</span>
                <span className="rounded bg-[#161616] px-2 py-1 text-[#a0a0a0]" title="Next leaf value">
                  {shortValue(result.lowLeafNextValue)}
                </span>
              </div>
            </div>

            <div className="divide-y divide-[#1f1f1f] rounded-lg border border-[#1f1f1f] bg-[#0d0d0d] px-4">
              <DetailRow
                label="Address"
                value={
                  <a href={addrUrl(result.address)} target="_blank" rel="noreferrer" className="underline decoration-[#333] underline-offset-2 hover:text-white">
                    {result.address}
                  </a>
                }
              />
              <DetailRow label="u64 fingerprint" value={shortValue(result.queryValue)} accent />
              <DetailRow label="Low leaf index" value={`#${result.lowLeafIndex}`} />
              <DetailRow label="Merkle root" value={formatHash(result.root, 12, 10)} />
            </div>

            <p className="text-center text-[11px] text-[#5a5a5a]">
              To produce a submittable on-chain attestation, connect this wallet on the Dashboard and generate a ZK proof.
            </p>
          </div>
        </Card>
      )}

      {/* ── Idle hint ───────────────────────────────────────────────── */}
      {phase === "idle" && (
        <Card>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <SearchIcon className="h-6 w-6 text-[#3a3a3a]" />
            <p className="text-[13px] text-[#a0a0a0]">Paste any address to screen it</p>
            <p className="max-w-md text-[12px] text-[#5a5a5a]">
              The check runs the circuit&apos;s exact Indexed Merkle Tree logic locally — clean
              addresses get a non-membership witness, sanctioned ones are flagged.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

export default Screening;
