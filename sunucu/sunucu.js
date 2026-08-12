#!/usr/bin/env node
'use strict';
// ============================================================
// Tıbbi Not Defteri — Sunucu (GitHub Gist'in yerini alır)
// ------------------------------------------------------------
// İki iş yapar:
//   1) PWA defterini sunar (index.html, app/, icons/ …)
//   2) Not senkron API'si: GET/PUT /api/notlar
//
// TASARIM KARARLARI (sebepleriyle — sonraki agent bunları bilsin):
//
// · BAĞIMLILIK YOK. Yalnız Node'un kendi modülleri. npm install yok,
//   güncellenmesi gereken paket yok, tedarik zinciri riski yok.
//
// · YAZMA = SUNUCU TARAFINDA BİRLEŞTİRME, körü körüne üzerine yazma DEĞİL.
//   Gist'te istemci `_persist()` sonrası doğrudan PUSH ediyordu; bayat bir
//   cihaz (ör. yeni kurulmuş, IndexedDB'si boş telefon) tüm arşivi
//   silebilirdi. Burada gelen notlar depodakiyle BİRLEŞTİRİLİR
//   (id + updatedAt, son yazan kazanır — istemcideki `_merge` ile birebir
//   aynı kural). Böylece hiçbir istemci veri KAYBETTİREMEZ; silme yalnız
//   tombstone ile olur (zaten uygulamanın tasarımı bu).
//
// · ATOMİK YAZMA + HER YAZIMDA YEDEK. Önce geçici dosyaya yazılır, sonra
//   rename edilir (yarıda kesilirse asıl dosya bozulmaz). Öncesinde
//   zaman damgalı yedek alınır; son YEDEK_SAYISI tanesi saklanır.
//
// · YAZIMLAR SIRAYA SOKULUR (_kuyruk). İki cihaz aynı anda PUT ederse
//   okuma-birleştirme-yazma çakışmaz.
//
// · STATİK SUNUM BEYAZ LİSTEYLE. Sadece aşağıdaki dosya/klasörler servis
//   edilir. `data/` (notlar + API anahtarları + gist token'ı), `.git/`,
//   `*.ps1`, `desktop/` DIŞARIYA HİÇ AÇILMAZ. Yol gezinmesi (../) mümkün
//   değil çünkü istenen yol beyaz listeyle karşılaştırılır.
//
// · KİMLİK DOĞRULAMA BURADA DEĞİL, CADDY'DE. Bu servis yalnız 127.0.0.1
//   dinler; dışarıdan tek yol Caddy'nin şifreli girişinden geçer.
// ============================================================

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const KOK = path.resolve(__dirname, '..');              // proje kökü
// Veri klasörü env ile değiştirilebilir — test koşularının GERÇEK notlara
// dokunmadan çalışabilmesi için (bkz. sunucu/test-birlestirme.js).
const VERI = process.env.DEFTER_VERI
  ? path.resolve(process.env.DEFTER_VERI)
  : path.join(KOK, 'data');
const NOT_DOSYA = path.join(VERI, 'notlar.json');
const YEDEK_KLASOR = path.join(VERI, 'sunucu-yedek');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const YEDEK_SAYISI = 60;                                 // saklanacak yedek adedi
const EN_BUYUK_GOVDE = 64 * 1024 * 1024;                 // 64 MB istek sınırı

