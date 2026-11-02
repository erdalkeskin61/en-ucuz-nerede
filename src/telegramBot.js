/**
 * 🤖 En Ucuz Nerede — Telegram Akıllı Fiyat Asistanı — 2026-11-02
 *
 * Bot artık yalnızca URL ile çalışmıyor; iki yönlü bir asistana dönüştürüldü:
 *
 *  1) METİN ARAMASI: "Bambu Lab P1S", "eSun PLA+ Siyah" gibi düz ürün adları
 *     `hizliKaynakUrunBul()` ile kanonik ürün URL'sine çevrilir, ardından
 *     `runComparison()` 61 mağazada fiyat taraması yapar.
 *  2) LINK ARAMASI: mesajda http(s) linki varsa mevcut akış aynen çalışır.
 *  3) ZENGİN YANIT: en ucuz mağaza, kargo, ₺/kg birim fiyat, ilk 5 mağaza ve
 *     tasarruf farkı tek mesajda.
 *  4) INLINE BUTONLAR: en ucuz mağazaya git (afiliye), fiyatı takibe al
 *     (callback → SQLite), sitede detaylı incele.
 *  5) SWR: son 2 saatte taranmış ürün 0. saniyede önbellekten yanıtlanır ve
 *     "⚡ (Son kontrol: X dk önce)" notu düşülür.
 *
 * GÜVENLİK / DAYANIKLILIK:
 *  - Token yoksa çökmez; uyarı basıp bekler. Token geçersizse (401/404) polling durur.
 *  - Tüm kullanıcı metinleri `esc()` ile HTML-escape edilir (Telegram parse hatası yok).
 *  - İstekler sohbet başına sıraya alınır; peş peşe 10 arama botu kilitlemez.
 *  - Telegram 4096 karakter sınırına karşı mesaj kısaltılır.
 */
import crypto from 'node:crypto';
import { getSettings, getTracked, addTracked } from './store.js';
import { runComparison } from './pipeline.js';
import { detectSite } from './sites/index.js';
import { stokSirala, stoktaMi, karsilastirmaFiyati } from './stokSirala.js';
import { hizliKaynakUrunBul } from './urunArama.js';
import { birimFiyatHesapla, malzemeBul } from './birimFiyat.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { anlikAl, anlikYaz, snapshotAra } from './anlikOnbellek.js';
import { config } from './config.js';

/** Botun adı (mesaj imzası / loglar). */
export const BOT_ADI = '@erdal_fiyat_takip_bot';

/** SWR: bot için "taze" sayılan pencere (2 saat). */
export const BOT_SWR_MS = 2 * 60 * 60 * 1000;

/** Telegram mesaj üst sınırı (güvenli pay bırakılmış). */
const MESAJ_LIMIT = 4000;

/** Aynı sohbette eşzamanlı işlem yerine sıra (spam koruması). */
const SOHBET_KUYRUGU = new Map(); // chatId → { kuyruk: Function[], calisiyor: boolean }
const MAKS_KUYRUK = 5;

/** Takip butonu için bekleyen sonuçlar (hash → kayıt). */
const TAKIP_BEKLEYEN = new Map();
const TAKIP_TTL_MS = 3 * 60 * 60 * 1000;

let isPolling = false;
let stopRequested = false;
let lastUpdateId = 0;
let tokenUyarisiVerildi = false;
let gecersizToken = false;

/* ------------------------------------------------------------------ */
/* 🎯 Radar yönetimi (2026-11-02)                                      */
/* ------------------------------------------------------------------ */

/**
 * Radar modülü DİNAMİK yüklenir: `otonomRadar.js`, bu dosyadan `esc`,
 * `botPara` ve `kargoMetni` alıyor. Statik import döngüsel bağımlılık
 * oluşturacağı için komut anında yüklenir (ESM döngüleri kırılgan).
 */
let radarModuluYukle = () => import('./otonomRadar.js');

/** Test/teşhis: radar modülünü enjekte et (ağ/DB olmadan komut testi). */
export function __radarModuluAyarla(fn) {
  radarModuluYukle = typeof fn === 'function' ? fn : () => import('./otonomRadar.js');
}

/**
 * Yönetici = `settings.telegram.chatId` (radar bildirim sohbeti de kabul edilir).
 * Grup/kanal kimlikleri negatif olabilir; karşılaştırma string üzerinden.
 */
export function yoneticiMi(chatId) {
  if (chatId == null) return false;
  let s;
  try { s = getSettings(); } catch { return false; }
  const id = String(chatId).trim();
  if (!id) return false;
  const adaylar = [s?.telegram?.chatId, s?.radar?.chatId]
    .map(x => String(x ?? '').trim())
    .filter(Boolean);
  return adaylar.includes(id);
}

const YONETICI_UYARISI = '⚠️ Bu komut yalnızca sistem yöneticisine açıktır.';

/**
 * `/radar_ekle@Bot Ad` → `{ komut: '/radar_ekle', args: 'Ad' }`.
 * Bot adı soneki ve büyük/küçük harf farkı normalize edilir.
 */
export function komutAyikla(text) {
  const m = String(text || '').trim()
    .match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { komut: '/' + m[1].toLowerCase(), args: String(m[2] || '').trim() };
}

