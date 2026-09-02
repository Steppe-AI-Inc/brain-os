# Installs (or repairs) the Windows Task Scheduler job that makes this a real autonomous node.
#
# Design notes, because a couple of choices here are deliberate rather than obvious:
#
#  * LEAST PRIVILEGE. RunLevel is LeastPrivilege and LogonType is InteractiveToken - the
#    supervisor runs as the founder's own desktop user, exactly like the interactive session it
#    replaces. It is NOT elevated: an unattended agent with admin rights on the founder's machine
#    is a far larger blast radius than anything it buys us. InteractiveToken also means the task
#    inherits the user's Claude and Supabase credentials WITHOUT any secret being stored in the
#    task definition, which is the other requirement.
#
#  * TWO TRIGGERS, ON PURPOSE. Task Scheduler's RestartOnFailure only fires when the process
#    exits NON-ZERO. A supervisor that exits cleanly - lease denied, stopped by policy, a bug that
#    returns 0 - would never be restarted by it, and the node would be silently dead until someone
#    looked. So there is also a repeating time trigger every 30 minutes with
#    MultipleInstancesPolicy=IgnoreNew: if the supervisor is alive the extra start is ignored (and
#    the lease would refuse it anyway), and if it is dead the node self-heals within 30 minutes.
#    Belt and braces is the correct posture for something whose whole promise is "leave it alone".
#
#  * ExecutionTimeLimit PT0S = no time limit. The default 3 days would kill a healthy supervisor.
#
# Usage:  powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1
#         powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1 -Verify
#         powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1 -Uninstall

param(
    [switch]$Verify,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$TaskName = 'BrainOS-WorkPC-QA-Supervisor'
$RunnerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Entry = Join-Path $RunnerDir 'start-supervisor.cmd'
$WorkDir = Split-Path -Parent (Split-Path -Parent $RunnerDir)
$UserId = "$env:USERDOMAIN\$env:USERNAME"

function Show-TaskState {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $t) { Write-Output "TASK NOT INSTALLED: $TaskName"; return $false }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Output "TASK INSTALLED     : $TaskName"
    Write-Output "  State            : $($t.State)"
    Write-Output "  Principal        : $($t.Principal.UserId) / $($t.Principal.RunLevel) / $($t.Principal.LogonType)"
    Write-Output "  Action           : $($t.Actions[0].Execute)"
    Write-Output "  WorkingDirectory : $($t.Actions[0].WorkingDirectory)"
    Write-Output "  Triggers         : $(($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ', ')"
    Write-Output "  LastRunTime      : $($info.LastRunTime)"
    Write-Output "  LastTaskResult   : $($info.LastTaskResult)"
    Write-Output "  NextRunTime      : $($info.NextRunTime)"
    return $true
}

if ($Verify) { if (Show-TaskState) { exit 0 } else { exit 1 } }

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "UNINSTALLED: $TaskName"
    exit 0
}

if (-not (Test-Path $Entry)) { throw "Entrypoint not found: $Entry" }

# Remove any previous registration so this script is idempotent and safe to re-run after a move.
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $Entry -WorkingDirectory $WorkDir

# Trigger 1: at logon. 2-minute delay so the network stack and credential store are up first -
# starting into a dead network just burns a backoff cycle for no reason.
$trigLogon = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$trigLogon.Delay = 'PT2M'

# Trigger 2: the self-heal sweep described above.
$trigRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 30)

$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -RestartCount 3 `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$settings.DisallowStartOnRemoteAppSession = $false
$settings.StopIfGoingOnBatteries = $false

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger @($trigLogon, $trigRepeat) `
    -Principal $principal `
    -Settings $settings `
    -Description 'Brain OS Work-PC autonomous QA supervisor. Launches Fable 5 QA Directors from repository state and relaunches them when they exit, so QA continues without the founder typing continue. No secrets are stored in this task: it runs as the interactive user and inherits their existing Claude/Supabase logins.' | Out-Null

Write-Output "INSTALLED: $TaskName"
Show-TaskState | Out-Null
