/** ciceksepeti + urhanshop adaptör testi. */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
process.env.SCRAPERAPI_KEY = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const { config } = await import('../src/config.js');
const { yeniSiteler } = await import('../src/sites/yeni.js');

const tests = [
  { id: 'ciceksepeti', sorgu: 'orşide', urun: 'https://www.ciceksepeti.com/mor-buketli-sakisida-beyaz-cift-orkide-ve-fenix-at6126' },
  { id: 'urhanshop', sorgu: 'filament', urun: 'https://www.urhanshop.com/kingroon-petg-basic-beyaz-filament-1,75-mm-1-kg-u127806' },
];

for (const t of tests) {
  const adapter = yeniSiteler.find(a => a.id === t.id);
  console.log(`\n=== ${adapter.name} (${t.id}) ===`);
  const ctx = { spend: 0 };
  try {
    const adaylar = await adapter.searchProducts(t.sorgu, ctx);
    console.log(`  arama: ${adaylar.length} aday | istek: ${ctx.spend}`);
    for (const a of adaylar.slice(0, 3)) {
      console.log(`    - ${(a.title || '').slice(0, 55)} | ${a.price != null ? a.price + ' TL' : 'fiyat yok'} | ${a.url.slice(0, 65)}`);
    }
    if (!adaylar.length) { console.log('  ! aday yok'); continue; }
  } catch (e) {
    console.log(`  arama HATA: ${String(e.message || e).slice(0, 150)}`);
    continue;
  }
  const pctx = { spend: 0 };
  try {
    const p = await adapter.getProduct(t.urun, pctx);
    console.log(`  urun: ${p.title?.slice(0, 60)} | ${p.sellingPrice} ${p.currency} | stok: ${p.inStock} | kampanya: ${p.campaigns.length}`);
  } catch (e) {
    console.log(`  urun HATA: ${String(e.message || e).slice(0, 150)}`);
  }
}
