// A SENTINEL ARTIFACT for AC-5: a real Windows executable (a Node SEA made with the same toolchain as BrainFactorySetup.exe) whose ONLY
// behaviour is to write a marker file the moment it is executed, with any arguments. Offered to a node as a release, it proves
// "refused BEFORE execution": if the node ever ran it, the marker would exist. A positive control runs it directly once.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './plane.mjs';

const require = createRequire(join(ROOT, 'package.json'));

export async function buildSentinel(outExe, markerPath) {
  const { stripSignature, updatePeChecksum } = await import('../../../scripts/factory-build/pe-strip-signature.mjs');
  const work = mkdtempSync(join(tmpdir(), 'bf-sentinel-'));
  try {
    writeFileSync(join(work, 'sentinel.cjs'), "require('fs').writeFileSync(" + JSON.stringify(markerPath) + ", 'EXECUTED ' + JSON.stringify(process.argv.slice(1)));\nprocess.exit(0);\n");
    writeFileSync(join(work, 'sea.json'), JSON.stringify({ main: 'sentinel.cjs', output: 'sentinel.blob', disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
    const g = spawnSync(process.execPath, ['--experimental-sea-config', 'sea.json'], { cwd: work, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (g.status !== 0) throw new Error('sentinel blob: ' + g.stderr);
    const base = stripSignature(readFileSync(process.execPath)).buffer;
    writeFileSync(outExe, base);
    await require('postject').inject(outExe, 'NODE_SEA_BLOB', readFileSync(join(work, 'sentinel.blob')), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', overwrite: true });
    const b = readFileSync(outExe); updatePeChecksum(b); writeFileSync(outExe, b);
    return outExe;
  } finally { rmSync(work, { recursive: true, force: true }); }
}
void copyFileSync;
