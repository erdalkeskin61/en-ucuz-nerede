/**
 * 🤖 Telegram akıllı asistan testleri — 2026-11-02
 *
 * Kapsam:
 *  1) Metin sınıflandırma: link / desteklenmeyen link / düz ürün adı
 *  2) Zengin mesaj biçimi: başlık, en ucuz, kargo, ₺/kg, ilk 5 mağaza,
 *     tasarruf farkı, SWR "Son kontrol" notu
 *  3) HTML güvenliği: <, >, & kaçışı (Telegram parse hatası yok)
 *  4) Inline butonlar: afiliye mağaza linki, takip callback_data, detay linki
 *  5) Takip akışı: callback → addTracked → DB kaydı → temizlik
 *  6) SWR: son 2 saatte taranmış ürün önbellekten, yaş metni
 *  7) Dayanıklılık: token yok/geçersiz → çökme yok, kuyruk (spam) koruması
 *
 * Kullanım: node scripts/test-telegram-bot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  esc, baslikKisalt, linkVarMi, kaynakBul, kargoMetni, enUcuzTeklif,
  sonucMesajiOlustur, butonlariOlustur, takipKaydiOlustur, takipEt,
  kisaYasMetni, bekleyenTakipSayisi, BOT_ADI, BOT_SWR_MS,
} from '../src/telegramBot.js';
import { getTracked, removeTracked, closeDatabase } from '../src/store.js';
import { config } from '../src/config.js';

let gecen = 0, toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);
const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const hamMetin = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

/* ---------------------------------------------------------------- */
bolum('1) Metin sınıflandırma');
const l1 = kaynakBul('https://www.trendyol.com/logitech-g102-p-123');
kontrol('Trendyol linki → link', l1.tur === 'link' && l1.site?.id === 'trendyol', JSON.stringify(l1.tur));
const l2 = kaynakBul('https://bilinmeyen.example/urun/x');
kontrol('desteklenmeyen link', l2.tur === 'gecersiz-link', l2.tur);
const t1 = kaynakBul('Bambu Lab P1S');
kontrol('düz metin → metin', t1.tur === 'metin' && t1.metin === 'Bambu Lab P1S', JSON.stringify(t1));
kontrol('metinde link varsa link kazanır',
  kaynakBul('şu ürün https://www.trendyol.com/x-p-1 bak').tur === 'link');
kontrol('linkVarMi doğru', linkVarMi('abc https://x.com') === true && linkVarMi('Bambu Lab P1S') === false);
kontrol('BOT_SWR_MS = 2 saat', BOT_SWR_MS === 2 * 60 * 60 * 1000, String(BOT_SWR_MS));

/* ---------------------------------------------------------------- */
bolum('2) HTML güvenliği ve kısaltma');
kontrol('& kaçışı', esc('A & B') === 'A &amp; B', esc('A & B'));
kontrol('< kaçışı', esc('<script>') === '&lt;script&gt;', esc('<script>'));
kontrol('> kaçışı', esc('a > b') === 'a &gt; b', esc('a > b'));
kontrol('tırnak kaçışı', esc('a"b') === 'a&quot;b', esc('a"b'));
kontrol('null → boş', esc(null) === '');
kontrol('uzun başlık kısaltılır', baslikKisalt('x'.repeat(200), 90).length <= 91);
kontrol('kısaltmada … var', baslikKisalt('y'.repeat(200), 20).endsWith('…'));
kontrol('satır sonları tekilleşir', baslikKisalt('a\n\n b') === 'a b');

/* ---------------------------------------------------------------- */
bolum('3) Zengin mesaj biçimi');
function mk(site, siteName, fiyat, { kargo = 0, stok = true, baslik = 'Bambu Lab P1S Combo 3D Yazıcı' } = {}) {
  return {
    site, siteName, status: 'found', renkAyni: true, kargoBedava: kargo === 0,
    product: {
      url: `https://${site}.test/urun`,
      title: baslik,
      inStock: stok,
      sellingPrice: fiyat,
      pricing: { toplam: fiyat, kargo: { ucret: kargo, uygulanir: kargo > 0 } },
    },
  };
}
const res = {
  kaynak: { site: 'trendyol', urun: 'Bambu Lab P1S Combo 3D Yazıcı', modelKodu: 'P1S-COMBO' },
  sonuclar: [
    mk('robotistan', 'Robotistan', 34899),
    mk('robitshop', 'Robitshop', 35250, { kargo: 45 }),
    mk('3dmarketim', '3DMarketim', 36100),
    mk('trendyol', 'Trendyol', 37499),
    mk('vatan', 'Vatan Bilgisayar', 38999),
    mk('hepsiburada', 'Hepsiburada', 42999, { stok: false }),
  ],
  ozet: { enUcuzSite: 'Robotistan', enUcuzFiyat: 34899, bulunanSiteSayisi: 6, stoktaVarSayisi: 5, stoktaYokSayisi: 1 },
};

