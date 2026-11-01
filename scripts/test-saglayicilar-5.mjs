/**
 * Saglayici testi 5. tur (son):
 *  - ZenRows: Trendyol + Ciceksepeti (proxy_country=tr, dogru parametreyle)
 *  - Crawlbase: Incehesap arama (javascript=true) — ScraperAPI'de en pahali sitemiz
 *  - Tum yanit basliklarindan kredi/maliyet bilgisi topla
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const keys = {
  zenrows: env.match(/ZENROWS_API_KEY=([^\r\n]+)/)?.[1]?.trim(),
  crawlbase: env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim(),
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
async function crawlbase(hedef, ekstra = {}, opts = {}) {
  const params = new URLSearchParams({ token: keys.crawlbase, url: hedef, ...ekstra });
  return cek('https://api.crawlbase.com/?' + params.toString(), opts);
}

const T_ARAMA = 'https://www.trendyol.com/sr?q=' + encodeURIComponent('pla filament');
const CICEK = 'https://www.ciceksepeti.com/arama?query=' + encodeURIComponent('orşide');
const INCEHESAP = 'https://www.incehesap.com/arama?q=' + encodeURIComponent('pla filament');

function kontrol(r, ne) {
  const tl = (r.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  const cf = /Attention Required|Just a moment|challenge-platform/i.test(r.text);
  const ozel = ne === 'cicek' ? /data-cs-product-box/.test(r.text) : r.text.includes('ItemList') || r.text.includes('"@type"');
  return `durum=${r.status} | ${ne === 'cicek' ? 'urun kartlari' : 'JSON-LD'}: ${ozel ? 'VAR ✓' : 'YOK ✗'} | TL: ${tl} | CF: ${cf ? 'ENGEL ✗' : 'geçti'} | boyut: ${r.text.length}`;
}

function maliyet(r) {
  const m = [...r.headers.entries()].filter(([k]) => /cost|credit|remaining|complexity|cb_status/i.test(k)).map(([k, v]) => k + '=' + v);
  return m.length ? m.join(' ') : '(maliyet başlığı yok)';
}

// ---- 1) ZenRows Trendyol ----
console.log('=== ZENROWS Trendyol (proxy_country=tr) ===');
{
  const r = await zenrows(T_ARAMA, { js_render: 'true', premium_proxy: 'true', proxy_country: 'tr' });
  console.log('render+premium+proxy_country:', kontrol(r, 't'));
  console.log('  maliyet:', maliyet(r));
}

// ---- 2) ZenRows Ciceksepeti ----
console.log('\n=== ZENROWS Ciceksepeti (proxy_country=tr) ===');
{
  const r = await zenrows(CICEK, { js_render: 'true', premium_proxy: 'true', proxy_country: 'tr' });
  console.log('render+premium+proxy_country:', kontrol(r, 'cicek'));
  console.log('  maliyet:', maliyet(r));
}

// ---- 3) Crawlbase Incehesap ----
console.log('\n=== CRAWLBASE Incehesap (javascript=true) ===');
{
  const r = await crawlbase(INCEHESAP, { javascript: 'true' });
  console.log('javascript=true:', kontrol(r, 'i'));
  console.log('  maliyet:', maliyet(r));
}
