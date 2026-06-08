param(
    [switch]$Setup   # -Setup: WebView2 dosyalarini indirir + masaustu kisayolu olusturur, pencere acmadan ciker
)

# ============================================================
# Tibbi Not Defteri - Masaustu Uygulamasi (WebView2 host)
# ------------------------------------------------------------
# Uzanti ile AYNI data/notlar.json dosyasini kullanir; boylece
# deftere kaydedilen her not bu pencerede de gorunur (cift yonlu,
# canli senkron). Arayuz app/app.html'in birebir aynisidir.
# ============================================================

# --- Uygulama adi (encoding-safe Unicode) ---
$script:AppTitle = "T" + [char]0x131 + "bbi Not Defteri"

# --- Yollar ---
$scriptDir = $PSScriptRoot
$root      = Split-Path $scriptDir -Parent            # proje koku
$dataDir   = Join-Path $root "data"
$dataFile  = Join-Path $dataDir "notlar.json"
$appHtml   = Join-Path $root "app\app.html"
$shimPath  = Join-Path $scriptDir "desktop-shim.js"
$runtimeDir = Join-Path $scriptDir "runtime"
$runtimeHtml = Join-Path $runtimeDir "app.html"
$libDir    = Join-Path $scriptDir "lib"
$udf       = Join-Path $env:LOCALAPPDATA "TibbiNotDefteri\WebView2"

$coreDll   = Join-Path $libDir "Microsoft.Web.WebView2.Core.dll"
$wfDll     = Join-Path $libDir "Microsoft.Web.WebView2.WinForms.dll"
$loaderDll = Join-Path $libDir "WebView2Loader.dll"

# data klasoru garanti
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

# ============================================================
# JSON yardimcilari (notlar.json formati uzanti ile birebir ayni)
# ============================================================
function ConvertTo-NotesArrayJson($arr) {
    $a = @($arr)
    if ($a.Count -eq 0) { return '[]' }
    $json = ConvertTo-Json -InputObject $a -Depth 12 -Compress
    if ($a.Count -eq 1) { $json = '[' + $json + ']' }  # PS 5.1 tek elemani array yapmaz
    return $json
}

function Load-NotesJson {
    if (-not (Test-Path $dataFile)) { return @() }
    try {
        $content = [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8)
        if ([string]::IsNullOrWhiteSpace($content)) { return @() }
        $data = $content | ConvertFrom-Json
        if ($null -eq $data.notes) { return @() }
        return $data.notes
    } catch {
        # Bozuk dosya: yedekten kurtarmayi dene
        $bak = "$dataFile.bak"
        if (Test-Path $bak) {
            try {
                $c = [System.IO.File]::ReadAllText($bak, [System.Text.Encoding]::UTF8)
                return ($c | ConvertFrom-Json).notes
            } catch {}
        }
        return @()
    }
}

function Save-NotesJson($notes) {
    $arr = @($notes)
    $notesJson = ConvertTo-NotesArrayJson $arr
    $savedAt = (Get-Date -Format "o")
    # Tam dosyayi elle kur (notes blogu tutarli serilesir)
    $full = '{"app":"' + $script:AppTitle + '","version":"1.1.0","savedAt":"' + $savedAt + '","noteCount":' + $arr.Count + ',"notes":' + $notesJson + '}'

    $tmpFile = "$dataFile.tmp"
    $bakFile = "$dataFile.bak"
    [System.IO.File]::WriteAllText($tmpFile, $full, [System.Text.Encoding]::UTF8)
    if (Test-Path $dataFile) {
        [System.IO.File]::Replace($tmpFile, $dataFile, $bakFile)
    } else {
        [System.IO.File]::Move($tmpFile, $dataFile)
    }

    # Gunluk tarihli yedek
    $backupDir = Join-Path $dataDir "backups"
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Force -Path $backupDir | Out-Null }
    $dayFile = Join-Path $backupDir ("notlar-" + (Get-Date -Format "yyyy-MM-dd") + ".json")
    [System.IO.File]::WriteAllText($dayFile, $full, [System.Text.Encoding]::UTF8)
}

function Get-DataWrite {
    if (Test-Path $dataFile) { return [System.IO.File]::GetLastWriteTimeUtc($dataFile).Ticks }
    return $null
}

