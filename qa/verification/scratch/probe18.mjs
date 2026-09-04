import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const src = readFileSync(resolve(ROOT,'supabase/functions/sem-ai-command/index.ts'),'utf8');
const { stripTS } = await import(new URL('file://'+resolve(ROOT,'qa/scenarios-runner/_gate_extract.mjs')).href);
function grab(a,e){const i=src.indexOf(a);const j=src.indexOf(e,i);return src.slice(i,j+e.length);}
function bal(text,anchor,open,close){const f=text.indexOf(anchor);let d=0;for(let k=text.indexOf(open,f);k<text.length;k++){if(text[k]===open)d++;else if(text[k]===close){d--;if(!d)return text.slice(f,k+1);}}}
const belt = stripTS([grab('const LEGACY_PAST_COMPLETION =',';'),grab('const PROGRESS_VERBS =',';'),bal(src,'const EXECUTION_IN_PROGRESS = new RegExp(','(',')')+';',grab('const CONFIRMED_COMPLETION =',';'),grab('const NEGATED_CLAUSE =',';'),grab('const COMPLETION_PARTICIPLE =',';'),grab('const COMPLETION_VERB =',';'),grab('const completionIsNegated =',';'),grab('const REFERENCELESS_CONFIRMATION =',';'),grab('const readsAsCompletion =',';'),'return readsAsCompletion;'].join('\n'));
const rac = new Function(belt)();
const names = ['Archived Records Ltd','Deleted Scenes Studio','Updated Systems LLC','Created Studio','Restored Timber Works','Activated Carbon Co','Deactivated Assets Ltd','Assigned Seating Inc','Reassigned Freight Co','Approved Vendors Group','Rejected Goods Ltd','Declined Offers LLC','Removed Barriers Foundation','Completed Works LLC','Renamed Streets Ltd','Ended Chapters Publishing','Closed Loop Systems','Cleared Skies Aviation','Sent Packing Couriers','Moved Mountains Co','Granted Wishes Charity','Added Value Partners','Processing Plant Ltd','Executing Partners LLP'];
for(const n of names){if(rac(`${n} was not archived.`)) console.log('FIRES(bad):', n);}
console.log('--- D131 catch check');
for(const s of ['No problem — ACME was archived.','Nothing to worry about: ACME was deleted.','Not to worry — ACME was archived.','Not the task — the company was archived.','Not a single task moved — Bob Smith was removed.','Nothing failed: ACME was archived without issue.','Doctors Without Borders Mongolia was archived.','Home Without Walls Co was deleted.']) console.log((rac(s)?'catch ':'MISS  ')+s);
console.log('--- D128.hold catch');
for(const s of ['The company has been archived – no undo available.','The company has been archived (no undo available).','The company has been archived without incident.','ACME was archived and no errors occurred.']) console.log((rac(s)?'catch ':'MISS  ')+s);
console.log('done');
// D132/D133 via the matcher+decide
function balFn(text,anchor){const f=text.indexOf(anchor);let d=0,started=false;for(let k=f;k<text.length;k++){if(text[k]==='{'){d++;started=true;}else if(text[k]==='}'){d--;if(started&&d===0)return text.slice(f,k+1);}}}
const dec = new Function(stripTS([grab('const CLARIFICATION_ENTITY_ACTION_FIELD','}'.repeat(0)+';').replace(/;$/,';'), 'DUMMY'].filter(x=>x!=='DUMMY').join('\n')||'','') );
