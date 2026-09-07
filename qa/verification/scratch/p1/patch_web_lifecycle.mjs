// Web side of the P1 package: every archive/restore-style wrapper goes through
// callLifecycleRpc (governance/CANONICAL_WORK_CONTRACT.md §2) — one result shape, one
// verification rule, one receipt; no per-entity reimplementation.
import { readFileSync, writeFileSync } from 'node:fs';
function rw(p, pairs) {
  const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; let s = raw.replace(/\r\n/g, '\n');
  for (const [a, b, l] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${p} ${l}: found ${n}`); s = s.replace(a, () => b); }
  writeFileSync(p, s.replace(/\n/g, nl)); console.log('ok', p);
}

// companies.ts
rw('web/lib/data/companies.ts', [
  [`import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
`, `import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callLifecycleRpc } from "@/lib/contracts/lifecycle";
`, 'import'],
  [`export async function archiveCompany(id: string) {
  if (!UUID_RE.test(id)) return "Invalid company id.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_company", { p_company_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Archive failed — no result returned.";
  if (result.reason === "not_found") return "This company no longer exists.";
  if (result.reason === "denied") return "You do not have permission to archive this company.";
  revalidatePath("/companies");
  return null;
}

export async function restoreCompany(id: string) {
  if (!UUID_RE.test(id)) return "Invalid company id.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_company", { p_company_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This company no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this company.";
  revalidatePath("/companies");
  return null;
}`,
  `// Both go through callLifecycleRpc (lib/contracts/lifecycle.ts): the same RPC Brain Chat
// calls, the same verification rule (changed && postconditionPassed), the same receipt shape.
// The Archived view is the UI restore affordance (companies/archived); chat resolves the
// target server-side across every status — one product operation, two entry points.
const COMPANY_PATHS = ["/companies", "/companies/archived", "/people", "/projects", "/departments", "/dashboard", "/goals", "/tasks"];

export async function archiveCompany(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "archive_company", idParam: "p_company_id", id, entityType: "company", action: "archive", requestedValues: { status: "archived" } });
  if (userMessage) return userMessage;
  for (const p of COMPANY_PATHS) revalidatePath(p);
  return null;
}

export async function restoreCompany(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "restore_company", idParam: "p_company_id", id, entityType: "company", action: "restore", requestedValues: { status: "active" } });
  if (userMessage) return userMessage;
  for (const p of COMPANY_PATHS) revalidatePath(p);
  return null;
}`, 'wrappers'],
]);

// tasks.ts
rw('web/lib/data/tasks.ts', [
  [`import { createClient } from "@/lib/supabase/server";
`, `import { createClient } from "@/lib/supabase/server";
import { callLifecycleRpc } from "@/lib/contracts/lifecycle";
`, 'import'],
  [`export async function archiveTask(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_task", { p_task_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Archive failed — no result returned.";
  if (result.reason === "not_found") return "This task no longer exists.";
  if (result.reason === "denied") return "You do not have permission to archive this task.";
  revalidatePath("/tasks");
  return null;
}`, `export async function archiveTask(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "archive_task", idParam: "p_task_id", id, entityType: "task", action: "archive", requestedValues: { status: "archived" } });
  if (userMessage) return userMessage;
  revalidatePath("/tasks");
  return null;
}`, 'archive'],
  [`export async function restoreTask(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_task", { p_task_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This task no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this task.";
  revalidatePath("/tasks");
  return null;
}`, `export async function restoreTask(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "restore_task", idParam: "p_task_id", id, entityType: "task", action: "restore" });
  if (userMessage) return userMessage;
  revalidatePath("/tasks");
  return null;
}`, 'restore'],
]);

// goals.ts
rw('web/lib/data/goals.ts', [
  [`import { createClient } from "@/lib/supabase/server";
`, `import { createClient } from "@/lib/supabase/server";
import { callLifecycleRpc } from "@/lib/contracts/lifecycle";
`, 'import'],
  [`export async function archiveGoal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_goal", { p_goal_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Archive failed — no result returned.";
  if (result.reason === "not_found") return "This goal no longer exists.";
  if (result.reason === "denied") return "You do not have permission to archive this goal.";
  revalidatePath("/goals");`, `export async function archiveGoal(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "archive_goal", idParam: "p_goal_id", id, entityType: "goal", action: "archive", requestedValues: { status: "archived" } });
  if (userMessage) return userMessage;
  revalidatePath("/goals");`, 'archive'],
  [`export async function restoreGoal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_goal", { p_goal_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This goal no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this goal.";
  revalidatePath("/goals");`, `export async function restoreGoal(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "restore_goal", idParam: "p_goal_id", id, entityType: "goal", action: "restore" });
  if (userMessage) return userMessage;
  revalidatePath("/goals");`, 'restore'],
]);

// people.ts
rw('web/lib/data/people.ts', [
  [`import { createAdminClient } from "@/lib/supabase/admin";
`, `import { createAdminClient } from "@/lib/supabase/admin";
import { callLifecycleRpc } from "@/lib/contracts/lifecycle";
`, 'import'],
  [`export async function endPersonEmployment(id: string) {
  if (!UUID_RE.test(id)) return "Invalid person id.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_person_employment", { p_person_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "End employment failed — no result returned.";
  if (result.reason === "not_found") return "This person no longer exists.";
  if (result.reason === "denied") return "You do not have permission to end this person's employment.";
  revalidatePath("/people");
  return null;
}

export async function restorePersonEmployment(id: string) {
  if (!UUID_RE.test(id)) return "Invalid person id.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_person_employment", { p_person_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This person no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this person's employment.";
  revalidatePath("/people");
  return null;
}`, `export async function endPersonEmployment(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "end_person_employment", idParam: "p_person_id", id, entityType: "person", action: "end_employment", requestedValues: { active: false } });
  if (userMessage) return userMessage;
  revalidatePath("/people");
  return null;
}

export async function restorePersonEmployment(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "restore_person_employment", idParam: "p_person_id", id, entityType: "person", action: "restore_employment", requestedValues: { active: true } });
  if (userMessage) return userMessage;
  revalidatePath("/people");
  return null;
}`, 'employment'],
]);
