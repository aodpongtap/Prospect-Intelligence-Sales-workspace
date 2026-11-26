# pbix-report-map.ps1
# Reads a .pbix file (read-only) and prints its report structure:
#   pages -> visuals (type + title + field roles)
# Useful for rebuilding a Power BI report as a web dashboard.
#
# A .pbix is a ZIP package. The report definition lives in "Report/Layout"
# which is a small binary header followed by UTF-16LE JSON.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/pbix-report-map.ps1 -Path 'D:\Report\Report Sale Order.pbix'

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $Path)) { throw "Not found: $Path" }
$copy = Join-Path $env:TEMP ("pbix-" + [guid]::NewGuid().ToString('N') + ".pbix")
Copy-Item $Path $copy -Force

try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($copy)
    Write-Host "=== PACKAGE PARTS ==="
    $zip.Entries | Sort-Object Length -Descending | Select-Object -First 12 |
        ForEach-Object { "  {0,-40} {1,8:N2} MB" -f $_.FullName, ($_.Length / 1MB) }

    $layout = $zip.Entries | Where-Object { $_.FullName -eq 'Report/Layout' }
    if (-not $layout) { throw "Report/Layout not found - is this a .pbix?" }

    $ms = New-Object System.IO.MemoryStream
    $s = $layout.Open(); $s.CopyTo($ms); $s.Close()
    $text = [System.Text.Encoding]::Unicode.GetString($ms.ToArray())
    $ms.Dispose(); $zip.Dispose()

    $start = $text.IndexOf('{')
    if ($start -lt 0) { throw "cannot locate JSON in Layout" }
    $json = $text.Substring($start)
    $j = $json | ConvertFrom-Json

    Write-Host ""
    Write-Host "=== REPORT PAGES ($($j.sections.Count)) ==="
    $n = 0
    foreach ($sec in $j.sections) {
        $n++
        $w = [math]::Round($sec.width, 0); $h = [math]::Round($sec.height, 0)
        Write-Host ""
        Write-Host ("[{0}] {1}   ({2} x {3}px, {4} visuals)" -f $n, $sec.displayName, $w, $h, $sec.visualContainers.Count)

        foreach ($vc in $sec.visualContainers) {
            try {
                $cfg = $vc.config | ConvertFrom-Json
                $type = $cfg.singleVisual.visualType
                $title = ''
                try { $title = $cfg.singleVisual.visualContainerObjects.title[0].properties.text.expr.Literal.Value } catch {}
                $title = $title -replace "'", '' -replace '^\s*"|"\s*$', ''

                $fields = @()
                try {
                    foreach ($p in $cfg.singleVisual.projections.PSObject.Properties) {
                        $names = $p.Value | ForEach-Object { $_.queryRef } | Where-Object { $_ }
                        if ($names) { $fields += ("{0}=[{1}]" -f $p.Name, ($names -join ',')) }
                    }
                } catch {}

                $t = if ($type) { $type } else { '?' }
                $label = if ($title) { "`"$title`"" } else { '(no title)' }
                Write-Host ("    - {0,-22} {1}" -f $t, $label)
                if ($fields.Count) { Write-Host ("        " + ($fields -join '  ')) }
            }
            catch { Write-Host "    - (unreadable visual)" }
        }
    }

    # Data model tables/measures (best effort from Layout only)
    $types = @{}
    foreach ($sec in $j.sections) {
        foreach ($vc in $sec.visualContainers) {
            try {
                $cfg = $vc.config | ConvertFrom-Json
                $vt = $cfg.singleVisual.visualType
                if ($vt) { if ($types.ContainsKey($vt)) { $types[$vt]++ } else { $types[$vt] = 1 } }
            } catch {}
        }
    }
    Write-Host ""
    Write-Host "=== VISUAL TYPE SUMMARY ==="
    $types.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "  {0,-24} {1}" -f $_.Key, $_.Value }
}
finally {
    Remove-Item $copy -Force -ErrorAction SilentlyContinue
}
