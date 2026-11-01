/**
 * Kazıma istemcisi — çok sağlayıcılı zincir.
 *
 * Kurallar (kullanıcı isteği):
 *  - Vatan, İtopya, Ticimax ve IdeaSoft-smart siteleri yerel Türkiye IP'sinden
 *    DOĞRUDAN çekilir (WAF'lar veri merkezi IP'lerini engelliyor); başarısızlıkta
 *    sağlayıcı zinciri devreye girer.
 *  - ScraperAPI birincil sağlayıcıdır, her istekte country_code=tr gönderilir.
 *  - Anahtar yalnızca process.env üzerinden okunur; kod, ön yüz ve loglara ASLA yazılmaz.
 *  - HTTP 500 ya da zaman aşımı olursa bir kez tekrar denenir.
 *  - Sayfa boş gelirse o sayfa için bir kez render=true denenir. Premium kullanılmaz.
 *  - Aynı URL kısa süre içinde tekrar istenirse disk önbelleğinden döner (kredi tasarrufu).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { tarayiciIleCek } from './tarayici.js';
import { rateLimiter } from './rateLimiter.js';
import { circuitBreaker } from './circuitBreaker.js';
import { rotasyonGerekliMi } from './logRotasyon.js';

const BOT_CHALLENGE_RE = /just a moment|attention required|güvenlik|security check|cf-chl|verify you are human|are you a robot/i;

const CACHE_DIR = path.join(config.dataDir, 'cache');
const LOG_PATH = path.join(config.dataDir, 'request_log.jsonl');

export class FetchError extends Error {
  constructor(message, { status = 0, attempts = [] } = {}) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.attempts = attempts;
  }
}

function ensureDirs() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

function hashKey(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
}

function logRequest(entry) {
  try {
    ensureDirs();
    fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    // Log rotasyonu (2026-10-29): 10 MB'ı aşınca ya da gün değişince dosya
    // atomic olarak devredilir, gzip'lenip arşivlenir. Yazmayı BEKLETMEZ.
    rotasyonGerekliMi();
  } catch {
    /* log yazılamadıysa istek yine de döner */
  }
}

function cacheGet(key, maxAgeMs) {
  try {
    const p = path.join(CACHE_DIR, key + '.json');
    const stat = fs.statSync(p);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    const kayit = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Zehirli kayıt temizliği (2026-10-28): geçmişte tarayıcı katmanından gelen
    // "sahte 200 + hata sayfası" önbelleğe yazılmıştı. Böyle bir kayıt okunursa
    // yok sayılır ve dosya SİLİNİR; aksi halde 6 saat boyunca fiyat bulunamıyordu.
    if (kayit && (kayit.status === 404 || kayit.status === 410 || hataSayfasiMi(kayit.body, kayit.status))) {
      try { fs.unlinkSync(p); } catch { /* silinemezse yok say */ }
      return null;
    }
    return kayit;
  } catch {
    return null;
  }
}

function cacheSet(key, value) {
  try {
    // Sağlık denetimi: boş gövde / hata sayfası / 200 dışı yanıt ASLA yazılmaz.
    if (!value || value.status !== 200) return;
    if (!value.body || isEmptyBody(value.body)) return;
    if (hataSayfasiMi(value.body, value.status)) return;
    ensureDirs();
    fs.writeFileSync(path.join(CACHE_DIR, key + '.json'), JSON.stringify(value));
  } catch {
    /* önbellek yazılamadıysa sorun değil */
  }
}

function isEmptyBody(body) {
  if (!body) return true;
  const t = body.trim();
  if (t.length < 200) {
    // Küçük ama geçerli JSON yanıtları (API uçları, hata mesajları) boş sayfa sayılmaz.
    return !(t.startsWith('{') || t.startsWith('['));
  }
  return false;
}

/**
 * Gövde bir "sayfa bulunamadı / hata" sayfası mı? (2026-10-28)
 *
 * Neden gerekli: sepet yükü altında T-Soft/IdeaSoft tabanlı siteler (filamentsan,
 * 3dmarketim, filamentdepom…) 404 + ~180 KB hata sayfası döndürüyor. Bu sayfa "boş"
 * olmadığı için zincir onu GEÇERLİ sanıp 6 saat önbelleğe yazıyordu → tüm okumalar
 * "fiyat bulunamadı". Üstelik SPA siteler aynı hata sayfasını tarayıcıya HTTP 200 ile
 * veriyordu ("sahte başarı"). Artık tanınır, önbelleğe yazılmaz ve zincir buna göre
 * davranır.
 */
