param(
    [string]$SourcePath,
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $SourcePath = Join-Path $RepoRoot "android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png"
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $RepoRoot "dist\rustore\icon-512.png"
}

$SourcePath = (Resolve-Path $SourcePath).Path
$OutputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($SourcePath)
$target = $null
$graphics = $null

try {
    if ($source.Width -ne $source.Height) {
        throw "Source icon must be square. Actual size: $($source.Width)x$($source.Height)."
    }

    $target = [System.Drawing.Bitmap]::new(
        512,
        512,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )

    $graphics = [System.Drawing.Graphics]::FromImage($target)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $corner = $source.GetPixel(0, 0)
    $background = [System.Drawing.Color]::FromArgb($corner.R, $corner.G, $corner.B)
    $graphics.Clear($background)
    $graphics.DrawImage($source, 0, 0, 512, 512)

    $target.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    if ($graphics -ne $null) {
        $graphics.Dispose()
    }
    if ($target -ne $null) {
        $target.Dispose()
    }
    $source.Dispose()
}

$check = [System.Drawing.Image]::FromFile($OutputPath)
try {
    if ($check.Width -ne 512 -or $check.Height -ne 512) {
        throw "Generated icon has invalid dimensions: $($check.Width)x$($check.Height)."
    }
}
finally {
    $check.Dispose()
}

$file = Get-Item $OutputPath
if ($file.Length -gt 3MB) {
    throw "Generated icon is larger than 3 MB: $($file.Length) bytes."
}

Write-Host "RuStore icon exported: $OutputPath"
Write-Host "Size: 512x512; file bytes: $($file.Length)"
Write-Host "Before submission, compare it visually with the installed launcher icon."
