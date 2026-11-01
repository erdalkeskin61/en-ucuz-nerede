/** Kesif 5: kalan sitelerin kart yapilari + matersan AJAX + 3dortgen tum linkler + 3bfab TR sayfasi. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    const html = await res.text();
    clearTimeout(t);
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) }; }
}

// 1) Kart yapilari: urun linkinin cevresini goster
function kartCevresi(id, linkFiltre) {
  const html = fs.readFileSync(`data/explore/3d/arama-${id}.html`, 'utf8');
  console.log(`\n=== ${id} ===`);
  const re = /href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    if (linkFiltre.test(m[1]) && !/kategori|category|\.((png|jpe?g|svg|webp|css|js))/i.test(m[1])) {
      const i = m.index;
      console.log(html.slice(Math.max(0, i - 900), i + 700).replace(/\s+/g, ' ').slice(0, 1500));
      return;
    }
  }
  console.log('  uygun link bulunamadi');
}

// robolinkmarket/direnc/motorobit/filamentsan: slug urun linkleri
kartCevresi('robolinkmarket', /\/[a-z0-9-]*filament[a-z0-9-]*$/i);
kartCevresi('direnc', /\/[a-z0-9-]*filament[a-z0-9-]*$/i);
kartCevresi('motorobit', /\/[a-z0-9-]*filament[a-z0-9-]*$/i);
kartCevresi('filamentsan', /\/[a-z0-9-]*filament[a-z0-9-]*$/i);
kartCevresi('filamentmarketim', /\/bambu-lab-basic-pla-filament/i);
kartCevresi('teknikfilament3d', /\/[a-z0-9-]*filament[a-z0-9-]*$/i);
kartCevresi('samm', /\/fibromast-pla-seffaf-kirmizi/i);

// 2) matersan: AJAX arama ucu ara
console.log('\n\n=== matersan AJAX/urun isaretleri ===');
const ms = fs.readFileSync('data/explore/3d/arama-matersan.html', 'utf8');
for (const kw of ['ajax', 'autocomplete', 'live-search', 'search?get', 'srv/service', 'product/load', 'getProducts', 'endpoint']) {
  const i = ms.toLowerCase().indexOf(kw.toLowerCase());
  if (i >= 0) console.log(`"${kw}" @${i}:`, ms.slice(i - 100, i + 200).replace(/\s+/g, ' ').slice(0, 280));
}
const msUrun = ms.match(/class="[^"]*product[^"]*"/gi);
console.log('product siniflari:', msUrun ? [...new Set(msUrun)].slice(0, 10).join(' | ') : 'yok');

// 3) 3dortgen: TUM hrefler
console.log('\n=== 3dortgen tum hrefler ===');
const dg = fs.readFileSync('data/explore/3d/ana-3dortgen.html', 'utf8');
const tumHref = [...new Set([...dg.matchAll(/href="([^"]+)"/gi)].map(x => x[1]))].filter(h => !/\.(css|js|png|jpe?g|svg|webp|ico|woff2?)/i.test(h));
console.log(tumHref.slice(0, 40).join('\n'));

// 4) 3bfab TR sayfasi
console.log('\n=== 3bfab index-tr.html ===');
const r = await cek('https://3bfab.com/index-tr.html');
console.log('durum:', r.durum, 'boyut:', r.html.length);
const bfLinks = [...new Set([...r.html.matchAll(/href="([^"]{4,140})"/gi)].map(x => x[1]))].filter(h => !/\.(css|js|png|jpe?g|svg|webp|ico|woff2?)/i.test(h) && !h.startsWith('#') && h !== 'index.html');
console.log(bfLinks.slice(0, 25).join('\n'));
