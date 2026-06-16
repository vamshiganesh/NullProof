/**
 * Relayer wallet client — broadcasts SubmissionRouter.submitCompliant txs.
 */

import {
  Contract,
  JsonRpcProvider,
  Wallet,
  isHexString,
} from "ethers";

const ROUTER_ABI = [
  "function submitCompliant(bytes proof, bytes32[] publicInputs, bytes32 nullifier) external",
] as const;

const GATE_ABI = [
  "function checkCompliant(bytes proof, bytes32[] publicInputs, bytes32 nullifier) external view returns (bool)",
] as const;

export interface RelayConfig {
  rpcUrl:              string;
  relayerPrivateKey:   string;
  routerAddress:       string;
  gateAddress:         string;
  chainId:             number;
}

export function loadRelayConfig(): RelayConfig {
  const rpcUrl            = process.env["SEPOLIA_RPC_URL"];
  const relayerPrivateKey = process.env["RELAYER_PRIVATE_KEY"];
  const routerAddress     = process.env["SUBMISSION_ROUTER_ADDRESS"];
  const gateAddress       = process.env["COMPLIANCE_GATE_ADDRESS"];
  const chainIdRaw        = process.env["CHAIN_ID"] ?? "11155111";

  if (!rpcUrl)            throw new Error("relay: SEPOLIA_RPC_URL is not set");
  if (!relayerPrivateKey) throw new Error("relay: RELAYER_PRIVATE_KEY is not set");
  if (!routerAddress)     throw new Error("relay: SUBMISSION_ROUTER_ADDRESS is not set");
  if (!gateAddress)       throw new Error("relay: COMPLIANCE_GATE_ADDRESS is not set");

  return {
    rpcUrl,
    relayerPrivateKey,
    routerAddress,
    gateAddress,
    chainId: Number(chainIdRaw),
  };
}

export interface SubmitParams {
  proof:         string;
  publicInputs:  string[];
  nullifier:     string;
}

export async function checkCompliantOnChain(
  params: SubmitParams,
  config?: Partial<RelayConfig>,
): Promise<boolean> {
  const cfg = { ...loadRelayConfig(), ...config };
  const provider = new JsonRpcProvider(cfg.rpcUrl);
  const gate = new Contract(cfg.gateAddress, GATE_ABI, provider);
  return gate.getFunction("checkCompliant")(
    params.proof,
    params.publicInputs,
    params.nullifier,
  ) as Promise<boolean>;
}

export async function broadcastSubmitCompliant(
  params: SubmitParams,
  config?: Partial<RelayConfig>,
): Promise<{ txHash: string; blockNumber: number }> {
  const cfg = { ...loadRelayConfig(), ...config };

  if (!isHexString(params.proof)) throw new Error("relay: invalid proof hex");
  if (!isHexString(params.nullifier)) throw new Error("relay: invalid nullifier hex");
  for (const input of params.publicInputs) {
    if (!isHexString(input)) throw new Error(`relay: invalid public input: ${input}`);
  }

  const valid = await checkCompliantOnChain(params, cfg);
  if (!valid) throw new Error("relay: checkCompliant returned false");

  const provider = new JsonRpcProvider(cfg.rpcUrl);
  const wallet   = new Wallet(cfg.relayerPrivateKey, provider);
  const router   = new Contract(cfg.routerAddress, ROUTER_ABI, wallet);

  const gasEstimate = await router.getFunction("submitCompliant").estimateGas(
    params.proof,
    params.publicInputs,
    params.nullifier,
  );
  const gasLimit = (gasEstimate * 120n) / 100n;

  const tx = await router.getFunction("submitCompliant")(
    params.proof,
    params.publicInputs,
    params.nullifier,
    { gasLimit },
  );

  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`relay: transaction ${tx.hash} failed`);
  }

  return { txHash: tx.hash as string, blockNumber: receipt.blockNumber };
}
