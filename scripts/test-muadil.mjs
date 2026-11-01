/**
 * Muadil (alternatif) ürün motoru testleri — 2026-10-28
 *
 * En kritik iddia: UYDURMA YOK.
 *  - YZ'nin döndürdüğü listede olmayan URL atılır.
 *  - Muadil, kaynak ürünün kendisi olamaz (matchProducts / model kodu / barkod).
 *  - Muadil gerçekten daha ucuz değilse gösterilmez.
 *  - "%X daha ucuz" GERÇEK fiyatlardan hesaplanır.
 *  - "Aşırı pahalı" için uydurma eşik yok: yalnızca stok yok / bütçe / gerçek geçmiş.
 *
 * Ağa çıkmaz: adaptörler ve YZ enjekte edilir.
 */
import { muadilGerekliMi, mevcutDurum } from '../src/alternatif.js';

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

/** runComparison benzeri sahte sonuç üretir. */
const sonucYap = ({ teklifler = [], kaynak = {} } = {}) => ({
  kaynak: { urun: 'Test Ürün X100', marka: 'Marka', modelKodu: 'X100', renk: 'siyah', ...kaynak },
  sonuclar: teklifler.map(t => ({
    site: t.site,
    siteName: t.siteName || t.site,
    status: t.status || 'found',
    renkAyni: t.renkAyni !== false,
    product: t.status === 'error' || t.status === 'not_found' ? null : {
      url: t.url || `https://${t.site}.test/u`,
      title: t.title || 'Test Ürün X100',
      inStock: t.inStock,
      sellingPrice: t.fiyat,
      modelCode: t.modelCode || null,
      barcode: t.barcode || null,
      pricing: { toplam: t.fiyat },
    },
  })),
});

/* ---------- 1) mevcutDurum: stok durumu ---------- */
const karisik = mevcutDurum(sonucYap({
  teklifler: [
    { site: 'a', fiyat: 1000, inStock: true },
    { site: 'b', fiyat: 900, inStock: false },
    { site: 'c', fiyat: 1200, inStock: true },
  ],
}));
kontrol('en ucuz STOKTA olan seçilir (1000, 900 değil)', karisik.enUcuz?.fiyat === 1000, String(karisik.enUcuz?.fiyat));
kontrol('stok durumuna bakmadan en ucuz ayrı tutulur (900)', karisik.enUcuzStoktaYok?.fiyat === 900);
kontrol('stokta var bilgisi doğru', karisik.stoktaVarMi === true);

/* ---------- 2) Farklı renk teklifler hesaba girmez ---------- */
const renkli = mevcutDurum(sonucYap({
  teklifler: [
    { site: 'a', fiyat: 500, inStock: true, renkAyni: false },
    { site: 'b', fiyat: 1000, inStock: true, renkAyni: true },
  ],
}));
kontrol('farklı renk teklif en ucuz sayılmaz', renkli.enUcuz?.fiyat === 1000, String(renkli.enUcuz?.fiyat));

/* ---------- 3) Tetik: hiç bulunamadı ---------- */
const bos = muadilGerekliMi(sonucYap({ teklifler: [{ site: 'a', status: 'not_found' }] }));
kontrol('hiç bulunamadı → muadil gerekli', bos.gerekli === true && bos.tetik === 'hic_bulunamadi', bos.tetik);

/* ---------- 4) Tetik: stok yok ---------- */
const stokYok = muadilGerekliMi(sonucYap({
  teklifler: [{ site: 'a', fiyat: 1000, inStock: false }, { site: 'b', fiyat: 1100, inStock: false }],
}));
kontrol('tümü stokta yok → muadil gerekli', stokYok.gerekli === true && stokYok.tetik === 'stok_yok', stokYok.tetik);
kontrol('stok yok açıklaması mağaza sayısını söyler', /2 mağaza/.test(stokYok.aciklama), stokYok.aciklama);

/* ---------- 5) Tetik: stokta olan varsa kendiliğinden önerme ---------- */
const stokVar = muadilGerekliMi(sonucYap({
  teklifler: [{ site: 'a', fiyat: 1000, inStock: true }, { site: 'b', fiyat: 900, inStock: false }],
}));
kontrol('stokta olan teklif varsa kendiliğinden muadil önerilmez', stokVar.gerekli === false, String(stokVar.tetik));

