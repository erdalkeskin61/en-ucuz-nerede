/** n11 JSON-LD ItemList tam yapisi + kart fiyatlari. */
import fs from 'node:fs';

const html = fs.readFileSync('data/explore/yeni/arama-n11.html', 'utf8');

// ItemList JSON'ini ayikla
const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
let m, liste = null;
while ((m = ldRe.exec(html))) {
  try {
    const j = JSON.parse(m[1].trim());
    if (j['@type'] === 'ItemList') liste = j;
  } catch {}
}
if (liste) {
  console.log('urun sayisi:', liste.itemListElement?.length);
  for (const el of (liste.itemListElement || []).slice(0, 4)) {
    const p = el.item;
    console.log('\n--- urun', el.position, '---');
    console.log(JSON.stringify(p, null, 1).slice(0, 900));
  }
}

// HTML kart: "sepet" fiyatlari — basket-price bolgesi
console.log('\n\n=== sepet fiyati baglami ===');
{
  const i = html.indexOf('basket-price');
  if (i > 0) console.log(html.slice(i, i + 1200).replace(/\s+/g, ' ').slice(0, 1100));
}

// urun linklerinin HTML'deki hali (urun/ deseni)
const ulinks = [...new Set([...html.matchAll(/href="([^"]*\/urun\/[^"]+)"/g)].map(x => x[1]))];
console.log('\n/urun/ link sayisi:', ulinks.length);
for (const l of ulinks.slice(0, 5)) console.log('  ', l.slice(0, 110));
