/** Kesif 8: matersan GET varyantlari, samm __NEXT_DATA__, urun sayfasi JSON-LD kontrolu, p-g-mod kartlari. */
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

// 1) matersan: header arama formu + GET varyantlari
console.log('=== matersan header formu ===');
const ms = fs.readFileSync('data/explore/3d/arama-matersan.html', 'utf8');
const hf = ms.match(/<form[^>]*action="[^"]*arama[^"]*"[^>]*method="get"[^>]*>[\s\S]{0,600}/i) || ms.match(/<input[^>]*name="(q|kelime|word|search)[^"]*"[^>]*>/i);
console.log((hf ? (hf[0] || hf) : 'bulunamadi').replace(/\s+/g, ' ').slice(0, 500));

for (const u of [
  'https://matersan.com.tr/arama?label=' + encodeURIComponent('pla filament'),
  'https://matersan.com.tr/arama?QuickSearch=1&label=' + encodeURIComponent('pla filament'),
]) {
  const r = await cek(u);
  const urunSayisi = r.html ? (r.html.match(/\/urun\//g) || []).length : 0;
  const kart = r.html ? (r.html.match(/data-product-id/g) || []).length : 0;
  console.log('GET', u.slice(30, 90), '-> durum:', r.durum, '| /urun/:', urunSayisi, '| data-product-id:', kart);
  if (urunSayisi > 0) {
    const l = r.html.match(/href="([^"]*\/urun\/[^"]+)"/i);
    console.log('  ornek urun linki:', l ? l[1] : '?');
    fs.writeFileSync('data/explore/3d/arama-matersan-get.html', r.html);
  }
}

// 2) samm __NEXT_DATA__ yapisini incele
console.log('\n=== samm __NEXT_DATA__ ===');
const sm = fs.readFileSync('data/explore/3d/arama-samm.html', 'utf8');
const ndI = sm.indexOf('id="__NEXT_DATA__"');
const ndBas = sm.indexOf('>', ndI) + 1;
const ndSon = sm.indexOf('</script>', ndBas);
try {
  const nd = JSON.parse(sm.slice(ndBas, ndSon));
  const sayfa = nd.props?.pageProps;
  console.log('pageProps anahtarlari:', sayfa ? Object.keys(sayfa).join(', ') : '?');
  // icinde urun gibi gorunen dizi bul
  function urunAra(obj, yol = '', derinlik = 0) {
    if (derinlik > 4 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      if (obj.length && obj[0] && typeof obj[0] === 'object' && (obj[0].name || obj[0].slug || obj[0].url)) {
        console.log(`  dizi @${yol}:`, obj.length, 'oge | keys:', Object.keys(obj[0]).slice(0, 12).join(','));
        console.log('  ornek:', JSON.stringify(obj[0]).slice(0, 400));
        return;
      }
      obj.forEach((o, i) => urunAra(o, yol + '[' + i + ']', derinlik + 1));
    } else {
      for (const [k, v] of Object.entries(obj)) urunAra(v, yol + '.' + k, derinlik + 1);
    }
  }
  urunAra(nd.props?.pageProps);
} catch (e) { console.log('JSON parse hatasi:', String(e).slice(0, 80)); }

// 3) T-Soft urun sayfasi JSON-LD (direnc)
console.log('\n=== direnc urun sayfasi ===');
const dr = await cek('https://www.direnc.net/kirmizi-pla-plus-filament-175mm-1kg-tri-d');
console.log('durum:', dr.durum, 'boyut:', dr.html.length);
if (dr.html) {
  fs.writeFileSync('data/explore/3d/urun-direnc.html', dr.html);
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(dr.html))) {
    try {
      const d = JSON.parse(m[1]);
      for (const o of (Array.isArray(d) ? d : [d])) {
        console.log('JSON-LD tip:', o['@type'], o['@type'] === 'Product' ? JSON.stringify(o).slice(0, 500) : '');
      }
    } catch { console.log('(bozuk JSON-LD)'); }
  }
}

// 4) domirobot urun sayfasi
console.log('\n=== domirobot urun sayfasi ===');
const dm = await cek('https://www.domirobot.com/anycubic-ace-2-pro-cok-renkli-filament-sistemi-kobra-x-kobra-s1-pmu7877');
console.log('durum:', dm.durum, 'boyut:', dm.html.length);
if (dm.html) {
  fs.writeFileSync('data/explore/3d/urun-domirobot.html', dm.html);
  const ldRe2 = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m2;
  while ((m2 = ldRe2.exec(dm.html))) {
    try {
      const d = JSON.parse(m2[1]);
      for (const o of (Array.isArray(d) ? d : [d])) {
        console.log('JSON-LD tip:', o['@type'], o['@type'] === 'Product' ? JSON.stringify(o).slice(0, 500) : '');
      }
    } catch { console.log('(bozuk JSON-LD)'); }
  }
}

// 5) 3dteknomarket Shopify suggest.json
console.log('\n=== 3dteknomarket suggest.json ===');
try {
  const r = await cek('https://3dteknomarket.com/search/suggest.json?q=pla+filament&resources[type]=product&resources[limit]=5&resources[options][fields]=title,product_type,variants.title,tag');
  console.log('durum:', r.durum);
  console.log(r.html.slice(0, 700));
} catch (e) { console.log('hata', String(e).slice(0, 60)); }

// 6) filamentmarketim urun karti yapisi
console.log('\n=== filamentmarketim urun karti ===');
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
// marquee disindaki /bambu-lab-basic-pla-filament linki
const idx = [...fm.matchAll(/href="\/bambu-lab-basic-pla-filament"/gi)].map(m => m.index);
console.log('link konumlari:', idx.join(','));
if (idx.length > 1) console.log(fm.slice(idx[1] - 800, idx[1] + 1200).replace(/\s+/g, ' ').slice(0, 1900));

// 7) metatechtr.com.tr var mi?
console.log('\n=== metatechtr.com.tr kontrolu ===');
const mt = await cek('https://metatechtr.com.tr/', 15000);
console.log('durum:', mt.durum, 'boyut:', mt.html.length, mt.hata || '');
if (mt.html) { const t = mt.html.match(/<title>([^<]{3,90})</i); console.log('title:', t ? t[1] : '?'); }
