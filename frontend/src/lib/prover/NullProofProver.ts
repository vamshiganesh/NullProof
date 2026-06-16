import { computeCircuitNullifier, getValidityEpoch, nullifierToHex } from "./nullifier";
import { addressToValue } from "./circuitImt";

import {
  getUltraHonkBackend,
  initBarretenberg,
  type UltraHonkInitOptions,
  type UltraHonkProofResult,
} from "./barretenberg";
import {
  isSnapshotStale,
  prepareNonMembershipWitnessInput,
  findLowLeafForAddress,
} from "./ofac/snapshot";
import type {
  CachedProofEnvelope,
  ProofData,
  ProofGenerationInput,
  ProofProgress,
  ProofStep,
  ProofStepId,
  ProofStatus,
  ProofVerificationResult,
} from "@/types/proof";
import type { HexString } from "./imt/types";

const DEFAULT_VALIDITY_WINDOW_SECONDS = 24 * 60 * 60;

export type NullProofEvent =
  | { type: "progress"; payload: ProofProgress }
  | { type: "ready"; payload: ProofData }
  | { type: "verified"; payload: ProofVerificationResult }
  | { type: "expired"; payload: ProofData }
  | { type: "error"; payload: Error };

type NullProofListener = (event: NullProofEvent) => void;

export interface NullProofProverOptions {
  validityWindowSeconds?: number;
  backend?: UltraHonkInitOptions;
}

export class NullProofProver {
  private readonly validityWindowSeconds: number;
  private readonly backendOptions: UltraHonkInitOptions;
  private readonly listeners = new Set<NullProofListener>();

  private progress: ProofProgress = this.createInitialProgress();

  constructor(options: NullProofProverOptions = {}) {
    this.validityWindowSeconds =
      options.validityWindowSeconds ?? DEFAULT_VALIDITY_WINDOW_SECONDS;
    this.backendOptions = options.backend ?? { mock: true };
  }

