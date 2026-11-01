/**
 * Eşleştirme regresyon testi: önbellekteki gerçek sayfalarla (yeni istek yok).
 * Beklenenler:
 *  - G102 (Amazon kaynak): Trendyol siyah EŞLEŞİR (renk kararsız), Trendyol beyaz EŞLEŞİR (renk farklı),
 *    HB combo ELENİR, HB mavi EŞLEŞİR (renk farklı), İtopya siyah EŞLEŞİR, İtopya beyaz EŞLEŞİR (renk farklı),
 *    MediaMarkt mavi EŞLEŞİR (renk farklı), Pazarama beyaz EŞLEŞİR (renk farklı), Pazarama siyah EŞLEŞİR
 *  - X-Ranger (Trendyol kaynak): HB siyah EŞLEŞİR, HB beyaz EŞLEŞİR (renk farklı), HB soğutucu ELENİR
 */
import amazon from '../src/sites/amazon.js';
import trendyol from '../src/sites/trendyol.js';
import hb from '../src/sites/hepsiburada.js';
import itopya from '../src/sites/itopya.js';
import mediamarkt from '../src/sites/mediamarkt.js';
import pazarama from '../src/sites/pazarama.js';
import { matchProducts, sameColor } from '../src/util.js';

const ctx = { spend: 0 };
const g102 = await amazon.getProduct('https://www.amazon.com.tr/Logitech-Lightsync-Kablodu-Gaming-Uyumlu/dp/B07W4DH8JW', ctx);

const durumlar = [];
function kontrol(ad, adayUrl, adapter, beklenenEslesme, beklenenRenk) {
  return (async () => {
    try {
      const p = await adapter.getProduct(adayUrl, { spend: 0 });
      const m = matchProducts(g102, p);
      const renk = m ? sameColor(g102.color, p.color) : null;
      const eslesti = !!m;
      const tamam = eslesti === beklenenEslesme && (beklenenRenk === undefined || String(renk) === String(beklenenRenk));
      durumlar.push({ ad, eslesti, renk: p.color, skor: m?.skor, tamam });
    } catch (e) {
      durumlar.push({ ad, hata: String(e.message).slice(0, 100), tamam: false });
    }
  })();
}

await Promise.all([
  kontrol('Trendyol siyah (Çok Renkli özniteliği)', 'https://www.trendyol.com/logitech/g-g102-lightsync-rgb-aydinlatmali-8000-dpi-kablolu-oyuncu-mouse-siyah-910-005823-p-44824694?boutiqueId=689770&merchantId=968', trendyol, true, 'null'),
  kontrol('Trendyol beyaz', 'https://www.trendyol.com/logitech/g-g102-lightsync-rgb-aydinlatmali-8-000-dpi-kablolu-oyuncu-mouse-beyaz-910-005824-p-46293830?boutiqueId=689770&merchantId=968', trendyol, true, 'false'),
  kontrol('HB combo (klavye+mouse)', 'https://www.hepsiburada.com/g213-oyuncu-klavye-920-008094-g102-oyuncu-mouse-910-005823-siyah-pm-HBC0000DZCYCJ', hb, false),
  kontrol('HB mavi', 'https://www.hepsiburada.com/logitech-910-005824-g102-lightsync-mavi-8000dpi-6-tus-optik-rgb-mavi-kablolu-gaming-oyuncu-mouse-p-HBCV000008T3MC', hb, true, 'false'),
  kontrol('İtopya siyah (mpn farklı)', 'https://www.itopya.com/logitech-g102-lightsync-8000-dpi-rgb-siyah-kablolu-gaming-mouse_u10951', itopya, true, 'true'),
  kontrol('İtopya beyaz', 'https://www.itopya.com/logitech-g102-lightsync-8000-dpi-rgb-beyaz-kablolu-gaming-mouse_u11261', itopya, true, 'false'),
  kontrol('MediaMarkt mavi', 'https://www.mediamarkt.com.tr/tr/product/_logitech-g-g102-lightsync-usb-typ-a-gaming-mouse-mavi-124131190.html', mediamarkt, true, 'false'),
  kontrol('Pazarama beyaz', 'https://www.pazarama.com/logitech-g102-oyuncu-mouse-beyaz-8000dpi-rgb-1401215566232-p-1401215566232', pazarama, true, 'false'),
  kontrol('Pazarama siyah (kısa başlık)', 'https://www.pazarama.com/logitech-g-g102-lightsync-gaming-siyah-mouse-910-005823-p-5099206089235', pazarama, true, 'true'),
]);

