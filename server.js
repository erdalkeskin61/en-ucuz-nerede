/**
 * En Ucuz Nerede — sunucu.
 * Giriş/kayıt sistemi yoktur (kişisel kullanım); yayına alırken erişimi ters vekil
 * (ör. Basic Auth ya da VPN) ile kısıtlayabilirsiniz.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import './src/httpPool.js';
import { warmUpHosts, getDnsCacheStats } from './src/httpPool.js';
import { config, secretProblems } from './src/config.js';
import { runComparison } from './src/pipeline.js';
import { detectSite, adapters } from './src/sites/index.js';
import * as store from './src/store.js';
import { startAlarmScheduler, checkAlarms, sendTestEmail, sendTestTelegram, sendTestWhatsApp, gorevDurumu } from './src/alarms.js';
import { sepetOptimize } from './src/basketOptimizer.js';
import { tamamlayiciBul } from './src/kargoTamamlayici.js';
import { barkodAra } from './src/barkod.js';
import { gorselAramaYap } from './src/gorselArama.js';
import { startTelegramBot } from './src/telegramBot.js';
import { saglayiciDurumu } from './src/scraper.js';
import { saglayiciKredileri } from './src/kredi.js';
import { getKuponlar, tumunuTopla, tazelemeGerekli } from './src/kuponlar.js';
import { afiliyeOzet, afiliyeKaydet, tiklaKaydet, tiklaOzet, afiliyeLink } from './src/afiliye.js';
import { sepetKuponAnalizi } from './src/kuponSepeti.js';
import {
  saglikKontrolu, saglikDurumu, saglikNobetcisiBaslat,
  getAdapterHealthHistory as adaptorGecmisi,
} from './src/healthPulse.js';
import { dbBakimCalistir, dbBakimDurumu, dbBoyutlari } from './src/dbBakim.js';
import { logDurumu, logRotasyonuYap, eskiArsivleriTemizle, LOG_PATH, ESIK_BAYT as LOG_ESIK_BAYT } from './src/logRotasyon.js';
import { anlikAl, anlikYaz, fiyatFarki, yasMetni, anlikIstatistik, snapshotKapat } from './src/anlikOnbellek.js';
import {
  startFirsatScheduler, firsatIstatistik, firsatTestGonder,
  firsatlariTara, firsatZamanlayiciDurdur, firsatKapat, FIRSAT_VARSAYILAN,
} from './src/firsatKanali.js';
import { birimFiyat } from './src/birimFiyat.js';
import { birimFiyatHesapla } from './src/birimFiyat.js';
import { baskiKartiBilgisi, baskiZenginlestir } from './src/baskiMaliyet.js';
import { linkCoz } from './src/linkArama.js';
import { pushDurum, pushGonder } from './src/push.js';
import { onerileriGetir } from './src/oneriler.js';
import { hizliKaynakUrunBul } from './src/urunArama.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

// Sağlık ve eklenti kontrol ucu (erişim kısıtından muaf)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, app: 'en-ucuz-nerede', siteler: adapters.length, authGerekli: Boolean(config.erisimAnahtari), pool: getDnsCacheStats() });
});

// ---- Erişim kısıtı (yayın modu) ----
// ERISIM_ANAHTARI tanımlıysa: istekler x-erisim-anahtari başlığı, ?anahtar= sorgusu ya da
// erisim_anahtari çerezi ile doğrulanır. Statik dosyalar hariç tüm /api uçları korunur.
if (config.erisimAnahtari) {
  app.use((req, res, next) => {
    const verilen = req.get('x-erisim-anahtari') || req.query.anahtar || req.headers.cookie?.match(/(?:^|;\s*)erisim_anahtari=([^;]+)/)?.[1];
    const ip = req.ip || req.socket?.remoteAddress || '';
    const isLocal = ip.includes('127.0.0.1') || ip.includes('::1') || ip === 'localhost';
    if (isLocal || verilen === config.erisimAnahtari) return next();
    // 📤 Paylaşılan sepet linkleri herkese açıktır (linki bilen görüntüler);
    // yalnızca salt okunur GET ucu muaf tutulur, yazma uçları korunur.
    if (req.method === 'GET' && /^\/api\/sepet\/paylas\/[A-Za-z0-9_-]{6,32}$/.test(req.path)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ hata: 'Erişim anahtarı gerekli ya da hatalı' });
    // Sayfalar açık kalır; ön yüz anahtarı sorar ve API isteklerine ekler.
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public')));

// ---- İş (job) yönetimi: SQLite kalıcı kuyruk + canlı önbellek (2026-10-29) ----
//
// ÖNCE: `const jobs = new Map()` — süreç ölürse TÜM işler kaybolurdu.
// ŞİMDİ: her mutasyon SQLite'a yazılır (write-through). Bellekte yalnızca canlı
// nesneler tutulur çünkü `AbortController` serileştirilemez. GET uçları işi
// bellekte bulamazsa VERİTABANINDAN okur → sunucu yeniden başlasa da geçmiş işler
// (ve sonuçları) görülebilir. REST yanıt biçimleri birebir korunmuştur.
const jobs = new Map();            // id → canlı job (Proxy, write-through)
const jobDinleyiciler = new Map(); // id → Set<res> (SSE aboneleri)

/** Gecikmeli (birleştirilmiş) yazma zamanlayıcıları. */
const jobYazZamanlayici = new Map();

/** İşin diske yazılabilir anlık görüntüsü (ek alanlar dahil). */
function jobYaz(job) {
  try { return store.saveJob(job); } catch { return false; }
}

/** 200 ms içindeki ardışık değişiklikleri tek yazmada birleştirir. */
function jobYazGecikmeli(job) {
  if (jobYazZamanlayici.has(job.id)) return;
  const t = setTimeout(() => {
    jobYazZamanlayici.delete(job.id);
    jobYaz(job);
  }, 200);
  if (t.unref) t.unref();
  jobYazZamanlayici.set(job.id, t);
}

/** Bekleyen gecikmeli yazmayı iptal edip hemen yazar (bitiş/critical anlar). */
function jobYazHemen(job) {
  const t = jobYazZamanlayici.get(job.id);
  if (t) { clearTimeout(t); jobYazZamanlayici.delete(job.id); }
  return jobYaz(job);
}

/**
 * REST uçlarının döndürdüğü alanların BİRLEŞİK görünümü (SSE için).
 * Tüm iş türleri (compare/oneri/sepet/barkod/gorsel/muadil) bu üst kümeden
 * ihtiyaç duyduğunu okur; böylece tek bir akış ucu yeterlidir.
 */
function jobGorunum(job) {
  return {
    id: job.id,
    tur: job.tur,
    status: job.status,
    progress: job.progress ?? null,
    kaynak: job.kaynak || job.result?.kaynak || null,
    partialResults: Array.isArray(job.partialResults) ? job.partialResults : [],
    result: job.result ?? null,
    error: job.error ?? null,
    sureMs: job.startedAt ? Date.now() - job.startedAt : 0,
    iptalEdildi: !!(job.result?.iptalEdildi || job.iptalIstendi),
    // Anlık sonuç (stale-while-revalidate) alanları
    mod: job.mod || null,
    surum: job.surum ?? 0,
    tazeleniyor: !!job.tazeleniyor,
    tazelemeBitti: !!job.tazelemeBitti,
    tazelemeHatasi: job.tazelemeHatasi || null,
    tazelemeFarki: job.tazelemeFarki || null,
    anlikTs: job.anlikTs || null,
    anlikYasMs: job.anlikYasMs ?? null,
    yasMetni: job.anlikYasMs != null ? yasMetni(job.anlikYasMs) : null,
    url: job.url || null,
    site: job.site || null,
  };
}

/** İş bitti mi? (anlık sonuç tazelemesi sürerken "bitmedi" sayılır) */
function jobBittiMi(job) {
  return job.status === 'done' && !job.tazeleniyor;
}

/** SSE abonelerine olay yayınlar. done/error'da bağlantılar kapatılır. */
function sseYayinla(job, olay) {
  const set = jobDinleyiciler.get(job.id);
  if (!set || !set.size) return;
  // `sunucuTs`: istemci yayın→alım gecikmesini ölçebilsin (aynı makinede aynı saat).
  const veri = { ...jobGorunum(job), sunucuTs: Date.now() };
  const bitis = olay === 'done' || olay === 'error';
  for (const res of [...set]) {
    try {
      res.write(`event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`);
      if (bitis) res.end();
    } catch {
      /* bağlantı koptu → aşağıda temizlenir */
    }
    if (bitis) set.delete(res);
  }
  if (bitis && !set.size) jobDinleyiciler.delete(job.id);
}

/** Aynı tick'te yapılan atamalar bitsin diye olayı bir sonraki tura erteler. */
function sseYayinlaGecikmeli(job, olay) {
  setTimeout(() => sseYayinla(job, olay), 0);
}

/**
 * Canlı job nesnesini write-through Proxy ile sarar.
 * Böylece mevcut kod (`job.progress = …`, `job.status = 'done'`) HİÇ değişmeden
 * hem veritabanına hem SSE abonelerine yansır.
 */
