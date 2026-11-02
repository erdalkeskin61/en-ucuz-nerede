/**
 * 🎯 Telegram Otonom Radar & Kişisel Alarm komut testleri — 2026-11-02
 *
 * Kapsam (ağ isteği YOK — fetch mock'lanır):
 *   1) Admin koruması: /radar_tara, /radar_ekle, /radar_sil yabancıya kapalı.
 *   2) /radar & /radar_durum: durum, ürün sayısı, son tur, dip fiyatlar,
 *      "Şimdi Taramayı Başlat" inline butonu.
 *   3) /radar_tara: radarBaslat({zorla:true, gonder:true}) çağrısı.
 *   4) /radar_ekle / /radar_sil: gerçek SQLite katalog CRUD (ID ve ad ile).
 *   5) /radar_liste: ID + kategori listesi + silme ipucu.
 *   6) /yardim: yeni komutlar ve HTML kaçışı.
 *   7) Callback: radar_tara (admin), alarm:takip:radar:<id>, alarm:takip:<hash>.
 *   8) Kişisel alarm: tracked.chatId kalıcılığı + /liste izolasyonu.
 *
 * Kullanım: node scripts/test-telegram-radar.mjs
 * Testin oluşturduğu katalog/takip kayıtları sonunda SİLİNİR.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  getSettings, getTracked, addTracked, removeTracked, updateTracked, closeDatabase,
} from '../src/store.js';
import {
  handleMessage, handleCallbackQuery, __radarModuluAyarla,
  yoneticiMi, komutAyikla, takipKaydiOlustur, butonlariOlustur,
} from '../src/telegramBot.js';

let gecen = 0;
let toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

/* ------------------------------------------------------------------ */
/* Telegram API mock                                                   */
/* ------------------------------------------------------------------ */

const gonderilen = [];
globalThis.fetch = async (url, opts = {}) => {
  const body = JSON.parse(opts.body || '{}');
  const method = String(url).split('/').pop();
  gonderilen.push({ method, body });
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { message_id: gonderilen.length } }),
  };
};

const ADMIN = String(getSettings().telegram?.chatId || '').trim();
const YABANCI = '999000111';
const sonMesaj = () => [...gonderilen].reverse().find(x => x.method === 'sendMessage') || null;
const sonMetin = () => sonMesaj()?.body?.text || '';
const sonCevap = () => [...gonderilen].reverse().find(x => x.method === 'answerCallbackQuery') || null;

