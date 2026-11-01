/**
 * Saglayici testi 6. tur: Hepsiburada + Incehesap kapanis testleri.
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

const HB = 'https://www.hepsiburada.com/ara?q=' + encodeURIComponent('pla filament');
const INCEHESAP = 'https://www.incehesap.com/arama?q=' + encodeURIComponent('pla filament');

function kontrol(r) {
  const tl = (r.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  const cf = /Attention Required|Just a moment|challenge-platform|cf-chl/i.test(r.text);
  const urun = /productListItem|product-list|__NEXT_DATA__|ItemList|"@type":"Product"/i.test(r.text);
  return `durum=${r.status} | urun verisi: ${urun ? 'VAR ✓' : 'YOK ✗'} | TL: ${tl} | CF: ${cf ? 'ENGEL ✗' : 'geçti'} | boyut: ${r.text.length}`;
}

// ---- 1) Hepsiburada: ZenRows premium ----
console.log('=== ZENROWS Hepsiburada ===');
{
  const r = await zenrows(HB, { js_render: 'true', premium_proxy: 'true', proxy_country: 'tr' });
  console.log('premium+render+TR:', kontrol(r), '| kredi:', r.headers.get('x-request-credits'));
}

// ---- 2) Hepsiburada: Crawlbase ----
console.log('\n=== CRAWLBASE Hepsiburada ===');
{
  const r = await crawlbase(HB, { javascript: 'true' });
  console.log('javascript=true:', kontrol(r), '| cb:', r.headers.get('cb_status'));
}

// ---- 3) Incehesap: ZenRows premium ----
console.log('\n=== ZENROWS Incehesap ===');
{
  const r = await zenrows(INCEHESAP, { js_render: 'true', premium_proxy: 'true', proxy_country: 'tr' });
  console.log('premium+render+TR:', kontrol(r), '| kredi:', r.headers.get('x-request-credits'));
}
