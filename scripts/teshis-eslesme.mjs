/**
 * Teşhis: "eSun PLA Basic Gri" aramasında 3dcim'deki beton gri ürün neden eşleşmiyor?
 * Gerçek bir kaynak üründen buildQueries + arama + aday inceleme akışını izler.
 */
import { adapters } from '../src/sites/index.js';
import { buildQueries } from '../src/pipeline.js';
import { matchProducts, titleSimilarity, sameColor, brandAyni, normalizeModelCode, toLowerTr, brandWords, extractColors } from '../src/util.js';

// 1) 3dcim'deki şikayet konusu ürünün verisi
const hedef = 'https://3dcim.com/esun-pla-basic-beton-gri-filament';
const a3dcim = adapters.find(a => a.id === '3dcim');
const ctx3 = { spend: 0 };
const urun3dcim = await a3dcim.getProduct(hedef, ctx3);
console.log('=== 3dcim ürünü:');
console.log(JSON.stringify({
  title: urun3dcim.title, brand: urun3dcim.brand, modelCode: urun3dcim.modelCode,
  barcode: urun3dcim.barcode, color: urun3dcim.color, price: urun3dcim.sellingPrice,
}, null, 1));

// 2) Muhtemel kaynak: başka bir sitede "eSun PLA Basic Filament Gri" arayıp ilk ürünü kaynak yap
//    (kullanıcının senaryosu: kaynak başlığı 'eSun PLA Basic Filament Gri 1.75mm 1kg' gibi)
let kaynak = null;
for (const siteId of ['3dortgen', 'filamentsan', 'samm', 'robotistan', 'direnc', 'domirobot', 'matersan']) {
  const a = adapters.find(x => x.id === siteId);
  if (!a) continue;
  const ctx = { spend: 0 };
  try {
    const r = await a.searchProducts('esun pla basic gri', ctx);
    const uygun = r.filter(u => /esun/i.test(u.title || '') && /gri/i.test(u.title || '') && !/beton/i.test(u.title || ''));
    if (uygun.length) {
      kaynak = await a.getProduct(uygun[0].url, ctx);
      console.log(`\nkaynak seçildi: ${siteId} -> ${kaynak.title}`);
      break;
    }
  } catch (e) { console.log(siteId + ' arama hatası: ' + e.message); }
}
if (!kaynak) {
  console.log('\nUygun kaynak bulunamadı — sentetik kaynak kullanılıyor');
  kaynak = { title: 'eSun PLA Basic Filament Gri 1.75mm 1kg', brand: 'eSun', modelCode: null, barcode: null, color: 'gri' };
}
console.log('=== Kaynak ürün:');
console.log(JSON.stringify({
  title: kaynak.title, brand: kaynak.brand, modelCode: kaynak.modelCode,
  barcode: kaynak.barcode, color: kaynak.color,
}, null, 1));

// 3) Doğrudan eşleştirme testi: kaynak <-> 3dcim ürünü
const m = matchProducts(kaynak, urun3dcim);
console.log('\n=== matchProducts(kaynak, 3dcim beton gri):', JSON.stringify(m));
console.log('benzerlik:', titleSimilarity(kaynak.title, urun3dcim.title, kaynak.brand, urun3dcim.brand, { stripColors: true }));
console.log('marka aynı mı:', brandAyni(kaynak.brand, urun3dcim.brand), '| kaynak renk:', kaynak.color, '| aday renk:', urun3dcim.color,
  '| sameColor:', sameColor(kaynak.color, urun3dcim.color));

// 4) Gerçek akış: buildQueries ile 3dcim'de arama yapılsa adaylar ne?
const queries = buildQueries(kaynak);
console.log('\n=== buildQueries:', JSON.stringify(queries));
const ctxA = { spend: 0 };
for (const q of queries) {
  const adaylar = await a3dcim.searchProducts(q, ctxA);
  console.log(`\n--- 3dcim arama "${q}": ${adaylar.length} sonuç`);
  for (const c of adaylar.slice(0, 8)) {
    console.log('   ', (c.title || '').slice(0, 70), '| fiyat:', c.price ?? '-', c.url.includes('beton') ? '  <== BETON GRİ' : '');
  }
  const beton = adaylar.find(c => (c.url || '').includes('beton'));
  if (beton) {
    const mm = matchProducts(kaynak, { ...beton, title: beton.title, brand: urun3dcim.brand, modelCode: urun3dcim.modelCode, barcode: urun3dcim.barcode, color: urun3dcim.color });
    console.log('   BETON GRİ adayı matchProducts:', JSON.stringify(mm));
  }
  if (adaylar.length) break;
}