if (!ADMIN) {
  console.log('⚠️ ATLANDI: settings.telegram.chatId tanımlı değil (admin testleri için gerekli).');
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Radar modülü enjeksiyonu (ağ/DB taraması olmadan)                   */
/* ------------------------------------------------------------------ */

const gercek = await import('../src/otonomRadar.js');

let durumVerisi = {
  ayar: { enabled: true, saatAraligi: 4 },
  katalogSayisi: 13,
  sonCalisma: '2026-11-02T16:30:00.000Z',
  sonRapor: { taranan: 13, stoktaBulunan: 9, hataSayisi: 1 },
  durumlar: [
    { ad: 'Creality Ender PLA Gri 1kg', site: 'Ventatek', fiyat: 758.65, stokta: true },
    { ad: 'Bambu Lab P1S 3D Yazıcı', site: 'n11', fiyat: 34999, stokta: true },
    { ad: 'Tükenen Örnek Ürün', site: null, fiyat: null, stokta: false },
  ],
  gonderim: { bugun: 2, toplam: 5 },
};
const taramaCagrilari = [];

__radarModuluAyarla(async () => ({
  ...gercek,
  radarDurum: () => durumVerisi,
  radarBaslat: (opts) => {
    taramaCagrilari.push(opts);
    return { basladi: true, ilerleme: { calisiyor: true } };
  },
  radarDurumVerisi: (id) => (Number(id) === 1
    ? {
      ad: 'Radar Test Ürünü', urun: 'Radar Test Ürünü',
      site: 'TestMarket', siteId: 'testmarket',
      fiyat: 123.45, hamUrl: 'https://testmarket.example/urun',
      stokta: true, katalogId: 1,
    }
    : null),
}));

const temizlenecekTakipler = [];
const temizle = () => {
  for (const id of temizlenecekTakipler) {
    try { removeTracked(id); } catch { /* yoksay */ }
  }
  temizlenecekTakipler.length = 0;
};

/* ------------------------------------------------------------------ */
/* 1) Komut ayrıştırma + admin                                        */
/* ------------------------------------------------------------------ */

bolum('1) 🛡️ Komut ayrıştırma ve admin koruması');

kontrol('/radar ayrıştırılır', komutAyikla('/radar')?.komut === '/radar');
kontrol('/radar_durum ayrıştırılır', komutAyikla('/radar_durum')?.komut === '/radar_durum');
kontrol('bot adı soneki temizlenir', komutAyikla('/radar_ekle@ErdalBot Test 1kg')?.komut === '/radar_ekle');
kontrol('argüman korunur', komutAyikla('/radar_ekle@ErdalBot Test 1kg')?.args === 'Test 1kg');
kontrol('büyük harf normalize edilir', komutAyikla('/RADAR_TARA')?.komut === '/radar_tara');
kontrol('düz metin komut değil', komutAyikla('Bambu Lab P1S') === null);

kontrol('admin tanınır', yoneticiMi(ADMIN) === true);
kontrol('yabancı admin değil', yoneticiMi(YABANCI) === false);
kontrol('null chat admin değil', yoneticiMi(null) === false);

/* ------------------------------------------------------------------ */
/* 2) /radar ve /radar_durum                                          */
/* ------------------------------------------------------------------ */

bolum('2) 🎯 /radar durum özeti');

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar' });
const radarMetni = sonMetin();

kontrol('durum mesajı gönderildi', sonMesaj() !== null);
kontrol('çalışma durumu 🟢 Açık', radarMetni.includes('🟢 <b>Açık</b>'));
kontrol('kontrol aralığı 4 saat', radarMetni.includes('her 4 saatte bir'));
kontrol('takipteki ürün sayısı 13', radarMetni.includes('Takipte: <b>13 ürün</b>'));
kontrol('son tur tarihi', radarMetni.includes('Son tur:'));
kontrol('son tur sonucu (taranan/stokta)', radarMetni.includes('13 tarandı, 9 stokta'));
kontrol('hata sayısı gösterilir', radarMetni.includes('1 hata'));
kontrol('dip fiyat: Creality + Ventatek', radarMetni.includes('Creality Ender PLA Gri 1kg')
  && radarMetni.includes('₺758,65') && radarMetni.includes('Ventatek'));
kontrol('dip fiyat: Bambu P1S', radarMetni.includes('Bambu Lab P1S'));
kontrol('stokta olmayan ürün listelenmez', !radarMetni.includes('Tükenen Örnek Ürün'));
kontrol('bugünkü bildirim sayısı', radarMetni.includes('Bugün gönderilen bildirim: <b>2</b>'));
kontrol('mesaj 4096 sınırı içinde', radarMetni.length < 4096);

const radarButonlari = sonMesaj()?.body?.reply_markup?.inline_keyboard || [];
kontrol('inline tarama butonu var', radarButonlari.some(r => r[0]?.callback_data === 'radar_tara'));
kontrol('buton metni doğru', radarButonlari.some(r => r[0]?.text === '🧪 Şimdi Taramayı Başlat'));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar_durum' });
kontrol('/radar_durum takma adı çalışır', sonMetin().includes('OTONOM FİYAT RADARI'));

// Stok kaydı yoksa dürüst mesaj
durumVerisi = { ...durumVerisi, durumlar: [] };
gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar' });
kontrol('stok kaydı yoksa uyarı', sonMetin().includes('Henüz stokta fiyat kaydı yok'));
durumVerisi = { ...durumVerisi, durumlar: [
  { ad: 'Creality Ender PLA Gri 1kg', site: 'Ventatek', fiyat: 758.65, stokta: true },
  { ad: 'Bambu Lab P1S 3D Yazıcı', site: 'n11', fiyat: 34999, stokta: true },
  { ad: 'Tükenen Örnek Ürün', site: null, fiyat: null, stokta: false },
] };

// Genel kullanıcı /radar'ı görebilir (salt okunur)
gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar' });
kontrol('genel kullanıcı /radar görebilir', sonMetin().includes('OTONOM FİYAT RADARI'));

/* ------------------------------------------------------------------ */
/* 3) /radar_tara                                                     */
/* ------------------------------------------------------------------ */

bolum('3) 🚀 /radar_tara');

taramaCagrilari.length = 0;
gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar_tara' });
kontrol('radarBaslat çağrıldı', taramaCagrilari.length === 1);
kontrol('zorla:true gönderildi', taramaCagrilari[0]?.zorla === true);
kontrol('gonder:true gönderildi', taramaCagrilari[0]?.gonder === true);
kontrol('başlatma mesajı', sonMetin().includes('🚀 Otonom radar taraması arka planda başlatıldı'));
kontrol('ürün sayısı mesajda', sonMetin().includes('13 ürün'));
kontrol('61 mağaza vurgusu', sonMetin().includes('61 mağazada'));

taramaCagrilari.length = 0;
gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar_tara' });
kontrol('yabancı /radar_tara reddedilir', sonMetin() === '⚠️ Bu komut yalnızca sistem yöneticisine açıktır.');
kontrol('yabancı için tarama başlamaz', taramaCagrilari.length === 0);

/* ------------------------------------------------------------------ */
/* 4) /radar_ekle, /radar_sil                                        */
/* ------------------------------------------------------------------ */

bolum('4) 🗂️ /radar_ekle ve /radar_sil (gerçek SQLite)');

const baslangicAdet = gercek.katalogGetir().length;
const BENZERSIZ = 'TEST RADAR TG Polymaker 1kg';

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: `/radar_ekle ${BENZERSIZ}` });
const ekleMetni = sonMetin();
const idEslesme = ekleMetni.match(/ID: <b>(\d+)<\/b>/);
const yeniId = idEslesme ? Number(idEslesme[1]) : null;

