/** Kesif 17: IdeaSoft token + Visitor/search akisinin tam testi (filamentmarketim, teknikfilament3d). */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function ideasoftAra(base, sorgu) {
  // 1) token'i al
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
  const sayfa = await fetch(base + '/arama?k=x', { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  const html = await sayfa.text();
  clearTimeout(t);
  const token = html.match(/SITE_CONFIG\s*=\s*\{[^}]*["']?token["']?\s*:\s*["']([a-f0-9]{16,64})["']/i)?.[1]
    || html.match(/["']token["']\s*:\s*["']([a-f0-9]{16,64})["']/i)?.[1];
  if (!token) return { hata: 'token bulunamadi', htmlBoyut: html.length };
  console.log('  token:', token.slice(0, 12) + '...');

  // 2) arama POST
  const c2 = new AbortController();
  const t2 = setTimeout(() => c2.abort(), 30000);
  const body = new URLSearchParams({ dataType: 'json', phrase: sorgu });
  const res = await fetch(base + '/client/Visitor/search?length=20', {
    signal: c2.signal,
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Content-Token': token,
      'Referer': base + '/arama?k=x',
    },
    body: body.toString(),
  });
  const text = await res.text();
  clearTimeout(t2);
  return { durum: res.status, text };
}

for (const [ad, base] of [['filamentmarketim', 'https://www.filamentmarketim.com'], ['teknikfilament3d', 'https://www.teknikfilament3d.com']]) {
  console.log(`\n=== ${ad} ===`);
  const r = await ideasoftAra(base, 'pla filament');
  if (r.hata) { console.log('HATA:', r.hata, '| html boyut:', r.htmlBoyut); continue; }
  console.log('durum:', r.durum, '| boyut:', r.text.length);
  try {
    const j = JSON.parse(r.text);
    const items = j.results || j.data || j.products || j;
    if (Array.isArray(items)) {
      console.log('urun sayisi:', items.length);
      for (const it of items.slice(0, 3)) console.log('  ', JSON.stringify(it).slice(0, 250));
    } else {
      console.log('yanit:', JSON.stringify(j).slice(0, 400));
    }
  } catch { console.log('yanit (ilk 400):', r.text.slice(0, 400)); }
}

// matersan icin de dene (ayni IdeaSoft mu? token vardir)
console.log('\n=== matersan ===');
const r3 = await ideasoftAra('https://matersan.com.tr', 'pla filament');
if (r3.hata) console.log('HATA:', r3.hata);
else {
  console.log('durum:', r3.durum, '| boyut:', r3.text.length);
  console.log('yanit:', r3.text.slice(0, 300));
}
