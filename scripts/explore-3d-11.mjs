/** Kesif 11: filamentdepom Ticimax parametresi + filamentmarketim AJAX ucu. */
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

// 1) filamentdepom: Ticimax parametreleri
console.log('=== filamentdepom parametre denemeleri ===');
for (const [ad, u] of [
  ['kelime', 'https://filamentdepom.com/arama?kelime=' + encodeURIComponent('pla filament')],
  ['txtbxArama(/arama)', 'https://filamentdepom.com/arama?txtbxArama=' + encodeURIComponent('pla filament')],
  ['q(/Arama)', 'https://filamentdepom.com/Arama?q=' + encodeURIComponent('pla filament')],
  ['AramaKelimesi', 'https://filamentdepom.com/arama?AramaKelimesi=' + encodeURIComponent('pla filament')],
]) {
  const r = await cek(u, 25000);
  const tl = r.html ? (r.html.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length : 0;
  const t = r.html ? (r.html.match(/<title>([^<]{5,90})</i)?.[1] || '?').trim() : '?';
  console.log(`${ad} -> durum: ${r.durum} | fiyat: ${tl} | title: ${t.slice(0, 60)}`);
  if (tl > 10) fs.writeFileSync('data/explore/3d/arama-filamentdepom.html', r.html);
}
// Ticimax ipucu: ana sayfada arama fonksiyonu
const fd = fs.readFileSync('data/explore/3d/ana-filamentdepom.html', 'utf8');
const aramaJs = fd.match(/function[^{]*[Aa]rama[^{]*\{[\s\S]{0,400}/);
if (aramaJs) console.log('arama JS:', aramaJs[0].replace(/\s+/g, ' ').slice(0, 350));
const ticimaxUrl = [...new Set([...fd.matchAll(/["']([^"']*(?:ara|Ara)[a-z]*(?:\.aspx|\/)[^"']{0,40})["']/g)].map(m => m[1]))].slice(0, 6);
console.log('arama URL ipuclari:', ticimaxUrl.join(' | ') || 'yok');

// 2) filamentmarketim: p-g-mod-t-* degerleri + AJAX uclari
console.log('\n=== filamentmarketim analiz ===');
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
const modlar = [...new Set([...fm.matchAll(/p-g-mod-t-(\d+)/g)].map(m => 't-' + m[1]))];
console.log('p-g-mod modulleri:', modlar.join(', '));
// fetch/ajax cagrilari
const fetchler = [...new Set([...fm.matchAll(/(?:fetch|ajax|XMLHttpRequest|\$\.(?:get|post))\s*\(\s*["']([^"']{4,90})["']/gi)].map(m => m[1]))];
console.log('fetch/ajax:', fetchler.slice(0, 10).join(' | ') || 'yok');
// data-* ozellikleri (lazy load ayarlari)
const dataAttrs = [...new Set([...fm.matchAll(/data-(?:url|endpoint|action|api)="([^"]{4,90})"/gi)].map(m => m[0]))];
console.log('data-url/endpoint:', dataAttrs.slice(0, 10).join(' | ') || 'yok');
// script src listesi
const scripts = [...new Set([...fm.matchAll(/src="(\/[^"]{5,90}\.js[^"]*)"/g)].map(m => m[1]))].filter(s => !/jquery|bootstrap|slick|lazysizes|cookie/i.test(s));
console.log('scriptler:', scripts.slice(0, 12).join(' | '));
