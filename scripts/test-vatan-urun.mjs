// Vatan ürün sayfası doğrudan çekim doğrulaması
import { adapters } from '../src/sites/index.js';
const a = adapters.find(x => x.id === 'vatan');
const ctx = { spend: 0 };
const r = await a.searchProducts('rampage retsu', ctx);
if (!r.length) { console.log('arama bos'); process.exit(1); }
const urun = await a.getProduct(r[0].url, ctx);
console.log('urun:', JSON.stringify({
  title: urun.title, brand: urun.brand, price: urun.sellingPrice,
  inStock: urun.inStock, kargo: urun.shipping, url: r[0].url.slice(30, 90),
}, null, 1));
