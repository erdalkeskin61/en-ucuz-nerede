/** n11: son varyasyonlar — m.n11.com, www'suz, http. */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Ayni URL'yi hem dogrudan (kullanicinin makinesinden) hem ScraperAPI ile dene
async function dene(ad, url, scraperIle = true) {
  if (scraperIle) {
    const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(60000) }).catch(e => null);
    if (res) {
      const text = await res.text();
      console.log(`${ad} [ScraperAPI]: durum=${res.status} boyut=${text.length} | ${(text.match(/<title>([^<]{3,60})</i)?.[1] || '').trim().slice(0, 45)}`);
    }
  } else {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, signal: AbortSignal.timeout(30000) }).catch(e => null);
    if (res) {
      const text = await res.text();
      console.log(`${ad} [dogrudan]: durum=${res.status} boyut=${text.length} | ${(text.match(/<title>([^<]{3,60})</i)?.[1] || '').trim().slice(0, 45)}`);
    }
  }
}

await dene('m.n11.com', 'https://m.n11.com/', true);
await dene('wwwsuz', 'https://n11.com/', true);
await dene('http-www', 'http://www.n11.com/', true);

// API alt alan adlari
await dene('api.n11.com', 'https://api.n11.com/', true);
await dene('api-gw', 'https://api-gw.n11.com/', true);