kontrol('ekleme onayı', ekleMetni.includes('radar takip kataloğuna eklendi'));
kontrol('eklenen ID mesajda', yeniId != null && yeniId > 0, ekleMetni.slice(0, 120));
kontrol('katalog 1 arttı', gercek.katalogGetir().length === baslangicAdet + 1);
kontrol('SQLite kaydı doğru adla', gercek.katalogGetir().some(k => k.id === yeniId && k.ad === BENZERSIZ));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: `/radar_sil ${yeniId}` });
kontrol('silme onayı', sonMetin().includes('radar kataloğundan çıkarıldı'));
kontrol('katalog eski sayıya döndü', gercek.katalogGetir().length === baslangicAdet);
kontrol('ID ile silindi', !gercek.katalogGetir().some(k => k.id === yeniId));

// Ada göre silme
const adIle = gercek.katalogEkle({ ad: 'TEST RADAR TG Silinecek Ürün', sorgu: 'TEST RADAR TG Silinecek Ürün' });
gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar_sil Silinecek Ürün' });
kontrol('ada göre silme onayı', sonMetin().includes('radar kataloğundan çıkarıldı'));
kontrol('ada göre silindi', !gercek.katalogGetir().some(k => k.id === adIle.id));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar_sil OLMAYAN URUN XYZ' });
kontrol('bulunamayan ürün uyarısı', sonMetin().includes('katalogda bulunamadı'));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar_ekle' });
kontrol('boş ekleme kullanım metni', sonMetin().includes('/radar_ekle'));

