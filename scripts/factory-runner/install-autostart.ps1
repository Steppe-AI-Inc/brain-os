# REBOOT RECOVERY FOR A FACTORY NODE (Windows). Registers a Scheduled Task that starts the node supervisor at boot and at
# logon for this user, so a rebooted PC rejoins the shared control plane with no founder at the keyboard.
#
#   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Role generic -Start
#   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Verify
#   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Uninstall
#
# -Role      generic (Home PC) | verifier (Work PC) | release_broker
# -EnvFile   the runner env file (default %USERPROFILE%\.brain-factory\runner.env); its contents are never printed
# -Start     start the task now (the supervisor refuses to run twice per checkout, so this is idempotent)
# -Stop      stop the supervisor cleanly (its worker with it) and the task; refused (exit 3) when the task belongs to another
#            checkout unless -ReplaceOtherCheckout (a stop file written here never reaches that checkout's supervisor)
# -Status    task state, the supervisor's state file, the dependency check and the node's liveness on the plane
# -Preflight check only - env file, the runner URL it yields, and the runtime dependencies at their locked versions - and
#            exit 0/1 without touching any task (what the package regression drives)
# -Verify    exit 0 only if the task exists, is enabled, its action is this checkout's supervisor, and the task's own env
#            file and the dependencies pass the preflight (a task whose supervisor cannot load pg, or whose URL names a CA file
#            missing on this machine, is not a working task)
# -Uninstall remove the task after its supervisor stopped cleanly; refused (exit 3) for another checkout's task unless
#            -ReplaceOtherCheckout, and (exit 4) if the supervisor does not stop
# -ReplaceOtherCheckout  allow replacing, stopping or removing a task that points at a DIFFERENT checkout (refused by default:
#            one PC, one task name, and a scratch clone must not silently take over or end the node this PC is running). The
#            other checkout's own supervisor is asked to stop - its stop file, its pid file - and the install refuses (exit 4)
#            if it is still alive 20 s later, rather than leave a second worker running under the old identity.
#
# Before any task is touched the install runs the same preflight and refuses with the fix named: a missing env file, or
# runtime dependencies not installed from the committed package-lock.json (`npm ci` fixes it).
#
# The task runs as this user with S4U logon (no stored password, no console window; falls back to an interactive logon
# if S4U is refused), unlimited execution time, restart on failure every minute, one instance at a time, and it may start
# on battery. It needs no elevation.
param(
  [ValidateSet('generic', 'verifier', 'release_broker')] [string] $Role = 'generic',
  [string] $EnvFile = (Join-Path $env:USERPROFILE '.brain-factory\runner.env'),
  [switch] $Start, [switch] $Stop, [switch] $Status, [switch] $Preflight, [switch] $Verify, [switch] $Uninstall,
  [switch] $ReplaceOtherCheckout
)
$ErrorActionPreference = 'Stop'
$TaskName = 'BrainOS Factory Node'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Supervisor = Join-Path $Root 'scripts\factory-runner\node-supervisor.mjs'
$DepsCheck = Join-Path $Root 'scripts\factory-runner\deps.mjs'
$NodeExe = (Get-Command node -ErrorAction Stop).Source

# The same checks the supervisor makes before it starts a worker, run here first so a task is never registered for a checkout
# that cannot run one. Returns $true/$false and prints one line per check; prints no URL.
function Test-NodePreflight {
  $ok = $true
  if (-not (Test-Path $EnvFile)) { "FAIL env file not found: $EnvFile (provision-control-plane.mjs --write-env writes it; copy it to this path)"; $ok = $false }
  else {
    # the module goes to node as a PATH and node builds the URL (pathToFileURL): concatenating 'file:///' + path turned a '#'
    # in a checkout path into a URL fragment, and the preflight failed on a checkout that runs fine (found 2026-09-24).
    # A URL whose CA file exists nowhere on this machine FAILS: a verify-full connection would fail closed on every start.
    $mod = Join-Path $Root 'scripts\factory-runner\runner-env.mjs'
    $note = & $NodeExe -e "import(require('url').pathToFileURL(process.argv[1]).href).then(m=>{const r=m.loadRunnerUrl(process.argv[2]);const good=!!r.url&&!r.caMissing;console.log((good?'ok   ':'FAIL ')+'env file '+process.argv[2]+' yields a runner URL'+(r.caMissing?' whose CA file is missing on this machine':'')+' (not printed; '+r.note+')');process.exit(good?0:1)})" $mod $EnvFile
    $note; if ($LASTEXITCODE -ne 0) { $ok = $false }
  }
  # ok only on exit 0 AND the check's own words - a check that printed nothing proved nothing
  $deps = & $NodeExe $DepsCheck
  if (($LASTEXITCODE -eq 0) -and ("$deps" -like 'runtime dependencies installed at their locked versions*')) { "ok   $deps" } else { "FAIL $(if ("$deps") { $deps } else { 'the dependency check printed nothing (exit ' + $LASTEXITCODE + ')' })"; $ok = $false }
  return $ok
}

