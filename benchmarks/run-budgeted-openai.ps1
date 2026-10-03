param([switch]$PreflightOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
$previousKey = $env:OPENAI_API_KEY
$keyBuffer = [IntPtr]::Zero
try {
    & node (Join-Path $PSScriptRoot 'run-budgeted-openai.js')
    if ($LASTEXITCODE -ne 0) { throw 'Benchmark preflight failed.' }
    if ($PreflightOnly) { return }
    if (-not $env:OPENAI_API_KEY) {
        $secureKey = Read-Host 'OpenAI API key (masked; kept only for this process)' -AsSecureString
        $keyBuffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyBuffer)
    }
    & node (Join-Path $PSScriptRoot 'run-budgeted-openai.js') --run
    if ($LASTEXITCODE -ne 0) { throw 'Benchmark completed with errors; inspect the saved report.' }
} finally {
    $env:OPENAI_API_KEY = $previousKey
    if ($keyBuffer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyBuffer) }
    if ($secureKey) { $secureKey.Dispose() }
    Pop-Location
}
