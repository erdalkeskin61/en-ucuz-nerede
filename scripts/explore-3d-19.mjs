/** Kesif 19: dogru SITE_CONFIG.token ile IdeaSoft arama. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function dene(base, sorgu = 'pla filament') {
  console.log('\n=== ' + base + ' ===');
  const c1 = new AbortController();
  const t1 = setTimeout(() => c1.abort(), 30000);
  const s1 = await fetch(base + '/', { signal: c1.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  const html = await s1.text();
  clearTimeout(t1);
  const cookies = (s1.headers.getSetCookie?.() || []).map(c => c.split(';')[0]);
  const token = html.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
  console.log('token:', token ? token.slice(0, 16) + '...' : 'YOK');

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
    body: new URLSearchParams({ dataType: 'json', phrase: sorgu }).toString(),
  });
  const text = await res.text();
  clearTimeout(t2);
  console.log('durum:', res.status, '| boyut:', text.length);
  console.log('yanit:', text.slice(0, 800));
  return text;
}

await dene('https://www.filamentmarketim.com');
await dene('https://www.teknikfilament3d.com');
