# cleanup-terminals.ps1
# Kills idle PowerShell shells that VS Code leaves behind for every integrated terminal.
# Each leftover shell is ~35-40 MB, so 100+ of them can eat several GB of RAM.
#
# Safe by design:
#   * never kills the shell that is currently running this script
#   * never kills a shell that still has child processes (i.e. something is still running)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/cleanup-terminals.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/cleanup-terminals.ps1 -Report

[CmdletBinding()]
param(
    [switch]$Report
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-FreeMB {
    [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB, 0)
}

$codePids = @(Get-Process Code | Select-Object -ExpandProperty Id)
if ($codePids.Count -eq 0) {
    Write-Host 'VS Code is not running - nothing to clean.'
    return
}

$shells = @(
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $codePids -contains $_.ParentProcessId -and $_.ProcessId -ne $PID }
)

$targets = @()
foreach ($sh in $shells) {
    $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($sh.ProcessId)")
    if ($kids.Count -eq 0) {
        $targets += $sh
    }
}

if ($targets.Count -eq 0) {
    Write-Host "No idle terminal shells found (active: $($shells.Count)). RAM free: $(Get-FreeMB) MB"
    return
}

$mb = 0
foreach ($t in $targets) {
    $p = Get-Process -Id $t.ProcessId
    if ($p) { $mb += [math]::Round($p.WS / 1MB, 0) }
}

if ($Report) {
    Write-Host "Would close $($targets.Count) idle terminal shell(s), freeing about $mb MB."
    $targets | ForEach-Object { Write-Host ("  PID {0,-7} started {1:HH:mm}  {2} MB" -f $_.ProcessId, $_.CreationDate, [math]::Round((Get-Process -Id $_.ProcessId).WS / 1MB, 0)) }
    return
}

$before = Get-FreeMB
foreach ($t in $targets) { Stop-Process -Id $t.ProcessId -Force }
Start-Sleep -Milliseconds 800
$after = Get-FreeMB

Write-Host "Closed $($targets.Count) idle terminal shell(s)."
Write-Host "Free RAM: $before MB -> $after MB  (released $($after - $before) MB)"