export function hataSayfasiMi(body, status) {
  if (status === 404 || status === 410) return true;
  if (!body) return false;
  const metinBasi = String(body).trimStart();
  // JSON yanıtları (API uçları) hata sayfası değildir; metin taraması yanlış pozitif verir.
  if (metinBasi.startsWith('{') || metinBasi.startsWith('[')) return false;
  const ilk = String(body).slice(0, 3000);
  const baslik = (ilk.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const h1 = (ilk.match(/<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i) || [])[1] || '';
  const metin = (baslik + ' ' + h1).toLowerCase();
  return /(^|\D)404(\D|$)|bulunamad[ıi]|sayfa bulunamad[ıi]|not found|page not found|arad[ıi][ğg][ıi]n[ıi]z sayfa/i.test(metin);
}

// ---- Host başına eşzamanlılık sınırı (2026-10-28) ----
// Aynı siteye paralel istek patlaması, sitenin WAF'ını tetikleyip 404/hata sayfası
// döndürmesine yol açıyordu. Site başına eşzamanlı istek sınırlanır; varsayılan 3,
// yumuşak engel yiyen hostlarda 1'e düşer.
const HOST_ESZAMANLI_VARSAYILAN = 3;
const hostAktif = new Map();
const hostKuyruk = new Map();
const hostLimitOzel = new Map();

function hostLimiti(domain) {
  return hostLimitOzel.get(domain) ?? HOST_ESZAMANLI_VARSAYILAN;
}

function hostSlotAl(domain) {
  const limit = hostLimiti(domain);
  const aktif = hostAktif.get(domain) || 0;
  if (aktif < limit) {
    hostAktif.set(domain, aktif + 1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const k = hostKuyruk.get(domain) || [];
    k.push(resolve);
    hostKuyruk.set(domain, k);
  });
}

function hostSlotBirak(domain) {
  const k = hostKuyruk.get(domain);
  if (k && k.length) {
    k.shift()(); // slot doğrudan sıradaki isteğe devredilir (sayaç değişmez)
    return;
  }
  hostAktif.set(domain, Math.max(0, (hostAktif.get(domain) || 1) - 1));
}

// ---- Yumuşak engel: host kısa süre "nazik mod"a alınır ----
const yumusakEngel = new Map(); // domain -> { bitis, neden }
const YUMUSAK_ENGEL_MS = 90 * 1000;

export function yumusakEngelVarMi(domain) {
  return yumusakEngel.has(domain) && Date.now() < yumusakEngel.get(domain).bitis;
}

function yumusakEngelKoy(domain, neden) {
  if (!domain) return;
  const zaten = yumusakEngelVarMi(domain);
  yumusakEngel.set(domain, { bitis: Date.now() + YUMUSAK_ENGEL_MS, neden: neden || '-' });
  if (zaten) return; // zaten nazik modda, yeniden yapılandırma
  // Eski hız ayarını sakla; 90 sn sonra aynen geri koy.
  const eski = rateLimiter.buckets.get(domain);
  const eskiAyar = eski ? { rate: eski.rate, burst: eski.burst } : null;
  hostLimitOzel.set(domain, 1);
  try { rateLimiter.configure(domain, { rate: 0.5, burst: 1 }); } catch { /* yok say */ }
  console.warn('[scraper]', domain, 'yumuşak engel algılandı (' + (neden || '-') + ') — 90 sn nazik mod');
  const t = setTimeout(() => {
    yumusakEngel.delete(domain);
    hostLimitOzel.delete(domain);
    if (eskiAyar) {
      try { rateLimiter.configure(domain, eskiAyar); } catch { /* yok say */ }
    }
  }, YUMUSAK_ENGEL_MS + 500);
  if (t.unref) t.unref();
}

/** ScraperAPI'nin "kredi tükendi" 103'ünü tanır (yeniden denemek anlamsızdır). */
function krediBittiMi(res) {
  return res && res.status === 103 && /exhausted the API Credits/i.test(res.body || '');
}

// ScraperAPI eşzamanlılık sınırına saygı: hesap sınırı 5 fiziksel istek.
// (3 → 5: 10 sitelik karşılaştırmada sıra bekleme süresini ~%10 kısaltar.)
const MAX_CONCURRENT = 8; // 5 → 8 (2026-10-27): sepet gibi çoklu taramalarda hız; yerel çekim ağırlıklı
let inFlight = 0;
const waitQueue = [];
function acquire() {
  return new Promise((resolve) => {
    if (inFlight < MAX_CONCURRENT) { inFlight++; resolve(); }
    else waitQueue.push(resolve);
  });
}
function releaseSlot() {
  inFlight--;
  const next = waitQueue.shift();
  if (next) { inFlight++; next(); }
}

// Aynı URL'ye aynı anda giden istekler tek fiziksel isteğe indirilir (çift kredi
// harcamayı ve aynı sayfayı iki kez çekmeyi önler; örn. iki paralel karşılaştırma
// aynı sorguyu attığında). Bekleyen taraf sonucu paylaşır ve istek sayacı 0 yazar.
const inFlightRequests = new Map();

// ================== Çoklu kazıma sağlayıcısı ==================
// ScraperAPI birincildir; aylık kredisi tükendiğinde istek tipine göre yedek
// sağlayıcıya düşülür (2026-10 testleriyle doğrulanmış eşleştirme):
//   - render siteleri (İncehesap, Çiçeksepeti, Teknosa, PTT AVM) + Hepsiburada → Crawlbase JS
//     (İncehesap/Çiçeksepeti Crawlbase'in headless tarayıcısıyla 1 istekte geçer;
//     ScraperAPI'de aynı iş render başına 10 kredi tutuyordu)
//   - Trendyol / Amazon.tr → ZenRows premium (js_render + proxy_country=tr; sert CF)
//   - n11 → ZenRows düz (HTTPS CF'li; ZenRows plain 1 krediyle çeker)
//   - POST akışları (URHANSHOP ASP.NET postback) → Crawlbase POST + çerez aktarımı
//   - IP'ye bağlı oturum akışları (IdeaSoft-smart) → yalnızca ScraperAPI (dürüst hata)
//   - diğer tüm düz GET'ler → Crawlbase
// Hepsiburada (2026-10-25): arama + ürün sayfaları yerel IP'den DOĞRUDAN geliyor
// (MORIA/VERTICALFILTER arama verisi ve reduxStore ürün verisi tam). Daha önce
// render gerektirdiği sanılıyordu; canlı test düz HTTP'nin yettiğini gösterdi.
const RENDER_SITELERI = new Set(['incehesap', 'ciceksepeti', 'teknosa', 'pttavm']);
const TR_ZOR_SITELER = new Set(['trendyol', 'amazon']);
// n11 (2026-10-21): düz HTTP artık Crawlbase'ten de geçiyor (başarısız istek ücretsiz);
// varsayılan 'crawlbase' dalına bırakıldı — ZenRows düz istek yedek olarak devrede.
const ZENROWS_DUZ_SITELER = new Set([]);
const IDEASOFT_SMART_SITELER = new Set(['filamentmarketim', 'teknikfilament3d']);

// Yerel tarayıcı (Playwright Chromium) ile çekilen sitiler: JS render + CF korumalı
// büyük sitiler. Ücretsizdir; tarayıcı başarısız olursa sağlayıcı zinciri devreye
// girer (2026-10-21 canlı testleri: Trendyol arama+ürün, Amazon, n11, İncehesap,
// Teknosa, PTT AVM yerel tarayıcıyla geçiyor). Hepsiburada ve Çiçeksepeti yerel
// tarayıcıda güvenlik/arama duvarına takıldığından zincirde Crawlbase JS'de kalır.
const TARAYICI_SITELER = new Set(['incehesap', 'teknosa', 'pttavm', 'trendyol', 'amazon', 'n11']);

// Doğrudan (sağlayıcısız) çekim VARSAYILANDIR (2026-10-21 canlı testleri: 60 sitenin
// ~53'ü yerel IP'den tam içerik veriyor; 2026-10-25'te Hepsiburada ve urhanshop da
// doğrudan kata taşındı — Hepsiburada düz HTTP, urhanshop Set-Cookie aktarımlı POST).
// Uygulama kişisel makinede (Türkiye IP'si) çalıştığı için bu en hızlı ve ücretsiz yol;
// başarısız olursa sağlayıcı zinciri devreye girer. İstisnalar:
//  - RENDER_SITELERI + TR_ZOR + n11 → yerel tarayıcı (TARAYICI_SITELER) ya da Crawlbase
const DOGRUDAN_HARIC = new Set([...RENDER_SITELERI, ...TR_ZOR_SITELER, 'n11']);

let scraperApiTukendi = { bitti: false, ts: 0 };
let zenrowsTukendi = { bitti: false, ts: 0 };

/** ScraperAPI kredi durumunu ücretsiz /account ucuyla sorgular (anahtar loglanmaz). */
async function scraperApiKrediKontrolu() {
  try {
    const res = await fetch('https://api.scraperapi.com/account?api_key=' + encodeURIComponent(config.scraperApiKey), { signal: AbortSignal.timeout(15000) });
    const j = await res.json();
    if ((j.creditsLeft ?? 1) > 0) scraperApiTukendi = { bitti: false, ts: Date.now() };
  } catch { /* sorgu başarısızsa bayrak kalır */ }
}

/** Yanıt baytlarını sayfanın bildirdiği kodlamayla çözer (Windows-1251 vb.). */
function kodlamaCoz(buf) {
  try {
    const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 1096));
    const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
    const destekli = ['utf-8', 'windows-1251', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
    return new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

/** Tek fiziksel ScraperAPI isteği atar. Anahtar loglara asla yazılmaz. */
async function rawFetchScraperApi(targetUrl, { render, timeoutMs, method = 'GET', headers = null, body = null, session = null }) {
  if (!config.scraperApiKey) throw new FetchError('ScraperAPI anahtarı tanımlı değil (.env içinde SCRAPERAPI_KEY).');
  await acquire();
  const params = new URLSearchParams({
    api_key: config.scraperApiKey,
    url: targetUrl,
    country_code: 'tr',
  });
  if (render) params.set('render', 'true');
  // Oturum (yapışkan IP): IdeaSoft gibi IP'ye bağlı CSRF token'ı olan siteler için
  // aynı oturum numarasıyla atılan istekler aynı çıkış IP'sini kullanır.
  if (session) params.set('session_number', String(session));
  // Özel başlık göndermek (ör. Accept-Content-Token) keep_headers ister.
  if (headers && Object.keys(headers).length) params.set('keep_headers', 'true');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.scraperapi.com/?' + params.toString(), {
      method,
      signal: controller.signal,
      headers: {
      'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      ...(method === 'POST' && body != null && !(headers && headers['Content-Type'])
          ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
      ...(headers || {}),
      },
      body: method === 'POST' ? body : undefined,
    });
    // Bazı Türk siteleri Windows-1251 / ISO-8859-9 gönderir; baytları sayfanın
    // bildirdiği kodlamayla çöz (varsayılan UTF-8).
    const buf = await res.arrayBuffer();
    const respBody = kodlamaCoz(buf);
    // Oturum çerezleri (ASP.NET vb. çok adımlı akışlar için; loglara yazılmaz)
    const cookies = res.headers.getSetCookie?.() || [];
    return { status: res.status, body: respBody, cookies, saglayici: 'scraperapi' };
  } catch (e) {
    if (e.name === 'AbortError') return { timedOut: true, saglayici: 'scraperapi' };
    return { networkError: String(e.message || e).slice(0, 120), saglayici: 'scraperapi' };
  } finally {
    clearTimeout(timer);
  }
}

