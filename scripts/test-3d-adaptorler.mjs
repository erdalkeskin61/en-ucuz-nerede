/**
 * 3D site adaptörlerinin önbellek üzerinden testi (0 kredi).
 * Her sitede: searchProducts → ilk aday getProduct → özet.
 */
import { ucdSiteler } from '../src/sites/ucd.js';

const TEST_SORGULARI = {
  default: 'pla filament',
  samm: 'filament',
  filamentdepom: 'filament',
};

const TEST_URUNLERI = {
  robotistan: 'https://robotistan.com/tinylab-eco-pla-filament-175mm-siyah',
  direnc: 'https://www.direnc.net/kirmizi-pla-plus-filament-175mm-1kg-tri-d',
  domirobot: 'https://www.domirobot.com/anycubic-ace-2-pro-cok-renkli-filament-sistemi-kobra-x-kobra-s1-pmu7877',
  filamentmarketim: 'https://www.filamentmarketim.com/bambu-lab-basic-pla-filament',
  teknikfilament3d: 'https://www.teknikfilament3d.com/porima-eco-hyper-pla-filament-1419',
  matersan: 'https://matersan.com.tr/urun/heygears-ultracraft-reflex-3d-yazici',
  filamentdepom: 'https://filamentdepom.com/polylite-cospla-filament-1.75mm-1kg-cosplay-pla',
  samm: 'https://market.samm.com/fibromast-pla-seffaf-kirmizi-filament-175mm-1kg',
  '3dteknomarket': 'https://3dteknomarket.com/products/beta-pla-filament-white',
  filamentsan: 'https://filamentsan.com/beta-pla-plus-dark-purple-filament-175mm-1kg',
};

let gecen = 0, kalan = 0;
for (const adapter of ucdSiteler) {
  const sorgu = TEST_SORGULARI[adapter.id] || TEST_SORGULARI.default;
  const ctx = { spend: 0 };
  console.log(`\n=== ${adapter.name} (${adapter.id}) — sorgu: "${sorgu}" ===`);
  try {
    const adaylar = await adapter.searchProducts(sorgu, ctx);
    console.log(`  arama: ${adaylar.length} aday | harcanan istek: ${ctx.spend}`);
    if (!adaylar.length) { console.log('  ! aday yok'); kalan++; continue; }
    for (const a of adaylar.slice(0, 2)) {
      console.log(`    - ${a.title?.slice(0, 60)} | ${a.price != null ? a.price + ' TL' : 'fiyat yok'} | ${a.url.slice(0, 70)}`);
    }
    // ürün sayfası testi (önceden tanımlı URL varsa onunla, yoksa ilk adayla)
    const testUrl = TEST_URUNLERI[adapter.id] || adaylar[0].url;
    const pctx = { spend: 0 };
    try {
      const p = await adapter.getProduct(testUrl, pctx);
      console.log(`  urun: ${p.title?.slice(0, 60)} | ${p.sellingPrice} ${p.currency} | stok: ${p.inStock} | marka: ${p.brand} | model: ${p.modelCode} | kampanya: ${p.campaigns.length}`);
      if (p.sellingPrice == null) console.log('  ! FİYAT YOK');
      gecen++;
    } catch (e) {
      console.log(`  urun HATA: ${String(e.message || e).slice(0, 120)}`);
      kalan++;
    }
  } catch (e) {
    console.log(`  arama HATA: ${String(e.message || e).slice(0, 150)}`);
    kalan++;
  }
}
console.log(`\nSonuç: ${gecen} site tam çalışıyor, ${kalan} site sorunlu.`);
