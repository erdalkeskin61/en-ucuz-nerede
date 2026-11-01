/** Yeni parti keşif 15 (son dogrulama): teknosa fiyat, koctas ScraperAPI, kalan urun sayfalari. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
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

// 1) teknosa: data-product-price baglamlari
console.log('=== teknosa data-product-price ===');
{
  const html = fs.readFileSync('data/explore/yeni/urun-teknosa.html', 'utf8');
  let i = -1; let n = 0;
  while ((i = html.indexOf('data-product-price', i + 1)) >= 0 && n < 3) {
    console.log('  @' + i + ':', html.slice(Math.max(0, i - 150), i + 200).replace(/\s+/g, ' ').slice(0, 330));
    n++;
  }
  // urun adi
  const nm = html.match(/data-product-name="([^"]{5,100})"/);
  console.log('  urun adi (data-product-name):', nm ? nm[1] : '?');
}

// 2) koctas: ScraperAPI normal istek (1 kredi)
console.log('\n=== koctas ScraperAPI ===');
{
  const env = fs.readFileSync('.env', 'utf8');
  const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
  if (key) {
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent('https://www.koctas.com.tr/anycubic-pla-filament-gri-175mm-1kg/p/5003215696')}`, { signal: AbortSignal.timeout(60000) });
      const text = await res.text();
      console.log('durum:', res.status, '| boyut:', text.length);
      const fi = text.match(/([\d.,]+)\s*TL/);
      console.log('ilk TL:', fi ? fi[1] : '?');
      if (res.status === 200 && text.length > 50000) fs.writeFileSync('data/explore/yeni/urun-koctas.html', text);
    } catch (e) { console.log('HATA:', String(e.message || e).slice(0, 50)); }
  }
}

// 3) kalan urun sayfalari: robo90 (ItemList), robocombo/fixx3d (Ikas), 3dultra/robotizmo (Ticimax)
console.log('\n=== kalan urun sayfalari ===');
function hamEslesme(dosya, re) {
  const html = fs.readFileSync(`data/explore/yeni/${dosya}`, 'utf8');
  const m = html.match(re);
  return m ? m[1] : null;
}
const denemeler = [
  ['robo90', 'https://robo90.com' + (hamEslesme('arama-robo90.html', /"url":\s*"(\/[^"]+)"/) || ''), null],
  ['robocombo', 'https://www.robocombo.com' + (hamEslesme('arama-robocombo.html', /<a[^>]+href="(\/[a-z0-9-]{10,100})"/) || ''), /prd-title|product/],
  ['fixx3d', 'https://fixx3d.com' + (hamEslesme('arama-fixx3d.html', /<a[^>]+href="(\/[a-z0-9-]{10,100})"/) || ''), null],
  ['3dultra', 'https://www.3dultra.com.tr' + (hamEslesme('arama-3dultra.html', /href='(\/[a-z0-9-]{8,100})'/) || ''), null],
  ['robotizmo', 'https://robotizmo.net' + (hamEslesme('arama-robotizmo.html', /href='(\/[a-z0-9-]{8,100})'/) || ''), null],
];
for (const [id, url] of denemeler) {
  console.log(`\n--- ${id}: ${url.slice(0, 95)}`);
  if (!url || url.endsWith('.com') || url.endsWith('.tr') || url.endsWith('.net')) { console.log('  link cikarilamadi'); continue; }
  const r = await cek(url);
  console.log('  durum:', r.durum, '| boyut:', r.text.length);
  if (r.durum === 200 && r.text.length > 20000) {
    fs.writeFileSync(`data/explore/yeni/urun-${id}.html`, r.text);
    // JSON-LD
    const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m; let varmi = false;
    while ((m = ldRe.exec(r.text))) {
      try {
        const d = JSON.parse(m[1]);
        for (const o of (d['@graph'] || (Array.isArray(d) ? d : [d]))) {
          if (o?.['@type'] === 'Product') {
            varmi = true;
            const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
            console.log('  JSON-LD Product:', JSON.stringify({ name: o.name, sku: o.sku, brand: o.brand?.name, price: offers?.price }).slice(0, 200));
          }
        }
      } catch { }
    }
    if (!varmi) {
      // platform ozel
      if (id === '3dultra' || id === 'robotizmo') {
        const pj = r.text.match(/"productPriceKDVIncluded"\s*:\s*([\d.]+)/);
        console.log('  productPriceKDVIncluded:', pj ? pj[1] : 'YOK');
      }
      if (id === 'robocombo' || id === 'fixx3d') {
        console.log('  (Ikas urun sayfasi — JSON-LD yok, DOM gerekli)');
      }
    }
  }
}
