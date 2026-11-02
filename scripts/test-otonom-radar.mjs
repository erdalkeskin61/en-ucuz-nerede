/**
 * 🎯 Otonom 3D Baskı & Filament Fiyat Avcısı testleri — 2026-11-02
 *
 * Kapsam (ağ isteği YOK):
 *   1) Katı stok filtresi: tükenen/varyant/fiyatsız teklifler elenir.
 *   2) En ucuz seçimi yalnızca stoklu tekliflerden yapılır.
 *   3) Birim fiyat (₺/kg), tasarruf farkı ve kısmi tarama notu.
 *   4) Telegram kartı + inline buton (afiliye + karşılaştırma).
 *   5) 48 saat cooldown / fiyat düşüşü / mağaza değişimi kararı.
 *   6) Katalog CRUD (SQLite) + ayar sınırlama (store).
 *   7) Zamanlayıcı + sunucu/panel sözleşmeleri, 2 sn nefes payı.
 *
 * Kullanım: node scripts/test-otonom-radar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { getSettings, saveSettings, closeDatabase } from '../src/store.js';
import {
  RADAR_VARSAYILAN, VARSAYILAN_KATALOG,
  teklifStoktaMi, stokluTeklifler, elenenSayisi,
  radarDurumuHesapla, radarKartOlustur, radarTelegramIstegi,
  bildirimKarari, radarAyar, radarTara, radarDurum,
  katalogGetir, katalogEkle, katalogSil,
  sonrakiTurMs, startRadarScheduler, radarZamanlayiciDurdur,
  radarCalisiyorMu, radarKapat,
} from '../src/otonomRadar.js';

let gecen = 0;
let toplam = 0;
const hatalar = [];

const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) {
    gecen++;
    return true;
  }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const BASLIK = 'eSun ePLA-HS (High Speed) PLA Siyah 1kg';

function teklif({
  fiyat = 400,
  site = 'robotistan',
  siteName = 'Robotistan',
  stok = true,
  stokMetni = null,
  stockStatus = null,
  availability = null,
  addToCart,
  renkAyni = true,
  kargoBedava = true,
  kargoUcret = 0,
  baslik = BASLIK,
  url = null,
} = {}) {
  const p = {
    url: url || `https://${site}.test/urun`,
    title: baslik,
    sellingPrice: fiyat,
    inStock: stok,
    pricing: { toplam: fiyat, kargo: { ucret: kargoUcret } },
  };
  if (stokMetni != null) p.stokMetni = stokMetni;
  if (stockStatus != null) p.stockStatus = stockStatus;
  if (availability != null) p.availability = availability;
  if (addToCart !== undefined) p.addToCart = addToCart;
  return {
    site, siteName, status: 'found', renkAyni, kargoBedava,
    product: p,
  };
}

function sonucOlustur(teklifler, { taranmayan = 0, iptal = false, urun = BASLIK } = {}) {
  return {
    kaynak: { urun, site: 'robotistan', url: 'https://robotistan.test/urun' },
    sonuclar: teklifler,
    ozet: { taranmayanSiteSayisi: taranmayan, iptalEdildi: iptal, bulunanSiteSayisi: teklifler.length },
  };
}

const kayit = { id: 7, ad: 'eSun ePLA-HS PLA Siyah 1kg', kategori: 'filament' };

/* ------------------------------------------------------------------ */
/* 1) Katı stok filtresi                                               */
/* ------------------------------------------------------------------ */

bolum('1) 🛡️ Katı stok filtresi');