function jobProxy(hedef) {
  return new Proxy(hedef, {
    set(h, anahtar, deger) {
      const eski = h[anahtar];
      h[anahtar] = deger;
      if (anahtar === 'iptalKontrolu') return true; // serileştirilmez
      if (eski === deger) return true;

      // 1) İlerleme: sık + küçük → doğrudan kolon güncelle, sonra SSE
      if (anahtar === 'progress') {
        try { store.updateJobProgress(h.id, deger); } catch { /* yoksay */ }
        jobYazGecikmeli(h); // ek alanlar da diske
        sseYayinla(h, 'progress');
        return true;
      }

      // 2) Bitiş alanları: hemen diske yaz, olayı tick sonunda gönder
      if (anahtar === 'status' || anahtar === 'result' || anahtar === 'error') {
        jobYazHemen(h);
        if (h.status === 'done' && !h.tazeleniyor) sseYayinlaGecikmeli(h, 'done');
        else if (h.status === 'error') sseYayinlaGecikmeli(h, 'error');
        else sseYayinlaGecikmeli(h, 'progress');
        return true;
      }

      // 3) Diğer alanlar (kaynak, partialResults, surum, tazeleniyor…)
      jobYazGecikmeli(h);
      if (anahtar === 'surum' || anahtar === 'partialResults' || anahtar === 'tazeleniyor' || anahtar === 'kaynak') {
        if (h.status === 'done' && !h.tazeleniyor) sseYayinlaGecikmeli(h, 'done');
        else sseYayinlaGecikmeli(h, 'progress');
      }
      return true;
    },
  });
}

function yeniJob(tur, ek = {}) {
  const id = tur + '_' + crypto.randomBytes(8).toString('hex');
  const ham = {
    id, tur, status: 'running', startedAt: Date.now(),
    progress: null,
    result: null, error: null,
    // `updatedAt` BİLİNÇLİ olarak konmaz: saveJob her yazmada Date.now() kullanır.
    // (İlk sürümde buraya sabit zaman yazılıyordu → updated_at hiç ilerlemiyor,
    //  sıralama ve 7 günlük temizlik yanlış çalışıyordu — 2026-10-29 düzeltmesi.)
    ...ek,
  };
  const job = jobProxy(ham);
  jobs.set(id, job);
  // Hemen diske: sunucu bu satırdan sonra çökse bile iş kaydı vardır.
  jobYazHemen(job);
  if (jobs.size > 20) {
    // Arka planda tazelenen işler silinmesin (2026-10-29): durumu 'done' olsa da
    // tazeleme sürüyor ve istemci hâlâ o işi oyuyor. (DB'de kayıt zaten duruyor.)
    const oldest = [...jobs.entries()]
      .filter(([, j]) => j.status !== 'running' && !j.tazeleniyor)
      .sort((a, b) => a[1].startedAt - b[1].startedAt)[0];
    if (oldest) jobs.delete(oldest[0]);
  }
  return job;
}

/**
 * İşi bulur: önce canlı önbellek, yoksa VERİTABANI.
 * Yeniden başlatma sonrası GET uçlarının çalışmaya devam etmesini sağlar.
 */
function jobBul(id) {
  if (!id) return null;
  const canli = jobs.get(id);
  if (canli) return canli;
  try { return store.getJob(id); } catch { return null; }
}

/**
 * Anlık sonuç (snapshot) — 2026-10-29.
 * İstemciye "bu sonuç X dk önce tarandı, arka planda tazeleniyor" bilgisini taşır.
 */
function anlikBilgisi(anlik) {
  return {
    anlik: true,
    anlikTs: anlik.ts,
    anlikYasMs: anlik.yasMs,
    yasMetni: yasMetni(anlik.yasMs),
    tazeleniyor: true,
  };
}

// ---- "Ne almak istiyorsun?" öneri akışı ----
app.post('/api/oneri', (req, res) => {
  const ihtiyac = String(req.body?.ihtiyac || '').trim();
  if (!ihtiyac || ihtiyac.length < 3) return res.status(400).json({ hata: 'Lütfen ne almak istediğini bir cümleyle yaz.' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('oneri', { ihtiyac });
  import('./src/oneri.js').then(({ runOneri }) =>
    runOneri(ihtiyac, { onProgress: (p) => { job.progress = p; } })
  )
    .then(result => {
      if (!result || typeof result !== 'object') {
        job.status = 'error';
        job.error = 'Öneri servisi geçersiz sonuç döndürdü.';
        return;
      }
      job.status = 'done';
      job.result = result;
    })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ id: job.id, isId: job.id });
});

app.get('/api/oneri/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'oneri') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

/**
 * SSE (Server-Sent Events) canlı akış — 2026-10-29
 *
 * GET /api/stream/:id
 *
 * Neden: istemci 750–1000 ms'de bir HTTP isteği atıyordu; ilerleme gecikmeli
 * görünüyordu. SSE ile her ilerleme OLAY ANINDA (milisaniye) ekrana düşer.
 *
 * Davranış:
 *  - Bağlantı açılışında mevcut durum `progress` olarak gönderilir (gecikme yok).
 *  - İş zaten bittiyse `done` / `error` gönderilip bağlantı kapatılır.
 *  - 15 saniyede bir `: ping` yorumu → proxy/tarayıcı boşta kapatmasın.
 *  - İstemci sekneyi kapatırsa (`req.on('close')`) dinleyici temizlenir.
 *
 * Kimlik: EventSource başlık gönderemez; erişim anahtarı `?anahtar=` ile geçilir
 * (sunucunun mevcut erişim middleware'i ikisini de kabul eder).
 */
const SSE_PING_MS = 15000;

app.get('/api/stream/:id', (req, res) => {
  const id = String(req.params.id || '');
  const job = jobBul(id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx/proxy tamponlamasın
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const yaz = (olay, veri) => {
    try { res.write(`event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`); } catch { /* koptu */ }
  };

  // 1) Mevcut durum hemen (ilk bayt gecikmesi yok)
  const gorunum = { ...jobGorunum(job), sunucuTs: Date.now() };
  yaz('progress', gorunum);

  // 2) İş bittiyse akışı hemen kapat
  if (jobBittiMi(job)) { yaz('done', gorunum); try { res.end(); } catch { /* koptu */ } return; }
  if (job.status === 'error' || job.status === 'interrupted' || job.status === 'iptal') {
    yaz('error', gorunum);
    try { res.end(); } catch { /* koptu */ }
    return;
  }

  // 3) Abone ekle
  let set = jobDinleyiciler.get(id);
  if (!set) { set = new Set(); jobDinleyiciler.set(id, set); }
  set.add(res);

  // 4) Keep-alive ping (15 sn): yorum satırı, istemci yok sayar
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* koptu */ }
  }, SSE_PING_MS);
  if (ping.unref) ping.unref();

  // 5) Temizlik: sekme kapandı / bağlantı düştü
  let temizlendi = false;
  const temizle = () => {
    if (temizlendi) return;
    temizlendi = true;
    clearInterval(ping);
    const s = jobDinleyiciler.get(id);
    if (s) {
      s.delete(res);
      if (!s.size) jobDinleyiciler.delete(id);
    }
  };
  req.on('close', temizle);
  req.on('aborted', temizle);
  res.on('error', temizle);
});

/** Teşhis: son işler (kalıcı kuyruk). */
app.get('/api/jobs', (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const tur = req.query.tur ? String(req.query.tur) : null;
  res.json({
    ...store.jobIstatistik(),
    isler: store.listJobs({ limit, tur }),
    aktifBellek: jobs.size,
    sseAbone: [...jobDinleyiciler.values()].reduce((t, s) => t + s.size, 0),
  });
});

/**
 * Karşılaştırmayı çalıştırır, ilerlemeyi işe yazar, sonucu geçmişe + fiyat
 * geçmişine + anlık önbelleğe kaydeder (2026-10-29: anlık sonuç için ayrıştırıldı;
 * normal tarama ve arka plan tazelemesi aynı yolu kullanır).
 */
