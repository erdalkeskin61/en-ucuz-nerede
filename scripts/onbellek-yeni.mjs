/**
 * Yeni parti siteler için önbellek hazırlama (kredi harcamadan test).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CACHE_DIR = 'data/cache';
fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashKey(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);
}
function onbellegeYaz(url, body, render = false) {
  fs.writeFileSync(path.join(CACHE_DIR, hashKey('GET ' + url) + '.json'), JSON.stringify({ url, status: 200, body, renderUsed: render, ts: Date.now() }));
  console.log('  +', url.slice(0, 95), '(' + body.length + ' bayt)');
}
function dosyadan(d) {
  return fs.readFileSync('data/explore/yeni/' + d, 'utf8');
}
async function cek(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
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
  } catch (e) { clearTimeout(t); return { durum: 0, text: '' }; }
}

console.log('=== Arama sayfalari ===');
const q = encodeURIComponent('pla filament');
onbellegeYaz('https://www.deneystore.com/arama?q=' + q, dosyadan('arama-deneystore.html'));
onbellegeYaz('https://nmosphere.com.tr/arama?q=' + q, dosyadan('arama-nmosphere.html'));
onbellegeYaz('https://robo90.com/arama?q=' + q, dosyadan('arama-robo90.html'));
onbellegeYaz('https://www.hepsivar.com/1-13.xhtml?q=' + q, dosyadan('arama-hepsivar.html'));
onbellegeYaz('https://www.3dultra.com.tr/Arama?kelime=filament', dosyadan('arama-3dultra.html'));
onbellegeYaz('https://robotizmo.net/Arama?kelime=filament', dosyadan('arama-robotizmo.html'));
onbellegeYaz('https://3dcim.com/arama?kelime=' + q, dosyadan('arama-3dcim.html'));
onbellegeYaz('https://mintengo.com/tumu-c-0?k=' + q, dosyadan('arama-mintengo.html'));
onbellegeYaz('https://kurumsalit.com/tumu-c-0?k=' + q, dosyadan('arama-kurumsalit.html'));
onbellegeYaz('https://www.robotzade.com/tumu-c-0?k=' + q, dosyadan('arama-robotzade.html'));
onbellegeYaz('https://robitshop.com/tumu-c-0?k=' + q, dosyadan('arama-robitshop.html'));
onbellegeYaz('https://www.rhino3dprinter.com/arama?k=' + q, dosyadan('arama-rhino3dprinter.html'));
onbellegeYaz('https://sivasrobotik.com.tr/arama?controller=search&s=' + q, dosyadan('arama-sivasrobotik.html'));
onbellegeYaz('https://www.trendruum.com/q?q=' + q, dosyadan('arama-trendruum.html'));
onbellegeYaz('https://www.koctas.com.tr/search?q=' + q, dosyadan('arama-koctas.html'));
// render-tabanli siteler (ScraperAPI render ile cekilmis sayfalar)
onbellegeYaz('https://www.teknosa.com/arama?q=' + q, dosyadan('arama-teknosa.html'), true);
onbellegeYaz('https://www.pttavm.com/arama?q=' + q, dosyadan('arama-pttavm.html'), true);

console.log('=== Urun sayfalari (kayitli) ===');
onbellegeYaz('https://nmosphere.com.tr/soleyin-ultra-pla-gri-175-mm-1-kg-3d-yazici-filamenti', dosyadan('urun-nmosphere.html'));
onbellegeYaz('https://www.hepsivar.com/creality-ender-fast-pla-light-blue-filament-175-mm-1-kg', dosyadan('urun-hepsivar.html'));
onbellegeYaz('https://www.3dultra.com.tr/beta-pla-filament-black', dosyadan('urun-3dultra.html'));
onbellegeYaz('https://robotizmo.net/jamg-he-dryer-filament-kurutucu', dosyadan('urun-robotizmo.html'));
onbellegeYaz('https://mintengo.com/urun/creality-k1-max-3d-yazici', dosyadan('urun-mintengo.html'));
onbellegeYaz('https://kurumsalit.com/urun/dell-pro-16-bto105-pc16250-u-u5-235u-16g-512g-dos-16', dosyadan('urun-kurumsalit.html'));
onbellegeYaz('https://www.rhino3dprinter.com/filamer-hyper-pla-neon-fusya', dosyadan('urun-rhino3dprinter.html'));
onbellegeYaz('https://sivasrobotik.com.tr/3d/929-creality-hyper-pla-mavi.html', dosyadan('urun-sivasrobotik.html'));
onbellegeYaz('https://www.trendruum.com/urunler/creality-cr-pla-filament-mavi-175mm-1kg-901189', dosyadan('urun-trendruum.html'));
onbellegeYaz('https://www.teknosa.com/creality-hyper-pla-filament-gri-175-mm-1-kg-p-788922231', dosyadan('urun-teknosa.html'), true);
onbellegeYaz('https://www.pttavm.com/creality-ender-pla-filament-beyaz-1-75mm-1kg-p-1344137814', dosyadan('urun-pttavm.html'), true);

console.log('=== Eksik urun sayfalari (dogrudan cek, bedava) ===');
// deneystore: fiyatli bir urun (data-layer fiyatindan)
{
  const html = dosyadan('arama-deneystore.html');
  const m = html.match(/data-name="([^"]{5,90})"[^>]*data-price="([\d.,]+)"/);
  const link = html.match(/<a[^>]*href="([^"]+-pmu\d+)"/);
  if (link) {
    const url = link[1].startsWith('http') ? link[1] : 'https://www.deneystore.com' + link[1];
    const r = await cek(url);
    console.log('deneystore urun:', url.slice(0, 80), '->', r.durum);
    if (r.durum === 200) onbellegeYaz(url, r.text);
  }
}
// robo90: ItemList'ten urun
{
  const html = dosyadan('arama-robo90.html');
  const m = html.match(/"url"\s*:\s*"(https:\\?\/\\?\/robo90\.com\\?\/[^"]+)"/);
  const url = m ? m[1].replace(/\\\//g, '/') : null;
  if (url) {
    const r = await cek(url);
    console.log('robo90 urun:', url.slice(0, 80), '->', r.durum);
    if (r.durum === 200) onbellegeYaz(url, r.text);
  } else console.log('robo90: ItemList urun linki ayiklanamadi');
}
// 3dcim: productName linkinden urun
{
  const html = dosyadan('arama-3dcim.html');
  const m = html.match(/<div class="productName detailUrl"[^>]*>\s*<a[^>]*href='([^']+)'/);
  if (m) {
    const url = m[1].startsWith('http') ? m[1] : 'https://3dcim.com' + m[1];
    const r = await cek(url);
    console.log('3dcim urun:', url.slice(0, 80), '->', r.durum);
    if (r.durum === 200) onbellegeYaz(url, r.text);
  }
}
// robotzade + robitshop: showcase urun linki
for (const [id, base] of [['robotzade', 'https://www.robotzade.com'], ['robitshop', 'https://robitshop.com']]) {
  const html = dosyadan(`arama-${id}.html`);
  const m = html.match(/<div class="showcase-title">\s*<a[^>]+href="(\/urun\/[^"]+)"/);
  if (m) {
    const url = base + m[1];
    const r = await cek(url);
    console.log(`${id} urun:`, url.slice(0, 80), '->', r.durum);
    if (r.durum === 200) onbellegeYaz(url, r.text);
  }
}
// koctas: getProduct arama URL'i (urun slug'indan)
{
  const slug = 'anycubic-pla-filament-gri-175mm-1kg';
  const kelimeler = slug.split('-').filter(w => w.length >= 3 && !/^\d+$/.test(w)).slice(0, 5).join(' ');
  const url = 'https://www.koctas.com.tr/search?q=' + encodeURIComponent(kelimeler);
  const r = await cek(url);
  console.log('koctas urun-arama:', url.slice(0, 80), '->', r.durum);
  if (r.durum === 200) onbellegeYaz(url, r.text);
}
console.log('\nOnbellek hazir.');
