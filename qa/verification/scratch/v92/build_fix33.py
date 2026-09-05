"""Build fix33 from the pristine PRE-run30 candidate (9b73e68), in the form verifier #31 requires.

V31-F1  nameInternal must not rest on capitalisation. At sentence start EVERY negator is Title-Case,
        so "Title-Case negator + Title-Case token" reduced to "the next word is capitalised" and
        destroyed 1144/1144 true reports like "Confirmed - No Business Unit Archived.", which
        deployed v92 shows the founder. Verifier #31's prescription is the COMPLETION_VERB subject
        rule: the capitalised run is a NAME only when an AUXILIARY governs it.
V31-F2  A completion word that OPENS a proper name is not the completion. run18/D130 established
        this for the clause arm; the CONFIRMED arm never adopted it, so "Confirmed - Archived Media
        Group remains active." was read as a completion.
V31-F3  The R-AUXGAP arm is re-measured, not assumed. Verifier #31 found it closing ZERO v92
        fabrication regressions while opening EIGHT, because its whole-summary guard consulted a
        NEGATED_CLAUSE lexicon with no couldn't/wouldn't/shouldn't/won't/unable/refused. It is
        rebuilt here with that lexicon gap closed and v92's own 30-character window instead of 40,
        and it SHIPS ONLY IF measurement shows it net-positive.
V31-F3b NEGATED_CLAUSE gains those contracted and lexical negations. Worth having regardless: every
        arm that consults it becomes harder to fool.
OBJECT  A negator can also open the OBJECT name of a claimed completion ("I archived No Limits
        Inc."). A genuine negator there would be lowercase ("I archived no companies.").
"""
import io, re, os, subprocess

REPO = 'C:/Users/Dell/dev/brain-os'
DST_DIR = REPO + '/qa/verification/scratch/v92/fix33'
DST = DST_DIR + '/index.ts'
os.makedirs(DST_DIR, exist_ok=True)
INCLUDE_AUXGAP = os.environ.get('AUXGAP', '1') == '1'

raw = subprocess.run(['git', 'show', '9b73e68:supabase/functions/sem-ai-command/index.ts'],
                     cwd=REPO, capture_output=True)
assert raw.returncode == 0, raw.stderr[:400]
s = raw.stdout.decode('utf-8')
B = chr(92)
Q = chr(39)
EOL = '\r\n'
AUX = 'was|were|is|are|has|have|had|been|being'
NAMECH = '[A-Z][' + B + "w&.\u2019'-]*"
PP = ('with|without|since|despite|after|before|besides|regarding|about|following|given|amid|'
      'notwithstanding|barring|excepting')
PART = ('archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|'
        'rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added')
PARTC = ('Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|'
         'Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added')