/** Crawlbase sağlayıcısı: JS render (javascript=true), POST gövdesi, çerez
 *  aktarımı (cookies parametresi + get_cookies ile Set-Cookie toplama) destekler.
 *  Başarısız istekler (cb_status 200/207 dışı) ücretsizdir. */
async function rawFetchCrawlbase(targetUrl, { render, timeoutMs, method = 'GET', headers = null, body = null }) {
  if (!config.crawlbaseToken) return { networkError: 'Crawlbase anahtarı tanımlı değil (.env: CRAWLBASE_TOKEN)' };
  await acquire();
  const params = new URLSearchParams({ token: config.crawlbaseToken, url: targetUrl });
  if (render) params.set('javascript', 'true');
  params.set('get_cookies', 'true');
  // Özel başlıklar: Cookie ayrı `cookies` parametresine, kalanlar request_headers'a
  const ekHeaders = {};
  let cerez = '';
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === 'cookie') cerez = v;
    else ekHeaders[k] = v;
  }
  if (cerez) params.set('cookies', cerez);
  const rh = Object.entries(ekHeaders).map(([k, v]) => k + ':' + v).join('|');
  if (rh) params.set('request_headers', rh);
  const isPost = method === 'POST' && body != null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs || 60000, 90000));
  try {
    const res = await fetch('https://api.crawlbase.com/?' + params.toString(), {
      method: isPost ? 'POST' : 'GET',
      headers: isPost ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
      body: isPost ? body : undefined,
      signal: controller.signal,
    });
    const buf = await res.arrayBuffer();
    const respBody = kodlamaCoz(buf);
    const cbDurum = Number(res.headers.get('cb_status') || 0);
    const orijinalDurum = Number(res.headers.get('original_status') || 0);
    // Hedef sitenin Set-Cookie'leri (çoklu değerler virgülle birleşik gelebilir)
    const cookies = (res.headers.get('original_set_cookie') || '')
      .split(/,(?=\s*[^;,\s]+=)/).map(s => s.trim()).filter(Boolean);
    if (cbDurum === 200 || cbDurum === 207) {
      // Crawlbase yönlendirmeleri takip eder ama original_status olarak İLK yanıtın
      // durumunu bildirir (ör. 301). Gövde nihai sayfadır — 3xx durumları başarı sayılır.
      const yonlenme = [301, 302, 303, 307, 308].includes(orijinalDurum);
      return { status: yonlenme ? 200 : (orijinalDurum || 200), body: respBody, cookies, saglayici: 'crawlbase' };
    }
    if ([701, 705, 706].includes(cbDurum)) {
      // Hedef site 1xx döndü (103/129 vb.) — dürüst durum aktarılır
      return { status: orijinalDurum || 500, body: '', cookies: [], saglayici: 'crawlbase' };
    }
    return { networkError: 'Crawlbase engel/hata aldı (cb_status=' + cbDurum + ')', saglayici: 'crawlbase' };
  } catch (e) {
    if (e.name === 'AbortError') return { timedOut: true, saglayici: 'crawlbase' };
    return { networkError: String(e.message || e).slice(0, 100), saglayici: 'crawlbase' };
  } finally {
    clearTimeout(timer);
  }
}

