/** Yeni parti keşif 16: trendruum/ikas urun sayfalari + koctas ScraperAPI testleri. */
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
    return { durum: res.status, text };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '', hata: String(e.message || e).slice(0, 50) }; }
}

// 1) trendruum urun sayfasi
console.log('=== trendruum urun ===');
{
  const r = await cek('https://www.trendruum.com/urunler/creality-cr-pla-filament-mavi-175mm-1kg-901189');
  console.log('durum:', r.durum, '| boyut:', r.text.length);
  if (r.durum === 200) {
    fs.writeFileSync('data/explore/yeni/urun-trendruum.html', r.text);
    const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRe.exec(r.text))) {
      try {
        const d = JSON.parse(m[1]);
        for (const o of (d['@graph'] || (Array.isArray(d) ? d : [d]))) {
          if (o?.['@type'] === 'Product') {
            const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
            console.log('JSON-LD Product:', JSON.stringify({ name: o.name, sku: o.sku, brand: o.brand?.name, price: offers?.price }).slice(0, 250));
          }
        }
      } catch { }
    }
    const fi = r.text.search(/\d[\d.,]*\s*(?:TL|₺)/);
    if (fi > 0) console.log('fiyat baglami:', r.text.slice(Math.max(0, fi - 250), fi + 20).replace(/\s+/g, ' ').slice(-250));
  }
}

// 2) Ikas (robocombo, fixx3d) gercek urun linkleri: samm-tarzi ₺ anchor parse
console.log('\n=== Ikas urun linkleri ===');
function ikasUrunler(dosya) {
  const html = fs.readFileSync(`data/explore/yeni/${dosya}`, 'utf8');
  const re = /<a[^>]+href="(\/[a-z0-9-]{10,120})"[^>]*>([\s\S]{50,2500}?)<\/a>/g;
  let m; const sonuc = [];
  while ((m = re.exec(html))) {
    const fiyatM = m[2].match(/([\d][\d.,]{1,10})\s*₺/);
    if (!fiyatM) continue;
    const baslik = m[2].slice(0, m[2].indexOf(fiyatM[0])).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (baslik.length > 8 && !/search|sepet|kategori|account/i.test(m[1])) sonuc.push({ href: m[1], baslik: baslik.slice(0, 60), fiyat: fiyatM[1] });
  }
  return sonuc;
}
for (const id of ['robocombo', 'fixx3d']) {
  const urunler = ikasUrunler(`arama-${id}.html`);
  console.log(`${id}: ${urunler.length} kart`);
  for (const u of urunler.slice(0, 2)) console.log('  ', u.fiyat, 'TL |', u.baslik, '->', u.href.slice(0, 70));
  if (urunler[0]) {
    const base = id === 'robocombo' ? 'https://www.robocombo.com' : 'https://fixx3d.com';
    const r = await cek(base + urunler[0].href);
    console.log(`  urun sayfasi: durum=${r.durum} boyut=${r.text.length}`);
    if (r.durum === 200) {
      fs.writeFileSync(`data/explore/yeni/urun-${id}.html`, r.text);
      const ld = r.text.match(/"@type"\s*:\s*"Product"/);
      console.log('  JSON-LD Product:', ld ? 'VAR' : 'YOK');
      if (!ld) {
        const fi = r.text.search(/"price"\s*:\s*[\d.]+|([\d.,]+)\s*₺/);
        if (fi > 0) console.log('  fiyat bolgesi:', r.text.slice(Math.max(0, fi - 200), fi + 150).replace(/\s+/g, ' ').slice(0, 350));
      }
    }
  }
}

// 3) koctas: ScraperAPI search (normal, 1 kredi) + urun (render, 10 kredi)
console.log('\n=== koctas ScraperAPI testleri ===');
{
  const env = fs.readFileSync('.env', 'utf8');
  const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
  if (key) {
    // search normal
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent('https://www.koctas.com.tr/search?q=pla+filament')}`, { signal: AbortSignal.timeout(60000) });
      const text = await res.text();
      const kart = (text.match(/prd-title|data-productid/g) || []).length;
      console.log('search (normal): durum=' + res.status, '| boyut:', text.length, '| kart:', kart);
    } catch (e) { console.log('search HATA:', String(e.message || e).slice(0, 40)); }
    // urun render
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&render=true&url=${encodeURIComponent('https://www.koctas.com.tr/anycubic-pla-filament-gri-175mm-1kg/p/5003215696')}`, { signal: AbortSignal.timeout(90000) });
      const text = await res.text();
      console.log('urun (render): durum=' + res.status, '| boyut:', text.length);
      if (res.status === 200 && text.length > 50000) {
        fs.writeFileSync('data/explore/yeni/urun-koctas.html', text);
        const ld = text.match(/"@type"\s*:\s*"Product"/);
        console.log('JSON-LD Product:', ld ? 'VAR' : 'YOK');
        const fi = text.search(/([\d.,]+)\s*TL/);
        if (fi > 0) console.log('fiyat bolgesi:', text.slice(Math.max(0, fi - 200), fi + 30).replace(/\s+/g, ' ').slice(0, 230));
      }
    } catch (e) { console.log('urun HATA:', String(e.message || e).slice(0, 40)); }
  }
}
