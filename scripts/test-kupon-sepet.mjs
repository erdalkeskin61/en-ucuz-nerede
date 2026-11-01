/**
 * Sepet kupon otomasyonu testleri — 2026-10-28
 *
 * Kritik iddialar:
 *  - Kod UYDURULMAZ (kampanya verisinde kod yoksa kod dönmez)
 *  - Kupon yalnızca koşullar GERÇEKTEN karşılanıyorsa uygulanabilir
 *  - minSepet, kategori, ödeme yöntemi, üyelik/uygulama/kart doğru elenir
 *  - İndirim ürün tutarını aşamaz, negatif olamaz
 *  - Kargo hesabına dokunulmaz (uyarı olarak belirtilir)
 *
 * Canlı `data/kuponlar.json`'a BAĞIMLI DEĞİL: kampanyalar enjekte edilir.
 */
import { grupKuponlari, sepetKuponAnalizi, indirimTutari } from '../src/kuponSepeti.js';

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

const grup = (site, araToplam, urunler = []) => ({ site, siteName: site.toUpperCase(), araToplam, urunler });

/* ---------- 1) indirimTutari: matematik ---------- */
kontrol('yüzde 10 / 1000 TL = 100', indirimTutari({ indirim: { tip: 'yuzde', deger: 10 } }, 1000) === 100);
kontrol('tutar 150 / 1000 TL = 150', indirimTutari({ indirim: { tip: 'tutar', deger: 150 } }, 1000) === 150);
kontrol('indirim toplamı aşamaz (2000 tutar / 1000 sepet → 1000)',
  indirimTutari({ indirim: { tip: 'tutar', deger: 2000 } }, 1000) === 1000);
kontrol('indirim yoksa null', indirimTutari({}, 1000) === null);
kontrol('sepet 0 ise null', indirimTutari({ indirim: { tip: 'yuzde', deger: 10 } }, 0) === null);
kontrol('negatif deger null', indirimTutari({ indirim: { tip: 'yuzde', deger: -5 } }, 1000) === null);
kontrol('kuruş hassasiyeti (yüzde 17 / 299,90)',
  indirimTutari({ indirim: { tip: 'yuzde', deger: 17 } }, 299.90) === 50.98,
  String(indirimTutari({ indirim: { tip: 'yuzde', deger: 17 } }, 299.90)));

/* ---------- 2) Kod UYDURULMAZ ---------- */
const kodsuz = grupKuponlari(grup('teknosa', 5000), {
  kampanyalar: [{ metin: 'Sepette %5 indirim', kapsam: 'site', indirim: { tip: 'yuzde', deger: 5 }, kodu: null, guven: 'yuksek' }],
});
kontrol('kodu olmayan kampanyada kod dönmez', kodsuz.kuponlar[0].kodu === null);
kontrol('kodu olmayan kampanya "otomatik" işaretlenir', kodsuz.kuponlar[0].otomatik === true);
kontrol('kod gerekli değil', kodsuz.kuponlar[0].kodGerekli === false);
kontrol('indirim hesaplandı (250)', kodsuz.enIyi?.indirim === 250, String(kodsuz.enIyi?.indirim));

const kodlu = grupKuponlari(grup('koctas', 1000), {
  kampanyalar: [{ metin: 'Kupon kodu ile %10 indirim', kapsam: 'site', indirim: { tip: 'yuzde', deger: 10 }, kodu: 'TEST10', guven: 'yuksek' }],
});
kontrol('kodlu kampanyada kod döner', kodlu.kuponlar[0].kodu === 'TEST10');
kontrol('kodlu kampanya "otomatik" DEĞİL', kodlu.kuponlar[0].otomatik === false);
kontrol('kodlu kampanya yeni toplam (900)', kodlu.enIyi?.yeniToplam === 900, String(kodlu.enIyi?.yeniToplam));

/* ---------- 3) minSepet koşulu ---------- */
const esikAlt = grupKuponlari(grup('teknosa', 2000), {
  kampanyalar: [{ metin: '25.000 TL üzeri %2', kapsam: 'site', indirim: { tip: 'yuzde', deger: 2 }, minSepet: 25000, guven: 'yuksek' }],
});
kontrol('sepet alt limiti karşılanmıyorsa uygulanamaz', esikAlt.kuponlar[0].uygulanabilir === false);
kontrol('eşik sebebi yazılı', /sepet alt limiti/.test(esikAlt.kuponlar[0].kosullar || ''), esikAlt.kuponlar[0].kosullar);
kontrol('uygulanamaz kuponda indirim yok', esikAlt.kuponlar[0].indirim === null);
kontrol('enIyi yok (uygulanabilir yok)', esikAlt.enIyi === null);