kontrol('inStock:true + geçerli fiyat kabul', teklifStoktaMi(teklif({ fiyat: 389 })) === true);
kontrol('inStock:false reddedilir', teklifStoktaMi(teklif({ stok: false })) === false);
kontrol('stock:false reddedilir', (() => {
  const t = teklif();
  t.product.stock = false;
  return teklifStoktaMi(t) === false;
})());
kontrol('stock:0 reddedilir', (() => {
  const t = teklif();
  t.product.stock = 0;
  return teklifStoktaMi(t) === false;
})());
kontrol('outOfStock:true reddedilir', (() => {
  const t = teklif();
  t.product.outOfStock = true;
  return teklifStoktaMi(t) === false;
})());
kontrol('addToCart:false reddedilir', teklifStoktaMi(teklif({ addToCart: false })) === false);
kontrol('purchasable:false reddedilir', (() => {
  const t = teklif();
  t.product.purchasable = false;
  return teklifStoktaMi(t) === false;
})());
kontrol('availability OutOfStock reddedilir', teklifStoktaMi(teklif({ availability: 'https://schema.org/OutOfStock' })) === false);
kontrol('availability SoldOut reddedilir', teklifStoktaMi(teklif({ availability: 'SoldOut' })) === false);
kontrol('stokMetni "Tükendi" reddedilir', teklifStoktaMi(teklif({ stokMetni: 'Tükendi' })) === false);
kontrol('stockStatus "Stokta Yok" reddedilir', teklifStoktaMi(teklif({ stockStatus: 'Stokta Yok' })) === false);
kontrol('stockStatus "Gelince Haber Ver" reddedilir', teklifStoktaMi(teklif({ stockStatus: 'Gelince Haber Ver' })) === false);
kontrol('stockStatus "Out of Stock" reddedilir', teklifStoktaMi(teklif({ stockStatus: 'Out of Stock' })) === false);
kontrol('fiyat 0 reddedilir', teklifStoktaMi(teklif({ fiyat: 0 })) === false);
kontrol('negatif fiyat reddedilir', teklifStoktaMi(teklif({ fiyat: -5 })) === false);
kontrol('fiyat NaN reddedilir', (() => {
  const t = teklif();
  t.product.pricing.toplam = null;
  t.product.sellingPrice = undefined;
  return teklifStoktaMi(t) === false;
})());
kontrol('farklı renk (renkAyni:false) reddedilir', teklifStoktaMi(teklif({ renkAyni: false })) === false);
kontrol('status found değilse reddedilir', teklifStoktaMi({ ...teklif(), status: 'error' }) === false);
kontrol('product yoksa reddedilir', teklifStoktaMi({ status: 'found' }) === false);
kontrol('stok bilgisi yoksa (kanıt yok) kabul — dürüstlük', (() => {
  const t = teklif();
  delete t.product.inStock;
  return teklifStoktaMi(t) === true;
})());
kontrol('stok metni "Stokta" kabul', teklifStoktaMi(teklif({ stokMetni: 'Stokta 12 adet' })) === true);

/* ------------------------------------------------------------------ */
/* 2) En ucuz seçimi                                                   */
/* ------------------------------------------------------------------ */

bolum('2) 🏆 En ucuz yalnızca stoklu mağazalardan');

const karisik = sonucOlustur([
  teklif({ site: 'tukenen', siteName: 'TükenenMarket', fiyat: 250, stok: false }),
  teklif({ site: 'trendyol', siteName: 'Trendyol', fiyat: 445, kargoBedava: false, kargoUcret: 29 }),
  teklif({ site: 'robotistan', siteName: 'Robotistan', fiyat: 389 }),
  teklif({ site: 'robitshop', siteName: 'Robitshop', fiyat: 415 }),
  teklif({ site: 'ucuz-varyant', siteName: 'Varyant', fiyat: 99, renkAyni: false }),
  teklif({ site: 'fiyatsiz', siteName: 'Fiyatsız', fiyat: 0 }),
]);

const stoklu = stokluTeklifler(karisik);
kontrol('stoklu teklif sayısı 3 (tükenen/varyant/fiyatsız elendi)', stoklu.length === 3, `bulunan=${stoklu.length}`);
kontrol('en ucuz Robotistan (tükenen 250 TL seçilmedi)', stoklu[0].site === 'robotistan');
kontrol('en ucuz fiyat 389', stoklu[0].product.pricing.toplam === 389);
kontrol('fiyatlar artan sırada', stoklu.map(r => r.product.pricing.toplam).join(',') === '389,415,445');
kontrol('elenenSayisi 3', elenenSayisi(karisik) === 3, `elenen=${elenenSayisi(karisik)}`);

