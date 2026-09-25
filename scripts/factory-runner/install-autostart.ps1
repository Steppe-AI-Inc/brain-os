# REBOOT RECOVERY FOR A FACTORY NODE (Windows). Registers a Scheduled Task that starts the node supervisor at boot and at
# logon for this user, so a rebooted PC rejoins the shared control plane with no founder at the keyboard.
#
#   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Role verifier -Start   (install + start)
#   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Verify
#
# -Role      generic (Home PC) | verifier (Work PC) | release_broker. On a re-install without -Role the EXISTING task's role
#            is kept - a verifier is never silently re-registered as generic (verification 2026-09-24).
# -EnvFile   the runner env file (default %USERPROFILE%\.brain-factory\runner.env, or the existing task's); contents never printed
# -Start     with -Role (or no task yet), or with -WatchdogMinutes / -LogDir: install, then start. ALONE on an installed task of
#            this checkout: start that task as it is - no re-install, role and env file unchanged; a supervisor in backoff, or one
#            whose node the plane does not see ALIVE in the task's role, is restarted. Either way the start is CONFIRMED by the
#            node (the same worker up 12 s, the plane hearing it in the task's role) or the command fails (exit 5) naming why.
# -Stop      stop the supervisor cleanly (its worker with it) and the task, and DISABLE the task (the watchdog then leaves it)
# -Status    the task (and which checkout owns it), its role, the owner's supervisor state - marked STALE when the recorded
#            supervisor is not running - the dependency check, and the node's liveness read with the task's own env file
# -Preflight check only - the env file judged by runner-env.mjs (the same judge the supervisor uses) and the dependencies,
#            installed and loadable - and exit 0/1 without touching any task
# -Verify    exit 0 only if the task exists, is enabled, is RUNNING an identity-checked supervisor of this checkout, and its
#            own env file and the dependencies pass the preflight
# -Uninstall stop the owning checkout's supervisor, then remove the task
# -ReplaceOtherCheckout  act on a task that belongs to a DIFFERENT checkout (install, -Stop, -Uninstall are refused, exit 3,
#            otherwise). That checkout's own supervisor is asked to stop - its stop file, its pid file.
# -TaskName  the scheduled task's name (default 'BrainOS Factory Node'; the regression uses a scratch name, never the live task)
# -LogDir    the supervisor's log directory (default %USERPROFILE%\.brain-factory\logs; the regression's scratch task logs apart)
#
# Exit codes: 0 done; 1 check failed (-Preflight/-Verify); 2 install refused by the preflight; 3 the task belongs to another
# checkout; 4 a supervisor that had to stop did not stop within 20 s; 5 the task was started but no supervisor is running.
#
# WHO IS RUNNING is asked of the supervisor itself, over the control pipe each supervisor holds for its state dir - asked with
# THIS checkout's proc.mjs, never by running another checkout's scripts (round 4). A pid file is never trusted - after a reboot its number belongs to someone else - and a command
# line cannot prove identity either (a relative path, a junction, a non-ASCII folder; verification 2026-09-24, rounds 2-3).
# A supervisor from before the control pipe is still recognised the old way, by its pid file and command line, so a node can be
# migrated in place.
#
# Relative -EnvFile / -LogDir are resolved against the caller's directory before anything uses them (the task runs elsewhere).
#
# The task runs as this user (S4U when elevated: no stored password, no window; otherwise interactive logon), unlimited
# execution time, one instance at a time, and it may start on battery. It needs no elevation.
#
# A WATCHDOG, NOT "RESTART ON FAILURE". Task Scheduler's restart-on-failure never fires for an action that exits (with any code),
# and the headless console host reports 0x0 whatever the supervisor did - a supervisor that died for any reason left the node down
# until the next logon (verification 2026-09-24, round 3). So the task also has a time trigger that repeats every -WatchdogMinutes
# (default 5) indefinitely: while a supervisor runs the start is ignored (one instance), and a dead one is started again. -Stop
# DISABLES the task so the watchdog does not undo a deliberate stop; -Start enables it again.
param(
  [ValidateSet('generic', 'verifier', 'release_broker')] [string] $Role = 'generic',
  [string] $EnvFile = (Join-Path $env:USERPROFILE '.brain-factory\runner.env'),
  [switch] $Start, [switch] $Stop, [switch] $Status, [switch] $Preflight, [switch] $Verify, [switch] $Uninstall,
  [switch] $ReplaceOtherCheckout,
  [string] $TaskName = 'BrainOS Factory Node',
  [string] $LogDir = '',
  [ValidateRange(1, 60)] [int] $WatchdogMinutes = 5
)
$ErrorActionPreference = 'Stop'
$RoleGiven = $PSBoundParameters.ContainsKey('Role')
$EnvGiven = $PSBoundParameters.ContainsKey('EnvFile')
$LogGiven = $PSBoundParameters.ContainsKey('LogDir') -and $LogDir
# a relative path means the caller's directory - the task's supervisor runs in the checkout, where it would mean something else
function Get-FullPath($p) { if (-not $p) { return $p }; if (-not [IO.Path]::IsPathRooted($p)) { $p = Join-Path (Get-Location).Path $p }; return [IO.Path]::GetFullPath($p) }
$EnvFile = Get-FullPath $EnvFile
if ($LogDir) { $LogDir = Get-FullPath $LogDir }
# the task's supervisor uses <checkout>\.factory; every question asked here must be asked about that same state dir
Remove-Item Env:FACTORY_STATE_DIR -ErrorAction SilentlyContinue
# -LiteralPath everywhere a path is resolved or tested: '[' and ']' are legal in a Windows path and are wildcards to PowerShell
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Supervisor = Join-Path $Root 'scripts\factory-runner\node-supervisor.mjs'
$DepsCheck = Join-Path $Root 'scripts\factory-runner\deps.mjs'
$NodeExe = (Get-Command node -ErrorAction Stop).Source
# THE COMMIT THIS CHECKOUT IS AT. A worker keeps running the commit it started on after the checkout moves: -Verify and -Start compare
# the commit the node recorded (head:<sha>) with this, so "put that PC on the commit and restart its node" does what it says (final
# verification 2, 2026-09-25: -Start said "already running" and the node stayed on the old commit).
$CheckoutHead = $null; try { $CheckoutHead = ((& git -C $Root rev-parse HEAD 2>$null) | Select-Object -First 1) } catch { }
# ...clean or dirty too: a node that recorded 'dirty' beside a clean checkout at the same commit (or the reverse) passed -Verify, and the fix
# two_machine_real printed for it did nothing (final verification 3, 2026-09-25)
$CheckoutDirty = $false; try { $CheckoutDirty = [bool]((& git -C $Root status --porcelain --untracked-files=no 2>$null) | Select-Object -First 1) } catch { }
function Test-SameCommit($plane) { if (-not $plane -or -not $plane.head -or -not $CheckoutHead) { return $true }; return (($plane.head -eq $CheckoutHead) -and ([bool]$plane.dirty -eq $CheckoutDirty)) }
function Get-CommitText($head, $dirty) { return ([string]$head) + $(if ($dirty) { '+dirty' } else { '' }) }
# THE SUPERVISOR IS PART OF THE NODE: the commit it started on must be the checkout's too. After the checkout moved, a worker restarted by
# the old supervisor ran the new commit under the old supervisor's code; -Verify passed and -Start said "already running" (final
# verification 3, Work-PC probe). A supervisor that records no commit started before the check existed - it is older code.
function Test-SupervisorCommit($sv) { if (-not $sv -or -not $CheckoutHead) { return $true }; if (-not $sv.head) { return $false }; return (($sv.head -eq $CheckoutHead) -and ([bool]$sv.dirty -eq $CheckoutDirty)) }
function Get-SupervisorCommitText($sv) { if ($sv -and $sv.head) { return 'commit ' + (Get-CommitText $sv.head $sv.dirty) }; return 'code from before supervisors recorded their commit' }
$taskHint = if ($TaskName -ne 'BrainOS Factory Node') { " -TaskName '$TaskName'" } else { '' }

