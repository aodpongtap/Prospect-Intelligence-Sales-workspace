# cleanup-terminals.ps1
# Reaps idle PowerShell shells that VS Code leaves behind for every integrated terminal.
# Each leftover shell costs ~35-40 MB, so 100+ of them can eat several GB of RAM.
#
# Safety rules (all must pass before anything is killed):
#   1. the shell was started by a VS Code process (Code.exe)
#   2. the shell is idle - it has NO child processes (nothing is running in it)
#   3. the shell is NOT the one running this script
#   4. the shell is older than -MinAgeMinutes (default 10)
#   5. it is not among the -KeepRecent (default 4) newest shells
#   6. idle shell count is above -MinShells (default 8), otherwise nothing happens
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/cleanup-terminals.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/cleanup-terminals.ps1 -Report
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/cleanup-terminals.ps1 -Force
#
# -Force ignores rules 4/5/6 (still never kills the current shell or a busy shell).

[CmdletBinding()]
param(
    [int]$MinShells = 8,
    [int]$KeepRecent = 4,
    [int]$MinAgeMinutes = 10,
    [switch]$Force,
    [switch]$Report,
    [string]$LogPath = (Join-Path $env:LOCALAPPDATA 'PIAgent\logs\cleanup-terminals.log')
)

$ErrorActionPreference = 'SilentlyContinue'

function Write-Log([string]$msg) {
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $msg
    Write-Host $line
    if ($Report) { return }
    $dir = Split-Path $LogPath -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

function Get-ShellMB($processIds) {
    $sum = 0
    foreach ($id in $processIds) {
        $p = Get-Process -Id $id
        if ($p) { $sum += $p.WS }
    }
    return [math]::Round($sum / 1MB, 0)
}

$codePids = @(Get-Process Code | Select-Object -ExpandProperty Id)
if ($codePids.Count -eq 0) {
    Write-Log 'VS Code is not running - skip.'
    return
}

# Rule 1 + 3: shells owned by VS Code, excluding this one.
$shells = @(
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $codePids -contains $_.ParentProcessId -and $_.ProcessId -ne $PID }
)

# Rule 2: idle = no child processes.
$idle = @(
    foreach ($sh in $shells) {
        $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($sh.ProcessId)")
        if ($kids.Count -eq 0) { $sh }
    }
)

$busy = $shells.Count - $idle.Count

if (-not $Force) {
    # Rule 6: only act when there is real clutter.
    if ($idle.Count -le $MinShells) {
        Write-Log "Idle shells: $($idle.Count) (busy: $busy) - at or below threshold $MinShells, nothing to do."
        return
    }

    # Rule 5: keep the newest shells around.
    $ordered = @($idle | Sort-Object CreationDate)
    $candidates = @($ordered | Select-Object -First ([math]::Max(0, $ordered.Count - $KeepRecent)))

    # Rule 4: only shells that have been sitting a while.
    $cutoff = (Get-Date).AddMinutes(-$MinAgeMinutes)
    $targets = @($candidates | Where-Object { $_.CreationDate -lt $cutoff })
}
else {
    $targets = @($idle)
}

if ($targets.Count -eq 0) {
    Write-Log "Idle shells: $($idle.Count) (busy: $busy) - none older than $MinAgeMinutes min beyond the newest $KeepRecent, nothing to do."
    return
}

$ids = @($targets | Select-Object -ExpandProperty ProcessId)
$mb = Get-ShellMB $ids

if ($Report) {
    Write-Log "WOULD close $($targets.Count) idle shell(s) (~$mb MB). Idle: $($idle.Count), busy: $busy."
    foreach ($t in ($targets | Sort-Object CreationDate)) {
        Write-Log ("  PID {0,-7} started {1:HH:mm}  {2} MB" -f $t.ProcessId, $t.CreationDate, (Get-ShellMB @($t.ProcessId)))
    }
    return
}

$freeBefore = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB, 0)
foreach ($id in $ids) { Stop-Process -Id $id -Force }
Start-Sleep -Milliseconds 900
$freeAfter = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB, 0)

Write-Log ("Closed {0} idle shell(s) (~{1} MB). Free RAM: {2} MB -> {3} MB. Remaining idle: {4}, busy: {5}." -f `
        $targets.Count, $mb, $freeBefore, $freeAfter, ($idle.Count - $targets.Count), $busy)
