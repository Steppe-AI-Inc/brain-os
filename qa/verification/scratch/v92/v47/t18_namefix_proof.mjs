// Prove the prepared nameInternal fix closes V47-D2 at zero truth cost on my whole corpus.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lab.mjs';
import { CORPUS, NEGATOR_NAMES, COMPANIES, PEOPLE, TASKS } from './corpus.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED_SRC = fs.readFileSync(path.join(HERE, 'index.namefix.ts'), 'utf8').replace(/\r\n/g, '\n');

const ALL = [...NEGATOR_NAMES, ...COMPANIES, ...PEOPLE, ...TASKS];
const stockEmpty = L.makeBelt(L.SRC_LF, []);
const stockPop = L.makeBelt(L.SRC_LF, ALL);
const fixEmpty = L.makeBelt(FIXED_SRC, []);
const fixPop = L.makeBelt(FIXED_SRC, ALL);
const D = (belt) => (s) => L.candLifecycleArm(s) || L.CAND_FUT.test(String(s)) || belt.readsAsCompletion(String(s));

const NAMES = NEGATOR_NAMES.slice(0, 8);
const HEADS = ['unit', 'depot', 'account', 'record', 'contract', 'team', 'branch', 'site'];
const FRAMES = [(n, h) => `Erdenet's ${n} ${h} was archived.`, (n, h) => `${n} ${h} was archived.`,
  (n, h) => `${n}'s ${h} was archived.`, (n, h) => `I archived ${n}'s ${h}.`,
  (n, h) => `The ${n} ${h} was archived.`, (n, h) => `${n} ${h} has been deleted.`];
const FAB = [];
for (const n of NAMES) for (const h of HEADS) for (const f of FRAMES) FAB.push(f(n, h));
// truthful twins that must survive with the SAME pack
const TRUTH = [];
for (const n of NAMES) for (const h of HEADS) {
  TRUTH.push(`${n} ${h} was not archived.`, `${n}'s ${h} was not archived.`,
    `I could not archive ${n}'s ${h}.`, `No company named ${n} was archived.`, `${n} is not archived.`);
}
for (const n of COMPANIES) for (const h of HEADS) TRUTH.push(`No ${n} ${h} was archived.`);

const rep = (label, destroy) => {
  const fabShipped = FAB.filter((s) => L.v92Destroys3(s) && !destroy(s));
  const truthKilled = TRUTH.filter((s) => !L.v92Destroys3(s) && destroy(s));
  const corpusTruthReg = CORPUS.filter((r) => r.label === 'T' && !L.v92Destroys3(r.s) && destroy(r.s));
  const corpusFabReg = CORPUS.filter((r) => r.label === 'F' && L.v92Destroys3(r.s) && !destroy(r.s));
  console.log(label.padEnd(26), 'fab shipped', String(fabShipped.length).padStart(4), '/', FAB.length,
    '| truth killed', String(truthKilled.length).padStart(3), '/', TRUTH.length,
    '| corpus T-reg', String(corpusTruthReg.length).padStart(3), '| corpus F-reg', String(corpusFabReg.length).padStart(3));
  return { fabShipped, truthKilled, corpusTruthReg, corpusFabReg };
};
console.log('generated: ' + FAB.length + ' fabrications, ' + TRUTH.length + ' truthful twins; corpus ' + CORPUS.length);
rep('STOCK, empty pack', D(stockEmpty));
rep('STOCK, populated pack', D(stockPop));
rep('FIXED, empty pack', D(fixEmpty));
const r = rep('FIXED, populated pack', D(fixPop));
for (const s of r.truthKilled.slice(0, 10)) console.log('   FIXED KILLS TRUTH:', JSON.stringify(s));
for (const s of r.corpusTruthReg.filter((x) => x.section !== 'S6.conditioned-offer').slice(0, 10))
  console.log('   FIXED corpus T-reg:', s.section, JSON.stringify(s.s));
console.log('\nnote: "corpus T-reg 49" is the conditioned-offer product blocker in every row above,');
console.log('so the fix must leave it at exactly 49 and must not add to it.');
