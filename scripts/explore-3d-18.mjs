/** Kesif 18: cerez + dogru token ile IdeaSoft arama. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 1) kayitli sayfada SITE_CONFIG'i tam goster
const fm = fs.readFileSync('data/explore/3d/arama-filamentmarketim.html', 'utf8');
const scI = fm.indexOf('SITE_CONFIG');
console.log('SITE_CONFIG baglami:');
console.log(fm.slice(scI, scI + 600).replace(/\s+/g, ' '));

// 2) cerez + token akisi
async function dene(base) {
  console.log('\n=== ' + base + ' ===');
  // a) cerezleri topla
  const c1 = new AbortController();
  const t1 = setTimeout(() => c1.abort(), 30000);
  const s1 = await fetch(base + '/', { signal: c1.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  const html = await s1.text();
  clearTimeout(t1);
  const cookies = (s1.headers.getSetCookie?.() || []).map(c => c.split(';')[0]);
  console.log('cerezler:', cookies.join(' | ') || 'yok');
  const token = html.match(/token["']?\s*:\s*["']([a-f0-9]{32,64})["']/i)?.[1];
  console.log('token:', token || 'yok');

  // b) arama POST (cerez + token)
  const c2 = new AbortController();
  const t2 = setTimeout(() => c2.abort(), 30000);
  const res = await fetch(base + '/client/Visitor/search?length=20', {
    signal: c2.signal,
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Content-Token': token || '',
      'Referer': base + '/',
      ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
    },
    body: new URLSearchParams({ dataType: 'json', phrase: 'pla filament' }).toString(),
  });
  const text = await res.text();
  clearTimeout(t2);
  console.log('arama durum:', res.status, '| boyut:', text.length);
  console.log('yanit:', text.slice(0, 500));
}

await dene('https://www.filamentmarketim.com');
