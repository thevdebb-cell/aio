<#
    BLS.Hosting installer for Windows
    Run it from an elevated PowerShell or double click setup.bat

    What it does
      1  creates the C:\bls layout
      2  downloads a private Node runtime  nothing is installed system wide
      3  copies the panel and installs its dependencies
      4  writes the .env file and locks it down
      5  registers the panel as a Windows service through NSSM
      6  installs Caddy as the https front door for your domain
      7  opens 80 and 443 in Windows Defender Firewall
      8  prints the DNS record you have to create
#>

[CmdletBinding()]
param(
    [string] $Domain      = 'bls.blociapps.com',
    [string] $Email       = '',
    [string] $Root        = 'C:\bls',
    [int]    $Port        = 3300,
    [string] $AdminCode   = '',
    [string] $ViewerCode  = '',
    [string] $NodeMajor   = '24',
    [string[]] $ExtraRuntimes = @('node-22'),
    [switch] $SkipCaddy,
    [switch] $SkipFirewall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Say    ($m) { Write-Host "  $m" -ForegroundColor Gray }
function Step   ($m) { Write-Host "`n[ $m ]" -ForegroundColor Cyan }
function Good   ($m) { Write-Host "  $m" -ForegroundColor Green }
function Warn   ($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Fail   ($m) { Write-Host "`n  $m" -ForegroundColor Red; exit 1 }

# Caddy npm and nssm all write progress to stderr. With ErrorActionPreference set
# to Stop PowerShell turns that into a terminating error and the install dies on a
# perfectly normal info line. Native tools are judged on their exit code instead.
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string] $Exe,
        [string[]] $Arguments = @(),
        [switch] $Quiet
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Exe @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if (-not $Quiet) {
        $output | ForEach-Object { Say ($_ -replace '\s+$', '') }
    }
    return [pscustomobject]@{ ExitCode = $code; Output = $output }
}

Write-Host ""
Write-Host "  BLS.Hosting installer" -ForegroundColor White
Write-Host "  internal bot hosting for blociapps" -ForegroundColor DarkGray

# --- checks -------------------------------------------------------------------

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail 'Run this from an elevated PowerShell  right click setup.bat and pick Run as administrator'
}

$SourceDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $SourceDir 'package.json'))) {
    Fail "Could not find the panel source next to this script  expected $SourceDir\package.json"
}

$PanelDir   = Join-Path $Root 'panel'
$ToolsDir   = Join-Path $Root 'tools'
$RuntimeDir = Join-Path $Root 'runtimes'
$TmpDir     = Join-Path $Root 'tmp'

# --- 1  layout ----------------------------------------------------------------

Step 'Creating the folder layout'
foreach ($name in @('panel', 'data', 'deployments', 'runtimes', 'logs', 'backups', 'tools', 'tmp')) {
    $path = Join-Path $Root $name
    New-Item -Path $path -ItemType Directory -Force | Out-Null
}
Good "layout ready under $Root"

Say 'enabling long paths so deep node_modules trees do not break'
try {
    Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -ErrorAction Stop
} catch {
    Warn 'could not set the long path flag  not fatal'
}

# --- 2  node ------------------------------------------------------------------

Step "Fetching the Node $NodeMajor runtime"

function Resolve-NodeVersion([string] $major) {
    try {
        $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
        $match = $index |
            Where-Object { $_.version -match "^v$major\." } |
            Select-Object -First 1
        if ($match) { return $match.version.TrimStart('v') }
    } catch {
        Warn "nodejs org did not answer  falling back to a pinned version"
    }
    switch ($major) {
        '24' { return '24.21.0' }
        '22' { return '22.23.3' }
        '20' { return '20.19.5' }
        default { return '22.23.3' }
    }
}

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$nodeVersion = Resolve-NodeVersion $NodeMajor
$nodeFolder  = "node-v$nodeVersion-win-$arch"
$nodeHome    = Join-Path $RuntimeDir $nodeFolder
$nodeExe     = Join-Path $nodeHome 'node.exe'
$npmCmd      = Join-Path $nodeHome 'npm.cmd'

