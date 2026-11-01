/** n11.com keşif 1: ana sayfa + arama + platform analizi. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let text;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      text = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { text = new TextDecoder('utf-8').decode(buf); }
    return { durum: res.status, text, sonUrl: res.url };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 50) }; }
}

fs.mkdirSync('data/explore/yeni', { recursive: true });

// 1) ana sayfa
console.log('=== n11 ana sayfa ===');
const r0 = await cek('https://www.n11.com/');
console.log('durum:', r0.durum, '| boyut:', r0.text.length, '| son url:', r0.sonUrl.slice(0, 60), r0.hata || '');
if (r0.durum === 200 && r0.text.length > 10000) {
  fs.writeFileSync('data/explore/yeni/ana-n11.html', r0.text);
  const t = r0.text.match(/<title>([^<]{3,80})</i);
  console.log('title:', t ? t[1].trim() : '?');
  const sa = r0.text.match(/"SearchAction"[\s\S]{0,200}?"urlTemplate"\s*:\s*"([^"]+)"/);
  if (sa) console.log('searchAction:', sa[1]);
  const formlar = [...new Set([...r0.text.matchAll(/<form[^>]*action="([^"]{1,100})"/gi)].map(m => m[1]))].filter(f => /search|arama/i.test(f));
  if (formlar.length) console.log('formlar:', formlar.slice(0, 3).join(' | '));
}

// 2) arama sayfasi denemeleri
console.log('\n=== n11 arama denemeleri ===');
for (const [ad, u] of [
  ['arama?q=', 'https://www.n11.com/arama?q=' + encodeURIComponent('pla filament')],
  ['arama?k=', 'https://www.n11.com/arama?k=' + encodeURIComponent('pla filament')],
]) {
  const r = await cek(u);
  const fiyat = (r.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  const t = (r.text.match(/<title>([^<]{3,80})</i)?.[1] || '?').trim();
  console.log(`${ad}: durum=${r.durum} boyut=${r.text.length} fiyat=${fiyat} | ${t.slice(0, 55)}`);
  if (r.durum === 200 && fiyat > 5) {
    fs.writeFileSync('data/explore/yeni/arama-n11.html', r.text);
  }
}
