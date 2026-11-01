/**
 * Yedek sağlayıcı cerrahi testleri (ScraperAPI tükenmiş durumda):
 *  1) IdeaSoft-smart site → dürüst hata mesajı beklenir
 *  2) URHANSHOP tam canlı akış (yeni sorgu → önbellek yok → Crawlbase POST + çerez)
 *  3) n11 yeni URL → ZenRows yönlendirmesi
 */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
process.env.SCRAPERAPI_KEY = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
process.env.CRAWLBASE_TOKEN = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();
process.env.ZENROWS_API_KEY = env.match(/ZENROWS_API_KEY=([^\r\n]+)/)?.[1]?.trim();

const { fetchPage } = await import('../src/scraper.js');
const { adapters } = await import('../src/sites/index.js');

// 1) IdeaSoft-smart: filamentmarketim token akışı (önbelleği aşan sahte yol)
console.log('=== 1) IdeaSoft-smart dürüst hata ===');
{
  const ctx = { spend: 0 };
  const adapter = adapters.find(a => a.id === 'filamentmarketim');
  try {
    await adapter.searchProducts('xyz-olmayan-urun-sorgusu-987', ctx);
    console.log('  ?! hata BEKLENİYORDU ama sonuç döndü');
  } catch (e) {
    console.log('  hata mesajı:', String(e.message || e).slice(0, 160));
  }
}

// 2) URHANSHOP: yeni sorgu (önbellekte yok) → tam Crawlbase akışı
console.log('\n=== 2) URHANSHOP canlı Crawlbase akışı ===');
{
  const adapter = adapters.find(a => a.id === 'urhanshop');
  const ctx = { spend: 0 };
  try {
    const adaylar = await adapter.searchProducts('petg filament', ctx);
    console.log('  arama: ' + adaylar.length + ' aday | istek: ' + ctx.spend);
    for (const a of adaylar.slice(0, 2)) console.log('    -', (a.title || '').slice(0, 55), '|', a.price, 'TL');
  } catch (e) {
    console.log('  HATA:', String(e.message || e).slice(0, 160));
  }
}

// 3) n11: önbellekte olmayan ürün → ZenRows
console.log('\n=== 3) n11 → ZenRows ===');
{
  const ctx = { spend: 0 };
  try {
    const r = await fetchPage('http://www.n11.com/urun/bambu-lab-a1-3d-yazici-123456789', { site: 'n11', purpose: 'urun-test' });
    console.log('  durum:', r.status, '| saglayici:', r.saglayici, '| boyut:', (r.body || '').length);
  } catch (e) {
    // 404 olabilir — saglayicinin zenrows oldugunu logdan dogrulariz
    console.log('  hata (beklenebilir, ürün yok):', String(e.message || e).slice(0, 100));
  }
}
