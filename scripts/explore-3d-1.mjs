/**
 * 3D baskı siteleri keşif 1/3: ana sayfalardan platform + arama formu desenleri.
 * (Doğrudan erişim — keşif amaçlı; uygulama çalışma zamanında ScraperAPI kullanır.)
 */
const SITELER = [
  { id: '3dteknomarket', url: 'https://3dteknomarket.com/' },
  { id: '3dortgen', url: 'https://3dortgen.com/' },
  { id: 'roit3d', url: 'https://roit3d.com/' },
  { id: 'filamentdepom', url: 'https://filamentdepom.com/' },
  { id: 'filamentsan', url: 'https://filamentsan.com/' },
  { id: 'filamentmarketim', url: 'https://filamentmarketim.com/' },
  { id: 'domirobot', url: 'https://domirobot.com/' },
  { id: 'metatechtr', url: 'https://metatechtr.com/' },
  { id: 'teknikfilament3d', url: 'https://teknikfilament3d.com/' },
  { id: 'matersan', url: 'https://matersan.com.tr/' },
  { id: '3bfab', url: 'https://3bfab.com/' },
  { id: 'sanaltedarik', url: 'https://sanaltedarik.com/' },
  { id: 'robotistan', url: 'https://robotistan.com/' },
  { id: 'samm', url: 'https://market.samm.com/' },
  { id: 'robolinkmarket', url: 'https://robolinkmarket.com/' },
  { id: 'direnc', url: 'https://www.direnc.net/' },
  { id: 'motorobit', url: 'https://www.motorobit.com/' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function cek(site) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(site.url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' },
      redirect: 'follow',
    });
    const html = await res.text();
    clearTimeout(t);
    return { ...site, durum: res.status, boyut: html.length, html };
  } catch (e) {
    clearTimeout(t);
    return { ...site, durum: 0, boyut: 0, html: '', hata: String(e.message || e).slice(0, 80) };
  }
}

const sonuclar = [];
// 4 paralel batch
for (let i = 0; i < SITELER.length; i += 4) {
  const parca = await Promise.all(SITELER.slice(i, i + 4).map(cek));
  sonuclar.push(...parca);
}

for (const s of sonuclar) {
  console.log(`\n=== ${s.id} (${s.url}) durum=${s.durum} boyut=${s.boyut} ${s.hata ? 'HATA: ' + s.hata : ''} ===`);
  if (!s.html) continue;
  const html = s.html;
  // Platform belirteçleri
  const platformlar = [];
  if (/wp-content|woocommerce/i.test(html)) platformlar.push('WordPress/Woo');
  if (/route=product\/search/i.test(html)) platformlar.push('OpenCart');
  if (/prestashop|ps-shopping-cart/i.test(html)) platformlar.push('PrestaShop');
  if (/ideasoft/i.test(html)) platformlar.push('IdeaSoft');
  if (/eticsoft|tikla/i.test(html)) platformlar.push('?');
  if (/nop-|nopcommerce/i.test(html)) platformlar.push('nopCommerce');
  if (/shopify/i.test(html)) platformlar.push('Shopify');
  if (/next\.js|__NEXT_DATA__/i.test(html)) platformlar.push('Next.js');
  if (platformlar.length) console.log('  platform:', platformlar.join(', '));
  // SearchAction JSON-LD
  const sa = html.match(/"SearchAction"[\s\S]{0,200}?"urlTemplate"\s*:\s*"([^"]+)"/) || html.match(/"target"\s*:\s*\{[\s\S]{0,150}?"urlTemplate"\s*:\s*"([^"]+)"/);
  if (sa) console.log('  searchAction:', sa[1].slice(0, 120));
  // form action'lari
  const formlar = [...html.matchAll(/<form[^>]*action="([^"]{1,120})"[^>]*>/gi)].map(m => m[1]);
  const aramaFormlari = formlar.filter(f => /search|arama|q=|s=|bul|find/i.test(f));
  if (aramaFormlari.length) console.log('  form:', [...new Set(aramaFormlari)].slice(0, 3).join(' | ').slice(0, 200));
  // arama kutusu input name
  const inp = html.match(/<input[^>]*name="(s|search|q|ara|bul|query|kelime|keyword)"[^>]*>/i) || html.match(/<input[^>]*type="search"[^>]*name="([^"]+)"/i);
  if (inp) console.log('  arama inputu:', inp[1]);
  // title
  const t = html.match(/<title>([^<]{5,100})</i);
  if (t) console.log('  title:', t[1].trim().slice(0, 80));
}
