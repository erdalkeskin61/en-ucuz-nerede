/** Yeni parti keşif 11 (son): rhino fiyat, robodukkan customs.js, hepsivar tumu, urhanshop JS. */
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

// 1) rhino: kart fiyati (c-p-i-link sonrasi)
console.log('=== rhino kart fiyati ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-rhino3dprinter.html', 'utf8');
  const i = html.indexOf('c-p-i-link');
  if (i > 0) console.log(html.slice(i, i + 1500).replace(/\s+/g, ' ').slice(0, 1500));
}

// 2) robodukkan customs.js analizi
console.log('\n\n=== robodukkan customs.js ===');
{
  const r = await cek('https://www.robodukkan.com/assets/ny/js/customs.js?v=v.1.2.73');
  fs.writeFileSync('data/explore/yeni/robodukkan-customs.js', r.text);
  console.log('boyut:', r.text.length);
  for (const kw of ['filterajax', 'ajax', 'fetch(', 'XMLHttp', 'loadProducts', 'url:']) {
    let k = -1; let n = 0;
    while ((k = r.text.toLowerCase().indexOf(kw.toLowerCase(), k + 1)) >= 0 && n < 3) {
      console.log(`\n[${kw}]`, r.text.slice(Math.max(0, k - 150), k + 250).replace(/\s+/g, ' ').slice(0, 380));
      n++;
    }
  }
}

// 3) hepsivar: tumu-c-0 testi + ana sayfa urun isaretleri
console.log('\n\n=== hepsivar ===');
{
  const r = await cek('https://www.hepsivar.com/tumu-c-0?k=' + encodeURIComponent('pla filament'));
  const kart = (r.text.match(/product-url|product-title|card-product|c-p-i-link|data-product-id/g) || []).length;
  console.log('/tumu-c-0?k= -> durum:', r.durum, '| boyut:', r.text.length, '| kart:', kart);
  const ana = fs.readFileSync('data/explore/yeni/ana-hepsivar.html', 'utf8');
  for (const w of ['product-url', 'product-title', 'card-product', 'c-p-i-link', 'showcase-title']) {
    const c = ana.split(w).length - 1;
    if (c > 0) console.log(`ana sayfa "${w}": ${c}`);
  }
}

// 4) urhanshop: ana sayfa JS'lerinde arama URL'si
console.log('\n\n=== urhanshop JS ===');
{
  const ana = fs.readFileSync('data/explore/yeni/ana-urhanshop.html', 'utf8');
  const scripts = [...new Set([...ana.matchAll(/<script[^>]+src="([^"]{5,120}\.js[^"]*)"/gi)].map(m => m[1]))]
    .filter(s => !/jquery|bootstrap|owl|sweetalert|popper/i.test(s));
  console.log('scriptler:', scripts.slice(0, 10).join('\n  '));
  // __doPostBack kullanimi ve arama
  const dp = ana.match(/function __doPostBack[\s\S]{0,200}/);
  if (dp) console.log('\n__doPostBack var (ASP.NET postback aramasi)');
  const aramaJs = ana.match(/arama3[^>]{0,150}/);
  if (aramaJs) console.log('arama3 baglami:', aramaJs[0].slice(0, 150));
}
