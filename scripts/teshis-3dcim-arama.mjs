// 3dcim arama davranışı: hangi sorgu eSun ürünlerini ilk 30'a sokuyor?
import { adapters } from '../src/sites/index.js';
const a = adapters.find(x => x.id === '3dcim');

const SORGULAR = ['esun', 'esun pla', 'esun pla basic', 'esun pla basic gri', 'esun gri', 'esun beton gri', 'esun filament'];
for (const q of SORGULAR) {
  const ctx = { spend: 0 };
  try {
    const r = await a.searchProducts(q, ctx);
    const esunSayisi = r.filter(u => /esun/i.test(u.title || '')).length;
    const beton = r.findIndex(u => (u.url || '').includes('beton'));
    console.log(`"${q}": ${r.length} sonuc, ilk 5:`, r.slice(0, 5).map(u => (u.title || '').slice(0, 30)).join(' | '));
    console.log(`   esun iceren: ${esunSayisi}, beton-gri konumu: ${beton}`);
  } catch (e) { console.log(`"${q}": HATA ${e.message}`); }
}
