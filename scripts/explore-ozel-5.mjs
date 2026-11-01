/** ciceksepeti: dogru parametre (query) ile render arama (10 kredi). */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();

const url = 'https://www.ciceksepeti.com/arama?query=' + encodeURIComponent('orşide');
const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(90000) });
const text = await res.text();
console.log('durum:', res.status, '| boyut:', text.length);
const t = (text.match(/<title>([^<]{3,90})</i)?.[1] || 'yok').trim();
console.log('title:', t);

// urun kartlari: Google dizininde "959,99 TL" ve "(361)" gorunuyordu — benzer desenleri ara
const fiyatlar = [...text.matchAll(/([\d][\d.,]*)\s*TL/g)].slice(0, 6).map(m => m[1]);
console.log('fiyat ornekleri:', fiyatlar.join(' | '));
const linkler = [...new Set([...text.matchAll(/href="(\/[a-z0-9-]{10,130}(?:-p\d+)?)"/gi)].map(m => m[1]))]
  .filter(h => !/kategori|sepet|hesabim|siparis|giris|uyelik|blog|kampanya|sayfa|kurumsal/.test(h)).slice(0, 8);
console.log('urun linkleri:');
for (const l of linkler) console.log('  ', l.slice(0, 100));

if (res.status === 200 && text.length > 100000) {
  fs.writeFileSync('data/explore/yeni/arama-ciceksepeti.html', text);
  console.log('KAYDEDILDI');
}