const esikUst = grupKuponlari(grup('teknosa', 30000), {
  kampanyalar: [{ metin: '25.000 TL üzeri %2', kapsam: 'site', indirim: { tip: 'yuzde', deger: 2 }, minSepet: 25000, guven: 'yuksek' }],
});
kontrol('sepet alt limiti karşılanıyorsa uygulanabilir', esikUst.kuponlar[0].uygulanabilir === true);
kontrol('eşik üstünde indirim 600', esikUst.enIyi?.indirim === 600, String(esikUst.enIyi?.indirim));

/* ---------- 4) Kategori: sepette o kategoriden ürün yoksa hiç listelenmez ---------- */
const kategoriYok = grupKuponlari(grup('teknosa', 5000, [{ ad: 'Apple iPhone 15' }]), {
  kampanyalar: [{ metin: 'Seçili Dyson ürünlerinde %5', kapsam: 'kategori', kategori: 'Dyson', indirim: { tip: 'yuzde', deger: 5 }, guven: 'yuksek' }],
});
kontrol('kategori uymuyorsa kampanya listelenmez', kategoriYok.kuponlar.length === 0);

const kategoriVar = grupKuponlari(grup('teknosa', 5000, [{ ad: 'Dyson V15 Detect' }]), {
  kampanyalar: [{ metin: 'Seçili Dyson ürünlerinde %5', kapsam: 'kategori', kategori: 'Dyson', indirim: { tip: 'yuzde', deger: 5 }, guven: 'yuksek' }],
});
kontrol('kategori uyuyorsa listelenir', kategoriVar.kuponlar.length === 1);
kontrol('kategori kampanyası uygulanabilir', kategoriVar.kuponlar[0].uygulanabilir === true);
kontrol('kategori indirimi 250', kategoriVar.enIyi?.indirim === 250, String(kategoriVar.enIyi?.indirim));

// Büyük/küçük harf: kategori "Dyson", ürün "dyson v15" (küçük harf)
const kategoriHarf = grupKuponlari(grup('teknosa', 5000, [{ ad: 'dyson v15 detect' }]), {
  kampanyalar: [{ metin: 'Seçili Dyson ürünlerinde %5', kapsam: 'kategori', kategori: 'Dyson', indirim: { tip: 'yuzde', deger: 5 }, guven: 'yuksek' }],
});
kontrol('kategori eşleşmesi büyük/küçük harf duyarsız', kategoriHarf.kuponlar.length === 1);

/* ---------- 5) Ödeme yöntemi / üyelik / uygulama / kart ---------- */
const havale = grupKuponlari(grup('teknosa', 30000), {
  kampanyalar: [{ metin: 'Havale ile ödemede %2 indirim', kapsam: 'site', indirim: { tip: 'yuzde', deger: 2 }, guven: 'yuksek' }],
});
kontrol('havale koşullu kampanya uygulanamaz', havale.kuponlar[0].uygulanabilir === false);
kontrol('havale sebebi yazılı', /ödeme yöntemi/.test(havale.kuponlar[0].kosullar || ''));

for (const [kapsam, etiket] of [['uyelik', 'üyelere özel'], ['uygulama', 'uygulamaya özel'], ['kart', 'banka kartına özel']]) {
  const r = grupKuponlari(grup('x', 5000), {
    kampanyalar: [{ metin: 'Test', kapsam, indirim: { tip: 'yuzde', deger: 10 }, guven: 'yuksek' }],
  });
  kontrol(`${etiket} kampanya uygulanamaz`, r.kuponlar[0].uygulanabilir === false);
  kontrol(`${etiket} sebebi yazılı`, (r.kuponlar[0].kosullar || '').includes(etiket), r.kuponlar[0].kosullar);
}

/* ---------- 6) Fiyata zaten yansımış / düşük güven ---------- */
const dahil = grupKuponlari(grup('x', 5000), {
  kampanyalar: [{ metin: 'Sepette %5', kapsam: 'site', indirim: { tip: 'yuzde', deger: 5 }, fiyataDahil: true, guven: 'yuksek' }],
});
kontrol('fiyata dahil indirim ikinci kez düşülmez', dahil.kuponlar[0].uygulanabilir === false);
kontrol('sebep yazılı', /zaten yansıtılmış/.test(dahil.kuponlar[0].kosullar || ''));

const dusukGuven = grupKuponlari(grup('x', 5000), {
  kampanyalar: [{ metin: 'Belirsiz kampanya', kapsam: 'site', indirim: { tip: 'yuzde', deger: 5 }, guven: 'dusuk' }],
});
kontrol('düşük güvenli kampanya para hesabına girmez', dusukGuven.kuponlar[0].uygulanabilir === false);

