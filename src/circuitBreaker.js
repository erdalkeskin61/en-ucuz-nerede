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
 * - Belirlenen eşik (threshold=3) kadar ardışık bot koruması / engelleme hatası alındığında
 *   o domain için cooldown süresi (varsayılan 5 dakika) başlar.
 * - Cooldown bitince "half-open": tek bir deneme hakkı verilir.
 *   O deneme başarısız olursa cooldown yeniden başlar.
 * - Cooldown süresi boyunca o domaine doğrudan yerel istek atılmayarak IP korunur,
 *   doğrudan proxy/fallback sağlayıcısına yönlendirilir.
 */
export class DomainCircuitBreaker {
  /**
   * @param {object} [opts]
   * @param {number} [opts.threshold=3]
   * @param {number} [opts.cooldownMs=5 * 60 * 1000] // 5 dakika
   */
  constructor({ threshold = 3, cooldownMs = 5 * 60 * 1000 } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    /** @type {Map<string, {failures:number, openedAt:number|null}>} */
    this.states = new Map();
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
      s = { failures: 0, openedAt: null };
      this.states.set(domain, s);
    }
    return s;
  }

  /** Domain şu an cooldown'da (açık devre) mı? */
  isOpen(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    const s = this._state(domain);
    if (s.openedAt == null) return false;

    if (Date.now() - s.openedAt >= this.cooldownMs) {
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
    return Math.max(0, this.cooldownMs - (Date.now() - s.openedAt));
  }

  recordSuccess(domainOrUrl) {
    const domain = this._cleanDomain(domainOrUrl);
    this.states.set(domain, { failures: 0, openedAt: null });
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
        },
      ]),
    );
  }
}

// Proje genelinde paylaşılan varsayılan instance
export const circuitBreaker = new DomainCircuitBreaker({
  threshold: 3,
  cooldownMs: 5 * 60 * 1000, // 5 dakika
});
