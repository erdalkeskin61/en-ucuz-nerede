/**
 * 🧪 Test Paketi: "Şimdi mi Almalısın, Beklemeli misin?" (AI Fiyat Zamanlama Tahmincisi)
 *
 * Çalıştırma: node scripts/test-fiyat-zamanlama.mjs
 */
import assert from 'node:assert/strict';
import {
  zamanlamaTahminiYap,
  magazaKampanyaKontrol,
  MAGAZA_DONGULERI,
} from '../src/fiyatZamanlama.js';
import { sonucMesajiOlustur } from '../src/telegramBot.js';

let basarili = 0;
let basarisiz = 0;

function test(ad, fn) {
  try {
    fn();
    console.log(`  ✅ ${ad}`);
    basarili++;
  } catch (e) {
    console.error(`  ❌ ${ad}: ${e.message}`);
    basarisiz++;
  }
}

async function testAsync(ad, fn) {
  try {
    await fn();
    console.log(`  ✅ ${ad}`);
    basarili++;
  } catch (e) {
    console.error(`  ❌ ${ad}: ${e.message}`);
    basarisiz++;
  }
}

console.log('⏱️ Fiyat Zamanlama & Satın Alma Karar Destek Testleri Başlıyor...\n');

// ---------------------------------------------------------------------------
// 1. DİP FİYAT (ŞİMDİ AL) SENARYOLARI
// ---------------------------------------------------------------------------
test('Senaryo 1: Fiyat son 90 günün tarihi dip seviyesinde -> SIMDI_AL', () => {
  const analiz = {
    bulundu: true,
    yeterliVeri: true,
    gunSayisi: 45,
    veriNoktasi: 12,
    minFiyat90: 758,
    maxFiyat60: 1050,
    ortFiyat30: 920,
  };

  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 758,
    analiz,
    magazaId: 'trendyol',
  });

  assert.equal(sonuc.karar, 'SIMDI_AL', 'Karar SIMDI_AL olmalı');
  assert.equal(sonuc.rozet, '🟢 ŞİMDİ AL');
  assert.ok(sonuc.guven >= 80, `Güven skoru >= 80 olmalı (gerçek: ${sonuc.guven})`);
  assert.ok(sonuc.aciklama.includes('758'), 'Açıklamada dip fiyat tutarı yer almalı');
  assert.equal(sonuc.beklenenTasarrufTL, null, 'Şimdi al senaryosunda bekleme tasarrufu olmaz');
});

test('Senaryo 1B: Fiyat 30 günlük ortalamanın %15 altında -> SIMDI_AL', () => {
  const analiz = {
    bulundu: true,
    yeterliVeri: true,
    gunSayisi: 30,
    veriNoktasi: 8,
    minFiyat90: 500,
    maxFiyat60: 800,
    ortFiyat30: 600,
  };

  // 600'ün %15 altı = 510 TL (dip 500'e yakın değil ama ortalamadan %15 ucuz)
  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 510,
    analiz,
    magazaId: 'hepsiburada',
  });

  assert.equal(sonuc.karar, 'SIMDI_AL');
  assert.ok(sonuc.guven >= 75);
  assert.ok(sonuc.aciklama.includes('ortalamasından') || sonuc.aciklama.includes('avantajlı'));
});

// ---------------------------------------------------------------------------
// 2. PAHALI / ŞİŞİRİLMİŞ (BEKLE) SENARYOLARI
// ---------------------------------------------------------------------------
test('Senaryo 2: Fiyat 30 günlük ortalamanın %20 üzerinde -> BEKLE', () => {
  const analiz = {
    bulundu: true,
    yeterliVeri: true,
    gunSayisi: 60,
    veriNoktasi: 15,
    minFiyat90: 750,
    maxFiyat60: 1100,
    ortFiyat30: 800,
  };

  // 800 TL ortalama yerine 980 TL satılıyor
  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 980,
    analiz,
    magazaId: 'amazon',
  });

  assert.equal(sonuc.karar, 'BEKLE');
  assert.equal(sonuc.rozet, '🟡 BEKLE');
  assert.ok(sonuc.guven >= 70, `Güven skoru >= 70 olmalı (gerçek: ${sonuc.guven})`);
  assert.ok(sonuc.beklenenTasarrufTL >= 150, `Tasarruf ~180 TL olmalı (gerçek: ${sonuc.beklenenTasarrufTL})`);
  assert.ok(sonuc.beklemeGun > 0, 'Bekleme gün sayısı tanımlı olmalı');
  assert.ok(sonuc.aciklama.includes('tasarruf'), 'Açıklamada tasarruf vurgulanmalı');
});

// ---------------------------------------------------------------------------
// 3. MAĞAZA KAMPANYA DÖNGÜSÜ KONTROLLERİ
// ---------------------------------------------------------------------------
test('Senaryo 3A: İncehesap Gaming Gecesi (Cuma) tespiti', () => {
  // Çarşamba günü (day 3) test edelim: 2026-11-04 Çarşamba
  const carsamba = new Date(2026, 10, 4); // Çarşamba (3)
  const k = magazaKampanyaKontrol('incehesap', carsamba);

  assert.ok(k.yakindaMi, 'Kampanya yakında olarak algılanmalı');
  assert.equal(k.kalanGun, 2, 'Çarşambadan Cumaya 2 gün kalmış olmalı');
  assert.ok(k.aciklama.includes('2 gün sonra'), 'Açıklama kalan günü belirtmeli');
});