function karsilastirmaCalistir(url, job, formatSonuc) {
  return runComparison(url, {
    signal: job.iptalKontrolu.signal,
    // Tazeleme modunda sayfa önbelleği atlanır → fiyat gerçekten siteden okunur.
    taze: job.mod === 'tazeleme',
    // Opsiyonel site alt kümesi (teşhis/test). Verilmezse tüm siteler taranır —
    // varsayılan davranış değişmez (2026-10-29).
    ...(Array.isArray(job.siteler) && job.siteler.length ? { siteler: job.siteler } : {}),
    // Opsiyonel site zaman aşımı (teşhis/test). Verilmezse mevcut davranış (bekle).
    ...(Number(job.siteTimeoutMs) > 0 ? { siteTimeoutMs: Number(job.siteTimeoutMs) } : {}),
    onProgress: (siteId, info) => {
      const cur = job.progress?.[siteId] || {};
      // Proxy'yi tetiklemek için YENİ nesne atanır (yerinde mutasyon kalıcı yazmayı
      // ve SSE yayınını atlardı — 2026-10-29).
      job.progress = {
        ...(job.progress || {}),
        [siteId]: {
          site: siteId,
          status: info.status || cur.status,
          note: info.reason || info.note || cur.note || '',
          fiyat: info.product?.pricing?.toplam ?? cur.fiyat ?? null,
        },
      };

      if (info.matchBasis === 'kaynak' && info.product) {
        job.kaynak = {
          site: info.site,
          siteName: info.siteName,
          url,
          urun: info.product.title,
          marka: info.product.brand,
          modelKodu: info.product.modelCode,
          barkod: info.product.barcode,
          renk: info.product.color,
          fiyat: info.product.pricing?.toplam ?? info.product.sellingPrice,
          image: info.product.image,
        };
      }

      if (info.status === 'found' && info.product && info.product.pricing?.toplam != null) {
        const formatted = formatSonuc(info);
        const liste = [...(job.partialResults || [])];
        const idx = liste.findIndex(x => x.site === siteId);
        if (idx >= 0) liste[idx] = formatted;
        else liste.push(formatted);

        // Canlı en ucuz etiketini hesapla
        const eligible = liste.filter(x => x.renkAyni !== false && x.product?.pricing?.toplam != null && x.product?.inStock !== false);
        let minPrice = Infinity;
        let minItem = null;
        for (const item of eligible) {
          item.enUcuz = false;
          if (item.product.pricing.toplam < minPrice) {
            minPrice = item.product.pricing.toplam;
            minItem = item;
          }
        }
        if (minItem) minItem.enUcuz = true;

        // Listeyi TEK seferde ata: Proxy tetiklenir → diske yazılır + SSE yayınlanır.
        job.partialResults = liste;

        // Tazeleme sırasında kartları CANLI güncelle: her yeni fiyat geldikçe sürüm artar.
        if (job.tazeleniyor) job.surum = (job.surum || 1) + 1;
      }
    },
  })
    .then(result => {
      // Geçmiş + fiyat zaman serisi + anlık önbellek
      if (result && result.kaynak && result.ozet) {
        // En ucuz teklifin ürün adresi geçmişe de yazılır (2026-10-31):
        // "Son aramalar" listesinde doğrudan mağaza linki verilebilsin.
        const enUcuzTeklif = (result.sonuclar || []).find(s =>
          s.enUcuz && s.status === 'found' && s.product && s.renkAyni !== false);
        store.addHistory({
          url,
          urun: result.kaynak.urun,
          modelKodu: result.kaynak.modelKodu,
          enUcuzSite: result.ozet.enUcuzSite,
          enUcuzSiteId: enUcuzTeklif?.site || null,
          enUcuzFiyat: result.ozet.enUcuzFiyat,
          enUcuzUrl: enUcuzTeklif?.product?.afiliyeUrl
            || enUcuzTeklif?.product?.url
            || null,
          harcananIstek: result.ozet.harcananIstek,
        });
      }

      // Zaman serisi SQLite fiyat geçmişi kaydı (2026-10-28 düzeltmesi)
      //
      // ÖNCEKİ HATA: `pricing.listeFiyati || pricing.netFiyat` okunuyordu; bu alanlar
      // computePricing çıktısında YOK (doğru alanlar: araToplam / toplam). Sonuç:
      // değer undefined kalıyor, addPricePoint sessizce çıkıyor ve fiyat geçmişi
      // HİÇ dolmuyordu → 30 günlük grafik asla gerçek veriye kavuşamıyordu.
      const pid = result.kaynak?.modelKodu || result.kaynak?.barcode || result.kaynak?.urun;
      if (pid && Array.isArray(result.sonuclar)) {
        for (const s of result.sonuclar) {
          if (s.status !== 'found' || !s.product) continue;
          const pr = s.product.pricing || {};
          // araToplam = kargo hariç ürün tutarı; toplam = gerçekte ödenecek (kargo dahil)
          const urunFiyati = pr.araToplam ?? s.product.sellingPrice ?? null;
          const odenecek = pr.toplam ?? s.product.sellingPrice ?? null;
          if (odenecek == null || !Number.isFinite(Number(odenecek))) continue;
          store.addPricePoint({
            productId: pid,
            site: s.site,
            price: urunFiyati != null ? urunFiyati : odenecek,
            netPrice: odenecek,
          });
        }
      }

      // Anlık sonuç önbelleği (2026-10-29)
      //
      // DÜRÜSTLÜK: yalnızca TAM ve anlamlı taramalar saklanır.
      //  - İptal edilen / yarıda kalan tarama 5 saat "anlık sonuç" olarak sunulmaz
      //    (kullanıcı eksik site listesini güncel sanmasın).
      //  - Hiçbir sitede ürün bulunamadıysa da saklanmaz: site geçici olarak engellemiş
      //    olabilir; sonraki istek gerçek tarama yapmalı.
      //  - SİTE ALT KÜMESİYLE yapılan tarama (teşhis/test) asla saklanmaz: 61 sitenin
      //    12'si taranmışsa "en ucuz" iddiası yanıltıcı olur (2026-10-29 düzeltmesi).
      const altKume = Array.isArray(job.siteler) && job.siteler.length > 0;
      const tamTarama = !altKume
        && !result.ozet?.iptalEdildi
        && !(result.ozet?.taranmayanSiteSayisi > 0);
      const bulunanVar = (result.sonuclar || []).some(s => s.status === 'found' && s.product);
      if (tamTarama && bulunanVar) anlikYaz(url, result);
      return result;
    });
}