/** ZenRows sağlayıcısı: premium_proxy + proxy_country=tr ile TR çıkışı ve sert
 *  Cloudflare bypass'ı (Trendyol/Hepsiburada sınıfı). POST desteklemez. */
async function rawFetchZenRows(targetUrl, { render, premium, timeoutMs, method = 'GET', headers = null }) {
  if (!config.zenrowsApiKey) return { networkError: 'ZenRows anahtarı tanımlı değil (.env: ZENROWS_API_KEY)' };
  if (method === 'POST') return { networkError: 'ZenRows POST isteği desteklemiyor' };
  await acquire();
  const params = new URLSearchParams({ apikey: config.zenrowsApiKey, url: targetUrl });
  if (render) params.set('js_render', 'true');
  if (premium) {
    params.set('premium_proxy', 'true');
    params.set('proxy_country', 'tr');
  }
  if (headers && Object.keys(headers).length) params.set('custom_headers', 'true');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs || 60000, 90000));
  try {
    const res = await fetch('https://api.zenrows.com/v1/?' + params.toString(), {
      method: 'GET',
      headers: { Accept: 'text/html', ...(headers || {}) },
      signal: controller.signal,
    });
    const buf = await res.arrayBuffer();
    const respBody = kodlamaCoz(buf);
    if (res.status === 102 || /out of credits|credits available/i.test(respBody.slice(0, 300))) {
      zenrowsTukendi = { bitti: true, ts: Date.now() };
      return { networkError: 'ZenRows kredisi tükendi', saglayici: 'zenrows' };
    }
    return { status: res.status, body: respBody, cookies: [], saglayici: 'zenrows' };
  } catch (e) {
    if (e.name === 'AbortError') return { timedOut: true, saglayici: 'zenrows' };
    return { networkError: String(e.message || e).slice(0, 100), saglayici: 'zenrows' };
  } finally {
    clearTimeout(timer);
  }
}

/** Doğrudan (sağlayıcısız) istek: uygulamanın çalıştığı yerel makinenin Türkiye
 *  IP'sinden tarayıcı benzeri başlıklarla. Kişisel kullanım hacmi düşük olduğundan
 *  uygundur; kredi harcamaz. POST + özel başlıklar destekler (IdeaSoft token akışı).
 *  Yönlendirmeler takip edilir; yanıt kodlaması sayfanın bildirdiği şekilde çözülür. */
const DOGRUDAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win61; x61) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Bazı siteler çerez onayı verilmeden arama sonuçlarını sunmuyor (Vatan: onaysız
// istek boş kabuk döner — "0 ürün" sayfası bile gelmez). Kişisel kullanım için
// sabit onay çerezi göndermek yeterli (2026-10-21 canlı doğrulandı).
const DOGRUDAN_CEREZLER = {
  vatan: 'cookie_consent_user_accepted=true; checkCookie=true; cookie_consent_level=%7B%22strictly-necessary%22%3Atrue%2C%22functionality%22%3Atrue%2C%22tracking%22%3Atrue%2C%22targeting%22%3Atrue%7D',
};

async function rawFetchDirect(targetUrl, { timeoutMs, method = 'GET', headers = null, body = null, site = null }) {
  let domain = 'default';
  try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch {}
  if (circuitBreaker.isOpen(domain)) {
    return { networkError: domain + ' cooldown durumunda', saglayici: 'dogrudan' };
  }
  // Host başına eşzamanlılık: aynı siteye paralel patlama WAF'ı tetikliyordu.
  await hostSlotAl(domain);
  await rateLimiter.acquire(domain);
  const controller = new AbortController();
  const effectiveTimeout = timeoutMs || 10000;
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    // POST isteklerinde tarayıcı gibi Origin gönder (CSRF doğrulamaları ister).
    let ekOrigin = {};
    if (method === 'POST' && !(headers && Object.keys(headers).some(k => k.toLowerCase() === 'origin'))) {
      try { ekOrigin = { Origin: new URL(targetUrl).origin }; } catch { /* hatalı URL ise başlıksız devam */ }
    }
    // Siteye özel onay çerezi (çağıran Cookie göndermiyorsa).
    let ekCerez = {};
    if (site && DOGRUDAN_CEREZLER[site] && !(headers && Object.keys(headers).some(k => k.toLowerCase() === 'cookie'))) {
      ekCerez = { Cookie: DOGRUDAN_CEREZLER[site] };
    }
    const res = await fetch(targetUrl, {
      method,
      redirect: 'follow',
      headers: {
        'User-Agent': DOGRUDAN_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        ...ekOrigin,
        ...ekCerez,
        ...(headers || {}),
      },
      body: method === 'POST' ? body : undefined,
      signal: controller.signal,
    });
    const buf = await res.arrayBuffer();
    // Oturum çerezi gerektiren çok adımlı akışlar (ör. urhanshop postback) doğrudan
    // katmandan da çalışsın: sağlayıcılarla aynı biçimde çiğ Set-Cookie başlıklarını topla.
    const cerezler = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const textBody = kodlamaCoz(buf);
    if (res.status === 403 || res.status === 429 || BOT_CHALLENGE_RE.test(textBody.slice(0, 2000))) {
      circuitBreaker.recordFailure(domain);
    } else if (res.status === 200 && !isEmptyBody(textBody)) {
      circuitBreaker.recordSuccess(domain);
    }
    return { status: res.status, body: textBody, cookies: cerezler, saglayici: 'dogrudan' };
  } catch (e) {
    if (e.name === 'AbortError') return { timedOut: true, saglayici: 'dogrudan' };
    return { networkError: String(e.message || e).slice(0, 100), saglayici: 'dogrudan' };
  } finally {
    clearTimeout(timer);
    hostSlotBirak(domain);
  }
}

/** İstek özelliklerine göre yedek sağlayıcı tipini seçer; null = yedek yok. */
function yedekTuru(opts) {
  if (IDEASOFT_SMART_SITELER.has(opts.site)) return null; // IP'ye bağlı oturum: doğrudan/ScraperAPI ile çekilir
  if ((opts.method || 'GET') === 'POST') return 'crawlbase'; // URHANSHOP postback (çerez akışı)
  if (RENDER_SITELERI.has(opts.site) || opts.render) return 'crawlbase-js';
  if (TR_ZOR_SITELER.has(opts.site)) return 'zenrows-premium';
  if (ZENROWS_DUZ_SITELER.has(opts.site)) return 'zenrows';
  return 'crawlbase';
}

/** Yedek sağlayıcıyla çeker; uygun sağlayıcı yoksa dürüst hata döndürür. */
async function yedekFetch(targetUrl, opts) {
  const tur = yedekTuru(opts);
  if (tur === null) {
    return { networkError: 'Doğrudan çekim de başarısız oldu; bu site IP\'ye bağlı oturum gerektirdiği için başka sağlayıcıyla taranamaz' };
  }
  if (tur === 'crawlbase') {
    // Düz GET'ler: önce Crawlbase (1 istek); site Crawlbase'i engelliyse ZenRows
    // düz isteği (1 kredi) denenir. İkisi de başarısızsa yerel IP'den doğrudan
    // deneme yapılır (kişisel kullanımda genellikle yeterlidir).
    const r = await rawFetchCrawlbase(targetUrl, opts);
    const basarisiz = !r.status || r.status >= 100 || r.timedOut || r.networkError;
    if (!basarisiz) return r;
    const z = await rawFetchZenRows(targetUrl, opts);
    const zBasarisiz = !z.status || z.status >= 100 || z.timedOut || z.networkError;
    if (!zBasarisiz) return z;
    if ((opts.method || 'GET') === 'GET') {
      const d = await rawFetchDirect(targetUrl, opts);
      const dBasarisiz = !d.status || d.status >= 100 || d.timedOut || d.networkError || isEmptyBody(d.body);
      if (!dBasarisiz) return d;
    }
    return r;
  }
  if (tur === 'crawlbase-js') {
    // Render siteleri: Crawlbase JS (1 kredi). ZenRows premium yedek KALDIRILDI
    // (2026-10-21): premium istek 25 kredi tutuyor ve HB/Çiçeksepeti duvarına karşı
    // çoğu kez o da başarısız oluyordu — bir test koşusunda ~1.700 kredi yakmıştı.
    // Yerel tarayıcı (TARAYICI_SITELER) + Crawlbase JS yeterli; ikisi de geçemezse
    // dürüst hata verilir (kullanıcı kuralı: gereksiz API harcaması yok).
    const r = await rawFetchCrawlbase(targetUrl, { ...opts, render: true });
    return r;
  }
  if (tur === 'zenrows-premium') return rawFetchZenRows(targetUrl, { ...opts, render: true, premium: true });
  if (tur === 'zenrows') return rawFetchZenRows(targetUrl, opts);
  return { networkError: 'Bilinmeyen yedek sağlayıcı: ' + tur };
}

