/**
 * Kazıma sağlayıcılarının kredi durumu — Ayarlar sayfası panosu.
 *
 * Her sağlayıcının ÜCRETSİZ hesap/kullanım ucunu sorgular (kredi harcamaz):
 *   - ScraperAPI   /account                                     (scraper.js'teki 30 dk'lık kontrolle aynı uç)
 *   - Crawlbase    /account?product=crawling-api                (oran sınırı: 5 dakikada 1 istek → önbellek zorunlu)
 *   - ZenRows      /v1/subscriptions/self/details  (X-API-Key)  (ücretsiz, eşzamanlılık yemeden)
 *   - ScrapingBee  /v1/usage?action=get_remaining_credits
 *
 * İlkeler:
 *  - Anahtarlar hiçbir koşulda çıktıya/loglara yazılmaz.
 *  - Sahte veri yok: ucu okunamayan sağlayıcı "sorgulanamadı" olarak gösterilir.
 *  - Tüm pano 10 dakika önbelleklenir (disk: data/kredi-onbellek.json — sunucu
 *    yeniden başlasa da Crawlbase oran sınırına takılmamak için kalıcıdır).
 *    "taze" istendiğinde bile Crawlbase 5,5 dakikadan sık sorgulanmaz.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const ON_BELLEK_DOSYA = path.join(config.dataDir, 'kredi-onbellek.json');
const PANO_TTL_MS = 10 * 60 * 1000;          // pano önbelleği
const CRAWLBASE_MIN_ARALIK_MS = 5.5 * 60 * 1000; // sağlayıcının kendi oran sınırı + pay
const ZAMAN_ASIMI_MS = 15000;

const SAGLAYICI_META = {
  scraperapi: {
    ad: 'ScraperAPI',
    rol: 'Yedek',
    aciklama: 'Düz istekler (country_code=tr). Render gerektiren sitelerde istek başına 10 kredi. Kredisi bitene kadar birinciydi; yerel katmanlar devraldığından artık yalnızca yerel çekimlerin başarısız olduğu durumlarda kullanılır.',
  },
  crawlbase: {
    ad: 'Crawlbase',
    rol: 'Yedek',
    aciklama: 'Render siteleri (Hepsiburada, Çiçeksepeti), düz GET\'ler ve POST akışları. Başarısız istekler ücretlendirilmez.',
  },
  zenrows: {
    ad: 'ZenRows',
    rol: 'Yedek',
    aciklama: 'Trendyol ve Amazon.tr (premium, TR proxy) ile n11 için yedek. Taksitli kredi: düz 1, premium 25.',
  },
  scrapingbee: {
    ad: 'ScrapingBee',
    rol: 'Pasif yedek',
    aciklama: 'Şu an istek zincirinde kullanılmıyor; session_id desteklediği için olası ileride kullanım.',
  },
  dogrudan: {
    ad: 'Doğrudan (yerel IP)',
    rol: 'Yerel — birincil',
    aciklama: '60 sitenin ~53\'i (Vatan, İtopya, MediaMarkt, Pazarama, Koçtaş, Hepsiburada ve tüm küçük 3D mağazaları) uygulamanın çalıştığı yerel Türkiye IP\'inden, sağlayıcısız çekilir.',
  },
  tarayici: {
    ad: 'Yerel tarayıcı (Chromium)',
    rol: 'Yerel — birincil',
    aciklama: 'Trendyol, Amazon.tr, n11, İncehesap, Teknosa ve PTT AVM yerel headless Chromium ile render edilir (Playwright).',
  },
};

/** Kredi kavramı olmayan yerel katmanların statik durumları. */
const YEREL_KATMANLAR = {
  dogrudan: 'Ücretsiz — yerel makineden doğrudan HTTP',
  tarayici: 'Ücretsiz — yerel headless Chromium (JS render + CF geçişi)',
};

/** Diskten önbellek yükler (yoksa boş). */
let onBellek = null;
try {
  onBellek = JSON.parse(fs.readFileSync(ON_BELLEK_DOSYA, 'utf8'));
} catch { /* ilk çalıştırmada yok */ }

