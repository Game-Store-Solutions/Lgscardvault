$ErrorActionPreference = 'Stop'

$RootDir = $PSScriptRoot
$Processes = @()
$LogDir = Join-Path $RootDir '.dev-logs'

function Stop-ProcessTree {
    param([int] $ProcessId)

    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" |
        ForEach-Object { Stop-ProcessTree -ProcessId $_.ProcessId }

    Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Stop-DevProcesses {
    if ($Processes.Count -eq 0) {
        return
    }

    Write-Host ''
    Write-Host 'Stopping dev services...'

    foreach ($Service in $Processes) {
        if ($null -ne $Service.Process -and -not $Service.Process.HasExited) {
            Stop-ProcessTree -ProcessId $Service.Process.Id
        }
    }
}

function Require-Command {
    param([string] $Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Start-DevProcess {
    param(
        [string] $Name,
        [string] $WorkingDirectory,
        [string] $FilePath,
        [string[]] $ArgumentList
    )

    $OutLog = Join-Path $LogDir "$Name.out.log"
    $ErrLog = Join-Path $LogDir "$Name.err.log"

    Write-Host "Starting $Name..."

    $Process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -NoNewWindow `
        -PassThru

    $script:Processes += [pscustomobject]@{
        Name = $Name
        Process = $Process
    }
}

function Invoke-Checked {
    param(
        [string] $Description,
        [string] $FilePath,
        [string[]] $ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

function Test-DockerDaemon {
    docker info *> $null

    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop is not running or its Linux engine is unavailable. Start Docker Desktop, wait for it to finish starting, then run this script again.'
    }
}

function Wait-ForTcpPort {
    param(
        [string] $HostName,
        [int] $Port,
        [int] $TimeoutSeconds = 30
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $Deadline) {
        $Client = [System.Net.Sockets.TcpClient]::new()

        try {
            $Connect = $Client.BeginConnect($HostName, $Port, $null, $null)
            if ($Connect.AsyncWaitHandle.WaitOne(1000)) {
                $Client.EndConnect($Connect)
                return
            }
        }
        catch {
        }
        finally {
            $Client.Close()
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for ${HostName}:${Port}."
}

function Wait-ForPostgresReady {
    param(
        [string] $ComposeFile,
        [int] $TimeoutSeconds = 60
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $Deadline) {
        docker compose -f $ComposeFile exec -T postgres pg_isready -U store -d store *> $null

        if ($LASTEXITCODE -eq 0) {
            return
        }

        Start-Sleep -Seconds 1
    }

    throw 'Timed out waiting for Postgres to accept connections.'
}

try {
    Require-Command docker
    Require-Command php
    Require-Command npm

    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

    Write-Host 'Checking Docker...'
    Test-DockerDaemon

    $ComposeFile = Join-Path $RootDir 'docker-compose.yml'

    Write-Host 'Starting infrastructure...'
    Invoke-Checked 'Docker Compose startup' 'docker' @('compose', '-f', $ComposeFile, 'up', '-d')

    if (-not (Test-Path (Join-Path $RootDir 'backend/vendor'))) {
        throw 'backend/vendor is missing. Run: cd backend; composer install'
    }

    if (-not (Test-Path (Join-Path $RootDir 'frontend/node_modules'))) {
        throw 'frontend/node_modules is missing. Run: cd frontend; npm install'
    }

    Write-Host 'Waiting for Postgres on 127.0.0.1:5432...'
    Wait-ForTcpPort '127.0.0.1' 5432 30
    Wait-ForPostgresReady $ComposeFile 60

    # Symfony uses this for absolute OAuth callback URLs; must match Square dashboard.
    $env:DEFAULT_URI = 'http://127.0.0.1:8000'

    # Avoid stale serializer metadata after entity/branding field changes (e.g. heroLayout on store read).
    Push-Location (Join-Path $RootDir 'backend')
    try {
        Invoke-Checked 'Doctrine migrations' 'php' @('bin/console', 'doctrine:migrations:migrate', '--no-interaction')
        Invoke-Checked 'Symfony cache clear' 'php' @('bin/console', 'cache:clear', '--no-warmup')
    }
    finally {
        Pop-Location
    }

    Start-DevProcess 'backend-api' (Join-Path $RootDir 'backend') 'php' @('-S', '127.0.0.1:8000', '-t', 'public')
    Start-DevProcess 'csv-worker' (Join-Path $RootDir 'backend') 'php' @('bin/console', 'messenger:consume', 'csv', '-vv', '--memory-limit=512M')
    Start-DevProcess 'frontend' (Join-Path $RootDir 'frontend') 'npm' @('run', 'dev')

    Write-Host ''
    Write-Host 'Dev services are running:'
    Write-Host '  Backend:  http://127.0.0.1:8000'
    Write-Host '  Frontend: http://localhost:5173'
    Write-Host '  Mailpit:  http://localhost:8025'
    Write-Host "  Logs:     $LogDir"
    Write-Host ''
    Write-Host 'Press Ctrl+C to stop the backend, worker, and frontend.'

    while ($true) {
        foreach ($Service in @($Processes | ForEach-Object { $_ })) {
            if ($null -eq $Service.Process) {
                continue
            }
            if (-not $Service.Process.HasExited) {
                continue
            }
            if ($Service.Name -eq 'csv-worker') {
                Write-Host ''
                Write-Host 'csv-worker exited; restarting in 2s... (see .dev-logs\csv-worker.err.log)'
                Start-Sleep -Seconds 2
                $script:Processes = @($Processes | Where-Object { $_.Name -ne 'csv-worker' })
                Start-DevProcess 'csv-worker' (Join-Path $RootDir 'backend') 'php' @(
                    'bin/console', 'messenger:consume', 'csv', '-vv', '--memory-limit=512M'
                )
                break
            }
            throw "$($Service.Name) exited with code $($Service.Process.ExitCode). Check logs in $LogDir."
        }

        Start-Sleep -Seconds 1
    }
}
finally {
    Stop-DevProcesses
}