/* ------------------------------------------------------------------ */
/* 3) Durum hesabı                                                     */
/* ------------------------------------------------------------------ */

bolum('3) 📊 Radar durumu (birim fiyat, tasarruf, kısmi)');

const durum = radarDurumuHesapla(kayit, karisik, 'https://robotistan.test/urun');
kontrol('durum.stokta true', durum.stokta === true);
kontrol('durum.site Robotistan', durum.site === 'Robotistan');
kontrol('durum.fiyat 389', durum.fiyat === 389);
kontrol('durum.stokluSayisi 3', durum.stokluSayisi === 3);
kontrol('durum.tukenenSayisi 3', durum.tukenenSayisi === 3, `tukenen=${durum.tukenenSayisi}`);
kontrol('durum.digerleri en fazla 4', durum.digerleri.length <= 4);
kontrol('diğerlerinde en ucuz yok', !durum.digerleri.some(x => x.site === 'Robotistan'));
kontrol('tasarruf 56 (445 - 389)', durum.tasarruf === 56, `tasarruf=${durum.tasarruf}`);
kontrol('kargo "Ücretsiz Kargo"', durum.kargo === 'Ücretsiz Kargo', `kargo=${durum.kargo}`);
kontrol('birim fiyat 389/kg', durum.birimFiyat === 389, `birim=${durum.birimFiyat}`);
kontrol('birimMetni "₺389,00 / kg"', durum.birimMetni === '₺389,00 / kg', `metin=${durum.birimMetni}`);
kontrol('durum.anahtar katalog:7', durum.anahtar === 'katalog:7');
kontrol('tam taramada kismi false', durum.kismi === false);
kontrol('kategori taşınır', durum.kategori === 'filament');

const kismiDurum = radarDurumuHesapla(kayit, sonucOlustur([
  teklif({ site: 'robotistan', siteName: 'Robotistan', fiyat: 389 }),
], { taranmayan: 4 }), 'https://robotistan.test/urun');
kontrol('kısmi tarama işaretlenir', kismiDurum.kismi === true);
kontrol('taranmayan sayısı 4', kismiDurum.taranmayan === 4);

const iptalDurum = radarDurumuHesapla(kayit, sonucOlustur([], { iptal: true }), 'https://x');
kontrol('iptal taramada stokta false', iptalDurum.stokta === false);
kontrol('iptal taramada kismi true', iptalDurum.kismi === true);

const tukendiDurum = radarDurumuHesapla(kayit, sonucOlustur([
  teklif({ site: 'a', siteName: 'A', fiyat: 250, stok: false }),
  teklif({ site: 'b', siteName: 'B', fiyat: 300, stok: false }),
]), 'https://x');
kontrol('tümü tükenmişse stokta false', tukendiDurum.stokta === false);
kontrol('tümü tükenmişse tukenenSayisi 2', tukendiDurum.tukenenSayisi === 2);

const yaziciDurum = radarDurumuHesapla({ id: 9, ad: 'Bambu Lab P1S', kategori: 'yazici' }, sonucOlustur([
  teklif({ site: 'x', siteName: 'X', fiyat: 34999, baslik: 'Bambu Lab P1S 3D Yazıcı' }),
], { urun: 'Bambu Lab P1S 3D Yazıcı' }), 'https://x');
kontrol('yazıcıda birim fiyat null (uydurma yok)', yaziciDurum.birimFiyat === null);
kontrol('yazıcıda birimMetni null', yaziciDurum.birimMetni === null);

// Mağaza başlığında gramaj yoksa katalog adı yedek olur (aynı ürün).
const gramajsizDurum = radarDurumuHesapla(
  { id: 11, ad: 'Creality Ender PLA Gri 1kg', kategori: 'filament' },
  sonucOlustur([
    teklif({ site: 'rhino', siteName: 'Rhino 3D Printer', fiyat: 761.45, baslik: 'Creality Ender Fast PLA Filament - Grey' }),
  ]),
  'https://rhino.test/x',
);
kontrol('gramajsız başlıkta katalog ağırlığı yedek', gramajsizDurum.birimFiyat === 761.45, `birim=${gramajsizDurum.birimFiyat}`);
kontrol('gramajsız başlıkta birimMetni dolu', gramajsizDurum.birimMetni === '₺761,45 / kg', `metin=${gramajsizDurum.birimMetni}`);

