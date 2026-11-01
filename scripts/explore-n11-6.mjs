/** n11: premium=true normal istek testi (basariliysa 10 kredi, render GEREKMEZSE). */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const hedef = 'https://www.n11.com/arama?q=' + encodeURIComponent('pla filament');

// 1) premium normal istek (basariliysa 10 kredi)
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&premium=true&url=${encodeURIComponent(hedef)}`, { signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  const t = (text.match(/<title>([^<]{3,80})</i)?.[1] || 'yok').trim();
  const fiyat = (text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  console.log('premium normal: durum=' + res.status, '| boyut:', text.length, '| fiyat gecis:', fiyat, '| title:', t.slice(0, 60));
  if (res.status === 200 && fiyat > 5) {
    fs.writeFileSync('data/explore/yeni/arama-n11.html', text);
    console.log('KAYDEDILDI ✓');
    // urun linkleri
    const links = [...new Set([...text.matchAll(/href="(https:\/\/www\.n11\.com\/[a-z0-9][^"]{8,130})"/g)].map(m => m[1]))]
      .filter(h => !/arama|kategori|sepet|hesabim|giris|uyelik|blog|kampanya|magaza|sayfa|yardim|destek/.test(h)).slice(0, 8);
    console.log('urun linkleri:');
    for (const l of links) console.log('  ', l.slice(0, 110));
  } else {
    console.log('govde:', text.slice(0, 200));
  }
}
