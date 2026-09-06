// VERIFIER #39 — second-round mutation probing: targeted probes + DOUBLE reverts, to
// separate "dead code" from "masked by an overlapping fix".
import { readSrc, buildBelt, CAND_PATH } from './belt39.mjs';

const src = readSrc(CAND_PATH);

const PROBES = [
  ['titleHead.a', 'Pending review was completed.'],
  ['titleHead.b', 'Awaiting approval was granted.'],
  ['titleHead.c', 'Pending Review Partners was archived.'],
  ['auxgap.a', 'ACME Holdings was, as requested, archived.'],
  ['auxgap.b', 'Beta Corp has been, after review, deleted.'],
  ['auxgap.c', 'ACME Holdings was — finally — archived.'],
  ['backstop.paren', 'ACME Holdings was (per the log, checked) archived.'],
  ['backstop.paren2', 'Beta Corp has been (as of today, verified) deleted.'],
  ['pronoun.a', 'The companies, none of which matched, were archived.'],
  ['pronoun.b', 'The records, nobody having approved them, were updated.'],
  ['pronoun.c', 'The tasks, no one being assigned, were completed.'],
  ['pronoun.d', 'The companies, none of which matched, were not archived.'],
  ['determiner.a', 'ACME Holdings, no company in our list, was not archived.'],
  ['determiner.b', 'ACME Holdings, our largest client, was archived.'],
  ['idiom.a', 'No problem the log shows ACME Holdings was archived.'],
  ['idiom.b', 'No problem — ACME Holdings was archived.'],
  ['idiom.c', 'No problem — ACME Holdings was not archived.'],
];

const CUTS = {
  nameInternal: (s) => s.replace(/const nameInternal = capLead && subjectRun && !\/\\bnor\\b\/\.test\(c\);/, 'const nameInternal = false;'),
  titleHead: (s) => s.replace(/const titleHead = [^\n]*?;\n/, 'const titleHead = false;\n'),
  ppInternal: (s) => s.replace(/const ppInternal = [^\n]*?;\n/, 'const ppInternal = false;\n'),
  objectName: (s) => s.replace(/const objectName = [^\n]*?;\n/, 'const objectName = false;\n'),
  newSubject: (s) => s.replace(/const newSubject = [^\n]*?;\n/, 'const newSubject = false;\n'),
  quotedHead: (s) => s.replace(/const quotedHead = [^\n]*?;\n/, 'const quotedHead = false;\n'),
  backstop: (s) => {
    const a = s.indexOf('const readsAsCompletion = (s) => String(s).split(/(?<=[.!?])\\s+/).some(');
    const b = s.indexOf(' || REFERENCELESS_CONFIRMATION.test(s)', a);
    if (a < 0 || b < 0) throw new Error('backstop site');
    return s.slice(0, a) + 'const readsAsCompletion = (s) => false' + s.slice(b);
  },
  auxgap: (s) => {
    const i = s.indexOf("String(s).replace(new RegExp('(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)");
    const e = s.indexOf(".replace(/^\\s*(?:(?:no problem", i);
    if (i < 0 || e < 0) throw new Error('auxgap site');
    return s.slice(0, i) + 'String(s)' + s.slice(e);
  },
  idiomWide: (s) => {
    const i = s.indexOf(".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=");
    const e = s.indexOf(".replace(/,\\s*((?:[^,.\\x3b:!?()]{0,20}?)", i);
    if (i < 0 || e < 0) throw new Error('idiomWide site');
    return s.slice(0, i) + s.slice(e);
  },
  pronounComma: (s) => {
    const i = s.indexOf(".replace(/,\\s*((?:[^,.\\x3b:!?()]{0,20}?)");
    const e = s.indexOf(".replace(/,\\s*(?:(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)", i);
    if (i < 0 || e < 0) throw new Error('pronounComma site');
    return s.slice(0, i) + s.slice(e);
  },
  generalComma: (s) => {
    const i = s.indexOf(".replace(/,\\s*(?:(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)");
    const e = s.indexOf(".split(/(?:[!?,\\x3b\\n]|\\.(?=\\s|$))+", i);
    if (i < 0 || e < 0) throw new Error('generalComma site');
    return s.slice(0, i) + s.slice(e);
  },
};

const variants = [
  ['BASE', []],
  ['-titleHead', ['titleHead']],
  ['-titleHead-quotedHead', ['titleHead', 'quotedHead']],
  ['-backstop', ['backstop']],
  ['-auxgap', ['auxgap']],
  ['-backstop-auxgap', ['backstop', 'auxgap']],
  ['-pronounComma', ['pronounComma']],
  ['-generalComma', ['generalComma']],
  ['-idiomWide', ['idiomWide']],
];

const results = {};
for (const [name, cuts] of variants) {
  let s = src; for (const c of cuts) s = CUTS[c](s);
  const belt = buildBelt(s);
  results[name] = PROBES.map(([, t]) => belt.readsAsCompletion(t) === true);
}
const names = variants.map((v) => v[0]);
console.log('probe'.padEnd(20) + names.map((n) => n.padEnd(23)).join(''));
PROBES.forEach(([tag, text], i) => {
  console.log(tag.padEnd(20) + names.map((n) => (results[n][i] ? 'FIRE' : '----').padEnd(23)).join('') + '  ' + JSON.stringify(text));
});
console.log('\nDIFFS vs BASE:');
for (const n of names.slice(1)) {
  const d = PROBES.filter((p, i) => results[n][i] !== results.BASE[i]).map((p) => p[0]);
  console.log('  ' + n.padEnd(24) + (d.length ? d.join(', ') : 'NO CHANGE — dead or fully masked'));
}
