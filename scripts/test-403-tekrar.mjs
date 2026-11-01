/** Başarısız 3 sitenin (geçici 403?) tekrar testi — az kredi. */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
process.env.SCRAPERAPI_KEY = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const { adapters } = await import('../src/sites/index.js');

for (const id of ['filamentmarketim', 'teknikfilament3d', 'urhanshop']) {
  const adapter = adapters.find(a => a.id === id);
  console.log(`\n=== ${adapter.name} (${id}) ===`);
  const ctx = { spend: 0 };
  try {
    const adaylar = await adapter.searchProducts('pla filament', ctx);
    console.log(`arama: ${adaylar.length} aday | istek: ${ctx.spend}`);
    for (const a of adaylar.slice(0, 2)) console.log('  -', (a.title || '').slice(0, 55), '|', a.price != null ? a.price + ' TL' : 'fiyat yok');
  } catch (e) {
    console.log('arama HATA:', String(e.message || e).slice(0, 120));
  }
}
