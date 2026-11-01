/** n11 ScraperAPI testleri: normal + render. */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) normal istek (1 kredi)
console.log('=== n11 normal istek ===');
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent('https://www.n11.com/arama?q=' + encodeURIComponent('pla filament'))}`, { signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  console.log('durum:', res.status, '| boyut:', text.length, '| title:', (text.match(/<title>([^<]{3,70})</i)?.[1] || 'yok').trim());
}

// 2) render istegi (basariliysa 10 kredi)
console.log('\n=== n11 render istek ===');
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent('https://www.n11.com/arama?q=' + encodeURIComponent('pla filament'))}`, { signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  console.log('durum:', res.status, '| boyut:', text.length);
  const t = (text.match(/<title>([^<]{3,80})</i)?.[1] || 'yok').trim();
  console.log('title:', t);
  const fiyat = (text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  console.log('fiyat gecis:', fiyat);
  if (res.status === 200 && text.length > 100000) {
    fs.writeFileSync('data/explore/yeni/arama-n11.html', text);
    console.log('KAYDEDILDI');
    // urun linkleri
    const links = [...new Set([...text.matchAll(/href="(https:\/\/www\.n11\.com\/[^"]{8,130}|\/[a-z0-9][^"]{8,130})"/g)].map(m => m[1]))]
      .filter(h => !/arama|kategori|sepet|hesabim|giris|uyelik|blog|kampanya|magaza|sayfa/.test(h)).slice(0, 8);
    console.log('urun linkleri:');
    for (const l of links) console.log('  ', l.slice(0, 110));
  }
}