# WHOSE TASK IS IT. The task's working directory is the checkout whose supervisor it runs. Stopping "the supervisor" means
# stopping THAT checkout's supervisor - its stop file and pid file live under that checkout - not this one's (before
# 2026-09-24 -ReplaceOtherCheckout wrote the stop file into this checkout and the other supervisor never saw it).
function Get-TaskOwnerDir { $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue; if ($t) { return ($t.Actions | Select-Object -First 1).WorkingDirectory } return $null }
function Test-OtherCheckout($dir) { return [bool]($dir -and ($dir.TrimEnd('\') -ne $Root.TrimEnd('\'))) }
# Ask the supervisor of checkout $dir to stop and wait for it; $true when no supervisor of that checkout is alive afterwards.
function Stop-CheckoutSupervisor($dir) {
  $sup = Join-Path $dir 'scripts\factory-runner\node-supervisor.mjs'
  $pidFile = Join-Path $dir '.factory\node-supervisor.pid'
  if (-not (Test-Path $pidFile)) { return $true }
  $oldPid = 0; try { $oldPid = [int](Get-Content -Raw $pidFile).Trim() } catch { }
  if (Test-Path $sup) { & $NodeExe $sup --stop | Out-Null } else { New-Item -ItemType Directory -Force (Join-Path $dir '.factory') | Out-Null; Set-Content -Path (Join-Path $dir '.factory\node.stop') -Value 'stop' }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-Path $pidFile)) { return $true }
    if ($oldPid -and -not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return (-not ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)))
}
$owner = Get-TaskOwnerDir
function Deny-OtherCheckout($what) {
  "REFUSED - the task '$TaskName' belongs to another checkout ($owner); this is $Root."
  "          Nothing was $what. Run this from that checkout, or pass -ReplaceOtherCheckout if this checkout should act on it."
  exit 3
}

if ($Preflight) {
  $lines = Test-NodePreflight
  $lines | Where-Object { $_ -is [string] }
  if ($lines[-1] -eq $true) { "PREFLIGHT OK for $Root"; exit 0 } else { "PREFLIGHT FAILED for $Root - nothing was installed or changed"; exit 1 }
}

if ($Stop) {
  if ((Test-OtherCheckout $owner) -and -not $ReplaceOtherCheckout) { Deny-OtherCheckout 'stopped' }
  $dir = if ($owner) { $owner } else { $Root }
  if (Stop-CheckoutSupervisor $dir) { "supervisor of $dir stopped (or was not running)" } else { "note: the supervisor of $dir did not stop within 20 s" }
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t -and $t.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName; "task '$TaskName' stopped" }
  exit 0
}

if ($Status) {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) { "task      $TaskName  state $($t.State)" } else { "task      $TaskName  NOT INSTALLED" }
  "supervisor"; & $NodeExe $Supervisor --status
  "deps      " + (& $NodeExe $DepsCheck)
  if (Test-Path $EnvFile) {
    # the shared loader resolves the CA path for this machine; the URL is handed to node.mjs through the environment only
    $mod = Join-Path $Root 'scripts\factory-runner\runner-env.mjs'
    $url = & $NodeExe -e "import(require('url').pathToFileURL(process.argv[1]).href).then(m=>{const r=m.loadRunnerUrl(process.argv[2]);if(r.url)process.stdout.write(r.url)})" $mod $EnvFile
    if ($url) { $env:FACTORY_RUNNER_PG_URL = $url; "node      " + (& $NodeExe (Join-Path $Root 'scripts\factory-runner\node.mjs') status 2>$null | Select-Object -Last 1) }
  }
  exit 0
}

if ($Uninstall) {
  if ((Test-OtherCheckout $owner) -and -not $ReplaceOtherCheckout) { Deny-OtherCheckout 'stopped or removed' }
  $dir = if ($owner) { $owner } else { $Root }
  if (-not (Stop-CheckoutSupervisor $dir)) { "REFUSED - the supervisor of $dir is still running 20 s after the stop request; the task was not removed"; exit 4 }
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) { if ($t.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }; Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; "task '$TaskName' removed" } else { "task '$TaskName' was not installed" }
  exit 0
}

