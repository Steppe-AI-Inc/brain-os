// #56 closure, pass 2: detyper-safe function forms; the model's structured requestIntent.targetName
// becomes a name source for the resolver (model parses language, server resolves names).
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`        const modelRequestIntentEntity: string | null = (() => { const ri = (result as Record<string, unknown>).requestIntent; return ri && typeof ri === 'object' && typeof (ri as Record<string, unknown>).entityType === 'string' ? String((ri as Record<string, unknown>).entityType) : null; })();`,
`        const modelRequestIntentRaw = (result as Record<string, unknown>).requestIntent;
        const modelRequestIntent: Record<string, unknown> | null = modelRequestIntentRaw && typeof modelRequestIntentRaw === 'object' ? modelRequestIntentRaw as Record<string, unknown> : null;
        const modelRequestIntentEntity: string | null = modelRequestIntent && typeof modelRequestIntent.entityType === 'string' ? String(modelRequestIntent.entityType) : null;
        const modelRequestIntentIsCompanyMutation = !!modelRequestIntent && modelRequestIntent.kind === 'mutation' && modelRequestIntentEntity === 'company';
        const modelRequestIntentAction = modelRequestIntent && typeof modelRequestIntent.action === 'string' ? String(modelRequestIntent.action) : '';
        const modelRequestIntentTarget: string | null = modelRequestIntent && typeof modelRequestIntent.targetName === 'string' && modelRequestIntent.targetName.trim().length > 0 ? modelRequestIntent.targetName.trim().slice(0, 120) : null;
        // The model's own parse of the request (language-independent) is a name source for the
        // resolver in the direction its action names; never a direction the action does not name.
        const modelIntentNamesFor = (action: string): string[] => {
          if (!modelRequestIntentIsCompanyMutation || !modelRequestIntentTarget) return [];
          const isRestore = RESTORE_VERB_PATTERN.test(modelRequestIntentAction);
          const isArchive = ARCHIVE_VERB_PATTERN.test(modelRequestIntentAction) && !isRestore;
          return (action === 'restore' && isRestore) || (action === 'archive' && isArchive) ? [modelRequestIntentTarget] : [];
        };`, 'model intent entity');
must(`        const normaliseName = (v: unknown): string => String(v || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
        const resolveCompanyLifecycleTargets = async (action: string, rawIds: unknown, rawNames: unknown, commandName: string | null): Promise<string[]> => {`,
`        function normaliseName(v: unknown): string { return String(v || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim(); }
        async function resolveCompanyLifecycleTargets(action: string, rawIds: unknown, rawNames: unknown, commandName: string | null): Promise<string[]> {`, 'resolver fn');
must(`          const names: string[] = [...new Set(((Array.isArray(rawNames) ? rawNames : []).filter((x) => typeof x === 'string' && x.trim().length > 0) as string[]).map((x) => x.trim().slice(0, 120)))];
          const resolved: Set<string> = new Set();
          if (ids.length > 0) {
            const { data } = await supabase.from('companies').select('id,name,status').in('id', ids);
            for (const c of (data || []) as CompanyLookupRow[]) { resolved.add(String(c.id)); companyNameById.set(String(c.id), String(c.name)); }
            for (const id of ids) if (!resolved.has(id)) lifecycleUnresolvedLines.push(\`\${companyNameById.get(id) || 'That company'}: could not be found (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`);
          }
          const fromCommand: string[] = names.length === 0 && resolved.size === 0 && commandName ? [commandName] : [];`,
`          const names: string[] = [...new Set([...((Array.isArray(rawNames) ? rawNames : []).filter((x) => typeof x === 'string' && x.trim().length > 0) as string[]), ...modelIntentNamesFor(action)].map((x) => x.trim().slice(0, 120)))];
          const resolved: Set<string> = new Set();
          if (ids.length > 0) {
            const { data } = await supabase.from('companies').select('id,name,status').in('id', ids);
            for (const c of (data || []) as CompanyLookupRow[]) { resolved.add(String(c.id)); companyNameById.set(String(c.id), String(c.name)); }
            for (const id of ids) if (!resolved.has(id)) lifecycleUnresolvedLines.push(\`\${companyNameById.get(id) || 'That company'}: could not be found (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`);
          }
          const fromCommand: string[] = names.length === 0 && resolved.size === 0 && commandName ? [commandName] : [];`, 'names merge');
must(`          return [...resolved];
        };
        const lifecycleCommandName = (pattern: RegExp): string | null => {`,
`          return [...resolved];
        }
        const lifecycleCommandName = (pattern: RegExp): string | null => {`, 'resolver close');
must(`        const lifecycleVerbAt = (pattern: RegExp): number => { const m = String(command || '').match(pattern); return m && typeof m.index === 'number' ? m.index : -1; };`,
`        function lifecycleVerbAt(pattern: RegExp): number { const m = String(command || '').match(pattern); return m && typeof m.index === 'number' ? m.index : -1; }`, 'verbAt fn');
must(`        const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && (commandMentionsCompany || modelRequestIntentEntity === 'company');`,
`        const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && (commandMentionsCompany || modelRequestIntentIsCompanyMutation) && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');`, 'fallback gate');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
