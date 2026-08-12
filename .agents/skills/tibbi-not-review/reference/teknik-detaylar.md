# Teknik Detaylar & Hazır Şablonlar

Bu dosya `tibbi-not-review` skill'inin teknik ekidir. Buradaki tüm bulgular gerçek bir
inceleme oturumunda doğrulanmıştır (2026-06). Kod referansları `background.js`,
`desktop-shim.js`, `app/app.js` içindir.

---

## 1. Dosya formatı (data/notlar.json)

- **UTF-8, BOM'LU**, ~2.7MB. `Read` tool **çalışmaz** (token limiti). Daima PowerShell.
- Okuma (encoding'i doğru yapan tek yol):
  ```powershell
  $obj = [System.IO.File]::ReadAllText("data\notlar.json",[System.Text.Encoding]::UTF8) | ConvertFrom-Json
  ```
- Yazma (BOM'lu, BOM'u koru):
  ```powershell
  [System.IO.File]::WriteAllText($path, $jsonString, (New-Object System.Text.UTF8Encoding($true)))  # $true = BOM
  ```
- Üst yapı: `{ app, version, savedAt, noteCount, notes:[...] }`. `noteCount` = toplam dizi uzunluğu (tombstone'lar dahil).
- Aktif not = `deleted` alanı olmayan/false olan. Kullanıcı sadece aktifleri görür.

### Kaçış tuhaflığı (ÇOK ÖNEMLİ)
Dosya Türkçe karakterleri **düz** tutar AMA HTML'i kaçırır:
`<` → `<`, `>` → `>`, `"` → `\"` (`/` düz kalır → `</strong>`).
- Sonuç: **ham metin** find/replace yaparsan HTML find dizesini bu biçime çevirmen gerekir.
- **Daha kolayı:** object-model kullan — `ConvertFrom-Json` sonrası `$note.contentHtml` içinde
  gerçek `<strong class="font-semibold">` durur (kaçışsız), `.Replace(...)` doğal dizeyle çalışır.

`ToRaw` (yine de ham-replace gerekirse — `<` JSON katmanında `<`'e dönmesin diye backslash'i `[char]92` ile kur):
```powershell
$bs=[string][char]92; $q=[string][char]34
function ToRaw([string]$s){ return $s.Replace($bs,$bs+$bs).Replace($q,$bs+$q).Replace('<',$bs+'u003c').Replace('>',$bs+'u003e') }
# ToRaw('</strong>') -> </strong>
```

## 2. content vs contentHtml (app/app.js)
- Kart, okuma modalı, yazdırma: **`contentHtml` varsa onu** `innerHTML` ile basar; yoksa `content`.
- `content` (düz metin): truncation, **panoya kopyala**, markdown/CSV dışa-aktarma.
- ⇒ Düzeltmeyi **her ikisine** uygula. Aynı cümle çoğu zaman ikisinde de bitişik düz metindir;
  ama `<strong>` araya girerse `content`'te düz, `contentHtml`'de etiketli olur → iki ayrı find gerekebilir.
- HTML'e eklediğin düzeltme metninde **çıplak `<` koyma** (tag sanılır); `%1 altında` yaz, `<%1` yazma.

## 3. Silme = Tombstone (background.js ~356, desktop-shim.js ~129)
Diziden çıkarma YOK. Notu şu minimal nesneyle değiştir:
```powershell
[pscustomobject]@{ id=$n.id; createdAt=$n.createdAt; updatedAt=$nowU; deleted=$true }
```
`_mergeById` "daha yeni `updatedAt` kazanır" (tombstone dahil) çalıştığı için silme yayılır ve not dirilmez.
- **Zaten boş notlar genelde zaten tombstone'dur** (alanları yalnız id/createdAt/updatedAt/deleted). Dokunma.
- Aktif bir notu silmek istiyorsan tombstone'a çevir + `updatedAt=now`.

## 4. Senkron mimarisi (neden Gist'i güncellemek şart)
- Eklenti notları **`chrome.storage.local`**'da tutar. Disk (`notlar.json`) her zaman ana kaynak değil.
- `restoreFromDiskArchive({force})`: `local.length>0` ve `force` değilse **diski okumayı ATLAR**.
  Kodda `force:true` **hiç çağrılmaz** ⇒ UI'de "diskten zorla geri yükle" yok.
- Açılışta/her kayıttan önce restore çağrılır ama **atlanır** ⇒ disk düzeltmen storage'a girmez.
- `cloudFullSync` (background.js ~673): `local = storage.local`, `remote = Gist`, `merged = _mergeById(local,remote)`,
  sonra **hem storage/disk'e hem Gist'e** yazar. **Disk dosyasını birleştirmeye katmaz.**
- Birleştirme (`_mergeById`): aynı id'de **daha yeni `updatedAt` kazanır**.
- **Sonuç:** Sadece diske yazarsan (a) yayılmaz, (b) eklenti açılınca eski storage→disk yazıp **ezer**.
  **Çözüm:** Gist'i düzeltilmiş notlarla (en yeni `updatedAt`) güncelle → her cihaz çekince düzeltme kazanır.

## 5. sync-config.json
`{ token (ghp_...), gistId, fileName:"notlar.json", updatedAt }`. `data/` **.gitignore'da** (token repoya gitmez).
Token'i asla çıktıya/loga yazma.

---

## ŞABLON A — Keşif / özet
```powershell
$o = [System.IO.File]::ReadAllText("data\notlar.json",[System.Text.Encoding]::UTF8) | ConvertFrom-Json
"toplam=$($o.notes.Count) aktif=$(($o.notes|?{-not $_.deleted}).Count) savedAt=$($o.savedAt)"
$o.notes | ?{-not $_.deleted} | Sort-Object createdAt | %{
  "{0} | {1} | {2} ch | {3}" -f $_.id,$_.createdAt,($_.content.Length),$_.sourceTitle }
```

## ŞABLON B — Güvenli Apply (object-model → temp → doğrula → commit)
```powershell
$ErrorActionPreference='Stop'
$path="data\notlar.json"
$nowU=[DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"); $nowL=(Get-Date).ToString("o")
Copy-Item $path "data\backups\notlar-pre-apply-$((Get-Date).ToString('yyyyMMdd-HHmmss')).json"   # YEDEK
$obj=[System.IO.File]::ReadAllText($path,[System.Text.Encoding]::UTF8)|ConvertFrom-Json
$map=@{}; foreach($n in $obj.notes){ if($n.id){$map[$n.id]=$n} }

# --- DÜZELTMELER: her biri ilgili notun content VE contentHtml'ine uygulanır ---
# content/contentHtml farklı sarmalanmışsa (strong tag) AYNI not için 2 ayrı edit yaz.
# Tek tırnak içinde apostrof '' ile kaçılır; " düz kalır; çıplak < koyma.
$edits=@(
  @{id='NOT_ID'; find='ESKI METIN'; repl='(DÜZELTME) YENI METIN'}
  # ...
)
$fail=@(); $applied=0
foreach($e in $edits){
  $n=$map[$e.id]; if(-not $n){ $fail+="MISSING $($e.id)"; continue }
  $ch=$false
  if($n.content -and $n.content.Contains($e.find)){ $n.content=$n.content.Replace($e.find,$e.repl); $ch=$true }
  if($n.contentHtml -and $n.contentHtml.Contains($e.find)){ $n.contentHtml=$n.contentHtml.Replace($e.find,$e.repl); $ch=$true }
  if($ch){$applied++}else{$fail+=("NOMATCH "+$e.id+" :: "+$e.find.Substring(0,[Math]::Min(40,$e.find.Length)))}
}
if($fail.Count){ $fail|%{Write-Output $_}; throw "ABORT - yazma yapilmadi" }

$editIds=($edits|%{$_.id}|Sort-Object -Unique); foreach($id in $editIds){ $map[$id].updatedAt=$nowU }   # updatedAt tazele
$tomb=@('SILINECEK_ID1')   # aktif notu silmek istersen
$obj.notes=@(foreach($n in $obj.notes){ if($tomb -contains $n.id){ [pscustomobject]@{id=$n.id;createdAt=$n.createdAt;updatedAt=$nowU;deleted=$true} } else { $n } })
$obj.savedAt=$nowL; $obj.noteCount=$obj.notes.Count

$tmp="$env:TEMP\notlar_apply.json"
[System.IO.File]::WriteAllText($tmp, ($obj|ConvertTo-Json -Depth 25), (New-Object System.Text.UTF8Encoding($true)))

# --- DOĞRULA (temp) ---
$v=[System.IO.File]::ReadAllText($tmp,[System.Text.Encoding]::UTF8)|ConvertFrom-Json
$vm=@{}; foreach($n in $v.notes){ $vm[$n.id]=$n }
$ok = ($v.notes.Count -eq $obj.notes.Count)
foreach($e in $edits){ if($vm[$e.id].content.Contains($e.find) -and $vm[$e.id].contentHtml.Contains($e.find)){ $ok=$false; "HALA VAR: $($e.id)" } }
# tombstone + dokunulmamış not spot-check ekle
if($ok){ Copy-Item $tmp $path -Force; "COMMIT OK" } else { "DOGRULAMA BASARISIZ - asil dosya degismedi" }
```
**Round-trip güvenli mi?** Test edildi: `ConvertFrom-Json | ConvertTo-Json -Depth 25` içerik değerlerini
(445KB HTML dahil) bire bir korur; sadece dosya kaçış stili değişir (app `JSON.parse` ettiği için sorun yok).

## ŞABLON C — Gist yedek + PATCH + doğrula (ağ → `dangerouslyDisableSandbox:true`)
```powershell
$ErrorActionPreference='Stop'
$cfg=[System.IO.File]::ReadAllText("data\sync-config.json",[System.Text.Encoding]::UTF8)|ConvertFrom-Json
$fn=$cfg.fileName; if(-not $fn){$fn='notlar.json'}
$h=@{Authorization="Bearer $($cfg.token)";Accept="application/vnd.github+json";"X-GitHub-Api-Version"="2022-11-28"}

# 1) YEDEK (GET; >1MB ise truncated -> raw_url)
$g=Invoke-RestMethod -Uri "https://api.github.com/gists/$($cfg.gistId)" -Headers $h
$f=$g.files.$fn
$txt= if($f.truncated){ (Invoke-WebRequest -Uri $f.raw_url -UseBasicParsing).Content } else { $f.content }
[System.IO.File]::WriteAllText("data\backups\gist-backup-$((Get-Date).ToString('yyyyMMdd-HHmmss')).json",$txt,(New-Object System.Text.UTF8Encoding($false)))

# 2) PATCH (düzeltilmiş diski yükle; app'in notesPayload formatı)
$disk=[System.IO.File]::ReadAllText("data\notlar.json",[System.Text.Encoding]::UTF8)|ConvertFrom-Json
$inner=([pscustomobject]@{app='Tibbi Not Defteri';version='1.3.0-cloud';updatedAt=[DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");notes=$disk.notes}|ConvertTo-Json -Depth 25)
$body=(@{files=@{$fn=@{content=$inner}}}|ConvertTo-Json -Depth 6)
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/gists/$($cfg.gistId)" -Headers $h -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 180 | Out-Null

# 3) DOĞRULA (geri oku)
$g2=Invoke-RestMethod -Uri "https://api.github.com/gists/$($cfg.gistId)" -Headers $h
$f2=$g2.files.$fn; $t2= if($f2.truncated){(Invoke-WebRequest -Uri $f2.raw_url -UseBasicParsing).Content}else{$f2.content}
$p=($t2|ConvertFrom-Json); $arr= if($p.notes){$p.notes}else{$p}
"Gist: toplam=$($arr.Count) aktif=$(($arr|?{-not $_.deleted}).Count)"
```
> Not: `Invoke-RestMethod` ağ erişimi için PowerShell tool çağrısına **`dangerouslyDisableSandbox:true`** gerekir.
> PATCH gövdesi ~2.7MB; GitHub Gist bu boyutu kabul eder (app zaten böyle senkronlar).

---

## Kılavuz kaynakları (web teyidi için)
- **Pnömoni (CAP):** IDSA/ATS 2019 (ayaktan: sağlıklı → yüksek doz amoksisilin/doksisiklin; makrolid monoterapisi yalnız direnç <%25; Türkiye'de yüksek → kullanma). Türk Toraks Derneği.
- **Penisilin alerjisi / sefalosporin çapraz reaksiyon:** AAAAI/ACAAI 2022 Drug Allergy Practice Parameter (R1 yan zinciri; "%10" mit; <%1).
- **Direnç/duyarlılık:** EUCAST / CLSI. **Romatizmal ateş / endokardit:** AHA. **Frengi/meningokok profilaksisi:** CDC.
- **Doz/preparat:** Sanford, UpToDate tarzı; Türkiye ticari adları (Alfoxil, Augmentin, İesef/Rocephin, Claforan, Pen-OS) — **marka adlarını hekime doğrulat.**

## Bu app hakkında genel (memory ile tutarlı)
- WebView2+PowerShell masaüstü + tarayıcı eklentisi + mobil PWA; hepsi **aynı notlar.json**'u Gist ile senkronlar.
- Senkron eklentide (JS) yürür. AV (Kaspersky) gizli `Start-Process powershell`'i işaretler — senkronu JS'te yap.
- Doğrudan master'a commit, Türkçe mesajlar (yalnız kullanıcı isteyince commit et).
