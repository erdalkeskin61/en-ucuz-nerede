/** n11 canlı uçtan uca: adaptör üzerinden gerçek arama + ürün (1-2 kredi). */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
process.env.SCRAPERAPI_KEY = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const { yeniSiteler } = await import('../src/sites/yeni.js');
const adapter = yeniSiteler.find(a => a.id === 'n11');

const ctx = { spend: 0 };
const adaylar = await adapter.searchProducts('creality hyper pla gri', ctx);
console.log('canlı arama: ' + adaylar.length + ' aday | istek: ' + ctx.spend + ' | kredi: ' + ctx.spend);
for (const a of adaylar.slice(0, 4)) console.log('  -', a.title.slice(0, 60), '|', a.price, 'TL');

if (adaylar.length) {
  const pctx = { spend: 0 };
  const p = await adapter.getProduct(adaylar[0].url, pctx);
  console.log('canlı urun: ' + p.title.slice(0, 60) + ' | ' + p.sellingPrice + ' TL | liste: ' + p.listPrice + ' | kargo: ' + JSON.stringify(p.shipping.note) + ' | istek: ' + pctx.spend);
}
