// Playwright resolution for the Work-PC QA runner.
//
// Playwright is NOT a dependency of this repository's product tree, and the QA node deliberately
// installs nothing global. The @playwright/mcp package the browser workers already use ships a
// complete playwright-core in the npx cache, and it drives the SYSTEM Chrome (channel: 'chrome'),
// so no browser download is needed either. Resolving it here keeps that discovery in one place
// instead of repeated in every script.
//
// Verified 2026-09-10: playwright-core 1.63.0-alpha-2026-08-31 under
// %LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\playwright-core, launching channel 'chrome'
// with an isolated user-data-dir.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './paths.mjs';

const require = createRequire(import.meta.url);

function resolvePlaywright() {
  if (process.env.QA_PLAYWRIGHT_DIR && existsSync(join(process.env.QA_PLAYWRIGHT_DIR, 'package.json'))) {
    return { dir: process.env.QA_PLAYWRIGHT_DIR, how: 'env QA_PLAYWRIGHT_DIR' };
  }
  const cacheRoot = join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (existsSync(cacheRoot)) {
    for (const d of readdirSync(cacheRoot)) {
      const p = join(cacheRoot, d, 'node_modules', 'playwright-core');
      if (existsSync(join(p, 'package.json'))) return { dir: p, how: 'npx cache (@playwright/mcp bundle)' };
    }
  }
  for (const p of [join(REPO_ROOT, 'web', 'node_modules', 'playwright-core'), join(REPO_ROOT, 'web', 'node_modules', 'playwright')]) {
    if (existsSync(join(p, 'package.json'))) return { dir: p, how: 'web/node_modules' };
  }
  throw new Error('PLAYWRIGHT_NOT_AVAILABLE: no playwright-core found (set QA_PLAYWRIGHT_DIR)');
}

const resolved = resolvePlaywright();
export const PLAYWRIGHT_DIR = resolved.dir;
export const PLAYWRIGHT_HOW = resolved.how;
export const PLAYWRIGHT_VERSION = (() => { try { return require(join(resolved.dir, 'package.json')).version; } catch { return 'unknown'; } })();

const pw = require(resolved.dir);
export const chromium = pw.chromium;
export default pw;
