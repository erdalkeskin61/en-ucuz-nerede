/** Kesif 13: JS paketlerinden AJAX urun yukleme uclarini bul. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'tr-TR,tr;q=0.9', ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body });
    const text = await res.text();
    clearTimeout(t);
    return { durum: res.status, text };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 60) }; }
}

// 1) filamentdepom: urun isaretleri + tum scriptler
console.log('=== filamentdepom isaretler ===');
const fd = fs.readFileSync('data/explore/3d/arama-filamentdepom.html', 'utf8');
for (const kw of ['sepete', 'addCart', 'productBox', 'emgProduct', 'productDetail', 'Product/GetFiltered', 'urunListe', 'flProduct', 'data-product']) {
  const c = fd.split(kw).length - 1;
  if (c > 0) console.log(`  "${kw}": ${c}`);
}
const fdScripts = [...new Set([...fd.matchAll(/<script[^>]+src="([^"]{5,140})"/gi)].map(m => m[1]))].filter(s => !/googletagmanager|gstatic|cloudflare|recaptcha|facebook|google/i.test(s));
console.log('scriptler:');
for (const s of fdScripts.slice(0, 12)) console.log('  ', s.slice(0, 120));

// 2) filamentmarketim: tum scriptler (mutlak dahil)
console.log('\n=== filamentmarketim scriptler ===');
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
const fmScripts = [...new Set([...fm.matchAll(/<script[^>]+src="([^"]{5,140})"/gi)].map(m => m[1]))].filter(s => !/googletagmanager|gstatic|cloudflare|recaptcha|facebook|google|jquery|bootstrap|slick|lazysizes/i.test(s));
for (const s of fmScripts.slice(0, 15)) console.log('  ', s.slice(0, 120));

// 3) filamentmarketim: POST /arama denemesi
console.log('\n=== filamentmarketim POST /arama ===');
const mpost = await cek('https://www.filamentmarketim.com/arama', 25000, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'k=' + encodeURIComponent('pla filament'),
});
console.log('durum:', mpost.durum, 'boyut:', mpost.text.length);
const tl = (mpost.text.match(/\d[\d.,]*(?:\s|&nbsp;)*TL/g) || []).length;
console.log('fiyat:', tl);

// 4) Ticimax POST /Product/GetFilteredProducts denemesi
console.log('\n=== filamentdepom Ticimax AJAX denemeleri ===');
const denemeler = [
  ['POST /Product/GetFilteredProducts', 'https://filamentdepom.com/Product/GetFilteredProducts', 'POST', 'application/json; charset=utf-8', JSON.stringify({ SearchText: 'filament', Page: 1 })],
  ['POST /Arama partial', 'https://filamentdepom.com/arama?kelime=filament', 'POST', 'application/x-www-form-urlencoded', 'kelime=filament'],
];
for (const [ad, url, method, ct, body] of denemeler) {
  const r = await cek(url, 25000, { method, headers: { 'Content-Type': ct, 'X-Requested-With': 'XMLHttpRequest' }, body });
  const tl2 = (r.text.match(/\d[\d.,]*(?:\s|&nbsp;)*(?:TL|₺)/g) || []).length;
  console.log(`${ad} -> durum: ${r.durum} | boyut: ${r.text.length} | fiyat: ${tl2}`);
  if (r.durum === 200 && tl2 > 5) {
    fs.writeFileSync('data/explore/3d/ticimax-ajax.txt', r.text);
    console.log('  icerik ornegi:', r.text.slice(0, 300).replace(/\s+/g, ' '));
  }
}

// 5) ana JS paketlerini indir ve uc ara
console.log('\n=== JS paketi analizi ===');
const paketler = [];
// filamentdepom ana paketi
for (const s of fdScripts) {
  if (/theme|main|app|custom|script/i.test(s) && /\.(js|mjs)/i.test(s)) paketler.push(['fd', s.startsWith('http') ? s : 'https://filamentdepom.com' + s]);
}
for (const s of fmScripts) {
  if (/\.js/i.test(s)) paketler.push(['fm', s.startsWith('http') ? s : 'https://www.filamentmarketim.com' + s]);
}
for (const [etiket, url] of paketler.slice(0, 8)) {
  const r = await cek(url, 20000);
  if (r.durum !== 200 || !r.text) continue;
  console.log(`[${etiket}] ${url.slice(-60)} (${r.text.length} bayt)`);
  // ajax/fetch url desenleri
  const uclar = [...new Set([...r.text.matchAll(/["'](\/(?:[A-Za-z0-9_\-]+\/){0,3}(?:[Aa]rama|[Ss]earch|[Pp]roduct|[Ff]ilter)[A-Za-z0-9_\/\-]{0,40})["']/g)].map(m => m[1]))];
  if (uclar.length) console.log('  uclar:', uclar.slice(0, 8).join(' | '));
  const fetchler = [...new Set([...r.text.matchAll(/(?:url|fetch)\s*[:(]\s*["']([^"']{6,80})["']/g)].map(m => m[1]))].filter(u => u.startsWith('/') || u.includes('http'));
  if (fetchler.length) console.log('  fetch:', fetchler.slice(0, 8).join(' | '));
}
