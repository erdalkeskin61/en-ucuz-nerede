/** Kesif 4: T-Soft kart dogrulama, yeni desenlerin arama sayfalari, matersan/3dortgen/3bfab inceleme. */
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

// 1) T-Soft sitelerinde product-title karti dogrula
console.log('=== 1) T-Soft product-title dogrulama ===');
for (const id of ['robotistan', 'robolinkmarket', 'direnc', 'motorobit', 'filamentsan']) {
  const html = fs.readFileSync(`data/explore/3d/arama-${id}.html`, 'utf8');
  const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
  console.log(`  ${id}: product-title x${links.length}`);
  if (links[0]) console.log('    ornek:', links[0][2].replace(/\s+/g, ' ').trim().slice(0, 70), '->', links[0][1].slice(0, 80));
}

// domirobot kart yapisi (urun linki cevresi)
console.log('\n=== 2) domirobot urun karti ===');
const dr = fs.readFileSync('data/explore/3d/arama-domirobot.html', 'utf8');
const i = dr.indexOf('pmu7877');
if (i > 0) console.log(dr.slice(Math.max(0, i - 1500), i + 300).replace(/\s+/g, ' ').slice(0, 1700));

// 3) Yeni desenler: filamentmarketim, teknikfilament3d, samm
console.log('\n=== 3) Yeni arama sayfalari ===');
const yeni = [
  { id: 'filamentmarketim', url: 'https://www.filamentmarketim.com/arama?k=' + encodeURIComponent('pla filament') },
  { id: 'teknikfilament3d', url: 'https://www.teknikfilament3d.com/arama?k=' + encodeURIComponent('pla filament') },
  { id: 'samm', url: 'https://market.samm.com/search?s=' + encodeURIComponent('filament') },
];
for (const s of yeni) {
  const r = await cek(s.url);
  console.log(`\n  --- ${s.id} durum=${r.durum} boyut=${r.html.length} ${r.hata || ''} ---`);
  if (!r.html) continue;
  fs.writeFileSync(`data/explore/3d/arama-${s.id}.html`, r.html);
  const t = r.html.match(/<title>([^<]{5,120})</i);
  console.log('  title:', t ? t[1].trim().slice(0, 90) : '?');
  // JSON-LD
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; const ldT = [];
  while ((m = ldRe.exec(r.html))) { try { const d = JSON.parse(m[1]); ldT.push(...(Array.isArray(d) ? d.map(x => x['@type']) : [d['@type']])); } catch { } }
  console.log('  JSON-LD:', ldT.length ? [...new Set(ldT)].join(',') : 'yok');
  // urun linkleri
  const fl = [...new Set([...r.html.matchAll(/href="([^"]{15,180})"/gi)].map(x => x[1]).filter(h => /filament|pla|petg/i.test(h) && !/\.(css|js|png|jpe?g|svg|webp)/i.test(h)))].slice(0, 5);
  for (const l of fl) console.log('  link:', l.slice(0, 110));
}

// 4) matersan: fiyatin cevresine bak
console.log('\n=== 4) matersan fiyat cevresi ===');
const ms = fs.readFileSync('data/explore/3d/arama-matersan.html', 'utf8');
const fi = ms.indexOf('₺');
if (fi > 0) console.log(ms.slice(Math.max(0, fi - 1200), fi + 200).replace(/\s+/g, ' ').slice(0, 1400));

// 5) 3dortgen: ana sayfadaki dahili linkler
console.log('\n=== 5) 3dortgen dahili linkler ===');
const dg = fs.readFileSync('data/explore/3d/ana-3dortgen.html', 'utf8');
const dgLinks = [...new Set([...dg.matchAll(/href="(https?:\/\/(?:www\.)?3dortgen\.com[^"]{2,100}|\/[a-z0-9-]{3,60})"/gi)].map(x => x[1]))].filter(h => !/\.(css|js|png|jpe?g|svg|webp|ico)/i.test(h));
console.log(dgLinks.slice(0, 25).join('\n'));

// 6) 3bfab: icerik ozeti
console.log('\n=== 6) 3bfab icerik ===');
const bf = fs.readFileSync('data/explore/3d/ana-3bfab.html', 'utf8');
const bt = bf.match(/<title>([^<]{3,100})</i);
console.log('title:', bt ? bt[1] : '?');
const bfLinks = [...new Set([...bf.matchAll(/href="([^"]{5,120})"/gi)].map(x => x[1]))].filter(h => !/\.(css|js|png|jpe?g|svg|webp|ico|woff2?)/i.test(h) && !h.startsWith('#'));
console.log(bfLinks.slice(0, 20).join('\n'));
const bfScripts = [...new Set([...bf.matchAll(/src="([^"]{5,120}\.js[^"]*)"/gi)].map(x => x[1]))];
console.log('scriptler:', bfScripts.slice(0, 8).join(' | '));
