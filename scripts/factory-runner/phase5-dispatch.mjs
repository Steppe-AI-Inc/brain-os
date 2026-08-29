// Phase 5 bootstrap acceptance test - real dispatch through the proven provider module
// (not the raw CLI by hand), matching the exact real Task row created in public.tasks
// (id 68468064-13df-4c91-a6af-9908a017c9bd) for the real canonical Work Order
// "Create a harmless factory verification artifact" (id 91f6ac74-f738-4fb5-9d46-01c426a31e12).
import * as provider from './provider.mjs';

const cwd = 'C:\\Users\\Dell\\dev\\brain-os';

const task = `You are executing real Task 68468064-13df-4c91-a6af-9908a017c9bd under Software Factory canonical Work Order 91f6ac74-f738-4fb5-9d46-01c426a31e12 ("Create a harmless factory verification artifact"), part of the Phase 5 bootstrap acceptance test for Brain OS's Software Factory.

Do exactly this, no more:
1. Create a new file docs/software-factory/BOOTSTRAP_ARTIFACT.md with real, honest content: a short markdown file stating that this artifact was created by a real, genuinely dispatched Claude Code background agent (brain-os-implementation-engineer) as part of the Software Factory's Phase 5 bootstrap acceptance test, include the real canonical Work Order id (91f6ac74-f738-4fb5-9d46-01c426a31e12), Task id (68468064-13df-4c91-a6af-9908a017c9bd), and the current UTC timestamp you observe.
2. Commit that one file with a real, descriptive commit message on the current branch.
3. After committing, report back the exact real commit SHA (run git rev-parse HEAD and include its output verbatim) and the exact branch name (git branch --show-current).

Do not touch any other file. Do not run supabase db push or any other production database migration. Do not create a new branch or worktree if you can commit directly to the current branch — if a worktree is auto-created, report its path and branch name explicitly in your final report.`;

console.log('healthCheck:', await provider.healthCheck());

const { providerRunId } = await provider.startRun('brain-os-implementation-engineer', task, cwd);
console.log('PROVIDER_RUN_ID:', providerRunId);
