/** Yeni parti keşif 10: rhino kart, urhanshop kart, robodukkan AJAX, hepsivar POST. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal, method: opts.method || 'GET',
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'tr-TR,tr;q=0.9', ...(opts.headers || {}) },
      body: opts.body,
    });
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

// 1) rhino kart (arama sayfasinda urun linki cevresi)
console.log('=== rhino kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-rhino3dprinter.html', 'utf8');
  const i = html.indexOf('filamer-hyper-pla-neon-fusya');
  if (i > 0) console.log(html.slice(Math.max(0, i - 1500), i + 1200).replace(/\s+/g, ' ').slice(0, 2500));
}

// 2) urhanshop kart
console.log('\n\n=== urhanshop kart ===');
{
  try {
    const html = fs.readFileSync('data/explore/yeni/arama-urhanshop.html', 'utf8');
    const m = html.match(/href="([^"]*-u\d+)[^"]*"/);
    if (m) {
      const i = html.indexOf(m[1]);
      console.log(html.slice(Math.max(0, i - 1400), i + 1400).replace(/\s+/g, ' ').slice(0, 2600));
    } else console.log('-u linki yok');
  } catch { console.log('dosya yok'); }
}

// 3) robodukkan: tema JS'lerinde urun listesi AJAX ucu
console.log('\n\n=== robodukkan AJAX ucu ===');
{
  const ana = fs.readFileSync('data/explore/yeni/ana-robodukkan.html', 'utf8');
  const scripts = [...new Set([...ana.matchAll(/<script[^>]+src="([^"]{5,140})"/gi)].map(m => m[1]))]
    .filter(s => /theme|main|app|custom|script/i.test(s) && !/jquery|bootstrap|cloudflare|google|popper/.test(s));
  console.log('scriptler:', scripts.slice(0, 8).join('\n  '));
  for (const s of scripts.slice(0, 4)) {
    const r = await cek(s.startsWith('http') ? s : 'https://www.robodukkan.com' + s);
    if (r.durum !== 200 || !r.text) continue;
    const uclar = [...new Set([...r.text.matchAll(/(?:url|fetch|ajax)\s*[:(=]\s*["']([^"']{4,90})["']/gi)].map(m => m[1]))]
      .filter(u => /arama|search|filter|urun|product|list/i.test(u));
    if (uclar.length) console.log(`\n[${s.slice(-50)}] uclar:`, uclar.slice(0, 10).join(' | '));
  }
}

// 4) hepsivar POST /1-13.xhtml
console.log('\n\n=== hepsivar POST ===');
{
  const r = await cek('https://www.hepsivar.com/1-13.xhtml', 25000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'q=' + encodeURIComponent('pla filament'),
  });
  const urun = (r.text.match(/-p-\d+|urun\//g) || []).length;
  console.log('durum:', r.durum, '| boyut:', r.text.length, '| urun ipucu:', urun);
  // ana sayfadaki formun tam alanlari
  const ana = fs.readFileSync('data/explore/yeni/ana-hepsivar.html', 'utf8');
  const fi = ana.indexOf('action="/1-13.xhtml"');
  if (fi > 0) console.log('form:', ana.slice(fi - 200, fi + 900).replace(/\s+/g, ' ').slice(0, 900));
}
