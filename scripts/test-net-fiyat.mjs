/**
 * Net Etkin Fiyat Motoru — Node.js portu testleri.
 * Python senaryolarının (net-fiyat-motoru/senaryolar.py) birebir karşılığı;
 * beklenen değerler Python çalıştırmasından doğrulanmıştır.
 */
import { netFiyatHesapla, kullaniciMesaji } from '../src/netFiyat.js';
import { computePricing } from '../src/pricing.js';

const yakin = (gelen, beklenen, mesaj) => {
  const ok = Math.abs((gelen ?? 0) - beklenen) < 0.005;
  console.log((ok ? 'OK  ' : 'HATA') + `  ${mesaj}: ${gelen} (beklenen ${beklenen})`);
  if (!ok) process.exitCode = 1;
};

const urun1 = {
  id: 'P-1001', title: 'Kablosuz Kulaklık X', currency: 'TRY',
  listPrice: '1200.00', sellingPrice: '1050.00',
  priceIncludesTax: true,
  taxes: [{ type: 'KDV', rate: '0.20', amountIncluded: '175.00' }],
  cartDiscounts: [
    { id: 'sepet-10', method: 'percent', value: '10', minBasket: '200.00', label: '%10 sepet indirisi', source: 'site kampanyası' },
  ],
  coupons: [
    { id: 'KUP-50', code: 'YAZ50', method: 'fixed', value: '50', minBasket: '300.00', label: 'YAZ50 kuponu' },
  ],
  bankCampaigns: [
    { id: 'ZIR-100', bank: 'Ziraat', cardProgram: 'Bankkart', method: 'fixed', value: '100', minBasket: '500', combinableWithCoupons: false, label: "Ziraat Bankkart'a özel 100 TL" },
  ],
  shipping: { fee: '49.90', freeOver: '1000.00', thresholdBase: 'after_discounts' },
  cashback: { kind: 'points', rate: '0.02', base: 'post_discount' },
  fees: [],
};
const kullanici1 = { currency: 'TRY', couponsOwned: ['YAZ50'], card: { bank: 'Ziraat', program: 'Bankkart' } };

// ---- Senaryo 1: sepet indirimi + banka (kuponla birleşmez) + eşik altı kargo ----
console.log('=== Senaryo 1 ===');
const r1 = netFiyatHesapla(urun1, kullanici1);
yakin(r1.payableNow, 894.90, 'payableNow');
yakin(r1.cashbackValue, 16.90, 'cashback (%2 x 845)');
yakin(r1.effectiveCost, 878.00, 'effectiveCost');
yakin(r1.subtotalBeforeShipping, 845.00, 'kargo öncesi ara toplam');

// ---- Senaryo 2: kupon (300) > banka (100) ----
console.log('=== Senaryo 2 ===');
const r2 = netFiyatHesapla(
  { ...urun1, coupons: [{ id: 'KUP-300', code: 'VIP300', method: 'fixed', value: '300', minBasket: '300', label: 'VIP300 kuponu' }] },
  { ...kullanici1, couponsOwned: ['VIP300'] },
);
yakin(r2.payableNow, 694.90, 'payableNow (kupon seçilir)');

// ---- Senaryo 3: kargo eşiği aşılır → bedava ----
console.log('=== Senaryo 3 ===');
const r3 = netFiyatHesapla({ ...urun1, listPrice: '1500', sellingPrice: '1400' }, kullanici1);
yakin(r3.payableNow, 1160.00, 'payableNow (kargo bedava)');
yakin(r3.cashbackValue, 23.20, 'cashback (%2 x 1160)');

// ---- Senaryo 4: %15 kupon max 100 tavan + süresi dolmuş kupon ----
console.log('=== Senaryo 4 ===');
const r4 = netFiyatHesapla(
  {
    ...urun1,
    coupons: [
      { id: 'KUP-15', code: 'YUZDE15', method: 'percent', value: '15', maxDiscount: '100', label: '%15 kupon (max 100 TL)' },
      { id: 'KUP-ESKI', code: 'ESKI', method: 'fixed', value: '80', expiresAt: '2026-01-01T00:00:00', label: 'Süresi dolmuş kupon' },
    ],
  },
  { currency: 'TRY', couponsOwned: ['YUZDE15', 'ESKI'] },
);
yakin(r4.payableNow, 894.90, 'payableNow (tavan 100 uygulanır)');
const eskiAtlandi = r4.skipped.some(s => s.reason.includes('süresi dolmuş'));
console.log((eskiAtlandi ? 'OK  ' : 'HATA') + '  süresi dolmuş kupon atlandı ve raporlandı');
if (!eskiAtlandi) process.exitCode = 1;

