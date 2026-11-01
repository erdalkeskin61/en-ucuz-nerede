/**
 * bisiparisver.com adaptör testi (2026-10-29)
 *
 * Site: IdeaSoft klasik teması. Ölçümle doğrulandı:
 *   - arama  : /tumu-c-0?k=<sorgu> → 30 kart (showcase-title + showcase-price-new)
 *   - ürün   : /urun/<slug> → product-price-new (JSON-LD YOK)
 *
 *   node scripts/test-bisiparisver.mjs          # yapısal (ağa çıkmaz)
 *   node scripts/test-bisiparisver.mjs --canli  # gerçek arama + ürün
 */
import { adapters, detectSite } from '../src/sites/index.js';
import { SITE_KARGO_VARSAYILANLARI } from '../src/kargo.js';
import { SEPET_SITELERI } from '../src/basketOptimizer.js';
import { SITE_KARGO_VARSAYILANLARI as _k } from '../src/kargo.js';
import { rateLimiter } from '../src/rateLimiter.js';

const canli = process.argv.includes('--canli');

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

/* ---------- 1) Kayıt ---------- */
const a = adapters.find(x => x.id === 'bisiparisver');
kontrol('adaptör kayıtlı', !!a);
kontrol('adı "Bi Sipariş Ver"', a?.name === 'Bi Sipariş Ver', a?.name);
kontrol('host listesi', (a?.hosts || []).includes('bisiparisver.com') && (a?.hosts || []).includes('www.bisiparisver.com'));

/* ---------- 2) URL tanıma ---------- */
const d = detectSite('https://www.bisiparisver.com/urun/bambu-lab-a2l-combo-3d-yazici');
kontrol('ürün URL tanınır', d?.id === 'bisiparisver', d?.id);
const dKok = detectSite('https://bisiparisver.com/urun/snapmaker-u1');
kontrol('www olmadan tanınır', dKok?.id === 'bisiparisver', dKok?.id);

/* ---------- 3) Ürün URL filtresi ---------- */
kontrol('ürün URL kabul', a.isProductUrl(new URL('https://www.bisiparisver.com/urun/x-y')));
kontrol('kategori URL reddedilir', !a.isProductUrl(new URL('https://www.bisiparisver.com/tumu-c-0')));
kontrol('arama URL reddedilir', !a.isProductUrl(new URL('https://www.bisiparisver.com/search?q=x')));

/* ---------- 4) Arama yolu ---------- */
kontrol('arama yolu /tumu-c-0?k=', a.searchUrl('filament') === 'https://www.bisiparisver.com/tumu-c-0?k=filament', a.searchUrl('filament'));
kontrol('sorgu kodlanır', a.searchUrl('pla filament 1,75').includes('pla%20filament'), a.searchUrl('pla filament 1,75'));

/* ---------- 5) Sepette ve nazik modda ---------- */
kontrol('sepet listesinde', SEPET_SITELERI.includes('bisiparisver'));
const rl = rateLimiter.snapshot();
kontrol('nazik modda (1 istek/sn)', rl['bisiparisver.com']?.rate === 1 && rl['bisiparisver.com']?.burst === 2,
  JSON.stringify(rl['bisiparisver.com']));

/* ---------- 6) Kargo: uydurulmadı ---------- */
kontrol('kargo tarifesi UYDURULMADI (kullanıcı bildirmedi)', !SITE_KARGO_VARSAYILANLARI.bisiparisver);

/* ---------- 7) Canlı test ---------- */
if (canli) {
  let t0 = Date.now();
  const s = await a.searchProducts('filament', { spend: 0 });
  const aramaSure = Date.now() - t0;
  kontrol('canlı: arama sonuç döndü', s.length > 0, String(s.length));
  kontrol('canlı: arama 10 sn altı', aramaSure < 10000, `${aramaSure} ms`);
  kontrol('canlı: kartlarda fiyat var', s.some(x => x.price > 0), JSON.stringify(s.slice(0, 2)));
  kontrol('canlı: URL mutlak', s.every(x => /^https?:\/\//.test(x.url)));

  const hedef = 'https://www.bisiparisver.com/urun/bambu-lab-a2l-combo-3d-yazici';
  t0 = Date.now();
  const p = await a.getProduct(hedef, { spend: 0 }, { fresh: true });
  const urunSure = Date.now() - t0;
  kontrol('canlı: ürün fiyatı okundu', p.sellingPrice > 0, String(p.sellingPrice));
  kontrol('canlı: ürün başlığı var', (p.title || '').length > 5, p.title);
  kontrol('canlı: ürün 10 sn altı', urunSure < 10000, `${urunSure} ms`);
  kontrol('canlı: stok bilgisi var', typeof p.inStock === 'boolean');

  console.log(`\n  arama: ${s.length} sonuç / ${aramaSure} ms`);
  for (const x of s.slice(0, 4)) console.log(`    ${String(x.price ?? '-').padStart(9)} | ${String(x.title).slice(0, 48)}`);
  console.log(`  ürün : ${p.sellingPrice} TL / ${urunSure} ms | ${String(p.title).slice(0, 50)}`);
  console.log(`  kargo: ${p.shipping?.note || '-'}`);
}

if (a) a.constructor = undefined; // noop
console.log(`BISIPARISVER ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exitCode = gecen === toplam ? 0 : 1;
