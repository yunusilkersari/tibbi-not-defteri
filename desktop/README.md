# Tıbbi Not Defteri — Masaüstü Uygulaması

Tarayıcı uzantısındaki **defterin birebir aynısı**, artık bir Windows masaüstü
penceresi olarak. Uzantı ile **aynı `data/notlar.json` dosyasını** kullanır;
bu yüzden:

- Uzantıdan kaydettiğin not, masaüstü uygulamasında **anında** görünür.
- Masaüstünden eklediğin/düzenlediğin not, uzantıda da görünür.

Yani iki taraf **canlı ve çift yönlü** senkrondur — ayrı bir veri kopyası yoktur.

---

## İlk kurulum (bir kez)

`Kur.bat` dosyasına **çift tıkla**. Bu işlem:

1. WebView2 bileşenlerini indirir (tek seferlik, ~4 MB — internet gerekir).
2. Masaüstüne **"Tıbbi Not Defteri"** kısayolu oluşturur.

> Not: Bilgisayarında Microsoft Edge ve WebView2 zaten kurulu olduğu için
> ayrıca bir şey yüklemene gerek yok; sadece yukarıdaki küçük bileşen iner.

## Günlük kullanım

Masaüstündeki **"Tıbbi Not Defteri"** kısayoluna çift tıkla.
(Kısayol olmadan da `Baslat.vbs` ile açabilirsin.)

- Uygulama zaten açıkken tekrar açmaya çalışırsan, yeni pencere açılmaz;
  mevcut pencere öne getirilir.

---

## Nasıl çalışır? (kısa teknik özet)

- **Pencere:** PowerShell, bir WebView2 (Edge motoru) penceresi açar ve
  uzantının `app/app.html` defter arayüzünü **olduğu gibi** yükler.
  Görünüm ve davranış uzantıdakiyle aynıdır.
- **Köprü:** `desktop-shim.js`, sayfaya enjekte edilerek uzantı ortamındaki
  `chrome.*` API'lerini taklit eder. Böylece defter dosyalarına (app.html,
  app.js, app.css) **hiç dokunulmadan** masaüstünde çalışır.
- **Veri:** Notlar `data/notlar.json` dosyasından okunur ve oraya yazılır
  (atomik yazma + günlük yedek, uzantıdaki `native-host.ps1` ile aynı biçim).
- **Canlı senkron:** Dosya her değiştiğinde (ör. uzantı not eklediğinde)
  pencere bunu algılayıp listeyi otomatik yeniler.

## Dosyalar

| Dosya | Görevi |
|-------|--------|
| `Defter.ps1` | Ana program (WebView2 penceresi + veri köprüsü). |
| `desktop-shim.js` | `chrome.*` uyumluluk katmanı (defter dosyalarına dokunmaz). |
| `Baslat.vbs` | Sessiz başlatıcı (konsol penceresi göstermez). |
| `Kur.bat` | İlk kurulum: bileşenleri indirir + masaüstü kısayolu oluşturur. |
| `lib/` | İndirilen WebView2 bileşenleri (otomatik oluşur). |
| `defter.ico` | Pencere/kısayol ikonu (otomatik oluşur). |

## Sorun giderme

- **"WebView2 bileşenleri hazırlanamadı"**: İnternet bağlantını kontrol edip
  `Kur.bat`'ı tekrar çalıştır.
- **Notlar görünmüyor**: `data/notlar.json` dosyasının var olduğundan emin ol.
  Uzantıyı bir kez kullanıp not eklersen dosya otomatik oluşur.
- **Pencere açılmıyor**: `Defter.ps1`'i sağ tıklayıp "PowerShell ile çalıştır"
  diyerek hata mesajını görebilirsin.