# JS'e gomulecek baslangic verisi: window.__DEFTER_INITIAL__ = { notes: [...] }
function New-Prelude($notes) {
    $inner = ConvertTo-NotesArrayJson $notes
    $innerLiteral = ConvertTo-Json -InputObject $inner -Compress   # guvenli JS string literali
    return "window.__DEFTER_INITIAL__ = { notes: JSON.parse($innerLiteral) };"
}

# JS'e gonderilecek senkron mesaji: {"type":"sync","notes":[...]}
function New-SyncPayload($notes) {
    return '{"type":"sync","notes":' + (ConvertTo-NotesArrayJson $notes) + '}'
}

function New-DesktopRuntimeHtml {
    if (-not (Test-Path $appHtml)) { throw "app.html bulunamadi: $appHtml" }
    if (-not (Test-Path $shimPath)) { throw "desktop-shim.js bulunamadi: $shimPath" }
    if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null }

    $html = [System.IO.File]::ReadAllText($appHtml, [System.Text.Encoding]::UTF8)
    if ($html -notmatch '<script\s+src="storage\.js"></script>') {
        throw "app.html icinde beklenen storage.js script satiri bulunamadi."
    }

    # Runtime page lives under /.desktop-runtime/, so set a base URL that keeps
    # app.css/storage.js/app.js resolving from /app/. The desktop shim is loaded
    # explicitly before storage.js instead of relying on WebView2 script injection.
    $baseTag = '  <base href="https://defter.local/app/">' + "`r`n"
    if ($html -notmatch '<base\s+') {
        $html = $html -replace '<head>', ("<head>`r`n" + $baseTag)
    }

    $desktopBoot = @'
  <script>
    window.__DEFTER_DATA_URL__ = "https://defter.local/data/notlar.json";
  </script>
  <script src="/desktop/desktop-shim.js"></script>
'@
    $html = $html -replace '  <script src="storage.js"></script>', ($desktopBoot + "`r`n  <script src=""storage.js""></script>")
    [System.IO.File]::WriteAllText($runtimeHtml, $html, [System.Text.Encoding]::UTF8)
    return $runtimeHtml
}

