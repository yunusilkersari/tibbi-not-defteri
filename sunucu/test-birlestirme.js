#!/usr/bin/env node
'use strict';
// ============================================================
// sunucu.js için test — GERÇEK notlara DOKUNMAZ
// (geçici klasörde kendi veri deposunu kurar, DEFTER_VERI ile)
//
// Çalıştır:  node sunucu/test-birlestirme.js
//
// En kritik sınav: BAYAT BİR İSTEMCİ VERİ SİLEBİLİYOR MU?
// Gist tasarımında silebiliyordu (körü körüne üzerine yazma).
// Burada silememeli.
// ============================================================

const { spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const PORT = 8799;
const KOK = `http://127.0.0.1:${PORT}`;

let gecti = 0, kaldi = 0;

function sina(ad, kosul, ayrinti) {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`); }
  else { kaldi++; console.log(`  ✗ ${ad}${ayrinti ? '\n      → ' + ayrinti : ''}`); }
}

const not = (id, updatedAt, ekstra = {}) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  content: `icerik-${id}`,
  contentHtml: `<p>icerik-${id}</p>`,
  tags: [],
  ...ekstra
});

async function al() { return (await fetch(`${KOK}/api/notlar`)).json(); }

async function yaz(notlar) {
  const r = await fetch(`${KOK}/api/notlar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: notlar })
  });
  return { kod: r.status, govde: await r.json().catch(() => null) };
}

