/** ciceksepeti urun sayfasi (render) + urhanshop kart/urun analizi. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) urhanshop: arama sayfasi kart yapisi
console.log('=== urhanshop kart ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-urhanshop.html', 'utf8');
  const m = html.match(/-u\d+['"]/);
  if (m) {
    const i = html.indexOf(m[0]);
    console.log(html.slice(Math.max(0, i - 1300), i + 1500).replace(/\s+/g, ' ').slice(0, 2600));
  }
}

// 2) urhanshop: urun sayfasi (dogrudan, bedava)
console.log('\n\n=== urhanshop urun sayfasi ===');
{
  const html = fs.readFileSync('data/explore/yeni/arama-urhanshop.html', 'utf8');
  const linkM = html.match(/href="([^"]*-u\d+)"/);
  if (linkM) {
    const url = linkM[1].startsWith('http') ? linkM[1] : 'https://www.urhanshop.com' + linkM[1];
    console.log('urun url:', url.slice(0, 100));
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
      const buf = await res.arrayBuffer();
      clearTimeout(t);
      let text;
      try {
        const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
        const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
        const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
        text = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
      } catch { text = new TextDecoder('utf-8').decode(buf); }
      console.log('durum:', res.status, '| boyut:', text.length);
      if (res.status === 200) {
        fs.writeFileSync('data/explore/yeni/urun-urhanshop.html', text);
        // JSON-LD
        const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let m2;
        while ((m2 = ldRe.exec(text))) {
          const ham = m2[1].trim();
          if (ham.includes('Product')) console.log('JSON-LD Product:', ham.slice(0, 400));
        }
        // fiyat
        const fi = text.search(/\d[\d.,]*\s*(?:TL|₺)/);
        if (fi > 0) console.log('fiyat baglami:', text.slice(Math.max(0, fi - 250), fi + 20).replace(/\s+/g, ' ').slice(-250));
      }
    } catch (e) { clearTimeout(t); console.log('hata:', String(e).slice(0, 40)); }
  }
}

// 3) ciceksepeti urun sayfasi (render, 10 kredi)
console.log('\n\n=== ciceksepeti urun sayfasi ===');
{
  const env = fs.readFileSync('.env', 'utf8');
  const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
  const url = 'https://www.ciceksepeti.com/mor-buketli-sakisida-beyaz-cift-orkide-ve-fenix-at6126';
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  console.log('durum:', res.status, '| boyut:', text.length);
  if (res.status === 200 && text.length > 50000) {
    fs.writeFileSync('data/explore/yeni/urun-ciceksepeti.html', text);
    // JSON-LD Product
    const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m3;
    while ((m3 = ldRe.exec(text))) {
      const ham = m3[1].trim();
      if (ham.includes('Product')) console.log('JSON-LD Product:', ham.slice(0, 500));
    }
    // data-oznitelikleri
    const fiyat = text.match(/data-cs-pb-price-text="true">([^<]+)</i) || text.match(/"price"\s*:\s*"?([\d.,]+)"?/);
    console.log('fiyat ipucu:', fiyat ? fiyat[1] : '?');
    const h1 = text.match(/<h1[^>]*>([\s\S]{5,120}?)<\/h1>/);
    console.log('h1:', h1 ? h1[1].replace(/<[^>]*>/g, '').trim().slice(0, 80) : '?');
  }
}
