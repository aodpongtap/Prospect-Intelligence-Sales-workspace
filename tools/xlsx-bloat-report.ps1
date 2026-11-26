# xlsx-bloat-report.ps1
# Finds Excel files that open slowly because of oversized pivot caches or huge XML.
#
# Why: Excel parses the whole pivot cache into memory when a file opens.
#      A 140 MB pivotCacheRecords1.xml means a multi-second (sometimes multi-minute)
#      open plus several hundred MB of RAM - fatal on an 8 GB machine.
#
# Rule of thumb:
#   Unpacked <  10 MB  -> fine
#   Unpacked  10-50 MB -> noticeable
#   Unpacked  > 50 MB  -> slow, especially if PivotMB is most of it
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/xlsx-bloat-report.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/xlsx-bloat-report.ps1 -Path 'D:\' -Top 25

[CmdletBinding()]
param(
    [string[]]$Path = @(
        "$env:USERPROFILE\Desktop",
        "$env:USERPROFILE\Downloads",
        "$env:USERPROFILE\Documents"
    ),
    [int]$MinKB = 200,
    [int]$Top = 15
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$files = @()
foreach ($p in $Path) {
    if (Test-Path $p) {
        $files += Get-ChildItem -Path $p -Filter *.xlsx -Recurse -File |
            Where-Object { $_.Length -gt ($MinKB * 1KB) }
    }
}

if (-not $files.Count) { Write-Host "No .xlsx files larger than $MinKB KB found."; return }

Write-Host "Scanning $($files.Count) file(s)...`n"

$rows = @()
foreach ($f in $files) {
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
        $pivot = ($zip.Entries | Where-Object { $_.FullName -like '*pivotCache*' -and $_.FullName -like '*.xml' } | Measure-Object Length -Sum).Sum
        $all = ($zip.Entries | Measure-Object Length -Sum).Sum
        $sheets = ($zip.Entries | Where-Object { $_.FullName -like 'xl/worksheets/*.xml' }).Count
        $zip.Dispose()

        $verdict = 'ok'
        if ($all -gt 50MB) { $verdict = 'SLOW' }
        elseif ($all -gt 10MB) { $verdict = 'warn' }
        if ($pivot -gt 30MB) { $verdict = 'PIVOT-BLOAT' }

        $rows += [pscustomobject]@{
            File       = $f.Name
            Folder     = $f.DirectoryName.Replace($env:USERPROFILE, '~')
            DiskMB     = [math]::Round($f.Length / 1MB, 1)
            UnpackMB   = [math]::Round($all / 1MB, 1)
            PivotMB    = [math]::Round($pivot / 1MB, 1)
            Sheets     = $sheets
            Modified   = $f.LastWriteTime.ToString('dd/MM/yy')
            Verdict    = $verdict
        }
    }
    catch { }
}

$rows | Sort-Object UnpackMB -Descending | Select-Object -First $Top |
    Format-Table -AutoSize @{n='File';e={$_.File}}, DiskMB, UnpackMB, PivotMB, Sheets, Modified, Verdict

$bad = @($rows | Where-Object { $_.Verdict -ne 'ok' })
Write-Host "`n$($bad.Count) of $($rows.Count) file(s) need attention."
if ($bad.Count) {
    Write-Host @"

How to fix a PIVOT-BLOAT file (2 minutes, keeps your data):
  1. Open the file in Excel
  2. Click any pivot table -> PivotTable Analyze -> Change Data Source -> re-select the range -> OK
     (this rebuilds the cache from the current data and drops the old records)
  3. PivotTable Options -> Data -> untick "Save source data with file" and
     untick "Refresh data when opening the file"
  4. Save (File -> Save As) and check the size - it usually drops 80-95%
Fastest alternative for very large files: Save As .xlsb (Excel Binary Workbook).
"@
}
