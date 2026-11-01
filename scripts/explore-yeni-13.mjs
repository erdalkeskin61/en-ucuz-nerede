/** Yeni parti keşif 13: urun sayfasi yapilari (rhino, trendruum, koctas, sivasrobotik) + CF urun testleri. */
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

function productJsonLd(text, etiket) {
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; let bulundu = false;
  while ((m = ldRe.exec(text))) {
    try {
      const d = JSON.parse(m[1]);
      for (const o of (d['@graph'] || (Array.isArray(d) ? d : [d]))) {
        if (o?.['@type'] === 'Product') {
          bulundu = true;
          const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
          console.log(`[${etiket}] Product:`, JSON.stringify({ name: o.name, sku: o.sku, gtin: o.gtin13 || o.gtin, brand: o.brand?.name, price: offers?.price, currency: offers?.priceCurrency }).slice(0, 300));
        }
      }
    } catch { }
  }
  if (!bulundu) console.log(`[${etiket}] Product JSON-LD YOK`);
}

// 1) trendruum: urun linkini karttan cek
console.log('=== trendruum urun linki ===');
let trendruumUrl = null;
{
  const html = fs.readFileSync('data/explore/yeni/arama-trendruum.html', 'utf8');
  const m = html.match(/<a[^>]+href="(\/[^"]{5,120}|https:\/\/www\.trendruum\.com\/[^"]{5,120})"[^>]*>\s*(?:<[^>]+>\s*)*<h3>/);
  // daha genel: h3 iceren anchor
  const re = /<a[^>]+href="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<h3>([^<]{5,90})<\/h3>/g;
  let mm; const kartlar = [];
  while ((mm = re.exec(html)) && kartlar.length < 3) kartlar.push({ href: mm[1], title: mm[2] });
  for (const k of kartlar) console.log('  kart:', k.title.slice(0, 50), '->', k.href.slice(0, 100));
  if (kartlar[0]) trendruumUrl = kartlar[0].href.startsWith('http') ? kartlar[0].href : 'https://www.trendruum.com' + kartlar[0].href;
}

// 2) urun sayfalari
const urunler = [
  ['rhino3dprinter', 'https://www.rhino3dprinter.com/filamer-hyper-pla-neon-fusya'],
  ['sivasrobotik', 'https://sivasrobotik.com.tr/3d/929-creality-hyper-pla-mavi.html'],
  ['koctas', 'https://www.koctas.com.tr/anycubic-pla-filament-gri-175mm-1kg/p/5003215696'],
  ['trendruum', trendruumUrl],
  ['deneystore', null], // deneystore urun linkini arama sayfasindan bul
  ['nmosphere', null],
  ['robo90', null],
  ['hepsivar', null],
  ['robocombo', null],
  ['fixx3d', null],
  ['mintengo', null],
  ['3dultra', null],
];
// arama sayfasindan ilk urun linki cek (siteler icin)
function ilkUunLinki(id, base, filter) {
  try {
    const html = fs.readFileSync(`data/explore/yeni/arama-${id}.html`, 'utf8');
    const re = /<a[^>]+href="(https?:\/\/[^"]+|\/[a-z0-9][^"]{5,140})"/g;
    let m;
    while ((m = re.exec(html))) {
      let h = m[1];
      if (h.startsWith('/')) h = base + h;
      if (!h.includes(base.replace('https://', '').replace('http://', ''))) continue;
      if (/\.(css|js|png|jpe?g|svg|webp|ico)/i.test(h)) continue;
      if (/arama|search|sepet|kategori|sayfa|javascript|#/.test(h)) continue;
      if (filter && !filter.test(h)) continue;
      return h;
    }
  } catch { }
  return null;
}

const taban = {
  deneystore: ['https://www.deneystore.com', /-pmu\d+/],
  nmosphere: ['https://nmosphere.com.tr', /\/[a-z0-9-]{12,100}$/],
  robo90: ['https://robo90.com', /\/[a-z0-9-]{12,100}$/],
  hepsivar: ['https://www.hepsivar.com', /\/[a-z0-9-]{12,100}$/],
  robocombo: ['https://www.robocombo.com', /\/[a-z0-9-]{12,100}$/],
  fixx3d: ['https://fixx3d.com', /\/[a-z0-9-]{12,100}$/],
  mintengo: ['https://mintengo.com', /\/urun\//],
  '3dultra': ['https://www.3dultra.com.tr', /\/[a-z0-9-]{12,100}$/],
};

for (const [id, url] of urunler) {
  let u = url;
  if (!u && taban[id]) u = ilkUunLinki(id, taban[id][0], taban[id][1]);
  if (!u) { console.log(`\n[${id}] urun linki bulunamadi`); continue; }
  console.log(`\n=== ${id}: ${u.slice(0, 90)} ===`);
  const r = await cek(u);
  console.log('durum:', r.durum, '| boyut:', r.text.length);
  if (r.durum === 200 && r.text.length > 5000) {
    fs.writeFileSync(`data/explore/yeni/urun-${id}.html`, r.text);
    productJsonLd(r.text, id);
    // JSON-LD yoksa fiyat/baslik ipuclari
    if (!r.text.includes('application/ld+json') || true) {
      const fi = r.text.search(/\d[\d.,]*\s*(?:TL|₺)/);
      if (fi > 0) console.log('  fiyat baglami:', r.text.slice(Math.max(0, fi - 200), fi + 30).replace(/\s+/g, ' ').slice(-200));
    }
  }
}

// 3) CF urun sayfalari: teknosa + pttavm (render, 10+10 kredi)
console.log('\n=== CF urun sayfalari ===');
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
if (key) {
  for (const [ad, url] of [
    ['teknosa', 'https://www.teknosa.com/creality-hyper-pla-filament-gri-175-mm-1-kg-p-788922231'],
    ['pttavm', 'https://www.pttavm.com/creality-ender-pla-filament-beyaz-1-75mm-1kg-p-1344137814'],
  ]) {
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(90000) });
      const text = await res.text();
      console.log(`${ad}: durum=${res.status} boyut=${text.length}`);
      if (res.status === 200 && text.length > 50000) {
        fs.writeFileSync(`data/explore/yeni/urun-${ad}.html`, text);
        productJsonLd(text, ad);
      }
    } catch (e) { console.log(ad, 'HATA:', String(e.message || e).slice(0, 50)); }
  }
}
