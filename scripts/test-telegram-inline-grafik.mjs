/**
 * 🔎📈 Telegram Inline Mode + Fiyat Trend Grafiği testleri — 2026-11-03
 *
 * Kapsam (ağ isteği YOK — fetch mock'lanır):
 *  1) grafik.js: gerçek veri filtresi (90 gün), tekilleştirme, min nokta,
 *     özet matematiği ve geçerli PNG (imza + IHDR + boyut).
 *  2) telegramFoto.js: caption güvenli kısaltma (≤1024, satır sınırı),
 *     multipart sendPhoto isteği ve hata yolu.
 *  3) Inline mode: snapshot araması, Türkçe katlama, 3 teklifli sonuç paketi,
 *     deep-link payload (≤64 karakter) gidiş-dönüş, answerInlineQuery.
 *  4) Radar geçmişi: radar_gecmis yazımı, radarSerisi, radarGrafik.
 *  5) Kaynak sözleşmeleri (inline_query polling, sendPhoto, radar kartı).
 *
 * Testin yazdığı snapshot/geçmiş kayıtları sonunda SİLİNİR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import {
  fiyatSerisi, grafikOzeti, grafikPng, pngKodla,
} from '../src/grafik.js';
import { guvenliAltyazi, fotoGonder, ALTYAZI_LIMIT } from '../src/telegramFoto.js';
import { anlikYaz, snapshotSil, snapshotKapat } from '../src/anlikOnbellek.js';
import {
  inlineSonuclariOlustur, handleInlineQuery, startPayloadOlustur, startPayloadCoz,
  __radarModuluAyarla,
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
/* Mock fetch                                                          */
/* ------------------------------------------------------------------ */
const istekler = [];
let fetchHatasi = false;
globalThis.fetch = async (url, opts = {}) => {
  istekler.push({ url: String(url), opts });
  if (fetchHatasi) {
    return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: photo invalid' }) };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 4242 } }) };
};
const sonIstek = (parca) => [...istekler].reverse().find(x => x.url.includes(parca)) || null;

const PNG_IMZA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ------------------------------------------------------------------ */
/* 1) Grafik                                                           */
/* ------------------------------------------------------------------ */
bolum('1) 📈 Grafik serisi ve PNG üretimi');

const simdi = Date.now();
const gun = (n) => new Date(simdi - n * 86400000).toISOString();

const seri = fiyatSerisi([
  { ts: gun(1), enUcuzFiyat: 900 },
  { ts: gun(10), enUcuzFiyat: 780 },
  { ts: gun(5), fiyat: 850 },
  { ts: gun(120), fiyat: 500 },       // 90 günden eski → dışlanır
  { ts: gun(3), fiyat: null },        // geçersiz fiyat → dışlanır
  { ts: 'bozuk', fiyat: 700 },        // geçersiz tarih → dışlanır
  { ts: gun(2), fiyat: 0 },           // sıfır fiyat → dışlanır
  { ts: gun(10), fiyat: 790 },        // aynı ts → son kayıt geçerli
], { simdi });

kontrol('eski/geçersiz kayıtlar elenir', seri.length === 3, String(seri.length));
kontrol('zamana göre artan sıralama', seri.every((n, i) => i === 0 || seri[i - 1].ts <= n.ts));
kontrol('aynı ts son kaydı kullanır', seri[0].fiyat === 790, String(seri[0].fiyat));
kontrol('fiyatlar sayıya çevrildi', seri.every(n => Number.isFinite(n.fiyat) && n.fiyat > 0));
kontrol('90 gün dışındaki kayıt yok', seri.every(n => n.ts >= simdi - 91 * 86400000));
kontrol('tek nokta grafik üretmez', fiyatSerisi([{ ts: gun(1), fiyat: 100 }], { simdi }).length === 0);
kontrol('boş girdi güvenli', fiyatSerisi(null).length === 0);

const ozet = grafikOzeti(seri);
kontrol('özet min/max', ozet.min === 790 && ozet.max === 900);
kontrol('özet değişim yüzdesi', ozet.degisimYuzde === 13.9, String(ozet.degisimYuzde));
kontrol('özet nokta sayısı', ozet.nokta === 3);
kontrol('boş seri özeti null', grafikOzeti([]) === null);

const png = grafikPng(seri);
kontrol('PNG üretildi', Buffer.isBuffer(png) && png.length > 2000, String(png?.length));
kontrol('PNG imzası doğru', png.subarray(0, 8).equals(PNG_IMZA));
kontrol('PNG IHDR genişlik 800', png.readUInt32BE(16) === 800);
kontrol('PNG IHDR yükseklik 400', png.readUInt32BE(20) === 400);
kontrol('PNG bit derinliği/renk türü', png[24] === 8 && png[25] === 2);
kontrol('PNG IEND ile bitiyor', png.subarray(-8, -4).toString('ascii') === 'IEND');
kontrol('2 nokta ile grafik üretilir', !!grafikPng(seri.slice(0, 2)));
kontrol('1 nokta ile null', grafikPng(seri.slice(0, 1)) === null);
kontrol('boş seri null', grafikPng([]) === null);

// Boyut sınırları (Telegram 10 MB sınırına çok uzak)
const buyuk = grafikPng(
  Array.from({ length: 200 }, (_, i) => ({ ts: simdi - (200 - i) * 3600000, fiyat: 500 + (i % 30) })),
  { genislik: 1200, yukseklik: 800 },
);
kontrol('200 nokta/1200x800 PNG üretir', !!buyuk && buyuk.length < 1024 * 1024, String(buyuk?.length));
kontrol('genişlik sınırlanır (max 1200)', buyuk.readUInt32BE(16) === 1200);
kontrol('pngKodla piksel sayısı doğrulanır', (() => {
  const p = pngKodla(2, 2, Buffer.alloc(12, 255));
  return p.readUInt32BE(16) === 2 && p.readUInt32BE(20) === 2;
})());

/* ------------------------------------------------------------------ */
/* 2) Caption + sendPhoto                                              */
/* ------------------------------------------------------------------ */
bolum('2) 📷 Fotoğraflı gönderim (caption + multipart)');

kontrol('kısa caption değişmez', guvenliAltyazi('Merhaba') === 'Merhaba');
kontrol('caption sabiti makul', ALTYAZI_LIMIT <= 1024);

const uzun = Array.from({ length: 80 }, (_, i) => `satır ${i} — ₺1.234,56`).join('\n');
const kirpik = guvenliAltyazi(uzun);
kontrol('uzun caption kısaltılır', kirpik.length <= 1024, String(kirpik.length));
kontrol('kısaltma satır sınırında', kirpik.endsWith('…') && !kirpik.endsWith('satır 79 — ₺1.234,56…'));
kontrol('kısa limitte kesmez', guvenliAltyazi('abc', 100).length === 3);
kontrol('boş caption güvenli', guvenliAltyazi(null) === '');

istekler.length = 0;
const gonderim = await fotoGonder('TOKEN', '12345', png, '🏷️ <b>Test</b>\n₺1.234,56', {
  replyMarkup: { inline_keyboard: [[{ text: 'Git', url: 'https://ornek.test' }]] },
});
kontrol('sendPhoto messageId döner', gonderim.messageId === 4242 && gonderim.yontem === 'sendPhoto');
const fotoIstek = sonIstek('/sendPhoto');
kontrol('sendPhoto uç noktası doğru', !!fotoIstek && fotoIstek.url.endsWith('/botTOKEN/sendPhoto'));
kontrol('multipart gövde kullanıldı', fotoIstek?.opts?.body instanceof FormData);
kontrol('caption gönderildi', fotoIstek?.opts?.body.get('caption') === '🏷️ <b>Test</b>\n₺1.234,56');
kontrol('chat_id gönderildi', fotoIstek?.opts?.body.get('chat_id') === '12345');
kontrol('parse_mode HTML', fotoIstek?.opts?.body.get('parse_mode') === 'HTML');
kontrol('inline butonlar JSON olarak eklendi',
  String(fotoIstek?.opts?.body.get('reply_markup')).includes('https://ornek.test'));
kontrol('dosya adı .png', fotoIstek?.opts?.body.get('photo')?.name === 'fiyat-trendi.png');
kontrol('yanıt tipi image/png', fotoIstek?.opts?.body.get('photo')?.type === 'image/png');

fetchHatasi = true;
let fotoHata = null;
try { await fotoGonder('TOKEN', '12345', png, 'x'); } catch (e) { fotoHata = e; }
fetchHatasi = false;
kontrol('sendPhoto hatası fırlatılır', /sendPhoto hatası/.test(String(fotoHata?.message)));
kontrol('hata durum kodu taşınır', fotoHata?.statusCode === 400);

let bosHata = null;
try { await fotoGonder('TOKEN', '12345', Buffer.alloc(0), 'x'); } catch (e) { bosHata = e; }
kontrol('boş görsel reddedilir', /Gönderilecek görsel boş/.test(String(bosHata?.message)));

/* ------------------------------------------------------------------ */
/* 3) Inline mode                                                      */
/* ------------------------------------------------------------------ */
bolum('3) 🔎 Inline mode');

// Deep-link payload: Telegram sınırı 64 karakter.
const uzunSorgu = 'Polymaker PolyTerra PLA Beyaz 1kg — özel baskı filamenti';
const yuk = startPayloadOlustur(uzunSorgu);
kontrol('deep-link yükü ≤64 karakter', yuk.length <= 64, String(yuk.length));
kontrol('deep-link Türkçe karakter korunur', startPayloadCoz(yuk).startsWith('Polymaker PolyTerra'));
kontrol('deep-link kırpma UTF-8 güvenli', Buffer.byteLength(startPayloadCoz(yuk), 'utf8') <= 48);
kontrol('geçersiz yük boş döner', startPayloadCoz('!!!') === '');

// Gerçek snapshot yaz (inline arama buradan beslenir). Benzersiz ad → canlı
// veritabanındaki eski kayıtlarla çakışmaz.
const TEST_AD = 'Testmarka Quantum PLA Gri 1kg';
const TEST_URL = 'https://www.ornek-magaza.test/testmarka-quantum-pla-gri-1kg';
const SAHTE_AD = 'Testmarka Nebula P1S 3D Yazıcı';
const SAHTE_URL = 'https://www.ornek-magaza.test/testmarka-nebula-p1s';
const sonuclar = (fiyatlar, ad, url) => ({
  kaynak: { urun: ad, url },
  sonuclar: fiyatlar.map(([site, siteName, fiyat, stok]) => ({
    site, siteName, status: 'found',
    product: {
      url: `https://${site}.test/urun`, title: ad,
      sellingPrice: fiyat, inStock: stok !== false,
      pricing: { toplam: fiyat, kargo: { ucret: 0 } },
    },
    kargoBedava: true,
  })),
  ozet: { bulunanSiteSayisi: fiyatlar.length },
});
anlikYaz(TEST_URL, sonuclar([
  ['n11', 'n11', 812.5],
  ['trendyol', 'Trendyol', 829.9],
  ['hepsiburada', 'Hepsiburada', 845],
  ['robotistan', 'Robotistan', 700, false], // tükendi → inline'da önerilmez
], TEST_AD, TEST_URL), { urun: TEST_AD });

anlikYaz(SAHTE_URL, sonuclar([
  ['n11', 'n11', 34999],
], SAHTE_AD, SAHTE_URL), { urun: SAHTE_AD });

// Radar kataloğu kaynağı (mock): inline sonuçları zenginleştirir.
const RADAR_AD = 'Testmarka Nova PLA Siyah 1kg';
const gercekRadar = await import('../src/otonomRadar.js');
__radarModuluAyarla(async () => ({
  ...gercekRadar,
  radarDurum: () => ({
    katalog: [
      { id: 1, ad: TEST_AD, kategori: 'filament' },
      { id: 2, ad: RADAR_AD, kategori: 'filament' },
    ],
    durumlar: [
      { katalogId: 1, ad: TEST_AD, site: 'Ventatek', fiyat: 758.65, stokta: true, ts: Date.now() - 1800000 },
      { katalogId: 2, ad: RADAR_AD, site: '3D Tekno Market', fiyat: 649.9, stokta: true, ts: Date.now() - 5400000 },
    ],
  }),
  radarDurumVerisi: (id) => (Number(id) === 1
    ? {
      ad: TEST_AD, site: 'Ventatek', fiyat: 758.65, stokta: true,
      hamUrl: 'https://www.ventatek.com/testmarka-quantum',
      afiliyeUrl: 'https://www.ventatek.com/testmarka-quantum?utm_source=eun',
      kaynakUrl: 'https://www.ventatek.com/testmarka-quantum',
    }
    : {
      ad: RADAR_AD, site: '3D Tekno Market', fiyat: 649.9, stokta: true,
      hamUrl: 'https://3dtekno.test/testmarka-nova',
      afiliyeUrl: 'https://3dtekno.test/testmarka-nova?ref=eun',
      kaynakUrl: 'https://3dtekno.test/testmarka-nova',
    }),
}));

const bulgular = await inlineSonuclariOlustur('Testmarka Quantum');
kontrol('inline sonuç üretildi', bulgular.length >= 1, String(bulgular.length));
kontrol('inline tip article', bulgular.every(b => b.type === 'article'));
kontrol('inline id benzersiz', new Set(bulgular.map(b => b.id)).size === bulgular.length);
kontrol('inline title ≤95', bulgular.every(b => b.title.length <= 95));

const quantum = bulgular.find(b => /Quantum/i.test(b.title));
kontrol('snapshot sonucu bulundu', !!quantum);
kontrol('en ucuz teklif başlıkta (₺812,50)', /812,50/.test(quantum?.title || ''), quantum?.title);
kontrol('tükendi mağaza (Robotistan) önerilmez',
  !JSON.stringify(quantum?.reply_markup).includes('robotistan'));
const inlineMetin = quantum?.input_message_content?.message_text || '';
kontrol('inline mesajda 3 stoklu teklif', (inlineMetin.match(/[🥇🥈🥉]/gu) || []).length === 3);
kontrol('inline mesaj HTML parse', quantum?.input_message_content?.parse_mode === 'HTML');
kontrol('inline mesaj 4000 sınırı içinde', inlineMetin.length <= 4000);
kontrol('inline butonlar mağaza linki taşır',
  (quantum?.reply_markup?.inline_keyboard || []).flat().some(b => /^https?:/.test(b.url || '')));
kontrol('inline karşılaştırma butonu', (quantum?.reply_markup?.inline_keyboard || [])
  .flat().some(b => /Karşılaştırmayı Aç/.test(b.text)));

const nebula = await inlineSonuclariOlustur('Testmarka Nebula');
kontrol('başka ürün de bulunur', nebula.some(b => /Nebula/.test(b.title)));

const radarBulgusu = (await inlineSonuclariOlustur('Testmarka Nova')).find(b => /Nova/.test(b.title));
kontrol('radar kataloğu inline sonuca girer', !!radarBulgusu);
kontrol('radar fiyatı gösterilir', /649,90/.test(radarBulgusu?.title || ''), radarBulgusu?.title);

const canli = await inlineSonuclariOlustur('zzzz olmayan urun 12345');
kontrol('eşleşme yoksa canlı arama kartı', canli.some(b => /canlı ara/i.test(b.title)));
kontrol('canlı arama kartı bota yönlendirir',
  JSON.stringify(canli.find(b => /canlı ara/i.test(b.title))?.reply_markup || {}).includes('t.me/'));

const bos = await inlineSonuclariOlustur('');
kontrol('boş sorguda ipucu kartı', bos.length >= 1 && bos.every(b => b.type === 'article'));
kontrol('ipucu kartı 61 mağaza der',
  bos.some(b => /61 mağaza/.test(b.input_message_content?.message_text || '')));

// Türkçe katlama: "QUANTUM" → "quantum".
const trSonuc = await inlineSonuclariOlustur('QUANTUM');
kontrol('Türkçe büyük/küçük harf eşleşir', trSonuc.some(b => /Quantum/i.test(b.title)));

istekler.length = 0;
await handleInlineQuery('TOKEN', { id: 'iq-1', query: 'Testmarka Quantum', from: { id: 1 } });
const iqIstek = sonIstek('/answerInlineQuery');
kontrol('answerInlineQuery çağrıldı', !!iqIstek);
const iqGovde = iqIstek ? JSON.parse(iqIstek.opts.body) : {};
kontrol('inline_query_id taşınır', iqGovde.inline_query_id === 'iq-1');
kontrol('sonuçlar en fazla 20', Array.isArray(iqGovde.results) && iqGovde.results.length <= 20);
kontrol('cache_time 120', iqGovde.cache_time === 120);
kontrol('sonuçlar boş değil', iqGovde.results?.length > 0);
kontrol('is_personal false (viral paylaşım)', iqGovde.is_personal === false);

istekler.length = 0;
await handleInlineQuery('TOKEN', { id: 'iq-2', query: '' });
kontrol('boş inline sorgu da yanıtlanır', !!sonIstek('/answerInlineQuery'));

/* ------------------------------------------------------------------ */
/* 4) Radar geçmişi + grafik                                           */
/* ------------------------------------------------------------------ */
bolum('4) 🗃️ Radar fiyat geçmişi (radar_gecmis)');

const dbYolu = path.join(config.dataDir, 'en_ucuz_nerede.db');
const KATALOG_ID = 900000 + (Date.now() % 1000);
const db = new DatabaseSync(dbYolu);
const gecmisEkle = (gunOnce, fiyat) => db.prepare(`
  INSERT INTO radar_gecmis (katalog_id, ts, fiyat, site, stokta) VALUES (?, ?, ?, ?, 1)
`).run(KATALOG_ID, Date.now() - gunOnce * 86400000, fiyat, 'TestMarket');
try {
  for (const [g, f] of [[40, 890], [30, 860], [20, 820], [10, 799], [2, 780]]) gecmisEkle(g, f);
  const radarSeri = gercekRadar.radarSerisi(KATALOG_ID, { gun: 90 });
  kontrol('radarSerisi 5 nokta döner', radarSeri.length === 5, String(radarSeri.length));
  kontrol('radarSerisi artan sırada', radarSeri.every((n, i) => i === 0 || radarSeri[i - 1].ts <= n.ts));
  kontrol('radarSerisi fiyatları doğru', radarSeri[radarSeri.length - 1].fiyat === 780);

  // 🔗 price_history birleşmesi: durum kaydındaki `pid` üzerinden web
  // taramalarının daha uzun geçmişi grafiğe eklenir (tekrar eden ts tekilleşir).
  const PID = '__test_trend_' + Date.now();
  db.prepare(`
    INSERT INTO radar_durum (anahtar, katalog_id, urun, site, site_id, fiyat, stokta, ts, paylasim_ts, veri)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)
    ON CONFLICT(anahtar) DO UPDATE SET veri = excluded.veri
  `).run(
    `katalog:${KATALOG_ID}`, KATALOG_ID, 'Test Trend Ürünü', 'TestMarket', 'testmarket',
    780, Date.now(), JSON.stringify({ katalogId: KATALOG_ID, ad: 'Test Trend Ürünü', stokta: true, fiyat: 780, pid: PID }),
  );
  const phEkle = (gunOnce, net) => db.prepare(`
    INSERT INTO price_history (product_id, site, price, net_price, ts) VALUES (?, 'testmarket', ?, ?, ?)
  `).run(PID, net, net, new Date(Date.now() - gunOnce * 86400000).toISOString());
  for (const [g, f] of [[70, 950], [60, 920], [40, 890]]) phEkle(g, f);
  const birlesik = gercekRadar.radarSerisi(KATALOG_ID, { gun: 90 });
  kontrol('price_history geçmişi birleşir', birlesik.length === 8, String(birlesik.length));
  kontrol('birleşik seri en eskisi 70 gün önce', birlesik[0].fiyat === 950, String(birlesik[0].fiyat));
  kontrol('birleşik seri artan sırada', birlesik.every((n, i) => i === 0 || birlesik[i - 1].ts <= n.ts));
  db.prepare('DELETE FROM price_history WHERE product_id = ?').run(PID);

  const kartGrafik = gercekRadar.radarGrafik({ stokta: true, katalogId: KATALOG_ID });
  kontrol('radarGrafik PNG üretir', Buffer.isBuffer(kartGrafik) && kartGrafik.length > 2000);
  kontrol('radarGrafik stok yoksa null', gercekRadar.radarGrafik({ stokta: false, katalogId: KATALOG_ID }) === null);
  kontrol('radarGrafik geçmişsiz id için null', gercekRadar.radarGrafik({ stokta: true, katalogId: KATALOG_ID + 1 }) === null);
  kontrol('radarSerisi geçersiz id → boş', gercekRadar.radarSerisi('yok').length === 0);

  const kayit = db.prepare('SELECT COUNT(*) c FROM radar_gecmis WHERE katalog_id = ?').get(KATALOG_ID);
  kontrol('geçmiş kaydı yazıldı', kayit.c === 5, String(kayit.c));
} finally {
  db.prepare('DELETE FROM radar_gecmis WHERE katalog_id = ?').run(KATALOG_ID);
  db.prepare('DELETE FROM radar_durum WHERE katalog_id = ?').run(KATALOG_ID);
  db.close();
}

/* ------------------------------------------------------------------ */
/* 5) Kaynak sözleşmeleri                                              */
/* ------------------------------------------------------------------ */
bolum('5) 🔌 Kaynak sözleşmeleri');

const kok = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(kok, p), 'utf8');
const botSrc = oku('src/telegramBot.js');
const radarSrc = oku('src/otonomRadar.js');
const alarmSrc = oku('src/alarms.js');
const grafikSrc = oku('src/grafik.js');

