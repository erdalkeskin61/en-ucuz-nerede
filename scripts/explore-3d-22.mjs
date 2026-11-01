/** Kesif 22 (son): matersan kart, urun sayfasi JSON-LD dogrulamalari. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    const html = await res.text();
    clearTimeout(t);
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) }; }
}

function productJsonLd(html, etiket) {
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; let bulundu = false;
  while ((m = ldRe.exec(html))) {
    try {
      const d = JSON.parse(m[1]);
      const dugumler = d['@graph'] || (Array.isArray(d) ? d : [d]);
      for (const o of dugumler) {
        if (o?.['@type'] === 'Product') {
          bulundu = true;
          console.log(`[${etiket}] Product:`, JSON.stringify({ name: o.name, sku: o.sku, gtin: o.gtin13 || o.gtin, mpn: o.mpn, brand: o.brand?.name, price: o.offers?.price, currency: o.offers?.priceCurrency, availability: o.offers?.availability?.slice(-8) }).slice(0, 400));
        }
      }
    } catch { }
  }
  if (!bulundu) console.log(`[${etiket}] Product JSON-LD YOK`);
}

// 1) matersan kart yapisi (tumu sayfasindan)
console.log('=== matersan kart ===');
const mt = fs.readFileSync('data/explore/3d/arama-matersan-tumu.html', 'utf8');
const mtI = mt.search(/data-product-id|class="[^"]*product[^"]*"/i);
console.log('ilk isaret @', mtI);
console.log(mt.slice(Math.max(0, mtI - 300), mtI + 1600).replace(/\s+/g, ' ').slice(0, 1800));

// 2) matersan urun linki bul + urun sayfasi
const mtLink = mt.match(/href="([^"]*(?:\/urun\/|-p-|urun\.)[^"]{5,80})"/i) || mt.match(/<a[^>]+href="(\/[a-z0-9-]{15,90})"[^>]*title="([^"]{10,80})"/i);
console.log('\nmatersan urun linki:', mtLink ? (mtLink[1] || mtLink[0].slice(0, 100)) : '?');
if (mtLink) {
  const url = mtLink[1].startsWith('http') ? mtLink[1] : 'https://matersan.com.tr' + mtLink[1];
  const r = await cek(url);
  console.log('urun sayfasi:', r.durum, r.html.length);
  if (r.html) productJsonLd(r.html, 'matersan-urun');
}

// 3) filamentdepom urun sayfasi
console.log('\n=== filamentdepom urun ===');
const fdp = await cek('https://filamentdepom.com/polylite-cospla-filament-1.75mm-1kg-cosplay-pla');
console.log('durum:', fdp.durum, fdp.html.length);
if (fdp.html) {
  fs.writeFileSync('data/explore/3d/urun-filamentdepom.html', fdp.html);
  productJsonLd(fdp.html, 'filamentdepom');
}

// 4) samm urun sayfasi
console.log('\n=== samm urun ===');
const sm = await cek('https://market.samm.com/fibromast-pla-seffaf-kirmizi-filament-175mm-1kg');
console.log('durum:', sm.durum, sm.html.length);
if (sm.html) productJsonLd(sm.html, 'samm');

// 5) 3dteknomarket urun sayfasi
console.log('\n=== 3dteknomarket urun ===');
const tk = await cek('https://3dteknomarket.com/products/beta-pla-filament-white');
console.log('durum:', tk.durum, tk.html.length);
if (tk.html) productJsonLd(tk.html, '3dteknomarket');

// 6) domirobot offers (kayitli)
console.log('\n=== domirobot offers ===');
const dm = fs.readFileSync('data/explore/3d/urun-domirobot.html', 'utf8');
productJsonLd(dm, 'domirobot');

// 7) direnc @graph Product (kayitli)
console.log('\n=== direnc Product ===');
const dr = fs.readFileSync('data/explore/3d/urun-direnc.html', 'utf8');
productJsonLd(dr, 'direnc');
