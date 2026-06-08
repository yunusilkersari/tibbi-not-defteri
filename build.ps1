# ============================================================
# Tibbi Not Defteri - Build Script
# ------------------------------------------------------------
# Bu script, masaustu uygulamasini dagitima hazir bir
# ZIP paketi olarak derler.
# ============================================================
param(
    [switch]$NoZip
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Tibbi Not Defteri v$version - Build" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- Temizle ---
$distDir = Join-Path $root "dist"
$buildDir = Join-Path $distDir "TibbiNotDefteri"

if (Test-Path $buildDir) {
    Remove-Item $buildDir -Recurse -Force
}
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

Write-Host "[1/6] Build klasoru hazirlaniyor..." -ForegroundColor Yellow

# --- Kopyalanacak dosyalar ---
$desktopFiles = @(
    "desktop\Defter.ps1",
    "desktop\desktop-shim.js",
    "desktop\Baslat.vbs",
    "desktop\Kur.bat",
    "desktop\defter.ico",
    "desktop\README.md"
)

$appFiles = @(
    "app\app.html",
    "app\app.js",
    "app\app.css"
)

$extraFiles = @()
if (Test-Path (Join-Path $root "app\storage.js")) {
    $extraFiles += "app\storage.js"
}

$iconFiles = @(
    "icons\icon16.png",
    "icons\icon32.png",
    "icons\icon48.png",
    "icons\icon128.png",
    "icons\icon256.png",
    "icons\defter.ico"
)

Write-Host "[2/6] Masaustu dosyalari kopyalaniyor..." -ForegroundColor Yellow

$destDesktop = Join-Path $buildDir "desktop"
New-Item -ItemType Directory -Path $destDesktop -Force | Out-Null
foreach ($f in $desktopFiles) {
    $src = Join-Path $root $f
    if (Test-Path $src) {
        $dst = Join-Path $buildDir $f
        $dstDir = Split-Path $dst -Parent
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
        Copy-Item $src $dst -Force
        Write-Host "    + $f" -ForegroundColor DarkGray
    }
}

# lib/ klasorunu kopyala (WebView2 DLL)
$libSrc = Join-Path $root "desktop\lib"
$libDst = Join-Path $buildDir "desktop\lib"
if (Test-Path $libSrc) {
    Copy-Item $libSrc $libDst -Recurse -Force
    Write-Host "    + desktop\lib\ (WebView2)" -ForegroundColor DarkGray
}

Write-Host "[3/6] Uygulama arayuzu kopyalaniyor..." -ForegroundColor Yellow

foreach ($f in ($appFiles + $extraFiles)) {
    $src = Join-Path $root $f
    if (Test-Path $src) {
        $dst = Join-Path $buildDir $f
        $dstDir = Split-Path $dst -Parent
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
        Copy-Item $src $dst -Force
        Write-Host "    + $f" -ForegroundColor DarkGray
    }
}

Write-Host "[4/6] Simgeler kopyalaniyor..." -ForegroundColor Yellow

foreach ($f in $iconFiles) {
    $src = Join-Path $root $f
    if (Test-Path $src) {
        $dst = Join-Path $buildDir $f
        $dstDir = Split-Path $dst -Parent
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
        Copy-Item $src $dst -Force
        Write-Host "    + $f" -ForegroundColor DarkGray
    }
}

Write-Host "[5/6] Baslatici ve kurulum dosyalari olusturuluyor..." -ForegroundColor Yellow

# Kok duzeyinde kolay baslatici
$rootLauncher = '@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" wscript.exe "desktop\Baslat.vbs"'
[System.IO.File]::WriteAllText((Join-Path $buildDir "Baslat.bat"), $rootLauncher, [System.Text.Encoding]::GetEncoding(1254))
Write-Host "    + Baslat.bat" -ForegroundColor DarkGray

# Kok duzeyinde kurulum
$rootInstaller = '@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Tibbi Not Defteri - Kurulum
echo ============================================================
echo.
echo WebView2 bilesenleri kontrol edilecek ve masaustune
echo kisayol olusturulacak. Lutfen bekleyin...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "desktop\Defter.ps1" -Setup
echo.
echo Kurulum tamamlandi. Bu pencereyi kapatabilirsiniz.
pause >nul'
[System.IO.File]::WriteAllText((Join-Path $buildDir "Kur.bat"), $rootInstaller, [System.Text.Encoding]::GetEncoding(1254))
Write-Host "    + Kur.bat" -ForegroundColor DarkGray

# data/ klasoru
New-Item -ItemType Directory -Path (Join-Path $buildDir "data") -Force | Out-Null
Write-Host "    + data\" -ForegroundColor DarkGray

# README
$readmeText = "# Tibbi Not Defteri v" + $version + "`r`n`r`n"
$readmeText += "## Kurulum`r`n`r`n"
$readmeText += "1. Bu klasoru bilgisayarinizda istediginiz yere kopyalayin`r`n"
$readmeText += "2. Kur.bat dosyasina cift tiklayin`r`n"
$readmeText += "   WebView2 bilesenleri kontrol edilir (gerekirse indirilir)`r`n"
$readmeText += "   Masaustune kisayol olusturulur`r`n`r`n"
$readmeText += "## Kullanim`r`n`r`n"
$readmeText += "Masaustundeki Tibbi Not Defteri kisayoluna cift tiklayin`r`n"
$readmeText += "veya Baslat.bat dosyasina cift tiklayin`r`n`r`n"
$readmeText += "## Gereksinimler`r`n`r`n"
$readmeText += "Windows 10/11`r`n"
$readmeText += "Microsoft Edge WebView2 Runtime`r`n"
$readmeText += "PowerShell 5.1+`r`n`r`n"
$readmeText += "## Notlar`r`n`r`n"
$readmeText += "Verileriniz data/notlar.json dosyasinda saklanir`r`n"
$readmeText += "Gunluk yedekler data/backups/ klasorunde tutulur`r`n"
[System.IO.File]::WriteAllText((Join-Path $buildDir "README.md"), $readmeText, [System.Text.Encoding]::UTF8)
Write-Host "    + README.md" -ForegroundColor DarkGray

# --- ZIP ---
Write-Host "[6/6] Paket olusturuluyor..." -ForegroundColor Yellow

if (-not $NoZip) {
    $zipName = "TibbiNotDefteri_v" + $version + ".zip"
    $zipPath = Join-Path $distDir $zipName

    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($buildDir, $zipPath)

    $zipSize = (Get-Item $zipPath).Length
    $zipSizeMB = [math]::Round($zipSize / 1MB, 2)

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  BUILD TAMAMLANDI!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Paket: dist\$zipName" -ForegroundColor White
    Write-Host "  Boyut: $zipSizeMB MB" -ForegroundColor White
    Write-Host "  Yol:   $zipPath" -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  BUILD TAMAMLANDI (ZIP atlanildi)" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Klasor: dist\TibbiNotDefteri\" -ForegroundColor White
    Write-Host ""
}
