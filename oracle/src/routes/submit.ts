/**
 * POST /api/submit — relayer endpoint for private compliance submission.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { isHexString } from "ethers";

import { recoverAuthorizeSigner } from "../lib/eip712.js";
import { broadcastSubmitCompliant } from "../lib/relayClient.js";

export interface SubmitBody {
  proof:        string;
  publicInputs: string[];
  nullifier:    string;
  signature?:    string;
  deadline?:     string;
}

function parseBody(raw: unknown): SubmitBody {
  if (!raw || typeof raw !== "object") throw new Error("Invalid JSON body");
  const b = raw as Record<string, unknown>;

  const proof        = b["proof"];
  const publicInputs = b["publicInputs"];
  const nullifier    = b["nullifier"];
  const signature    = b["signature"];
  const deadline     = b["deadline"];

  if (typeof proof !== "string" || !isHexString(proof))
    throw new Error("proof must be a hex string");
  if (!Array.isArray(publicInputs) || publicInputs.length < 1)
    throw new Error("publicInputs must be a non-empty array");
  if (!publicInputs.every((x) => typeof x === "string" && isHexString(x)))
    throw new Error("publicInputs must be hex strings");
  if (typeof nullifier !== "string" || !isHexString(nullifier))
    throw new Error("nullifier must be a hex string");
  if (b["signature"] !== undefined && typeof b["signature"] !== "string")
    throw new Error("signature must be a hex string when provided");
  if (b["deadline"] !== undefined && typeof b["deadline"] !== "string" && typeof b["deadline"] !== "number")
    throw new Error("deadline must be a string or number when provided");

  return {
    proof,
    publicInputs: publicInputs as string[],
    nullifier,
    ...(typeof b["signature"] === "string" ? { signature: b["signature"] } : {}),
    ...(b["deadline"] !== undefined ? { deadline: String(b["deadline"]) } : {}),
  };
}

export function createSubmitRouter(): Hono {
  const app = new Hono();

  app.post("/api/submit", async (c: Context) => {
    try {
      const body = parseBody(await c.req.json());

      const routerAddress = process.env["SUBMISSION_ROUTER_ADDRESS"];
      const chainId       = Number(process.env["CHAIN_ID"] ?? "11155111");
      const requireAuth   = process.env["REQUIRE_RELAYER_AUTH"] !== "false";

      if (!routerAddress) {
        return c.json({ error: "SUBMISSION_ROUTER_ADDRESS not configured" }, 503);
      }

      const root = body.publicInputs[0];
      if (!root) {
        return c.json({ error: "publicInputs[0] (root) is required" }, 400);
      }

      if (requireAuth) {
        if (!body.signature || body.deadline === undefined) {
          return c.json({ error: "signature and deadline required" }, 400);
        }
        const deadline = BigInt(body.deadline);
        if (deadline < BigInt(Math.floor(Date.now() / 1000))) {
          return c.json({ error: "Authorization expired" }, 400);
        }
        const signer = recoverAuthorizeSigner(
          {
            nullifier: body.nullifier,
            root,
            chainId:  BigInt(chainId),
            deadline,
          },
          body.signature,
          routerAddress,
        );
        void signer;
      }

      const { txHash, blockNumber } = await broadcastSubmitCompliant({
        proof:        body.proof,
        publicInputs: body.publicInputs,
        nullifier:    body.nullifier,
      });

      return c.json({ txHash, blockNumber });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed";
      const status  = message.includes("checkCompliant") ? 422 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.get("/api/health", (c) => c.json({ ok: true, service: "nullproof-relayer" }));

  return app;
}
