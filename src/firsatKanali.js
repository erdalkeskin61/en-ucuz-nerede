/**
 * 📢 Otonom Fırsat Kanalı (2026-10-30)
 *
 * Amaç: gerçek taramalarda ortaya çıkan "günün fırsatı" ürünlerini Telegram
 * kanalına otomatik paylaşmak. Fiyat/indirim bilgisi YALNIZCA gerçek tarama
 * çıktısından ve kayıtlı fiyat geçmişinden üretilir; uydurma referans fiyat yoktur.
 *
 * DÜRÜSTLÜK KURALLARI:
 *  - İndirim oranı, gerçek 30 günlük ortalamaya (yeterli veri varsa) ya da
 *    mağazanın kendi liste fiyatına göre hesaplanır. İkisi de yoksa ürün aday olmaz.
 *  - Liste fiyatı "şişirilmiş" işaretliyse referans olarak KULLANILMAZ.
 *  - Stokta olmayan ürün, farklı renk eşleşmesi ve eksik tarama paylaşılmaz.
 *  - Aynı ürün cooldown süresi içinde tekrar gönderilmez; günlük üst sınır aşılmaz.
 *  - Gönderim hatası sessizce yutulmaz; kayda `hata` olarak yazılır.
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { getSettings, getTracked } from './store.js';
import { runComparison } from './pipeline.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { formatTL } from './util.js';
import { anahtarCikar } from './anlikOnbellek.js';

/** Ayarlar panelindeki varsayılanlar (kullanıcı değiştirebilir). */
export const FIRSAT_VARSAYILAN = Object.freeze({
  enabled: false,
  kanal: '',
  minIndirim: 15,      // %
  gunlukMax: 12,       // adet/gün
  saatAraligi: 2,      // saat
  cooldownSaat: 48,    // aynı ürün için sessizlik
  maxTarama: 3,        // döngü başına tazelenecek takip ürünü
  donguBasina: 2,      // döngü başına en fazla paylaşım
});

const DB_YOLU = path.join(config.dataDir, 'en_ucuz_nerede.db');
let db = null;
let zamanlayici = null;
let calisiyor = false;
let sonCalisma = null;
let sonRapor = null;

/** Testlerde ve sunucu kapanışında SQLite tutamacını kapatır. */
export function firsatKapat() {
  try { db?.close(); } catch { /* zaten kapalı */ }
  db = null;
}