if (Test-Path $nodeExe) {
    Good "Node $nodeVersion already on disk"
} else {
    $zipPath = Join-Path $TmpDir "$nodeFolder.zip"
    Say "downloading https://nodejs.org/dist/v$nodeVersion/$nodeFolder.zip"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$nodeFolder.zip" -OutFile $zipPath -UseBasicParsing
    Say 'unpacking'
    Expand-Archive -Path $zipPath -DestinationPath $RuntimeDir -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $nodeExe)) { Fail 'the Node archive did not contain node.exe' }
    Good "Node $nodeVersion ready at $nodeHome"
}

# --- 3  panel files -----------------------------------------------------------

Step 'Copying the panel'

$robocopyExcludeDirs = @('node_modules', '.git', 'var', 'data', 'deployments', 'logs', 'runtimes', 'tmp')
$roboArgs = @($SourceDir, $PanelDir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2', '/XD') + $robocopyExcludeDirs + @('/XF', '.env')
robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "robocopy failed with code $LASTEXITCODE" }
Good "panel copied to $PanelDir"

Step 'Installing the panel dependencies'
Push-Location $PanelDir
try {
    $installArgs = if (Test-Path (Join-Path $PanelDir 'package-lock.json')) { @('ci', '--omit=dev', '--no-audit', '--no-fund') }
                   else { @('install', '--omit=dev', '--no-audit', '--no-fund') }
    $npmRun = Invoke-Native -Exe $npmCmd -Arguments $installArgs
    if ($npmRun.ExitCode -ne 0) { Fail "npm exited with $($npmRun.ExitCode)" }
} finally {
    Pop-Location
}
Good 'dependencies installed'

# --- 4  configuration ---------------------------------------------------------

Step 'Writing the configuration'

$envPath = Join-Path $PanelDir '.env'
$secret  = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Minimum 0 -Maximum 16) })

function New-Code([string] $prefix) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $body = -join ((1..10) | ForEach-Object { $alphabet[(Get-Random -Maximum $alphabet.Length)] })
    return "$prefix-$($body.Substring(0,5))-$($body.Substring(5,5))"
}

if (-not $AdminCode)  { $AdminCode  = 'Wplm9-c15!' }
if (-not $ViewerCode) { $ViewerCode = 'WmoY7-c12!' }

$scheme = if ($SkipCaddy) { 'http' } else { 'https' }
$publicUrl = "$scheme`://$Domain"

if (Test-Path $envPath) {
    Warn 'an .env already exists  it is kept as it is'
} else {
@"
BLS_HOST=127.0.0.1
BLS_PORT=$Port
BLS_PUBLIC_URL=$publicUrl
BLS_ROOT=$Root
BLS_SECRET=$secret
BLS_SESSION_MINUTES=720
BLS_PORT_MIN=3400
BLS_PORT_MAX=3499
BLS_RAM_RESERVE_MB=1536
BLS_ALLOW_OVERCOMMIT=true
BLS_MAX_UPLOAD_MB=256
BLS_SEED_ADMIN_CODE=$AdminCode
BLS_SEED_VIEWER_CODE=$ViewerCode
"@ | Set-Content -Path $envPath -Encoding ASCII
    Good "wrote $envPath"
}

Say 'locking the env file to administrators and system'
icacls $envPath /inheritance:r | Out-Null
icacls $envPath /grant 'Administrators:(R,W)' | Out-Null
icacls $envPath /grant 'SYSTEM:(R,W)' | Out-Null

# --- 5  extra runtimes --------------------------------------------------------

