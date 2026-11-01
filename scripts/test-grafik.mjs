// grafikSvg ile aynı matematiği 5 noktalı gerçekçi veriyle doğrula (kredi harcamaz)
const gecmis = [
  { ts: '2026-10-22T06:00:00Z', enUcuzSite: 'Trendyol', enUcuzFiyat: 1799 },
  { ts: '2026-10-22T18:00:00Z', enUcuzSite: 'Trendyol', enUcuzFiyat: 1749 },
  { ts: '2026-10-23T06:00:00Z', enUcuzSite: 'Hepsiburada', enUcuzFiyat: 1699 },
  { ts: '2026-10-23T18:00:00Z', enUcuzSite: 'Trendyol', enUcuzFiyat: 1649 },
  { ts: '2026-10-24T06:00:00Z', enUcuzSite: 'Trendyol', enUcuzFiyat: 1599 },
];
const noktalar = gecmis.filter(g => g.enUcuzFiyat != null);
const W = 640, H = 160, PAD = 34;
const fiyats = noktalar.map(n => n.enUcuzFiyat);
const minF = Math.min(...fiyats), maxF = Math.max(...fiyats);
const yAralik = maxF - minF || 1;
const x = (i) => PAD + (i / (noktalar.length - 1)) * (W - PAD * 2);
const y = (f) => PAD + (1 - (f - minF) / yAralik) * (H - PAD * 2);
console.log('nokta koordinatlari:');
noktalar.forEach((n, i) => console.log(`  (${x(i).toFixed(1)}, ${y(n.enUcuzFiyat).toFixed(1)})  fiyat=${n.enUcuzFiyat}`));
// Dogrulamalar
const xs = noktalar.map((_, i) => x(i));
const ys = fiyats.map(f => y(f));
console.log('x monoton artiyor mu:', xs.every((v, i) => i === 0 || v > xs[i - 1]));
console.log('x araligi:', xs[0].toFixed(1), '->', xs[xs.length - 1].toFixed(1), `(beklenen ${PAD} -> ${W - PAD})`);
console.log('y araligi:', Math.min(...ys).toFixed(1), '->', Math.max(...ys).toFixed(1), `(beklenen ${PAD} -> ${H - PAD})`);
console.log('en yuksek fiyat en yukarda mi (en kucuk y):', y(maxF) <= Math.min(...ys) + 0.01);
console.log('noktalar cizim alani icinde mi:', xs.every(v => v >= 0 && v <= W) && ys.every(v => v >= 0 && v <= H));
