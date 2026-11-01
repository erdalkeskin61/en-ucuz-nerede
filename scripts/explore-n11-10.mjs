/** n11 urun sayfasi testi (HTTP uzerinden, 1 kredi). */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();

const hedef = 'http://www.n11.com/urun/elegoo-pla-filament-siyah-1kg-41403993';
const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(hedef)}`, { signal: AbortSignal.timeout(90000) });
const text = await res.text();
console.log('durum:', res.status, '| boyut:', text.length);
console.log('title:', (text.match(/<title>([^<]{3,90})</i)?.[1] || 'yok').trim().slice(0, 80));

if (res.status === 200 && text.length > 50000) {
  fs.writeFileSync('data/explore/yeni/urun-n11.html', text);
  console.log('KAYDEDILDI ✓');
  // JSON-LD Product
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(text))) {
    const ham = m[1].trim();
    const tip = ham.match(/"@type"\s*:\s*"([^"]+)"/)?.[1];
    if (tip === 'Product') {
      console.log('\nJSON-LD Product (' + ham.length + ' bayt):');
      console.log(ham.slice(0, 1600));
    }
  }
  // kargo bilgisi
  const i = text.search(/ücretsiz kargo|ÜCRETSİZ KARGO|kargo bedava/i);
  if (i > 0) console.log('\nkargo baglami:', text.slice(Math.max(0, i - 200), i + 100).replace(/\s+/g, ' ').slice(0, 280));
}
