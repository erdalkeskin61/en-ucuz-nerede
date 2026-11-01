/** n11: 500 hata govdesini oku + country_code varyasyonlari + oturum denemeleri. */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const hedef = 'https://www.n11.com/';

// 1) hata govdesi
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(hedef)}`, { signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  console.log('500 govdesi (' + text.length + '):', text.slice(0, 300));
}

// 2) country_code olmadan (ScraperAPI varsayilan ABD cikisi)
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent('https://www.n11.com/robots.txt')}`, { signal: AbortSignal.timeout(60000) }).catch(e => null);
  if (res) {
    const text = await res.text();
    console.log('\ncountry_code YOK robots.txt: durum=' + res.status, '| boyut:', text.length, '| title:', (text.match(/<title>([^<]{3,60})</i)?.[1] || 'yok').trim().slice(0, 40));
  }
}

// 3) oturumlu normal deneme (session_number ile - ayni IP havuzundan)
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&session_number=99911&url=${encodeURIComponent('https://www.n11.com/robots.txt')}`, { signal: AbortSignal.timeout(60000) }).catch(e => null);
  if (res) {
    const text = await res.text();
    console.log('oturumlu robots.txt: durum=' + res.status, '| boyut:', text.length);
  }
}
