export type ProofStatus =
  | "idle"
  | "fetching-path"
  | "executing-witness"
  | "generating-proof"
  | "ready"
  | "verifying"
  | "verified"
  | "submitting"
  | "submitted"
  | "expired"
  | "error";

export type ProofStepId =
  | "fetch-imt-path"
  | "execute-witness"
  | "generate-ultrahonk-proof"
  | "proof-ready";

export interface ProofStep {
  id: ProofStepId;
  label: string;
  description: string;
  status: "pending" | "active" | "complete" | "error";
}

export interface ProofArtifacts {
  proof: string;
  publicInputs: string[];
  proofHash: string;
}

export interface ProofResult {
  root: string;
  nullifier: string;
  validityWindow: number;
  validUntil: string;
  generatedAt: string;
  generatedInMs: number;
  addressCount: number;
  proof: string;
  publicInputs: string[];
  proofHash: string;
}

export interface ProofData extends ProofResult {
  walletAddress: string;
  lowLeafIndex: number;
  merkleRoot: string;
  circuitName: string;
  provingSystem: "UltraHonk";
  previousRoot?: string;
  rootUpdatedAt?: string;
  expiresAtBlock?: number;
  status: Extract<ProofStatus, "ready" | "verified" | "submitted" | "expired">;
}

export interface ProofProgress {
  status: ProofStatus;
  currentStep: ProofStepId | null;
  completedSteps: ProofStepId[];
  percent: number;
  message: string;
  startedAt?: string;
  updatedAt?: string;
  estimatedRemainingMs?: number;
  errorMessage?: string;
}

export interface ProofVerificationResult {
  isValid: boolean;
  verifiedAt: string;
  root: string;
  nullifier: string;
  details?: string;
}

export interface ProofGenerationInput {
  walletAddress: string;
  snapshotRoot?: string;
  forceRefresh?: boolean;
}

export interface ProofGenerationOutput {
  proof: ProofData;
  progress: ProofProgress;
}

export interface CachedProofEnvelope {
  version: 1;
  proof: ProofData;
  cachedAt: string;
}
