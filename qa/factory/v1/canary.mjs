// A CANARY PAIRING CODE for the S-12 rows (no pairing code on a command line, none printed): a code of the exact form the plane issues
// (pairing.ts; mirrored by scripts/factory-runner/sea/argv-guard.mjs) that no plane ever issued - 85 random bits. Built so that every
// 5-character window of it holds letters outside A-F (it can never match a hex digest in the output by chance) and so that it has a
// 0 and a 1 (the O / I / L spellings differ from it). A test that finds any form of it - as given, lower case, without dashes, the
// 17-character body, or any 5-character window (the locator is one) - in a process's output has found a leak.
// THE HARNESS RULE: a suite passes pairing codes to a child on standard input. assertNoCodeInArgv() refuses to start a child whose
// arguments hold a code; a row declared { canary: true } may pass only codes that canaryCode() made in this same process.
import { randomInt } from 'node:crypto';
import { ALPHABET, pairingCheckChar, pairingCodesIn } from '../../../scripts/factory-runner/sea/argv-guard.mjs';

const LETTERS = 'GHJKMNPQRSTVWXYZ';
const ISSUED = new Set(); // the canaries of this process, normalized: the only codes a canary row may place in arguments
export function canaryCode() {
  let body = '';
  for (let i = 0; i < 17; i++) body += i === 0 ? '0' : i === 2 ? '1' : i % 2 === 0 ? ALPHABET[randomInt(10)] : LETTERS[randomInt(LETTERS.length)];
  const code = body + pairingCheckChar(body);
  ISSUED.add(code);
  const display = code.match(/.{1,4}/g).join('-');
  return {
    display, code, body,
    lower: display.toLowerCase(),
    nodash: code,
    spelled: display.replace(/0/g, 'O').replace(/1/g, 'l'), // normalizeCode reads O as 0 and l as 1: the same code
    // the same code with no dashes, so only the O / I reading makes it a code (the displayed grouping cannot)
    spelledNodash: code.replace(/0/g, 'O').replace(/1/g, 'I'),
    // one argument holding the code in space-separated groups, lower-case letters, o for 0 and L for 1
    spacedSpelled: code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'L').match(/.{1,6}/g).join(' '),
  };
}

/** every form of the canary a leak could take */
export function leakForms(c) {
  const windows = [];
  for (let i = 0; i + 5 <= c.code.length; i++) windows.push(c.code.slice(i, i + 5));
  return [c.display, c.code, c.body, ...windows];
}
/** the forms of `c` found in `text` (compared upper case, and again with spaces and dashes removed). A spelled form echoed back is
 *  still found: a canary has several 5-character windows without a 0 or a 1, and those read the same in every spelling. */
export function leaksIn(text, c) {
  const up = String(text || '').toUpperCase();
  const squeezed = up.replace(/[\s-]/g, '');
  return leakForms(c).filter((f) => up.includes(f.toUpperCase()) || squeezed.includes(f.toUpperCase()));
}
/** the same for an issued code (any display string): as given, and normalized */
export function codeIn(text, issued) {
  const up = String(text || '').toUpperCase();
  const n = String(issued).toUpperCase().replace(/[\s-]/g, '');
  return up.includes(String(issued).toUpperCase()) || up.replace(/[\s-]/g, '').includes(n);
}

/** throws unless every argument is free of pairing codes; a declared canary row may carry this process's canaries, and only those */
export function assertNoCodeInArgv(args, { canary = false } = {}) {
  for (const a of args || []) {
    const s = String(a);
    const codes = pairingCodesIn(s);
    if (!canary) {
      if (codes.length || /^--code(=|$)/.test(s)) throw new Error('harness: a command line would carry a pairing code (S-12); pass it on standard input');
    } else if (codes.some((c) => !ISSUED.has(c))) {
      throw new Error('harness: a canary row may place only a canary made by canaryCode() in this process on a command line, never another code');
    }
  }
}
