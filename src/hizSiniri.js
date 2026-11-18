/**
 * 🚦 Bağımlılıksız IP Bazlı Hız Sınırı / Bot Koruması — 2026-11-18
 *
 * NEDEN
 * -----
 * Ağır public uçlar (`/api/compare`, `/api/oneri`, `/api/sepet` …) her istekte
 * onlarca mağaza sayfası okuyor. Tek bir bot/kötü niyetli istemci, tüm tarama
 * kapasitesini tüketip gerçek kullanıcıları bekletebiliyordu. Harici paket
 * (express-rate-limit vb.) eklemeden, bellek içi sabit pencereli bir sayaç
 * yeterli: ölçüm birimi "IP + uç nokta".
 *
 * TASARIM
 * -------
 *  • Map<anahtar, {sayac, pencereBitis}> — sabit pencere (fixed window).
 *  • Pencere dolunca sayaç sıfırlanır; süresi geçmiş kayıtlar periyodik
 *    olarak süpürülür (bellek sızıntısı yok).
 *  • Aşımda HTTP **429** + `Retry-After` (saniye) + JSON gövde döner.
 *  • `localhost`/loopback ve yetkili yönetici VARSAYILAN OLARAK muaf
 *    (`RL_LOOPBACK_MUAF=0` ile kapatılabilir). Böylece yerel geliştirme ve
 *    mevcut testler etkilenmez.
 *  • Limitler env ile ayarlanır: `RL_COMPARE=20` gibi. Uç nokta başına
 *    `RL_<AD>` (ad: compare, oneri, gorsel, sepet, barkod, baski).
 *
 * DÜRÜSTLÜK
 * ---------
 * Bu katman bir güvenlik sınırı değil, kapasite korumasıdır. Cloudflare'in
 * Bot Fight Mode/WAF kuralları asıl kalkan; burada amaç uygulamanın kendi
 * kaynaklarını koruması. Sahte `X-Forwarded-For` ile limit atlatılabilir;
 * bu yüzden IP çözümü `CF-Connecting-IP` → `req.ip` → soket sırasıyla yapılır
 * ve `trust proxy` ayarı Cloudflare/Caddy zincirine göre yapılandırılır.
 */

const VARSAYILAN_PENCERE_MS = 60 * 1000;

/** @type {Map<string, {sayac:number, bitis:number}>} */
const kayitlar = new Map();

let sonTemizlik = Date.now();
const TEMIZLIK_ARASI_MS = 60 * 1000;

const envInt = (ad, varsayilan) => {
  const n = Number(process.env[ad]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : varsayilan;
};

/** Loopback muafiyeti kapalı mı? (`RL_LOOPBACK_MUAF=0`) */
export function loopbackMuafMi() {
  return String(process.env.RL_LOOPBACK_MUAF || '1') !== '0';
}

/** Yaşlı pencere kayıtlarını temizler (periyodik, ucuz). */
export function hizSiniriTemizle(simdi = Date.now()) {
  if (simdi - sonTemizlik < TEMIZLIK_ARASI_MS) return 0;
  sonTemizlik = simdi;
  let silinen = 0;
  for (const [anahtar, kayit] of kayitlar) {
    if (kayit.bitis <= simdi) {
      kayitlar.delete(anahtar);
      silinen++;
    }
  }
  return silinen;
}

/**
 * Hız sınırı ara katmanı üretir.
 *
 * @param {{
 *   ad: string,
 *   limit?: number,          // pencere başına istek (env: RL_<AD>)
 *   envAd?: string,
 *   pencereMs?: number,
 *   ipCoz?: (req) => string, // IP çözücü (server.js `istemciIp`)
 *   muaf?: (req) => boolean, // muafiyet (loopback / admin)
 *   simdi?: () => number,    // test enjeksiyonu
 * }} opts
 */
export function hizSiniri(opts = {}) {
  const ad = String(opts.ad || 'genel');
  const envAd = String(opts.envAd || ('RL_' + ad.toLocaleUpperCase('en-US').replace(/[^A-Z0-9]+/g, '_')));
  const limit = Math.max(1, Number(opts.limit) || envInt(envAd, 20));
  const pencereMs = Math.max(1000, Number(opts.pencereMs) || envInt(envAd + '_PENCERE_MS', VARSAYILAN_PENCERE_MS));
  const ipCoz = typeof opts.ipCoz === 'function' ? opts.ipCoz : (req) => String(req.ip || req.socket?.remoteAddress || 'bilinmiyor');
  const muaf = typeof opts.muaf === 'function' ? opts.muaf : () => false;
  const simdiFn = typeof opts.simdi === 'function' ? opts.simdi : () => Date.now();

  const araKatman = (req, res, next) => {
    const simdi = simdiFn();
    hizSiniriTemizle(simdi);

    if (muaf(req)) return next();

    const ip = ipCoz(req) || 'bilinmiyor';
    const anahtar = ad + '|' + ip;
    const kayit = kayitlar.get(anahtar);

    if (!kayit || kayit.bitis <= simdi) {
      kayitlar.set(anahtar, { sayac: 1, bitis: simdi + pencereMs });
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - 1)));
      return next();
    }

    if (kayit.sayac >= limit) {
      const kalanSn = Math.max(1, Math.ceil((kayit.bitis - simdi) / 1000));
      res.setHeader('Retry-After', String(kalanSn));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Cache-Control', 'no-store');
      const govde = {
        ok: false,
        hata: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.',
        kod: 'hiz_siniri',
        tekrarDenemeSn: kalanSn,
        limit,
        pencereSn: Math.round(pencereMs / 1000),
      };
      // Express varsa `status().json()`; ham Node http ise writeHead/end.
      // (Katman hem sunucuda hem izole testlerde çalışabilsin.)
      if (typeof res.status === 'function' && typeof res.json === 'function') {
        return res.status(429).json(govde);
      }
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(govde));
    }

    kayit.sayac++;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - kayit.sayac)));
    next();
  };

  araKatman.limit = limit;
  araKatman.pencereMs = pencereMs;
  araKatman.ad = ad;
  return araKatman;
}

/** Panel/teşhis için özet (IP adresleri MASKELENİR). */
export function hizSiniriDurumu() {
  const simdi = Date.now();
  const aktif = [];
  for (const [anahtar, kayit] of kayitlar) {
    if (kayit.bitis <= simdi) continue;
    const [ad, ip] = anahtar.split('|');
    const maske = String(ip).replace(/\.\d+$/, '.***').replace(/:[0-9a-f]+$/i, ':***');
    aktif.push({ ad, ip: maske, sayac: kayit.sayac, kalanSn: Math.ceil((kayit.bitis - simdi) / 1000) });
  }
  aktif.sort((a, b) => b.sayac - a.sayac);
  return {
    kayitSayisi: kayitlar.size,
    aktif: aktif.slice(0, 40),
    loopbackMuaf: loopbackMuafMi(),
  };
}

/** Test/teşhis: tüm sayaçları sıfırla. */
export function hizSiniriSifirla() {
  kayitlar.clear();
  sonTemizlik = Date.now();
}
