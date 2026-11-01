/** urhanshop POST (duzeltilmis) + ciceksepeti sitemap/arama keşfi. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal, method: opts.method || 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xml', ...(opts.headers || {}) },
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
    return { durum: res.status, text, url: res.url };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 50) }; }
}

// 1) urhanshop POST (dogru parametre adlariyla)
console.log('=== urhanshop POST ===');
{
  const r0 = await cek('https://www.urhanshop.com/');
  const vs = r0.text.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
  const vsg = r0.text.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
  const ev = r0.text.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
  const params = new URLSearchParams();
  params.set('__VIEWSTATE', vs);
  if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
  if (ev) params.set('__EVENTVALIDATION', ev);
  params.set('__EVENTTARGET', 'ctl00$imgAraO');
  params.set('__EVENTARGUMENT', '');
  params.set('ctl00$arama3', 'filament');
  const r1 = await cek('https://www.urhanshop.com/', 30000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.urhanshop.com/' },
    body: params.toString(),
  });
  const urun = (r1.text.match(/-u\d+['"]/g) || []).length;
  const title = (r1.text.match(/<title>([^<]{3,90})</i)?.[1] || '?').trim();
  console.log('durum=' + r1.durum, '| son url:', r1.url.slice(0, 90), '| urun linki:', urun, '| title:', title.slice(0, 60));
  if (urun > 3) {
    fs.writeFileSync('data/explore/yeni/arama-urhanshop.html', r1.text);
    console.log('KAYDEDILDI');
  }
}

// 2) ciceksepeti sitemap
console.log('\n=== ciceksepeti sitemap ===');
{
  const r = await cek('https://www.ciceksepeti.com/sitemap.xml');
  console.log('durum:', r.durum, '| boyut:', r.text.length);
  if (r.durum === 200 && r.text.length > 100) {
    console.log(r.text.slice(0, 600));
    const altHaritalar = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).slice(0, 15);
    console.log('\nalt sitemapler:', altHaritalar.join('\n  '));
  }
}