// ---- Senaryo 5: KDV hariç + hizmet bedeli + 9 taksit vade farkı ----
console.log('=== Senaryo 5 ===');
const r5 = netFiyatHesapla(
  {
    ...urun1,
    listPrice: '800', sellingPrice: '800',
    priceIncludesTax: false,
    taxes: [{ type: 'KDV', rate: '0.20' }],
    cartDiscounts: [], coupons: [],
    bankCampaigns: [
      { id: 'GAR-9', bank: 'Garanti', method: 'fixed', value: '60', combinableWithCoupons: true, installments: [{ count: 9, surcharge: '45.00' }], label: 'Garanti BBVA 60 TL' },
    ],
    shipping: { fee: '30.00', freeOver: null },
    cashback: null,
    fees: [{ kind: 'Hizmet', amount: '5.00' }],
  },
  { currency: 'TRY', card: { bank: 'Garanti', program: 'Bonus' }, installmentCount: 9 },
);
yakin(r5.payableNow, 980.00, 'payableNow (800+160 KDV−60+30+5+45)');

// ---- Senaryo 6: kart uyuşmazlığı ----
console.log('=== Senaryo 6 ===');
const r6 = netFiyatHesapla(urun1, { currency: 'TRY', card: { bank: 'İşbank', program: 'Maximum' } });
yakin(r6.payableNow, 944.90, 'payableNow (banka yok, kupon 50 uygulanır)');

// ---- Senaryo 7: USD -> TRY çevirim (sonuçta) ----
console.log('=== Senaryo 7 ===');
const r7 = netFiyatHesapla(
  {
    ...urun1, currency: 'USD', listPrice: '40.00', sellingPrice: '35.00',
    cartDiscounts: [], coupons: [], bankCampaigns: [],
    shipping: { fee: '5.00', freeOver: null }, cashback: null, taxes: [],
  },
  { currency: 'TRY', exchangeRates: { USD: 34.50 } },
);
yakin(r7.payableNow, 1380.00, 'payableNow (40 USD x 34.50)');
console.log('  varsayım:', r7.assumptions.join(' | '));

// ---- Kullanıcı mesajı şablonu ----
console.log('=== Mesaj şablonu ===');
console.log(' ', kullaniciMesaji(r1));

// ---- computePricing entegrasyon testi (YZ sınıflandırması -> motor) ----
console.log('=== computePricing entegrasyonu ===');
const urun = {
  listPrice: 1200, sellingPrice: 1050,
  shipping: { fee: 139, freeOver: 2500, applies: true, note: 'Kargo 139,00 TL · 2.500,00 TL üzeri ücretsiz' },
};
const siniflandirma = [
  { metin: 'Sepette %10 indirim', tur: 'herkes', kosul: null, kosul_aciklamasi: null, fiyata_dahil: false, indirim: { tip: 'yuzde', deger: 10 } },
  { metin: 'Ziraat kartına 100 TL indirim', tur: 'kosullu', kosul: 'karti', kosul_aciklamasi: 'Ziraat Bankkart ile', fiyata_dahil: false, indirim: { tip: 'tutar', deger: 100 } },
  { metin: '12 taksit fırsatı', tur: 'taksit', kosul: null, kosul_aciklamasi: null, fiyata_dahil: false, indirim: null },
  { metin: 'Ücretsiz kargo', tur: 'bilgi', kosul: null, kosul_aciklamasi: null, fiyata_dahil: true, indirim: null },
];
const pr = computePricing(urun, siniflandirma);
yakin(pr.taban, 1050, 'taban');
yakin(pr.ekIndirim, 105, 'ekIndirim (%10 x 1050)');
yakin(pr.toplam, 1084, 'toplam (1050−105+139 kargo)');
yakin(pr.kargo.ucret, 139, 'kargo ücreti');
yakin(pr.kargo.uygulanir, 1, 'kargo uygulanır (true)'); // 1 === true
yakin(pr.kampanyaKosullu.length, 1, 'koşullu kampanya listede (kart)');
yakin(pr.kampanyaTaksit.length, 1, 'taksit bilgisi listede');
yakin(pr.dokuem.length, 5, 'döküm adım sayısı');
console.log('  döküm:', pr.dokuem.map(d => `${d.step}=${d.amount}`).join(' | '));

