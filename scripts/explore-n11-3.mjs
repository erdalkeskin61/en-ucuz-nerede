/** n11 robots.txt (dogrudan) + render ana sayfa testi. */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();

// 1) robots.txt dogrudan (ciceksepeti'de calismisti)
{
  const res = await fetch('https://www.n11.com/robots.txt', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }, signal: AbortSignal.timeout(25000) }).catch(e => ({ status: 0, text: async () => '' }));
  const text = await res.text();
  console.log('robots.txt: durum=' + res.status, '| boyut:', text.length);
  if (text.length > 50) {
    console.log(text.slice(0, 900));
  }
}

// 2) render ana sayfa (10 kredi basariliysa)
{
  const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent('https://www.n11.com/')}`, { signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  console.log('\nrender ana sayfa: durum=' + res.status, '| boyut:', text.length, '| title:', (text.match(/<title>([^<]{3,70})</i)?.[1] || 'yok').trim());
  if (res.status === 200 && text.length > 100000) fs.writeFileSync('data/explore/yeni/ana-n11.html', text);
}
