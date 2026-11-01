/** Yeni parti keşif 14: dogru urun linkleriyle urun sayfasi dogrulamalari. */
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

function productJsonLdOzet(text, etiket) {
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; let bulundu = false;
  while ((m = ldRe.exec(text))) {
    try {
      const d = JSON.parse(m[1]);
      for (const o of (d['@graph'] || (Array.isArray(d) ? d : [d]))) {
        if (o?.['@type'] === 'Product') {
          bulundu = true;
          const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
          console.log(`  [${etiket}] JSON-LD Product:`, JSON.stringify({ name: o.name, sku: o.sku, gtin: o.gtin13 || o.gtin, brand: o.brand?.name, price: offers?.price }).slice(0, 250));
        }
      }
    } catch { }
  }
  if (!bulundu) console.log(`  [${etiket}] JSON-LD Product YOK`);
}

// 1) dogru urun linkleri cek
function linkCikar(dosya, re) {
  try {
    const html = fs.readFileSync(`data/explore/yeni/${dosya}`, 'utf8');
    const m = html.match(re);
    return m ? m[1] : null;
  } catch { return null; }
}

const urunLinkleri = {
  // T-Soft product-title kartlari
  nmosphere: linkCikar('arama-nmosphere.html', /<a[^>]+id="product-title-\d+"[^>]+href="([^"]+)"/),
  hepsivar: linkCikar('arama-hepsivar.html', /<a[^>]+id="product-title-\d+"[^>]+href="([^"]+)"/),
  // T-Soft ItemList
  robo90: linkCikar('arama-robo90.html', /"url"\s*:\s*"(https:\/\/robo90\.com\/[^"]+)"/),
  // Ikas: ₺ iceren anchor
  robocombo: linkCikar('arama-robocombo.html', /<a[^>]+href="(\/[a-z0-9-]{10,100})"[^>]*>(?:(?!<\/a>)[\s\S])*?₺/),
  fixx3d: linkCikar('arama-fixx3d.html', /<a[^>]+href="(\/[a-z0-9-]{10,100})"[^>]*>(?:(?!<\/a>)[\s\S])*?₺/),
  // Ticimax productName
  '3dultra': linkCikar('arama-3dultra.html', /<div class="productName detailUrl"[^>]*>\s*<a[^>]*href='([^']+)'/),
  robotizmo: linkCikar('arama-robotizmo.html', /<div class="productName detailUrl"[^>]*>\s*<a[^>]*href='([^']+)'/),
  // IdeaSoft klasik showcase
  kurumsalit: linkCikar('arama-kurumsalit.html', /<div class="showcase-title">\s*<a[^>]+href="(\/urun\/[^"]+)"/),
  // rhino c-p-i-link
  rhino3dprinter: 'https://www.rhino3dprinter.com/filamer-hyper-pla-neon-fusya',
  // deneystore: pmu urun
  deneystore: linkCikar('arama-deneystore.html', /<a[^>]*href="([^"]*-pmu\d+)"/),
  // koctas / p/{id}
  koctas: 'https://www.koctas.com.tr/anycubic-pla-filament-gri-175mm-1kg/p/5003215696',
};

const tabanlar = {
  nmosphere: 'https://nmosphere.com.tr', hepsivar: 'https://www.hepsivar.com',
  robo90: '', robocombo: 'https://www.robocombo.com', fixx3d: 'https://fixx3d.com',
  '3dultra': '', robotizmo: '', kurumsalit: 'https://kurumsalit.com',
  rhino3dprinter: '', deneystore: '', koctas: '',
};

for (const [id, link] of Object.entries(urunLinkleri)) {
  console.log(`\n=== ${id} ===`);
  if (!link) { console.log('  urun linki cikarilamadi'); continue; }
  const url = link.startsWith('http') ? link : (tabanlar[id] || '') + link;
  console.log('  url:', url.slice(0, 100));
  const r = await cek(url);
  console.log('  durum:', r.durum, '| boyut:', r.text.length);
  if (r.durum === 200 && r.text.length > 10000) {
    fs.writeFileSync(`data/explore/yeni/urun-${id}.html`, r.text);
    productJsonLdOzet(r.text, id);
    // ozel cikarimlar
    if (id === 'kurumsalit' || id === 'mintengo') {
      const fi = r.text.match(/<div class="product-price-new">\s*(?:<span>)?\s*₺?\s*([\d.,]+)/);
      console.log('  product-price-new:', fi ? fi[1] : 'yok');
    }
    if (id === '3dultra' || id === 'robotizmo') {
      const pj = r.text.match(/"productPriceKDVIncluded"\s*:\s*([\d.]+)/);
      console.log('  productPriceKDVIncluded:', pj ? pj[1] : 'yok');
    }
    if (id === 'robocombo' || id === 'fixx3d') {
      const fi = r.text.match(/([\d.,]+)\s*₺/);
      console.log('  ilk ₺:', fi ? fi[1] : 'yok');
    }
    if (id === 'koctas') {
      const fi = r.text.match(/([\d.,]+)\s*TL/);
      console.log('  ilk TL:', fi ? fi[1] : 'yok');
    }
  }
}

// 2) teknosa urun sayfasi analizi (kayitli render)
console.log('\n=== teknosa urun sayfasi analizi ===');
{
  const html = fs.readFileSync('data/explore/yeni/urun-teknosa.html', 'utf8');
  for (const w of ['data-product-price', 'productDetail', 'price', 'urun-fiyat', 'addToCart']) {
    const c = html.split(w).length - 1;
    if (c > 0) console.log(`  "${w}": ${c}`);
  }
  const fi = html.search(/data-product-price|class="[^"]*price[^"]*"/i);
  if (fi > 0) console.log('  fiyat bolgesi:', html.slice(Math.max(0, fi - 250), fi + 400).replace(/\s+/g, ' ').slice(0, 600));
  const h1 = html.match(/<h1[^>]*>([\s\S]{5,120}?)<\/h1>/);
  console.log('  h1:', h1 ? h1[1].replace(/<[^>]*>/g, '').trim().slice(0, 80) : '?');
}

// 3) trendruum kartindan urun linki (ham dump)
console.log('\n=== trendruum kart baslangici ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-trendruum.html', 'utf8');
  const i = html.indexOf('tr-kk-fiyat-satiri');
  const blok = html.slice(Math.max(0, i - 6000), i);
  const aI = blok.lastIndexOf('<a ');
  console.log(blok.slice(aI, aI + 700).replace(/\s+/g, ' ').slice(0, 700));
}
