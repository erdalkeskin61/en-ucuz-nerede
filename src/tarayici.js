/**
 * Yerel stealth headless tarayıcı (playwright-extra + puppeteer-extra-plugin-stealth)
 * 
 * Özellikler:
 *  - Cloudflare, DataDome ve Akamai Bot Manager tespitlerini atlatmak için
 *    resmi stealth plugin'i ve ek derinlemesine (defense-in-depth) initScript
 *    evasion'ları (navigator.webdriver silme, chrome.runtime, WebGL spoofing vb.) kullanır.
 *  - Eşzamanlı sekme sınırı (MAX_SAYFA = 3) ve boşta kalma yönetimi (RAM dostu).
 *  - Domain bazlı cooldown / circuit breaker ve rate limiter entegrasyonu.
 */
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { rateLimiter } from './rateLimiter.js';
import { circuitBreaker, BotProtectionError } from './circuitBreaker.js';

// Stealth plugin'i modül seviyesinde bir kez ekle
chromium.use(StealthPlugin());

const MAX_SAYFA = 5;
/** Boşta kalma süresi (ms). `TARAYICI_BOS_KALMA_MS` ile ayarlanabilir (2026-11-17). */
const BOS_KALMA_MS = (() => {
  const n = Number(process.env.TARAYICI_BOS_KALMA_MS);
  return Number.isFinite(n) && n > 0 ? n : 3 * 60 * 1000;
})();
const ZAMAN_ASIMI_MS = 18000;

/**
 * 🌐 UZAK TARAYICI (2026-11-17) — `REMOTE_BROWSER_URL`
 *
 * Tanımlıysa yerel Chromium süreci HİÇ başlatılmaz; mevcut bir Chromium'a
 * bağlanılır. Desteklenen biçimler:
 *   - `ws://host:port/...`  → Playwright `connect` (playwright server)
 *   - `http(s)://host:port` → CDP (`/json/version` üzerinden `connectOverCDP`)
 *
 * Neden: düşük RAM'li makinelerde/konteynerlerde tarayıcıyı ayrı çalıştırmak
 * (ör. `docker run browserless/chrome`) ana süreci şişirmeden aynı gücü verir.
 */
const REMOTE_BROWSER_URL = String(process.env.REMOTE_BROWSER_URL || '').trim();
const UZAK_MOD = !!REMOTE_BROWSER_URL;

/**
 * 🛑 ACİL BELLEK KORUMA MODU — `TARAYICI_KAPALI=1` (2026-11-18)
 *
 * Azure 4 GB VM'de gece taraması + radar eşzamanlı çalışırken RAM tükenirse
 * operatör Chromium'u tamamen kapatabilmelidir. Kapalıyken tarayıcı HİÇ
 * başlatılmaz; `tarayiciIleCek` dürüst bir hata döner ve scraper zinciri
 * impit/sağlayıcı yollarına düşer (sessizce boş sayfa dönmez).
 */
const TARAYICI_KAPALI = ['1', 'true', 'on', 'yes'].includes(
  String(process.env.TARAYICI_KAPALI || '').trim().toLowerCase(),
);

/**
 * 🖥️ Yerel başlatma stratejisi (2026-11-17)
 *
 * ÖNCEKİ SORUN: `chromium.launch()` varsayılan olarak Playwright'ın indirdiği
 * `chrome-headless-shell` ikilisini kullanır. Windows'ta bu ikili her açılışta
 * kısa süreli bir **CMD penceresi** gösterir (kullanıcı akışını bozan bir görsel
 * sızıntı) ve soğuk başlatma yavaştır.
 *
 * YENİ SIRA (güvenli geri düşüş):
 *   1) `channel: 'chrome'`  → sistemde kurulu gerçek Chrome (pencere yok, tam
 *      TLS/JS parmak izi). `TARAYICI_CHANNEL=chrome` ile zorlanabilir.
 *   2) `channel: 'chromium'`→ Playwright Chromium tam paketi.
 *   3) düz `chromium.launch()` (headless shell) → son çare.
 *
 * `TARAYICI_CHANNEL=none` ise doğrudan 3. adım kullanılır.
 */
