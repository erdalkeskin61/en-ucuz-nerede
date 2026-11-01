/** Önbellekteki Teknosa sayfasındaki fiyat/veri öznitelikleri. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const key = crypto.createHash('sha256').update('GET https://www.teknosa.com/creality-hyper-pla-filament-gri-175-mm-1-kg-p-788922231').digest('hex').slice(0, 40);
const b = JSON.parse(fs.readFileSync('data/cache/' + key + '.json', 'utf8')).body;

for (const a of ['data-price-with-discount', 'data-price-without-discount', 'data-product-price', 'data-product-brand', 'data-product-ean', 'data-product-mpn', 'data-product-name', 'data-product-category']) {
  const m = b.match(new RegExp(a + '="([^"]{0,70})"'));
  console.log(a + ':', m ? JSON.stringify(m[1]) : 'YOK');
}