kontrol('bot: inline_query allowed_updates', botSrc.includes('"inline_query"'));
kontrol('bot: inline_query yönlendirmesi', botSrc.includes('update.inline_query'));
kontrol('bot: answerInlineQuery', botSrc.includes("'answerInlineQuery'"));
kontrol('bot: deep-link start yükü', botSrc.includes("yuk.startsWith('ara_')"));
kontrol('bot: inline sonuç 3 teklif', botSrc.includes('slice(0, 3)'));
kontrol('radar: sendPhoto yolu', radarSrc.includes('fotoGonder(token, chatId, png'));
kontrol('radar: metin kartına geri dönüş', radarSrc.includes('metin kartına dönülüyor'));
kontrol('radar: radar_gecmis tablosu', radarSrc.includes('CREATE TABLE IF NOT EXISTS radar_gecmis'));
kontrol('radar: katalogSil geçmişi temizler', radarSrc.includes('DELETE FROM radar_gecmis WHERE katalog_id = ?'));
kontrol('radar: saatlik örnekleme', radarSrc.includes('3600000'));
kontrol('alarms: fotoğraflı alarm', alarmSrc.includes('opts.foto'));
kontrol('grafik: uydurma veri yok (min 2 nokta)', grafikSrc.includes('length >= Math.max(2, minNokta)'));
kontrol('grafik: PNG kodlayıcı', grafikSrc.includes("pngParca('IHDR'"));

/* ------------------------------------------------------------------ */

try { snapshotSil(TEST_URL); snapshotSil(SAHTE_URL); } catch { /* yoksay */ }
try { gercekRadar.radarKapat(); } catch { /* yoksay */ }
try { snapshotKapat(); } catch { /* yoksay */ }

console.log(`\n${'─'.repeat(46)}`);
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
} else {
  console.log('✅ Tüm inline + grafik testleri geçti.');
}
process.exit(hatalar.length ? 1 : 0);
