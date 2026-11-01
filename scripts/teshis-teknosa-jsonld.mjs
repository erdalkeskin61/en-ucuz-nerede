/** Önbellekteki Teknosa sayfasındaki JSON-LD bloğunu bul ve incele. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const key = crypto.createHash('sha256').update('GET https://www.teknosa.com/creality-hyper-pla-filament-gri-175-mm-1-kg-p-788922231').digest('hex').slice(0, 40);
const b = JSON.parse(fs.readFileSync('data/cache/' + key + '.json', 'utf8')).body;

const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
let m, n = 0;
while ((m = re.exec(b))) {
  n++;
  const ham = m[1].trim();
  if (!ham.includes('Product')) continue;
  console.log('Blok #' + n + ' (' + ham.length + ' bayt), ilk 900 karakter:');
  console.log(ham.slice(0, 900));
  try {
    const j = JSON.parse(ham);
    console.log('\nAYRISTIRILDI:', JSON.stringify(j).slice(0, 400));
  } catch (e) {
    console.log('\nJSON hatası:', String(e).slice(0, 80));
  }
}
console.log('\ntoplam ld+json bloğu:', n);
