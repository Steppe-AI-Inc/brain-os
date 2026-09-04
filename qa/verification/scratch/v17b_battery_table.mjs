import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('qa/verification/scratch/v17b_battery_result.json', 'utf8'));
let assertions = 0;
for (const x of r.results) {
  const marks = Math.max(x.okLines, x.summaryPass || 0);
  assertions += marks;
  console.log(`${x.file.padEnd(62)} exit=${String(x.exitCode).padStart(2)} OK=${String(x.okLines).padStart(4)} FAILlines=${x.failLinesInOutput} sumPass=${x.summaryPass} sumFail=${x.summaryFail} bytes=${x.outputBytes}`);
}
console.log('\nTOTAL OK/PASS marks observed: ' + assertions);
