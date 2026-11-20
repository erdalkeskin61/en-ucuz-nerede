/**
 * Baskı Hesap — sunucu.
 * Giriş/kayıt sistemi yoktur (kişisel kullanım); yayına alırken erişimi ters vekil
 * (ör. Basic Auth ya da VPN) ile kısıtlayabilirsiniz.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import './src/httpPool.js';
import { warmUpHosts, getDnsCacheStats } from './src/httpPool.js';
import { config, secretProblems } from './src/config.js';
import { runComparison, runComparisonByQuery } from './src/pipeline.js';
import { detectSite, adapters } from './src/sites/index.js';
import { parcaMi, kritikVaryantCakismasi, modelSerisiCakismasi } from './src/util.js';
import * as store from './src/store.js';
import { startAlarmScheduler, checkAlarms, sendTestEmail, sendTestTelegram, sendTestWhatsApp, gorevDurumu } from './src/alarms.js';
import { sepetOptimize } from './src/basketOptimizer.js';
import { tamamlayiciBul } from './src/kargoTamamlayici.js';
import { barkodAra } from './src/barkod.js';
import { gorselAramaYap } from './src/gorselArama.js';
import { startTelegramBot } from './src/telegramBot.js';
import { saglayiciDurumu } from './src/scraper.js';
import { saglayiciKredileri } from './src/kredi.js';
import { getKuponlar, tumunuTopla, tazelemeGerekli } from './src/kuponlar.js';
import { afiliyeOzet, afiliyeKaydet, tiklaKaydet, tiklaOzet, afiliyeLink } from './src/afiliye.js';
import { sepetKuponAnalizi } from './src/kuponSepeti.js';
import {
  saglikKontrolu, saglikDurumu, saglikNobetcisiBaslat,
  getAdapterHealthHistory as adaptorGecmisi,
} from './src/healthPulse.js';
import { dbBakimCalistir, dbBakimDurumu, dbBoyutlari } from './src/dbBakim.js';
import { logDurumu, logRotasyonuYap, eskiArsivleriTemizle, LOG_PATH, ESIK_BAYT as LOG_ESIK_BAYT } from './src/logRotasyon.js';
import { anlikAl, anlikYaz, fiyatFarki, yasMetni, anlikIstatistik, snapshotKapat, BAYAT_SWR_MAX_YAS_MS, sorgudanAnlikAl } from './src/anlikOnbellek.js';
import {
  startFirsatScheduler, firsatIstatistik, firsatTestGonder,
  firsatlariTara, firsatZamanlayiciDurdur, firsatKapat, FIRSAT_VARSAYILAN,
} from './src/firsatKanali.js';
import {
  startRadarScheduler, radarDurum, radarBaslat, radarTara,
  radarZamanlayiciDurdur, radarKapat, katalogGetir, katalogEkle, katalogSil, katalogSifirla,
  radarDurumVerisi,
  vitrinVerisi,
  RADAR_VARSAYILAN,
} from './src/otonomRadar.js';
import { birimFiyat } from './src/birimFiyat.js';
import { birimFiyatHesapla } from './src/birimFiyat.js';
import { baskiKartiBilgisi, baskiZenginlestir } from './src/baskiMaliyet.js';
import { baskiApiBagla } from './src/baskiApi.js';
import { linkCoz } from './src/linkArama.js';
import { pushDurum, pushGonder } from './src/push.js';
import { onerileriGetir } from './src/oneriler.js';
import { hizliKaynakUrunBul, KIRILGAN_KAYNAK_SITELER } from './src/urunArama.js';
import {
  katalogSenkronBaslat, katalogSenkronDurdur, katalogSenkronizeEt,
  katalogSyncDurumu, katalogUrunleriAra,
} from './src/katalogSync.js';
import {
  widgetVerisi, widgetTiklamaKaydet, widgetIstatistik, widgetOrnekUrunler, refTemizle,
} from './src/widget.js';
import {
  whatsappKanalGonder, whatsappKartOlustur, whatsappAyarDogrula, SAGLAYICILAR,
} from './src/whatsappKanal.js';
import { slicerApiBagla } from './src/slicerApi.js';
import { hizSiniri, hizSiniriDurumu, loopbackMuafMi } from './src/hizSiniri.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ---- 🌐 Ters vekil / Cloudflare uyumu (2026-11-18) ---------------------
 * Canlı ortam: İnternet → Cloudflare → Caddy (TLS) → Node (Docker).
 * `trust proxy` olmadan req.ip her zaman Caddy konteynerinin IP'si olur;
 * rate limiting ve loglar anlamsızlaşır, `req.secure` hep false kalır.
 *
 * TRUST_PROXY:
 *   • tanımsız / '1'      → 1 (ilk atlama: Caddy) — varsayılan
 *   • 'loopback'          → yalnızca yerel vekil (docker dışı kurulum)
 *   • 'false' / '0'       → kapalı (doğrudan internete açık, vekil yok)
 *   • sayı ya da CIDR listesi → olduğu gibi Express'e verilir
 *
 * ⚠️ `trust proxy` açıkken `req.ip` istemci tarafından gönderilen
 * `X-Forwarded-For` ile ŞEKİLLENEBİLİR. Bu yüzden yönetici kapısı
 * (`yerelIstekMi`) ASLA `req.ip` kullanmaz — gerçek soket adresine bakar.
 */
const TRUST_PROXY = (() => {
  const ham = process.env.TRUST_PROXY;
  if (ham === undefined || String(ham).trim() === '') return 1;
  const v = String(ham).trim();
  if (v === 'false' || v === '0' || v === 'off') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return v; // 'loopback' | '10.0.0.0/8,loopback' | ...
})();
app.set('trust proxy', TRUST_PROXY);

app.use(express.json({ limit: '1mb' }));

/* ---- 🗄️ API önbellek disiplini (2026-11-18) -----------------------------
 * Cloudflare, `Cache-Control` başlığı olmayan yanıtları bazen "yumuşak
 * önbelleğe" alır. Fiyat/karşılaştırma sonuçlarının CDN'de bayatlaması kabul
 * edilemez; ayrıca JSON'un HTML olarak önbelleklenmesi içerik karışmasına yol
 * açar. Bu yüzden TÜM `/api/*` yanıtları varsayılan olarak `no-store`.
 *
 * İSTİSNALAR: kendi `public, max-age=…` başlığını koyan herkese açık uçlar
 * (vitrin, widget, sponsor, doğrulanmış mağazalar, slicer embed). Bunlar
 * gerçekten önbelleklenebilir ve CDN yükünü azaltır.
 */
const API_ONBELLEK_ISTISNA = new Set([
  '/api/vitrin',
  '/api/widget',
  '/api/widget/ornekler',
  '/api/embed/oner',
  '/api/sponsor/vitrin',
  '/api/dogrulanmis-magazalar',
]);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (API_ONBELLEK_ISTISNA.has(req.path)) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Cloudflare: HTML dönüşümü/otomatik minify API gövdesini bozmasın.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

/* ---- 🚦 Ağır public uçlar için IP bazlı hız sınırı (2026-11-18) ----------
 * Her biri onlarca mağaza sayfası okuyan "iş başlatan" POST uçları korunur.
 * `:id` alt yolları (durum/iptal) KASITLI olarak sınırsızdır: kullanıcı
 * sonucu/iptali her zaman alabilmeli.
 *
 * Muafiyet: loopback (yerel geliştirme + mevcut testler) ve GERÇEK yönetici
 * anahtarı (`ADMIN_ANAHTARI`). Dikkat: paylaşılan `ERISIM_ANAHTARI` muafiyet
 * SAYILMAZ — aksi halde anahtarı bilen her ziyaretçi sınırsız tarama yapardı.
 * `RL_LOOPBACK_MUAF=0` ile loopback de sınıra tabi tutulur (canlı doğrulama).
 * Limitler env ile: RL_COMPARE, RL_ONERI, RL_SEPET, RL_BARKOD, RL_GORSEL,
 * RL_BASKI (dakikadaki istek sayısı).
 */
const gercekAdminMi = (req) => Boolean(process.env.ADMIN_ANAHTARI)
  && guvenliAnahtarEslesirMi(adminVerilenAnahtar(req), process.env.ADMIN_ANAHTARI);
const hizMuaf = (req) => (loopbackMuafMi() && yerelIstekMi(req)) || gercekAdminMi(req);
const hizSinirYap = (ad, limit) => hizSiniri({ ad, limit, ipCoz: istemciIp, muaf: hizMuaf });

const HIZ_AGIR_UCLAR = new Map([
  ['/api/compare', hizSinirYap('compare', 20)],
  ['/api/oneri', hizSinirYap('oneri', 20)],
  ['/api/sepet', hizSinirYap('sepet', 20)],
  ['/api/barkod', hizSinirYap('barkod', 30)],
  ['/api/gorsel', hizSinirYap('gorsel', 10)],
  // İleride eklenecek görsel arama takma adı (spesifikasyon uyumu).
  ['/api/gorsel-ara', hizSinirYap('gorsel', 10)],
  ['/api/baski/hesapla', hizSinirYap('baski', 60)],
]);

app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const mw = HIZ_AGIR_UCLAR.get(req.path);
  if (!mw) return next();
  return mw(req, res, next);
});

// ---- 🛡️ Güvenlik başlıkları (2026-11-05) ----
// Yönetim/uygulama sayfaları başka sitelere gömülemez (tıklama hırsızlığına karşı).
// Yalnızca /widget ve /widget/git HARİCİ sitelere gömülebilir: blog yazarları
// tek satır iframe ile canlı fiyat gösterir. Widget için X-Frame-Options
// GÖNDERİLMEZ; yerine standart olan CSP frame-ancestors * kullanılır.
const WIDGET_YOLU = /^\/(widget|widget\.html|widget\/)/;
const WIDGET_CSP = [
  'frame-ancestors *',
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

app.use((req, res, next) => {
  if (WIDGET_YOLU.test(req.path)) {
    // Gömülmeye izin ver + 5 dk tarayıcı önbelleği (harici siteleri yormaz).
    res.setHeader('Content-Security-Policy', WIDGET_CSP);
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    // Gömülü içerikte referrer tam URL sızdırmasın.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  } else {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  }
  next();
});

// Sağlık ve eklenti kontrol ucu (erişim kısıtından muaf)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, app: 'en-ucuz-nerede', siteler: adapters.length, authGerekli: Boolean(config.erisimAnahtari), adminGerekli: Boolean(config.adminAnahtari), pool: getDnsCacheStats() });
});

