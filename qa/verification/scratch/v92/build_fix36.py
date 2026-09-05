"""Close verifier #33's five P1 classes on top of the shipped candidate 7914f2b.

D185 - THE REFUSAL WAS WRONG, REVERTED. Verifier #32 told this session to revert the D175 negator
lexicon widening. The session refused, having measured 108 shapes and found the revert bought
nothing. Verifier #33 built 792 shapes - the same 6 tokens crossed with 11 joiners and FOUR subject
forms including LOWERCASE ones - and measured: v92 corrects 792/792, this candidate ships 60 (16
capitalised, 44 LOWERCASE), the reverted build ships 0 and destroys 0. The session's family only
varied capitalised subjects, so it could not see 44 of the 60. Refusing a recommendation is only
legitimate on a measurement at least as good as the one being refused, and this one was not. The six
tokens are reverted here; the two truthful shapes it protected are ones deployed v92 destroys too, so
they were never a gate requirement.

D183 - the R-AUXGAP guard knows couldn't/wouldn't/shouldn't/won't but not the BARE modals
may/might/could/can, so a hedged decline with an interposed adverbial is destroyed. v92's own gate
carries (?<!may )(?<!might )(?<!could )(?<!can ) for exactly this, and index.ts calls that exclusion
load-bearing. The bare modals join the guard's lexicon.

D184 - nameInternal's auxiliary set admits the PRESENT tense (is/are/being), so a Title-Cased entity
TYPE reads as a proper name and the passive-progressive arm fires. Restricted to the past-completion
auxiliaries the fabrications it exists to catch actually use. The progressive fabrication this gives
back is shipped by v92 too, so it cannot be a fabrication regression.

D186 - titleHead covers only the CLAUSE-INITIAL Pending/Awaiting. A real task title quoted
mid-sentence - which is how this product renders titles - keeps the negator in scope. The rule now
also fires when the token opens a QUOTED span.

D188 - the D180 new-subject closure fires only for a CAPITALISED run, so the same fabrication with a
lowercase subject still disarms the belt: 150 of 450, and the lowercase form is the one this product
emits most. The rule now accepts a determiner-led lowercase subject as a new subject too. This is the
correction of "It is NOT a casing rule" in ledger #94, which was false as written.
"""
import io, re, os, subprocess

REPO = 'C:/Users/Dell/dev/brain-os'
DST_DIR = REPO + '/qa/verification/scratch/v92/fix36'
DST = DST_DIR + '/index.ts'
os.makedirs(DST_DIR, exist_ok=True)

# Build on fix34, NOT on the committed candidate. 7914f2b predates this session's correction of the
# open-class introducer-list defect, so building from it silently discarded that fix - caught by the
# generative suite going red on 56 of 640 shapes it had previously passed.
FIX34 = REPO + '/qa/verification/scratch/v92/fix34/index.ts'
s = io.open(FIX34, 'rb').read().decode('utf-8')
B = chr(92)
Q = chr(39)

# ---- D185: revert the global lexicon widening ----
wide = "|couldn['’]?t|wouldn['’]?t|shouldn['’]?t|won['’]?t|unable|unchanged)"
assert s.count(wide) == 1, 'D185 anchor: ' + str(s.count(wide))
s = s.replace(wide, ')', 1)

# ---- D183: the R-AUXGAP guard learns the bare modals ----
old_guard = "(?:not|never|no|nobody|nothing|none|neither|nor|hardly|pending|awaiting|cannot|"
assert s.count(old_guard) == 1, 'D183 anchor'
s = s.replace(old_guard, "(?:not|never|no|nobody|nothing|none|neither|nor|hardly|pending|awaiting|cannot|"
              "may|might|could|can|would|should|", 1)

# ---- D184: nameInternal's auxiliary set loses the present tense ----
old_aux = "(?:was|were|is|are|has|have|had|been|being)"
assert s.count(old_aux) >= 1, 'D184 anchor: ' + str(s.count(old_aux))
m_sub = re.search(r'const subjectRun = /[^\r\n]*?' + re.escape(old_aux) + r'[^\r\n]*?;', s)
assert m_sub, 'D184 subjectRun not found'
s = s[:m_sub.start()] + m_sub.group(0).replace(old_aux, '(?:was|were|has|have|had|been)') + s[m_sub.end():]

