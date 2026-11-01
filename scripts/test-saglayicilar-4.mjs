/**
 * Saglayici testi 4. tur:
 *  - ZenRows: dogru geo parametresi (country=tr?) + maliyet
 *  - ScrapingBee: Trendyol STEALTH testi (spb-cost ile gercek kredi maliyeti)
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const keys = {
  zenrows: env.match(/ZENROWS_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
  scrapingbee: env.match(/SCRAPINGBEE_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
};

async function cek(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.ms || 120000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let text;
    try { text = zlib.gunzipSync(Buffer.from(buf)).toString('utf8'); } catch { text = new TextDecoder('utf-8').decode(buf); }
    return { status: res.status, text, headers: res.headers };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, text: '', hata: String(e.message || e).slice(0, 60) };
  }
}

async function zenrows(hedef, ekstra = {}) {
  const params = new URLSearchParams({ apikey: keys.zenrows, url: hedef, ...ekstra });
  return cek('https://api.zenrows.com/v1/?' + params.toString());
}
async function scrapingbee(hedef, ekstra = {}) {
  const params = new URLSearchParams({ api_key: keys.scrapingbee, url: hedef, ...ekstra });
  return cek('https://app.scrapingbee.com/api/v1/?' + params.toString());
}

const T_ARAMA = 'https://www.trendyol.com/sr?q=' + encodeURIComponent('pla filament');

function trendyolKontrol(r) {
  const tl = (r.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  const cf = /Attention Required|cf-browser-verification|challenge-platform|Just a moment/i.test(r.text);
  return `durum=${r.status} | TL fiyat: ${tl} | CF engel: ${cf ? 'EVET ✗' : 'hayır ✓'} | boyut: ${r.text.length}`;
}

// ---- 1) ZenRows geo parametresi ----
console.log('=== ZENROWS geo param ===');
for (const [ad, ek] of [
  ['country=tr', { country: 'tr', premium_proxy: 'true' }],
  ['proxy_country', { proxy_country: 'tr', premium_proxy: 'true' }],
]) {
  const r = await zenrows('https://api.country.is/', ek);
  console.log(`${ad}:`, `durum=${r.status} | ${r.text.slice(0, 100)}`);
}

// ---- 2) ScrapingBee: Trendyol STEALTH ----
console.log('\n=== SCRAPINGBEE Trendyol STEALTH ===');
{
  const r = await scrapingbee(T_ARAMA, {
    render_js: 'true', country_code: 'tr', stealth_proxy: 'true',
    transparent_status_code: 'true', block_resources: 'false',
  });
  console.log('stealth+render+TR:', trendyolKontrol(r));
  console.log('  spb-cost:', r.headers.get('spb-cost'), '| spb-credits...', r.headers.get('spb-used-credits'), '| maliyet basliklari:', [...r.headers.entries()].filter(([k]) => k.toLowerCase().includes('cost') || k.toLowerCase().includes('credit')).map(([k, v]) => k + '=' + v).join(', '));
}

// ---- 3) ZenRows: Trendyol (dogru param bulunursa) ----
console.log('\n=== ZENROWS Trendyol ===');
{
  const r = await zenrows(T_ARAMA, { js_render: 'true', premium_proxy: 'true', country: 'tr' });
  console.log('render+premium+country=tr:', trendyolKontrol(r));
  if (r.status === 400) console.log('  hata:', r.text.slice(0, 150));
}
