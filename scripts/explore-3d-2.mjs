/** domirobot, matersan, 3dteknomarket kart yapilari + urun linkleri. */
import fs from 'node:fs';

for (const id of ['domirobot', 'matersan', '3dteknomarket']) {
  const html = fs.readFileSync(`data/explore/3d/arama-${id}.html`, 'utf8');
  console.log(`\n\n======== ${id} (${html.length} bayt) ========`);
  // Tum hrefleri topla, urun benzeri olanlari yazdir
  const re = /<a[^>]+href="([^"]+)"[^>]*>/gi;
  let m;
  const ornekler = [];
  const guard = new Set();
  while ((m = re.exec(html))) {
    const h = m[1].split('?')[0].replace(/^https?:\/\/[^/]+/, '');
    if (h.length < 12 || guard.has(h)) continue;
    if (/filament|pla|petg|abs|elegoo|creality|prusa|esun/i.test(h) && !/\.((png|jpe?g|svg|webp|css|js))$/i.test(h)) {
      guard.add(h);
      ornekler.push(h);
    }
    if (ornekler.length > 200) break;
  }
  console.log('urun benzeri linkler (ilk 6):');
  for (const o of ornekler.slice(0, 6)) console.log('  ', o.slice(0, 110));
  // fiyat desenleri
  const fi = html.match(/class="[^"]*price[^"]*"[^>]*>([^<]{1,40})</i) || html.match(/([\d.,]+)\s*(?:TL|₺)/);
  console.log('fiyat ornegi:', fi ? fi[0].slice(0, 60) : '?');
  // matersan: IdeaSoft urun linki /urun/ olabilir
  const urunLink = html.match(/href="[^"]*\/urun\/[^"]+"/i);
  console.log('/urun/ linki:', urunLink ? urunLink[0].slice(0, 100) : 'yok');
}
