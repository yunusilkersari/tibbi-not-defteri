---
name: tibbi-not-review
description: >
  Tıbbi Not Defteri uygulamasındaki AI üretimi (Google Gemini / Grok) tıbbi notları
  (data/notlar.json) güncel klinik kılavuzlara göre inceleyip hatalı/halüsinasyon içeren
  yerleri düzeltmek için kullan. Kullanıcı "notları review et", "notları incele/gözden
  geçir", "hataları düzelt", "notları kontrol et", "tıbbi notları kontrol et" gibi şeyler
  dediğinde TETIKLENIR. Notların güvenli düzenlenmesini (canlı Gist senkronu, contentHtml,
  tombstone silme, updatedAt birleştirme) ve düzeltmelerin tüm cihazlara yayılmasını kapsar.
---

# Tıbbi Not Review & Düzeltme

Bu skill, **pratisyen hekim kullanıcının** kişisel "Tıbbi Not Defteri" uygulamasındaki
AI sohbetlerinden (Gemini/Grok) yakalanmış tıbbi soru-cevap notlarını inceleyip
hatalı tıbbi bilgileri güncel kılavuzlara göre düzeltmek içindir.

> ⚠️ **Bu tıbbi içerik.** Yanlış doz/ilaç/kontrendikasyon hastaya zarar verebilir.
> Kendi bilginden emin değilsen WEB'den güncel kılavuzla **doğrula** — kendi halüsinasyonuna karşı.

## En kritik 6 şey (önce bunları oku — zaman kaybetme)

1. **Veri `data/notlar.json`** (UTF-8 **BOM'lu**, ~2.7MB). `Read` tool ile açma — çok büyük, hata verir. **PowerShell + `ConvertFrom-Json`** kullan.
2. **Uygulama `contentHtml`'i gösterir** (`content` değil; o sadece kopyala/dışa-aktar için). Düzeltmeyi **HEM `content` HEM `contentHtml`'e** uygula, yoksa ekranda görünmez.
3. **Dosya CANLI senkronlu** (GitHub Gist). Sen çalışırken **not sayısı/savedAt değişir**. Yazmadan önce kullanıcıdan **uygulamayı kapatmasını** iste.
4. **Silme = tombstone**, dizi silme DEĞİL. `{id, createdAt, updatedAt:now, deleted:true}`. Diziden çıkarırsan senkronda not **geri dirilir**. Zaten boş notlar genelde **zaten tombstone'dur** (alanları sadece id/createdAt/updatedAt/deleted) — onlara dokunma.
5. **Düzeltme cihazlara yayılması için Gist'i güncellemek ZORUNLU.** Diske yazmak yetmez (uygulama disk geri-yüklemeyi atlar; "force restore" UI'si yok). Birleştirme `updatedAt`'e göre — düzeltilen notların `updatedAt`'ini **şimdiye çek** ki kazansın.
6. **Her yazımdan önce YEDEK al** (disk + Gist). Object-model ile düzelt → **geçici dosyaya yaz → doğrula → ancak geçerse asıl dosyaya geç.**

Derin teknik detay, kaçış (`<`) sorunu ve **hazır PowerShell şablonları** için:
👉 **[reference/teknik-detaylar.md](reference/teknik-detaylar.md)** (apply scripti, Gist GET/PATCH scripti, tombstone formatı).

## Süreç

### Faz 0 — Keşif
- `data/notlar.json` yapısı: `{app, version, savedAt, noteCount, notes:[...]}`.
- Her not: `{id, createdAt, updatedAt, content, contentHtml, sourceTitle, sourceUrl, tags, isStarred, userNote, captureMethod}`. Tombstone'larda yalnız `{id, createdAt, updatedAt, deleted}`.
- Notları **gün gün** ve **konu/başlık** bazında özetle (sourceTitle + createdAt + content uzunluğu). Aktif notları (deleted olmayan) say.
- Aynı `sourceTitle` çoğu zaman aynı sohbetin **farklı soru-cevaplarıdır** (kopya değil) — ama birebir tekrar ve bozuk/yarım yakalamalar da olur.

### Faz 1 — Konu konu inceleme (varsayılan: konu konu)
- Klinik kümelere ayır (ör. beta-laktamlar, sefalosporinler/alerji, pnömoni, mikrobiyoloji, acil yönetim).
- Her notun metnini (`content`) çek (büyükse temp dosyaya döküp `Read` ile oku).
- Kılavuz çapası (kullanıcı tercihi): **Uluslararası güncel** (IDSA/ATS, AAAAI 2022, EUCAST/CLSI, CDC, AHA, Sanford/UpToDate) **+ Türkiye** (EKMUD, Türk Toraks Derneği, Akılcı İlaç) **+ doz/yerel preparat**.
- **Kritik/güncel-değişen verileri WEB'den teyit et** (dozlar, çapraz reaksiyon %, ilaç adları, kılavuz değişiklikleri). Halüsinasyon riski en çok burada.
- Önem dereceleri: 🔴 kritik (hasta zararı) · 🟡 orta (kavramsal/güncel kılavuz çelişkisi) · 🟢 küçük (nüans) · ⚙️ veri (boş/bozuk/tekrar).
- **Dürüst ol:** İçerik genelde doğruysa "doğru" de; hata uydurma. (Bu notlar şaşırtıcı derecede doğru çıktı; tek net halüsinasyon "Pentalomin" idi.)

