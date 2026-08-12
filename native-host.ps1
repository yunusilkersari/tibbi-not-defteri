<# 
  Tıbbi Not Defteri - Native Messaging Host
  Chrome uzantısından gelen mesajları alıp notlar.json dosyasını günceller
#>

$dataDir = Join-Path $PSScriptRoot "data"
$dataFile = Join-Path $dataDir "notlar.json"
$syncConfigFile = Join-Path $dataDir "sync-config.json"
$syncFileName = "notlar.json"

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

function Get-DiskArchiveInfo {
    $exists = Test-Path $dataFile
    $count = 0
    $bytes = 0
    $modified = $null
    if ($exists) {
        $item = Get-Item $dataFile
        $bytes = [int64]$item.Length
        $modified = $item.LastWriteTimeUtc.ToString("o")
        try { $count = @((Load-Notes)).Count } catch { $count = 0 }
    }
    return @{
        success = $true
        action = "disk-info"
        exists = $exists
        bytes = $bytes
        noteCount = $count
        modifiedAt = $modified
    }
}

function Read-DiskArchiveChunk {
    param($offset, $length)

    if (-not (Test-Path $dataFile)) {
        return @{ success = $false; error = "notlar.json bulunamadi" }
    }

    $safeOffset = [Math]::Max([int64]0, [int64]$offset)
    $safeLength = [Math]::Max([int]1, [Math]::Min([int]$length, [int]600000))
    $bytes = [System.IO.File]::ReadAllBytes($dataFile)
    $total = [int64]$bytes.Length

    if ($safeOffset -ge $total) {
        return @{
            success = $true
            action = "disk-read"
            offset = $safeOffset
            nextOffset = $safeOffset
            totalBytes = $total
            done = $true
            chunk = ""
        }
    }

    $remaining = [int]([Math]::Min([int64]$safeLength, $total - $safeOffset))
    $slice = New-Object byte[] $remaining
    [System.Array]::Copy($bytes, [int]$safeOffset, $slice, 0, $remaining)
    $next = $safeOffset + $remaining

    return @{
        success = $true
        action = "disk-read"
        offset = $safeOffset
        nextOffset = $next
        totalBytes = $total
        done = ($next -ge $total)
        chunk = [System.Convert]::ToBase64String($slice)
    }
}

function Get-DiskNoteCount {
    try { return @((Load-Notes)).Count } catch { return 0 }
}

function Get-ArchiveJsonText {
    if (Test-Path $dataFile) {
        return [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8)
    }
    $data = [ordered]@{
        app = "Tibbi Not Defteri"
        version = "1.1.0"
        savedAt = (Get-Date -Format "o")
        noteCount = 0
        notes = @()
    }
    return ($data | ConvertTo-Json -Depth 10)
}

# ============================================================
# ⚠ 2026-08-09 — AŞAĞIDAKİ GIST BLOĞU ARTIK ÖLÜ KODDUR.
# Bulut senkronu GitHub Gist'ten kendi sunucumuza taşındı; uzantı artık
# "sync-get-config" / "sync-set-config" / "sync-push-disk" mesajlarını HİÇ
# GÖNDERMİYOR (bkz. background.js → sunucuAyariniYukle, chrome.storage'da).
# Bu fonksiyonlar çağrılmıyor; SİLİNMEDİ çünkü native host'un asıl işi
# (Save-Notes / Load-Notes / arşiv okuma) aynı dosyada ve dokunmak gereksiz
# risk. Yeni senkron kodu buraya EKLENMEZ — sunucu tarafındadır.
# ============================================================
function Read-SyncConfig {
    $cfg = [ordered]@{ token = ""; gistId = ""; fileName = $syncFileName }
    if (Test-Path $syncConfigFile) {
        try {
            $raw = [System.IO.File]::ReadAllText($syncConfigFile, [System.Text.Encoding]::UTF8)
            $saved = $raw | ConvertFrom-Json
            if ($saved.token) { $cfg.token = [string]$saved.token }
            if ($saved.gistId) { $cfg.gistId = [string]$saved.gistId }
            if ($saved.fileName) { $cfg.fileName = [string]$saved.fileName }
        } catch {}
    }
    return $cfg
}

function Save-SyncConfig {
    param($cfg)
    $safe = [ordered]@{
        token = [string]$cfg.token
        gistId = [string]$cfg.gistId
        fileName = $(if ($cfg.fileName) { [string]$cfg.fileName } else { $syncFileName })
        updatedAt = (Get-Date -Format "o")
    }
    $json = $safe | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($syncConfigFile, $json, [System.Text.Encoding]::UTF8)
}

function Get-SyncConfigResponse {
    param([switch]$IncludeToken)
    $cfg = Read-SyncConfig
    $resp = [ordered]@{
        success = $true
        action = "sync-config"
        hasToken = -not [string]::IsNullOrWhiteSpace($cfg.token)
        gistId = [string]$cfg.gistId
        fileName = $(if ($cfg.fileName) { [string]$cfg.fileName } else { $syncFileName })
        diskCount = Get-DiskNoteCount
    }
    if ($IncludeToken) { $resp.token = [string]$cfg.token }
    return $resp
}

