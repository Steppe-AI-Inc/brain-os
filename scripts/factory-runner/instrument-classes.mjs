#!/usr/bin/env node
// EACH INSTRUMENT CLASS DECLARES ITS OWN EVIDENCE CONTRACT.
//
// THE DEFECT THIS CLOSES. Level 5 of validate-instrument ("did it assert a plausible number of rows") carried
// ONE textual pattern, `N pass`, and applied it to every instrument. A release manifest reports
// `assertion rows executed 4175`, so level 5 parsed ZERO rows from a run that had just executed four thousand
// of them and declared a healthy instrument invalid. That is QA_CHECK_SUBJECT_WIDER_THAN_INVARIANT inside the
// file whose job is to name the family — and the validator must validate the subject the instrument actually
// claims to measure, not a subject the validator happens to know how to read.
//
// So a class is DECLARED by the caller, or DERIVED from what the instrument's own output claims. Each class
// states what it must report and what would make that report vacuous:
//
//     suite      N pass / M fail
//     manifest   assertion rows executed N
//     mutation   killed / surviving / ineffective
//     validator  fixture count / negative-control result
//     rows       a bare row count — the weakest contract, for an instrument that declared nothing
//
// `measure` returns { value, ok, detail }: the number the instrument reported, whether that report satisfies
// the class contract, and a sentence a reader can act on. `value` is null when the instrument said nothing the
// class recognises — which is itself the finding, and not a zero.
//
// Every pattern below is a REGEX LITERAL. An earlier revision built them with `new RegExp("(\d+)...")` through
// a shell transport that halves backslashes: the strings arrived as `(d+)`, three `\b` sequences became
// literal BACKSPACE bytes in the source, and the file still parsed. Escapes stay in literals, where one
// transport cannot quietly change what they mean.
const num = (re, out) => { const m = re.exec(out); return m ? Number(m[1]) : null; };

export const INSTRUMENT_CLASSES = {
  // A scenario suite: N assertion rows, some passing, some failing. A suite with no rows measured nothing.
  suite: {
    claim: 'it reported assertion rows passing',
    // The SUMMARY shape, `N pass, M fail`, not a bare "N pass" anywhere in the text. An instrument's own
    // prose quotes counts — this very file's row names do — and a detector that reads prose classifies an
    // instrument by what it talks about instead of by what it reports.
    detect: (out) => /\b\d+\s+pass(?:ed)?\s*,\s*\d+\s+fail(?:ed)?\b/i.test(out),
    measure: (out) => {
      const summary = /(\d+)\s+pass(?:ed)?\s*,\s*(\d+)\s+fail(?:ed)?\b/i.exec(out);
      const passed = summary ? Number(summary[1]) : num(/(\d+)\s+pass(?:ed)?\b/i, out);
      const failed = summary ? Number(summary[2]) : num(/(\d+)\s+fail(?:ed)?\b/i, out);
      if (passed === null) return { value: null, ok: false, detail: 'no "N pass" count in its output' };
      return {
        value: passed + (failed || 0), ok: true,
        detail: passed + ' pass' + (failed === null ? '' : ', ' + failed + ' fail') + ' = '
          + (passed + (failed || 0)) + ' rows',
      };
    },
  },

  // A release manifest: it runs suites and reports the total assertion rows executed across them.
  manifest: {
    claim: 'it reported assertion rows executed across the suites it ran',
    // Anchored to the start of a line and followed by a count, for the same reason the suite detector is
    // anchored to a summary: a sentence ABOUT assertion rows is not a report of them.
    detect: (out) => /^\s*assertion rows executed\s+\d+/mi.test(out),
    measure: (out) => {
      const rows = num(/^\s*assertion rows executed\s+(\d+)/mi, out);
      if (rows === null) return { value: null, ok: false, detail: 'no "assertion rows executed N" line' };
      return { value: rows, ok: true, detail: rows + ' assertion rows executed' };
    },
  },

  // A mutation proof: the subject is KILLED / SURVIVING / INEFFECTIVE, and "N pass" says nothing about it.
  // An INEFFECTIVE mutant proves nothing — it is a mutant whose change never reached the output, so it could
  // not have failed. Counting it as killed is how a mutation proof flatters itself, which is why a proof that
  // does not state the ineffective count fails this contract even when every other number is healthy.
  mutation: {
    claim: 'it reported mutants with explicit surviving and ineffective counts',
    detect: (out) => /^\s*(?:effective )?mutants surviving[^:]*:\s*\d+/mi.test(out)
      || /^\s*ineffective mutants[^:]*:\s*\d+/mi.test(out),
    measure: (out) => {
      const surviving = num(/^\s*(?:effective )?mutants surviving[^:]*:\s*(\d+)/mi, out);
      const ineffective = num(/^\s*ineffective mutants[^:]*:\s*(\d+)/mi, out);
      const total = (out.match(/^=== /gm) || []).length;
      if (surviving === null || ineffective === null) {
        return {
          value: null, ok: false,
          detail: 'a mutation proof must state BOTH surviving and ineffective; an unreported ineffective'
            + ' count hides mutants that could never have failed',
        };
      }
      if (total === 0) return { value: null, ok: false, detail: 'it named no mutants' };
      return {
        value: total, ok: true,
        detail: total + ' mutants, ' + (total - surviving - ineffective) + ' killed, ' + surviving
          + ' surviving, ' + ineffective + ' ineffective',
      };
    },
  },

  // A validator: it reports how many fixtures it checked and whether it has a negative control at all.
  validator: {
    claim: 'it reported fixtures checked and a negative-control result',
    detect: (out) => /negative control/i.test(out),
    measure: (out) => {
      const fixtures = num(/(\d+)\s+(?:fixtures?|pass(?:ed)?)\b/i, out);
      const neg = /negative control/i.test(out);
      if (fixtures === null) return { value: null, ok: false, detail: 'no fixture count in its output' };
      return {
        value: fixtures, ok: neg,
        detail: fixtures + ' fixtures'
          + (neg ? ', negative control reported'
            : ', and NO negative control — a validator that cannot fail is a formality'),
      };
    },
  },

  // The fallback, deliberately weak: a bare row count. An instrument landing here has not told the validator
  // what it measures, and the report says so rather than implying a stronger check than was made.
  rows: {
    claim: 'it reported a row count (class undeclared, so this is the weakest contract)',
    detect: () => true,
    measure: (out, rowPattern) => {
      const v = num(rowPattern || /(\d+)\s+rows?\b/i, out);
      if (v === null) return { value: null, ok: false, detail: 'no row count of any recognised shape' };
      return { value: v, ok: true, detail: v + ' rows, matched by a generic pattern' };
    },
  },
};

/**
 * Derive the class from what the instrument's own output claims, most specific first.
 *
 * Order matters and is not alphabetical: a mutation proof also prints "N pass" lines from the battery it
 * runs, and a manifest prints both. The most specific claim wins, so an instrument is never measured by a
 * contract weaker than the one it actually satisfies.
 */
export function deriveInstrumentClass(out, rowPattern = null) {
  if (rowPattern) return 'rows';
  for (const name of ['mutation', 'manifest', 'validator', 'suite']) {
    if (INSTRUMENT_CLASSES[name].detect(out)) return name;
  }
  return 'rows';
}