const d = enUcuzTeklif(res);
kontrol('en ucuz Robotistan seçildi', d.enUcuz?.site === 'robotistan', d.enUcuz?.site);
kontrol('en ucuz fiyat 34899', d.fiyat === 34899, String(d.fiyat));
kontrol('tükenen ürün en ucuz seçilmedi', d.enUcuz?.site !== 'hepsiburada');
kontrol('en pahalı 38999 (stokta)', d.enPahaliFiyat === 38999, String(d.enPahaliFiyat));

const mesaj = sonucMesajiOlustur(res);
const duz = hamMetin(mesaj);
kontrol('başlık var', duz.includes('Bambu Lab P1S Combo 3D Yazıcı'));
kontrol('ayırıcı çizgi var', mesaj.includes('━'));
kontrol('🏆 En Ucuz satırı', /🏆 En Ucuz: ₺34\.899,00 \(Robotistan\)/.test(duz), duz.split('\n')[3]);
kontrol('🚚 Kargo satırı (ücretsiz)', /🚚 Kargo: Kargo Bedava/.test(duz));
kontrol('📊 mağaza karşılaştırması başlığı', /📊 Mağaza Karşılaştırması \(6 Site\)/.test(duz), duz.split('\n').find(x => x.includes('Mağaza Kar')) || '');
kontrol('🥇 birinci sıra', /1\. 🥇 Robotistan/.test(duz), duz.split('\n').find(x => x.startsWith('1.')) || '');
kontrol('🥈 ikinci sıra', /2\. 🥈 Robitshop/.test(duz));
kontrol('🥉 üçüncü sıra', /3\. 🥉 3DMarketim/.test(duz));
kontrol('ücretli kargo gösteriliyor', /\+₺45,00 Kargo/.test(duz), duz.split('\n').find(x => x.includes('Robitshop')) || '');
kontrol('4. sıra emojisiz', /4\. <b>Trendyol<\/b>/.test(mesaj));
kontrol('tasarruf farkı 4.100 TL', /₺4\.100,00/.test(duz), duz.split('\n').find(x => x.includes('tasarruf')) || '');
kontrol('en fazla 5 mağaza listelenir', (mesaj.match(/^\d\. /gm) || []).length === 5, String((mesaj.match(/^\d\. /gm) || []).length));
kontrol('tükenen ürün listede 🔴', /Hepsiburada/.test(duz) === false, 'ilk 5 dışında kalmalı');
kontrol('mesaj 4096 sınırı altında', mesaj.length < 4000, String(mesaj.length));
kontrol('ham < karakteri yok (HTML)', !(mesaj.replace(/<\/?(b|i|a|u|code)[^>]*>/g, '').includes('<')));
kontrol('bot imzası var', mesaj.includes(BOT_ADI));

// Filamentte birim fiyat
const filRes = {
  kaynak: { site: 'trendyol', urun: 'eSun PLA+ Filament 1.75mm 1kg' },
  sonuclar: [
    mk('trendyol', 'Trendyol', 850, { baslik: 'eSun PLA+ Filament 1.75mm 1kg' }),
    mk('robotistan', 'Robotistan', 875, { baslik: 'eSun PLA+ Filament 1.75mm 2.5 kg' }),
    mk('hepsiburada', 'Hepsiburada', 220, { baslik: 'eSun PLA+ Filament 1.75mm 500g' }),
  ],
  ozet: { bulunanSiteSayisi: 3, stoktaVarSayisi: 3 },
};
const filMesaj = sonucMesajiOlustur(filRes);
const filDuz = hamMetin(filMesaj);
kontrol('filamentte ⚖️ Birim Fiyat satırı',
  /Birim Fiyat: ₺440,00 \/ kg/.test(filDuz),
  filDuz.split('\n').find(x => x.includes('Birim')) || '');
