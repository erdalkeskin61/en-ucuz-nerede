/**
 * Mintengo (mintengo.com) entegrasyon testi.
 */
import { adapterById } from '../src/sites/index.js';
import { runComparison } from '../src/pipeline.js';

async function main() {
  const adapter = adapterById('mintengo');
  console.log('Mintengo Adaptörü:', adapter ? adapter.name : 'BULUNAMADI');
  if (!adapter) process.exit(1);

  // 1) Arama testi
  const adaylar = await adapter.searchProducts('Creality K1 Max', { spend: 0 });
  console.log(`\n✓ Arama ("Creality K1 Max"): ${adaylar.length} aday bulundu.`);
  for (const a of adaylar) {
    console.log(`  - ${a.title} (${a.inStock ? 'Stokta' : 'Tükendi'}) -> ${a.url}`);
  }

  // 2) Ürün sayfası çekim testi
  const testUrl = adaylar[0]?.url || 'https://www.mintengo.com/urun/creality-hyper-pla-very-peri-filament-1-75mm-1kg';
  const urun = await adapter.getProduct(testUrl, { spend: 0 });
  console.log(`\n✓ Ürün Sayfası: ${urun.title}`);
  console.log(`  - Fiyat: ${urun.sellingPrice} ${urun.currency} (Liste: ${urun.listPrice || '-'})`);
  console.log(`  - Stok: ${urun.inStock ? 'Mevcut' : 'Tükendi'}, Marka: ${urun.brand || '-'}, Model: ${urun.modelCode || '-'}`);
  console.log(`  - Kargo: ${urun.shipping?.note || '-'}`);
  console.log(`  - Görsel: ${urun.image ? 'Mevcut' : 'Yok'}`);

  console.log('\nMintengo entegrasyonu başarıyla doğrulandı.');
}

main().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});
