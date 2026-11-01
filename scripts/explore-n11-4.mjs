/** n11 erisim stratejileri: mobil cihaz, gercekci basliklar, renderRetry. */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const hedef = 'https://www.n11.com/arama?q=' + encodeURIComponent('pla filament');

async function dene(ad, ekstra, headers = null, method = 'GET') {
  const params = new URLSearchParams({ api_key: key, url: hedef, country_code: 'tr', ...ekstra });
  if (headers && Object.keys(headers).length) params.set('keep_headers', 'true');
  try {
    const res = await fetch('https://api.scraperapi.com/?' + params.toString(), {
      method,
      headers: headers || {},
      signal: AbortSignal.timeout(90000),
    });
    const text = await res.text();
    const t = (text.match(/<title>([^<]{3,70})</i)?.[1] || '').trim();
    const fiyat = (text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
    console.log(`${ad}: durum=${res.status} boyut=${text.length} fiyat=${fiyat} | ${t.slice(0, 45)}`);
    if (res.status === 200 && fiyat > 5) {
      fs.writeFileSync('data/explore/yeni/arama-n11.html', text);
      console.log('  -> KAYDEDILDI ✓');
      return true;
    }
  } catch (e) { console.log(`${ad}: HATA ${String(e.message || e).slice(0, 40)}`); }
  return false;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) render + gercekci basliklar
await dene('render+basliklar', { render: 'true' }, {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
});

// 2) mobil cihaz render
await dene('render+mobil', { render: 'true', device_type: 'mobile' }, {});

// 3) renderRetry mantigi: 3 deneme (basarisizlar ucretsiz)
for (let i = 1; i <= 3; i++) {
  const ok = await dene(`render deneme ${i}`, { render: 'true' }, {});
  if (ok) break;
}