(async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'defter-test-'));
  const cocuk = spawn(process.execPath, [path.join(__dirname, 'sunucu.js')], {
    env: { ...process.env, DEFTER_VERI: tmp, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  cocuk.stderr.on('data', d => process.stderr.write('[sunucu] ' + d));

  // hazır olmasını bekle
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${KOK}/api/durum`); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }

  try {
    console.log('\n=== 1. Boş depoya yazma ===');
    await yaz([not('a', '2026-01-02T00:00:00.000Z'), not('b', '2026-01-02T00:00:00.000Z')]);
    let d = await al();
    sina('iki not kaydedildi', d.notes.length === 2, `bulunan: ${d.notes.length}`);

    console.log('\n=== 2. EN KRİTİK: bayat/boş istemci veri SİLEMEZ ===');
    await yaz([]);                                   // boş liste iten cihaz
    d = await al();
    sina('boş liste PUT ettikten sonra notlar DURUYOR', d.notes.length === 2,
         `kalan: ${d.notes.length} (0 ise VERİ KAYBI VAR)`);

    await yaz([not('a', '2020-01-01T00:00:00.000Z', { content: 'ESKI-EZME' })]);
    d = await al();
    const a = d.notes.find(n => n.id === 'a');
    sina('daha ESKİ sürüm mevcut notu EZMİYOR', a.content === 'icerik-a',
         `içerik: ${a.content}`);
    sina('bayat istemci diğer notu silmedi', d.notes.length === 2, `kalan: ${d.notes.length}`);

    console.log('\n=== 3. Daha yeni sürüm kazanır ===');
    await yaz([not('a', '2026-06-01T00:00:00.000Z', { content: 'YENI-ICERIK' })]);
    d = await al();
    sina('yeni updatedAt kazandı',
         d.notes.find(n => n.id === 'a').content === 'YENI-ICERIK');

    console.log('\n=== 4. Yeni not eklenir ===');
    await yaz([not('c', '2026-06-02T00:00:00.000Z')]);
    d = await al();
    sina('yeni id eklendi', d.notes.length === 3 && d.notes.some(n => n.id === 'c'));

    console.log('\n=== 5. Silme = tombstone (geri dirilmemeli) ===');
    await yaz([{ id: 'b', createdAt: '2026-01-01T00:00:00.000Z',
                 updatedAt: '2026-07-01T00:00:00.000Z', deleted: true }]);
    d = await al();
    const b = d.notes.find(n => n.id === 'b');
    sina('tombstone uygulandı', !!(b && b.deleted));
    // eski (silinmeden önceki) hali tekrar itilirse geri dirilmemeli
    await yaz([not('b', '2026-01-02T00:00:00.000Z')]);
    d = await al();
    sina('eski sürüm iterek not GERİ DİRİLMİYOR',
         d.notes.find(n => n.id === 'b').deleted === true);

    console.log('\n=== 6. Dosya biçimi ===');
    const ham = await fsp.readFile(path.join(tmp, 'notlar.json'), 'utf8');
    sina('UTF-8 BOM var (PowerShell tarafıyla uyum)', ham.charCodeAt(0) === 0xFEFF);
    const ayristirilmis = JSON.parse(ham.replace(/^﻿/, ''));
    sina('dosya geçerli JSON', Array.isArray(ayristirilmis.notes));
    sina('noteCount tutarlı', ayristirilmis.noteCount === ayristirilmis.notes.length);

    console.log('\n=== 7. Yedekleme ===');
    const yedekler = await fsp.readdir(path.join(tmp, 'sunucu-yedek')).catch(() => []);
    sina('her yazımda yedek alınıyor', yedekler.length >= 3, `yedek sayısı: ${yedekler.length}`);

    console.log('\n=== 8. Bozuk istek reddediliyor ===');
    const kotu = await fetch(`${KOK}/api/notlar`, { method: 'PUT', body: 'bu json degil' });
    sina('geçersiz JSON → 400', kotu.status === 400, `dönen: ${kotu.status}`);
    const dizisiz = await fetch(`${KOK}/api/notlar`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baska: 1 })
    });
    sina('notes dizisi yoksa → 400', dizisiz.status === 400, `dönen: ${dizisiz.status}`);
    const bozukKayit = await yaz([{ id: '', content: 42 }]);
    sina('bozuk not kaydı → 400', bozukKayit.kod === 400, `dönen: ${bozukKayit.kod}`);
    const yinelenen = await yaz([
      not('ayni', '2026-01-01T00:00:00.000Z'),
      not('ayni', '2026-01-02T00:00:00.000Z')
    ]);
    sina('aynı pakette yinelenen id → 400', yinelenen.kod === 400, `dönen: ${yinelenen.kod}`);
    d = await al();
    sina('bozuk istekler veriyi bozmadı', d.notes.length === 3, `kalan: ${d.notes.length}`);

    console.log('\n=== 9. Eşzamanlı yazma (kuyruk) ===');
    await Promise.all(Array.from({ length: 8 }, (_, i) =>
      yaz([not('es' + i, '2026-08-0' + (i + 1) + 'T00:00:00.000Z')])));
    d = await al();
    sina('8 eşzamanlı yazımın hepsi korundu', d.notes.length === 11, `bulunan: ${d.notes.length}`);

    console.log('\n=== 10. Eşit zaman damgası deterministik birleşir ===');
    const esit1 = not('esit', '2026-08-10T00:00:00.000Z', { content: 'A' });
    const esit2 = not('esit', '2026-08-10T00:00:00.000Z', { content: 'B' });
    await yaz([esit1]);
    await yaz([esit2]);
    d = await al();
    const ilkKazanan = d.notes.find(n => n.id === 'esit').content;
    await yaz([esit1, esit2]);
    d = await al();
    sina('eşit updatedAt sonucu gönderim sırasından bağımsız',
         d.notes.find(n => n.id === 'esit').content === ilkKazanan);

    const esitTombstone = {
      id: 'esit', createdAt: esit1.createdAt,
      updatedAt: esit1.updatedAt, deleted: true
    };
    await yaz([esitTombstone]);
    d = await al();
    sina('eşit updatedAt durumunda tombstone kazanır',
         d.notes.find(n => n.id === 'esit').deleted === true);

  } finally {
    cocuk.kill();
    await fsp.rm(tmp, { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(46)}`);
  console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi}`);
  console.log('='.repeat(46));
  process.exit(kaldi ? 1 : 0);
})();
