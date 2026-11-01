// Yerel Playwright testi: CF korumalı + JS render sitiler geçiliyor mu?
import { chromium } from 'playwright';

const tarayici = await chromium.launch({ headless: true });
const Testler = [
  ['Trendyol ', 'https://www.trendyol.com/sr?q=rampage%20x-ranger', 'div.p-card-wrppr, .p-card-chldrn-cntnr, [class*=p-card]'],
  ['Amazon   ', 'https://www.amazon.com.tr/s?k=rampage+x-ranger', 'div[data-component-type="s-search-result"]'],
  ['n11      ', 'http://www.n11.com/arama?q=pla', 'ul#resultList, .columnContent, .pro'],
  ['Hepsib.  ', 'https://www.hepsiburada.com/arama?q=rampage%20x-ranger', '[data-test-id="product-list-item"], .product-item'],
  ['İncehesap', 'https://www.incehesap.com/arama?query=ekran%20karti', '.product-item, .p-card, [class*=product]'],
  ['Çiçeksep.', 'https://www.ciceksepeti.com/search?q=filament', '[class*=product]'],
  ['Teknosa  ', 'https://www.teknosa.com/arama?q=kulaklik', '[class*=product]'],
  ['PTT AVM  ', 'https://www.pttavm.com/arama?q=kulaklik', '[class*=product]'],
];

for (const [ad, url, secici] of Testler) {
  const ctx = await tarayici.newContext({
    locale: 'tr-TR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const sayfa = await ctx.newPage();
  const t0 = Date.now();
  try {
    await sayfa.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // CF sorgusu varsa geçmesi için bekle; sonra içerik gelmesi için biraz daha
    const baslik = await sayfa.title();
    if (/just a moment|attention required|challenge/i.test(baslik)) {
      await sayfa.waitForTimeout(8000);
    }
    await sayfa.waitForTimeout(4000);
    const sonBaslik = await sayfa.title();
    const kartSayisi = await sayfa.locator(secici).count().catch(() => -1);
    const html = await sayfa.content();
    console.log(`${kartSayisi > 0 ? 'OK  ' : 'HATA'} ${ad}: ${(Date.now() - t0) / 1000 | 0} sn, kart=${kartSayisi}, "${sonBaslik.slice(0, 45)}", html=${(html.length / 1024) | 0} KB`);
  } catch (e) {
    console.log(`HATA ${ad}: ${(Date.now() - t0) / 1000 | 0} sn — ${String(e.message).slice(0, 90)}`);
  } finally {
    await ctx.close();
  }
}
await tarayici.close();
