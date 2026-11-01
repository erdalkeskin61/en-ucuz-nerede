/** URHANSHOP POST 302 izolasyonu: başlıklı mı başlıksız mı? */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const cb = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();
const SABIT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function crawlbase(hedef, ekstra = {}, opts = {}) {
  const params = new URLSearchParams({ token: cb, url: hedef, get_cookies: 'true', ...ekstra });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch('https://api.crawlbase.com/?' + params.toString(), {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(opts.apiHeaders || {}) },
      body: opts.body,
      signal: controller.signal,
    });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let text;
    try { text = zlib.gunzipSync(Buffer.from(buf)).toString('utf8'); } catch { text = new TextDecoder('utf-8').decode(buf); }
    return { status: res.status, text, headers: res.headers };
  } catch (e) { return { status: 0, text: '', hata: String(e).slice(0, 50) }; }
}

// 1) Ana sayfa + cerez al
const r0 = await crawlbase('https://www.urhanshop.com/');
const vs = r0.text.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
const vsg = r0.text.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
const ev = r0.text.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
const cerez = (r0.headers.get('original_set_cookie') || '').split(/,(?=\s*[^;,\s]+=)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
console.log('ana sayfa: durum=' + r0.status, '| VIEWSTATE:', vs.length, '| cerez:', cerez.slice(0, 50));

const params = new URLSearchParams({ __VIEWSTATE: vs, __EVENTTARGET: 'ctl00$imgAraO', __EVENTARGUMENT: '', 'ctl00$arama3': 'petg filament' });
if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
if (ev) params.set('__EVENTVALIDATION', ev);

// 2a) Manuel tarz: sadece cookies parametresi
const rA = await crawlbase('https://www.urhanshop.com/', { cookies: cerez }, { method: 'POST', body: params.toString() });
console.log('A (sadece cerez)        : durum=' + rA.status, '| orijinal=' + rA.headers.get('original_status'), '| cb=' + rA.headers.get('cb_status'), '| boyut:', rA.text.length);

// 2b) Uygulama tarz: request_headers (UA + CT + Referer) + cookies
const rh = ['User-Agent:' + SABIT_UA, 'Content-Type:application/x-www-form-urlencoded', 'Referer:https://www.urhanshop.com/'].join('|');
const rB = await crawlbase('https://www.urhanshop.com/', { cookies: cerez, request_headers: rh }, { method: 'POST', body: params.toString() });
console.log('B (basliklar + cerez)   : durum=' + rB.status, '| orijinal=' + rB.headers.get('original_status'), '| cb=' + rB.headers.get('cb_status'), '| boyut:', rB.text.length);
