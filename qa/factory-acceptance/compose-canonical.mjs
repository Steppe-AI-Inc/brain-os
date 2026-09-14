// Compose the canonical report: existing qa/work-pc/FACTORY_V1_INDEPENDENT_ACCEPTANCE.md
// + results/CANONICAL_UPDATE_FRAGMENT.md + results/EVIDENCE_TABLES.md (between markers).
// Idempotent: a previous generated block is replaced, never duplicated.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../runner/lib/paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const target = join(REPO_ROOT, 'qa', 'work-pc', 'FACTORY_V1_INDEPENDENT_ACCEPTANCE.md');
const BEGIN = '<!-- BEGIN WORK-PC EXECUTED EVIDENCE -->';
const END = '<!-- END WORK-PC EXECUTED EVIDENCE -->';
let doc = readFileSync(target, 'utf8');
const fragment = readFileSync(join(HERE, 'results', 'CANONICAL_UPDATE_FRAGMENT.md'), 'utf8');
const tables = readFileSync(join(HERE, 'results', 'EVIDENCE_TABLES.md'), 'utf8');
const block = `${BEGIN}\n${fragment}\n### 13.6 Per-check evidence tables (generated)\n\n${tables}\n${END}\n`;
if (doc.includes(BEGIN) && doc.includes(END)) doc = doc.slice(0, doc.indexOf(BEGIN)) + block + doc.slice(doc.indexOf(END) + END.length + 1);
else doc = doc.replace(/\s*$/, '\n\n') + block;
// header line: acceptance state now carries the executed-evidence pointer
doc = doc.replace(/\*\*Implementation boundary:\*\* verification\/evidence only; no product\/Factory implementation fixes from this seat\.\s*\n/, (m) => m + '**Executed-evidence update:** section 13 (2026-09-14, harness `qa/factory-acceptance/`, 55 provenance-bound checks on `origin/master@55a1591…` and `origin/p1/control-plane-phase0@dcc0d9c…`)  \n');
writeFileSync(target, doc);
console.log('composed', target, doc.length, 'chars; generated block present:', doc.includes(BEGIN) && doc.includes(END));
