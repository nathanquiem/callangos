param(
  [string]$ApiUrl = 'https://call-api.nathanquiem.com.br'
)

$ErrorActionPreference = 'Stop'
$microSipIni = Join-Path $env:APPDATA 'MicroSIP\microsip.ini'
$connectorDirectory = Join-Path $env:LOCALAPPDATA 'CallangosConnector'
$connectorScript = Join-Path $connectorDirectory 'callangos-connector.ps1'

if (-not (Test-Path -LiteralPath $microSipIni)) {
  throw "MicroSIP.ini não encontrado em $microSipIni"
}
if (Get-Process -Name MicroSIP -ErrorAction SilentlyContinue) {
  throw 'Feche completamente o MicroSIP pelo ícone ao lado do relógio e execute novamente.'
}

$protectedToken = Read-Host 'Cole o NOVO token do Callangos' -AsSecureString | ConvertFrom-SecureString
New-Item -ItemType Directory -Path $connectorDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'callangos-connector.ps1') -Destination $connectorScript -Force

$ini = [System.IO.File]::ReadAllText($microSipIni)
$recordingMatch = [regex]::Match($ini, '(?m)^recordingPath=(.*)$')
$recordingPath = if ($recordingMatch.Success -and $recordingMatch.Groups[1].Value.Trim()) {
  $recordingMatch.Groups[1].Value.Trim()
} else {
  Join-Path ([Environment]::GetFolderPath('Desktop')) 'Recordings'
}
New-Item -ItemType Directory -Path $recordingPath -Force | Out-Null

$config = @{
  ApiUrl = $ApiUrl.TrimEnd('/')
  TokenProtected = $protectedToken
  RecordingPath = $recordingPath
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $connectorDirectory 'config.json'), $config, (New-Object System.Text.UTF8Encoding($false)))

function Set-IniValue([string]$Content, [string]$Key, [string]$Value) {
  $pattern = "(?m)^$([regex]::Escape($Key))=.*$"
  if ([regex]::IsMatch($Content, $pattern)) {
    return [regex]::Replace($Content, $pattern, "$Key=$Value")
  }
  return "$Content`r`n$Key=$Value"
}

$backup = "$microSipIni.callangos-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
Copy-Item -LiteralPath $microSipIni -Destination $backup
$commandBase = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $connectorScript"
$ini = Set-IniValue $ini 'autoRecording' '1'
$ini = Set-IniValue $ini 'cmdCallStart' "`"$commandBase answered`""
$ini = Set-IniValue $ini 'cmdCallEnd' "`"$commandBase ended`""
$ini = Set-IniValue $ini 'cmdCallBusy' "`"$commandBase busy`""
[System.IO.File]::WriteAllText($microSipIni, $ini, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host 'Conector Callangos instalado com sucesso.' -ForegroundColor Green
Write-Host "Backup: $backup"
Write-Host 'Abra o MicroSIP e faça uma ligação pelo Callangos.'
