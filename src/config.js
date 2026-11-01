import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Genel erişim adresi: PUBLIC_URL → ilk yerel ağ IPv4 → localhost.
 * Telegram botunun "Sitede Detaylı İncele" linki telefonda açılabilsin diye
 * LAN adresi tercih edilir (yalnızca aynı ağdaki cihazlar için geçerli).
 */
function yerelAdres() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const port = process.env.PORT || '3000';
  try {
    const arayuzler = os.networkInterfaces();
    const adaylar = [];
    for (const [ad, liste] of Object.entries(arayuzler)) {
      for (const a of liste || []) {
        if (!a || a.family !== 'IPv4' || a.internal) continue;
        if (a.address.startsWith('169.254.')) continue; // APIPA
        // Ev/ofis Wi-Fi genelde 192.168.* veya 10.*; 172.16–31 çoğu zaman
        // WSL/Hyper-V/Docker sanal ağıdır → en sona at.
        let puan = 3;
        if (a.address.startsWith('192.168.')) puan = 0;
        else if (a.address.startsWith('10.')) puan = 1;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) puan = 4;
        if (/vEthernet|WSL|Loopback|VirtualBox|VMware|Hyper-V/i.test(ad)) puan += 2;
        adaylar.push({ adres: a.address, puan });
      }
    }
    adaylar.sort((x, y) => x.puan - y.puan);
    if (adaylar.length) return `http://${adaylar[0].adres}:${port}`;
  } catch { /* yoksay */ }
  return `http://localhost:${port}`;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  // Telegram botunun "Sitede detaylı incele" gibi mutlak linkler üretmesi için.
  // PUBLIC_URL tanımlıysa o kullanılır; yoksa yerel ağ IP'si, o da yoksa localhost.
  publicUrl: yerelAdres(),
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