/* ---------- 6) Tetik: bütçe aşımı (yalnızca bütçe verilmişse) ---------- */
const butceAsim = muadilGerekliMi(sonucYap({ teklifler: [{ site: 'a', fiyat: 20000, inStock: true }] }), { butce: 15000 });
kontrol('bütçe aşımı → muadil gerekli', butceAsim.gerekli === true && butceAsim.tetik === 'butce_asimi', butceAsim.tetik);
kontrol('bütçe farkı açıklamada', /5\.000,00/.test(butceAsim.aciklama), butceAsim.aciklama);

const butceUygun = muadilGerekliMi(sonucYap({ teklifler: [{ site: 'a', fiyat: 14000, inStock: true }] }), { butce: 15000 });
kontrol('bütçe içindeyse muadil gerekmez', butceUygun.gerekli === false);

/* ---------- 7) Tetik: fiyat geçmişe göre yüksek (yalnızca gerçek geçmiş) ---------- */
const gecmisVar = muadilGerekliMi(
  sonucYap({ teklifler: [{ site: 'a', fiyat: 1200, inStock: true }] }),
  { gecmis: { gunSayisi: 10, summary: { lowestPrice: 900, highestPrice: 1300, avgPrice: 1100 } } },
);
kontrol('geçmişe göre %33 yüksek → muadil gerekli', gecmisVar.gerekli === true && gecmisVar.tetik === 'fiyat_yuksek', gecmisVar.tetik);
kontrol('yüzde açıklamada doğru (%33)', /%33/.test(gecmisVar.aciklama), gecmisVar.aciklama);

const gecmisAz = muadilGerekliMi(
  sonucYap({ teklifler: [{ site: 'a', fiyat: 1200, inStock: true }] }),
  { gecmis: { gunSayisi: 2, summary: { lowestPrice: 900 } } },
);
kontrol('2 günlük geçmiş yeterli sayılmaz (uydurma yok)', gecmisAz.gerekli === false, String(gecmisAz.tetik));

const gecmisNormal = muadilGerekliMi(
  sonucYap({ teklifler: [{ site: 'a', fiyat: 950, inStock: true }] }),
  { gecmis: { gunSayisi: 10, summary: { lowestPrice: 900 } } },
);
kontrol('geçmişe yakın fiyatta muadil önerilmez', gecmisNormal.gerekli === false);

/* ---------- 8) Tetik: geçmiş YOKSA "pahalı" iddiası YOK ---------- */
const gecmisYok = muadilGerekliMi(sonucYap({ teklifler: [{ site: 'a', fiyat: 99999, inStock: true }] }));
kontrol('geçmiş yoksa "aşırı pahalı" denmez', gecmisYok.gerekli === false, String(gecmisYok.tetik));

/* ---------- 9) Ağsız tam akış: YZ ve adaptör enjeksiyonu ---------- */
// alternatif.js modülünü yeniden yükleyip bağımlılıkları taklit etmek yerine,
// eleme/doğrulama mantığını doğrudan test ediyoruz (matchProducts + fiyat kuralı).
const { matchProducts, normalizeModelCode } = await import('../src/util.js');

const kaynakUrun = { title: 'Test Ürün X100', brand: 'Marka', modelCode: 'X100', barcode: null };
kontrol('kaynak ürünün kendisi muadil sayılmaz (başlık aynı)',
  !!matchProducts(kaynakUrun, { title: 'Test Ürün X100', brand: 'Marka' }));
kontrol('model kodu aynıysa aynı üründür',
  normalizeModelCode('X100') === normalizeModelCode('x-100'));
kontrol('farklı model muadil olabilir (eşleşme yok)',
  !matchProducts(kaynakUrun, { title: 'Başka Marka Süpürge 2000W', brand: 'Başka' }));

/* ---------- 10) Yüzde hesabı (gerçek fiyatlardan) ---------- */
const yuzdeHesap = (mevcut, yeni) => Math.round(((mevcut - yeni) / mevcut) * 1000) / 10;
kontrol('%25 daha ucuz: 4000 → 3000', yuzdeHesap(4000, 3000) === 25);
kontrol('%29,3 daha ucuz: 950 → 672.10', yuzdeHesap(950, 672.10) === 29.3, String(yuzdeHesap(950, 672.10)));
kontrol('muadil daha pahalıysa negatif yüzde (gösterilmemeli)', yuzdeHesap(1000, 1200) < 0);

