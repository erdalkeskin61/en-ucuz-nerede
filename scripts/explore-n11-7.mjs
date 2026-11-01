/** n11: ultra_premium testleri (normal, sonra gerekirse render). */
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const hedef = 'https://www.n11.com/arama?q=' + encodeURIComponent('pla filament');

async function dene(ad, ekstra) {
  const params = new URLSearchParams({ api_key: key, url: hedef, country_code: 'tr', ...ekstra });
  try {
    const res = await fetch('https://api.scraperapi.com/?' + params.toString(), { signal: AbortSignal.timeout(120000) });
    const text = await res.text();
    const t = (text.match(/<title>([^<]{3,80})</i)?.[1] || 'yok').trim();
    const fiyat = (text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
    console.log(`${ad}: durum=${res.status} boyut=${text.length} fiyat=${fiyat} | ${t.slice(0, 55)}`);
    // kredi bilgisi (ScraperAPI yanit basliklari)
    const xkredi = res.headers.get('x-credits-used') || res.headers.get('x-request-cost') || '';
    if (xkredi) console.log('  kredi:', xkredi);
    if (res.status === 200 && fiyat > 5) {
      fs.writeFileSync('data/explore/yeni/arama-n11.html', text);
      console.log('  KAYDEDILDI ✓');
      return true;
    } else if (res.status !== 200) {
      console.log('  govde:', text.slice(0, 150));
    }
  } catch (e) { console.log(`${ad}: HATA ${String(e.message || e).slice(0, 40)}`); }
  return false;
}

// 1) ultra_premium normal
let ok = await dene('ultra_premium normal', { ultra_premium: 'true' });
// 2) ultra_premium + render (en pahali yol; yalnizca onceki basarisizsa)
if (!ok) ok = await dene('ultra_premium + render', { ultra_premium: 'true', render: 'true' });
// 3) premium + render (yalnizca hicbiri basarisizsa)
if (!ok) ok = await dene('premium + render', { premium: 'true', render: 'true' });