function onBellekYaz() {
  try { fs.writeFileSync(ON_BELLEK_DOSYA, JSON.stringify(onBellek, null, 2)); } catch { /* kritik değil */ }
}

// ---- Sağlayıcı sorguları (her biri bağımsız; biri patlarsa diğerleri gösterilir) ----

async function scraperapiSorgula() {
  const res = await fetch('https://api.scraperapi.com/account?api_key=' + encodeURIComponent(config.scraperApiKey), { signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const kullanilan = j.requestCount ?? null;
  const limit = j.requestLimit ?? null;
  const kalan = j.creditsLeft ?? (kullanilan != null && limit != null ? Math.max(limit - kullanilan, 0) : null);
  return {
    kullanilan, limit, kalan,
    yenilenme: j.nextBillingDate || null,
    durum: (kalan ?? 1) <= 0 ? 'tukendi' : 'hazir',
    not: (kalan ?? 1) <= 0
      ? 'Kredi tükendi; istekler otomatik yedek sağlayıcılara düşüyor. Kredi gelirse sistem kendiliğinden birincile döner.'
      : null,
  };
}

async function crawlbaseSorgula() {
  const res = await fetch('https://api.crawlbase.com/account?token=' + encodeURIComponent(config.crawlbaseToken) + '&product=crawling-api', { signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const ay = j.currentMonth || {};
  const basarili = Number(ay.totalSuccess ?? 0);
  const basarisiz = Number(ay.totalFailed ?? 0);
  const kalan = ay.remainingCredits != null ? Number(ay.remainingCredits) : null;
  const limit = kalan != null ? basarili + kalan : null; // abonelik planları kalanı da bildirir
  return {
    kullanilan: basarili,
    limit,
    kalan,
    basarisiz,
    yenilenme: null, // uç yenilenme tarihi bildirmiyor; istatistik takvimsel ay bazlı
    durum: 'hazir',
    not: `Bu ay ${basarisiz} başarısız istek (ücretlendirilmez)`,
  };
}

async function zenrowsSorgula() {
  const res = await fetch('https://api.zenrows.com/v1/subscriptions/self/details', {
    headers: { 'X-API-Key': config.zenrowsApiKey },
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const kullanilan = j.usage_credits ?? null;
  const limit = j.credit_limit ?? null;
  const kalan = kullanilan != null && limit != null ? Math.max(limit - kullanilan, 0) : null;
  return {
    kullanilan, limit, kalan,
    yenilenme: j.period_ends_at || null,
    durum: (kalan ?? 1) <= 0 ? 'tukendi' : 'hazir',
    not: j.status === 'TRIALING' ? 'Deneme planı' : (j.plan?.name || null),
  };
}

async function scrapingbeeSorgula() {
  const res = await fetch('https://app.scrapingbee.com/api/v1/usage?action=get_remaining_credits&api_key=' + encodeURIComponent(config.scrapingbeeApiKey), { signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const kullanilan = j.used_api_credit ?? null;
  const limit = j.max_api_credit ?? null;
  const kalan = kullanilan != null && limit != null ? Math.max(limit - kullanilan, 0) : null;
  return {
    kullanilan, limit, kalan,
    yenilenme: j.renewal_subscription_date || null,
    durum: (kalan ?? 1) <= 0 ? 'tukendi' : 'hazir',
    not: null,
  };
}

const SORGULAR = {
  scraperapi: { anahtarVar: () => !!config.scraperApiKey, sorgu: scraperapiSorgula },
  crawlbase: { anahtarVar: () => !!config.crawlbaseToken, sorgu: crawlbaseSorgula },
  zenrows: { anahtarVar: () => !!config.zenrowsApiKey, sorgu: zenrowsSorgula },
  scrapingbee: { anahtarVar: () => !!config.scrapingbeeApiKey, sorgu: scrapingbeeSorgula },
};

/**
 * Tüm sağlayıcıların kredi durumunu döndürür (önbellekli).
 * @param {{taze?:boolean}} secenekler taze=true → önbellek yarıça dönmeden yeniden sorgular
 *   (Crawlbase oran sınırı yine korunur).
 * @returns {{sonGuncelleme:string, saglayicilar:Array}}
 */
export async function saglayiciKredileri({ taze = false } = {}) {
  const simdi = Date.now();
  const kayitlar = onBellek?.kayitlar || {};

  // Pano önbelleği: kayıt var, taze değil ve TTL içinde → doğrudan dön.
  if (!taze && onBellek?.sonGuncelleme && simdi - onBellek.sonGuncelleme < PANO_TTL_MS) {
    return panoyaCevir(kayitlar, new Date(onBellek.sonGuncelleme).toISOString());
  }

  const sonucKayitlari = { ...kayitlar };
  // Yerel katmanlar (kredi harcamaz; statik durum her yanıtta tazelenir)
  for (const [id, not] of Object.entries(YEREL_KATMANLAR)) {
    sonucKayitlari[id] = { durum: 'hazir', yerel: true, not, sonKontrol: simdi };
  }
  const geciciNotlar = new Map(); // yalnızca yanıtta gösterilir; önbelleğe yazılmaz
  await Promise.all(Object.entries(SORGULAR).map(async ([id, tanim]) => {
    const eski = kayitlar[id];
    if (!tanim.anahtarVar()) {
      sonucKayitlari[id] = { durum: 'anahtar_yok', sonKontrol: eski?.sonKontrol || null };
      return;
    }
    // Crawlbase oran sınırı: taze istense bile 5,5 dakikadan sık sorgulanmaz.
    if (id === 'crawlbase' && eski?.sonKontrol && simdi - eski.sonKontrol < CRAWLBASE_MIN_ARALIK_MS) {
      geciciNotlar.set(id, 'oran sınırı: son sorgu yakındı, önbellekten gösteriliyor');
      return; // eski kayıt aynen korunur (not birikmez)
    }
    try {
      sonucKayitlari[id] = { durum: 'hazir', ...await tanim.sorgu(), sonKontrol: simdi };
    } catch (e) {
      // Sorgu başarısızsa eski veri + dürüst hata; hiç yoksa "sorgulanamadı".
      geciciNotlar.set(id, 'Sorgu başarısız (' + e.message + '); eski veri gösteriliyor');
      if (!eski) sonucKayitlari[id] = { durum: 'sorgulanamadi', hata: e.message, sonKontrol: simdi };
    }
  }));

  onBellek = { sonGuncelleme: simdi, kayitlar: sonucKayitlari };
  onBellekYaz();
  return panoyaCevir(sonucKayitlari, new Date(simdi).toISOString(), geciciNotlar);
}

/** İç kayıtları ön yüz için düzenli listede toparlar. geciciNotlar yalnızca yanıta eklenir. */
function panoyaCevir(kayitlar, sonGuncelleme, geciciNotlar = new Map()) {
  const saglayicilar = Object.keys(SAGLAYICI_META).map((id) => {
    const meta = SAGLAYICI_META[id];
    const k = kayitlar[id] || {};
    const kullanilan = k.kullanilan ?? null;
    const limit = k.limit ?? null;
    const kalan = k.kalan ?? null;
    const yuzde = kullanilan != null && limit ? Math.min(Math.round((kullanilan / limit) * 100), 100) : null;
    return {
      id,
      ad: meta.ad,
      rol: meta.rol,
      aciklama: meta.aciklama,
      durum: k.durum || 'sorgulanamadi',
      yerel: !!k.yerel,
      kullanilan,
      limit,
      kalan,
      yuzde,
      basarisiz: k.basarisiz ?? null,
      yenilenme: k.yenilenme || null,
      not: k.not || null,
      geciciNot: geciciNotlar.get(id) || null,
      hata: k.hata || null,
      sonKontrol: k.sonKontrol ? new Date(k.sonKontrol).toISOString() : null,
    };
  });
  return { sonGuncelleme, saglayicilar };
}