if ($ExtraRuntimes.Count -gt 0) {
    Step 'Installing the extra runtimes for your bots'
    Push-Location $PanelDir
    try {
        & $nodeExe (Join-Path $PanelDir 'scripts\install-runtime.js') @ExtraRuntimes
        if ($LASTEXITCODE -ne 0) { Warn 'one runtime did not install  you can retry from the panel' }
    } catch {
        Warn "runtime install skipped  $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

# --- 6  nssm ------------------------------------------------------------------

Step 'Setting up the Windows services'

$nssmDir = Join-Path $ToolsDir 'nssm'
$nssm    = Join-Path $nssmDir 'nssm.exe'
if (-not (Test-Path $nssm)) {
    New-Item -Path $nssmDir -ItemType Directory -Force | Out-Null
    $nssmZip = Join-Path $TmpDir 'nssm.zip'
    Say 'downloading nssm'
    Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $nssmZip -UseBasicParsing
    $nssmTmp = Join-Path $TmpDir 'nssm-unpack'
    Remove-Item $nssmTmp -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -Path $nssmZip -DestinationPath $nssmTmp -Force
    $found = Get-ChildItem -Path $nssmTmp -Recurse -Filter 'nssm.exe' |
        Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
    if (-not $found) { Fail 'nssm.exe was not found inside the archive' }
    Copy-Item $found.FullName $nssm -Force
    Remove-Item $nssmZip, $nssmTmp -Recurse -Force -ErrorAction SilentlyContinue
    Good 'nssm ready'
}

function Install-BlsService {
    param(
        [string] $Name,
        [string] $Exe,
        [string] $Arguments,
        [string] $WorkDir,
        [string] $LogName,
        [int]    $Throttle = 5000
    )
    $logDir = Join-Path $Root "logs\$LogName"
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null

    if (Get-Service -Name $Name -ErrorAction SilentlyContinue) {
        Say "$Name exists  stopping it before the update"
        & $nssm stop $Name confirm | Out-Null
        Start-Sleep -Seconds 2
        & $nssm remove $Name confirm | Out-Null
        Start-Sleep -Seconds 1
    }

    & $nssm install $Name $Exe $Arguments | Out-Null
    & $nssm set $Name AppDirectory     $WorkDir | Out-Null
    & $nssm set $Name AppStdout        (Join-Path $logDir 'out.log') | Out-Null
    & $nssm set $Name AppStderr        (Join-Path $logDir 'err.log') | Out-Null
    & $nssm set $Name AppRotateFiles   1 | Out-Null
    & $nssm set $Name AppRotateBytes   10485760 | Out-Null
    & $nssm set $Name AppThrottle      $Throttle | Out-Null
    & $nssm set $Name AppExit Default  Restart | Out-Null
    & $nssm set $Name AppStopMethodConsole 15000 | Out-Null
    & $nssm set $Name Start SERVICE_AUTO_START | Out-Null
    & $nssm set $Name Description "BLS.Hosting $Name" | Out-Null
    Good "$Name registered"
}

Install-BlsService -Name 'bls-panel' -Exe $nodeExe -Arguments (Join-Path $PanelDir 'bin\bls.js') -WorkDir $PanelDir -LogName 'panel' -Throttle 10000

# --- 7  caddy -----------------------------------------------------------------

if (-not $SkipCaddy) {
    Step 'Setting up Caddy for https'
    $caddyDir = Join-Path $ToolsDir 'caddy'
    $caddy    = Join-Path $caddyDir 'caddy.exe'
    New-Item -Path $caddyDir -ItemType Directory -Force | Out-Null
    if (-not (Test-Path $caddy)) {
        Say 'downloading caddy'
        $caddyArch = if ($arch -eq 'arm64') { 'arm64' } else { 'amd64' }
        Invoke-WebRequest -Uri "https://caddyserver.com/api/download?os=windows&arch=$caddyArch" -OutFile $caddy -UseBasicParsing
        Good 'caddy ready'
    }

    $caddyfile = Join-Path $caddyDir 'Caddyfile'
    $emailLine = if ($Email) { "`n    email $Email" } else { '' }
@"
{$emailLine
}

$Domain {
    encode gzip

    reverse_proxy 127.0.0.1:$Port {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    header {
        -Server
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    log {
        output file $Root\logs\caddy\access.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
"@ | Set-Content -Path $caddyfile -Encoding ASCII
    Good "wrote $caddyfile"

    New-Item -Path (Join-Path $Root 'logs\caddy') -ItemType Directory -Force | Out-Null
    $validation = Invoke-Native -Exe $caddy -Arguments @('validate', '--config', $caddyfile) -Quiet
    if ($validation.ExitCode -ne 0) {
        Warn 'caddy says the config is not valid  the service is still registered so you can fix the Caddyfile and restart it'
        $validation.Output | ForEach-Object { Say ($_ -replace '\s+$', '') }
    } else {
        Good 'Caddyfile is valid'
    }

    Install-BlsService -Name 'bls-caddy' -Exe $caddy -Arguments "run --config `"$caddyfile`"" -WorkDir $caddyDir -LogName 'caddy'
}

# --- 8  firewall --------------------------------------------------------------

if (-not $SkipFirewall) {
    Step 'Opening the firewall'
    foreach ($rule in @(@{ Name = 'BLS HTTP'; Port = 80 }, @{ Name = 'BLS HTTPS'; Port = 443 })) {
        if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Action Allow | Out-Null
            Good "$($rule.Name) allowed"
        } else {
            Say "$($rule.Name) already there"
        }
    }
    Say 'the panel itself stays on 127.0.0.1 and never gets an inbound rule'
}

# --- 9  start -----------------------------------------------------------------

Step 'Starting everything'
Start-Service bls-panel
Start-Sleep -Seconds 4
if (-not $SkipCaddy) {
    Start-Service bls-caddy
    Start-Sleep -Seconds 2
}

$healthy = $false
try {
    $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 8
    $healthy = $probe.StatusCode -eq 200
} catch {
    $healthy = $false
}

Get-Service bls-* | Format-Table Name, Status, StartType -AutoSize

# --- done ---------------------------------------------------------------------

$ip = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json' -TimeoutSec 10 -ErrorAction SilentlyContinue).ip
if (-not $ip) { $ip = '<your VPS public IPv4>' }

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor White
if ($healthy) {
    Write-Host "  BLS.Hosting is up" -ForegroundColor Green
} else {
    Write-Host "  The panel did not answer on 127.0.0.1:$Port" -ForegroundColor Yellow
    Write-Host "  look at $Root\logs\panel\err.log" -ForegroundColor Yellow
}
Write-Host "  ============================================================" -ForegroundColor White
Write-Host ""
Write-Host "  One thing is left for you  the DNS record" -ForegroundColor White
Write-Host ""
Write-Host "    type    A"
Write-Host "    name    $($Domain.Split('.')[0])"
Write-Host "    target  $ip"
Write-Host ""
Write-Host "  Create it where the domain is registered  for blociapps.com that is IONOS"
Write-Host "  Domains & SSL  ->  the domain  ->  DNS"
Write-Host ""
Write-Host "  Worth adding at the same time  a CAA record on the root"
Write-Host ""
Write-Host "    type    CAA"
Write-Host "    name    @"
Write-Host "    value   0 issue `"letsencrypt.org`""
Write-Host ""
Write-Host "  It stops any certificate authority other than Let us Encrypt issuing for this domain"
Write-Host "  Caddy asks Let us Encrypt for the certificate on the first visit so give it a minute"
Write-Host ""
Write-Host "  Portal      $publicUrl" -ForegroundColor Cyan
Write-Host "  Local test  http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Admin code   $AdminCode"
Write-Host "  Viewer code  $ViewerCode"
Write-Host ""
Write-Host "  Change them whenever you want" -ForegroundColor DarkGray
Write-Host "    cd $PanelDir"
Write-Host "    $nodeExe scripts\set-code.js admin `"<new code>`""
Write-Host ""
Write-Host "  Drop your png icons in $PanelDir\public\img" -ForegroundColor DarkGray
Write-Host "    bls-logo.png  intranex.png  bls-hosting.png  myorder.png  myspace.png"
Write-Host ""
