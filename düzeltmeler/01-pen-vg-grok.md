# 1. Küme — Pen V/G & Temel Antibiyotik Notları (Grok)

**Kapsam:** 07–08 Haziran 2026, "Penicillin V vs G Differences - Grok" başlıklı 11 not
(gram+/− basiller, Pen V, kızıl/erizipel/romatizmal ateş, menenjit/endokardit/frengi,
GIS yan etkiler, kristalize Pen G order, doğal/yarı-sentetik penisilin, amoksisilin-klavulanat,
Pen-OS/Cliacil, probenesid).

**Genel:** Küme tıbbi olarak büyük ölçüde **doğru**. Hasta zararına yol açacak doz/ilaç hatası
bulunmadı. Aşağıdaki 7 düzeltme kavramsal/nüans düzeyinde. Durum: **hazır, canlı nota uygulanmayı bekliyor.**

## Doğrulanan (değişiklik gerekmeyen) kritik bilgiler
- Strep farenjit Pen V dozu (erişkin 500 mg, çocuk 25–50 mg/kg/gün, 10 gün) — IDSA 2012 ile uyumlu.
- Romatizmal ateş profilaksisi Benzatin Pen G her 3–4 haftada bir (4 hafta std, 3 hafta yüksek risk) — AHA ile uyumlu.
- Frengi: Benzatin Pen G 2.4 MÜ tek doz / nörosifiliz IV 18–24 MÜ — CDC ile uyumlu.
- Pnömokok menenjiti kristalize Pen G 24 MÜ/gün — uyumlu.

---

## Düzeltmeler

### 1.1 🟡 Pen V "Gram-pozitif basiller için ideal" kavram hatası
- **Not:** id `mq40fv486o3550g` (07.06 16:42, gram+/− basiller)
- **Orijinal:** "Penisilin V (Pen V) bu grup için idealdir (kızıl, erizipel gibi hastalıklarda)."
- **Düzeltilmiş:** "(DÜZELTME) Kızıl, erizipel ve strep boğaz aslında Gram-pozitif KOK olan A grubu streptokoka (S. pyogenes) bağlıdır; Pen V bu KOKLAR için idealdir, listelenen Gram-pozitif BASİLLER için değil. Basillerde Pen V ilk tercih olmaz: Listeria için ampisilin, Clostridium için Pen G veya metronidazol, şarbon için siprofloksasin/doksisiklin gerekir."
- **Gerekçe:** Kızıl/erizipel/strep boğaz *S. pyogenes* = Gram-pozitif **kok** hastalıklarıdır; metinde Gram-pozitif **basil** (Listeria, Clostridium, Bacillus, Corynebacterium) örnekleriyle karıştırılmış. Pen V bu basillerin hiçbirinde ilk tercih değildir.

### 1.2 🟢 Ertapenem Pseudomonas/Acinetobacter kapsamaz
- **Not:** id `mq40fv486o3550g` (aynı not, karbapenem tablosu)
- **Orijinal:** "Çoğu Gram-negatif (ESBL, bazı CRE hariç)"
- **Düzeltilmiş:** "Çoğu Gram-negatif (ESBL, bazı CRE hariç; DÜZELTME: ertapenem Pseudomonas ve Acinetobacter'i KAPSAMAZ)"
- **Gerekçe:** Meropenem/imipenem ile aynı satıra konan ertapenem, *P. aeruginosa* ve *Acinetobacter*'e **etkisizdir**; ampirik Pseudomonas şüphesinde ertapenem seçilmez.

### 1.3 🟡 MSSA endokarditinde vankomisin değil, beta-laktam
- **Not:** id `mq3mlkmx6fg7mau` (07.06 10:15, menenjit/endokardit/frengi)
- **Orijinal:** "Stafilokoklarda vankomisin vb."
- **Düzeltilmiş:** "Stafilokoklarda: MSSA (metisiline duyarlı) için antistafilokokal beta-laktam (nafsilin/oksasilin veya sefazolin) tercih edilir; vankomisin MRSA veya beta-laktam alerjisi içindir. (DÜZELTME)"
- **Gerekçe:** MSSA endokarditinde nafsilin/sefazolin vankomisinden **üstündür** (daha düşük başarısızlık). Vankomisin yalnız MRSA veya ağır beta-laktam alerjisinde.

### 1.4 🟢 Erizipelde en sık lokalizasyon bacak
- **Not:** id `mq3yc0td2kmc082` (07.06 15:43, kızıl/erizipel/romatizmal ateş)
- **Orijinal:** "En sık yüz (kelebek şeklinde) veya bacak/ayaklarda."
- **Düzeltilmiş:** "En sık bacak/ayaklarda (olguların ~%70-80'i); yüz tutulumu (kelebek şeklinde) klasiktir ama günümüzde daha seyrektir. (DÜZELTME)"
- **Gerekçe:** Güncel epidemiyolojide erizipel en sık alt ekstremitede; klasik "yüz" tanımı artık azınlıkta.

### 1.5 🟢 Romatizmal ateşte aspirin/kortikosteroid ayrımı
- **Not:** id `mq3yc0td2kmc082` (aynı not)
- **Orijinal:** "Yüksek doz aspirin (kardit yoksa), kortikosteroid (ciddi karditte)."
- **Düzeltilmiş:** "Yüksek doz aspirin/NSAİİ artrit için (hafif karditte de verilebilir), kortikosteroid ağır karditte (kalp yetmezliği eşlik ediyorsa). (DÜZELTME)"
- **Gerekçe:** Aspirin/NSAİİ artrit endikasyonludur ve hafif karditte de verilir; "kardit yoksa" ifadesi yanlış. Kortikosteroid ağır kardit (KKY) içindir.

### 1.6 🟢 Klebsiella aminopenisilinlere intrinsik dirençli
- **Not:** id `mq5dyiitk6b54w8` (08.06 15:48, amoksisilin-klavulanat)
- **Orijinal:** "Amoksisilin bazı Gram-negatif bakterilere etkilidir ama sınırlıdır:" (+ tabloda E.coli/Klebsiella "Değişken")
- **Düzeltilmiş:** "Amoksisilin bazı Gram-negatif bakterilere etkilidir ama sınırlıdır (DÜZELTME: Klebsiella aminopenisilinlere intrinsik dirençlidir, düz amoksisilin etkisizdir):"
- **Gerekçe:** *Klebsiella* kromozomal beta-laktamaz nedeniyle ampisilin/amoksisiline **doğal (intrinsik) dirençli**; "değişken" ifadesi yanıltıcı.

---

## İnceleme sırasında not edilen, INLINE düzeltilmeyenler
- ⚙️ **Bozuk not** id `mq...` (08.06 14:16, 154 ch): soru "pen v nedir" ama cevap alanında başka bir soru var — karışmış yakalama. Kurtarılamaz; temizlik adayı (boş/bozuk not kararıyla birlikte ele alınacak).
- 🟢 **Şarbon (anthrax)** (id `mq5chbleqxrx7w0`, kristalize Pen G order notu): Pen G ilk tercih değil (siprofloksasin/doksisiklin); doz da düşük. Tablo hücresi olduğu için inline değil, burada kayıt altına alındı (nadir endikasyon).
- 🟢 **Marka doğrulaması (yerel):** "Pen VK" Türkiye markası değil (jenerik ABD adı). Cliacil'in güncel piyasa durumu hekim tarafından teyit edilmeli.
