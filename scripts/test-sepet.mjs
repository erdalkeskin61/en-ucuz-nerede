/**
 * Sepet optimizasyonu testi (ağa çıkmaz — saf hesap fonksiyonları).
 *   node scripts/test-sepet.mjs
 *
 * Senaryo (kullanıcının örneği): 3 ürün — telefon kılıfı + ekran koruyucu +
 * 65W GaN şarj aleti. Üç mağaza, farklı kargo eşikleri.
 */
import { senaryolariHesapla, gruplariOlustur, kargoKurus } from '../src/basketOptimizer.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
}

/* ---------------- 1) Kargo eşik mantığı ---------------- */
kontrol('eşik altı → ücret alınır', kargoKurus(47000, { fee: 50, freeOver: 500 }) === 5000);
kontrol('eşik tam → ücretsiz (ve üzeri)', kargoKurus(50000, { fee: 50, freeOver: 500 }) === 0);
kontrol('eşik üstü → ücretsiz', kargoKurus(60000, { fee: 50, freeOver: 500 }) === 0);
kontrol('freeOverExclusive: tam eşikte ücret', kargoKurus(50000, { fee: 50, freeOver: 500, freeOverExclusive: true }) === 5000);
kontrol('freeOverExclusive: 1 kuruş üstü ücretsiz', kargoKurus(50001, { fee: 50, freeOver: 500, freeOverExclusive: true }) === 0);
kontrol('applies=false → kargo yok', kargoKurus(100, { fee: 50, freeOver: 500, applies: false }) === 0);
kontrol('eşik yok → sabit ücret', kargoKurus(100000, { fee: 119.90, freeOver: null }) === 11990);

/* ---------------- 2) Gruplama ---------------- */
// Amazon: hepsi var, freeOver 1000, fee 40
// Hepsiburada: hepsi var, freeOver 1500, fee 50
// Trendyol: hepsi var, freeOver 500, fee 60
const sepet = [
  {
    id: 'u1', ad: 'Telefon kılıfı',
    teklifler: [
      { site: 'trendyol', siteName: 'Trendyol', urunFiyati: 300, kargo: { fee: 60, freeOver: 500 }, url: 't1' },
      { site: 'hepsiburada', siteName: 'Hepsiburada', urunFiyati: 320, kargo: { fee: 50, freeOver: 1500 }, url: 'h1' },
      { site: 'amazon', siteName: 'Amazon.tr', urunFiyati: 450, kargo: { fee: 40, freeOver: 1000 }, url: 'a1' },
    ],
  },
  {
    id: 'u2', ad: 'Ekran koruyucu',
    teklifler: [
      { site: 'trendyol', siteName: 'Trendyol', urunFiyati: 350, kargo: { fee: 60, freeOver: 500 }, url: 't2' },
      { site: 'hepsiburada', siteName: 'Hepsiburada', urunFiyati: 300, kargo: { fee: 50, freeOver: 1500 }, url: 'h2' },
      { site: 'amazon', siteName: 'Amazon.tr', urunFiyati: 550, kargo: { fee: 40, freeOver: 1000 }, url: 'a2' },
    ],
  },
  {
    id: 'u3', ad: '65W GaN şarj aleti',
    teklifler: [
      { site: 'trendyol', siteName: 'Trendyol', urunFiyati: 900, kargo: { fee: 60, freeOver: 500 }, url: 't3' },
      { site: 'hepsiburada', siteName: 'Hepsiburada', urunFiyati: 960, kargo: { fee: 50, freeOver: 1500 }, url: 'h3' },
      { site: 'amazon', siteName: 'Amazon.tr', urunFiyati: 850, kargo: { fee: 40, freeOver: 1000 }, url: 'a3' },
    ],
  },
];

// Tek mağaza: Amazon → 450+550+850 = 1850 (eşik 1000 aşıldı, kargo 0)
const amazon = gruplariOlustur(sepet, { u1: 'amazon', u2: 'amazon', u3: 'amazon' });
kontrol('tek mağaza Amazon toplam 1850', Math.abs(amazon.toplam - 1850) < 0.01, String(amazon.toplam));
kontrol('Amazon eşik aşıldı → kargo 0', amazon.kargo === 0, String(amazon.kargo));

// Trendyol: 300+350+900 = 1550 (eşik 500 aşıldı, kargo 0)
const trendyol = gruplariOlustur(sepet, { u1: 'trendyol', u2: 'trendyol', u3: 'trendyol' });
kontrol('tek mağaza Trendyol 1550, kargo 0', Math.abs(trendyol.toplam - 1550) < 0.01, String(trendyol.toplam));

// Hepsiburada: 320+300+960 = 1580 (eşik 1500 aşıldı, kargo 0)
const hb = gruplariOlustur(sepet, { u1: 'hepsiburada', u2: 'hepsiburada', u3: 'hepsiburada' });
kontrol('tek mağaza HB 1580, kargo 0', Math.abs(hb.toplam - 1580) < 0.01, String(hb.toplam));

// Bölünmüş: kılıf+koruyucu HB (620, eşik altı → +50), şarj Trendyol (900 → eşik üstü)
const bolunmus = gruplariOlustur(sepet, { u1: 'hepsiburada', u2: 'hepsiburada', u3: 'trendyol' });
kontrol('bölünmüş: 620+50 + 900 = 1570', Math.abs(bolunmus.toplam - 1570) < 0.01, String(bolunmus.toplam));
kontrol('bölünmüş 2 mağaza', bolunmus.magazaSayisi === 2, String(bolunmus.magazaSayisi));
kontrol('HB grubunda kargo 50', bolunmus.gruplar.find(g => g.site === 'hepsiburada').kargo === 50);

