const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

function assertContract(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("requires a caller bearer token", () => {
  assertContract(
    source.includes("auth.startsWith('Bearer ')") && source.includes("Missing Authorization bearer token"),
    "sem-ai-command must reject requests without a bearer token"
  );
});

Deno.test("enforces risky-action approvals outside the prompt", () => {
  assertContract(
    source.includes("FORCED_APPROVAL_KEYWORDS") &&
      source.includes("detectForcedApprovalKeywords") &&
      source.includes("Server-side risk policy forced approval"),
    "sem-ai-command must preserve its server-side forced-approval backstop"
  );
});

Deno.test("persists through the transactional database function", () => {
  assertContract(
    source.includes("supabase.rpc('sem_execute_ai_command'"),
    "sem-ai-command must persist through sem_execute_ai_command"
  );
});

Deno.test("does not use a service-role credential", () => {
  assertContract(
    !source.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "sem-ai-command must keep caller-scoped RLS instead of bypassing it"
  );
});
