"""Rebuild the fix31 scratch copy from the pristine candidate and apply the four v92-regression
fixes. Comments never go INSIDE readsAsCompletion (a ';' in a comment truncates the suites'
grab-to-first-semicolon extractor), so every explanation sits above the declaration."""
import io, re, sys, shutil

SRC = 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts'
DST = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/fix31/index.ts'
shutil.copyfile(SRC, DST)
s = io.open(DST, 'rb').read().decode('utf-8')
B = chr(92)

# ---- FIX 1: name-safe negator (clause-initial negator inside a proper name / titled subject) ----
pat = re.compile(r'          const n = c\.search\(NEGATED_CLAUSE\);\r?\n          if \(n < 0\) return false;')
assert len(pat.findall(s)) == 1, 'fix1 anchor'
f1 = ('          // run30/D170 (name-safe negator): a negator TOKEN that is part of a proper name\r\n'
      '          // ("Nothing Bundt Cakes was archived", "No Limits Inc has been archived",\r\n'
      '          // "Never Summer Industries was archived") or that heads a titled subject\r\n'
      '          // ("Pending review of the contract was completed") negates nothing. The belt read\r\n'
      '          // those as truthful negatives and SHIPPED them, while deployed v92 corrects every\r\n'
      '          // one. Skip such an occurrence and keep scanning, so a REAL negator later in the\r\n'
      '          // same clause ("Nothing Bundt Cakes was not archived") still disarms it. A\r\n'
      '          // lowercase "nor" anywhere means the clause is a genuine neither/nor negation.\r\n'
      '          let n = -1;\r\n'
      '          const scan = new RegExp(NEGATED_CLAUSE.source, ' + "'gi'" + ');\r\n'
      '          for (let mm = scan.exec(c); mm !== null; mm = scan.exec(c)) {\r\n'
      '            const nameInternal = /^[A-Z]/.test(mm[0]) && /^' + B + 's+[A-Z]/.test(c.slice(mm.index + mm[0].length)) && !/' + B + 'bnor' + B + 'b/.test(c);\r\n'
      '            const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) && mm.index === c.search(/' + B + 'S/);\r\n'
      '            if (nameInternal || titleHead) continue;\r\n'
      '            n = mm.index;\r\n'
      '            break;\r\n'
      '          }\r\n'
      '          if (n < 0) return false;')
s = pat.sub(lambda _: f1, s, count=1)

# ---- FIX 2: dash boundaries must also split before a PROPER NAME ----
old_sp = '|' + B + 's[\u2014\u2013-]' + B + 's+(?=(?!(?:was|were|is|are|has|have|had|been|being|not)' + B + 'b)[a-z])'
assert s.count(old_sp) == 1, 'fix2 spaced anchor'
s = s.replace(old_sp, old_sp + '|' + B + 's[\u2014\u2013-]' + B + 's+(?=[A-Z])', 1)
old_ti = '|[\u2014\u2013](?=(?!(?:was|were|is|are|has|have|had|been|being|not)' + B + 'b)[a-z])'
assert s.count(old_ti) == 1, 'fix2 tight anchor'
s = s.replace(old_ti, old_ti + '|(?<=[a-z])[\u2014\u2013](?=[A-Z])', 1)

# ---- FIX 3: two more reassurance prefixes in the R-IDIOM lexicon ----
old_id = '(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem)'
assert s.count(old_id) == 1, 'fix3 anchor'
new_id = ('(?:no problem|no worries at all|no worries|not to worry|no issue|no issues|'
          'nothing to worry about|no trouble|not a problem|sure thing|of course|absolutely)')
s = s.replace(old_id, new_id, 1)

# ---- FIX 4: R-AUXGAP whole-summary arm (comments ABOVE the declaration, never inside) ----
m = re.search(r'( *)const readsAsCompletion = \(s\) =>', s)
assert m, 'fix4 anchor'
ind = m.group(1)
VERBS = ('approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|'
         'reassigned|completed|archived|restored|moved|ended|added|granted|confirmed')
header = (ind + '// run30/D171 (R-AUXGAP): an adverbial interposed between the auxiliary and the\r\n'
          + ind + '// participle is cut apart by the clause splitter, so no single clause carries a\r\n'
          + ind + '// whole completion and the belt shipped the claim. Deployed v92 catches both of\r\n'
          + ind + '// the production shapes. Tested on the WHOLE summary like the rename arm, and only\r\n'
          + ind + '// when the summary carries no negator at all, so no truthful negative moves.\r\n')
s = s[:m.start()] + header + s[m.start():]
m2 = re.search(r'const readsAsCompletion = \(s\) =>.*?\r?\n', s)
arm = ('          || (/' + B + 'b(?:was|were|has been|have been|had been)' + B + 'b' + B + 's*[,\u2014\u2013]'
       + B + 's*[^.]{0,40}?[,\u2014\u2013]' + B + 's*(?:' + VERBS + ')' + B + 'b/i.test(String(s))'
       ' && !NEGATED_CLAUSE.test(String(s)))\r\n')
s = s[:m2.end()] + arm + s[m2.end():]

io.open(DST, 'wb').write(s.encode('utf-8'))
crlf = s.count('\r\n')
print('fix31 rebuilt: 4 fixes applied; CRLF lines =', crlf, '; bare LF =', s.count('\n') - crlf)
