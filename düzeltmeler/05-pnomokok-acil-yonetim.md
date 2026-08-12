# 5. Küme — Pnömokok & Asplenik Fulminan Sepsis Acil Yönetimi (Gemini)

**Kapsam:** 09.06.2026, 14 not (10 orijinal "Pnömokoklar" + senkronla gelen 4 yeni "Google Gemini" notu: 15:44, 15:54, 16:07, 16:10). Başlık "yapı ve özellikleri" olsa da içerik ağırlıklı olarak **acil servis yönetimi**: asplenik pnömokok sepsisi/menenjiti, sepsis order'ları, DİK, kan gazı, norepinefrin, IV parasetamol hipotansiyonu, P/F oranı/ARDS, LP kararı, meningokok kemoprofilaksisi, elektrolit yönetimi.

**Genel:** Bu küme **olağanüstü doğru ve ileri düzey**. Hasta zararına yol açacak doz hatası
yok. Sadece 1 ilaç-adı hatası (🟡) + 1 terminoloji (🟢) + 1 marka doğrulaması.

## Doğrulanan (değişiklik gerekmeyen) kritik bilgiler
- **OPSI** (asplenide kapsüllü bakteri sepsisi, mortalite >%50). ✓
- Ampirik: **Seftriakson 2 g q12h (menenjit dozu) + Vankomisin 15-20 mg/kg**; menenjit şüphesinde antibiyotikten hemen önce/eş zamanlı **deksametazon**. ✓✓
- **Seftriakson + Vankomisin aynı torbada geçimsiz** (çökelme) → ayrı hatlar. ✓✓ doğru.
- **IV parasetamol** kritik hastada hipotansiyon yapar (NO aracılı vazodilatasyon + hızlı pik); septik şokta infüzyonu uzat/ertele. ✓ doğru.
- **Norepinefrin** septik şokta 1. tercih (saf α1); adrenalin anafilaksi/arrest. Hazırlık 4 mg/100 cc D5 = 40 mcg/mL; 0.05-0.1 mcg/kg/dk. ✓ (matematik doğru).
- **Laktat klirensi** (hedef %10-20 düşüş), **P/F oranı + Berlin ARDS** (≤100 ağır), **DİK** kan ürünü stratejisi, **hiperkalemi** (Ca glukonat + insülin/glukoz + salbutamol), bikarbonatın yalnız pH<7.1'de — hepsi ✓ güncel kılavuzlarla uyumlu (Surviving Sepsis, Berlin).
- **Meningokok kemoprofilaksisi**: siprofloksasin 500 mg tek doz / rifampisin 600 mg q12h×2g; gebe → seftriakson 250 mg IM; çocuk → seftriakson 125 mg IM veya rifampisin şurup. Pnömokokta temaslı profilaksisi gerekmez. ✓✓ doğru.

---

## Düzeltmeler

### 5.1 🟡 Norepinefrin ekstravazasyon antidotu: "Pentalomin" → Fentolamin
- **Not:** id `mq6r8cc3e9l61c2` (14:48, norepinefrin)
- **Orijinal:** "...o bölgeye lokal damar genişletici (varsa **Pentalomin**, yoksa Nitroderm flaster veya ılık kompres) uygulayın."
- **Düzeltilmiş (önerilen):** "...o bölgeye antidot uygulayın. (DÜZELTME: doğru ilaç **fentolamin** — alfa-bloker; 5-10 mg, 10-15 mL serum fizyolojik içinde ekstravazasyon sahasına infiltre edilir. 'Pentalomin' diye bir ilaç yoktur. Fentolamin bulunamazsa **nitrogliserin (Nitroderm flaster)** veya **terbutalin** alternatiftir.)"
- **Gerekçe:** Norepinefrin ekstravazasyonunun FDA onaylı antidotu fentolamindir. "Pentalomin" gerçek bir ilaç adı değil (halüsinasyon). Bu, acil bir antidot olduğu için düzeltilmesi önemli.
- **Kaynak:** FDA; vazopressör ekstravazasyon yönetimi literatürü.

### 5.2 🟢 Cushing triadı tanımı (anizokori değil, düzensiz solunum)
- **Not:** id `mq6s0kxpey96z8u` (15:10, LP kararı)
- **Orijinal:** "Pupillerde asimetri (anizokori), bradikardi ve hipertansiyon (Cushing triadı) görüyorsan..."
- **Düzeltilmiş (önerilen):** "(DÜZELTME) Cushing triadı = **hipertansiyon + bradikardi + düzensiz solunum**'dur; pupil asimetrisi (anizokori) ise ayrı bir **herniasyon** bulgusudur. Bunlardan herhangi birini görüyorsan KİBAS/herniasyon düşün ve LP'yi ertele..."
- **Gerekçe:** Anizokori klasik Cushing triadının parçası değildir; üçlü hipertansiyon-bradikardi-düzensiz solunumdur. Klinik mesaj (KİBAS varsa LP erteleme) doğru, sadece terminoloji düzeltiliyor.

---

## Doğrulanması gereken (yerel — hekim teyidi)
- 🟡 **Norepinefrin marka adları** (not `mq6r8cc3e9l61c2`): "Norepin" doğru. Ancak **"Efidrin"** fonetik olarak **efedrin** (farklı bir vazopressör) ile karışıyor; "Biosente" de teyit edilmeli. Bu kritik bir ilaç olduğundan marka adları doğrulanmalı (AI'ın marka adı uydurma/karıştırma riski).

## Nüanslar (kayıt için)
- Norepinefrin "%5 Dekstroz içinde daha stabil" — klasik/prospektüs önerisi; güncel veride SF de kabul edilebilir (hata değil).
- Fibrinojen replasman eşiği <150 mg/dL (aktif kanamada) — bazı kılavuzlar <100; kabul edilebilir aralık.
