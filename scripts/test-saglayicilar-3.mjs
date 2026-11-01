/**
 * Saglayici testi 3. tur:
 *  - ZenRows 400 hatalarinin govdesini oku (parametre adi yanlis olabilir)
 *  - ScrapingBee: Set-Cookie aktarimi (Spb- onekli) + Trendyol urun sayfasi (TR + TL fiyat)
 *  - Crawlbase: Trendyol (TR geo olmadan TL fiyat gelir mi?) + get_cookies
 *  - ZenRows: Trendyol (duz, sonra render+premium)
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const keys = {
  zenrows: env.match(/ZENROWS_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
  scrapingbee: env.match(/SCRAPINGBEE_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
  crawlbase: env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim(),
};

async function cek(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.ms || 90000);
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      signal: controller.signal,
    });
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
async function crawlbase(hedef, ekstra = {}, opts = {}) {
  const params = new URLSearchParams({ token: keys.crawlbase, url: hedef, ...ekstra });
  return cek('https://api.crawlbase.com/?' + params.toString(), opts);
}

// Trendyol urun sayfasi (TL fiyat ve JSON-Ld kontrolu)
const TRENDYOL = 'https://www.trendyol.com/kingroon/kingroon-pla-filament-1-75mm-1-kg-p-325465470';
// bilinmeyen urun olabilir; genel bir arama sayfasi daha guvenli:
const T_ARAMA = 'https://www.trendyol.com/sr?q=' + encodeURIComponent('pla filament');

function trendyolKontrol(r) {
  const tl = (r.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  const jsonLd = r.text.includes('"@type"') && /Product|ItemList/.test(r.text);
  const cf = /Attention Required|cf-browser-verification|challenge/i.test(r.text);
  return `durum=${r.status} | TL fiyat: ${tl} | JSON-LD: ${jsonLd ? 'VAR ✓' : 'YOK'} | CF engel: ${cf ? 'EVET ✗' : 'hayır'} | boyut: ${r.text.length}`;
}

// ---- 1) ZenRows hata govdesi ----
console.log('=== ZENROWS hata ayiklama ===');
{
  const r1 = await zenrows('https://api.country.is/', { country_code: 'tr', premium_proxy: 'true' });
  console.log('country.is + premium:', `durum=${r1.status} | govde: ${r1.text.slice(0, 200)}`);
  const r2 = await zenrows('https://api.country.is/');
  console.log('country.is duz      :', `durum=${r1.status === 400 ? r2.status : '?'} | govde: ${r2.text.slice(0, 120)}`);
}

// ---- 2) ScrapingBee: cerez aktarimi + Trendyol ----
console.log('\n=== SCRAPINGBEE cerez + Trendyol ===');
{
  // Set-Cookie aktarimi: postman-echo/get cevap basliklarini Spb- onekiyle dondurur
  const r0 = await scrapingbee('https://postman-echo.com/cookies/set?test=cerez1', { render_js: 'false', transparent_status_code: 'true' });
  const spbCookie = [...r0.headers.entries()].filter(([k]) => k.toLowerCase().startsWith('spb-')).map(([k, v]) => k + '=' + v.slice(0, 40));
  console.log('Spb- basliklari:', spbCookie.length ? spbCookie.join(' | ').slice(0, 200) : 'YOK');
  // Trendyol arama (render'siz, premium+TR)
  const r1 = await scrapingbee(T_ARAMA, { render_js: 'false', country_code: 'tr', premium_proxy: 'true', transparent_status_code: 'true' });
  console.log('Trendyol arama (render-js=false):', trendyolKontrol(r1));
  // Trendyol arama (render'li)
  const r2 = await scrapingbee(T_ARAMA, { render_js: 'true', country_code: 'tr', premium_proxy: 'true', transparent_status_code: 'true' });
  console.log('Trendyol arama (render)        :', trendyolKontrol(r2));
}

// ---- 3) Crawlbase: Trendyol + cerez ----
console.log('\n=== CRAWLBASE Trendyol + cerez ===');
{
  const r1 = await crawlbase(T_ARAMA, { get_cookies: 'true', get_headers: 'true' });
  console.log('Trendyol arama:', `durum=${r1.status} cb=${r1.headers.get('cb_status')} orijinal=${r1.headers.get('original_status')} |`, trendyolKontrol(r1).split('|').slice(1, 4).join('|'));
  const ck = r1.headers.get('original_set_cookie');
  console.log('Set-Cookie alindi:', ck ? 'EVET ✓ (' + ck.slice(0, 60) + ')' : 'hayır');
}

// ---- 4) ZenRows: Trendyol ----
console.log('\n=== ZENROWS Trendyol ===');
{
  const r1 = await zenrows(T_ARAMA, { js_render: 'true', premium_proxy: 'true', country_code: 'tr' });
  console.log('Trendyol arama (render+premium+TR):', trendyolKontrol(r1));
  if (r1.status === 400) console.log('  hata govdesi:', r1.text.slice(0, 200));
}
