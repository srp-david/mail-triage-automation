param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$destination = (Resolve-Path -LiteralPath $OutputDirectory).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'CSHARP_COMPILER_REQUIRED' }
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class TriageIconHandle { [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle); }'
$bitmap = New-Object System.Drawing.Bitmap(32,32)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34,102,89))
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White,2)
$iconPath = Join-Path $destination 'mail-triage.ico'
try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.FillEllipse($brush,0,0,32,32)
  $graphics.DrawRectangle($pen,6,10,20,13)
  $graphics.DrawLine($pen,6,10,16,18)
  $graphics.DrawLine($pen,16,18,26,10)
  $handle = $bitmap.GetHicon()
  try {
    $icon = [System.Drawing.Icon]::FromHandle($handle)
    $stream = [System.IO.File]::Create($iconPath)
    try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose() }
  } finally { [void][TriageIconHandle]::DestroyIcon($handle) }
} finally { $graphics.Dispose(); $bitmap.Dispose(); $brush.Dispose(); $pen.Dispose() }
$source = Join-Path $PSScriptRoot '../installer/windows/tray.cs'
$output = Join-Path $destination 'mail-triage-tray.exe'
& $compiler /nologo /target:winexe /platform:x64 "/out:$output" "/win32icon:$iconPath" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll $source
if ($LASTEXITCODE -ne 0) { throw 'TRAY_BUILD_FAILED' }
Write-Output 'Windows tray build completed'