### Faz 2 — Düzeltmeleri logla
- `düzeltmeler/` klasörü oluştur. `README.md` (yöntem + durum tablosu) + her küme için `NN-konu.md`.
- Her düzeltme: not `id`, önem, **orijinal metin → düzeltilmiş metin**, gerekçe, **kaynak**.
- Düzeltme metnini not içinde **`(DÜZELTME)`** etiketiyle işaretle (provenans). Orijinal AI metni ile düzeltmeni ayırt edilebilir kıl.

### Faz 3 — Güvenli uygulama (kullanıcı "uygula" deyince)
1. Kullanıcıdan **tüm cihazlarda uygulamayı + senkronu kapatmasını** iste, "kapattım" onayını bekle.
2. Dosyanın **durağan** olduğunu doğrula (3 sn arayla `LastWriteTime`/`savedAt` değişmiyor mu).
3. **Yedek al** (`data/backups/notlar-pre-apply-<ts>.json`).
4. **Object-model** ile düzelt: her düzeltmeyi ilgili notun `content` VE `contentHtml`'ine `.Replace(find, repl)` uygula; her düzeltmenin en az 1 alanı değiştirdiğini doğrula (değilse **ABORT, yazma**).
5. Düzeltilen notların `updatedAt = UtcNow` (ISO `...Z`); silinecekleri **tombstone**'a çevir.
6. `savedAt` güncelle, `noteCount = notes.Count`.
7. **Geçici dosyaya** yaz → parse + sayım + her düzeltme markörü + tombstone + dokunulmamış not kontrolü → **hepsi geçerse** asıl dosyaya kopyala (UTF-8 **BOM'lu**).
   - Şablon: [reference/teknik-detaylar.md](reference/teknik-detaylar.md) → "Güvenli Apply Scripti".

### Faz 4 — Bulut yayma (Gist) — düzeltmenin gerçekten "yaşaması" için ŞART
- **Neden:** Eklenti `chrome.storage.local`'ı kullanır ve açılışta diski okumayı **atlar**; sadece diske yazmak yayılmaz, hatta eklenti açılınca eski veri diski **ezebilir**. `cloudFullSync` = `storage.local ⊕ Gist` birleştirip ikisine de yazar. Çözüm: **Gist'i düzeltilmiş notlarla güncelle.**
- Token + gistId: `data/sync-config.json` (`token`, `gistId`, `fileName`). **Token'i çıktıya yazma.**
- **Önce kullanıcıdan izin al** (token'le GitHub'a dışa yazma işlemi). Sonra:
  1. Mevcut Gist'i **yedekle** (GET; >1MB ise `truncated` → `raw_url`'den çek).
  2. Düzeltilmiş notları **PATCH** et (format: `{app, version:'1.3.0-cloud', updatedAt, notes:[...]}` → `files[fileName].content`).
  3. **Geri okuyup doğrula** (not sayısı, bir düzeltme markörü, tombstone).
  - Şablon: [reference/teknik-detaylar.md](reference/teknik-detaylar.md) → "Gist Yedek + PATCH Scripti".
- Artık düzeltmeler en yeni `updatedAt`'e sahip → **ezilme riski yok**; hangi cihaz senkronlanırsa düzeltme kazanır.

### Faz 5 — Teslim
- Kullanıcıya: her cihazda uygulamayı aç → **"Şimdi Senkronla"** → düzeltmeler yayılır. Bir düzeltmeyi doğrulamasını söyle.
- **Yerel teyit** isteyen şeyleri (Türkiye marka adları: Pen-OS/Cliacil, vb.) hekime bırak — web bu konuda güvenilmez.
- Yedek dosyaların yerini hatırlat (geri alınabilir).

## Tıbbi inceleme standartları (neye bak)
- **Dozlar** (mg/kg, max doz, sıklık, süre) — en yüksek risk; mutlaka kılavuzla doğrula.
- **İlaç adları / antidotlar** — uydurma marka/etken adı tipik halüsinasyon (ör. "Pentalomin" → fentolamin).
- **Kontrendikasyonlar** (ör. yenidoğanda seftriakson → kernikterus; SJS/TEN/DRESS'te tüm sefalosporinler).
- **Kavram karışıklığı** (ör. kok vs basil; kuşak vs R1 yan zinciri).
- **Güncel kılavuz değişiklikleri** (ör. penisilin-sefalosporin çapraz reaksiyon "%10" miti → AAAAI 2022; CAP'te makrolid monoterapisi kısıtı; Türkiye direnç oranları).
- **Türkiye'ye özgü** pratik (yerel preparatlar, direnç paternleri, EKMUD/Türk Toraks).

## Sık tuzaklar (yapma / yap)
- ❌ `data/notlar.json`'u `Read` ile açma → ✅ PowerShell.
- ❌ Sadece `content`'i düzelt → ✅ `contentHtml`'i de düzelt (ekranda o görünür).
- ❌ HTML find dizesini elle `<`'li yazmaya çalışma → ✅ object-model `.Replace` (gerçek `<` ile) kullan; ya da `reference`'taki `ToRaw` fonksiyonu.
- ❌ Boş notu diziden sil → ✅ zaten tombstone, dokunma; gerçek silme = tombstone'a çevir.
- ❌ App açıkken yaz → ✅ önce kapattır, durağanlığı doğrula.
- ❌ Sadece diske yaz ve "bitti" de → ✅ Gist'i de güncelle (yoksa yayılmaz/ezilebilir).
- ❌ ConvertTo-Json öncesi `-Depth` unutma → ✅ `-Depth 25` (varsayılan 2 veriyi keser).
- ❌ İçerik doğruysa hata uydurma → ✅ "doğru" demekten çekinme; güveni bu korur.
