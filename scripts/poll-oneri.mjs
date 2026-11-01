/** Öneri işini yoklar, ilerlemeyi ve sonucu raporlar. */
const isId = process.argv[2];
const base = 'http://localhost:3000/api/oneri/' + isId;

const t0 = Date.now();
while (true) {
  const res = await fetch(base);
  const job = await res.json();
  const p = job.progress || {};
  const sn = ((Date.now() - t0) / 1000).toFixed(0);
  if (job.status === 'running') {
    const detay = p.faz === 'arama'
      ? Object.entries(p.siteler || {}).map(([s, v]) => `${s}:${v.status}${v.adaySayisi != null ? '(' + v.adaySayisi + ')' : ''}`).join(' ')
      : p.faz === 'karsilastirma'
        ? `model ${p.modelNo + 1}/${p.modelToplam} ${p.site ? p.site + ':' + p.siteDurum : ''}`
        : (p.not || '');
    console.log(`[${sn}sn] ${p.faz || '?'} — ${detay}`);
  } else {
    console.log(`\nDURUM: ${job.status} (${sn}sn)`);
    if (job.error) console.log('HATA:', job.error);
    if (job.result) {
      const r = job.result;
      console.log('ihtiyac:', r.ihtiyac);
      console.log('sorgu:', r.aramaSorgusu, '| butce:', r.butce, '| arama istegi:', r.aramaIstek);
      console.log('arama raporu:', JSON.stringify(r.aramaRaporu));
      console.log('\n=== ONERILER ===');
      for (const [i, o] of r.oneriler.entries()) {
        console.log(`\n--- Model ${i + 1}: ${o.model}`);
        console.log('  kaynak:', o.kaynakSite, '| aday fiyati:', o.adayFiyat);
        console.log('  neden:', o.neden);
        if (o.hata) { console.log('  HATA:', o.hata); continue; }
        const k = o.karsilastirma;
        console.log('  kaynak urun:', k.kaynak.urun, '| model kodu:', k.kaynak.modelKodu, '| renk:', k.kaynak.renk);
        for (const s of k.sonuclar) {
          const fiyat = s.product?.pricing?.toplam;
          console.log(`    ${s.siteName.padEnd(16)} [${s.status}] ${fiyat != null ? fiyat + ' TL' : ''} ${s.enUcuz ? '<< EN UCUZ' : ''} ${s.reason ? '(' + s.reason.slice(0, 60) + ')' : ''} istek:${s.requestsSpent}`);
        }
        console.log('  ozet:', JSON.stringify(k.ozet));
      }
      console.log('\nTOPLAM ISTEK:', r.ozet.toplamIstek, '| sure:', (r.ozet.toplamSureMs / 1000).toFixed(0), 'sn');
    }
    break;
  }
  await new Promise(r => setTimeout(r, 12000));
}
