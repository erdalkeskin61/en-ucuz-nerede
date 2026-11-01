/**
 * Yeni parti keşif 5: kart detaylari (rhino/mikron/trendruum/robodukkan), koctas arama, IdeaSoft-eski JS, CF render testi.
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

// 1) rhino3dprinter / trendruum / mikron3d / robodukkan: urun linki desenleri + TL baglamlari
console.log('=== urun linkleri ve fiyat baglamlari ===');
for (const id of ['rhino3dprinter', 'trendruum', 'mikron3d', 'robodukkan']) {
  try {
    const html = fs.readFileSync(`data/explore/yeni/arama-${id}.html`, 'utf8');
    console.log(`\n--- ${id} (${html.length} bayt) ---`);
    // baskin href desenleri
    const sayac = new Map();
    for (const m of html.matchAll(/href="([^"]{10,160})"/g)) {
      let h = m[1].split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      if (/\.(css|js|png|jpe?g|svg|webp|ico)/i.test(h)) continue;
      const desen = h.replace(/\d+/g, 'N');
      if (desen.length > 8) sayac.set(desen, (sayac.get(desen) || 0) + 1);
    }
    const baskin = [...sayac.entries()].filter(([d, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    for (const [d, c] of baskin) console.log(`  desen x${c}: ${d.slice(0, 90)}`);
    // TL baglamlari (ilk 2)
    let i = -1, n = 0;
    while ((i = html.search(/\d[\d.,]*\s*(?:TL|₺)/)) >= 0 && n < 2) {
      console.log('  fiyat baglami:', html.slice(Math.max(0, i - 250), i + 30).replace(/\s+/g, ' ').slice(-250));
      html = html.slice(i + 10); // dikkat: sadece gecici
      n++;
      break; // ilk baglam yeter
    }
  } catch { console.log(`${id}: dosya yok`); }
}

// 2) koctas: arama URL varyantlari
console.log('\n=== koctas arama ===');
for (const [ad, u] of [
  ['arama?q=', 'https://www.koctas.com.tr/arama?q=' + SORGU],
  ['search?q=', 'https://www.koctas.com.tr/search?q=' + SORGU],
  ['?s= (tekrar)', 'https://www.koctas.com.tr/?s=' + SORGU],
]) {
  const r = await cek(u);
  const urun = (r.html.match(/class="product-info"|woocommerce-loop/g) || []).length;
  const t = (r.html.match(/<title>([^<]{5,80})</i)?.[1] || '?').trim();
  console.log(`${ad}: durum=${r.durum} boyut=${r.html.length} urun=${urun} | title: ${t.slice(0, 60)}`);
  if (urun > 3) fs.writeFileSync('data/explore/yeni/arama-koctas.html', r.html);
}

// 3) IdeaSoft-eski: mintengo JS'lerinde arama ucu ara
console.log('\n=== IdeaSoft-eski JS analizi (mintengo) ===');
{
  const ana = fs.readFileSync('data/explore/yeni/ana-mintengo.html', 'utf8');
  const scripts = [...new Set([...ana.matchAll(/<script[^>]+src="([^"]{5,140})"/gi)].map(m => m[1]))]
    .filter(s => !/googletagmanager|gstatic|cloudflare|recaptcha|facebook|google|cdn\.jsdelivr/i.test(s));
  console.log('scriptler:');
  for (const s of scripts.slice(0, 10)) console.log('  ', s.slice(0, 120));
  // sayfada gomulu arama ayarlari
  const aramaCfg = ana.match(/(?:liveSearch|live_search|autocomplete)[^\n]{0,200}/i);
  if (aramaCfg) console.log('arama ayari:', aramaCfg[0].slice(0, 200));
}

// 4) CF sitesi: ciceksepeti render testi (basariliysa 10 kredi)
console.log('\n=== ciceksepeti render testi ===');
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
if (key) {
  try {
    const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent('https://www.ciceksepeti.com/arama?q=' + SORGU)}`, { signal: AbortSignal.timeout(90000) });
    const text = await res.text();
    console.log('durum:', res.status, '| boyut:', text.length);
    const t = (text.match(/<title>([^<]{3,80})</i)?.[1] || 'yok').trim();
    console.log('title:', t);
    const urun = (text.match(/product|ürün/gi) || []).length;
    console.log('urun kelime gecis:', urun);
    if (res.status === 200 && text.length > 100000) fs.writeFileSync('data/explore/yeni/arama-ciceksepeti.html', text);
  } catch (e) { console.log('HATA:', String(e.message || e).slice(0, 60)); }
}
