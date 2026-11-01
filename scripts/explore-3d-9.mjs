/** Kesif 9 (son): urun sayfasi JSON-LD tam, samm fiyat, p-g-mod grid, filamentdepom arama, matersan POST. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9', ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body });
    const html = await res.text();
    clearTimeout(t);
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) }; }
}

function ldBlok(html, etiket) {
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(html))) {
    const ham = m[1].trim();
    console.log(`[${etiket}] JSON-LD blok (${ham.length} karakter):`, ham.slice(0, 700));
    console.log('');
  }
}

// 1) direnc urun sayfasi JSON-LD tam
console.log('=== direnc urun JSON-LD ===');
ldBlok(fs.readFileSync('data/explore/3d/urun-direnc.html', 'utf8'), 'direnc');

// 2) domirobot urun JSON-LD tam
console.log('=== domirobot urun JSON-LD ===');
ldBlok(fs.readFileSync('data/explore/3d/urun-domirobot.html', 'utf8'), 'domirobot');

// 3) robotistan urun sayfasi
console.log('=== robotistan urun sayfasi ===');
const rb = await cek('https://robotistan.com/tinylab-eco-pla-filament-175mm-siyah');
console.log('durum:', rb.durum, 'boyut:', rb.html.length);
if (rb.html) {
  fs.writeFileSync('data/explore/3d/urun-robotistan.html', rb.html);
  ldBlok(rb.html, 'robotistan');
}

// 4) samm: ₺ baglamlari
console.log('\n=== samm fiyat baglamlari ===');
const sm = fs.readFileSync('data/explore/3d/arama-samm.html', 'utf8');
const tlIdx = [];
let si = -1;
while ((si = sm.indexOf('₺', si + 1)) >= 0 && tlIdx.length < 5) tlIdx.push(si);
console.log('₺ sayisi:', (sm.match(/₺/g) || []).length);
for (const i of tlIdx) console.log('  ...', sm.slice(Math.max(0, i - 260), i + 60).replace(/\s+/g, ' ').slice(-260));

// 5) filamentmarketim: urun izgarasi ara
console.log('\n=== filamentmarketim urun izgarasi ===');
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
for (const kw of ['add-to-cart', 'addToCart', 'sepete-ekle', 'productDetail', 'product-detail', 'p-g-mod-t-', 'urun', 'Ürün', 'sonuç', 'Sonuç']) {
  const c = fm.split(kw).length - 1;
  if (c > 0) console.log(`  "${kw}": ${c}`);
}
// ilk "TL" gecen yer
const tlI = fm.search(/\d[\d.,]*\s*(?:TL|₺)/);
if (tlI > 0) console.log('  fiyat baglami:', fm.slice(Math.max(0, tlI - 350), tlI + 80).replace(/\s+/g, ' ').slice(-380));

// 6) filamentdepom arama URL denemeleri
console.log('\n=== filamentdepom arama denemeleri ===');
for (const [ad, u] of [
  ['arama?q=', 'https://filamentdepom.com/arama?q=' + encodeURIComponent('pla filament')],
  ['search?q=', 'https://filamentdepom.com/search?q=' + encodeURIComponent('pla filament')],
  ['arama?txtbxArama=', 'https://filamentdepom.com/arama?txtbxArama=' + encodeURIComponent('pla filament')],
]) {
  const r = await cek(u, 25000);
  const urun = r.html ? ((r.html.match(/-p-\d+|urun\/|\/urun-/g) || []).length) : 0;
  console.log(`  ${ad} -> durum: ${r.durum} | boyut: ${r.html.length} | urun ipucu: ${urun}`);
  if (r.html && r.durum === 200 && r.html.length > 50000) {
    const t = r.html.match(/<title>([^<]{5,90})</i);
    console.log('    title:', t ? t[1].trim() : '?');
  }
}
// ana sayfada arama JS'ini incele
const fd = fs.readFileSync('data/explore/3d/ana-filamentdepom.html', 'utf8') || '';
console.log('  (ana sayfa kayitli:', fs.existsSync('data/explore/3d/ana-filamentdepom.html'), ')');
const fdJs = [...new Set([...fd.matchAll(/(?:url|action)\s*[:=]\s*["']([^"']*(?:ara|search|arama)[^"']*)["']/gi)].map(m => m[1]))];
console.log('  arama JS ipuclari:', fdJs.slice(0, 5).join(' | ') || 'yok');

// 7) matersan POST arama
console.log('\n=== matersan POST arama ===');
const mpost = await cek('https://matersan.com.tr/arama', 30000, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'QuickSearch=1&label=' + encodeURIComponent('pla filament') + '&category=0&brand=0',
});
console.log('durum:', mpost.durum, 'boyut:', mpost.html.length);
if (mpost.html) {
  const urun = (mpost.html.match(/\/urun\//g) || []).length;
  const kart = (mpost.html.match(/data-product-id/g) || []).length;
  console.log('/urun/:', urun, '| data-product-id:', kart);
  if (kart > 0 || urun > 0) {
    fs.writeFileSync('data/explore/3d/arama-matersan-post.html', mpost.html);
    const l = mpost.html.match(/href="([^"]*\/urun\/[^"]+)"/i);
    console.log('ornek urun linki:', l ? l[1] : '?');
  }
}