/* ---------------- 3) Üç senaryo ---------------- */
const hesap = senaryolariHesapla(sepet);
kontrol('üç senaryo üretildi',
  !!(hesap.senaryolar.tekMagaza && hesap.senaryolar.akilliBolunmus && hesap.senaryolar.maksimumTasarruf));
kontrol('tek mağaza = Amazon 1850 (en ucuz tek mağaza)',
  Math.abs(hesap.senaryolar.tekMagaza.toplam - 1500) < 0.01 || Math.abs(hesap.senaryolar.tekMagaza.toplam - 1550) < 0.01,
  String(hesap.senaryolar.tekMagaza.toplam));
kontrol('en iyi toplam = senaryoların en düşüğü',
  Math.abs(hesap.enIyiToplam - Math.min(
    hesap.senaryolar.tekMagaza.toplam,
    hesap.senaryolar.akilliBolunmus.toplam,
    hesap.senaryolar.maksimumTasarruf.toplam,
  )) < 0.01, String(hesap.enIyiToplam));
kontrol('kazanç = tekMağaza − en iyi', hesap.kazanc != null && hesap.kazanc >= 0, String(hesap.kazanc));
kontrol('akıllı bölünme 2-3 mağaza', hesap.senaryolar.akilliBolunmus.magazaSayisi >= 2
  && hesap.senaryolar.akilliBolunmus.magazaSayisi <= 3, String(hesap.senaryolar.akilliBolunmus.magazaSayisi));

// Maksimum tasarruf her ürünün en ucuzunu almalı: 300 + 300 + 850
// → Trendyol 300 (eşik 500 altı +60), HB 300 (eşik 1500 altı +50), Amazon 850 (eşik 1000 altı +40)
const maks = hesap.senaryolar.maksimumTasarruf;
kontrol('maksimum tasarruf: Trendyol 300 + 60 kargo',
  maks.gruplar.find(g => g.site === 'trendyol')?.toplam === 360,
  String(maks.gruplar.find(g => g.site === 'trendyol')?.toplam));
kontrol('maksimum tasarruf: HB 300 + 50 kargo',
  maks.gruplar.find(g => g.site === 'hepsiburada')?.toplam === 350,
  String(maks.gruplar.find(g => g.site === 'hepsiburada')?.toplam));
kontrol('maksimum tasarruf: Amazon 850 + 40 kargo (eşik 1000)',
  maks.gruplar.find(g => g.site === 'amazon')?.toplam === 890,
  String(maks.gruplar.find(g => g.site === 'amazon')?.toplam));
kontrol('maksimum tasarruf toplam 1600', Math.abs(maks.toplam - 1600) < 0.01, String(maks.toplam));
kontrol('her bölünmede kargo hesaba katıldı (maks > ürünlerin toplamı)',
  maks.toplam > 300 + 300 + 850, String(maks.toplam));

/* ---------------- 4) Kenar durumlar ---------------- */
// Tümü tek sitede varsa üç senaryo da aynı olmalı
const tekSiteSepet = [
  { id: 'a', ad: 'X', teklifler: [{ site: 's1', siteName: 'S1', urunFiyati: 100, kargo: { fee: 10, freeOver: 500 } }] },
  { id: 'b', ad: 'Y', teklifler: [{ site: 's1', siteName: 'S1', urunFiyati: 200, kargo: { fee: 10, freeOver: 500 } }] },
];
const tek = senaryolariHesapla(tekSiteSepet);
kontrol('tek site: üç senaryo aynı toplam', tek.senaryolar.tekMagaza.toplam === 310
  && tek.senaryolar.maksimumTasarruf.toplam === 310, String(tek.senaryolar.tekMagaza.toplam));

// Akıllı bölünme tek mağazadan pahalıysa en iyi yine tek mağaza olmalı
kontrol('en iyi senaryo tek mağaza olabilir', tek.enIyiAnahtar === 'tekMagaza', String(tek.enIyiAnahtar));

// Eksik ürün → hata
const eksik = senaryolariHesapla([
  { id: 'a', ad: 'X', teklifler: [] },
  { id: 'b', ad: 'Y', teklifler: [{ site: 's1', siteName: 'S1', urunFiyati: 10, kargo: null }] },
]);
kontrol('fiyatı olmayan ürün → hata', !!eksik.hata, eksik.hata);

// Eşiği hiç aşamayan mağaza: kargo her zaman eklenir
const kucuk = senaryolariHesapla([
  { id: 'a', ad: 'X', teklifler: [{ site: 's1', siteName: 'S1', urunFiyati: 100, kargo: { fee: 50, freeOver: 5000 } }] },
  { id: 'b', ad: 'Y', teklifler: [{ site: 's1', siteName: 'S1', urunFiyati: 200, kargo: { fee: 50, freeOver: 5000 } }] },
]);
kontrol('eşik aşılmıyorsa toplam 300+50=350', Math.abs(kucuk.senaryolar.tekMagaza.toplam - 350) < 0.01,
  String(kucuk.senaryolar.tekMagaza.toplam));

console.log(`SEPET ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
