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

const app = new Hono();

app.use(
  "*",
  cors({
    origin: CORS_ORIGIN.split(",").map((s) => s.trim()),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.route("/", createSubmitRouter());

console.log(`[relayer] listening on http://localhost:${PORT}`);
console.log(`[relayer] CORS origin: ${CORS_ORIGIN}`);

const server = serve({ fetch: app.fetch, port: PORT });

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
