/**
 * Bot koruması tespit edildiğinde fırlatılan özel hata.
 */
export class BotProtectionError extends Error {
  constructor(message, { domain, status, reason } = {}) {
    super(message);
    this.name = 'BotProtectionError';
    this.domain = domain;
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Domain bazlı Circuit Breaker (Hata Eşiği ve Cooldown Mekanizması).
 *
 * 2026-11-13 — DİNAMİK COOLDOWN (auto-healing):
 * Sabit 5 dakika yerine kademeli bekleme uygulanır:
 *   • 1. devre açılışı  : 30 sn
 *   • 2. devre açılışı  : 90 sn
 *   • 3. ve sonrası     : 240 sn
 * Amaç: geçici bir WAF dalgasında siteyi 5 dakika boyunca tamamen kaybetmek
 * yerine kısa bir mola verip hızla geri dönmek. Üst üste tekrarlayan engelde
 * bekleme uzar (siteyi dövmeyiz).
 *
 * Half-open: cooldown bitince tek deneme hakkı verilir. O deneme BAŞARILI olursa
 * domain anında sağlıklıya döner (`failures: 0, openedAt: null`).
 */
export class DomainCircuitBreaker {
  /**
   * @param {object} [opts]
   * @param {number} [opts.threshold=3] ardışık hata eşiği
   * @param {number} [opts.cooldownMs] SABİT cooldown (verilirse kademeli devre dışı)
   * @param {number[]} [opts.cooldownKademeleri] kademeli cooldown listesi (ms)
   */
  constructor({
    threshold = 3,
    cooldownMs = null,
    cooldownKademeleri = [30 * 1000, 90 * 1000, 240 * 1000],
  } = {}) {
    this.threshold = threshold;
    // Sabit mod yalnızca açıkça istenirse (testler / geriye dönük uyumluluk).
    this.sabitCooldownMs = Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : null;
    this.cooldownKademeleri = Array.isArray(cooldownKademeleri) && cooldownKademeleri.length
      ? cooldownKademeleri.map(n => Math.max(0, Number(n) || 0))
      : [30 * 1000, 90 * 1000, 240 * 1000];
    /** @type {Map<string, {failures:number, openedAt:number|null, acilisSayisi:number}>} */
    this.states = new Map();
  }

  /** Geriye dönük uyumluluk: sınıfın "cooldownMs" okuması ilk kademeyi verir. */
  get cooldownMs() {
    return this.sabitCooldownMs ?? this.cooldownKademeleri[0];
  }

  /**
   * Bir domain için geçerli cooldown süresi (açılış sayısına göre kademeli).
   * @param {number} acilisSayisi 1 tabanlı
   */
  _cooldownSuresi(acilisSayisi) {
    if (this.sabitCooldownMs != null) return this.sabitCooldownMs;
    const i = Math.min(Math.max(1, Number(acilisSayisi) || 1), this.cooldownKademeleri.length) - 1;
    return this.cooldownKademeleri[i];
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

  _state(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    let s = this.states.get(domain);
    if (!s) {
      s = { failures: 0, openedAt: null, acilisSayisi: 0 };
      this.states.set(domain, s);
    }
    return s;
  }

  /** Domain şu an cooldown'da (açık devre) mı? */
  isOpen(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    const s = this._state(domain);
    if (s.openedAt == null) return false;

    if (Date.now() - s.openedAt >= this._cooldownSuresi(s.acilisSayisi)) {
      // Half-open: tek deneme hakkı ver. Bir hata daha gelirse hemen yeniden açılır.
      s.openedAt = null;
      s.failures = this.threshold - 1;
      return false;
    }
    return true;
  }

  remainingCooldownMs(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    const s = this._state(domain);
    if (s.openedAt == null) return 0;
    return Math.max(0, this._cooldownSuresi(s.acilisSayisi) - (Date.now() - s.openedAt));
  }

  /**
   * Başarı: domain DERHAL sağlıklı moda döner (auto-healing).
   * Açılış sayacı da sıfırlanır — bir sonraki geçici engel yine 30 sn'de biter.
   */
  recordSuccess(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    this.states.set(domain, { failures: 0, openedAt: null, acilisSayisi: 0 });
  }

  /**
   * Hata kaydet.
   * @returns {boolean} true ise devre bu hata ile birlikte açıldı.
   */
  recordFailure(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    const s = this._state(domain);
    s.failures += 1;
    if (s.failures >= this.threshold && s.openedAt == null) {
      s.openedAt = Date.now();
      s.acilisSayisi += 1;
      return true;
    }
    return false;
  }

  snapshot() {
    return Object.fromEntries(
      [...this.states.entries()].map(([d, s]) => [
        d,
        {
          failures: s.failures,
          open: this.isOpen(d),
          remainingMs: this.remainingCooldownMs(d),
          acilisSayisi: s.acilisSayisi,
        },
      ]),
    );
  }
}

// Proje genelinde paylaşılan varsayılan instance — kademeli cooldown (30/90/240 sn).
export const circuitBreaker = new DomainCircuitBreaker({
  threshold: 3,
  cooldownKademeleri: [30 * 1000, 90 * 1000, 240 * 1000],
});
