// Doğrudan çekim dönüşü doğrulaması: vatan/itopya/n11 adaptörleri bilinen ürünü bulabiliyor mu?
import { adapters } from '../src/sites/index.js';

const DENE = [
  ['vatan', 'logitech g102'],
  ['itopya', 'logitech g102'],
  ['n11', 'rampage x-ranger'],
  ['filamentmarketim', 'pla'],
  ['teknikfilament3d', 'pla'],
  ['filamentdepom', 'pla'],
  ['3dultra', 'pla'],
  ['robotizmo', 'pla'],
  ['3dcim', 'pla'],
];

for (const [siteId, q] of DENE) {
  const a = adapters.find(x => x.id === siteId);
  if (!a) { console.log(siteId + ': adaptor yok!'); continue; }
  const ctx = { spend: 0 };
  try {
    const t0 = Date.now();
    const r = await a.searchProducts(q, ctx);
    const ms = Date.now() - t0;
    const ilk = r.slice(0, 3).map(u => (u.title || '').slice(0, 45) + (u.price != null ? ' (' + u.price + ' TL)' : ''));
    console.log(`OK   ${siteId.padEnd(18)} "${q}" -> ${r.length} sonuc, ${ms} ms, ${ctx.spend} istek`);
    for (const s of ilk) console.log('       - ' + s);
  } catch (e) {
    console.log(`HATA ${siteId.padEnd(18)} "${q}" -> ${e.message}`);
  }
}
