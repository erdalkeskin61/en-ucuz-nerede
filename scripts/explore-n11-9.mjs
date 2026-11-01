/** n11: HTTP uzerinden arama + kart yapisi analizi. */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();

const hedef = 'http://www.n11.com/arama?q=' + encodeURIComponent('pla filament');
const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(hedef)}`, { signal: AbortSignal.timeout(90000) });
const text = await res.text();
console.log('durum:', res.status, '| boyut:', text.length);
const t = (text.match(/<title>([^<]{3,90})</i)?.[1] || 'yok').trim();
console.log('title:', t.slice(0, 80));
const fiyat = (text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
console.log('fiyat gecis:', fiyat);

if (res.status === 200 && text.length > 50000) {
  fs.writeFileSync('data/explore/yeni/arama-n11.html', text);
  console.log('KAYDEDILDI ✓');
  // urun linkleri
  const links = [...new Set([...text.matchAll(/href="(https:\/\/(?:www\.)?n11\.com\/[a-z0-9][^"]{8,140}|\/[a-z0-9][^"]{8,140})"/g)].map(m => m[1]))]
    .filter(h => !/arama|kategori|sepet|hesabim|giris|uyelik|blog|kampanya|magaza|sayfa|yardim|destek|favicon|cdn|static/.test(h)).slice(0, 10);
  console.log('urun linkleri:');
  for (const l of links) console.log('  ', l.slice(0, 120));
}