# ============================================================
# WebView2 .NET dosyalari (gerekirse NuGet'ten indir)
# ============================================================
function Ensure-WebView2Dlls {
    if ((Test-Path $coreDll) -and (Test-Path $wfDll) -and (Test-Path $loaderDll)) { return $true }

    Write-Host "WebView2 bilesenleri indiriliyor (tek seferlik, ~4 MB)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $libDir | Out-Null
    $tmp = Join-Path $env:TEMP ("wv2_" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp "webview2.zip"

    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2" -OutFile $zip -UseBasicParsing -ErrorAction Stop
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)

        # net4x managed DLL'leri bul
        $core = Get-ChildItem -Path (Join-Path $tmp "lib") -Recurse -Filter "Microsoft.Web.WebView2.Core.dll" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'net4' } | Select-Object -First 1
        if (-not $core) { $core = Get-ChildItem -Path (Join-Path $tmp "lib") -Recurse -Filter "Microsoft.Web.WebView2.Core.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 }
        $wf = Get-ChildItem -Path (Join-Path $tmp "lib") -Recurse -Filter "Microsoft.Web.WebView2.WinForms.dll" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'net4' } | Select-Object -First 1
        if (-not $wf) { $wf = Get-ChildItem -Path (Join-Path $tmp "lib") -Recurse -Filter "Microsoft.Web.WebView2.WinForms.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 }

        # Islemci mimarisine uygun native loader
        $arch = $env:PROCESSOR_ARCHITECTURE
        $rid = switch ($arch) { 'AMD64' { 'win-x64' } 'x86' { 'win-x86' } 'ARM64' { 'win-arm64' } default { 'win-x64' } }
        $loader = Get-ChildItem -Path (Join-Path $tmp "runtimes") -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match $rid } | Select-Object -First 1
        if (-not $loader) { $loader = Get-ChildItem -Path (Join-Path $tmp "runtimes") -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 }

        if (-not $core -or -not $wf -or -not $loader) { throw "WebView2 DLL'leri pakette bulunamadi." }

        Copy-Item $core.FullName   $coreDll   -Force
        Copy-Item $wf.FullName     $wfDll     -Force
        Copy-Item $loader.FullName $loaderDll -Force
        Write-Host "WebView2 bilesenleri hazir." -ForegroundColor Green
        return $true
    } catch {
        throw "WebView2 indirilemedi: $($_.Exception.Message)"
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================
# Masaustu kisayolu olustur
# ============================================================
function New-DesktopShortcut {
    try {
        $desktop = [System.Environment]::GetFolderPath('Desktop')
        $lnk = Join-Path $desktop ($script:AppTitle + ".lnk")
        $ps1 = Join-Path $scriptDir "Defter.ps1"
        $ws = New-Object -ComObject WScript.Shell
        $sc = $ws.CreateShortcut($lnk)
        $sc.TargetPath = "powershell.exe"
        $sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "' + $ps1 + '"'
        $sc.WorkingDirectory = $scriptDir
        $sc.WindowStyle = 7
        $ico = Join-Path $scriptDir "defter.ico"
        if (Test-Path $ico) { $sc.IconLocation = $ico }
        $sc.Description = $script:AppTitle + " - Masaustu"
        $sc.Save()
        Write-Host "Masaustu kisayolu olusturuldu: $lnk" -ForegroundColor Green
    } catch {
        Write-Warning "Kisayol olusturulamadi: $($_.Exception.Message)"
    }
}

# icons/icon128.png -> defter.ico (kisayol/pencere ikonu icin)
function Ensure-Icon {
    $ico = Join-Path $scriptDir "defter.ico"
    if (Test-Path $ico) { return $ico }
    $png = Join-Path $root "icons\icon128.png"
    if (-not (Test-Path $png)) { return $null }
    try {
        $pngBytes = [System.IO.File]::ReadAllBytes($png)
        $ms = New-Object System.IO.MemoryStream
        $bw = New-Object System.IO.BinaryWriter($ms)
        # ICONDIR
        $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
        # ICONDIRENTRY (128x128 -> genislik/yukseklik 128)
        $bw.Write([Byte]128); $bw.Write([Byte]128); $bw.Write([Byte]0); $bw.Write([Byte]0)
        $bw.Write([UInt16]1); $bw.Write([UInt16]32)
        $bw.Write([UInt32]$pngBytes.Length); $bw.Write([UInt32]22)
        $bw.Write($pngBytes)
        $bw.Flush()
        [System.IO.File]::WriteAllBytes($ico, $ms.ToArray())
        $bw.Dispose(); $ms.Dispose()
        return $ico
    } catch { return $null }
}

# ============================================================
# -Setup modu: indir + ikon + kisayol, sonra cik
# ============================================================
if ($Setup) {
    # Eski bozuk kisayolu sil
    try {
        $desktop = [System.Environment]::GetFolderPath('Desktop')
        $oldBad = Join-Path $desktop "T*bbi Not Defteri.lnk"
        Get-ChildItem $desktop -Filter "*Not Defteri.lnk" | ForEach-Object {
            if ($_.Name -ne ($script:AppTitle + ".lnk")) {
                Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}

    try {
        Ensure-WebView2Dlls | Out-Null
        Ensure-Icon | Out-Null
        New-DesktopShortcut
        Write-Host ""
        Write-Host "Kurulum tamamlandi. Artik masaustundeki kisayoldan acabilirsiniz." -ForegroundColor Green
    } catch {
        Write-Host "Kurulum hatasi: $($_.Exception.Message)" -ForegroundColor Red
    }
    return
}

# ============================================================
# Normal baslatma
# ============================================================

# --- PowerShell konsol penceresini hemen gizle + gorev cubugundan kaldir ---
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ConsoleHelper {
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern void SetCurrentProcessExplicitAppUserModelID(
        [MarshalAs(UnmanagedType.LPWStr)] string AppID);
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_APPWINDOW = 0x00040000;
}
'@ -ErrorAction SilentlyContinue

    # Uygulamayi Windows'a ayri bir uygulama olarak tanimla
    # Boylece gorev cubugunda PowerShell degil kendi ikonumuzu gosterir
    [ConsoleHelper]::SetCurrentProcessExplicitAppUserModelID("TibbiNotDefteri.Desktop.1.0")

    $consoleHwnd = [ConsoleHelper]::GetConsoleWindow()
    if ($consoleHwnd -ne [IntPtr]::Zero) {
        # Gorev cubugundan tamamen kaldir (ONCE style degistir, SONRA gizle)
        $exStyle = [ConsoleHelper]::GetWindowLong($consoleHwnd, [ConsoleHelper]::GWL_EXSTYLE)
        $exStyle = $exStyle -bor [ConsoleHelper]::WS_EX_TOOLWINDOW
        $exStyle = $exStyle -band (-bnot [ConsoleHelper]::WS_EX_APPWINDOW)
        [ConsoleHelper]::SetWindowLong($consoleHwnd, [ConsoleHelper]::GWL_EXSTYLE, $exStyle) | Out-Null
        [ConsoleHelper]::ShowWindow($consoleHwnd, 0) | Out-Null  # SW_HIDE = 0
    }
} catch {}

# Tek instance: zaten aciksa var olan pencereyi one getir ve cik
$createdNew = $false
$script:appMutex = New-Object System.Threading.Mutex($true, "Global\TibbiNotDefteri_Desktop_v2", [ref]$createdNew)
if (-not $createdNew) {
    try {
        Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Win32{[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr FindWindow(string c,string n);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);}' -ErrorAction SilentlyContinue
        $h = [Win32]::FindWindow($null, $script:AppTitle)
        if ($h -ne [IntPtr]::Zero) { [Win32]::ShowWindow($h, 9) | Out-Null; [Win32]::SetForegroundWindow($h) | Out-Null }
    } catch {}
    return
}

try {
    Ensure-WebView2Dlls | Out-Null
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "WebView2 bilesenleri hazirlanamadi.`n`n$($_.Exception.Message)`n`nInternet baglantinizi kontrol edip tekrar deneyin.",
        $script:AppTitle, 'OK', 'Error') | Out-Null
    return
}

# DPI farkindaligi (keskin gorunum)
try {
    Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class DpiAware{[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();}' -ErrorAction SilentlyContinue
    [DpiAware]::SetProcessDPIAware() | Out-Null
} catch {}

# Native loader'in bulunmasi icin lib'i yola ekle
$env:Path = $libDir + ";" + $env:Path
[System.IO.Directory]::SetCurrentDirectory($libDir)

Add-Type -Path $coreDll
Add-Type -Path $wfDll
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# --- Pencere ---
$form = New-Object System.Windows.Forms.Form
$form.Text = $script:AppTitle
$form.Width = 1450
$form.Height = 920
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = New-Object System.Drawing.Size(900, 600)
$form.BackColor = [System.Drawing.Color]::FromArgb(13, 17, 23)
$form.Opacity = 0  # icerik yuklenene kadar gorunmez

# Pencere/gorev cubugu ikonu
try {
    $icoPath = Ensure-Icon
    if ($icoPath -and (Test-Path $icoPath)) {
        $form.Icon = New-Object System.Drawing.Icon($icoPath)
    }
} catch {}

# --- WebView2 kontrolu ---
$web = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$web.Dock = [System.Windows.Forms.DockStyle]::Fill
$cp = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$cp.UserDataFolder = $udf
$web.CreationProperties = $cp
$form.Controls.Add($web)

# Paylasilan durum
$script:core = $null
$script:lastKnownWrite = Get-DataWrite

# Uygulamayi sanal host'tan ac (ayni origin'den fetch icin sart)
$appUri = "https://defter.local/desktop/runtime/app.html"

# WebView2 hazir olunca
$web.add_CoreWebView2InitializationCompleted({
    param($sender, $e)
    if (-not $e.IsSuccess) {
        [System.Windows.Forms.MessageBox]::Show(
            "WebView2 baslatilamadi:`n$($e.InitializationException.Message)",
            $script:AppTitle, 'OK', 'Error') | Out-Null
        return
    }
    $script:core = $sender.CoreWebView2

    # Ayarlar
    try {
        $st = $script:core.Settings
        $st.IsStatusBarEnabled = $false
        $st.AreDevToolsEnabled = $true
        $st.IsZoomControlEnabled = $true
    } catch {}

    # Proje klasorunu sanal host olarak yayinla: https://defter.local/...
    # Boylece shim notlari fetch ile ceker (postMessage/script boyut siniri YOK).
    try {
        $script:core.SetVirtualHostNameToFolderMapping(
            "defter.local", $root,
            [Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind]::Allow)
    } catch {}

    # JS -> PowerShell mesajlari (kaydet / yukle)
    $script:core.add_WebMessageReceived({
        param($s2, $ev)
        try {
            $str = $ev.TryGetWebMessageAsString()
            if ([string]::IsNullOrEmpty($str)) { return }
            $msg = $str | ConvertFrom-Json
            switch ($msg.type) {
                'save' {
                    Save-NotesJson $msg.notes
                    $script:lastKnownWrite = Get-DataWrite   # kendi yazimimizi isaretle
                }
                'load' {
                    $notes = Load-NotesJson
                    $script:lastKnownWrite = Get-DataWrite
                    $script:core.PostWebMessageAsJson((New-SyncPayload $notes))
                }
            }
        } catch {}
    })

    # Web icerigi tam ekran istediginde (requestFullscreen) pencereyi GERCEK tam ekran yap.
    # WebView2 icerigi fullscreen moduna alir ama host penceresini buyutmez; bu yuzden
    # taskbar gorunur kalir. ContainsFullScreenElementChanged ile pencereyi taskbar dahil
    # tum ekrana alir, cikista eski haline dondururuz.
    $script:fsActive = $false
    $script:core.add_ContainsFullScreenElementChanged({
        param($s3, $e3)
        try {
            if ($script:core.ContainsFullScreenElement) {
                if (-not $script:fsActive) {
                    $script:fsPrevBounds = $form.Bounds
                    $script:fsPrevState  = $form.WindowState
                    $script:fsPrevBorder = $form.FormBorderStyle
                    $script:fsActive = $true
                }
                if ($form.WindowState -eq 'Maximized') { $form.WindowState = 'Normal' }
                $form.FormBorderStyle = 'None'
                $form.Bounds = ([System.Windows.Forms.Screen]::FromControl($form)).Bounds
                $form.TopMost = $true
            } elseif ($script:fsActive) {
                $form.TopMost = $false
                $form.FormBorderStyle = $script:fsPrevBorder
                $form.WindowState = $script:fsPrevState
                $form.Bounds = $script:fsPrevBounds
                $script:fsActive = $false
            }
        } catch {}
    })

    # Sayfa yuklendikten sonra pencereyi goster (siyah ekran yok)
    $script:core.add_NavigationCompleted({
        param($s4, $e4)
        try {
            # Kisa bir gecikme ile icerik renderlansin, sonra goster
            $showTimer = New-Object System.Windows.Forms.Timer
            $showTimer.Interval = 120
            $showTimer.add_Tick({
                $showTimer.Stop()
                $showTimer.Dispose()
                # Hizli fade-in efekti
                $fadeTimer = New-Object System.Windows.Forms.Timer
                $fadeTimer.Interval = 15
                $fadeTimer.add_Tick({
                    if ($form.Opacity -lt 1.0) {
                        $form.Opacity = [Math]::Min(1.0, $form.Opacity + 0.15)
                    } else {
                        $form.Opacity = 1.0
                        $fadeTimer.Stop()
                        $fadeTimer.Dispose()
                    }
                })
                $fadeTimer.Start()
            })
            $showTimer.Start()
        } catch {
            $form.Opacity = 1.0
        }
    })

    try {
        New-DesktopRuntimeHtml | Out-Null
        $script:lastKnownWrite = Get-DataWrite
        $script:core.Navigate($appUri)
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "Masaustu arayuzu hazirlanamadi:`n$($_.Exception.Message)",
            $script:AppTitle, 'OK', 'Error') | Out-Null
    }
})

# Form gorununce WebView2'yi baslat
$form.add_Shown({
    try {
        $web.EnsureCoreWebView2Async($null) | Out-Null
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "WebView2 motoru baslatilamadi:`n$($_.Exception.Message)",
            $script:AppTitle, 'OK', 'Error') | Out-Null
    }
})

# Dis degisiklikleri izle (uzanti notlar.json'u guncellerse) -> canli senkron
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.add_Tick({
    if ($null -eq $script:core) { return }
    $lw = Get-DataWrite
    if ($null -ne $lw -and $lw -ne $script:lastKnownWrite) {
        $script:lastKnownWrite = $lw
        # Veriyi gondermiyoruz (buyuk olabilir); shim fetch ile yeniden ceksin.
        try { $script:core.PostWebMessageAsJson('{"type":"reload"}') } catch {}
    }
})
$timer.Start()

$form.add_FormClosed({ try { $timer.Stop() } catch {} })

# Mesaj dongusu
[System.Windows.Forms.Application]::Run($form)
