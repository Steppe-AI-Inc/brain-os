// NO PAIRING CODE ON THE COMMAND LINE (S-12). setup takes the pairing code from one place only: its prompt, read from standard input.
// main() calls refuseArgv() before it parses anything else, for every command on every channel, and this module guarantees:
//   - `--code` and `--code=...` are refused by name;
//   - an argument that IS a pairing code (in any reading the prompt accepts), or that CONTAINS one in its displayed grouping (a path
//     segment, a part of a URL, a file name), is refused, whatever its position;
//   - no refusal repeats any argument, so a code typed in the wrong place is not echoed back.
// What counts as a pairing code is what supabase/control-plane/edge/supabase/functions/_shared/pairing.ts accepts (the static contract
// compares the constants and the answers): 18 Crockford base32 characters, a 5-character locator, a 12-character secret and a check
// character equal to the weighted sum mod 32 of the 17 before it; letter case, spaces and dashes do not matter, O reads as 0, and I
// and L read as 1. The displayed grouping XXXX-XXXX-XXXX-XXXX-XX is treated as a code whatever its check character. Node builtins only.

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LOCATOR_CHARS = 5;
export const SECRET_CHARS = 12;
const CODE_CHARS = LOCATOR_CHARS + SECRET_CHARS + 1;

/** the check character of a 17-character body (pairing.ts checkChar: sum of (position + 1) * value, mod 32) */
export function pairingCheckChar(body17) {
  let sum = 0;
  for (let i = 0; i < body17.length; i++) sum = (sum + (i + 1) * ALPHABET.indexOf(body17[i])) % 32;
  return ALPHABET[sum];
}

const DISPLAY_SHAPE = /^[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{2}$/;
// the displayed grouping inside a longer string, bounded by anything that is not a letter or a digit
const DISPLAY_INSIDE = /(?<![0-9A-Za-z])[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{2}(?![0-9A-Za-z])/g;

/** the form pairing.ts normalizeCode reads: upper case, no spaces or dashes, O as 0, I and L as 1 */
export const normalizeCodeForm = (s) => String(s).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

/** true when `s` as a whole is a pairing code as setup's prompt would accept it (or is shown in the displayed code shape) */
export function looksLikePairingCode(s) {
  if (typeof s !== 'string' || s.length > 64) return false;
  if (DISPLAY_SHAPE.test(s.trim())) return true;
  const n = normalizeCodeForm(s);
  if (n.length !== CODE_CHARS || /[^0-9A-HJKMNP-TV-Z]/.test(n)) return false;
  return pairingCheckChar(n.slice(0, -1)) === n.slice(-1);
}

/** every pairing code in `s`, normalized: `s` as a whole (in any reading pairing.ts accepts), and each displayed grouping
 *  XXXX-XXXX-XXXX-XXXX-XX inside it that is bounded by characters other than letters and digits. Empty when there is none.
 *  An UNGROUPED 18-character run inside a longer argument is deliberately not treated as a code: one such run in 32 has a valid check
 *  character, and the supervisor passes --home (a path under the user's profile folder) on its own, so a profile or folder name of
 *  that shape would stop the runtime from ever starting. */
export function pairingCodesIn(s) {
  const str = String(s);
  const candidates = [str];
  for (const m of str.matchAll(DISPLAY_INSIDE)) candidates.push(m[0]);
  const found = new Set();
  for (const c of candidates) if (c && looksLikePairingCode(c)) found.add(normalizeCodeForm(c));
  return [...found];
}

export const CODE_REFUSAL = '--code is not an option. S-12 keeps the pairing code off every command line: start BrainFactorySetup.exe without it and type the code when setup asks for it.';

/** null when the command line may be parsed; otherwise the refusal text - which never contains an argument */
export function refuseArgv(argv) {
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const a = String(list[i]);
    if (a === '--code' || a.startsWith('--code=')) return CODE_REFUSAL;
    if (pairingCodesIn(a).length) {
      return 'argument ' + (i + 1) + ' is, or holds, something shaped like a pairing code, so nothing was run and the argument is not repeated here. Type the code only when setup asks for it (S-12).';
    }
  }
  return null;
}
