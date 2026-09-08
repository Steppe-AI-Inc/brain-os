import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lab.mjs';
import { NEGATOR_NAMES } from './corpus.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = fs.readFileSync(path.join(HERE, 'index.namefix.ts'), 'utf8').replace(/\r\n/g, '\n');
const NAMES = NEGATOR_NAMES.slice(0, 8);
const HEADS = ['unit', 'depot', 'account', 'record', 'contract', 'team', 'branch', 'site'];
const FRAMES = { f1: (n, h) => `Erdenet's ${n} ${h} was archived.`, f2: (n, h) => `${n} ${h} was archived.`,
  f3: (n, h) => `${n}'s ${h} was archived.`, f4: (n, h) => `I archived ${n}'s ${h}.`,
  f5: (n, h) => `The ${n} ${h} was archived.`, f6: (n, h) => `${n} ${h} has been deleted.` };
const bs = L.makeBelt(L.SRC_LF, NAMES), bf = L.makeBelt(FIXED, NAMES);
const D = (b) => (s) => L.candLifecycleArm(s) || L.CAND_FUT.test(s) || b.readsAsCompletion(s);
const ds = D(bs), df = D(bf);
for (const [k, f] of Object.entries(FRAMES)) {
  const rows = NAMES.flatMap((n) => HEADS.map((h) => f(n, h)));
  const v = rows.filter((s) => L.v92Destroys3(s));
  console.log(k.padEnd(4), JSON.stringify(f('<NAME>', '<HEAD>')).padEnd(46),
    'v92 corrects', String(v.length).padStart(3),
    '| stock ships', String(v.filter((s) => !ds(s)).length).padStart(3),
    '| fixed ships', String(v.filter((s) => !df(s)).length).padStart(3));
}