/* ---------- 7) Süresi geçmiş kampanya elenir ---------- */
const suresiGecmis = grupKuponlari(grup('x', 5000), {
  kampanyalar: [{ metin: 'Eski', kapsam: 'site', indirim: { tip: 'yuzde', deger: 10 }, bitis: '2020-01-01', guven: 'yuksek' }],
});
kontrol('süresi geçmiş kampanya listelenmez', suresiGecmis.kuponlar.length === 0);

/* ---------- 8) Sıralama: en yüksek kazanç önce ---------- */
const siralama = grupKuponlari(grup('x', 1000), {
  kampanyalar: [
    { metin: 'küçük', kapsam: 'site', indirim: { tip: 'yuzde', deger: 5 }, guven: 'yuksek' },
    { metin: 'büyük', kapsam: 'site', indirim: { tip: 'yuzde', deger: 20 }, guven: 'yuksek' },
  ],
});
kontrol('en yüksek kazanç en üstte', siralama.enIyi?.indirim === 200, String(siralama.enIyi?.indirim));
kontrol('uygulanabilir olanlar önce', siralama.kuponlar[0].uygulanabilir === true);

/* ---------- 9) Sepet düzeyi: toplamlar ---------- */
const sepet = sepetKuponAnalizi(
  [
    grup('koctas', 1000, [{ ad: 'Mandu Temizlik Seti' }]),
    grup('teknosa', 30000, [{ ad: 'Dyson V15' }]),
    grup('vatan', 500, [{ ad: 'Kablo' }]),
  ],
  {
    kampanyalarBySite: {
      koctas: [{ metin: 'Kupon kodu ile %10', kapsam: 'site', indirim: { tip: 'yuzde', deger: 10 }, kodu: 'KOCTA10', guven: 'yuksek' }],
      teknosa: [{ metin: 'Seçili Dyson %5', kapsam: 'kategori', kategori: 'Dyson', indirim: { tip: 'yuzde', deger: 5 }, guven: 'yuksek' }],
      vatan: [],
    },
  },
);
kontrol('sepet toplam kazancı (100 + 1500)', sepet.toplamKazanc === 1600, String(sepet.toplamKazanc));
kontrol('toplam ara toplam (31500)', sepet.toplamAra === 31500, String(sepet.toplamAra));
kontrol('kuponlu toplam (29900)', sepet.kuponluToplam === 29900, String(sepet.kuponluToplam));
kontrol('kopyalanabilir kod listesi 1 kod', sepet.kodlar.length === 1 && sepet.kodlar[0].kod === 'KOCTA10', JSON.stringify(sepet.kodlar));
kontrol('kargo uyarısı var', sepet.uyarilar.some(u => /kargo/i.test(u)));
kontrol('kaynak bilgisi var', /kuponlar\.json/.test(sepet.kaynak || ''));

/* ---------- 10) Sepet: hiç uygun kupon yoksa dürüst mesaj ---------- */
const bosSepet = sepetKuponAnalizi([grup('vatan', 500, [{ ad: 'Kablo' }])], { kampanyalarBySite: { vatan: [] } });
kontrol('kupon yoksa toplamKazanc 0', bosSepet.toplamKazanc === 0);
kontrol('kupon yoksa kuponluToplam null', bosSepet.kuponluToplam === null);
kontrol('kupon yoksa dürüst uyarı', bosSepet.uyarilar.some(u => /koşulları karşılayan kupon bulunamadı/.test(u)));

/* ---------- 11) Kod kopyalama düğmesi ön yüzde bağlı mı ---------- */
const fs = await import('node:fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');
kontrol('sepetSonucGoster → sepetKuponPaneli çağrısı', /sepetKuponPaneli\(sonuc\)/.test(appJs));
kontrol('kupon alanı HTML’de var', /id="sepetKuponAlani"/.test(html));
kontrol('kopyalama düğmesi (data-kod) var', /class="kupon-kod-btn" data-kod=/.test(appJs));
kontrol('pano API + güvenli yedek var', /navigator\.clipboard/.test(appJs) && /execCommand\('copy'\)/.test(appJs));
kontrol('tümünü kopyala düğmesi var', /kuponHepsiBtn/.test(appJs));
kontrol('kargo uyarısı sunucudan geliyor', /kargo ayrı hesaplanır/i.test(fs.readFileSync('src/kuponSepeti.js', 'utf8')));

console.log(`KUPON-SEPET ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);
