// Verifier #50 — deno type-check of the candidate (read-only), via `npx --yes deno@2 check`.
// Writes the full log and the TS error count so the baseline (23) can be compared.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const target = process.argv[2] || path.resolve(here, "../../../../supabase/functions/sem-ai-command/index.ts");
const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "deno@2", "check", target],
  { encoding: "utf8", shell: process.platform === "win32", timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
const out = (r.stdout || "") + "\n" + (r.stderr || "");
const errs = (out.match(/^TS\d+ \[ERROR\]/gm) || []).length;
const found = (out.match(/Found (\d+) errors?/) || [])[1];
writeFileSync(path.join(here, "deno_check.log"), out + `\nEXIT=${r.status}\nTS_ERROR_LINES=${errs}\nFOUND=${found}\n`);
console.log(`target=${target}\nexit=${r.status} ts_error_lines=${errs} found=${found}`);
console.log(out.split("\n").filter((l) => /^TS\d+ \[ERROR\]/.test(l)).slice(0, 40).join("\n"));
