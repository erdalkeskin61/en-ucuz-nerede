/** urhanshop urun sayfasi yapisini bul. */
import fs from 'node:fs';

const html = fs.readFileSync('data/explore/yeni/urun-urhanshop.html', 'utf8');
console.log('boyut:', html.length);

// urun adi ve fiyat elemanlari
for (const kw of ['lblUrunAdi', 'lblUrunBaslik', 'lblFiyat', 'urunadi', 'fiyat', 'UrunAdi', 'h1', 'title']) {
  const i = html.indexOf(kw);
  if (i > 0) console.log(`\n["${kw}" @${i}]:`, html.slice(Math.max(0, i - 100), i + 250).replace(/\s+/g, ' ').slice(0, 330));
}

// title etiketi
const t = html.match(/<title>([^<]{5,120})</i);
console.log('\ntitle:', t ? t[1].trim() : '?');

// meta og
for (const m of ['og:title', 'og:price:amount', 'product:price:amount', 'og:description']) {
  const mm = html.match(new RegExp('property="' + m + '" content="([^"]{3,150})"', 'i'));
  if (mm) console.log(m + ':', mm[1].slice(0, 120));
}

// TL baglamlari (ilk 2)
let i = -1, n = 0;
while ((i = html.search(/\d[\d.,]*\s*(?:TL|₺)/)) >= 0 && n < 2) {
  console.log('\nfiyat:', html.slice(Math.max(0, i - 250), i + 15).replace(/\s+/g, ' ').slice(-250));
  html = html.slice(i + 5);
  n++;
}
