// Yerel tarayıcı testi 2: adaptörlerin GERÇEK arama URL'leriyle
import { chromium } from 'playwright';
import { adapters } from '../src/sites/index.js';

const tarayici = await chromium.launch({ headless: true });
const TESTLER = [
  ['trendyol', 'rampage x-ranger'],
  ['n11', 'pla'],
  ['hepsiburada', 'rampage x-ranger'],
  ['incehesap', 'ekran karti'],
  ['ciceksepeti', 'filament'],
  ['teknosa', 'kulaklik'],
  ['amazon', 'rampage x-ranger'],
];

for (const [siteId, q] of TESTLER) {
  const a = adapters.find(x => x.id === siteId);
  const url = a.searchUrl(q);
  const ctx = await tarayici.newContext({
    locale: 'tr-TR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const sayfa = await ctx.newPage();
  const t0 = Date.now();
  try {
    await sayfa.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const baslik = await sayfa.title();
    if (/just a moment|attention required|güvenlik|security/i.test(baslik)) {
      await sayfa.waitForTimeout(10000); // CF sorgusuna süre ver
    }
    await sayfa.waitForTimeout(5000);
  } catch (e) { /* değerlendirme yine de denenir */ }
  try {
    // HTML'i adaptörün ayrıştırıcısına ver (fetch'siz) — searchProducts fetch kullanıyor;
    // bunun yerine doğrudan html'i test edemeyiz, kart sayısını genel seçicilerle ölçelim
    const kartSayisi = await sayfa.evaluate(() => {
      const adaylar = ['a.p-card-wrppr', 'div.p-card-wrppr', '[class*="p-card"]', 'div[data-component-type="s-search-result"]',
        'ul#resultList li', '.columnContent', 'a.product-list-link', '[class*="product"]', '.ems-prd'];
      let enIyi = 0;
      for (const s of adaylar) { try { const n = document.querySelectorAll(s).length; if (n > enIyi) enIyi = n; } catch {} }
      return enIyi;
    });
    const sonBaslik = await sayfa.title();
    const htmlUzunluk = (await sayfa.content()).length;
    console.log(`${htmlUzunluk > 50000 ? 'OK  ' : 'HATA'} ${siteId.padEnd(13)} ${(Date.now() - t0) / 1000 | 0} sn, kart~${kartSayisi}, ${(htmlUzunluk / 1024) | 0} KB, "${sonBaslik.slice(0, 50)}"`);
  } catch (e) {
    console.log(`HATA ${siteId}: ${String(e.message).slice(0, 80)}`);
  } finally {
    await ctx.close();
  }
}
await tarayici.close();
