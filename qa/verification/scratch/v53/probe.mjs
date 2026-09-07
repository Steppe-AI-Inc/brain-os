// VERIFIER #53 — per-row probe: arm on candidate / prev 416c14c / selected mutants / v92, with and without the pack.
import * as H from './harness.mjs';
const MUT = (n) => 'qa/verification/scratch/v53/mut/' + n + '.ts';
const ROWS = [
  ['No Fear of Flying Ltd safety drill for the Ulaanbaatar hangar crew was archived.', ['No Fear of Flying Ltd safety drill for the Ulaanbaatar hangar crew']],
  ['Not for Profit Alliance annual general meeting minutes and follow-up actions was archived.', ['Not for Profit Alliance annual general meeting minutes and follow-up actions']],
  ['Pending review of the vendor invoices from the Erdenet copper works contract was archived.', ['Pending review of the vendor invoices from the Erdenet copper works contract']],
  ['Done — Pending review of the vendor invoices from the Erdenet copper works contract was archived.', ['Pending review of the vendor invoices from the Erdenet copper works contract']],
  ['Not Invented Here (retrospective) was archived.', ['Not Invented Here (retrospective)']],
  ['Not Invented Here (retrospective)’s subtasks were archived.', ['Not Invented Here (retrospective)']],
  ['Both Not Invented Here (retrospective) branches were archived.', ['Not Invented Here (retrospective)']],
  ['None of the above is being archived.', ['None of the above']],
  ['None of the above were archived.', ['None of the above']],
  ['No changes required — Khan Bank was already archived last month.', ['No changes required', 'Khan Bank']],
  ['I will restore Khan Bank if you approve so I just archived Trade and Development Bank.', ['Khan Bank', 'Trade and Development Bank']],
  ['I will restore Khan Bank if you approve. I just archived Trade and Development Bank.', ['Khan Bank', 'Trade and Development Bank']],
  ['I will restore Khan Bank if you approve so I just archived Capitron Bank.', ['Khan Bank', 'Capitron Bank']],
  ['Let me archive Khan Bank once you confirm — I already archived State Bank of Mongolia.', ['Khan Bank', 'State Bank of Mongolia']],
  ['I just archived Trade and Development Bank.', ['Trade and Development Bank']],
  ['Confirmed — I archived Trade and Development Bank.', ['Trade and Development Bank']],
  ['Confirmed — Archived Trade and Development Bank.', ['Trade and Development Bank']],
  ['I will restore Khan Bank if you approve so I just archived the company.', ['Khan Bank']],
  ['I will restore Khan Bank if you approve so I just archived Enkhjin Bat-Erdene.', ['Khan Bank', 'Enkhjin Bat-Erdene']],
  ['I will restore Khan Bank if you approve so I just archived Munkh-Erdene van der Berg.', ['Khan Bank', 'Munkh-Erdene van der Berg']],
];
const SRCS = [['cand', H.SRC], ['prev416c14c', MUT('prev_416c14c')], ['cap3', MUT('prefix_cap_3')], ['cap16', MUT('prefix_cap_16')], ['noPrefix', MUT('revert_V52D1_prefix_zero')]];
for (const [text, names] of ROWS) {
  const cells = SRCS.map(([tag, src]) => `${tag}=${String(H.candArm(text, { names, src })).padEnd(14)}`).join(' ');
  console.log(`v92=${String(H.v92Arm(text)).padEnd(15)} ${cells} empty=${String(H.candArm(text, { names: [] })).padEnd(14)} :: ${text}`);
}
