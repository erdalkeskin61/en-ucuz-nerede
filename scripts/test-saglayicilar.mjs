/**
 * Yedek kazima saglayicilari testi — her saglayici icin ayni senaryolar:
 *   1) Anahtar gecerli mi (ipinfo.io/json, geo YOK)
 *   2) TR cikisi (ipinfo.io/json + country=tr)
 *   3) Gercek site (n11 arama — JSON-LD ItemList kontrolu)
 *   4) POST govdesi (postman-echo.com/post — yalnizca destekleyenler)
 * Anahtarlar .env'den okunur; loglara asla yazilmaz.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const keys = {
  zenrows: env.match(/ZENROWS_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
  scrapingbee: env.match(/SCRAPINGBEE_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
  crawlbase: env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim(),
  zyte: env.match(/ZYTE_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
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

const N11 = 'http://www.n11.com/arama?q=' + encodeURIComponent('pla filament');

// ---- Saglayici sarmalayicilari ----

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

async function zyte(govde) {
  const auth = Buffer.from(keys.zyte + ':').toString('base64');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch('https://api.zyte.com/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + auth },
      body: JSON.stringify(govde),
      signal: controller.signal,
    });
    const text = await res.text();
    clearTimeout(t);
    let j = null;
    try { j = JSON.parse(text); } catch {}
    let body = '';
    if (j?.httpResponseBody) {
      const buf = Buffer.from(j.httpResponseBody, 'base64');
      try { body = zlib.gunzipSync(buf).toString('utf8'); } catch { body = buf.toString('utf8'); }
    }
    return { status: res.status, text: body, ham: text, json: j };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, text: '', ham: '', hata: String(e.message || e).slice(0, 60) };
  }
}

// ---- Ortak analiz ----

function ipInfo(r) {
  try {
    const j = JSON.parse(r.text);
    return `durum=${r.status} | ulke=${j.country} | IP=${(j.ip || '').slice(0, 12)} | sehir=${j.city || '?'}`;
  } catch {
    return `durum=${r.status} | govde okunamadi: ${String(r.text).slice(0, 80)}`;
  }
}

function n11Kontrol(r) {
  const ok = r.text.includes('ItemList') && r.text.includes('"@type":"Product"');
  const fiyat = (r.text.match(/\d[\d.,]*\s*TL/g) || []).length;
  return `durum=${r.status} | ItemList: ${ok ? 'VAR ✓' : 'YOK ✗'} | fiyat gecis: ${fiyat} | boyut: ${r.text.length}`;
}

function postKontrol(r) {
  const ok = r.text.includes('test-verisi') || r.text.includes('test_verisi');
  return `durum=${r.status} | govde hedefe ulasti: ${ok ? 'EVET ✓' : 'HAYIR ✗'} | ${String(r.text).slice(0, 100).replace(/\s+/g, ' ')}`;
}

// ================= ZENROWS =================
console.log('################ ZENROWS ################');
{
  console.log('[1] anahtar (geo yok):', ipInfo(await zenrows('https://ipinfo.io/json')));
  console.log('[2] TR cikisi:', ipInfo(await zenrows('https://ipinfo.io/json', { country_code: 'tr', premium_proxy: 'true' })));
  console.log('[3] n11 arama:', n11Kontrol(await zenrows(N11)));
  console.log('[4] POST denemesi:', postKontrol(await zenrows('https://postman-echo.com/post', { method: 'post' })));
}

// ================= SCRAPINGBEE =================
console.log('\n################ SCRAPINGBEE ################');
{
  console.log('[1] anahtar (render_js=false):', ipInfo(await scrapingbee('https://ipinfo.io/json', { render_js: 'false' })));
  console.log('[2] TR cikisi (premium):', ipInfo(await scrapingbee('https://ipinfo.io/json', { render_js: 'false', country_code: 'tr', premium_proxy: 'true' })));
  console.log('[3] n11 arama:', n11Kontrol(await scrapingbee(N11, { render_js: 'false' })));
  // Oturum testi: ayni session_id ile 2 istek — IP ayni kalmali
  const s1 = await scrapingbee('https://ipinfo.io/json', { render_js: 'false', session_id: '42' });
  const s2 = await scrapingbee('https://ipinfo.io/json', { render_js: 'false', session_id: '42' });
  const ip1 = s1.text.match(/"ip":\s*"([^"]+)"/)?.[1];
  const ip2 = s2.text.match(/"ip":\s*"([^"]+)"/)?.[1];
  console.log('[4] oturum (session_id=42):', `IP1=${(ip1 || '?').slice(0, 14)} IP2=${(ip2 || '?').slice(0, 14)} -> ${ip1 && ip1 === ip2 ? 'AYNI ✓' : 'FARKLI ✗'}`);
}

// ================= CRAWLBASE =================
console.log('\n################ CRAWLBASE ################');
{
  console.log('[1] anahtar:', ipInfo(await crawlbase('https://ipinfo.io/json')));
  console.log('[2] TR cikisi:', ipInfo(await crawlbase('https://ipinfo.io/json', { country: 'TR' })));
  console.log('[3] n11 arama:', n11Kontrol(await crawlbase(N11, { country: 'TR' })));
  // POST testi: postman-echo'ya form govdesi
  const postGovde = 'test-verisi=deneme&ikinci=42';
  const r = await crawlbase('https://postman-echo.com/post', { country: 'TR' }, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postGovde,
  });
  console.log('[4] POST:', postKontrol(r));
  // Oturum testi: cookies_session ile 2 istek — IP ayni kalmali (uyari: cookies_session cerez oturumu)
  const c1 = await crawlbase('https://ipinfo.io/json', { cookies_session: 'tests42' });
  const c2 = await crawlbase('https://ipinfo.io/json', { cookies_session: 'tests42' });
  const cip1 = c1.text.match(/"ip":\s*"([^"]+)"/)?.[1];
  const cip2 = c2.text.match(/"ip":\s*"([^"]+)"/)?.[1];
  console.log('[5] oturum (cookies_session):', `IP1=${(cip1 || '?').slice(0, 14)} IP2=${(cip2 || '?').slice(0, 14)} -> ${cip1 && cip1 === cip2 ? 'AYNI ✓' : 'FARKLI ✗'}`);
}

// ================= ZYTE =================
console.log('\n################ ZYTE ################');
{
  const z1 = await zyte({ url: 'https://ipinfo.io/json', httpResponseBody: true });
  console.log('[1] anahtar:', ipInfo({ status: z1.status, text: z1.text || z1.ham }));
  if (z1.status !== 200 && z1.json?.error) console.log('    hata:', String(z1.json.error?.description || z1.json.error?.message || z1.ham).slice(0, 150));
  const z2 = await zyte({ url: 'https://ipinfo.io/json', httpResponseBody: true, geolocation: 'tr' });
  console.log('[2] TR cikisi:', ipInfo({ status: z2.status, text: z2.text || z2.ham }));
  if (z2.json?.error) console.log('    hata:', String(z2.json.error?.description || z2.json.error?.message || '').slice(0, 150));
  const z3 = await zyte({ url: N11, httpResponseBody: true, geolocation: 'tr' });
  console.log('[3] n11 arama:', n11Kontrol({ status: z3.status, text: z3.text }));
  if (z3.json?.error) console.log('    hata:', String(z3.json.error?.description || z3.json.error?.message || '').slice(0, 150));
  const z4 = await zyte({
    url: 'https://postman-echo.com/post',
    httpResponseBody: true,
    httpRequestMethod: 'POST',
    httpRequestBody: Buffer.from('test-verisi=deneme&ikinci=42').toString('base64'),
    httpRequestBodyContentType: 'application/x-www-form-urlencoded',
  });
  console.log('[4] POST:', postKontrol({ status: z4.status, text: z4.text }));
}
