/**
 * 📢 WhatsApp Fırsat Kanalı — birim + sözleşme testleri (2026-11-05)
 *
 * Kapsam (ağ isteği YOK — `fetch` mock'lanır):
 *   1) WhatsApp Markdown: `*kalın*`, `_italik_`, `~üstü çizili~`, ```kod```.
 *   2) Kaçış: `&`, `<>`, `*`, `_`, `~` düz metne dönüşür; HTML bozulmaz.
 *   3) Afiliye link: satın alma linki kartta ve doğru biçimde.
 *   4) Kart içeriği: fiyat, mağaza, kargo, birim, diğer mağazalar, stok.
 *   5) Sağlayıcı adaptörleri: webhook / green-api / ultramsg / meta gövde şemaları.
 *   6) Kanal ID doğrulama (`@newsletter`, `@g.us`, telefon) ve ayar doğrulama.
 *   7) HATA İZOLASYONU: sağlayıcı 500/timeout/ağ hatası → `ok:false`, fırlatmaz;
 *      radar/fırsat akışı kesintiye uğramaz.
 *   8) Token sızıntısı: hata mesajında token maskelenir.
 *   9) Entegrasyon: `whatsappKopyaGonder` (radar) + `whatsappFirsatGonder`
 *      (fırsat kanalı) ayar kapalıyken atlar, hata yutulur.
 *  10) Arayüz/sunucu sözleşmesi: ayarlar kartı, test ucu, gizli token.
 */

import fs from 'node:fs';
import {
  whatsappKac, kalin, italik, ustuCizili, kod, para,
  whatsappKartOlustur, whatsappFirsatKartOlustur,
  whatsappKanalGonder, istekHazirla, kanalIdGecerliMi,
  whatsappAyarDogrula, SAGLAYICILAR, MESAJ_LIMIT, CAPTION_LIMIT,
} from '../src/whatsappKanal.js';
import { closeDatabase } from '../src/store.js';

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

