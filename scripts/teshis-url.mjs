// filamentsan eSun PLA Basic Açık Gri ürün URL'sini bul
import { adapters } from '../src/sites/index.js';
const a = adapters.find(x => x.id === 'filamentsan');
const ctx = { spend: 0 };
const r = await a.searchProducts('esun pla basic', ctx);
for (const u of r.slice(0, 6)) console.log((u.title || '').slice(0, 60), '|', u.url);
