/**
 * Yeni parti keşif 4: kart yapilari + Ikas/arama URL varyantlari.
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let html;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      html = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { html = new TextDecoder('utf-8').decode(buf); }
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 50) }; }
}

const SORGU = encodeURIComponent('pla filament');

// 1) Ikas siteleri: /search?s=
console.log('=== Ikas (robocombo, fixx3d) ===');
for (const [id, base] of [['robocombo', 'https://www.robocombo.com'], ['fixx3d', 'https://fixx3d.com']]) {
  const r = await cek(base + '/search?s=' + encodeURIComponent('filament'));
  const kart = r.html ? (r.html.match(/₺/g) || []).length : 0;
  console.log(`${id}: durum=${r.durum} boyut=${r.html.length} ₺=${kart}`);
  if (r.durum === 200 && kart > 3) fs.writeFileSync(`data/explore/yeni/arama-${id}.html`, r.html);
}

// 2) Ticimax URL varyantlari (3dultra, robotizmo)
console.log('\n=== Ticimax varyantlari ===');
for (const [id, base] of [['3dultra', 'https://www.3dultra.com.tr'], ['robotizmo', 'https://robotizmo.net']]) {
  for (const [ad, u] of [
    ['kelime', base + '/arama?kelime=' + encodeURIComponent('filament')],
    ['txtbxArama', base + '/arama?txtbxArama=' + encodeURIComponent('filament')],
    ['Arama', base + '/Arama?kelime=' + encodeURIComponent('filament')],
  ]) {
    const r = await cek(u);
    const fiyat = (r.html.match(/discountPriceSpan|₺\s?\d/g) || []).length;
    console.log(`${id} ${ad}: durum=${r.durum} boyut=${r.html.length} fiyat-ipucu=${fiyat}`);
    if (r.durum === 200 && fiyat > 5) fs.writeFileSync(`data/explore/yeni/arama-${id}.html`, r.html);
  }
}

// 3) hepsivar: /1-13.xhtml?q= denemesi
console.log('\n=== hepsivar ===');
for (const [ad, u] of [
  ['1-13.xhtml?q=', 'https://www.hepsivar.com/1-13.xhtml?q=' + SORGU],
  ['arama.xhtml?q=', 'https://www.hepsivar.com/arama.xhtml?q=' + SORGU],
]) {
  const r = await cek(u);
  const fiyat = (r.html.match(/\d[\d.,]*(?:\s|&nbsp;)*TL/g) || []).length;
  console.log(`${ad}: durum=${r.durum} boyut=${r.html.length} fiyat=${fiyat}`);
  if (r.durum === 200 && fiyat > 5) fs.writeFileSync('data/explore/yeni/arama-hepsivar.html', r.html);
}

// 4) urhanshop: arama URL denemeleri (u-suffix urunler)
console.log('\n=== urhanshop ===');
for (const [ad, u] of [
  ['arama?q=', 'https://www.urhanshop.com/arama?q=' + SORGU],
  ['arama?ctl00$arama3=', 'https://www.urhanshop.com/arama?ctl00%24arama3=' + SORGU],
  ['default.aspx?arama=', 'https://www.urhanshop.com/default.aspx?arama=' + SORGU],
]) {
  const r = await cek(u);
  const urun = (r.html.match(/-u\d+('|")/g) || []).length;
  console.log(`${ad}: durum=${r.durum} boyut=${r.html.length} urun-ipucu=${urun}`);
  if (urun > 3) fs.writeFileSync('data/explore/yeni/arama-urhanshop.html', r.html);
}

// 5) Kart yapilari: rhino3dprinter, mikron3d, trendruum, robodukkan, koctas, sivasrobotik
console.log('\n=== kart yapilari ===');
function kartGoster(id, needle, once = 300, sonra = 1200) {
  try {
    const html = fs.readFileSync(`data/explore/yeni/arama-${id}.html`, 'utf8');
    const i = html.indexOf(needle);
    console.log(`\n--- ${id} [${needle}] @${i} ---`);
    if (i > 0) console.log(html.slice(Math.max(0, i - once), i + sonra).replace(/\s+/g, ' ').slice(0, once + sonra));
    else console.log('(bulunamadi)');
  } catch { console.log(`\n--- ${id}: dosya yok`); }
}
kartGoster('rhino3dprinter', '₺', 600, 400);
kartGoster('mikron3d', '₺', 600, 400);
kartGoster('trendruum', '₺', 600, 400);
kartGoster('robodukkan', '₺', 600, 400);
kartGoster('koctas', 'class="product', 100, 1000);
kartGoster('sivasrobotik', 'class="product', 100, 1000);
