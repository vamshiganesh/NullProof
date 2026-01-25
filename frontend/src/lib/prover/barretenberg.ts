import type { HexString } from "./imt/types";

export type BarretenbergBackendStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface UltraHonkArtifacts {
  bytecodeUrl: string;
  witnessUrl?: string;
  verificationKeyUrl?: string;
}

export interface UltraHonkInitOptions {
  artifacts?: Partial<UltraHonkArtifacts>;
  mock?: boolean;
}

export interface UltraHonkBackend {
  prove: (witness: Record<string, unknown>) => Promise<UltraHonkProofResult>;
  verify: (proof: UltraHonkProofResult) => Promise<boolean>;
  destroy: () => Promise<void>;
}

export interface UltraHonkProofResult {
  proof: string;
  publicInputs: string[];
  proofHash: HexString;
  generatedAt: string;
}

export interface BarretenbergRuntime {
  status: BarretenbergBackendStatus;
  backend: UltraHonkBackend | null;
  artifacts: UltraHonkArtifacts;
  isMock: boolean;
}

const DEFAULT_ARTIFACTS: UltraHonkArtifacts = {
  bytecodeUrl: "/circuits/nullproof.bytecode",
  witnessUrl: "/circuits/nullproof.wasm",
  verificationKeyUrl: "/circuits/nullproof.vk.json",
};

let runtimePromise: Promise<BarretenbergRuntime> | null = null;
let currentRuntime: BarretenbergRuntime | null = null;

async function sha256Hex(input: string): Promise<HexString> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `0x${hex}` as HexString;
}

async function ensureAssetReachable(url: string): Promise<void> {
  const response = await fetch(url, { method: "HEAD" });

  if (!response.ok) {
    throw new Error(`barretenberg: asset not reachable at ${url}`);
  }
}

function mergeArtifacts(
  partial?: Partial<UltraHonkArtifacts>,
): UltraHonkArtifacts {
  return {
    ...DEFAULT_ARTIFACTS,
    ...partial,
  };
}

function createMockBackend(): UltraHonkBackend {
  return {
    async prove(witness: Record<string, unknown>): Promise<UltraHonkProofResult> {
      const payload = JSON.stringify(witness);
      const proofHash = await sha256Hex(payload);

      await sleep(1200);

      return {
        proof: btoa(payload),
        publicInputs: extractMockPublicInputs(witness),
        proofHash,
        generatedAt: new Date().toISOString(),
      };
    },

    async verify(proof: UltraHonkProofResult): Promise<boolean> {
      await sleep(250);
      return Boolean(proof.proof && proof.publicInputs.length >= 0);
    },

    async destroy(): Promise<void> {
      return;
    },
  };
}

function extractMockPublicInputs(
  witness: Record<string, unknown>,
): string[] {
  const root =
    typeof witness["root"] === "string" ? witness["root"] : "0x";
  const lowLeaf =
    typeof witness["lowLeaf"] === "string" ? witness["lowLeaf"] : "0x";
  const nullifier =
    typeof witness["nullifier"] === "string" ? witness["nullifier"] : "0x";

  return [root, lowLeaf, nullifier];
}

async function createRealBackend(
  artifacts: UltraHonkArtifacts,
): Promise<UltraHonkBackend> {
  // Asset checks first — fail loudly and predictably.
  await ensureAssetReachable(artifacts.bytecodeUrl);

  if (artifacts.witnessUrl) {
    await ensureAssetReachable(artifacts.witnessUrl);
  }

  if (artifacts.verificationKeyUrl) {
    await ensureAssetReachable(artifacts.verificationKeyUrl);
  }

  /**
   * NOTE:
   * This adapter intentionally avoids hardcoding a fragile BB.js import surface.
   * The exact browser integration depends on the compiled circuit toolchain and
   * the installed backend package version.
   *
   * At this stage, the app gets a stable contract:
   * - prove(witness)
   * - verify(proof)
   * - destroy()
   *
   * When the final circuit artifacts and backend package are locked, this block
   * is the only place that needs replacing.
   */
  return {
    async prove(witness: Record<string, unknown>): Promise<UltraHonkProofResult> {
      const payload = JSON.stringify({
        witness,
        artifacts,
      });

      const proofHash = await sha256Hex(payload);

      throw new Error(
        "barretenberg: production UltraHonk backend not wired yet. " +
        "Provide compiled circuit artifacts and final BB.js integration.",
      );

      return {
        proof: payload,
        publicInputs: [],
        proofHash,
        generatedAt: new Date().toISOString(),
      };
    },

    async verify(_proof: UltraHonkProofResult): Promise<boolean> {
      throw new Error(
        "barretenberg: production verifier not wired yet.",
      );
    },

    async destroy(): Promise<void> {
      return;
    },
  };
}

export async function initBarretenberg(
  options: UltraHonkInitOptions = {},
): Promise<BarretenbergRuntime> {
  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    const artifacts = mergeArtifacts(options.artifacts);
    const isMock = options.mock ?? true;

    try {
      const backend = isMock
        ? createMockBackend()
        : await createRealBackend(artifacts);

      currentRuntime = {
        status: "ready",
        backend,
        artifacts,
        isMock,
      };

      return currentRuntime;
    } catch (error) {
      currentRuntime = {
        status: "error",
        backend: null,
        artifacts,
        isMock,
      };

      throw error;
    }
  })();

  return runtimePromise;
}

export function getBarretenbergRuntime(): BarretenbergRuntime | null {
  return currentRuntime;
}

export async function getUltraHonkBackend(
  options: UltraHonkInitOptions = {},
): Promise<UltraHonkBackend> {
  const runtime = await initBarretenberg(options);

  if (!runtime.backend) {
    throw new Error("barretenberg: backend unavailable");
  }

  return runtime.backend;
}

export async function resetBarretenberg(): Promise<void> {
  if (currentRuntime?.backend) {
    await currentRuntime.backend.destroy();
  }

  currentRuntime = null;
  runtimePromise = null;
}

export function getCircuitArtifactUrls(): UltraHonkArtifacts {
  return { ...DEFAULT_ARTIFACTS };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
