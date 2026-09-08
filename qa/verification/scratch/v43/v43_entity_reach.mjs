// v43: how far does the entity signal actually reach on the destroyed class?
import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
const src = readSrc(CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const PART = ['Archived', 'Restored', 'Removed', 'Deleted', 'Renamed', 'Completed', 'Closed', 'Cleared', 'Sent', 'Moved', 'Granted', 'Added', 'Assigned', 'Approved'];
const NAMES = ['Media Group', 'Furniture Co', 'Skies Ltd', 'Parcel Co', 'Works Inc', 'Goods Ltd', 'Loop Systems', 'Value Group'];
const TAIL = ['It is still active.', 'It remains active.', 'It still exists in the active list.', 'They remain active.', 'This still shows as active.', 'That remains open.', 'It continues to be active.'];
const PHRASES = []; const ROWS = [];
for (const p of PART) for (const n of NAMES) { PHRASES.push(`${p} ${n}`); for (const t of TAIL) ROWS.push({ phrase: `${p} ${n}`, s: `Confirmed - ${p} ${n}. ${t}` }); }
const empty = buildBelt(src, { knownEntityNames: [] });
const dest = ROWS.filter((r) => !v92(r.s) && empty(r.s));
console.log(`destroyed by the candidate with an EMPTY pack (v92 preserves all): ${dest.length} of ${ROWS.length}, spanning ${new Set(dest.map((r) => r.phrase)).size} distinct entity names`);
for (const k of [0, 1, 6, 12, 30, PHRASES.length]) {
  const known = buildBelt(src, { knownEntityNames: PHRASES.slice(0, k) });
  const still = dest.filter((r) => known(r.s)).length;
  console.log(`  pack contains ${String(k).padStart(3)} of the ${PHRASES.length} names -> still destroyed ${String(still).padStart(4)} / ${dest.length}`);
}
console.log('\nContext-pack caps that decide membership (index.ts): companies .limit(12), people .limit(30),');
console.log('tasks .limit(15), archivedTasks .limit(15), plus a name-token lookup capped at NAMED_LOOKUP_ROW_CAP=5.');
console.log('knownEntityNames is built from companies + people + tasks + runtimeLabels ONLY:');
console.log('projects, goals, departments, approvals, documents and proposals can NEVER be rescued.');