// ------------------------------------------------------------
// Statik beyaz liste
// ------------------------------------------------------------
const KOK_DOSYALAR = new Set([
  'index.html', 'sw.js', 'manifest.webmanifest',
  'mobile-shim.js', 'mobile-settings.js', 'mobile.css'
]);
const IZINLI_KLASORLER = ['app', 'icons'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// ------------------------------------------------------------
// Not deposu
// ------------------------------------------------------------
function simdi() { return new Date().toISOString(); }

function zaman(n) {
  return Date.parse((n && (n.updatedAt || n.createdAt)) || 0) || 0;
}

// istemcideki mobile-shim.js `_merge` ile BİREBİR aynı kural
function birlestir(mevcut, gelen) {
  const idye = Object.create(null);
  for (const n of mevcut) if (n && n.id) idye[n.id] = n;
  for (const g of gelen) {
    if (!g || !g.id) continue;
    const m = idye[g.id];
    if (!m) { idye[g.id] = g; continue; }
    idye[g.id] = zaman(g) > zaman(m) ? g : m;
  }
  const cikti = Object.keys(idye).map(k => idye[k]);
  cikti.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return cikti;
}

function paket(notlar) {
  return {
    app: 'Tıbbi Not Defteri',
    version: '2.0-sunucu',
    updatedAt: simdi(),
    noteCount: notlar.length,
    notes: notlar
  };
}

async function notlariOku() {
  try {
    const ham = await fsp.readFile(NOT_DOSYA, 'utf8');
    const d = JSON.parse(ham.replace(/^﻿/, ''));   // BOM'u at
    if (Array.isArray(d)) return d;
    return Array.isArray(d.notes) ? d.notes : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function yedekle() {
  try { await fsp.access(NOT_DOSYA); } catch { return; }  // dosya yoksa yedek yok
  await fsp.mkdir(YEDEK_KLASOR, { recursive: true });
  const damga = simdi().replace(/[:.]/g, '-');
  await fsp.copyFile(NOT_DOSYA, path.join(YEDEK_KLASOR, `notlar-${damga}.json`));

  // eskileri buda
  const hepsi = (await fsp.readdir(YEDEK_KLASOR))
    .filter(f => f.startsWith('notlar-') && f.endsWith('.json'))
    .sort();
  for (const eski of hepsi.slice(0, Math.max(0, hepsi.length - YEDEK_SAYISI))) {
    await fsp.unlink(path.join(YEDEK_KLASOR, eski)).catch(() => {});
  }
}

async function notlariYaz(notlar) {
  await fsp.mkdir(VERI, { recursive: true });
  await yedekle();
  const gecici = NOT_DOSYA + '.tmp';
  // UTF-8 + BOM: PC tarafındaki native-host.ps1 / Defter.ps1 ve
  // tibbi-not-review skill'i bu biçimi bekliyor. Uyum bozulmasın.
  await fsp.writeFile(gecici, '﻿' + JSON.stringify(paket(notlar), null, 2), 'utf8');
  await fsp.rename(gecici, NOT_DOSYA);                   // atomik yer değiştirme
}

// Yazma işlemlerini sıraya sok — okuma/birleştirme/yazma çakışmasın
let _kuyruk = Promise.resolve();
function sirayaAl(is) {
  const sonuc = _kuyruk.then(is, is);
  _kuyruk = sonuc.then(() => {}, () => {});
  return sonuc;
}

// ------------------------------------------------------------
// HTTP yardımcıları
// ------------------------------------------------------------
function json(res, kod, govde) {
  const metin = JSON.stringify(govde);
  res.writeHead(kod, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(metin),
    'Cache-Control': 'no-store'
  });
  res.end(metin);
}

function govdeOku(req) {
  return new Promise((resolve, reject) => {
    const parcalar = [];
    let boyut = 0;
    req.on('data', p => {
      boyut += p.length;
      if (boyut > EN_BUYUK_GOVDE) {
        reject(Object.assign(new Error('Gövde çok büyük'), { kod: 413 }));
        req.destroy();
        return;
      }
      parcalar.push(p);
    });
    req.on('end', () => resolve(Buffer.concat(parcalar).toString('utf8')));
    req.on('error', reject);
  });
}

// İstenen yolu beyaz listeye göre gerçek dosyaya çevir; izinsizse null
function statikYol(istekYolu) {
  let y = decodeURIComponent(istekYolu.split('?')[0]);
  if (y === '/' || y === '') y = '/index.html';
  const parcalar = y.split('/').filter(Boolean);
  if (parcalar.some(p => p === '..' || p === '.')) return null;

  if (parcalar.length === 1 && KOK_DOSYALAR.has(parcalar[0])) {
    return path.join(KOK, parcalar[0]);
  }
  if (parcalar.length >= 2 && IZINLI_KLASORLER.includes(parcalar[0])) {
    const tam = path.join(KOK, ...parcalar);
    // klasörden dışarı çıkılmadığını KESİN olarak doğrula
    const sinir = path.join(KOK, parcalar[0]) + path.sep;
    if (tam.startsWith(sinir)) return tam;
  }
  return null;
}

// ------------------------------------------------------------
// Sunucu
// ------------------------------------------------------------
const sunucu = http.createServer(async (req, res) => {
  const yol = (req.url || '/').split('?')[0];

  try {
    // ---- API: notları oku ----
    if (yol === '/api/notlar' && req.method === 'GET') {
      const notlar = await notlariOku();
      return json(res, 200, paket(notlar));
    }

    // ---- API: notları yaz (birleştirerek) ----
    if (yol === '/api/notlar' && req.method === 'PUT') {
      const ham = await govdeOku(req);
      let gelen;
      try {
        const d = JSON.parse(ham);
        gelen = Array.isArray(d) ? d : d && d.notes;
      } catch {
        return json(res, 400, { hata: 'Geçersiz JSON' });
      }
      if (!Array.isArray(gelen)) {
        return json(res, 400, { hata: 'notes dizisi bulunamadı' });
      }

      const sonuc = await sirayaAl(async () => {
        const mevcut = await notlariOku();
        const birlesik = birlestir(mevcut, gelen);
        const degisti = JSON.stringify(birlesik) !== JSON.stringify(mevcut);
        if (degisti) await notlariYaz(birlesik);
        return { birlesik, degisti, oncesi: mevcut.length };
      });

      console.log(
        `[${simdi()}] PUT /api/notlar — gelen:${gelen.length} ` +
        `depo:${sonuc.oncesi} → ${sonuc.birlesik.length} ` +
        `${sonuc.degisti ? '(yazildi)' : '(degisiklik yok)'}`
      );
      return json(res, 200, paket(sonuc.birlesik));
    }

    // ---- Sağlık / durum ----
    if (yol === '/api/durum' && req.method === 'GET') {
      const notlar = await notlariOku();
      const aktif = notlar.filter(n => !n.deleted).length;
      return json(res, 200, {
        durum: 'calisiyor',
        toplam: notlar.length,
        aktif,
        tombstone: notlar.length - aktif,
        zaman: simdi()
      });
    }

    // ---- Statik dosyalar ----
    if (req.method === 'GET' || req.method === 'HEAD') {
      const dosya = statikYol(yol);
      if (!dosya) return json(res, 404, { hata: 'Bulunamadı' });
      let veri;
      try {
        veri = await fsp.readFile(dosya);
      } catch {
        return json(res, 404, { hata: 'Bulunamadı' });
      }
      const uzanti = path.extname(dosya).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[uzanti] || 'application/octet-stream',
        'Content-Length': veri.length,
        // sw.js ve index.html tazelensin ki güncelleme takılmasın
        'Cache-Control': (uzanti === '.html' || dosya.endsWith('sw.js'))
          ? 'no-cache'
          : 'public, max-age=3600'
      });
      return res.end(req.method === 'HEAD' ? undefined : veri);
    }

    return json(res, 405, { hata: 'Yöntem desteklenmiyor' });

  } catch (e) {
    console.error(`[${simdi()}] HATA ${req.method} ${yol}:`, e && e.message);
    return json(res, e && e.kod === 413 ? 413 : 500, { hata: String((e && e.message) || e) });
  }
});

sunucu.listen(PORT, HOST, () => {
  console.log(`[${simdi()}] Tıbbi Not Defteri sunucusu: http://${HOST}:${PORT}`);
  console.log(`  proje kökü : ${KOK}`);
  console.log(`  not dosyası: ${NOT_DOSYA}`);
});
