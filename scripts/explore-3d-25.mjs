/** Kesif 25 (kesin son): matersan showcase-price-new + urun sayfasi TL baglamlari. */
import fs from 'node:fs';

const tumu = fs.readFileSync('data/explore/3d/arama-matersan-tumu.html', 'utf8');
const i = tumu.indexOf('showcase-price-new');
console.log('=== tumu: showcase-price-new ===');
console.log(tumu.slice(i, i + 500).replace(/\s+/g, ' '));

const mt = fs.readFileSync('data/explore/3d/urun-matersan.html', 'utf8');
console.log('\n=== urun sayfasi: TL baglamlari ===');
for (const fiyat of ['102.000,00 TL', '99.960,00 TL']) {
  const j = mt.indexOf(fiyat);
  console.log('\n[' + fiyat + '] @' + j);
  if (j > 0) console.log(mt.slice(Math.max(0, j - 500), j + 150).replace(/\s+/g, ' ').slice(-600));
}
