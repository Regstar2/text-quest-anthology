param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9]{2}_[a-z0-9_-]+$")]
    [string]$Name,

    [string]$AdbPath,

    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($AdbPath)) {
    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCommand) {
        $AdbPath = $adbCommand.Source
    }
    else {
        $defaultAdb = "C:\Android\Sdk\platform-tools\adb.exe"
        if (Test-Path $defaultAdb) {
            $AdbPath = $defaultAdb
        }
        else {
            throw "adb was not found in PATH or at C:\Android\Sdk\platform-tools\adb.exe."
        }
    }
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $RepoRoot "dist\rustore\screenshots"
}

$rawDirectory = Join-Path $OutputDirectory "raw"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $rawDirectory | Out-Null

$devices = @(
    & $AdbPath devices |
        Select-Object -Skip 1 |
        Where-Object { $_ -match "\tdevice$" }
)

if ($LASTEXITCODE -ne 0) {
    throw "adb devices failed."
}

if ($devices.Count -ne 1) {
    throw "Expected exactly one connected Android device in 'device' state. Found: $($devices.Count)."
}

$remotePath = "/sdcard/$Name.png"
$rawPath = Join-Path $rawDirectory "$Name.png"
$storePath = Join-Path $OutputDirectory "$Name.png"

try {
    & $AdbPath shell screencap -p $remotePath
    if ($LASTEXITCODE -ne 0) {
        throw "adb screencap failed."
    }

    & $AdbPath pull $remotePath $rawPath
    if ($LASTEXITCODE -ne 0) {
        throw "adb pull failed."
    }
}
finally {
    & $AdbPath shell rm -f $remotePath | Out-Null
}

if (-not (Test-Path $rawPath)) {
    throw "Screenshot was not created: $rawPath"
}

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($rawPath)
$target = $null
$graphics = $null

try {
    $width = $source.Width
    $height = $source.Height

    if ($height -ge $width) {
        $targetWidth = $width
        $targetHeight = [int][math]::Round($width * 16 / 9)

        if ($height -lt $targetHeight) {
            throw "Portrait screenshot is too short to crop to 9:16: $($width)x$($height)."
        }

        $cropX = 0
        $cropY = [int][math]::Floor(($height - $targetHeight) / 2)
    }
    else {
        $targetHeight = $height
        $targetWidth = [int][math]::Round($height * 16 / 9)

        if ($width -lt $targetWidth) {
            throw "Landscape screenshot is too narrow to crop to 16:9: $($width)x$($height)."
        }

        $cropX = [int][math]::Floor(($width - $targetWidth) / 2)
        $cropY = 0
    }

    $target = [System.Drawing.Bitmap]::new(
        $targetWidth,
        $targetHeight,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )

    $graphics = [System.Drawing.Graphics]::FromImage($target)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $destination = [System.Drawing.Rectangle]::new(0, 0, $targetWidth, $targetHeight)
    $sourceRect = [System.Drawing.Rectangle]::new($cropX, $cropY, $targetWidth, $targetHeight)
    $graphics.DrawImage(
        $source,
        $destination,
        $sourceRect,
        [System.Drawing.GraphicsUnit]::Pixel
    )

    $target.Save($storePath, [System.Drawing.Imaging.ImageFormat]::Png)
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

$file = Get-Item $storePath
if ($file.Length -gt 3MB) {
    throw "Prepared phone screenshot is larger than 3 MB: $($file.Length) bytes."
}

$check = [System.Drawing.Image]::FromFile($storePath)
try {
    $preparedWidth = $check.Width
    $preparedHeight = $check.Height
}
finally {
    $check.Dispose()
}

Write-Host "Raw screenshot saved: $rawPath"
Write-Host "RuStore screenshot saved: $storePath"
Write-Host "Prepared dimensions: $($preparedWidth)x$($preparedHeight); file bytes: $($file.Length)"
Write-Host "Crop is centered. Verify manually that important UI, Android system UI, debug overlays and third-party ads are not visible."
