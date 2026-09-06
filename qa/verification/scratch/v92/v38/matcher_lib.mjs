export function buildMatcher(text, tag) {
  const braced = (m) => { const i = text.indexOf(m); if (i < 0) throw new Error(tag + ': ' + m); let d = 0, st = false; for (let j = i; j < text.length; j++) { if (text[j] === '{') { d++; st = true; } else if (text[j] === '}') { d--; if (st && d === 0) return text.slice(i, j + 1); } } throw new Error(tag + ': unbalanced ' + m); };
  const line = (n) => { const m = text.match(new RegExp('^const ' + n + ' = (.+);$', 'm')); if (!m) throw new Error(tag + ': const ' + n); return `const ${n} = ${m[1]};`; };
  const cf = text.indexOf('const commandForContradiction = matchedOption'); const cI = text.indexOf('const contradicted = !!matchedOption');
  const start = cf >= 0 ? cf : cI; const fI = text.indexOf('const field = matchedOption && !contradicted', start);
  const site = text.slice(start, fI).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); const fieldLine = text.slice(fI, text.indexOf('\n', fI));
  const detype = (s) => s.replace(/: Record<string, Record<string, string>>/g, '').replace(/: Record<string, string>/g, '')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*[^{]*\{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/:\s*PendingActionOption\b/g, '').replace(/\(([a-zA-Z]+): string\)/g, '($1)').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '');
  const body = detype([braced('const CLARIFICATION_ENTITY_ACTION_FIELD'), line('ARCHIVE_VERB_PATTERN'), line('RESTORE_VERB_PATTERN'), braced('function resolveClarificationField('), braced('function commandContradictsActionType('), braced('function matchDisambiguationOption(')].join('\n'));
  return new Function(body + `\nreturn function decide(command, options) {\n  const matchedOption = matchDisambiguationOption(command, options);\n  if (!matchedOption) return 'DEAD-END';\n  ${detype(site)}\n  ${detype(fieldLine)}\n  return (matchedOption && !contradicted && field) ? 'SELECT:' + field + ':' + matchedOption.id : 'DEAD-END';\n};`)();
}
