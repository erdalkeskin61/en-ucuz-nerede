/** Kesif 21: ScraperAPI session_number ile ayni IP'den token + POST akisi. */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const oturum = 'test' + Date.now() % 100000;

// 1) ayni oturumla ana sayfa (token)
const apiGet = `https://api.scraperapi.com/?api_key=${key}&country_code=tr&session_number=${oturum}&keep_headers=true&url=${encodeURIComponent('https://www.filamentmarketim.com/')}`;
const c1 = new AbortController();
const t1 = setTimeout(() => c1.abort(), 60000);
const s1 = await fetch(apiGet, { signal: c1.signal, headers: { 'User-Agent': UA } });
const html = await s1.text();
clearTimeout(t1);
console.log('ana sayfa: durum:', s1.status, '| boyut:', html.length);
const token = html.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
console.log('token:', token ? token.slice(0, 14) + '...' : 'YOK');

if (token) {
  // 2) ayni oturumla POST
  const apiPost = `https://api.scraperapi.com/?api_key=${key}&country_code=tr&session_number=${oturum}&keep_headers=true&url=${encodeURIComponent('https://www.filamentmarketim.com/client/Visitor/search?length=20')}`;
  const c2 = new AbortController();
  const t2 = setTimeout(() => c2.abort(), 60000);
  const s2 = await fetch(apiPost, {
    signal: c2.signal,
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept-Content-Token': token,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ dataType: 'json', phrase: 'pla filament' }).toString(),
  });
  const text = await s2.text();
  clearTimeout(t2);
  console.log('POST: durum:', s2.status, '| boyut:', text.length, '| basarili:', text.includes('"name"'));
  console.log('yanit:', text.slice(0, 300));
}
