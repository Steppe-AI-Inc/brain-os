#!/usr/bin/env node
// MONITOR GARBAGE COLLECTION (Factory V1 milestone 5, founder ruling 2026-09-17 item 5).
//
// A monitor is a process that follows a file so that a session is woken when it changes: `tail -f` on a watchdog state
// file, on a gate log, on an acceptance log. Every one of them is started for a round and forgotten when the round ends,
// because nothing ends it. Measured on the Home PC on 2026-09-18: 46 `tail` processes and 43 shell wrappers were alive,
// following watchdog states from rounds #71 to #105 and gate logs from #82 to #105 - every one of those rounds finished
// days or weeks earlier. Each holds a handle, a console, and a few megabytes; together they are a slow leak that only
// ends with a reboot.
//
// A monitor is GARBAGE when the file it follows has been quiet for longer than the quiet window (default 30 minutes) -
// a live round moves its files at least every few minutes - or when the file no longer exists. It is NOT garbage while
// its file is moving, whatever it is called. The rule reads the file's mtime, never the file's contents, so it cannot be
// fooled by a log that says "done" while a process is still writing.
//
//   node scripts/factory-runner/monitor-gc.mjs list [--quiet-minutes 30]     print every monitor with its verdict
//   node scripts/factory-runner/monitor-gc.mjs reap [--quiet-minutes 30]     terminate the garbage ones (and the shell
//                                                                           wrapper whose only child was that tail)
//   --json   machine-readable output (used by the acceptance)
//
// Windows only for now (wmic / taskkill); the classification is portable, the process listing is not.
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const QUIET_MS = Number(arg('--quiet-minutes', 30)) * 60 * 1000;

function processes(nameFilter) {
  const r = spawnSync('wmic', ['process', 'where', "name='" + nameFilter + "'", 'get', 'ProcessId,ParentProcessId,CommandLine', '/FORMAT:LIST'], { encoding: 'utf8' });
  const out = []; let cur = {};
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    const m = /^(CommandLine|ParentProcessId|ProcessId)=(.*)$/.exec(line.trim());
    if (!m) continue;
    cur[m[1]] = m[2];
    if (m[1] === 'ProcessId') { if (cur.CommandLine !== undefined) out.push({ pid: Number(cur.ProcessId), parent: Number(cur.ParentProcessId), cmd: cur.CommandLine }); cur = {}; }
  }
  return out;
}

// The file a tail follows: the last argument that is not an option; MSYS paths (/c/...) mapped to Windows.
function followedFile(cmd) {
  if (!/\btail(\.exe)?"?\s/.test(cmd) || !/\s-(f|F|n\s+\+?\d+\s+-f|n\s+\+?\d+\s+-F|-follow)/.test(cmd)) return null;
  const parts = cmd.match(/"[^"]+"|\S+/g) || [];
  const file = parts.slice(1).filter((p) => !/^-/.test(p) && !/^\+?\d+$/.test(p)).pop();
  if (!file) return null;
  let f = file.replace(/^"|"$/g, '');
  if (/^\/[a-z]\//.test(f)) f = f[1].toUpperCase() + ':' + f.slice(2);
  return f;
}

export function listMonitors({ quietMs = QUIET_MS, cwd = process.cwd() } = {}) {
  const now = Date.now();
  const tails = processes('tail.exe');
  const bashes = processes('bash.exe');
  const byPid = new Map(bashes.map((b) => [b.pid, b]));
  const childrenOf = new Map();
  for (const t of tails) childrenOf.set(t.parent, (childrenOf.get(t.parent) || 0) + 1);
  return tails.map((t) => {
    const file = followedFile(t.cmd);
    const abs = file ? (/^[A-Za-z]:/.test(file) ? file : resolve(cwd, file)) : null;
    let verdict = 'LIVE', reason = '';
    if (!file) { verdict = 'UNKNOWN'; reason = 'no followed file parsed from the command line'; }
    else if (!existsSync(abs)) { verdict = 'GARBAGE'; reason = 'the followed file does not exist (' + abs + ')'; }
    else {
      const quietFor = now - statSync(abs).mtimeMs;
      if (quietFor > quietMs) { verdict = 'GARBAGE'; reason = 'quiet for ' + Math.round(quietFor / 60000) + ' min (' + abs + ')'; }
      else reason = 'moved ' + Math.round(quietFor / 1000) + ' s ago (' + abs + ')';
    }
    const wrapper = byPid.get(t.parent);
    return { pid: t.pid, parent: t.parent, wrapperPid: wrapper && childrenOf.get(t.parent) === 1 ? wrapper.pid : null, file: abs, verdict, reason };
  });
}

export function reap(monitors) {
  const killed = [];
  for (const m of monitors.filter((x) => x.verdict === 'GARBAGE')) {
    const r = spawnSync('taskkill', ['/F', '/PID', String(m.pid)], { encoding: 'utf8' });
    if (r.status === 0) killed.push(m.pid);
    if (m.wrapperPid) { const w = spawnSync('taskkill', ['/F', '/PID', String(m.wrapperPid)], { encoding: 'utf8' }); if (w.status === 0) killed.push(m.wrapperPid); }
  }
  return killed;
}

const cmd = process.argv[2] || 'list';
if (cmd === 'list' || cmd === 'reap') {
  const monitors = listMonitors();
  const garbage = monitors.filter((m) => m.verdict === 'GARBAGE'), live = monitors.filter((m) => m.verdict === 'LIVE');
  if (has('--json')) {
    const killed = cmd === 'reap' ? reap(monitors) : [];
    console.log(JSON.stringify({ monitors: monitors.length, garbage: garbage.length, live: live.length, killed, after: cmd === 'reap' ? listMonitors().length : monitors.length }));
  } else {
    for (const m of monitors) console.log(m.verdict.padEnd(8) + 'tail ' + String(m.pid).padEnd(7) + (m.wrapperPid ? 'wrapper ' + String(m.wrapperPid).padEnd(7) : '        ') + m.reason);
    console.log('');
    console.log(monitors.length + ' monitors: ' + garbage.length + ' garbage, ' + live.length + ' live (quiet window ' + Math.round(QUIET_MS / 60000) + ' min)');
    if (cmd === 'reap') { const killed = reap(monitors); console.log('terminated ' + killed.length + ' process(es); ' + listMonitors().length + ' monitors remain'); }
  }
} else { console.log('usage: node scripts/factory-runner/monitor-gc.mjs [list | reap] [--quiet-minutes N] [--json]'); process.exit(2); }