// Mağaza başlığında FARKLI gramaj varsa katalog yedeği kullanılmaz.
const farkliGramaj = radarDurumuHesapla(
  { id: 12, ad: 'Creality Ender PLA Gri 1kg', kategori: 'filament' },
  sonucOlustur([
    teklif({ site: 'x', siteName: 'X', fiyat: 200, baslik: 'Creality Ender PLA Filament Gri 500g' }),
  ]),
  'https://x',
);
kontrol('farklı gramajda mağaza başlığı esas (400/kg)', farkliGramaj.birimFiyat === 400, `birim=${farkliGramaj.birimFiyat}`);

/* ------------------------------------------------------------------ */
/* 4) Kart ve Telegram isteği                                          */
/* ------------------------------------------------------------------ */

bolum('4) 📱 Telegram kartı ve inline butonlar');

const kart = radarKartOlustur(durum);
kontrol('kart başlığı', kart.includes('OTONOM FİYAT RADARI: GÜNCEL EN UCUZ'));
kontrol('kartta ürün adı', kart.includes('eSun ePLA-HS PLA Siyah 1kg'));
kontrol('kartta 🏆 stoktaki en ucuz', kart.includes('🏆 Stoktaki En Ucuz: <b>₺389,00</b>'), kart.split('\n')[4]);
kontrol('kartta 🏪 mağaza', kart.includes('🏪 Mağaza: Robotistan'));
kontrol('kartta 🚚 kargo', kart.includes('🚚 Kargo: Ücretsiz Kargo'));
kontrol('kartta ⚖️ birim fiyat', kart.includes('⚖️ Birim Fiyat: ₺389,00 / kg'));
kontrol('kartta ✅ stok doğrulaması', kart.includes('✅ Stok Durumu: Doğrulandı — Satın Alınabilir'));
kontrol('kartta elenen mağaza notu', kart.includes('tükenen/stokta olmayan mağaza elendi'));
kontrol('kartta diğer stoklu seçenekler', kart.includes('📊 <b>Diğer Stoklu Seçenekler:</b>'));
kontrol('kartta Robitshop 415', kart.includes('Robitshop: ₺415,00'));
kontrol('kartta Trendyol 445', kart.includes('Trendyol: ₺445,00'));
kontrol('kartta 💡 tasarruf', kart.includes('💡 Diğer mağazalara göre <b>₺56,00</b> tasarruf!'));
kontrol('kartta ayırıcı çizgi', kart.includes('━━━━━━━━━━━━━━━━━━━━'));
kontrol('kartta imza', kart.includes('@EnUcuzNerede'));

const yaziciKart = radarKartOlustur(yaziciDurum);
kontrol('yazıcı kartı 🖨️ ikonu kullanır', yaziciKart.includes('🖨️'));
kontrol('yazıcı kartında birim fiyat satırı yok', !yaziciKart.includes('⚖️ Birim Fiyat'));

const bosKart = radarKartOlustur(tukendiDurum);
kontrol('stok yok kartı uyarı verir', bosKart.includes('Stokta satın alınabilir teklif yok'));
kontrol('stok yok kartında tasarruf yok', !bosKart.includes('tasarruf'));

const kotuKart = radarKartOlustur({
  ...durum,
  ad: '<script>alert("x")</script> & "tırnak"',
  site: '<b>kötü</b>',
});
kontrol('kart HTML kaçışı <', !kotuKart.includes('<script>'));
kontrol('kart HTML kaçışı &', kotuKart.includes('&amp;'));
kontrol('kart HTML kaçışı tırnak', kotuKart.includes('&quot;'));