app.post('/api/compare', async (req, res) => {
  let url = String(req.body?.url || req.body?.sorgu || req.body?.q || '').trim();
  if (!url) return res.status(400).json({ hata: 'URL veya ürün adı gerekli' });

  let site = detectSite(url);
  let arananSorgu = null;

  if (!site) {
    // ⚡ Ürün adı ile doğrudan hızlı arama (2026-11-01)
    arananSorgu = url;
    try {
      const bulunan = await hizliKaynakUrunBul(url);
      if (!bulunan || !bulunan.url) {
        return res.status(404).json({
          hata: `"${url}" için karşılaştırılabilecek uygun bir ürün bulunamadı. Lütfen ürün modelini biraz daha detaylı yazın veya doğrudan ürün linkini yapıştırın.`,
        });
      }
      url = bulunan.url;
      site = detectSite(url);
    } catch (e) {
      return res.status(500).json({ hata: 'Ürün aranırken hata oluştu: ' + String(e.message || e) });
    }
    if (!site) {
      return res.status(404).json({ hata: 'Bulunan ürünün sitesi desteklenmiyor.' });
    }
  }

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const formatSonuc = (r) => ({
    site: r.site,
    siteName: r.siteName,
    status: r.status,
    reason: r.reason,
    matchBasis: r.matchBasis,
    renkAyni: r.renkAyni,
    enUcuz: !!r.enUcuz,
    kargoBedava: r.product ? (
      r.product.pricing?.kargo?.ucret === 0 ||
      r.product.pricing?.kargo?.uygulanir === false ||
      /ücretsiz|bedava/i.test(String(r.product.pricing?.kargo?.aciklama || '')) ||
      /ücretsiz|bedava/i.test(String(r.product.shipping || ''))
    ) : false,
    resmiSatici: r.product ? (
      ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'teknosa', 'itopya', 'koctas', 'robitshop', 'robotistan', 'direnc', 'samm'].includes(r.site) &&
      (!r.product.seller || /trendyol|hepsiburada|amazon|vatan|mediamarkt|teknosa|itopya|robitshop|robotistan|direnc|samm/i.test(r.product.seller) ||
       (r.product.brand && String(r.product.seller).toLowerCase().includes(String(r.product.brand).toLowerCase())))
    ) : false,
    vadeFarksizTaksit: r.product ? (
      (r.product.campaigns || []).some(c => /vade farksız|faizsiz|peşin fiyatına/i.test(c)) ||
      (r.product.pricing?.kampanyaTaksit || []).length > 0 ||
      /vade farksız|peşin fiyatına/i.test(r.product.title || '')
    ) : false,
    product: r.product ? {
      url: r.product.url,
      // Kısmi sonuç kartları ilerleme (onProgress) nesnesinden üretilir; o aşamada
      // pipeline henüz `afiliyeUrl` eklememiş olur. Bu yüzden referans BURADA,
      // güncel ayardan üretilir (fiyat/sıralama dokunulmaz).
      afiliyeUrl: r.product.afiliyeUrl || afiliyeLink(r.site, r.product.url || ''),
      title: r.product.title,
      brand: r.product.brand,
      modelCode: r.product.modelCode,
      barcode: r.product.barcode,
      color: r.product.color,
      inStock: r.product.inStock,
      seller: r.product.seller,
      image: r.product.image,
      sellingPrice: r.product.sellingPrice,
      listPrice: r.product.listPrice,
      shipping: r.product.shipping,
      campaigns: r.product.campaigns,
      classifiedCampaigns: r.product.classifiedCampaigns,
      pricing: r.product.pricing,
      // 🧾 KDV şeffaflığı (2026-10-31): KDV dahil fiyat + hariç tutar.
      vatIncluded: r.product.vatIncluded ?? null,
      vatRate: r.product.vatRate ?? null,
      priceExVat: r.product.priceExVat ?? null,
      // Birim fiyat (₺/kg / ₺/L) — canlı kartlarda da görünsün (2026-10-29).
      // Kısmi (onProgress) aşamasında henüz hesaplanmamış olabilir; burada üretilir.
      birim: r.product.birim || birimFiyat(r.product),
      // 🧵 Filament/reçine birim fiyat rozeti (2026-11-01).
      birimHesap: birimFiyatHesapla(
        r.product.title,
        r.product.pricing?.toplam ?? r.product.sellingPrice,
      ),
    } : null,
    // 🖨️ 3D Baskı Uzmanlık Modülü (2026-10-30): kart düzeyinde (pipeline ile aynı
    // sözleşme). Kısmi sonuç kartlarında da widget/rozet görünsün.
    baski: r.product ? baskiKartiBilgisi({
      ...r.product,
      birim: r.product.birim || birimFiyat(r.product),
    }) : null,
  });

  const yeniKarsilastirma = (ek = {}) => yeniJob('compare', {
    url,
    site: site.id,
    progress: {},
    kaynak: null,
    partialResults: [],
    // Opsiyonel site alt kümesi + zaman aşımı (teşhis/test) — yoksa tüm siteler.
    ...(Array.isArray(req.body?.siteler) && req.body.siteler.length
      ? { siteler: req.body.siteler.filter(s => typeof s === 'string') } : {}),
    ...(Number(req.body?.siteTimeoutMs) > 0 ? { siteTimeoutMs: Number(req.body.siteTimeoutMs) } : {}),
    // İptal: kullanıcı butona basınca abort() çağrılır; pipeline kalan siteleri atlar.
    iptalKontrolu: new AbortController(),
    ...ek,
  });
  // ---- 1) ANLIK SONUÇ (2026-10-29) ----
  // Ürün son 5 saat içinde taranmışsa: sonucu HEMEN döndür, arka planda tazele.
  const tazeZorla = req.body?.taze === true;
  const anlikHam = tazeZorla ? null : anlikAl(url);
  // Eski snapshot'larda 3D alanları yoksa okuma anında türet (0 sn korunur).
  const anlik = anlikHam ? { ...anlikHam, payload: baskiZenginlestir(anlikHam.payload) } : null;
  if (anlik) {
    const job = yeniKarsilastirma({
      mod: 'tazeleme',
      tazeleniyor: true,
      surum: 1,
      anlikTs: anlik.ts,
      anlikYasMs: anlik.yasMs,
    });
    // Eski sonuç hemen gösterilebilsin diye iş "bitmiş" sayılır; `tazeleniyor` bayrağı
    // istemciye "oyumaya devam et" der.
    job.status = 'done';
    job.result = anlik.payload;
    job.kaynak = anlik.payload.kaynak || null;

    // Arka plan tazeleme — kullanıcıyı BEKLETMEZ, hata olursa eski sonuç korunur.
    karsilastirmaCalistir(url, job, formatSonuc)
      .then((yeni) => {
        const fark = fiyatFarki(anlik.payload, yeni);
        job.result = yeni;
        job.kaynak = yeni.kaynak || job.kaynak;
        job.tazeleniyor = false;
        job.tazelemeBitti = true;
        // Snapshot `karsilastirmaCalistir` içinde güncellendi; yaş sıfırlandı.
        job.anlikTs = Date.now();
        job.anlikYasMs = 0;
        job.tazelemeFarki = fark;
        // İş sürümü artar → istemci yeni fiyatları çizer ve farkı vurgular.
        job.surum = (job.surum || 1) + 1;
      })
      .catch((e) => {
        // DÜRÜSTLÜK: eski sonuç korunur, kullanıcıya "güncellenemedi" denir.
        job.tazeleniyor = false;
        job.tazelemeHatasi = String(e.message || e);
        job.surum = (job.surum || 1) + 1;
      });

    return res.json({
      isId: job.id,
      id: job.id,
      ...anlikBilgisi(anlik),
      surum: job.surum,
      sonuc: anlik.payload,
      // SWR sözleşmesi (2026-10-30): istemci iki biçimi de kabul eder.
      // `onbellekSonuc` = önbellekten dönen son tarama, `stale:true` = bayat
      // (arka planda tazeleniyor). Geriye dönük uyumluluk için `sonuc` korunur.
      onbellekSonuc: anlik.payload,
      stale: true,
      mod: 'tazeleme',
      sonGuncelleme: anlik.ts,
      yasMs: anlik.yasMs,
      ttlMs: config.snapshotTtlMs,
    });
  }

  // ---- 2) NORMAL TARAMA ----
  const job = yeniKarsilastirma();
  karsilastirmaCalistir(url, job, formatSonuc)
    .then(result => { job.status = 'done'; job.result = result; })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id, anlik: false });
});

app.get('/api/compare/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    site: job.site,
    progress: job.progress,
    kaynak: job.kaynak || job.result?.kaynak || null,
    partialResults: job.partialResults || [],
    // Eski (3D alanları yazılmadan önce kaydedilmiş) işler de widget/rozet görsün.
    result: job.result ? baskiZenginlestir(job.result) : job.result,
    error: job.error,
    sureMs: Date.now() - job.startedAt,
    iptalEdildi: !!(job.result?.ozet?.iptalEdildi || job.iptalIstendi),

    // ---- Anlık sonuç (stale-while-revalidate) durumu, 2026-10-29 ----
    // `surum` her yeni fiyatla ARTAR; istemci sürüm değişince kartları yeniden çizer.
    mod: job.mod || null,
    surum: job.surum ?? 0,
    tazeleniyor: !!job.tazeleniyor,
    tazelemeBitti: !!job.tazelemeBitti,
    tazelemeHatasi: job.tazelemeHatasi || null,
    tazelemeFarki: job.tazelemeFarki || null,
    anlikTs: job.anlikTs || null,
    anlikYasMs: job.anlikYasMs ?? null,
    yasMetni: job.anlikYasMs != null ? yasMetni(job.anlikYasMs) : null,
  });
});

/**
 * Karşılaştırmayı iptal eder (2026-10-27 kullanıcı isteği).
 *
 * Davranış: kalan siteler TARANMAZ, o ana kadar bulunan ürünler korunur ve kısmi
 * sonuç gösterilir. O anda uçuşta olan (en fazla eşzamanlılık kadar) istek kendi
 * zaman aşımına kadar sürer — ağ isteğini zorla kesmek yarım yanıt/kaynak sızıntısı
 * üretiyordu; yeni istek açılmaması süreyi saniyeler mertebesine indiriyor.
 */
app.post('/api/compare/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'compare') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  // Arka plan tazelemesi sürüyorsa da iptal edilebilir (2026-10-29): işin durumu
  // 'done' olabilir ama tazeleme devam ediyor. İptalde eski (anlık) sonuç korunur.
  if (job.status !== 'running' && !job.tazeleniyor) {
    return res.json({ ok: true, zatenBitti: true, status: job.status });
  }
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal edilmiş */ }
  if (job.tazeleniyor) {
    job.tazeleniyor = false;
    job.tazelemeHatasi = 'Tazeleme kullanıcı tarafından durduruldu';
    job.surum = (job.surum || 1) + 1;
  }
  // Tarama sürerken bile çiplerin "iptal" görünmesi için ilerlemeyi işaretle
  const iptalProgress = { ...(job.progress || {}) };
  let degisti = false;
  for (const [siteId, p] of Object.entries(iptalProgress)) {
    if (p && p.status === 'running') {
      iptalProgress[siteId] = { ...p, status: 'iptal', note: 'Kullanıcı iptal etti' };
      degisti = true;
    }
  }
  // Yeni nesne ataması → Proxy diske yazar + SSE yayınlar (2026-10-29)
  if (degisti) job.progress = iptalProgress;
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * Sepet optimizasyonu (2026-10-27): 2-10 ürün linki alır, her ürünü sitelerde
 * arar ve üç senaryo üretir (tek mağaza / akıllı bölünmüş / maksimum tasarruf).
 */
app.post('/api/sepet', (req, res) => {
  const urunler = Array.isArray(req.body?.urunler) ? req.body.urunler : [];
  if (urunler.length < 2) return res.status(400).json({ hata: 'Sepet için en az 2 ürün gerekli' });
  if (urunler.length > 10) return res.status(400).json({ hata: 'Sepet en fazla 10 ürün alabilir' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('sepet', {
    urunSayisi: urunler.length,
    progress: {},
    hizliMod: req.body?.hizliMod !== false,
    iptalKontrolu: new AbortController(),
  });

  sepetOptimize(urunler, {
    signal: job.iptalKontrolu.signal,
    concurrency: 2,
    hizliMod: req.body?.hizliMod !== false,
    onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
  })
    .then(result => {
      job.status = 'done';
      job.result = result;
    })
    .catch(e => {
      job.status = 'error';
      job.error = String(e.message || e);
    });

  res.json({ isId: job.id });
});

app.get('/api/sepet/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'sepet') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
    iptalEdildi: !!(job.result?.iptalEdildi || job.iptalIstendi),
  });
});

