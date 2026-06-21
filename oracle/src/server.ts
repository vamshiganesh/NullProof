/**
 * HTTP API server for relayer-mediated compliance submissions.
 *
 * Run: pnpm oracle:api
 */

import "dotenv/config";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";

import { createSubmitRouter } from "./routes/submit.js";

const PORT = Number(process.env["PORT"] ?? "3001");
const CORS_ORIGIN = process.env["CORS_ORIGIN"] ?? "http://localhost:5173";

/** Explicit allow-list from env (comma-separated). */
function explicitCorsOrigins(): string[] {
  return CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Vercel assigns multiple URLs per project (production + git previews).
 * Allow any nullproof*.vercel.app origin so preview deploys work without
 * updating CORS_ORIGIN on every branch.
 */
function isAllowedOrigin(origin: string): boolean {
  if (explicitCorsOrigins().includes(origin)) return true;
  if (/^https:\/\/nullproof[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  return false;
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return explicitCorsOrigins()[0];
      return isAllowedOrigin(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/", (c) =>
  c.json({
    service: "nullproof-relayer",
    status:  "running",
    endpoints: {
      health: "GET /api/health",
      submit: "POST /api/submit",
    },
  }),
);

app.route("/", createSubmitRouter());

console.log(`[relayer] listening on http://0.0.0.0:${PORT}`);
console.log(`[relayer] CORS explicit: ${explicitCorsOrigins().join(" | ") || "(none)"}`);
console.log(`[relayer] CORS also allows: https://nullproof*.vercel.app, http://localhost:*`);

const server = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[relayer] Port ${PORT} is already in use. ` +
      `Stop the other process (e.g. lsof -i :${PORT}) or set PORT in oracle/.env.`,
    );
    process.exit(1);
  }
  throw err;
});
