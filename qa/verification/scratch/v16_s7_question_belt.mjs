// VERIFIER #16 / SCENARIO 7 — the fifth consecutive change to a drift belt.
// Campaigns #72-#75 each closed one direction by reopening the other. Measure BOTH
// directions of the COMPLETION belt (done in v16_s3) and BOTH directions of the
// QUESTION belt, which this candidate claims not to have touched. Confirm by diff AND
// behaviourally.
import fs from 'node:fs';

function buildQuestionBelt(srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const balanced = (anchor) => {
    const i = src.indexOf(anchor);
    if (i < 0) throw new Error('missing ' + anchor);
    let d = 0;
    for (let j = src.indexOf('{', i); j < src.length; j++) {
      if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
    }
    throw new Error('unbalanced ' + anchor);
  };
  const stmt = (anchor) => {
    const i = src.indexOf(anchor);
    let d = 0, inRe = false, inStr = null;
    for (let j = i; j < src.length; j++) {
      const c = src[j], n = src[j + 1];
      if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
      if (inRe) { if (c === '\\') { j++; continue; } if (c === '[') { while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; } continue; } if (c === '/') inRe = false; continue; }
      if (c === '/' && n === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '/') { let k = j - 1; while (k >= 0 && /\s/.test(src[k])) k--; if (k < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(src[k])) { inRe = true; continue; } }
      if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
      else if (c === ';' && d === 0) return src.slice(i, j + 1);
    }
    throw new Error('no terminator ' + anchor);
  };
  const body = `
    ${stmt('const UUID_IN_TEXT =')}
    ${stmt('const PAST_COMPLETION_CLAIM_PATTERN =')}
    ${stmt('const COMPLETION_WORD =')}
    ${stmt('const FUTURE_PROMISE_IN_QUESTION =')}
    ${balanced('const safeProseFragment =')};
    ${balanced('const safeQuestionFragment =')};
    return safeQuestionFragment;
  `.replace(/\(s:\s*unknown\)/g, '(s)').replace(/\)\s*:\s*string\s*\|\s*null\s*=>/g, ') =>');
  // eslint-disable-next-line no-new-func
  return new Function(body)();
}

const cand = buildQuestionBelt('supabase/functions/sem-ai-command/index.ts');
const base = buildQuestionBelt('qa/verification/scratch/baseline_d724d8c_index.ts');

// Direction 1: GENUINE questions must SURVIVE (belt must not destroy truth).
const GENUINE = [
  'Which company did you mean?',
  'Did you mean ACME or ACME Holdings?',
  'Did you mean the company I archived last week?',
  'Which of the ones I removed should come back?',
  'Should the tasks we completed be reopened?',
  'What happens to the tasks we completed?',
  'Which archived company did you mean?',
  'Who should the task be assigned to?',
  'Should I archive ACME?',
  'Do you want the archived or the active list?',
  'Which employee should I end employment for?',
  'Is this the right project?',
  'Should I restore test3?',
  'Which of these three did you mean?',
  'Do you want me to proceed?',
];
// Direction 2: a question carrying a FUTURE PROMISE or a fabricated completion must be refused.
const REFUSED = [
  "I'll archive ACME — should I proceed?",
  'I am going to assign the task. OK?',
  "I'll create the project, ok?",
  'ACME has been archived. Anything else?',
  'Bob Smith was reassigned. Anything else?',
  'Deleted successfully. Next?',
];

let sd = 0, sdB = 0, rl = 0, rlB = 0;
console.log('=== QUESTION BELT direction 1: genuine questions must SURVIVE ===');
for (const q of GENUINE) {
  const c = cand(q), b = base(q);
  if (c === null) sd++; if (b === null) sdB++;
  console.log(`${c === null ? 'DESTROYED ' : 'survives  '} cand=${JSON.stringify(c)} base=${JSON.stringify(b)}  << ${q}`);
}
console.log('\n=== QUESTION BELT direction 2: promise/completion questions must be REFUSED ===');
for (const q of REFUSED) {
  const c = cand(q), b = base(q);
  if (c !== null) rl++; if (b !== null) rlB++;
  console.log(`${c !== null ? 'LEAKED    ' : 'refused   '} cand=${JSON.stringify(c)} base=${JSON.stringify(b)}  << ${q}`);
}
console.log(`\nQUESTION BELT: destroyed-genuine cand=${sd}/${GENUINE.length} base=${sdB}/${GENUINE.length} | leaked-promise cand=${rl}/${REFUSED.length} base=${rlB}/${REFUSED.length}`);
console.log(sd === sdB && rl === rlB ? 'QUESTION BELT UNCHANGED in both directions (matches the diff: no hunk touches it).'
  : '*** QUESTION BELT MOVED — the candidate claims it did not touch this belt ***');
