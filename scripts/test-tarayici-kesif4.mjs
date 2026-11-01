// Çiçeksepeti: çerez onayla + gerçek ürün kalıbı; Hepsiburada: Firefox denemesi
import { chromium, firefox } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) Çiçeksepeti: çerezleri kabul et, ürünleri say
{
  const tarayici = await chromium.launch({ headless: true });
  const ctx = await tarayici.newContext({ locale: 'tr-TR', userAgent: UA, viewport: { width: 1366, height: 900 } });
  const s = await ctx.newPage();
  await s.goto('https://www.ciceksepeti.com/arama?query=filament', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await s.waitForTimeout(3000);
  // çerez düğmesi
  const dugme = s.locator('button:has-text("Tümünü Kabul"), button:has-text("Kabul"), button:has-text("Onayla"), #onetrust-accept-btn-handler').first();
  try { await dugme.click({ timeout: 5000 }); console.log('CS: çerez düğmesine tıklandı'); } catch { console.log('CS: çerez düğmesi bulunamadı'); }
  await s.waitForTimeout(6000);
  const bilgi = await s.evaluate(() => ({
    baslik: document.title,
    linkler: [...document.querySelectorAll('a')].map(a => a.href).filter(h => /ciceksepeti\.com\/.+/i.test(h) && !/arama|kategori|sayfa|gizlilik|cerez|yardim/i.test(h)).slice(0, 5),
    toplamLink: document.querySelectorAll('a').length,
    metin: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  }));
  console.log('CS sonuç:', JSON.stringify(bilgi, null, 1));
  await ctx.close();
  await tarayici.close();
}

// 2) Hepsiburada: Firefox ile dene
{
  const tarayici = await firefox.launch({ headless: true });
  const ctx = await tarayici.newContext({ locale: 'tr-TR', viewport: { width: 1366, height: 900 } });
  const s = await ctx.newPage();
  try {
    await s.goto('https://www.hepsiburada.com/arama?q=filament', { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (let i = 0; i < 4; i++) {
      await s.waitForTimeout(5000);
      const baslik = await s.title();
      const kb = ((await s.content()).length / 1024) | 0;
      console.log(`HB-Firefox +${(i + 1) * 5} sn: "${baslik.slice(0, 45)}", ${kb} KB`);
      if (kb > 50 && !/güvenlik|security/i.test(baslik)) break;
    }
  } catch (e) { console.log('HB-Firefox hata: ' + String(e.message).slice(0, 80)); }
  await ctx.close();
  await tarayici.close();
}
