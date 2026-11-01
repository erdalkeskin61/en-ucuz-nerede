/**
 * Yeni parti keşif 1: ana sayfalardan platform + arama desenleri.
 */
import fs from 'node:fs';

const SITELER = [
  { id: 'rhino3dprinter', url: 'https://rhino3dprinter.com/' },
  { id: 'trendruum', url: 'https://trendruum.com/' },
  { id: 'deneystore', url: 'https://deneystore.com/' },
  { id: 'fana3dstudio', url: 'https://fana3dstudio.com.tr/' },
  { id: '3dultra', url: 'https://3dultra.com.tr/' },
  { id: 'urhanshop', url: 'https://urhanshop.com/' },
  { id: 'mintengo', url: 'https://mintengo.com/' },
  { id: 'robotizmo', url: 'https://robotizmo.net/' },
  { id: 'ciceksepeti', url: 'https://www.ciceksepeti.com/' },
  { id: 'sivasrobotik', url: 'https://sivasrobotik.com.tr/' },
  { id: 'mikron3d', url: 'https://mikron3d.com/' },
  { id: 'robodukkan', url: 'https://robodukkan.com/' },
  { id: 'teknosa', url: 'https://www.teknosa.com/' },
  { id: '3dcim', url: 'https://3dcim.com/' },
  { id: 'kurumsalit', url: 'https://kurumsalit.com/' },
  { id: 'robotzade', url: 'https://robotzade.com/' },
  { id: 'robocombo', url: 'https://robocombo.com/' },
  { id: 'robitshop', url: 'https://robitshop.com/' },
  { id: 'nmosphere', url: 'https://nmosphere.com.tr/' },
  { id: 'koctas', url: 'https://www.koctas.com.tr/' },
  { id: 'pttavm', url: 'https://www.pttavm.com/' },
  { id: 'fixx3d', url: 'https://fixx3d.com/' },
  { id: 'robo90', url: 'https://robo90.com/' },
  { id: 'hepsivar', url: 'https://www.hepsivar.com/' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function cek(site) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(site.url, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'tr-TR,tr;q=0.9' }, redirect: 'follow' });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    // kodlama algila
    let html;
    try {
      const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
      const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
      const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
      html = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    } catch { html = new TextDecoder('utf-8').decode(buf); }
    return { ...site, durum: res.status, html };
  } catch (e) {
    clearTimeout(t);
    return { ...site, durum: 0, html: '', hata: String(e.message || e).slice(0, 50) };
  }
}

fs.mkdirSync('data/explore/yeni', { recursive: true });
const sonuclar = [];
for (let i = 0; i < SITELER.length; i += 4) {
  sonuclar.push(...await Promise.all(SITELER.slice(i, i + 4).map(cek)));
}

for (const s of sonuclar) {
  console.log(`\n=== ${s.id} | durum=${s.durum} | boyut=${s.html.length} ${s.hata ? 'HATA: ' + s.hata : ''} ===`);
  if (!s.html) continue;
  fs.writeFileSync(`data/explore/yeni/ana-${s.id}.html`, s.html);
  const html = s.html;
  const plat = [];
  if (/wp-content|woocommerce/i.test(html)) plat.push('Woo');
  if (/route=product\/search|index\.php\?route=/i.test(html)) plat.push('OpenCart');
  if (/prestashop|ps_shopping/i.test(html)) plat.push('PrestaShop');
  if (/ideasoft|worker_not_found/i.test(html)) plat.push('IdeaSoft');
  if (/witcdn|tsoft/i.test(html)) plat.push('T-Soft');
  if (/ticimax/i.test(html)) plat.push('Ticimax');
  if (/myikas/i.test(html)) plat.push('Ikas');
  if (/shopify/i.test(html)) plat.push('Shopify');
  if (/platincdn|platinmarket/i.test(html)) plat.push('PlatinMarket');
  if (/__NEXT_DATA__|next\.js/i.test(html)) plat.push('Next.js');
  if (/\/client\/Visitor\/search/.test(html)) plat.push('IdeaSoft-smart');
  if (plat.length) console.log('  platform:', [...new Set(plat)].join(', '));
  const sa = html.match(/"SearchAction"[\s\S]{0,250}?"urlTemplate"\s*:\s*"([^"]+)"/);
  if (sa) console.log('  searchAction:', sa[1].slice(0, 110));
  const formlar = [...new Set([...html.matchAll(/<form[^>]*action="([^"]{1,110})"[^>]*>/gi)].map(m => m[1]))].filter(f => /search|arama|q=|kelime/i.test(f));
  if (formlar.length) console.log('  form:', formlar.slice(0, 3).join(' | ').slice(0, 180));
  const inp = html.match(/<input[^>]*type="search"[^>]*name="([^"]+)"/i) || html.match(/<input[^>]*name="(s|search|q|ara|kelime|word|txtbxArama|k)"[^>]*type="(?:text|search)"/i);
  if (inp) console.log('  arama inputu:', inp[1]);
  const t = html.match(/<title>([^<]{5,90})</i);
  if (t) console.log('  title:', t[1].trim().slice(0, 75));
}