# ---- the task and its owner ------------------------------------------------------------------------------------------------
function Get-FactoryTask { return (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) }
function Get-TaskArg($t, $name) {
  if (-not $t) { return $null }
  $a = ($t.Actions | Select-Object -First 1).Arguments
  if ($name -eq 'role') { if ($a -match '--role (\w+)') { return $Matches[1] } return $null }
  if ($name -eq 'logdir') { if ($a -match '--log-dir "([^"]+)"') { return $Matches[1] } return $null }
  if ($a -match '--runner-env "([^"]+)"') { return $Matches[1] }
  if ($a -match '--env-file "([^"]+)"') { return $Matches[1] }
  return $null
}
$task = Get-FactoryTask
$owner = if ($task) { ($task.Actions | Select-Object -First 1).WorkingDirectory } else { $null }
# One physical checkout, whatever the spelling of its path (a junction, a subst drive, case): node's realpath on both sides.
function Test-SameDir($a, $b) {
  if (-not $a -or -not $b) { return $false }
  $r = & $NodeExe -e "const f=require('fs');const n=p=>{try{return f.realpathSync.native(p)}catch{return require('path').resolve(p)}};const x=n(process.argv[1]).toLowerCase().replace(/[\\/]+$/,''),y=n(process.argv[2]).toLowerCase().replace(/[\\/]+$/,'');process.stdout.write(x===y?'same':'other')" $a $b
  return ($r -eq 'same')
}
function Test-OtherCheckout($dir) { return [bool]($dir -and -not (Test-SameDir $dir $Root)) }
function Deny-OtherCheckout($what) {
  "REFUSED - the task '$TaskName' belongs to another checkout ($owner); this is $Root."
  "          Nothing was $what. Run this from that checkout, or pass -ReplaceOtherCheckout if this checkout should act on it."
  exit 3
}

