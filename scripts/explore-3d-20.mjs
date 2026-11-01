/** Kesif 20: cerezsiz token testi + ScraperAPI POST testi + suggest.json tam yapi. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) cerezsiz POST (token yeterli mi?)
console.log('=== cerezsiz token testi ===');
{
  const c1 = new AbortController();
  const t1 = setTimeout(() => c1.abort(), 30000);
  const s1 = await fetch('https://www.filamentmarketim.com/', { signal: c1.signal, headers: { 'User-Agent': UA } });
  const html = await s1.text();
  clearTimeout(t1);
  const token = html.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
  const c2 = new AbortController();
  const t2 = setTimeout(() => c2.abort(), 30000);
  const res = await fetch('https://www.filamentmarketim.com/client/Visitor/search?length=20', {
    signal: c2.signal,
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept-Content-Token': token,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ dataType: 'json', phrase: 'pla filament' }).toString(),
  });
  const text = await res.text();
  clearTimeout(t2);
  console.log('cerezsiz -> durum:', res.status, '| boyut:', text.length, '| basarili:', text.includes('"name"'));
}

// 2) ScraperAPI uzerinden: token al + POST ara
console.log('\n=== ScraperAPI akis testi ===');
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
if (key) {
  // a) token (ScraperAPI uzerinden ana sayfa)
  const apiGet = `https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent('https://www.filamentmarketim.com/')}`;
  const c3 = new AbortController();
  const t3 = setTimeout(() => c3.abort(), 60000);
  const s3 = await fetch(apiGet, { signal: c3.signal });
  const html3 = await s3.text();
  clearTimeout(t3);
  console.log('ana sayfa (ScraperAPI): durum:', s3.status, '| boyut:', html3.length);
  const token3 = html3.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
  console.log('token:', token3 ? token3.slice(0, 14) + '...' : 'YOK');

  if (token3) {
    // b) POST (ScraperAPI uzerinden, keep_headers ile)
    const apiPost = `https://api.scraperapi.com/?api_key=${key}&country_code=tr&keep_headers=true&url=${encodeURIComponent('https://www.filamentmarketim.com/client/Visitor/search?length=20')}`;
    const c4 = new AbortController();
    const t4 = setTimeout(() => c4.abort(), 60000);
    try {
      const s4 = await fetch(apiPost, {
        signal: c4.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept-Content-Token': token3,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({ dataType: 'json', phrase: 'pla filament' }).toString(),
      });
      const text4 = await s4.text();
      clearTimeout(t4);
      console.log('POST (ScraperAPI): durum:', s4.status, '| boyut:', text4.length);
      console.log('yanit:', text4.slice(0, 300));
    } catch (e) { clearTimeout(t4); console.log('POST hatasi:', String(e.message || e).slice(0, 80)); }
  }
}

// 3) 3dteknomarket suggest.json tam yapi
console.log('\n=== 3dteknomarket suggest.json tam ===');
{
  const c5 = new AbortController();
  const t5 = setTimeout(() => c5.abort(), 30000);
  const r5 = await fetch('https://3dteknomarket.com/search/suggest.json?q=pla+filament&resources[type]=product&resources[limit]=3&resources[options][fields]=title,product_type,variants.title,tag', { signal: c5.signal, headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  const text5 = await r5.text();
  clearTimeout(t5);
  try {
    const j = JSON.parse(text5);
    const urunler = j?.resources?.results?.products || [];
    console.log('urun sayisi:', urunler.length);
    if (urunler[0]) {
      console.log('alanlar:', Object.keys(urunler[0]).join(', '));
      console.log('ornek:', JSON.stringify({ ...urunler[0], body: '(uzun)' }).slice(0, 500));
    }
  } catch { console.log('parse hatasi:', text5.slice(0, 200)); }
}