kontrol('en ucuz = 500 g (₺220,00)', /En Ucuz: ₺220,00/.test(filDuz), filDuz.split('\n').find(x => x.includes('En Ucuz')) || '');
kontrol('gramaj tuzağı uyarısı (en iyi ₺/kg)',
  /En iyi birim fiyat:.*Robotistan.*₺350,00 \/ kg/.test(filDuz),
  filDuz.split('\n').find(x => x.includes('En iyi birim')) || '');
kontrol('makara bilgisi (2,5 kg)', /2,5 kg makara/.test(filDuz));

// Yazıcıda birim fiyat YOK
const yaziciMesaj = sonucMesajiOlustur(res);
kontrol('yazıcıda birim fiyat satırı yok', !hamMetin(yaziciMesaj).includes('Birim Fiyat'));

// Reçine L
const recineRes = {
  kaynak: { urun: 'Anycubic Water Washable Reçine 1000 ml' },
  sonuclar: [mk('direnc', 'Direnc.net', 720, { baslik: 'Anycubic Water Washable Reçine 1000 ml' })],
  ozet: { bulunanSiteSayisi: 1, stoktaVarSayisi: 1 },
};
const recineDuz = hamMetin(sonucMesajiOlustur(recineRes));
kontrol('reçinede TL / L', /Birim Fiyat: ₺720,00 \/ L/.test(recineDuz), recineDuz.split('\n').find(x => x.includes('Birim')) || '');

// SWR notu
const swrMesaj = sonucMesajiOlustur(res, { yasNotu: '15 dk önce' });
kontrol('SWR son kontrol notu', /⚡ \(Son kontrol: 15 dk önce\)/.test(hamMetin(swrMesaj)), hamMetin(swrMesaj).slice(-120));
kontrol('SWR notu yoksa yazılmaz', !sonucMesajiOlustur(res).includes('Son kontrol'));

// Hiç sonuç yok
const bosMesaj = sonucMesajiOlustur({ kaynak: { urun: 'X' }, sonuclar: [], ozet: {} });
kontrol('boş sonuçta dürüst mesaj', /Stokta fiyat bulunamadı/.test(hamMetin(bosMesaj)));

const kisa = kisaYasMetni(15 * 60000);
kontrol('kisaYasMetni 15 dk', kisa === '15 dk önce', kisa);
kontrol('kisaYasMetni saat', kisaYasMetni(125 * 60000) === '2 sa 5 dk önce', kisaYasMetni(125 * 60000));
kontrol('kisaYasMetni az önce', kisaYasMetni(20000) === 'az önce', kisaYasMetni(20000));

/* ---------------------------------------------------------------- */
bolum('4) Kargo metni');
kontrol('bedava', kargoMetni(mk('a', 'A', 100)) === 'Kargo Bedava');
kontrol('ücretli', kargoMetni(mk('a', 'A', 100, { kargo: 49 })) === '+₺49,00 Kargo', kargoMetni(mk('a', 'A', 100, { kargo: 49 })));
kontrol('belirsiz', kargoMetni({ product: { pricing: { kargo: {} } } }) === 'Kargo bilinmiyor');

/* ---------------------------------------------------------------- */
bolum('5) Inline butonlar');
const hash = takipKaydiOlustur(res, 'https://www.trendyol.com/bambu-p1s-p-1');
const buton = butonlariOlustur(res, { takipHash: hash, kaynakUrl: 'https://www.trendyol.com/bambu-p1s-p-1' });
const duzButonlar = buton.inline_keyboard.flat();
kontrol('en ucuz mağaza butonu', duzButonlar.some(b => /En Ucuz Mağazaya Git/.test(b.text) && /^https?:/.test(b.url || '')), JSON.stringify(duzButonlar.map(b => b.text)));
kontrol('takip butonu callback_data', duzButonlar.some(b => b.callback_data === 'takip_' + hash), String(hash));
kontrol('detay butonu public URL', duzButonlar.some(b => /Sitede Detaylı İncele/.test(b.text) && b.url?.startsWith(config.publicUrl + '/?url=')), duzButonlar.find(b => /Detaylı/.test(b.text))?.url);
kontrol('butonlar en fazla 2 satır', buton.inline_keyboard.length <= 2, String(buton.inline_keyboard.length));
kontrol('hash 12 karakter hex', /^[a-f0-9]{12}$/.test(hash), hash);

