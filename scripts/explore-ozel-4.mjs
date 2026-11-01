/** urhanshop cookie akisi + ciceksepeti qtext/suggest denemeleri. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal, method: opts.method || 'GET', redirect: opts.redirect || 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html', ...(opts.headers || {}) },
      body: opts.body,
    });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let text;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      text = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { text = new TextDecoder('utf-8').decode(buf); }
    return { durum: res.status, text, url: res.url, cookies: res.headers.getSetCookie?.() || [] };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 40), cookies: [] }; }
}

// 1) urhanshop: POST -> cookie -> GET aramasonuc.aspx
console.log('=== urhanshop cookie akisi ===');
{
  const r0 = await cek('https://www.urhanshop.com/');
  const vs = r0.text.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
  const vsg = r0.text.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
  const ev = r0.text.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
  const params = new URLSearchParams({ __VIEWSTATE: vs, __EVENTTARGET: 'ctl00$imgAraO', __EVENTARGUMENT: '', 'ctl00$arama3': 'filament' });
  if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
  if (ev) params.set('__EVENTVALIDATION', ev);

  const cookie0 = r0.cookies.map(c => c.split(';')[0]).join('; ');
  const rp = await cek('https://www.urhanshop.com/', 25000, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie0 ? { Cookie: cookie0 } : {}) },
    body: params.toString(),
  });
  const tumCerezler = [...r0.cookies, ...rp.cookies].map(c => c.split(';')[0]);
  const cerez = [...new Set(tumCerezler)].join('; ');
  console.log('POST:', rp.durum, '| Location:', rp.headers?.location || rp.url, '| cerez sayisi:', tumCerezler.length);

  if (rp.durum === 302 || rp.durum === 200) {
    const rg = await cek('https://www.urhanshop.com/aramasonuc.aspx', 25000, {
      headers: cerez ? { Cookie: cerez } : {},
    });
    const urun = (rg.text.match(/-u\d+['"]/g) || []).length;
    const fiyat = (rg.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
    console.log('GET aramasonuc: durum=' + rg.durum, '| urun:', urun, '| fiyat:', fiyat, '| title:', (rg.text.match(/<title>([^<]{3,70})</i)?.[1] || '?').trim().slice(0, 60));
    if (urun > 3) {
      fs.writeFileSync('data/explore/yeni/arama-urhanshop.html', rg.text);
      console.log('KAYDEDILDI ✓');
    }
  }
}

// 2) ciceksepeti: qtext/suggest URL denemeleri (dogrudan)
console.log('\n=== ciceksepeti URL denemeleri (dogrudan) ===');
for (const [ad, u] of [
  ['arama?qtext=', 'https://www.ciceksepeti.com/arama?qtext=cicek'],
  ['tum-urunler?qtext=', 'https://www.ciceksepeti.com/tum-urunler?qtext=cicek'],
  ['suggest', 'https://www.ciceksepeti.com/suggest/?q=cicek'],
  ['Suggest', 'https://www.ciceksepeti.com/Suggest/?keyword=cicek'],
]) {
  const r = await cek(u, 15000);
  console.log(`${ad}: durum=${r.durum} boyut=${r.text.length} ${r.hata || ''}`);
}
