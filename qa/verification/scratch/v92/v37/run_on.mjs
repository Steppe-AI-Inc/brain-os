// usage: node run_on.mjs <index.ts path> <script.mjs> — sets SEM_INDEX_SRC in-process, then imports the script.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
process.env.SEM_INDEX_SRC = resolve(process.argv[2]);
await import(pathToFileURL(resolve(process.argv[3])).href);
