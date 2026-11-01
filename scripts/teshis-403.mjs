/** filamentmarketim 403 teşhisi: gövde + başlık/IP varyasyonları. */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) 403 govdesini oku (keep_headers'li, akistanin yaptigi gibi)
{
  const params = new URLSearchParams({ api_key: key, url: 'https://filamentmarketim.com/', country_code: 'tr', keep_headers: 'true' });
  const res = await fetch('https://api.scraperapi.com/?' + params, { method: 'GET', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  console.log('[keep_headers + UA] durum=' + res.status, '| boyut:', text.length);
  const t = (text.match(/<title>([^<]{3,80})</i)?.[1] || '').trim();
  console.log('  title:', t.slice(0, 70));
  console.log('  govde (ilk 250):', text.slice(0, 250).replace(/\s+/g, ' '));
}

// 2) keep_headers YOK, varsayilan UA ( ScraperAPI kendi UA'si)
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent('https://filamentmarketim.com/')}`, { signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  console.log('\n[duz istek] durum=' + res.status, '| boyut:', text.length, '| title:', (text.match(/<title>([^<]{3,70})</i)?.[1] || 'yok').trim().slice(0, 60));
}
