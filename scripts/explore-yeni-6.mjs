/**
 * Yeni parti keşif 6: IdeaSoft-klasik /tumu-c-0, koctas/trendruum/robodukkan kartlari, mikron POST, ciceksepeti analizi.
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      method: opts.method || 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9', ...(opts.headers || {}) },
      body: opts.body,
    });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let html;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      html = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { html = new TextDecoder('utf-8').decode(buf); }
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 50) }; }
}

const SORGU = encodeURIComponent('pla filament');

// 1) IdeaSoft-klasik: /tumu-c-0?k= testleri
console.log('=== IdeaSoft-klasik /tumu-c-0?k= ===');
for (const [id, base] of [
  ['rhino3dprinter', 'https://www.rhino3dprinter.com'],
  ['mintengo', 'https://mintengo.com'],
  ['kurumsalit', 'https://kurumsalit.com'],
  ['robotzade', 'https://www.robotzade.com'],
  ['robitshop', 'https://robitshop.com'],
]) {
  const r = await cek(base + '/tumu-c-0?k=' + SORGU);
  const kart = (r.html.match(/showcase-title|showcase-price|data-product-id/g) || []).length;
  const fiyat = (r.html.match(/showcase-price-new">\s*[\d.,]+\s*TL/g) || []).length;
  console.log(`${id}: durum=${r.durum} boyut=${r.html.length} kart=${kart} fiyat=${fiyat}`);
  if (kart > 3 || fiyat > 2) fs.writeFileSync(`data/explore/yeni/arama-${id}.html`, r.html);
}

// 2) koctas /search?q= kaydet + kart analizi
console.log('\n=== koctas search ===');
{
  const r = await cek('https://www.koctas.com.tr/search?q=' + SORGU);
  console.log('durum:', r.durum, '| boyut:', r.html.length, '| title:', (r.html.match(/<title>([^<]{3,70})</i)?.[1] || '?').trim());
  fs.writeFileSync('data/explore/yeni/arama-koctas.html', r.html);
  // urun kartlari ara
  for (const w of ['product-card', 'productCard', 'class="product', 'data-product', 'wc-block-grid', 'woocommerce-loop']) {
    const c = r.html.split(w).length - 1;
    if (c > 0) console.log(`  "${w}": ${c}`);
  }
  // ilk urun linki + baslik
  const pl = r.html.match(/<a[^>]+href="(https:\/\/www\.koctas\.com\.tr\/[^"]{10,120})"[^>]*>\s*<img[^>]*alt="([^"]{5,90})"/);
  if (pl) console.log('  ornek urun:', pl[2].slice(0, 60), '->', pl[1].slice(0, 90));
}

// 3) trendruum kart analizi (tam)
console.log('\n=== trendruum kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-trendruum.html', 'utf8');
  const i = html.indexOf('tr-kk-eski');
  if (i > 0) console.log(html.slice(Math.max(0, i - 1600), i + 300).replace(/\s+/g, ' ').slice(0, 1800));
}

// 4) robodukkan: JSON-LD SearchResultsPage + kart
console.log('\n=== robodukkan ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-robodukkan.html', 'utf8');
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(html))) {
    try {
      const d = JSON.parse(m[1]);
      for (const o of (d['@graph'] || (Array.isArray(d) ? d : [d]))) {
        if (o['@type'] === 'SearchResultsPage' || o['@type'] === 'ItemList') {
          console.log('JSON-LD:', o['@type'], '| anahtarlar:', Object.keys(o).join(','));
          console.log(JSON.stringify(o).slice(0, 500));
        }
      }
    } catch { }
  }
  // urun karti: -u\d olmadan slug linkler + fiyat
  const i = html.search(/class="[^"]*(?:product|urun)[^"]*"/i);
  if (i > 0) console.log('\nkart:', html.slice(i, i + 900).replace(/\s+/g, ' ').slice(0, 900));
}

// 5) mikron3d: POST /?search=
console.log('\n=== mikron3d POST ===');
{
  const r = await cek('https://www.mikron3d.com/', 25000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'search=' + SORGU,
  });
  const urun = (r.html.match(/-k\.html|urun-detay|-u\d+/g) || []).length;
  console.log('POST durum:', r.durum, '| boyut:', r.html.length, '| ipucu:', urun);
  // JS'de arama ucu ara
  const ana = fs.readFileSync('data/explore/yeni/ana-mikron3d.html', 'utf8');
  const jsL = [...new Set([...ana.matchAll(/<script[^>]+src="([^"]{5,120}\.js[^"]*)"/gi)].map(m => m[1]))].filter(s => !/jquery|bootstrap|slick|lazysizes|google|cloudflare/i.test(s));
  console.log('scriptler:', jsL.slice(0, 8).join(' | ').slice(0, 300));
}

// 6) ciceksepeti render sayfasi analizi
console.log('\n=== ciceksepeti render analizi ===');
{
  try {
    const html = fs.readFileSync('data/explore/yeni/arama-ciceksepeti.html', 'utf8');
    console.log('boyut:', html.length);
    console.log('arama sonuc metni:', html.includes('arama sonuc') || html.includes('Arama Sonu'));
    console.log('fiyat gecis:', (html.match(/₺|\d+\s*TL/g) || []).length);
    const urunL = [...new Set([...html.matchAll(/href="(\/[a-z0-9-]{8,100}(?:-p\d+|\/[a-z0-9-]{5,80})?)"/gi)].map(m => m[1]))].slice(0, 6);
    console.log('link ornekleri:', urunL.join(' | ').slice(0, 300));
  } catch { console.log('dosya yok'); }
}
