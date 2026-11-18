/**
 * 🎯 Telegram asistanı — 1. Adım kabul testleri (2026-11-03)
 *
 * Spec kapsamı:
 *   1) Yetkisiz kullanıcı /radar_tara, /radar_ekle, /radar_sil, /radar_liste
 *      komutlarında engellenir (admin = settings.telegram.chatId).
 *   2) Admin /radar_ekle ve /radar_sil GERÇEK SQLite kataloğunu günceller.
 *   3) `fiyatGrafigiUret` geçerli bir PNG buffer üretir; veri yoksa null döner.
 *   4) `handleInlineQuery` Telegram'ın beklediği `InlineQueryResultArticle`
 *      JSON yapısını döndürür.
 *   5) /radar kartında iki inline buton vardır (tara + katalog) ve callback'leri
 *      admin korumalıdır.
 *
 * Ağ isteği YOK — `fetch` mock'lanır. Testin eklediği katalog kayıtları ve
 * fiyat noktaları sonunda SİLİNİR.
 *
 * Kullanım: node scripts/test-telegram-assistant.mjs
 */
import {
  getSettings, addPricePoint, deletePricePoints, closeDatabase,
} from '../src/store.js';
import {
  handleMessage, handleCallbackQuery, handleInlineQuery,
  __radarModuluAyarla, yoneticiMi, komutAyikla,
} from '../src/telegramBot.js';
import { katalogGetir, katalogSil } from '../src/otonomRadar.js';
import { fiyatGrafigiUret } from '../src/fiyatGrafik.js';

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
  let body = {};
  try {
    body = opts.body instanceof FormData ? { form: true } : JSON.parse(opts.body || '{}');
  } catch { body = {}; }
  const method = String(url).split('/').pop();
  gonderilen.push({ method, body });
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { message_id: gonderilen.length } }),
  };
};

const ADMIN = String(getSettings().telegram?.chatId || '').trim();
const YABANCI = '999000222';
const sonMesaj = () => [...gonderilen].reverse().find(x => x.method === 'sendMessage') || null;
const sonMetin = () => sonMesaj()?.body?.text || '';
const sonCevap = () => [...gonderilen].reverse().find(x => x.method === 'answerCallbackQuery') || null;

if (!ADMIN) {
  console.log('⚠️ ATLANDI: settings.telegram.chatId tanımlı değil (admin testleri için gerekli).');
  closeDatabase();
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* 1) Yetki denetimi                                                   */
/* ------------------------------------------------------------------ */

bolum('1) 🛡️ Admin koruması');

kontrol('admin tanınır', yoneticiMi(ADMIN) === true);
kontrol('yabancı admin değil', yoneticiMi(YABANCI) === false);
kontrol('null chat admin değil', yoneticiMi(null) === false);
kontrol('/radar_ekle ayrıştırılır', komutAyikla('/radar_ekle Test 1kg')?.args === 'Test 1kg');

const oncekiSayi = katalogGetir().length;

gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar_ekle Yabancı Test Ürünü 1kg' });
kontrol('yabancı /radar_ekle reddedilir',
  sonMetin() === '⚠️ Bu komut yalnızca sistem yöneticisine açıktır.');
kontrol('yabancı katalogu değiştiremez', katalogGetir().length === oncekiSayi);

gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar_tara' });
kontrol('yabancı /radar_tara reddedilir',
  sonMetin() === '⚠️ Bu komut yalnızca sistem yöneticisine açıktır.');
kontrol('yabancı için tarama mesajı gitmez',
  !sonMetin().includes('OTONOM FİYAT RADARI') && !sonMetin().includes('🚀'));

gonderilen.length = 0;
await handleMessage('T', { chat: { id: YABANCI }, text: '/radar_liste' });
kontrol('yabancı /radar_liste reddedilir',
  sonMetin() === '⚠️ Bu komut yalnızca sistem yöneticisine açıktır.');

gonderilen.length = 0;
await handleCallbackQuery('T', {
  id: 'cb-yabanci', data: 'radar_tara',
  message: { chat: { id: YABANCI } },
});
kontrol('yabancı radar_tara butonu reddedilir',
  String(sonCevap()?.body?.text || '').includes('yalnızca sistem yöneticisine'));

