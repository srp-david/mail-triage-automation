param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'MailTriage'))
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $InstallRoot).Path
$active = Get-Content -LiteralPath (Join-Path $root 'active.json') -Raw | ConvertFrom-Json
if ($active.version -notmatch '^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$') { throw 'Invalid release version' }
$release = Join-Path (Join-Path $root 'releases') $active.version
$manifest = Get-Content -LiteralPath (Join-Path $release 'manifest.json') -Raw | ConvertFrom-Json
if (-not $manifest.releaseApproved) { throw '검증 후보입니다. 전체 로그인/UI/Runner 연결과 팀 PC 검증 후 배포할 수 있습니다.' }
$env:TRIAGE_LOCAL_HOME = $root
& (Join-Path $release 'node.exe') (Join-Path $release 'installer/lifecycle.mjs') start $root
if ($LASTEXITCODE -ne 0) { throw '분석실을 열지 못했습니다. 설치 진단을 실행하세요.' }