const oncekiAdet = gercek.katalogGetir().length;
gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar_ekle Yabancı Ürün 1kg' });
kontrol('yabancı /radar_ekle reddedilir', sonMetin().includes('yalnızca sistem yöneticisine'));
kontrol('yabancı katalogu değiştiremez', gercek.katalogGetir().length === oncekiAdet);

gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar_sil 1' });
kontrol('yabancı /radar_sil reddedilir', sonMetin().includes('yalnızca sistem yöneticisine'));
kontrol('yabancı kayıt silemez', gercek.katalogGetir().length === oncekiAdet);

/* ------------------------------------------------------------------ */
/* 5) /radar_liste                                                    */
/* ------------------------------------------------------------------ */

bolum('5) 🗂️ /radar_liste');

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar_liste' });
const listeMetni = sonMetin();
kontrol('katalog başlığı', listeMetni.includes('Radar Takip Kataloğu'));
kontrol('ID biçimi', /\[ID: \d+\]/.test(listeMetni));
kontrol('kategori ikonu', /🧵|🖨️|📦/.test(listeMetni));
kontrol('silme ipucu', listeMetni.includes('/radar_sil 5'));
kontrol('liste 4096 sınırı içinde', listeMetni.length < 4096);

/* ------------------------------------------------------------------ */
/* 6) /yardim                                                         */
/* ------------------------------------------------------------------ */

bolum('6) 📖 /yardim güncellemesi');

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/yardim' });
const yardim = sonMetin();
kontrol('/radar yardımda', yardim.includes('/radar —'));
kontrol('/radar_liste yardımda', yardim.includes('/radar_liste'));
kontrol('/radar_tara yardımda', yardim.includes('/radar_tara'));
kontrol('/radar_ekle yardımda', yardim.includes('/radar_ekle'));
kontrol('/radar_sil yardımda', yardim.includes('/radar_sil'));
kontrol('yönetici notu', yardim.includes('(yönetici)'));
kontrol('HTML kaçışı (&lt;ürün adı&gt;)', yardim.includes('&lt;ürün adı&gt;'));
kontrol('kaçırılmamış etiket yok', !yardim.includes('<ürün'));
kontrol('kişisel alarm ipucu', yardim.includes('kişisel fiyat alarmı'));

/* ------------------------------------------------------------------ */
/* 7) Callback: radar_tara                                            */
/* ------------------------------------------------------------------ */

bolum('7) 🖲️ Callback: radar_tara');

taramaCagrilari.length = 0;
gonderilen.length = 0;
await handleCallbackQuery('T', {
  id: 'cb-tara', data: 'radar_tara', message: { chat: { id: ADMIN } },
});
kontrol('admin callback taramayı başlatır', taramaCagrilari.length === 1);
kontrol('callback yanıtı', sonCevap()?.body?.text?.includes('Tarama başlatılıyor'));
kontrol('callback sonrası mesaj', sonMetin().includes('🚀'));

taramaCagrilari.length = 0;
gonderilen.length = 0;
await handleCallbackQuery('T', {
  id: 'cb-tara-yabanci', data: 'radar_tara', message: { chat: { id: YABANCI } },
});
kontrol('yabancı callback reddedilir', sonCevap()?.body?.show_alert === true
  && sonCevap()?.body?.text?.includes('yalnızca sistem yöneticisine'));
kontrol('yabancı callback tarama başlatmaz', taramaCagrilari.length === 0);

/* ------------------------------------------------------------------ */
/* 8) Callback: kişisel alarm                                         */
/* ------------------------------------------------------------------ */

bolum('8) 🔔 Kişisel alarm butonları');

const oncekiTakip = getTracked().length;
const idlerOnce = () => new Set(getTracked().map(t => t.id));
const yeniIdler = (once) => getTracked().filter(t => !once.has(t.id));