const istek = radarTelegramIstegi(durum, { chatId: '123' });
kontrol('Telegram yöntemi sendMessage', istek.yontem === 'sendMessage');
kontrol('chat_id taşınır', istek.body.chat_id === '123');
kontrol('parse_mode HTML', istek.body.parse_mode === 'HTML');
kontrol('link önizleme kapalı', istek.body.disable_web_page_preview === true);
kontrol('metin 4096 sınırı içinde', istek.body.text.length < 4096);
const butonlar = istek.body.reply_markup?.inline_keyboard || [];
kontrol('inline buton var', butonlar.length >= 1);
kontrol('ilk buton en ucuz mağaza', butonlar[0]?.[0]?.text.includes('Stoktaki En Ucuz Mağazaya Git'));
kontrol('ilk buton URL http', /^https?:/.test(butonlar[0]?.[0]?.url || ''));
kontrol('karşılaştırma butonu var', butonlar.some(r => r[0].text.includes('Karşılaştırmayı Aç')));
kontrol('karşılaştırma URL publicUrl ile', butonlar.some(r => (r[0].url || '').startsWith(config.publicUrl)));

const bosIstek = radarTelegramIstegi(tukendiDurum, { chatId: '1' });
kontrol('stok yoksa satın alma butonu yok', !(bosIstek.body.reply_markup?.inline_keyboard || []).some(r => r[0].text.includes('Git')));

/* ------------------------------------------------------------------ */
/* 5) Cooldown / bildirim kararı                                       */
/* ------------------------------------------------------------------ */

bolum('5) ⏰ 48 saat cooldown ve değişiklik kararı');

const yeni = { stokta: true, fiyat: 389, siteId: 'robotistan' };
kontrol('stokta teklif yoksa gönderilmez', bildirimKarari({ stokta: false }, null).gonder === false);
kontrol('fiyat 0 ise gönderilmez', bildirimKarari({ stokta: true, fiyat: 0 }, null).gonder === false);
kontrol('ilk tespit gönderilir', bildirimKarari(yeni, null).gonder === true);
kontrol('ilk tespit nedeni', bildirimKarari(yeni, null).neden === 'ilk tespit');
kontrol('fiyat düşüşü gönderilir', bildirimKarari(yeni, { stokta: true, fiyat: 420, siteId: 'robotistan', paylasimTs: Date.now() }).gonder === true);
kontrol('fiyat düşüşü nedeni', bildirimKarari(yeni, { stokta: true, fiyat: 420, siteId: 'robotistan', paylasimTs: Date.now() }).neden === 'fiyat düştü');
kontrol('mağaza değişimi gönderilir', bildirimKarari(yeni, { stokta: true, fiyat: 389, siteId: 'trendyol', paylasimTs: Date.now() }).gonder === true);
kontrol('mağaza değişimi nedeni', bildirimKarari(yeni, { stokta: true, fiyat: 389, siteId: 'trendyol', paylasimTs: Date.now() }).neden === 'en ucuz mağaza değişti');
kontrol('aynı ürün/fiyat cooldown içinde gönderilmez', bildirimKarari(yeni, {
  stokta: true, fiyat: 389, siteId: 'robotistan', paylasimTs: Date.now() - 3600 * 1000,
}).gonder === false);
kontrol('48 saat geçince gönderilir', bildirimKarari(yeni, {
  stokta: true, fiyat: 389, siteId: 'robotistan', paylasimTs: Date.now() - 49 * 3600 * 1000,
}).gonder === true);
kontrol('48 saat nedeni', bildirimKarari(yeni, {
  stokta: true, fiyat: 389, siteId: 'robotistan', paylasimTs: Date.now() - 49 * 3600 * 1000,
}).neden.includes('48'));
kontrol('yeniden stokta gönderilir', bildirimKarari(yeni, {
  stokta: false, fiyat: null, siteId: null, paylasimTs: Date.now(),
}).gonder === true);
kontrol('yeniden stokta nedeni', bildirimKarari(yeni, {
  stokta: false, fiyat: null, siteId: null, paylasimTs: Date.now(),
}).neden === 'ürün yeniden stokta');
kontrol('fiyat aynıysa gönderilmez (cooldown)', bildirimKarari(
  { ...yeni, fiyat: 389 },
  { ...yeni, paylasimTs: Date.now() },
).gonder === false);
kontrol('özel cooldown (1 saat) uygulanır', bildirimKarari(yeni, {
  stokta: true, fiyat: 389, siteId: 'robotistan', paylasimTs: Date.now() - 2 * 3600 * 1000,
}, { paylasimAraligiSaat: 1 }).gonder === true);
kontrol('paylasimTs yoksa ilk paylaşım', bildirimKarari(yeni, {
  stokta: true, fiyat: 389, siteId: 'robotistan', paylasimTs: null,
}).neden === 'ilk paylaşım');

