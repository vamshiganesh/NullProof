// frontend/src/components/proof/IMTVisualizer.tsx
//
// Canvas-based animated Incremental Merkle Tree path traversal.
// Shows the authenticated path from leaf → root with a glowing particle
// travelling each edge, hash labels, and a highlight pulse at each node.
//
// Props are kept narrow — callers pass raw witness data which is available
// from useProver via the WitnessResponse stored on the proof result.


import React, {
    useRef,
    useEffect,
    useCallback,
    useState,
    useMemo,
  } from "react";
 
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
 
  export interface IMTVisualizerProps {
    /** Merkle path hashes from leaf to root (sibling hashes). */
    merklePath: string[];
    /** 0 = left child, 1 = right child at each level. */
    pathIndices: number[];
    /** The leaf's own hash. */
    leafHash: string;
    /** Merkle root hash. */
    merkleRoot: string;
    /** Whether the proof is verified/confirmed. */
    verified?: boolean;
    className?: string;
  }
 
  // ---------------------------------------------------------------------------
  // Internal geometry types
  // ---------------------------------------------------------------------------
 
  interface NodeDef {
    id:        string;
    x:         number;   // 0..1 normalised
    y:         number;   // 0..1 normalised
    hash:      string;
    isPath:    boolean;  // on the authenticated path
    isLeaf:    boolean;
    isRoot:    boolean;
    isSibling: boolean;
    level:     number;
  }
 
  interface EdgeDef {
    from:   string;   // node id
    to:     string;   // node id
    isPath: boolean;
  }
 
  interface Particle {
    edgeIdx:  number;
    t:        number;   // 0..1 progress along edge
    speed:    number;
    alpha:    number;
    size:     number;
  }
 
  // ---------------------------------------------------------------------------
  // Colours (OKLCH-inspired, implemented as CSS strings for canvas)
  // ---------------------------------------------------------------------------
 
  const C = {
    bg:            "#0a0a0b",
    surface:       "#111113",
    gridLine:      "rgba(255,255,255,0.03)",
 
    // Node fills
    pathNode:      "#1a2e2e",
    pathNodeBorder: "#4f98a3",
    leafNode:      "#162535",
    leafBorder:    "#5591c7",
    siblingNode:   "#1c1b19",
    siblingBorder: "#3a3836",
    rootNode:      "#1f1a2e",
    rootBorder:    "#8b6dd1",
 
    // Verified overrides
    verifiedNode:  "#12271a",
    verifiedBorder:"#6daa45",
    verifiedRoot:  "#1a2812",
    verifiedRootBorder: "#4d8f25",
 
    // Edges
    pathEdge:      "#4f98a3",
    siblingEdge:   "#2a2826",
 
    // Text
    hashText:      "rgba(180,220,220,0.9)",
    sibHashText:   "rgba(120,118,116,0.6)",
    labelText:     "rgba(255,255,255,0.35)",
 
    // Particle
    particle:      "#a0dce3",
    particleGlow:  "rgba(79,152,163,0.6)",
 
    // Glow halos
    pathGlow:      "rgba(79,152,163,0.15)",
    rootGlow:      "rgba(139,109,209,0.2)",
    verifiedGlow:  "rgba(109,170,69,0.2)",
  };
 
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
 
  /** Shorten a hex hash for display inside a node. */
  function shortHash(h: string, head = 4, tail = 3): string {
    const clean = h.startsWith("0x") ? h.slice(2) : h;
    if (clean.length <= head + tail) return h;
    return `${clean.slice(0, head)}…${clean.slice(-tail)}`;
  }
 
  /** Linear interpolate. */
  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }
 
  /** Ease-in-out cubic. */
  function easeInOut(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
 
  // ---------------------------------------------------------------------------
  // Build tree geometry
  // ---------------------------------------------------------------------------
 
  function buildTree(
    merklePath:  string[],
    pathIndices: number[],
    leafHash:    string,
    merkleRoot:  string,
  ): { nodes: NodeDef[]; edges: EdgeDef[] } {
    const depth  = merklePath.length; // number of levels above leaf
    const levels = depth + 1;        // leaf level + path levels + root
 
    const nodes: NodeDef[] = [];
    const edges: EdgeDef[] = [];
 
    // We render the authenticated path + one sibling at each level.
    // Columns: sibling=0, path=1 (or flip if pathIndex=1 means path is right)
    // We keep it simple: path column always center-left, sibling always center-right.
 
    const COL_PATH    = 0.35;
    const COL_SIBLING = 0.65;
 
    // Y: leaf at bottom, root at top
    const yForLevel = (lvl: number) =>
      1 - (lvl / (levels - 1)) * 0.88 - 0.06;
 
    // ── Leaf node ──────────────────────────────────────────────────────────
    nodes.push({
      id:        "leaf",
      x:         COL_PATH,
      y:         yForLevel(0),
      hash:      leafHash,
      isPath:    true,
      isLeaf:    true,
      isRoot:    false,
      isSibling: false,
      level:     0,
    });
 
    // ── Per-level sibling + path nodes ────────────────────────────────────
    for (let i = 0; i < depth; i++) {
      const lvl      = i + 1;
      const isRight  = pathIndices[i] === 1; // path node is right child at this level
      const pathX    = isRight ? COL_SIBLING : COL_PATH;
      const sibX     = isRight ? COL_PATH    : COL_SIBLING;
 
      // Path accumulator node (hash computed so far going up)
      nodes.push({
        id:        `path-${lvl}`,
        x:         pathX,
        y:         yForLevel(lvl),
        hash:      i < depth - 1
                     ? `path lvl ${lvl}`    // intermediate — no exact hash to show
                     : merkleRoot,          // not used; root handled separately
        isPath:    true,
        isLeaf:    false,
        isRoot:    false,
        isSibling: false,
        level:     lvl,
      });
 
      // Sibling node
      nodes.push({
        id:        `sib-${lvl}`,
        x:         sibX,
        y:         yForLevel(lvl),
        hash:      merklePath[i] ?? "",
        isPath:    false,
        isLeaf:    false,
        isRoot:    false,
        isSibling: true,
        level:     lvl,
      });
    }
 
    // ── Root node (centred) ────────────────────────────────────────────────
    nodes.push({
      id:        "root",
      x:         0.5,
      y:         yForLevel(levels - 1),
      hash:      merkleRoot,
      isPath:    true,
      isLeaf:    false,
      isRoot:    true,
      isSibling: false,
      level:     levels - 1,
    });
 
    // ── Edges ──────────────────────────────────────────────────────────────
 
    // Leaf → first path level
    edges.push({
      from:   "leaf",
      to:     `path-1`,
      isPath: true,
    });
 
    // Sibling → same path level node (converge)
    edges.push({
      from:   `sib-1`,
      to:     `path-1`,
      isPath: false,
    });
 
    // path-i → path-{i+1}  and  sib-{i+1} → path-{i+1}
    for (let i = 1; i < depth; i++) {
      edges.push({
        from:   `path-${i}`,
        to:     `path-${i + 1}`,
        isPath: true,
      });
      edges.push({
        from:   `sib-${i + 1}`,
        to:     `path-${i + 1}`,
        isPath: false,
      });
    }
 
    // Final path node → root
    if (depth > 0) {
      edges.push({
        from:   `path-${depth}`,
        to:     "root",
        isPath: true,
      });
    } else {
      // depth=0: leaf IS root
      edges.push({
        from:   "leaf",
        to:     "root",
        isPath: true,
      });
    }
 
    return { nodes, edges };
  }
 
  // ---------------------------------------------------------------------------
  // Canvas drawing helpers
  // ---------------------------------------------------------------------------
 
  function drawRoundedRect(
    ctx:    CanvasRenderingContext2D,
    x:      number,
    y:      number,
    w:      number,
    h:      number,
    r:      number,
  ) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
 
  function drawGlow(
    ctx:    CanvasRenderingContext2D,
    cx:     number,
    cy:     number,
    radius: number,
    color:  string,
  ) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
 
  // ---------------------------------------------------------------------------
  // Animation state
  // ---------------------------------------------------------------------------
 
  const PARTICLE_COUNT  = 6;
  const PARTICLE_SPEED  = 0.0035;
  const ANIMATION_FPS   = 60;
 
  // ---------------------------------------------------------------------------
  // IMTVisualizer Component
  // ---------------------------------------------------------------------------
 
  export function IMTVisualizer({
    merklePath,
    pathIndices,
    leafHash,
    merkleRoot,
    verified = false,
    className = "",
  }: IMTVisualizerProps) {
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const animRef     = useRef<number>(0);
    const frameRef    = useRef<number>(0);
 
    // Particle state (mutable, not React state)
    const particlesRef = useRef<Particle[]>([]);
 
    // Highlight pulse state: nodeId → phase 0..1
    const pulseRef     = useRef<Map<string, number>>(new Map());
 
    // Hover state
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const hoveredRef   = useRef<string | null>(null);
 
    // Revealed step counter (nodes light up one by one on mount)
    const revealRef    = useRef<number>(0);
    const [revealStep, setRevealStep] = useState(0);
 
    // ── Build geometry (memoised) ──────────────────────────────────────────
    const { nodes, edges } = useMemo(
      () => buildTree(merklePath, pathIndices, leafHash, merkleRoot),
      [merklePath, pathIndices, leafHash, merkleRoot],
    );
 
    // Path edges only (for particle travel)
    const pathEdges = useMemo(
      () => edges.filter((e) => e.isPath),
      [edges],
    );
 
    // ── Initialise particles ────────────────────────────────────────────────
    useEffect(() => {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        edgeIdx: i % pathEdges.length,
        t:       i / PARTICLE_COUNT,
        speed:   PARTICLE_SPEED * (0.85 + Math.random() * 0.3),
        alpha:   0.6 + Math.random() * 0.4,
        size:    2 + Math.random() * 1.5,
      }));
      revealRef.current = 0;
      setRevealStep(0);
    }, [nodes, pathEdges.length]);
 
    // ── Staggered reveal ────────────────────────────────────────────────────
    useEffect(() => {
      const total = nodes.length;
      if (revealStep >= total) return;
      const timer = setTimeout(() => {
        revealRef.current = revealStep + 1;
        setRevealStep((s) => s + 1);
      }, 80);
      return () => clearTimeout(timer);
    }, [revealStep, nodes.length]);
 
    // ── Canvas draw loop ────────────────────────────────────────────────────
    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
 
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width  / dpr;
      const H   = canvas.height / dpr;
 
      ctx.save();
      ctx.scale(dpr, dpr);
 
      // ── Background ──────────────────────────────────────────────────────
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
 
      // Subtle dot-grid
      const gridStep = 28;
      ctx.fillStyle = C.gridLine;
      for (let gx = gridStep; gx < W; gx += gridStep) {
        for (let gy = gridStep; gy < H; gy += gridStep) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
 
      // ── Node position resolver ─────────────────────────────────────────
      const nodePos = (id: string): { x: number; y: number } => {
        const n = nodes.find((n) => n.id === id);
        if (!n) return { x: W / 2, y: H / 2 };
        return { x: n.x * W, y: n.y * H };
      };
 
      // ── Edges ──────────────────────────────────────────────────────────
      edges.forEach((edge) => {
        const from = nodePos(edge.from);
        const to   = nodePos(edge.to);
        const revealedFrom = nodes.findIndex((n) => n.id === edge.from) < revealRef.current;
        const revealedTo   = nodes.findIndex((n) => n.id === edge.to)   < revealRef.current;
        if (!revealedFrom || !revealedTo) return;
 
        if (edge.isPath) {
          // Glowing path edge
          ctx.save();
          ctx.shadowBlur  = 8;
          ctx.shadowColor = C.pathEdge;
          ctx.strokeStyle = C.pathEdge;
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.restore();
        } else {
          // Sibling dashed edge
          ctx.save();
          ctx.strokeStyle = C.siblingEdge;
          ctx.lineWidth   = 1;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      });
 
      // ── Particles along path edges ────────────────────────────────────
      particlesRef.current.forEach((p) => {
        if (pathEdges.length === 0) return;
        const edge = pathEdges[p.edgeIdx % pathEdges.length];
        if (!edge) return;
        const from = nodePos(edge.from);
        const to   = nodePos(edge.to);
 
        const te  = easeInOut(p.t);
        const px  = lerp(from.x, to.x, te);
        const py  = lerp(from.y, to.y, te);
 
        // Glow halo
        drawGlow(ctx, px, py, p.size * 6, `rgba(160,220,227,${p.alpha * 0.15})`);
 
        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,220,227,${p.alpha})`;
        ctx.fill();
 
        // Advance particle
        p.t += p.speed;
        if (p.t >= 1) {
          p.t       = 0;
          p.edgeIdx = (p.edgeIdx + 1) % pathEdges.length;
        }
      });
 
      // ── Nodes ─────────────────────────────────────────────────────────
      const NODE_W = Math.min(W * 0.34, 130);
      const NODE_H = 44;
      const R      = 10;
 
      nodes.forEach((node, idx) => {
        if (idx >= revealRef.current) return; // not yet revealed
 
        const cx     = node.x * W;
        const cy     = node.y * H;
        const nx     = cx - NODE_W / 2;
        const ny     = cy - NODE_H / 2;
        const isHov  = hoveredRef.current === node.id;
 
        // Choose colours
        let fill: string;
        let border: string;
        let glowColor: string;
 
        if (node.isRoot) {
          fill       = verified ? C.verifiedRoot : C.rootNode;
          border     = verified ? C.verifiedRootBorder : C.rootBorder;
          glowColor  = verified ? C.verifiedGlow : C.rootGlow;
        } else if (node.isLeaf) {
          fill       = verified ? C.verifiedNode : C.leafNode;
          border     = verified ? C.verifiedBorder : C.leafBorder;
          glowColor  = verified ? C.verifiedGlow : "rgba(85,145,199,0.15)";
        } else if (node.isPath) {
          fill       = verified ? C.verifiedNode : C.pathNode;
          border     = verified ? C.verifiedBorder : C.pathNodeBorder;
          glowColor  = verified ? C.verifiedGlow : C.pathGlow;
        } else {
          fill       = C.siblingNode;
          border     = C.siblingBorder;
          glowColor  = "transparent";
        }
 
        // Pulse animation (new nodes pulse on reveal)
        const pulsePhase = pulseRef.current.get(node.id) ?? 0;
        const pulseFade  = 1 - pulsePhase;
 
        // Ambient glow
        if (node.isPath || node.isRoot || isHov) {
          drawGlow(ctx, cx, cy, NODE_W * 0.8, glowColor);
        }
 
        // Pulse ring on reveal
        if (pulsePhase > 0 && pulsePhase < 1) {
          const ring = ctx.createRadialGradient(cx, cy, NODE_W * 0.3, cx, cy, NODE_W * (0.5 + pulsePhase * 0.5));
          ring.addColorStop(0, `rgba(79,152,163,${pulseFade * 0.3})`);
          ring.addColorStop(1, "transparent");
          ctx.fillStyle = ring;
          ctx.beginPath();
          ctx.arc(cx, cy, NODE_W * (0.5 + pulsePhase * 0.5), 0, Math.PI * 2);
          ctx.fill();
          pulseRef.current.set(node.id, pulsePhase + 0.02);
          if (pulsePhase >= 1) pulseRef.current.delete(node.id);
        }
 
        // Hover outer ring
        if (isHov) {
          ctx.save();
          ctx.shadowBlur  = 16;
          ctx.shadowColor = border;
          drawRoundedRect(ctx, nx - 2, ny - 2, NODE_W + 4, NODE_H + 4, R + 2);
          ctx.strokeStyle = `${border}66`;
          ctx.lineWidth   = 1;
          ctx.stroke();
          ctx.restore();
        }
 
        // Node box fill
        drawRoundedRect(ctx, nx, ny, NODE_W, NODE_H, R);
        ctx.fillStyle = fill;
        ctx.fill();
 
        // Node box border
        ctx.save();
        ctx.shadowBlur  = node.isPath || node.isRoot ? 10 : 0;
        ctx.shadowColor = border;
        ctx.strokeStyle = border;
        ctx.lineWidth   = node.isRoot ? 1.5 : 1;
        drawRoundedRect(ctx, nx, ny, NODE_W, NODE_H, R);
        ctx.stroke();
        ctx.restore();
 
        // ── Label (LEAF / ROOT / SIB N) above the node ──────────────────
        ctx.fillStyle  = C.labelText;
        ctx.font       = `500 9px ui-monospace, monospace`;
        ctx.textAlign  = "center";
        ctx.letterSpacing = "0.06em";
        const labelY   = ny - 6;
        if (node.isLeaf) {
          ctx.fillText("LEAF", cx, labelY);
        } else if (node.isRoot) {
          ctx.fillText(verified ? "✓ ROOT" : "ROOT", cx, labelY);
        } else if (node.isSibling) {
          ctx.fillText(`SIBLING L${node.level}`, cx, labelY);
        } else {
          ctx.fillText(`HASH L${node.level}`, cx, labelY);
        }
 
        // ── Hash text inside node ────────────────────────────────────────
        const hashColor = node.isSibling ? C.sibHashText : C.hashText;
        ctx.fillStyle   = hashColor;
        ctx.font        = `500 10.5px ui-monospace, monospace`;
        ctx.textAlign   = "center";
        ctx.fillText(shortHash(node.hash), cx, cy + 4);
 
      });
 
      // ── "PATH" label on left ────────────────────────────────────────────
      ctx.save();
      ctx.translate(18, H * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle  = "rgba(79,152,163,0.3)";
      ctx.font       = `600 9px ui-monospace, monospace`;
      ctx.textAlign  = "center";
      ctx.letterSpacing = "0.15em";
      ctx.fillText("AUTH PATH", 0, 0);
      ctx.restore();
 
      ctx.restore();
    }, [nodes, edges, pathEdges, verified]);
 
    // ── Trigger pulse on reveal ─────────────────────────────────────────────
    useEffect(() => {
      if (revealStep > 0 && revealStep <= nodes.length) {
        const node = nodes[revealStep - 1];
        if (node) pulseRef.current.set(node.id, 0);
      }
    }, [revealStep, nodes]);
 
    // ── Animation loop ──────────────────────────────────────────────────────
    useEffect(() => {
      let last = 0;
      const interval = 1000 / ANIMATION_FPS;
 
      function loop(now: number) {
        animRef.current = requestAnimationFrame(loop);
        if (now - last < interval) return;
        last = now;
        frameRef.current++;
        draw();
      }
 
      animRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animRef.current);
    }, [draw]);
 
    // ── Resize observer ─────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
 
      const dpr = window.devicePixelRatio || 1;
 
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        canvas.width  = width  * dpr;
        canvas.height = height * dpr;
      });
 
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);
 
    // ── Mouse hover detection ───────────────────────────────────────────────
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr  = window.devicePixelRatio || 1;
        const rect  = canvas.getBoundingClientRect();
        const mx    = (e.clientX - rect.left);
        const my    = (e.clientY - rect.top);
        const W     = canvas.width  / dpr;
        const H     = canvas.height / dpr;
        const NODE_W = Math.min(W * 0.34, 130);
        const NODE_H = 44;
 
        let found: string | null = null;
        for (const node of nodes) {
          const nx = node.x * W - NODE_W / 2;
          const ny = node.y * H - NODE_H / 2;
          if (mx >= nx && mx <= nx + NODE_W && my >= ny && my <= ny + NODE_H) {
            found = node.id;
            break;
          }
        }
 
        if (found !== hoveredRef.current) {
          hoveredRef.current = found;
          setHoveredNode(found);
        }
      },
      [nodes],
    );
 
    const handleMouseLeave = useCallback(() => {
      hoveredRef.current = null;
      setHoveredNode(null);
    }, []);
 
    // ── Derive depth label ──────────────────────────────────────────────────
    const depthLabel = `${merklePath.length}-level IMT`;
 
    // ── Tooltip for hovered node ────────────────────────────────────────────
    const hoveredNodeDef = hoveredNode
      ? nodes.find((n) => n.id === hoveredNode)
      : null;
 
    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
 
    return (
      <div
        className={[
          "relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
          className,
        ].join(" ")}
      >
        {/* ── Header bar ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* Icon */}
            <svg
              viewBox="0 0 18 18"
              className="h-4 w-4 text-teal-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="3"  r="1.5" />
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="14" cy="10" r="1.5" />
              <circle cx="9"  cy="16" r="1.5" />
              <line x1="9"  y1="4.5" x2="4"  y2="8.5" />
              <line x1="9"  y1="4.5" x2="14" y2="8.5" />
              <line x1="4"  y1="11.5" x2="9" y2="14.5" />
              <line x1="14" y1="11.5" x2="9" y2="14.5" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Merkle Path Traversal
            </span>
          </div>
 
          <div className="flex items-center gap-2">
            {/* Depth chip */}
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              {depthLabel}
            </span>
 
            {/* Verified chip */}
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Verified
              </span>
            )}
 
            {/* Live indicator */}
            <span className="inline-flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
              </span>
              <span className="text-[10px] text-zinc-600">live</span>
            </span>
          </div>
        </div>
 
        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <canvas
          ref={canvasRef}
          className="h-[480px] w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Animated Merkle path traversal diagram"
          role="img"
        />
 
        {/* ── Hover tooltip overlay ─────────────────────────────────────── */}
        {hoveredNodeDef && (
          <div
            className={[
              "pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2",
              "max-w-xs rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2",
              "shadow-xl backdrop-blur-sm",
            ].join(" ")}
          >
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
              {hoveredNodeDef.isRoot
                ? "Merkle Root"
                : hoveredNodeDef.isLeaf
                ? "Leaf (Address Hash)"
                : hoveredNodeDef.isSibling
                ? `Sibling — Level ${hoveredNodeDef.level}`
                : `Path Node — Level ${hoveredNodeDef.level}`}
            </p>
            <p className="break-all font-mono text-[11px] text-teal-300">
              {hoveredNodeDef.hash.startsWith("path lvl")
                ? "(computed in-circuit)"
                : hoveredNodeDef.hash}
            </p>
          </div>
        )}
 
        {/* ── Legend ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-zinc-800/70 px-4 py-2.5">
          {[
            { color: "bg-teal-400",   label: "Auth Path" },
            { color: "bg-blue-400",   label: "Leaf" },
            { color: "bg-violet-400", label: "Root" },
            { color: "bg-zinc-600",   label: "Sibling" },
            { color: "bg-teal-300 animate-pulse", label: "Particle" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
              <span className="text-[10px] text-zinc-600">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
 
  export default IMTVisualizer;