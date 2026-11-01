/** Yeni parti keşif 8: teknosa/pttavm kartlari, ciceksepeti formu, koctas fiyati, robodukkan/rhino kartlari. */
import fs from 'node:fs';

function dosya(id) {
  try { return fs.readFileSync(`data/explore/yeni/arama-${id}.html`, 'utf8'); }
  catch { return null; }
}

// 1) teknosa kart yapisi
console.log('=== teknosa kart ===');
{
  const html = dosya('teknosa');
  if (html) {
    for (const w of ['product-item', 'productItem', 'class="product', 'data-product', 'plp', 'urun-']) {
      const c = html.split(w).length - 1;
      if (c > 0) console.log(`  "${w}": ${c}`);
    }
    const i = html.search(/href="[^"]*\/p\/|product-card|data-product/i);
    if (i > 0) console.log(html.slice(Math.max(0, i - 300), i + 1200).replace(/\s+/g, ' ').slice(0, 1400));
  } else console.log('dosya yok');
}

// 2) pttavm kart yapisi
console.log('\n\n=== pttavm kart ===');
{
  const html = dosya('pttavm');
  if (html) {
    for (const w of ['product-item', 'productCard', 'class="product', 'data-product', 'urun-']) {
      const c = html.split(w).length - 1;
      if (c > 0) console.log(`  "${w}": ${c}`);
    }
    const i = html.indexOf('₺');
    if (i > 0) console.log(html.slice(Math.max(0, i - 900), i + 200).replace(/\s+/g, ' ').slice(0, 1100));
  } else console.log('dosya yok');
}

// 3) ciceksepeti: render edilmis ana sayfada arama formu
console.log('\n\n=== ciceksepeti form ===');
{
  const html = dosya('ciceksepeti');
  if (html) {
    const form = html.match(/<form[^>]{0,300}>/gi) || [];
    console.log('formlar:', form.slice(0, 4).join('\n'));
    const action = [...new Set([...html.matchAll(/action="([^"]{3,90})"/g)].map(m => m[1]))].slice(0, 5);
    console.log('actionlar:', action.join(' | '));
    const aramaHref = [...new Set([...html.matchAll(/(?:href|action)="([^"]*(?:search|ara)[^"]{0,40})"/gi)].map(m => m[1]))].slice(0, 5);
    console.log('arama linkleri:', aramaHref.join(' | '));
  } else console.log('dosya yok');
}

// 4) koctas kart fiyati
console.log('\n\n=== koctas fiyat ===');
{
  const html = dosya('koctas');
  const i = html.indexOf('data-productid');
  if (i > 0) {
    const blok = html.slice(i, i + 6000);
    const fi = blok.search(/\d[\d.,]*\s*TL/);
    if (fi > 0) console.log(blok.slice(Math.max(0, fi - 500), fi + 100).replace(/\s+/g, ' ').slice(0, 600));
  }
}

// 5) robodukkan urun karti (bakir-plaket cevresi)
console.log('\n\n=== robodukkan kart ===');
{
  const html = dosya('robodukkan');
  const m = html.match(/href="(\/[a-z0-9-]*bakir-plaket[^"]*)"/);
  if (m) {
    const i = html.indexOf(m[0]);
    console.log(html.slice(Math.max(0, i - 1200), i + 1300).replace(/\s+/g, ' ').slice(0, 2300));
  } else console.log('bakir-plaket linki yok');
}

// 6) rhino3dprinter kayitli arama sayfasi
console.log('\n\n=== rhino3dprinter kayitli sayfa ===');
{
  const html = dosya('rhino3dprinter');
  if (html) {
    console.log('boyut:', html.length);
    for (const w of ['showcase', 'product-item', 'urun/', 'tumu-c', 'pla', 'PLA']) {
      const c = html.split(w).length - 1;
      if (c > 0) console.log(`  "${w}": ${c}`);
    }
  } else console.log('dosya yok');
}
