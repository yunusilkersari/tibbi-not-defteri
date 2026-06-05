Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$tempDir = "$env:TEMP\tnd_icons"

if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::FromArgb(15, 17, 23))

    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 212, 170))
    $cx = [int]($size / 2)
    $cy = [int]($size * 0.42)
    $ch = [int]($size * 0.35)
    $cw = [int]([Math]::Max(2, $size * 0.12))

    $g.FillRectangle($brush, ($cx - [int]($cw/2)), ($cy - [int]($ch/2)), $cw, $ch)
    $g.FillRectangle($brush, ($cx - [int]($ch/2)), ($cy - [int]($cw/2)), $ch, $cw)

    if ($size -ge 32) {
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(108, 99, 255), [Math]::Max(1, $size * 0.025))
        $ly = [int]($size * 0.72)
        for ($i = 0; $i -lt 3; $i++) {
            $y = $ly + $i * [int]($size * 0.08)
            $g.DrawLine($pen, [int]($size * 0.25), $y, [int]($size * 0.75), $y)
        }
        $pen.Dispose()
    }

    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 0, 212, 170), [Math]::Max(1, $size * 0.04))
    $g.DrawRectangle($borderPen, 0, 0, ($size - 1), ($size - 1))
    $borderPen.Dispose()

    $brush.Dispose()
    $g.Dispose()

    $tempPath = Join-Path $tempDir "icon$size.png"
    $bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved to $tempPath"
}

# Copy to target directory
$targetDir = "c:\Uygulamalarım\Tıbbi Not Kayıt ve Düzenleme Sistemi\icons"
foreach ($size in $sizes) {
    $src = Join-Path $tempDir "icon$size.png"
    $dst = Join-Path $targetDir "icon$size.png"
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "Copied icon$size.png to target"
}

Write-Host "All icons ready!"
