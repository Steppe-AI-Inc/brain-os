import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const outputPath = resolve(process.cwd(), "types/database.ts");
const temporaryPath = `${outputPath}.tmp`;

if (!projectRef) {
  throw new Error("SUPABASE_PROJECT_REF is required.");
}

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required. Use a fresh token and never commit it.");
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  [
    "--yes",
    "supabase@latest",
    "gen",
    "types",
    "typescript",
    "--project-id",
    projectRef,
    "--schema",
    "public",
  ],
  {
    encoding: "utf8",
    env: process.env,
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
  }
);

if (result.status !== 0) {
  throw new Error(result.stderr.trim() || "Supabase type generation failed.");
}

if (!result.stdout.includes("export type Database") || !result.stdout.includes("public:")) {
  throw new Error("Supabase returned an unexpected type file; existing generated types were preserved.");
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  temporaryPath,
  `// GENERATED FILE - DO NOT EDIT. Regenerate with: npm run db:types\n${result.stdout}`,
  "utf8"
);
rmSync(outputPath, { force: true });
renameSync(temporaryPath, outputPath);

console.log(`Generated ${outputPath}`);
