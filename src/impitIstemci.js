/**
 * 🧬 Kotasız Chrome TLS Parmak İzi Katmanı (`impit`) — 2026-11-17
 *
 * SORUN
 * -----
 * Mağazaların bir bölümü (Trendyol, Amazon, n11, İncehesap, Teknosa, PTT AVM)
 * Node'un yerleşik `fetch`'ini TLS parmak izinden (JA3/JA4) tanıyıp 403 / bot
 * challenge döndürüyordu. Bu yüzden her istek için **ağır Playwright Chromium**
 * süreci başlatılıyordu: yüzlerce MB RAM, saniyeler süren soğuk başlatma ve
 * Windows'ta `chrome-headless-shell` CMD penceresi.
 *
 * ÇÖZÜM
 * -----
 * `impit` (Apify) Rust tabanlı bir HTTP istemcisidir; Chrome'un TLS/HTTP2
 * parmak izini ve başlık sırasını birebir taklit eder. API'si `fetch` uyumludur.
 * Kotası yoktur, süreç başlatmaz, ~5-50 ms'de yanıt verir.
 *
 * GÜVENLİ DÜŞÜŞ (fallback)
 * ------------------------
 * `impit` her ortamda yüklenemeyebilir (prebuilt binary yok, platform uyumsuz,
 * bozuk kurulum). Bu modül ASLA fırlatmaz: yükleme başarısızsa veya istek
 * impit'te hata verirse yerleşik `fetch`'e düşer. Böylece uygulama davranışı
 * impit olmadan da aynen çalışır.
 *
 * KAPATMA
 * -------
 * `IMPIT_KAPALI=1` → katman tamamen devre dışı (acil durum / A-B ölçümü).
 * `IMPIT_BROWSER=chrome124` → farklı TLS profili (varsayılan: `chrome`).
 * `IMPIT_HTTP3=1` → HTTP/3 denemesi (proxy ile birlikte kullanılamaz).
 */

const DURUM = {
  denendi: false,
  yuklendi: false,
  hata: null,
  surum: null,
  profil: null,
  sayac: { impit: 0, fetch: 0, impitHata: 0 },
  sonHata: null,
  sonImpitMs: null,
};

let ImpitSinifi = null;
const ornekler = new Map(); // profil → Impit örneği (bağlantı havuzu paylaşılır)

/** Katman ortam değişkeniyle kapatıldı mı? */
export function impitKapaliMi() {
  return String(process.env.IMPIT_KAPALI || '') === '1';
}

/** Kullanılacak Chrome TLS profili. */
export function impitProfili() {
  return String(process.env.IMPIT_BROWSER || 'chrome');
}

/** impit'i (bir kez) tembel yükler; başarısızsa null döner. */
async function impitSinifiAl() {
  if (ImpitSinifi) return ImpitSinifi;
  if (DURUM.denendi) return ImpitSinifi;
  DURUM.denendi = true;
  try {
    const mod = await import('impit');
    const Sinif = mod?.Impit || mod?.default?.Impit || mod?.default;
    if (typeof Sinif !== 'function') throw new Error('Impit sınıfı bulunamadı');
    ImpitSinifi = Sinif;
    DURUM.yuklendi = true;
    DURUM.hata = null;
    DURUM.surum = mod?.VERSION || mod?.version || null;
    DURUM.profil = impitProfili();
    return ImpitSinifi;
  } catch (e) {
    ImpitSinifi = null;
    DURUM.yuklendi = false;
    DURUM.hata = String(e?.message || e).slice(0, 200);
    console.warn('[impit] katman devre dışı, yerleşik fetch kullanılacak:', DURUM.hata);
    return null;
  }
}

/** Profil başına tekil impit örneği (çerez/bağlantı havuzu korunur). */
async function impitOrnegi(profil = null) {
  if (impitKapaliMi()) return null;
  const Sinif = await impitSinifiAl();
  if (!Sinif) return null;
  const anahtar = profil || impitProfili();
  if (ornekler.has(anahtar)) return ornekler.get(anahtar);
  try {
    const ornek = new Sinif({
      browser: anahtar,
      // TLS hatalarını YUTMA: sahte sertifika ile "başarılı" görünmek istemiyoruz.
      ignoreTlsErrors: false,
      // Emülasyon desteklenmiyorsa normal UA'ya düş (siteyi tamamen kaybetmeyelim).
      vanillaFallback: true,
      timeout: 20000,
      ...(String(process.env.IMPIT_HTTP3 || '') === '1' ? { http3: true } : {}),
    });
    ornekler.set(anahtar, ornek);
    return ornek;
  } catch (e) {
    DURUM.sonHata = String(e?.message || e).slice(0, 200);
    console.warn('[impit] istemci oluşturulamadı:', DURUM.sonHata);
    return null;
  }
}

/**
 * İsteği impit ile dener; hata/uyumsuzlukta `null` döner (fırlatmaz).
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{profil?:string}} [opts]
 * @returns {Promise<{response:any, katman:'impit', ms:number}|null>}
 */
export async function impitDene(url, init = {}, opts = {}) {
  const istemci = await impitOrnegi(opts.profil);
  if (!istemci) return null;
  const t0 = Date.now();
  try {
    const response = await istemci.fetch(url, init);
    const ms = Date.now() - t0;
    DURUM.sayac.impit++;
    DURUM.sonImpitMs = ms;
    return { response, katman: 'impit', ms };
  } catch (e) {
    DURUM.sayac.impitHata++;
    DURUM.sonHata = String(e?.message || e).slice(0, 200);
    return null;
  }
}

/**
 * `fetch` uyumlu tek giriş noktası: önce impit, olmazsa yerleşik `fetch`.
 *
 * @returns {Promise<{response:any, katman:'impit'|'fetch', ms:number}>}
 */
export async function httpIste(url, init = {}, opts = {}) {
  const t0 = Date.now();
  const deneme = await impitDene(url, init, opts);
  if (deneme) return deneme;
  const response = await fetch(url, init);
  DURUM.sayac.fetch++;
  return { response, katman: 'fetch', ms: Date.now() - t0 };
}

/** Sadece Response isteyen çağıranlar için kısayol. */
export async function guvenliFetch(url, init = {}, opts = {}) {
  return (await httpIste(url, init, opts)).response;
}

/** Teşhis paneli için katman durumu (anahtar/çerez içermez). */
export function impitDurumu() {
  return {
    etkin: !impitKapaliMi() && DURUM.yuklendi,
    kapali: impitKapaliMi(),
    yuklendi: DURUM.yuklendi,
    profil: DURUM.profil || impitProfili(),
    surum: DURUM.surum,
    hata: DURUM.hata,
    sonHata: DURUM.sonHata,
    sayac: { ...DURUM.sayac },
    ornekSayisi: ornekler.size,
    sonImpitMs: DURUM.sonImpitMs,
    env: {
      IMPIT_KAPALI: process.env.IMPIT_KAPALI || null,
      IMPIT_BROWSER: process.env.IMPIT_BROWSER || null,
      IMPIT_HTTP3: process.env.IMPIT_HTTP3 || null,
    },
  };
}

/** Test/ölçüm için: yüklenmiş sınıfı sıfırla. */
export function impitSifirla() {
  ImpitSinifi = null;
  ornekler.clear();
  DURUM.denendi = false;
  DURUM.yuklendi = false;
  DURUM.hata = null;
  DURUM.sonHata = null;
  DURUM.sayac = { impit: 0, fetch: 0, impitHata: 0 };
  DURUM.sonImpitMs = null;
}
