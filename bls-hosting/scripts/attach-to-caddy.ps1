<#
    Adds the panel to a Caddy instance that is already running on this machine
    instead of starting a second one. Two Caddy processes cannot share ports 80
    443 and the admin port 2019 so only one may exist per host.

    It backs the Caddyfile up first, refuses to touch a file that already carries
    the block, validates before reloading and rolls back if validation fails.

    Example
      .\attach-to-caddy.ps1 -Caddyfile C:\nyuc\tools\caddy\Caddyfile -Service nyuc-caddy
#>

[CmdletBinding()]
param(
    [string] $Caddyfile = 'C:\nyuc\tools\caddy\Caddyfile',
    [string] $Service   = 'nyuc-caddy',
    [string] $Domain    = 'bls.blociapps.com',
    [int]    $Port      = 3300,
    [string] $LogDir    = '',
    [switch] $RemoveBlsCaddy
)

$ErrorActionPreference = 'Stop'

function Say  ($m) { Write-Host "  $m" -ForegroundColor Gray }
function Step ($m) { Write-Host "`n[ $m ]" -ForegroundColor Cyan }
function Good ($m) { Write-Host "  $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Fail ($m) { Write-Host "`n  $m" -ForegroundColor Red; exit 1 }

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail 'Run this from an elevated PowerShell'
}

if (-not (Test-Path $Caddyfile)) { Fail "No Caddyfile at $Caddyfile" }

$caddyDir = Split-Path -Parent $Caddyfile
$caddyExe = Join-Path $caddyDir 'caddy.exe'
if (-not (Test-Path $caddyExe)) {
    $found = Get-Process caddy -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found -and $found.Path) { $caddyExe = $found.Path }
}
if (-not (Test-Path $caddyExe)) { Fail "Could not find caddy.exe next to $Caddyfile" }

if (-not $LogDir) { $LogDir = Join-Path (Split-Path -Parent $caddyDir) 'logs\caddy' }
New-Item -Path $LogDir -ItemType Directory -Force | Out-Null

# --- 1  is the block already there -------------------------------------------

Step 'Reading the existing Caddyfile'
$current = Get-Content $Caddyfile -Raw
Say "$Caddyfile  $([math]::Round($current.Length / 1kb, 1)) KB"

if ($current -match [regex]::Escape($Domain)) {
    Warn "$Domain is already in this Caddyfile  nothing to add"
    Say 'if it points at the wrong port edit the block by hand then run'
    Say "  $caddyExe reload --config $Caddyfile"
    exit 0
}

# --- 2  back it up ------------------------------------------------------------

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$Caddyfile.bak-$stamp"
Copy-Item $Caddyfile $backup
Good "backup at $backup"

# --- 3  append the site block -------------------------------------------------
# Only the site block. A second global options block would be a syntax error and
# the existing one already carries the certificate email

Step "Adding $Domain"

$block = @"

$Domain {
	encode gzip

	reverse_proxy 127.0.0.1:$Port {
		header_up X-Real-IP {remote_host}
	}

	header {
		-Server
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
	}

	log {
		output file $LogDir\bls-access.log {
			roll_size 10mb
			roll_keep 5
		}
	}
}
"@

Add-Content -Path $Caddyfile -Value $block -Encoding ASCII
Good 'block appended'

# --- 4  validate or roll back -------------------------------------------------

Step 'Validating'
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $caddyExe fmt --overwrite $Caddyfile 2>&1 | Out-Null
$output = & $caddyExe validate --config $Caddyfile 2>&1
$code = $LASTEXITCODE
$ErrorActionPreference = $previous

if ($code -ne 0) {
    Copy-Item $backup $Caddyfile -Force
    Warn 'validation failed  the Caddyfile was restored from the backup and nothing changed'
    $output | ForEach-Object { Say $_ }
    Fail 'fix the block by hand or send me the output above'
}
Good 'config is valid'

# --- 5  reload without downtime ----------------------------------------------

Step 'Reloading Caddy'
$svc = Get-Service $Service -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne 'Running') {
    Warn "$Service is $($svc.Status)  starting it"
    Start-Service $Service
    Start-Sleep -Seconds 3
}

$ErrorActionPreference = 'Continue'
$reload = & $caddyExe reload --config $Caddyfile 2>&1
$reloadCode = $LASTEXITCODE
$ErrorActionPreference = $previous

if ($reloadCode -ne 0) {
    Warn 'reload did not go through  restarting the service instead'
    $reload | ForEach-Object { Say $_ }
    if ($svc) { Restart-Service $Service; Start-Sleep -Seconds 4 }
} else {
    Good 'reloaded with no downtime  the other sites never dropped'
}

# --- 6  retire the second caddy service --------------------------------------

if ($RemoveBlsCaddy) {
    Step 'Removing the second Caddy service'
    if (Get-Service bls-caddy -ErrorAction SilentlyContinue) {
        $nssm = 'C:\bls\tools\nssm\nssm.exe'
        if (Test-Path $nssm) {
            & $nssm stop bls-caddy confirm | Out-Null
            Start-Sleep -Seconds 2
            & $nssm remove bls-caddy confirm | Out-Null
            Good 'bls-caddy removed  this host now has one Caddy'
        } else {
            Warn "nssm not found at $nssm  remove bls-caddy by hand"
        }
    } else {
        Say 'bls-caddy is not registered'
    }
}

# --- done ---------------------------------------------------------------------

Write-Host ""
Get-Service nyuc-*, bls-* -ErrorAction SilentlyContinue | Format-Table Name, Status, StartType -AutoSize

Write-Host "  $Domain now goes through the Caddy at $Caddyfile" -ForegroundColor Green
Write-Host "  Certificate issuance starts on the first visit once the DNS record resolves" -ForegroundColor Gray
Write-Host "  Rollback if anything looks wrong" -ForegroundColor DarkGray
Write-Host "    Copy-Item '$backup' '$Caddyfile' -Force"
Write-Host "    $caddyExe reload --config $Caddyfile"
Write-Host ""
