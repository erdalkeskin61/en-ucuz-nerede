/** Yeni parti keşif 12 (kesin son): robodukkan karti, hepsivar varyantlari, urhanshop anajs. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': '*/*' } });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let text;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      text = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { text = new TextDecoder('utf-8').decode(buf); }
    return { durum: res.status, text };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 50) }; }
}

// 1) robodukkan: bakir-plaket mutlak href karti
console.log('=== robodukkan kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-robodukkan.html', 'utf8');
  const m = html.match(/href="([^"]*bakir-plaket[^"]*)"/);
  if (m) {
    const i = html.indexOf(m[1]);
    console.log(html.slice(Math.max(0, i - 1500), i + 1200).replace(/\s+/g, ' ').slice(0, 2500));
  } else {
    console.log('bakir-plaket yine yok; tum urun-benzeri hreflerden 10-20 arasi:');
    const hrefs = [...new Set([...html.matchAll(/href="(https?:\/\/www\.robodukkan\.com\/[a-z0-9-]{12,90})"/g)].map(x => x[1]))]
      .filter(h => !/kategori|sepet|iletisim|sayfa|hakkimizda|gizlilik|kvkk|siparis|uyelik|odeme|kargo|iade|sss|blog|kampanya|arduino|3d-yazici/.test(h));
    console.log('toplam:', hrefs.length);
    for (const h of hrefs.slice(8, 16)) console.log('  ', h.slice(0, 110));
    if (hrefs[10]) {
      const i = html.indexOf('"' + hrefs[10] + '"');
      console.log('\nkart cevresi:');
      console.log(html.slice(Math.max(0, i - 1200), i + 1200).replace(/\s+/g, ' ').slice(0, 2200));
    }
  }
}

// 2) hepsivar arama varyantlari
console.log('\n\n=== hepsivar varyantlari ===');
for (const [ad, u] of [
  ['arama.xhtml', 'https://www.hepsivar.com/arama.xhtml?q=' + encodeURIComponent('pla filament')],
  ['arama.shtml', 'https://www.hepsivar.com/arama.shtml?q=' + encodeURIComponent('pla filament')],
  ['1-13.xhtml (tekrar)', 'https://www.hepsivar.com/1-13.xhtml?q=' + encodeURIComponent('pla filament')],
]) {
  const r = await cek(u);
  const kart = (r.text.match(/product-title|product-item|data-product-id/g) || []).length;
  console.log(`${ad}: durum=${r.durum} boyut=${r.text.length} kart=${kart}`);
  if (kart > 3) {
    fs.writeFileSync('data/explore/yeni/arama-hepsivar.html', r.text);
    const i = r.text.indexOf('product-title');
    console.log('kart ornegi:', r.text.slice(Math.max(0, i - 200), i + 400).replace(/\s+/g, ' ').slice(0, 500));
  }
}

// 3) urhanshop anajs.js
console.log('\n\n=== urhanshop anajs.js ===');
{
  const r = await cek('https://cdn.odyabilisim.com/js/anajs.js');
  console.log('boyut:', r.text.length);
  const uclar = [...new Set([...r.text.matchAll(/["']([^"']*(?:arama|Ara|search)[^"']{0,50})["']/g)].map(m => m[1]))].slice(0, 10);
  console.log('arama ipuclari:', uclar.join(' | ') || 'yok');
  const dp = r.text.match(/doPostBack[^;]{0,200}/);
  if (dp) console.log('doPostBack:', dp[0].slice(0, 200));
}
