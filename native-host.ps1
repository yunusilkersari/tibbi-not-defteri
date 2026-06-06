<# 
  Tıbbi Not Defteri - Native Messaging Host
  Chrome uzantısından gelen mesajları alıp notlar.json dosyasını günceller
#>

$dataDir = Join-Path $PSScriptRoot "data"
$dataFile = Join-Path $dataDir "notlar.json"

# data klasörünü oluştur
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

function Read-Message {
    # Chrome native messaging protokolü: 4 byte uzunluk + JSON
    $lengthBytes = New-Object byte[] 4
    $stdin = [System.Console]::OpenStandardInput()
    $bytesRead = $stdin.Read($lengthBytes, 0, 4)
    
    if ($bytesRead -eq 0) { return $null }
    
    $length = [System.BitConverter]::ToInt32($lengthBytes, 0)
    
    if ($length -le 0 -or $length -gt 10485760) { return $null }
    
    $messageBytes = New-Object byte[] $length
    $totalRead = 0
    while ($totalRead -lt $length) {
        $read = $stdin.Read($messageBytes, $totalRead, $length - $totalRead)
        if ($read -eq 0) { break }
        $totalRead += $read
    }
    
    $messageText = [System.Text.Encoding]::UTF8.GetString($messageBytes, 0, $totalRead)
    return $messageText | ConvertFrom-Json
}

function Send-Message {
    param($response)
    
    $json = $response | ConvertTo-Json -Compress -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $length = [System.BitConverter]::GetBytes([int]$bytes.Length)
    
    $stdout = [System.Console]::OpenStandardOutput()
    $stdout.Write($length, 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

function Save-Notes {
    param($notes)

    $count = @($notes).Count
    $data = [ordered]@{
        app = "Tıbbi Not Defteri"
        version = "1.1.0"
        savedAt = (Get-Date -Format "o")
        noteCount = $count
        notes = $notes
    }

    $json = $data | ConvertTo-Json -Depth 10
    $tmpFile = "$dataFile.tmp"
    $bakFile = "$dataFile.bak"

    # Önce geçici dosyaya yaz; yarıda kalan yazım ana dosyayı bozmasın
    [System.IO.File]::WriteAllText($tmpFile, $json, [System.Text.Encoding]::UTF8)

    if (Test-Path $dataFile) {
        # Atomik değiştir + önceki sürümü .bak olarak sakla (veri kurtarma için)
        [System.IO.File]::Replace($tmpFile, $dataFile, $bakFile)
    } else {
        [System.IO.File]::Move($tmpFile, $dataFile)
    }

    # Günlük tarihli yedek: data/backups/notlar-YYYY-MM-DD.json
    # Aynı gün üzerine yazılır; eski günlerin yedekleri korunur, silinmez.
    $backupDir = Join-Path $dataDir "backups"
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    $dayFile = Join-Path $backupDir ("notlar-" + (Get-Date -Format "yyyy-MM-dd") + ".json")
    [System.IO.File]::WriteAllText($dayFile, $json, [System.Text.Encoding]::UTF8)
}

function Load-Notes {
    if (Test-Path $dataFile) {
        $content = [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8)
        $data = $content | ConvertFrom-Json
        return $data.notes
    }
    return @()
}

# Ana döngü - Chrome mesajlarını dinle
while ($true) {
    try {
        $message = Read-Message
        if ($null -eq $message) { break }
        
        switch ($message.action) {
            "save" {
                Save-Notes $message.notes
                Send-Message @{ success = $true; action = "saved"; count = $message.notes.Count }
            }
            "load" {
                $notes = Load-Notes
                Send-Message @{ success = $true; action = "loaded"; notes = $notes }
            }
            "ping" {
                Send-Message @{ success = $true; action = "pong" }
            }
            default {
                Send-Message @{ success = $false; error = "Unknown action" }
            }
        }
    }
    catch {
        try {
            Send-Message @{ success = $false; error = $_.Exception.Message }
        } catch { break }
    }
}
