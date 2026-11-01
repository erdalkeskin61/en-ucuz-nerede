/** Kesif 10: IdeaSoft /tumu-c-0 denemesi, filamentdepom /Arama, robotistan offers, samm kart parse testi. */
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

// 1) IdeaSoft /tumu-c-0?k= denemesi
console.log('=== IdeaSoft /tumu-c-0?k= ===');
for (const [id, base] of [['filamentmarketim', 'https://www.filamentmarketim.com'], ['teknikfilament3d', 'https://www.teknikfilament3d.com'], ['matersan', 'https://matersan.com.tr']]) {
  const r = await cek(`${base}/tumu-c-0?k=` + encodeURIComponent('pla filament'));
  const kart = r.html ? (r.html.match(/add-to-cart|addToCart|data-product-id|productDetail|urun-list/gi) || []).length : 0;
  const tl = r.html ? (r.html.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length : 0;
  console.log(`${id}: durum=${r.durum} boyut=${r.html.length} kart-ipucu=${kart} fiyat-adet=${tl}`);
  if (kart > 2 || tl > 3) {
    fs.writeFileSync(`data/explore/3d/arama-${id}-tumu.html`, r.html);
    // ornek urun linki + kart
    const kl = r.html.match(/<a[^>]+href="(\/[a-z0-9-]{10,90})"[^>]*class="[^"]*(?:urun|product)[^"]*"[^>]*>/i);
    console.log('  ornek kart linki:', kl ? kl[1] : '?');
  }
}

// 2) filamentdepom /Arama denemeleri + urun link deseni
console.log('\n=== filamentdepom ===');
const fd = fs.readFileSync('data/explore/3d/ana-filamentdepom.html', 'utf8');
// ana sayfadaki urun-benzeri linkler
const fdLinks = [...new Set([...fd.matchAll(/href="([^"]{8,120})"/gi)].map(m => m[1]))].filter(h => !/\.(css|js|png|jpe?g|svg|webp|ico)/i.test(h) && !/facebook|instagram|twitter|javascript|mailto|tel/i.test(h));
console.log('link ornekleri:');
for (const l of fdLinks.slice(0, 18)) console.log('  ', l.slice(0, 100));
for (const [ad, u] of [
  ['Arama?q=', 'https://filamentdepom.com/Arama?q=' + encodeURIComponent('pla filament')],
  ['Arama?txtbxArama=', 'https://filamentdepom.com/Arama?txtbxArama=' + encodeURIComponent('pla filament')],
]) {
  const r = await cek(u, 25000);
  const tl = r.html ? (r.html.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length : 0;
  console.log(`${ad} -> durum: ${r.durum} boyut: ${r.html.length} fiyat-adet: ${tl}`);
  if (tl > 5) {
    fs.writeFileSync('data/explore/3d/arama-filamentdepom.html', r.html);
    const t = r.html.match(/<title>([^<]{5,90})</i);
    console.log('  title:', t ? t[1].trim() : '?');
  }
}

// 3) robotistan JSON-LD offers kismi
console.log('\n=== robotistan Product offers ===');
const rb = fs.readFileSync('data/explore/3d/urun-robotistan.html', 'utf8');
const pI = rb.indexOf('"@type":"Product"');
const offersI = rb.indexOf('"offers"', pI);
if (offersI > 0) console.log(rb.slice(offersI, offersI + 600).replace(/\s+/g, ' '));
// diger alanlar: sku, brand
for (const alan of ['"sku"', '"gtin"', '"mpn"', '"brand"', '"color"']) {
  const i = rb.indexOf(alan, pI);
  if (i > 0) console.log(alan, ':', rb.slice(i, i + 120).replace(/\s+/g, ' '));
}

// 4) samm kart parse testi
console.log('\n=== samm kart parse testi ===');
const sm = fs.readFileSync('data/explore/3d/arama-samm.html', 'utf8');
const kartRe = /<a[^>]+href="(\/[a-z0-9-]{10,120})"[^>]*>([\s\S]{50,2500}?)<\/a>/g;
let m; const kartlar = [];
while ((m = kartRe.exec(sm))) {
  const ic = m[2];
  const fiyatM = ic.match(/([\d][\d.,]{1,10})\s*₺/);
  if (!fiyatM) continue;
  // baslik: fiyat div'inden onceki metin (div'leri temizle)
  const baslikOnce = ic.slice(0, ic.indexOf(fiyatM[0])).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (baslikOnce.length > 8) kartlar.push({ url: m[1], baslik: baslikOnce.slice(-90), fiyat: fiyatM[1] });
}
console.log('parse edilen kart:', kartlar.length);
for (const k of kartlar.slice(0, 5)) console.log('  ', k.fiyat, 'TL |', k.baslik.slice(0, 60), '->', k.url.slice(0, 70));
