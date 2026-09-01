// Shared TypeScript-stripping + gate-extraction helper for the truthfulness-gate
// behavioral harnesses (mixed_claim_grounding, past_completion_gate_behavior,
// claim_segmentation_and_present_tense_fp).
//
// WHY THIS EXISTS. Each of those harnesses executes the REAL gate block out of
// supabase/functions/sem-ai-command/index.ts rather than a reimplementation — that is the
// only way a harness can catch a false positive, and reimplementations are what produced
// the vacuous-regression class logged four separate times (#61/D2, #63/D10, #63/D12,
// #64/D19). But each harness grew its OWN hand-written stripper that named specific
// symbols ("classifyClaim", "ClaimType", "claimAudit: Array<...>"), so every product
// change broke all three in a different way and each got patched separately.
//
// A harness that cannot parse the source it is meant to execute must THROW, never quietly
// pass — but it also must not be the thing that blocks a correct product change. So the
// stripping here is GENERIC (any type alias, any annotated const/let, any function
// signature) rather than a list of known symbol names.

// Remove `x as <Type>` assertions. The type expression is consumed with balanced
// {} <> [] () tracking and terminates at the first `;` `,` `)` `?` or `:` at depth zero.
export function stripTypeAssertions(text) {
  let out = '', i = 0;
  while (i < text.length) {
    // Skip over string and template literals verbatim. Added 2026-09-01 (#67): prose
    // inside a real product string contains " as " all the time - the live example that
    // exposed it is the archive-postcondition warning line ending "... treat as not
    // archived." inside a template literal, where the assertion-stripper ate the rest of
    // the template AND the call's closing paren, producing a SyntaxError far from the
    // cause. Exactly the same failure class the full-line-comment strip below already
    // fixed once; string literals are the other half. A backtick template is skipped to
    // its next unescaped backtick, which correctly carries nested ${...} expressions
    // containing ordinary quotes along with it.
    const q = text[i];
    if (q === '"' || q === "'" || q === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === q) { j++; break; }
        j++;
      }
      out += text.slice(i, j); i = j; continue;
    }
    if (text.startsWith(' as ', i)) {
      let j = i + 4;
      const d = { '{': 0, '<': 0, '[': 0, '(': 0 };
      const zero = () => !d['{'] && !d['<'] && !d['['] && !d['('];
      while (j < text.length) {
        const c = text[j];
        if (c === '{' || c === '<' || c === '[' || c === '(') { d[c]++; j++; continue; }
        if (c === '}') { d['{']--; j++; continue; }
        if (c === '>') { d['<']--; j++; continue; }
        if (c === ']') { d['[']--; j++; continue; }
        if (c === ')') { if (zero()) break; d['(']--; j++; continue; }
        if (zero() && (c === ';' || c === ',' || c === '?' || c === ':')) break;
        j++;
      }
      i = j; continue;
    }
    out += text[i]; i++;
  }
  return out;
}

// Generic TypeScript -> executable JavaScript for the gate slice.
export function stripTS(source) {
  // Normalize line endings FIRST. The working tree is CRLF; any line-anchored pattern
  // below would silently fail to match against \r\n and hand un-stripped TS to Function().
  let s = source.replace(/\r\n/g, '\n');
  // Drop whole-line `//` comments BEFORE any other processing.
  //
  // This is not cosmetic — it fixes a real latent bug that silently corrupted every
  // harness using this stripper. stripTypeAssertions() treats " as " as the start of a
  // type assertion and consumes until a depth-zero terminator. Prose comments contain
  // " as " all the time (the product comment "WITHOUT using pronouns as evidence" is what
  // exposed it), so the stripper ate 6,700 characters of real code — including the
  // `claimsPastCompletionWithNoGrounding` declaration — and the harness then failed with a
  // confusing ReferenceError far from the cause. Comments are irrelevant to execution, so
  // removing them first eliminates the whole class. Only FULL-LINE comments are removed;
  // trailing comments are left alone because stripping them safely would require knowing
  // whether `//` sits inside a string or regex literal.
  s = s.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  // `type X = ...;` (single or multi-line union)
  s = s.replace(/^[ \t]*type\s+\w+\s*=[\s\S]*?;[ \t]*$/gm, '');
  // Annotated declarations: `const x: Foo<Bar> = ` -> `const x = `. Type expressions never
  // contain `=`, so stopping at the first `=` is safe.
  s = s.replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  // Function signatures: strip parameter annotations and the return type.
  s = s.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, name, params) =>
    'function ' + name + '(' + params.replace(/:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (_m, name, params) =>
    'function ' + name + '(' + params.replace(/:\s*[^,)]+/g, '') + ') {');
  // Arrow functions: `= (a: T, b: U): R => {` -> `= (a, b) => {`. Added 2026-09-01 — the
  // stripper handled `function` declarations and annotated consts but not arrows, so the
  // canonical displayName/lastKnownLabel helpers broke every harness with an opaque
  // "Unexpected token ':'". The return type is matched with [^=]+ because it cannot
  // contain '=' and therefore stops cleanly at the '=>'.
  s = s.replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, params) =>
    '= (' + params.replace(/:\s*[^,)]+/g, '') + ') =>');
  s = s.replace(/=\s*\(([^)]*)\)\s*=>/g, (_m, params) =>
    '= (' + params.replace(/:\s*[^,)]+/g, '') + ') =>');
  // Non-null assertions (`pa!.options`).
  s = s.replace(/(\w)!\./g, '$1.');
  s = stripTypeAssertions(s);
  return s;
}

// Assert the strip actually worked. Silence is not success: if TS syntax survives, the
// harness must fail loudly rather than pass on a block it never really executed.
export function assertExecutable(slice) {
  const leftovers = [
    [/\btype\s+\w+\s*=/, 'type alias'],
    [/\b(const|let|var)\s+\w+\s*:\s*[A-Za-z_]/, 'annotated declaration'],
    [/\)\s*:\s*[A-Za-z_][\w.<>[\]|\s]*\{/, 'function return type'],
  ];
  for (const [re, what] of leftovers) {
    if (re.test(slice)) throw new Error('TypeScript ' + what + ' survived stripping — update qa/scenarios-runner/_gate_extract.mjs rather than letting this pass');
  }
  return slice;
}

// Extract from `const FUTURE_PROMISE_PATTERN` through the closing brace of the
// `if (claimsPastCompletionWithNoGrounding) { ... }` block — i.e. both sibling gates and
// the whole correction path, exactly as shipped.
export function extractGateSlice(source) {
  const start = source.indexOf('const FUTURE_PROMISE_PATTERN');
  if (start === -1) throw new Error('FUTURE_PROMISE_PATTERN not found — update this harness');
  const ifIdx = source.indexOf('if (claimsPastCompletionWithNoGrounding)', start);
  if (ifIdx === -1) throw new Error('correction block not found — update this harness');
  let depth = 0, end = -1;
  for (let k = source.indexOf('{', ifIdx); k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces in the correction block');
  return assertExecutable(stripTS(source.slice(start, end)));
}