# ---------------- FIX 1: the skip-scan, in the V31-F1-corrected form ----------------
pat = re.compile(r'          const n = c\.search\(NEGATED_CLAUSE\);\r?\n          if \(n < 0\) return false;')
assert len(pat.findall(s)) == 1, 'fix1 anchor'
lines = [
 '          // run31/D170+D172: a negator TOKEN can sit where it negates NOTHING. Taking the first',
 '          // match blindly let fabrications deployed v92 corrects through the belt. Each position',
 '          // below is skipped and the scan CONTINUES, so a real negator later in the same clause',
 '          // ("Nothing Bundt Cakes was not archived") still disarms it.',
 '          //   nameInternal  the negator opens a proper name used as the SUBJECT. Capitalisation',
 '          //                 alone does not establish that - at sentence start every negator is',
 '          //                 capitalised, and "Confirmed - No Business Unit Archived." is a TRUE',
 '          //                 report v92 shows the founder. So an AUXILIARY must govern the run',
 '          //                 ("Nothing Bundt Cakes HAS BEEN archived"). A lowercase noun in',
 '          //                 between ("No ACME Holdings task was completed") or a bare participle',
 '          //                 with no auxiliary leaves it a determiner. A lowercase "nor" anywhere',
 '          //                 means a genuine neither/nor negation.',
 '          //   objectName    the negator opens a proper name used as the OBJECT of a completion',
 '          //                 the speaker claims ("I archived No Limits Inc."). A genuine negator',
 '          //                 there is lowercase ("I archived no companies."), which is the test.',
 '          //   titleHead     clause-initial "Pending"/"Awaiting" heading a titled subject.',
 '          //   ppInternal    the negator sits in a prepositional phrase modifying something other',
 '          //                 than the completion ("The company with no active tasks was archived").',
 '          let n = -1;',
 '          const scan = new RegExp(NEGATED_CLAUSE.source, ' + Q + 'gi' + Q + ');',
 '          for (let mm = scan.exec(c); mm !== null; mm = scan.exec(c)) {',
 '            const after = c.slice(mm.index + mm[0].length);',
 '            const capLead = /^[A-Z]/.test(mm[0]) && /^' + B + 's+[A-Z]/.test(after);',
 '            const subjectRun = /^' + B + 's+(?:' + NAMECH + B + 's+){0,5}?' + NAMECH + B + 's+(?:' + AUX + ')' + B + 'b/.test(after);',
 '            const nameInternal = capLead && subjectRun && !/' + B + 'bnor' + B + 'b/.test(c);',
 '            const objectName = capLead && new RegExp(' + Q + B + B + 'b(?:' + PART + ')' + B + B + 's+(?:the |that |this |its |our )?$' + Q + ', ' + Q + 'i' + Q + ').test(c.slice(0, mm.index));',
 '            const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) && mm.index === c.search(/' + B + 'S/);',
 '            const ppInternal = /' + B + 'b(?:' + PP + ')' + B + 's+$/i.test(c.slice(0, mm.index));',
 '            if (nameInternal || objectName || titleHead || ppInternal) continue;',
 '            n = mm.index;',
 '            break;',
 '          }',
 '          if (n < 0) return false;',
]
s = pat.sub(lambda _: EOL.join(lines), s, count=1)

# ---------------- FIX 2: widened R-IDIOM reassurance strip ----------------
old_id = ('/^' + B + 's*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|'
          'no trouble|not a problem)' + B + 's*[\u2014\u2013-]' + B + 's+/i')
assert s.count(old_id) == 1, 'idiom anchor'
new_id = ('/^' + B + 's*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|'
          'no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)'
          '(?:' + B + 's+at all)?' + B + 's*[\u2014\u2013-]' + B + 's*)+/i')
s = s.replace(old_id, new_id, 1)

# ---------------- FIX 3 (V31-F3b): negator lexicon gap ----------------
old_neg = "|cannot|can['\u2019]?t)" + B + 'b(?!-)/i;'
assert s.count(old_neg) == 1, 'negator lexicon anchor'
# NOT "declined" or "refused": both are COMPLETION participles in this product - "The approval has
# been declined." is a ledger #65 D25 production fabrication - so adding them as negators disarms the
# belt on real claims. Verifier #31's F3b test asks only for the contracted modals.
new_neg = ("|cannot|can['\u2019]?t|couldn['\u2019]?t|wouldn['\u2019]?t|shouldn['\u2019]?t|won['\u2019]?t|"
           "unable|unchanged)" + B + 'b(?!-)/i;')
s = s.replace(old_neg, new_neg, 1)

