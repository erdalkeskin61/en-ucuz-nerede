// Vatan çerez düzeltmesi doğrulaması: adaptör üzerinden stokta olan sorgular
import { adapters } from '../src/sites/index.js';

const DENE = [
  ['vatan', 'logitech kulaklik'],
  ['vatan', 'rampage'],
  ['itopya', 'rampage'],
];
for (const [siteId, q] of DENE) {
  const a = adapters.find(x => x.id === siteId);
  const ctx = { spend: 0 };
  try {
    const t0 = Date.now();
    const r = await a.searchProducts(q, ctx);
    console.log(`OK   ${siteId} "${q}" -> ${r.length} sonuc, ${Date.now() - t0} ms`);
    for (const u of r.slice(0, 3)) console.log('     -', (u.title || '').slice(0, 60), u.price != null ? '(' + u.price + ' TL)' : '');
  } catch (e) {
    console.log(`HATA ${siteId} "${q}" -> ${e.message}`);
  }
}
