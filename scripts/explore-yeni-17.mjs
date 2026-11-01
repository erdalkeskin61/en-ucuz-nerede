/** Yeni parti keşif 17: koctas renderRetry denemeleri + robocombo/fixx3d kart yapilari. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) robocombo/fixx3d kart yapilari
console.log('=== robocombo/fixx3d kartlari ===');
for (const id of ['robocombo', 'fixx3d']) {
  const html = fs.readFileSync(`data/explore/yeni/arama-${id}.html`, 'utf8');
  console.log(`\n--- ${id} ---`);
  let i = -1; let n = 0;
  while ((i = html.indexOf('₺', i + 1)) >= 0 && n < 3) {
    console.log('  @' + i + ':', html.slice(Math.max(0, i - 400), i + 30).replace(/\s+/g, ' ').slice(-380));
    n++;
  }
}

// 2) koctas urun sayfasi: renderRetry (3 deneme; basarisizlar ucretsiz)
console.log('\n=== koctas renderRetry ===');
{
  const env = fs.readFileSync('.env', 'utf8');
  const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
  if (key) {
    for (let deneme = 1; deneme <= 3; deneme++) {
      try {
        const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent('https://www.koctas.com.tr/anycubic-pla-filament-gri-175mm-1kg/p/5003215696')}`, { signal: AbortSignal.timeout(90000) });
        const text = await res.text();
        console.log(`deneme ${deneme}: durum=${res.status} boyut=${text.length}`);
        if (res.status === 200 && text.length > 50000) {
          fs.writeFileSync('data/explore/yeni/urun-koctas.html', text);
          const fi = text.search(/([\d.,]+)\s*TL/);
          console.log('BASARILI! fiyat bolgesi:', fi > 0 ? text.slice(Math.max(0, fi - 150), fi + 20).replace(/\s+/g, ' ').slice(0, 170) : '?');
          break;
        }
      } catch (e) { console.log(`deneme ${deneme} HATA:`, String(e.message || e).slice(0, 40)); }
    }
  }
}