/**
 * Fiziksel istek dispatcher'ı:
 *  1) DOĞRUDAN (varsayılan) → yerel IP'den sağlayıcısız çekim (ücretsiz, hızlı; 60
 *     sitenin ~53'ü bu yoldan tam içerik veriyor). Başarısız olursa zincir devam eder.
 *  1b) TARAYICI_SITELER (ya da render gerektiren her istek) → yerel headless
 *     Chromium ile JS render + CF geçişi (ücretsiz). Başarısız olursa zincir devam.
 *  2) ScraperAPI (birincil sağlayıcı), aylık kredisi tükendiyse istek tipine göre
 *     yedek sağlayıcı (Crawlbase / ZenRows). Kredi durumu 30 dakikada bir ücretsiz
 *     /account sorgusuyla yeniden kontrol edilir (kredi yüklenirse otomatik geri döner).
 */
async function rawFetch(targetUrl, opts = {}) {
  let domain = 'default';
  try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch {}
  const isCooldown = circuitBreaker.isOpen(domain);

  let directResult = null;
  if (!isCooldown) {
    if (!DOGRUDAN_HARIC.has(opts.site) && !opts.render) {
      directResult = await rawFetchDirect(targetUrl, opts);
      if (directResult.status === 200 && !isEmptyBody(directResult.body)) return directResult;

      // 404/410 KESİN cevaptır: sayfa yok VEYA site bizi yumuşak engelliyor (T-Soft/
      // IdeaSoft WAF'ı 404 + ~180 KB hata sayfası döndürüyor). Bu durumda sağlayıcı ya
      // da tarayıcı denemek anlamsız: SPA siteler aynı hata sayfasını HTTP 200 ile
      // döndürüp önbelleği saatlerce zehirliyordu. Dürüst ve hızlı yol: sonucu bildir.
      if (directResult.status === 404 || directResult.status === 410) {
        if (hataSayfasiMi(directResult.body, directResult.status)) {
          yumusakEngelKoy(domain, 'doğrudan ' + directResult.status + '/hata sayfası');
        }
        return directResult;
      }
    }
    if ((TARAYICI_SITELER.has(opts.site) || opts.render) && (opts.method || 'GET') === 'GET') {
      const r = await tarayiciIleCek(targetUrl, { timeoutMs: opts.timeoutMs });
      if (r.status === 200 && !isEmptyBody(r.body) && !hataSayfasiMi(r.body, r.status)) return r;
    }
  } else {
    console.warn('[scraper] ' + domain + ' cooldown durumunda — doğrudan proxy sağlayıcısına yönlendiriliyor.');
  }

  // ScraperAPI birincil sağlayıcı (başarılı 200 ise dön)
  if (config.scraperApiKey && !scraperApiTukendi.bitti) {
    const r = await rawFetchScraperApi(targetUrl, opts);
    if (r.status === 200 && !isEmptyBody(r.body)) return r;
    if (krediBittiMi(r)) {
      scraperApiTukendi = { bitti: true, ts: Date.now() };
      console.error('[scraper] ScraperAPI kredisi tükendi — yedek sağlayıcılara (Crawlbase/ZenRows) geçildi.');
    }
  } else if (scraperApiTukendi.bitti && Date.now() - scraperApiTukendi.ts > 30 * 60 * 1000) {
    scraperApiTukendi.ts = Date.now();
    scraperApiKrediKontrolu();
  }

  // 403 / WAF engeli durumunda yerel stealth tarayıcıyı yedek olarak dene
  if ((opts.method || 'GET') === 'GET' && !TARAYICI_SITELER.has(opts.site)) {
    try {
      const browserFallback = await tarayiciIleCek(targetUrl, { timeoutMs: 15000 });
      if (browserFallback.status === 200 && !isEmptyBody(browserFallback.body)
          && !hataSayfasiMi(browserFallback.body, browserFallback.status)) {
        return browserFallback;
      }
      // Tarayıcı da hata sayfası döndürdüyse (SPA'lar bunu 200 ile veriyor) bu hostu
      // nazik moda al; aynı hata sayfasını önbelleğe yazma.
      if (browserFallback.body && hataSayfasiMi(browserFallback.body, browserFallback.status)) {
        yumusakEngelKoy(domain, 'tarayıcı hata sayfası');
      }
    } catch {}
  }

  // Yedek sağlayıcı (Crawlbase / ZenRows)
  const y = await yedekFetch(targetUrl, opts);
  if (y && y.status === 200) return y;
  return directResult || y;
}

/** Sağlayıcı durumunu dışarıya (ör. /api/durum) bildirir; anahtarlar asla yazılmaz. */
export { rateLimiter, circuitBreaker };

