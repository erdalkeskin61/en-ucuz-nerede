/** urhanshop ASP.NET postback analizi + ciceksepeti URL keşfi. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 30000, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal, method: opts.method || 'GET',
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
    return { durum: res.status, text, url: res.url };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 50) }; }
}

// 1) urhanshop: ana sayfadaki form ve VIEWSTATE yapisini incele
console.log('=== urhanshop form analizi ===');
{
  const ana = fs.readFileSync('data/explore/yeni/ana-urhanshop.html', 'utf8');
  // ana form
  const formM = ana.match(/<form[^>]*name="aspnetForm"[^>]*>/i) || ana.match(/<form[^>]*id="form1"[^>]*>/i) || ana.match(/<form[^>]*>/i);
  console.log('form:', formM ? formM[0].slice(0, 200) : 'yok');
  // hidden alanlar
  for (const alan of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__EVENTTARGET', '__EVENTARGUMENT']) {
    const m = ana.match(new RegExp('<input[^>]*name="' + alan + '"[^>]*>', 'i'));
    console.log(alan + ':', m ? 'VAR (' + m[0].length + ' karakter)' : 'yok');
  }
  // arama inputu tam hali
  const inp = ana.match(/<input[^>]*(?:id|name)="[^"]*arama[^"]*"[^>]*>/i) || ana.match(/<input[^>]*id="ctl00[^"]*"[^>]*type="text"[^>]*>/i);
  console.log('arama inputu:', inp ? inp[0].slice(0, 250) : '?');
  // __doPostBack cagrilari (arama ile ilgili)
  const dp = [...ana.matchAll(/__doPostBack\('([^']*)','([^']*)'\)/g)].slice(0, 6);
  for (const d of dp) console.log('doPostBack:', d[1], '|', d[2]);
  // arama butonu
  const btn = ana.match(/<input[^>]*imgAra[^>]*>/i) || ana.match(/<img[^>]*id="ctl00[^"]*imgAra[^"]*"[^>]*>/i);
  console.log('ara butonu:', btn ? btn[0].slice(0, 200) : '?');
}

// 2) urhanshop: VIEWSTATE ile POST denemesi
console.log('\n=== urhanshop POST postback denemesi ===');
{
  const r0 = await cek('https://www.urhanshop.com/');
  if (r0.durum === 200) {
    const vs = r0.text.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
    const vsg = r0.text.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
    const ev = r0.text.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
    const aramaAd = r0.text.match(/<input[^>]*id="(ctl00[^"]*arama[^"]*)"/i)?.[1];
    console.log('VIEWSTATE uzunluk:', vs.length, '| generator:', vsg, '| validation:', ev.length, '| arama input id:', aramaAd);
    if (vs && aramaAd) {
      const params = new URLSearchParams();
      params.set('__VIEWSTATE', vs);
      if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
      if (ev) params.set('__EVENTVALIDATION', ev);
      params.set('__EVENTTARGET', '');
      params.set('__EVENTARGUMENT', '');
      params.set(aramaAd.replace(/\$/g, '$'), 'filament');
      const r1 = await cek('https://www.urhanshop.com/', 30000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const urun = (r1.text.match(/-u\d+('|")/g) || []).length;
      const title = (r1.text.match(/<title>([^<]{3,90})</i)?.[1] || '?').trim();
      console.log('POST sonrasi: durum=' + r1.durum, '| urun linki:', urun, '| title:', title, '| url:', r1.url.slice(0, 80));
      if (urun > 3) fs.writeFileSync('data/explore/yeni/arama-urhanshop.html', r1.text);
    }
  }
}

// 3) ciceksepeti: robots.txt (dogrudan) + render arama (cicek sorgusuyla)
console.log('\n=== ciceksepeti robots.txt ===');
{
  const r = await cek('https://www.ciceksepeti.com/robots.txt');
  console.log('durum:', r.durum, '| boyut:', r.text.length);
  if (r.durum === 200 && r.text.length > 50) {
    console.log(r.text.slice(0, 800));
  }
}