if ($Verify) {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) { "FAIL task '$TaskName' is not installed"; exit 1 }
  $action = $t.Actions | Select-Object -First 1
  $okAction = ($action.Execute -eq $NodeExe) -and ($action.Arguments -like "*node-supervisor.mjs*") -and ($action.WorkingDirectory -eq $Root)
  $enabled = $t.Settings.Enabled -and ($t.State -ne 'Disabled')
  $triggers = ($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ','
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  "task      $TaskName"
  "state     $($t.State)  enabled=$enabled"
  "triggers  $triggers"
  "action    $($action.Execute) $($action.Arguments)"
  "workdir   $($action.WorkingDirectory)"
  "last run  $($info.LastRunTime)  result 0x$('{0:X}' -f $info.LastTaskResult)"
  # the env file the TASK uses (its --env-file argument), not this invocation's default
  if ($action.Arguments -match '--env-file "([^"]+)"') { $EnvFile = $Matches[1] }
  if (Test-Path $EnvFile) { $acl = (Get-Acl $EnvFile).Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights)" }; "env ACL   $($acl -join '; ')" }
  $pre = Test-NodePreflight
  $pre | Where-Object { $_ -is [string] } | ForEach-Object { "preflight $_" }
  $preOk = ($pre[-1] -eq $true)
  if ($okAction -and $enabled -and $preOk) { "OK   the task exists, is enabled, starts this checkout's supervisor, and its env file, CA and dependencies pass the preflight"; exit 0 }
  "FAIL " + $(if (-not $enabled) { 'the task is disabled' } elseif (-not $okAction) { 'the task action is not this checkout''s supervisor' } else { 'the preflight failed (the line marked FAIL above names the fix)' }); exit 1
}

# ---- install: preflight first, and nothing is touched unless it passes -------------------------------------------------
$pre = Test-NodePreflight
$pre | Where-Object { $_ -is [string] }
if ($pre[-1] -ne $true) { "REFUSED - the preflight failed; no task was installed, changed or removed"; exit 2 }
if ((Test-OtherCheckout $owner) -and -not $ReplaceOtherCheckout) { Deny-OtherCheckout 'changed' }
# THE CREDENTIAL FILE IS READABLE BY THIS USER ONLY. Node's 0o600 is ignored on Windows, so the ACL is set here: inheritance
# removed, one explicit grant. -Verify reports the ACL so a widened one is visible.
# The grant names the full identity (DOMAIN\user or MACHINE\user), which always resolves; a bare $env:USERNAME may not. A native
# command's failure does not throw in Windows PowerShell 5.1, so the exit code is read - the success line printed after an
# icacls that changed nothing was a false statement about the credential file (verification 2026-09-24).
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclOk = $false; $aclOut = ''
# under ErrorActionPreference Stop, icacls's stderr redirected by 2>&1 is a terminating error in Windows PowerShell 5.1: caught here
try { $aclOut = & icacls $EnvFile /inheritance:r /grant:r "$($me):(R,W)" 2>&1; $aclOk = ($LASTEXITCODE -eq 0) } catch { $aclOut = $_.Exception.Message }
if ($aclOk) { "env file ACL: inheritance removed, $me read/write only" } else { "WARNING: the env file ACL was NOT tightened (icacls exit $LASTEXITCODE): $(($aclOut | Out-String).Trim()) - restrict $EnvFile to $me by hand" }
$taskArgs = "`"$Supervisor`" --env-file `"$EnvFile`" --role $Role"
$action = New-ScheduledTaskAction -Execute $NodeExe -Argument $taskArgs -WorkingDirectory $Root
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $me), (New-ScheduledTaskTrigger -AtStartup))
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  # IDEMPOTENT: a re-install ends the running supervisor cleanly first (its worker with it), so the re-registered task starts
  # exactly one new supervisor and no orphan keeps the node identity alive twice.
  # The supervisor asked to stop is the one the EXISTING task runs - the other checkout's, when this replaces it.
  $dir = if ($owner) { $owner } else { $Root }
  if (-not (Stop-CheckoutSupervisor $dir)) { "REFUSED - the supervisor of $dir is still running 20 s after the stop request; nothing was replaced"; exit 4 }
  if ($existing.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  "previous task removed (the supervisor of $dir stopped first)"
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
  "      powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Role $Role -Start"
  "      Until then the node starts when this user logs on after a reboot."
}
if ($Start) {
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 3
  $t = Get-ScheduledTask -TaskName $TaskName
  "started: task state $($t.State)"
}
"verify:   powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Verify"
"liveness: node scripts\factory-runner\node.mjs status   (with FACTORY_RUNNER_PG_URL from the env file)"
