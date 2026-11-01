import { Agent, setGlobalDispatcher } from 'undici';
import dns from 'node:dns';

/**
 * In-Memory DNS Önbelleği (Cold-start DNS gecikmesini 0ms'ye indirir)
 * 55 e-ticaret sitesinin IP çözümlemesini bellekte tutar (TTL: 10 dakika).
 */
const dnsCache = new Map();
const DNS_TTL_MS = 10 * 60 * 1000;

function cachedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const isAll = Boolean(options && options.all);

  const cached = dnsCache.get(hostname);
  if (cached && Date.now() < cached.expiresAt) {
    if (isAll) {
      return callback(null, [{ address: cached.ip, family: cached.family }]);
    }
    return callback(null, cached.ip, cached.family);
  }

  dns.lookup(hostname, { ...options, all: false }, (err, address, family) => {
    if (!err && address) {
      const ip = typeof address === 'string' ? address : address[0]?.address;
      const fam = typeof address === 'string' ? family : address[0]?.family;
      dnsCache.set(hostname, {
        ip,
        family: fam || 4,
        expiresAt: Date.now() + DNS_TTL_MS,
      });
      if (isAll) {
        return callback(null, [{ address: ip, family: fam || 4 }]);
      }
      return callback(null, ip, fam || 4);
    }
    callback(err, address, family);
  });
}

/**
 * undici Warm Connection Agent — VARSAYILAN OLARAK DEVRE DIŞI (2026-10-28).
 *
 * Neden kapatıldı: bu ajan özel bir DNS önbelleği (cachedLookup) + agresif
 * keep-alive kullanıyordu. Sunucu sürecinde bazı siteler (filamentdepom,
 * 3dmarketim, filamentsan) bu ajan üzerinden FİYATSIZ/bozuk sayfa döndürüyordu;
 * aynı istekler ajan olmadan (varsayılan undici) sorunsuz geliyordu. Ölçüm:
 * sepet 5 ürün → ajan ile 3/5 bulunuyor, ajan kapalıyken 5/5.
 * Faydası yalnızca birkaç yüz ms; doğruluk daha önemli.
 * Gerekirse .env ile açılır: HTTP_POOL=1
 */
export const httpPoolAgent = new Agent({
  connections: 20,
  pipelining: 1,
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 300_000,
  connect: {
    lookup: cachedLookup,
    timeout: 6000,
  },
  headersTimeout: 120_000,
  bodyTimeout: 120_000,
});

// Node.js'in küresel fetch motoruna bağla — yalnızca açıkça istendiyse.
// (Aksi halde varsayılan undici kullanılır: daha yavaş el sıkışma, ama doğru yanıt.)
if (process.env.HTTP_POOL === '1') {
  setGlobalDispatcher(httpPoolAgent);
}

/**
 * 55 e-ticaret sitesinin TCP + TLS el sıkışmasını sunucu açılışında ısıtır.
 * İlk arama yapan kullanıcı cold-start (el sıkışma beklemesi) yaşamaz.
 */
export async function warmUpHosts(hosts = []) {
  if (!hosts.length) return;
  const uniqueHosts = [...new Set(hosts.filter(Boolean))];
  const t0 = performance.now();
  console.log(`[HTTP-POOL] ${uniqueHosts.length} e-ticaret sitesi için sıcak bağlantı havuzu ve DNS ısıtması başlatılıyor...`);

  // DİKKAT (2026-10-28): ısıtma, gerçek isteklerle YARIŞMAMALI. Önce 8'li gruplarla
  // 60 siteye aynı anda HEAD atılıyordu; T-Soft/IdeaSoft tabanlı siteler (filamentdepom,
  // 3dmarketim, filamentsan) bu patlamayı bot trafiği sayıp bir süre FİYATSIZ sayfa
  // döndürdü. Sepet gibi toplu işlerde bu, ürünün kaynak fiyatının okunamamasına yol açtı.
  // Artık: 3'lü gruplar + gruplar arası kısa bekleme (yumuşak ısıtma).
  const BATCH_SIZE = 3;
  let basarili = 0;

  for (let i = 0; i < uniqueHosts.length; i += BATCH_SIZE) {
    const chunk = uniqueHosts.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      chunk.map(async (host) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2500);
          await fetch(`https://${host}/`, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept': '*/*',
            },
          }).catch(() => {});
          clearTimeout(timer);
          basarili++;
        } catch {
          // Isınma hatası uygulamanın çalışmasını engellemez
        }
      })
    );
    await new Promise(r => setTimeout(r, 250)); // siteleri peş peşe dövmemek için
  }

  const duration = Math.round(performance.now() - t0);
  console.log(`[HTTP-POOL] Sıcak bağlantı havuzu hazır: ${uniqueHosts.length} sitenin ${basarili} tanesi ısıtıldı (${duration}ms).`);
}

export function getDnsCacheStats() {
  return {
    cachedDomains: dnsCache.size,
    domains: [...dnsCache.keys()],
  };
}

