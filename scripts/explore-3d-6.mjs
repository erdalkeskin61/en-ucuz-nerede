/** Kesif 6: kart fiyatlari, shop.3dortgen, novafab, motorobit urunleri, matersan worker. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    const html = await res.text();
    clearTimeout(t);
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) }; }
}

function pencere(html, needle, once, sonra) {
  const i = html.indexOf(needle);
  if (i < 0) return '(bulunamadi: ' + needle + ')';
  return html.slice(Math.max(0, i - once), i + sonra).replace(/\s+/g, ' ');
}

// 1) direnc: urun kartindan fiyat
console.log('=== direnc kart (uzun) ===');
const dr = fs.readFileSync('data/explore/3d/arama-direnc.html', 'utf8');
const drI = dr.indexOf('data-toggle="product-url"');
console.log(dr.slice(drI, drI + 2600).replace(/\s+/g, ' ').slice(0, 2500));

// 2) samm: urun linkinden sonraki fiyat
console.log('\n\n=== samm kart (uzun) ===');
const sm = fs.readFileSync('data/explore/3d/arama-samm.html', 'utf8');
const smI = sm.indexOf('href="/fibromast-pla-seffaf-kirmizi-filament-175mm-1kg"');
console.log(sm.slice(smI, smI + 3000).replace(/\s+/g, ' ').slice(0, 2900));

// 3) robolinkmarket: product-item blogu
console.log('\n\n=== robolinkmarket product-item ===');
const rl = fs.readFileSync('data/explore/3d/arama-robolinkmarket.html', 'utf8');
console.log(pencere(rl, 'class="col-2 col-sm-2 col-md-4 col-lg-2 col-xl-2 mb-2 product-item"', 100, 2400).slice(0, 2300));

// 4) filamentsan: product-card blogu
console.log('\n\n=== filamentsan product-card ===');
const fsn = fs.readFileSync('data/explore/3d/arama-filamentsan.html', 'utf8');
console.log(pencere(fsn, 'product-card', 200, 2200).slice(0, 2200));

// 5) motorobit: urun listesi ara
console.log('\n\n=== motorobit: catalog/urun blogu ===');
const mb = fs.readFileSync('data/explore/3d/arama-motorobit.html', 'utf8');
console.log('search-word:', mb.includes('search-word'));
console.log(pencere(mb, 'id="catalog', 50, 2400).slice(0, 2300));

// 6) filamentmarketim: JSON-LD CollectionPage + urun karti
console.log('\n\n=== filamentmarketim JSON-LD + kart ===');
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = ldRe.exec(fm))) {
  try {
    const d = JSON.parse(m[1]);
    const arr = Array.isArray(d) ? d : [d];
    for (const o of arr) {
      if (o['@type'] === 'CollectionPage' || o.itemListElement) {
        console.log('CollectionPage anahtarlar:', Object.keys(o).join(','));
        const il = o.mainEntity || o.itemListElement;
        if (il) console.log('liste:', JSON.stringify(il).slice(0, 600));
      }
    }
  } catch { }
}
console.log(pencere(fm, 'p-g-mod-t-8', 100, 2200).slice(0, 2200));

// 7) matersan: worker/api uclari
console.log('\n\n=== matersan worker/api ===');
const ms2 = fs.readFileSync('data/explore/3d/arama-matersan.html', 'utf8');
const apiRe = /["'](\/[a-z0-9_\-\/]*(?:worker|service|api|ajax)[a-z0-9_\-\/]*)["']/gi;
let am; const apis = new Set();
while ((am = apiRe.exec(ms2))) apis.add(am[1]);
console.log('api adaylari:', [...apis].slice(0, 15).join(' | ') || 'yok');
console.log(pencere(ms2, 'action="/arama', 200, 400));

// 8) shop.3dortgen.com kesfi
console.log('\n\n=== shop.3dortgen.com ===');
const r = await cek('https://shop.3dortgen.com/');
console.log('durum:', r.durum, 'boyut:', r.html.length, r.hata || '');
if (r.html) {
  fs.writeFileSync('data/explore/3d/ana-shop3dortgen.html', r.html);
  const t = r.html.match(/<title>([^<]{5,100})</i);
  console.log('title:', t ? t[1] : '?');
  const plat = [];
  if (/wp-content|woocommerce/i.test(r.html)) plat.push('WooCommerce');
  if (/route=product\/search/i.test(r.html)) plat.push('OpenCart');
  if (/ideasoft|worker_not_found/i.test(r.html)) plat.push('IdeaSoft');
  if (/witcdn|tsoft/i.test(r.html)) plat.push('T-Soft');
  if (/myikas/i.test(r.html)) plat.push('Ikas');
  if (/shopify/i.test(r.html)) plat.push('Shopify');
  console.log('platform:', plat.join(',') || '?');
  console.log('arama formu:', pencere(r.html, 'type="search"', 300, 150).slice(0, 400));
}

// 9) novafab.com hizli kontrol
console.log('\n\n=== novafab.com ===');
const r2 = await cek('https://www.novafab.com/');
console.log('durum:', r2.durum, 'boyut:', r2.html.length, r2.hata || '');
if (r2.html) {
  const t = r2.html.match(/<title>([^<]{5,100})</i);
  console.log('title:', t ? t[1] : '?');
  const plat = [];
  if (/wp-content|woocommerce/i.test(r2.html)) plat.push('WooCommerce');
  if (/shopify/i.test(r2.html)) plat.push('Shopify');
  if (/myikas/i.test(r2.html)) plat.push('Ikas');
  if (/ideasoft/i.test(r2.html)) plat.push('IdeaSoft');
  console.log('platform:', plat.join(',') || '?');
  console.log(pencere(r2.html, 'type="search"', 250, 120).slice(0, 350));
}