export function saglayiciDurumu() {
  // Yumuşak engel (hız sınırı) izlemesi: hangi site bizi yavaşlattı, ne zamana kadar?
  // Kullanıcı isteğiyle görünür kılındı; kalıcı çözümün sağlığını buradan izliyoruz.
  const engeller = [...yumusakEngel.entries()]
    .filter(([, v]) => Date.now() < v.bitis)
    .map(([host, v]) => ({
      host,
      neden: v.neden,
      kalanSn: Math.ceil((v.bitis - Date.now()) / 1000),
    }));
  return {
    scraperapi: config.scraperApiKey
      ? (scraperApiTukendi.bitti ? 'kredi tükendi (yedek sağlayıcılar aktif)' : 'hazır')
      : 'anahtar yok',
    crawlbase: config.crawlbaseToken ? 'hazır' : 'anahtar yok',
    zenrows: config.zenrowsApiKey ? (zenrowsTukendi.bitti ? 'kredi tükendi' : 'hazır') : 'anahtar yok',
    dogrudan: 'aktif — varsayılan (yerel Türkiye IP; 60 sitenin ~53\'ü sağlayıcısız çekilir)',
    tarayici: 'aktif (yerel Chromium; Trendyol, Amazon, n11, İncehesap, Teknosa, PTT AVM bu tarayıcıyla çekilir)',
    nazikMod: {
      aciklama: 'Site başına eşzamanlı istek sınırı; yumuşak engelde 90 sn boyunca tek istek',
      yumusakEngelde: engeller,
      hizSinirlari: rateLimiter.snapshot(),
    },
  };
}

/**
 * Bir URL'yi ScraperAPI üzerinden çeker.
 * @returns {{status:number, body:string, fromCache:boolean, requestsSpent:number, renderUsed:boolean}}
 */
export async function fetchPage(targetUrl, opts = {}) {
  // Tek uçuş deduplikasyonu: aynı anahtara (yöntem+URL+gövde) o anda giden bir istek
  // varsa sonucu bekleriz — ikinci fiziksel istek atılmaz, kredi harcanmaz.
  // Yalnızca düz GET isteklerinde uygulanır: oturumlu (session) ya da taze (fresh)
  // çok adımlı akışlar (urhanshop çerezi, IdeaSoft token'ı) çağrı başına ayrı
  // oturum/çerez kullandığı için asla birleştirilmez.
  const method = opts.method || 'GET';
  const reqBody = opts.body != null ? String(opts.body) : null;
  const dedupUygun = method === 'GET' && !opts.session && !opts.fresh && !opts.headers;
  const dedupKey = hashKey(method + ' ' + targetUrl + (reqBody ? '\n' + reqBody : ''));
  if (dedupUygun) {
    const leader = inFlightRequests.get(dedupKey);
    if (leader) {
      const r = await leader;
      return { ...r, fromCache: true, requestsSpent: 0 };
    }
    const p = fetchPageInner(targetUrl, opts).finally(() => inFlightRequests.delete(dedupKey));
    inFlightRequests.set(dedupKey, p);
    return p;
  }
  return fetchPageInner(targetUrl, opts);
}

