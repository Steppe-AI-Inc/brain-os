#!/usr/bin/env node
// RETIRED (run38), and the retirement itself was botched (run41).
//
// WHAT THIS FILE CLAIMED: that the run30 dash-form R-IDIOM strip was dead code, because re-adding it
// changed 0 of 17 idiom answers. Verifier #37 showed the family was VACUOUS - every one of the 17 rows
// had an aux+participle tail, which the later rules catch either way, while the strip ALSO fed the
// first-person and progressive arms, where "No problem - I archived ACME." shipped once it was removed
// (115 of a 2,288-row family). The strip is re-added; the claim was wrong.
//
// HOW THE RETIREMENT WAS BOTCHED: run38 prepended this notice and left the original source below it as
// "unreachable", including its own shebang line. A shebang is only legal on line 1, so the file has not
// parsed since - verifier #40 reported it. The original text is recoverable from git history; keeping a
// broken file in the tree to preserve a record is worse than the record being one `git log` away.
console.log('RETIRED: the v39 deadness proof was vacuous (aux+participle tails only). The R-IDIOM strip');
console.log('is re-added in fix43. See ledger #99 for the measurement and #101 for the botched retirement.');
process.exit(0);
