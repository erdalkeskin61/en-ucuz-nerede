/** Kesif 24: matersan urun sayfasi fiyat bulma + tumu kart fiyati. */
import fs from 'node:fs';

const mt = fs.readFileSync('data/explore/3d/urun-matersan.html', 'utf8');
console.log('urun sayfasi boyut:', mt.length);

// JSON fiyat desenleri
for (const desen of [/"price"\s*:\s*"?[\d.,]+"?/g, /priceVal[^,}]{0,30}/g, /urunFiyat[^,}]{0,40}/g, /satisFiyati[^,}]{0,40}/g, /"fiyat[^"]*"\s*:\s*"?[\d.,]+"?/g]) {
  const eslesen = [...mt.matchAll(desen)].slice(0, 4).map(m => m[0]);
  if (eslesen.length) console.log('desen:', eslesen.join(' | '));
}

// TL fiyatlari (nokta/binlik virgulonalkli)
const tlFiyat = [...mt.matchAll(/([\d]{1,3}(?:\.\d{3})+,\d{2}|[\d]+,\d{2})\s*(?:TL|₺)/g)].slice(0, 6).map(m => m[0]);
console.log('TL fiyatlari:', tlFiyat.join(' | ') || 'yok');

// product-detail bolgesi
const pdI = mt.search(/class="[^"]*(?:product-detail|urun-detay|productDetail)[^"]*"/i);
console.log('\nproduct-detail @', pdI);
if (pdI > 0) console.log(mt.slice(pdI, pdI + 1200).replace(/\s+/g, ' ').slice(0, 1200));

// tumu sayfasindaki kart fiyati
console.log('\n=== tumu sayfasi kart fiyati ===');
const tumu = fs.readFileSync('data/explore/3d/arama-matersan-tumu.html', 'utf8');
const kl = tumu.match(/<a[^>]+href="(\/urun\/[a-z0-9-]{5,80})"[^>]*title="([^"]{5,90})"/);
if (kl) {
  console.log('kart linki:', kl[1], '|', kl[2]);
  const i = tumu.indexOf('title="' + kl[2] + '"');
  console.log(tumu.slice(i, i + 1800).replace(/\s+/g, ' ').slice(0, 1800));
}
