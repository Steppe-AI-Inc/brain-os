#!/usr/bin/env node
// THE INSTALLER'S INPUTS - DEVELOPER VERIFICATION (S-12, S-5; WO-3, WO-4, WO-6; findings B-3, B-5, L3-F1, L4-F6, L4-F7, L4-F10, L6-3).
// Plain node on Windows; no database, no plane, no network (a spy stands in for the Factory Node API). Seconds.
//   I1 no command line reaches setup with a pairing code in it: `setup --code <c>`, `--code=<c>`, `<c>` as the command, `setup <c>`,
//      a code as the value of any option, `version <c>`, `selftest --code <c>`; the code in lower case, without dashes, in
//      space-separated groups, and spelled with O for 0 and I / l / L for 1 WITHOUT dashes (so only the O / I / L reading makes it a
//      code); the code in its displayed grouping inside a longer argument (a path segment, a part of a URL, a file name); and a
//      confirmation option (`--yes`).
//      Every case ends with exit 64 and a named REFUSED line holding no part of the code (no 5-character window of it), and nothing
//      is created. The code is a canary: the exact form of an issued code, never issued.
//   I2 setup reads the pairing code from standard input, and only its first line: the prompt appears in the output and the code does
//      not; an input that closes before a line yields no code immediately (no wait, no default); a second line is never taken
//   I3 the node sends a code or a token only to https or to this computer's loopback: endpointRefusal accepts and refuses exactly
//      that, by name; a NodeApi on a refused address sends nothing from any call (a spy counts)
//   I4 storeKey writes a node key with DPAPI protection or writes nothing: without DPAPI it throws dpapi_required and creates no file
//      and no directory; with DPAPI the file holds a DPAPI envelope
//   I5 the build refuses a toolchain off package-lock.json (toolchain_off_lock, exit 2) - a version, an integrity, a record, a
//      resolution outside this checkout, ESBUILD_BINARY_PATH - and checks it before esbuild is loaded
//   I6 setup's structure: exactly one input (the pairing code's prompt); no code or confirmation option read; the key is stored
//      before the code is asked and the code before enroll/start; THE GATE precedes every install step (report-state, copy,
//      current.json / previous.json, task, start), in setup and in upgrade; only setup and upgrade (both gated) and the admin adopt
//      write current.json; main.mjs passes setup none of its test seams
//   I7 a new enrollment with DPAPI unavailable refuses before the code is read and before any request (no credential can be
//      issued); with DPAPI available it asks the plane's time, reads the code, and sends it only in enroll/start, never printing it
//   I8 verifyRelease takes no default revocations: an omitted list throws (the pre-credential check names NO_REVOCATIONS)
//   I10 the machine fingerprint (identity.mjs) is the sha256 of the MachineGuid registry string exactly as stored (contract §1 r3)
//   I9 the founder's pepper tool puts the pepper into one new owner-only file, prints no value, and its shred step leaves nothing;
//      judging only the path it is given (no environment value), it refuses an existing or relative directory, a path below a .git
//      directory or a .git file, and a path with a OneDrive component
// usage: node qa/factory/v1/installer_input_acceptance.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canaryCode, leaksIn } from './canary.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = (p) => join(ROOT, ...p.split('/'));
const imp = (p) => import(pathToFileURL(R(p)).href);
const lf = (p) => readFileSync(R(p), 'utf8').replace(/\r\n/g, '\n');
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail && !ok ? ' - ' + String(detail).slice(0, 1500) : '')); };
const work = mkdtempSync(join(tmpdir(), 'bf-installer-'));
const C = canaryCode();

/** the body of `function name(` ... up to the next top-level `\n}` */
const fnBody = (src, name) => { const i = src.search(new RegExp('(export )?(async )?function ' + name + '\\(')); if (i < 0) return ''; const j = src.indexOf('\n}', i); return src.slice(i, j < 0 ? undefined : j + 2); };
const order = (text, ...needles) => { const at = needles.map((n) => text.indexOf(n)); return { at, ok: at.every((x) => x >= 0) && at.every((x, k) => k === 0 || at[k - 1] < x) }; };

