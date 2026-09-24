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
# -Start     with -Role (or no task yet): install, then start. ALONE on an installed task of this checkout: start that task as
#            it is - no re-install, role and env file unchanged. Either way the task's supervisor is CONFIRMED running
#            (identity-checked pid, state running) or the command fails (exit 5) naming the task result and the refusal.
# -Stop      stop the supervisor cleanly (its worker with it) and the task
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
# A recorded pid is trusted only when that process's command line is the owning checkout's node-supervisor.mjs: after a reboot
# the pid file names whatever process Windows handed that number to (verification 2026-09-24).
#
# The task runs as this user (S4U when elevated: no stored password, no window; otherwise interactive logon), unlimited
# execution time, restart on failure every minute, one instance at a time, and it may start on battery. It needs no elevation.
param(
  [ValidateSet('generic', 'verifier', 'release_broker')] [string] $Role = 'generic',
  [string] $EnvFile = (Join-Path $env:USERPROFILE '.brain-factory\runner.env'),
  [switch] $Start, [switch] $Stop, [switch] $Status, [switch] $Preflight, [switch] $Verify, [switch] $Uninstall,
  [switch] $ReplaceOtherCheckout,
  [string] $TaskName = 'BrainOS Factory Node',
  [string] $LogDir = ''
)
$ErrorActionPreference = 'Stop'
$RoleGiven = $PSBoundParameters.ContainsKey('Role')
$EnvGiven = $PSBoundParameters.ContainsKey('EnvFile')
# -LiteralPath everywhere a path is resolved or tested: '[' and ']' are legal in a Windows path and are wildcards to PowerShell
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Supervisor = Join-Path $Root 'scripts\factory-runner\node-supervisor.mjs'
$DepsCheck = Join-Path $Root 'scripts\factory-runner\deps.mjs'
$NodeExe = (Get-Command node -ErrorAction Stop).Source
$taskHint = if ($TaskName -ne 'BrainOS Factory Node') { " -TaskName '$TaskName'" } else { '' }

