// frontend/scripts/verify-proof.ts
//
// End-to-end verification of the REAL proving pipeline, run in Node so we can
// validate the circuit witness + UltraHonk proof without a browser.
//
// Run from the frontend/ directory:
//   node --experimental-strip-types scripts/verify-proof.ts

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend, Barretenberg } from "@aztec/bb.js";

import {
  CircuitIMT,
  addressToValue,
  toNoirInputs,
} from "../src/lib/prover/circuitImt.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // A few sample OFAC ETH addresses (sanctioned) + a clean address.
  const sanctioned = [
    "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    "0xa0e1c89Ef1a489c9C7dE96311eD5Ce5D32c20E4B",
    "0x3Cffd56B47B7b41c56258D9C7731ABaDc360E073",
    "0x53b6936513e738f44FB50d2b9476730C0Ab3Bfc1",
    "0x35fB6f6DB4fb05e6A4cE86f2C93691425626d4b1",
  ];
  const cleanAddress = "0x1111111111111111111111111111111111111111";

  const values = sanctioned.map(addressToValue);
  const tree = CircuitIMT.fromValues(values);

  console.log("Tree root:", tree.root.toString());
  console.log("Leaf count (incl. sentinels):", tree.leaves.length);

  // Build a real non-membership witness for the clean address.
  const queryValue = addressToValue(cleanAddress);
  console.log("Clean address query value:", queryValue.toString());

  const witness = tree.nonMembershipWitness(queryValue);
  console.log("Low leaf index:", witness.lowLeafIndex);
  console.log("Low leaf value:", witness.lowLeafValue.toString());
  console.log("Low leaf next value:", witness.lowLeafNextValue.toString());

  // Sanity: the locally-folded path root must equal the tree root.
  const folded = tree.buildPath(witness.lowLeafIndex).root;
  if (folded !== tree.root) throw new Error("FOLD MISMATCH: path root != tree root");
  console.log("Path fold root matches tree root: OK");

  // Load the compiled circuit.
  const circuitPath = resolve(__dirname, "../public/circuits/nullproof.json");
  const circuit = JSON.parse(readFileSync(circuitPath, "utf-8"));

  const inputs = toNoirInputs(witness);
  console.log("Noir inputs:", JSON.stringify(inputs, null, 2));

  // Execute the circuit (this runs all assertions — non-membership check).
  const noir = new Noir(circuit);
  const { witness: solvedWitness } = await noir.execute(inputs as never);
  console.log("noir.execute() OK — constraints satisfied (address is NOT sanctioned)");

  // Generate the real UltraHonk proof.
  const api = await Barretenberg.new();
  const backend = new UltraHonkBackend(circuit.bytecode, api);
  const proof = await backend.generateProof(solvedWitness);
  console.log("Proof bytes:", proof.proof.length);
  console.log("Public inputs:", proof.publicInputs);

  // Verify it.
  const verified = await backend.verifyProof(proof);
  console.log("backend.verifyProof():", verified);

  // Negative test: a sanctioned address must be rejected.
  try {
    const sanctionedValue = addressToValue(sanctioned[0]!);
    tree.nonMembershipWitness(sanctionedValue);
    console.error("NEGATIVE TEST FAILED: sanctioned address produced a witness!");
    process.exit(1);
  } catch (e) {
    console.log("Negative test OK — sanctioned address rejected:", (e as Error).message);
  }

  console.log("\nALL CHECKS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
