/**
 * Yeni parti keşif 2: arama sayfasi testleri + bilinmeyenlerin analizi.
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

function aramaAnaliz(id, html) {
  console.log(`\n--- ${id} | durum 200 | ${html.length} bayt ---`);
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; const ldT = [];
  while ((m = ldRe.exec(html))) {
    try {
      const d = JSON.parse(m[1]);
      for (const o of (d['@graph'] || (Array.isArray(d) ? d : [d]))) {
        ldT.push(o['@type']);
        if (o['@type'] === 'ItemList' && o.itemListElement?.length) {
          const i0 = o.itemListElement[0]?.item || o.itemListElement[0];
          console.log('  ItemList x' + o.itemListElement.length + ' | anahtarlar:', Object.keys(i0 || {}).slice(0, 10).join(','));
        }
      }
    } catch { }
  }
  console.log('  JSON-LD:', [...new Set(ldT)].join(',') || 'yok');
  for (const w of ['data-toggle="product-url"', 'product-title', 'productName detailUrl', 'showcase-title', 'urun_resmi', 'product-item']) {
    const c = html.split(w).length - 1;
    if (c > 0) console.log(`  "${w}": ${c}`);
  }
  const fiyat = (html.match(/\d[\d.,]*(?:\s|&nbsp;)*(?:TL|₺)/g) || []).length;
  console.log('  fiyat adedi:', fiyat);
}

// 1) Bilinen desenlerle arama testleri
const SORGU = encodeURIComponent('pla filament');
const testler = [
  ['deneystore', 'https://www.deneystore.com/arama?q=' + SORGU],
  ['nmosphere', 'https://nmosphere.com.tr/arama?q=' + SORGU],
  ['robo90', 'https://robo90.com/arama?q=' + SORGU],
  ['hepsivar', 'https://www.hepsivar.com/arama?q=' + SORGU],
  ['3dultra', 'https://3dultra.com.tr/arama?kelime=' + SORGU],
  ['robotizmo', 'https://robotizmo.net/arama?kelime=' + SORGU],
  ['3dcim', 'https://3dcim.com/arama?kelime=' + SORGU],
  ['trendruum', 'https://www.trendruum.com/q?q=' + SORGU],
  ['fana3dstudio', 'https://fana3dstudio.com.tr/search?q=' + SORGU],
  ['robodukkan', 'https://www.robodukkan.com/arama?urunAra=' + SORGU],
  ['sivasrobotik', 'https://sivasrobotik.com.tr/arama?controller=search&s=' + SORGU],
  ['koctas', 'https://www.koctas.com.tr/?s=' + SORGU + '&post_type=product'],
];
console.log('=== ARAMA TESTLERI ===');
for (const [id, url] of testler) {
  const r = await cek(url);
  if (r.durum === 200 && r.html.length > 10000) {
    fs.writeFileSync(`data/explore/yeni/arama-${id}.html`, r.html);
    aramaAnaliz(id, r.html);
  } else {
    console.log(`\n--- ${id} -> durum ${r.durum} boyut ${r.html.length} ${r.hata || ''}`);
  }
}

// 2) Bilinmeyenler: ana sayfada arama ipuclari
console.log('\n\n=== BILINMEYENLER ANALIZ ===');
for (const id of ['rhino3dprinter', 'urhanshop', 'mikron3d', 'robocombo', 'fixx3d', 'trendruum', 'fana3dstudio', 'robodukkan']) {
  const html = fs.readFileSync(`data/explore/yeni/ana-${id}.html`, 'utf8');
  console.log(`\n--- ${id} ---`);
  const formlar = [...new Set([...html.matchAll(/<form[^>]*action="([^"]{3,110})"[^>]*>/gi)].map(m => m[1]))];
  console.log('  formlar:', formlar.slice(0, 5).join(' | ').slice(0, 200));
  const inp = html.match(/<input[^>]*(?:type="search"|type="text")[^>]*name="([^"]+)"/i);
  console.log('  input:', inp ? inp[1] : '?');
  // baskin script/kutuphane ipuclari
  const ipucu = [...new Set([...html.matchAll(/(?:src|href)="([^"]*(?:search|arama)[^"]*)"/gi)].map(m => m[1]))].slice(0, 3);
  if (ipucu.length) console.log('  arama kaynaklari:', ipucu.join(' | ').slice(0, 150));
}

// 3) IdeaSoft siteleri: smart mi klasik mi?
console.log('\n\n=== IDEASOFT TEMA KONTROL ===');
for (const id of ['mintengo', 'kurumsalit', 'robotzade', 'robitshop']) {
  const html = fs.readFileSync(`data/explore/yeni/ana-${id}.html`, 'utf8');
  console.log(`${id}: smart-uc=${html.includes('/client/Visitor/search')} | tumu-c-0=${html.includes('tumu-c-0')} | SITE_CONFIG=${html.includes('SITE_CONFIG')}`);
}