/* ---------------------------------------------------------------- */
bolum('6) Takip akışı (callback → DB)');
const oncekiSayi = getTracked().length;
const takip = takipEt(hash);
kontrol('takip başarılı', /takibe alındı/i.test(hamMetin(takip.mesaj)), hamMetin(takip.mesaj).slice(0, 80));
kontrol('DB kaydı oluştu', getTracked().length === oncekiSayi + 1, `${oncekiSayi} → ${getTracked().length}`);
const kayit = takip.kayit;
kontrol('hedef fiyat = mevcut en ucuz', kayit?.hedefFiyat === 34899, String(kayit?.hedefFiyat));
kontrol('ürün adresi kaydedildi', Array.isArray(kayit?.urunler) && kayit.urunler[0]?.url?.includes('robotistan'), JSON.stringify(kayit?.urunler));
kontrol('model kodu taşındı', kayit?.modelKodu === 'P1S-COMBO', String(kayit?.modelKodu));

// Temizlik: test kaydını sil
if (kayit?.id) removeTracked(kayit.id);
kontrol('test kaydı temizlendi', getTracked().length === oncekiSayi, String(getTracked().length));

// Geçersiz hash
const gecersiz = takipEt('deadbeefdead');
kontrol('geçersiz hash dürüst mesaj', /artık geçerli değil/.test(hamMetin(gecersiz.mesaj)), hamMetin(gecersiz.mesaj));
kontrol('bekleyen takip sayısı sayısal', typeof bekleyenTakipSayisi() === 'number');

/* ---------------------------------------------------------------- */
bolum('7) Dayanıklılık ve kaynak sözleşmesi');
const kaynak = oku('src/telegramBot.js');
kontrol('hizliKaynakUrunBul kullanılıyor', /hizliKaynakUrunBul\(/.test(kaynak));
kontrol('runComparison kullanılıyor', /runComparison\(/.test(kaynak));
kontrol('birimFiyatHesapla kullanılıyor', /birimFiyatHesapla\(/.test(kaynak));
kontrol('afiliyeLink kullanılıyor', /afiliyeLink\(/.test(kaynak));
kontrol('addTracked kullanılıyor', /addTracked\(/.test(kaynak));
kontrol('anlikAl (SWR) kullanılıyor', /anlikAl\(/.test(kaynak));
kontrol('SWR 2 saat penceresi', /BOT_SWR_MS = 2 \* 60 \* 60 \* 1000/.test(kaynak));
kontrol('metin araması akışı', /async function metinAramasiYap/.test(kaynak));
kontrol('bulunamadı mesajı', /eşleşen ürün bulunamadı/.test(kaynak));
kontrol('callback_query dinleniyor', /update\.callback_query/.test(kaynak));
kontrol('allowed_updates callback_query içeriyor', /callback_query/.test(kaynak) && /allowed_updates/.test(kaynak));
kontrol('token yoksa çökmüyor (uyarı + bekleme)',
  /Token tanımlı değil ya da bot kapalı/.test(kaynak) && /r, 30000/.test(kaynak));
kontrol('geçersiz token polling durduruyor', /res\.status === 401 \|\| res\.status === 404/.test(kaynak));
kontrol('sohbet başına kuyruk', /SOHBET_KUYRUGU/.test(kaynak) && /MAKS_KUYRUK/.test(kaynak));
kontrol('kuyruk dolu mesajı', /Çok fazla arama sırada/.test(kaynak));
kontrol('4096 karakter sınırı', /MESAJ_LIMIT = 4000/.test(kaynak));
kontrol('HTML escape fonksiyonu', /export function esc\(/.test(kaynak));
kontrol('/liste komutu', /'\/liste'/.test(kaynak));
kontrol('detay linki PUBLIC_URL kullanıyor', /config\.publicUrl/.test(kaynak));

const server = oku('server.js');
kontrol('sunucu startTelegramBot çağırıyor', /startTelegramBot\(\)/.test(server));

console.log(`\nTELEGRAM-BOT ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
closeDatabase();
process.exitCode = gecen === toplam ? 0 : 1;