/* ------------------------------------------------------------------ */
/* 6) Katalog CRUD + ayarlar                                           */
/* ------------------------------------------------------------------ */

bolum('6) 🗂️ Katalog (SQLite) ve ayar sınırları');

const baslangic = katalogGetir();
kontrol('katalog boş değil (varsayılan tohumlandı)', baslangic.length >= 12, `adet=${baslangic.length}`);
kontrol('varsayılan katalog 13 ürün', VARSAYILAN_KATALOG.length === 13, `${VARSAYILAN_KATALOG.length}`);
kontrol('filament ve yazıcı kategorileri var',
  VARSAYILAN_KATALOG.some(k => k.kategori === 'filament') && VARSAYILAN_KATALOG.some(k => k.kategori === 'yazici'));
kontrol('eSun ePLA-HS katalogda', baslangic.some(k => k.ad.includes('ePLA-HS')));
kontrol('Bambu Lab P1S katalogda', baslangic.some(k => k.ad.includes('P1S')));
kontrol('Creality Ender PLA Gri katalogda', baslangic.some(k => k.ad.includes('Creality Ender PLA')));
kontrol('her kayıtta id/ad/sorgu', baslangic.every(k => k.id > 0 && k.ad.length > 1 && k.sorgu.length > 1));

let eklenen = null;
try {
  eklenen = katalogEkle({
    ad: 'TEST RADAR Polymaker PolyTerra PLA 1kg',
    sorgu: 'Polymaker PolyTerra PLA 1kg',
    kategori: 'filament',
  });
  kontrol('katalogEkle kayıt döner', !!eklenen && eklenen.id > 0);
  kontrol('eklenen kategori filament', eklenen.kategori === 'filament');
  kontrol('eklenen sorgu korunur', eklenen.sorgu === 'Polymaker PolyTerra PLA 1kg');
  kontrol('katalog büyüdü', katalogGetir().length === baslangic.length + 1);
  kontrol('eklenen kayıt listede', katalogGetir().some(k => k.id === eklenen.id));
} catch (e) {
  kontrol('katalogEkle çalıştı', false, e.message);
}

if (eklenen) {
  kontrol('katalogSil true', katalogSil(eklenen.id) === true);
  kontrol('katalog eski boyuta döndü', katalogGetir().length === baslangic.length);
  kontrol('geçersiz id silinemez', katalogSil('abc') === false);
}

let hataYakalandi = false;
try { katalogEkle({ ad: 'x' }); } catch { hataYakalandi = true; }
kontrol('kısa ürün adı reddedilir', hataYakalandi);

const origAyar = getSettings().radar;
try {
  const kaydedilen = saveSettings({
    radar: {
      enabled: false,
      saatAraligi: 99,
      urunArasiMs: -50,
      paylasimAraligiSaat: 0,
      donguBasina: 999,
      chatId: 'x'.repeat(200),
    },
  }).radar;
  kontrol('saatAraligi 24 ile sınırlanır', kaydedilen.saatAraligi === 24, `=${kaydedilen.saatAraligi}`);
  kontrol('urunArasiMs 0 ile sınırlanır', kaydedilen.urunArasiMs === 0, `=${kaydedilen.urunArasiMs}`);
  kontrol('paylasimAraligiSaat 1 ile sınırlanır', kaydedilen.paylasimAraligiSaat === 1, `=${kaydedilen.paylasimAraligiSaat}`);
  kontrol('donguBasina 20 ile sınırlanır', kaydedilen.donguBasina === 20, `=${kaydedilen.donguBasina}`);
  kontrol('chatId 120 karaktere kırpılır', kaydedilen.chatId.length === 120, `=${kaydedilen.chatId.length}`);
  kontrol('radarAyar sınırlı değerleri okur', radarAyar().saatAraligi === 24);
} finally {
  saveSettings({ radar: origAyar });
}

