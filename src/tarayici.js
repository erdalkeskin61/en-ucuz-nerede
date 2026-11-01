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
const BOS_KALMA_MS = 3 * 60 * 1000; // 3 dk boş kalınca tarayıcı kapanır
const ZAMAN_ASIMI_MS = 18000;

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

/** Tarayıcı örneğini başlatır ve paylaşır. */
function tarayiciAl() {
  if (tarayici?.isConnected()) return Promise.resolve(tarayici);
  if (!acilisSozu) {
    acilisSozu = chromium.launch({
      headless: true,
      args: STEALTH_ARGS,
      ignoreDefaultArgs: ['--enable-automation'],
    }).then((t) => {
      tarayici = t;
      t.on('disconnected', () => { tarayici = null; acilisSozu = null; });
      acilisSozu = null;
      return t;
    }).catch((e) => {
      acilisSozu = null;
      throw e;
    });
  }
  return acilisSozu;
}

// Boşta kalınca tarayıcı sürecini kapat (RAM tasarrufu)
setInterval(() => {
  if (tarayici && acikSayfa === 0 && Date.now() - sonKullanim > BOS_KALMA_MS) {
    tarayici.close().catch(() => {});
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
export async function tarayiciIleCek(url, { timeoutMs = ZAMAN_ASIMI_MS } = {}) {
  const domain = new URL(url).hostname.replace(/^www\./, '');

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

  try {
    const t = await tarayiciAl();
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    ctx = await t.newContext({
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
    });

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

    // Başarılı istek devreyi sıfırlar
    circuitBreaker.recordSuccess(domain);
    return { status: 200, body: html, cookies: [], saglayici: 'tarayici' };
  } catch (e) {
    circuitBreaker.recordFailure(domain);
    return { networkError: 'tarayıcı: ' + String(e.message || e).slice(0, 120), saglayici: 'tarayici' };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    sayfaBirak();
    sonKullanim = Date.now();
  }
}

/** Tarayıcının o anki durumu (/api/durum panosu için). */
export function tarayiciDurumu() {
  return {
    acik: !!(tarayici?.isConnected()),
    acikSayfa: acikSayfa,
    sonKullanim: sonKullanim ? new Date(sonKullanim).toISOString() : null,
    circuitBreakers: circuitBreaker.snapshot(),
    rateLimiters: rateLimiter.snapshot(),
  };
}
