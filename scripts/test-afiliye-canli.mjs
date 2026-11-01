/**
 * Satış ortaklığı — boru hattı (pipeline) düzeyinde tarafsızlık testi.
 * HTTP iş kuyruğuna girmeden çalışır (hızlı), siteler sınırlı tutulur.
 *
 *  1) Referans KAPALI ile AÇIK karşılaştırmanın fiyat/sıra çıktısı birebir aynı mı?
 *  2) Temiz `url` korunuyor, yalnızca `afiliyeUrl` değişiyor mu?
 */
import { afiliyeKaydet, afiliyeAyarlari } from '../src/afiliye.js';
import { runComparison } from '../src/pipeline.js';

const ESKI = afiliyeAyarlari();
const URUN = 'https://www.robo90.com/nanelab-hyper-pla-koyu-gri-filament-175mm-1kg';
const SITELER = ['robo90', 'filamentsan'];

const kos = () => runComparison(URUN, {
  siteler: SITELER, maxQueries: 1, semantik: false, siniflandir: false, siteTimeoutMs: 25000,
});

const eskiyeDon = () => afiliyeKaydet({
  etkin: ESKI.etkin,
  aglar: Object.fromEntries(Object.entries(ESKI.aglar).map(([k, v]) => [k, { etkin: v.etkin, parametre: v.parametre, token: v.token, sablon: v.sablon }])),
  siteAg: ESKI.siteAg,
  siteSablon: ESKI.siteSablon,
});

const fiyatOzeti = (r) => (r.sonuclar || [])
  .filter(s => s.status === 'found')
  .map(s => ({ site: s.site, fiyat: s.product.pricing?.toplam ?? s.product.sellingPrice, enUcuz: s.enUcuz }));

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

try {
  // 1) KAPALI
  afiliyeKaydet({ etkin: false, aglar: {}, siteSablon: {} });
  const kapali = await kos();

  // 2) AÇIK
  afiliyeKaydet({
    etkin: true,
    aglar: { gelirortaklari: { etkin: true, token: 'TST', sablon: 'https://ag.example.com/git?u={url}&ref={token}' } },
    siteAg: { robo90: 'gelirortaklari' },
    siteSablon: {},
  });
  const acik = await kos();

  const f1 = fiyatOzeti(kapali);
  const f2 = fiyatOzeti(acik);
  kontrol('fiyat/sıra birebir aynı', JSON.stringify(f1) === JSON.stringify(f2), `${JSON.stringify(f1)} ≠ ${JSON.stringify(f2)}`);
  kontrol('en az bir sonuç okundu', f1.length > 0);

  const o1 = (kapali.sonuclar || []).find(s => s.site === 'robo90')?.product;
  const o2 = (acik.sonuclar || []).find(s => s.site === 'robo90')?.product;
  kontrol('temiz url korunuyor', o1?.url === o2?.url);
  kontrol('kapalıyken link sade', (o1?.afiliyeUrl || '') === o1?.url);
  kontrol('açıkken link referanslı', /ag\.example\.com/.test(o2?.afiliyeUrl || ''), o2?.afiliyeUrl?.slice(0, 80));

  const k1 = kapali.kaynak?.afiliyeUrl;
  const k2 = acik.kaynak?.afiliyeUrl;
  kontrol('kaynak linki de referanslanır', k1 === kapali.kaynak?.url && /ag\.example\.com/.test(k2 || ''));

  // 3) Fiyat alanlarına hiç dokunulmamış mı? (ürün nesnesi karşılaştırması)
  const p1 = (kapali.sonuclar || []).find(s => s.site === 'robo90')?.product;
  const p2 = (acik.sonuclar || []).find(s => s.site === 'robo90')?.product;
  const fiyatAlanlari = (p) => JSON.stringify({
    sellingPrice: p?.sellingPrice, listPrice: p?.listPrice,
    toplam: p?.pricing?.toplam, araToplam: p?.pricing?.araToplam, kargo: p?.pricing?.kargo,
  });  kontrol('fiyat/kargo alanları dokunulmamış', fiyatAlanlari(p1) === fiyatAlanlari(p2));
} finally {
  eskiyeDon();
}

console.log(`AFILIYE-CANLI ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);
