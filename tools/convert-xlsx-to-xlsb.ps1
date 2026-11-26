# convert-xlsx-to-xlsb.ps1
# Creates a FAST copy of a slow-opening .xlsx by converting it to .xlsb (binary).
#
# Safety guarantees:
#   * the source workbook is opened READ-ONLY  -> Excel cannot modify it
#   * the output is a NEW file (<name>_fast.xlsb), the original stays untouched
#   * if anything fails the source file is not affected
#
# Why it works: .xlsx stores pivot caches as huge XML (up to 140+ MB of text that
# Excel has to parse character by character). .xlsb stores the same data in a
# binary format, so opening is typically 3-8x faster.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/convert-xlsx-to-xlsb.ps1 -Source 'C:\path\file.xlsx'
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/convert-xlsx-to-xlsb.ps1 -Source 'C:\path\file.xlsx' -Overwrite

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Destination,
    [switch]$Overwrite,
    [int]$TimeoutMinutes = 30
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Source)) { throw "Source not found: $Source" }
$src = (Resolve-Path $Source).Path
if (-not $Destination) {
    $Destination = [System.IO.Path]::ChangeExtension($src, '.xlsb') -replace '\.xlsb$', '_fast.xlsb'
}
if ((Test-Path $Destination) -and -not $Overwrite) { throw "Destination exists (use -Overwrite): $Destination" }

$srcMb = [math]::Round((Get-Item $src).Length / 1MB, 2)
Write-Host "source : $src ($srcMb MB)"
Write-Host "target : $Destination"
Write-Host "opening in Excel (read-only) - this can take a few minutes for huge pivot caches..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
$wb = $null

try {
    # Open(FileName, UpdateLinks=0, ReadOnly=$true)  -> source is never written
    $wb = $excel.Workbooks.Open($src, 0, $true)
    Write-Host "opened in $([math]::Round($sw.Elapsed.TotalSeconds,0))s"

    # xlExcel12 = 50  (.xlsb)
    $wb.SaveAs($Destination, 50)
    Write-Host "saved  in $([math]::Round($sw.Elapsed.TotalSeconds,0))s"
}
finally {
    if ($wb) { try { $wb.Close($false) } catch {} }
    try { $excel.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

if (Test-Path $Destination) {
    $dstMb = [math]::Round((Get-Item $Destination).Length / 1MB, 2)
    Write-Host ""
    Write-Host "DONE in $([math]::Round($sw.Elapsed.TotalSeconds,0))s"
    Write-Host "  original : $srcMb MB  (untouched)"
    Write-Host "  fast copy: $dstMb MB"
    Write-Host "  -> open the _fast.xlsb from now on; it should open several times faster."
}
else {
    throw "Conversion failed - no output file was created. The original file is untouched."
}