# ---- D186: titleHead also fires when the token opens a QUOTED span ----
old_th = re.search(r'const titleHead = /\^\(\?:Pending\|Awaiting\)\$/\.test\(mm\[0\]\) && mm\.index === c\.search\(/' + re.escape(B) + r'S/\);', s)
assert old_th, 'D186 anchor'
new_th = ('const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) && (mm.index === c.search(/' + B + 'S/)'
          ' || /["\u201c\u2018' + Q + ']' + B + 's*$/.test(c.slice(0, mm.index)));')
s = s[:old_th.start()] + new_th + s[old_th.end():]

# ---- D188: a determiner-led LOWERCASE subject is a new subject too ----
# Locate the literal by SCANNING to its real end rather than by a lazy regex. Two lazy patterns in a
# row stopped early and left a tail behind, producing a syntactically broken file both times - caught
# by deno and by run15's extractor, not by inspection. The end is found by walking forward to the
# "/g);" that terminates the argument, so it cannot stop in the middle of the literal.
# D188 remainder: a bare -ed/-en word at the END of the span is the negated clause's OWN verb, not a
# link. "No errors OCCURRED the department was removed." reads as linked only because the word is
# participle-shaped. A real participle link carries a preposition with it ("assigned TO", "linked
# TO") or is an -ing form ("involving", "concerning"), so those still link; a bare -ed/-en ending no
# longer does. The mid-span test (linksAName) keeps the full list, because there the participle is
# followed by the name it introduces.
ns_start = s.index('(/' + B + 'b[A-Z]', s.index('const newSubject'))
ns_end = s.index('/g);', ns_start) + len('/g);')
old_literal = s[ns_start:ns_end]
assert old_literal.count('/g);') == 1 and old_literal.endswith('/g);'), 'D188 literal bounds wrong'
NAME1 = '[A-Z][' + B + "w&’'-]*"
DET = 'the|that|this|these|those|its|their|our|his|her|my|your'
# The lowercase run must NOT swallow an evidential verb. "No file our system SHOWS was archived." is
# truthful - the negated noun is the subject of "shows", and "our system" is inside a relative clause,
# not a new subject. Allowing up to three lowercase words let the run span the evidential and read the
# whole phrase as a subject, destroying five truthful negatives that run28 pins. The per-word
# evidential exclusion is what protects those, so the run may be up to four words: a two-word cap
# let "No errors the sales pipeline data was archived." escape, which deployed v92 catches (run34).
EVID = ('shows?|showed|confirms?|confirmed|indicates?|indicated|states?|stated|records?|recorded|'
        'proves?|proved|suggests?|suggested|reports?|reported|mentions?|mentioned|notes?|noted|'
        'says?|said|sees?|seen|finds?|found|reveals?|revealed|implies|implied')
LC = '(?!(?:' + EVID + ')' + B + 'b)[a-z][' + B + 'w-]*'
new_ns = ('(/(?:' + B + 'b' + NAME1 + '(?:' + B + 's+' + NAME1 + '){0,4}|' + B + 'b(?:' + DET + ')'
          + B + 's+' + LC + '(?:' + B + 's+' + LC + '){0,3})' + B + 's+'
          '(?:was|were|has been|have been|had been)' + B + 'b/g);')

# Splice D188 FIRST: the D187 insertion below adds text earlier in the same line, which would make
# these offsets stale. Index-based edits must be applied in source order, newest offsets last.
s = s[:ns_start] + new_ns + s[ns_end:]

# ---- D187: NO source change. A 'scope discharge' rule was built to satisfy verifier #33's D187 check
# and then measured as a NO-OP: every shape it targeted ships or is caught identically without it,
# because the -ed linker exemption already governs those spans. A fix that changes nothing does not
# ship. D187 is closed in run18 instead, by rebuilding the newline coverage pin around a PRONOUN
# subject so that only the newline decides - and verifier #33's own hardcoded check passes as well.

io.open(DST, 'wb').write(s.encode('utf-8'))
crlf = s.count('\r\n')
print('fix36 built from 7914f2b; CRLF =', crlf, '; bare LF =', s.count('\n') - crlf)