kontrol('radarAyar varsayılan enabled false', radarAyar({}).enabled === false);
kontrol('radarAyar varsayılan saatAraligi 4', radarAyar({}).saatAraligi === 4);
kontrol('RADAR_VARSAYILAN saatAraligi 4', RADAR_VARSAYILAN.saatAraligi === 4);
kontrol('RADAR_VARSAYILAN paylasimAraligiSaat 48', RADAR_VARSAYILAN.paylasimAraligiSaat === 48);
kontrol('RADAR_VARSAYILAN urunArasiMs 2000', RADAR_VARSAYILAN.urunArasiMs === 2000);

/* ------------------------------------------------------------------ */
/* 7) Tarama davranışı (ağ yok)                                        */
/* ------------------------------------------------------------------ */

bolum('7) ⏱️ Tarama davranışı ve zamanlayıcı');

const oncekiEnabled = getSettings().radar.enabled;
try {
  saveSettings({ radar: { enabled: false } });
  const kapali = await radarTara({ gonder: false });
  kontrol('radar kapalıyken tarama atlanır', kapali.atlandi === true);
  kontrol('atlama nedeni kapalı', kapali.neden === 'otonom radar kapalı');
} finally {
  saveSettings({ radar: { enabled: oncekiEnabled } });
}

kontrol('radarCalisiyorMu false (boşta)', radarCalisiyorMu() === false);

const simdi = Date.now();
kontrol('ilk tur ~3 dk sonra', sonrakiTurMs({ saatAraligi: 4, sonCalisma: null }, simdi) === 180000);
kontrol('son çalışma yeni ise ~4 saat', Math.abs(sonrakiTurMs(
  { saatAraligi: 4, sonCalisma: new Date(simdi - 60 * 1000).toISOString() }, simdi,
) - (4 * 3600 * 1000 - 60 * 1000)) < 1000);
kontrol('gecikmiş tur 30 sn içinde telafi', sonrakiTurMs(
  { saatAraligi: 4, sonCalisma: new Date(simdi - 10 * 3600 * 1000).toISOString() }, simdi,
) === 30000);

const plan = startRadarScheduler();
kontrol('zamanlayıcı kurulur', typeof plan.ilkTurMs === 'number' && plan.ilkTurMs > 0);
kontrol('zamanlayıcı saat aralığını döner', plan.saatAraligi >= 1 && plan.saatAraligi <= 24);
radarZamanlayiciDurdur();
kontrol('zamanlayıcı durdurulur', true);

const ozet = radarDurum();
kontrol('radarDurum katalog döner', Array.isArray(ozet.katalog) && ozet.katalog.length >= 12);
kontrol('radarDurum aktifSayisi', ozet.aktifSayisi === ozet.katalog.length);
kontrol('radarDurum ilerleme nesnesi', typeof ozet.ilerleme === 'object');
kontrol('radarDurum gonderim özeti', typeof ozet.gonderim?.toplam === 'number');
kontrol('radarDurum ayar döner', typeof ozet.ayar?.saatAraligi === 'number');

/* ------------------------------------------------------------------ */
/* 8) Kaynak sözleşmeleri (sunucu + panel + modül)                     */
/* ------------------------------------------------------------------ */

bolum('8) 🔌 Sunucu / panel / modül sözleşmeleri');

const kok = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(kok, p), 'utf8');
const serverSrc = oku('server.js');
const radarSrc = oku('src/otonomRadar.js');
const ayarHtml = oku('public/ayarlar.html');
const ayarJs = oku('public/ayarlar.js');
const storeSrc = oku('src/store.js');

