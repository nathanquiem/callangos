param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('answered', 'ended', 'busy', 'failed')]
  [string]$Event,
  [Parameter(Mandatory = $true, Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$PhoneParts
)

$ErrorActionPreference = 'Stop'
$connectorDirectory = Join-Path $env:LOCALAPPDATA 'CallangosConnector'
$configPath = Join-Path $connectorDirectory 'config.json'
$logPath = Join-Path $connectorDirectory 'connector.log'

function Write-ConnectorLog([string]$Message) {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format s) $Message" -Encoding UTF8
}

try {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $secureToken = ConvertTo-SecureString $config.TokenProtected
  $credential = New-Object System.Management.Automation.PSCredential('callangos', $secureToken)
  $token = $credential.GetNetworkCredential().Password
  $phone = ($PhoneParts -join ' ').Trim()
  $headers = @{ Authorization = "Bearer $token" }
  $payload = @{ event = $Event; phone = $phone } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Uri "$($config.ApiUrl.TrimEnd('/'))/api/v1/connector/events" -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -TimeoutSec 20
  Write-ConnectorLog "Evento $Event enviado para $phone."

  if ($Event -eq 'ended' -and $response.data.status -eq 'completed') {
    $recording = $null
    for ($attempt = 0; $attempt -lt 8 -and -not $recording; $attempt++) {
      Start-Sleep -Seconds 2
      $recording = Get-ChildItem -LiteralPath $config.RecordingPath -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.mp3', '.wav' -and $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    }
    if ($recording) {
      $uploadHeaders = @{
        Authorization = "Bearer $token"
        'x-callangos-file-name' = $recording.Name
      }
      $contentType = if ($recording.Extension -eq '.wav') { 'audio/wav' } else { 'audio/mpeg' }
      Invoke-WebRequest -Uri "$($config.ApiUrl.TrimEnd('/'))/api/v1/connector/recordings/$($response.data.id)" -Method Post -Headers $uploadHeaders -ContentType $contentType -InFile $recording.FullName -UseBasicParsing -TimeoutSec 120 | Out-Null
      Write-ConnectorLog "Gravação $($recording.Name) enviada."
    } else {
      Write-ConnectorLog 'Ligação concluída sem arquivo de gravação localizado.'
    }
  }
} catch {
  Write-ConnectorLog "ERRO: $($_.Exception.Message)"
}
