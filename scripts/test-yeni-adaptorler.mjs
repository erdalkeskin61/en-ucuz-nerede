/**
 * Yeni parti site adaptörlerinin önbellek üzerinden testi (0 kredi).
 */
import { yeniSiteler } from '../src/sites/yeni.js';

const TEST_SORGULARI = {
  default: 'pla filament',
  '3dultra': 'filament',
  robotizmo: 'filament',
};

const TEST_URUNLERI = {
  deneystore: 'https://www.deneystore.com/snapmaker-u1-3d-yazici-pmu3756',
  nmosphere: 'https://nmosphere.com.tr/soleyin-ultra-pla-gri-175-mm-1-kg-3d-yazici-filamenti',
  robo90: 'https://www.robo90.com/nanelab-hyper-pla-antik-gold-filament-175mm-1kg',
  hepsivar: 'https://www.hepsivar.com/creality-ender-fast-pla-light-blue-filament-175-mm-1-kg',
  '3dultra': 'https://www.3dultra.com.tr/beta-pla-filament-black',
  robotizmo: 'https://robotizmo.net/jamg-he-dryer-filament-kurutucu',
  '3dcim': 'https://3dcim.com/beta-pla-mocha-caramel-filament-1.75mm-1kg-makarali',
  mintengo: 'https://mintengo.com/urun/creality-k1-max-3d-yazici',
  kurumsalit: 'https://kurumsalit.com/urun/dell-pro-16-bto105-pc16250-u-u5-235u-16g-512g-dos-16',
  robotzade: 'https://www.robotzade.com/urun/roadrunner-labirent-cozen-robot-kiti',
  robitshop: 'https://robitshop.com/urun/filenta-3d-yazici-tabla-yapistirici-100-ml-1649',
  rhino3dprinter: 'https://www.rhino3dprinter.com/filamer-hyper-pla-neon-fusya',
  sivasrobotik: 'https://sivasrobotik.com.tr/3d/929-creality-hyper-pla-mavi.html',
  trendruum: 'https://www.trendruum.com/urunler/creality-cr-pla-filament-mavi-175mm-1kg-901189',
  koctas: 'https://www.koctas.com.tr/anycubic-pla-filament-gri-175mm-1kg/p/5003215696',
  teknosa: 'https://www.teknosa.com/creality-hyper-pla-filament-gri-175-mm-1-kg-p-788922231',
  pttavm: 'https://www.pttavm.com/creality-ender-pla-filament-beyaz-1-75mm-1kg-p-1344137814',
  n11: 'https://www.n11.com/urun/elegoo-pla-filament-siyah-1kg-41403993',
};

let gecen = 0, kalan = 0;
for (const adapter of yeniSiteler) {
  const sorgu = TEST_SORGULARI[adapter.id] || TEST_SORGULARI.default;
  const ctx = { spend: 0 };
  console.log(`\n=== ${adapter.name} (${adapter.id}) ===`);
  try {
    const adaylar = await adapter.searchProducts(sorgu, ctx);
    console.log(`  arama: ${adaylar.length} aday | istek: ${ctx.spend}`);
    for (const a of adaylar.slice(0, 2)) {
      console.log(`    - ${(a.title || '').slice(0, 58)} | ${a.price != null ? a.price + ' TL' : 'fiyat yok'} | ${(a.url || '').slice(0, 60)}`);
    }
    if (!adaylar.length) { console.log('  ! aday yok'); kalan++; continue; }
    const testUrl = TEST_URUNLERI[adapter.id] || adaylar[0].url;
    const pctx = { spend: 0 };
    try {
      const p = await adapter.getProduct(testUrl, pctx);
      console.log(`  urun: ${p.title?.slice(0, 58)} | ${p.sellingPrice} ${p.currency} | stok: ${p.inStock} | marka: ${p.brand} | kampanya: ${p.campaigns.length}`);
      if (p.sellingPrice == null || p.sellingPrice <= 0) { console.log('  ! FİYAT YOK/HATALI'); kalan++; }
      else gecen++;
    } catch (e) {
      console.log(`  urun HATA: ${String(e.message || e).slice(0, 130)}`);
      kalan++;
    }
  } catch (e) {
    console.log(`  arama HATA: ${String(e.message || e).slice(0, 150)}`);
    kalan++;
  }
}
console.log(`\nSonuç: ${gecen} site tam çalışıyor, ${kalan} site sorunlu.`);
