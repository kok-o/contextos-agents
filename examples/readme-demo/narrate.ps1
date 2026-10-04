param([string]$InputFile = (Join-Path $PSScriptRoot 'narration-ru.json'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$narrator = New-Object System.Speech.Synthesis.SpeechSynthesizer
$narrator.SelectVoice('Microsoft Irina Desktop')
$narrator.Rate = 3
$targetDirectory = Join-Path $PSScriptRoot 'narration'
New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
$items = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
try {
    foreach ($item in $items) {
        if ($item.id -notmatch '^[a-z0-9-]+$') { throw 'Invalid scene id' }
        $wavePath = Join-Path $targetDirectory ($item.id + '.wav')
        $narrator.SetOutputToWaveFile($wavePath)
        $narrator.Speak($item.text)
        $narrator.SetOutputToNull()
        Write-Output $wavePath
    }
} finally { $narrator.Dispose() }
