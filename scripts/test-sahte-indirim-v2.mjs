/**
 * 🚨 Sahte İndirim & Şişirilmiş Liste Fiyatı Dedektörü V2 — kabul testleri
 * (2026-11-05)
 *
 * Kapsam:
 *   1) GERÇEK DB ile istatistik: `getFiyatAnalizi` 30/60/90 günlük pencereleri
 *      doğru hesaplıyor mu? (ortFiyat30, maxFiyat60, minFiyat90)
 *   2) Kural A: 30 gün ortalaması ₺500 iken ₺1.000 üstü çizili fiyat →
 *      `sahte_indirim`, doğru uyarı metni, iddia %50 / gerçek ~%0.
 *   3) Kural B: 90 günlük taban ₺450 iken ₺430 satış → `gercek_firsat`.
 *   4) Kural C: ortalamaya yakın fiyat → `normal`, rozet metni temiz.
 *   5) COLD-START: geçmişi olmayan ürün → çökmüyor, yanıltıcı rozet basmıyor.
 *   6) Pipeline işaretleme: her teklife `sahteIndirim` iliştiriliyor.
 *   7) Web: app.js rozetleri + style.css parlayan sınıflar + tooltip.
 *   8) Telegram: `sonucMesajiOlustur` ve radar kartı satırları.
 *
 * Ağ isteği YOK. Testin yazdığı fiyat noktaları sonunda SİLİNİR.
 *
 * Kullanım: node scripts/test-sahte-indirim-v2.mjs
 */
import fs from 'node:fs';
import {
  addPricePoint, getFiyatAnalizi, deletePricePoints, closeDatabase,
} from '../src/store.js';
import {
  sahteIndirimAnalizi, sahteIndirimleriIsaretle,
} from '../src/pricing.js';
import { sonucMesajiOlustur } from '../src/telegramBot.js';
import { radarKartOlustur } from '../src/otonomRadar.js';

let gecen = 0, toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);
const yakin = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;
const GUN = 86400000;

/** Ürün kimliği için benzersiz anahtar (test verisi karışmasın). */
const PID = `test-v2-${Date.now()}`;
const yazilanlar = [];

/** Gün bazlı gerçek gözlemler yazar. */
function gecmisYaz(noktalar) {
  for (const n of noktalar) {
    addPricePoint({
      productId: PID,
      site: 'testmarket',
      price: n.fiyat,
      netPrice: n.fiyat,
      ts: new Date(Date.now() - n.gun * GUN).toISOString(),
    });
    yazilanlar.push(n.fiyat);
  }
}