console.log('=== G102 (Amazon kaynak, model: ' + g102.modelCode + ', renk: ' + g102.color + ') ===');
for (const d of durumlar) {
  console.log(`${d.tamam ? 'OK ' : 'HATA'} ${d.ad.padEnd(38)} eslesti=${d.eslesti} renk=${d.renk} skor=${d.skor ?? '—'} ${d.hata || ''}`);
}

// X-Ranger regresyonu
const xr = await trendyol.getProduct('https://www.trendyol.com/rampage/x-ranger-7-1-rgb-usb-mikrofonlu-oyuncu-kulakligi-gaming-kulaklik-p-99730583?boutiqueId=61&merchantId=129210', { spend: 0 });
console.log('\n=== X-Ranger (Trendyol kaynak) regresyonu ===');
for (const [ad, url, beklenen] of [
  ['HB siyah kulaklık', 'https://www.hepsiburada.com/rampage-x-ranger-7-1-rgb-ledli-mikrofonlu-oyuncu-kulakligi-pm-HBC000002OAF6', true],
  ['HB beyaz kulaklık', 'https://www.hepsiburada.com/rampage-x-ranger-beyaz-7-1-rgb-led-li-mikrofonlu-oyuncu-kulakligi-gaming-kulaklik-profesyonel-kulaklik-surround-pm-HBC00007VIRGT', true],
  ['HB X-Ranger soğutucu', 'https://www.hepsiburada.com/rampage-ad-rc14-x-ranger-rgb-5fan-yukseklik-ayarli-telefon-tutucu-9-17-notebook-sogutucu-laptop-sogutucu-pm-HBC00006P0FKB', false],
]) {
  const p = await hb.getProduct(url, { spend: 0 });
  const m = matchProducts(xr, p);
  const tamam = !!m === beklenen;
  console.log(`${tamam ? 'OK ' : 'HATA'} ${ad.padEnd(22)} eslesti=${!!m} skor=${m?.skor ?? '—'}`);
}

// 3D filament regresyonu: kucuk magazalar ayni urun icin farkli SKU yayar;
// "Beta Filament" ile "Beta" ayni markadir. (Onbellek uzerinden, kredi harcamaz.)
console.log('')
console.log('=== 3D filament (magaza SKU farki) regresyonu ===')
try {
  const { tsoftSite } = await import('../src/sites/plt-tsoft.js')
  const { shopifySite } = await import('../src/sites/plt-shopify.js')
  const shopify3d = shopifySite({ id: '3dteknomarket', name: '3D Tekno Market', hosts: [], base: 'https://3dteknomarket.com' })
  const filamentsanA = tsoftSite({ id: 'filamentsan', name: 'FilamentSan', hosts: [], base: 'https://filamentsan.com' })
  const dortden = tsoftSite({ id: '3dortgen', name: '3dortgen', hosts: [], base: 'https://shop.3dortgen.com' })

  const betaBeyaz = await shopify3d.getProduct('https://3dteknomarket.com/products/beta-pla-filament-white', { spend: 0 })
  console.log('kaynak:', betaBeyaz.title, '| model:', betaBeyaz.modelCode, '| renk:', betaBeyaz.color)
  for (const [ad, adapter, url, beklenen] of [
    ['3dortgen PLA-Matte Beyaz (farkli urun)', dortden, 'https://shop.3dortgen.com/beta-pla-matte-filament-175mm-1kg-beyaz-white', false],
    ['filamentsan Dark Purple (farkli renk)', filamentsanA, 'https://filamentsan.com/beta-pla-plus-dark-purple-filament-175mm-1kg', true],
  ]) {
    const p = await adapter.getProduct(url, { spend: 0 })
    const m = matchProducts(betaBeyaz, p)
    const renk = m ? sameColor(betaBeyaz.color, p.color) : null
    const tamam = !!m === beklenen
    console.log((tamam ? 'OK ' : 'HATA') + ' ' + ad.padEnd(38) + ' eslesti=' + !!m + ' renkAyni=' + renk + ' skor=' + (m ? m.skor : '-'))
  }
} catch (e) {
  console.log('HATA (3D regresyonu):', String(e.message || e).slice(0, 150))
}
