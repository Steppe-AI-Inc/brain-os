// Verifier #50 — READ-ONLY download of the deployed sem-ai-command source into an isolated
// scratch cwd so nothing can land on the candidate working tree. Never deploys.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const dl = path.join(here, "dl");
mkdirSync(dl, { recursive: true });

const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "functions", "download", "sem-ai-command", "--project-ref", "pvphxgrtdfrudejjhzjk"],
  { cwd: dl, encoding: "utf8", shell: process.platform === "win32", timeout: 180000 },
);
console.log("exit", r.status);
console.log((r.stdout || "").slice(-1500));
console.log((r.stderr || "").slice(-1500));

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
for (const f of walk(dl)) {
  const b = readFileSync(f);
  const lf = Buffer.from(b.toString("utf8").replace(/\r\n/g, "\n"));
  console.log(
    `${path.relative(here, f)} bytes=${b.length} sha256=${createHash("sha256").update(b).digest("hex")} lf_sha256=${createHash("sha256").update(lf).digest("hex")} crlf=${(b.toString("utf8").match(/\r\n/g) || []).length}`,
  );
}
