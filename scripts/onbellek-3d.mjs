/**
 * 3D site adaptörleri için önbellek hazırlama (kredi harcamadan test).
 * Keşif sırasında kaydedilen sayfaları + doğrudan (bedava) çekilebilen sayfaları
 * ScraperAPI önbelleğine yazar; ardından test betiği bunları kullanır.
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

function onbellegeYaz(url, body, { method = 'GET', istekBody = null } = {}) {
  const key = hashKey(method + ' ' + url + (istekBody ? '\n' + istekBody : ''));
  fs.writeFileSync(path.join(CACHE_DIR, key + '.json'), JSON.stringify({
    url, status: 200, body, renderUsed: false, ts: Date.now(),
  }));
  console.log('  +', method, url.slice(0, 90), '(' + body.length + ' bayt)');
}

function dosyadan(dosya) {
  return fs.readFileSync('data/explore/3d/' + dosya, 'utf8');
}

async function cek(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json' } });
    // Bazı siteler Windows-1254 gönderir; kodlamayı sayfadan algıla.
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
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 60) }; }
}

// ---- 1) Arama sayfaları (kaydedilmiş) ----
console.log('=== Arama sayfaları ===');
const SORGU = 'pla filament';
const q = encodeURIComponent(SORGU);
onbellegeYaz('https://www.robotistan.com/arama?q=' + q, dosyadan('arama-robotistan.html'));
onbellegeYaz('https://www.robolinkmarket.com/arama?q=' + q, dosyadan('arama-robolinkmarket.html'));
onbellegeYaz('https://www.direnc.net/arama?q=' + q, dosyadan('arama-direnc.html'));
onbellegeYaz('https://www.motorobit.com/arama?q=' + q, dosyadan('arama-motorobit.html'));
onbellegeYaz('https://filamentsan.com/arama?q=' + q, dosyadan('arama-filamentsan.html'));
onbellegeYaz('https://shop.3dortgen.com/arama?q=' + q, dosyadan('arama-shop3dortgen.html'));
onbellegeYaz('https://www.domirobot.com/arama?q=' + q, dosyadan('arama-domirobot.html'));
onbellegeYaz('https://matersan.com.tr/tumu-c-0?k=' + q, dosyadan('arama-matersan-tumu.html'));
onbellegeYaz('https://market.samm.com/search?s=' + encodeURIComponent('filament'), dosyadan('arama-samm.html'));
onbellegeYaz('https://filamentdepom.com/arama?kelime=' + encodeURIComponent('filament'), dosyadan('arama-filamentdepom.html'));

// ---- 2) Ürün sayfaları (kaydedilmiş) ----
console.log('=== Ürün sayfaları ===');
onbellegeYaz('https://robotistan.com/tinylab-eco-pla-filament-175mm-siyah', dosyadan('urun-robotistan.html'));
onbellegeYaz('https://www.direnc.net/kirmizi-pla-plus-filament-175mm-1kg-tri-d', dosyadan('urun-direnc.html'));
onbellegeYaz('https://www.domirobot.com/anycubic-ace-2-pro-cok-renkli-filament-sistemi-kobra-x-kobra-s1-pmu7877', dosyadan('urun-domirobot.html'));
onbellegeYaz('https://www.filamentmarketim.com/bambu-lab-basic-pla-filament', dosyadan('urun-filamentmarketim.html'));
onbellegeYaz('https://matersan.com.tr/urun/heygears-ultracraft-reflex-3d-yazici', dosyadan('urun-matersan.html'));
onbellegeYaz('https://filamentdepom.com/polylite-cospla-filament-1.75mm-1kg-cosplay-pla', dosyadan('urun-filamentdepom.html'));
onbellegeYaz('https://market.samm.com/fibromast-pla-seffaf-kirmizi-filament-175mm-1kg', dosyadan('urun-samm.html'));

// ---- 3) Doğrudan çekilebilenler (bedava): Shopify .js + suggest.json, IdeaSoft, filamentsan ürünü ----
console.log('=== Doğrudan çekilenler ===');
{
  const r = await cek('https://3dteknomarket.com/products/beta-pla-filament-white.js');
  if (r.durum === 200) onbellegeYaz('https://3dteknomarket.com/products/beta-pla-filament-white.js', r.text);
  else console.log('  ! 3dteknomarket .js:', r.durum, r.hata || '');
}
{
  const r = await cek('https://3dteknomarket.com/search/suggest.json?q=pla+filament&resources[type]=product&resources[limit]=10&resources[options][fields]=title,product_type,variants.title,tag');
  if (r.durum === 200) onbellegeYaz('https://3dteknomarket.com/search/suggest.json?q=pla%20filament&resources[type]=product&resources[limit]=10&resources[options][fields]=title,product_type,variants.title,tag', r.text);
  else console.log('  ! suggest.json:', r.durum);
}
// IdeaSoft: ana sayfa (token) + arama POST yanıtı
for (const base of ['https://www.filamentmarketim.com', 'https://www.teknikfilament3d.com']) {
  const r0 = await cek(base + '/');
  if (r0.durum === 200) onbellegeYaz(base + '/', r0.text);
  else console.log('  !', base, r0.durum);
  const token = r0.text.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
  if (token) {
    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 30000);
    const res = await fetch(base + '/client/Visitor/search?length=20', {
      signal: c2.signal, method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept-Content-Token': token,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ dataType: 'json', phrase: SORGU }).toString(),
    });
    const text = await res.text();
    clearTimeout(t2);
    onbellegeYaz(base + '/client/Visitor/search?length=20', text, { method: 'POST', istekBody: 'dataType=json&phrase=' + encodeURIComponent(SORGU).replace(/%20/g, '+') });
  }
}
// filamentsan ürün sayfası (T-Soft url teması doğrulaması)
{
  const r = await cek('https://filamentsan.com/beta-pla-plus-dark-purple-filament-175mm-1kg');
  if (r.durum === 200) onbellegeYaz('https://filamentsan.com/beta-pla-plus-dark-purple-filament-175mm-1kg', r.text);
  else console.log('  ! filamentsan urun:', r.durum);
}
// teknikfilament3d ürün sayfası (IdeaSoft JSON-LD doğrulaması)
{
  const r = await cek('https://www.teknikfilament3d.com/porima-eco-hyper-pla-filament-1419');
  if (r.durum === 200) onbellegeYaz('https://www.teknikfilament3d.com/porima-eco-hyper-pla-filament-1419', r.text);
  else console.log('  ! teknikfilament3d urun:', r.durum);
}

console.log('\nÖnbellek hazır.');
