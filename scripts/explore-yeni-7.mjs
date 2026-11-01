/**
 * Yeni parti keşif 7: rhino tumu linki, klasik fiyat yapilari, koctas/trendruum/robodukkan kartlari, CF render.
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

// 1) rhino3dprinter: arama sayfasindaki tumu-c-N linki
console.log('=== rhino tumu linki ===');
{
  const r = await cek('https://www.rhino3dprinter.com/arama?k=' + encodeURIComponent('pla filament'));
  const tumu = [...new Set([...r.html.matchAll(/href="(\/tumu-c-[^"]+)"/g)].map(m => m[1]))];
  console.log('tumu linkleri:', tumu.slice(0, 5).join(' | '));
  if (tumu[0]) {
    const r2 = await cek('https://www.rhino3dprinter.com' + tumu[0].split('?')[0] + '?k=' + encodeURIComponent('pla filament'));
    const kart = (r2.html.match(/showcase-title|product-item|data-product-id/g) || []).length;
    console.log('tumu sayfasi: durum=' + r2.durum, '| kart:', kart);
    if (kart > 3) fs.writeFileSync('data/explore/yeni/arama-rhino3dprinter.html', r2.html);
  }
}

// 2) IdeaSoft-klasik kart/fiyat yapisi (mintengo ornegi)
console.log('\n=== mintengo kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-mintengo.html', 'utf8');
  const i = html.indexOf('showcase-title');
  if (i > 0) console.log(html.slice(Math.max(0, i - 300), i + 1300).replace(/\s+/g, ' ').slice(0, 1500));
}

// 3) koctas kart yapisi (data-product)
console.log('\n\n=== koctas kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-koctas.html', 'utf8');
  const i = html.indexOf('data-product');
  if (i > 0) console.log(html.slice(Math.max(0, i - 500), i + 1500).replace(/\s+/g, ' ').slice(0, 1900));
}

// 4) trendruum: tam kart (a href + baslik)
console.log('\n\n=== trendruum tam kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-trendruum.html', 'utf8');
  const i = html.indexOf('tr-kk-fiyat');
  // kartin baslangicina dogru geri git: <a ile baslayan blok
  const blok = html.slice(Math.max(0, i - 3500), i + 200);
  const aI = blok.lastIndexOf('<a ');
  console.log(blok.slice(aI >= 0 ? aI : 0).replace(/\s+/g, ' ').slice(0, 1800));
}

// 5) robodukkan urun karti
console.log('\n\n=== robodukkan urun karti ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-robodukkan.html', 'utf8');
  // urun slug linkleri + cevreleri
  const re = /<a[^>]+href="(\/[a-z0-9-]{12,90})"[^>]*title="([^"]{5,90})"/i;
  const m = html.match(re);
  if (m) {
    const i = html.indexOf(m[0]);
    console.log(html.slice(Math.max(0, i - 800), i + 1400).replace(/\s+/g, ' ').slice(0, 2000));
  } else {
    console.log('title-li link yok; href ornekleri:');
    const hrefs = [...new Set([...html.matchAll(/href="(\/[a-z0-9-]{15,90})"/g)].map(x => x[1]))].filter(h => !/kategori|ara(?!ma)|sepet|iletisim|sayfa/.test(h)).slice(0, 8);
    console.log(hrefs.join('\n'));
  }
}

// 6) CF render testleri: teknosa, pttavm, ciceksepeti (search varyanti)
console.log('\n\n=== CF render testleri ===');
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
if (key) {
  for (const [ad, url] of [
    ['teknosa', 'https://www.teknosa.com/arama?q=' + encodeURIComponent('pla filament')],
    ['pttavm', 'https://www.pttavm.com/arama?q=' + encodeURIComponent('pla filament')],
    ['ciceksepeti-search', 'https://www.ciceksepeti.com/search?q=' + encodeURIComponent('pla filament')],
  ]) {
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(90000) });
      const text = await res.text();
      const t = (text.match(/<title>([^<]{3,80})</i)?.[1] || 'yok').trim();
      const fiyat = (text.match(/₺|\d+,\d{2}\s*TL/g) || []).length;
      console.log(`${ad}: durum=${res.status} boyut=${text.length} fiyat=${fiyat} | title: ${t.slice(0, 60)}`);
      if (res.status === 200 && text.length > 100000) fs.writeFileSync(`data/explore/yeni/arama-${ad}.html`, text);
    } catch (e) { console.log(ad, 'HATA:', String(e.message || e).slice(0, 50)); }
  }
}
