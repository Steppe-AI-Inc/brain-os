/**
 * Vercel Node Function entrypoint.
 *
 * Imports the *compiled* app (dist/, built by `npm run build`) rather than
 * src/ directly — Vercel's per-function bundler traces this file's imports
 * at deploy time, and tracing plain compiled JS is more predictable than
 * tracing TypeScript source through a separate tsconfig scope.
 *
 * Builds the Fastify instance once per warm container (module-level
 * memoized promise), then hands every request to it via the same
 * `server.emit("request", …)` trick used by every other Fastify-on-Vercel
 * deployment — Fastify's `app.server` is a real `http.Server`, so emitting
 * the request event runs it through Fastify's router without needing an
 * actual listening port.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { FastifyInstance } from "fastify";

import { buildApp } from "../dist/app.js";

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}
