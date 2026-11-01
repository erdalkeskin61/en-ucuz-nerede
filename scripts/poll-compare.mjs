/** Karşılaştırma işini yoklar ve sonucu raporlar. */
const isId = process.argv[2];
const base = 'http://localhost:3000/api/compare/' + isId;

const t0 = Date.now();
while (true) {
  const res = await fetch(base);
  const job = await res.json();
  const sn = ((Date.now() - t0) / 1000).toFixed(0);
  if (job.status === 'running') {
    const p = Object.values(job.progress || {});
    const ozet = p.map(x => `${x.site}:${x.status}${x.fiyat != null ? '(' + x.fiyat + ')' : ''}`).join(' ');
    console.log(`[${sn}sn] ${ozet || 'basliyor...'}`);
  } else {
    console.log(`\nDURUM: ${job.status} (${sn}sn)`);
    if (job.error) console.log('HATA:', job.error);
    if (job.result) {
      const r = job.result;
      console.log('KAYNAK:', JSON.stringify(r.kaynak, null, 2));
      for (const s of r.sonuclar) {
        const fiyat = s.product?.pricing?.toplam;
        console.log(`  ${s.siteName.padEnd(16)} [${s.status}] ${fiyat != null ? fiyat + ' TL' : ''} ${s.enUcuz ? '<< EN UCUZ' : ''} ${s.reason ? '(' + s.reason.slice(0, 70) + ')' : ''} istek:${s.requestsSpent}`);
        if (s.product) {
          console.log(`      urun: ${s.product.title?.slice(0, 90)}`);
          console.log(`      renk: ${s.product.color} | model: ${s.product.modelCode} | kargo: ${JSON.stringify(s.product.pricing?.kargo)}`);
        }
      }
      console.log('OZET:', JSON.stringify(r.ozet));
    }
    break;
  }
  await new Promise(r => setTimeout(r, 10000));
}
