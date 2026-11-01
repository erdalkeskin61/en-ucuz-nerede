/** Kesif 15: filamentdepom tam kart + filamentmarketim ajaxFormGate Product ucu. */
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

// 1) filamentdepom: tam productItem karti (tek tirnak href'ler dahil)
console.log('=== filamentdepom tam kart ===');
const fd = fs.readFileSync('data/explore/3d/arama-filamentdepom.html', 'utf8');
const piI = fd.indexOf('class="productItem "');
if (piI < 0) {
  const piI2 = fd.indexOf('productItem ');
  console.log(fd.slice(Math.max(0, piI2 - 200), piI2 + 2500).replace(/\s+/g, ' ').slice(0, 2500));
} else {
  console.log(fd.slice(Math.max(0, piI - 200), piI + 2500).replace(/\s+/g, ' ').slice(0, 2500));
}
// detailUrl sayisi
const detailSay = (fd.match(/class="detailUrl"/g) || []).length;
console.log('\ndetailUrl sayisi:', detailSay);

// 2) filamentmarketim scripts.min.js: ajaxFormGate + Product
console.log('\n=== scripts.min.js analizi ===');
const r = await cek('https://www.filamentmarketim.com/template/smart/default/assets/scripts.min.js?v=1792692490');
fs.writeFileSync('data/explore/3d/fm-scripts-min.js', r.text);
console.log('boyut:', r.text.length);
// ajaxFormGate cagrilari
const gates = [...new Set([...r.text.matchAll(/ajaxFormGate\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]/g)].map(m => m[1] + ' ' + m[2] + '.' + m[3]))];
console.log('ajaxFormGate cagrilari:', gates.slice(0, 25).join(' | ') || 'yok');
// url sablonleri
const urls = [...new Set([...r.text.matchAll(/["'](\/[A-Za-z][A-Za-z0-9_\-/]{3,60})["']/g)].map(m => m[1]))].filter(u => /product|search|arama|filter|categor|list/i.test(u));
console.log('ilgili url ler:', urls.slice(0, 15).join(' | ') || 'yok');