function veritabani() {
  if (db) return db;
  db = new DatabaseSync(DB_YOLU);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS firsat_gonderim (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      anahtar   TEXT NOT NULL,
      urun      TEXT,
      site      TEXT,
      fiyat     REAL,
      referans  REAL,
      indirim   REAL,
      ts        INTEGER NOT NULL,
      durum     TEXT NOT NULL,
      mesaj_id  TEXT,
      hata      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_firsat_ts ON firsat_gonderim(ts);
    CREATE INDEX IF NOT EXISTS idx_firsat_anahtar ON firsat_gonderim(anahtar, ts);
  `);
  return db;
}

/** Kayıtlı ayarları varsayılanlarla birleştirip sayısal alanları doğrular. */
export function firsatAyar(ayar = null) {
  const kaynak = ayar || getSettings().firsat || {};
  const sayi = (v, varsayilan, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return varsayilan;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: kaynak.enabled === true,
    kanal: String(kaynak.kanal || '').trim(),
    minIndirim: sayi(kaynak.minIndirim, FIRSAT_VARSAYILAN.minIndirim, 1, 95),
    gunlukMax: Math.round(sayi(kaynak.gunlukMax, FIRSAT_VARSAYILAN.gunlukMax, 1, 100)),
    saatAraligi: sayi(kaynak.saatAraligi, FIRSAT_VARSAYILAN.saatAraligi, 0.5, 24),
    cooldownSaat: sayi(kaynak.cooldownSaat, FIRSAT_VARSAYILAN.cooldownSaat, 0, 24 * 30),
    maxTarama: Math.round(sayi(kaynak.maxTarama, FIRSAT_VARSAYILAN.maxTarama, 0, 20)),
    donguBasina: Math.round(sayi(kaynak.donguBasina, FIRSAT_VARSAYILAN.donguBasina, 1, 10)),
  };
}

/** HTML kaçışı (Telegram parse_mode=HTML). */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** "17.000,00 TL" (formatTL ile aynı biçim). */
function para(n) {
  return formatTL(n);
}

/**
 * Bir karşılaştırma sonucundan fırsat adayı üretir.
 *
 * @param {object} sonuc runComparison çıktısı
 * @param {{minIndirim?:number}} [opts]
 * @returns {{uygun:true, ...}|{uygun:false, neden:string}}
 */
export function firsatAdayiBul(sonuc, opts = {}) {
  const o = sonuc?.ozet || {};
  if (!sonuc || !sonuc.kaynak || !Array.isArray(sonuc.sonuclar)) {
    return { uygun: false, neden: 'geçersiz sonuç' };
  }
  if (o.iptalEdildi || o.taranmayanSiteSayisi > 0) {
    return { uygun: false, neden: 'tarama tamamlanmadı' };
  }
  if (o.tamamiTukendi) return { uygun: false, neden: 'tüm mağazalarda tükendi' };

  const fiyat = Number(o.enUcuzFiyat);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return { uygun: false, neden: 'en ucuz fiyat yok' };

  const adaylar = (sonuc.sonuclar || []).filter(r =>
    r.status === 'found' && r.product && r.renkAyni !== false
    && r.product.inStock !== false
    && Number.isFinite(Number(r.product.pricing?.toplam ?? r.product.sellingPrice)));
  if (!adaylar.length) return { uygun: false, neden: 'stokta aynı ürün yok' };

  const secili = adaylar.reduce((en, r) => {
    const p = Number(r.product.pricing?.toplam ?? r.product.sellingPrice);
    const ep = Number(en.product.pricing?.toplam ?? en.product.sellingPrice);
    return p < ep ? r : en;
  }, adaylar[0]);
  const urunFiyat = Number(secili.product.pricing?.toplam ?? secili.product.sellingPrice);
  // Özet ile kart arasında tutarsızlık varsa kart fiyatı esastır (gerçek fiyat).
  if (!Number.isFinite(urunFiyat) || urunFiyat <= 0) return { uygun: false, neden: 'fiyat okunamadı' };

  const fz = o.fiyatZekasi || null;
  const fa = o.fiyatAnalizi || fz || null;

  // ---- Referans (eski/ortalama) fiyat: yalnızca GERÇEK veriler ----
  let referans = null;
  let referansKaynagi = null;
  const ortalama = Number(fa?.ortFiyat);
  const ortalamaGuvenilir = fa?.yeterliVeri === true && Number.isFinite(ortalama) && ortalama > 0;
  if (ortalamaGuvenilir && ortalama > urunFiyat) {
    referans = ortalama;
    referansKaynagi = `son ${fa.ortPencereGun || 30} gün ortalaması`;
  }
  // DİKKAT: `fz.etiket` bir FİYAT DEĞİL, "🌟 Dip fiyat" gibi bir ETİKET METNİDİR.
  // Fiyat olarak `fz.etiketteGosterilen` / `pricing.etiket` / `listPrice` kullanılır.
  const etiket = Number(
    fz?.etiketteGosterilen ?? secili.product.pricing?.etiket ?? secili.product.listPrice,
  );
  if (!referans && fz?.etiketSisirilmis !== true
    && Number.isFinite(etiket) && etiket > urunFiyat) {
    referans = etiket;
    referansKaynagi = 'mağaza liste fiyatı';
  }
  if (!referans) {
    return { uygun: false, neden: 'güvenilir referans fiyat yok (uydurma indirim yapılmaz)' };
  }

  const indirim = Math.round((referans - urunFiyat) / referans * 1000) / 10;
  const minIndirim = Number.isFinite(Number(opts.minIndirim))
    ? Number(opts.minIndirim) : firsatAyar().minIndirim;
  if (indirim < minIndirim) {
    return { uygun: false, neden: `indirim %${indirim} < eşik %${minIndirim}`, indirim };
  }

  const kargo = secili.product.pricing?.kargo || {};
  let kargoMetni = 'Sepette netleşir';
  if (secili.kargoBedava || kargo.ucret === 0 || kargo.uygulanir === false
    || /ücretsiz|bedava/i.test(String(kargo.aciklama || ''))
    || /ücretsiz|bedava/i.test(String(secili.product.shipping || ''))) {
    kargoMetni = 'Ücretsiz Kargo';
  } else if (Number.isFinite(Number(kargo.ucret)) && Number(kargo.ucret) > 0) {
    kargoMetni = `${para(kargo.ucret)} Kargo`;
  }

  const urun = String(sonuc.kaynak.urun || secili.product.title || 'Ürün');
  const durumMetni = fz?.durum === 'dip_fiyat'
    ? '🌟 Son 90 günün en düşük fiyatında!'
    : `🌟 ${referansKaynagi} %${indirim} altında`;

  // Ürün kimliği: model kodu → barkod → kanonik URL → başlık.
  const urunId = String(
    sonuc.kaynak.modelKodu || sonuc.kaynak.barkod
    || anahtarCikar(sonuc.kaynak.url) || urun.toLowerCase(),
  );

  const hamUrl = secili.product.url || sonuc.kaynak.url;
  const link = secili.product.afiliyeUrl
    || afiliyeLink(secili.site, hamUrl, afiliyeAyarlari())
    || hamUrl;

  return {
    uygun: true,
    anahtar: urunId,
    urun,
    site: secili.siteName || secili.site,
    siteId: secili.site,
    fiyat: urunFiyat,
    referans,
    referansKaynagi,
    indirim,
    fark: Math.round((referans - urunFiyat) * 100) / 100,
    kargo: kargoMetni,
    durum: durumMetni,
    image: secili.product.image || sonuc.kaynak.resim || null,
    url: link,
    hamUrl,
    ozet: {
      enUcuzSite: o.enUcuzSite || null,
      enUcuzFiyat: o.enUcuzFiyat ?? null,
      bulunanSiteSayisi: o.bulunanSiteSayisi ?? null,
    },
  };
}

/** Telegram gönderim isteğini hazırlar (görsel varsa sendPhoto). */
export function telegramIstegiOlustur(firsat, opts = {}) {
  const metin = opts.metin || firsatMesajiOlustur(firsat);
  const chatId = opts.chatId || firsatAyar().kanal;
  if (firsat?.image) {
    return {
      yontem: 'sendPhoto',
      body: {
        chat_id: chatId,
        photo: firsat.image,
        // Telegram caption üst sınırı 1024 karakter.
        caption: metin.length > 1020 ? metin.slice(0, 1020) + '…' : metin,
        parse_mode: 'HTML',
      },
    };
  }
  return {
    yontem: 'sendMessage',
    body: {
      chat_id: chatId,
      text: metin,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    },
  };
}

/** Fırsat mesajını istenen şablonda üretir. */
export function firsatMesajiOlustur(f) {
  const baslik = esc(f.urun);
  const site = esc(f.site);
  const satirlar = [
    `🔥 <b>GÜNÜN FIRSATI: ${baslik}</b>`,
    `🏪 Mağaza: ${site} (En Ucuz)`,
    `💰 Fiyat: <s>${para(f.referans)}</s> ➔ <b>${para(f.fiyat)}</b>`,
    `📉 İndirim: %${String(f.indirim).replace('.', ',')} Tasarruf (-${para(f.fark)})`,
    `📦 Kargo: ${esc(f.kargo)}`,
    `🏷️ Durum: ${esc(f.durum)}`,
    '👉 Fırsatı İncele ve Satın Al:',
    esc(f.url),
    '🏷️ @EnUcuzNerede | Gerçek Fiyat Takipçisi',
  ];
  return satirlar.join('\n');
}

/** Yerel gün başlangıcı (günlük sayaç için). */
function gunBasi(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Spam filtresi: cooldown + günlük üst sınır.
 * @returns {{uygun:boolean, neden?:string, son?:object, bugun?:number}}
 */
export function spamKontrolu(firsat, opts = {}) {
  const ayar = firsatAyar(opts.ayar);
  const simdi = Number.isFinite(opts.simdi) ? opts.simdi : Date.now();
  const store = veritabani();
  if (opts.test === true) return { uygun: true, test: true };

  const bugun = Number(store.prepare(
    "SELECT COUNT(*) adet FROM firsat_gonderim WHERE durum = 'gonderildi' AND ts >= ?",
  ).get(gunBasi(simdi))?.adet || 0);
  if (bugun >= ayar.gunlukMax) {
    return { uygun: false, neden: `günlük sınır (${ayar.gunlukMax}) doldu`, bugun };
  }

  if (ayar.cooldownSaat > 0) {
    const son = store.prepare(`
      SELECT ts, fiyat, indirim FROM firsat_gonderim
      WHERE anahtar = ? AND durum = 'gonderildi'
      ORDER BY ts DESC LIMIT 1
    `).get(firsat.anahtar);
    if (son) {
      const gecenMs = simdi - Number(son.ts);
      if (gecenMs < ayar.cooldownSaat * 3600 * 1000) {
        return {
          uygun: false,
          neden: `cooldown (${ayar.cooldownSaat} sa içinde paylaşıldı)`,
          son: { ts: Number(son.ts), fiyat: son.fiyat, indirim: son.indirim },
          bugun,
        };
      }
    }
  }
  return { uygun: true, bugun, son: null };
}

/** Gönderim sonucunu kaydeder. */
export function firsatKaydet(firsat, durum, { mesajId = null, hata = null, ts = Date.now() } = {}) {
  try {
    veritabani().prepare(`
      INSERT INTO firsat_gonderim
        (anahtar, urun, site, fiyat, referans, indirim, ts, durum, mesaj_id, hata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      firsat.anahtar, firsat.urun, firsat.site, firsat.fiyat, firsat.referans,
      firsat.indirim, ts, durum, mesajId != null ? String(mesajId) : null, hata,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Telegram'a fırsat gönderir.
 * @param {object} firsat
 * @param {{botToken?:string, chatId?:string, kuru?:boolean, metin?:string}} [opts]
 */
export async function telegramFirsatGonder(firsat, opts = {}) {
  const s = getSettings();
  const ayar = firsatAyar(s);
  const token = opts.botToken || s.telegram?.botToken;
  const chatId = opts.chatId || ayar.kanal;
  const kuru = opts.kuru === true;
  if (!kuru) {
    if (!token) throw new Error('Telegram Bot Token tanımlı değil (Ayarlar → Bildirim Kanalları).');
    if (!chatId) throw new Error('Fırsat kanalı kimliği tanımlı değil (Ayarlar → Otonom Fırsat Kanalı).');
  }

  // Kuru çalışma (test/mock): ağ isteği atılmaz, istek gövdesi döndürülür.
  const istek = telegramIstegiOlustur(firsat, { chatId: chatId || 'mock-kanal', metin: opts.metin });
  if (kuru) {
    return { ok: true, mock: true, yontem: istek.yontem, istek };
  }

  const url = `https://api.telegram.org/bot${token}/${istek.yontem}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(istek.body),
    signal: AbortSignal.timeout(20000),
  });
  const veri = await res.json().catch(() => ({}));

  // Görsel gönderilemezse (bozuk URL vb.) metin olarak düş — içerik kaybolmasın.
  if (!res.ok && istek.yontem === 'sendPhoto') {
    const metinIstek = telegramIstegiOlustur({ ...firsat, image: null }, { chatId, metin: opts.metin });
    const res2 = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metinIstek.body),
      signal: AbortSignal.timeout(20000),
    });
    const veri2 = await res2.json().catch(() => ({}));
    if (!res2.ok || veri2.ok === false) {
      throw new Error('Telegram API hatası: ' + String(veri2.description || veri.description || res2.status).slice(0, 160));
    }
    return { ok: true, yontem: 'sendMessage', yedek: true, messageId: veri2.result?.message_id ?? null };
  }

  if (!res.ok || veri.ok === false) {
    const desc = String(veri.description || res.status);
    let ipucu = '';
    if (desc.toLowerCase().includes('chat not found')) {
      ipucu = ' ? Bot kanala eklenmemi? veya Y?netici (Admin) yetkisi verilmemi?. L?tfen Telegram kanal?n?zda Y?netici Ekle > botunuzu (@erdal_fiyat_takip_bot) se?ip "Mesaj G?nderme" yetkisi verin.';
    }
    throw new Error('Telegram API hatas?: ' + desc + ipucu);
  }
  return { ok: true, yontem: istek.yontem, messageId: veri.result?.message_id ?? null };
}

/** Son TTL içindeki gerçek snapshot'lardan aday sonuçlar (ücretsiz, ağ isteği yok). */
function snapshotSonuclari(limit = 30) {
  try {
    const esik = Date.now() - Math.max(config.snapshotTtlMs, 6 * 3600 * 1000);
    const rows = veritabani().prepare(`
      SELECT anahtar, ts, payload FROM snapshot
      WHERE ts >= ? ORDER BY ts DESC LIMIT ?
    `).all(esik, limit);
    const cikti = [];
    for (const r of rows) {
      try {
        const payload = JSON.parse(r.payload);
        if (payload?.kaynak && Array.isArray(payload.sonuclar)) {
          cikti.push({ anahtar: r.anahtar, ts: Number(r.ts), sonuc: payload });
        }
      } catch { /* bozuk kayıt atlanır */ }
    }
    return cikti;
  } catch {
    return [];
  }
}

/**
 * Adayları toplar: önce son gerçek snapshot'lar, gerekirse takip ürünlerini tazeler.
 * @param {{taze?:boolean, maxTarama?:number, simdi?:number}} opts
 */
export async function firsatAdaylariniTopla(opts = {}) {
  const ayar = firsatAyar();
  const adaylar = snapshotSonuclari();
  const gorulen = new Set(adaylar.map(a => a.anahtar));

  const taze = opts.taze === true;
  const limit = Number.isFinite(Number(opts.maxTarama))
    ? Number(opts.maxTarama) : ayar.maxTarama;
  if (taze && limit > 0) {
    const takipler = getTracked() || [];
    // En eski kontrol edilenler önce (adil döngü).
    const sirali = [...takipler].sort((a, b) =>
      new Date(a.sonKontrol || 0) - new Date(b.sonKontrol || 0));
    for (const t of sirali.slice(0, limit)) {
      const url = Array.isArray(t.urunler) && t.urunler.length ? t.urunler[0] : null;
      if (!url) continue;
      const anahtar = anahtarCikar(url);
      if (!anahtar || gorulen.has(anahtar)) continue;
      try {
        const sonuc = await runComparison(url);
        gorulen.add(anahtar);
        adaylar.push({ anahtar, ts: Date.now(), sonuc });
      } catch (e) {
        adaylar.push({ anahtar, ts: Date.now(), hata: String(e.message || e) });
      }
    }
  }
  return adaylar;
}

/**
 * Fırsatları değerlendirir ve (istenirse) kanala gönderir.
 *
 * @param {{taze?:boolean, gonder?:boolean, kuru?:boolean, simdi?:number, maxTarama?:number,
 *          test?:boolean, kanal?:string, botToken?:string}} [opts]
 */
export async function firsatlariTara(opts = {}) {
  if (calisiyor) return { atlandi: true, neden: 'tarama zaten çalışıyor' };
  calisiyor = true;
  const basladi = Date.now();
  try {
    const ayar = firsatAyar();
    const gonder = opts.gonder !== false;
    if (!ayar.enabled && opts.zorla !== true) {
      return { atlandi: true, neden: 'fırsat kanalı kapalı', ayar };
    }
    const adaylar = await firsatAdaylariniTopla(opts);
    const uygunlar = [];
    const reddedilen = [];
    for (const aday of adaylar) {
      if (aday.hata) { reddedilen.push({ anahtar: aday.anahtar, neden: 'tarama hatası: ' + aday.hata.slice(0, 80) }); continue; }
      const f = firsatAdayiBul(aday.sonuc, { minIndirim: ayar.minIndirim });
      if (!f.uygun) { reddedilen.push({ anahtar: aday.anahtar, neden: f.neden }); continue; }
      uygunlar.push(f);
    }
    // En yüksek indirim önce; eşitlikte daha ucuz ürün.
    uygunlar.sort((a, b) => b.indirim - a.indirim || a.fiyat - b.fiyat);

    const gonderimler = [];
    if (gonder) {
      const hedef = Math.min(uygunlar.length, ayar.donguBasina);
      for (const f of uygunlar.slice(0, hedef)) {
        const spam = spamKontrolu(f, { ayar, simdi: opts.simdi, test: opts.test });
        if (!spam.uygun) { gonderimler.push({ anahtar: f.anahtar, durum: 'atlandi', neden: spam.neden }); continue; }
        try {
          const r = await telegramFirsatGonder(f, {
            kuru: opts.kuru || opts.test,
            chatId: opts.kanal,
            botToken: opts.botToken,
          });
          firsatKaydet(f, 'gonderildi', { mesajId: r.messageId, ts: opts.simdi });
          gonderimler.push({ anahtar: f.anahtar, urun: f.urun, durum: 'gonderildi', yontem: r.yontem, indirim: f.indirim, fiyat: f.fiyat });
        } catch (e) {
          const hata = String(e.message || e);
          firsatKaydet(f, 'hata', { hata, ts: opts.simdi });
          gonderimler.push({ anahtar: f.anahtar, urun: f.urun, durum: 'hata', hata });
        }
      }
    }

    sonCalisma = new Date().toISOString();
    sonRapor = {
      tamam: true,
      sureMs: Date.now() - basladi,
      adaySayisi: adaylar.length,
      uygunSayisi: uygunlar.length,
      gonderimler,
      reddedilen: reddedilen.slice(0, 12),
      enIyi: uygunlar.slice(0, 3).map(f => ({
        urun: f.urun, site: f.site, fiyat: f.fiyat, referans: f.referans,
        indirim: f.indirim, durum: f.durum,
      })),
    };
    return sonRapor;
  } finally {
    calisiyor = false;
  }
}

/** Kısa durum/istatistik (Ayarlar paneli). */
export function firsatIstatistik() {
  try {
    const store = veritabani();
    const bugun = Number(store.prepare(
      "SELECT COUNT(*) adet FROM firsat_gonderim WHERE durum = 'gonderildi' AND ts >= ?",
    ).get(gunBasi())?.adet || 0);
    const toplam = Number(store.prepare(
      "SELECT COUNT(*) adet FROM firsat_gonderim WHERE durum = 'gonderildi'",
    ).get()?.adet || 0);
    const son = store.prepare(`
      SELECT urun, site, fiyat, indirim, ts, durum, hata FROM firsat_gonderim
      WHERE durum = 'gonderildi'
      ORDER BY ts DESC LIMIT 10
    `).all().map(r => ({
      urun: r.urun, site: r.site, fiyat: r.fiyat, indirim: r.indirim,
      ts: new Date(Number(r.ts)).toISOString(), durum: r.durum, hata: r.hata || null,
    }));
    return { bugun, toplam, son, calisiyor, sonCalisma, ayar: firsatAyar() };
  } catch {
    return { bugun: 0, toplam: 0, son: [], calisiyor, sonCalisma, ayar: firsatAyar() };
  }
}

/**
 * Kanala test paylaşımı gönderir.
 * Gerçek bir fırsat varsa onu "TEST" önekiyle gönderir; yoksa fiyat UYDURMADAN
 * yalnızca bağlantı testi mesajı yollar.
 */
export async function firsatTestGonder(opts = {}) {
  const ayar = firsatAyar();
  const kanal = opts.kanal || ayar.kanal;
  if (!kanal) throw new Error('Önce kanal kimliğini kaydedin (ör. @enucuzneredefirsatlari veya -100...).');
  const s = getSettings();
  const token = opts.botToken || s.telegram?.botToken;
  if (!token) throw new Error('Telegram Bot Token tanımlı değil.');

  const adaylar = snapshotSonuclari(10);
  let f = null;
  for (const a of adaylar) {
    const aday = firsatAdayiBul(a.sonuc, { minIndirim: 1 });
    if (aday.uygun) { f = aday; break; }
  }
  const metin = f
    ? '🧪 <b>TEST PAYLAŞIMI</b> — aşağıdaki fırsat gerçek son taramadan alınmıştır.\n\n' + firsatMesajiOlustur(f)
    : '🧪 <b>TEST PAYLAŞIMI</b>\n\nKanala bağlantı başarılı. '
      + 'Şu anda paylaşılabilir gerçek bir fırsat yok; uydurma fiyat gönderilmez.\n\n'
      + '🏷️ @EnUcuzNerede | Gerçek Fiyat Takipçisi';
  const gonderilecek = f
    ? { ...f, image: opts.gorselsiz ? null : f.image }
    : { anahtar: 'test', urun: 'test', site: '', fiyat: 0, referans: 0, indirim: 0,
        fark: 0, kargo: '', durum: '', url: '', image: null };
  const istek = telegramIstegiOlustur(gonderilecek, { chatId: kanal, metin });
  if (opts.kuru === true) return { ok: true, mock: true, yontem: istek.yontem, metin, istek };

  const res = await fetch(`https://api.telegram.org/bot${token}/${istek.yontem}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(istek.body),
    signal: AbortSignal.timeout(20000),
  });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok || veri.ok === false) {
    const desc = String(veri.description || res.status);
    let ipucu = '';
    if (desc.toLowerCase().includes('chat not found')) {
      ipucu = ' ? Bot kanala eklenmemi? veya Y?netici (Admin) yetkisi verilmemi?. L?tfen Telegram kanal?n?zda Y?netici Ekle > botunuzu (@erdal_fiyat_takip_bot) se?ip "Mesaj G?nderme" yetkisi verin.';
    }
    throw new Error('Telegram API hatas?: ' + desc + ipucu);
  }
  firsatKaydet({ ...gonderilecek, anahtar: 'test-' + Date.now() }, 'test', { mesajId: veri.result?.message_id });
  return { ok: true, yontem: istek.yontem, messageId: veri.result?.message_id ?? null, gercekFirsat: !!f };
}

