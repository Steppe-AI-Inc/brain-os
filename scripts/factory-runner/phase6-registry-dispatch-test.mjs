// Phase 6 acceptance test: registry-driven execution. The caller supplies ONLY a
// canonical Brain OS Agent ID - never a raw agent name/definition path - proving the
// registry (not the caller) actually drives which real definition gets dispatched.
import * as provider from './provider.mjs';

const AGENT_ID = '7703cae0-2a4f-4f11-b79f-f1bff1904820'; // brain-os-implementation-engineer, real registry row

console.log('Resolving agent from registry (no name/path supplied by this script)...');
const resolved = await provider.resolveAgentFromRegistry(AGENT_ID);
console.log('RESOLVED:', JSON.stringify(resolved, null, 2));

console.log('Dispatching via startRunByAgentId (registry-driven, not name-driven)...');
const { providerRunId, agentName, definitionHash } = await provider.startRunByAgentId(
  AGENT_ID,
  'Phase 6 registry-driven-execution acceptance test. Report back the exact text: REGISTRY DISPATCH OK. Take no other action.'
);
console.log('PROVIDER_RUN_ID:', providerRunId);
console.log('AGENT_NAME (resolved from registry, not supplied by caller):', agentName);
console.log('DEFINITION_HASH (re-verified at dispatch time):', definitionHash);
