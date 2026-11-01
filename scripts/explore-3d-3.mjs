/** Kesif 3: domirobot dogru parametre, matersan derin analiz, kesfedilemeyen 6 site. */
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
  } catch (e) {
    clearTimeout(t);
    return { durum: 0, html: '', hata: String(e.message || e).slice(0, 60) };
  }
}

// 1) domirobot /arama?q=
console.log('=== domirobot /arama?q= ===');
let r = await cek('https://www.domirobot.com/arama?q=pla%20filament');
console.log('durum:', r.durum, '| boyut:', r.html.length);
if (r.html) {
  fs.writeFileSync('data/explore/3d/arama-domirobot.html', r.html);
  const links = [...r.html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*product-title[^"]*"/gi)].map(m => m[1]);
  console.log('product-title linkleri:', links.length);
  for (const l of links.slice(0, 3)) console.log('  ', l.slice(0, 100));
  if (!links.length) {
    const alt = [...r.html.matchAll(/href="(\/[a-z0-9-]{10,80})"/gi)].map(m => m[1]).filter(h => /filament|pla/i.test(h) && !/pmk\d/.test(h));
    console.log('alternatif urun linkleri:', [...new Set(alt)].slice(0, 5));
  }
}

// 2) matersan urun kartlari (kayitli sayfada)
console.log('\n=== matersan derin analiz ===');
const ms = fs.readFileSync('data/explore/3d/arama-matersan.html', 'utf8');
const msLinks = [...ms.matchAll(/<a[^>]+href="([^"]+)"[^>]*>/gi)].map(m => m[1]).filter(h => !/kategori|sepet|uyelik|iletisim|javascript/i.test(h) && h.length > 15);
const msBenzer = [...new Set(msLinks)].filter(h => /filament|pla|petg|esun|elegoo/i.test(h));
console.log('urun benzeri (ilk 8):');
for (const l of msBenzer.slice(0, 8)) console.log('  ', l.slice(0, 110));

// 3) Kesfedilemeyen siteler
const kesif = [
  { id: '3dortgen', url: 'https://3dortgen.com/' },
  { id: 'filamentdepom', url: 'https://filamentdepom.com/' },
  { id: 'filamentmarketim', url: 'https://filamentmarketim.com/' },
  { id: 'teknikfilament3d', url: 'https://teknikfilament3d.com/' },
  { id: '3bfab', url: 'https://3bfab.com/' },
  { id: 'samm', url: 'https://market.samm.com/' },
];
for (const s of kesif) {
  console.log(`\n=== ${s.id} ===`);
  const h = await cek(s.url);
  console.log('durum:', h.durum, '| boyut:', h.html.length, h.hata || '');
  if (!h.html) continue;
  fs.writeFileSync(`data/explore/3d/ana-${s.id}.html`, h.html);
  // tum arama formu adaylari
  const formlar = [...h.html.matchAll(/<form[^>]*>/gi)].map(m => m[0]).slice(0, 8);
  for (const f of formlar) console.log('  form:', f.replace(/\s+/g, ' ').slice(0, 150));
  // arama kelimesi gecen hrefler
  const aramaHref = [...new Set([...h.html.matchAll(/href="([^"]*(?:search|arama|ara\?)[^"]*)"/gi)].map(m => m[1]))].slice(0, 5);
  for (const a of aramaHref) console.log('  arama linki:', a.slice(0, 110));
  // input name'ler
  const inputs = [...new Set([...h.html.matchAll(/<input[^>]*name="([^"]+)"/gi)].map(m => m[1]))].slice(0, 10);
  console.log('  inputlar:', inputs.join(', '));
}
