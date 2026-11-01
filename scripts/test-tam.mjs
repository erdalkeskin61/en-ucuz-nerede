/**
 * TEK TEST KOŞUSU: kullanıcının verdiği Trendyol linkiyle tam karşılaştırma.
 * (Önbellek sayesinde yeni ScraperAPI isteği harcamaz; gerçek YZ sınıflandırması yapar.)
 */
import { runComparison } from '../src/pipeline.js';
import fs from 'node:fs';

const url = 'https://www.trendyol.com/rampage/x-ranger-7-1-rgb-usb-mikrofonlu-oyuncu-kulakligi-gaming-kulaklik-p-99730583?boutiqueId=61&merchantId=129210';

const t0 = Date.now();
const sonuc = await runComparison(url);
console.log('Sure:', ((Date.now() - t0) / 1000).toFixed(1), 'sn');
fs.writeFileSync('data/test-sonuc.json', JSON.stringify(sonuc, null, 2));

// Özet
console.log('\n=== KAYNAK ===');
console.log(JSON.stringify(sonuc.kaynak, null, 2));
console.log('\n=== SITELER ===');
for (const r of sonuc.sonuclar) {
  console.log(`\n--- ${r.siteName} [${r.status}] istek=${r.requestsSpent} ---`);
  if (r.reason) console.log('  gerekçe:', r.reason);
  if (r.product) {
    const p = r.product;
    console.log('  urun:', p.title);
    console.log('  renk:', p.color, '| model:', p.modelCode, '| barkod:', p.barcode);
    console.log('  satis:', p.sellingPrice, '| etiket:', p.listPrice);
    console.log('  kargo:', JSON.stringify(p.shipping));
    console.log('  kampanyalar:', JSON.stringify(p.campaigns));
    console.log('  fiyatlandirma:', JSON.stringify(p.pricing, null, 2));
  }
}
console.log('\n=== OZET ===');
console.log(JSON.stringify(sonuc.ozet, null, 2));