// ---- Yönetici kimlik doğrulama yardımcıları (2026-11-15) ----
function guvenliAnahtarEslesirMi(verilen, beklenen) {
  if (!verilen || !beklenen) return false;
  const a = Buffer.from(String(verilen), 'utf8');
  const b = Buffer.from(String(beklenen), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * İstemcinin GERÇEK IP'si (2026-11-18).
 *
 * Sıra: `CF-Connecting-IP` → `req.ip` (trust proxy sonrası) → ham soket.
 * Cloudflare bu başlığı her istekte kendisi yazar ve istemcinin gönderdiği
 * değeri EZER; bu yüzden arkasında çalışırken güvenilirdir. Vekilsiz kurulumda
 * başlık yoktur → `req.ip` kullanılır.
 *
 * Not: Bu değer yalnızca hız sınırı/log içindir. Yetkilendirme kararlarında
 * KULLANILMAZ (aşağıdaki `yerelIstekMi` gerçek soket adresine bakar).
 */
function istemciIp(req) {
  const cf = String(req.get('cf-connecting-ip') || '').trim();
  if (cf) return cf.replace(/^::ffff:/, '');
  const ip = String(req.ip || req.socket?.remoteAddress || '').trim();
  return ip.replace(/^::ffff:/, '') || 'bilinmiyor';
}

/**
 * Yerel (loopback) istek mi?
 *
 * 🔒 GÜVENLİK (2026-11-18): Yalnızca **gerçek soket adresi** kontrol edilir.
 * `req.ip` KULLANILMAZ — `trust proxy` açıkken istemci `X-Forwarded-For:
 * 127.0.0.1` göndererek yönetici kapısını atlatabilirdi. `X-Forwarded-For`
 * başlığının varlığı da yeterli değildir (saldırgan göndermeyebilir); karar
 * tamamen TCP bağlantısının kaynağına dayanır.
 */
function yerelIstekMi(req) {
  const ip = String(req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

function cokiOku(req, ad) {
  const m = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${ad}=([^;]+)`));
  if (!m?.[1]) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

function adminVerilenAnahtar(req) {
  const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  return req.get('x-admin-anahtari')
    || bearer
    || cokiOku(req, 'admin_anahtari')
    || req.get('x-erisim-anahtari')
    || cokiOku(req, 'erisim_anahtari')
    || '';
}

function adminYetkiliMi(req) {
  if (config.adminAnahtari) {
    return guvenliAnahtarEslesirMi(adminVerilenAnahtar(req), config.adminAnahtari);
  }
  return yerelIstekMi(req);
}

function adminGerekli(req, res, next) {
  if (adminYetkiliMi(req)) return next();
  if (config.adminAnahtari) {
    return res.status(401).json({
      ok: false,
      hata: 'Yönetici anahtarı gerekli ya da hatalı.',
      adminAuthGerekli: true,
    });
  }
  return res.status(403).json({
    ok: false,
    hata: 'Yönetici paneline dış ağdan erişim kapalı (.env içinde ADMIN_ANAHTARI tanımlayın).',
    adminAuthGerekli: true,
  });
}

// ---- Erişim kısıtı (yayın modu) ----
// ERISIM_ANAHTARI tanımlıysa: istekler x-erisim-anahtari başlığı, ?anahtar= sorgusu ya da
// erisim_anahtari çerezi ile doğrulanır. Statik dosyalar hariç tüm /api uçları korunur.
if (config.erisimAnahtari) {
  app.use((req, res, next) => {
    const verilen = req.get('x-erisim-anahtari') || req.query.anahtar || req.headers.cookie?.match(/(?:^|;\s*)erisim_anahtari=([^;]+)/)?.[1];
    if (yerelIstekMi(req) || guvenliAnahtarEslesirMi(verilen, config.erisimAnahtari) || adminYetkiliMi(req)) return next();
    // Yönetici giriş/oturum uçları kendi ADMIN_ANAHTARI doğrulamasını kullanır.
    if (req.path === '/api/admin/oturum' || req.path === '/api/admin/giris' || req.path === '/api/admin/cikis') return next();
    // 📤 Paylaşılan sepet linkleri herkese açıktır (linki bilen görüntüler);
    // yalnızca salt okunur GET ucu muaf tutulur, yazma uçları korunur.
    if (req.method === 'GET' && /^\/api\/sepet\/paylas\/[A-Za-z0-9_-]{6,32}$/.test(req.path)) return next();
    // 📊 Ana sayfa canlı borsa vitrini: yalnızca herkese açık fiyat alanları
    // döner (token/sohbet/PID yok). Ziyaretçi anahtar girmeden piyasayı görür.
    if (req.method === 'GET' && req.path === '/api/vitrin') return next();
    // 🔌 Widget: harici bloglara gömülür ve ziyaretçi anahtarı olamaz.
    // Yalnızca herkese açık fiyat alanları döner (token/PID/sohbet yok).
    if (req.method === 'GET' && req.path === '/api/widget') return next();
    // Widget galerisi/oluşturucu önizlemesi: yalnızca ad + mağaza + fiyat.
    if (req.method === 'GET' && req.path === '/api/widget/ornekler') return next();
    // 🧩 Slicer eklentileri (Cura/Bambu/Orca/Prusa): masaüstü uygulaması
    // erişim anahtarı taşıyamaz. Yalnızca herkese açık fiyat alanları döner.
    if (req.method === 'GET' && req.path === '/api/embed/oner') return next();
    if (req.method === 'OPTIONS' && req.path === '/api/embed/oner') return next();
    // Slicer satın alma yönlendiricisi: tıklama kaydı + afiliye 302.
    if (req.method === 'GET' && req.path === '/yonlendir') return next();
    // Widget CTA yönlendiricisi: tıklama kaydı + afiliye linkine 302.
    if (req.method === 'GET' && req.path === '/widget/git') return next();
    // ⭐ Sponsorlu vitrin & doğrulanmış mağaza rozetleri herkese açıktır:
    // ana sayfa ziyaretçisi anahtar girmeden reklam alanını ve mavi tikleri görür.
    // Yalnızca GET okuma uçları muaf; yönetici raporu (`/api/admin/...`) korunur.
    if (req.method === 'GET' && req.path === '/api/sponsor/vitrin') return next();
    if (req.method === 'GET' && /^\/api\/sponsor\/tikla\/[A-Za-z0-9_-]{1,64}$/.test(req.path)) return next();
    if (req.method === 'GET' && req.path === '/api/dogrulanmis-magazalar') return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ hata: 'Erişim anahtarı gerekli ya da hatalı' });
    // Sayfalar açık kalır; ön yüz anahtarı sorar ve API isteklerine ekler.
    next();
  });
}

app.get(['/admin', '/admin.html'], (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/oturum', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    yetkili: adminYetkiliMi(req),
    anahtarTanimli: Boolean(config.adminAnahtari),
    yerel: yerelIstekMi(req),
  });
});

app.post('/api/admin/giris', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const anahtar = String(req.body?.anahtar || '');
  if (!config.adminAnahtari) {
    if (!yerelIstekMi(req)) {
      return res.status(403).json({ ok: false, hata: 'ADMIN_ANAHTARI tanımlı değil; dış ağdan giriş kapalı.' });
    }
    return res.json({ ok: true, yetkili: true, anahtarTanimli: false });
  }
  if (!guvenliAnahtarEslesirMi(anahtar, config.adminAnahtari)) {
    return res.status(401).json({ ok: false, hata: 'Yönetici anahtarı hatalı.' });
  }
  const guvenli = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader('Set-Cookie', `admin_anahtari=${encodeURIComponent(anahtar)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${guvenli ? '; Secure' : ''}`);
  return res.json({ ok: true, yetkili: true, anahtarTanimli: true });
});

app.post('/api/admin/cikis', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', 'admin_anahtari=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ ok: true });
});

app.get('/api/admin/ozet', adminGerekli, (req, res) => {
  try {
    const saglik = saglikDurumu();
    const durumlar = Object.values(saglik.siteDurumlari || {});
    const saglikOzet = {
      toplam: adapters.length,
      ok: durumlar.filter(x => x?.status === 'ok').length,
      hata: durumlar.filter(x => x?.status && x.status !== 'ok' && x.status !== 'empty').length,
      bos: durumlar.filter(x => x?.status === 'empty').length,
      sonKontrol: saglik.sonKontrol || null,
    };
    const sponsorlar = store.sponsorRapor();
    const dogrulanmis = store.dogrulanmisMagazalariGetir();
    const afiliye = afiliyeOzet(adapters.map(a => a.id));
    const tikla = tiklaOzet(30);
    const tracked = store.getTracked();
    const db = dbBoyutlari();
    const firsat = firsatIstatistik();
    const radar = radarDurum();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      saglikOzet,
      sponsor: {
        toplam: sponsorlar.length,
        aktif: sponsorlar.filter(s => s.yayinda).length,
        gosterim: sponsorlar.reduce((t, s) => t + (s.gosterimSayisi || 0), 0),
        tiklama: sponsorlar.reduce((t, s) => t + (s.tiklamaSayisi || 0), 0),
      },
      dogrulanmisSayisi: dogrulanmis.length,
      afiliye: { durum: afiliye.durum, etkin: afiliye.etkin, tiklama30g: tikla.toplamTiklama || 0 },
      takipSayisi: tracked.length,
      dbMb: db.dbMb,
      walMb: db.walMb,
      firsat: { etkin: Boolean(firsat.ayar?.enabled), bugun: firsat.bugun || 0 },
      radar: { etkin: Boolean(radar.ayar?.enabled), katalogSayisi: (radar.katalog || []).length },
      katalog: (() => {
        // 🗂️ Mağaza katalog indeksi (2026-11-17): panel KPI'ları için hafif özet.
        const kd = katalogSyncDurumu();
        return {
          toplam: kd.db.toplam,
          fiyatli: kd.db.fiyatli,
          stokta: kd.db.stokta,
          calisiyor: kd.calisiyor,
          sonBitis: kd.sonBitis,
          hedefSayisi: kd.hedefSayisi,
          hata: kd.hata,
        };
      })(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/* ------------------------------------------------------------------ */
/* 🗂️ Mağaza katalog senkronizasyonu — panel uçları (2026-11-17)       */
/* ------------------------------------------------------------------ */

/** GET /api/admin/katalog-sync → senkron durumu + DB sayımları + hedefler. */
app.get('/api/admin/katalog-sync', adminGerekli, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json({ ok: true, ...katalogSyncDurumu() });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/**
 * POST /api/admin/katalog-sync → manuel senkron.
 * Gövde: { siteler?: string[] } — boşsa tüm hedefler.
 * İş ARKA PLANDA çalışır (panel donmaz); durum aynı uçtan izlenir.
 */
app.post('/api/admin/katalog-sync', adminGerekli, (req, res) => {
  try {
    const durum = katalogSyncDurumu();
    if (durum.calisiyor) {
      return res.json({ ok: true, zatenCalisiyor: true, baslangic: durum.sonBaslangic });
    }
    const siteler = Array.isArray(req.body?.siteler)
      ? req.body.siteler.filter(s => typeof s === 'string').slice(0, 40)
      : null;
    katalogSenkronizeEt({ siteler, kaynak: 'panel' }).catch((e) => {
      console.warn('[katalogSync] panel tetiklemesi hatası:', String(e?.message || e));
    });
    res.json({
      ok: true,
      baslatildi: true,
      hedefSayisi: siteler && siteler.length ? siteler.length : durum.hedefSayisi,
    });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/** GET /api/admin/katalog-ara?q=... → panelde indeks aramasını test etme. */
app.get('/api/admin/katalog-ara', adminGerekli, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const ttlDk = Number(req.query.ttlDk);
    const sonuclar = q
      ? katalogUrunleriAra(q, {
        limit: Math.min(30, Number(req.query.limit) || 10),
        ttlMs: Number.isFinite(ttlDk) ? ttlDk * 60000 : undefined,
      })
      : [];
    res.json({ ok: true, sorgu: q, adet: sonuclar.length, sonuclar });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/* ------------------------------------------------------------------ */
/* 🔍 Canlı SEO & sosyal paylaşım (2026-11-18)                          */
/* ------------------------------------------------------------------ */

/** XML metni için güvenli kaçış (sitemap bozulmasın). */
function xmlKacis(metin) {
  return String(metin ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Yayın kökü: PUBLIC_URL tanımlıysa o, yoksa isteğin kendi host/protokolu. */
function yayinKoku(req) {
  const acik = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (acik) return acik;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host') || ('localhost:' + config.port);
  return `${proto}://${host}`;
}

/**
 * GET /sitemap.xml — arama motorları için dinamik site haritası.
 * Yalnızca GERÇEKTEN yayında olan herkese açık sayfalar listelenir;
 * /admin ve /api bilinçli olarak yer almaz (robots.txt de engeller).
 */
app.get('/sitemap.xml', (req, res) => {
  try {
    const taban = yayinKoku(req);
    const bugun = new Date().toISOString().slice(0, 10);
    const sayfalar = [
      { yol: '/', oncelik: '1.0', siklik: 'daily' },
      { yol: '/maliyet.html', oncelik: '0.8', siklik: 'weekly' },
      { yol: '/sepet.html', oncelik: '0.8', siklik: 'weekly' },
      { yol: '/slicer.html', oncelik: '0.7', siklik: 'weekly' },
      { yol: '/ayarlar.html', oncelik: '0.3', siklik: 'monthly' },
    ];
    const govde = sayfalar.map(s => [
      '  <url>',
      `    <loc>${xmlKacis(taban + s.yol)}</loc>`,
      `    <lastmod>${bugun}</lastmod>`,
      `    <changefreq>${s.siklik}</changefreq>`,
      `    <priority>${s.oncelik}</priority>`,
      '  </url>',
    ].join('\n')).join('\n');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + govde + '\n</urlset>\n';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (e) {
    res.status(500).type('text/plain').send('sitemap üretilemedi');
  }
});

/**
 * GET / ve /index.html — PUBLIC_URL tanımlıysa sosyal paylaşım etiketlerini
 * MUTLAK adrese çevirir (WhatsApp/X/LinkedIn önizlemeleri göreli yolu açamaz).
 * PUBLIC_URL yoksa hiçbir şey değiştirilmez: statik dosya olduğu gibi sunulur.
 */
app.get(['/', '/index.html'], (req, res, next) => {
  const acik = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!acik) return next(); // mevcut statik davranış korunur
  const dosya = path.join(__dirname, 'public', 'index.html');
  fs.readFile(dosya, 'utf8', (err, html) => {
    if (err) return next();
    const tamKok = yayinKoku(req);
    const cikti = html
      // og:image ve twitter:image göreli yolu → tam adres
      .replace(/content="\/og-gorsel\.png"/g, `content="${tamKok}/og-gorsel.png"`)
      // og:url + canonical (tek kez, og:image:alt bloğunun önüne)
      .replace(
        '<meta property="og:image:alt"',
        `<meta property="og:url" content="${tamKok}/" />\n  `
        + `<link rel="canonical" href="${tamKok}/" />\n  `
        + '<meta property="og:image:alt"',
      );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(cikti);
  });
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- İş (job) yönetimi: SQLite kalıcı kuyruk + canlı önbellek (2026-10-29) ----
//
// ÖNCE: `const jobs = new Map()` — süreç ölürse TÜM işler kaybolurdu.
// ŞİMDİ: her mutasyon SQLite'a yazılır (write-through). Bellekte yalnızca canlı
// nesneler tutulur çünkü `AbortController` serileştirilemez. GET uçları işi
// bellekte bulamazsa VERİTABANINDAN okur → sunucu yeniden başlasa da geçmiş işler
// (ve sonuçları) görülebilir. REST yanıt biçimleri birebir korunmuştur.
const jobs = new Map();            // id → canlı job (Proxy, write-through)
const jobDinleyiciler = new Map(); // id → Set<res> (SSE aboneleri)

/** Gecikmeli (birleştirilmiş) yazma zamanlayıcıları. */
const jobYazZamanlayici = new Map();

/** İşin diske yazılabilir anlık görüntüsü (ek alanlar dahil). */
function jobYaz(job) {
  try { return store.saveJob(job); } catch { return false; }
}

/** 200 ms içindeki ardışık değişiklikleri tek yazmada birleştirir. */
function jobYazGecikmeli(job) {
  if (jobYazZamanlayici.has(job.id)) return;
  const t = setTimeout(() => {
    jobYazZamanlayici.delete(job.id);
    jobYaz(job);
  }, 200);
  if (t.unref) t.unref();
  jobYazZamanlayici.set(job.id, t);
}

/** Bekleyen gecikmeli yazmayı iptal edip hemen yazar (bitiş/critical anlar). */
function jobYazHemen(job) {
  const t = jobYazZamanlayici.get(job.id);
  if (t) { clearTimeout(t); jobYazZamanlayici.delete(job.id); }
  return jobYaz(job);
}

/**
 * REST uçlarının döndürdüğü alanların BİRLEŞİK görünümü (SSE için).
 * Tüm iş türleri (compare/oneri/sepet/barkod/gorsel/muadil) bu üst kümeden
 * ihtiyaç duyduğunu okur; böylece tek bir akış ucu yeterlidir.
 */
function jobGorunum(job) {
  return {
    id: job.id,
    tur: job.tur,
    status: job.status,
    progress: job.progress ?? null,
    kaynak: job.kaynak || job.result?.kaynak || null,
    partialResults: Array.isArray(job.partialResults) ? job.partialResults : [],
    result: job.result ?? null,
    error: job.error ?? null,
    sureMs: job.startedAt ? Date.now() - job.startedAt : 0,
    iptalEdildi: !!(job.result?.iptalEdildi || job.iptalIstendi),
    // Anlık sonuç (stale-while-revalidate) alanları
    mod: job.mod || null,
    surum: job.surum ?? 0,
    tazeleniyor: !!job.tazeleniyor,
    tazelemeBitti: !!job.tazelemeBitti,
    tazelemeHatasi: job.tazelemeHatasi || null,
    tazelemeFarki: job.tazelemeFarki || null,
    anlikTs: job.anlikTs || null,
    anlikYasMs: job.anlikYasMs ?? null,
    yasMetni: job.anlikYasMs != null ? yasMetni(job.anlikYasMs) : null,
    url: job.url || null,
    site: job.site || null,
    // 🧭 2026-11-14: ürün adı aramasının ilerleme aşaması (istemci gösterir).
    faz: job.faz || null,
    fazNotu: job.fazNotu || null,
    katman: job.katman ?? null,
    arananSorgu: job.arananSorgu || null,
    kaynakAd: job.kaynakAd || null,
    // 🗂️ Ürün nereden bulundu: yerel katalog indeksi mi, canlı mağaza araması mı?
    kaynakKatmani: job.kaynakKatmani || null,
    katalogYasMs: job.katalogYasMs ?? null,
  };
}

/** İş bitti mi? (anlık sonuç tazelemesi sürerken "bitmedi" sayılır) */
function jobBittiMi(job) {
  return job.status === 'done' && !job.tazeleniyor;
}

/** SSE abonelerine olay yayınlar. done/error'da bağlantılar kapatılır. */
function sseYayinla(job, olay) {
  const set = jobDinleyiciler.get(job.id);
  if (!set || !set.size) return;
  // `sunucuTs`: istemci yayın→alım gecikmesini ölçebilsin (aynı makinede aynı saat).
  const veri = { ...jobGorunum(job), sunucuTs: Date.now() };
  const bitis = olay === 'done' || olay === 'error';
  for (const res of [...set]) {
    try {
      res.write(`event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`);
      if (bitis) res.end();
    } catch {
      /* bağlantı koptu → aşağıda temizlenir */
    }
    if (bitis) set.delete(res);
  }
  if (bitis && !set.size) jobDinleyiciler.delete(job.id);
}

/** Aynı tick'te yapılan atamalar bitsin diye olayı bir sonraki tura erteler. */
function sseYayinlaGecikmeli(job, olay) {
  setTimeout(() => sseYayinla(job, olay), 0);
}

/**
 * Canlı job nesnesini write-through Proxy ile sarar.
 * Böylece mevcut kod (`job.progress = …`, `job.status = 'done'`) HİÇ değişmeden
 * hem veritabanına hem SSE abonelerine yansır.
 */
function jobProxy(hedef) {
  return new Proxy(hedef, {
    set(h, anahtar, deger) {
      const eski = h[anahtar];
      h[anahtar] = deger;
      if (anahtar === 'iptalKontrolu') return true; // serileştirilmez
      if (eski === deger) return true;

      // 1) İlerleme: sık + küçük → doğrudan kolon güncelle, sonra SSE
      if (anahtar === 'progress') {
        try { store.updateJobProgress(h.id, deger); } catch { /* yoksay */ }
        jobYazGecikmeli(h); // ek alanlar da diske
        sseYayinla(h, 'progress');
        return true;
      }

      // 2) Bitiş alanları: hemen diske yaz, olayı tick sonunda gönder
      if (anahtar === 'status' || anahtar === 'result' || anahtar === 'error') {
        jobYazHemen(h);
        if (h.status === 'done' && !h.tazeleniyor) sseYayinlaGecikmeli(h, 'done');
        else if (h.status === 'error') sseYayinlaGecikmeli(h, 'error');
        else sseYayinlaGecikmeli(h, 'progress');
        return true;
      }

      // 3) Diğer alanlar (kaynak, partialResults, surum, tazeleniyor…)
      jobYazGecikmeli(h);
      if (anahtar === 'surum' || anahtar === 'partialResults' || anahtar === 'tazeleniyor' || anahtar === 'kaynak') {
        if (h.status === 'done' && !h.tazeleniyor) sseYayinlaGecikmeli(h, 'done');
        else sseYayinlaGecikmeli(h, 'progress');
      }
      return true;
    },
  });
}

function yeniJob(tur, ek = {}) {
  const id = tur + '_' + crypto.randomBytes(8).toString('hex');
  const ham = {
    id, tur, status: 'running', startedAt: Date.now(),
    progress: null,
    result: null, error: null,
    // `updatedAt` BİLİNÇLİ olarak konmaz: saveJob her yazmada Date.now() kullanır.
    // (İlk sürümde buraya sabit zaman yazılıyordu → updated_at hiç ilerlemiyor,
    //  sıralama ve 7 günlük temizlik yanlış çalışıyordu — 2026-10-29 düzeltmesi.)
    ...ek,
  };
  const job = jobProxy(ham);
  jobs.set(id, job);
  // Hemen diske: sunucu bu satırdan sonra çökse bile iş kaydı vardır.
  jobYazHemen(job);
  if (jobs.size > 20) {
    // Arka planda tazelenen işler silinmesin (2026-10-29): durumu 'done' olsa da
    // tazeleme sürüyor ve istemci hâlâ o işi oyuyor. (DB'de kayıt zaten duruyor.)
    const oldest = [...jobs.entries()]
      .filter(([, j]) => j.status !== 'running' && !j.tazeleniyor)
      .sort((a, b) => a[1].startedAt - b[1].startedAt)[0];
    if (oldest) jobs.delete(oldest[0]);
  }
  return job;
}

/**
 * İşi bulur: önce canlı önbellek, yoksa VERİTABANI.
 * Yeniden başlatma sonrası GET uçlarının çalışmaya devam etmesini sağlar.
 */
function jobBul(id) {
  if (!id) return null;
  const canli = jobs.get(id);
  if (canli) return canli;
  try { return store.getJob(id); } catch { return null; }
}

/**
 * Anlık sonuç (snapshot) — 2026-10-29.
 * İstemciye "bu sonuç X dk önce tarandı, arka planda tazeleniyor" bilgisini taşır.
 */
function anlikBilgisi(anlik) {
  return {
    anlik: true,
    anlikTs: anlik.ts,
    anlikYasMs: anlik.yasMs,
    yasMetni: yasMetni(anlik.yasMs),
    tazeleniyor: true,
  };
}

// ---- "Ne almak istiyorsun?" öneri akışı ----
app.post('/api/oneri', (req, res) => {
  const ihtiyac = String(req.body?.ihtiyac || '').trim();
  if (!ihtiyac || ihtiyac.length < 3) return res.status(400).json({ hata: 'Lütfen ne almak istediğini bir cümleyle yaz.' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('oneri', { ihtiyac, iptalKontrolu: new AbortController() });
  import('./src/oneri.js').then(({ runOneri }) =>
    runOneri(ihtiyac, {
      onProgress: (p) => { job.progress = p; },
      signal: job.iptalKontrolu.signal,
    })
  )
    .then(result => {
      if (job.iptalIstendi) {
        job.status = 'done';
        job.result = result || { oneriler: [], kismi: true, iptalEdildi: true };
        return;
      }
      if (!result || typeof result !== 'object') {
        job.status = 'error';
        job.error = 'Öneri servisi geçersiz sonuç döndürdü.';
        return;
      }
      job.status = 'done';
      job.result = result;
    })
    .catch(e => {
      if (job.iptalIstendi) { job.status = 'done'; job.result = { oneriler: [], kismi: true, iptalEdildi: true }; return; }
      job.status = 'error';
      job.error = String(e.message || e);
    });

  res.json({ id: job.id, isId: job.id });
});

/**
 * ⏹️ Öneri akışını iptal eder (2026-11-14).
 * AbortController tetiklenir; runComparison altındaki fetch istekleri durur.
 * O ana kadar tamamlanan modeller istemcide zaten kısmi kart olarak gösterildiği
 * için sunucu tarafında ek iş yapılmaz.
 */
app.post('/api/oneri/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'oneri') return res.status(404).json({ hata: 'İş bulunamadı' });
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal edilmiş */ }
  job.progress = {
    ...(job.progress || {}),
    iptal: true,
    not: 'Kullanıcı taramayı durdurdu',
  };
  // İşi HEMEN bitir: bekleyen SSE/polling bağlantıları kapanır. Arka plandaki
  // runOneri iptali fark ederse sonucu (varsa kısmi) bu sonucun üzerine yazar.
  if (job.status === 'running' || job.status === 'pending') {
    job.status = 'done';
    job.result = {
      oneriler: [],
      kismi: true,
      iptalEdildi: true,
      tamamlananModel: 0,
    };
  }
  res.json({ ok: true, iptalEdildi: true });
});

app.get('/api/oneri/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'oneri') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

/**
 * SSE (Server-Sent Events) canlı akış — 2026-10-29
 *
 * GET /api/stream/:id
 *
 * Neden: istemci 750–1000 ms'de bir HTTP isteği atıyordu; ilerleme gecikmeli
 * görünüyordu. SSE ile her ilerleme OLAY ANINDA (milisaniye) ekrana düşer.
 *
 * Davranış:
 *  - Bağlantı açılışında mevcut durum `progress` olarak gönderilir (gecikme yok).
 *  - İş zaten bittiyse `done` / `error` gönderilip bağlantı kapatılır.
 *  - 15 saniyede bir `: ping` yorumu → proxy/tarayıcı boşta kapatmasın.
 *  - İstemci sekneyi kapatırsa (`req.on('close')`) dinleyici temizlenir.
 *
 * Kimlik: EventSource başlık gönderemez; erişim anahtarı `?anahtar=` ile geçilir
 * (sunucunun mevcut erişim middleware'i ikisini de kabul eder).
 */
const SSE_PING_MS = 15000;

app.get('/api/stream/:id', (req, res) => {
  const id = String(req.params.id || '');
  const job = jobBul(id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx/proxy tamponlamasın
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const yaz = (olay, veri) => {
    try { res.write(`event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`); } catch { /* koptu */ }
  };

  // 1) Mevcut durum hemen (ilk bayt gecikmesi yok)
  const gorunum = { ...jobGorunum(job), sunucuTs: Date.now() };
  yaz('progress', gorunum);

  // 2) İş bittiyse akışı hemen kapat
  if (jobBittiMi(job)) { yaz('done', gorunum); try { res.end(); } catch { /* koptu */ } return; }
  if (job.status === 'error' || job.status === 'interrupted' || job.status === 'iptal') {
    yaz('error', gorunum);
    try { res.end(); } catch { /* koptu */ }
    return;
  }

  // 3) Abone ekle
  let set = jobDinleyiciler.get(id);
  if (!set) { set = new Set(); jobDinleyiciler.set(id, set); }
  set.add(res);

  // 4) Keep-alive ping (15 sn): yorum satırı, istemci yok sayar
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* koptu */ }
  }, SSE_PING_MS);
  if (ping.unref) ping.unref();

  // 5) Temizlik: sekme kapandı / bağlantı düştü
  let temizlendi = false;
  const temizle = () => {
    if (temizlendi) return;
    temizlendi = true;
    clearInterval(ping);
    const s = jobDinleyiciler.get(id);
    if (s) {
      s.delete(res);
      if (!s.size) jobDinleyiciler.delete(id);
    }
  };
  req.on('close', temizle);
  req.on('aborted', temizle);
  res.on('error', temizle);
});

/** Teşhis: son işler (kalıcı kuyruk). */
app.get('/api/jobs', (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const tur = req.query.tur ? String(req.query.tur) : null;
  res.json({
    ...store.jobIstatistik(),
    isler: store.listJobs({ limit, tur }),
    aktifBellek: jobs.size,
    sseAbone: [...jobDinleyiciler.values()].reduce((t, s) => t + s.size, 0),
  });
});

/**
 * Karşılaştırmayı çalıştırır, ilerlemeyi işe yazar, sonucu geçmişe + fiyat
 * geçmişine + anlık önbelleğe kaydeder (2026-10-29: anlık sonuç için ayrıştırıldı;
 * normal tarama ve arka plan tazelemesi aynı yolu kullanır).
 */
function karsilastirmaCalistir(url, job, formatSonuc, { arananSorgu = null } = {}) {
  const secenekler = {
    signal: job.iptalKontrolu.signal,
    // Tazeleme modunda sayfa önbelleği atlanır → fiyat gerçekten siteden okunur.
    taze: job.mod === 'tazeleme',
    // Opsiyonel site alt kümesi (teşhis/test). Verilmezse tüm siteler taranır —
    // varsayılan davranış değişmez (2026-10-29).
    ...(Array.isArray(job.siteler) && job.siteler.length ? { siteler: job.siteler } : {}),
    // Opsiyonel site zaman aşımı (teşhis/test). Verilmezse mevcut davranış (bekle).
    ...(Number(job.siteTimeoutMs) > 0 ? { siteTimeoutMs: Number(job.siteTimeoutMs) } : {}),
    onProgress: (siteId, info) => {
      const cur = job.progress?.[siteId] || {};
      // Proxy'yi tetiklemek için YENİ nesne atanır (yerinde mutasyon kalıcı yazmayı
      // ve SSE yayınını atlardı — 2026-10-29).
      job.progress = {
        ...(job.progress || {}),
        [siteId]: {
          site: siteId,
          status: info.status || cur.status,
          note: info.reason || info.note || cur.note || '',
          fiyat: info.product?.pricing?.toplam ?? cur.fiyat ?? null,
        },
      };

      if (info.matchBasis === 'kaynak' && info.product) {
        const etkinUrl = url || info.product.url || '';
        job.kaynak = {
          site: info.site,
          siteName: info.siteName,
          url: etkinUrl,
          urun: info.product.title,
          marka: info.product.brand,
          modelKodu: info.product.modelCode,
          barkod: info.product.barcode,
          renk: info.product.color,
          fiyat: info.product.pricing?.toplam ?? info.product.sellingPrice,
          image: info.product.image,
        };
      }

      if (info.status === 'found' && info.product && info.product.pricing?.toplam != null) {
        const formatted = formatSonuc(info);
        const liste = [...(job.partialResults || [])];
        const idx = liste.findIndex(x => x.site === siteId);
        if (idx >= 0) liste[idx] = formatted;
        else liste.push(formatted);

        // Canlı en ucuz etiketini hesapla
        const eligible = liste.filter(x => x.renkAyni !== false && x.product?.pricing?.toplam != null && x.product?.inStock !== false);
        let minPrice = Infinity;
        let minItem = null;
        for (const item of eligible) {
          item.enUcuz = false;
          if (item.product.pricing.toplam < minPrice) {
            minPrice = item.product.pricing.toplam;
            minItem = item;
          }
        }
        if (minItem) minItem.enUcuz = true;

        // Listeyi TEK seferde ata: Proxy tetiklenir → diske yazılır + SSE yayınlanır.
        job.partialResults = liste;

        // Tazeleme sırasında kartları CANLI güncelle: her yeni fiyat geldikçe sürüm artar.
        if (job.tazeleniyor) job.surum = (job.surum || 1) + 1;
      }
    },
  };
  const calisma = (!url && arananSorgu)
    ? runComparisonByQuery(arananSorgu, secenekler)
    : runComparison(url, secenekler);
  return calisma
    .then(result => {
      const kayitUrl = url || result?.kaynak?.url || '';
      // Geçmiş + fiyat zaman serisi + anlık önbellek
      if (result && result.kaynak && result.ozet) {
        // En ucuz teklifin ürün adresi geçmişe de yazılır (2026-10-31):
        // "Son aramalar" listesinde doğrudan mağaza linki verilebilsin.
        const enUcuzTeklif = (result.sonuclar || []).find(s =>
          s.enUcuz && s.status === 'found' && s.product && s.renkAyni !== false);
        store.addHistory({
          url: kayitUrl,
          urun: result.kaynak.urun,
          modelKodu: result.kaynak.modelKodu,
          enUcuzSite: result.ozet.enUcuzSite,
          enUcuzSiteId: enUcuzTeklif?.site || null,
          enUcuzFiyat: result.ozet.enUcuzFiyat,
          enUcuzUrl: enUcuzTeklif?.product?.afiliyeUrl
            || enUcuzTeklif?.product?.url
            || null,
          harcananIstek: result.ozet.harcananIstek,
        });
      }

      // Zaman serisi SQLite fiyat geçmişi kaydı (2026-10-28 düzeltmesi)
      //
      // ÖNCEKİ HATA: `pricing.listeFiyati || pricing.netFiyat` okunuyordu; bu alanlar
      // computePricing çıktısında YOK (doğru alanlar: araToplam / toplam). Sonuç:
      // değer undefined kalıyor, addPricePoint sessizce çıkıyor ve fiyat geçmişi
      // HİÇ dolmuyordu → 30 günlük grafik asla gerçek veriye kavuşamıyordu.
      const pid = result.kaynak?.modelKodu || result.kaynak?.barcode || result.kaynak?.urun;
      if (pid && Array.isArray(result.sonuclar)) {
        for (const s of result.sonuclar) {
          if (s.status !== 'found' || !s.product) continue;
          const pr = s.product.pricing || {};
          // araToplam = kargo hariç ürün tutarı; toplam = gerçekte ödenecek (kargo dahil)
          const urunFiyati = pr.araToplam ?? s.product.sellingPrice ?? null;
          const odenecek = pr.toplam ?? s.product.sellingPrice ?? null;
          if (odenecek == null || !Number.isFinite(Number(odenecek))) continue;
          store.addPricePoint({
            productId: pid,
            site: s.site,
            price: urunFiyati != null ? urunFiyati : odenecek,
            netPrice: odenecek,
          });
        }
      }

      // Anlık sonuç önbelleği (2026-10-29)
      //
      // DÜRÜSTLÜK: yalnızca TAM ve anlamlı taramalar saklanır.
      //  - İptal edilen / yarıda kalan tarama 5 saat "anlık sonuç" olarak sunulmaz
      //    (kullanıcı eksik site listesini güncel sanmasın).
      //  - Hiçbir sitede ürün bulunamadıysa da saklanmaz: site geçici olarak engellemiş
      //    olabilir; sonraki istek gerçek tarama yapmalı.
      //  - SİTE ALT KÜMESİYLE yapılan tarama (teşhis/test) asla saklanmaz: 61 sitenin
      //    12'si taranmışsa "en ucuz" iddiası yanıltıcı olur (2026-10-29 düzeltmesi).
      const altKume = Array.isArray(job.siteler) && job.siteler.length > 0;
      const tamTarama = !altKume
        && !result.ozet?.iptalEdildi
        && !(result.ozet?.taranmayanSiteSayisi > 0);
      const bulunanVar = (result.sonuclar || []).some(s => s.status === 'found' && s.product);
      if (tamTarama && bulunanVar && kayitUrl) anlikYaz(kayitUrl, result);
      return result;
    });
}

/**
 * 🧭 Katman-0 eşleştirme (2026-11-14): kullanıcı sorgusu ile katalog ürün adını
 * normalize edilmiş kelime örtüşmesiyle karşılaştırır.
 *
 * Amaç: "eSun PLA+ Siyah 1kg" gibi sorguları SQLite kataloğunda 10 ms'de bulup
 * dış mağazalara hiç çıkmadan karşılaştırma başlatmak. Yanlış eşleşmeyi önlemek
 * için: sorgunun TÜM anlamlı kelimeleri (≥3 harf) katalog adında geçmelidir.
 *
 * @param {string} katalogAd
 * @param {string} sorgu
 * @returns {boolean}
 */
function adAnahtariBenzer(katalogAd, sorgu) {
  if (parcaMi(katalogAd) !== parcaMi(sorgu)) return false;
  if (kritikVaryantCakismasi(katalogAd, sorgu)) return false;
  if (modelSerisiCakismasi(katalogAd, sorgu)) return false;
  const norm = (s) => String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hedef = norm(katalogAd);
  const kaynak = norm(sorgu);
  if (!hedef || !kaynak) return false;
  const hedefTokens = new Set(hedef.split(' ').filter(Boolean));
  const kelimeler = kaynak.split(' ').filter(w => w.length >= 2 || /\d/.test(w));
  if (!kelimeler.length) return false;
  return kelimeler.every(k => hedefTokens.has(k) || (k.length >= 3 && hedef.includes(k)));
}

app.post('/api/compare', async (req, res) => {
  let url = String(req.body?.url || req.body?.sorgu || req.body?.q || '').trim();
  if (!url) return res.status(400).json({ hata: 'URL veya ürün adı gerekli' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  let site = detectSite(url);
  const arananSorgu = site ? null : url;

  const formatSonuc = (r) => ({
    site: r.site,
    siteName: r.siteName,
    status: r.status,
    reason: r.reason,
    matchBasis: r.matchBasis,
    renkAyni: r.renkAyni,
    enUcuz: !!r.enUcuz,
    kargoBedava: r.product ? (
      r.product.pricing?.kargo?.ucret === 0 ||
      r.product.pricing?.kargo?.uygulanir === false ||
      /ücretsiz|bedava/i.test(String(r.product.pricing?.kargo?.aciklama || '')) ||
      /ücretsiz|bedava/i.test(String(r.product.shipping || ''))
    ) : false,
    resmiSatici: r.product ? (
      ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'teknosa', 'itopya', 'koctas', 'robitshop', 'robotistan', 'direnc', 'samm'].includes(r.site) &&
      (!r.product.seller || /trendyol|hepsiburada|amazon|vatan|mediamarkt|teknosa|itopya|robitshop|robotistan|direnc|samm/i.test(r.product.seller) ||
       (r.product.brand && String(r.product.seller).toLowerCase().includes(String(r.product.brand).toLowerCase())))
    ) : false,
    vadeFarksizTaksit: r.product ? (
      (r.product.campaigns || []).some(c => /vade farksız|faizsiz|peşin fiyatına/i.test(c)) ||
      (r.product.pricing?.kampanyaTaksit || []).length > 0 ||
      /vade farksız|peşin fiyatına/i.test(r.product.title || '')
    ) : false,
    product: r.product ? {
      url: r.product.url,
      // Kısmi sonuç kartları ilerleme (onProgress) nesnesinden üretilir; o aşamada
      // pipeline henüz `afiliyeUrl` eklememiş olur. Bu yüzden referans BURADA,
      // güncel ayardan üretilir (fiyat/sıralama dokunulmaz).
      afiliyeUrl: r.product.afiliyeUrl || afiliyeLink(r.site, r.product.url || ''),
      title: r.product.title,
      brand: r.product.brand,
      modelCode: r.product.modelCode,
      barcode: r.product.barcode,
      color: r.product.color,
      inStock: r.product.inStock,
      seller: r.product.seller,
      image: r.product.image,
      sellingPrice: r.product.sellingPrice,
      listPrice: r.product.listPrice,
      shipping: r.product.shipping,
      campaigns: r.product.campaigns,
      classifiedCampaigns: r.product.classifiedCampaigns,
      pricing: r.product.pricing,
      // 🧾 KDV şeffaflığı (2026-10-31): KDV dahil fiyat + hariç tutar.
      vatIncluded: r.product.vatIncluded ?? null,
      vatRate: r.product.vatRate ?? null,
      priceExVat: r.product.priceExVat ?? null,
      // Birim fiyat (₺/kg / ₺/L) — canlı kartlarda da görünsün (2026-10-29).
      // Kısmi (onProgress) aşamasında henüz hesaplanmamış olabilir; burada üretilir.
      birim: r.product.birim || birimFiyat(r.product),
      // Varyant şeffaflığı (2026-11-03): Shopify gibi çok varyantlı mağazalarda
      // hangi varyantın seçildiği görünür olsun.
      varyant: r.product.varyant || null,
      // 🧵 Filament/reçine birim fiyat rozeti (2026-11-01).
      birimHesap: birimFiyatHesapla(
        r.product.title,
        r.product.pricing?.toplam ?? r.product.sellingPrice,
      ),
    } : null,
    // 🖨️ 3D Baskı Uzmanlık Modülü (2026-10-30): kart düzeyinde (pipeline ile aynı
    // sözleşme). Kısmi sonuç kartlarında da widget/rozet görünsün.
    baski: r.product ? baskiKartiBilgisi({
      ...r.product,
      birim: r.product.birim || birimFiyat(r.product),
      // Varyant şeffaflığı (2026-11-03): Shopify gibi çok varyantlı mağazalarda
      // hangi varyantın seçildiği görünür olsun.
      varyant: r.product.varyant || null,
    }) : null,
  });

  const yeniKarsilastirma = (ek = {}) => yeniJob('compare', {
    url,
    // Ürün ADI ile gelen aramalarda site henüz çözülmemiştir (asenkron çözülür).
    site: site?.id || null,
    progress: {},
    kaynak: null,
    partialResults: [],
    // Opsiyonel site alt kümesi + zaman aşımı (teşhis/test) — yoksa tüm siteler.
    ...(Array.isArray(req.body?.siteler) && req.body.siteler.length
      ? { siteler: req.body.siteler.filter(s => typeof s === 'string') } : {}),
    ...(Number(req.body?.siteTimeoutMs) > 0 ? { siteTimeoutMs: Number(req.body.siteTimeoutMs) } : {}),
    // İptal: kullanıcı butona basınca abort() çağrılır; pipeline kalan siteleri atlar.
    iptalKontrolu: new AbortController(),
    ...ek,
  });

  const tazeZorla = req.body?.taze === true;
  const swrMaxYasMs = config.snapshotTtlMs > 0 ? Math.max(config.snapshotTtlMs, BAYAT_SWR_MAX_YAS_MS) : 0;
  const tazelemeTamamlandi = (anlik, job, yeni) => {
    job.result = yeni;
    job.kaynak = yeni.kaynak || job.kaynak;
    job.tazeleniyor = false;
    job.tazelemeBitti = true;
    job.tazelemeFarki = fiyatFarki(anlik.payload, yeni);
    job.anlikTs = Date.now();
    job.anlikYasMs = 0;
    job.surum = (job.surum || 1) + 1;
  };
  const tazelemeHataAldi = (job, e) => {
    job.tazeleniyor = false;
    job.tazelemeHatasi = String(e.message || e);
    job.surum = (job.surum || 1) + 1;
  };
  const arkaPlanTazelemeBaslat = (hedefUrl, anlik, job) => {
    job.mod = 'tazeleme';
    job.tazeleniyor = true;
    job.surum = 1;
    job.anlikTs = anlik.ts;
    job.anlikYasMs = anlik.yasMs;
    job.status = 'done';
    job.result = anlik.payload;
    job.kaynak = anlik.payload.kaynak || null;
    job.faz = 'bitti';
    job.fazNotu = 'Hafızadan gösteriliyor, arka planda tazeleniyor';
    karsilastirmaCalistir(hedefUrl, job, formatSonuc)
      .then((yeni) => tazelemeTamamlandi(anlik, job, yeni))
      .catch((e) => tazelemeHataAldi(job, e));
  };

  /* ---- 0) ÜRÜN ADIYLA ARAMA: ANLIK SWR + ASENKRON İŞ --------------------
   * Önce son 7 günde bu ürün adıyla alınmış bir snapshot varsa HEMEN döndürülür
   * ("2 gün önce tarandı · canlı güncelleniyor") ve arka planda tazelenir.
   */
  if (arananSorgu) {
    const sorguAnlikHam = tazeZorla ? null : sorgudanAnlikAl(arananSorgu, { maxYasMs: swrMaxYasMs });
    if (sorguAnlikHam?.kaynakUrl) {
      const anlik = { ...sorguAnlikHam, payload: baskiZenginlestir(sorguAnlikHam.payload) };
      const hedefSite = detectSite(sorguAnlikHam.kaynakUrl);
      const job = yeniKarsilastirma({
        url: sorguAnlikHam.kaynakUrl,
        site: hedefSite?.id || anlik.payload?.kaynak?.site || null,
        mod: 'tazeleme',
        arananSorgu,
        kaynakAd: anlik.urun || arananSorgu,
        tazeleniyor: true,
        surum: 1,
        anlikTs: anlik.ts,
        anlikYasMs: anlik.yasMs,
      });
      arkaPlanTazelemeBaslat(sorguAnlikHam.kaynakUrl, anlik, job);
      return res.json({
        isId: job.id,
        id: job.id,
        ...anlikBilgisi(anlik),
        surum: job.surum,
        sonuc: anlik.payload,
        onbellekSonuc: anlik.payload,
        stale: true,
        mod: 'tazeleme',
        arama: true,
        sonGuncelleme: anlik.ts,
        yasMs: anlik.yasMs,
        ttlMs: config.snapshotTtlMs,
      });
    }

    const job = yeniKarsilastirma({ mod: 'arama', faz: 'cozum', arananSorgu });
    job.arananSorgu = arananSorgu;

    // Arka plan işçisi — yanıt döndükten SONRA çalışır.
    (async () => {
      const simdi = () => Date.now();
      const fazAyarla = (faz, not) => { job.faz = faz; job.fazNotu = not || null; };
      try {
        fazAyarla('cozum', 'Ürün aranıyor…');

        // 🧭 Katman 0: yerel katalog/geçmiş (kırılgan olmayan mağaza varsa)
        let bulunan = null;
        let yedekRadar = null;
        try {
          const yerel = katalogGetir({ sadeceAktif: true })
            .find(k => adAnahtariBenzer(k.ad, arananSorgu));
          if (yerel) {
            const durum = radarDurumVerisi(yerel.id);
            const yerelUrl = durum?.afiliyeUrl || durum?.hamUrl || yerel.url;
            const yerelSite = yerelUrl ? detectSite(yerelUrl) : null;
            const yerelSiteId = durum?.siteId || yerelSite?.id || null;
            if (yerelUrl && yerelSite) {
              const kayit = {
                url: yerelUrl,
                siteId: yerelSiteId,
                ad: yerel.ad,
                katman: 0,
                kaynak: 'katalog',
                katalogYasMs: durum?.ts ? Math.max(0, Date.now() - Number(durum.ts)) : null,
                guncellemeTs: durum?.ts || null,
              };
              // Radar URL'si Trendyol/Amazon gibi kırılgan bir sitedeyse hemen ona
              // kilitlenme — önce açık mağazaları ara, kırılgan URL'yi yedek tut.
              if (KIRILGAN_KAYNAK_SITELER.has(yerelSiteId)) {
                yedekRadar = kayit;
              } else {
                bulunan = kayit;
                job.katman = 0;
              }
            }
          }
        } catch { /* katalog okunamadı → katman 1 */ }

        // 🧭 Katman 1+: dış mağaza araması — ÖNCE yerel katalog indeksi denenir
        // (hizliKaynakUrunBul içinde). Katalogdan geldiyse katman 0 sayılır ve
        // kaydın yaşı istemciye taşınır (arayüz "X dk önce" yazar).
        if (!bulunan) {
          job.katman = 1;
          fazAyarla('cozum', 'Ürün mağazalarda aranıyor…');
          const ham = await hizliKaynakUrunBul(arananSorgu, {
            signal: job.iptalKontrolu?.signal || null,
          });
          if (ham?.url) {
            const katalogdan = ham.kaynak === 'katalog';
            bulunan = {
              url: ham.url,
              siteId: ham.siteId || null,
              ad: ham.title || null,
              katman: katalogdan ? 0 : 1,
              kaynak: ham.kaynak || null,
              katalogYasMs: ham.katalogYasMs ?? null,
              guncellemeTs: ham.guncellemeTs ?? null,
              yedekAdaylar: Array.isArray(ham.yedekAdaylar) ? ham.yedekAdaylar : [],
            };
            if (katalogdan) fazAyarla('cozum', 'Ürün yerel katalog indeksinde bulundu.');
          } else if (yedekRadar) {
            bulunan = yedekRadar;
          }
        }

        // Aday URL listesi: açık mağazalar en başta, kırılgan siteler yedekte.
        const hamAdaylar = [
          bulunan,
          ...(bulunan?.yedekAdaylar || []),
          ...(yedekRadar && bulunan?.url !== yedekRadar.url ? [yedekRadar] : []),
        ].filter(x => x && x.url && detectSite(x.url));
        const benzersizAdaylar = [];
        const gorulenUrl = new Set();
        for (const a of hamAdaylar) {
          if (gorulenUrl.has(a.url)) continue;
          gorulenUrl.add(a.url);
          benzersizAdaylar.push(a);
        }

        bulunan = benzersizAdaylar[0] || bulunan || null;
        if (bulunan?.url) {
          const hedefSite = detectSite(bulunan.url);
          job.url = bulunan.url;
          job.site = hedefSite?.id || bulunan.siteId || null;
          job.kaynakAd = bulunan.ad || bulunan.title || arananSorgu;
          job.kaynakKatmani = (bulunan.kaynak === 'katalog' || bulunan.katman === 0) ? 'katalog' : 'dis-arama';
          job.katalogYasMs = bulunan.katalogYasMs ?? null;
          if (job.kaynakKatmani === 'katalog') job.katman = 0;

          // Anlık (SWR) sonuç varsa hemen sun, arka planda tazele.
          const anlikHam = tazeZorla ? null : anlikAl(bulunan.url, { maxYasMs: swrMaxYasMs });
          const anlik = anlikHam ? { ...anlikHam, payload: baskiZenginlestir(anlikHam.payload) } : null;
          if (anlik) {
            arkaPlanTazelemeBaslat(bulunan.url, anlik, job);
            return;
          }
        }

        // Aday kaynak URL'lerini sırayla dene (örn. Trendyol 403 verirse otomatik
        // sonraki mağazaya düş); hiçbiri okunamazsa doğrudan sorguyla tüm açık
        // mağazaları tara (`runComparisonByQuery`).
        let result = null;
        for (let idx = 0; idx < benzersizAdaylar.length; idx++) {
          if (job.iptalKontrolu?.signal?.aborted) break;
          const aday = benzersizAdaylar[idx];
          const adaySite = detectSite(aday.url);
          job.url = aday.url;
          job.site = adaySite?.id || aday.siteId || null;
          job.kaynakAd = aday.ad || aday.title || arananSorgu;
          fazAyarla(
            idx === 0 ? 'tarama' : 'cozum',
            idx === 0 ? 'Mağazalar taranıyor…' : `${adaySite?.name || 'Alternatif mağaza'} üzerinden okunuyor…`
          );
          try {
            result = await karsilastirmaCalistir(aday.url, job, formatSonuc);
            break;
          } catch (e) {
            if (job.iptalKontrolu?.signal?.aborted) throw e;
            console.warn('[arama] kaynak okunamadı, yedek deneniyor:', adaySite?.id || aday.url, '|', String(e.message || e).slice(0, 100));
            job.partialResults = [];
            job.progress = {};
            job.kaynak = null;
          }
        }

        if (!result) {
          job.site = null;
          job.url = arananSorgu;
          job.kaynakAd = arananSorgu;
          fazAyarla('tarama', 'Mağazalar ürün adıyla doğrudan taranıyor…');
          result = await karsilastirmaCalistir(null, job, formatSonuc, { arananSorgu });
          if (result?.kaynak) {
            job.url = result.kaynak.url || job.url;
            job.site = result.kaynak.site || null;
            job.kaynakAd = result.kaynak.urun || arananSorgu;
          }
        }

        job.status = 'done';
        job.result = result;
        fazAyarla('bitti', null);
      } catch (e) {
        job.status = 'error';
        job.error = String(e.message || e);
        fazAyarla('hata', job.error);
      }
    })();

    return res.json({ isId: job.id, id: job.id, arama: true, anlik: false, faz: 'cozum' });
  }

  // ---- 1) ANLIK SONUÇ (2026-10-29) ----
  // Ürün son 7 gün içinde taranmışsa: sonucu HEMEN döndür, arka planda tazele.
  const anlikHam = tazeZorla ? null : (anlikAl(url) || anlikAl(url, { maxYasMs: swrMaxYasMs }));
  // Eski snapshot'larda 3D alanları yoksa okuma anında türet (0 sn korunur).
  const anlik = anlikHam ? { ...anlikHam, payload: baskiZenginlestir(anlikHam.payload) } : null;
  if (anlik) {
    const job = yeniKarsilastirma({
      mod: 'tazeleme',
      tazeleniyor: true,
      surum: 1,
      anlikTs: anlik.ts,
      anlikYasMs: anlik.yasMs,
    });
    job.status = 'done';
    job.result = anlik.payload;
    job.kaynak = anlik.payload.kaynak || null;

    karsilastirmaCalistir(url, job, formatSonuc)
      .then((yeni) => tazelemeTamamlandi(anlik, job, yeni))
      .catch((e) => tazelemeHataAldi(job, e));

    return res.json({
      isId: job.id,
      id: job.id,
      ...anlikBilgisi(anlik),
      surum: job.surum,
      sonuc: anlik.payload,
      // SWR sözleşmesi (2026-10-30): istemci iki biçimi de kabul eder.
      // `onbellekSonuc` = önbellekten dönen son tarama, `stale:true` = bayat
      // (arka planda tazeleniyor). Geriye dönük uyumluluk için `sonuc` korunur.
      onbellekSonuc: anlik.payload,
      stale: true,
      mod: 'tazeleme',
      sonGuncelleme: anlik.ts,
      yasMs: anlik.yasMs,
      ttlMs: config.snapshotTtlMs,
    });
  }

  // ---- 2) NORMAL TARAMA ----
  const job = yeniKarsilastirma();
  karsilastirmaCalistir(url, job, formatSonuc)
    .then(result => { job.status = 'done'; job.result = result; })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id, anlik: false });
});

app.get('/api/compare/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    site: job.site,
    progress: job.progress,
    kaynak: job.kaynak || job.result?.kaynak || null,
    partialResults: job.partialResults || [],
    // Eski (3D alanları yazılmadan önce kaydedilmiş) işler de widget/rozet görsün.
    result: job.result ? baskiZenginlestir(job.result) : job.result,
    error: job.error,
    sureMs: Date.now() - job.startedAt,
    iptalEdildi: !!(job.result?.ozet?.iptalEdildi || job.iptalIstendi),

    // ---- Anlık sonuç (stale-while-revalidate) durumu, 2026-10-29 ----
    // `surum` her yeni fiyatla ARTAR; istemci sürüm değişince kartları yeniden çizer.
    mod: job.mod || null,
    surum: job.surum ?? 0,
    tazeleniyor: !!job.tazeleniyor,
    tazelemeBitti: !!job.tazelemeBitti,
    tazelemeHatasi: job.tazelemeHatasi || null,
    tazelemeFarki: job.tazelemeFarki || null,
    anlikTs: job.anlikTs || null,
    anlikYasMs: job.anlikYasMs ?? null,
    yasMetni: job.anlikYasMs != null ? yasMetni(job.anlikYasMs) : null,
    // 🧭 Aşama bilgisi (ürün adı araması)
    faz: job.faz || null,
    fazNotu: job.fazNotu || null,
    katman: job.katman ?? null,
    arananSorgu: job.arananSorgu || null,
    kaynakKatmani: job.kaynakKatmani || null,
    katalogYasMs: job.katalogYasMs ?? null,
    url: job.url || null,
    kaynakAd: job.kaynakAd || null,
  });
});

/**
 * Karşılaştırmayı iptal eder (2026-10-27 kullanıcı isteği).
 *
 * Davranış: kalan siteler TARANMAZ, o ana kadar bulunan ürünler korunur ve kısmi
 * sonuç gösterilir. O anda uçuşta olan (en fazla eşzamanlılık kadar) istek kendi
 * zaman aşımına kadar sürer — ağ isteğini zorla kesmek yarım yanıt/kaynak sızıntısı
 * üretiyordu; yeni istek açılmaması süreyi saniyeler mertebesine indiriyor.
 */
app.post('/api/compare/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'compare') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  // Arka plan tazelemesi sürüyorsa da iptal edilebilir (2026-10-29): işin durumu
  // 'done' olabilir ama tazeleme devam ediyor. İptalde eski (anlık) sonuç korunur.
  if (job.status !== 'running' && !job.tazeleniyor) {
    return res.json({ ok: true, zatenBitti: true, status: job.status });
  }
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal edilmiş */ }
  if (job.tazeleniyor) {
    job.tazeleniyor = false;
    job.tazelemeHatasi = 'Tazeleme kullanıcı tarafından durduruldu';
    job.surum = (job.surum || 1) + 1;
  }
  // Tarama sürerken bile çiplerin "iptal" görünmesi için ilerlemeyi işaretle
  const iptalProgress = { ...(job.progress || {}) };
  let degisti = false;
  for (const [siteId, p] of Object.entries(iptalProgress)) {
    if (p && p.status === 'running') {
      iptalProgress[siteId] = { ...p, status: 'iptal', note: 'Kullanıcı iptal etti' };
      degisti = true;
    }
  }
  // Yeni nesne ataması → Proxy diske yazar + SSE yayınlar (2026-10-29)
  if (degisti) job.progress = iptalProgress;
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * Sepet optimizasyonu (2026-10-27): 2-10 ürün linki alır, her ürünü sitelerde
 * arar ve üç senaryo üretir (tek mağaza / akıllı bölünmüş / maksimum tasarruf).
 */
app.post('/api/sepet', (req, res) => {
  const urunler = Array.isArray(req.body?.urunler) ? req.body.urunler : [];
  if (urunler.length < 2) return res.status(400).json({ hata: 'Sepet için en az 2 ürün gerekli' });
  if (urunler.length > 10) return res.status(400).json({ hata: 'Sepet en fazla 10 ürün alabilir' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('sepet', {
    urunSayisi: urunler.length,
    progress: {},
    hizliMod: req.body?.hizliMod !== false,
    iptalKontrolu: new AbortController(),
  });

  sepetOptimize(urunler, {
    signal: job.iptalKontrolu.signal,
    concurrency: 2,
    hizliMod: req.body?.hizliMod !== false,
    onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
  })
    .then(result => {
      job.status = 'done';
      job.result = result;
    })
    .catch(e => {
      job.status = 'error';
      job.error = String(e.message || e);
    });

  res.json({ isId: job.id });
});

app.get('/api/sepet/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'sepet') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
    iptalEdildi: !!(job.result?.iptalEdildi || job.iptalIstendi),
  });
});

app.post('/api/sepet/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'sepet') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * 📤 Sepet paylaşımı (2026-11-01).
 *
 * POST /api/sepet/paylas { sepet: <sepet sonucu> } → { id, url, path }
 * Sepet sonucu SQLite'ta saklanır; dönen kısa link herkese açık salt okunur
 * sayfaya gider. Yalnızca gerekli alanlar saklanır (boyut sınırı: 200 KB).
 */
app.post('/api/sepet/paylas', (req, res) => {
  const sepet = req.body?.sepet;
  if (!sepet || typeof sepet !== 'object' || !sepet.senaryolar) {
    return res.status(400).json({ hata: 'Paylaşılacak sepet sonucu gerekli' });
  }
  let boyut = 0;
  try { boyut = JSON.stringify(sepet).length; } catch { return res.status(400).json({ hata: 'Sepet serileştirilemedi' }); }
  if (boyut > 200_000) return res.status(413).json({ hata: 'Sepet çok büyük (200 KB sınırı)' });

  const id = store.sepetPaylasKaydet(sepet);
  if (!id) return res.status(500).json({ hata: 'Sepet kaydedilemedi' });
  const yol = '/sepet/paylas/' + id;
  const kok = `${req.protocol}://${req.get('host') || ('localhost:' + config.port)}`;
  res.json({ id, path: yol, url: kok + yol });
});

/** Paylaşılan sepeti JSON olarak döndürür (herkese açık). */
app.get('/api/sepet/paylas/:id', (req, res) => {
  const kayit = store.sepetPaylasAl(req.params.id);
  if (!kayit) return res.status(404).json({ hata: 'Paylaşılan sepet bulunamadı ya da süresi doldu' });
  res.json(kayit);
});

/** Paylaşım sayfası (salt okunur). */
app.get('/sepet/paylas/:id', (req, res) => {
  if (!store.sepetPaylasAl(req.params.id)) {
    return res.status(404).type('html').send(
      '<!doctype html><html lang="tr"><meta charset="utf-8"><title>Sepet bulunamadı</title>'
      + '<body style="font-family:system-ui;padding:48px;text-align:center;background:#F8FAFC">'
      + '<h1>🔍 Sepet bulunamadı</h1><p>Bağlantı geçersiz ya da 30 günlük saklama süresi dolmuş olabilir.</p>'
      + '<a href="/" style="color:#4338CA;font-weight:700">Baskı Hesap ana sayfa</a></body></html>',
    );
  }
  res.sendFile(path.join(__dirname, 'public', 'sepet-paylas.html'));
});

/**
 * Kargo bedava tamamlayıcı önerileri (2026-10-27).
 * Örnek: POST /api/tamamlayici { site:'trendyol', sepetToplam:470, kargo:{fee:50, freeOver:500} }
 */
app.post('/api/tamamlayici', async (req, res) => {
  const site = String(req.body?.site || '').trim();
  const sepetToplam = Number(req.body?.sepetToplam);
  const kargo = req.body?.kargo || null;
  if (!site) return res.status(400).json({ hata: 'site gerekli' });
  if (!isFinite(sepetToplam) || sepetToplam <= 0) return res.status(400).json({ hata: 'sepetToplam gerekli' });
  if (!kargo) return res.status(400).json({ hata: 'kargo bilgisi gerekli' });

  try {
    const sonuc = await tamamlayiciBul(site, { sepetToplam, kargo });
    res.json(sonuc);
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

/**
 * Canlı barkod arama (2026-10-28): fiziksel mağazada okutulan barkodu sitelerde arar.
 * POST /api/barkod { barkod, rafFiyat? }
 */
app.post('/api/barkod', (req, res) => {
  const barkod = String(req.body?.barkod || '').trim();
  const rafFiyat = req.body?.rafFiyat != null ? Number(req.body.rafFiyat) : null;
  if (!barkod) return res.status(400).json({ hata: 'barkod gerekli' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('barkod', {
    barkod,
    rafFiyat: isFinite(rafFiyat) ? rafFiyat : null,
    progress: {},
    iptalKontrolu: new AbortController(),
  });

  barkodAra(barkod, {
    signal: job.iptalKontrolu.signal,
    hizliMod: req.body?.hizliMod !== false,
    onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
  })
    .then(result => { job.status = 'done'; job.result = result; })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id });
});

app.get('/api/barkod/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'barkod') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    barkod: job.barkod,
    rafFiyat: job.rafFiyat,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

app.post('/api/barkod/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'barkod') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * Görsel ürün arama (2026-10-28): fotoğraftan ürün tanıma + site taraması.
 * POST /api/gorsel { gorsel: "data:image/jpeg;base64,...", ipucu?, hizliMod? }
 */
app.post('/api/gorsel', (req, res) => {
  const ham = String(req.body?.gorsel || '');
  if (!ham) return res.status(400).json({ hata: 'gorsel gerekli (base64)' });
  if (ham.length > 8 * 1024 * 1024) return res.status(413).json({ hata: 'Görsel çok büyük (en fazla 4 MB)' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  // data URL'den mime çıkar
  const mimeEslesme = ham.match(/^data:([^;]+);base64,/);
  const mime = mimeEslesme ? mimeEslesme[1] : 'image/jpeg';

  const job = yeniJob('gorsel', {
    ipucu: String(req.body?.ipucu || '').slice(0, 200),
    progress: {},
    iptalKontrolu: new AbortController(),
  });

  gorselAramaYap(
    { base64: ham, mime, ipucu: job.ipucu },
    {
      signal: job.iptalKontrolu.signal,
      hizliMod: req.body?.hizliMod !== false,
      onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
    },
  )
    .then(result => { job.status = 'done'; job.result = result; })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id });
});

app.get('/api/gorsel/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'gorsel') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

app.post('/api/gorsel/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'gorsel') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});


// ---- 🔍 Arama önerileri (typeahead) — 2026-11-01 ----
// Yerel kaynaklar: popüler 3D katalog + arama geçmişi + takipler + taranmış başlıklar.
// Hedef yanıt süresi < 10 ms; ölçüm `sureMs` alanında döner.
//
// Sözleşme:
//   { oneriler: ["Bambu Lab P1S", ...],          ← temiz metin listesi (spec)
//     onerilerDetay: [{metin,tur,etiket,url}],   ← zengin liste (ikon/etiket/link)
//     sureMs, kaynakSayisi }
app.get('/api/search-suggestions', (req, res) => {
  const bas = process.hrtime.bigint();
  const sorgu = String(req.query.q || '').trim().slice(0, 80);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 8, 20));

  // 1 karakterde öneri gösterilmez (spec: en az 2 karakter).
  const detay = sorgu.length === 1
    ? []
    : onerileriGetir(sorgu, { limit, bosSorguPopuler: req.query.populer !== '0' });
  const oneriler = detay.map(o => o.metin);
  const sureMs = Number(process.hrtime.bigint() - bas) / 1e6;

  res.set('Cache-Control', 'no-store');
  res.json({
    sorgu,
    oneriler,
    onerilerDetay: detay,
    sureMs: Math.round(sureMs * 100) / 100,
    kaynakSayisi: {
      populer: detay.filter(o => o.tur === 'populer').length,
      gecmis: detay.filter(o => o.tur === 'gecmis').length,
      takip: detay.filter(o => o.tur === 'takip').length,
      tarama: detay.filter(o => o.tur === 'tarama').length,
    },
  });
});

// ---- 🔗 Link ile arama (2026-10-31) ----// Hibrit kutuya yapıştırılan bağlantıyı çözer: mağaza tanıma + ürün adı çıkarımı.
// Ağ isteği yapmaz, yalnızca URL analizi; bu yüzden yazarken canlı önizleme için uygundur.
app.post('/api/link-coz', (req, res) => {
  const r = linkCoz(req.body?.url);
  res.status(r.neden === 'bos' ? 400 : 200).json(r);
});

// ---- Ayarlar ----
/**
 * Ön yüze dönen ayar görünümü.
 *
 * GİZLİ alanlar asla dışarı çıkmaz: SMTP şifresi ve **Web Push özel anahtarı**
 * (VAPID private key). VAPID public anahtarı /api/push/vapid-key üzerinden verilir.
 */
function ayarGorunumu(s) {
  const webpush = s.webpush
    ? {
      publicKey: s.webpush.publicKey || null,
      subject: s.webpush.subject || null,
      privateKeyVar: Boolean(s.webpush.privateKey),
    }
    : null;
  return {
    ...s,
    smtp: { ...s.smtp, pass: s.smtp?.pass ? '***' : '' },
    // 📢 WhatsApp: token yalnızca sunucuda; ön yüze varlığı bildirilir.
    whatsapp: s.whatsapp
      ? {
        ...s.whatsapp,
        token: '',
        tokenVar: Boolean(s.whatsapp.token),
      }
      : s.whatsapp,
    webpush,
  };
}

app.get('/api/settings', adminGerekli, (req, res) => {
  res.json(ayarGorunumu(store.getSettings()));
});

app.post('/api/settings', adminGerekli, (req, res) => {
  const patch = req.body || {};
  if (patch.smtp?.pass === '***' || patch.smtp?.pass === '') delete patch.smtp.pass;
  // WhatsApp API token'ı: boş ya da maskeli değer gelirse kayıtlı anahtar korunur.
  if (patch.whatsapp) {
    const wa = { ...patch.whatsapp };
    if (!wa.token || wa.token === '***') delete wa.token;
    patch.whatsapp = wa;
  }
  // Özel anahtar yalnızca sunucuda; ön yüzden gelen boş/'***' değerler yazılmaz.
  if (patch.webpush) {
    const wp = { ...patch.webpush };
    if (!wp.privateKey || wp.privateKey === '***') delete wp.privateKey;
    if (!wp.publicKey) delete wp.publicKey;
    patch.webpush = wp;
  }
  const s = store.saveSettings(patch);
  // Zamanlayıcıları yeniden kur (yanıtı BEKLETMEDEN): ayar kaydı hızlı kalsın.
  setImmediate(() => {
    try { startAlarmScheduler(); } catch (e) {
      console.warn('[gorev] zamanlayıcı güncellenemedi:', String(e.message || e).slice(0, 120));
    }
    // Fırsat kanalı ayarları (aralık/kanal/açık-kapalı) yeniden kurulur.
    try { startFirsatScheduler(); } catch (e) {
      console.warn('[firsat] zamanlayıcı güncellenemedi:', String(e.message || e).slice(0, 120));
    }
    // 🎯 Otonom radar: aralık/açık-kapalı değişince yeniden planlanır.
    try { startRadarScheduler(); } catch (e) {
      console.warn('[radar] zamanlayıcı güncellenemedi:', String(e.message || e).slice(0, 120));
    }
  });
  res.json(ayarGorunumu(s));
});

// ---- Takip edilen ürünler ----
// Güvenlik (2026-11-06): push aboneliğinin endpoint/anahtarları DIŞARI VERİLMEZ;
// yalnızca "bu alarm bir cihaza bağlı mı" bilgisi döner.
app.get('/api/tracked', (req, res) => {
  const liste = store.getTracked().map(t => {
    const { pushSubscription, ...kalan } = t;
    return { ...kalan, pushAlarm: !!pushSubscription };
  });
  res.json(liste);
});

// Hedef fiyat güncelleme (indirim botu)
app.post('/api/tracked/:id/hedef', (req, res) => {
  const hedefFiyat = Number(req.body?.hedefFiyat);
  if (!hedefFiyat || hedefFiyat <= 0) return res.status(400).json({ hata: 'Geçerli bir hedef fiyat gerekli' });
  const guncel = store.updateTracked(req.params.id, { hedefFiyat });
  if (!guncel) return res.status(404).json({ hata: 'Takip bulunamadı' });
  res.json(guncel);
});

// ---- İndirim botu görevi (Yönetici) ----
app.post('/api/alarm/calistir', adminGerekli, async (req, res) => {
  try {
    const r = await checkAlarms();
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

app.post('/api/alarm/test-email', adminGerekli, async (req, res) => {
  try {
    const r = await sendTestEmail();
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

app.post('/api/alarm/test-telegram', adminGerekli, async (req, res) => {
  try {
    const { botToken, chatId } = req.body || {};
    const r = await sendTestTelegram({ botToken, chatId });
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

/**
 * 📢 WhatsApp Fırsat Kanalı testi (2026-11-05).
 * Gövde: { kuru?, ornek? } — ayarlar DB'den okunur, gövdede token taşınmaz.
 * Döner: { ok, saglayici, yontem, hata?, onizleme? }
 */
app.post('/api/alarm/test-whatsapp-kanal', adminGerekli, async (req, res) => {
  try {
    const s = store.getSettings();
    const wa = s.whatsapp || {};
    const dogrulama = whatsappAyarDogrula(wa);
    if (!dogrulama.ok) {
      return res.status(400).json({ ok: false, hata: dogrulama.hatalar.join(' '), hatalar: dogrulama.hatalar });
    }

    const kuru = req.body?.kuru === true;
    const ornek = req.body?.ornek && typeof req.body.ornek === 'object' ? req.body.ornek : null;

    // Gerçek ürün varsa onu kullan (daha anlamlı test); yoksa örnek kart.
    const durum = ornek || {
      ad: 'Test Ürünü — Creality Ender PLA Gri 1kg',
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
      afiliyeUrl: 'https://baskihesap.tech/yonlendir?site=ventatek&sku=ornek',
    };

    const kart = whatsappKartOlustur(durum);
    const sonuc = await whatsappKanalGonder(kart, {
      ayar: wa, kuru, imageUrl: req.body?.imageUrl || null,
    });

    if (!sonuc.ok) return res.status(502).json({ ok: false, ...sonuc, kart });
    res.json({ ok: true, ...sonuc, kart });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e).slice(0, 200) });
  }
});

/** Sağlayıcı listesi (Ayarlar paneli açılır menüsü). */
app.get('/api/whatsapp/saglayicilar', (req, res) => {
  res.json({ ok: true, saglayicilar: SAGLAYICILAR });
});

app.post('/api/alarm/test-whatsapp', adminGerekli, async (req, res) => {
  try {
    const { webhookUrl, phone } = req.body || {};
    const r = await sendTestWhatsApp({ webhookUrl, phone });
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

// ---- 🔔 Web Push (2026-11-01) ----
// VAPID public anahtarı ön yüze verilir; özel anahtar asla dışarı çıkmaz.
app.get('/api/push/vapid-key', (req, res) => {
  const d = pushDurum();
  if (!d.hazir) return res.status(500).json({ hata: d.hata || 'Push hazırlanamadı' });
  res.json({ publicKey: d.publicKey, abone: d.abone });
});

app.post('/api/push/subscribe', (req, res) => {
  const abonelik = req.body?.subscription || req.body;
  const ok = store.pushAbonelikKaydet(abonelik);
  if (!ok) return res.status(400).json({ hata: 'Geçersiz abonelik (endpoint/keys eksik)' });
  res.json({ ok: true, abone: store.pushIstatistik().abone });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint;
  const silindi = store.pushAbonelikSil(endpoint);
  res.json({ ok: true, silindi, abone: store.pushIstatistik().abone });
});

// Test bildirimi: abonelik gerçekten çalışıyor mu? (Ayarlar/ön yüz düğmesi)
app.post('/api/push/test', async (req, res) => {
  try {
    const r = await pushGonder({
      baslik: req.body?.baslik || '🔔 Baskı Hesap — bildirimler açık',
      govde: req.body?.govde || 'Fiyat alarmlarını bu cihazdan alacaksınız.',
      url: req.body?.url || '/',
      etiket: 'eun-test',
    });
    if (!r.abone) return res.status(400).json({ hata: 'Kayıtlı cihaz yok. Önce bildirimleri açın.' });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

app.get('/api/gorev', (req, res) => {
  res.json(gorevDurumu());
});

// ---- 📢 Otonom Fırsat Kanalı (2026-10-30) ----
app.get('/api/firsat/durum', (req, res) => {
  res.json({ ...firsatIstatistik(), varsayilan: FIRSAT_VARSAYILAN });
});

// Kanala test paylaşımı: gerçek fırsat varsa onu, yoksa uydurma fiyat olmadan
// yalnızca bağlantı testi mesajını gönderir.
app.post('/api/firsat/test', adminGerekli, async (req, res) => {
  try {
    const { kanal, botToken } = req.body || {};
    const r = await firsatTestGonder({ kanal, botToken });
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

// Elle tetikleme (Yönetici/test). `taze:true` takip ürünlerini de yeniden tarar.
app.post('/api/firsat/calistir', adminGerekli, async (req, res) => {
  try {
    const r = await firsatlariTara({
      taze: req.body?.taze === true,
      gonder: req.body?.gonder !== false,
      zorla: req.body?.zorla === true,
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ---- 🧮 3D baskı maliyet & kârlılık hesaplayıcı API (2026-11-04) ----
// GET  /api/baski/yazicilar · GET /api/baski/en-ucuz-filamentler · POST /api/baski/hesapla
baskiApiBagla(app);

// ---- 🎯 Otonom 3D Baskı & Filament Fiyat Avcısı (2026-11-02) ----
// Katalog SQLite'ta; Ayarlar panelinden eklenip çıkarılabilir.
app.get('/api/radar/durum', (req, res) => {
  try {
    res.json({ ...radarDurum(), varsayilan: RADAR_VARSAYILAN });
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

// 📊 Ana sayfa "borsa" vitrini — yalnızca herkese açık fiyat alanları.
// Erişim anahtarı tanımlı olsa bile okunabilir (gizli bilgi içermez);
// böylece ziyaretçi anahtarı girmeden canlı piyasayı görür.
/* ------------------------------------------------------------------ */
/* 🔌 Gömülebilir Canlı Fiyat Widget'ı (2026-11-05)                    */
/* ------------------------------------------------------------------ */

/** Widget sayfası: /widget ve /widget.html aynı dosyayı sunar. */
const widgetSayfasi = (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.html'));
};
app.get('/widget', widgetSayfasi);
app.get('/widget.html', widgetSayfasi);

/**
 * Widget verisi (HERKESE AÇIK).
 * Parametreler: ?id=1 · ?urun=bambu-lab-p1s (slug) · ?q=Creality+Ender+PLA
 * Ek: ?ref=maker-blogu (kampanya atfı, CTA'da korunur)
 * Yalnızca herkese açık alanlar döner; token/PID/sohbet kimliği sızmaz.
 */
app.get('/api/widget', (req, res) => {
  try {
    const veri = widgetVerisi({
      id: req.query.id,
      slug: req.query.urun || req.query.slug,
      q: req.query.q,
      ref: req.query.ref,
      tema: req.query.tema,
      tabanUrl: config.publicUrl,
    });
    res.json(veri);
  } catch (e) {
    res.status(500).json({ ok: false, bulundu: false, neden: String(e.message || e) });
  }
});

/**
 * Widget CTA yönlendiricisi: tıklamayı kaydeder ve afiliye linkine 302 atar.
 * Böylece hangi blogun kaç tıklama getirdiği ölçülebilir. Hedef yalnızca
 * kayıtlı üründen türetilir (açık yönlendirme / open-redirect YOK).
 */
app.get('/widget/git', (req, res) => {
  try {
    const veri = widgetVerisi({
      id: req.query.id,
      slug: req.query.urun || req.query.slug,
      q: req.query.q,
      ref: req.query.ref,
      tema: req.query.tema,
      tabanUrl: config.publicUrl,
    });
    if (!veri.bulundu || !veri.hedef) {
      return res.status(404).send('Ürün bulunamadı ya da fiyat kaydı yok.');
    }
    widgetTiklamaKaydet({
      ref: refTemizle(req.query.ref),
      katalogId: veri.urun?.id,
      siteId: veri.urun?.siteId,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, veri.hedef);
  } catch {
    res.status(500).send('Yönlendirme hatası.');
  }
});

/** Widget tıklama istatistiği (yönetici; erişim anahtarıyla korunur). */
app.get('/api/widget/istatistik', (req, res) => {
  try {
    res.json(widgetIstatistik({ gun: req.query.gun }));
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/** Widget oluşturucu önizlemesi: gerçek fiyatlı ilk ürünler. */
app.get('/api/widget/ornekler', (req, res) => {
  try {
    res.json({ ok: true, urunler: widgetOrnekUrunler({ limit: req.query.limit }) });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/* ------------------------------------------------------------------ */
/* 🧩 Slicer Öneri API'si (2026-11-06)                                 */
/* ------------------------------------------------------------------ */
// GET /api/embed/oner?malzeme=PLA&gramaj=340&renk=Siyah&kaynak=cura
// CORS (*), 60 sn önbellek, < 50 ms. Cura / Bambu / Orca / Prusa eklentileri
// dilimleme bittiğinde bu ucu çağırır.
slicerApiBagla(app);

/**
 * Slicer satın alma yönlendiricisi: tıklamayı kaydeder ve afiliye linkine 302 atar.
 * Hedef yalnızca kayıtlı üründen türetilir (açık yönlendirme YOK).
 */
app.get('/yonlendir', (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const id = Number(req.query.urunId);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).send('urunId gerekli.');
    }
    const kayit = widgetVerisi({ id, tabanUrl: config.publicUrl });
    if (!kayit.bulundu || !kayit.hedef) {
      return res.status(404).send('Ürün bulunamadı ya da fiyat kaydı yok.');
    }
    const kaynakHam = refTemizle(req.query.kaynak);
    widgetTiklamaKaydet({
      ref: kaynakHam ? 'slicer-' + kaynakHam : 'slicer',
      katalogId: kayit.urun?.id,
      siteId: kayit.urun?.siteId,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, kayit.hedef);
  } catch {
    res.status(500).send('Yönlendirme hatası.');
  }
});

/* ------------------------------------------------------------------ */
/* ⭐ Sponsorlu Vitrin & Doğrulanmış Mağaza (2026-11-08)                */
/* ------------------------------------------------------------------ */
// Sabit gelir kanalı: hero banner + mavi tik rozeti. Tüm okuma uçları
// herkese açıktır (erişim anahtarı muafiyeti yukarıda tanımlı).

/**
 * GET /api/sponsor/vitrin
 * Yayındaki kampanyayı döner; gösterim sayacını ARTIRIR.
 * Aktif kampanya yoksa `{ ok:true, vitrin:null }` (banner gizlenir).
 */
app.get('/api/sponsor/vitrin', (req, res) => {
  try {
    const vitrin = store.sponsorVitrinGetir();
    if (!vitrin) {
      res.set('Cache-Control', 'no-store');
      return res.json({ ok: true, vitrin: null });
    }
    // Sayaç yanıtı bloklamasın: asenkron artır, hatayı yut.
    setImmediate(() => {
      try { store.sponsorGosterimArtir(vitrin.id); } catch { /* yoksay */ }
    });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, vitrin });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/**
 * GET /api/sponsor/tikla/:id
 * Tıklama sayacını artırır ve 302 ile kampanya URL'sine yönlendirir.
 * Kayıt yoksa/pasifse 404 — açık yönlendirme (open redirect) YOK.
 */
app.get('/api/sponsor/tikla/:id', (req, res) => {
  try {
    const kayit = store.sponsorTiklamaArtir(req.params.id);
    if (!kayit) return res.status(404).type('html').send(
      '<!doctype html><html lang="tr"><meta charset="utf-8"><title>Kampanya bulunamadı</title>'
      + '<body style="font-family:system-ui;padding:48px;text-align:center;background:#F8FAFC">'
      + '<h1>🔍 Kampanya bulunamadı</h1><p>Bağlantı geçersiz ya da kampanya sona ermiş olabilir.</p>'
      + '<a href="/" style="color:#3450D1;font-weight:700">Baskı Hesap ana sayfa</a></body></html>',
    );

    // Güvenlik: yalnızca http(s). Şemalar veritabanında doğrulanıyor, burada
    // ikinci savunma katmanı (ileride elle eklenen kayıt için).
    let hedef;
    try { hedef = new URL(kayit.yonlendirmeUrl); } catch { return res.status(500).send('Kampanya adresi geçersiz.'); }
    if (!/^https?:$/.test(hedef.protocol)) return res.status(500).send('Kampanya adresi geçersiz.');

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, hedef.href);
  } catch {
    res.status(500).send('Yönlendirme hatası.');
  }
});

/**
 * GET /api/dogrulanmis-magazalar
 * Mavi tikli mağazalar + rozet metinleri. 5 dk tarayıcı/CDN önbelleği.
 */
app.get('/api/dogrulanmis-magazalar', (req, res) => {
  try {
    const magazalar = store.dogrulanmisMagazalariGetir();
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json({
      ok: true,
      magazalar,
      // Hızlı arama için siteId → rozet sözlüğü (istemci tek sorgu yapsın).
      harita: Object.fromEntries(magazalar.map(m => [m.siteId, m.rozetMetni])),
    });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/**
 * GET /api/admin/sponsor-rapor?id=...
 * Reklamveren performans raporu (gösterim / tıklama / CTR).
 * Erişim anahtarı korumalıdır (yukarıdaki genel /api kuralı).
 */
app.get('/api/admin/sponsor-rapor', adminGerekli, (req, res) => {
  try {
    if (req.query.id) {
      const tek = store.sponsorRaporTek(req.query.id);
      if (!tek) return res.status(404).json({ ok: false, hata: 'Kampanya bulunamadı' });
      return res.json({ ok: true, kampanya: tek });
    }
    const kampanyalar = store.sponsorRapor();
    const toplam = kampanyalar.reduce((s, k) => ({
      gosterim: s.gosterim + k.gosterimSayisi,
      tiklama: s.tiklama + k.tiklamaSayisi,
    }), { gosterim: 0, tiklama: 0 });
    res.json({
      ok: true,
      kampanyalar,
      toplam: {
        ...toplam,
        ctr: toplam.gosterim > 0
          ? Math.round((toplam.tiklama / toplam.gosterim) * 10000) / 100
          : null,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

/**
 * POST /api/admin/sponsor-vitrin
 * Yönetici: kampanya ekle/güncelle. Gövde doğrulanır (URL şeması, tarihler,
 * pozitif fiyat). Hatalı gövde 400, sessiz kabul YOK.
 */
app.post('/api/admin/sponsor-vitrin', adminGerekli, (req, res) => {
  try {
    const vitrin = store.sponsorVitrinKaydet(req.body || {});
    res.json({ ok: true, vitrin });
  } catch (e) {
    res.status(400).json({ ok: false, hata: String(e.message || e) });
  }
});

/** DELETE /api/admin/sponsor-vitrin/:id — yönetici kampanya silme. */
app.delete('/api/admin/sponsor-vitrin/:id', adminGerekli, (req, res) => {
  const silindi = store.sponsorVitrinSil(req.params.id);
  res.json({ ok: true, silindi });
});

/** POST /api/admin/dogrulanmis-magaza — yönetici mavi tik ekle/güncelle. */
app.post('/api/admin/dogrulanmis-magaza', adminGerekli, (req, res) => {
  try {
    const magaza = store.dogrulanmisMagazaKaydet(req.body || {});
    res.json({ ok: true, magaza });
  } catch (e) {
    res.status(400).json({ ok: false, hata: String(e.message || e) });
  }
});

/** DELETE /api/admin/dogrulanmis-magaza/:siteId — yönetici rozet silme. */
app.delete('/api/admin/dogrulanmis-magaza/:siteId', adminGerekli, (req, res) => {
  const silindi = store.dogrulanmisMagazaSil(req.params.siteId);
  res.json({ ok: true, silindi });
});

app.get('/api/vitrin', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 12;
    const veri = vitrinVerisi({ limit });
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json(veri);
  } catch (e) {
    res.status(500).json({ ok: false, hata: String(e.message || e) });
  }
});

app.get('/api/radar/katalog', (req, res) => {
  try {
    res.json({ katalog: katalogGetir() });
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

app.post('/api/radar/katalog', adminGerekli, (req, res) => {
  try {
    const { ad, sorgu, url, kategori } = req.body || {};
    res.json(katalogEkle({ ad, sorgu, url, kategori }));
  } catch (e) {
    res.status(400).json({ hata: String(e.message || e) });
  }
});

app.delete('/api/radar/katalog/:id', adminGerekli, (req, res) => {
  try {
    const silindi = katalogSil(req.params.id);
    if (!silindi) return res.status(404).json({ hata: 'Katalog kaydı bulunamadı' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

app.post('/api/radar/katalog/sifirla', adminGerekli, (req, res) => {
  try {
    res.json({ katalog: katalogSifirla() });
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

// Taramayı başlatır. Varsayılan: arka planda (HTTP isteği beklemez).
// `{ bekle:true }` → senkron (CLI/test).
app.post('/api/radar/calistir', adminGerekli, async (req, res) => {
  try {
    const b = req.body || {};
    const opts = {
      gonder: b.gonder !== false,
      kuru: b.kuru === true,
      zorla: b.zorla !== false,
      limit: Number.isFinite(Number(b.limit)) ? Number(b.limit) : undefined,
      urunId: Number.isFinite(Number(b.urunId)) ? Number(b.urunId) : undefined,
      urunArasiMs: Number.isFinite(Number(b.urunArasiMs)) ? Number(b.urunArasiMs) : undefined,
    };
    if (b.bekle === true) {
      const r = await radarTara(opts);
      return res.json(r);
    }
    res.json(radarBaslat(opts));
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

// `/api/takip` aynı uç noktanın Türkçe takma adıdır (sıfır sürtünmeli alarm).
app.post(['/api/tracked', '/api/takip'], (req, res) => {
  const { sonuc, hedefFiyat, pushSubscription } = req.body || {};
  if (!sonuc?.kaynak) return res.status(400).json({ hata: 'Karşılaştırma sonucu gerekli' });
  const found = (sonuc.sonuclar || []).filter(r => r.status === 'found' && r.product?.pricing);
  // 🔔 Sıfır sürtünmeli alarm (2026-11-06): abonelik yalnızca bu takibe bağlanır.
  // E-posta/telefon/şifre istenmez; bozuk abonelik sessizce yok sayılır.
  const push = store.pushAbonelikNormalize(pushSubscription);
  const urunler = found.map(r => ({ site: r.site, url: r.product.url }));

  // Aynı cihaz + aynı ürün için ikinci kayıt açma: hedefi ve aboneliği güncelle.
  if (push) {
    const anahtar = sonuc.kaynak.modelKodu || sonuc.kaynak.urun;
    const mevcut = store.getTracked().find(t =>
      t.pushEndpoint === push.endpoint && (t.modelKodu || t.urun) === anahtar);
    if (mevcut) {
      const guncel = store.updateTracked(mevcut.id, {
        hedefFiyat: Number(hedefFiyat) || mevcut.hedefFiyat,
        pushSubscription: push,
        urunler: urunler.length ? urunler : mevcut.urunler,
        image: found[0]?.product?.image || mevcut.image,
      });
      return res.json({ ...guncel, pushAlarm: true, guncellendi: true });
    }
  }

  const item = store.addTracked({
    modelKodu: sonuc.kaynak.modelKodu,
    urun: sonuc.kaynak.urun,
    renk: sonuc.kaynak.renk,
    image: found[0]?.product?.image || null,
    hedefFiyat,
    urunler,
    pushSubscription: push,
  });

  // Telegram aktifse anında teyit bildirimi gönder
  const s = store.getSettings();
  if (s.telegram?.enabled && s.telegram?.botToken && s.telegram?.chatId) {
    const u = sonuc.kaynak.urun || 'Ürün';
    const hedef = Number(hedefFiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
    const msg = '🔔 <b>Yeni Ürün Takibe Alındı!</b>\n\n📦 <b>' + u + '</b>\n🎯 Hedef Fiyat: <b>' + hedef + '</b>\n\nFiyat 60 siteden herhangi birinde ' + hedef + ' altına düştüğünde Telegram\'dan anında haber vereceğim! 🚀';
    sendTestTelegram({ botToken: s.telegram.botToken, chatId: s.telegram.chatId, icerik: msg, konu: 'Fiyat Alarmı Kuruldu' }).catch(() => {});
  }

  res.json({ ...item, pushAlarm: !!push });
});

app.delete('/api/tracked/:id', (req, res) => {
  store.removeTracked(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tracked/:id/check', async (req, res) => {
  const t = store.getTracked().find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ hata: 'Takip bulunamadı' });
  try {
    const r = await checkAlarms();
    res.json({ ok: true, sonuc: r });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ---- Geçmiş ve durum ----
// Son aramalar: her kayda ürün linki + (varsa) en ucuz mağaza linki eklenir.
// Eski kayıtlarda `enUcuzUrl` yoksa güncel snapshot'tan tamamlanır (diskten okuma).
app.get('/api/history', (req, res) => {
  const liste = store.getHistory();
  const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const h of liste) {
    if (h.enUcuzUrl) continue;
    // 1) Güncel snapshot'tan en ucuz teklifin adresi (diskten okuma).
    try {
      const anlik = anlikAl(h.url);
      const teklif = (anlik?.payload?.sonuclar || []).find(s =>
        s.enUcuz && s.status === 'found' && s.product);
      if (teklif?.product) {
        h.enUcuzUrl = teklif.product.afiliyeUrl || teklif.product.url || null;
        h.enUcuzSiteId = h.enUcuzSiteId || teklif.site || null;
      }
    } catch { /* yoksay */ }
    if (h.enUcuzUrl) continue;
    // 2) En ucuz mağaza kaynak sitenin kendisiyse kaynak link zaten cevaptır.
    //    (Uydurma yok: yalnızca host ile mağaza adı eşleştiğinde.)
    try {
      const host = normalize(new URL(h.url).hostname.replace(/^www\./, ''));
      const site = normalize(h.enUcuzSite);
      if (site && host && (host.startsWith(site) || site.startsWith(host))) {
        h.enUcuzUrl = h.url;
        h.enUcuzSiteId = h.enUcuzSiteId || null;
      }
    } catch { /* geçersiz URL */ }
  }
  res.json(liste);
});

app.get('/api/price-history/:id?', (req, res) => {
  const pid = req.params.id || req.query.id;
  const currentPrice = req.query.currentPrice ? parseFloat(req.query.currentPrice) : null;
  const currentAvg = req.query.currentAvg ? parseFloat(req.query.currentAvg) : null;
  const currentMax = req.query.currentMax ? parseFloat(req.query.currentMax) : null;
  res.json(store.getPriceAnalytics(pid, { currentPrice, currentAvg, currentMax }));
});

app.post('/api/price-history', (req, res) => {
  const { productId, currentPrice, currentAvg, currentMax, currentItems } = req.body || {};
  res.json(store.getPriceAnalytics(productId, { currentPrice, currentAvg, currentMax, currentItems }));
});

// Sağlık kontrolü eşzamanlı çalışmasın (2026-10-29)
let healthCalisiyor = false;

app.get('/api/durum', (req, res) => {
  let afiliyeAktif = false;
  try { afiliyeAktif = afiliyeOzet().durum === 'aktif'; } catch { afiliyeAktif = false; }
  res.json({
    scraperApiHazir: !!config.scraperApiKey,
    yzHazir: !!config.ai.apiKey,
    yzModel: config.ai.model,
    afiliyeAktif,
    desteklenenSiteler: adapters.map(a => a.id),
    siteler: adapters.map(a => ({ id: a.id, ad: a.name })),
    kazimaSaglayicilari: saglayiciDurumu(),
    // 🗂️ Mağaza katalog indeksi (2026-11-17) — dış istek atmadan aday bulma.
    katalog: (() => {
      try {
        const kd = katalogSyncDurumu();
        return {
          toplam: kd.db.toplam,
          fiyatli: kd.db.fiyatli,
          stokta: kd.db.stokta,
          calisiyor: kd.calisiyor,
          sonBitis: kd.sonBitis,
          hedefSayisi: kd.hedefSayisi,
          ttlDk: Math.round(kd.ttlMs / 60000),
          siteler: kd.db.siteler,
        };
      } catch {
        return { toplam: 0, fiyatli: 0, hedefSayisi: 0 };
      }
    })(),
    // Anlık sonuç önbelleği (2026-10-29)
    anlikSonuc: anlikIstatistik(),
    // Adaptör sağlık nöbetçisi + log rotasyonu (2026-10-29)
    saglik: saglikDurumu(),
    log: logDurumu(),
    // Kalıcı iş kuyruğu (2026-10-29)
    isler: { ...store.jobIstatistik(), aktifBellek: jobs.size },
    // 🚦 IP bazlı hız sınırı özeti (2026-11-18) — IP'ler maskelenir.
    hizSiniri: hizSiniriDurumu(),
    // 🌐 Ters vekil yapılandırması (teşhis: XFF/CF başlıkları doğru okunuyor mu?)
    vekil: {
      trustProxy: String(TRUST_PROXY),
      istemciIp: istemciIp(req),
      protokol: req.protocol,
      guvenli: req.secure,
      cfRay: req.get('cf-ray') || null,
    },
  });
});

/**
 * Adaptör sağlık nöbetçisi (Health Pulse) — 2026-10-29
 *
 * POST /api/health/check { siteIds?: string[], bildir?: boolean } *   Tüm adaptörleri (ya da verilen alt kümeyi) hafif testle yoklar.
 *   Varsayılan olarak Telegram bildirimi GÖNDERMEZ (elle tetiklemede spam olmasın);
 *   `bildir: true` ile açıkça istenir.
 *
 * GET /api/health            → son sağlık durumu (her mağaza)
 * GET /api/health/:site      → tek adaptörün geçmişi
 */
app.post('/api/health/check', adminGerekli, async (req, res) => {
  if (healthCalisiyor) return res.status(429).json({ hata: 'Sağlık kontrolü zaten çalışıyor' });
  const siteIds = Array.isArray(req.body?.siteIds) ? req.body.siteIds.filter(s => typeof s === 'string') : null;
  const bildir = req.body?.bildir === true;

  if (siteIds && !siteIds.length) return res.status(400).json({ hata: 'siteIds boş olamaz' });
  if (siteIds) {
    const bilinmeyen = siteIds.filter(id => !adapters.some(a => a.id === id));
    if (bilinmeyen.length) return res.status(400).json({ hata: 'Bilinmeyen site: ' + bilinmeyen.join(', ') });
  }

  healthCalisiyor = true;
  try {
    const r = await saglikKontrolu({ siteIds, bildir });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: 'Sağlık kontrolü başarısız: ' + String(e.message || e) });
  } finally {
    healthCalisiyor = false;
  }
});

app.get('/api/health', (req, res) => {
  res.json(saglikDurumu());
});

/**
 * 🧹 Veritabanı bakımı (2026-11-01)
 *
 * GET  /api/db/bakim  → son çalışma özeti + dosya boyutları + saklama ayarları
 * POST /api/db/bakim  → elle çalıştır { kuru?: boolean, cacheGun?: number }
 *
 * İstek uzun sürebilir (önbellek taraması); aynı anda ikinci çalıştırma 429 döner.
 * `kuru: true` hiçbir şey silmez, yalnızca neyin silineceğini raporlar.
 */
let bakimCalisiyor = false;

app.get('/api/db/bakim', adminGerekli, (req, res) => {
  res.json({ ...dbBakimDurumu(), calisiyor: bakimCalisiyor, boyutlar: dbBoyutlari() });
});

app.post('/api/db/bakim', adminGerekli, async (req, res) => {
  if (bakimCalisiyor) return res.status(429).json({ hata: 'Bakım zaten çalışıyor' });
  bakimCalisiyor = true;
  try {
    const r = await dbBakimCalistir({
      kuru: req.body?.kuru === true,
      cacheGun: Number(req.body?.cacheGun) || undefined,
      snapshotGun: Number(req.body?.snapshotGun) || undefined,
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: 'Bakım başarısız: ' + String(e.message || e) });
  } finally {
    bakimCalisiyor = false;
  }
});

/**
 * Log rotasyonu (2026-10-29)
 * POST /api/log/rotate  → elle döndür
 * POST /api/log/cleanup → 15 günden eski arşivleri sil
 */
app.post('/api/log/rotate', adminGerekli, async (req, res) => {
  try {
    res.json(await logRotasyonuYap('elle'));
  } catch (e) {
    res.status(500).json({ hata: 'Rotasyon başarısız: ' + String(e.message || e) });
  }
});

app.post('/api/log/cleanup', adminGerekli, async (req, res) => {
  try {
    res.json(await eskiArsivleriTemizle());
  } catch (e) {
    res.status(500).json({ hata: 'Temizlik başarısız: ' + String(e.message || e) });
  }
});

app.get('/api/health/:site', (req, res) => {
  const site = String(req.params.site || '');
  if (!adapters.some(a => a.id === site)) return res.status(404).json({ hata: 'Bilinmeyen site' });
  const ad = adapters.find(a => a.id === site)?.name || site;
  const gecmis = adaptorGecmisi(site, 30);
  res.json({
    site,
    siteName: ad,
    son: saglikDurumu().siteDurumlari[site] || null,
    gecmis,
  });
});

/**
 * Muadil (alternatif) ürün önerisi — 2026-10-28
 *
 * POST /api/muadil { url?, sonuc?, butce?, elle? }
 *   - `sonuc` verilirse doğrudan onunla çalışır (istemci zaten karşılaştırma sonucunu
 *     elinde tutuyor → ikinci kez tarama yapılmaz, kredi harcanmaz).
 *   - `url` verilirse önce karşılaştırma çalıştırılır.
 *
 * GET  /api/muadil/:id  → iş durumu
 * POST /api/muadil/:id/iptal
 */
app.post('/api/muadil', (req, res) => {
  const sonuc = req.body?.sonuc && typeof req.body.sonuc === 'object' ? req.body.sonuc : null;
  const url = String(req.body?.url || '').trim();
  const butce = Number(req.body?.butce) > 0 ? Number(req.body.butce) : null;
  const elle = req.body?.elle === true;

  if (!sonuc && !url) return res.status(400).json({ hata: 'sonuc ya da url gerekli' });
  if (!sonuc && !detectSite(url)) return res.status(400).json({ hata: 'Bu site desteklenmiyor' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('muadil', { url: url || null, butce, elle, iptalKontrolu: new AbortController() });

  (async () => {
    let kaynakSonuc = sonuc;
    if (!kaynakSonuc) {
      // İlerleme göster: karşılaştırma 1-2 dakika sürebiliyor, ekran donmasın.
      job.progress = { faz: 'karsilastirma', not: 'Önce ürünün kendisi karşılaştırılıyor…' };
      kaynakSonuc = await runComparison(url, {
        signal: job.iptalKontrolu.signal,
        onProgress: (siteId, info) => {
          job.progress = {
            faz: 'karsilastirma',
            site: siteId,
            not: `${info?.siteName || siteId}: ${info?.status === 'found' ? 'bulundu' : (info?.reason || 'taranıyor')}`,
          };
        },
      });
    }
    const { muadilBul } = await import('./src/alternatif.js');
    return muadilBul(kaynakSonuc, {
      butce,
      elle,
      signal: job.iptalKontrolu.signal,
      onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
    });
  })()
    .then((r) => { job.status = 'done'; job.result = r; })
    .catch((e) => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id, id: job.id });
});

app.get('/api/muadil/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'muadil') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

app.post('/api/muadil/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'muadil') return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * Sepet kupon otomasyonu — 2026-10-28
 *
 * POST /api/sepet-kupon { gruplar: [{site, siteName, araToplam, urunler:[{ad,fiyat}]}] }
 * Sepet senaryosunun mağaza gruplarını alır, her grup için koşulları karşılayan
 * kuponları ve kopyalanabilir kodları döndürür.
 */
app.post('/api/sepet-kupon', (req, res) => {
  const gruplar = Array.isArray(req.body?.gruplar) ? req.body.gruplar : [];
  if (!gruplar.length) return res.status(400).json({ hata: 'gruplar gerekli' });
  if (gruplar.length > 20) return res.status(400).json({ hata: 'en fazla 20 mağaza grubu' });
  try {
    res.json(sepetKuponAnalizi(gruplar));
  } catch (e) {
    res.status(500).json({ hata: 'Kupon analizi yapılamadı: ' + e.message });
  }
});

/**
 * Satış ortaklığı (affiliate) — 2026-10-28
 *
 * Tarafsızlık sözleşmesi: bu uçlar yalnızca "dışa giden bağlantı" yapılandırmasını
 * yönetir. Fiyat, sıralama ve "en ucuz" hesabı bu ayarlardan hiç etkilenmez.
 *
 * GET  /api/afiliye          → ağlar, komisyon aralıkları, yapılandırma durumu (token maskeli)
 * POST /api/afiliye          → ağ token/parametre/şablonu kaydeder
 * POST /api/afiliye/tikla    → tıklama sayacı (yerel, kişisel veri yok)
 * GET  /api/afiliye/tikla    → son 30 günün tıklama özeti
 */
app.get('/api/afiliye', adminGerekli, (req, res) => {
  try {
    res.json({ ...afiliyeOzet(adapters.map(a => a.id)), tiklamalar: tiklaOzet(30) });
  } catch (e) {
    res.status(500).json({ hata: 'Satış ortaklığı durumu okunamadı: ' + e.message });
  }
});

app.post('/api/afiliye', adminGerekli, (req, res) => {
  try {
    const kayit = afiliyeKaydet(req.body || {});
    res.json({ ok: true, ...afiliyeOzet(), kayit: { etkin: kayit.etkin } });
  } catch (e) {
    res.status(500).json({ hata: 'Satış ortaklığı ayarları kaydedilemedi: ' + e.message });
  }
});

app.post('/api/afiliye/tikla', (req, res) => {
  // Fire-and-forget: kullanıcıyı bekletmemek için her durumda hızlı 204 döner.
  try {
    const site = String(req.body?.site || '');
    // Yalnızca bilinen site kimlikleri sayılır (serbest metin dosyaya yazılmaz).
    if (adapters.some(a => a.id === site)) tiklaKaydet(site);
  } catch { /* sayaç hatası kullanıcıyı etkilemez */ }
  res.status(204).end();
});

app.get('/api/afiliye/tikla', adminGerekli, (req, res) => {
  res.json(tiklaOzet(30));
});

// Sağlayıcı kredi panosu (Yönetici paneli). Ücretsiz hesap uçlarından okur,
// sunucu tarafında 10 dk önbelleklenir; ?taze=1 zorla yeniler (Crawlbase oran sınırı korunur).
app.get('/api/kredi', adminGerekli, async (req, res) => {
  try {
    res.json(await saglayiciKredileri({ taze: req.query.taze === '1' }));
  } catch (e) {
    res.status(500).json({ hata: 'Kredi durumu alınamadı: ' + e.message });
  }
});

// Toplanan kupon / site kampanyaları (Yönetici panosu)
app.get('/api/kuponlar', adminGerekli, (req, res) => {
  res.json(getKuponlar());
});

// Kupon toplayıcıyı hemen çalıştır (site listesi verilebilir)
let kuponIsi = null;
app.post('/api/kuponlar/topla', adminGerekli, async (req, res) => {
  if (kuponIsi) return res.status(429).json({ hata: 'Toplama zaten çalışıyor' });
  const siteIds = Array.isArray(req.body?.siteler) && req.body.siteler.length ? req.body.siteler : null;
  kuponIsi = tumunuTopla({ fresh: true, siteIds })
    .then(r => ({ ok: true, ...r }))
    .catch(e => ({ ok: false, hata: String(e.message || e) }))
    .finally(() => { kuponIsi = null; });
  // Uzun sürebilir; sonucu bekleyip döndür (Ayarlar'da "topla" düğmesi bunu bekler)
  res.json(await kuponIsi);
});

/**
 * Kupon/kampanya toplayıcı zamanlayıcısı: açılışta kayıt 12 saatten eskiyse arka
 * planda toplar; sonra her 12 saatte bir yeniler. Hata olsa bile sunucu çalışmaya
 * devam eder (kampanya yoksa fiyatlama normal çalışır).
 */
function kuponZamanlayiciBaslat() {
  const calistir = async (neden) => {
    if (kuponIsi) return;
    try {
      console.log('[kupon] toplama başladı (' + neden + ')');
      kuponIsi = tumunuTopla({ fresh: false });
      const r = await kuponIsi;
      const toplam = (r.sonuclar || []).reduce((s, x) => s + (x.kampanyaSayisi || 0), 0);
      console.log('[kupon] tamamlandı: ' + toplam + ' kampanya, ' + (r.sonuclar || []).length + ' site');
    } catch (e) {
      console.warn('[kupon] toplama hatası: ' + String(e.message || e).slice(0, 120));
    } finally {
      kuponIsi = null;
    }
  };
  if (tazelemeGerekli()) setTimeout(() => calistir('açılış'), 8000);
  setInterval(() => { if (tazelemeGerekli()) calistir('zamanlanmış'); }, 60 * 60 * 1000).unref();
}

app.listen(config.port, config.host, () => {
  const problems = secretProblems();
  console.log('Baskı Hesap çalışıyor: http://' + (config.host === '0.0.0.0' ? 'localhost' : config.host) + ':' + config.port);
  if (config.erisimAnahtari) console.log('Erişim kısıtı: AÇIK (ERISIM_ANAHTARI tanımlı)');
  // 🚨 CANLI GÜVENLİK UYARISI (2026-11-18): 0.0.0.0 tüm arayüzlere bağlanır.
  // Yönetici anahtarı yoksa panel yalnızca loopback'e açıktır; ama ters vekil
  // (Caddy/Cloudflare) bağlantıyı loopback'e çevirirse panel İnternet'e açılır.
  if (config.host === '0.0.0.0' && !config.adminAnahtari) {
    console.warn(
      '\n' + '!'.repeat(72) + '\n'
      + '⚠️  GÜVENLİK UYARISI: HOST=0.0.0.0 (tüm arayüzler) ve ADMIN_ANAHTARI boş!\n'
      + '    Yönetici paneli (/admin.html) bir ters vekil arkasında HERKESE AÇIK olabilir.\n'
      + '    Canlıya çıkmadan önce .env dosyasına güçlü bir ADMIN_ANAHTARI yazın\n'
      + '    (en az 24 karakter, tahmin edilemez) ve ERISIM_ANAHTARI tanımlayın.\n'
      + '!'.repeat(72) + '\n',
    );
  }
  if (process.env.PUBLIC_URL) console.log('Yayın adresi: ' + String(process.env.PUBLIC_URL).replace(/\/+$/, ''));
  if (problems.length) console.warn('UYARI:', problems.join(' '));

  // ---- Kalıcı iş kuyruğu: açılış kurtarma (2026-10-29) ----
  // Yarıda kalan işler dürüstçe 'interrupted' işaretlenir; 7 günden eski
  // tamamlanmış işler temizlenir.
  try {
    const yarim = store.markInterruptedJobs();
    if (yarim) console.log(`[jobs] ${yarim} yarıda kalan iş "interrupted" olarak işaretlendi`);
    const silinen = store.cleanupOldJobs(7);
    if (silinen) console.log(`[jobs] ${silinen} eski iş kaydı temizlendi (7 gün+)`);
    // 📤 30 günden eski paylaşılan sepet bağlantıları silinir (2026-11-01).
    const eskiPaylasim = store.sepetPaylasTemizle(30);
    if (eskiPaylasim) console.log(`[paylas] ${eskiPaylasim} eski sepet linki temizlendi (30 gün+)`);
    // 🔔 Web Push anahtarları ilk açılışta üretilip ayarlara yazılır (2026-11-01).
    try { pushDurum(); } catch { /* isteğe bağlı */ }
    const st = store.jobIstatistik();
    if (st.toplam) console.log(`[jobs] kalıcı kuyrukta ${st.toplam} iş kaydı var`);
  } catch (e) {
    console.warn('[jobs] açılış kurtarma hatası:', String(e.message || e).slice(0, 120));
  }
  // 6 saatte bir eski iş temizliği (uzun süre çalışan süreçte de tablo şişmesin)
  const jobTemizlik = setInterval(() => {
    try { store.cleanupOldJobs(7); } catch { /* yoksay */ }
  }, 6 * 60 * 60 * 1000);
  if (jobTemizlik.unref) jobTemizlik.unref();

  // Günlük kontrol takvimi: eski 2 kontrollük kurulumu 5 kontrole taşır (bir kez).
  store.takvimiGuncelle();
  startAlarmScheduler();
  kuponZamanlayiciBaslat();
  startTelegramBot();
  // 📢 Otonom fırsat kanalı: her `firsat.saatAraligi` saatte bir sessizce çalışır.
  // Ayarlar panelden kapatılırsa döngü hiçbir şey yapmaz.
  try {
    startFirsatScheduler();
  } catch (e) {
    console.warn('[firsat] zamanlayıcı başlatılamadı:', String(e.message || e).slice(0, 120));
  }
  // 🎯 Otonom fiyat radarı: katalogu her `radar.saatAraligi` saatte tarar.
  // Kapalıysa hiçbir şey yapmaz; "Şimdi çalıştır" butonu yine de çalışır.
  try {
    startRadarScheduler();
  } catch (e) {
    console.warn('[radar] zamanlayıcı başlatılamadı:', String(e.message || e).slice(0, 120));
  }
  // 🗂️ Mağaza kataloğu senkronizasyonu (2026-11-17): Shopify/Woo/sitemap
  // beslemelerinden ürün indeksi. Ürün adı aramalarında dış istek atmadan
  // aday bulmayı sağlar. İlk tur açılıştan 20 sn sonra çalışır.
  try {
    katalogSenkronBaslat();
  } catch (e) {
    console.warn('[katalogSync] zamanlayıcı başlatılamadı:', String(e.message || e).slice(0, 120));
  }
  // 🔍 Öneri motorunu ısıt: ilk tuş vuruşunda disk/DB gecikmesi olmasın.
  try { onerileriGetir(''); } catch { /* yoksay */ }
  // Adaptör sağlık nöbetçisi: her gece 04:00 (2026-10-29)
  try {
    const h = saglikNobetcisiBaslat({ bildir: true });
    console.log(`[health] nöbetçi kuruldu — her gece ${h.saat}:00 (${Math.round(h.sonrakiKontrolMs / 60000)} dk sonra)`);
  } catch (e) {
    console.warn('[health] nöbetçi başlatılamadı:', String(e.message || e).slice(0, 120));
  }
  // Açılışta log boyutu eşiği aşmışsa hemen döndür (2026-10-29)
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size >= LOG_ESIK_BAYT) {
      setTimeout(() => {
        logRotasyonuYap('boyut').then(r => {
          if (r.dondu) console.log(`[log] açılış rotasyonu: ${r.dosya} (${Math.round(r.bayt / 1024 / 1024 * 100) / 100} MB → ${Math.round((r.arsivBayt || 0) / 1024 / 1024 * 100) / 100} MB)`);
        }).catch(() => {});
      }, 5000).unref();
    }
  } catch { /* boyut okunamazsa geç */ }
  const primaryHosts = adapters.map(a => a.hosts?.[0]).filter(Boolean);
  // Bağlantı ısıtma VARSAYILAN OLARAK KAPALI (2026-10-28).
  //
  // Ölçüm: 60 siteye kısa sürede HEAD atmak T-Soft/IdeaSoft tabanlı siteleri
  // (filamentdepom, 3dmarketim, filamentsan) geçici olarak FİYATSIZ sayfa döndürmeye
  // itiyor. Sepet gibi toplu işlerde bu, ürünün kaynak fiyatının okunamaması ve
  // ürünün sepetten düşmesi demekti (5 ürünlük sepette 2 ürün kayboluyordu; ısıtma
  // kapalıyken 5/5 bulundu). Faydası yalnızca ilk istekte birkaç yüz ms.
  // Gerekirse .env ile açılır: HTTP_POOL_WARMUP=1
  if (process.env.HTTP_POOL_WARMUP === '1') {
    setTimeout(() => warmUpHosts(primaryHosts), 20000);
  }
});

// ---- Temiz kapanış: SQLite/WAL bağlantısını düzgün kapat ----
// Windows'ta açık kalan WAL dosyası sonraki açılışta kilit sorunlarına yol açabilir.
let kapaniyor = false;
for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.once(sinyal, () => {
    if (kapaniyor) return;
    kapaniyor = true;
    try { firsatZamanlayiciDurdur(); } catch { /* zamanlayıcı yok */ }
    try { firsatKapat(); } catch { /* zaten kapalı */ }
    try { radarZamanlayiciDurdur(); } catch { /* zamanlayıcı yok */ }
    try { radarKapat(); } catch { /* zaten kapalı */ }
    try { katalogSenkronDurdur(); } catch { /* zamanlayıcı yok */ }
    try { snapshotKapat(); } catch { /* zaten kapalı */ }
    process.exit(0);
  });
}



