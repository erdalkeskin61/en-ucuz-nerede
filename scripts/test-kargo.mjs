/**
 * Kargo kuralları testi (ağa çıkmaz).
 *   node scripts/test-kargo.mjs
 *
 * 2026-10-26: Kullanıcı üç mağazanın gerçek kargo tarifesini bildirdi ve
 * "sepette belli" yerine bu ücretlerin kaydedilmesini istedi:
 *   - 3dmarketim: 3.000 TL altı 145 TL
 *   - 3dultra   : 3.000 TL altı 150 TL
 *   - robitshop : 2.000 TL altı 179,90 TL
 *
 * Bu sırada iki gerçek hata bulundu ve düzeltildi:
 *   1) Adaptörlerin 19'u `kargoCikar(html)` çağırıyordu (siteId YOK) → site kuralları
 *      hiç devreye girmiyordu ("Kargo: sepette belli" kalıyordu).
 *   2) `kargo bedava` desenleri sayfadaki ÇEVİRİ SÖZLÜĞÜNE takılıyordu
 *      ("Global_KargoBedava":"Kargo Bedava") → 3dultra/robitshop/ventatek'te HER ürün
 *      kargo bedava sanılıyordu (fee=0). Artık script/style blokları temizleniyor ve
 *      doğrulanmış site tarifesi "bedava" işaretinden önce geliyor.
 */
import { kargoCikar, SITE_KARGO_VARSAYILANLARI } from '../src/kargo.js';
import { computePricing } from '../src/pricing.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
}

// ---- 1) Beklenen kurallar kayıtlı mı? ----
const BEKLENEN = {
  '3dmarketim': { fee: 145, freeOver: 3000 },
  '3dultra': { fee: 150, freeOver: 3000 },
  robitshop: { fee: 179.9, freeOver: 2000 },
  ventatek: { fee: 129, freeOver: 3000 },
  // 2026-10-26 ikinci grup
  'fixx3d': { fee: 99.9, freeOver: 3000 },
  'robo90': { fee: 99.99, freeOver: 1500 },
  robolinkmarket: { fee: 119.9, freeOver: 1500 },
  robomer: { fee: 129.99, freeOver: 2000 },
  // 2026-10-26 üçüncü grup
  'teknikfilament3d': { fee: 150, freeOver: 2000 },
  '3dprinterankara': { fee: 250, freeOver: 2000 },
  '3dcim': { fee: 99, freeOver: 2000 },
  'pusula3d': { fee: 130, freeOver: 2000 },
  filamentsan: { fee: 95, freeOver: 1500 },
  // 2026-10-26 dördüncü grup
  teknosa: { fee: 0, freeOver: null, bedava: true },
  robocombo: { fee: 150, freeOver: 2000, esikHaric: true },
  tou3d: { fee: 175, freeOver: 2000 },
  // 2026-10-28 beşinci grup
  deneystore: { fee: 199.99, freeOver: 3000 },
};
for (const [site, b] of Object.entries(BEKLENEN)) {
  const k = SITE_KARGO_VARSAYILANLARI[site];
  kontrol(`${site} kuralı tanımlı`, !!k);
  if (!k) continue;
  kontrol(`${site} ücreti ${b.fee} TL`, k.fee === b.fee, `bulunan ${k.fee}`);
  kontrol(`${site} eşiği ${b.freeOver} TL`, k.freeOver === b.freeOver, `bulunan ${k.freeOver}`);
}

// ---- 2) siteId verilince kural devreye giriyor mu? ----
for (const [site, b] of Object.entries(BEKLENEN)) {
  const s = kargoCikar('', site);
  kontrol(`${site}: boş HTML'de bile kural dönüyor`, s.fee === b.fee && s.freeOver === b.freeOver,
    JSON.stringify(s));
}