  subscribe(listener: NullProofListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getProgress(): ProofProgress {
    return { ...this.progress, completedSteps: [...this.progress.completedSteps] };
  }

  getSteps(status: ProofStatus = this.progress.status): ProofStep[] {
    const activeStep = this.mapStatusToStep(status);
    const completed = new Set(this.progress.completedSteps);

    return [
      {
        id: "fetch-imt-path",
        label: "Fetching IMT Path",
        description: "Finding the lower leaf and reconstructing the Merkle path.",
        status: this.resolveStepStatus("fetch-imt-path", activeStep, completed),
      },
      {
        id: "execute-witness",
        label: "Executing Witness",
        description: "Preparing the private witness inputs in your browser.",
        status: this.resolveStepStatus("execute-witness", activeStep, completed),
      },
      {
        id: "generate-ultrahonk-proof",
        label: "Generating UltraHonk Proof",
        description: "Running the proving backend locally using circuit artifacts.",
        status: this.resolveStepStatus("generate-ultrahonk-proof", activeStep, completed),
      },
      {
        id: "proof-ready",
        label: "Proof Ready",
        description: "Your compliance proof is generated and ready for on-chain use.",
        status: this.resolveStepStatus("proof-ready", activeStep, completed),
      },
    ];
  }

  async prove(input: ProofGenerationInput): Promise<ProofData> {
    const walletAddress = input.walletAddress.trim();

    if (!walletAddress) {
      const error = new Error("NullProofProver: wallet address is required");
      this.fail(error);
      throw error;
    }

    const startedAt = new Date().toISOString();

    // FIX 1: omit errorMessage entirely instead of setting it to undefined
    this.updateProgress({
      status: "fetching-path",
      currentStep: "fetch-imt-path",
      completedSteps: [],
      percent: 8,
      message: "Loading sanctions snapshot and locating lower leaf...",
      startedAt,
      updatedAt: startedAt,
      estimatedRemainingMs: 14_000,
    });

    const lowLeafContext = await findLowLeafForAddress(walletAddress);

    if (lowLeafContext.exists) {
      const error = new Error(
        "NullProofProver: queried wallet appears in the sanctions tree",
      );
      this.fail(error);
      throw error;
    }

    this.markStepComplete("fetch-imt-path", {
      status: "executing-witness",
      currentStep: "execute-witness",
      percent: 34,
      message: "Preparing witness inputs locally...",
      estimatedRemainingMs: 10_000,
    });

    const witnessInput = await prepareNonMembershipWitnessInput(walletAddress);

    const generatedAtMs = Date.now();
    const validityEpoch = getValidityEpoch(generatedAtMs);
    const nullifierField = computeCircuitNullifier(
      addressToValue(walletAddress),
      BigInt(witnessInput.root),
      validityEpoch,
    );
    const nullifier = nullifierToHex(nullifierField);

    const witness: Record<string, unknown> = {
      walletAddress,
      queriedLeaf: witnessInput.queriedLeaf,
      root: witnessInput.root,
      lowLeaf: witnessInput.lowLeaf,
      lowLeafIndex: witnessInput.lowLeafIndex,
      siblings: witnessInput.siblings,
      pathIndices: witnessInput.pathIndices,
      nullifier,
      addressCount: witnessInput.addressCount,
    };

    this.markStepComplete("execute-witness", {
      status: "generating-proof",
      currentStep: "generate-ultrahonk-proof",
      percent: 68,
      message: "Generating UltraHonk proof in your browser...",
      estimatedRemainingMs: 7_500,
    });

    await initBarretenberg(this.backendOptions);
    const backend = await getUltraHonkBackend(this.backendOptions);
    const proofResult = await backend.prove(witness);

    const nullifierFromProof =
      (proofResult.publicInputs[1] as string | undefined) ?? nullifier;

    const generatedAtDate = new Date();
    const generatedAt = generatedAtDate.toISOString();
    const generatedInMs = Math.max(
      1,
      generatedAtDate.getTime() - new Date(startedAt).getTime(),
    );
    const validUntil = new Date(
      generatedAtDate.getTime() + this.validityWindowSeconds * 1000,
    ).toISOString();

    const proofData: ProofData = {
      walletAddress,
      lowLeafIndex: witnessInput.lowLeafIndex,
      merkleRoot: witnessInput.root,
      root: witnessInput.root,
      nullifier: nullifierFromProof,
      validityWindow: this.validityWindowSeconds,
      validUntil,
      generatedAt,
      generatedInMs,
      addressCount: witnessInput.addressCount,
      proof: proofResult.proof,
      publicInputs: proofResult.publicInputs,
      // FIX 2: proofHash from UltraHonkProofResult is HexString; cast safely
      proofHash: proofResult.proofHash as string,
      circuitName: "nullproof",
      provingSystem: "UltraHonk",
      rootUpdatedAt: witnessInput.publishedAt ?? witnessInput.builtAt,
      status: "ready",
    };

    this.markStepComplete("generate-ultrahonk-proof", {
      status: "ready",
      currentStep: "proof-ready",
      percent: 100,
      message: "Proof generated successfully.",
      estimatedRemainingMs: 0,
    });

    this.markStepComplete("proof-ready", {
      status: "ready",
      currentStep: "proof-ready",
      percent: 100,
      message: "Proof ready for verification or on-chain submission.",
      estimatedRemainingMs: 0,
    });

    this.emit({ type: "ready", payload: proofData });
    return proofData;
  }

  async verify(proof: ProofData): Promise<ProofVerificationResult> {
    this.updateProgress({
      ...this.progress,
      status: "verifying",
      currentStep: "proof-ready",
      percent: 100,
      message: "Verifying proof integrity...",
      updatedAt: new Date().toISOString(),
    });

    const isExpired = await this.isExpired(proof);

    if (isExpired) {
      const expiredProof: ProofData = { ...proof, status: "expired" };
      this.emit({ type: "expired", payload: expiredProof });

      const result: ProofVerificationResult = {
        isValid: false,
        verifiedAt: new Date().toISOString(),
        root: proof.root,
        nullifier: proof.nullifier,
        details: "Proof expired because the sanctions root changed or validity window elapsed.",
      };

      this.emit({ type: "verified", payload: result });
      return result;
    }

    const backend = await getUltraHonkBackend(this.backendOptions);
    const backendResult = await backend.verify({
      proof: proof.proof,
      publicInputs: proof.publicInputs,
      // FIX 2 (same): proofHash on UltraHonkProofResult is HexString
      proofHash: proof.proofHash as HexString,
      generatedAt: proof.generatedAt,
    });

    // FIX 3: build errorMessage conditionally to avoid undefined with exactOptionalPropertyTypes
    const errorUpdate: Pick<ProofProgress, "errorMessage"> = backendResult
      ? {}
      : { errorMessage: "Verification failed." };

    this.updateProgress({
      ...this.progress,
      status: backendResult ? "verified" : "error",
      currentStep: "proof-ready",
      percent: 100,
      message: backendResult ? "Proof verified." : "Proof verification failed.",
      updatedAt: new Date().toISOString(),
      ...errorUpdate,
    });

    const result: ProofVerificationResult = {
      isValid: backendResult,
      verifiedAt: new Date().toISOString(),
      root: proof.root,
      nullifier: proof.nullifier,
      details: backendResult
        ? "Proof verified successfully."
        : "Backend verification failed.",
    };

    this.emit({ type: "verified", payload: result });
    return result;
  }

  async isExpired(proof: Pick<ProofData, "root" | "validUntil">): Promise<boolean> {
    const now = Date.now();
    const expiresAt = new Date(proof.validUntil).getTime();

    if (Number.isFinite(expiresAt) && now > expiresAt) {
      return true;
    }

    // FIX 4: isSnapshotStale expects HexString; cast proof.root
    return await isSnapshotStale(proof.root as HexString);
  }

  toCacheEnvelope(proof: ProofData): CachedProofEnvelope {
    return {
      version: 1,
      proof,
      cachedAt: new Date().toISOString(),
    };
  }

  fromCacheEnvelope(envelope: CachedProofEnvelope): ProofData {
    if (envelope.version !== 1) {
      throw new Error(`NullProofProver: unsupported cache version ${envelope.version}`);
    }
    return envelope.proof;
  }

  private createInitialProgress(): ProofProgress {
    return {
      status: "idle",
      currentStep: null,
      completedSteps: [],
      percent: 0,
      message: "Waiting to start proof generation.",
    };
  }

  private updateProgress(progress: ProofProgress): void {
    this.progress = progress;
    this.emit({ type: "progress", payload: this.getProgress() });
  }

  private markStepComplete(
    step: ProofStepId,
    next: Omit<ProofProgress, "completedSteps" | "startedAt" | "updatedAt"> &
      Partial<Pick<ProofProgress, "completedSteps">>,
  ): void {
    const completedSteps = Array.from(
      new Set([...(this.progress.completedSteps ?? []), step, ...(next.completedSteps ?? [])]),
    );

    // FIX 5: only include startedAt if it actually exists — omit instead of undefined
    const startedAt = this.progress.startedAt;
    const startedAtEntry: Pick<ProofProgress, "startedAt"> = startedAt
      ? { startedAt }
      : {};

    this.updateProgress({
      ...next,
      completedSteps,
      ...startedAtEntry,
      updatedAt: new Date().toISOString(),
    });
  }

  private fail(error: Error): void {
    this.updateProgress({
      ...this.progress,
      status: "error",
      currentStep: this.progress.currentStep,
      percent: this.progress.percent,
      message: error.message,
      updatedAt: new Date().toISOString(),
      errorMessage: error.message,
    });

    this.emit({ type: "error", payload: error });
  }

  private emit(event: NullProofEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private mapStatusToStep(status: ProofStatus): ProofStepId | null {
    switch (status) {
      case "fetching-path":      return "fetch-imt-path";
      case "executing-witness":  return "execute-witness";
      case "generating-proof":   return "generate-ultrahonk-proof";
      case "ready":
      case "verifying":
      case "verified":
      case "submitting":
      case "submitted":
      case "expired":            return "proof-ready";
      default:                   return null;
    }
  }

  private resolveStepStatus(
    stepId: ProofStepId,
    activeStep: ProofStepId | null,
    completed: Set<ProofStepId>,
  ): "pending" | "active" | "complete" | "error" {
    if (this.progress.status === "error" && activeStep === stepId) return "error";
    if (completed.has(stepId))   return "complete";
    if (activeStep === stepId)   return "active";
    return "pending";
  }
}

export function createNullProofProver(
  options?: NullProofProverOptions,
): NullProofProver {
  return new NullProofProver(options);
}

export type { UltraHonkProofResult };
