/**
 * Yeni parti keşif 3: IdeaSoft-eski arama, dogru URL'ler, platform belirleme, CF siteleri.
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function cek(url, ms = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    let html;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      html = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { html = new TextDecoder('utf-8').decode(buf); }
    return { durum: res.status, html };
  } catch (e) { clearTimeout(t); return { durum: 0, html: '', hata: String(e.message || e).slice(0, 50) }; }
}

const SORGU = encodeURIComponent('pla filament');

// 1) IdeaSoft-eski + rhino3dprinter arama denemeleri
console.log('=== IdeaSoft-eski + rhino arama ===');
for (const [id, url] of [
  ['mintengo', 'https://mintengo.com/arama?q=' + SORGU],
  ['kurumsalit', 'https://kurumsalit.com/arama?q=' + SORGU],
  ['robotzade', 'https://www.robotzade.com/arama?q=' + SORGU],
  ['robitshop', 'https://robitshop.com/arama?q=' + SORGU],
  ['rhino3dprinter', 'https://www.rhino3dprinter.com/arama?k=' + SORGU],
  ['mikron3d', 'https://www.mikron3d.com/?search=' + SORGU],
  ['mikron3d-2', 'https://www.mikron3d.com/?page=arama&search=' + SORGU],
]) {
  const r = await cek(url);
  const fiyat = (r.html.match(/\d[\d.,]*(?:\s|&nbsp;)*(?:TL|₺)/g) || []).length;
  const urun = (r.html.match(/class="[^"]*(?:product-item|productName|showcase|urun_resmi|product-title)[^"]*"/gi) || []).length;
  console.log(`${id}: durum=${r.durum} boyut=${r.html.length} fiyat=${fiyat} kart-ipucu=${urun}`);
  if (r.durum === 200 && (fiyat > 5 || urun > 3)) fs.writeFileSync(`data/explore/yeni/arama-${id.replace('-2', '')}.html`, r.html);
}

// 2) hepsivar + 3dultra + robotizmo: ana sayfadan dogru arama URL'si bul
console.log('\n=== dogru arama URL arama ===');
for (const id of ['hepsivar', '3dultra', 'robotizmo', 'urhanshop', 'robocombo', 'fixx3d']) {
  const html = fs.readFileSync(`data/explore/yeni/ana-${id}.html`, 'utf8');
  console.log(`\n--- ${id} ---`);
  const aramaHref = [...new Set([...html.matchAll(/href="([^"]*(?:arama|search|ara)[^"]*)"/gi)].map(m => m[1]))]
    .filter(h => !/\.(css|js|png|jpg|svg)/i.test(h)).slice(0, 6);
  for (const h of aramaHref) console.log('  link:', h.slice(0, 110));
  const formA = [...new Set([...html.matchAll(/<form[^>]*action="([^"]{3,110})"/gi)].map(m => m[1]))].slice(0, 4);
  console.log('  formlar:', formA.join(' | ').slice(0, 200));
  const inp = html.match(/<input[^>]*name="([^"]+)"[^>]*(?:type="search"|placeholder="[^"]*[Aa]ra)/i) || html.match(/<input[^>]*type="search"[^>]*>/i);
  console.log('  input:', inp ? (inp[1] || inp[0].slice(0, 90)) : '?');
  // platform belirleme: ikas / woo / ticimax agirlik
  console.log('  myikas:', (html.match(/myikas/g) || []).length, '| wc-ajax:', (html.match(/wc-ajax|woocommerce/g) || []).length, '| ticimax:', (html.match(/ticimax/gi) || []).length, '| __NEXT_DATA__:', html.includes('__NEXT_DATA__'));
}

// 3) Cloudflare'li siteler: ScraperAPI testi (3 kredi)
console.log('\n=== CF siteleri ScraperAPI ===');
const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
if (key) {
  for (const domain of ['https://www.ciceksepeti.com/', 'https://www.teknosa.com/', 'https://www.pttavm.com/']) {
    try {
      const res = await fetch(`https://api.scraperapi.com/?api_key=${key}&country_code=tr&url=${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(60000) });
      const text = await res.text();
      const t = (text.match(/<title>([^<]{3,70})</i)?.[1] || 'yok').trim();
      console.log(domain, '->', res.status, '| boyut:', text.length, '| title:', t);
      if (res.status === 200 && text.length > 50000) {
        const ad = domain.match(/https:\/\/www\.([a-z0-9]+)\./)?.[1];
        fs.writeFileSync(`data/explore/yeni/ana-${ad}.html`, text);
      }
    } catch (e) { console.log(domain, '-> HATA:', String(e.message || e).slice(0, 50)); }
  }
}
