/** Kesif 16: IdeaSoft /client/Visitor/search ucu testi + urun sayfasi JSON-LD. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': opts.accept || '*/*', 'Accept-Language': 'tr-TR,tr;q=0.9', ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body });
    const text = await res.text();
    clearTimeout(t);
    return { durum: res.status, text, tip: res.headers.get('content-type') };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 60) }; }
}

// 1) scripts.min.js icinde Visitor/search baglami
console.log('=== Visitor/search baglami ===');
const js = fs.readFileSync('data/explore/3d/fm-scripts-min.js', 'utf8');
let i = -1; let n = 0;
while ((i = js.indexOf('/client/Visitor/search', i + 1)) >= 0 && n < 3) {
  console.log('--- @' + i + ' ---');
  console.log(js.slice(Math.max(0, i - 600), i + 400).replace(/\s+/g, ' '));
  n++;
}

// 2) uc testleri
console.log('\n=== uc testleri (filamentmarketim) ===');
const base = 'https://www.filamentmarketim.com';
const denemeler = [
  ['GET q', `${base}/client/Visitor/search?q=pla%20filament`, 'GET', null],
  ['GET k', `${base}/client/Visitor/search?k=pla%20filament`, 'GET', null],
  ['GET search', `${base}/client/Visitor/search?search=pla%20filament`, 'GET', null],
  ['POST k (json)', `${base}/client/Visitor/search`, 'POST', JSON.stringify({ k: 'pla filament' })],
];
for (const [ad, url, method, body] of denemeler) {
  const r = await cek(url, 20000, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body,
    accept: 'application/json, text/plain, */*',
  });
  console.log(`${ad} -> ${r.durum} | tip: ${r.tip} | boyut: ${r.text.length}`);
  if (r.durum === 200 && r.text.length > 50) console.log('  icerik:', r.text.slice(0, 400).replace(/\s+/g, ' '));
}

// 3) filamentmarketim urun sayfasi JSON-LD
console.log('\n=== filamentmarketim urun sayfasi ===');
const up = await cek(`${base}/bambu-lab-basic-pla-filament`);
console.log('durum:', up.durum, 'boyut:', up.text.length);
if (up.durum === 200) {
  fs.writeFileSync('data/explore/3d/urun-filamentmarketim.html', up.text);
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(up.text))) {
    const ham = m[1].trim();
    console.log('JSON-LD blok (' + ham.length + '):', ham.slice(0, 600));
  }
  // fiyat isaretleri
  const tl = (up.text.match(/\d[\d.,]*(?:\s|&nbsp;)*(?:TL|₺)/g) || []).length;
  console.log('fiyat adedi:', tl);
}
