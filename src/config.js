import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  // Yayında erişim kısıtı: .env'de ERISIM_ANAHTARI tanımlanırsa yalnızca anahtarı bilen
  // istekler kabul edilir (giriş sistemi değil, tek paylaşımlı anahtar; boşsa kısıt yok).
  erisimAnahtari: process.env.ERISIM_ANAHTARI || '',
  // ScraperAPI anahtarı yalnızca buradan okunur; koda, ön yüze ve loglara asla yazılmaz.
  scraperApiKey: process.env.SCRAPERAPI_KEY || '',
  // Yedek kazıma sağlayıcıları (ScraperAPI kredisi tükenince otomatik devreye girer)
  crawlbaseToken: process.env.CRAWLBASE_TOKEN || '',
  zenrowsApiKey: process.env.ZENROWS_API_KEY || '',
  scrapingbeeApiKey: process.env.SCRAPINGBEE_API_KEY || '',
  ai: {
    baseURL: (process.env.AI_BASE_URL || 'https://evren-llmapi.ssyz.org.tr/v1').replace(/\/+$/, ''),
    apiKey: process.env.EVREN_LLM_API_KEY || '',
    model: process.env.AI_MODEL || 'deepseek-v4.1-flash',
  },
  matching: {
    grayZoneMin: 0.50,
    grayZoneMax: 0.85,
    enableSemanticLLM: true,
  },
  dataDir: path.join(__dirname, '..', 'data'),
  cacheTtlMs: (parseInt(process.env.CACHE_TTL_MINUTES || '360', 10)) * 60 * 1000,
  // Anlık sonuç (stale-while-revalidate) ömrü. Ürün bu süre içinde taranmışsa
  // sonuç ANINDA (≈0,2 sn) gösterilir ve arka planda sessizce tazelenir.
  // Bayat veri "güncel" gibi sunulmaz: "X dk önce tarandı · güncelleniyor…" yazar.
  // Varsayılan 5 saat; SNAPSHOT_TTL_MINUTES ile değiştirilebilir. 0 → özellik kapalı.
  snapshotTtlMs: (() => {
    const dk = process.env.SNAPSHOT_TTL_MINUTES;
    if (dk === undefined) return 5 * 60 * 60 * 1000; // varsayılan 5 saat
    const n = parseInt(dk, 10);
    return Number.isFinite(n) && n >= 0 ? n * 60 * 1000 : 5 * 60 * 60 * 1000;
  })(),
  maxCandidatesPerSite: parseInt(process.env.MAX_CANDIDATES || '3', 10),
  alarmCheckMinutes: parseInt(process.env.ALARM_CHECK_MINUTES || '360', 10),
  // 🧹 Önbellek bakımı (2026-11-01): data/cache/ altındaki JSON dosyaları.
  //  - cacheSaklamaGun: bu günden eski dosyalar silinir (varsayılan 30).
  //  - cacheMaksMb: toplam boyut bu sınırı aşarsa en eski dosyalar silinir
  //    (varsayılan 0 = kapalı; disk baskısı varsa .env'de ör. 2048 yapın).
  cacheSaklamaGun: (() => {
    const n = parseInt(process.env.CACHE_SAKLAMA_GUN || '30', 10);
    return Number.isFinite(n) && n >= 1 ? n : 30;
  })(),
  cacheMaksMb: (() => {
    const n = parseInt(process.env.CACHE_MAKS_MB || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })(),
};

/** Eksik gizli anahtarları kontrol eder; sorun listesini döndürür. */
export function secretProblems() {
  const problems = [];
  if (!config.scraperApiKey) problems.push('SCRAPERAPI_KEY .env dosyasında tanımlı değil.');
  if (!config.ai.apiKey) problems.push('EVREN_LLM_API_KEY .env dosyasında tanımlı değil.');
  return problems;
}

export { config };
