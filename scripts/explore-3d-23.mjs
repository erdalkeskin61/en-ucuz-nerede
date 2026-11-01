/** Kesif 23: matersan/filamentdepom/samm urun sayfasi fiyat yapilari + Shopify .js ucu. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': '*/*' } });
    const html = await res.text();
    clearTimeout(t);
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) }; }
}

function fiyatBaglamlari(html, etiket, adet = 4) {
  console.log(`\n=== ${etiket} fiyat baglamlari ===`);
  const idx = [];
  let i = -1;
  while ((i = html.indexOf('₺', i + 1)) >= 0 && idx.length < adet) idx.push(i);
  console.log('₺ sayisi:', (html.match(/₺/g) || []).length);
  for (const j of idx) console.log('  ...', html.slice(Math.max(0, j - 300), j + 40).replace(/\s+/g, ' ').slice(-280));
  // data-price benzerleri
  for (const kw of ['data-price', 'productPrice', 'fiyat', 'price"']) {
    const k = html.indexOf(kw);
    if (k > 0) console.log(`  [${kw}]:`, html.slice(k - 80, k + 200).replace(/\s+/g, ' ').slice(0, 260));
  }
}

// 1) matersan urun sayfasi
const mt = await cek('https://matersan.com.tr/urun/heygears-ultracraft-reflex-3d-yazici');
if (mt.html) {
  fs.writeFileSync('data/explore/3d/urun-matersan.html', mt.html);
  fiyatBaglamlari(mt.html, 'matersan');
}

// 2) filamentdepom urun sayfasi (kayitli)
const fdp = fs.readFileSync('data/explore/3d/urun-filamentdepom.html', 'utf8');
fiyatBaglamlari(fdp, 'filamentdepom');

// 3) samm urun sayfasi
const sm = await cek('https://market.samm.com/fibromast-pla-seffaf-kirmizi-filament-175mm-1kg');
if (sm.html) {
  fs.writeFileSync('data/explore/3d/urun-samm.html', sm.html);
  fiyatBaglamlari(sm.html, 'samm');
}

// 4) 3dteknomarket /products/{handle}.js
console.log('\n=== 3dteknomarket products.js ===');
const js = await cek('https://3dteknomarket.com/products/beta-pla-filament-white.js');
console.log('durum:', js.durum, '| boyut:', js.html.length);
console.log('yanit:', js.html.slice(0, 500));