const idlerA = idlerOnce();
gonderilen.length = 0;
await handleCallbackQuery('T', {
  id: 'cb-alarm', data: 'alarm:takip:radar:1', message: { chat: { id: YABANCI } },
});
const alarmMetni = sonMetin();
kontrol('radar kartı alarmı kuruldu', alarmMetni.includes('fiyat takip alarmınız kuruldu'));
kontrol('ürün adı mesajda', alarmMetni.includes('Radar Test Ürünü'));
kontrol('mevcut fiyat mesajda', alarmMetni.includes('₺123,45'));
kontrol('kişiye özel vurgusu', alarmMetni.includes('size özel mesaj'));
kontrol('takip kaydı oluştu', getTracked().length === oncekiTakip + 1);
kontrol('alarm sahibi chatId ile kaydedildi', yeniIdler(idlerA).length === 1
  && String(yeniIdler(idlerA)[0]?.chatId) === YABANCI);

const yeniTakip = yeniIdler(idlerA)[0] || null;
kontrol('hedef fiyat kaydedildi', Number(yeniTakip?.hedefFiyat) === 123.45);
kontrol('ürün linki kaydedildi', yeniTakip?.urunler?.[0]?.url === 'https://testmarket.example/urun');
if (yeniTakip) temizlenecekTakipler.push(yeniTakip.id);

// Olmayan radar kaydı
gonderilen.length = 0;
await handleCallbackQuery('T', {
  id: 'cb-alarm-yok', data: 'alarm:takip:radar:999', message: { chat: { id: YABANCI } },
});
kontrol('olmayan radar kaydı için alarm kurulmaz', sonMetin().includes('stokta fiyat bulunamadı'));

// Arama sonucu butonu (hash) → chatId'li takip
function ornekSonuc() {
  return {
    kaynak: { urun: 'Test Arama Ürünü 1kg', url: 'https://kaynak.example/urun' },
    sonuclar: [{
      site: 'testmarket', siteName: 'TestMarket', status: 'found',
      product: {
        url: 'https://testmarket.example/arama-urun',
        title: 'Test Arama Ürünü 1kg',
        sellingPrice: 99.9, inStock: true,
        pricing: { toplam: 99.9, kargo: { ucret: 0 } },
      },
      kargoBedava: true,
    }],
    ozet: { bulunanSiteSayisi: 1 },
  };
}
const res = ornekSonuc();
const hash = takipKaydiOlustur(res, res.kaynak.url);
const butonlar = butonlariOlustur(res, { takipHash: hash, kaynakUrl: res.kaynak.url });
const alarmBtn = (butonlar.inline_keyboard || []).flat()
  .find(b => b.text === '🔔 Fiyatı Takibe Al');
kontrol('arama butonu alarm:takip:<hash> taşır', alarmBtn?.callback_data === 'alarm:takip:' + hash);

gonderilen.length = 0;
const idlerHash = idlerOnce();
await handleCallbackQuery('T', {
  id: 'cb-hash', data: 'alarm:takip:' + hash, message: { chat: { id: YABANCI } },
});
kontrol('hash alarmı kuruldu', sonMetin().includes('fiyat takip alarmınız kuruldu'));
const hashTakip = yeniIdler(idlerHash)[0] || null;
kontrol('hash alarmı chatId ile kaydedildi', !!hashTakip
  && String(hashTakip.chatId) === YABANCI);
if (hashTakip) temizlenecekTakipler.push(hashTakip.id);

// Eski `takip_` biçimi geriye dönük çalışmalı
const eskiHash = takipKaydiOlustur(ornekSonuc(), 'https://kaynak.example/urun');
gonderilen.length = 0;
const idlerEski = idlerOnce();
await handleCallbackQuery('T', {
  id: 'cb-eski', data: 'takip_' + eskiHash, message: { chat: { id: YABANCI } },
});
kontrol('eski takip_ callback uyumluluğu', sonMetin().includes('fiyat takip alarmınız kuruldu'));
const eskiTakip = yeniIdler(idlerEski)[0] || null;
kontrol('eski callback chatId ile kaydedildi', !!eskiTakip
  && String(eskiTakip.chatId) === YABANCI);
if (eskiTakip) temizlenecekTakipler.push(eskiTakip.id);