app.post('/api/sepet/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'sepet') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * 📤 Sepet paylaşımı (2026-11-01).
 *
 * POST /api/sepet/paylas { sepet: <sepet sonucu> } → { id, url, path }
 * Sepet sonucu SQLite'ta saklanır; dönen kısa link herkese açık salt okunur
 * sayfaya gider. Yalnızca gerekli alanlar saklanır (boyut sınırı: 200 KB).
 */
app.post('/api/sepet/paylas', (req, res) => {
  const sepet = req.body?.sepet;
  if (!sepet || typeof sepet !== 'object' || !sepet.senaryolar) {
    return res.status(400).json({ hata: 'Paylaşılacak sepet sonucu gerekli' });
  }
  let boyut = 0;
  try { boyut = JSON.stringify(sepet).length; } catch { return res.status(400).json({ hata: 'Sepet serileştirilemedi' }); }
  if (boyut > 200_000) return res.status(413).json({ hata: 'Sepet çok büyük (200 KB sınırı)' });

  const id = store.sepetPaylasKaydet(sepet);
  if (!id) return res.status(500).json({ hata: 'Sepet kaydedilemedi' });
  const yol = '/sepet/paylas/' + id;
  const kok = `${req.protocol}://${req.get('host') || ('localhost:' + config.port)}`;
  res.json({ id, path: yol, url: kok + yol });
});

/** Paylaşılan sepeti JSON olarak döndürür (herkese açık). */
app.get('/api/sepet/paylas/:id', (req, res) => {
  const kayit = store.sepetPaylasAl(req.params.id);
  if (!kayit) return res.status(404).json({ hata: 'Paylaşılan sepet bulunamadı ya da süresi doldu' });
  res.json(kayit);
});

/** Paylaşım sayfası (salt okunur). */
app.get('/sepet/paylas/:id', (req, res) => {
  if (!store.sepetPaylasAl(req.params.id)) {
    return res.status(404).type('html').send(
      '<!doctype html><html lang="tr"><meta charset="utf-8"><title>Sepet bulunamadı</title>'
      + '<body style="font-family:system-ui;padding:48px;text-align:center;background:#F8FAFC">'
      + '<h1>🔍 Sepet bulunamadı</h1><p>Bağlantı geçersiz ya da 30 günlük saklama süresi dolmuş olabilir.</p>'
      + '<a href="/" style="color:#4338CA;font-weight:700">En Ucuz Nerede? ana sayfa</a></body></html>',
    );
  }
  res.sendFile(path.join(__dirname, 'public', 'sepet-paylas.html'));
});

/**
 * Kargo bedava tamamlayıcı önerileri (2026-10-27).
 * Örnek: POST /api/tamamlayici { site:'trendyol', sepetToplam:470, kargo:{fee:50, freeOver:500} }
 */
app.post('/api/tamamlayici', async (req, res) => {
  const site = String(req.body?.site || '').trim();
  const sepetToplam = Number(req.body?.sepetToplam);
  const kargo = req.body?.kargo || null;
  if (!site) return res.status(400).json({ hata: 'site gerekli' });
  if (!isFinite(sepetToplam) || sepetToplam <= 0) return res.status(400).json({ hata: 'sepetToplam gerekli' });
  if (!kargo) return res.status(400).json({ hata: 'kargo bilgisi gerekli' });

  try {
    const sonuc = await tamamlayiciBul(site, { sepetToplam, kargo });
    res.json(sonuc);
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

/**
 * Canlı barkod arama (2026-10-28): fiziksel mağazada okutulan barkodu sitelerde arar.
 * POST /api/barkod { barkod, rafFiyat? }
 */
app.post('/api/barkod', (req, res) => {
  const barkod = String(req.body?.barkod || '').trim();
  const rafFiyat = req.body?.rafFiyat != null ? Number(req.body.rafFiyat) : null;
  if (!barkod) return res.status(400).json({ hata: 'barkod gerekli' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('barkod', {
    barkod,
    rafFiyat: isFinite(rafFiyat) ? rafFiyat : null,
    progress: {},
    iptalKontrolu: new AbortController(),
  });

  barkodAra(barkod, {
    signal: job.iptalKontrolu.signal,
    hizliMod: req.body?.hizliMod !== false,
    onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
  })
    .then(result => { job.status = 'done'; job.result = result; })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id });
});

app.get('/api/barkod/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'barkod') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    barkod: job.barkod,
    rafFiyat: job.rafFiyat,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

app.post('/api/barkod/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'barkod') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * Görsel ürün arama (2026-10-28): fotoğraftan ürün tanıma + site taraması.
 * POST /api/gorsel { gorsel: "data:image/jpeg;base64,...", ipucu?, hizliMod? }
 */
app.post('/api/gorsel', (req, res) => {
  const ham = String(req.body?.gorsel || '');
  if (!ham) return res.status(400).json({ hata: 'gorsel gerekli (base64)' });
  if (ham.length > 8 * 1024 * 1024) return res.status(413).json({ hata: 'Görsel çok büyük (en fazla 4 MB)' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  // data URL'den mime çıkar
  const mimeEslesme = ham.match(/^data:([^;]+);base64,/);
  const mime = mimeEslesme ? mimeEslesme[1] : 'image/jpeg';

  const job = yeniJob('gorsel', {
    ipucu: String(req.body?.ipucu || '').slice(0, 200),
    progress: {},
    iptalKontrolu: new AbortController(),
  });

  gorselAramaYap(
    { base64: ham, mime, ipucu: job.ipucu },
    {
      signal: job.iptalKontrolu.signal,
      hizliMod: req.body?.hizliMod !== false,
      onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
    },
  )
    .then(result => { job.status = 'done'; job.result = result; })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id });
});

app.get('/api/gorsel/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'gorsel') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

app.post('/api/gorsel/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job) return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.tur !== 'gorsel') return res.status(400).json({ hata: 'Bu iş iptal edilemez' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});


// ---- 🔍 Arama önerileri (typeahead) — 2026-11-01 ----
// Yerel kaynaklar: popüler 3D katalog + arama geçmişi + takipler + taranmış başlıklar.
// Hedef yanıt süresi < 10 ms; ölçüm `sureMs` alanında döner.
//
// Sözleşme:
//   { oneriler: ["Bambu Lab P1S", ...],          ← temiz metin listesi (spec)
//     onerilerDetay: [{metin,tur,etiket,url}],   ← zengin liste (ikon/etiket/link)
//     sureMs, kaynakSayisi }
app.get('/api/search-suggestions', (req, res) => {
  const bas = process.hrtime.bigint();
  const sorgu = String(req.query.q || '').trim().slice(0, 80);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 8, 20));

  // 1 karakterde öneri gösterilmez (spec: en az 2 karakter).
  const detay = sorgu.length === 1
    ? []
    : onerileriGetir(sorgu, { limit, bosSorguPopuler: req.query.populer !== '0' });
  const oneriler = detay.map(o => o.metin);
  const sureMs = Number(process.hrtime.bigint() - bas) / 1e6;

  res.set('Cache-Control', 'no-store');
  res.json({
    sorgu,
    oneriler,
    onerilerDetay: detay,
    sureMs: Math.round(sureMs * 100) / 100,
    kaynakSayisi: {
      populer: detay.filter(o => o.tur === 'populer').length,
      gecmis: detay.filter(o => o.tur === 'gecmis').length,
      takip: detay.filter(o => o.tur === 'takip').length,
      tarama: detay.filter(o => o.tur === 'tarama').length,
    },
  });
});

// ---- 🔗 Link ile arama (2026-10-31) ----// Hibrit kutuya yapıştırılan bağlantıyı çözer: mağaza tanıma + ürün adı çıkarımı.
// Ağ isteği yapmaz, yalnızca URL analizi; bu yüzden yazarken canlı önizleme için uygundur.
app.post('/api/link-coz', (req, res) => {
  const r = linkCoz(req.body?.url);
  res.status(r.neden === 'bos' ? 400 : 200).json(r);
});

// ---- Ayarlar ----
/**
 * Ön yüze dönen ayar görünümü.
 *
 * GİZLİ alanlar asla dışarı çıkmaz: SMTP şifresi ve **Web Push özel anahtarı**
 * (VAPID private key). VAPID public anahtarı /api/push/vapid-key üzerinden verilir.
 */
function ayarGorunumu(s) {
  const webpush = s.webpush
    ? {
      publicKey: s.webpush.publicKey || null,
      subject: s.webpush.subject || null,
      privateKeyVar: Boolean(s.webpush.privateKey),
    }
    : null;
  return {
    ...s,
    smtp: { ...s.smtp, pass: s.smtp?.pass ? '***' : '' },
    webpush,
  };
}

app.get('/api/settings', (req, res) => {
  res.json(ayarGorunumu(store.getSettings()));
});

app.post('/api/settings', (req, res) => {
  const patch = req.body || {};
  if (patch.smtp?.pass === '***' || patch.smtp?.pass === '') delete patch.smtp.pass;
  // Özel anahtar yalnızca sunucuda; ön yüzden gelen boş/'***' değerler yazılmaz.
  if (patch.webpush) {
    const wp = { ...patch.webpush };
    if (!wp.privateKey || wp.privateKey === '***') delete wp.privateKey;
    if (!wp.publicKey) delete wp.publicKey;
    patch.webpush = wp;
  }
  const s = store.saveSettings(patch);
  startAlarmScheduler();
  // Fırsat kanalı ayarları (aralık/kanal/açık-kapalı) yeniden kurulur.
  try { startFirsatScheduler(); } catch (e) {
    console.warn('[firsat] zamanlayıcı güncellenemedi:', String(e.message || e).slice(0, 120));
  }
  res.json(ayarGorunumu(s));
});

// ---- Takip edilen ürünler ----
app.get('/api/tracked', (req, res) => {
  res.json(store.getTracked());
});

// Hedef fiyat güncelleme (indirim botu)
app.post('/api/tracked/:id/hedef', (req, res) => {
  const hedefFiyat = Number(req.body?.hedefFiyat);
  if (!hedefFiyat || hedefFiyat <= 0) return res.status(400).json({ hata: 'Geçerli bir hedef fiyat gerekli' });
  const guncel = store.updateTracked(req.params.id, { hedefFiyat });
  if (!guncel) return res.status(404).json({ hata: 'Takip bulunamadı' });
  res.json(guncel);
});

// ---- İndirim botu görevi ----
app.post('/api/alarm/calistir', async (req, res) => {
  try {
    const r = await checkAlarms();
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

app.post('/api/alarm/test-email', async (req, res) => {
  try {
    const r = await sendTestEmail();
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

app.post('/api/alarm/test-telegram', async (req, res) => {
  try {
    const { botToken, chatId } = req.body || {};
    const r = await sendTestTelegram({ botToken, chatId });
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

app.post('/api/alarm/test-whatsapp', async (req, res) => {
  try {
    const { webhookUrl, phone } = req.body || {};
    const r = await sendTestWhatsApp({ webhookUrl, phone });
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

// ---- 🔔 Web Push (2026-11-01) ----
// VAPID public anahtarı ön yüze verilir; özel anahtar asla dışarı çıkmaz.
app.get('/api/push/vapid-key', (req, res) => {
  const d = pushDurum();
  if (!d.hazir) return res.status(500).json({ hata: d.hata || 'Push hazırlanamadı' });
  res.json({ publicKey: d.publicKey, abone: d.abone });
});

app.post('/api/push/subscribe', (req, res) => {
  const abonelik = req.body?.subscription || req.body;
  const ok = store.pushAbonelikKaydet(abonelik);
  if (!ok) return res.status(400).json({ hata: 'Geçersiz abonelik (endpoint/keys eksik)' });
  res.json({ ok: true, abone: store.pushIstatistik().abone });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint;
  const silindi = store.pushAbonelikSil(endpoint);
  res.json({ ok: true, silindi, abone: store.pushIstatistik().abone });
});

// Test bildirimi: abonelik gerçekten çalışıyor mu? (Ayarlar/ön yüz düğmesi)
app.post('/api/push/test', async (req, res) => {
  try {
    const r = await pushGonder({
      baslik: req.body?.baslik || '🔔 En Ucuz Nerede? — bildirimler açık',
      govde: req.body?.govde || 'Fiyat alarmlarını bu cihazdan alacaksınız.',
      url: req.body?.url || '/',
      etiket: 'eun-test',
    });
    if (!r.abone) return res.status(400).json({ hata: 'Kayıtlı cihaz yok. Önce bildirimleri açın.' });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: String(e.message || e) });
  }
});

app.get('/api/gorev', (req, res) => {
  res.json(gorevDurumu());
});

// ---- 📢 Otonom Fırsat Kanalı (2026-10-30) ----
app.get('/api/firsat/durum', (req, res) => {
  res.json({ ...firsatIstatistik(), varsayilan: FIRSAT_VARSAYILAN });
});

// Kanala test paylaşımı: gerçek fırsat varsa onu, yoksa uydurma fiyat olmadan
// yalnızca bağlantı testi mesajını gönderir.
app.post('/api/firsat/test', async (req, res) => {
  try {
    const { kanal, botToken } = req.body || {};
    const r = await firsatTestGonder({ kanal, botToken });
    res.json(r);
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
});

// Elle tetikleme (Ayarlar/test). `taze:true` takip ürünlerini de yeniden tarar.
app.post('/api/firsat/calistir', async (req, res) => {
  try {
    const r = await firsatlariTara({
      taze: req.body?.taze === true,
      gonder: req.body?.gonder !== false,
      zorla: req.body?.zorla === true,
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

app.post('/api/tracked', (req, res) => {
  const { sonuc, hedefFiyat } = req.body || {};
  if (!sonuc?.kaynak) return res.status(400).json({ hata: 'Karşılaştırma sonucu gerekli' });
  const found = (sonuc.sonuclar || []).filter(r => r.status === 'found' && r.product?.pricing);
  const item = store.addTracked({
    modelKodu: sonuc.kaynak.modelKodu,
    urun: sonuc.kaynak.urun,
    renk: sonuc.kaynak.renk,
    image: found[0]?.product?.image || null,
    hedefFiyat,
    urunler: found.map(r => ({ site: r.site, url: r.product.url })),
  });

  // Telegram aktifse anında teyit bildirimi gönder
  const s = store.getSettings();
  if (s.telegram?.enabled && s.telegram?.botToken && s.telegram?.chatId) {
    const u = sonuc.kaynak.urun || 'Ürün';
    const hedef = Number(hedefFiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
    const msg = '🔔 <b>Yeni Ürün Takibe Alındı!</b>\n\n📦 <b>' + u + '</b>\n🎯 Hedef Fiyat: <b>' + hedef + '</b>\n\nFiyat 60 siteden herhangi birinde ' + hedef + ' altına düştüğünde Telegram\'dan anında haber vereceğim! 🚀';
    sendTestTelegram({ botToken: s.telegram.botToken, chatId: s.telegram.chatId, icerik: msg, konu: 'Fiyat Alarmı Kuruldu' }).catch(() => {});
  }

  res.json(item);
});

app.delete('/api/tracked/:id', (req, res) => {
  store.removeTracked(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tracked/:id/check', async (req, res) => {
  const t = store.getTracked().find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ hata: 'Takip bulunamadı' });
  try {
    const r = await checkAlarms();
    res.json({ ok: true, sonuc: r });
  } catch (e) {
    res.status(500).json({ hata: e.message });
  }
});

// ---- Geçmiş ve durum ----
// Son aramalar: her kayda ürün linki + (varsa) en ucuz mağaza linki eklenir.
// Eski kayıtlarda `enUcuzUrl` yoksa güncel snapshot'tan tamamlanır (diskten okuma).
app.get('/api/history', (req, res) => {
  const liste = store.getHistory();
  const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const h of liste) {
    if (h.enUcuzUrl) continue;
    // 1) Güncel snapshot'tan en ucuz teklifin adresi (diskten okuma).
    try {
      const anlik = anlikAl(h.url);
      const teklif = (anlik?.payload?.sonuclar || []).find(s =>
        s.enUcuz && s.status === 'found' && s.product);
      if (teklif?.product) {
        h.enUcuzUrl = teklif.product.afiliyeUrl || teklif.product.url || null;
        h.enUcuzSiteId = h.enUcuzSiteId || teklif.site || null;
      }
    } catch { /* yoksay */ }
    if (h.enUcuzUrl) continue;
    // 2) En ucuz mağaza kaynak sitenin kendisiyse kaynak link zaten cevaptır.
    //    (Uydurma yok: yalnızca host ile mağaza adı eşleştiğinde.)
    try {
      const host = normalize(new URL(h.url).hostname.replace(/^www\./, ''));
      const site = normalize(h.enUcuzSite);
      if (site && host && (host.startsWith(site) || site.startsWith(host))) {
        h.enUcuzUrl = h.url;
        h.enUcuzSiteId = h.enUcuzSiteId || null;
      }
    } catch { /* geçersiz URL */ }
  }
  res.json(liste);
});

app.get('/api/price-history/:id?', (req, res) => {
  const pid = req.params.id || req.query.id;
  const currentPrice = req.query.currentPrice ? parseFloat(req.query.currentPrice) : null;
  const currentAvg = req.query.currentAvg ? parseFloat(req.query.currentAvg) : null;
  const currentMax = req.query.currentMax ? parseFloat(req.query.currentMax) : null;
  res.json(store.getPriceAnalytics(pid, { currentPrice, currentAvg, currentMax }));
});

app.post('/api/price-history', (req, res) => {
  const { productId, currentPrice, currentAvg, currentMax, currentItems } = req.body || {};
  res.json(store.getPriceAnalytics(productId, { currentPrice, currentAvg, currentMax, currentItems }));
});

// Sağlık kontrolü eşzamanlı çalışmasın (2026-10-29)
let healthCalisiyor = false;

app.get('/api/durum', (req, res) => {
  res.json({
    scraperApiHazir: !!config.scraperApiKey,
    yzHazir: !!config.ai.apiKey,
    yzModel: config.ai.model,
    desteklenenSiteler: adapters.map(a => a.id),
    siteler: adapters.map(a => ({ id: a.id, ad: a.name })),
    kazimaSaglayicilari: saglayiciDurumu(),
    // Anlık sonuç önbelleği (2026-10-29)
    anlikSonuc: anlikIstatistik(),
    // Adaptör sağlık nöbetçisi + log rotasyonu (2026-10-29)
    saglik: saglikDurumu(),
    log: logDurumu(),
    // Kalıcı iş kuyruğu (2026-10-29)
    isler: { ...store.jobIstatistik(), aktifBellek: jobs.size },
  });
});

/**
 * Adaptör sağlık nöbetçisi (Health Pulse) — 2026-10-29
 *
 * POST /api/health/check { siteIds?: string[], bildir?: boolean } *   Tüm adaptörleri (ya da verilen alt kümeyi) hafif testle yoklar.
 *   Varsayılan olarak Telegram bildirimi GÖNDERMEZ (elle tetiklemede spam olmasın);
 *   `bildir: true` ile açıkça istenir.
 *
 * GET /api/health            → son sağlık durumu (her mağaza)
 * GET /api/health/:site      → tek adaptörün geçmişi
 */
app.post('/api/health/check', async (req, res) => {
  if (healthCalisiyor) return res.status(429).json({ hata: 'Sağlık kontrolü zaten çalışıyor' });
  const siteIds = Array.isArray(req.body?.siteIds) ? req.body.siteIds.filter(s => typeof s === 'string') : null;
  const bildir = req.body?.bildir === true;

  if (siteIds && !siteIds.length) return res.status(400).json({ hata: 'siteIds boş olamaz' });
  if (siteIds) {
    const bilinmeyen = siteIds.filter(id => !adapters.some(a => a.id === id));
    if (bilinmeyen.length) return res.status(400).json({ hata: 'Bilinmeyen site: ' + bilinmeyen.join(', ') });
  }

  healthCalisiyor = true;
  try {
    const r = await saglikKontrolu({ siteIds, bildir });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: 'Sağlık kontrolü başarısız: ' + String(e.message || e) });
  } finally {
    healthCalisiyor = false;
  }
});

app.get('/api/health', (req, res) => {
  res.json(saglikDurumu());
});

/**
 * 🧹 Veritabanı bakımı (2026-11-01)
 *
 * GET  /api/db/bakim  → son çalışma özeti + dosya boyutları + saklama ayarları
 * POST /api/db/bakim  → elle çalıştır { kuru?: boolean, cacheGun?: number }
 *
 * İstek uzun sürebilir (önbellek taraması); aynı anda ikinci çalıştırma 429 döner.
 * `kuru: true` hiçbir şey silmez, yalnızca neyin silineceğini raporlar.
 */
let bakimCalisiyor = false;

app.get('/api/db/bakim', (req, res) => {
  res.json({ ...dbBakimDurumu(), calisiyor: bakimCalisiyor, boyutlar: dbBoyutlari() });
});

app.post('/api/db/bakim', async (req, res) => {
  if (bakimCalisiyor) return res.status(429).json({ hata: 'Bakım zaten çalışıyor' });
  bakimCalisiyor = true;
  try {
    const r = await dbBakimCalistir({
      kuru: req.body?.kuru === true,
      cacheGun: Number(req.body?.cacheGun) || undefined,
      snapshotGun: Number(req.body?.snapshotGun) || undefined,
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ hata: 'Bakım başarısız: ' + String(e.message || e) });
  } finally {
    bakimCalisiyor = false;
  }
});

/**
 * Log rotasyonu (2026-10-29)
 * POST /api/log/rotate  → elle döndür
 * POST /api/log/cleanup → 15 günden eski arşivleri sil
 */
app.post('/api/log/rotate', async (req, res) => {
  try {
    res.json(await logRotasyonuYap('elle'));
  } catch (e) {
    res.status(500).json({ hata: 'Rotasyon başarısız: ' + String(e.message || e) });
  }
});

app.post('/api/log/cleanup', async (req, res) => {
  try {
    res.json(await eskiArsivleriTemizle());
  } catch (e) {
    res.status(500).json({ hata: 'Temizlik başarısız: ' + String(e.message || e) });
  }
});

app.get('/api/health/:site', (req, res) => {
  const site = String(req.params.site || '');
  if (!adapters.some(a => a.id === site)) return res.status(404).json({ hata: 'Bilinmeyen site' });
  const ad = adapters.find(a => a.id === site)?.name || site;
  const gecmis = adaptorGecmisi(site, 30);
  res.json({
    site,
    siteName: ad,
    son: saglikDurumu().siteDurumlari[site] || null,
    gecmis,
  });
});

/**
 * Muadil (alternatif) ürün önerisi — 2026-10-28
 *
 * POST /api/muadil { url?, sonuc?, butce?, elle? }
 *   - `sonuc` verilirse doğrudan onunla çalışır (istemci zaten karşılaştırma sonucunu
 *     elinde tutuyor → ikinci kez tarama yapılmaz, kredi harcanmaz).
 *   - `url` verilirse önce karşılaştırma çalıştırılır.
 *
 * GET  /api/muadil/:id  → iş durumu
 * POST /api/muadil/:id/iptal
 */
app.post('/api/muadil', (req, res) => {
  const sonuc = req.body?.sonuc && typeof req.body.sonuc === 'object' ? req.body.sonuc : null;
  const url = String(req.body?.url || '').trim();
  const butce = Number(req.body?.butce) > 0 ? Number(req.body.butce) : null;
  const elle = req.body?.elle === true;

  if (!sonuc && !url) return res.status(400).json({ hata: 'sonuc ya da url gerekli' });
  if (!sonuc && !detectSite(url)) return res.status(400).json({ hata: 'Bu site desteklenmiyor' });

  const problems = secretProblems();
  if (problems.length) return res.status(500).json({ hata: problems.join(' ') });

  const job = yeniJob('muadil', { url: url || null, butce, elle, iptalKontrolu: new AbortController() });

  (async () => {
    let kaynakSonuc = sonuc;
    if (!kaynakSonuc) {
      // İlerleme göster: karşılaştırma 1-2 dakika sürebiliyor, ekran donmasın.
      job.progress = { faz: 'karsilastirma', not: 'Önce ürünün kendisi karşılaştırılıyor…' };
      kaynakSonuc = await runComparison(url, {
        signal: job.iptalKontrolu.signal,
        onProgress: (siteId, info) => {
          job.progress = {
            faz: 'karsilastirma',
            site: siteId,
            not: `${info?.siteName || siteId}: ${info?.status === 'found' ? 'bulundu' : (info?.reason || 'taranıyor')}`,
          };
        },
      });
    }
    const { muadilBul } = await import('./src/alternatif.js');
    return muadilBul(kaynakSonuc, {
      butce,
      elle,
      signal: job.iptalKontrolu.signal,
      onProgress: (p) => { job.progress = { ...job.progress, ...p }; },
    });
  })()
    .then((r) => { job.status = 'done'; job.result = r; })
    .catch((e) => { job.status = 'error'; job.error = String(e.message || e); });

  res.json({ isId: job.id, id: job.id });
});

app.get('/api/muadil/:id', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'muadil') return res.status(404).json({ hata: 'İş bulunamadı' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'done' ? (job.result ?? null) : null,
    error: job.error ?? null,
    sureMs: Date.now() - job.startedAt,
  });
});

app.post('/api/muadil/:id/iptal', (req, res) => {
  const job = jobBul(req.params.id);
  if (!job || job.tur !== 'muadil') return res.status(404).json({ hata: 'İş bulunamadı' });
  if (job.status !== 'running') return res.json({ ok: true, zatenBitti: true, status: job.status });
  job.iptalIstendi = true;
  try { job.iptalKontrolu?.abort(); } catch { /* zaten iptal */ }
  res.json({ ok: true, iptalEdildi: true });
});

/**
 * Sepet kupon otomasyonu — 2026-10-28
 *
 * POST /api/sepet-kupon { gruplar: [{site, siteName, araToplam, urunler:[{ad,fiyat}]}] }
 * Sepet senaryosunun mağaza gruplarını alır, her grup için koşulları karşılayan
 * kuponları ve kopyalanabilir kodları döndürür.
 */
app.post('/api/sepet-kupon', (req, res) => {
  const gruplar = Array.isArray(req.body?.gruplar) ? req.body.gruplar : [];
  if (!gruplar.length) return res.status(400).json({ hata: 'gruplar gerekli' });
  if (gruplar.length > 20) return res.status(400).json({ hata: 'en fazla 20 mağaza grubu' });
  try {
    res.json(sepetKuponAnalizi(gruplar));
  } catch (e) {
    res.status(500).json({ hata: 'Kupon analizi yapılamadı: ' + e.message });
  }
});

/**
 * Satış ortaklığı (affiliate) — 2026-10-28
 *
 * Tarafsızlık sözleşmesi: bu uçlar yalnızca "dışa giden bağlantı" yapılandırmasını
 * yönetir. Fiyat, sıralama ve "en ucuz" hesabı bu ayarlardan hiç etkilenmez.
 *
 * GET  /api/afiliye          → ağlar, komisyon aralıkları, yapılandırma durumu (token maskeli)
 * POST /api/afiliye          → ağ token/parametre/şablonu kaydeder
 * POST /api/afiliye/tikla    → tıklama sayacı (yerel, kişisel veri yok)
 * GET  /api/afiliye/tikla    → son 30 günün tıklama özeti
 */
app.get('/api/afiliye', (req, res) => {
  try {
    res.json({ ...afiliyeOzet(adapters.map(a => a.id)), tiklamalar: tiklaOzet(30) });
  } catch (e) {
    res.status(500).json({ hata: 'Satış ortaklığı durumu okunamadı: ' + e.message });
  }
});

app.post('/api/afiliye', (req, res) => {
  try {
    const kayit = afiliyeKaydet(req.body || {});
    res.json({ ok: true, ...afiliyeOzet(), kayit: { etkin: kayit.etkin } });
  } catch (e) {
    res.status(500).json({ hata: 'Satış ortaklığı ayarları kaydedilemedi: ' + e.message });
  }
});

app.post('/api/afiliye/tikla', (req, res) => {
  // Fire-and-forget: kullanıcıyı bekletmemek için her durumda hızlı 204 döner.
  try {
    const site = String(req.body?.site || '');
    // Yalnızca bilinen site kimlikleri sayılır (serbest metin dosyaya yazılmaz).
    if (adapters.some(a => a.id === site)) tiklaKaydet(site);
  } catch { /* sayaç hatası kullanıcıyı etkilemez */ }
  res.status(204).end();
});

app.get('/api/afiliye/tikla', (req, res) => {
  res.json(tiklaOzet(30));
});

// Sağlayıcı kredi panosu (Ayarlar sayfası). Ücretsiz hesap uçlarından okur,
// sunucu tarafında 10 dk önbelleklenir; ?taze=1 zorla yeniler (Crawlbase oran sınırı korunur).
app.get('/api/kredi', async (req, res) => {
  try {
    res.json(await saglayiciKredileri({ taze: req.query.taze === '1' }));
  } catch (e) {
    res.status(500).json({ hata: 'Kredi durumu alınamadı: ' + e.message });
  }
});

// Toplanan kupon / site kampanyaları (Ayarlar panosu)
app.get('/api/kuponlar', (req, res) => {
  res.json(getKuponlar());
});

// Kupon toplayıcıyı hemen çalıştır (site listesi verilebilir)
let kuponIsi = null;
app.post('/api/kuponlar/topla', async (req, res) => {
  if (kuponIsi) return res.status(429).json({ hata: 'Toplama zaten çalışıyor' });
  const siteIds = Array.isArray(req.body?.siteler) && req.body.siteler.length ? req.body.siteler : null;
  kuponIsi = tumunuTopla({ fresh: true, siteIds })
    .then(r => ({ ok: true, ...r }))
    .catch(e => ({ ok: false, hata: String(e.message || e) }))
    .finally(() => { kuponIsi = null; });
  // Uzun sürebilir; sonucu bekleyip döndür (Ayarlar'da "topla" düğmesi bunu bekler)
  res.json(await kuponIsi);
});

/**
 * Kupon/kampanya toplayıcı zamanlayıcısı: açılışta kayıt 12 saatten eskiyse arka
 * planda toplar; sonra her 12 saatte bir yeniler. Hata olsa bile sunucu çalışmaya
 * devam eder (kampanya yoksa fiyatlama normal çalışır).
 */
function kuponZamanlayiciBaslat() {
  const calistir = async (neden) => {
    if (kuponIsi) return;
    try {
      console.log('[kupon] toplama başladı (' + neden + ')');
      kuponIsi = tumunuTopla({ fresh: false });
      const r = await kuponIsi;
      const toplam = (r.sonuclar || []).reduce((s, x) => s + (x.kampanyaSayisi || 0), 0);
      console.log('[kupon] tamamlandı: ' + toplam + ' kampanya, ' + (r.sonuclar || []).length + ' site');
    } catch (e) {
      console.warn('[kupon] toplama hatası: ' + String(e.message || e).slice(0, 120));
    } finally {
      kuponIsi = null;
    }
  };
  if (tazelemeGerekli()) setTimeout(() => calistir('açılış'), 8000);
  setInterval(() => { if (tazelemeGerekli()) calistir('zamanlanmış'); }, 60 * 60 * 1000).unref();
}

app.listen(config.port, config.host, () => {
  const problems = secretProblems();
  console.log('En Ucuz Nerede çalışıyor: http://' + (config.host === '0.0.0.0' ? 'localhost' : config.host) + ':' + config.port);
  if (config.erisimAnahtari) console.log('Erişim kısıtı: AÇIK (ERISIM_ANAHTARI tanımlı)');
  if (problems.length) console.warn('UYARI:', problems.join(' '));

  // ---- Kalıcı iş kuyruğu: açılış kurtarma (2026-10-29) ----
  // Yarıda kalan işler dürüstçe 'interrupted' işaretlenir; 7 günden eski
  // tamamlanmış işler temizlenir.
  try {
    const yarim = store.markInterruptedJobs();
    if (yarim) console.log(`[jobs] ${yarim} yarıda kalan iş "interrupted" olarak işaretlendi`);
    const silinen = store.cleanupOldJobs(7);
    if (silinen) console.log(`[jobs] ${silinen} eski iş kaydı temizlendi (7 gün+)`);
    // 📤 30 günden eski paylaşılan sepet bağlantıları silinir (2026-11-01).
    const eskiPaylasim = store.sepetPaylasTemizle(30);
    if (eskiPaylasim) console.log(`[paylas] ${eskiPaylasim} eski sepet linki temizlendi (30 gün+)`);
    // 🔔 Web Push anahtarları ilk açılışta üretilip ayarlara yazılır (2026-11-01).
    try { pushDurum(); } catch { /* isteğe bağlı */ }
    const st = store.jobIstatistik();
    if (st.toplam) console.log(`[jobs] kalıcı kuyrukta ${st.toplam} iş kaydı var`);
  } catch (e) {
    console.warn('[jobs] açılış kurtarma hatası:', String(e.message || e).slice(0, 120));
  }
  // 6 saatte bir eski iş temizliği (uzun süre çalışan süreçte de tablo şişmesin)
  const jobTemizlik = setInterval(() => {
    try { store.cleanupOldJobs(7); } catch { /* yoksay */ }
  }, 6 * 60 * 60 * 1000);
  if (jobTemizlik.unref) jobTemizlik.unref();

  // Günlük kontrol takvimi: eski 2 kontrollük kurulumu 5 kontrole taşır (bir kez).
  store.takvimiGuncelle();
  startAlarmScheduler();
  kuponZamanlayiciBaslat();
  startTelegramBot();
  // 📢 Otonom fırsat kanalı: her `firsat.saatAraligi` saatte bir sessizce çalışır.
  // Ayarlar panelden kapatılırsa döngü hiçbir şey yapmaz.
  try {
    startFirsatScheduler();
  } catch (e) {
    console.warn('[firsat] zamanlayıcı başlatılamadı:', String(e.message || e).slice(0, 120));
  }
  // 🔍 Öneri motorunu ısıt: ilk tuş vuruşunda disk/DB gecikmesi olmasın.
  try { onerileriGetir(''); } catch { /* yoksay */ }
  // Adaptör sağlık nöbetçisi: her gece 04:00 (2026-10-29)
  try {
    const h = saglikNobetcisiBaslat({ bildir: true });
    console.log(`[health] nöbetçi kuruldu — her gece ${h.saat}:00 (${Math.round(h.sonrakiKontrolMs / 60000)} dk sonra)`);
  } catch (e) {
    console.warn('[health] nöbetçi başlatılamadı:', String(e.message || e).slice(0, 120));
  }
  // Açılışta log boyutu eşiği aşmışsa hemen döndür (2026-10-29)
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size >= LOG_ESIK_BAYT) {
      setTimeout(() => {
        logRotasyonuYap('boyut').then(r => {
          if (r.dondu) console.log(`[log] açılış rotasyonu: ${r.dosya} (${Math.round(r.bayt / 1024 / 1024 * 100) / 100} MB → ${Math.round((r.arsivBayt || 0) / 1024 / 1024 * 100) / 100} MB)`);
        }).catch(() => {});
      }, 5000).unref();
    }
  } catch { /* boyut okunamazsa geç */ }
  const primaryHosts = adapters.map(a => a.hosts?.[0]).filter(Boolean);
  // Bağlantı ısıtma VARSAYILAN OLARAK KAPALI (2026-10-28).
  //
  // Ölçüm: 60 siteye kısa sürede HEAD atmak T-Soft/IdeaSoft tabanlı siteleri
  // (filamentdepom, 3dmarketim, filamentsan) geçici olarak FİYATSIZ sayfa döndürmeye
  // itiyor. Sepet gibi toplu işlerde bu, ürünün kaynak fiyatının okunamaması ve
  // ürünün sepetten düşmesi demekti (5 ürünlük sepette 2 ürün kayboluyordu; ısıtma
  // kapalıyken 5/5 bulundu). Faydası yalnızca ilk istekte birkaç yüz ms.
  // Gerekirse .env ile açılır: HTTP_POOL_WARMUP=1
  if (process.env.HTTP_POOL_WARMUP === '1') {
    setTimeout(() => warmUpHosts(primaryHosts), 20000);
  }
});

// ---- Temiz kapanış: SQLite/WAL bağlantısını düzgün kapat ----
// Windows'ta açık kalan WAL dosyası sonraki açılışta kilit sorunlarına yol açabilir.
let kapaniyor = false;
for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.once(sinyal, () => {
    if (kapaniyor) return;
    kapaniyor = true;
    try { firsatZamanlayiciDurdur(); } catch { /* zamanlayıcı yok */ }
    try { firsatKapat(); } catch { /* zaten kapalı */ }
    try { snapshotKapat(); } catch { /* zaten kapalı */ }
    process.exit(0);
  });
}



