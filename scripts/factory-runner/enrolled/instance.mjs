// ONE SUPERVISOR AND ONE WORKER PER HOME, BY AN EXCLUSIVE NAMED PIPE (WO-4 "a killed runtime is restarted"; AC-1; P-2 / AC-9: one
// worker per credential). A process id is never the identity: Windows reuses a process id once its process ended, and the id space
// starts again at every boot, so a record naming a pid says nothing about who runs now (a pid of another user's process even answers
// "exists" to a signal-0 probe). Each role holds a pipe named from the home's real path for its lifetime: only one process can listen
// on it, it disappears with the process whatever ends it (logoff, reboot, a crash, a kill), and it answers "whois" (who holds it) and
// "stop". The certified baseline's supervisor does the same (69df2f52 proc.mjs, node-supervisor.mjs:19-23); this module mirrors that
// pattern for an enrolled home with node builtins only (it runs inside the single executable).
//   supervisor pipe   held by the supervisor; a second supervisor finds it held and exits ALREADY
//   worker pipe       held by the worker; a worker that finds it held exits ALREADY before any API call, and a supervisor asks an
//                     orphaned worker to stop before it starts another - it never ends a process by a pid (see retireStrayWorker)
// The pipe's name hashes the home's real path (realpathSync.native, lower-cased on Windows), so every spelling of one home - a short
// 8.3 name, a junction, a subst drive, another case - names the same pipe. A named pipe's default security gives write access only to
// its creator (and SYSTEM and administrators), so another user can neither send "stop" to this home's runtime nor answer on a pipe
// it holds. RESIDUAL: a local user who creates the name first (the name is predictable) can keep this home's runtime from starting
// and can answer "whois" with any pid; the answer is only logged - no process is ever ended because of it (the same residual as the
// baseline's control pipe).
import { createHash } from 'node:crypto';
import { existsSync, realpathSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** the pipe for (home, role) - the same from any spelling of the home's path */
export function pipePath(home, role) {
  let p = resolve(String(home));
  try { p = realpathSync.native(p); } catch { /* not created yet: nothing can be listening for it */ }
  if (process.platform === 'win32') p = p.toLowerCase();
  const key = createHash('sha256').update(p).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? '\\\\.\\pipe\\brain-factory-' + role + '-' + key : join(tmpdir(), 'brain-factory-' + role + '-' + key + '.sock');
}

/** ask the holder of (home, role): 'whois' or 'stop'. Resolves its answer (an object), or null when nobody holds the pipe. */
export function askPipe(home, role, command = 'whois', timeoutMs = 4000) {
  return new Promise((done) => {
    let settled = false, buf = '';
    const sock = net.connect(pipePath(home, role));
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(t); try { sock.destroy(); } catch { /* gone */ } done(v); };
    const t = setTimeout(() => finish(null), timeoutMs);
    sock.on('connect', () => sock.write(command + '\n'));
    sock.on('data', (d) => { buf += d; const i = buf.indexOf('\n'); if (i > -1) { try { finish(JSON.parse(buf.slice(0, i))); } catch { finish(null); } } });
    sock.on('error', () => finish(null));
    sock.on('close', () => finish(null));
  });
}

/**
 * Hold (home, role) for this process's lifetime -> { held: true, close } | { held: false, error }. `answer(command)` builds the reply
 * (an object); `onCommand(command)` is told every command after it was answered. The server does not keep the process alive.
 */
export function holdPipe(home, role, answer, onCommand = () => {}) {
  const path = pipePath(home, role);
  const server = net.createServer((sock) => {
    let buf = '';
    sock.on('error', () => { /* a client that went away */ });
    sock.on('data', (d) => {
      buf += d; const i = buf.indexOf('\n'); if (i < 0) return;
      const cmd = buf.slice(0, i).trim().slice(0, 32);
      let reply; try { reply = answer(cmd); } catch { reply = { error: 'answer_failed' }; }
      try { sock.end(JSON.stringify(reply || {}) + '\n'); } catch { /* gone */ }
      try { onCommand(cmd); } catch { /* the holder's own handler */ }
    });
  });
  const listen = () => new Promise((ok) => { server.once('error', (e) => ok(e)); server.listen(path, () => ok(null)); });
  return (async () => {
    let err = await listen();
    if (err && err.code === 'EADDRINUSE' && process.platform !== 'win32') {
      // a socket file left by a crashed holder answers nobody (Windows pipes vanish with their process; a socket file does not)
      if (!(await askPipe(home, role, 'whois', 1500))) { try { if (existsSync(path)) unlinkSync(path); } catch { /* raced */ } err = await listen(); }
    }
    if (err) return { held: false, error: err.code || String(err) };
    server.unref();
    let closed = false;
    return { held: true, path, close: () => new Promise((ok) => { if (closed) return ok(); closed = true; server.close(() => ok()); }) };
  })();
}

/**
 * The supervisor's instance: hold (home, 'supervisor'), or say who holds it. While the pipe is held but nobody answers on it (a
 * supervisor handing off closes its pipe just before its successor starts), the attempt is repeated for up to `waitMs`.
 */
export async function acquireSupervisor(home, answer, onCommand, { waitMs = 10000 } = {}) {
  const end = Date.now() + waitMs;
  for (;;) {
    const h = await holdPipe(home, 'supervisor', answer, onCommand);
    if (h.held) return h;
    const holder = await askPipe(home, 'supervisor', 'whois', 2000);
    if (holder) return { held: false, holder };
    if (Date.now() >= end) return { held: false, holder: null, error: h.error };
    await sleep(250);
  }
}

/**
 * Before a supervisor starts a worker: a worker that still holds (home, 'worker') - an orphan (one started outside a supervisor, or
 * one whose supervisor ended without it) - is ASKED to stop on its pipe (it stops claiming, gives back what it holds, and exits).
 * Nothing is ever ended by a process id: the pid in a "whois" answer is only what the pipe's holder says about itself, and nothing
 * here can prove which process serves the pipe, so a pipe holder that does not stop within `stopWaitMs` is left alone - this
 * resolves false, the caller starts no second worker and asks again after its backoff. Resolves true when the pipe is free.
 */
export async function retireStrayWorker(home, log = () => {}, { stopWaitMs = 30000 } = {}) {
  const w = await askPipe(home, 'worker', 'whois', 3000);
  if (!w) return true;
  log('a worker still runs for this home (pid ' + w.pid + ', answering on its pipe): asking it to stop before another starts');
  await askPipe(home, 'worker', 'stop', 3000);
  const until = Date.now() + stopWaitMs;
  while (Date.now() < until) { if (!(await askPipe(home, 'worker', 'whois', 2000))) return true; await sleep(500); }
  if (!(await askPipe(home, 'worker', 'whois', 2000))) return true;
  log('the holder of this home\'s worker pipe did not stop within ' + Math.round(stopWaitMs / 1000) + ' s: no process is ended by a pid it reports, and no second worker is started');
  return false;
}
