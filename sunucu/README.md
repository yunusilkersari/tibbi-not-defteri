# Tıbbi Not Defteri — Sunucu

> Defter 2026-08 itibarıyla **kendi sunucusundan** yayınlanıyor.
> GitHub Gist senkronu BIRAKILDI; tek gerçek kaynak artık sunucudaki
> `data/notlar.json`.

**Adres:** https://186-240-153-193.sslip.io — kullanıcı adı `yunus`, parola şifreli girişte.
**Makine:** Ubuntu 24.04 VPS (`ssh yunus@186.240.153.193`), proje `~/tibbi-defter`.

---

## Neden Gist bırakıldı

| | Gist | Kendi sunucumuz |
|---|---|---|
| Yazma | istemci körü körüne **üzerine yazar** | sunucu gelenle depodakini **birleştirir** |
| Boş cihaz | tüm arşivi **silebilirdi** | siler**emez** — tam arşivi geri indirir |
| Boyut | 1 MB'ta kesiliyor (`truncated`) | sınır yok |
| Kimlik | kişisel GitHub token'ı her cihazda | telefonda **hiçbir anahtar yok** (aynı köken) |

Boş liste gönderiminin teorik olmadığının kanıtı, servisin kendi günlüğünde:

```
PUT /api/notlar — gelen:0 depo:57 → 57 (degisiklik yok)
```

Taze kurulmuş bir cihaz ilk açılışta gerçekten boş liste gönderdi. Gist tasarımında
bu, 47 notun tamamını silerdi.

---

## Parçalar

| Parça | Yeri | İşi |
|---|---|---|
| `sunucu/sunucu.js` | `~/tibbi-defter` | PWA'yı sunar + `GET/PUT /api/notlar`. Bağımlılık YOK. 127.0.0.1:8787 dinler. |
| Caddy | `/etc/caddy/Caddyfile` | HTTPS sertifikası (kendi alır/yeniler) + şifreli giriş + 8787'ye yönlendirme |
| systemd | `/etc/systemd/system/tibbi-defter.service` | reboot'ta kendiliğinden kalkar |
| fail2ban | `/etc/fail2ban/jail.d/caddy-auth.conf` | 10 dakikada 5 başarısız giriş → 1 saat yasak |
| Veri | `~/tibbi-defter/data/notlar.json` | **tek gerçek kaynak** (git'te DEĞİL) |
| Yedek | `~/tibbi-defter/data/sunucu-yedek/` | her yazımdan önce, son 60 tanesi |

**İstemciler:** telefon (`mobile-shim.js`, aynı köken → anahtarsız) · Chrome uzantısı
(`background.js`, HTTP Basic + `chrome.storage`'daki ayar) · masaüstü defter
(`Defter.ps1`, dosyaya yazar; uzantı onu sunucuya taşır).

---

## Günlük işler

```bash
sudo systemctl status tibbi-defter      # servis ayakta mı
sudo journalctl -u tibbi-defter -f      # canlı günlük (her PUT görünür)
curl -s localhost:8787/api/durum        # kaç not var
node sunucu/test-birlestirme.js         # 20 test — GERÇEK notlara dokunmaz
```

Kod güncelleme (PC'den):

```bash
git push sunucu master
ssh yunus@186.240.153.193 'sudo systemctl restart tibbi-defter'
```

> `sunucu` uzak deposu PC'de tanımlı: `yunus@186.240.153.193:tibbi-defter`.
> Sunucuda `receive.denyCurrentBranch=updateInstead` ayarlı, push çalışma ağacını da tazeler.
> ⚠ Push'un çalışması için **sunucuda commit'siz değişiklik olmamalı**.

---

## Alan adı değiştirmek (ör. `defter.hizlialmanca.com`)

1. Alan adının DNS'inde **A kaydı** → `186.240.153.193`.
2. `/etc/caddy/Caddyfile` içindeki `186-240-153-193.sslip.io` satırını yeni adla değiştir.
3. `sudo systemctl reload caddy` — sertifikayı Caddy kendi alır (~10 saniye).

Kodda değişiklik GEREKMEZ: telefon göreli yol (`api/notlar`) kullanır, hangi adresten
açılırsa oraya gider. Yalnız **uzantının** ayar ekranındaki sunucu adresi güncellenir.

## Giriş parolasını değiştirmek

```bash
caddy hash-password --plaintext 'YENI-PAROLA'
# çıkan $2a$14$... özetini Caddyfile'daki basic_auth satırına yaz
sudo systemctl reload caddy
```

Sonra telefonda tarayıcı yeni parolayı soracak; uzantıda **Seçenekler → Parola** güncellenir.

---

## Kurtarma

**Notlar bozulursa / yanlış yazım olursa:** `data/sunucu-yedek/` altındaki zaman damgalı
dosyalardan biri geri konur:

```bash
sudo systemctl stop tibbi-defter
cp data/sunucu-yedek/notlar-<damga>.json data/notlar.json
sudo systemctl start tibbi-defter
```

Sonra her cihazda defteri açıp **Şimdi Senkronla** de. Dikkat: birleştirme kuralı
"daha yeni kazanır" olduğu için, cihazlarda daha yeni sürüm varsa geri yükleme
ezilebilir — önce cihazları kapatmak en temizi.

**Gist:** silinmedi, 2026-08-09 tarihli hâliyle donmuş yedek olarak duruyor
(`data/sync-config.json` içindeki `gistId`).

---

## Bilinmesi gerekenler

- `data/` **git'te değil** (`.gitignore`) — notlar, API anahtarları ve Gist token'ı orada.
  Yeni makineye kurarken `data/` elle taşınır. İzinler: klasör `700`, anahtarlar `600`.
- Statik sunum **beyaz listeyle**: yalnız `index.html`, `sw.js`, `manifest.webmanifest`,
  `mobile-*.js|css` ve `app/` + `icons/` servis edilir. `data/`, `.git/`, `*.ps1`
  dışarıya **hiç açılmaz** (yol gezinme denemeleri dahil test edildi).
- `notlar.json` **UTF-8 + BOM** yazılır — PowerShell tarafı (`native-host.ps1`,
  `Defter.ps1`) ve `tibbi-not-review` skill'i bu biçimi bekliyor. Değiştirme.
- `native-host.ps1` içindeki Gist blokları **ölü koddur**, dosyada işaretli. Yeni senkron
  kodu oraya eklenmez; sunucu tarafındadır.
- Sertifikalar herkese açık şeffaflık kayıtlarına düşer → yeni adres **saniyeler içinde**
  botlarca taranır. Şifreli giriş bu yüzden isteğe bağlı değil.
