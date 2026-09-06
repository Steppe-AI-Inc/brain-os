import fs from 'node:fs';
const [inp, out] = process.argv.slice(2);
const s = fs.readFileSync(inp, 'utf8').split('\r\n').join('\n');
fs.writeFileSync(out, s);
console.log('wrote', out, s.length);
