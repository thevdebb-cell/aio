<#
    Removes the BLS.Hosting services
    Deployment folders and the database stay where they are unless you pass -Purge
#>
[CmdletBinding()]
param(
    [string] $Root = 'C:\bls',
    [switch] $Purge
)

$ErrorActionPreference = 'Continue'
$nssm = Join-Path $Root 'tools\nssm\nssm.exe'

foreach ($name in @('bls-panel', 'bls-caddy')) {
    if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
        Write-Host "  stopping $name"
        & $nssm stop $name confirm | Out-Null
        Start-Sleep -Seconds 2
        & $nssm remove $name confirm | Out-Null
        Write-Host "  removed $name" -ForegroundColor Green
    }
}

foreach ($rule in @('BLS HTTP', 'BLS HTTPS')) {
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $rule
        Write-Host "  firewall rule $rule removed" -ForegroundColor Green
    }
}

if ($Purge) {
    Write-Host "`n  Purge was asked for" -ForegroundColor Yellow
    $answer = Read-Host "  Type DELETE to wipe $Root including every deployment"
    if ($answer -eq 'DELETE') {
        Remove-Item -Path $Root -Recurse -Force
        Write-Host "  $Root is gone" -ForegroundColor Green
    } else {
        Write-Host "  nothing was deleted" -ForegroundColor Gray
    }
} else {
    Write-Host "`n  $Root was kept  pass -Purge to wipe it" -ForegroundColor DarkGray
}
