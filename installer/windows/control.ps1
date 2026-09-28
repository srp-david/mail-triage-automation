param([ValidateSet('start', 'pause', 'quit')][string]$Action = 'start')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$active = Get-Content -LiteralPath (Join-Path $root 'active.json') -Raw -Encoding utf8 | ConvertFrom-Json
if ($active.version -notmatch '^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$') { throw 'INVALID_VERSION' }
$release = Join-Path (Join-Path $root 'releases') $active.version
$node = Join-Path $release 'node.exe'
$lifecycle = Join-Path $release 'installer/lifecycle.mjs'
$env:TRIAGE_LOCAL_HOME = $root

function Invoke-Local([string[]]$Arguments) {
  & $node @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_CONTROL_FAILED' }
}

try {
  switch ($Action) {
    'start' {
      $manifest = Get-Content -LiteralPath (Join-Path $release 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
      $args = @($lifecycle, 'start', $root)
      if (-not $manifest.releaseApproved) { $args += '--candidate' }
      & $node @args
      if ($LASTEXITCODE -ne 0 -and (Test-Path -LiteralPath (Join-Path $root 'app.lock'))) {
        # recover-lock refuses to remove a lock while its owning process is alive.
        Invoke-Local @($lifecycle, 'recover-lock', $root)
        & $node @args
      }
      if ($LASTEXITCODE -ne 0) { throw 'APP_START_FAILED' }
    }
    'pause' { Invoke-Local -Arguments @($lifecycle, 'pause', $root) }
    'quit' { Invoke-Local @($lifecycle, 'stop', $root) }
  }
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('앱 제어에 실패했습니다. 설치 진단을 확인하세요. (' + $_.Exception.Message + ')', 'Mail Triage') | Out-Null
  exit 1
}
