// frontend/src/pages/ProtocolCircuit.tsx
//
// Route: /app/protocol?tab=circuit
//
// The circuit explorer — a comprehensive technical reference for the
// NullProof ZK circuit. Organised into five panels:
//
//   1. Circuit Identity     — name, proving system, version, artifact URLs
//   2. Proof Pipeline       — the 4-step proof flow, with visual connector
//   3. Witness Schema       — private + public inputs with type annotations
//   4. IMT Architecture     — tree depth, hash fn, leaf structure, diagram
//   5. Artifacts Inspector  — live HEAD check for each circuit file

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  
  import { formatHash, formatDuration } from "@/lib/format";
  import {
    MERKLE_TREE_DEPTH,
    PROOF_PUBLIC_INPUT_COUNT,
    PROOF_GENERATION_TIMEOUT_MS,
  } from "@/lib/constants";
  import { getCircuitArtifactUrls } from "@/lib/prover/barretenberg";
  import type { ProofStepId } from "@/types/proof";
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  type ArtifactStatus = "idle" | "checking" | "ok" | "missing" | "error";
  
  interface ArtifactState {
    url:    string;
    label:  string;
    status: ArtifactStatus;
    size?:  string | undefined;
    error?: string | undefined;
  }
  
  // ---------------------------------------------------------------------------
  // Static circuit metadata
  // ---------------------------------------------------------------------------
  
  const CIRCUIT_NAME = "nullproof";
  const PROVING_SYSTEM = "UltraHonk (Barretenberg)";
  const HASH_FUNCTION = "Poseidon2";
  const TREE_DEPTH = MERKLE_TREE_DEPTH;          // 20
  const MAX_LEAVES = 2 ** TREE_DEPTH;            // ~1M
  const PUBLIC_INPUT_COUNT = PROOF_PUBLIC_INPUT_COUNT; // 1
  const TIMEOUT_S = PROOF_GENERATION_TIMEOUT_MS / 1_000;
  
  // Circuit guarantee statements
  const GUARANTEES = [
    {
      id: "non-membership",
      title: "Non-Membership",
      body: "Proves the queried address is absent from the indexed Merkle tree without revealing the address itself.",
    },
    {
      id: "zero-knowledge",
      title: "Zero-Knowledge",
      body: "The verifier (on-chain or off-chain) learns only the Merkle root and the nullifier — no wallet address is ever disclosed.",
    },
    {
      id: "soundness",
      title: "Binding Soundness",
      body: "The nullifier is deterministically derived from walletAddress × root × lowLeafIndex, making it impossible to reuse a proof across different roots.",
    },
    {
      id: "succinctness",
      title: "Succinctness",
      body: "UltraHonk proof size is O(log n) in witness size. Verification gas on-chain is constant regardless of the number of sanctioned addresses.",
    },
  ];
  
  // Witness fields
  interface WitnessField {
    name:       string;
    type:       string;
    visibility: "private" | "public";
    description: string;
  }
  
  const WITNESS_FIELDS: WitnessField[] = [
    {
      name:       "walletAddress",
      type:       "Field",
      visibility: "private",
      description: "The Ethereum address being proven absent from the sanctions list.",
    },
    {
      name:       "queriedLeaf",
      type:       "Field",
      visibility: "private",
      description: "Poseidon2 hash of the queried address, used as the leaf value to search for.",
    },
    {
      name:       "root",
      type:       "Field",
      visibility: "public",
      description: "Current Merkle root of the sanctions IMT — the single public input verified on-chain.",
    },
    {
      name:       "lowLeaf",
      type:       "Field",
      visibility: "private",
      description: "The lower-bound leaf whose value is strictly less than the queried leaf, proving non-membership.",
    },
    {
      name:       "lowLeafIndex",
      type:       "u32",
      visibility: "private",
      description: "Index of the low-leaf in the tree, used together with the address to bind the nullifier.",
    },
    {
      name:       `siblings[${TREE_DEPTH}]`,
      type:       "Field",
      visibility: "private",
      description: `Array of ${TREE_DEPTH} sibling nodes forming the Merkle authentication path from the low-leaf to the root.`,
    },
    {
      name:       `pathIndices[${TREE_DEPTH}]`,
      type:       "u1",
      visibility: "private",
      description: "Bit array indicating whether each sibling is on the left (0) or right (1) at each level.",
    },
    {
      name:       "nullifier",
      type:       "Field",
      visibility: "private",
      description: "keccak256(walletAddress ∥ root ∥ lowLeafIndex) — prevents proof replay across different roots.",
    },
    {
      name:       "addressCount",
      type:       "u64",
      visibility: "private",
      description: "Number of addresses currently in the snapshot, used for range checks inside the circuit.",
    },
  ];
  
  // Proof pipeline steps
  interface PipelineStep {
    id:          ProofStepId;
    label:       string;
    description: string;
    detail:      string;
    icon:        React.ReactNode;
  }
  
  const PIPELINE_STEPS: PipelineStep[] = [
    {
      id:          "fetch-imt-path",
      label:       "Fetch IMT Path",
      description: "Find lower leaf, reconstruct Merkle path",
      detail:      "The oracle or local snapshot is queried to locate the low-leaf for the queried address and build the `IMTPath` object containing siblings and pathIndices.",
      icon:        <DatabaseIcon className="h-4 w-4" />,
    },
    {
      id:          "execute-witness",
      label:       "Execute Witness",
      description: "Prepare private inputs, derive nullifier",
      detail:      "All private witness fields are assembled in-browser. The nullifier is derived via keccak256 and the full witness record is validated before proving.",
      icon:        <WitnessIcon className="h-4 w-4" />,
    },
    {
      id:          "generate-ultrahonk-proof",
      label:       "Generate UltraHonk Proof",
      description: "Run Barretenberg backend on circuit bytecode",
      detail:      "The Barretenberg WASM backend executes the UltraHonk prover against the compiled circuit bytecode and the witness. This is the compute-intensive step (~5–20s on consumer hardware).",
      icon:        <CircuitIcon className="h-4 w-4" />,
    },
    {
      id:          "proof-ready",
      label:       "Proof Ready",
      description: "Proof + public inputs available for submission",
      detail:      "The resulting proof bytes and public inputs array (containing the Merkle root) are returned. The proof can be submitted directly to ComplianceGate.verify() on Sepolia.",
      icon:        <ShieldIcon className="h-4 w-4" />,
    },
  ];
  
  // ---------------------------------------------------------------------------
  // useCopy
  // ---------------------------------------------------------------------------
  
  function useCopy(duration = 1500) {
    const [copied, setCopied] = useState<string | null>(null);
    const t = useRef<ReturnType<typeof setTimeout>>();
    const copy = useCallback((text: string, key: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        clearTimeout(t.current);
        setCopied(key);
        t.current = setTimeout(() => setCopied(null), duration);
      });
    }, [duration]);
    useEffect(() => () => clearTimeout(t.current), []);
    return { copied, copy };
  }
  
  // ---------------------------------------------------------------------------
  // Artifact HEAD-check hook
  // ---------------------------------------------------------------------------
  
  function useArtifactCheck(urls: { url: string; label: string }[]) {
    const [artifacts, setArtifacts] = useState<ArtifactState[]>(
      urls.map(({ url, label }) => ({ url, label, status: "idle" })),
    );
  
    const check = useCallback(async () => {
      setArtifacts((prev) => prev.map((a) => ({ ...a, status: "checking" })));
  
      const next = await Promise.all(
        urls.map(async ({ url, label }): Promise<ArtifactState> => {
          try {
            const res = await fetch(url, { method: "HEAD" });
            if (!res.ok) {
              return { url, label, status: "missing", error: `HTTP ${res.status}` };
            }
            const cl = res.headers.get("content-length");
            const size = cl
              ? cl.length > 6
                ? `${(Number(cl) / 1024 / 1024).toFixed(1)} MB`
                : `${(Number(cl) / 1024).toFixed(0)} KB`
              : undefined;
            return { url, label, status: "ok", size };
          } catch (err) {
            return {
              url,
              label,
              status: "error",
              error: err instanceof Error ? err.message : "Network error",
            };
          }
        }),
      );
  
      setArtifacts(next);
    }, [urls]);
  
    useEffect(() => {
      void check();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
    return { artifacts, recheck: check };
  }
  
  // ---------------------------------------------------------------------------
  // IMT Tree diagram — pure SVG
  // ---------------------------------------------------------------------------
  
  function IMTDiagram() {
    // Show depth=4 visual for illustration (actual depth is TREE_DEPTH=20)
    const VISUAL_DEPTH = 4;
    const W = 320;
    const H = 160;
    const nodeR = 9;
    const levelH = H / (VISUAL_DEPTH + 1);
  
    // Build nodes for a complete binary tree of depth 4
    type Node = { x: number; y: number; label: string; isLowLeaf?: boolean; isRoot?: boolean };
    const nodes: Node[] = [];
  
    function addLevel(depth: number, count: number, offsetX: number) {
      const y = padTop + depth * levelH;
      const slotW = (W - 2 * padLeft) / count;
      for (let i = 0; i < count; i++) {
        const x = padLeft + offsetX + i * slotW + slotW / 2;
        const isRoot = depth === 0;
        const isLowLeaf = depth === VISUAL_DEPTH && i === 1;
        nodes.push({ x, y, label: isRoot ? "root" : isLowLeaf ? "low" : "", isRoot, isLowLeaf });
      }
    }
  
    const padTop = 16;
    const padLeft = 16;
  
    for (let d = 0; d <= VISUAL_DEPTH; d++) {
      addLevel(d, 2 ** d, 0);
    }
  
    // Build edges (parent → children)
    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    let nodeIdx = 0;
    let levelStart = 0;
  
    for (let d = 0; d < VISUAL_DEPTH; d++) {
      const count = 2 ** d;
      for (let i = 0; i < count; i++) {
        const parent = nodes[levelStart + i];
        const childLeft  = nodes[levelStart + count + i * 2];
        const childRight = nodes[levelStart + count + i * 2 + 1];
        if (parent && childLeft)  edges.push({ x1: parent.x, y1: parent.y, x2: childLeft.x,  y2: childLeft.y });
        if (parent && childRight) edges.push({ x1: parent.x, y1: parent.y, x2: childRight.x, y2: childRight.y });
      }
      levelStart += count;
      nodeIdx += count;
    }
  
    // Highlight path from low-leaf (index 1, bottom row) to root
    // nodes bottom row starts at index 1+2+4+8 = 15
    const bottomStart = (2 ** (VISUAL_DEPTH + 1)) - 2; // index of first bottom node
    const lowLeafNodeIdx = bottomStart + 1; // second leaf
    const highlightPath = new Set<number>();
  
    // Walk up from low leaf to root
    let cur = lowLeafNodeIdx;
    while (cur > 0) {
      highlightPath.add(cur);
      cur = Math.floor((cur - 1) / 2);
    }
    highlightPath.add(0); // root
  
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Indexed Merkle Tree diagram showing authentication path"
      >
        {/* Edges */}
        {edges.map(({ x1, y1, x2, y2 }, i) => (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#27272a"
            strokeWidth="1"
          />
        ))}
  
        {/* Nodes */}
        {nodes.map((node, i) => {
          const isHighlighted = highlightPath.has(i);
          return (
            <g key={i}>
              <circle
                cx={node.x} cy={node.y} r={nodeR}
                fill={
                  node.isRoot ? "#1a626b"
                  : node.isLowLeaf ? "#bb653b"
                  : isHighlighted ? "#313b3b"
                  : "#1c1b19"
                }
                stroke={
                  node.isRoot ? "#4f98a3"
                  : node.isLowLeaf ? "#bb653b"
                  : isHighlighted ? "#4f98a3"
                  : "#27272a"
                }
                strokeWidth={isHighlighted || node.isRoot || node.isLowLeaf ? "1.5" : "1"}
              />
              {node.label && (
                <text
                  x={node.x} y={node.y + 3.5}
                  textAnchor="middle"
                  fontSize="6"
                  fill={node.isRoot ? "#4f98a3" : "#bb653b"}
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}
  
        {/* Legend */}
        <g transform={`translate(8, ${H - 20})`}>
          <circle cx="6" cy="6" r="5" fill="#1a626b" stroke="#4f98a3" strokeWidth="1.5" />
          <text x="14" y="10" fontSize="7" fill="#52525b" fontFamily="ui-monospace,monospace">root</text>
          <circle cx="50" cy="6" r="5" fill="#bb653b" stroke="#bb653b" strokeWidth="1.5" />
          <text x="58" y="10" fontSize="7" fill="#52525b" fontFamily="ui-monospace,monospace">low leaf</text>
          <circle cx="100" cy="6" r="5" fill="#313b3b" stroke="#4f98a3" strokeWidth="1.5" />
          <text x="108" y="10" fontSize="7" fill="#52525b" fontFamily="ui-monospace,monospace">auth path</text>
          <text x="160" y="10" fontSize="7" fill="#3f3f46" fontFamily="ui-monospace,monospace">depth={TREE_DEPTH} (shown: {VISUAL_DEPTH})</text>
        </g>
      </svg>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Section wrapper
  // ---------------------------------------------------------------------------
  
  function Section({
    icon,
    title,
    badge,
    children,
    defaultOpen = true,
  }: {
    icon:         React.ReactNode;
    title:        string;
    badge?:       React.ReactNode;
    children:     React.ReactNode;
    defaultOpen?: boolean;
  }) {
    const [open, setOpen] = useState(defaultOpen);
  
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 border-b border-zinc-800 px-4 py-3 text-left transition-colors hover:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
          aria-expanded={open}
        >
          <span className="text-zinc-600">{icon}</span>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {title}
          </h2>
          {badge && <span className="ml-1">{badge}</span>}
          <span className={["ml-auto text-zinc-700 transition-transform duration-200", open ? "rotate-180" : ""].join(" ")}>
            <ChevronDownIcon className="h-3 w-3" />
          </span>
        </button>
  
        <div className={["overflow-hidden transition-all duration-300", open ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"].join(" ")}>
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Field badge
  // ---------------------------------------------------------------------------
  
  function VisibilityBadge({ v }: { v: "private" | "public" }) {
    return (
      <span className={[
        "rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
        v === "public"
          ? "border-teal-500/20 bg-teal-500/8 text-teal-400"
          : "border-zinc-700 bg-zinc-800/60 text-zinc-500",
      ].join(" ")}>
        {v}
      </span>
    );
  }
  
  function TypeBadge({ t }: { t: string }) {
    return (
      <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">
        {t}
      </span>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Artifact row
  // ---------------------------------------------------------------------------
  
  function ArtifactRow({ artifact }: { artifact: ArtifactState }) {
    const statusIcon: Record<ArtifactStatus, React.ReactNode> = {
      idle:     <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />,
      checking: <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />,
      ok:       <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />,
      missing:  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />,
      error:    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />,
    };
    const statusLabel: Record<ArtifactStatus, string> = {
      idle:     "—",
      checking: "Checking…",
      ok:       "Reachable",
      missing:  "Not found",
      error:    "Error",
    };
    const statusColor: Record<ArtifactStatus, string> = {
      idle:     "text-zinc-600",
      checking: "text-zinc-600",
      ok:       "text-teal-400",
      missing:  "text-amber-400",
      error:    "text-rose-400",
    };
  
    return (
      <div className="flex items-center gap-3 border-b border-zinc-800/50 py-2.5 last:border-b-0">
        <div className="flex items-center gap-2">
          {statusIcon[artifact.status]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-zinc-400">{artifact.label}</p>
          <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-600">{artifact.url}</p>
        </div>
        <div className="flex items-center gap-2 text-right">
          {artifact.size && (
            <span className="font-mono text-[9px] text-zinc-600">{artifact.size}</span>
          )}
          {artifact.error && (
            <span className="font-mono text-[9px] text-rose-500">{artifact.error}</span>
          )}
          <span className={["text-[9px] font-medium", statusColor[artifact.status]].join(" ")}>
            {statusLabel[artifact.status]}
          </span>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ProtocolCircuit page
  // ---------------------------------------------------------------------------
  
  export function ProtocolCircuit() {
    const { copied, copy } = useCopy();
  
    // Artifacts
    const artifactDefs = React.useMemo(() => {
      const urls = getCircuitArtifactUrls();
      return [
        { url: urls.bytecodeUrl,        label: "Circuit Bytecode (.bytecode)" },
        { url: urls.witnessUrl ?? "",   label: "WASM Prover (.wasm)" },
        { url: urls.verificationKeyUrl ?? "", label: "Verification Key (.vk.json)" },
      ].filter((a) => a.url !== "");
    }, []);
  
    const { artifacts, recheck } = useArtifactCheck(artifactDefs);
    const [recheckSpinning, setRecheckSpinning] = useState(false);
  
    const handleRecheck = useCallback(async () => {
      setRecheckSpinning(true);
      await recheck();
      setRecheckSpinning(false);
    }, [recheck]);
  
    // Active pipeline step on hover
    const [activeStep, setActiveStep] = useState<ProofStepId | null>(null);
  
    // Mount animation
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      const id = setTimeout(() => setMounted(true), 40);
      return () => clearTimeout(id);
    }, []);
  
    const allArtifactsOk = artifacts.every((a) => a.status === "ok");
    const anyMissing     = artifacts.some((a) => a.status === "missing" || a.status === "error");
  
    return (
      <div
        className={[
          "flex flex-col gap-5 p-4 pb-12 sm:p-6 lg:p-8 transition-all duration-500",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
      >
        {/* ── Page header ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Circuit Explorer</h1>
            <p className="mt-0.5 text-xs text-zinc-600">
              NullProof ZK circuit · UltraHonk (Barretenberg) · depth {TREE_DEPTH}
            </p>
          </div>
  
          {/* Artifact health badge */}
          <div className={[
            "flex items-center gap-2 self-start rounded-xl border px-3 py-1.5",
            allArtifactsOk
              ? "border-teal-500/20 bg-teal-500/5"
              : anyMissing
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-zinc-800 bg-zinc-900/30",
          ].join(" ")}>
            <span className={[
              "h-1.5 w-1.5 rounded-full",
              allArtifactsOk ? "bg-teal-500" : anyMissing ? "bg-amber-500" : "bg-zinc-600",
            ].join(" ")} />
            <span className={[
              "text-[10px] font-medium",
              allArtifactsOk ? "text-teal-400" : anyMissing ? "text-amber-400" : "text-zinc-500",
            ].join(" ")}>
              {allArtifactsOk ? "Artifacts available" : anyMissing ? "Artifacts missing" : "Checking…"}
            </span>
          </div>
        </div>
  
        {/* ── 1. Circuit Identity ─────────────────────────────────────── */}
        <Section icon={<IdentityIcon className="h-3.5 w-3.5" />} title="Circuit Identity">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { label: "Circuit Name",     value: CIRCUIT_NAME,            mono: true  },
              { label: "Proving System",   value: PROVING_SYSTEM,          mono: false },
              { label: "Hash Function",    value: HASH_FUNCTION,           mono: true  },
              { label: "Tree Depth",       value: String(TREE_DEPTH),      mono: true  },
              { label: "Max Leaves",       value: `2^${TREE_DEPTH} ≈ ${(MAX_LEAVES / 1_000_000).toFixed(1)}M`, mono: true },
              { label: "Public Inputs",    value: String(PUBLIC_INPUT_COUNT), mono: true },
              { label: "Timeout Budget",   value: `${TIMEOUT_S}s`,         mono: true  },
              { label: "Proof Type",       value: "Non-Membership",        mono: false },
            ].map(({ label, value, mono }) => (
              <div
                key={label}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
              >
                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">{label}</p>
                <p className={["mt-1.5 text-sm font-medium text-zinc-200 truncate", mono ? "font-mono" : ""].join(" ")}>
                  {value}
                </p>
              </div>
            ))}
          </div>
  
          {/* Guarantee cards */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GUARANTEES.map(({ id, title, body }) => (
              <div key={id} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/20 p-3.5">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden="true" />
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300">{title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
  
        {/* ── 2. Proof Pipeline ───────────────────────────────────────── */}
        <Section icon={<FlowIcon className="h-3.5 w-3.5" />} title="Proof Pipeline">
          {/* Detail pane at top — shows on step hover */}
          <div className={[
            "mb-4 rounded-xl border transition-all duration-200",
            activeStep
              ? "border-teal-500/15 bg-teal-500/3 opacity-100"
              : "border-zinc-800/50 bg-zinc-900/20 opacity-70",
          ].join(" ")}>
            <div className="p-3.5">
              {activeStep ? (
                (() => {
                  const step = PIPELINE_STEPS.find((s) => s.id === activeStep)!;
                  return (
                    <>
                      <p className="text-[10px] font-semibold text-teal-400">{step.label}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{step.detail}</p>
                    </>
                  );
                })()
              ) : (
                <p className="text-[10px] text-zinc-700">Hover a step to see its implementation detail.</p>
              )}
            </div>
          </div>
  
          {/* Step connectors */}
          <div className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0">
            {PIPELINE_STEPS.map((step, i) => {
              const isLast   = i === PIPELINE_STEPS.length - 1;
              const isActive = activeStep === step.id;
  
              return (
                <React.Fragment key={step.id}>
                  {/* Step card */}
                  <button
                    className={[
                      "group flex flex-1 flex-col gap-2 rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none",
                      isActive
                        ? "border-teal-500/25 bg-teal-500/6"
                        : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50",
                    ].join(" ")}
                    onMouseEnter={() => setActiveStep(step.id)}
                    onMouseLeave={() => setActiveStep(null)}
                    onFocus={() => setActiveStep(step.id)}
                    onBlur={() => setActiveStep(null)}
                    aria-label={`Step ${i + 1}: ${step.label}`}
                  >
                    {/* Number + icon */}
                    <div className="flex items-center gap-2">
                      <span className={[
                        "flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-bold",
                        isActive
                          ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
                          : "border-zinc-800 bg-zinc-900 text-zinc-600",
                      ].join(" ")}>
                        {i + 1}
                      </span>
                      <span className={isActive ? "text-teal-400" : "text-zinc-600"}>
                        {step.icon}
                      </span>
                    </div>
  
                    {/* Label + description */}
                    <div>
                      <p className={[
                        "text-[11px] font-semibold leading-snug",
                        isActive ? "text-teal-300" : "text-zinc-400",
                      ].join(" ")}>
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-snug text-zinc-600">
                        {step.description}
                      </p>
                    </div>
                  </button>
  
                  {/* Connector arrow */}
                  {!isLast && (
                    <div className="flex items-center justify-center py-2 sm:px-1 sm:py-0 sm:pt-4">
                      <ArrowRightIcon className="h-2.5 w-2.5 rotate-90 text-zinc-700 sm:rotate-0" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
  
          {/* Flow summary */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-700">Flow:</span>
            {["Oracle / Snapshot", "Witness Builder", "Barretenberg WASM", "ComplianceGate.verify()"].map((node, i, arr) => (
              <React.Fragment key={node}>
                <span className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-0.5 font-mono text-[9px] text-zinc-500">
                  {node}
                </span>
                {i < arr.length - 1 && <ArrowRightIcon className="h-2 w-2 text-zinc-700" />}
              </React.Fragment>
            ))}
          </div>
        </Section>
  
        {/* ── 3. Witness Schema ───────────────────────────────────────── */}
        <Section
          icon={<WitnessIcon className="h-3.5 w-3.5" />}
          title="Witness Schema"
          badge={
            <div className="flex items-center gap-1.5">
              <span className="rounded-full border border-teal-500/20 bg-teal-500/8 px-1.5 py-0.5 text-[8px] font-semibold text-teal-400">
                {WITNESS_FIELDS.filter((f) => f.visibility === "public").length} public
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[8px] font-semibold text-zinc-500">
                {WITNESS_FIELDS.filter((f) => f.visibility === "private").length} private
              </span>
            </div>
          }
        >
          {/* Public inputs callout */}
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-teal-500/15 bg-teal-500/4 px-3.5 py-2.5">
            <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-teal-500" />
            <p className="text-[10px] text-teal-300">
              <strong>Only 1 public input</strong> — the Merkle <code className="font-mono text-[9px]">root</code> — is revealed to the verifier.
              All other inputs remain private inside the proof, including the wallet address.
            </p>
          </div>
  
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Field", "Type", "Visibility", "Description"].map((h) => (
                    <th key={h} className="pb-2 pr-4 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WITNESS_FIELDS.map((field) => {
                  const ck = `field-${field.name}`;
                  return (
                    <tr
                      key={field.name}
                      className="group border-b border-zinc-800/50 transition-colors hover:bg-zinc-900/30"
                    >
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-[10px] text-zinc-300">{field.name}</code>
                          <button
                            onClick={() => copy(field.name, ck)}
                            aria-label={copied === ck ? "Copied" : `Copy ${field.name}`}
                            className={[
                              "rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
                              "border transition-all duration-200 focus-visible:outline-none",
                              "opacity-0 group-hover:opacity-100",
                              copied === ck
                                ? "border-teal-500/25 text-teal-400"
                                : "border-zinc-800 text-zinc-700 hover:border-zinc-700 hover:text-zinc-500",
                            ].join(" ")}
                          >
                            {copied === ck ? "✓" : "copy"}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <TypeBadge t={field.type} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <VisibilityBadge v={field.visibility} />
                      </td>
                      <td className="py-2.5">
                        <p className="text-[10px] leading-relaxed text-zinc-600">{field.description}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
  
          {/* Noir snippet */}
          <details className="mt-4">
            <summary className="cursor-pointer select-none text-[10px] font-medium text-zinc-600 hover:text-zinc-400 focus-visible:outline-none">
              Show Noir struct sketch
            </summary>
            <div className="relative mt-2 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60">
              <button
                onClick={() => copy(NOIR_SKETCH, "noir-sketch")}
                aria-label={copied === "noir-sketch" ? "Copied" : "Copy Noir sketch"}
                className={[
                  "absolute right-3 top-3 rounded-lg border px-2 py-1 text-[8px] font-semibold uppercase tracking-wide transition-all duration-200 focus-visible:outline-none",
                  copied === "noir-sketch"
                    ? "border-teal-500/25 bg-teal-500/8 text-teal-400"
                    : "border-zinc-800 bg-zinc-900/80 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400",
                ].join(" ")}
              >
                {copied === "noir-sketch" ? "✓ Copied" : "Copy"}
              </button>
              <pre className="overflow-x-auto p-4 font-mono text-[10px] leading-relaxed text-zinc-400">
                <code>{NOIR_SKETCH}</code>
              </pre>
            </div>
          </details>
        </Section>
  
        {/* ── 4. IMT Architecture ─────────────────────────────────────── */}
        <Section icon={<TreeIcon className="h-3.5 w-3.5" />} title="Indexed Merkle Tree">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Diagram */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Authentication Path (visual, depth={VISUAL_DEPTH_LABEL})
              </p>
              <IMTDiagram />
            </div>
  
            {/* Property table */}
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                  Tree Properties
                </p>
                <div className="space-y-0 divide-y divide-zinc-800">
                  {[
                    { k: "Type",        v: "Indexed Merkle Tree (IMT)" },
                    { k: "Depth",       v: `${TREE_DEPTH} levels` },
                    { k: "Capacity",    v: `${(MAX_LEAVES / 1_000_000).toFixed(0)}M leaves` },
                    { k: "Hash fn",     v: "Poseidon2 (BN254 field)" },
                    { k: "Zero value",  v: "0x00…00 (empty leaf)" },
                    { k: "Leaf value",  v: "Poseidon2(address)" },
                    { k: "Ordering",    v: "Lexicographic by leaf value" },
                  ].map(({ k, v }) => (
                    <div key={k} className="flex items-center justify-between py-2">
                      <span className="text-[10px] text-zinc-600">{k}</span>
                      <span className="font-mono text-[10px] text-zinc-400">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
  
              {/* Non-membership proof explanation */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-3.5">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                  Non-Membership Proof Logic
                </p>
                <ol className="space-y-1.5 text-[10px] leading-relaxed text-zinc-600">
                  <li><span className="font-mono text-zinc-500">1.</span> Find the <strong className="text-zinc-400">low leaf</strong> — the largest leaf value strictly less than <code className="font-mono text-[9px]">queriedLeaf</code></li>
                  <li><span className="font-mono text-zinc-500">2.</span> Provide a Merkle path authenticating the low leaf to the root</li>
                  <li><span className="font-mono text-zinc-500">3.</span> The circuit asserts: <code className="font-mono text-[9px]">lowLeaf &lt; queriedLeaf &lt; nextLeaf</code></li>
                  <li><span className="font-mono text-zinc-500">4.</span> If this holds, the queried address cannot exist in the tree</li>
                </ol>
              </div>
  
              {/* Leaf struct */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-3">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                  Leaf Structure
                </p>
                <div className="space-y-0 divide-y divide-zinc-800">
                  {[
                    { f: "index",   t: "u32",        note: "Position in the tree"       },
                    { f: "value",   t: "HexString",   note: "Poseidon2(address)"         },
                    { f: "address", t: "string?",     note: "Raw address (off-chain)"    },
                    { f: "isEmpty", t: "boolean?",    note: "True for zero-value leaves" },
                  ].map(({ f, t, note }) => (
                    <div key={f} className="grid grid-cols-[80px_70px_1fr] items-center gap-2 py-1.5">
                      <code className="font-mono text-[9px] text-zinc-400">{f}</code>
                      <TypeBadge t={t} />
                      <span className="text-[9px] text-zinc-600">{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>
  
        {/* ── 5. Artifacts Inspector ──────────────────────────────────── */}
        <Section
          icon={<PackageIcon className="h-3.5 w-3.5" />}
          title="Artifacts Inspector"
          badge={
            <div className="flex items-center gap-1.5">
              {allArtifactsOk ? (
                <span className="text-[9px] font-medium text-teal-400">All reachable</span>
              ) : anyMissing ? (
                <span className="text-[9px] font-medium text-amber-400">Action needed</span>
              ) : null}
            </div>
          }
        >
          {anyMissing && (
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
              <AlertIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[10px] text-amber-400">
                One or more circuit artifacts are missing from <code className="font-mono text-[9px]">/public/circuits/</code>.
                The in-browser prover will fall back to the mock backend until real artifacts are present.
              </p>
            </div>
          )}
  
          <div className="divide-y divide-zinc-800/50">
            {artifacts.map((a) => <ArtifactRow key={a.url} artifact={a} />)}
          </div>
  
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[9px] text-zinc-700">
              Artifact paths resolve relative to <code className="font-mono text-[9px]">/public</code> (Vite dev server or CDN).
            </p>
            <button
              onClick={handleRecheck}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
            >
              <span className={recheckSpinning ? "animate-spin" : ""}>
                <RefreshIcon className="h-3 w-3" />
              </span>
              Re-check
            </button>
          </div>
        </Section>
  
        {/* ── Nullifier derivation callout ───────────────────────────── */}
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/20 px-4 py-4">
          <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700" />
          <div>
            <p className="text-[10px] font-semibold text-zinc-400">Nullifier Derivation</p>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              The nullifier is computed off-circuit as{" "}
              <code className="font-mono text-[9px] text-zinc-500">keccak256(walletAddress ∥ root ∥ lowLeafIndex)</code>.
              Its uniqueness per root prevents proof replay — submitting the same proof against a new root will produce a different nullifier and be rejected by the contract.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  export default ProtocolCircuit;
  
  // ---------------------------------------------------------------------------
  // Constants used in JSX above
  // ---------------------------------------------------------------------------
  
  const VISUAL_DEPTH_LABEL = 4;
  
  const NOIR_SKETCH = `// nullproof.nr — circuit inputs (illustrative)
  fn main(
      // Private inputs
      wallet_address:  Field,
      queried_leaf:    Field,
      low_leaf:        Field,
      low_leaf_index:  u32,
      siblings:        [Field; ${TREE_DEPTH}],
      path_indices:    [u1;   ${TREE_DEPTH}],
      nullifier:       Field,
      address_count:   u64,
  
      // Public input (1 total)
      root:            pub Field,
  ) {
      // 1. Recompute the queried leaf hash
      assert(queried_leaf == poseidon2([wallet_address]));
  
      // 2. Authenticate low-leaf path → root
      let computed_root = merkle_root(low_leaf, low_leaf_index, siblings, path_indices);
      assert(computed_root == root);
  
      // 3. Non-membership: low_leaf < queried_leaf
      assert(low_leaf < queried_leaf);
  
      // 4. Nullifier binding
      let expected = keccak256([wallet_address, root, low_leaf_index as Field]);
      assert(nullifier == expected);
  }`;
  
  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  
  function IdentityIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" /><path d="M4.5 5.5h5M4.5 7.5h3" /></svg>;
  }
  function FlowIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="2.5" cy="7" r="1.5" /><circle cx="7" cy="7" r="1.5" /><circle cx="11.5" cy="7" r="1.5" /><path d="M4 7h1.5M8.5 7h1.5" /></svg>;
  }
  function WitnessIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h6l2 2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8 2v3h3M5 7h4M5 9h2" /></svg>;
  }
  function CircuitIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><path d="M7 1.5V4M7 10v2.5M1.5 7H4M10 7h2.5" /></svg>;
  }
  function ShieldIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2.5 3.5v4C2.5 10 7 12.5 7 12.5S11.5 10 11.5 7.5v-4L7 1.5z" /></svg>;
  }
  function TreeIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="2.5" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" /><path d="M7 4v1.5M7 5.5L3 6.5M7 5.5L11 6.5" /></svg>;
  }
  function PackageIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 4.5v5L7 12.5l5.5-3v-5L7 1.5z" /><path d="M7 1.5v11M1.5 4.5l5.5 3 5.5-3" /></svg>;
  }
  function DatabaseIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="7" cy="3.5" rx="4.5" ry="1.5" /><path d="M2.5 3.5v7c0 .83 2.02 1.5 4.5 1.5s4.5-.67 4.5-1.5v-7" /><path d="M2.5 7c0 .83 2.02 1.5 4.5 1.5S11.5 7.83 11.5 7" /></svg>;
  }
  function AlertIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
  }
  function RefreshIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" /></svg>;
  }
  function ArrowRightIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" /></svg>;
  }
  function LockIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="6.5" width="9" height="6" rx="1.5" /><path d="M4.5 6.5V4.5a2.5 2.5 0 0 1 5 0v2" /><circle cx="7" cy="9.5" r=".75" fill="currentColor" /></svg>;
  }
  function ChevronDownIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5L5 6.5l3-3" /></svg>;
  }