// WhatsApp biçim işaretlerini "bizim eklediğimiz" mi diye ayırt etmek için
// yardımcı: dış veride bu işaretler bulunmamalı.
const BICIM = /[*_~`]/;

/* ------------------------------------------------------------------ */
bolum('1) ✍️ WhatsApp Markdown biçimi');

kontrol('kalın: *metin*', kalin('Deneme') === '*Deneme*', kalin('Deneme'));
kontrol('italik: _metin_', italik('Deneme') === '_Deneme_', italik('Deneme'));
kontrol('üstü çizili: ~metin~', ustuCizili('Deneme') === '~Deneme~', ustuCizili('Deneme'));
kontrol('kod: ```metin```', kod('Deneme') === '```Deneme```', kod('Deneme'));
kontrol('kalin içindeki * kaçırılır', kalin('a*b') === '*ab*', kalin('a*b'));
kontrol('italik içindeki _ kaçırılır', italik('a_b') === '_ab_', italik('a_b'));
kontrol('üstü çizili içindeki ~ kaçırılır', ustuCizili('a~b') === '~ab~', ustuCizili('a~b'));

kontrol('para biçimi ₺758,65', para(758.65) === '₺758,65', para(758.65));
kontrol('para binlik ayırıcı', para(24366.42) === '₺24.366,42', para(24366.42));
kontrol('geçersiz sayı → —', para(null) === '—' && para('abc') === '—');

/* ------------------------------------------------------------------ */
bolum('2) 🧼 Karakter kaçışı (saf metin)');

const k1 = whatsappKac('A & B <script>alert(1)</script>');
kontrol('& korunur', k1.includes('A & B'), k1);
kontrol('<> düz metin (HTML değil)', k1.includes('<script>'), k1);
kontrol('kaçışta * yok', !k1.includes('*'));
kontrol('HTML varlıkları çözülür',
  whatsappKac('&amp; &lt;b&gt;') === '& <b>', whatsappKac('&amp; &lt;b&gt;'));
kontrol('biçim işaretleri temizlenir',
  !BICIM.test(whatsappKac('*bu* _şu_ ~o~ ```kod```')));
kontrol('kontrol karakterleri temizlenir', !/[\u0000-\u0008]/.test(whatsappKac('a\u0001b')));
kontrol('boş/null güvenli', whatsappKac(null) === '' && whatsappKac(undefined) === '');
kontrol('ardışık boşluk sadeleşir', whatsappKac('a    b') === 'a b', whatsappKac('a    b'));

/* ------------------------------------------------------------------ */
bolum('3) 🎯 Radar kartı');

const d = {
  ad: 'Creality Ender PLA Filament Gri 1kg',
  stokta: true,
  fiyat: 758.65,
  site: 'Ventatek',
  kargo: 'Ücretsiz Kargo',
  birimMetni: '₺758,65 / kg',
  stokluSayisi: 4,
  tukenenSayisi: 2,
  tasarruf: 120.35,
  digerleri: [
    { site: 'Koçtaş', fiyat: 785 },
    { site: 'Hepsiburada', fiyat: 789.99 },
    { site: 'Trendyol', fiyat: 879 },
  ],
  afiliyeUrl: 'https://baskihesap.tech/yonlendir?site=ventatek&sku=ABC123',
};

const kart = whatsappKartOlustur(d);
kontrol('kart üretildi', typeof kart === 'string' && kart.length > 100);
kontrol('başlık kalın', kart.includes('*OTONOM FİYAT RADARI: GÜNCEL EN UCUZ*'));
kontrol('ürün adı kalın', kart.includes(`*${d.ad}*`));
kontrol('fiyat var', kart.includes('₺758,65'));
kontrol('fiyat kalın', /\*₺758,65\*/.test(kart));
kontrol('mağaza var', kart.includes('Ventatek'));
kontrol('kargo var', kart.includes('Ücretsiz Kargo'));
kontrol('birim fiyat var', kart.includes('₺758,65 / kg'));
kontrol('stok doğrulaması', kart.includes('Doğrulandı (Satın Alınabilir)'));
kontrol('tükenen mağaza italik bilgi', kart.includes('_(')
  && kart.includes('2 tükenen/stokta olmayan mağaza elendi'));
kontrol('diğer mağazalar listelenir',
  kart.includes('Koçtaş: ₺785,00') && kart.includes('Hepsiburada: ₺789,99')
  && kart.includes('Trendyol: ₺879,00'));
kontrol('tasarruf satırı', kart.includes('₺120,35'));
kontrol('afiliye link kartta', kart.includes(d.afiliyeUrl));
kontrol('satın alma başlığı kalın', kart.includes('*Satın Alma Linki:*'));
kontrol('alt marka', kart.includes('Baskı Hesap'));
kontrol('mesaj sınırı içinde', kart.length <= MESAJ_LIMIT, String(kart.length));
kontrol('HTML etiketi YOK', !/<\/?[a-z][^>]*>/i.test(kart));

// Stok yok
const kartYok = whatsappKartOlustur({ ad: 'X Ürün', stokta: false, tukenenSayisi: 5 });
kontrol('stok yok: uyarı', kartYok.includes('Stokta satın alınabilir teklif yok'));
kontrol('stok yok: link yok', !kartYok.includes('http'));

// 60 satırdan fazla diğer mağaza → kırpılır
const cokKart = whatsappKartOlustur({
  ...d,
  digerleri: Array.from({ length: 40 }, (_, i) => ({ site: `Mağaza${i}`, fiyat: 800 + i })),
});
kontrol('diğer mağazalar 5 ile sınırlı',
  cokKart.includes('Mağaza4') && !cokKart.includes('Mağaza6'));

/* ------------------------------------------------------------------ */
bolum('4) 🔥 Fırsat kartı');

const f = {
  urun: 'Creality Ender PLA Gri 1kg',
  site: 'Ventatek',
  referans: 899.99,
  fiyat: 758.65,
  indirim: 15.7,
  fark: 141.34,
  kargo: 'Ücretsiz Kargo',
  durum: 'Stokta',
  url: 'https://baskihesap.tech/yonlendir?site=ventatek',
};
const fk = whatsappFirsatKartOlustur(f);
kontrol('fırsat başlığı', fk.includes('*GÜNÜN FIRSATI:'));
kontrol('eski fiyat üstü çizili', fk.includes('~₺899,99~'), fk.slice(0, 200));
kontrol('yeni fiyat kalın', fk.includes('*₺758,65*'));
kontrol('indirim oranı', fk.includes('%15,7'));
kontrol('tasarruf tutarı', fk.includes('₺141,34'));
kontrol('url var', fk.includes(f.url));
kontrol('HTML yok', !/<\/?[a-z][^>]*>/i.test(fk));
kontrol('boş girdi boş döner', whatsappFirsatKartOlustur(null) === '');

/* ------------------------------------------------------------------ */
bolum('5) 🔌 Sağlayıcı adaptörleri');

kontrol('4 sağlayıcı tanımlı', SAGLAYICILAR.length === 4, String(SAGLAYICILAR.length));
kontrol('sağlayıcı kimlikleri',
  ['webhook', 'green-api', 'ultramsg', 'meta'].every(id => SAGLAYICILAR.some(s => s.id === id)));

const cfgWebhook = { channelId: '1203630@newsletter', apiUrl: 'https://gw.test/hook', token: 'tok123' };
const w1 = istekHazirla('webhook', cfgWebhook, 'KART');
kontrol('webhook: url', w1.url === 'https://gw.test/hook');
kontrol('webhook: chatId', w1.body.chatId === '1203630@newsletter');
kontrol('webhook: message', w1.body.message === 'KART');
kontrol('webhook: Authorization Bearer', /^Bearer tok123$/.test(w1.headers.Authorization));
kontrol('webhook: görselde imageUrl', istekHazirla('webhook', cfgWebhook, 'K', { imageUrl: 'https://x/y.png' })
  .body.imageUrl === 'https://x/y.png');

const w2 = istekHazirla('green-api', { ...cfgWebhook, apiUrl: 'https://7103.api.green-api.com', token: 'ABC' }, 'KART');
kontrol('green-api: sendMessage yolu',
  w2.url === 'https://7103.api.green-api.com/sendMessage/ABC', w2.url);
kontrol('green-api: message alanı', w2.body.message === 'KART');
const w2g = istekHazirla('green-api', { ...cfgWebhook, apiUrl: 'https://g.api', token: 'ABC' }, 'KART', { imageUrl: 'https://x/y.png' });
kontrol('green-api: görselde sendFileByUrl', /sendFileByUrl/.test(w2g.url) && w2g.body.urlFile === 'https://x/y.png');

const w3 = istekHazirla('ultramsg', { channelId: '905551112233', apiUrl: 'https://api.ultramsg.com/i1', token: 'T' }, 'KART');
kontrol('ultramsg: messages/chat', /messages\/chat$/.test(w3.url), w3.url);
kontrol('ultramsg: token gövdede', w3.body.token === 'T');
kontrol('ultramsg: to normalize', w3.body.to === '905551112233');

const w4 = istekHazirla('meta', { channelId: '905551112233', token: 'MT', phoneNumberId: '1234' }, 'KART');
kontrol('meta: graph adresi',
  w4.url === 'https://graph.facebook.com/v21.0/1234/messages', w4.url);
kontrol('meta: Bearer token', w4.headers.Authorization === 'Bearer MT');
kontrol('meta: text gövdesi', w4.body.type === 'text' && w4.body.text.body === 'KART');
kontrol('meta: image caption',
  istekHazirla('meta', { channelId: '905551112233', token: 'MT', phoneNumberId: '1' }, 'KART', { imageUrl: 'https://x/y.png' })
    .body.image.caption === 'KART');

// Caption sınırı: uzun kart kırpılır
const uzun = 'a'.repeat(2000);
const wCap = istekHazirla('meta', { channelId: '905551112233', token: 'MT', phoneNumberId: '1' }, uzun, { imageUrl: 'https://x/y.png' });
kontrol('caption sınırı uygulanır', wCap.body.image.caption.length <= CAPTION_LIMIT,
  String(wCap.body.image.caption.length));

/* ------------------------------------------------------------------ */
bolum('6) ✅ Kanal ID ve ayar doğrulama');

kontrol('@newsletter geçerli', kanalIdGecerliMi('120363012345678901@newsletter'));
kontrol('@g.us geçerli', kanalIdGecerliMi('120363012345678901@g.us'));
kontrol('@c.us geçerli', kanalIdGecerliMi('905551112233@c.us'));
kontrol('telefon geçerli', kanalIdGecerliMi('+90 555 111 22 33'));
kontrol('boş geçersiz', !kanalIdGecerliMi(''));
kontrol('rastgele metin geçersiz', !kanalIdGecerliMi('kanal-adi'));
kontrol('kısa numara geçersiz', !kanalIdGecerliMi('123'));

const dv = whatsappAyarDogrula({
  provider: 'webhook', channelId: '1@newsletter', apiUrl: 'https://gw.test',
});
kontrol('geçerli ayar onaylanır', dv.ok === true, JSON.stringify(dv.hatalar));
const dv2 = whatsappAyarDogrula({ provider: 'webhook', channelId: '', apiUrl: '' });
kontrol('eksik ayar reddedilir', dv2.ok === false && dv2.hatalar.length >= 2);
const dv3 = whatsappAyarDogrula({ provider: 'meta', channelId: '1@c.us' });
kontrol('meta: token+phoneId zorunlu',
  dv3.ok === false && dv3.hatalar.some(h => /Token/i.test(h)));
const dv4 = whatsappAyarDogrula({ provider: 'bilinmeyen', channelId: '1@c.us', apiUrl: 'x' });
kontrol('bilinmeyen sağlayıcı reddedilir', dv4.ok === false);

/* ------------------------------------------------------------------ */
bolum('7) 🛡️ Hata izolasyonu (fetch mock)');

const gercekFetch = globalThis.fetch;

/** Sahte fetch: istenen davranışı üretir. */
function fetchMock(davranis) {
  globalThis.fetch = async (url, opts) => {
    if (davranis === 'ag-hatasi') throw new Error('ECONNREFUSED');
    if (davranis === 'timeout') {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    }
    const status = davranis === '500' ? 500 : 200;
    return {
      ok: status === 200,
      status,
      text: async () => (status === 200
        ? JSON.stringify({ idMessage: 'MSG1', messages: [{ id: 'wamid.1' }] })
        : 'sağlayıcı hatası: token tok123 geçersiz'),
    };
  };
}

// Başarılı gönderim
fetchMock('basarili');
const cfg = { channelId: '1@newsletter', apiUrl: 'https://gw.test', token: 'tok123' };
const ok1 = await whatsappKanalGonder('KART', { ayar: { provider: 'webhook', ...cfg } });
kontrol('başarılı gönderim ok:true', ok1.ok === true, JSON.stringify(ok1));
kontrol('mesaj kimliği yakalanır', ok1.mesajId === 'MSG1' || ok1.mesajId === 'wamid.1', String(ok1.mesajId));

// Kuru çalışma: ağ isteği yok
let cagri = 0;
globalThis.fetch = async () => { cagri++; throw new Error('çağrılmamalı'); };
const kuru = await whatsappKanalGonder('KART', { ayar: { provider: 'webhook', ...cfg }, kuru: true });
kontrol('kuru:true ağ isteği atmaz', cagri === 0 && kuru.ok === true && kuru.kuru === true);
kontrol('kuru: önizleme gövdesi döner', kuru.onizleme?.body?.message === 'KART');

// 500 hatası: fırlatmaz
fetchMock('500');
const h500 = await whatsappKanalGonder('KART', { ayar: { provider: 'webhook', ...cfg } });
kontrol('500 → ok:false (fırlatmaz)', h500.ok === false && !!h500.hata);
kontrol('500 → token hata mesajında maskeli',
  !h500.hata.includes('tok123') && h500.hata.includes('***'), h500.hata);

// Ağ hatası
fetchMock('ag-hatasi');
const hAg = await whatsappKanalGonder('KART', { ayar: { provider: 'webhook', ...cfg } });
kontrol('ağ hatası → ok:false (fırlatmaz)', hAg.ok === false && !!hAg.hata);
kontrol('ağ hatası mesajı taşır', /ECONNREFUSED/.test(hAg.hata), hAg.hata);

// Timeout
fetchMock('timeout');
const hTo = await whatsappKanalGonder('KART', { ayar: { provider: 'webhook', ...cfg } });
kontrol('timeout → ok:false + işaret', hTo.ok === false && /zaman aşımı/.test(hTo.hata), hTo.hata);

// Ayar eksik: ağ isteği hiç atılmaz
let cagri2 = 0;
globalThis.fetch = async () => { cagri2++; throw new Error('çağrılmamalı'); };
const eksik = await whatsappKanalGonder('KART', { ayar: { provider: 'webhook', channelId: '' } });
kontrol('kanal ID yok → ok:false', eksik.ok === false && /Kanal/.test(eksik.hata));
kontrol('kanal ID yok → ağ isteği YOK', cagri2 === 0);
const bosMesaj = await whatsappKanalGonder('', { ayar: cfg });
kontrol('boş mesaj → ok:false', bosMesaj.ok === false);

globalThis.fetch = gercekFetch;

/* ------------------------------------------------------------------ */
bolum('8) 🔗 Entegrasyon kancaları');

const radarKaynak = fs.readFileSync('src/otonomRadar.js', 'utf8');
const firsatKaynak = fs.readFileSync('src/firsatKanali.js', 'utf8');

kontrol('radar: whatsappKopyaGonder dışa açık', /export async function whatsappKopyaGonder/.test(radarKaynak));
// Kanca, Telegram gönderiminden ÖNCE çağrılır (const wa = await ...) ve
// dönen sonuç Telegram yanıtına `whatsapp` alanı olarak eklenir.
kontrol('radar: foto yolunda WhatsApp kancası',
  /whatsappKopyaGonder\(d\)[\s\S]{0,400}yontem: 'sendPhoto'/.test(radarKaynak));
kontrol('radar: metin yolunda WhatsApp kancası',
  /whatsappKopyaGonder\(d\)[\s\S]{0,400}yontem: 'sendMessage'/.test(radarKaynak));
kontrol('radar: sonuçta whatsapp alanı', /whatsapp: wa \|\| undefined/.test(radarKaynak));
kontrol('radar: kanca izole (catch)', /whatsappKopyaGonder\(d\)\.catch\(\(\) => null\)/.test(radarKaynak));
kontrol('radar: ayar kapalıysa atlar', /firsatKanalEnabled !== true/.test(radarKaynak));
kontrol('radar: stok yoksa göndermez', /Stokta teklif yok; WhatsApp/.test(radarKaynak));

kontrol('fırsat: whatsappFirsatGonder dışa açık',
  /export async function whatsappFirsatGonder/.test(firsatKaynak));
kontrol('fırsat: izole (kendi try/catch)',
  /export async function whatsappFirsatGonder[\s\S]{0,2500}catch \(e\)/.test(firsatKaynak));
kontrol('fırsat: kanal kapalıysa atlar', /firsatKanalEnabled !== true/.test(firsatKaynak));
kontrol('fırsat: Telegram sonrası tetiklenir',
  /firsatKaydet\(f, 'gonderildi'[\s\S]{0,400}whatsappFirsatGonder/.test(firsatKaynak));

// Ayar kapalıyken hiçbir şey göndermez (ağ isteği yok)
let cagri3 = 0;
globalThis.fetch = async () => { cagri3++; throw new Error('çağrılmamalı'); };
const waKapali = await whatsappKanalGonder('K', {
  ayar: { firsatKanalEnabled: false, provider: 'webhook', channelId: '1@c.us', apiUrl: 'https://gw.test' },
});
globalThis.fetch = gercekFetch;
kontrol('kanal kapalıyken gönderim engellenir', waKapali.ok === false);

/* ------------------------------------------------------------------ */
bolum('9) 🌐 Sunucu ve arayüz sözleşmesi');

const server = fs.readFileSync('server.js', 'utf8');
const ayarHtml = fs.readFileSync('public/admin.html', 'utf8');
const ayarJs = fs.readFileSync('public/admin.js', 'utf8');
const store = fs.readFileSync('src/store.js', 'utf8');

kontrol('server: test ucu', /app\.post\('\/api\/alarm\/test-whatsapp-kanal'/.test(server));
kontrol('server: sağlayıcı listesi ucu', /app\.get\('\/api\/whatsapp\/saglayicilar'/.test(server));
kontrol('server: token API yanıtında maskeli',
  /token: '',\s*\n\s*tokenVar:/.test(server));
kontrol('server: boş token patch\'i ezmez', /wa\.token === '\*\*\*'/.test(server));

kontrol('store: firsatKanalEnabled varsayılanı', /firsatKanalEnabled: false/.test(store));
kontrol('store: provider varsayılanı', /provider: 'webhook'/.test(store));
kontrol('store: token beyaz listede', /'firsatKanalEnabled', 'provider', 'channelId', 'apiUrl', 'token'/.test(store));
kontrol('store: derin birleştirme (yeni alanlar eski kurulumda görünür)',
  /varsayilan, \.\.\.deger/.test(store));

kontrol('ayarlar.html: etkinleştir kutusu', /id="waKanalEnabled"/.test(ayarHtml));
kontrol('ayarlar.html: sağlayıcı seçimi', /id="waKanalProvider"/.test(ayarHtml));
kontrol('ayarlar.html: kanal ID alanı', /id="waKanalChannelId"/.test(ayarHtml));
kontrol('ayarlar.html: API URL alanı', /id="waKanalApiUrl"/.test(ayarHtml));
kontrol('ayarlar.html: token şifreli giriş', /type="password" id="waKanalToken"/.test(ayarHtml));
kontrol('ayarlar.html: test butonu', /id="waKanalTestBtn"/.test(ayarHtml));
kontrol('ayarlar.html: önizleme kutusu', /id="waKanalOnizleme"/.test(ayarHtml));
kontrol('ayarlar.html: meta alanları', /id="waKanalPhoneId"/.test(ayarHtml));

kontrol('ayarlar.js: kart değerleri gönderiliyor',
  /firsatKanalEnabled: \$\('#waKanalEnabled'\)/.test(ayarJs));
kontrol('ayarlar.js: token boşsa gönderilmez', /if \(!govde\.token\) delete govde\.token/.test(ayarJs));
kontrol('ayarlar.js: otomatik kayıt', /waKanalKaydetGecikmeli/.test(ayarJs));
kontrol('ayarlar.js: test ucu çağrısı', /test-whatsapp-kanal/.test(ayarJs));
kontrol('ayarlar.js: önizleme kuru mod', /kuru: true/.test(ayarJs));

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
