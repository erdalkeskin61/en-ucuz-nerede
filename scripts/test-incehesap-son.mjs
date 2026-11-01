/** İncehesap /q/ URL ile son test. */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const zr = env.match(/ZENROWS_API_KEY=([^\r\n]+)/)?.[1]?.trim();
const cb = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();

async function cek(u, ms) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms || 120000);
    const r = await fetch(u, { signal: c.signal });
    clearTimeout(t);
    const b = await r.arrayBuffer();
    let txt;
    try { txt = zlib.gunzipSync(Buffer.from(b)).toString(); } catch { txt = new TextDecoder().decode(b); }
    return { status: r.status, text: txt, headers: r.headers };
  } catch (e) { return { status: 0, text: '', hata: String(e).slice(0, 50) }; }
}

const hedef = 'https://www.incehesap.com/q/pla+filament';
const urunRe = /productList|urun-list|ItemList|"@type"|price/i;

const r1 = await cek('https://api.zenrows.com/v1/?' + new URLSearchParams({ apikey: zr, url: hedef, js_render: 'true', premium_proxy: 'true', proxy_country: 'tr' }));
console.log('ZenRows  :', 'durum=' + r1.status, '| urun:', urunRe.test(r1.text) ? 'VAR' : 'YOK', '| TL:', (r1.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length, '| boyut:', r1.text.length, '| kredi:', r1.headers.get('x-request-credits'));

const r2 = await cek('https://api.crawlbase.com/?' + new URLSearchParams({ token: cb, url: hedef, javascript: 'true' }));
console.log('Crawlbase:', 'durum=' + r2.status, '| cb:', r2.headers.get('cb_status'), '| urun:', urunRe.test(r2.text) ? 'VAR' : 'YOK', '| TL:', (r2.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length, '| boyut:', r2.text.length);
