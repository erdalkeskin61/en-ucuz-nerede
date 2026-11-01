/** URHANSHOP akışını Crawlbase ile dene: GET (çerez+VIEWSTATE) → POST → GET sonuç. */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const cb = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();

async function crawlbase(hedef, ekstra = {}, opts = {}) {
  const params = new URLSearchParams({ token: cb, url: hedef, ...ekstra });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch('https://api.crawlbase.com/?' + params.toString(), {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(opts.headers || {}) },
      body: opts.body,
      signal: controller.signal,
    });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let text;
    try { text = zlib.gunzipSync(Buffer.from(buf)).toString('utf8'); } catch { text = new TextDecoder('utf-8').decode(buf); }
    return { status: res.status, text, headers: res.headers };
  } catch (e) {
    return { status: 0, text: '', hata: String(e).slice(0, 60) };
  }
}

// 1) Ana sayfa: VIEWSTATE + cerez
const r0 = await crawlbase('https://www.urhanshop.com/', { get_cookies: 'true' });
const vs = r0.text.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
const vsg = r0.text.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
const ev = r0.text.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
const setCookie = r0.headers.get('original_set_cookie') || '';
const cerez = setCookie.split(/,(?=[^;]*=)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
console.log('1) ana sayfa: durum=' + r0.status, '| VIEWSTATE:', vs.length, '| cerez:', cerez.slice(0, 60));

// 2) Postback
const params = new URLSearchParams({ __VIEWSTATE: vs, __EVENTTARGET: 'ctl00$imgAraO', __EVENTARGUMENT: '', 'ctl00$arama3': 'filament' });
if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
if (ev) params.set('__EVENTVALIDATION', ev);
const rp = await crawlbase('https://www.urhanshop.com/', { cookies: cerez }, {
  method: 'POST', body: params.toString(),
});
console.log('2) postback: durum=' + rp.status, '| cb=' + rp.headers.get('cb_status'), '| orijinal=' + rp.headers.get('original_status'), '| boyut:', rp.text.length);

// 3) Sonuç sayfasi
const rg = await crawlbase('https://www.urhanshop.com/aramasonuc.aspx', { cookies: cerez });
const urun = (rg.text.match(/-u\d+['"]/g) || []).length;
const fiyat = (rg.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
console.log('3) aramasonuc: durum=' + rg.status, '| cb=' + rg.headers.get('cb_status'), '| urun linki:', urun, '| fiyat:', fiyat);
