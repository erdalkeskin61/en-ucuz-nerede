// Hepsiburada (uzun bekleme) + Çiçeksepeti (doğru URL) derinlemesine test
import { chromium } from 'playwright';
import { adapters } from '../src/sites/index.js';

const tarayici = await chromium.launch({ headless: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) Çiçeksepeti: adaptörün URL'i + sayfada ne var?
{
  const a = adapters.find(x => x.id === 'ciceksepeti');
  const url = a.searchUrl('filament');
  console.log('CS arama URL:', url);
  const ctx = await tarayici.newContext({ locale: 'tr-TR', userAgent: UA, viewport: { width: 1366, height: 900 } });
  const s = await ctx.newPage();
  await s.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await s.waitForTimeout(8000);
  const bilgi = await s.evaluate(() => ({
    url: location.href,
    baslik: document.title,
    urunLinkleri: [...document.querySelectorAll('a[href*="-p-"]')].length,
    metin: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 150),
  }));
  console.log('CS sonuç:', JSON.stringify(bilgi, null, 1));
  await ctx.close();
}

// 2) Hepsiburada: uzun bekleme ile güvenlik sayfası geçiliyor mu?
{
  const a = adapters.find(x => x.id === 'hepsiburada');
  const url = a.searchUrl('rampage x-ranger');
  const ctx = await tarayici.newContext({ locale: 'tr-TR', userAgent: UA, viewport: { width: 1366, height: 900 } });
  const s = await ctx.newPage();
  await s.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  for (let i = 0; i < 6; i++) {
    await s.waitForTimeout(5000);
    const baslik = await s.title();
    const htmlUzunluk = (await s.content()).length;
    console.log(`HB +${(i + 1) * 5} sn: "${baslik.slice(0, 45)}", ${(htmlUzunluk / 1024) | 0} KB`);
    if (htmlUzunluk > 50000 && !/güvenlik|security/i.test(baslik)) break;
  }
  await ctx.close();
}

// 3) Trendyol ürün sayfası da kontrol (yalnız arama değil)
{
  const ctx = await tarayici.newContext({ locale: 'tr-TR', userAgent: UA, viewport: { width: 1366, height: 900 } });
  const s = await ctx.newPage();
  await s.goto('https://www.trendyol.com/rampage/x-ranger-7-1-rgb-usb-mikrofonlu-oyuncu-kulakligi-gaming-kulaklik-p-99730583?boutiqueId=61&merchantId=129210', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await s.waitForTimeout(5000);
  const fiyat = await s.evaluate(() => document.body.innerText.match(/([\d.]+,?\d*)\s*TL/)?.[1] || null);
  console.log('Trendyol ürün sayfası: başlık="' + (await s.title()).slice(0, 50) + '", fiyat=' + fiyat);
  await ctx.close();
}

await tarayici.close();