function Invoke-GitHubJson {
    param(
        [string]$Method,
        [string]$Uri,
        [string]$Token,
        $Body
    )
    if ([string]::IsNullOrWhiteSpace($Token)) { throw "GitHub token yok." }
    $headers = @{
        Authorization = "Bearer $Token"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "TibbiNotDefteri"
    }
    $params = @{
        Uri = $Uri
        Method = $Method
        Headers = $headers
        UseBasicParsing = $true
        ErrorAction = "Stop"
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json; charset=utf-8"
        $params.Body = ($Body | ConvertTo-Json -Depth 20)
    }
    return Invoke-RestMethod @params
}

function Push-DiskArchiveToGist {
    param([switch]$CreateIfMissing)
    $cfg = Read-SyncConfig
    if ([string]::IsNullOrWhiteSpace($cfg.token)) { throw "GitHub token kayitli degil." }

    $fileName = if ($cfg.fileName) { [string]$cfg.fileName } else { $syncFileName }
    $archive = Get-ArchiveJsonText
    $files = @{}
    $files[$fileName] = @{ content = $archive }

    if ([string]::IsNullOrWhiteSpace($cfg.gistId)) {
        if (-not $CreateIfMissing) { throw "Gist ID yok." }
        $body = [ordered]@{
            description = "Tibbi Not Defteri - notlar"
            public = $false
            files = $files
        }
        $created = Invoke-GitHubJson -Method "Post" -Uri "https://api.github.com/gists" -Token $cfg.token -Body $body
        $cfg.gistId = [string]$created.id
        $cfg.fileName = $fileName
        Save-SyncConfig $cfg
    } else {
        $body = [ordered]@{ files = $files }
        Invoke-GitHubJson -Method "Patch" -Uri ("https://api.github.com/gists/" + $cfg.gistId) -Token $cfg.token -Body $body | Out-Null
    }

    return [ordered]@{
        success = $true
        action = "sync-pushed-disk"
        gistId = [string]$cfg.gistId
        fileName = $fileName
        diskCount = Get-DiskNoteCount
    }
}

# ============================================================
# ARSIV KORUMASI: gelen notlari mevcut dosyayla BIRLESTIR (ezme yok)
# id'ye gore birlesim; ayni id'de daha yeni updatedAt kazanir;
# silmeler tombstone (deleted:true) ile tasinir.
# Boylece uzanti reinstall/temizlenince notlar TOPLU SILINMEZ.
# ============================================================
function Get-NoteTicks($n) {
    $s = $null
    if ($n.PSObject.Properties['updatedAt'] -and $n.updatedAt) { $s = $n.updatedAt }
    elseif ($n.PSObject.Properties['createdAt'] -and $n.createdAt) { $s = $n.createdAt }
    if (-not $s) { return [int64]0 }
    try { return [System.DateTimeOffset]::Parse($s, [System.Globalization.CultureInfo]::InvariantCulture).UtcTicks }
    catch { return [int64]0 }
}

function Merge-NotesById($existing, $incoming) {
    $byId = [ordered]@{}
    foreach ($n in @($existing)) { if ($n -and $n.id) { $byId[[string]$n.id] = $n } }
    foreach ($r in @($incoming)) {
        if (-not $r -or -not $r.id) { continue }
        $k = [string]$r.id
        if (-not $byId.Contains($k)) { $byId[$k] = $r; continue }
        # Gelen (uzantinin guncel hali) daha yeni veya esitse onu al
        if ((Get-NoteTicks $r) -ge (Get-NoteTicks $byId[$k])) { $byId[$k] = $r }
    }
    return @($byId.Values)
}

# Ana döngü - Chrome mesajlarını dinle
while ($true) {
    try {
        $message = Read-Message
        if ($null -eq $message) { break }
        
        switch ($message.action) {
            "save" {
                # ARSIV KORUMASI: ezme degil, birlestir
                $existing = Load-Notes
                $merged = Merge-NotesById $existing $message.notes
                Save-Notes $merged
                Send-Message @{ success = $true; action = "saved"; count = @($merged).Count }
            }
            "load" {
                $notes = Load-Notes
                Send-Message @{ success = $true; action = "loaded"; notes = $notes }
            }
            "disk-info" {
                Send-Message (Get-DiskArchiveInfo)
            }
            "disk-read" {
                Send-Message (Read-DiskArchiveChunk $message.offset $message.length)
            }
            "ping" {
                Send-Message @{ success = $true; action = "pong" }
            }
            "sync-get-config" {
                Send-Message (Get-SyncConfigResponse -IncludeToken)
            }
            "sync-set-config" {
                $cfg = Read-SyncConfig
                if ($message.PSObject.Properties['token'] -and -not [string]::IsNullOrWhiteSpace([string]$message.token)) {
                    $cfg.token = [string]$message.token
                }
                if ($message.PSObject.Properties['gistId']) {
                    $cfg.gistId = [string]$message.gistId
                }
                if ($message.PSObject.Properties['fileName'] -and -not [string]::IsNullOrWhiteSpace([string]$message.fileName)) {
                    $cfg.fileName = [string]$message.fileName
                }
                if (-not $cfg.fileName) { $cfg.fileName = $syncFileName }
                Save-SyncConfig $cfg
                Send-Message (Get-SyncConfigResponse -IncludeToken)
            }
            "sync-clear-config" {
                if (Test-Path $syncConfigFile) { Remove-Item $syncConfigFile -Force -ErrorAction SilentlyContinue }
                Send-Message @{ success = $true; action = "sync-cleared"; hasToken = $false; gistId = ""; fileName = $syncFileName; diskCount = (Get-DiskNoteCount) }
            }
            "sync-push-disk" {
                Send-Message (Push-DiskArchiveToGist -CreateIfMissing)
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
