/** urhanshop aramasonuc.aspx parametre denemeleri + ciceksepeti robots sitemap satiri. */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function cek(url, ms = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
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
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 40) }; }
}

// 1) urhanshop aramasonuc.aspx GET varyantlari
console.log('=== urhanshop aramasonuc.aspx ===');
for (const [ad, u] of [
  ['ara=', 'https://www.urhanshop.com/aramasonuc.aspx?ara=filament'],
  ['arama=', 'https://www.urhanshop.com/aramasonuc.aspx?arama=filament'],
  ['q=', 'https://www.urhanshop.com/aramasonuc.aspx?q=filament'],
  ['kelime=', 'https://www.urhanshop.com/aramasonuc.aspx?kelime=filament'],
  ['bos', 'https://www.urhanshop.com/aramasonuc.aspx'],
]) {
  const r = await cek(u);
  const urun = (r.text.match(/-u\d+['"]/g) || []).length;
  const fiyat = (r.text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length;
  const title = (r.text.match(/<title>([^<]{3,70})</i)?.[1] || '?').trim();
  console.log(`${ad}: durum=${r.durum} urun=${urun} fiyat=${fiyat} | ${title.slice(0, 50)}`);
  if (urun > 3) fs.writeFileSync('data/explore/yeni/arama-urhanshop.html', r.text);
}

// 2) POST sonrasi yonlendirme zinciri: yonlendirme URL'ini yakala (redirect: manual)
console.log('\n=== urhanshop POST yonlendirme ===');
{
  const r0 = await cek('https://www.urhanshop.com/');
  const vs = r0.text.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
  const vsg = r0.text.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
  const ev = r0.text.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
  const params = new URLSearchParams({ __VIEWSTATE: vs, __EVENTTARGET: 'ctl00$imgAraO', __EVENTARGUMENT: '', 'ctl00$arama3': 'filament' });
  if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
  if (ev) params.set('__EVENTVALIDATION', ev);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('https://www.urhanshop.com/', {
      signal: controller.signal, method: 'POST', redirect: 'manual',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    clearTimeout(t);
    console.log('durum:', res.status, '| Location:', res.headers.get('location'), '| Set-Cookie var mi:', !!res.headers.get('set-cookie'));
  } catch (e) { clearTimeout(t); console.log('hata:', String(e).slice(0, 40)); }
}

// 3) ciceksepeti robots.txt tam icerik (sitemap satiri)
console.log('\n=== ciceksepeti robots.txt sonu ===');
{
  const r = await cek('https://www.ciceksepeti.com/robots.txt');
  const satirlar = r.text.split('\n').filter(l => /sitemap/i.test(l) || /Allow/i.test(l));
  console.log(satirlar.join('\n'));
  console.log('--- son 30 satir ---');
  console.log(r.text.trim().split('\n').slice(-30).join('\n').slice(0, 1500));
}
