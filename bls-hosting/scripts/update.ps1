<#
    Pushes a new version of the panel onto the server
    Run it from the folder that holds the new source
#>
[CmdletBinding()]
param(
    [string] $Root = 'C:\bls'
)

$ErrorActionPreference = 'Stop'
$SourceDir = Split-Path -Parent $PSScriptRoot
$PanelDir  = Join-Path $Root 'panel'

if (-not (Test-Path (Join-Path $SourceDir 'package.json'))) {
    Write-Host "  No panel source next to this script" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $PanelDir)) {
    Write-Host "  $PanelDir does not exist  run setup.bat first" -ForegroundColor Red
    exit 1
}

$node = Get-ChildItem -Path (Join-Path $Root 'runtimes') -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $node) {
    Write-Host "  No private Node runtime found under $Root\runtimes" -ForegroundColor Red
    exit 1
}
$npm = Join-Path (Split-Path -Parent $node.FullName) 'npm.cmd'

Write-Host "`n[ Stopping the panel ]" -ForegroundColor Cyan
Stop-Service bls-panel -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "[ Copying the new files ]" -ForegroundColor Cyan
$exclude = @('node_modules', '.git', 'var', 'data', 'deployments', 'logs', 'runtimes', 'tmp')
$roboArgs = @($SourceDir, $PanelDir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2', '/XD') + $exclude + @('/XF', '.env')
robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Host "  robocopy failed with $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "[ Refreshing the dependencies ]" -ForegroundColor Cyan
Push-Location $PanelDir
try {
    $args = if (Test-Path (Join-Path $PanelDir 'package-lock.json')) { @('ci', '--omit=dev', '--no-audit', '--no-fund') }
            else { @('install', '--omit=dev', '--no-audit', '--no-fund') }
    & $npm @args
} finally {
    Pop-Location
}

Write-Host "[ Starting the panel ]" -ForegroundColor Cyan
Start-Service bls-panel
Start-Sleep -Seconds 4
Get-Service bls-* | Format-Table Name, Status -AutoSize

try {
    $port = (Select-String -Path (Join-Path $PanelDir '.env') -Pattern '^BLS_PORT=(\d+)').Matches[0].Groups[1].Value
    $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$port/healthz" -UseBasicParsing -TimeoutSec 8
    if ($probe.StatusCode -eq 200) { Write-Host "`n  panel is answering again" -ForegroundColor Green }
} catch {
    Write-Host "`n  the panel did not answer  look at $Root\logs\panel\err.log" -ForegroundColor Yellow
}

Write-Host "`n  Your deployments and their data were not touched" -ForegroundColor DarkGray
