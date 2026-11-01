/** urhanshop kart devami (baslik/fiyat) + urun sayfasi (dogru url). */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) kart devami
{
  const html = fs.readFileSync('data/explore/yeni/arama-urhanshop.html', 'utf8');
  const i = html.indexOf('kingroon-petg-basic-beyaz-filament-1,75-mm-1-kg-u127806');
  console.log('=== kart devami (href sonrasi 4500 karakter) ===');
  console.log(html.slice(i, i + 4500).replace(/\s+/g, ' ').slice(0, 4400));
}

// 2) urun sayfasi
console.log('\n\n=== urhanshop urun sayfasi ===');
{
  const url = 'https://www.urhanshop.com/kingroon-petg-basic-beyaz-filament-1,75-mm-1-kg-u127806';
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
      const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = ldRe.exec(text))) {
        if (m[1].includes('Product')) console.log('JSON-LD Product:', m[1].trim().slice(0, 400));
      }
      const h1 = text.match(/<h1[^>]*>([\s\S]{5,120}?)<\/h1>/i) || text.match(/lblUrunAdi[^>]*>([^<]{5,90})</i);
      console.log('h1/ad:', h1 ? h1[1].toString().replace(/<[^>]*>/g, '').trim().slice(0, 80) : '?');
      const fi = text.search(/\d[\d.,]*\s*(?:TL|₺)/);
      if (fi > 0) console.log('fiyat baglami:', text.slice(Math.max(0, fi - 300), fi + 20).replace(/\s+/g, ' ').slice(-300));
    }
  } catch (e) { clearTimeout(t); console.log('hata:', String(e).slice(0, 40)); }
}