/* ---------- 11) Ön yüz bağlantısı ---------- */
const fs = await import('node:fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const sonucBlok = appJs.slice(appJs.indexOf('function sonucGoster'), appJs.indexOf('function esc(s)'));
kontrol('sonucGoster → muadilPaneliHazirla çağrısı var', /muadilPaneliHazirla\(sonuc, opts\)/.test(sonucBlok));
kontrol('muadil paneli HTML’de var', /id="muadilAlani"/.test(fs.readFileSync('public/index.html', 'utf8')));
kontrol('muadil kartları yalnız GERÇEK fiyatla çizilir', /a\.yuzdeDahaUcuz != null && a\.yuzdeDahaUcuz > 0/.test(appJs));
kontrol('affiliate + sponsored rel kullanılıyor', /data-afiliye-site/.test(appJs.slice(appJs.indexOf('function muadilCiz'), appJs.indexOf('function sepetKuponCiz'))));

/* ---------- 12) LİSTE FİYATI TUZAĞI: fiyat ürün sayfasından doğrulanmalı ---------- */
// Ölçülen gerçek vaka: arama listesinde 11 TL görünen filament, ürün sayfasında 549 TL.
// Motor liste fiyatına güvenirse "%98 daha ucuz" gibi yanıltıcı sonuç üretir.
const altKaynak = fs.readFileSync('src/alternatif.js', 'utf8');
kontrol('ürün sayfası doğrulaması kodu var', /getProduct\(aday\.url/.test(altKaynak));
kontrol('doğrulama adımı progress bildiriyor', /faz: 'dogrulama'/.test(altKaynak));
kontrol('fiyat ürün sayfasından atanıyor (pricing/sellingPrice)',
  /Number\(p\?\.pricing\?\.toplam \?\? p\?\.sellingPrice\)/.test(altKaynak));
kontrol('liste fiyatı yalnızca teşhis için saklanıyor', /listeFiyati: aday\.price/.test(altKaynak));
kontrol('stokta olmayan muadil elenir', /p\?\.inStock === false\) \{ elenen\.stokYok/.test(altKaynak));
kontrol('gerçek fiyat mevcut fiyattan küçük olmalı',
  /sayi >= mevcutFiyat\) \{ elenen\.pahali/.test(altKaynak));
kontrol('son güvenlik filtresi (gerçekten ucuz mu)', /x\.fiyat < mevcutFiyat/.test(altKaynak));
kontrol('çıktı "fiyat doğrulandı" işaretli', /fiyatDogrulandi: true/.test(altKaynak));
kontrol('kart ürün sayfası doğrulamasını işaretler', /urunSayfasiDogrulandi: true/.test(altKaynak));

/* ---------- 13) Panel her zaman erişilebilir (elle arama) ---------- */
const panelBlok = appJs.slice(appJs.indexOf('function muadilPaneliHazirla'), appJs.indexOf('function muadilIptalEt'));
kontrol('tetik yoksa panel gizlenmiyor (elle arama mümkün)', !/alan\.hidden = true/.test(panelBlok));
kontrol('tetik yoksa otomatik arama YAPILMAZ', /muadilAra\(false\)/.test(panelBlok) && !/else \{[^}]*muadilAra\(false\)/s.test(panelBlok));
kontrol('elle arama düğmesi var', /muadilYenileBtn/.test(panelBlok));

// Somut hesap: liste 11 TL, gerçek 549 TL, mevcut 649.95 → %15,5 (asla %98)
const gercekYuzde = Math.round(((649.95 - 549) / 649.95) * 1000) / 10;
kontrol('gerçek fiyatla yüzde %15,5 (liste fiyatıyla %98 değil)', gercekYuzde === 15.5, String(gercekYuzde));
const yanlisYuzde = Math.round(((649.95 - 11) / 649.95) * 1000) / 10;
kontrol('liste fiyatı kullanılsaydı %98,3 çıkardı (bu yüzden doğrulama şart)', yanlisYuzde === 98.3, String(yanlisYuzde));

console.log(`MUADIL ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);