/* ------------------------------------------------------------------ */
/* 2) Admin CRUD — gerçek SQLite                                       */
/* ------------------------------------------------------------------ */

bolum('2) 🗂️ Admin /radar_ekle ve /radar_sil (SQLite)');

const AD = `Asistan Test Ürünü ${Date.now()}`;
gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: `/radar_ekle ${AD}` });
const ekleMetni = sonMetin();
kontrol('ekleme onayı gönderildi', ekleMetni.includes('radar takip kataloğuna eklendi'));
const idEslesme = ekleMetni.match(/ID: <b>(\d+)<\/b>/);
const yeniId = idEslesme ? Number(idEslesme[1]) : null;
kontrol('eklenen kayıt ID döndürdü', Number.isFinite(yeniId) && yeniId > 0, String(yeniId));

const eklendi = katalogGetir().find(k => Number(k.id) === Number(yeniId));
kontrol('SQLite kataloğunda kayıt var', !!eklendi, `id=${yeniId}`);
kontrol('kayıt adı doğru', eklendi?.ad === AD, eklendi?.ad);
kontrol('katalog bir arttı', katalogGetir().length === oncekiSayi + 1);

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: `/radar_sil ${yeniId}` });
kontrol('silme onayı gönderildi', sonMetin().includes('radar kataloğundan çıkarıldı'));
kontrol('SQLite kaydı silindi', !katalogGetir().some(k => Number(k.id) === Number(yeniId)));
kontrol('katalog eski sayısına döndü', katalogGetir().length === oncekiSayi);

// Güvenlik ağı: test bir şekilde yarıda kalırsa kayıt kalmasın.
if (eklendi) { try { katalogSil(yeniId); } catch { /* zaten silinmiş */ } }

/* ------------------------------------------------------------------ */
/* 3) /radar kartı butonları                                           */
/* ------------------------------------------------------------------ */

bolum('3) 🎛️ /radar kartı inline butonları');

gonderilen.length = 0;
await handleMessage('T', { chat: { id: ADMIN }, text: '/radar' });
const butonlar = sonMesaj()?.body?.reply_markup?.inline_keyboard || [];
const duz = butonlar.flat();
kontrol('tara butonu var', duz.some(b => b.callback_data === 'radar_tara'));
kontrol('katalog butonu var', duz.some(b => b.callback_data === 'radar_liste'));
kontrol('katalog buton metni', duz.some(b => b.text === '📋 Kataloğu Listele'));

gonderilen.length = 0;
await handleCallbackQuery('T', {
  id: 'cb-admin-liste', data: 'radar_liste',
  message: { chat: { id: ADMIN } },
});
kontrol('admin katalog butonu mesaj gönderir',
  (sonMesaj()?.body?.text || '').includes('Radar') || (sonMesaj()?.body?.text || '').includes('katalog'));

/* ------------------------------------------------------------------ */
/* 4) fiyatGrafigiUret — gerçek buffer                                 */
/* ------------------------------------------------------------------ */

bolum('4) 📉 fiyatGrafigiUret');

const PID = `test-grafik-${Date.now()}`;
const simdi = Date.now();
const noktalar = [
  { gun: 12, fiyat: 940 },
  { gun: 8, fiyat: 880 },
  { gun: 4, fiyat: 760.5 },
  { gun: 0, fiyat: 699.9 },
];
for (const n of noktalar) {
  addPricePoint({
    productId: PID,
    site: 'testmarket',
    price: n.fiyat,
    netPrice: n.fiyat,
    ts: new Date(simdi - n.gun * 86400000).toISOString(),
  });
}

const grafik = fiyatGrafigiUret({ productId: PID, gun: 90, simdi });
kontrol('fiyatGrafigiUret buffer döndürdü', Buffer.isBuffer(grafik?.png));
kontrol('PNG imzası geçerli',
  Buffer.isBuffer(grafik?.png)
  && grafik.png[0] === 0x89 && grafik.png.toString('ascii', 1, 4) === 'PNG');