test('Senaryo 3B: n11 11 Kupon Günleri tespiti', () => {
  // Ayın 8'inde test edelim: 11'ine 3 gün var
  const sekiz = new Date(2026, 10, 8);
  const k = magazaKampanyaKontrol('n11', sekiz);

  assert.ok(k.yakindaMi);
  assert.equal(k.kalanGun, 3);
  assert.ok(k.aciklama.includes('3 gün sonra'));
});

test('Senaryo 3C: Kampanya gününde ürün dipte değilse BEKLE tavsiyesi ve sepet kuponu tasarrufu', () => {
  const analiz = {
    bulundu: true,
    yeterliVeri: true,
    gunSayisi: 30,
    veriNoktasi: 10,
    minFiyat90: 500,
    maxFiyat60: 600,
    ortFiyat30: 550,
  };

  // Ayın 28'i: Trendyol ay başına 4 gün var
  const aySonu = new Date(2026, 9, 28); // 28 Ekim
  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 560, // dipte değil, ortalama civarı
    analiz,
    magazaId: 'trendyol',
    tarih: aySonu,
  });

  assert.equal(sonuc.karar, 'BEKLE');
  assert.ok(sonuc.beklemeGun > 0);
  assert.ok(sonuc.aciklama.includes('sepet kuponu') || sonuc.aciklama.includes('Trendyol'));
});

// ---------------------------------------------------------------------------
// 4. COLD-START VE YETERSİZ VERİ SENARYOLARI (DÜRÜSTLÜK KURALI)
// ---------------------------------------------------------------------------
test('Senaryo 4A: Veri yok / analiz bulunamadı -> NOTR ve veri_yok kodu', () => {
  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 500,
    analiz: null,
    magazaId: 'robotistan',
  });

  assert.equal(sonuc.karar, 'NOTR');
  assert.equal(sonuc.rozet, '⚪ DENGELİ FİYAT');
  assert.equal(sonuc.tavsiyeKodu, 'veri_yok');
  assert.ok(sonuc.aciklama.includes('en az 3 gün gerekli'));
});

test('Senaryo 4B: Yetersiz gün sayısı (1 gün) -> Sahte güven skoru üretilmez', () => {
  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 500,
    analiz: { bulundu: true, yeterliVeri: false, gunSayisi: 1, veriNoktasi: 2 },
    magazaId: 'robotistan',
  });

  assert.equal(sonuc.karar, 'NOTR');
  assert.ok(sonuc.guven <= 60, 'Yetersiz veride güven skoru yüksek olamaz');
});

test('Senaryo 4C: Fiyat piyasa normali bandında (±%5) -> NOTR', () => {
  const analiz = {
    bulundu: true,
    yeterliVeri: true,
    gunSayisi: 40,
    veriNoktasi: 15,
    minFiyat90: 900,
    maxFiyat60: 1100,
    ortFiyat30: 1000,
  };

  // 1000 TL ortalama varken 1010 TL satılıyor (+%1)
  const sonuc = zamanlamaTahminiYap({
    guncelFiyat: 1010,
    analiz,
    magazaId: null, // genel piyasa (kampanyasız)
    tarih: new Date(2026, 10, 15),
  });

  assert.equal(sonuc.karar, 'NOTR');
  assert.equal(sonuc.rozet, '⚪ DENGELİ FİYAT');
  assert.ok(sonuc.aciklama.includes('dengeli seyrediyor'));
});

// ---------------------------------------------------------------------------
// 5. TELEGRAM VE PİPELİNE ENTEGRASYON TESTİ
// ---------------------------------------------------------------------------
test('Senaryo 5: Telegram sonucMesajiOlustur zamanlama tavsiyesini içerir', () => {
  const sahteSonuc = {
    kaynak: { urun: 'Bambu Lab P1S 3D Yazıcı' },
    ozet: {
      bulunanSiteSayisi: 5,
      stoktaVarSayisi: 4,
      zamanlamaTavsiyesi: {
        karar: 'SIMDI_AL',
        rozet: '🟢 ŞİMDİ AL',
        guven: 88,
        aciklama: 'Bu ürün son 60 günün en dip seviyesinde (₺24.287 TL).',
      },
    },
    sonuclar: [
      {
        site: '3dcim',
        siteName: '3Dcim',
        status: 'found',
        enUcuz: true,
        product: {
          title: 'Bambu Lab P1S Combo',
          inStock: true,
          pricing: { toplam: 24287, kargo: { ucret: 0 } },
        },
      },
      {
        site: 'robotistan',
        siteName: 'Robotistan',
        status: 'found',
        product: {
          title: 'Bambu Lab P1S Combo',
          inStock: true,
          pricing: { toplam: 25900, kargo: { ucret: 0 } },
        },
      },
    ],
  };

  const mesaj = sonucMesajiOlustur(sahteSonuc);

  assert.ok(mesaj.includes('TAVSİYE: ŞİMDİ AL'), 'Telegram mesajı ŞİMDİ AL rozetini içermeli');
  assert.ok(mesaj.includes('%88 Güven'), 'Telegram mesajı güven oranını içermeli');
  assert.ok(mesaj.includes('en dip seviyesinde'), 'Telegram mesajı açıklama metnini içermeli');
  assert.ok(mesaj.includes('3Dcim'), 'En ucuz mağaza yer almalı');
});

console.log(`\n========================================`);
console.log(`Testler Tamamlandı: ${basarili} Başarılı, ${basarisiz} Hatalı`);
console.log(`========================================\n`);

if (basarisiz > 0) {
  process.exit(1);
}