try {
  /* ---------------------------------------------------------------- */
  bolum('1) 📊 Pencere istatistikleri (gerçek SQLite)');

  // Son 90 güne yayılmış gerçek gözlemler:
  //   0–29 gün  : 490–510 (ortalama 500)
  //   30–59 gün : 520–560 (60 günün maksimumu 560)
  //   60–89 gün : 450–480 (90 günün minimumu 450)
  gecmisYaz([
    { gun: 88, fiyat: 470 }, { gun: 80, fiyat: 460 }, { gun: 72, fiyat: 450 },
    { gun: 66, fiyat: 480 }, { gun: 55, fiyat: 540 }, { gun: 48, fiyat: 560 },
    { gun: 40, fiyat: 530 }, { gun: 33, fiyat: 520 }, { gun: 29, fiyat: 510 },
    { gun: 22, fiyat: 500 }, { gun: 15, fiyat: 495 }, { gun: 8, fiyat: 505 },
    { gun: 3, fiyat: 500 }, { gun: 1, fiyat: 498 },
  ]);

  const analiz = getFiyatAnalizi(PID);
  kontrol('geçmiş bulundu', analiz.bulundu === true, analiz.neden);
  kontrol('yeterli veri (≥3 gün)', analiz.yeterliVeri === true, String(analiz.gunSayisi));
  // Gün ağırlıklı ortalama: (510+500+495+505+500+498)/6 = 501,33
  kontrol('ortFiyat30 gün-ağırlıklı ≈ ₺501,33', yakin(analiz.ortFiyat30, 501.33, 0.05), String(analiz.ortFiyat30));
  kontrol('maxFiyat60 ≈ ₺560', yakin(analiz.maxFiyat60, 560, 1), String(analiz.maxFiyat60));
  kontrol('minFiyat90 ≈ ₺450', yakin(analiz.minFiyat90, 450, 1), String(analiz.minFiyat90));
  kontrol('ortFiyat60 ≈ ₺520', analiz.ortFiyat60 > 470 && analiz.ortFiyat60 < 570, String(analiz.ortFiyat60));
  kontrol('ortFiyat90 ≈ ₺500', analiz.ortFiyat90 > 470 && analiz.ortFiyat90 < 530, String(analiz.ortFiyat90));
  kontrol('eski alanlar korunuyor (minFiyat/maxFiyat/ortFiyat)',
    analiz.minFiyat != null && analiz.maxFiyat != null && analiz.ortFiyat != null);
  kontrol('pencere adı 30 gün', Number(analiz.ortPencereGun) === 30, String(analiz.ortPencereGun));

  /* ---------------------------------------------------------------- */
  bolum('2) 🚨 Kural A — şişirilmiş liste fiyatı');

  const A = sahteIndirimAnalizi({
    satisFiyati: 499, listeFiyati: 1000, analiz,
  });
  kontrol('rozetTuru = sahte_indirim', A.rozetTuru === 'sahte_indirim', A.rozetTuru);
  kontrol('sahteIndirim bayrağı', A.sahteIndirim === true);
  kontrol('iddiaEdilenIndirim ≈ %50', yakin(A.iddiaEdilenIndirim, 50.1, 0.3), String(A.iddiaEdilenIndirim));
  kontrol('gercekTasarruf ≈ %0 (ortalamaya göre)', A.gercekTasarruf <= 1, String(A.gercekTasarruf));
  kontrol('rozetRengi turuncu', A.rozetRengi === 'turuncu', A.rozetRengi);
  kontrol('rozetMetni ortalamayı yazıyor',
    /Şişirilmiş Liste Fiyatı/.test(A.rozetMetni || '')
    && /gerçek piyasa ortalaması ₺\d/.test(A.rozetMetni || ''),
    A.rozetMetni);
  kontrol('tooltip yapay indirim uyarısı içeriyor',
    /Yapay İndirim Uyarısı/.test(A.tooltip || '')
    && /ortalama ₺\d/.test(A.tooltip || ''), A.tooltip);
  kontrol('tooltip gerçek tasarrufu yazıyor', /Gerçek tasarrufunuz/.test(A.tooltip || ''));
  kontrol('etiketOraniOrt30 = 2.0', yakin(A.etiketOraniOrt30, 2, 0.01), String(A.etiketOraniOrt30));

  // Eşik sınırı: %25 fazlası şişirilmiş DEĞİL, %26 fazlası şişirilmiş.
  const sinirAlt = sahteIndirimAnalizi({ satisFiyati: 500, listeFiyati: 625, analiz });
  kontrol('liste = ort×1.25 → rozet YOK (sınırda lehte karar)',
    sinirAlt.sahteIndirim === false, sinirAlt.rozetTuru);
  const sinirUst = sahteIndirimAnalizi({ satisFiyati: 500, listeFiyati: 640, analiz });
  kontrol('liste = ort×1.28 → sahte_indirim', sinirUst.sahteIndirim === true, sinirUst.rozetTuru);

  // maxFiyat60 kuralı tek başına (ortalamaya göre değil)
  const maxKural = sahteIndirimAnalizi({
    satisFiyati: 640,
    listeFiyati: 700, // max60 (560) × 1.15 = 644 → 700 aşıyor
    analiz,
  });
  kontrol('maxFiyat60 kuralı tek başına tetikler', maxKural.sahteIndirim === true, maxKural.rozetTuru);
  kontrol('tooltip max60 kanıtını yazıyor', /en yüksek fiyatı/.test(maxKural.tooltip || ''));

  /* ---------------------------------------------------------------- */
  bolum('3) 🔥 Kural B — gerçek dip fırsat');

  const B = sahteIndirimAnalizi({
    satisFiyati: 430, listeFiyati: null, analiz,
  });
  kontrol('rozetTuru = gercek_firsat', B.rozetTuru === 'gercek_firsat', B.rozetTuru);
  kontrol('gercekFirsat bayrağı', B.gercekFirsat === true);
  kontrol('rozetRengi yeşil', B.rozetRengi === 'yesil', B.rozetRengi);
  kontrol('rozetMetni tarihi dip diyor',
    /Gerçek Fırsat/.test(B.rozetMetni || '') && /90 Günün/.test(B.rozetMetni || ''), B.rozetMetni);
  kontrol('sahte indirim iddiası yok', B.sahteIndirim === false);

  // Tam dibe eşit fiyat da fırsattır (tolerans).
  const tamDip = sahteIndirimAnalizi({ satisFiyati: 450, analiz });
  kontrol('minFiyat90 tam eşit → gercek_firsat', tamDip.rozetTuru === 'gercek_firsat', tamDip.rozetTuru);
  // Dibin biraz üstü fırsat değildir.
  const dipUst = sahteIndirimAnalizi({ satisFiyati: 470, analiz });
  kontrol('dibin %4 üstü → gercek_firsat DEĞİL', dipUst.gercekFirsat === false, dipUst.rozetTuru);

  /* ---------------------------------------------------------------- */
  bolum('4) ⚖️ Kural C — piyasa normali');

  const C = sahteIndirimAnalizi({ satisFiyati: 510, listeFiyati: 520, analiz });
  kontrol('rozetTuru = normal', C.rozetTuru === 'normal', C.rozetTuru);
  kontrol('yapay indirim algısı yok', C.sahteIndirim === false && C.gercekFirsat === false);
  kontrol('temiz bilgi metni var', /Piyasa normali/.test(C.rozetMetni || ''), C.rozetMetni);

  /* ---------------------------------------------------------------- */
  bolum('5) ❄️ Cold-start — geçmiş yok');

  const YOK = `test-v2-yok-${Date.now()}`;
  const yokAnaliz = getFiyatAnalizi(YOK);
  kontrol('geçmiş yok → bulundu:false', yokAnaliz.bulundu === false);
  kontrol('geçmiş yok → yeterliVeri:false', yokAnaliz.yeterliVeri === false);
  kontrol('yeni pencereli alanlar null', yokAnaliz.ortFiyat30 === null
    && yokAnaliz.maxFiyat60 === null && yokAnaliz.minFiyat90 === null);

  const cold = sahteIndirimAnalizi({ satisFiyati: 499, listeFiyati: 1000, analiz: yokAnaliz });
  kontrol('cold-start rozet BASMAZ', cold.rozetTuru === 'normal' && cold.sahteIndirim === false);
  kontrol('cold-start neden açıklıyor', typeof cold.neden === 'string' && cold.neden.length > 10, cold.neden);
  kontrol('cold-start mağaza iddiasını raporlar (uydurmadan)',
    yakin(cold.iddiaEdilenIndirim, 50.1, 0.3), String(cold.iddiaEdilenIndirim));
  kontrol('cold-start gerçek tasarruf UYDURMAZ', cold.gercekTasarruf === null);

  // Geçmiş çok az (1 gün) → yine rozet yok
  const AZ = `test-v2-az-${Date.now()}`;
  addPricePoint({ productId: AZ, site: 'testmarket', price: 500, netPrice: 500, ts: new Date().toISOString() });
  const azAnaliz = getFiyatAnalizi(AZ);
  const az = sahteIndirimAnalizi({ satisFiyati: 499, listeFiyati: 1000, analiz: azAnaliz });
  kontrol('1 günlük geçmiş → rozet YOK', az.rozetTuru === 'normal', az.rozetTuru);
  kontrol('1 günlük geçmiş → neden açıklanır', /en az 3 gün/.test(az.neden || ''), az.neden);
  deletePricePoints(AZ);

  /* ---------------------------------------------------------------- */
  bolum('6) 🔗 Pipeline işaretleme');

  const sonuclar = [
    { status: 'found', site: 'a', product: { title: 'A', sellingPrice: 499, listPrice: 1000, pricing: { toplam: 499 } } },
    { status: 'found', site: 'b', product: { title: 'B', sellingPrice: 430, pricing: { toplam: 430 } } },
    { status: 'found', site: 'c', product: { title: 'C', sellingPrice: 510, listPrice: 520, pricing: { toplam: 510 } } },
    { status: 'not_found' },
  ];
  const islenen = sahteIndirimleriIsaretle(sonuclar, analiz);
  kontrol('3 teklif denetlendi', islenen === 3, String(islenen));
  kontrol('teklif A sahte_indirim', sonuclar[0].sahteIndirim.rozetTuru === 'sahte_indirim');
  kontrol('teklif A eski bayrağı da dolu', sonuclar[0].sisirilmisEtiket === true);
  kontrol('teklif B gercek_firsat', sonuclar[1].sahteIndirim.rozetTuru === 'gercek_firsat');
  kontrol('teklif C normal', sonuclar[2].sahteIndirim.rozetTuru === 'normal');
  kontrol('bulunamayan teklife meta eklenmez', sonuclar[3].sahteIndirim === undefined);

  // Cold-start pipeline: hiçbir teklif rozet almamalı
  const coldSonuc = [
    { status: 'found', product: { title: 'X', sellingPrice: 499, listPrice: 1000, pricing: { toplam: 499 } } },
  ];
  sahteIndirimleriIsaretle(coldSonuc, yokAnaliz);
  kontrol('cold-start pipeline rozet basmaz', coldSonuc[0].sahteIndirim.sahteIndirim === false);

  /* ---------------------------------------------------------------- */
  bolum('7) 🖥️ Web arayüzü sözleşmesi');

  const appJs = fs.readFileSync('public/app.js', 'utf8');
  const css = fs.readFileSync('public/style.css', 'utf8');
  kontrol('app.js sahte indirim rozeti', appJs.includes('sahte-indirim-rozet'));
  kontrol('app.js gerçek fırsat rozeti', appJs.includes('gercek-firsat-rozet'));
  kontrol('app.js tooltip verisi (data-ipucu)', appJs.includes('data-ipucu='));
  kontrol('app.js iddia/gerçek oran gösteriliyor',
    appJs.includes('iddiaEdilenIndirim') && appJs.includes('gercekTasarruf'));
  kontrol('app.js şüpheli etiket sınıfı',
    appJs.includes('etiket-fiyat') && appJs.includes("'supheli'"));
  kontrol('app.js vitrinde gerçek fırsat rozeti', appJs.includes('vitrin-rozet firsat'));
  kontrol('CSS gerçek fırsat parlaması', /@keyframes gf-parla/.test(css));
  kontrol('CSS sahte indirim uyarı stili', /\.sahte-indirim-rozet\s*\{/.test(css));
  kontrol('CSS tooltip', /\.sahte-indirim-rozet\[data-ipucu\]::after/.test(css));
  kontrol('CSS hareket azaltma desteği', /prefers-reduced-motion: reduce[\s\S]{0,200}gercek-firsat-rozet/.test(css));
  kontrol('CSS koyu tema', /html\[data-theme="dark"\] \.sahte-indirim-rozet/.test(css));

  /* ---------------------------------------------------------------- */
  bolum('8) 📱 Telegram kartları');

  // Ürün karşılaştırma mesajı — sahte indirim
  const sahteMaliyet = {
    kaynak: { urun: 'Test Ürün A' },
    sonuclar: [
      { status: 'found', site: 'a', siteName: 'A Mağaza', product: { title: 'Test Ürün A', sellingPrice: 499, listPrice: 1000, inStock: true, url: 'https://a.test/x', pricing: { toplam: 499, kargo: { uygulanir: false } } } },
    ],
    ozet: {
      bulunanSiteSayisi: 1, stoktaVarSayisi: 1, stoktaYokSayisi: 0,
      sahteIndirim: A,
    },
  };
  const tgA = sonucMesajiOlustur(sahteMaliyet);
  kontrol('Telegram: Etiket Analizi satırı', tgA.includes('Etiket Analizi'));
  kontrol('Telegram: iddia edilen oran yazılıyor', /%50/.test(tgA), tgA.slice(0, 200));
  kontrol('Telegram: gerçek ortalama yazılıyor', /gerçek piyasa ortalaması ₺\d/.test(tgA), tgA.slice(0, 240));
  kontrol('Telegram: HTML escape bozulmamış', !/<script/i.test(tgA));

  // Ürün karşılaştırma mesajı — gerçek fırsat
  const firsatMaliyet = {
    kaynak: { urun: 'Test Ürün B' },
    sonuclar: [
      { status: 'found', site: 'b', siteName: 'B Mağaza', product: { title: 'Test Ürün B', sellingPrice: 430, inStock: true, url: 'https://b.test/x', pricing: { toplam: 430, kargo: { uygulanir: false } } } },
    ],
    ozet: { bulunanSiteSayisi: 1, stoktaVarSayisi: 1, stoktaYokSayisi: 0, sahteIndirim: B },
  };
  const tgB = sonucMesajiOlustur(firsatMaliyet);
  kontrol('Telegram: Piyasa Analizi satırı', tgB.includes('Piyasa Analizi'));
  kontrol('Telegram: Tarihi Dip Seviye', tgB.includes('Tarihi Dip Seviye'));

  // Cold-start: analiz satırı OLMAMALI
  const coldMaliyet = {
    kaynak: { urun: 'Test Ürün X' },
    sonuclar: [
      { status: 'found', site: 'x', siteName: 'X Mağaza', product: { title: 'Test Ürün X', sellingPrice: 499, listPrice: 1000, inStock: true, url: 'https://x.test/x', pricing: { toplam: 499, kargo: { uygulanir: false } } } },
    ],
    ozet: { bulunanSiteSayisi: 1, stoktaVarSayisi: 1, stoktaYokSayisi: 0, sahteIndirim: cold },
  };
  const tgCold = sonucMesajiOlustur(coldMaliyet);
  kontrol('Telegram cold-start: analiz satırı yok',
    !tgCold.includes('Etiket Analizi') && !tgCold.includes('Piyasa Analizi'), tgCold.slice(0, 160));

  // Radar kartı
  const radarDurum = {
    ad: 'Test Ürün A', kategori: 'yazici', stokta: true,
    fiyat: 499, site: 'A Mağaza', kargo: 'Ücretsiz Kargo',
    stokluSayisi: 1, tukenenSayisi: 0, digerleri: [],
    sahteIndirim: A,
  };
  const radarKart = radarKartOlustur(radarDurum);
  kontrol('Radar kartı: Etiket Analizi', radarKart.includes('Etiket Analizi'));
  const radarKartFirsat = radarKartOlustur({ ...radarDurum, sahteIndirim: B });
  kontrol('Radar kartı: Piyasa Analizi', radarKartFirsat.includes('Piyasa Analizi'));
  const radarKartCold = radarKartOlustur({ ...radarDurum, sahteIndirim: null });
  kontrol('Radar kartı cold-start: analiz yok',
    !radarKartCold.includes('Etiket Analizi') && !radarKartCold.includes('Piyasa Analizi'));
} finally {
  // Test verisini her durumda temizle (yanlış kimlikle kalan kayıt olmasın).
  try { deletePricePoints(PID); } catch { /* yoksay */ }
}

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
