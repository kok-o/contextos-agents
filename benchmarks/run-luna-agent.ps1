param([ValidateSet('pilot', 'full', 'native')][string]$Mode = 'pilot', [switch]$PreflightOnly, [string]$Resume, [ValidateRange(1000, 10000000)][int]$Tpm = 60000)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot $(if ($Mode -eq 'native') { 'run-luna-native.js' } else { 'run-luna-agent.js' })
$previousKey = $env:OPENAI_API_KEY
$keyBuffer = [IntPtr]::Zero
Push-Location -LiteralPath $taskRoot
try {
    if ($Mode -eq 'native') { & node $runner --prepare-only } else { & node $runner --mode $Mode --tpm $Tpm }
    if ($LASTEXITCODE -ne 0) { throw 'Local benchmark controls or preflight failed.' }
    if ($PreflightOnly) { return }
    if (-not $env:OPENAI_API_KEY) {
        $secureKey = Read-Host 'OpenAI API key (masked; process memory only)' -AsSecureString
        $keyBuffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyBuffer)
    }
    $runnerArgs = if ($Mode -eq 'native') { @($runner) } else { @($runner, '--mode', $Mode, '--run', '--tpm', "$Tpm") }
    if ($Mode -eq 'native' -and $Resume) { throw 'Native probes do not support resume.' }
    if ($Resume) { $runnerArgs += @('--resume', $Resume) }
    & node @runnerArgs
    if ($LASTEXITCODE -ne 0) { throw 'Benchmark stopped; the report preserves completed attempts and budget reservations.' }
} finally {
    $env:OPENAI_API_KEY = $previousKey
    if ($keyBuffer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyBuffer) }
    if ($secureKey) { $secureKey.Dispose() }
    Pop-Location
}
