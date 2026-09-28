param([Parameter(Mandatory = $true)][string]$Version)

$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+-candidate\.\d+$') { throw 'CANDIDATE_VERSION_REQUIRED' }
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$zip = Join-Path $root ('.runtime/packages/' + $Version + '.zip')
if (-not (Test-Path -LiteralPath $zip)) { throw 'PACKAGE_ZIP_REQUIRED' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'CSHARP_COMPILER_REQUIRED' }
$target = Join-Path $root ('.runtime/packages/' + $Version + '-setup.exe')
$source = Join-Path $root 'installer/windows/setup.cs'
$temporary = Join-Path $root ('.runtime/packages/' + $Version + '-setup.generated.cs')
$digest = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
try {
  $code = [System.IO.File]::ReadAllText($source, [System.Text.Encoding]::UTF8).Replace('__PAYLOAD_SHA256__', $digest)
  [System.IO.File]::WriteAllText($temporary, $code, (New-Object System.Text.UTF8Encoding($false)))
  & $compiler /nologo /target:exe /platform:x64 "/out:$target" '/reference:System.IO.Compression.dll' '/reference:System.IO.Compression.FileSystem.dll' '/reference:Microsoft.CSharp.dll' "/resource:$zip,Payload.zip" $temporary
  if ($LASTEXITCODE -ne 0) { throw 'SETUP_BUILD_FAILED' }
  $setupHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{Version=$Version;Setup=$target;Sha256=$setupHash;PayloadSha256=$digest} | ConvertTo-Json -Compress
} finally {
  Remove-Item -LiteralPath $temporary -ErrorAction SilentlyContinue
}
