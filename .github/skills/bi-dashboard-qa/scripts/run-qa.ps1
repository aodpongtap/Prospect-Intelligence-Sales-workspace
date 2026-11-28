# bi-dashboard QA runner
# Static + structural checks, plus optional PBI reconciliation.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .github/skills/bi-dashboard-qa/scripts/run-qa.ps1
#   powershell -ExecutionPolicy Bypass -File .github/skills/bi-dashboard-qa/scripts/run-qa.ps1 -Month 2026-11

param([string]$Month = "")

$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$node = "C:\Users\pongtap.p\tools\node\node.exe"
if (-not (Test-Path $node)) { $node = "node" }

Push-Location $root
$failed = 0

Write-Host "== 1) node --check bi-dashboard/*.js =="
Get-ChildItem (Join-Path $root "bi-dashboard") -Filter *.js | ForEach-Object {
    & $node --check $_.FullName
    if ($LASTEXITCODE -ne 0) {
        $script:failed++
        Write-Host ("FAIL  " + $_.Name)
    } else {
        Write-Host ("OK    " + $_.Name)
    }
}

Write-Host ""
Write-Host "== 2) tools/qa-static.js (syntax, refs, tokens, numbering) =="
& $node (Join-Path $root "tools\qa-static.js")
if ($LASTEXITCODE -ne 0) { $failed++ }

Write-Host ""
Write-Host "== 3) tools/qa-deep.js (duplicate functions, dead ids, snapshot) =="
& $node (Join-Path $root "tools\qa-deep.js")
if ($LASTEXITCODE -ne 0) { $failed++ }

if ($Month -ne "") {
    Write-Host ""
    Write-Host ("== 4) tools/qa-recon.js " + $Month + " (reconcile vs PBI model) ==")
    & $node (Join-Path $root "tools\qa-recon.js") $Month
    if ($LASTEXITCODE -ne 0) { $failed++ }

    Write-Host ""
    Write-Host ("== 5) tools/qa-aggregate.js " + $Month + " ==")
    & $node (Join-Path $root "tools\qa-aggregate.js") $Month
}

Write-Host ""
Write-Host "== 6) tools/lint-inline.js (must print problems = 0) =="
& $node (Join-Path $root "tools\lint-inline.js")

Write-Host ""
if ($failed -eq 0) {
    Write-Host "RESULT: static/structural checks reported no failure. Manual render + interaction matrix is still required."
} else {
    Write-Host ("RESULT: " + $failed + " step(s) failed - fix before reporting QA pass.")
}
Pop-Location
