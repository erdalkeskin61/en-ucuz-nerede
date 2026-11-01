/**
 * Domain bazlı Token Bucket Rate Limiter.
 * - Her alan adı için ayrı token kovası tutar.
 * - Saniyede `rate` token yenilenir, en fazla `burst` kadar birikir.
 * - İstekler arasına rastgele jitter (gecikme) ekleyerek insan benzeri davranış sergiler.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class DomainRateLimiter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.defaultRate=1]     // saniyede 1 token
   * @param {number} [opts.defaultBurst=2]    // anlık patlama sınırı
   * @param {[number, number]} [opts.jitterMs=[300, 1000]] // min/max insan beklemesi
   */
  constructor({
    defaultRate = 1,
    defaultBurst = 2,
    jitterMs = [300, 1000],
  } = {}) {
    this.defaultRate = defaultRate;
    this.defaultBurst = defaultBurst;
    this.jitterMs = jitterMs;
    /** @type {Map<string, {tokens:number, lastRefill:number, rate:number, burst:number}>} */
    this.buckets = new Map();
  }

  /** Domain için özel rate/burst ayarla (örn. Trendyol daha sıkı). */
  configure(domain, { rate, burst } = {}) {
    const d = this._cleanDomain(domain);
    const b = this._bucket(d);
    if (typeof rate === 'number') b.rate = rate;
    if (typeof burst === 'number') b.burst = burst;
    // Sıkılaştırma sonrası birikmiş token'lar hemen patlamaya dönüşmesin (2026-10-28):
    // bucket varsayılan 6 token ile doğduğu için burst=2 ayarı ilk anda 6 paralel istek
    // geçiriyordu — nazik modun amacını boşa çıkarıyordu.
    if (b.tokens > b.burst) b.tokens = b.burst;
  }

  _cleanDomain(domainOrUrl) {
    if (!domainOrUrl) return 'default';
    try {
      if (domainOrUrl.startsWith('http://') || domainOrUrl.startsWith('https://')) {
        return new URL(domainOrUrl).hostname.replace(/^www\./, '');
      }
      return domainOrUrl.replace(/^www\./, '');
    } catch {
      return domainOrUrl;
    }
  }

  _bucket(domain) {
    let b = this.buckets.get(domain);
    if (!b) {
      b = {
        tokens: this.defaultBurst,
        lastRefill: Date.now(),
        rate: this.defaultRate,
        burst: this.defaultBurst,
      };
      this.buckets.set(domain, b);
    }
    return b;
  }

  /** Token al; gerekirse bekle. Her durumda jitter uygular. */
  async acquire(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    const b = this._bucket(domain);

    // Token yenile
    const now = Date.now();
    const elapsedSec = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(b.burst, b.tokens + elapsedSec * b.rate);
    b.lastRefill = now;

    if (b.tokens >= 1) {
      b.tokens -= 1;
    } else {
      const waitMs = ((1 - b.tokens) / b.rate) * 1000;
      await sleep(waitMs);
      b.tokens = 0;
      b.lastRefill = Date.now();
    }

    await this._jitter();
  }

  async _jitter() {
    const [min, max] = this.jitterMs;
    const d = min + Math.random() * Math.max(0, max - min);
    await sleep(d);
  }

  /** Test ve log için anlık durum. */
  snapshot() {
    return Object.fromEntries(
      [...this.buckets.entries()].map(([d, b]) => [
        d,
        { tokens: +b.tokens.toFixed(2), rate: b.rate, burst: b.burst },
      ]),
    );
  }
}

// Proje genelinde paylaşılan varsayılan instance
export const rateLimiter = new DomainRateLimiter({
  defaultRate: 4,      // saniyede 4 token
  defaultBurst: 6,
  jitterMs: [40, 120], // hafif rastgele insan payı
});

// Sıkı bot koruması olan siteleri önceden yapılandır (kontrollü rate)
rateLimiter.configure('trendyol.com', { rate: 0.8, burst: 1 });
rateLimiter.configure('hepsiburada.com', { rate: 0.8, burst: 1 });
rateLimiter.configure('amazon.com.tr', { rate: 0.8, burst: 1 });
rateLimiter.configure('mediamarkt.com.tr', { rate: 0.8, burst: 1 });
rateLimiter.configure('vatanbilgisayar.com', { rate: 1, burst: 2 });

// ---- Nazik mod (2026-10-28) ----
// Sepet/çoklu tarama yükü altında T-Soft / IdeaSoft / Ticimax tabanlı küçük mağazalar
// kısa bir istek patlamasından sonra 404 + büyük hata sayfası döndürüyordu (sepetin
// 4./5. ürünü bu yüzden "fiyatsız" görünüyordu). Bu hostlarda token kovası sıkılaştırılır;
// ayrıca scraper.js aynı hosta eşzamanlı isteği 3 (yumuşak engelde 1) ile sınırlar.
const NAZIK_HOSTLAR = [
  // filament / 3D baskı mağazaları (sepetin ana kitlesi)
  'filamentsan.com', '3dmarketim.com', 'filamentdepom.com', 'robo90.com', 'domirobot.com',
  'robitshop.com', 'robotzade.com', 'kurumsalit.com', 'mintengo.com', 'rhino3dprinter.com',
  '3dultra.com.tr', 'robotizmo.net', '3dcim.com', 'makerfabrika.com', 'pusula3d.com',
  'print3d.com.tr', 'ventatek.com', 'umr3d.com', 'teknikfilament3d.com', 'sivasrobotik.com.tr',
  'robolinkmarket.com', 'robomer.com', 'robocombo.com', 'tou3d.com', 'fixx3d.com',
  '3dprinterankara.com', 'filamentmarketim.com', 'filamenthane.com', 'filamentvakti.com',
  'artyteknoloji.com', 'ileri3d.com', 'mikron3d.com', '3dcopycenter.com.tr',
  'antalya3dmarket.com', 'teknobilsem.com', '3dteknomarket.com', 'matersan.com.tr',
  'robotistan.com', 'direnc.net', 'motorobit.com', '3dortgen.com', 'shop.3dortgen.com',
  'nmosphere.com.tr', 'hepsivar.com', 'deneystore.com', 'trendruum.com',
  'bisiparisver.com', 'www.bisiparisver.com',
];
for (const h of NAZIK_HOSTLAR) rateLimiter.configure(h, { rate: 1, burst: 2 });
