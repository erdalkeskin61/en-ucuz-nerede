/** Kesif 14: filamentdepom urunListe/data-product icerigi + filamentmarketim scripts.js. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': '*/*' } });
    const text = await res.text();
    clearTimeout(t);
    return { durum: res.status, text };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 60) }; }
}

const fd = fs.readFileSync('data/explore/3d/arama-filamentdepom.html', 'utf8');

// 1) urunListe baglami
console.log('=== urunListe baglamlari ===');
let i = -1; let n = 0;
while ((i = fd.indexOf('urunListe', i + 1)) >= 0 && n < 3) {
  console.log('--- @' + i + ' ---');
  console.log(fd.slice(Math.max(0, i - 250), i + 350).replace(/\s+/g, ' '));
  n++;
}

// 2) data-product baglami
console.log('\n=== data-product baglami ===');
const j = fd.indexOf('data-product');
console.log(fd.slice(Math.max(0, j - 400), j + 700).replace(/\s+/g, ' '));

// 3) sayfada gomulu JSON urun dizisi var mi? (urun adi + fiyat alanlari)
console.log('\n=== gomulu JSON arama ===');
const jsonAday = [...fd.matchAll(/"(?:productName|urunAdi|UrunAdi|title)"\s*:\s*"[^"]{8,80}"/g)].slice(0, 5);
console.log('JSON urun adlari:', jsonAday.map(m => m[0].slice(0, 70)).join(' | ') || 'yok');
const fiyatJson = [...fd.matchAll(/"(?:price|fiyat|urunFiyat|sellPrice)"\s*:\s*"?[\d.,]+"?/g)].slice(0, 5);
console.log('JSON fiyatlar:', fiyatJson.map(m => m[0]).join(' | ') || 'yok');

// 4) filamentmarketim scripts.js icerigi (arama/urun yukleme)
console.log('\n=== filamentmarketim scripts.js ===');
const r = await cek('https://www.filamentmarketim.com/theme/filamentmarketim_arama/assets/scripts.js?v=1792393683');
fs.writeFileSync('data/explore/3d/fm-scripts.js', r.text);
console.log('boyut:', r.text.length);
// ajax/fetch/yukleme parcalari
for (const kw of ['ajax', 'fetch(', 'XMLHttp', 'loadMore', 'infinity', 'scroll', 'partial', 'sayfa', 'page']) {
  let k = -1; let c = 0;
  const parcalar = [];
  while ((k = r.text.toLowerCase().indexOf(kw.toLowerCase(), k + 1)) >= 0 && c < 2) {
    parcalar.push(r.text.slice(Math.max(0, k - 120), k + 200).replace(/\s+/g, ' '));
    c++;
  }
  if (parcalar.length) console.log(`\n[${kw}]`), parcalar.forEach(p => console.log('  ', p.slice(0, 300)));
}
