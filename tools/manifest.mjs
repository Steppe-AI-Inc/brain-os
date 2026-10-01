// The sha256 of every file the founder applies or deploys and of every file a node runs: MANIFEST.sha256 (sha256sum format).
//   node tools/manifest.mjs --write     regenerate it
//   node tools/manifest.mjs --check     exit 1 when a file differs from the manifest, is missing from it, or is listed and gone
// The bytes hashed are the bytes on disk; .gitattributes keeps them equal to the committed blob on every machine.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TREES = ['sql', 'supabase', 'relay'];
const walk = (rel) => statSync(join(ROOT, rel)).isDirectory() ? readdirSync(join(ROOT, rel)).sort().flatMap((f) => walk(rel + '/' + f)) : [rel];
const files = TREES.flatMap(walk);
const lines = files.map((f) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex') + '  ' + f).join('\n') + '\n';
const manifest = join(ROOT, 'MANIFEST.sha256');

if (process.argv.includes('--write')) {
  writeFileSync(manifest, lines);
  console.log('MANIFEST.sha256 written: ' + files.length + ' files');
} else if (process.argv.includes('--check')) {
  const have = existsSync(manifest) ? readFileSync(manifest, 'utf8').replace(/\r\n/g, '\n') : '';
  const want = new Map(lines.trim().split('\n').map((l) => [l.slice(66), l.slice(0, 64)]));
  const got = new Map(have.trim().split('\n').filter(Boolean).map((l) => [l.slice(66), l.slice(0, 64)]));
  const wrong = [...want].filter(([f, h]) => got.get(f) !== h).map(([f]) => f).concat([...got.keys()].filter((f) => !want.has(f)).map((f) => f + ' (listed, not on disk)'));
  console.log(wrong.length ? 'FAIL MANIFEST.sha256 does not match: ' + wrong.join(', ') : 'OK   MANIFEST.sha256 matches the ' + files.length + ' files it lists');
  process.exit(wrong.length ? 1 : 0);
} else {
  process.stdout.write(lines);
}