// Eşik üstü kargo: 2600 TL'lik ürün, 2500 eşiği → bedava
const pr2 = computePricing(
  { listPrice: 3000, sellingPrice: 2600, shipping: { fee: 139, freeOver: 2500, applies: true, note: '' } },
  [],
);
yakin(pr2.kargo.uygulanir, 0, 'eşik üstü kargo bedava (false)'); // 0 === false
yakin(pr2.toplam, 2600, 'eşik üstü toplam (kargo yok)');

// Eşik altı + ücret bilinmiyor → 'Sepette belli' (uygulanir null)
const pr3 = computePricing(
  { listPrice: 800, sellingPrice: 800, shipping: { fee: null, freeOver: 1500, applies: null, note: '1.500 TL üzeri ücretsiz' } },
  [],
);
yakin(pr3.kargo.uygulanir ?? -1, -1, 'eşik altı bilinmeyen kargo (null)');
yakin(pr3.toplam, 800, 'bilinmeyen kargo toplama eklenmez');

// ---- Kupon: ana fiyat değişmez, kuponlu fiyat ayrı gösterilir ----
console.log('=== Kupon senaryoları ===');
const kuponluSiniflandirma = [
  ...siniflandirma,
  { metin: 'KUPON: YAZ20 ile %10 indirim', tur: 'kosullu', kosul: 'kupon', kosul_aciklamasi: null, kodu: 'YAZ20', fiyata_dahil: false, indirim: { tip: 'yuzde', deger: 10 } },
];
const prK = computePricing(urun, kuponluSiniflandirma);
yakin(prK.toplam, 1084, 'ana fiyat kupondan etkilenmez (1084)');
yakin(prK.kupon?.fiyat, 989.5, 'kuponlu fiyat (945−%10+139 kargo)');
yakin(prK.kupon?.indirimTutari, 94.5, 'kupon indirim tutarı');
console.log('  kupon:', JSON.stringify({ kodu: prK.kupon?.kodu, fiyat: prK.kupon?.fiyat, kosul: prK.kupon?.kosul }));

// Minimum sepet eşiği ürünün altında → kupon uygulanamaz, kupon alanı boş
const prE = computePricing(urun, [
  ...siniflandirma,
  { metin: 'X kuponu ile 100 TL indirim (2.000 TL üzeri sepetlerde geçerli)', tur: 'kosullu', kosul: 'kupon', kosul_aciklamasi: '2.000 TL üzeri sepette', kodu: 'X100', fiyata_dahil: false, indirim: { tip: 'tutar', deger: 100 } },
]);
yakin(prE.toplam, 1084, 'eşik altı kupon: ana fiyat aynı');
console.log((prE.kupon == null ? 'OK  ' : 'HATA') + '  eşik altı kupon uygulanmadı (kupon alanı boş)');
if (prE.kupon != null) process.exitCode = 1;

// Kupon kodu YZ'den gelmezse metinden çıkarılır
const prKod = computePricing(urun, [
  { metin: 'Sepette TEKNO50 kuponu ile 50 TL indirim', tur: 'kosullu', kosul: 'kupon', kosul_aciklamasi: null, kodu: null, fiyata_dahil: false, indirim: { tip: 'tutar', deger: 50 } },
]);
console.log((prKod.kupon?.kodu === 'TEKNO50' ? 'OK  ' : 'HATA') + '  kupon kodu metinden çıkarıldı: ' + (prKod.kupon?.kodu || '—'));
if (prKod.kupon?.kodu !== 'TEKNO50') process.exitCode = 1;
yakin(prKod.kupon?.fiyat, 1139, 'tutar kuponlu fiyat (1050−50+139 kargo)');

console.log(process.exitCode ? '\nBAŞARISIZ' : '\nTÜM SENARYOLAR GEÇTİ ✓');