# ---- the task and its owner ------------------------------------------------------------------------------------------------
function Get-FactoryTask { return (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) }
function Get-TaskArg($t, $name) {
  if (-not $t) { return $null }
  $a = ($t.Actions | Select-Object -First 1).Arguments
  if ($name -eq 'role') { if ($a -match '--role (\w+)') { return $Matches[1] } return $null }
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

# ---- the supervisor of a checkout, identity-checked --------------------------------------------------------------------------
# The pid in <dir>\.factory\node-supervisor.pid, only when that process's command line runs <dir>'s node-supervisor.mjs.
function Get-SupervisorPid($dir) {
  $pidFile = Join-Path $dir '.factory\node-supervisor.pid'
  if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
  $p = 0; try { $p = [int]((Get-Content -LiteralPath $pidFile -Raw).Trim()) } catch { return $null }
  if (-not $p) { return $null }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
  if (-not $proc -or -not $proc.CommandLine) { return $null }
  $want = (Join-Path $dir 'scripts\factory-runner\node-supervisor.mjs').Replace('/', '\').ToLower()
  if ($proc.CommandLine.Replace('/', '\').ToLower().Contains($want)) { return $p }
  return $null
}
# Ask the supervisor of checkout $dir to stop and wait for it; $true when no supervisor of that checkout is alive afterwards.
# A pid file whose pid is not that checkout's supervisor is stale: it is removed, and nothing is stopped or killed.
function Stop-CheckoutSupervisor($dir) {
  $pidFile = Join-Path $dir '.factory\node-supervisor.pid'
  $p = Get-SupervisorPid $dir
  if (-not $p) {
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; "note: removed a stale pid file under $dir (its pid is not that checkout's supervisor)" }
    return $true
  }
  $sup = Join-Path $dir 'scripts\factory-runner\node-supervisor.mjs'
  if (Test-Path -LiteralPath $sup) { & $NodeExe $sup --stop | Out-Null }
  else { [IO.Directory]::CreateDirectory((Join-Path $dir '.factory')) | Out-Null; [IO.File]::WriteAllText((Join-Path $dir '.factory\node.stop'), 'stop') }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) { if (-not (Get-Process -Id $p -ErrorAction SilentlyContinue)) { return $true }; Start-Sleep -Milliseconds 500 }
  return (-not (Get-Process -Id $p -ErrorAction SilentlyContinue))
}
function Read-SupervisorStatus($dir) { $f = Join-Path $dir '.factory\node-status.json'; if (Test-Path -LiteralPath $f) { try { return (Get-Content -LiteralPath $f -Raw | ConvertFrom-Json) } catch { } }; return $null }
# After Start-ScheduledTask: the task's supervisor must be running (identity-checked) with its worker, not merely "task Running"
function Confirm-TaskSupervisor($dir) {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $p = Get-SupervisorPid $dir
    $st = Read-SupervisorStatus $dir
    if ($p -and $st -and ($st.supervisorPid -eq $p) -and ($st.state -eq 'running')) { return "started: supervisor pid $p, worker pid $($st.childPid), role $($st.role)" }
    if (-not $p -and $st -and ($st.state -in @('refused', 'dependencies_missing'))) { break }
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  $st = Read-SupervisorStatus $dir
  "FAIL the task was started but no supervisor of $dir is running (task result 0x$('{0:X}' -f $info.LastTaskResult); supervisor state $(if ($st) { $st.state } else { 'none' })$(if ($st -and $st.refusal) { ': ' + $st.refusal } elseif ($st -and $st.dependencies -and $st.state -eq 'dependencies_missing') { ': ' + $st.dependencies } else { '' }))"
  "     the supervisor's log: $(if ($LogDir) { $LogDir } else { "$env:USERPROFILE\.brain-factory\logs" })\node-$((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')).log"
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
  $stopped = Stop-CheckoutSupervisor $dir
  $stopped | Where-Object { $_ -is [string] }
  $t = Get-FactoryTask
  if ($t -and $t.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName; "task '$TaskName' stopped" }
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
  if ($st) {
    $live = Get-SupervisorPid $dir
    ($st | ConvertTo-Json -Depth 4)
    if (-not $live -and ($st.state -in @('starting', 'running', 'backoff'))) { "STALE     the recorded supervisor (pid $($st.supervisorPid)) is not running - the node is DOWN; install-autostart.ps1 -Start$taskHint" }
  } else { "no status file ($(Join-Path $dir '.factory\node-status.json'))" }
  "deps      " + (& $NodeExe (Join-Path $dir 'scripts\factory-runner\deps.mjs') 2>&1 | Out-String).Trim()
  $envPath = if ($EnvGiven) { $EnvFile } elseif (Get-TaskArg $task 'env') { Get-TaskArg $task 'env' } else { $EnvFile }
  if (Test-Path -LiteralPath $envPath) {
    # the node line through the task's own env file; the URL goes to node.mjs through the environment only, never printed
    $nodeLine = & $NodeExe (Join-Path $dir 'scripts\factory-runner\node.mjs') status --runner-env $envPath 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 1
    "node      $nodeLine"
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
  $supPid = Get-SupervisorPid $Root
  $st = Read-SupervisorStatus $Root
  $running = ($task.State -eq 'Running') -and $supPid -and $st -and ($st.state -eq 'running')
  "task      $TaskName"
  "state     $($task.State)  enabled=$enabled  role $(Get-TaskArg $task 'role')"
  "triggers  $triggers"
  "action    $($action.Execute) $($action.Arguments)"
  "workdir   $($action.WorkingDirectory)"
  "last run  $($info.LastRunTime)  result 0x$('{0:X}' -f $info.LastTaskResult)"
  "running   supervisor $(if ($supPid) { 'pid ' + $supPid } else { 'NOT RUNNING' })$(if ($st) { ', state ' + $st.state + ', worker ' + $st.childPid + ', restarts ' + $st.restarts } else { '' })"
  # the env file the TASK uses (its --runner-env / --env-file argument), not this invocation's default
  $envPath = if (Get-TaskArg $task 'env') { Get-TaskArg $task 'env' } else { $EnvFile }
  if (Test-Path -LiteralPath $envPath) { $acl = (Get-Acl -LiteralPath $envPath).Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights)" }; "env ACL   $($acl -join '; ')" }
  $pre = Test-NodePreflight $envPath
  $pre | Where-Object { $_ -is [string] } | ForEach-Object { "preflight $_" }
  $preOk = ($pre[-1] -eq $true)
  if ($okAction -and $enabled -and $running -and $preOk) { "OK   the task is enabled and running this checkout's supervisor (pid $supPid), and its env file, CA and dependencies pass the preflight"; exit 0 }
  "FAIL " + $(if (-not $enabled) { 'the task is disabled' } elseif (-not $okAction) { 'the task action is not this checkout''s supervisor' } elseif (-not $running) { "the task is not running a supervisor of this checkout - install-autostart.ps1 -Start$taskHint (then -Status)" } else { 'the preflight failed (the line marked FAIL above names the fix)' }); exit 1
}

# ---- -Start ALONE on an installed task of this checkout: start it as it is (role and env file unchanged) ---------------------
if ($Start -and -not $RoleGiven -and -not $EnvGiven -and $task -and -not (Test-OtherCheckout $owner)) {
  $p = Get-SupervisorPid $Root
  if ($p) { "already running: supervisor pid $p (task '$TaskName', role $(Get-TaskArg $task 'role'); nothing re-installed)"; exit 0 }
  Start-ScheduledTask -TaskName $TaskName
  "task '$TaskName' started as installed (role $(Get-TaskArg $task 'role'); nothing re-installed)"
  Confirm-TaskSupervisor $Root
  exit 0
}

# ---- install: preflight first, and nothing is touched unless it passes -------------------------------------------------------
# On a re-install without -Role / -EnvFile the existing task's own values are kept.
if (-not $RoleGiven -and (Get-TaskArg $task 'role')) { $Role = Get-TaskArg $task 'role'; "role      $Role (kept from the installed task; pass -Role to change it)" }
if (-not $EnvGiven -and (Get-TaskArg $task 'env')) { $EnvFile = Get-TaskArg $task 'env' }
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
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $me), (New-ScheduledTaskTrigger -AtStartup))
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
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @(New-ScheduledTaskTrigger -AtLogOn -User $me) -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at logon' | Out-Null
}
"installed task '$TaskName' (logon type $logon; triggers $trig; role $Role; env file $EnvFile, contents not printed)"
if (-not $elevated) {
  "note: the boot trigger needs one elevated run (a standard user may not register AtStartup). From an ADMINISTRATOR PowerShell, once:"
  "      powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Role $Role -Start$taskHint"
  "      Until then the node starts when this user logs on after a reboot."
}
if ($Start) {
  Start-ScheduledTask -TaskName $TaskName
  Confirm-TaskSupervisor $Root
}
"verify:   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Verify$taskHint"
"status:   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Status$taskHint   (reads the task's own env file)"
