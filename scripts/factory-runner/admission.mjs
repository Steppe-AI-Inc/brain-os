// ADMISSION CONTROL (Factory V1 milestone 5). A node that is out of memory or saturated on CPU must not claim more work:
// a claim it cannot serve becomes a lease that expires and a work order that bounces between nodes. The measure is the
// MACHINE, read from the OS at the moment of the claim - not a number a human typed into a capability list.
//
//   FACTORY_MIN_FREE_MB   (default 1024)  refuse when free memory is below this
//   FACTORY_MAX_CPU_PCT   (default 90)    refuse when CPU busy over the sample window is above this
//   FACTORY_ADMISSION=off                 disable (stated, never silent: the refusal record says it was off)
//
// CPU busy is sampled over a short window from os.cpus() tick deltas (portable; loadavg is zero on Windows).
import os from 'node:os';

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

function cpuSnapshot() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k of Object.keys(c.times)) total += c.times[k]; idle += c.times.idle; }
  return { idle, total };
}

export async function admission({ minFreeMb = num(process.env.FACTORY_MIN_FREE_MB, 1024), maxCpuPct = num(process.env.FACTORY_MAX_CPU_PCT, 90), sampleMs = 300 } = {}) {
  if (String(process.env.FACTORY_ADMISSION || '').toLowerCase() === 'off') return { admit: true, reason: 'admission control is OFF by FACTORY_ADMISSION=off', freeMb: Math.round(os.freemem() / 1048576), cpuPct: null };
  const a = cpuSnapshot();
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = cpuSnapshot();
  const dTotal = b.total - a.total, dIdle = b.idle - a.idle;
  const cpuPct = dTotal > 0 ? Math.round(100 * (1 - dIdle / dTotal)) : 0;
  const freeMb = Math.round(os.freemem() / 1048576);
  if (freeMb < minFreeMb) return { admit: false, reason: 'free memory ' + freeMb + ' MB is below FACTORY_MIN_FREE_MB ' + minFreeMb, freeMb, cpuPct };
  if (cpuPct > maxCpuPct) return { admit: false, reason: 'CPU busy ' + cpuPct + '% is above FACTORY_MAX_CPU_PCT ' + maxCpuPct, freeMb, cpuPct };
  return { admit: true, reason: 'free ' + freeMb + ' MB, CPU ' + cpuPct + '%', freeMb, cpuPct };
}