# ---- the supervisor of a checkout, ASKED ------------------------------------------------------------------------------------
# Its own answer over the control pipe: pid, role, state, worker - or $null when none is running. ASKED WITH THIS CHECKOUT'S CODE
# (proc.mjs computes the same pipe name from the state dir): running another checkout's node-supervisor.mjs --whois executed that
# checkout's code, and a checkout from before the control pipe ignored --whois and STARTED a supervisor - a generic node on the
# owner's default env file, a verifier demoted on the plane, and the installer waiting forever (verification round 4).
$ProcModule = Join-Path $Root 'scripts\factory-runner\proc.mjs'
function Ask-Supervisor($dir, $command) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $j = $null
  try { $j = & $NodeExe -e "import(require('url').pathToFileURL(process.argv[1]).href).then(async m=>{const i=await m.askSupervisor(process.argv[2],process.argv[3]);process.stdout.write(JSON.stringify(i?Object.assign({running:true},i):{running:false}));process.exit(0)})" $ProcModule (Join-Path $dir '.factory') $command 2>$null } catch { $j = $null }
  $ErrorActionPreference = $prev
  if ($j) { try { return (($j | Select-Object -Last 1) | ConvertFrom-Json) } catch { } }
  return $null
}
function Get-SupervisorInfo($dir) {
  $o = Ask-Supervisor $dir 'whois'
  if ($o -and $o.running) { return $o }
  # a supervisor from before the control pipe answers no whois: recognised the old way (pid file + command line), for migration
  $pidFile = Join-Path $dir '.factory\node-supervisor.pid'
  if (Test-Path -LiteralPath $pidFile) {
    $p = 0; try { $p = [int]((Get-Content -LiteralPath $pidFile -Raw).Trim()) } catch { }
    if ($p) {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
      $want = (Join-Path $dir 'scripts\factory-runner\node-supervisor.mjs').Replace('/', '\').ToLower()
      if ($proc -and $proc.CommandLine -and $proc.CommandLine.Replace('/', '\').ToLower().Contains($want)) {
        $st = Read-SupervisorStatus $dir
        return [pscustomobject]@{ running = $true; pid = $p; role = $(if ($st) { $st.role } else { $null }); state = $(if ($st) { $st.state } else { 'running' }); childPid = $(if ($st) { $st.childPid } else { $null }); nextStartAt = $(if ($st) { $st.nextStartAt } else { $null }); legacy = $true }
      }
    }
  }
  return $null
}
function Get-SupervisorPid($dir) { $i = Get-SupervisorInfo $dir; if ($i) { return $i.pid }; return $null }
# Ask the supervisor of checkout $dir to stop and wait for it; $true when none is running afterwards. A pid file no supervisor
# answers for is stale: it is removed, and nothing is stopped or killed.
function Stop-CheckoutSupervisor($dir) {
  $pidFile = Join-Path $dir '.factory\node-supervisor.pid'
  $i = Get-SupervisorInfo $dir
  if (-not $i) {
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; "note: removed a stale pid file under $dir (no supervisor answers for it)" }
    return $true
  }
  # the control pipe (this checkout's code), and the stop file a pre-pipe supervisor watches - nothing of that checkout is run
  $null = Ask-Supervisor $dir 'stop'
  try { [IO.Directory]::CreateDirectory((Join-Path $dir '.factory')) | Out-Null; [IO.File]::WriteAllText((Join-Path $dir '.factory\node.stop'), [string][DateTimeOffset]::Now.ToUnixTimeMilliseconds()) } catch { }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) { if (-not (Get-Process -Id $i.pid -ErrorAction SilentlyContinue)) { return $true }; Start-Sleep -Milliseconds 500 }
  return (-not (Get-Process -Id $i.pid -ErrorAction SilentlyContinue))
}
function Read-SupervisorStatus($dir) { $f = Join-Path $dir '.factory\node-status.json'; if (Test-Path -LiteralPath $f) { try { return (Get-Content -LiteralPath $f -Raw | ConvertFrom-Json) } catch { } }; return $null }
# After Start-ScheduledTask: the task's supervisor must be running (identity-checked) with its worker, not merely "task Running"
# The log of the supervisor being described: its own log dir when it said one (whois), else the task's, else the default.
function Get-TaskLogFile($ld) { if (-not $ld) { $ld = Get-TaskArg (Get-FactoryTask) 'logdir' }; if (-not $ld) { $ld = "$env:USERPROFILE\.brain-factory\logs" }; return (Join-Path $ld ("node-" + (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd') + ".log")) }
# The last error the worker logged (a connection, a password, a certificate) - what a supervisor in backoff is failing on.
function Get-LastWorkerError($ld) {
  $f = Get-TaskLogFile $ld
  if (-not (Test-Path -LiteralPath $f)) { return 'no log at ' + $f }
  $tail = Get-Content -LiteralPath $f -Tail 120
  # the worker's own one-line verdict first ('error: ...' / REFUSED), then anything naming a failure - never a field of pg's
  # error-object dump ("routine: 'auth_failed'" was quoted as the cause; verification round 4)
  $l = $tail | Where-Object { $_ -match '^(error: |REFUSED)' -or $_ -match '\] (error: |REFUSED)' } | Select-Object -Last 1
  if (-not $l) { $l = $tail | Where-Object { $_ -notmatch '^\s+(at |[a-zA-Z]+: )' -and $_ -match 'Error|REFUSED|FAIL|ECONN|ETIMEDOUT|ENOTFOUND|password|certificate|refused' } | Select-Object -Last 1 }
  if ($l) { return ([string]$l).Trim().Substring(0, [Math]::Min(220, ([string]$l).Trim().Length)) } else { return 'nothing logged that names it (' + $f + ')' }
}
# The CURRENT worker's latest admission verdict in its log, when it is a refusal. Only the lines since the supervisor started that worker
# count, and a later 'admission: claiming' ends a refusal: the pattern missed 'admission: claiming' (no space before the colon), and an
# earlier worker's refusal was quoted for a worker that could not reach the plane (final verification 4, adversarial probe).
function Get-AdmissionRefusal($ld, $childPid) {
  $f = Get-TaskLogFile $ld
  if (-not $childPid -or -not (Test-Path -LiteralPath $f)) { return $null }
  $tail = @(Get-Content -LiteralPath $f -Tail 400)
  $from = -1; for ($i = $tail.Count - 1; $i -ge 0; $i--) { if ($tail[$i] -match ('node started \(pid ' + $childPid + '\)')) { $from = $i; break } }
  $mine = if ($from -ge 0) { $tail[$from..($tail.Count - 1)] } else { @() }
  $l = $mine | Where-Object { $_ -match 'admission( REFUSED|: claiming)' } | Select-Object -Last 1
  if ($l -and ($l -match 'admission REFUSED')) { return ([string]$l).Trim() }
  return $null
}
# The plane's view of this checkout's node, read with the task's own env file. Returns the status object, or $null.
function Get-NodeOnPlane($dir) {
  $envPath = Get-TaskArg (Get-FactoryTask) 'env'; if (-not $envPath) { $envPath = $EnvFile }
  if (-not (Test-Path -LiteralPath $envPath)) { return $null }
  # ONE PROBE IS NOT A VERDICT: a single reset on a flaky path read UNREACHABLE, and -Start restarted a healthy, busy node - abandoning its
  # run (final verification 3, Work-PC probe). A probe that gets no answer from the plane is asked again: three times in all, 3 s apart.
  $v = $null
  for ($try = 1; $try -le 3; $try++) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    Remove-Item Env:FACTORY_RUNNER_PG_URL -ErrorAction SilentlyContinue
    $out = & $NodeExe (Join-Path $dir 'scripts\factory-runner\node.mjs') status --json --runner-env $envPath 2>$null
    $ErrorActionPreference = $prev
    $j = $out | Where-Object { "$_" -like '{*' } | Select-Object -Last 1
    $v = $null; if ($j) { try { $v = ($j | ConvertFrom-Json) } catch { } }
    if ($v -and $v.state -ne 'UNREACHABLE') { return $v }
    if ($try -lt 3) { Start-Sleep -Seconds 3 }
  }
  return $v
}
# THE PLANE MUST HAVE HEARD FROM THE CURRENT WORKER. A worker that registers and then fails every claim is restarted every few
# seconds; each sample of "running" found a fresh worker, and the plane's ALIVE was the previous worker's (final verification
# 2026-09-24). The node reads ALIVE only after a completed claim cycle, and that stamp must be younger than the worker now running
# (a duration on each side, so a clock difference does not matter). $null: nothing to judge (a supervisor from before the pipe).
function Test-HeardSinceStart($sv, $plane) {
  if (-not $sv -or -not $sv.childStartedAt -or -not $plane -or $plane.ageMs -eq $null) { return $null }
  $upFor = ((Get-Date) - [datetime]$sv.childStartedAt).TotalSeconds
  return ((([double]$plane.ageMs) / 1000) -le ($upFor + 5))
}
# THE START IS CONFIRMED BY THE NODE, NOT BY A SAMPLE. The task's exit code says nothing (a headless console host returns 0
# whatever happened), and one 2-second sample of "state running" read a worker that died a second later as started, and a
# supervisor briefly in backoff as not running (verification 2026-09-24, round 3). Now: the same worker must stay up for 12 s AND
# the plane must have heard from it since it started (its heartbeat is younger than the worker - a duration on each side, so a
# clock difference does not matter). Otherwise the verdict names what failed: a refusal the supervisor recorded, or the error
# its worker keeps failing on.
function Confirm-TaskSupervisor($dir, $since) {
  $deadline = (Get-Date).AddSeconds(75)
  $fresh = { param($st) $st -and $st.stoppedAt -and ([datetime]$st.stoppedAt -ge $since.AddSeconds(-1)) }
  $first = $null; $backoffs = 0; $last = $null; $plane = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $i = Get-SupervisorInfo $dir
    if ($i) {
      $last = $i
      if ($i.state -eq 'running' -and $i.childPid) {
        if (-not $first -or $first.pid -ne $i.childPid) { $first = @{ pid = $i.childPid; at = Get-Date } }
        $upFor = ((Get-Date) - $first.at).TotalSeconds
        if ($upFor -ge 12) {
          $plane = Get-NodeOnPlane $dir
          # THE WORKER NOW RUNNING must have completed a claim cycle (readyAt, set for this worker only) and the plane must have heard from
          # it since it started: a beat older than the worker (its predecessor's) confirmed a worker admission kept refusing (final
          # verification 3, 2026-09-25)
          $sinceChild = if ($i.childStartedAt) { ((Get-Date) - [datetime]$i.childStartedAt).TotalSeconds } else { $upFor }
          if ($i.readyAt -and $plane -and $plane.state -eq 'ALIVE' -and $plane.ageMs -ne $null -and ([double]$plane.ageMs / 1000) -le ($sinceChild + 2) -and $plane.role -eq $i.role) {
            return "started: supervisor pid $($i.pid), worker pid $($i.childPid), role $($i.role); the node is ALIVE on the plane (heartbeat $([Math]::Round([double]$plane.ageMs / 1000)) s ago, role $($plane.role), tls $(if ($plane.tls -eq $true) { 'on' } elseif ($plane.tls -eq $false) { 'off' } else { 'not read' }))"
          }
        }
      } elseif ($i.state -eq 'backoff') { $first = $null; $backoffs++; if ($backoffs -ge 4) { break } }
    } else {
      $st = Read-SupervisorStatus $dir
      if ((& $fresh $st) -and ($st.state -in @('refused', 'dependencies_missing'))) { break }
    }
  }
  $st = Read-SupervisorStatus $dir
  $why = if ((& $fresh $st) -and $st.refusal) { 'the supervisor refused - ' + $st.refusal }
    elseif ((& $fresh $st) -and $st.dependencies -and $st.state -eq 'dependencies_missing') { 'the supervisor refused - ' + $st.dependencies }
    elseif ($last -and $last.state -eq 'backoff') { 'the supervisor (pid ' + $last.pid + ') runs, but its worker cannot run - ' + (Get-LastWorkerError $last.logDir) }
    elseif ($last -and $last.state -eq 'running' -and -not $last.readyAt -and (Get-AdmissionRefusal $last.logDir $last.childPid)) { 'its worker runs but admission refuses its claims (' + (Get-AdmissionRefusal $last.logDir $last.childPid) + ') - it starts claiming when the load allows; -Status shows NOT CLAIMING until then' }
    elseif ($last -and $plane -and $plane.state -eq 'ALIVE' -and $plane.role -ne $last.role) { 'the worker runs as ' + $last.role + ', but the plane holds role ' + $plane.role + ' for this node' }
    elseif ($last -and $plane) { 'the worker runs, but the plane has not heard from it since it started: ' + $plane.state + $(if ($plane.error) { ' - ' + $plane.error } else { '' }) }
    elseif ($last) { 'the supervisor (pid ' + $last.pid + ') runs, but its worker did not stay up - ' + (Get-LastWorkerError $last.logDir) }
    else { 'no supervisor answered and it recorded no reason' }
  "FAIL the task was started but the node is not running: $why"
  "     the supervisor's log: $(Get-TaskLogFile $(if ($last) { $last.logDir } else { $null }))"
  exit 5
}

# ---- the preflight: the SAME judge the supervisor uses (runner-env.mjs), and dependencies installed AND loadable ----------------
function Test-NodePreflight($envPath) {
  $ok = $true
  if (-not (Test-Path -LiteralPath $envPath)) { "FAIL env file not found: $envPath (provision-control-plane.mjs --write-env writes it; copy it to this path)"; $ok = $false }
  else {
    # the module goes to node as a PATH and node builds the URL (pathToFileURL): 'file:///' + path made a '#' a URL fragment
    $mod = Join-Path $Root 'scripts\factory-runner\runner-env.mjs'
    $note = & $NodeExe -e "import(require('url').pathToFileURL(process.argv[1]).href).then(m=>{const r=m.loadRunnerUrl(process.argv[2]);console.log((r.usable?'ok   env file '+process.argv[2]+' yields a usable runner URL':'FAIL env file '+process.argv[2]+' cannot be used')+' (not printed; '+r.note+')');process.exit(r.usable?0:1)})" $mod $envPath
    $note; if ($LASTEXITCODE -ne 0) { $ok = $false }
  }
  # ok only on exit 0 AND the check's own words - a check that printed nothing proved nothing
  $deps = & $NodeExe $DepsCheck
  if (($LASTEXITCODE -eq 0) -and ("$deps" -like 'runtime dependencies installed at their locked versions*')) { "ok   $deps" } else { "FAIL $(if ("$deps") { $deps } else { 'the dependency check printed nothing (exit ' + $LASTEXITCODE + ')' })"; $ok = $false }
  return $ok
}

if ($Preflight) {
  $lines = Test-NodePreflight $EnvFile
  $lines | Where-Object { $_ -is [string] }
  if ($lines[-1] -eq $true) { "PREFLIGHT OK for $Root"; exit 0 } else { "PREFLIGHT FAILED for $Root - nothing was installed or changed"; exit 1 }
}

if ($Stop) {
  if ((Test-OtherCheckout $owner) -and -not $ReplaceOtherCheckout) { Deny-OtherCheckout 'stopped' }
  $dir = if ($owner) { $owner } else { $Root }
  # DISABLED FIRST, or the watchdog trigger can start a new supervisor between the old one ending and the disable - -Stop reported the node
  # stopped while a new one ran (final verification 3, 2026-09-25)
  $t = Get-FactoryTask
  if ($t) { Disable-ScheduledTask -TaskName $TaskName | Out-Null; "task '$TaskName' disabled - the watchdog will not restart it; -Start enables and starts it again" }
  $stopped = Stop-CheckoutSupervisor $dir
  $stopped | Where-Object { $_ -is [string] }
  $t = Get-FactoryTask
  if ($t -and $t.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName; "task '$TaskName' stopped" }
  # ...and checked: no supervisor may answer for this checkout afterwards
  $still = Get-SupervisorInfo $dir
  if ($still) { "FAIL a supervisor of $dir still runs (pid $($still.pid)) after -Stop"; exit 4 }
  if ($stopped[-1] -eq $true) { "supervisor of $dir stopped (or was not running)"; exit 0 }
  "FAIL the supervisor of $dir did not stop within 20 s"; exit 4
}

if ($Status) {
  # native commands here must not abort -Status when node writes to stderr (a driver warning is not a status failure)
  $ErrorActionPreference = 'Continue'
  $dir = if ($owner) { $owner } else { $Root }
  if ($task) {
    "task      $TaskName  state $($task.State)  role $(Get-TaskArg $task 'role')"
    if (Test-OtherCheckout $owner) { "owner     ANOTHER checkout: $owner (this is $Root) - the state below is that checkout's" }
  } else { "task      $TaskName  NOT INSTALLED" }
  "supervisor"
  $st = Read-SupervisorStatus $dir
  $live = Get-SupervisorInfo $dir
  if ($st) { ($st | ConvertTo-Json -Depth 4) } else { "no status file ($(Join-Path $dir '.factory\node-status.json'))" }
  if ($live) { "running   supervisor pid $($live.pid), state $($live.state), worker $($live.childPid), role $($live.role)$(if ($task -and $task.State -ne 'Running') { ' - NOT the task''s (the task is ' + $task.State + '); install-autostart.ps1 -Start' + $taskHint + ' hands it to the task' } else { '' })" }
  elseif ($st -and ($st.state -in @('starting', 'running', 'backoff'))) { "STALE     the recorded supervisor (pid $($st.supervisorPid)) is not running - the node is DOWN; install-autostart.ps1 -Start$taskHint" }
  if (Test-OtherCheckout $owner) { "deps      (the task belongs to $owner - its dependencies are checked by -Status there; nothing of that checkout is run from here)" }
  else { "deps      " + (& $NodeExe $DepsCheck 2>&1 | Out-String).Trim() }
  $envPath = if ($EnvGiven) { $EnvFile } elseif (Get-TaskArg $task 'env') { Get-TaskArg $task 'env' } else { $EnvFile }
  # ANOTHER checkout's task: its credential and its plane are that checkout's business - this -Status does not read the owner's
  # env file or query its plane (a scratch clone's regression did both on the live node; verification 2026-09-24, round 3)
  if ((Test-OtherCheckout $owner) -and -not $EnvGiven) { "node      (the task belongs to $owner - run -Status there to read the node's liveness)" }
  elseif (Test-Path -LiteralPath $envPath) {
    # the node line through the task's own env file - not a URL this shell happens to carry; never printed
    Remove-Item Env:FACTORY_RUNNER_PG_URL -ErrorAction SilentlyContinue
    # THIS checkout's node.mjs, pointed at the owner's state dir: another checkout's code is never run from here (it ran the
    # owner's node.mjs when -EnvFile was given - final verification 2026-09-24)
    $env:FACTORY_STATE_DIR = Join-Path $dir '.factory'
    $nodeLine = & $NodeExe (Join-Path $Root 'scripts\factory-runner\node.mjs') status --runner-env $envPath 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 1
    Remove-Item Env:FACTORY_STATE_DIR -ErrorAction SilentlyContinue
    # the plane's heartbeat lags a dead node by minutes; with no supervisor answering here the node is DOWN, whatever it says - and
    # with a supervisor waiting out a backoff (no worker) it is NOT RUNNING, whatever it says (it read ALIVE; verification round 4)
    if (-not $live) { "node      DOWN here (no supervisor is running) - the plane's last word: $nodeLine" }
    elseif ($live.state -ne 'running' -or -not $live.childPid) { "node      NOT RUNNING here (supervisor $($live.state)$(if ($live.nextStartAt) { ', next start ' + $live.nextStartAt } else { '' }); last worker error: $(Get-LastWorkerError $live.logDir)) - the plane's last word: $nodeLine" }
    # ...and a worker that has not completed a claim cycle is not the one the plane's ALIVE is about: -Status said ALIVE for crash-looping
    # workers, from their predecessor's heartbeat (final verification 3, Work-PC probe)
    elseif (-not $live.legacy -and -not $live.readyAt) { "node      NOT CONFIRMED here (the worker now running, pid $($live.childPid)$(if ($live.childStartedAt) { ', up ' + [Math]::Round(((Get-Date) - [datetime]$live.childStartedAt).TotalSeconds) + ' s' } else { '' }), has not completed a claim cycle - still starting, or a worker that keeps restarting) - the plane's last word, about an earlier worker: $nodeLine" }
    else { "node      $nodeLine" }
    if (-not (Test-OtherCheckout $owner) -and $live -and -not (Test-SupervisorCommit $live)) { "commit    the supervisor runs $(Get-SupervisorCommitText $live) but this checkout is at $(Get-CommitText $CheckoutHead $CheckoutDirty) - install-autostart.ps1 -Start$taskHint restarts it on the checkout's commit" }
    # the commit the node runs, against this checkout (it read ALIVE for a node -Verify failed on a moved checkout - final verification 3)
    if (-not (Test-OtherCheckout $owner) -and $CheckoutHead -and ($nodeLine -match 'commit ([0-9a-f]{12})(\+dirty)?')) {
      if (($Matches[1] -ne $CheckoutHead.Substring(0, 12)) -or ([bool]$Matches[2] -ne $CheckoutDirty)) { "commit    the node runs $($Matches[1])$($Matches[2]) but this checkout is at $($CheckoutHead.Substring(0, 12))$(if ($CheckoutDirty) { '+dirty' } else { '' }) - install-autostart.ps1 -Start$taskHint restarts it on the checkout's commit" }
    }
  } else { "node      (no env file at $envPath - liveness not read)" }
  exit 0
}

if ($Uninstall) {
  if ((Test-OtherCheckout $owner) -and -not $ReplaceOtherCheckout) { Deny-OtherCheckout 'stopped or removed' }
  $dir = if ($owner) { $owner } else { $Root }
  $stopped = Stop-CheckoutSupervisor $dir
  $stopped | Where-Object { $_ -is [string] }
  if ($stopped[-1] -ne $true) { "REFUSED - the supervisor of $dir is still running 20 s after the stop request; the task was not removed"; exit 4 }
  $t = Get-FactoryTask
  if ($t) { if ($t.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }; Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; "task '$TaskName' removed" } else { "task '$TaskName' was not installed" }
  exit 0
}

if ($Verify) {
  if (-not $task) { "FAIL task '$TaskName' is not installed"; exit 1 }
  $action = $task.Actions | Select-Object -First 1
  $viaConhost = ($action.Execute -like '*\conhost.exe') -and ($action.Arguments -like "*--headless*") -and ($action.Arguments -like "*$NodeExe*")
  $okAction = (($action.Execute -eq $NodeExe) -or $viaConhost) -and ($action.Arguments -like "*node-supervisor.mjs*") -and (Test-SameDir $action.WorkingDirectory $Root)
  $enabled = $task.Settings.Enabled -and ($task.State -ne 'Disabled')
  $triggers = ($task.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ','
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  $sv = Get-SupervisorInfo $Root
  $supPid = if ($sv) { $sv.pid } else { $null }
  $st = Read-SupervisorStatus $Root
  $running = ($task.State -eq 'Running') -and $sv -and ($sv.state -eq 'running') -and ($sv.role -eq (Get-TaskArg $task 'role'))
  "task      $TaskName"
  "state     $($task.State)  enabled=$enabled  role $(Get-TaskArg $task 'role')"
  "triggers  $triggers"
  "action    $($action.Execute) $($action.Arguments)"
  "workdir   $($action.WorkingDirectory)"
  "last run  $($info.LastRunTime)  result 0x$('{0:X}' -f $info.LastTaskResult)"
  "running   supervisor $(if ($sv) { 'pid ' + $sv.pid + ', state ' + $sv.state + ', worker ' + $sv.childPid + ', role ' + $sv.role } else { 'NOT RUNNING' })$(if ($st) { ', restarts ' + $st.restarts } else { '' })"
  # the env file the TASK uses (its --runner-env / --env-file argument), not this invocation's default
  $envPath = if (Get-TaskArg $task 'env') { Get-TaskArg $task 'env' } else { $EnvFile }
  if (Test-Path -LiteralPath $envPath) { $acl = (Get-Acl -LiteralPath $envPath).Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights)" }; "env ACL   $($acl -join '; ')" }
  $pre = Test-NodePreflight $envPath
  $pre | Where-Object { $_ -is [string] } | ForEach-Object { "preflight $_" }
  $preOk = ($pre[-1] -eq $true)
  $watchdog = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskTimeTrigger' -and $_.Repetition.Interval }).Count -gt 0
  $plane = if ($running) { Get-NodeOnPlane $Root } else { $null }
  "watchdog  $(if ($watchdog) { 'a repeating trigger restarts a dead supervisor' } else { 'NONE - a supervisor that dies stays dead until the next logon' })"
  if ($plane) { "plane     $($plane.state)$(if ($plane.neverBeaten) { ' (never beaten: no worker has completed a claim cycle)' } elseif ($plane.ageMs -ne $null) { ' (heartbeat ' + [Math]::Round([double]$plane.ageMs / 1000) + ' s ago)' } else { '' }), role $($plane.role)$(if ($plane.error) { ' - ' + $plane.error } else { '' })" }
  # not claiming for a reason the node records (this PC's load, another claimer holding the claim lock): said, not failed - both pass
  if ($plane -and $plane.admission -and $plane.admission.admit -eq $false) { "claiming  NOT CLAIMING: admission refused since $($plane.admission.at) ($($plane.admission.reason))" }
  if ($plane -and $plane.claimBusySince) { "claiming  NOT CLAIMING: the plane-wide claim lock has been busy since $($plane.claimBusySince)" }
  $heard = Test-HeardSinceStart $sv $plane
  $problem = if (-not $enabled) { 'the task is disabled (-Stop disables it; install-autostart.ps1 -Start' + $taskHint + ' enables and starts it)' }
    elseif (-not $okAction) { 'the task action is not this checkout''s supervisor' }
    elseif (-not $watchdog) { 'the task has no watchdog trigger - re-install it (install-autostart.ps1 -Role <role> -Start' + $taskHint + ')' }
    elseif (-not $preOk) { 'the preflight failed (the line marked FAIL above names the fix)' }
    elseif ($task.State -ne 'Running') { 'the task is not running - install-autostart.ps1 -Start' + $taskHint }
    elseif (-not $sv) { 'the task runs but no supervisor of this checkout answers - install-autostart.ps1 -Start' + $taskHint }
    elseif ($sv.role -ne (Get-TaskArg $task 'role')) { 'the running supervisor has role ' + $sv.role + ', the task says ' + (Get-TaskArg $task 'role') + ' - install-autostart.ps1 -Start' + $taskHint }
    elseif ($sv.state -eq 'backoff') { 'the supervisor runs, but no worker does (backoff' + $(if ($sv.nextStartAt) { ' until ' + $sv.nextStartAt } else { '' }) + ') - last worker error: ' + (Get-LastWorkerError $sv.logDir) + ' - install-autostart.ps1 -Start' + $taskHint + ' restarts it now' }
    elseif ($sv.state -ne 'running') { 'the supervisor is ' + $sv.state }
    elseif (-not (Test-SupervisorCommit $sv)) { 'the supervisor runs ' + (Get-SupervisorCommitText $sv) + ' but this checkout is at ' + (Get-CommitText $CheckoutHead $CheckoutDirty) + ' - install-autostart.ps1 -Start' + $taskHint + ' restarts it on the checkout''s commit' }
    # the plane's ALIVE is about a worker that completed a claim cycle - not one still starting, or one that keeps restarting
    elseif (-not $sv.legacy -and -not $sv.readyAt) { 'the worker now running (pid ' + $sv.childPid + $(if ($sv.childStartedAt) { ', up ' + [Math]::Round(((Get-Date) - [datetime]$sv.childStartedAt).TotalSeconds) + ' s' } else { '' }) + ') has not completed a claim cycle - still starting, or a worker that keeps restarting (-Status shows the supervisor''s restarts)' }
    elseif (-not $plane -or $plane.state -ne 'ALIVE') { 'the worker runs, but the plane does not see the node ALIVE' + $(if ($plane) { ': ' + $plane.state + $(if ($plane.error) { ' - ' + $plane.error } else { '' }) } else { '' }) }
    elseif ($heard -eq $false) { 'the plane has not heard from the worker now running since it started (worker pid ' + $sv.childPid + ' up ' + [Math]::Round(((Get-Date) - [datetime]$sv.childStartedAt).TotalSeconds) + ' s, last heartbeat ' + [Math]::Round([double]$plane.ageMs / 1000) + ' s ago) - a worker that keeps restarting; last worker error: ' + (Get-LastWorkerError $sv.logDir) }
    # THE ROLE THAT DECIDES WHAT THE NODE CLAIMS IS THE PLANE'S: a verifier the plane held as generic claimed no verifier work while
    # this said OK (a health check from a plain shell had re-registered it; verification round 4). The worker re-asserts its role
    # on every beat, so a mismatch that lasts is a fault.
    elseif (-not $plane.head) { 'the plane''s record of this node carries no commit (overwritten by a script that registered this node id?) - its worker restores it within a beat; if this stays: install-autostart.ps1 -Stop' + $taskHint + ', then -Start' + $taskHint }
    elseif (-not (Test-SameCommit $plane)) { 'the node runs commit ' + (Get-CommitText $plane.head $plane.dirty) + ' but this checkout is at ' + (Get-CommitText $CheckoutHead $CheckoutDirty) + ' - install-autostart.ps1 -Start' + $taskHint + ' restarts it on the checkout''s commit' }
    elseif ($plane.role -ne (Get-TaskArg $task 'role')) { 'the plane holds role ' + $plane.role + ' for this node, the task says ' + (Get-TaskArg $task 'role') + ' - the worker re-asserts its role within a minute; if this stays, install-autostart.ps1 -Start' + $taskHint }
    else { $null }
  if (-not $problem) { "OK   the task is enabled, watched, and running this checkout's supervisor (pid $supPid) whose worker the plane sees ALIVE; its env file, CA and dependencies pass the preflight"; exit 0 }
  "FAIL $problem"; exit 1
}

# ---- -Start ALONE on an installed task of this checkout: start it as it is (role and env file unchanged) ---------------------
# -WatchdogMinutes or -LogDir with -Start is a change to the task: it re-installs (keeping role and env file), instead of being
# silently ignored by "already running" (verification round 4).
$ChangeGiven = $PSBoundParameters.ContainsKey('WatchdogMinutes') -or $LogGiven
if ($Start -and -not $RoleGiven -and -not $EnvGiven -and -not $ChangeGiven -and $task -and -not (Test-OtherCheckout $owner)) {
  $want = Get-TaskArg $task 'role'
  $envPath = Get-TaskArg $task 'env'; if (-not $envPath) { $envPath = $EnvFile }
  $pre = Test-NodePreflight $envPath
  $pre | Where-Object { $_ -is [string] }
  if ($pre[-1] -ne $true) { "REFUSED - the preflight failed; the task was not started"; exit 2 }
  if (-not $task.Settings.Enabled) { Enable-ScheduledTask -TaskName $TaskName | Out-Null; "task '$TaskName' enabled again (its watchdog restarts a dead supervisor)" }
  $sv = Get-SupervisorInfo $Root
  if ($sv -and $task.State -eq 'Running' -and $sv.role -eq $want) {
    if ($sv.state -eq 'backoff') {
      # restarted, not just reported: after the env file was fixed or the credential rotated, reporting left the node down until
      # a re-install (verification round 4). The new supervisor reads the env file again and the start is confirmed.
      "the supervisor (pid $($sv.pid), role $($sv.role)) is running but its worker cannot run - $(Get-LastWorkerError $sv.logDir) - restarting it"
      $s3 = Stop-CheckoutSupervisor $Root; $s3 | Where-Object { $_ -is [string] }
      if ($s3[-1] -ne $true) { "REFUSED - that supervisor is still running 20 s after the stop request"; exit 4 }
      if ((Get-FactoryTask).State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
      $since = Get-Date
      Start-ScheduledTask -TaskName $TaskName
      Confirm-TaskSupervisor $Root $since
      exit 0
    }
    # one sample of 'running' is not a working node: a worker hanging on its connect reads 'running' for its whole timeout
    # (verification round 4). The plane must see the node ALIVE; otherwise it is restarted and the start confirmed.
    $plane = Get-NodeOnPlane $Root
    # A PLANE THIS PC CANNOT REACH IS NO VERDICT on a worker that has completed its claim cycles: restarting it abandoned its run (final
    # verification 3, Work-PC probe). It is left alone, and said - unless the supervisor runs another commit than the checkout.
    if ((-not $plane -or $plane.state -eq 'UNREACHABLE') -and $sv.readyAt -and (Test-SupervisorCommit $sv)) { "cannot judge: the plane did not answer this PC's status probe (three tries$(if ($plane -and $plane.error) { ' - ' + $plane.error } else { '' })) - the running node (supervisor pid $($sv.pid), worker $($sv.childPid), claiming since $($sv.readyAt)) was left alone; run -Start$taskHint again when the plane answers"; exit 5 }
    if ($plane -and $plane.state -eq 'ALIVE' -and $plane.role -eq $want -and ((Test-HeardSinceStart $sv $plane) -ne $false) -and (Test-SameCommit $plane) -and (Test-SupervisorCommit $sv)) { "already running: supervisor pid $($sv.pid) (task '$TaskName', role $($sv.role), state $($sv.state); the plane sees the node ALIVE as $($plane.role); nothing re-installed)"; exit 0 }
    if (-not (Test-SupervisorCommit $sv)) { "the supervisor (pid $($sv.pid)) runs $(Get-SupervisorCommitText $sv) but this checkout is at $(Get-CommitText $CheckoutHead $CheckoutDirty) - restarting it" }
    else { "the supervisor (pid $($sv.pid)) runs, but the plane does not see its current worker ALIVE as $want ($(if ($plane) { $plane.state + ', role ' + $plane.role + $(if ((Test-HeardSinceStart $sv $plane) -eq $false) { ', not heard from the worker now running' } else { '' }) + $(if (-not (Test-SameCommit $plane)) { ', running commit ' + (Get-CommitText $plane.head $plane.dirty) + ' while this checkout is at ' + (Get-CommitText $CheckoutHead $CheckoutDirty) } else { '' }) + $(if ($plane.error) { ' - ' + $plane.error } else { '' }) } else { 'no answer' })) - restarting it" }
    $s4 = Stop-CheckoutSupervisor $Root; $s4 | Where-Object { $_ -is [string] }
    if ($s4[-1] -ne $true) { "REFUSED - that supervisor is still running 20 s after the stop request"; exit 4 }
    if ((Get-FactoryTask).State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
    $since = Get-Date
    Start-ScheduledTask -TaskName $TaskName
    Confirm-TaskSupervisor $Root $since
    exit 0
  }
  # a supervisor that is not the task's own - started by hand, or with another role - would hold the checkout while the task
  # does not run; it is stopped so the task's supervisor takes over (verification round 3: -Start used to report it as running)
  if ($sv) {
    "a supervisor of this checkout runs $(if ($task.State -ne 'Running') { 'outside the task' } else { 'with role ' + $sv.role + ', not the task''s ' + $want }) (pid $($sv.pid)) - stopping it so the task's own supervisor takes over"
    $s2 = Stop-CheckoutSupervisor $Root; $s2 | Where-Object { $_ -is [string] }
    if ($s2[-1] -ne $true) { "REFUSED - that supervisor is still running 20 s after the stop request"; exit 4 }
  }
  if ((Get-FactoryTask).State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  $since = Get-Date
  Start-ScheduledTask -TaskName $TaskName
  "task '$TaskName' started as installed (role $want; nothing re-installed)"
  Confirm-TaskSupervisor $Root $since
  exit 0
}

# ---- install: preflight first, and nothing is touched unless it passes -------------------------------------------------------
# On a re-install without -Role / -EnvFile the existing task's own values are kept.
if (-not $RoleGiven -and (Get-TaskArg $task 'role')) { $Role = Get-TaskArg $task 'role'; "role      $Role (kept from the installed task; pass -Role to change it)" }
if (-not $EnvGiven -and (Get-TaskArg $task 'env')) { $EnvFile = Get-TaskArg $task 'env' }
if (-not $LogGiven -and (Get-TaskArg $task 'logdir')) { $LogDir = Get-TaskArg $task 'logdir' }
# the watchdog interval too (a re-install reset a 1-minute watchdog to 5; verification round 4)
if (-not $PSBoundParameters.ContainsKey('WatchdogMinutes') -and $task) {
  $iv = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskTimeTrigger' -and $_.Repetition.Interval } | ForEach-Object { $_.Repetition.Interval }) | Select-Object -First 1
  if ($iv) { try { $m = [int][Math]::Round([System.Xml.XmlConvert]::ToTimeSpan($iv).TotalMinutes); if ($m -ge 1 -and $m -le 60) { $WatchdogMinutes = $m; "watchdog  every $m min (kept from the installed task; pass -WatchdogMinutes to change it)" } } catch { } }
}
$pre = Test-NodePreflight $EnvFile
$pre | Where-Object { $_ -is [string] }
if ($pre[-1] -ne $true) { "REFUSED - the preflight failed; no task was installed, changed or removed"; exit 2 }
if ((Test-OtherCheckout $owner) -and -not $ReplaceOtherCheckout) { Deny-OtherCheckout 'changed' }
# THE CREDENTIAL FILE IS READABLE BY THIS USER ONLY. Node's 0o600 is ignored on Windows, so the ACL is set here: inheritance
# removed, one explicit grant to the full identity (DOMAIN\user or MACHINE\user, which always resolves). A native command's
# failure does not throw in Windows PowerShell 5.1, so the exit code is read, and 2>&1 under Stop is caught.
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclOk = $false; $aclOut = ''
try { $aclOut = & icacls $EnvFile /inheritance:r /grant:r "$($me):(R,W)" 2>&1; $aclOk = ($LASTEXITCODE -eq 0) } catch { $aclOut = $_.Exception.Message }
if ($aclOk) { "env file ACL: inheritance removed, $me read/write only" } else { "WARNING: the env file ACL was NOT tightened (icacls exit $LASTEXITCODE): $(($aclOut | Out-String).Trim()) - restrict $EnvFile to $me by hand" }
# --runner-env, not --env-file: node itself consumes --env-file anywhere on its command line and exits 9 on a missing file
$taskArgs = "`"$Supervisor`" --runner-env `"$EnvFile`" --role $Role" + $(if ($LogDir) { " --log-dir `"$LogDir`"" } else { '' })
# NO CONSOLE WINDOW. An interactive-logon task (the non-elevated default) showed the supervisor in a visible console window, and
# closing it killed the node until the next logon while the task did not restart it (verification 2026-09-24, round 2). The
# supervisor is launched through conhost --headless (Windows 10 1809+): a console with no window, nothing to close.
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$headless = (Test-Path -LiteralPath $conhost) -and ([Environment]::OSVersion.Version.Build -ge 17763)
if ($headless) { $action = New-ScheduledTaskAction -Execute $conhost -Argument ("--headless `"$NodeExe`" " + $taskArgs) -WorkingDirectory $Root }
else { $action = New-ScheduledTaskAction -Execute $NodeExe -Argument $taskArgs -WorkingDirectory $Root; "note: this Windows has no headless console (build < 17763): the node runs in a visible console window - do not close it" }
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($WatchdogMinutes) -RepetitionInterval (New-TimeSpan -Minutes $WatchdogMinutes)
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $me), (New-ScheduledTaskTrigger -AtStartup), $watchdogTrigger)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
# EXACTLY ONE SUPERVISOR PER CHECKOUT. Whatever supervisor runs for this checkout - the existing task's, or one started by hand
# in a terminal (the bootstrap's printed next step) - is stopped cleanly first: otherwise the task's supervisor would find it,
# exit 3, and nothing would restart the node once the terminal closed (verification 2026-09-24). When this replaces another
# checkout's task, that checkout's supervisor is stopped too.
foreach ($d in @($Root) + @(if ($owner -and (Test-OtherCheckout $owner)) { $owner })) {
  $stopped = Stop-CheckoutSupervisor $d
  $stopped | Where-Object { $_ -is [string] }
  if ($stopped[-1] -ne $true) { "REFUSED - the supervisor of $d is still running 20 s after the stop request; nothing was installed or replaced"; exit 4 }
}
if ($task) {
  if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  "previous task removed (its supervisor stopped first)"
}
# A BOOT trigger (AtStartup) can only be registered by an administrator - Windows refuses it for a standard user with
# "Access is denied" (measured 2026-09-22, for S4U and Interactive alike). Elevated: boot + logon, S4U (no window, no stored
# password). Not elevated: logon only, which still covers a reboot the moment this user logs on; the elevated command that
# adds the boot trigger is printed so it can be run once.
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$logon = 'Interactive'; $trig = 'logon'
if ($elevated) {
  try {
    $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at boot and logon' | Out-Null
    $logon = 'S4U'; $trig = 'boot+logon'
  } catch {
    $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at boot and logon' | Out-Null
    $trig = 'boot+logon'
  }
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @((New-ScheduledTaskTrigger -AtLogOn -User $me), $watchdogTrigger) -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at logon; a watchdog trigger restarts a dead supervisor' | Out-Null
}
"installed task '$TaskName' (logon type $logon; triggers $trig + watchdog every $WatchdogMinutes min; role $Role; env file $EnvFile, contents not printed)"
if (-not $elevated) {
  "note: the boot trigger needs one elevated run (a standard user may not register AtStartup). From an ADMINISTRATOR PowerShell, once:"
  "      powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Role $Role -Start$taskHint$(if ($LogDir) { ' -LogDir ' + [char]34 + $LogDir + [char]34 } else { '' })$(if ($WatchdogMinutes -ne 5) { ' -WatchdogMinutes ' + $WatchdogMinutes } else { '' })"
  "      Until then the node starts when this user logs on after a reboot."
}
if ($Start) {
  $since = Get-Date
  Start-ScheduledTask -TaskName $TaskName
  Confirm-TaskSupervisor $Root $since
}
"verify:   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Verify$taskHint"
"status:   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Status$taskHint   (reads the task's own env file)"