try {
  // ---- I1: the command line never carries a pairing code (the unbundled entry, the same code the SEA bundles)
  {
    const MAIN = R('scripts/factory-runner/sea/main.mjs');
    const cwd = join(work, 'i1'); mkdirSync(cwd);
    const home = join(cwd, 'home');
    const cases = [['setup', '--code', C.display, '--home', home], ['setup', '--code=' + C.display], [C.display], ['setup', C.display], ['setup', '--home', C.display],
      ['setup', '--task-name', C.lower], ['setup', '--manifest', C.nodash], ['setup', '--api', C.spelled], ['upgrade', '--artifact', C.display, '--home', home],
      ['status', '--home', C.lower], ['version', C.display], ['selftest', '--code', C.display], ['setup', '--yes', '--home', home], ['setup', '--home', home, C.nodash.toLowerCase()],
      // spelled without dashes (O for 0, I for 1), and in lower-case groups with o and L: a code only when O / I / L are read as 0 / 1
      ['setup', '--home', C.spelledNodash], ['setup', '--task-name', C.spacedSpelled], [C.spelledNodash.toLowerCase()],
      // the code in its displayed grouping inside a longer argument: a path segment, a part of a URL, a file name, after other text
      ['setup', '--home', join(cwd, 'homes', C.display)], ['setup', '--api', 'https://h.example/functions/v1/' + C.display + '/x'],
      ['setup', '--manifest', join(cwd, C.lower + '.manifest.json')], ['setup', '--task-name', 'node-' + C.display],
      // a code typed in pieces is no code form, but still never shown: the unknown-command and unknown-option refusals show no argument
      [C.code.slice(0, 12)], ['setup', '--home', home, C.code.slice(3, 15)]];
    const bad = [];
    for (const args of cases) {
      const r = spawnSync(process.execPath, [MAIN, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, BRAIN_FACTORY_HOME: home } });
      const out = (r.stdout || '') + (r.stderr || '');
      const leaks = leaksIn(out, C);
      if (r.status !== 64 || !/^REFUSED - /m.test(out) || leaks.length) bad.push({ args: args.map((a) => (leaksIn(a, C).length ? '<code>' : a)), status: r.status, leaks: leaks.length, first: leaks.length ? '(withheld)' : out.split(/\r?\n/)[0].slice(0, 100) });
    }
    const created = readdirSync(cwd);
    const namedCode = (() => { const r = spawnSync(process.execPath, [MAIN, 'setup', '--code', C.display], { cwd, encoding: 'utf8', windowsHide: true }); return /--code is not an option/.test((r.stdout || '') + (r.stderr || '')); })();
    row('I1 no pairing code gets past the command line: ' + cases.length + ' positions, spellings and embeddings (and --yes) each end with exit 64 and a named REFUSED line that holds no part of the code; --code is refused by name; nothing is created',
      bad.length === 0 && created.length === 0 && namedCode, JSON.stringify({ bad, created: created.map((f) => (leaksIn(f, C).length ? '<code>' : f)), namedCode }));
  }

  // ---- I2: one line of standard input, and only the first, is the pairing code
  {
    const { readPairingCode, PAIRING_PROMPT } = await imp('scripts/factory-runner/enrolled/setup.mjs');
    const collect = () => { const o = new PassThrough(); let text = ''; o.on('data', (d) => { text += d; }); return { o, text: () => text }; };
    const in1 = new PassThrough(); const out1 = collect(); in1.end(C.display + '\nSECOND-LINE\n');
    const got = await readPairingCode({ input: in1, output: out1.o });
    const in2 = new PassThrough(); const out2 = collect(); in2.end();
    const t0 = Date.now();
    const none = await Promise.race([readPairingCode({ input: in2, output: out2.o }), new Promise((r) => setTimeout(() => r('HUNG'), 2000))]);
    const in3 = new PassThrough(); const out3 = collect(); in3.end('   \n' + C.display + '\n');
    const blank = await readPairingCode({ input: in3, output: out3.o });
    row('I2 setup takes the pairing code from the first line of standard input only (a second line is never taken); the prompt is written and the code is not; a closed input yields no code at once; a blank line is no code',
      got === C.display && out1.text() === PAIRING_PROMPT && leaksIn(out1.text(), C).length === 0 && none === null && Date.now() - t0 < 2000 && blank === null,
      JSON.stringify({ got: got === C.display, out: out1.text(), none, blank: blank === null ? null : 'a value' }));
  }

  // ---- I3: https or loopback only; nothing sent to a refused address
  {
    const { endpointRefusal, NodeApi } = await imp('scripts/factory-runner/enrolled/api.mjs');
    const { newKey } = await imp('scripts/factory-runner/enrolled/keys.mjs');
    const accept = ['https://abcdefghijklmnopqrst.supabase.co/functions/v1/factory-node-api', 'http://127.0.0.1:5/x', 'http://localhost:5/x', 'http://[::1]:5/x'];
    const refuse = ['http://192.0.2.10/x', 'http://example.com/functions/v1/factory-node-api', 'http://127.0.0.2:5/x', 'https://u:p@h.example/x', 'https://h.example/x?q=1', 'https://h.example/x#f', 'ftp://h.example/x', 'not a url'];
    const acc = accept.filter((u) => endpointRefusal(u) !== null);
    const ref = refuse.filter((u) => { const r = endpointRefusal(u); return !(r && r.refused === 'endpoint_refused' && r.ok === false); });
    const k = await newKey();
    let calls = 0;
    const spyFetch = async () => { calls++; return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); };
    const api = new NodeApi({ api: 'http://192.0.2.10/functions/v1/factory-node-api', key: { privateKey: k.privateKey, publicKey: k.publicKey }, fetchImpl: spyFetch });
    // a call that throws did not refuse by name: it counts against the row (never as a crash of the suite)
    const safe = async (f) => { try { return await f(); } catch (e) { return { refused: 'threw: ' + (e && e.message) }; } };
    const answers = [await safe(() => api.time()), await safe(() => api.session()), await safe(() => api.op('heartbeat', { phase: 'AVAILABLE' })), await safe(() => api.enrollStart(C.display, {})),
      await safe(() => api.enrollComplete({ enrollment_id: 'x', challenge: 'y' })), await safe(() => api.rotate(k))];
    const ok = new NodeApi({ api: 'http://127.0.0.1:1/functions/v1/factory-node-api', key: { privateKey: k.privateKey, publicKey: k.publicKey }, fetchImpl: spyFetch });
    await ok.time();
    row('I3 the node sends a code or a token only to https or this computer\'s loopback: the rule accepts ' + accept.length + ' and refuses ' + refuse.length + ' addresses by name (endpoint_refused); a client on a refused address sends nothing from time, session, op, enroll/start, enroll/complete or rotate',
      acc.length === 0 && ref.length === 0 && answers.every((a) => a.refused === 'endpoint_refused') && calls === 1,
      JSON.stringify({ wronglyRefused: acc, wronglyAccepted: ref, answers: answers.map((a) => a.refused), calls }));
  }

  // ---- I4: DPAPI or nothing
  {
    const { newKey, storeKey } = await imp('scripts/factory-runner/enrolled/keys.mjs');
    const f1 = join(work, 'i4a', 'node.key');
    let refused = null;
    try { await storeKey(f1, await newKey(), { dpapi: { _simulateConstrainedLanguage: true } }); } catch (e) { refused = e && e.code; }
    const f2 = join(work, 'i4b', 'node.key');
    const prot = await storeKey(f2, await newKey());
    const head = existsSync(f2) ? readFileSync(f2).subarray(0, 32).toString('latin1') : '';
    row('I4 storeKey writes a DPAPI-protected node key or nothing: without DPAPI it refuses by name (dpapi_required) and leaves no file or directory; with DPAPI the file is a DPAPI envelope',
      refused === 'dpapi_required' && !existsSync(f1) && !existsSync(dirname(f1)) && prot === 'dpapi' && /^BOS-SECURE-STORE\/1 dpapi /.test(head),
      JSON.stringify({ refused, file: existsSync(f1), prot, head: head.split('\n')[0] }));
  }

  // ---- I5: the toolchain is the locked one
  {
    const bs = await imp('scripts/factory-build/build-sea.mjs');
    const lock = JSON.parse(readFileSync(R('package-lock.json'), 'utf8'));
    const rec = JSON.parse(readFileSync(R('node_modules/.package-lock.json'), 'utf8'));
    const real = { lock, installedRecord: rec, installedVersion: (n) => JSON.parse(readFileSync(join(ROOT, 'node_modules', ...n.split('/'), 'package.json'), 'utf8')).version,
      resolvedPath: (n) => join(ROOT, 'node_modules', ...n.split('/'), 'package.json'), env: {} };
    const tryLock = (o) => { try { return { list: bs.checkToolchainLock(o) }; } catch (e) { return { code: e.code, message: String(e.message) }; } };
    const good = tryLock(real);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const recInt = clone(rec); recInt.packages['node_modules/@esbuild/win32-x64'].integrity = 'sha512-' + 'A'.repeat(86) + '==';
    const recGone = clone(rec); delete recGone.packages['node_modules/postject'];
    const drift = [
      ['esbuild', tryLock({ ...real, installedVersion: (n) => (n === 'esbuild' ? '0.27.1' : real.installedVersion(n)) })],
      ['@esbuild/win32-x64', tryLock({ ...real, installedRecord: recInt })],
      ['postject', tryLock({ ...real, installedRecord: recGone })],
      ['postject', tryLock({ ...real, resolvedPath: (n) => (n === 'postject' ? join(dirname(ROOT), 'node_modules', 'postject', 'package.json') : real.resolvedPath(n)) })],
      ['ESBUILD_BINARY_PATH', tryLock({ ...real, env: { esbuild_binary_path: 'C:\\x\\esbuild.exe' } })],
    ];
    const missed = drift.filter(([name, r]) => !(r.code === bs.EXIT.USAGE && /^toolchain_off_lock: /.test(r.message) && r.message.includes(name)));
    const build = fnBody(lf('scripts/factory-build/build-sea.mjs'), 'build');
    const o = order(build, 'toolchainLockHere()', "requireFromRoot('esbuild')", 'esbuild.version !== esbuildLocked', "requireFromRoot('postject')");
    row('I5 the build refuses a toolchain off package-lock.json by name (toolchain_off_lock, exit 2): a changed esbuild version, a changed platform-binary integrity, a missing install record, a resolution outside this checkout, ESBUILD_BINARY_PATH; the locked tree passes; the check runs before esbuild is loaded and the loaded version is compared',
      good.list && good.list.filter((t) => t.version).map((t) => t.name).join(',') === bs.LOCKED_TOOLS.join(',') && missed.length === 0 && o.ok,
      JSON.stringify({ good: good.list ? good.list.length : good.message, missed: missed.map(([n, r]) => n + ': ' + (r.message || 'accepted')), order: o.at }));
  }

  // ---- I6: setup's structure (read from the source)
  {
    const setup = lf('scripts/factory-runner/enrolled/setup.mjs');
    const upgradeSrc = lf('scripts/factory-runner/enrolled/upgrade.mjs');
    const main = lf('scripts/factory-runner/sea/main.mjs');
    const readCode = fnBody(setup, 'readPairingCode'), enroll = fnBody(setup, 'enrollNew'), run = fnBody(setup, 'runSetup'), up = fnBody(upgradeSrc, 'upgrade');
    const facts = {
      oneInput: (setup.match(/createInterface\(/g) || []).length === 1 && readCode.includes('createInterface(') && !/\.question\(/.test(setup)
        && (setup.match(/readPairingCode\(/g) || []).length === 2,
      noArgvCode: !/\bo\.(code|yes)\b/.test(setup) && !/'--(code|yes)'/.test(main.replace(/^\/\/.*$/gm, '')),
      keyBeforeCode: order(enroll, 'storeKey(', 'client.time()', 'readPairingCode(', 'client.enrollStart(', 'client.enrollComplete(').ok,
      gateFirst: (() => { const g = run.indexOf('gateOffer('); return g > 0 && ["op('report-state'", 'mkdirSync(', 'copyFileSync(', 'writeJson(p.current', 'writeJson(p.previous', 'registerTasks(', 'startTask(', 'startSupervisor('].every((n) => run.indexOf(n) > g); })(),
      gateAfterEnroll: order(run, 'enrollNew(', 'gateOffer(').ok,
      upgradeGated: order(up, 'gateOffer(', 'copyFileSync(', 'writeJson(p.current').ok,
      currentWriters: (() => { const dir = R('scripts/factory-runner/enrolled'); const w = readdirSync(dir).filter((f) => f.endsWith('.mjs') && /writeJson\(p\.current\b/.test(lf('scripts/factory-runner/enrolled/' + f))); return w.join(',') === 'setup.mjs,upgrade.mjs'; })(),
      adoptOnly: (() => { const a = fnBody(upgradeSrc, 'adoptIfInstalled'); return /r\.digest === adopted\.digest/.test(a) && (upgradeSrc.match(/writeJson\(p\.current/g) || []).length === 2; })(),
      noSeamsFromMain: (() => { const call = (/runSetup\(\{[^;]*\}\)/.exec(main) || [''])[0]; return call.length > 0 && !/\b(input|output|dpapi|fetchImpl)\b/.test(call); })(),
    };
    row('I6 setup reads exactly one input (the pairing code\'s prompt) and no code or confirmation option; stores the key before it asks for the code; applies THE GATE after enrollment and before every install step (in setup and in upgrade); only setup and upgrade write current.json (besides the admin adopt); main.mjs passes setup none of its test seams',
      Object.values(facts).every(Boolean), JSON.stringify(facts));
  }

  // ---- I7: a new enrollment, DPAPI unavailable and available, against a spy plane
  {
    const { enrollNew } = await imp('scripts/factory-runner/enrolled/setup.mjs');
    const calls = [];
    const spy = async (url, init) => {
      const path = new URL(url).pathname; const body = init && init.body ? String(init.body) : '';
      calls.push({ method: (init && init.method) || 'GET', path, body });
      const j = path.endsWith('/v1/time') ? { ok: true, server_time: new Date().toISOString(), protocol: 1 }
        : path.endsWith('/v1/enroll/start') ? { ok: true, enrollment_id: '00000000-0000-4000-8000-000000000001', challenge: 'c'.repeat(43), computer: 'Spy PC', tenant: 'operator' }
          : path.endsWith('/v1/enroll/complete') ? { ok: true, node_id: 'node-spy', principal_id: 'p', computer_id: 'c', credential_id: 'k' } : { ok: false, refused: 'not_found' };
      return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const api = 'http://127.0.0.1:9/functions/v1/factory-node-api';
    // an enrollment that waits for input it will never get fails this row (bounded), never the suite
    const bounded = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r({ ok: false, timedOut: true }), 30000))]);
    // DPAPI unavailable: refused before the code is read and before any request
    const h1 = join(work, 'i7a'); const said1 = [];
    const in1 = new PassThrough(); in1.write(C.display + '\n');
    const r1 = await bounded(enrollNew({ api, home: h1, channel: 'dev', say: (s) => said1.push(s), input: in1, output: new PassThrough(), dpapi: { _simulateConstrainedLanguage: true }, fetchImpl: spy }));
    const unread = in1.readableLength > 0;
    const callsWhenRefused = calls.length;
    // DPAPI available: the plane's time, then the code (read once), sent only in enroll/start; never printed; config holds no code
    const h2 = join(work, 'i7b'); const said2 = [];
    const in2 = new PassThrough(); in2.end(C.display + '\n');
    const out2 = new PassThrough(); let out2t = ''; out2.on('data', (d) => { out2t += d; });
    const r2 = await bounded(enrollNew({ api, home: h2, channel: 'dev', say: (s) => said2.push(s), input: in2, output: out2, fetchImpl: spy }));
    const seq = calls.slice(callsWhenRefused).map((c) => c.method + ' ' + c.path.replace(/^.*\/v1\//, '/v1/'));
    const carrying = calls.slice(callsWhenRefused).filter((c) => leaksIn(c.body, C).length).map((c) => c.path.replace(/^.*\/v1\//, '/v1/'));
    const cfgText = existsSync(join(h2, 'config.json')) ? readFileSync(join(h2, 'config.json'), 'utf8') : '';
    const keyHead = existsSync(join(h2, 'key', 'node.key')) ? readFileSync(join(h2, 'key', 'node.key')).subarray(0, 32).toString('latin1') : '';
    row('I7 a new enrollment with DPAPI unavailable refuses by name (dpapi_required) before the code is read and before any request (no credential can be issued), writing no key and no config; with DPAPI it asks the plane\'s time, reads the code once, sends it only in enroll/start, and never prints it',
      r1.ok === false && said1.some((s) => /^REFUSED - dpapi_required/.test(s)) && callsWhenRefused === 0 && unread && !existsSync(join(h1, 'key', 'node.key')) && !existsSync(join(h1, 'config.json'))
        && r2.ok === true && seq.join(',') === 'GET /v1/time,POST /v1/enroll/start,POST /v1/enroll/complete' && carrying.join(',') === '/v1/enroll/start'
        && leaksIn(said2.join('\n') + out2t + cfgText, C).length === 0 && /^BOS-SECURE-STORE\/1 dpapi /.test(keyHead),
      JSON.stringify({ r1: r1.ok, said1: said1.map((s) => s.slice(0, 40)), callsWhenRefused, unread, r2: r2.ok, seq, carrying, leaks: leaksIn(said2.join('\n') + out2t + cfgText, C).length, keyHead: keyHead.split('\n')[0] }));
  }

  // ---- I8: no default revocations
  {
    const { verifyRelease, NO_REVOCATIONS } = await imp('scripts/factory-runner/enrolled/release.mjs');
    let threw = null;
    try { verifyRelease({ manifest: {}, artifact: null }); } catch (e) { threw = e instanceof TypeError; }
    const named = verifyRelease({ manifest: {}, artifact: null, revocations: NO_REVOCATIONS });
    const setup = lf('scripts/factory-runner/enrolled/setup.mjs');
    const calls = setup.match(/verifyRelease\(\{[^}]*\}\)/g) || [];
    row('I8 verifyRelease takes no default revocations: an omitted list throws; setup\'s pre-credential check names NO_REVOCATIONS explicitly (the gate applies the fresh list)',
      threw === true && named && named.ok === false && calls.length === 1 && /revocations: NO_REVOCATIONS/.test(calls[0]), JSON.stringify({ threw, named: named && named.refused, calls }));
  }

  // ---- I9: the founder's pepper tool
  {
    const TOOL = R('qa/implementation/auto-enrollment-v1/tools/founder_secrets.mjs');
    const fs9 = await import(pathToFileURL(TOOL).href);
    const ss = await imp('scripts/factory-runner/lib/secure-store.mjs');
    const dir = join(work, 'i9-pepper');
    const p = spawnSync(process.execPath, [TOOL, 'pepper', '--dir', dir], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    const file = join(dir, fs9.PEPPER_FILE);
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const m = /^FACTORY_PAIRING_PEPPER=([A-Za-z0-9+/]{43}=)\n$/.exec(text);
    const value = m ? m[1] : null;
    const bytes = value ? Buffer.from(value, 'base64').length : 0;
    const me = await ss.currentUserSid();
    const dacl = existsSync(file) ? await ss.readDacl(file) : { ok: false };
    const printed = value ? ((p.stdout || '') + (p.stderr || '')).includes(value) : true;
    const s = spawnSync(process.execPath, [TOOL, 'shred', '--dir', dir], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    // a directory whose ancestor holds a .git FILE (a linked worktree's marker) is inside a working tree as much as one under a .git
    // directory; the check needs no git program
    const wt = join(work, 'i9-linked-worktree'); mkdirSync(wt); writeFileSync(join(wt, '.git'), 'gitdir: C:/nowhere/.git/worktrees/x\n');
    const refusals = {
      exists: /exists already/.test(fs9.placeRefusal(work) || ''),
      relative: /absolute path/.test(fs9.placeRefusal('relative\\dir') || ''),
      gitTree: /git working tree/.test(fs9.placeRefusal(join(ROOT, 'qa', 'founder-secrets-probe-' + process.pid)) || ''),
      gitFile: /git working tree/.test(fs9.placeRefusal(join(wt, 'a', 'b')) || ''),
      oneDrive: /OneDrive/.test(fs9.placeRefusal(join(work, 'OneDrive - Contoso', 'x')) || '') && /OneDrive/.test(fs9.placeRefusal(join(work, 'onedrive', 'x')) || ''),
      fresh: fs9.placeRefusal(join(work, 'fresh-' + process.pid)) === null,
      noEnvParameter: fs9.placeRefusal.length === 1,
    };
    row('I9 the founder\'s pepper tool puts 32 random bytes (base64) into one new owner-only file, prints no value, and the shred step leaves nothing; from the path alone it refuses an existing or relative directory, one below a .git directory or .git file, and one with a OneDrive component',
      p.status === 0 && bytes === 32 && !printed && dacl.ok && ss.isOwnerOnlyDacl(dacl, me) && s.status === 0 && /^absent: /.test(s.stdout || '') && !existsSync(dir) && Object.values(refusals).every(Boolean),
      JSON.stringify({ exit: p.status, bytes, printed, acl: dacl.ok && ss.isOwnerOnlyDacl(dacl, me), shred: (s.stdout || '').split(' ')[0], gone: !existsSync(dir), refusals }));
  }
  // ---- I10: the machine fingerprint is the sha256 of the MachineGuid registry string EXACTLY AS STORED (contract §1 r3)
  {
    const id = await imp('scripts/factory-runner/enrolled/identity.mjs');
    const { createHash } = await import('node:crypto');
    const sha = (v) => createHash('sha256').update(Buffer.from(v, 'utf8')).digest('hex');
    // the runtime's reader writes the value's UTF-8 bytes as base64 (no console code page, no text parsing): 'B64:<base64>'
    const helper = (v) => 'B64:' + Buffer.from(v, 'utf8').toString('base64') + '\r\n';
    const fromHelper = (out) => { const r = id.machineGuidFromHelperOutput(out); return r.ok ? id.fingerprintOf(r.bytes) : null; };
    const values = ['0e1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', '0E1A2B3C-4D5E-6F70-8192-A3B4C5D6E7F8', '{0e1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8}',
      'not-a-guid-at-all', '0e1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8 ', ' 0e1a2b3c', 'caf\u00e9-guid'];
    const cases = values.map((v) => ({ v, got: fromHelper(helper(v)), want: sha(v) }));
    const none = [fromHelper(''), fromHelper('NO_VALUE'), fromHelper('NOT_A_STRING'), fromHelper('NO_KEY'), fromHelper('B64:not base64!'), fromHelper('ERROR: something else')];
    // this machine: the runtime's value equals the registry value read independently (PowerShell), hashed here
    const { registryFingerprint } = await imp('qa/factory/v1/realnode.mjs');
    const here = process.platform === 'win32' ? registryFingerprint() : { fingerprint: null };
    const mine = id.machineFingerprint();
    row('I10 the machine fingerprint is the sha256 of the UTF-8 bytes of the MachineGuid registry string EXACTLY AS STORED: an upper-case GUID, a braced value, a non-GUID value, leading or trailing spaces and a non-ASCII character each hash as they are (no case change, no shape filter, no trimming, UTF-8); no value (or an unreadable answer) gives none; on this machine the runtime\'s value equals the registry\'s, read independently',
      cases.every((c) => c.got === c.want) && new Set(cases.map((c) => c.got)).size === cases.length && none.every((x) => x === null)
        && (process.platform !== 'win32' || (here.fingerprint && mine === here.fingerprint)),
      JSON.stringify({ cases: cases.map((c) => [c.v, c.got === c.want]), none, here: here.fingerprint && here.fingerprint.slice(0, 12), mine: mine && mine.slice(0, 12) }));
  }
} catch (e) {
  row('X0 installer input suite', false, e && e.stack || e);
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\ninstaller_input_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