const CHANNEL_TERCIHI = String(process.env.TARAYICI_CHANNEL || 'auto').toLowerCase();

function yerelAcilisSecenekleri() {
  return { headless: true, args: STEALTH_ARGS, ignoreDefaultArgs: ['--enable-automation'] };
}

/** Kanal sırasına göre yerel tarayıcıyı başlatır (ilk başarılı olan). */
async function yerelTarayiciBaslat() {
  const denemeler = [];
  if (CHANNEL_TERCIHI === 'none') {
    denemeler.push({ ad: 'headless-shell', opts: {} });
  } else if (CHANNEL_TERCIHI === 'chrome' || CHANNEL_TERCIHI === 'chromium') {
    denemeler.push({ ad: CHANNEL_TERCIHI, opts: { channel: CHANNEL_TERCIHI } });
    denemeler.push({ ad: 'headless-shell', opts: {} });
  } else {
    // auto: gerçek Chrome → Chromium → headless shell
    denemeler.push({ ad: 'chrome', opts: { channel: 'chrome' } });
    denemeler.push({ ad: 'chromium', opts: { channel: 'chromium' } });
    denemeler.push({ ad: 'headless-shell', opts: {} });
  }

  let sonHata = null;
  for (const d of denemeler) {
    try {
      const t = await chromium.launch({ ...yerelAcilisSecenekleri(), ...d.opts });
      if (d.ad !== 'chrome') {
        console.warn(`[tarayici] yerel tarayıcı "${d.ad}" kanalıyla başlatıldı (CMD penceresi görülebilir).`);
      }
      return t;
    } catch (e) {
      sonHata = e;
      // Chrome kurulu değilse bu normaldir; sessizce bir sonraki kanala geç.
    }
  }
  throw sonHata || new Error('Yerel tarayıcı başlatılamadı.');
}

/** Uzak tarayıcıya bağlanır (ws → connect, http → connectOverCDP). */
async function uzakTarayiciBaglan() {
  if (/^wss?:\/\//i.test(REMOTE_BROWSER_URL)) {
    return chromium.connect(REMOTE_BROWSER_URL, { timeout: 20000 });
  }
  return chromium.connectOverCDP(REMOTE_BROWSER_URL, { timeout: 20000 });
}

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--window-size=1366,768',
  '--lang=tr-TR,tr',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const CHALLENGE_RE = /just a moment|attention required|güvenlik|security check|cf-chl|enable javascript and reload|verify you are human|are you a robot/i;

let tarayici = null;
let acilisSozu = null;
let sonKullanim = 0;
let acikSayfa = 0;
const sayfaKuyrugu = [];

function sayfaAl() {
  return new Promise((coz) => {
    if (acikSayfa < MAX_SAYFA) { acikSayfa++; coz(); }
    else sayfaKuyrugu.push(coz);
  });
}

function sayfaBirak() {
  acikSayfa--;
  const s = sayfaKuyrugu.shift();
  if (s) { acikSayfa++; s(); }
}

/** Tarayıcı örneğini başlatır (ya da uzak tarayıcıya bağlanır) ve paylaşır. */
function tarayiciAl() {
  if (tarayici?.isConnected()) return Promise.resolve(tarayici);
  if (!acilisSozu) {
    acilisSozu = (UZAK_MOD ? uzakTarayiciBaglan() : yerelTarayiciBaslat()).then((t) => {
      tarayici = t;
      t.on('disconnected', () => { tarayici = null; acilisSozu = null; });
      acilisSozu = null;
      if (UZAK_MOD) console.log('[tarayici] uzak tarayıcıya bağlandı:', REMOTE_BROWSER_URL.replace(/\/\/[^@]*@/, '//'));
      return t;
    }).catch((e) => {
      acilisSozu = null;
      throw e;
    });
  }
  return acilisSozu;
}

