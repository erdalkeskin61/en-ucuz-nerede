/** Yeni parti keşif 9: pttavm/robodukkan/rhino kartlari (mutlak href dahil). */
import fs from 'node:fs';

function dosya(id) {
  return fs.readFileSync(`data/explore/yeni/arama-${id}.html`, 'utf8');
}

// 1) pttavm kart
console.log('=== pttavm kart ===');
{
  const html = dosya('pttavm');
  const i = html.search(/class="product/i);
  if (i > 0) console.log(html.slice(Math.max(0, i - 600), i + 1800).replace(/\s+/g, ' ').slice(0, 2200));
}

// 2) robodukkan urun linkleri (mutlak dahil)
console.log('\n\n=== robodukkan linkler ===');
{
  const html = dosya('robodukkan');
  const hrefs = [...new Set([...html.matchAll(/href="(https?:\/\/www\.robodukkan\.com\/[a-z0-9-]{10,90}|\/[a-z0-9-]{10,90})"/g)].map(m => m[1]))]
    .filter(h => !/kategori|sepet|iletisim|sayfa|hakkimizda|gizlilik|kvkk|siparis|uyelik|odeme|kargo|iade|sss|blog|kampanya/.test(h));
  console.log('urun-benzeri linkler (' + hrefs.length + '):');
  for (const h of hrefs.slice(0, 6)) console.log('  ', h.slice(0, 100));
  if (hrefs[0]) {
    const i = html.indexOf('"' + hrefs[0] + '"');
    console.log('\nilk link cevresi:');
    console.log(html.slice(Math.max(0, i - 1000), i + 1300).replace(/\s+/g, ' ').slice(0, 2100));
  }
}

// 3) rhino3dprinter urun/tumu linkleri
console.log('\n\n=== rhino linkler ===');
{
  const html = dosya('rhino3dprinter');
  const tumu = [...new Set([...html.matchAll(/href="([^"]*tumu-c-[^"]*)"/g)].map(m => m[1]))].slice(0, 5);
  console.log('tumu linkleri:', tumu.join(' | '));
  const urun = [...new Set([...html.matchAll(/href="([^"]{15,110})"/g)].map(m => m[1]))]
    .filter(h => /filament|pla/i.test(h) && !/\.(css|js|png|jpe?g|svg|webp)/i.test(h) && !/tumu|kategori|javascript/.test(h)).slice(0, 8);
  console.log('urun-benzeri linkler:');
  for (const h of urun) console.log('  ', h.slice(0, 110));
}