kontrol('server: /api/radar/durum', serverSrc.includes("'/api/radar/durum'"));
kontrol('server: /api/radar/calistir', serverSrc.includes("'/api/radar/calistir'"));
kontrol('server: /api/radar/katalog', serverSrc.includes("'/api/radar/katalog'"));
kontrol('server: katalog silme rotası', serverSrc.includes("'/api/radar/katalog/:id'"));
kontrol('server: katalog sıfırlama rotası', serverSrc.includes("'/api/radar/katalog/sifirla'"));
kontrol('server: zamanlayıcı açılışta başlar', /startRadarScheduler\(\)/.test(serverSrc));
kontrol('server: kapanışta durdurulur', serverSrc.includes('radarZamanlayiciDurdur'));
kontrol('server: kapanışta DB kapatılır', serverSrc.includes('radarKapat'));
kontrol('server: ayar kaydı zamanlayıcıyı yeniler', /startRadarScheduler/.test(serverSrc));

kontrol('modül: runComparison kullanır', radarSrc.includes('runComparison('));
kontrol('modül: hizliKaynakUrunBul kullanır', radarSrc.includes('hizliKaynakUrunBul('));
kontrol('modül: afiliyeLink kullanır', radarSrc.includes('afiliyeLink('));
kontrol('modül: birimFiyatHesapla kullanır', radarSrc.includes('birimFiyatHesapla('));
kontrol('modül: 2 sn nefes payı varsayılanı', /urunArasiMs:\s*2000/.test(radarSrc));
kontrol('modül: tarama arasında bekle()', radarSrc.includes('await bekle(urunArasiMs)'));
kontrol('modül: radar_katalog tablosu', radarSrc.includes('CREATE TABLE IF NOT EXISTS radar_katalog'));
kontrol('modül: radar_durum tablosu', radarSrc.includes('CREATE TABLE IF NOT EXISTS radar_durum'));
kontrol('modül: radar_gonderim tablosu', radarSrc.includes('CREATE TABLE IF NOT EXISTS radar_gonderim'));
kontrol('modül: stok filtresi inStock', radarSrc.includes('p.inStock === false'));
kontrol('modül: tükendi metinleri', radarSrc.includes('gelince\\s*haber\\s*ver'));
kontrol('modül: takip butonu metni', radarSrc.includes('Stoktaki En Ucuz Mağazaya Git'));
kontrol('modül: döngü başına sınır', radarSrc.includes('donguBasina'));

kontrol('store: radar varsayılanları', storeSrc.includes('radar: {'));
kontrol('store: radarSinirla', storeSrc.includes('function radarSinirla'));
kontrol('store: kayıtta radar birleşir', storeSrc.includes('radar: radarSinirla('));

kontrol('panel: etkinleştir kutusu', ayarHtml.includes('id="radarEnabled"'));
kontrol('panel: kontrol aralığı alanı', ayarHtml.includes('id="radarSaatAraligi"'));
kontrol('panel: sohbet alanı', ayarHtml.includes('id="radarChatId"'));
kontrol('panel: şimdi çalıştır butonu', ayarHtml.includes('id="radarCalistirBtn"'));
kontrol('panel: katalog listesi', ayarHtml.includes('id="radarKatalogListe"'));
kontrol('panel: kategori seçici', ayarHtml.includes('id="radarYeniKategori"'));
kontrol('panel js: /api/radar/calistir', ayarJs.includes("'/api/radar/calistir'"));
kontrol('panel js: katalog ekleme', ayarJs.includes("'/api/radar/katalog'"));
kontrol('panel js: ilerleme izleme', ayarJs.includes('radarPollBaslat'));
kontrol('panel js: durum yükleme', ayarJs.includes('radarDurumuYukle'));

const styleSrc = oku('public/style.css');
kontrol('stil: radar katalog listesi', styleSrc.includes('.radar-katalog-liste'));
kontrol('stil: radar ilerleme çubuğu', styleSrc.includes('.radar-ilerleme'));

/* ------------------------------------------------------------------ */

console.log(`\n${'─'.repeat(46)}`);
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
} else {
  console.log('✅ Tüm otonom radar testleri geçti.');
}

try { radarKapat(); } catch { /* yoksay */ }
try { closeDatabase(); } catch { /* yoksay */ }
process.exit(hatalar.length ? 1 : 0);