# ---------------- FIX 4 (V31-F2): a completion word OPENING a name is not the completion ----------------
old_conf = '|| (CONFIRMED_COMPLETION.test(String(s))'
assert s.count(old_conf) == 1, 'confirmed arm anchor'
# The exclusion must be narrow. "Confirmed - Archived ACME." and "Confirmed - Restored Bob Smith."
# are REAL fabrications (D100/D117/D134) where the participle IS the predicate. What marks the F2
# shape is that the capitalised run is the SUBJECT of a following verb - "Archived Media Group
# REMAINS active" - so the participle belongs to the name, not to the claim.
SUBJ_VERB = 'remains|remain|is|are|was|were|has|have|had|stays|stay|continues|continue|still|exists|looks|appears'
# NAMECH allows '.', which let the capitalised run cross a SENTENCE boundary and swallow
# "Confirmed - Removed Bob Smith. There IS no undo." - a real fabrication (run15/D117). This class
# stops at the period, so the run cannot reach a verb in the next sentence.
NAMEND = '[A-Z][' + B + "w&\u2019'-]*"
guard = ('|| (!/^' + B + 's*[Cc]onfirmed' + B + 's*[\u2014\u2013-]' + B + 's*(?:[^,]{0,60},' + B + 's*)?(?:'
         + PARTC + ')' + B + 's+(?:' + NAMEND + B + 's+){0,4}?(?:' + SUBJ_VERB + ')' + B
         + 'b/.test(String(s)) && CONFIRMED_COMPLETION.test(String(s))')
s = s.replace(old_conf, guard, 1)

# ---------------- FIX 6 (V31-F4): the evidential test must sit BEFORE the contrastive linker ----
# "No record exists HOWEVER the log shows ACME was archived." is a fabrication deployed v92 corrects,
# and 14 of these 17 were caught at 4476c92 before being re-labelled "accepted residual". The
# evidential disjunct split the span between negator and completion on however/although/therefore and
# then examined the LAST segment - which is precisely the part the negator no longer scopes over. So
# an evidential appearing AFTER the contrast disarmed the belt. It now examines the FIRST segment:
# "No audit trail shows that ACME was archived." (no linker) still reads as negated and survives,
# while the contrast shapes fall through to the linker rule and are caught.
# Two blunter forms were tried and rejected by measurement. Testing the FIRST segment finds "could
# not CONFIRM the owner" in "I could not confirm the owner yet the employee was created." and
# re-opens ledger #64 D16. Treating ANY linker as breaking scope destroys four truthful negatives
# run28 pins as must-survive ("No log however shows ACME was archived." - the negator still scopes,
# "however" is just an interposed adverb).
#
# The real discriminator is whether a NEW SUBJECT appears after the linker. "No log however SHOWS X"
# keeps the negator's subject; "No record exists however THE LOG shows X" introduces one, and only
# then does the negator stop scoping. So when a linker is present, the segment after it is reduced
# to its first word past any leading prepositional phrase, and the SAME evidential alternation is run
# on that. One copy of the evidential list, never two (D100).
PREP = 'in|of|at|on|from|within|across|among|between|for|by|under|over|per'
LINK = '/' + B + 'b(?:although|though|however|therefore|so|yet|because)' + B + 'b/i'
# The segment is unchanged; only the ANCHOR in front of the evidential alternation changes, and it
# is chosen at run time. With no linker the anchor is a plain word boundary, exactly as before. With
# a linker, the evidential must open the segment - optionally after a prepositional phrase, since
# "in our records" adds no new subject while "the log" does. Building it with new RegExp keeps ONE
# copy of the evidential alternation (D100) and lets the engine backtrack the {0,3} to fit.
ev_lit = re.search(r'/' + re.escape(B) + r'b\(\?:show\(\?:s\|ed\)\?[^/]*\)' + re.escape(B) + r'b/i', s)
assert ev_lit, 'evidential literal not found'
ev_src = ev_lit.group(0)[1:-2]           # strip the leading '/' and the trailing '/i' only
ev_body = ev_src[2:]                     # strip the leading \b
anchor_expr = ('(c.slice(n, m.index).split(' + LINK + ').length > 1 ? '
               + Q + '^' + B + B + 's*(?:(?:' + PREP + ')' + B + B + 's+(?:' + B + B + 'w+' + B + B + 's+){0,3})?' + Q
               + ' : ' + Q + B + B + 'b' + Q + ')')
s = s.replace(ev_lit.group(0) + '.test(',
              'new RegExp(' + anchor_expr + ' + ' + Q + ev_body.replace(B, B + B) + Q + ', ' + Q + 'i' + Q + ').test(', 1)

