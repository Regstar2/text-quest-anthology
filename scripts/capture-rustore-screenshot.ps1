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

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

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
$localPath = Join-Path $OutputDirectory "$Name.png"

try {
    & $AdbPath shell screencap -p $remotePath
    if ($LASTEXITCODE -ne 0) {
        throw "adb screencap failed."
    }

    & $AdbPath pull $remotePath $localPath
    if ($LASTEXITCODE -ne 0) {
        throw "adb pull failed."
    }
}
finally {
    & $AdbPath shell rm -f $remotePath | Out-Null
}

if (-not (Test-Path $localPath)) {
    throw "Screenshot was not created: $localPath"
}

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($localPath)

try {
    $width = $image.Width
    $height = $image.Height
}
finally {
    $image.Dispose()
}

$file = Get-Item $localPath
if ($file.Length -gt 3MB) {
    Write-Warning "Screenshot is larger than 3 MB and must be reduced before RuStore upload."
}

$portraitNineBySixteen = [math]::Abs(($width / $height) - (9 / 16)) -lt 0.01
$landscapeSixteenByNine = [math]::Abs(($width / $height) - (16 / 9)) -lt 0.01

if (-not $portraitNineBySixteen -and -not $landscapeSixteenByNine) {
    Write-Warning "Screenshot ratio is $($width)x$($height), not 9:16 or 16:9. RuStore may crop it."
}

Write-Host "Screenshot saved: $localPath"
Write-Host "Dimensions: $($width)x$($height); file bytes: $($file.Length)"
Write-Host "Verify manually that Android system UI, debug overlays and third-party ads are not visible."
