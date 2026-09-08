// Verifier #50 — READ-ONLY production DB probe runner. Executes ONE .sql file (SELECT-only by
// construction; the file is committed beside this runner for inspection) via the Supabase CLI.
// Never used for db push / migrations.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const file = process.argv[2];
if (!file) throw new Error("usage: node db_query.mjs <file.sql>");
const sql = readFileSync(file, "utf8");
if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(sql.replace(/--[^\n]*/g, ""))) throw new Error("refusing: probe file is not SELECT-only");
const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "db", "query", "--linked", "--project-ref", "pvphxgrtdfrudejjhzjk", "--file", file],
  { encoding: "utf8", shell: process.platform === "win32", timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
console.log("exit", r.status);
console.log((r.stdout || "").slice(0, 6000));
console.log((r.stderr || "").split("\n").filter((l) => !/DeprecationWarning|trace-deprecation/.test(l)).join("\n").slice(0, 3000));
