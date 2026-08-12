# Tıbbi Not Düzeltmeleri — Kayıt Defteri

Bu klasör, `data/notlar.json` içindeki AI üretimi (Gemini / Grok) tıbbi notlarda
yapılan **her düzeltmenin** kaydını tutar. Amaç: hangi bilginin neden ve hangi
güncel kılavuza göre değiştirildiğinin izlenebilir olması (provenans).

## Yöntem
- İnceleme **konu konu** yapılır.
- Hata bulunan notlar **doğrudan** düzeltilir (hem `content` hem `contentHtml`).
- Düzeltme metni not içinde **`(DÜZELTME)`** etiketiyle işaretlenir.
- Düzeltilen notun `updatedAt` alanı güncel zamana çekilir (senkron birleştirmesinde
  en yeni sürüm kazanır — bkz. `background.js` `_mergeById`).
- Kaynaklar: IDSA/ATS, AAAAI (2022 penisilin alerjisi), EUCAST/CLSI, AHA, CDC +
  Türkiye (EKMUD, Türk Toraks Derneği) + pratik dozlama (Sanford/UpToDate tarzı).

## Önem dereceleri
- 🔴 **Kritik**: hasta zararına yol açabilecek hata (yanlış doz/ilaç/kontrendikasyon).
- 🟡 **Orta**: kavramsal hata veya güncel kılavuzla çelişen ifade.
- 🟢 **Küçük**: nüans, eksik bilgi, güncellenmesi iyi olur.
- ⚙️ **Veri**: bozuk/boş yakalama, biçim sorunu.

## Durum
| # | Küme | Dosya | Bulgu | Uygulandı? |
|---|------|-------|-------|------------|
| 1 | Pen V/G & temel antibiyotik (Grok, 11 not) | [01-pen-vg-grok.md](01-pen-vg-grok.md) | 7 düzeltme | ✅ diske uygulandı |
| 2 | Amoksisilin/sefalosporin dozları (Gemini, 20 not) | [02-amoksisilin-sefalosporin-doz.md](02-amoksisilin-sefalosporin-doz.md) | 2 düzeltme + tekrarlar | ✅ diske uygulandı |
| 3 | Penisilin alerjisi & çapraz reaksiyon (Gemini, 2 not) | [03-penisilin-alerjisi-caprazreaksiyon.md](03-penisilin-alerjisi-caprazreaksiyon.md) | 1 yazım + 1 nüans | ✅ diske uygulandı |
| 4 | Zatürre/pnömoni (Gemini, 1 not) | [04-zaturre-pnomoni.md](04-zaturre-pnomoni.md) | 1 düzeltme | ✅ diske uygulandı |
| 5 | Pnömokok & asplenik sepsis acil yönetimi (Gemini, 14 not) | [05-pnomokok-acil-yonetim.md](05-pnomokok-acil-yonetim.md) | 2 düzeltme + 1 doğrulama | ✅ diske uygulandı |
| 6 | Pnömokok temel yapı ve laboratuvar tanısı (Gemini, 1 yeni not) | [06-pnomokok-temel-yapi.md](06-pnomokok-temel-yapi.md) | 1 laboratuvar nüansı | ✅ diske ve buluta uygulandı |

### Uygulama kaydı (2026-06-09 19:41)
- 16 metin düzeltmesi `content` + `contentHtml`'e uygulandı; 12 notun `updatedAt`'i tazelendi.
- 2 not tombstone'landı (1 bozuk `mq5anm0mrttmt7p` + 1 tekrar `mq2fcr2c3o7lcs8`). 7 boş not zaten tombstone'du, dokunulmadı.
- Yedek: `data/backups/notlar-pre-apply-20260609-194133.json`. Toplam 55 not / 46 aktif. 24/24 doğrulama geçti.
- ✅ **Bulut yayma tamam (2026-06-09 21:11)** — Gist düzeltilmiş notlarla güncellendi (önce eski Gist yedeklendi: `data/backups/gist-backup-20260609-211058.json`). Gist'te 55 not / 46 aktif doğrulandı.
- 📲 **Cihazlara yayılması için:** her cihazda (telefon/PC/eklenti) uygulamayı aç → "Şimdi Senkronla". Düzeltmeler en yeni `updatedAt`'e sahip olduğundan birleştirmede kazanır.

### Uygulama kaydı (2026-08-12 01:23 UTC)
- Önceki incelemeden sonra eklenen 1 aktif pnömokok notu incelendi.
- Optokin testinin kesin tür tanısı olmadığı nüansı `content` ve `contentHtml` alanlarına uygulandı; yalnız `mqhtxk4rtq4gk3d` değişti.
- Yerel yedek: `data/backups/notlar-pre-apply-20260812T012216Z.json`.
- Gist yedeği: `data/backups/gist-backup-20260812T012338Z.json`.
- ✅ Gist geri okunarak 57 toplam / 47 aktif not ve düzeltme işareti doğrulandı.

## Genel sonuç
**5 küme, ~63 not incelendi.** İçerik beklenenin çok üzerinde **doğru ve güvenilir** çıktı.
Korkulan AI halüsinasyonu nadir: net uydurma yalnız **1** (norepinefrin antidotu "Pentalomin"→fentolamin).
Geri kalanlar kavramsal/güncel-kılavuz nüansları ve birkaç tekrar/boş yakalama.
**Hasta zararına yol açacak doz hatası bulunmadı.**

> ⚠️ **Senkron notu:** `data/` Gist ile senkronize. Düzeltmelerin canlı notlara
> yazılması, uygulama/senkron sakinken yapılmalı; aksi halde eklenti kendi
> sürümünü Gist'e yükleyip düzeltmeyi ezebilir.
