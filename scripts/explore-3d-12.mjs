/** Kesif 12: &nbsp;TL ve urun linkleri — filamentdepom (kelime) + filamentmarketim derin analiz. */
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

function analiz(id, html) {
  console.log(`\n=== ${id} (${html.length} bayt) ===`);
  const tl = (html.match(/\d[\d.,]*(?:\s|&nbsp;|&#160;)*\s*(?:TL|₺)/gi) || []).length;
  console.log('fiyat (entity dahil):', tl);
  const nbsp = (html.match(/&nbsp;TL/g) || []).length;
  console.log('&nbsp;TL:', nbsp);
  // urun-benzeri anchorlar: uzun slug linkler, tekrar etmeyen
  const re = /<a[^>]+href="(\/[a-z0-9-]{12,100})"[^>]*>([^<]{0,80})</gi;
  let m; const adaylar = new Map();
  while ((m = re.exec(html))) {
    if (!/kategori|marka|sayfa|sepet|iletisim|kampanya|hakkimizda|gizlilik|kvkk|blog|siparis|sss|uyelik|odeme|kargo|iade/.test(m[1])) {
      adaylar.set(m[1], (adaylar.get(m[1]) || 0) + 1);
    }
  }
  const liste = [...adaylar.entries()].sort((a, b) => b[1] - a[1]);
  console.log('aday urun linkleri:', liste.length);
  for (const [l, c] of liste.slice(0, 6)) console.log('  x' + c, l.slice(0, 90));
  // JSON-LD
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    try {
      const d = JSON.parse(m[1]);
      for (const o of (Array.isArray(d) ? d : [d])) console.log('JSON-LD:', o['@type'], o['@type'] === 'ItemList' ? 'oge:' + (o.itemListElement || []).length : '');
    } catch { }
  }
  return liste;
}

// 1) filamentdepom kelime=filament
const fd = await cek('https://filamentdepom.com/arama?kelime=' + encodeURIComponent('filament'));
console.log('filamentdepom durum:', fd.durum);
if (fd.html) {
  fs.writeFileSync('data/explore/3d/arama-filamentdepom.html', fd.html);
  const liste = analiz('filamentdepom', fd.html);
  // ilk urun linkinin cevresini goster
  if (liste.length) {
    const i = fd.html.indexOf('"' + liste[0][0] + '"');
    console.log('ilk kart cevresi:');
    console.log(fd.html.slice(Math.max(0, i - 600), i + 800).replace(/\s+/g, ' ').slice(0, 1300));
  }
}

// 2) filamentmarketim kayitli sayfa
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
const fmListe = analiz('filamentmarketim', fm);
if (fmListe.length) {
  const i = fm.indexOf('"' + fmListe[0][0] + '"');
  console.log('\nilk kart cevresi:');
  console.log(fm.slice(Math.max(0, i - 600), i + 800).replace(/\s+/g, ' ').slice(0, 1300));
}

// 3) teknikfilament3d kayitli sayfa (ayni platform)
const tf = fs.readFileSync('data/explore/3d/arama-teknikfilament3d.html', 'utf8');
analiz('teknikfilament3d', tf);
