// THE PERSISTENT RUNTIME'S AUTOSTART (WO-4; contract §0 reconciliation): a per-user scheduled task, registered as the installing
// STANDARD user with no elevation - no Windows service:
//   * an AtLogOn trigger for this user: after a logoff or a reboot the runtime starts at the user's next logon, with no other step;
//   * a watchdog trigger repeating every 5 minutes: a dead supervisor is started again (the supervisor's instance lock makes an extra
//     start a no-op);
//   * Interactive logon, Limited run level; conhost --headless, so no console window; no execution time limit.
// The mechanism is the certified 69df2f52 installer's (install-autostart.ps1: Register-ScheduledTask, Interactive, Limited, a repeating
// watchdog trigger), called from the runtime. Every value reaches PowerShell through the ENVIRONMENT, never inside the script text.
// The task name never collides with the legacy node's task ('BrainOS Factory Node'): enrolled tasks are named 'BrainFactory <...>'.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const LEGACY_TASK = 'BrainOS Factory Node';
export const DEFAULT_TASK = 'BrainFactory Node';

function ps(script, env, timeout = 120000) {
  const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
    // -Command - executes stdin statement by statement; a trailing blank line ends the last (multi-line) one
    input: script + '\n\n', encoding: 'utf8', windowsHide: true, timeout, env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function refuseLegacy(name) {
  if (!/^BrainFactory[ -]/.test(name) || name.toLowerCase() === LEGACY_TASK.toLowerCase()) throw new Error('refused: an enrolled task is named "BrainFactory <...>", never the legacy node\'s task');
}

export function registerTasks({ name = DEFAULT_TASK, exe, home, watchdogMinutes = 5 }) {
  refuseLegacy(name);
  const args = '--headless "' + exe + '" supervise' + (home ? ' --home "' + home + '"' : '');
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name',
    '$conhost = Join-Path $env:SystemRoot "System32\\conhost.exe"',
    '$action = New-ScheduledTaskAction -Execute $conhost -Argument $env:BF_TASK_ARGS',
    '$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes ([int]$env:BF_WATCHDOG))',
    '$logon = New-ScheduledTaskTrigger -AtLogOn -User $me',
    '$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries',
    '$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited',
    'Register-ScheduledTask -TaskName $env:BF_TASK_NAME -Action $action -Trigger @($logon, $watchdog) -Settings $settings -Principal $principal -Description "Brain Factory enrolled node: the supervisor starts at logon; a watchdog restarts it" -Force | Out-Null',
    '"registered"',
  ].join('\n');
  const r = ps(script, { BF_TASK_NAME: name, BF_TASK_ARGS: args, BF_WATCHDOG: String(watchdogMinutes) });
  return r.code === 0 && /registered/.test(r.out) ? { ok: true, name } : { ok: false, name, error: (r.err || r.out).split(/\r?\n/)[0] };
}

export function startTask(name = DEFAULT_TASK) { refuseLegacy(name); return ps('Start-ScheduledTask -TaskName $env:BF_TASK_NAME; "started"', { BF_TASK_NAME: name }); }
export function unregisterTasks(name = DEFAULT_TASK) { refuseLegacy(name); return ps('Unregister-ScheduledTask -TaskName $env:BF_TASK_NAME -Confirm:$false; "removed"', { BF_TASK_NAME: name }); }

/** the task read back: triggers, logon type, run level, action - what a rehearsal transcript shows */
export function readTask(name = DEFAULT_TASK) {
  refuseLegacy(name);
  const r = ps([
    '$t = Get-ScheduledTask -TaskName $env:BF_TASK_NAME -ErrorAction SilentlyContinue',
    'if (-not $t) { "{}"; exit 0 }',
    '[pscustomobject]@{ name = $t.TaskName; state = [string]$t.State; logon = [string]$t.Principal.LogonType; runLevel = [string]$t.Principal.RunLevel;',
    '  user = $t.Principal.UserId; execute = $t.Actions[0].Execute; arguments = $t.Actions[0].Arguments;',
    '  triggers = @($t.Triggers | ForEach-Object { [pscustomobject]@{ kind = $_.CimClass.CimClassName; repeat = $_.Repetition.Interval } }) } | ConvertTo-Json -Depth 4 -Compress',
  ].join('\n'), { BF_TASK_NAME: name });
  try { return JSON.parse(r.out || '{}'); } catch { return {}; }
}
