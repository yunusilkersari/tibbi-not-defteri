<#
  Tıbbi Not Defteri - Kurulum Scripti
  Native Messaging Host'u Windows Registry'ye kaydeder.
  
  Kullanım: PowerShell'de sağ tık > "Run with PowerShell" 
  veya: powershell -ExecutionPolicy Bypass -File setup.ps1
#>

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Tibbi Not Defteri - Kurulum" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Uzantı ID'sini al
Write-Host "[1/3] Chrome uzanti ID'si gerekiyor." -ForegroundColor Yellow
Write-Host "  Chrome'da chrome://extensions sayfasina gidin" -ForegroundColor Gray
Write-Host "  'Tibbi Not Defteri' uzantisinin ID'sini kopyalayin" -ForegroundColor Gray
Write-Host "  (ornek: abcdefghijklmnopqrstuvwxyz123456)" -ForegroundColor Gray
Write-Host ""

$extensionId = Read-Host "Uzanti ID'sini yapin"
$extensionId = $extensionId.Trim()

if ($extensionId.Length -lt 10) {
    Write-Host "HATA: Gecersiz uzanti ID'si!" -ForegroundColor Red
    Read-Host "Cikmak icin Enter'a basin"
    exit 1
}

# 2. Native messaging manifest'i güncelle
Write-Host ""
Write-Host "[2/3] Native messaging manifest guncelleniyor..." -ForegroundColor Yellow

$manifestPath = Join-Path $PSScriptRoot "com.tibbi.notdefteri.json"
$batPath = Join-Path $PSScriptRoot "native-host.bat"

$manifest = @{
    name = "com.tibbi.notdefteri"
    description = "Tibbi Not Defteri - Yerel dosya kaydetme servisi"
    path = $batPath
    type = "stdio"
    allowed_origins = @("chrome-extension://$extensionId/")
}

$manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "  Manifest guncellendi: $manifestPath" -ForegroundColor Green

# 3. Registry'ye kaydet
Write-Host ""
Write-Host "[3/3] Windows Registry'ye kaydediliyor..." -ForegroundColor Yellow

$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tibbi.notdefteri"

if (-not (Test-Path (Split-Path $regPath))) {
    New-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts" -Force | Out-Null
}

New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath

Write-Host "  Registry kaydedildi!" -ForegroundColor Green

# 4. Data klasörünü oluştur
$dataDir = Join-Path $PSScriptRoot "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Host "  data/ klasoru olusturuldu" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  KURULUM TAMAMLANDI!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Simdi Chrome'u tamamen kapatip yeniden acin." -ForegroundColor Yellow
Write-Host "  Notlariniz otomatik olarak su dosyaya kaydedilecek:" -ForegroundColor Gray
Write-Host "  $dataDir\notlar.json" -ForegroundColor Cyan
Write-Host ""

Read-Host "Cikmak icin Enter'a basin"
