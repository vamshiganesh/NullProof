declare module "@noir-lang/noir_js" {
  export class Noir {
    constructor(circuit: unknown);
    execute(inputs: Record<string, unknown>): Promise<{ witness: Uint8Array }>;
  }
}

declare module "@aztec/bb.js" {
  export class UltraHonkBackend {
    constructor(bytecode: unknown);
    generateProof(witness: Uint8Array): Promise<{
      proof: Uint8Array;
      publicInputs: string[];
    }>;
  }
}