async function fetchPageInner(targetUrl, opts = {}) {
  const site = opts.site || 'bilinmeyen';
  const purpose = opts.purpose || 'istek';
  const fresh = !!opts.fresh;
  const maxAgeMs = opts.maxAgeMs ?? config.cacheTtlMs;
  const baseTimeout = opts.timeoutMs || 60000;
  const method = opts.method || 'GET';
  const reqHeaders = opts.headers || null;
  const reqBody = opts.body != null ? String(opts.body) : null;
  const session = opts.session || null;

  // POST gövdesi farklı sorgular aynı URL'ye gidebileceği için önbellek anahtarı gövdeyi de içerir.
  // Render anahtara dahildir: render EDİLMEMİŞ (eksik/yanlış) bir yanıt, render isteyen
  // çağrıya önbellekten dönmemeli (İkas/SAMM araması bunun canlı örneğiydi).
  const key = hashKey(method + ' ' + targetUrl + (reqBody ? '\n' + reqBody : '') + (opts.render ? '\nrender' : ''));
  const cached = cacheGet(key, maxAgeMs);
  if (cached && !fresh) {
    logRequest({ site, purpose, url: targetUrl, cached: true, status: cached.status, bytes: (cached.body || '').length });
    return { status: cached.status, body: cached.body, fromCache: true, requestsSpent: 0, renderUsed: !!cached.renderUsed, cookies: [] };
  }

  const attempts = [];
  let render = !!opts.render;

  // 0) Korumalı alan adları (ör. incehesap.com): ScraperAPI yalnızca render=true ile ve
  //    ara sıra başarıyla yanıt verir. Başarısız denemeler ücretlendirilmediği için
  //    opts.renderRetry kadar ek deneme yapılır (premium KULLANILMAZ).
  if (opts.renderRetry > 0) {
    render = true;
    let ok = null;
    for (let i = 0; i < opts.renderRetry; i++) {
      const r = await rawFetch(targetUrl, { render: true, timeoutMs: 90000, method, headers: reqHeaders, body: reqBody, session, site });
      attempts.push(describeAttempt(r, true));
      if (krediBittiMi(r)) {
        logRequest({ site, purpose, url: targetUrl, cached: false, error: 'scraperapi_kredi_bitti', requests: attempts.length });
        throw new FetchError('ScraperAPI aylık kredisi tükendi. Krediler sonraki fatura döneminde yenilenir ya da dashboard.scraperapi.com/billing üzerinden plan yükseltilebilir.', { status: 103, attempts });
      }
      if (r.status === 200 && !isEmptyBody(r.body)) { ok = r; break; }
    }
    if (ok) {
      const basarili = attempts.filter(a => a.durum === 200).length;
      cacheSet(key, { url: targetUrl, status: 200, body: ok.body, renderUsed: true, ts: Date.now() });
      logRequest({ site, purpose, url: targetUrl, cached: false, status: 200, requests: basarili, render: true, korumali: true, bytes: ok.body.length, saglayici: ok.saglayici || 'scraperapi' });
      return { status: 200, body: ok.body, fromCache: false, requestsSpent: basarili, renderUsed: true, saglayici: ok.saglayici };
    }
    logRequest({ site, purpose, url: targetUrl, cached: false, error: 'korumali_alanadi_render_basarisiz', requests: attempts.length });
    throw new FetchError('Site korumalı: ' + attempts.length + ' render denemesi de başarısız oldu.', { attempts });
  }

  // 1) İlk deneme
  let res = await rawFetch(targetUrl, { render, timeoutMs: render ? 90000 : baseTimeout, method, headers: reqHeaders, body: reqBody, session, site });
  attempts.push(describeAttempt(res, render));

  // Kredi bittiyse yeniden denemek anlamsız — hemen dürüst hata ver (hızlı yanıt)
  if (krediBittiMi(res)) {
    logRequest({ site, purpose, url: targetUrl, cached: false, error: 'scraperapi_kredi_bitti', requests: attempts.length });
    throw new FetchError('ScraperAPI aylık kredisi tükendi. Krediler sonraki fatura döneminde yenilenir ya da dashboard.scraperapi.com/billing üzerinden plan yükseltilebilir.', { status: 103, attempts });
  }

  // 2) HTTP 500 / zaman aşımı / ağ hatası -> bir kez tekrar dene
  const retryable = !res.status || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 501 || res.timedOut || res.networkError;
  if (retryable) {
    res = await rawFetch(targetUrl, { render, timeoutMs: render ? 90000 : baseTimeout, method, headers: reqHeaders, body: reqBody, session, site });
    attempts.push(describeAttempt(res, render));
  }

  // 3) 200 döndü ama sayfa boş -> bir kez render=true dene (premium yok)
  if (res.status === 200 && isEmptyBody(res.body) && !render && method === 'GET') {
    render = true;
    const r2 = await rawFetch(targetUrl, { render: true, timeoutMs: 90000, site, method, headers: reqHeaders, body: reqBody, session });
    attempts.push(describeAttempt(r2, true));
    if (r2.status === 200 && !isEmptyBody(r2.body)) res = r2;
    else if (r2.timedOut || r2.networkError) {
      // render denemesi de ağ hatası verdiyse bir kez daha dene
      const r3 = await rawFetch(targetUrl, { render: true, timeoutMs: 90000, site, method, headers: reqHeaders, body: reqBody, session });
      attempts.push(describeAttempt(r3, true));
      if (r3.status === 200) res = r3;
    }
  }

  const requestsSpent = attempts.length;

  if (!res.status && res.timedOut) {
    logRequest({ site, purpose, url: targetUrl, cached: false, error: 'zaman_asimi', requests: requestsSpent });
    throw new FetchError('İstek zaman aşımına uğradı (tekrar denendi).', { attempts });
  }
  if (!res.status && res.networkError) {
    logRequest({ site, purpose, url: targetUrl, cached: false, error: 'ag_hatasi', requests: requestsSpent });
    throw new FetchError('Ağ hatası: ' + res.networkError, { attempts });
  }
  if (res.status !== 200) {
    logRequest({ site, purpose, url: targetUrl, cached: false, status: res.status, requests: requestsSpent });
    throw new FetchError('Site HTTP ' + res.status + ' döndürdü.', { status: res.status, attempts });
  }
  if (isEmptyBody(res.body)) {
    logRequest({ site, purpose, url: targetUrl, cached: false, status: 200, error: 'bos_sayfa', requests: requestsSpent });
    throw new FetchError('Sayfa boş döndü (render=true ile de denendi).', { status: 200, attempts });
  }

  // CSRF hata yanıtları (IdeaSoft canlı arama ucu) önbelleğe alınmaz; aksi halde
  // bir kez oluşan hata sürekli geri servis edilir.
  if (!/^\s*\{\s*"status"\s*:\s*"csrf"/.test(res.body)) {
    cacheSet(key, { url: targetUrl, status: res.status, body: res.body, renderUsed: render, ts: Date.now() });
  }
  logRequest({ site, purpose, url: targetUrl, cached: false, status: 200, requests: requestsSpent, render, bytes: res.body.length, saglayici: res.saglayici || 'scraperapi' });
  return { status: 200, body: res.body, fromCache: false, requestsSpent, renderUsed: render, cookies: res.cookies || [], saglayici: res.saglayici };
}

function describeAttempt(res, render) {
  if (res.timedOut) return { render, hata: 'zaman_asimi' };
  if (res.networkError) return { render, hata: 'ag_hatasi' };
  return { render, durum: res.status };
}

/** JSON içeriği (API uçları) için yardımcı: fetchPage + JSON.parse. */
export async function fetchJson(url, opts = {}) {
  const r = await fetchPage(url, opts);
  try {
    return JSON.parse(r.body);
  } catch {
    throw new FetchError('Yanıt JSON olarak ayrıştırılamadı (ilk 200 karakter: ' + String(r.body).slice(0, 200).replace(/\s+/g, ' ') + ')', { status: r.status });
  }
}