/** "02.11.2026 16:30" biçiminde kısa tarih; geçersizse null. */
function tarihKisa(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Türkçe-duyarlı küçük harf (I/İ sorunu olmadan arama). */
function trKucult(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

/** /radar — durum özeti + stoktaki dip fiyatlar + tarama butonu. */
async function radarDurumMesaji() {
  const r = await radarModuluYukle();
  const d = r.radarDurum();
  const a = d.ayar || {};
  const saat = Number(a.saatAraligi) || 4;
  const durum = a.enabled
    ? `🟢 <b>Açık</b> — her ${saat} saatte bir otomatik tarama`
    : `⚪ <b>Kapalı</b> — her ${saat} saatte bir (elle çalıştırılabilir)`;

  const rapor = d.sonRapor || null;
  const son = tarihKisa(d.sonCalisma);
  const sonSatir = son
    ? `🕒 Son tur: <b>${esc(son)}</b>` + (rapor
      ? ` — ${Number(rapor.taranan) || 0} tarandı, ${Number(rapor.stoktaBulunan) || 0} stokta, `
        + (Number(rapor.hataSayisi) ? `⚠️ ${Number(rapor.hataSayisi)} hata` : 'hata yok')
      : '')
    : '🕒 Son tur: <i>henüz çalışmadı</i>';

  const enUcuzlar = (d.durumlar || [])
    .filter(x => x?.stokta && Number(x.fiyat) > 0)
    .slice(0, 6)
    .map(x => `• ${esc(baslikKisalt(x.ad || 'Ürün', 45))} — <b>${botPara(x.fiyat)}</b> `
      + `(${esc(x.site || '—')})`);

  const satirlar = [
    '🎯 <b>OTONOM FİYAT RADARI</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    durum,
    `📦 Takipte: <b>${Number(d.katalogSayisi) || 0} ürün</b>`,
    sonSatir,
    '━━━━━━━━━━━━━━━━━━━━',
    '🏆 <b>Stoktaki En Ucuzlar:</b>',
    ...(enUcuzlar.length
      ? enUcuzlar
      : ['<i>Henüz stokta fiyat kaydı yok — ilk taramayı başlatın.</i>']),
  ];
  if (Number(d.gonderim?.bugun) > 0) {
    satirlar.push(`📨 Bugün gönderilen bildirim: <b>${Number(d.gonderim.bugun)}</b>`);
  }
  satirlar.push('━━━━━━━━━━━━━━━━━━━━');
  satirlar.push('🎛️ /radar_liste · /radar_tara · /radar_ekle · /radar_sil');

  return {
    metin: satirlar.join('\n').slice(0, MESAJ_LIMIT),
    butonlar: {
      inline_keyboard: [[{ text: '🧪 Şimdi Taramayı Başlat', callback_data: 'radar_tara' }]],
    },
  };
}

/** /radar_liste — ID + kategori + ad + güncel dip fiyat. */
async function radarListeMesaji() {
  const r = await radarModuluYukle();
  const katalog = r.katalogGetir();
  if (!katalog.length) {
    return '📭 Radar kataloğu boş.\n\nEklemek için: <code>/radar_ekle Ürün Adı 1kg</code>';
  }
  // Güncel dip fiyatlar: radar_durum özetinden (saatlik taramaların sonucu).
  let fiyatMap = new Map();
  try {
    const d = r.radarDurum();
    fiyatMap = new Map((d.durumlar || []).map(x => [Number(x.katalogId), x]));
  } catch { /* durum okunamazsa yalnızca katalog listelenir */ }

  const satirlar = katalog.slice(0, 60).map((k, i) => {
    const ikon = k.kategori === 'yazici' ? '🖨️' : k.kategori === 'filament' ? '🧵' : '📦';
    const d = fiyatMap.get(Number(k.id));
    let fiyat = '';
    if (d?.stokta && Number(d.fiyat) > 0) {
      fiyat = ` — <b>${botPara(d.fiyat)}</b> (${esc(baslikKisalt(d.site || '—', 22))})`;
    } else if (d) {
      fiyat = ' — <i>stokta fiyat yok</i>';
    } else {
      fiyat = ' — <i>henüz taranmadı</i>';
    }
    return `${i + 1}. ${ikon} ${esc(baslikKisalt(k.ad, 55))} [ID: ${Number(k.id)}]${fiyat}`;
  });
  const kalan = katalog.length > 60
    ? `\n\n<i>… ve ${katalog.length - 60} ürün daha</i>` : '';
  return `🗂️ <b>Radar Takip Kataloğu (${katalog.length})</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + satirlar.join('\n') + kalan
    + '\n\n🗑️ Silmek için: <code>/radar_sil 5</code> veya <code>/radar_sil Ürün Adı</code>';
}

/** /radar_tara — arka planda 61 mağaza taramasını başlatır. */
async function radarTaramaBaslatMesaji() {
  const r = await radarModuluYukle();
  const d = r.radarDurum();
  const adet = Number(d?.katalogSayisi) || 0;
  if (!adet) {
    return '📭 Radar kataloğu boş — önce <code>/radar_ekle</code> ile ürün ekleyin.';
  }
  const sonuc = r.radarBaslat({ zorla: true, gonder: true });
  if (sonuc?.basladi === false) {
    return '⏳ Otonom radar taraması zaten çalışıyor. Bitmesini bekleyin.';
  }
  return '🚀 Otonom radar taraması arka planda başlatıldı!\n\n'
    + `📦 <b>${adet} ürün</b> 61 mağazada taranıyor, bitince bildirimler kanala iletilecektir.`;
}

/** /radar_ekle &lt;ürün adı&gt; */
async function radarEkleMesaji(args) {
  const ad = String(args || '').replace(/\s+/g, ' ').trim();
  if (ad.length < 2) {
    return '💡 Kullanım: <code>/radar_ekle Polymaker PolyTerra PLA Beyaz 1kg</code>';
  }
  if (ad.length > 160) return '⚠️ Ürün adı en fazla 160 karakter olabilir.';
  try {
    const r = await radarModuluYukle();
    const kayit = r.katalogEkle({ ad, sorgu: ad });
    return `✅ "<b>${esc(kayit.ad)}</b>" radar takip kataloğuna eklendi `
      + `(ID: <b>${Number(kayit.id)}</b>).\nBir sonraki turda 61 mağazada taranacaktır.`;
  } catch (e) {
    return '❌ Katalog güncellenemedi: ' + esc(String(e?.message || e).slice(0, 180));
  }
}

/** /radar_sil &lt;ID | ürün adı&gt; */
async function radarSilMesaji(args) {
  const hedef = String(args || '').trim();
  if (!hedef) {
    return '💡 Kullanım: <code>/radar_sil 5</code> veya <code>/radar_sil Ürün Adı</code>';
  }
  const r = await radarModuluYukle();
  const katalog = r.katalogGetir();
  let kayit = null;
  if (/^\d+$/.test(hedef)) {
    kayit = katalog.find(k => Number(k.id) === Number(hedef)) || null;
  } else {
    const q = trKucult(hedef);
    kayit = katalog.find(k => trKucult(k.ad) === q)
      || katalog.find(k => trKucult(k.sorgu) === q)
      || katalog.find(k => trKucult(k.ad).includes(q))
      || null;
  }
  if (!kayit) {
    return `❓ "<b>${esc(baslikKisalt(hedef, 60))}</b>" katalogda bulunamadı.\n`
      + 'Liste: /radar_liste';
  }
  const silindi = r.katalogSil(kayit.id);
  if (!silindi) return '❌ Ürün silinemedi (kayıt bulunamadı).';
  return `🗑️ "<b>${esc(kayit.ad)}</b>" radar kataloğundan çıkarıldı.`;
}

/** Radar kartındaki 🔔 butonu: kullanıcıya özel `tracked` kaydı oluşturur. */
async function radarAlarmKur(chatId, katalogId) {
  const r = await radarModuluYukle();
  const d = r.radarDurumVerisi(Number(katalogId));
  if (!d?.stokta || !(Number(d.fiyat) > 0)) {
    return {
      ok: false,
      mesaj: '⚠️ Bu ürün için güncel stokta fiyat bulunamadı. '
        + 'Lütfen /radar_tara ile yeniden taratın.',
    };
  }
  const url = d.hamUrl || d.afiliyeUrl || null;
  if (!url) {
    return { ok: false, mesaj: '⚠️ Ürün bağlantısı bulunamadı; alarm kurulamadı.' };
  }
  const urun = baslikKisalt(d.ad || d.urun || 'Ürün', 140);
  const kayit = addTracked({
    urun,
    hedefFiyat: Number(d.fiyat),
    urunler: [{ site: d.siteId || d.site, url }],
    chatId,
  });
  if (!kayit?.id) {
    return { ok: false, mesaj: '❌ Alarm kaydedilemedi (veritabanı hatası).' };
  }
  return {
    ok: true,
    mesaj: `🔔 "<b>${esc(urun)}</b>" için fiyat takip alarmınız kuruldu!\n\n`
      + `🎯 Mevcut en ucuz: <b>${botPara(d.fiyat)}</b> (${esc(d.site || '—')})\n`
      + 'Fiyat bu seviyenin altına düştüğünde size özel mesaj gönderilecektir.\n'
      + 'Takipleriniz: /liste',
  };
}

/* ------------------------------------------------------------------ */
/* 🔎 Telegram Inline Mode (2026-11-03)                                */
/* ------------------------------------------------------------------ */

/** Inline arama için Türkçe-duyarlı katlama. */
function inlineKatla(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * `/start` deep-link yükü: Telegram yalnızca 64 karaktere izin verir.
 * Metin UTF-8 bayt olarak en fazla 48 bayta kırpılır → base64url ≤ 64.
 * @param {string} metin
 * @returns {string}
 */
export function startPayloadOlustur(metin) {
  let s = String(metin || '');
  while (Buffer.byteLength(s, 'utf8') > 48) s = s.slice(0, -1);
  return Buffer.from(s, 'utf8').toString('base64url');
}

/** Deep-link yükünü çözer (geçersizse boş dize). */
export function startPayloadCoz(yuk) {
  try {
    const s = Buffer.from(String(yuk || ''), 'base64url').toString('utf8').trim();
    return s.slice(0, 140);
  } catch {
    return '';
  }
}

function botLinki(yuk = '') {
  const ad = BOT_ADI.replace('@', '');
  return `https://t.me/${ad}${yuk ? '?start=' + encodeURIComponent(yuk) : ''}`;
}

/** Sorgu boşken / sonuç yokken gösterilen yönlendirme kartı. */
function inlineIpucu() {
  const metin = '🔎 <b>En Ucuz Nerede?</b> — 61 mağazada canlı fiyat karşılaştırması.\n\n'
    + 'Ürün adını yazın: <i>Creality Ender PLA</i>, <i>Bambu Lab P1S</i>, <i>eSun PLA+</i>…\n\n'
    + `👉 ${botLinki()}`;
  return {
    type: 'article',
    id: 'ipucu',
    title: '🔎 Ürün adı yazın — 61 mağazada karşılaştır',
    description: 'Örn: Creality Ender PLA, Bambu Lab P1S, eSun PLA+ Siyah',
    input_message_content: {
      message_text: metin,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
    reply_markup: {
      inline_keyboard: [[{ text: '🤖 Bota Git', url: botLinki() }]],
    },
  };
}

/** Önbellekte sonuç yoksa: bota göndererek canlı aramayı başlat. */
function inlineCanliAra(sorgu) {
  const q = String(sorgu || '').trim().slice(0, 120);
  const yuk = 'ara_' + startPayloadOlustur(q);
  const link = botLinki(yuk);
  const metin = `🔎 <b>${esc(q)}</b> için 61 mağazada canlı fiyat aranıyor…\n\n`
    + `👉 ${esc(link)}\n\n`
    + '<i>Bağlantıya dokunun; bot tüm mağazaları tarayıp en ucuz teklifi gönderir.</i>';
  return {
    type: 'article',
    id: 'canli-' + crypto.createHash('sha1').update(q).digest('hex').slice(0, 10),
    title: `🔎 "${q}" için canlı ara (61 mağaza)`.slice(0, 95),
    description: 'Önbellekte sonuç yok — bota gönder, anında taransın.',
    input_message_content: {
      message_text: metin,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    },
    reply_markup: {
      inline_keyboard: [[{ text: '🤖 Bota Gönder ve Ara', url: link }]],
    },
  };
}

/** Teklif listesinden inline sonuç paketi üretir. */
function inlineSonucPaketi({ urun, teklifler, ts = null, kaynakUrl = null, kimlik = null }) {
  const temiz = (teklifler || [])
    .filter(t => t && Number.isFinite(Number(t.fiyat)) && Number(t.fiyat) > 0 && t.url)
    .slice(0, 3);
  if (!temiz.length || !urun) return null;
  const enIyi = temiz[0];
  const yas = ts ? kisaYasMetni(Math.max(0, Date.now() - Number(ts))) : null;
  const madalya = ['🥇', '🥈', '🥉'];
  const satirlar = [
    `🏷️ <b>${esc(baslikKisalt(urun, 120))}</b>`,
    '',
    ...temiz.map((t, i) => `${madalya[i]} <b>${botPara(t.fiyat)}</b> — ${esc(t.site || 'Mağaza')}`),
  ];
  if (temiz.length === 1) satirlar.push('', '<i>Diğer mağazalar için bota gönderin.</i>');
  satirlar.push('');
  satirlar.push(`🔗 <a href="${esc(enIyi.url)}">${esc(enIyi.site || 'En ucuz mağaza')} — satın al</a>`);
  if (yas) satirlar.push(`🕒 Son tarama: ${esc(yas)}`);
  satirlar.push('📊 @EnUcuzNerede · 61 mağaza');

  const butonlar = temiz.map(t => ([{
    text: `🛒 ${String(t.site || 'Mağaza').slice(0, 18)} — ${botPara(t.fiyat)}`,
    url: t.url,
  }]));
  if (kaynakUrl) {
    butonlar.push([{
      text: '📊 Karşılaştırmayı Aç',
      url: `${config.publicUrl}/?url=${encodeURIComponent(kaynakUrl)}`,
    }]);
  }

  return {
    type: 'article',
    id: 'u-' + String(kimlik || crypto.createHash('sha1').update(urun).digest('hex')).slice(0, 40),
    title: `${botPara(enIyi.fiyat)} · ${baslikKisalt(urun, 70)}`.slice(0, 95),
    description: temiz.map((t, i) => `${madalya[i]} ${String(t.site || '').slice(0, 20)} ${botPara(t.fiyat)}`).join('  ')
      + (yas ? `  ·  ${yas}` : ''),
    input_message_content: {
      message_text: satirlar.join('\n').slice(0, 4000),
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    },
    reply_markup: { inline_keyboard: butonlar },
  };
}

/** Snapshot payload'ından en ucuz 3 stoklu teklifi çıkarır. */
function inlineSnapshotSonucu(kayit) {
  const payload = kayit?.payload;
  if (!payload) return null;
  const d = enUcuzTeklif(payload);
  if (!d.enUcuz) return null;
  const stoklu = d.sirali.filter(r => stoktaMi(r));
  if (!stoklu.length) return null; // tükenen ürün inline'da "fırsat" gibi sunulmaz
  const teklifler = stoklu.slice(0, 3).map(r => ({
    site: r.siteName || r.site,
    siteId: r.site,
    fiyat: karsilastirmaFiyati(r),
    url: saticiLinki(r.site, hamUrl(r, payload.kaynak?.url)),
  })).filter(t => t.fiyat > 0 && t.url);
  return inlineSonucPaketi({
    urun: kayit.urun || payload.kaynak?.urun || '',
    teklifler,
    ts: kayit.ts,
    kaynakUrl: payload.kaynak?.url || null,
    kimlik: crypto.createHash('sha1').update(String(kayit.anahtar || kayit.urun)).digest('hex'),
  });
}

/**
 * Telegram inline sorgusuna verilecek sonuçları üretir (ağ isteği YOK).
 * @param {string} sorgu
 * @returns {Promise<Array<object>>}
 */
export async function inlineSonuclariOlustur(sorgu) {
  const q = String(sorgu || '').trim();
  const hedef = inlineKatla(q);
  const sonuc = [];
  const gorulen = new Set();

  if (q.length >= 2) {
    for (const kayit of snapshotAra(q, { limit: 8 })) {
      const paket = inlineSnapshotSonucu(kayit);
      if (!paket) continue;
      const anahtar = inlineKatla(kayit.urun);
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      sonuc.push(paket);
    }
  }

  // Radar kataloğu: saatlik taranan ürünler (snapshot'ta olmasa bile).
  let radar = null;
  try { radar = await radarModuluYukle(); } catch { radar = null; }
  if (radar?.radarDurum) {
    try {
      const d = radar.radarDurum();
      const durumMap = new Map((d.durumlar || []).map(x => [Number(x.katalogId), x]));
      let adaylar = [];
      if (q.length >= 2) {
        adaylar = (d.katalog || []).filter(k => {
          const a = inlineKatla(k.ad);
          return a && (a.includes(hedef) || hedef.includes(a));
        });
      } else {
        adaylar = (d.durumlar || []).filter(x => x.stokta).slice(0, 5)
          .map(x => ({ id: x.katalogId, ad: x.ad }));
      }
      for (const k of adaylar) {
        if (sonuc.length >= 8) break;
        const anahtar = inlineKatla(k.ad);
        if (!anahtar || gorulen.has(anahtar)) continue;
        const durum = durumMap.get(Number(k.id));
        if (!durum?.stokta || !(Number(durum.fiyat) > 0)) continue;
        let v = null;
        try { v = radar.radarDurumVerisi?.(k.id) || null; } catch { v = null; }
        const url = v?.afiliyeUrl || v?.hamUrl || null;
        if (!url) continue;
        gorulen.add(anahtar);
        const paket = inlineSonucPaketi({
          urun: k.ad,
          teklifler: [{ site: durum.site, fiyat: durum.fiyat, url }],
          ts: durum.ts,
          kaynakUrl: v?.kaynakUrl || null,
          kimlik: 'radar-' + k.id,
        });
        if (paket) sonuc.push(paket);
      }
    } catch { /* radar kapalıysa yalnızca snapshot kullanılır */ }
  }

  if (q.length >= 2) sonuc.push(inlineCanliAra(q));
  if (!sonuc.length) sonuc.push(inlineIpucu());
  return sonuc.slice(0, 10);
}

/**
 * `inline_query` güncellemesini yanıtlar.
 * BotFather'da inline mode açık olmalıdır (`/setinline`).
 */
export async function handleInlineQuery(token, iq) {
  if (!iq?.id) return;
  let results = [];
  try {
    results = await inlineSonuclariOlustur(iq.query);
  } catch (e) {
    console.error('[Telegram Bot] inline arama hatası:', String(e?.message || e).slice(0, 180));
    results = [inlineIpucu()];
  }
  if (!results.length) results = [inlineIpucu()];
  await api(token, 'answerInlineQuery', {
    inline_query_id: iq.id,
    results: results.slice(0, 20),
    cache_time: 120,
    is_personal: false,
  });
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Telegram HTML için kaçış. `&` ÖNCE gelmeli (aksi hâlde `&lt;` bozulur).
 * Çift tırnak da kaçırılır: bazı mesajlarda öznitelik bağlamı oluşabilir.
 */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Başlığı tek satırda, güvenli uzunlukta tutar. */
export function baslikKisalt(s, n = 90) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

/**
 * Bot mesajlarında para biçimi: `₺34.899,00`.
 * Uygulamanın `formatTL` çıktısı "34.899,00 TL"dir; Telegram mesajında spec'te
 * istenen `₺` öneki kullanılır (satır içinde "TL" tekrarı olmaz).
 */
export function botPara(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return '₺' + Number(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** URL'de http(s) var mı? */
export function linkVarMi(metin) {
  return /https?:\/\/[^\s]+/i.test(String(metin || ''));
}

/** Telegram Bot API çağrısı (ortak). */
async function api(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok || veri.ok === false) {
    const hata = new Error(veri.description || `Telegram API ${res.status}`);
    hata.statusCode = res.status;
    hata.telegram = veri;
    throw hata;
  }
  return veri;
}

async function sendTelegram(token, chatId, text, opts = {}) {
  return api(token, 'sendMessage', {
    chat_id: chatId,
    text: String(text).slice(0, MESAJ_LIMIT),
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview ?? true,
    ...opts.extra,
  });
}

async function editTelegram(token, chatId, messageId, text, opts = {}) {
  return api(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: String(text).slice(0, MESAJ_LIMIT),
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview ?? true,
    ...opts.extra,
  });
}

async function answerCallback(token, callbackId, text, alert = false) {
  try {
    await api(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text: String(text || '').slice(0, 200),
      show_alert: !!alert,
    });
  } catch { /* kullanıcı butonu çoktan kapatmış olabilir */ }
}

/**
 * Sohbet başına sıralı kuyruk. Peş peşe 10 arama gelse bile her sohbet için
 * işler sırayla yürür; bot kilitlenmez, Telegram'a "sıradasınız" denir.
 *
 * @returns {Promise<'hemen'|'kuyrukta'>} işin hemen mi başladığı
 */
function kuyrugaAl(chatId, gorev) {
  const anahtar = String(chatId);
  let kayit = SOHBET_KUYRUGU.get(anahtar);
  if (!kayit) {
    kayit = { kuyruk: [], calisiyor: false };
    SOHBET_KUYRUGU.set(anahtar, kayit);
  }
  const sirada = kayit.calisiyor || kayit.kuyruk.length > 0;
  if (kayit.kuyruk.length >= MAKS_KUYRUK) {
    // Kuyruk doldu: yeni işi kabul etme (bellek şişmesin), dürüstçe söyle.
    return Promise.resolve('dolu');
  }
  kayit.kuyruk.push(gorev);
  calistirKuyruk(anahtar, kayit);
  return Promise.resolve(sirada ? 'kuyrukta' : 'hemen');
}

function calistirKuyruk(anahtar, kayit) {
  if (kayit.calisiyor) return;
  const gorev = kayit.kuyruk.shift();
  if (!gorev) {
    SOHBET_KUYRUGU.delete(anahtar);
    return;
  }
  kayit.calisiyor = true;
  Promise.resolve()
    .then(gorev)
    .catch((e) => console.error('[Telegram Bot] iş hatası:', String(e?.message || e).slice(0, 200)))
    .finally(() => {
      kayit.calisiyor = false;
      setImmediate(() => calistirKuyruk(anahtar, kayit));
    });
}

/** Kargo metni: "Kargo Bedava" / "+₺45,00 Kargo" / "Kargo sepette". */
export function kargoMetni(r) {
  const kargo = r?.product?.pricing?.kargo || {};
  const bedava = r?.kargoBedava === true
    || kargo.uygulanir === false
    || Number(kargo.ucret) === 0
    || /ücretsiz|bedava/i.test(String(kargo.aciklama || ''))
    || /ücretsiz|bedava/i.test(String(r?.product?.shipping || ''));
  if (bedava) return 'Kargo Bedava';
  if (Number(kargo.ucret) > 0 && kargo.uygulanir !== false) return `+${botPara(kargo.ucret)} Kargo`;
  if (kargo.freeOver) return 'Sepette belli';
  return 'Kargo bilinmiyor';
}

/** Sıralama emojisi (1→🥇, 2→🥈, 3→🥉). */
function siraEmoji(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
}

/**
 * Karşılaştırma sonucundan en ucuz teklifi ve dağılımı çıkarır.
 * Stok hiyerarşisi korunur: tükenen ürün asla "en ucuz" seçilmez.
 */
export function enUcuzTeklif(res) {
  const bulunan = (res?.sonuclar || []).filter(r => r.status === 'found' && r.product);
  const stokta = bulunan.filter(r => stoktaMi(r));
  const havuz = stokta.length ? stokta : bulunan;
  const fiyatli = havuz.filter(r => Number.isFinite(karsilastirmaFiyati(r)) && karsilastirmaFiyati(r) > 0);
  const sirali = stokSirala(fiyatli);
  const enUcuz = sirali[0] || null;
  const enPahali = sirali.length
    ? sirali.reduce((a, b) => (karsilastirmaFiyati(b) > karsilastirmaFiyati(a) ? b : a))
    : null;
  return {
    enUcuz,
    enPahali,
    sirali,
    fiyat: enUcuz ? karsilastirmaFiyati(enUcuz) : null,
    enPahaliFiyat: enPahali ? karsilastirmaFiyati(enPahali) : null,
    bulunanSayisi: bulunan.length,
    stoktaSayisi: stokta.length,
    tamamiTukendi: bulunan.length > 0 && stokta.length === 0,
  };
}

/** Ürünün kendi (afiliyesiz) adresi. */
function hamUrl(r, yedek = null) {
  return r?.product?.url || yedek || null;
}

/** Afiliye link (site kimliği + ham URL). */
function saticiLinki(siteId, url) {
  try { return afiliyeLink(siteId, url, afiliyeAyarlari()); } catch { return url; }
}

/**
 * Zengin sonuç mesajını üretir (spec'teki biçim).
 *
 * @param {object} res runComparison / snapshot payload
 * @param {{yasNotu?:string|null}} opts
 */
export function sonucMesajiOlustur(res, opts = {}) {
  const k = res?.kaynak || {};
  const o = res?.ozet || {};
  const d = enUcuzTeklif(res);

  const baslik = baslikKisalt(k.urun || 'Ürün Karşılaştırma Sonucu', 90);
  const cizgi = '━━━━━━━━━━━━━━━━━━━━';

  if (!d.enUcuz) {
    return `🏷️ <b>${esc(baslik)}</b>\n${cizgi}\n`
      + '⚠️ <b>Stokta fiyat bulunamadı.</b>\n'
      + 'Mağazalar ürünü şu anda fiyatlandırmıyor olabilir. Birkaç dakika sonra tekrar deneyin.';
  }

  const p = d.enUcuz.product || {};
  const siteAdi = d.enUcuz.siteName || d.enUcuz.site || 'Mağaza';

  // Birim fiyat: yalnızca filament/reçinede (yazıcı/aksesuarda null).
  const birim = birimFiyatHesapla(p.title || baslik, d.fiyat);
  // Spec biçimi: "⚖️ Birim Fiyat: ₺350,00 / kg"
  const birimSatiri = birim
    ? `⚖️ <b>Birim Fiyat:</b> ${botPara(birim.birimFiyat)} / ${birim.birim === 'L' ? 'L' : 'kg'}`
      + (birim.tur === 'resin' && birim.kg != null ? ` <i>(≈ ${botPara(birim.kg)} / kg)</i>` : '')
      + `\n`
    // Filament/reçine olduğu hâlde başlıkta gramaj yoksa uydurmuyoruz; nedeni yazıyoruz.
    : (malzemeBul(p.title || baslik)
      ? '⚖️ <b>Birim Fiyat:</b> hesaplanamadı <i>(başlıkta gramaj/hacim yok)</i>\n'
      : '');

  // 💡 Gramaj tuzağı: en ucuz ETİKET fiyatı, en iyi BİRİM fiyat olmayabilir.
  // (500 g makara 220 TL = ₺440/kg, 2.5 kg makara 875 TL = ₺350/kg.)
  let birimIpucu = '';
  if (birim && birim.birim === 'kg') {
    let enIyiBirim = null;
    for (const r of d.sirali) {
      const b = birimFiyatHesapla(r.product?.title, karsilastirmaFiyati(r));
      if (!b || b.birim !== 'kg' || !(b.birimFiyat > 0)) continue;
      if (!enIyiBirim || b.birimFiyat < enIyiBirim.birimFiyat) {
        enIyiBirim = { ...b, siteName: r.siteName || r.site, site: r.site };
      }
    }
    if (enIyiBirim
      && enIyiBirim.site !== d.enUcuz.site
      && enIyiBirim.birimFiyat < birim.birimFiyat * 0.98) {
      const makara = enIyiBirim.gram ? `${enIyiBirim.gram >= 1000
        ? (enIyiBirim.gram / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' kg'
        : enIyiBirim.gram.toLocaleString('tr-TR') + ' g'} makara` : '';
      birimIpucu = `🧮 <b>En iyi birim fiyat:</b> ${esc(enIyiBirim.siteName)} — `
        + `${botPara(enIyiBirim.birimFiyat)} / kg${makara ? ` <i>(${esc(makara)})</i>` : ''}\n`;
    }
  }

  const stokSatiri = d.tamamiTukendi
    ? '⚠️ <b>Durum:</b> Tüm mağazalarda tükendi\n'
    : (d.bulunanSayisi > 0
      ? `📦 <b>Stok:</b> 🟢 ${d.stoktaSayisi} mağazada var`
        + `${d.bulunanSayisi - d.stoktaSayisi > 0 ? ` · 🔴 ${d.bulunanSayisi - d.stoktaSayisi} tükendi` : ''}\n`
      : '');

  // İlk 5 mağaza (stok hiyerarşisi + fiyat artan).
  const ilk = d.sirali.slice(0, 5);
  const satirlar = ilk.map((r, i) => {
    const ad = r.siteName || r.site || 'Mağaza';
    const fiyat = botPara(karsilastirmaFiyati(r));
    const kargo = kargoMetni(r);
    const rozet = siraEmoji(i);
    const tukendi = stoktaMi(r) ? '' : '🔴 Tükendi · ';
    return `${i + 1}. ${rozet ? rozet + ' ' : ''}${tukendi}<b>${esc(ad)}</b> — ${fiyat} <i>(${esc(kargo)})</i>`;
  }).join('\n');

  // Tasarruf farkı: en ucuz ↔ en pahalı (stokta olanlar arasında).
  const fark = (d.enPahaliFiyat != null && d.fiyat != null)
    ? Math.round((d.enPahaliFiyat - d.fiyat) * 100) / 100
    : 0;
  const farkSatiri = fark > 0.5
    ? `\n💡 En ucuz mağaza ile diğerleri arasında <b>${botPara(fark)}</b> tasarruf farkı var!`
    : '\n💡 Tüm mağazalarda fiyat aynı seviyede.';

  const toplamSite = o.bulunanSiteSayisi ?? d.bulunanSayisi;
  const swr = opts.yasNotu ? `\n⚡ <i>(Son kontrol: ${esc(opts.yasNotu)})</i>` : '';

  return `🏷️ <b>${esc(baslik)}</b>
${cizgi}
🏆 <b>En Ucuz:</b> ${botPara(d.fiyat)} (${esc(siteAdi)})
🚚 <b>Kargo:</b> ${esc(kargoMetni(d.enUcuz))}
${birimSatiri}${birimIpucu}${stokSatiri}${cizgi}
📊 <b>Mağaza Karşılaştırması (${toplamSite} Site):</b>
${satirlar}${farkSatiri}${swr}

🔗 <a href="https://t.me/${BOT_ADI.replace('@', '')}">${esc(BOT_ADI)}</a> · Gerçek Fiyat Takipçisi`;
}

/** Bento tarzı inline butonlar. */
export function butonlariOlustur(res, { takipHash = null, kaynakUrl = null } = {}) {
  const d = enUcuzTeklif(res);
  const satirlar = [];
  if (d.enUcuz) {
    const url = saticiLinki(d.enUcuz.site, hamUrl(d.enUcuz, kaynakUrl));
    if (url) {
      satirlar.push([{ text: `🛒 En Ucuz Mağazaya Git (${botPara(d.fiyat)})`, url }]);
    }
  }
  const ikinci = [];
  if (takipHash) {
    // 2026-11-02: kişisel alarm callback'i (`alarm:takip:<hash>`).
    // Eski mesajlardaki `takip_<hash>` biçimi de desteklenmeye devam eder.
    ikinci.push({ text: '🔔 Fiyatı Takibe Al', callback_data: `alarm:takip:${takipHash}` });
  }
  const detayUrl = kaynakUrl
    ? `${config.publicUrl}/?url=${encodeURIComponent(kaynakUrl)}`
    : `${config.publicUrl}/`;
  ikinci.push({ text: '🌐 Sitede Detaylı İncele', url: detayUrl });
  satirlar.push(ikinci);
  return { inline_keyboard: satirlar };
}

/* ------------------------------------------------------------------ */
/* Takip (callback)                                                    */
/* ------------------------------------------------------------------ */

/** Takip butonu için sonucu belleğe alır ve kısa bir hash döndürür. */
export function takipKaydiOlustur(res, kaynakUrl) {
  const hash = crypto.randomBytes(6).toString('hex');
  const d = enUcuzTeklif(res);
  const k = res?.kaynak || {};
  const p = d.enUcuz?.product || {};
  TAKIP_BEKLEYEN.set(hash, {
    ts: Date.now(),
    kaynakUrl,
    urun: baslikKisalt(k.urun || p.title || 'Ürün', 140),
    modelKodu: k.modelKodu || p.modelCode || null,
    renk: k.renk || p.color || null,
    image: k.resim || p.image || null,
    hedefFiyat: d.fiyat != null ? Math.round(d.fiyat * 100) / 100 : null,
    urunler: d.enUcuz ? [{ site: d.enUcuz.site, url: hamUrl(d.enUcuz, kaynakUrl) }] : [],
  });
  return hash;
}

/** Süresi geçmiş takip kayıtlarını temizler. */
function takipTemizle() {
  const esik = Date.now() - TAKIP_TTL_MS;
  for (const [h, v] of TAKIP_BEKLEYEN) if (v.ts < esik) TAKIP_BEKLEYEN.delete(h);
}

/**
 * `🔔 Fiyatı Takibe Al` butonu.
 * @returns {{mesaj:string, kayit?:object}}
 */
export function takipEt(hash, chatId = null) {
  takipTemizle();
  const kayit = TAKIP_BEKLEYEN.get(String(hash || ''));
  if (!kayit) {
    return {
      mesaj: '⏳ Bu sonuç artık geçerli değil (3 saatten eski). Lütfen ürünü yeniden aratın.',
    };
  }
  // Aynı butona ikinci kez basılırsa mükerrer takip kaydı oluşmasın.
  if (kayit.kullanildi) {
    return {
      mesaj: `✅ Bu ürün zaten takibe alınmış.\n\n🏷️ ${esc(kayit.urun)}\n`
        + 'Takiplerinizi /liste ile görebilirsiniz.',
    };
  }
  if (!Array.isArray(kayit.urunler) || !kayit.urunler.length) {
    return { mesaj: '⚠️ Ürünün mağaza adresi bulunamadı; takip oluşturulamadı.' };
  }
  const eklendi = addTracked({
    urun: kayit.urun,
    modelKodu: kayit.modelKodu,
    renk: kayit.renk,
    image: kayit.image,
    hedefFiyat: kayit.hedefFiyat,
    urunler: kayit.urunler,
    // Kişisel alarm: bildirim yalnızca bu sohbete gider.
    chatId,
  });
  kayit.kullanildi = true;
  kayit.takipId = eklendi?.id || null;
  return {
    mesaj: `🔔 "<b>${esc(kayit.urun)}</b>" için fiyat takip alarmınız kuruldu!\n\n`
      + `🎯 Mevcut en ucuz: <b>${kayit.hedefFiyat != null ? botPara(kayit.hedefFiyat) : '—'}</b>\n`
      + 'Fiyat bu seviyenin altına düştüğünde size özel mesaj gönderilecektir.\n'
      + 'Takipleriniz: /liste',
    kayit: eklendi,
  };
}

/* ------------------------------------------------------------------ */
/* Arama akışları                                                      */
/* ------------------------------------------------------------------ */

/** SWR kontrolü: son 2 saatte taranmışsa anında döner. */
function onbellektenAl(url) {
  try {
    const anlik = anlikAl(url, { maxYasMs: BOT_SWR_MS });
    if (!anlik?.payload) return null;
    return anlik;
  } catch { return null; }
}

/** Önbellek yaşını "15 dk" gibi kısa metne çevirir. */
export function kisaYasMetni(yasMs) {
  const dk = Math.max(0, Math.floor(Number(yasMs || 0) / 60000));
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  const kalan = dk % 60;
  return kalan ? `${sa} sa ${kalan} dk önce` : `${sa} sa önce`;
}

/**
 * Ortak sunum: swr varsa hemen, yoksa taze tarama.
 *
 * Taze tarama başarılıysa sonuç anlık önbelleğe YAZILIR (web ile aynı dürüstlük
 * kuralları: iptal edilmemiş, tüm siteler taranmış ve en az bir ürün bulunmuş).
 * Böylece bottan yapılan arama da sonraki aramalarda 0 saniyede yanıtlanır.
 *
 * @returns {Promise<{res:object, yasNotu:string|null}>}
 */
export async function sonucUret(url, { taze = false } = {}) {
  if (!taze) {
    const anlik = onbellektenAl(url);
    if (anlik) return { res: anlik.payload, yasNotu: kisaYasMetni(anlik.yasMs) };
  }
  const res = await runComparison(url);
  try {
    const iptal = res?.ozet?.iptalEdildi === true;
    const eksikTarama = Number(res?.ozet?.taranmayanSiteSayisi || 0) > 0;
    const bulunanVar = (res?.sonuclar || []).some(s => s.status === 'found' && s.product);
    if (!iptal && !eksikTarama && bulunanVar) anlikYaz(url, res);
  } catch { /* önbellek yazımı başarısız olsa da sonuç gösterilir */ }
  return { res, yasNotu: null };
}

/**
 * Ürün adıyla arama: kanonik URL bul → karşılaştır → zengin mesaj.
 */
async function metinAramasiYap(token, chatId, sorgu) {
  const temiz = sorgu.slice(0, 120);
  const initMsg = await sendTelegram(
    token, chatId,
    `🔍 "<b>${esc(baslikKisalt(temiz, 80))}</b>" için 61 mağaza taranıyor... ⏳`,
  );
  const msgId = initMsg?.result?.message_id;

  let bulunan = null;
  try {
    bulunan = await hizliKaynakUrunBul(temiz);
  } catch (e) {
    console.warn('[Telegram Bot] ürün arama hatası:', String(e?.message || e).slice(0, 140));
  }

  if (!bulunan?.url) {
    const mesaj = `🔍 "<b>${esc(baslikKisalt(temiz, 80))}</b>" için eşleşen ürün bulunamadı.\n\n`
      + 'Lütfen model adını biraz daha detaylandırın.\n'
      + '<i>Örn: "Bambu Lab P1S", "eSun PLA+ Siyah 1kg", "Creality K1 Max"</i>';
    if (msgId) await editTelegram(token, chatId, msgId, mesaj);
    else await sendTelegram(token, chatId, mesaj);
    return;
  }

  await sonucGonderVeBitir(token, chatId, msgId, bulunan.url, {
    onBilgi: async () => {
      const satir = `🔍 "<b>${esc(baslikKisalt(temiz, 60))}</b>" → <b>${esc(baslikKisalt(bulunan.title, 70))}</b>\n`
        + '🚀 61 mağazada fiyatlar karşılaştırılıyor... ⏳';
      if (msgId) await editTelegram(token, chatId, msgId, satir).catch(() => {});
    },
  });
}

/**
 * URL ile arama: mevcut akış + SWR + zengin mesaj.
 */
async function linkAramasiYap(token, chatId, targetUrl, detected) {
  const initMsg = await sendTelegram(
    token, chatId,
    `🔍 <b>${esc(detected?.name || 'Mağaza')} ürünü algılandı!</b>\n\n`
    + '🚀 Türkiye\'deki 61 sitede fiyatlar taranıyor, lütfen birkaç saniye bekleyin... ⏳',
  );
  await sonucGonderVeBitir(token, chatId, initMsg?.result?.message_id, targetUrl, {
    detected,
  });
}

/** Sonucu biçimlendirip gönderir; hata olursa dürüst mesaj. */
async function sonucGonderVeBitir(token, chatId, msgId, url, opts = {}) {
  if (opts.onBilgi) { try { await opts.onBilgi(); } catch { /* yoksay */ } }
  try {
    const { res, yasNotu } = await sonucUret(url);
    if (!res?.kaynak && !res?.sonuclar) {
      throw new Error('Sonuç alınamadı');
    }
    const metin = sonucMesajiOlustur(res, { yasNotu });
    const hash = takipKaydiOlustur(res, url);
    const butonlar = butonlariOlustur(res, { takipHash: hash, kaynakUrl: url });

    if (msgId) {
      await editTelegram(token, chatId, msgId, metin, { extra: { reply_markup: butonlar } })
        .catch(() => sendTelegram(token, chatId, metin, { extra: { reply_markup: butonlar } }));
    } else {
      await sendTelegram(token, chatId, metin, { extra: { reply_markup: butonlar } });
    }
  } catch (err) {
    const mesaj = `❌ <b>Karşılaştırma sırasında bir sorun oluştu:</b>\n${esc(String(err?.message || 'Ürün bilgileri alınamadı.').slice(0, 300))}`;
    if (msgId) await editTelegram(token, chatId, msgId, mesaj).catch(() => {});
    else await sendTelegram(token, chatId, mesaj).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Komutlar                                                            */
/* ------------------------------------------------------------------ */

const YARDIM_METNI = `🏷️ <b>En Ucuz Nerede? — Fiyat Asistanı</b>

<b>İki şekilde arama yapabilirsiniz:</b>
1) 🔗 <b>Ürün linki</b> gönderin — 61 mağazada aynı ürünü arar.
2) 💬 <b>Ürün adı</b> yazın — ör. <i>Bambu Lab P1S</i>, <i>eSun PLA+</i>, <i>iPhone 15</i>

<b>Komutlar:</b>
• /liste — aktif fiyat alarmlarınız
• /yardim — bu mesaj

<b>🎯 Otonom Fiyat Radarı</b>
• /radar — durum özeti + stoktaki en ucuzlar
• /radar_liste — takip kataloğu (ID + kategori)
• /radar_tara — 61 mağazada hemen tara <i>(yönetici)</i>
• /radar_ekle &lt;ürün adı&gt; — kataloğa ekle <i>(yönetici)</i>
• /radar_sil &lt;ID | ürün adı&gt; — katalogdan çıkar <i>(yönetici)</i>

Sonuç mesajındaki butonlarla mağazaya gidebilir, <b>🔔 tek tıkla kişisel fiyat alarmı</b> kurabilirsiniz.

<b>🔎 Inline mode</b>
Herhangi bir sohbette <code>@erdal_fiyat_takip_bot ürün adı</code> yazın:
en ucuz 3 canlı teklif klavyenin üstünde açılır, tek dokunuşla paylaşılır.`;

function takipListesiMetni(chatId) {
  const hepsi = getTracked();
  const yonetici = yoneticiMi(chatId);
  // Genel kullanıcı YALNIZCA kendi alarmlarını görür; yönetici tümünü görür
  // (chatId'siz eski kayıtlar da yöneticiye aittir).
  const list = yonetici
    ? hepsi
    : hepsi.filter(t => t.chatId && String(t.chatId) === String(chatId));

  if (!list?.length) {
    return yonetici
      ? '📭 Henüz takibe aldığınız ürün yok.\n\n'
        + 'Bir ürün aradıktan sonra <b>🔔 Fiyatı Takibe Al</b> butonuna basmanız yeterli.'
      : '📭 Bu sohbette kayıtlı fiyat alarmınız yok.\n\n'
        + 'Bir ürün aradıktan sonra <b>🔔 Fiyatı Takibe Al</b> butonuna basın.';
  }
  const satirlar = list.slice(0, 12).map((t, i) => {
    const ad = baslikKisalt(t.urun || 'Ürün', 55);
    const hedef = t.hedefFiyat ? botPara(t.hedefFiyat) : '—';
    const son = Array.isArray(t.sonFiyatlar) && t.sonFiyatlar.length
      ? t.sonFiyatlar.find(x => Number.isFinite(Number(x.fiyat)))
      : null;
    const sonFiyat = son ? botPara(son.fiyat) : '—';
    const dot = Number.isFinite(Number(t.hedefFiyat)) && son && Number(son.fiyat) <= Number(t.hedefFiyat)
      ? '🟢' : '⚪';
    const sahip = yonetici && t.chatId ? ` · 👤 ${esc(t.chatId)}` : '';
    return `${dot} ${i + 1}. <b>${esc(ad)}</b>${sahip}\n     🎯 ${hedef} · Son: ${sonFiyat}`;
  });
  const kalan = list.length > 12 ? `\n\n<i>… ve ${list.length - 12} takip daha</i>` : '';
  return `🔔 <b>Aktif Fiyat Takipleriniz (${list.length}):</b>\n\n${satirlar.join('\n')}${kalan}`;
}

/* ------------------------------------------------------------------ */
/* Dağıtıcılar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Gelen metin mesajını işler. Export: testler doğrudan çağırabilsin.
 */
export async function handleMessage(token, msg) {
  const chatId = msg?.chat?.id;
  const text = String(msg?.text || '').trim();
  if (!chatId || !text) return;

  // ---- Komutlar (2026-11-02: radar yönetimi + kişisel alarmlar) ----
  const komut = komutAyikla(text);
  if (komut) {
    if (komut.komut === '/start' || komut.komut === '/yardim' || komut.komut === '/help') {
      // 📎 Inline/deep-link: `/start ara_<base64>` → ürünü hemen ara.
      const yuk = String(komut.args || '');
      if (yuk.startsWith('ara_')) {
        const metin = startPayloadCoz(yuk.slice(4));
        if (metin.length >= 2) {
          const durum = await kuyrugaAl(chatId, () => metinAramasiYap(token, chatId, metin));
          if (durum === 'dolu') {
            await sendTelegram(token, chatId,
              '⏳ Çok fazla arama sırada. Lütfen mevcut aramaların bitmesini bekleyin.');
          } else if (durum === 'kuyrukta') {
            await sendTelegram(token, chatId, '⏳ Önceki aramanız sürüyor; isteğiniz sıraya alındı.');
          }
          return;
        }
      }
      await sendTelegram(token, chatId, YARDIM_METNI);
      return;
    }
    if (komut.komut === '/takipler' || komut.komut === '/liste') {
      await sendTelegram(token, chatId, takipListesiMetni(chatId));
      return;
    }
    if (komut.komut === '/radar' || komut.komut === '/radar_durum') {
      const m = await radarDurumMesaji();
      await sendTelegram(token, chatId, m.metin, { extra: { reply_markup: m.butonlar } });
      return;
    }
    if (komut.komut === '/radar_liste') {
      await sendTelegram(token, chatId, await radarListeMesaji());
      return;
    }
    if (komut.komut === '/radar_tara' || komut.komut === '/radar_ekle' || komut.komut === '/radar_sil') {
      if (!yoneticiMi(chatId)) {
        await sendTelegram(token, chatId, YONETICI_UYARISI);
        return;
      }
      if (komut.komut === '/radar_tara') {
        await sendTelegram(token, chatId, await radarTaramaBaslatMesaji());
      } else if (komut.komut === '/radar_ekle') {
        await sendTelegram(token, chatId, await radarEkleMesaji(komut.args));
      } else {
        await sendTelegram(token, chatId, await radarSilMesaji(komut.args));
      }
      return;
    }
    if (komut.komut.startsWith('/radar')) {
      await sendTelegram(token, chatId,
        '❓ Bilinmeyen radar komutu. Komutlar için /yardim yazın.');
      return;
    }
  }

  // ---- URL mi, ürün adı mı? ----
  const kaynak = kaynakBul(text);

  if (kaynak.tur === 'link') {
    await linkAramasiYap(token, chatId, kaynak.url, kaynak.site);
    return;
  }

  if (kaynak.tur === 'gecersiz-link') {
    await sendTelegram(token, chatId,
      '⚠️ Bu bağlantı desteklenen mağazalar arasında değil.\n\n'
      + 'Bir <b>ürün adı</b> yazarsanız 61 mağazada kendim ararım.\n'
      + '<i>Örn: "Bambu Lab P1S"</i>');
    return;
  }

  if (kaynak.tur !== 'metin') return;

  // Çok kısa anlamsız girdiler
  if (kaynak.metin.length < 2) {
    await sendTelegram(token, chatId, '💡 Aramak için bir ürün adı yazın ya da ürün linki gönderin.');
    return;
  }
  if (kaynak.metin.length > 140) {
    await sendTelegram(token, chatId, '⚠️ Ürün adı çok uzun. Lütfen model adını kısaltın (en fazla 140 karakter).');
    return;
  }

  // ---- Sıraya al (spam koruması) ----
  const durum = await kuyrugaAl(chatId, () => metinAramasiYap(token, chatId, kaynak.metin));
  if (durum === 'dolu') {
    await sendTelegram(token, chatId,
      '⏳ Çok fazla arama sırada. Lütfen mevcut aramaların bitmesini bekleyin.');
  } else if (durum === 'kuyrukta') {
    await sendTelegram(token, chatId, '⏳ Önceki aramanız sürüyor; isteğiniz sıraya alındı.');
  }
}

/**
 * Metni sınıflandırır: link / desteklenmeyen link / düz ürün adı.
 * Export: testler için.
 */
export function kaynakBul(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+/i);
  if (m) {
    const site = detectSite(m[0]);
    return site
      ? { tur: 'link', url: m[0], site }
      : { tur: 'gecersiz-link', url: m[0] };
  }
  return { tur: 'metin', metin: String(text || '').trim() };
}

/** Inline buton tıklamalarını işler. */
export async function handleCallbackQuery(token, cb) {
  const chatId = cb?.message?.chat?.id;
  const data = String(cb?.data || '');
  const cbId = cb?.id;

  if (!chatId) return;

  // 🔔 Kişisel alarm: `alarm:takip:<hash>` (arama sonucu) veya
  //    `alarm:takip:radar:<katalogId>` (radar kartı).
  if (data.startsWith('alarm:takip:')) {
    const kalan = data.slice('alarm:takip:'.length);
    if (kalan.startsWith('radar:')) {
      const sonuc = await radarAlarmKur(chatId, Number(kalan.slice('radar:'.length)));
      await answerCallback(token, cbId,
        sonuc.ok ? 'Fiyat alarmı kuruldu 🔔' : 'Alarm kurulamadı', !sonuc.ok);
      await sendTelegram(token, chatId, sonuc.mesaj).catch(() => {});
    } else {
      const sonuc = takipEt(kalan, chatId);
      await answerCallback(token, cbId,
        sonuc.kayit ? 'Fiyat alarmı kuruldu 🔔' : 'Alarm kurulamadı', !sonuc.kayit);
      await sendTelegram(token, chatId, sonuc.mesaj).catch(() => {});
    }
    return;
  }

  // Eski mesajlardaki `takip_<hash>` biçimi de çalışmaya devam eder.
  if (data.startsWith('takip_')) {
    const hash = data.slice('takip_'.length);
    const sonuc = takipEt(hash, chatId);
    await answerCallback(token, cbId, sonuc.kayit ? 'Takibe alındı ✅' : 'Takip oluşturulamadı', !sonuc.kayit);
    await sendTelegram(token, chatId, sonuc.mesaj).catch(() => {});
    return;
  }

  // 🧪 /radar kartındaki "Şimdi Taramayı Başlat" butonu (yönetici).
  if (data === 'radar_tara') {
    if (!yoneticiMi(chatId)) {
      await answerCallback(token, cbId, YONETICI_UYARISI, true);
      return;
    }
    await answerCallback(token, cbId, 'Tarama başlatılıyor…');
    await sendTelegram(token, chatId, await radarTaramaBaslatMesaji()).catch(() => {});
    return;
  }

  await answerCallback(token, cbId, 'Bilinmeyen işlem');
}

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

/**
 * Botu başlatır. Token yoksa ÇÖKMEZ; sessizce uyarıp bekler.
 * Token geçersizse (401/404) polling durur ve log basılır.
 */
export async function startTelegramBot() {
  if (isPolling) return;
  isPolling = true;
  stopRequested = false;
  gecersizToken = false;

  console.log('[Telegram Bot] İnteraktif asistan dinleyici başlatılıyor...');

  while (!stopRequested) {
    let settings;
    try { settings = getSettings(); } catch { settings = null; }

    const token = settings?.telegram?.botToken;
    const enabled = settings?.telegram?.enabled;

    if (!enabled || !token) {
      if (!tokenUyarisiVerildi) {
        console.warn('[Telegram Bot] Token tanımlı değil ya da bot kapalı — polling bekletiliyor. '
          + 'Ayarlar sayfasından token girip botu etkinleştirin.');
        tokenUyarisiVerildi = true;
      }
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }
    tokenUyarisiVerildi = false;

    if (gecersizToken) {
      console.warn('[Telegram Bot] Token geçersiz — polling durduruldu. '
        + 'Ayarlar sayfasında tokenı güncelleyip sunucuyu yeniden başlatın.');
      break;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates`
        + `?offset=${lastUpdateId + 1}&timeout=20&allowed_updates=${encodeURIComponent('["message","callback_query","inline_query"]')}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(35000) });

      // Geçersiz token: 401/404 → kalıcı hata, döngüyü bitir.
      if (res.status === 401 || res.status === 404) {
        gecersizToken = true;
        continue;
      }
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      const data = await res.json();
      if (data?.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          if (update.message) {
            handleMessage(token, update.message).catch(err => {
              console.error('[Telegram Bot] Mesaj işleme hatası:', String(err?.message || err).slice(0, 200));
            });
          } else if (update.callback_query) {
            handleCallbackQuery(token, update.callback_query).catch(err => {
              console.error('[Telegram Bot] Callback hatası:', String(err?.message || err).slice(0, 200));
            });
          } else if (update.inline_query) {
            handleInlineQuery(token, update.inline_query).catch(err => {
              console.error('[Telegram Bot] Inline hatası:', String(err?.message || err).slice(0, 200));
            });
          }
        }
      }
    } catch (e) {
      // Ağ kesintisi / zaman aşımı: sessizce bekle.
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  isPolling = false;
  console.log('[Telegram Bot] Dinleyici durduruldu.');
}

export function stopTelegramBot() {
  stopRequested = true;
}

/** Test/teşhis: bekleyen takip sayısı. */
export function bekleyenTakipSayisi() {
  takipTemizle();
  return TAKIP_BEKLEYEN.size;
}
