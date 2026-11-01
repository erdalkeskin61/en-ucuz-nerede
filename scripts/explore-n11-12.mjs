/** n11 filenta sayfasi icerik kontrolu (onbellege al). */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const hedef = 'http://www.n11.com/urun/filenta-siyah-pla-premium-filament-175mm-1kg-1-111558018';
const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(hedef)}`, { signal: AbortSignal.timeout(90000) });
const text = await res.text();
console.log('durum:', res.status, '| boyut:', text.length);
const i = text.indexOf('<title');
console.log('title etiketi:', i >= 0 ? text.slice(i, i + 120) : 'YOK');
const p = text.match(/"@type"\s*:\s*"Product"/);
console.log('JSON-LD Product:', !!p);
if (res.status === 200) {
  fs.writeFileSync('data/explore/yeni/urun-n11-filenta.html', text);
  console.log('KAYDEDILDI');
}
