/** n11: filenta urun URL'si gercekten 404 mu? (1 kredi) */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();

for (const hedef of [
  'http://www.n11.com/urun/filenta-siyah-pla-premium-filament-175mm-1kg-1-111558018',
  'http://www.n11.com/urun/beyaz-premium-pla-filament-175mm-1kg-1-111496991',
]) {
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(hedef)}`, { signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  console.log(hedef.slice(30, 90), '=> durum:', res.status, '| boyut:', text.length, '| title:', (text.match(/<title>([^<]{3,70})</i)?.[1] || 'yok').trim().slice(0, 55));
}
