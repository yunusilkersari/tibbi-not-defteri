# ============================================================
# Tıbbi Not Defteri - Simge Oluşturucu
# Kaynak PNG'den tüm boyutlarda icon + ICO dosyası üretir
# ============================================================
param(
    [string]$SourcePng
)

Add-Type -AssemblyName System.Drawing

if (-not $SourcePng -or -not (Test-Path $SourcePng)) {
    Write-Host "Kaynak PNG dosyası bulunamadı: $SourcePng" -ForegroundColor Red
    exit 1
}

$scriptDir = $PSScriptRoot
$iconsDir = Join-Path $scriptDir "icons"
$desktopDir = Join-Path $scriptDir "desktop"

if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null }

# PNG'yi yükle
$source = [System.Drawing.Image]::FromFile($SourcePng)

# --- PNG simgeler (16, 32, 48, 128, 256) ---
$sizes = @(16, 32, 48, 128, 256)
foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()

    $outPath = Join-Path $iconsDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "  PNG kaydedildi: icon$size.png ($size x $size)" -ForegroundColor Green
}

# --- ICO dosyası (çoklu boyut: 16, 32, 48, 128, 256) ---
function New-IcoFromPngs {
    param([string]$OutPath, [string[]]$PngPaths)

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    # PNG verilerini oku
    $pngDataList = @()
    foreach ($p in $PngPaths) {
        $pngDataList += ,([System.IO.File]::ReadAllBytes($p))
    }

    $count = $pngDataList.Count
    $headerSize = 6
    $entrySize = 16
    $dataOffset = $headerSize + ($entrySize * $count)

    # ICONDIR header
    $bw.Write([UInt16]0)        # Reserved
    $bw.Write([UInt16]1)        # Type (1 = ICO)
    $bw.Write([UInt16]$count)   # Image count

    # ICONDIRENTRY'ler
    $currentOffset = $dataOffset
    for ($i = 0; $i -lt $count; $i++) {
        $img = [System.Drawing.Image]::FromStream((New-Object System.IO.MemoryStream(,$pngDataList[$i])))
        $w = $img.Width
        $h = $img.Height
        $img.Dispose()

        $bw.Write([Byte]$(if ($w -ge 256) { 0 } else { $w }))   # Width (0 = 256)
        $bw.Write([Byte]$(if ($h -ge 256) { 0 } else { $h }))   # Height
        $bw.Write([Byte]0)                                        # Color palette
        $bw.Write([Byte]0)                                        # Reserved
        $bw.Write([UInt16]1)                                      # Color planes
        $bw.Write([UInt16]32)                                     # Bits per pixel
        $bw.Write([UInt32]$pngDataList[$i].Length)                # Data size
        $bw.Write([UInt32]$currentOffset)                         # Data offset
        $currentOffset += $pngDataList[$i].Length
    }

    # PNG verileri
    for ($i = 0; $i -lt $count; $i++) {
        $bw.Write($pngDataList[$i])
    }

    $bw.Flush()
    [System.IO.File]::WriteAllBytes($OutPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
}

# ICO'yu icons/ ve desktop/ klasörlerine kaydet
$pngFiles = @()
foreach ($size in $sizes) {
    $pngFiles += (Join-Path $iconsDir "icon$size.png")
}

$icoPath1 = Join-Path $desktopDir "defter.ico"
$icoPath2 = Join-Path $iconsDir "defter.ico"

New-IcoFromPngs -OutPath $icoPath1 -PngPaths $pngFiles
Write-Host "  ICO kaydedildi: desktop/defter.ico" -ForegroundColor Green

New-IcoFromPngs -OutPath $icoPath2 -PngPaths $pngFiles
Write-Host "  ICO kaydedildi: icons/defter.ico" -ForegroundColor Green

$source.Dispose()

Write-Host ""
Write-Host "Tüm simgeler başarıyla oluşturuldu!" -ForegroundColor Cyan
