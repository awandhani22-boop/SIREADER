[CmdletBinding()]
param(
    [switch]$RequireAll
)

$ErrorActionPreference = 'Stop'
$expectedPorts = @(
    [pscustomobject]@{ Name = 'Virtual Office / Vite'; Port = 3000 },
    [pscustomobject]@{ Name = 'BFF'; Port = 3001 },
    [pscustomobject]@{ Name = 'Python observability API'; Port = 8000 },
    [pscustomobject]@{ Name = 'Workforce command API'; Port = 8010 },
    [pscustomobject]@{ Name = 'Local PostgreSQL'; Port = 5432 }
)

$missing = [System.Collections.Generic.List[int]]::new()
Write-Host 'SIREADER local service diagnostics' -ForegroundColor Cyan
Write-Host 'Read-only check: no process is started/stopped and no database command is issued.'
Write-Host ''

foreach ($service in $expectedPorts) {
    $listener = Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $service.Port -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($null -ne $listener) {
        Write-Host ("[OK]      {0,-30} 127.0.0.1:{1} (PID {2})" -f $service.Name, $service.Port, $listener.OwningProcess) -ForegroundColor Green
    }
    else {
        $missing.Add($service.Port)
        Write-Host ("[MISSING] {0,-30} 127.0.0.1:{1}" -f $service.Name, $service.Port) -ForegroundColor Yellow
    }
}

Write-Host ''
try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 3
    Write-Host ("[OK]      Browser UI HTTP {0}" -f [int]$response.StatusCode) -ForegroundColor Green
}
catch {
    Write-Host ("[WARN]    Browser UI did not return a successful response: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    if ($RequireAll) { exit 1 }
}

if ($missing.Count -gt 0) {
    Write-Host ''
    Write-Host ("Missing ports: {0}" -f ($missing -join ', ')) -ForegroundColor Yellow
    Write-Host 'Start only the missing component using docs/LOCAL_INSTALL_AND_OPERATIONS.md.'
    if ($RequireAll) { exit 1 }
}
else {
    Write-Host ''
    Write-Host 'All expected loopback ports are listening.' -ForegroundColor Green
}

exit 0