/**
 * Zamanlayıcı: `saatAraligi` saatte bir sessizce çalışır.
 * Ayarlar her turda yeniden okunur (panel değişikliği yeniden başlatma gerektirmez).
 */
export function startFirsatScheduler({ ilkGecikmeMs = 5 * 60 * 1000 } = {}) {
  if (zamanlayici) { clearInterval(zamanlayici.interval); clearTimeout(zamanlayici.ilk); }
  const durum = { interval: null, ilk: null };

  const calistir = async (neden) => {
    try {
      const ayar = firsatAyar();
      if (!ayar.enabled) return;
      const r = await firsatlariTara({ taze: true });
      const g = (r.gonderimler || []).filter(x => x.durum === 'gonderildi').length;
      console.log(`[firsat] ${neden}: ${r.uygunSayisi || 0} uygun, ${g} paylaşım`);
    } catch (e) {
      console.warn('[firsat] döngü hatası:', String(e.message || e).slice(0, 160));
    }
  };

  durum.ilk = setTimeout(() => calistir('açılış'), Math.max(5000, ilkGecikmeMs));
  durum.interval = setInterval(() => {
    const ayar = firsatAyar();
    calistir(`zamanlanmış (${ayar.saatAraligi} sa)`);
  }, Math.max(30, firsatAyar().saatAraligi * 60) * 60 * 1000);
  durum.ilk.unref?.();
  durum.interval.unref?.();
  zamanlayici = durum;
  const ayar = firsatAyar();
  console.log(`[firsat] kanal zamanlayıcısı kuruldu — ${ayar.enabled ? 'AÇIK' : 'kapalı'}, her ${ayar.saatAraligi} sa`);
  return { saatAraligi: ayar.saatAraligi, enabled: ayar.enabled };
}

export function firsatZamanlayiciDurdur() {
  if (!zamanlayici) return;
  clearTimeout(zamanlayici.ilk);
  clearInterval(zamanlayici.interval);
  zamanlayici = null;
}
