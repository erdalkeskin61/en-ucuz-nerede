/**
 * Kodmod: platform fabrikalarındaki sabit "kargo bilgisi yok" satırlarını
 * kargoCikar(r.body) çağrısıyla değiştirir ve import ekler.
 */
import fs from 'node:fs';

const DOSYALAR = [
  'src/sites/plt-teknosa.js',
  'src/sites/plt-platinmarket.js',
  'src/sites/plt-urhanshop.js',
  'src/sites/plt-n11.js',
  'src/sites/plt-ticimax.js',
  'src/sites/plt-tsoft.js',
  'src/sites/plt-koctas.js',
  'src/sites/plt-ikas.js',
  'src/sites/plt-ciceksepeti.js',
  'src/sites/plt-ideasoft-quka.js',
  'src/sites/plt-ideasoft.js',
  'src/sites/plt-shopify.js',
  'src/sites/plt-pttavm.js',
  'src/sites/plt-prestashop.js',
  'src/sites/plt-trendruum.js',
  'src/sites/plt-ideasoft-klasik.js',
];

const SABIT1 = "shipping: { fee: null, freeOver: null, applies: null, note: 'Kargo bilgisi ürün sayfasında belirtilmemiş (sepette kesinleşir)' },";
const SABIT2 = ": { fee: null, freeOver: null, applies: null, note: 'Kargo bilgisi ürün sayfasında belirtilmemiş (sepette kesinleşir)' };";
const YENI1 = 'shipping: kargoCikar(r.body),';
const YENI2 = ': kargoCikar(r.body);';
const IMPORT = "import { kargoCikar } from '../kargo.js';";

for (const dosya of DOSYALAR) {
  let icerik = fs.readFileSync(dosya, 'utf8');
  const once = icerik;
  let degisim = (icerik.match(new RegExp(SABIT1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  icerik = icerik.split(SABIT1).join(YENI1);
  icerik = icerik.split(SABIT2).join(YENI2);
  const toplam = degisim + (once.includes(SABIT2) ? (once.split(SABIT2).length - 1) : 0);
  if (!icerik.includes("from '../kargo.js'")) {
    // ilk import satırından sonra ekle
    const ilkImport = icerik.match(/^import .+?;$/m);
    if (ilkImport) {
      icerik = icerik.replace(ilkImport[0], ilkImport[0] + '\n' + IMPORT);
    } else {
      console.log('UYARI: import yeri bulunamadı:', dosya);
    }
  }
  fs.writeFileSync(dosya, icerik);
  console.log(toplam > 0 ? `✓ ${dosya} (${toplam} değişim)` : `! ${dosya} (değişiklik yok — kontrol et)`);
}
console.log('\nTamam.');