// Boşta kalınca tarayıcı sürecini kapat (RAM tasarrufu).
// 🌐 Uzak modda bağlantı KOPARILIR; uzak tarayıcı süreci (başka istemciler de
// kullanıyor olabilir) öldürülmez.
setInterval(() => {
  if (tarayici && acikSayfa === 0 && Date.now() - sonKullanim > BOS_KALMA_MS) {
    const t = tarayici;
    tarayici = null;
    acilisSozu = null;
    if (UZAK_MOD) {
      // `close()` uzak tarayıcıyı kapatabilir → yalnızca bağlantıyı bırak.
      try { t.close?.().catch(() => {}); } catch { /* yoksay */ }
    } else {
      t.close().catch(() => {});
    }
  }
}, 60 * 1000).unref();

/**
 * Sayfada bot challenge (Cloudflare / DataDome vb.) olup olmadığını kontrol eder.
 */
async function isBotChallenge(page) {
  try {
    const baslik = await page.title().catch(() => '');
    if (CHALLENGE_RE.test(baslik)) return true;

    return await page.evaluate(() => {
      const title = (document.title || '').toLowerCase();
      const body = (document.body?.innerText || '').slice(0, 1500).toLowerCase();
      const textPatterns = [
        /just a moment/,
        /attention required/,
        /access denied/,
        /checking your browser/,
        /verify you are human/,
        /are you a robot/,
        /cloudflare/,
        /datadome/,
      ];
      if (textPatterns.some((r) => r.test(title) || r.test(body))) return true;

      return !!document.querySelector(
        [
          'iframe[src*="challenges.cloudflare.com"]',
          'iframe[src*="captcha"]',
          'iframe[src*="datadome"]',
          '#challenge-form',
          '#cf-challenge-running',
          '[data-datadome]',
        ].join(',')
      );
    }).catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Bir URL'yi yerel stealth tarayıcıda açıp son HTML'i döndürür.
 * @returns {{status:number, body:string, saglayici:string} | {networkError:string, saglayici:string, cooldown?:boolean}}
 */
/**
 * Chromium, saf JSON/metin yanıtlarını (ör. Shopify `/products/x.js`) kendi
 * yerleşik görüntüleyicisiyle bir `<pre>` etiketi içine sarar:
 *
 *   <html><head><meta name="color-scheme" content="light dark"></head>
 *   <body><pre style="...">{"id":123,...}</pre></body></html>
 *
 * Bu HTML olduğu gibi dönerse adaptördeki `JSON.parse` `<` karakterinde patlar
 * (2026-11-09: porima3d / 3dteknomarket / filamenthane fiyatsız kalıyordu).
 *
 * Bu fonksiyon YALNIZCA gerçekten sarmalanmış JSON/metin sayfalarında devreye
 * girer; içinde `<div>`, `<script>`, `<main>` gibi gerçek işaretleme bulunan
 * sayfalara DOKUNMAZ (yanlışlıkla HTML'i bozmamak için).
 *
 * @param {string} html Chromium'dan gelen ham içerik
 * @returns {string} sarmalama varsa ham JSON/metin, yoksa giriş aynen
 */
export function jsonSarmalamasiCoz(html) {
  const s = typeof html === 'string' ? html : String(html ?? '');
  if (!s || !/<pre[\s>]/i.test(s)) return s;

  // Gerçek bir HTML sayfası mı? Öyleyse <pre> içindeki kod bloğu olabilir.
  if (/<(div|script|table|nav|header|footer|main|section|form|iframe|img|style)\b/i.test(s)) {
    return s;
  }

  const m = s.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!m) return s;

  const ham = m[1].trim();
  if (!ham) return s;

  const jsonGorunum = (x) => /^[[{]/.test(x) && /[\]}]$/.test(x);
  const kacisVar = /&(?:quot|amp|lt|gt|nbsp|apos|#0*39);/.test(ham);

  // 1) Doğrudan JSON görünümlü ve kaçış içermeyen içerik → aynen döndür.
  if (jsonGorunum(ham) && !kacisVar) return ham;

  // 2) HTML entity kaçışlı JSON (ör. {"id":1} → {&quot;id&quot;:1})
  const cozulmus = htmlEntityCoz(ham);
  if (jsonGorunum(cozulmus)) return cozulmus;

  // 3) Kaçış yok ama JSON görünümlü (ör. sadece &nbsp;) → ham.
  if (jsonGorunum(ham)) return ham;

  return s;
}

/** Yaygın HTML entity'lerini çözer (yalnızca JSON kaçışları için). */
export function htmlEntityCoz(metin) {
  return String(metin ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * Tarayıcıdan çekilen ham içerikten JSON/metin gövdesini çıkarır.
 * Sarmalama yoksa `null` döner (çağıran fallback'e düşer).
 */
export function tarayiciJsonGovdesi(html) {
  const cozulmus = jsonSarmalamasiCoz(html);
  return cozulmus === html ? null : cozulmus;
}

export async function tarayiciIleCek(url, { timeoutMs = ZAMAN_ASIMI_MS } = {}) {
  const domain = new URL(url).hostname.replace(/^www\./, '');

  // 0) 🛑 Acil bellek koruma modu: Chromium HİÇ başlatılmaz.
  //    Dürüst hata döneriz (sessiz boş sayfa değil) → scraper zinciri
  //    impit/sağlayıcı katmanlarına düşer.
  if (TARAYICI_KAPALI) {
    return {
      networkError: 'tarayıcı: TARAYICI_KAPALI=1 (acil bellek koruma modu) — Chromium başlatılmadı',
      saglayici: 'tarayici',
      kapali: true,
    };
  }

  // 1) Circuit Breaker kontrolü: Domain cooldown'da ise IP'yi yakma
  if (circuitBreaker.isOpen(domain)) {
    const remainingMs = circuitBreaker.remainingCooldownMs(domain);
    return {
      networkError: `tarayıcı: ${domain} bot cooldown'da (${Math.ceil(remainingMs / 1000)}s kaldı)`,
      saglayici: 'tarayici',
      cooldown: true,
      remainingMs,
    };
  }

  // 2) Rate Limiter: İnsan benzeri gecikme ve token bucket
  await rateLimiter.acquire(domain);

  await sayfaAl();
  sonKullanim = Date.now();
  let ctx = null;
  let ctxBizim = false;

  try {
    const t = await tarayiciAl();
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    const ctxAyarlari = {
      locale: 'tr-TR',
      userAgent: ua,
      viewport: { width: 1366, height: 768 },
      screen: { width: 1366, height: 768 },
      timezoneId: 'Europe/Istanbul',
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,
      extraHTTPHeaders: {
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    };

    if (UZAK_MOD) {
      // 🌐 CDP bağlantısında yeni bağlam oluşturmak her tarayıcıda desteklenmez;
      // mevcut bağlam varsa onu kullan (kapanışta KAPATMA — başkasının olabilir).
      const mevcut = t.contexts?.() || [];
      if (mevcut.length) {
        ctx = mevcut[0];
        ctxBizim = false;
      } else {
        ctx = await t.newContext(ctxAyarlari);
        ctxBizim = true;
      }
    } else {
      ctx = await t.newContext(ctxAyarlari);
      ctxBizim = true;
    }

    // İleri düzey stealth initScript enjeksiyonları (defense-in-depth)
    await ctx.addInitScript(() => {
      // 1) navigator.webdriver sil
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });

      // 2) window.chrome.runtime ekle
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) window.chrome.runtime = {};

      // 3) plugins spoofing
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
        ],
        configurable: true,
      });

      // 4) languages spoofing
      Object.defineProperty(navigator, 'languages', {
        get: () => ['tr-TR', 'tr', 'en-US', 'en'],
        configurable: true,
      });

      // 5) permissions.query fix
      const origQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (origQuery) {
        window.navigator.permissions.query = (params) =>
          params?.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : origQuery(params);
      }

      // 6) WebGL vendor/renderer spoofing
      try {
        const getParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (p) {
          if (p === 37445) return 'Google Inc. (Intel)';
          if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return getParam.call(this, p);
        };
      } catch {}

      // 7) hardwareConcurrency & deviceMemory
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
    });

    // Görsel, medya ve fontları engelleyerek tarama hızını 5x katına çıkar
    await ctx.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        return route.abort();
      }
      route.continue();
    });

    const sayfa = await ctx.newPage();
    const response = await sayfa.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(timeoutMs, ZAMAN_ASIMI_MS),
    });

    const status = response?.status() ?? 200;

    // CF / Bot koruması kontrolü: gerekirse aşması için birkaç tur bekle
    let challenge = await isBotChallenge(sayfa);
    if (challenge) {
      for (let i = 0; i < 6; i++) {
        await sayfa.waitForTimeout(2000);
        challenge = await isBotChallenge(sayfa);
        if (!challenge) break;
      }
    }

    if (challenge || status === 403 || status === 429) {
      const opened = circuitBreaker.recordFailure(domain);
      return {
        networkError: `tarayıcı: bot koruması/challenge takıldı (status=${status}${opened ? ' - devre açıldı/cooldown başladı' : ''})`,
        saglayici: 'tarayici',
      };
    }

    // Kısa bekleme (gereksiz 6s ağ beklemesi kaldırıldı)
    await sayfa.waitForTimeout(500);

    const html = await sayfa.content();
    if (!html || html.length < 500) {
      circuitBreaker.recordFailure(domain);
      return { networkError: 'tarayıcı: sayfa boş döndü', saglayici: 'tarayici' };
    }

    // Chromium saf JSON yanıtlarını <pre> içine sarar → ham içeriği ayıkla.
    // (2026-11-09: Shopify .js uçları bu yüzden "JSON değil" hatası veriyordu.)
    const govde = jsonSarmalamasiCoz(html);

    // Başarılı istek devreyi sıfırlar
    circuitBreaker.recordSuccess(domain);
    return { status: 200, body: govde, cookies: [], saglayici: 'tarayici', jsonSarmalamaCozuldu: govde !== html };
  } catch (e) {
    circuitBreaker.recordFailure(domain);
    return { networkError: 'tarayıcı: ' + String(e.message || e).slice(0, 120), saglayici: 'tarayici' };
  } finally {
    // Uzak bağlamı KAPATMA (paylaşımlı olabilir); yalnızca kendi açtığımızı kapat.
    if (ctx && ctxBizim) await ctx.close().catch(() => {});
    sayfaBirak();
    sonKullanim = Date.now();
  }
}

/** Tarayıcının o anki durumu (/api/durum panosu için). */
export function tarayiciDurumu() {
  return {
    acik: !!(tarayici?.isConnected()),
    acikSayfa: acikSayfa,
    mod: UZAK_MOD ? 'uzak' : 'yerel',
    // 🛑 Acil bellek koruma modu (2026-11-18) — panelde görünür.
    kapali: TARAYICI_KAPALI,
    // 🌐 Uzak CDP/Playwright bağlantısı kullanılıyor mu?
    uzak: UZAK_MOD,
    uzakUrl: UZAK_MOD ? REMOTE_BROWSER_URL.replace(/\/\/[^@]*@/, '//') : null,
    channel: CHANNEL_TERCIHI,
    bosKalmaMs: BOS_KALMA_MS,
    sonKullanim: sonKullanim ? new Date(sonKullanim).toISOString() : null,
    circuitBreakers: circuitBreaker.snapshot(),
    rateLimiters: rateLimiter.snapshot(),
  };
}
