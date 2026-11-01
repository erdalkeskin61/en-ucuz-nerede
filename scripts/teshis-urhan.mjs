// urhanshop arama neden boş döndü?
import { adapters } from '../src/sites/index.js';
const a = adapters.find(x => x.id === 'urhanshop');
for (const q of ['Esun pla basic', 'Esun', 'filament']) {
  const ctx = { spend: 0 };
  try {
    const t0 = Date.now();
    const r = await a.searchProducts(q, ctx);
    console.log(`"${q}": ${r.length} sonuc, ${Date.now() - t0} ms, ${ctx.spend} istek`);
    for (const u of r.slice(0, 3)) console.log('   ', (u.title || '').slice(0, 60));
  } catch (e) {
    console.log(`"${q}": HATA ${e.message}`);
  }
}
