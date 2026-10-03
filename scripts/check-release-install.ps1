$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'check-release-install.cjs') @args
if ($LASTEXITCODE -ne 0) { throw 'Release consumer acceptance failed. See the retained consumer directory.' }