kontrol('görsel makul boyutta', (grafik?.bayt || 0) > 1000, String(grafik?.bayt));
kontrol('seri 4 gerçek nokta', grafik?.seri?.length === 4, String(grafik?.seri?.length));
kontrol('özet minimumu 699.9', Math.abs(Number(grafik?.ozet?.min) - 699.9) < 0.001);
kontrol('özet değişim yüzdesi negatif', Number(grafik?.ozet?.degisimYuzde) < 0);
kontrol('kaynak price_history', (grafik?.kaynaklar || []).includes('price_history'));

const bos = fiyatGrafigiUret({ productId: `yok-${Date.now()}`, gun: 90, simdi });
kontrol('veri yoksa null (graceful fallback)', bos === null);

deletePricePoints(PID);
kontrol('test fiyat noktaları temizlendi',
  fiyatGrafigiUret({ productId: PID, gun: 90, simdi }) === null);

/* ------------------------------------------------------------------ */
/* 5) handleInlineQuery — InlineQueryResultArticle                     */
/* ------------------------------------------------------------------ */

bolum('5) ⚡ handleInlineQuery');

const inlineUrun = 'Asistan Inline Test PLA 1kg';
__radarModuluAyarla(async () => ({
  radarDurum: () => ({
    durumlar: [{
      katalogId: 99001, ad: inlineUrun, site: 'TestMarket',
      fiyat: 199.9, stokta: true, ts: Date.now(),
    }],
    katalog: [{ id: 99001, ad: inlineUrun, kategori: 'filament' }],
  }),
  radarDurumVerisi: (id) => (Number(id) === 99001
    ? {
      hamUrl: 'https://testmarket.example/inline-urun',
      site: 'TestMarket', fiyat: 199.9, ts: Date.now(), kaynakUrl: null,
    }
    : null),
}));

gonderilen.length = 0;
await handleInlineQuery('T', { id: 'iq-test-1', query: inlineUrun });
const inlineCagri = gonderilen.find(x => x.method === 'answerInlineQuery');
kontrol('answerInlineQuery çağrıldı', !!inlineCagri);
kontrol('inline_query_id taşınır', inlineCagri?.body?.inline_query_id === 'iq-test-1');
const sonuclar = inlineCagri?.body?.results || [];
kontrol('en az 1 sonuç', sonuclar.length >= 1, String(sonuclar.length));

const urunSonucu = sonuclar.find(r => String(r.input_message_content?.message_text || '').includes('TestMarket'));
kontrol('InlineQueryResultArticle tipi', urunSonucu?.type === 'article', urunSonucu?.type);
kontrol('id alanı var', typeof urunSonucu?.id === 'string' && urunSonucu.id.length > 0);
kontrol('title alanı var', typeof urunSonucu?.title === 'string' && urunSonucu.title.length > 0);
kontrol('input_message_content.message_text var',
  typeof urunSonucu?.input_message_content?.message_text === 'string');
kontrol('HTML parse_mode', urunSonucu?.input_message_content?.parse_mode === 'HTML');
kontrol('fiyat kartta', String(urunSonucu?.input_message_content?.message_text || '').includes('199,90'));
kontrol('mağaza linki var',
  JSON.stringify(urunSonucu?.reply_markup || {}).includes('testmarket.example'));
kontrol('cache_time sayı', Number.isFinite(Number(inlineCagri?.body?.cache_time)));

// Boş sorgu → ipucu/öne çıkanlar; yine geçerli article olmalı.
gonderilen.length = 0;
await handleInlineQuery('T', { id: 'iq-test-2', query: '' });
const bosSonuclar = gonderilen.find(x => x.method === 'answerInlineQuery')?.body?.results || [];
kontrol('boş sorgu geçerli sonuç döndürür',
  bosSonuclar.length >= 1 && bosSonuclar.every(r => r.type === 'article'));

__radarModuluAyarla(null); // gerçek modüle dön

/* ------------------------------------------------------------------ */
/* Özet                                                                */
/* ------------------------------------------------------------------ */

console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
