/** Kesif 7: T-Soft fiyatlari, samm gomulu JSON, matersan form, shop.3dortgen arama, olu domenler. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    const html = await res.text();
    clearTimeout(t);
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) }; }
}

// 1) direnc kartinda fiyat ara (urun-url linkinden sonraki 6000 karakter)
console.log('=== direnc fiyat ===');
const dr = fs.readFileSync('data/explore/3d/arama-direnc.html', 'utf8');
const drI = dr.indexOf('data-toggle="product-url"');
const drKart = dr.slice(drI, drI + 7000);
const fiyatlar = [...drKart.matchAll(/([\d][\d.,]{1,10})\s*(?:TL|₺)/g)].map(m => m[0]);
console.log('TL fiyatlari:', fiyatlar.slice(0, 6).join(' | '));
const priceClass = [...drKart.matchAll(/class="([^"]*price[^"]*)"/gi)].map(m => m[1]);
console.log('price siniflari:', [...new Set(priceClass)].slice(0, 8).join(' | '));

// 2) motorobit ayni sekilde
console.log('\n=== motorobit fiyat ===');
const mb = fs.readFileSync('data/explore/3d/arama-motorobit.html', 'utf8');
const mbI = mb.indexOf('data-toggle="product-url"');
const mbKart = mb.slice(mbI, mbI + 7000);
const mbF = [...mbKart.matchAll(/([\d][\d.,]{1,10})\s*(?:TL|₺)/g)].map(m => m[0]);
console.log('TL fiyatlari:', mbF.slice(0, 6).join(' | '));
const mbP = [...mbKart.matchAll(/class="([^"]*price[^"]*)"/gi)].map(m => m[1]);
console.log('price siniflari:', [...new Set(mbP)].slice(0, 8).join(' | '));

// 3) robolinkmarket + filamentsan: product-url var mi?
for (const id of ['robolinkmarket', 'filamentsan']) {
  const h = fs.readFileSync(`data/explore/3d/arama-${id}.html`, 'utf8');
  console.log(`\n=== ${id} ===`);
  const pu = [...h.matchAll(/<a[^>]+data-toggle="product-url"[^>]*>/gi)].length;
  console.log('product-url linkleri:', pu);
  const pt = [...h.matchAll(/class="[^"]*product-title[^"]*"/gi)].length;
  console.log('product-title:', pt);
  // urun listesi bobleginde ilk <a href="/slug"> (data-toggle="product" karti)
  const pi = h.indexOf('data-toggle="product"');
  if (pi > 0) {
    const kart = h.slice(pi, pi + 7000);
    const f = [...kart.matchAll(/([\d][\d.,]{1,10})\s*(?:TL|₺)/g)].map(m => m[0]);
    console.log('kart TL fiyatlari:', f.slice(0, 5).join(' | '));
    const link = kart.match(/href="(\/[a-z0-9-]{8,90})"/);
    console.log('kart urun linki:', link ? link[1] : '?');
    const baslik = kart.match(/title="([^"]{10,90})"/);
    console.log('kart title:', baslik ? baslik[1] : '?');
  }
}

// 4) samm: gomulu JSON verisi ara
console.log('\n=== samm gomulu veri ===');
const sm = fs.readFileSync('data/explore/3d/arama-samm.html', 'utf8');
console.log('__NEXT_DATA__:', sm.includes('__NEXT_DATA__'));
console.log('self.__next_f:', sm.includes('self.__next_f'));
// fiyat JSON desenleri
const jsonFiyat = [...sm.matchAll(/"(?:price|salePrice|listPrice|finalPrice)"\s*:\s*"?([\d.,]+)"?/g)].slice(0, 8);
console.log('JSON fiyat alanlari:', jsonFiyat.map(m => m[0]).join(' | ') || 'yok');
// urun adi JSON
const jsonAd = [...sm.matchAll(/"(?:name|title|productName)"\s*:\s*"([^"]{10,80})"/g)].slice(0, 5);
console.log('JSON adlar:', jsonAd.map(m => m[1]).join(' | ') || 'yok');
// script type=application/json
const sj = [...sm.matchAll(/<script[^>]*id="([^"]*)"[^>]*type="application\/json"/gi)].map(m => m[1]);
console.log('json script idleri:', sj.slice(0, 10).join(' | ') || 'yok');

// 5) matersan: arama formunun tum alanlari
console.log('\n=== matersan form alanlari ===');
const ms2 = fs.readFileSync('data/explore/3d/arama-matersan.html', 'utf8');
const formI = ms2.indexOf('action="/arama"');
const form = ms2.slice(formI, formI + 3500);
console.log(form.replace(/\s+/g, ' ').slice(0, 2200));

// 6) shop.3dortgen arama sayfasi
console.log('\n=== shop.3dortgen arama ===');
const r = await cek('https://shop.3dortgen.com/arama?q=' + encodeURIComponent('pla filament'));
console.log('durum:', r.durum, 'boyut:', r.html.length, r.hata || '');
if (r.html) {
  fs.writeFileSync('data/explore/3d/arama-shop3dortgen.html', r.html);
  const pu = [...r.html.matchAll(/<a[^>]+data-toggle="product-url"[^>]*>/gi)].length;
  const pt = [...r.html.matchAll(/class="[^"]*product-title[^"]*"/gi)].length;
  console.log('product-url:', pu, '| product-title:', pt);
  const t = r.html.match(/<title>([^<]{5,120})</i);
  console.log('title:', t ? t[1].trim() : '?');
}

// 7) olu domenler ScraperAPI ile kesin kontrol (anahtar yazdirilmaz)
console.log('\n=== roit3d + sanaltedarik ScraperAPI kontrolu ===');
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
if (!key) { console.log('anahtar yok, atlandi'); }
else {
  for (const domain of ['https://roit3d.com/', 'https://sanaltedarik.com/']) {
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(40000) });
      const text = await res.text();
      console.log(domain, '->', res.status, '| boyut:', text.length, '| baslik:', (text.match(/<title>([^<]{3,60})</i)?.[1] || 'yok').trim());
    } catch (e) { console.log(domain, '-> HATA:', String(e.message || e).slice(0, 60)); }
  }
}