// ---- 3) Eşik altı: kargo toplama ekleniyor mu? ----
const ALT = 800;
for (const [site, b] of Object.entries(BEKLENEN)) {
  const p = computePricing({
    siteName: site, sellingPrice: ALT, listPrice: null,
    shipping: SITE_KARGO_VARSAYILANLARI[site], campaigns: [], classifiedCampaigns: [],
  });
  if (b.bedava) {
    // Hiç kargo alınmayan site (teknosa): toplam = ürün fiyatı, "uygulanır" false
    kontrol(`${site}: ${ALT} TL ürün → kargo yok (bedava)`, Math.abs(p.toplam - ALT) < 0.02,
      `bulunan ${p.toplam}`);
    kontrol(`${site}: kargo "uygulanmaz" işaretli`, p.kargo?.uygulanir === false,
      `uygulanir=${p.kargo?.uygulanir}`);
    continue;
  }
  kontrol(`${site}: ${ALT} TL ürün → toplam ${ALT + b.fee}`, Math.abs(p.toplam - (ALT + b.fee)) < 0.02,
    `bulunan ${p.toplam}`);
  kontrol(`${site}: kargo "uygulanır" işaretli`, p.kargo?.uygulanir === true);
}

// ---- 4) Eşik üstü: kargo eklenmiyor mu? ----
const UST = 3500;
for (const [site] of Object.entries(BEKLENEN)) {
  const p = computePricing({
    siteName: site, sellingPrice: UST, listPrice: null,
    shipping: SITE_KARGO_VARSAYILANLARI[site], campaigns: [], classifiedCampaigns: [],
  });
  kontrol(`${site}: ${UST} TL ürün → kargo yok`, Math.abs(p.toplam - UST) < 0.02, `bulunan ${p.toplam}`);
}

// ---- 5) Tam eşik: "ve üzeri" ise ücretsiz; "üzeri" (esikHaric) ise ücretli ----
for (const [site, b] of Object.entries(BEKLENEN)) {
  if (b.freeOver == null) continue; // eşiksiz site (teknosa)
  const p = computePricing({
    siteName: site, sellingPrice: b.freeOver, listPrice: null,
    shipping: SITE_KARGO_VARSAYILANLARI[site], campaigns: [], classifiedCampaigns: [],
  });
  const beklenen = b.esikHaric ? b.freeOver + b.fee : b.freeOver;
  kontrol(`${site}: tam eşik (${b.freeOver}) → ${b.esikHaric ? 'ücret ' + b.fee + ' TL' : 'kargo yok'}`,
    Math.abs(p.toplam - beklenen) < 0.02, `bulunan ${p.toplam}`);
}

// ---- 6) Çeviri sözlüğü / script içeriği yanlış pozitif vermemeli ----
const sahte = `<html><body><div>Ürün 582,12 TL</div>
<script>var t={"Global_KargoBedava":"Kargo Bedava","Siparis_KargoUcreti":"Kargo Ücreti"};</script>
</body></html>`;
const s1 = kargoCikar(sahte, '3dultra');
kontrol('script içindeki "Kargo Bedava" yok sayılıyor', s1.fee === 150, `fee=${s1.fee}`);
kontrol('script içindeki bedava metni freeOver sıfırlamıyor', s1.freeOver === 3000, `freeOver=${s1.freeOver}`);

// Görünür metindeki gerçek bedava beyanı hâlâ çalışmalı (kural tanımlı olmayan site)
const gercek = `<html><body><div>Tüm siparişlerinizde ücretsiz kargo!</div></body></html>`;
const s2 = kargoCikar(gercek, 'bilinmeyen-site');
kontrol('görünür metindeki bedava beyanı çalışıyor', s2.fee === 0, `fee=${s2.fee}`);

// Site kuralı varken HTML'den net ücret okunursa o ücret korunur
const acikUcret = `<html><body><div>Kargo ücreti: 99,90 TL</div>
<div>3000 TL üzeri kargo bedava</div></body></html>`;
const s3 = kargoCikar(acikUcret, '3dmarketim');
kontrol('HTML\'deki açık ücret site kuralından önce gelir', s3.fee === 99.9, `fee=${s3.fee}`);

// Site kuralı olmayan sitede ücret bilinmiyorsa "sepette belli" dürüst davranışı korunur
const belirsiz = kargoCikar('<html><body><div>Ürün</div></body></html>', 'bilinmeyen-site');
kontrol('bilinmeyen sitede uydurma ücret yok', belirsiz.fee === null, `fee=${belirsiz.fee}`);

console.log(`KARGO ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
