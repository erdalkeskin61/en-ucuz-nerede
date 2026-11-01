/**
 * Saglayici testi 2. tur:
 *  - api.country.is ile geo kontrolu (ipinfo ZenRows'a 400 vermisti)
 *  - ScrapingBee: n11 hata govdesi + premium/render denemeleri
 *  - Crawlbase: TR guvenilirligi (3 deneme), session parametresi, JS render
 *  - ZenRows + ScrapingBee: Ciceksepeti render testi (CF korumali, en zor senaryo)
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

const GEO = 'https://api.country.is/';
const N11 = 'http://www.n11.com/arama?q=' + encodeURIComponent('pla filament');
const CICEK = 'https://www.ciceksepeti.com/arama?query=' + encodeURIComponent('orşide');

function geoYaz(ad, r) {
  try {
    const j = JSON.parse(r.text);
    console.log(`${ad}: durum=${r.status} | ulke=${j.country} | IP=${(j.ip || '').slice(0, 14)}`);
  } catch {
    console.log(`${ad}: durum=${r.status} | govde: ${String(r.text).slice(0, 90).replace(/\s+/g, ' ')}`);
  }
}

function cicekKontrol(r) {
  const urun = /data-cs-product-box/.test(r.text) || /orşide|orkide/i.test(r.text);
  const fiyat = (r.text.match(/\d[\d.,]*\s*TL/g) || []).length;
  return `durum=${r.status} | urun karti: ${urun ? 'VAR ✓' : 'YOK ✗'} | fiyat gecis: ${fiyat} | boyut: ${r.text.length}`;
}

// ---- 1) Geo kontrolleri (api.country.is) ----
console.log('=== GEO (api.country.is) ===');
geoYaz('Zenrows TR      ', await zenrows(GEO, { country_code: 'tr', premium_proxy: 'true' }));
geoYaz('ScrapingBee TR  ', await scrapingbee(GEO, { render_js: 'false', country_code: 'tr', premium_proxy: 'true' }));
for (let i = 1; i <= 3; i++) {
  geoYaz(`Crawlbase TR #${i} `, await crawlbase(GEO, { country: 'TR' }));
}

// ---- 2) Crawlbase: session parametresi (IP yapiskanligi) ----
console.log('\n=== CRAWLBASE session parametresi ===');
{
  const s1 = await crawlbase(GEO, { session: 'testip42' });
  const s2 = await crawlbase(GEO, { session: 'testip42' });
  const ip1 = s1.text.match(/"ip":\s*"([^"]+)"/)?.[1];
  const ip2 = s2.text.match(/"ip":\s*"([^"]+)"/)?.[1];
  const u1 = s1.text.match(/"country":\s*"([^"]+)"/)?.[1];
  const u2 = s2.text.match(/"country":\s*"([^"]+)"/)?.[1];
  console.log(`session=testip42: IP1=${(ip1 || '?').slice(0, 14)} (${u1}) IP2=${(ip2 || '?').slice(0, 14)} (${u2}) -> ${ip1 && ip1 === ip2 ? 'AYNI ✓' : 'FARKLI ✗'}`);
}

// ---- 3) ScrapingBee: n11 hata ayiklama ----
console.log('\n=== SCRAPINGBEE n11 ===');
{
  const r1 = await scrapingbee(N11, { render_js: 'false', premium_proxy: 'true', country_code: 'tr', transparent_status_code: 'true' });
  console.log('premium+TR:', `durum=${r1.status} | boyut=${r1.text.length} | ItemList: ${r1.text.includes('ItemList') ? 'VAR ✓' : 'YOK'}`);
  if (!r1.text.includes('ItemList')) console.log('  hata govdesi:', r1.text.slice(0, 200).replace(/\s+/g, ' '));
}

// ---- 4) Crawlbase: n11 (JS token gerekir mi?) ----
console.log('\n=== CRAWLBASE n11 ===');
{
  const r1 = await crawlbase(N11, { country: 'TR' });
  console.log('normal:', `durum=${r1.status} | cb_status=${r1.headers.get('cb_status')} | orijinal=${r1.headers.get('original_status')} | ItemList: ${r1.text.includes('ItemList') ? 'VAR ✓' : 'YOK'}`);
  const r2 = await crawlbase(N11, { javascript: 'true', country: 'TR' });
  console.log('javascript=true:', `durum=${r2.status} | cb_status=${r2.headers.get('cb_status')} | ItemList: ${r2.text.includes('ItemList') ? 'VAR ✓' : 'YOK'}`);
}

// ---- 5) Ciceksepeti render testi (en zor senaryo) ----
console.log('\n=== CICEKSEPETI (render + CF) ===');
{
  const r1 = await scrapingbee(CICEK, { country_code: 'tr', premium_proxy: 'true', render_js: 'true', stealth_proxy: 'true', wait_for: '.product-item,a[data-cs-product-box]' });
  console.log('ScrapingBee (stealth+render):', cicekKontrol(r1));
}
{
  const r2 = await crawlbase(CICEK, { javascript: 'true', country: 'TR', ajax_wait: 'true' });
  console.log('Crawlbase (javascript):', `durum=${r2.status} | cb_status=${r2.headers.get('cb_status')} | ${cicekKontrol(r2)}`);
}
{
  const r3 = await zenrows(CICEK, { js_render: 'true', premium_proxy: 'true', country_code: 'tr', wait: '3000' });
  console.log('ZenRows (render+premium):', cicekKontrol(r3));
}
