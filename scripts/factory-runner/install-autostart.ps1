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
# -Verify    exit 0 only if the task exists, is enabled, and its action is this checkout's supervisor
# -Uninstall remove the task and ask a running supervisor to stop
#
# The task runs as this user with S4U logon (no stored password, no console window; falls back to an interactive logon
# if S4U is refused), unlimited execution time, restart on failure every minute, one instance at a time, and it may start
# on battery. It needs no elevation.
param(
  [ValidateSet('generic', 'verifier', 'release_broker')] [string] $Role = 'generic',
  [string] $EnvFile = (Join-Path $env:USERPROFILE '.brain-factory\runner.env'),
  [switch] $Start, [switch] $Stop, [switch] $Status, [switch] $Verify, [switch] $Uninstall
)
$ErrorActionPreference = 'Stop'
$TaskName = 'BrainOS Factory Node'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Supervisor = Join-Path $Root 'scripts\factory-runner\node-supervisor.mjs'
$NodeExe = (Get-Command node -ErrorAction Stop).Source

if ($Stop) {
  & $NodeExe $Supervisor --stop
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t -and $t.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName; "task '$TaskName' stopped" }
  exit 0
}

if ($Status) {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) { "task      $TaskName  state $($t.State)" } else { "task      $TaskName  NOT INSTALLED" }
  "supervisor"; & $NodeExe $Supervisor --status
  if (Test-Path $EnvFile) {
    # the shared loader resolves the CA path for this machine; the URL is handed to node.mjs through the environment only
    $mod = 'file:///' + ((Join-Path $Root 'scripts\factory-runner\runner-env.mjs') -replace '\\', '/')
    $url = & $NodeExe -e "import(process.argv[1]).then(m=>{const r=m.loadRunnerUrl(process.argv[2]);if(r.url)process.stdout.write(r.url)})" $mod $EnvFile
    if ($url) { $env:FACTORY_RUNNER_PG_URL = $url; "node      " + (& $NodeExe (Join-Path $Root 'scripts\factory-runner\node.mjs') status 2>$null | Select-Object -Last 1) }
  }
  exit 0
}

if ($Uninstall) {
  & $NodeExe $Supervisor --stop | Out-Null
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; "task '$TaskName' removed" } else { "task '$TaskName' was not installed" }
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
  if (Test-Path $EnvFile) { $acl = (Get-Acl $EnvFile).Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights)" }; "env ACL   $($acl -join '; ')" }
  if ($okAction -and $enabled) { "OK   the task exists, is enabled, and starts this checkout's supervisor"; exit 0 }
  "FAIL " + $(if (-not $enabled) { 'the task is disabled' } else { 'the task action is not this checkout''s supervisor' }); exit 1
}

if (-not (Test-Path $EnvFile)) { "FAIL env file not found: $EnvFile (provision-control-plane.mjs --write-env writes it)"; exit 2 }
# THE CREDENTIAL FILE IS READABLE BY THIS USER ONLY. Node's 0o600 is ignored on Windows, so the ACL is set here: inheritance
# removed, one explicit grant. -Verify reports the ACL so a widened one is visible.
try { & icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null; "env file ACL: inheritance removed, $env:USERNAME read/write only" } catch { "note: could not tighten the env file ACL: $($_.Exception.Message)" }
$args = "`"$Supervisor`" --env-file `"$EnvFile`" --role $Role"
$action = New-ScheduledTaskAction -Execute $NodeExe -Argument $args -WorkingDirectory $Root
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME), (New-ScheduledTaskTrigger -AtStartup))
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  # IDEMPOTENT: a re-install ends the running supervisor cleanly first (its worker with it), so the re-registered task starts
  # exactly one new supervisor and no orphan keeps the node identity alive twice.
  & $NodeExe $Supervisor --stop | Out-Null
  $pidFile = Join-Path $Root '.factory\node-supervisor.pid'
  $deadline = (Get-Date).AddSeconds(20); while ((Test-Path $pidFile) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 500 }
  if ($existing.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  "previous task removed (supervisor stopped first)"
}
# A BOOT trigger (AtStartup) can only be registered by an administrator - Windows refuses it for a standard user with
# "Access is denied" (measured 2026-09-22, for S4U and Interactive alike). Elevated: boot + logon, S4U (no window, no stored
# password). Not elevated: logon only, which still covers a reboot the moment this user logs on; the elevated command that
# adds the boot trigger is printed so it can be run once.
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$logon = 'Interactive'; $trig = 'logon'
if ($elevated) {
  try {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at boot and logon' | Out-Null
    $logon = 'S4U'; $trig = 'boot+logon'
  } catch {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at boot and logon' | Out-Null
    $trig = 'boot+logon'
  }
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @(New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Principal $principal -Description 'Brain OS Factory node supervisor: rejoins the shared control plane at logon' | Out-Null
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
