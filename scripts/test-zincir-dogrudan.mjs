// Küçük mağazalar yeni zincirle (doğrudan öncelikli) gerçekten ayrıştırıyor mu?
import { adapters } from '../src/sites/index.js';

const DENE = [
  ['mediamarkt', 'logitech g102'],
  ['pazarama', 'rampage x-ranger'],
  ['robotistan', 'pla filament'],
  ['direnc', 'pla filament'],
  ['samm', 'pla filament'],
  ['3dortgen', 'pla filament'],
  ['koctas', 'pla filament'],
  ['filamentsan', 'esun pla basic'],
  ['vatan', 'logitech kulaklik'],
  ['filamentmarketim', 'pla'],
];
for (const [siteId, q] of DENE) {
  const a = adapters.find(x => x.id === siteId);
  const ctx = { spend: 0 };
  const t0 = Date.now();
  try {
    const r = await a.searchProducts(q, ctx);
    const fiyatli = r.filter(u => u.price != null).length;
    console.log(`OK   ${siteId.padEnd(17)} "${q}" -> ${r.length} sonuc (${fiyatli} fiyatli), ${Date.now() - t0} ms`);
  } catch (e) {
    console.log(`HATA ${siteId.padEnd(17)} "${q}" -> ${String(e.message).slice(0, 70)}`);
  }
}
process.exit(0);