/* ------------------------------------------------------------------ */
/* 9) /liste izolasyonu + store.chatId                                */
/* ------------------------------------------------------------------ */

bolum('9) 👤 Kişisel alarm izolasyonu ve chatId kalıcılığı');

const a = addTracked({ urun: 'TEST RADAR Kullanici A', urunler: [{ site: 'x', url: 'https://x/1' }], chatId: '111' });
const b = addTracked({ urun: 'TEST RADAR Kullanici B', urunler: [{ site: 'x', url: 'https://x/2' }], chatId: '222' });
temizlenecekTakipler.push(a.id, b.id);

kontrol('chatId kalıcı kaydedildi', getTracked().find(t => t.id === a.id)?.chatId === '111');
const guncel = updateTracked(a.id, { sonKontrol: new Date().toISOString() });
kontrol('updateTracked chatId korur', guncel?.chatId === '111');

gonderilen.length = 0;
await handleMessage('T', { chat: { id: '111' }, text: '/liste' });
const listeA = sonMetin();
kontrol('kullanıcı A kendi alarmını görür', listeA.includes('TEST RADAR Kullanici A'));
kontrol('kullanıcı A başkasının alarmını görmez', !listeA.includes('TEST RADAR Kullanici B'));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: '222' }, text: '/liste' });
kontrol('kullanıcı B kendi alarmını görür', sonMetin().includes('TEST RADAR Kullanici B'));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/liste' });
const listeAdmin = sonMetin();
kontrol('admin tüm alarmları görür', listeAdmin.includes('TEST RADAR Kullanici A')
  && listeAdmin.includes('TEST RADAR Kullanici B'));
kontrol('admin sahiplik etiketi görür', listeAdmin.includes('👤'));

/* ------------------------------------------------------------------ */
/* 10) Kaynak sözleşmeleri                                            */
/* ------------------------------------------------------------------ */

bolum('10) 🔌 Kaynak sözleşmeleri');

const kok = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(kok, p), 'utf8');
const botSrc = oku('src/telegramBot.js');
const radarSrc = oku('src/otonomRadar.js');
const storeSrc = oku('src/store.js');
const alarmSrc = oku('src/alarms.js');

kontrol('bot: yönetici uyarısı', botSrc.includes('yalnızca sistem yöneticisine açıktır'));
kontrol('bot: alarm:takip callback', botSrc.includes("alarm:takip:"));
kontrol('bot: radar_tara callback', botSrc.includes("data === 'radar_tara'"));
kontrol('bot: radarBaslat zorla/gonder', botSrc.includes('radarBaslat({ zorla: true, gonder: true })'));
kontrol('bot: dinamik radar modülü', botSrc.includes("import('./otonomRadar.js')"));
kontrol('bot: katalogEkle kullanır', botSrc.includes('katalogEkle({ ad, sorgu: ad })'));
kontrol('bot: katalogSil kullanır', botSrc.includes('katalogSil(kayit.id)'));
kontrol('radar: katalog id callback', radarSrc.includes('alarm:takip:radar:'));
kontrol('radar: radarDurumVerisi export', radarSrc.includes('export function radarDurumVerisi'));
kontrol('store: chatId kolonu', storeSrc.includes('chatId TEXT'));
kontrol('store: chatId migrasyonu', storeSrc.includes("['chatId', 'TEXT']"));
kontrol('store: addTracked chatId', storeSrc.includes('entry.chatId'));
kontrol('alarms: kişisel chat önceliği', alarmSrc.includes('opts.chatId || s.telegram?.chatId'));
kontrol('alarms: takip chatId aktarımı', alarmSrc.includes('chatId: t.chatId || undefined'));

/* ------------------------------------------------------------------ */

temizle();
try { gercek.radarKapat(); } catch { /* yoksay */ }
try { closeDatabase(); } catch { /* yoksay */ }

console.log(`\n${'─'.repeat(46)}`);
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
} else {
  console.log('✅ Tüm Telegram radar/alarm testleri geçti.');
}
process.exit(hatalar.length ? 1 : 0);