# ---------------- FIX 5 (R4 / V31-F3): R-AUXGAP, rebuilt and gated on measurement ----------------
if INCLUDE_AUXGAP:
    m = re.search(r'( *)const readsAsCompletion = \(s\) =>', s)
    assert m, 'auxgap anchor'
    ind = m.group(1)
    header = EOL.join([
      ind + '// run31/D171 (R-AUXGAP, rebuilt): an adverbial interposed between auxiliary and',
      ind + '// participle is cut apart by the clause splitter, so no clause carries a whole',
      ind + '// completion. Verifier #31 showed the first version was net-negative: its guard read a',
      ind + '// negator lexicon blind to couldn/wouldn/shouldn/won-t, so attributed TRUE history was',
      ind + '// destroyed. That lexicon gap is closed above, and the window is v92\'s own 30 rather',
      ind + '// than 40, so this reaches no shape v92 never touched. Participles come from',
      ind + '// COMPLETION_PARTICIPLE itself, never a private copy (D100).',
      ''])
    s = s[:m.start()] + header + s[m.start():]
    m2 = re.search(r'const readsAsCompletion = \(s\) =>.*?\r?\n', s)
    arm = ('          || (new RegExp(' + Q + B + B + 'b(?:was|were|has been|have been|had been)' + B + B + 'b'
           + B + B + 's*[,\u2014\u2013]' + B + B + 's*[^.]{0,30}?[,\u2014\u2013]' + B + B + 's*' + Q
           + ' + COMPLETION_PARTICIPLE.source, ' + Q + 'i' + Q + ').test(String(s)) && !NEGATED_CLAUSE.test(String(s)))' + EOL)
    s = s[:m2.end()] + arm + s[m2.end():]

# ---------------- FIX 7 (V31-F4, remainder): a hedge blanks its OWN span, it does not veto the clause
# "ACME may have been archived and Beta Corp has been deleted." carries a hedged non-claim AND a real
# unhedged completion. The hedge lexicon was a whole-clause VETO, so the second conjunct escaped -
# and it escaped because "and Beta" is not a clause boundary either, the same capital-letter
# ambiguity this campaign refused to resolve by casing. Moving the identical lexicon from the veto
# into the existing .map() blanks only the hedged span and leaves any other completion in the clause
# visible. One copy of the lexicon, not two (D100).
HEDGE_ADV = ('not|never|also|already|just|now|still|well|very|quite|really|truly|indeed|perhaps|'
             'possibly|probably|conceivably|previously|recently|actually|certainly|definitely|surely|'
             'maybe|in|fact|and|or|by|then|somehow|otherwise')
veto = ('            && !/' + B + 'b(?:may|might|could|can|would|should)' + B + 's+(?:(?:' + HEDGE_ADV
        + ')' + B + 's+){0,3}(?:have been|has been|had been)' + B + 'b/i.test(c)' + EOL)
assert s.count(veto) == 1, 'hedge veto anchor'
s = s.replace(veto, '', 1)
old_map = "            .map((c) => c.replace(/" + B + "([^()]*" + B + ")/g, ' ').trim())"
if s.count(old_map) != 1:
    old_map = ".map((c) => c.replace(/" + B + "([^()]*" + B + ")/g, ' ').trim())"
assert s.count(old_map) == 1, 'map anchor: ' + str(s.count(old_map))
hedge_re = ('/' + B + 'b(?:may|might|could|can|would|should)' + B + 's+(?:(?:' + HEDGE_ADV + ')'
            + B + 's+){0,3}(?:have been|has been|had been)' + B + 's+[a-z]+/gi')
blank_call = '.replace(' + hedge_re + ', ' + Q + ' ' + Q + ').trim())'
new_map = old_map.replace('.trim())', blank_call)
s = s.replace(old_map, new_map, 1)

io.open(DST, 'wb').write(s.encode('utf-8'))
crlf = s.count('\r\n')
print('fix33 built from 9b73e68; CRLF =', crlf, '; bare LF =', s.count('\n') - crlf,
      '; R-AUXGAP', 'INCLUDED' if INCLUDE_AUXGAP else 'OMITTED')
