// Verifier #49 — run a v48 tool against an arbitrary index.ts (sets SEM_INDEX_SRC before import).
// usage: node run_with_src.mjs <index.ts path> <tool.mjs path> [--empty]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [src, tool] = process.argv.slice(2);
if (!src || !tool) { console.error('usage: run_with_src.mjs <index.ts> <tool.mjs> [--empty]'); process.exit(2); }
process.env.SEM_INDEX_SRC = resolve(src);
await import(pathToFileURL(resolve(tool)).href);
