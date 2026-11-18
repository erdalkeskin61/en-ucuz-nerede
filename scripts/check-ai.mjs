/**
 * 🤖 YZ (EVREN LLM) bağlantı doğrulayıcı — 2026-11-10
 *
 * Ne yapar: EVREN LLM API'sine tek bir küçük istek atar ve yanıt alıp almadığını
 * söyler. ScraperAPI kredisi HARCAMAZ. `npm run check:ai` ile çalışır.
 *
 * NEDEN YENİDEN YAZILDI (2026-11-10):
 *  - Eski sürümde `fetch()` çağrısında **hiçbir zaman aşımı yoktu**. EVREN askıda
 *    kaldığında betik dakikalarca kilitleniyordu (Node.js sonsuz bekler).
 *  - 503 `model_capacity_exhausted` / 429 `rate_limit` anlık ve GEÇİCİ hatalardır;
 *    eski kod ilk denemede pes edip çıkıyordu. Artık kademeli geri çekilmeyle
 *    (2 sn → 4 sn) en fazla 3 kez denenir.
 *  - Qwen/DeepSeek türevi modeller yanıtı `reasoning_content` alanında bırakıp
 *    `content` alanını boş döndürebiliyor. Bu "bağlantı koptu" değildir; eski kod
 *    boş yanıt görüp yanlış uyarı üretiyordu.
 *
 * SÜRE GARANTİSİ (önemli):
 *  3 deneme × 10 sn zaman aşımı + 2 sn + 4 sn bekleme = **36 sn** eder; bu, görevin
 *  "30 saniyeden uzun askıda kalmamalı" kuralını AŞARDI. Bu yüzden toplam bütçe
 *  (`TOPLAM_BUTCE_MS = 24 sn`) tutulur ve her denemenin zaman aşımı kalan bütçeyle
 *  sınırlanır. Böylece betik hiçbir koşulda 30 sn'yi geçmez.
 *
 * Çıkış kodları:
 *   0 → model yanıt verdi (içerik ya da reasoning dolu)
 *   1 → anahtar yok / kalıcı HTTP hatası / tüm denemeler tükendi
 */
import { config } from '../src/config.js';

/** Deneme sayısı (ilk çağrı dahil). */
export const MAKS_DENEME = 3;
/** Tek istek için zaman aşımı. */
export const TIMEOUT_MS = 10000;
/** Tüm süreç için üst sınır — 30 sn kuralının altında kalır.
 *  Hesaplama: 10 sn + 2 sn + 10 sn + 4 sn = 26 sn (en kötü, hepsi zaman aşımı).
 *  24 sn bütçesi, npm/node açılış yükü (~2 sn) eklense bile 30 sn'yi aşmaz. */
export const TOPLAM_BUTCE_MS = 24000;
/** Kademeli bekleme tabanı: 1. deneme sonrası 2 sn, 2. sonrası 4 sn. */
export const BEKLEME_TABANI_MS = 2000;

/** Yeniden denenecek HTTP durum kodları (geçici kapasite/hız hataları). */
export const YENIDEN_DENENEBILIR = Object.freeze([429, 502, 503, 504]);

export const bekle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP koduna göre yeniden denenmeli mi? */
export function geciciHataMi(status) {
  return YENIDEN_DENENEBILIR.includes(Number(status));
}

/** Zaman aşımı / iptal hatası mı? (Node undici: TimeoutError, DOMException: AbortError) */
export function zamanAsimiMi(hata) {
  const ad = String(hata?.name || '');
  const kod = String(hata?.code || '');
  const mesaj = String(hata?.message || hata || '');
  return ad === 'TimeoutError' || ad === 'AbortError'
    || kod === 'UND_ERR_CONNECT_TIMEOUT' || kod === 'ABORT_ERR'
    || /aborted|timeout|zaman aşımı/i.test(mesaj);
}

/**
 * Modelin yanıt metnini seçer.
 *
 * Sıra (2026-11-10): content → reasoning_content → reasoning.
 * Qwen/DeepSeek `content` alanını boş bırakıp düşünceyi `reasoning_content`
 * alanına yazabiliyor; bu durumda yanıt YOK değildir.
 *
 * @param {object} mesaj `choices[0].message`
 * @returns {{metin:string, kaynak:string|null}}
 */
export function yanitMetni(mesaj) {
  if (!mesaj || typeof mesaj !== 'object') return { metin: '', kaynak: null };
  const adaylar = [
    ['content', mesaj.content],
    ['reasoning_content', mesaj.reasoning_content],
    ['reasoning', mesaj.reasoning],
  ];
  for (const [kaynak, deger] of adaylar) {
    const metin = typeof deger === 'string' ? deger.trim() : '';
    if (metin) return { metin, kaynak };
  }
  return { metin: '', kaynak: null };
}

/**
 * Bağlantıyı doğrular. **Süreç sonlandırmaz** — test edilebilir olması için sonucu
 * döndürür. CLI sarmalayıcısı (`main`) çıkış kodunu buna göre verir.
 *
 * @param {{
 *   anahtar?:string, baseURL?:string, model?:string,
 *   fetchFn?:Function, simdi?:Function, uyu?:Function,
 *   maksDeneme?:number, timeoutMs?:number, butceMs?:number, beklemeTabaniMs?:number,
 *   log?:Function, hataLog?:Function
 * }} [opts] test/CLI enjeksiyonu
 * @returns {Promise<{
 *   ok:boolean, durum:number|null, sureMs:number, deneme:number,
 *   metin:string, kaynak:string|null, bosMu:boolean,
 *   hata:string|null, kalanButceMs:number|null
 * }>}
 */
export async function kontrolEt(opts = {}) {
  const anahtar = opts.anahtar ?? config.ai.apiKey;
  const baseURL = opts.baseURL ?? config.ai.baseURL;
  const model = opts.model ?? config.ai.model;
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const simdi = opts.simdi ?? (() => Date.now());
  const uyu = opts.uyu ?? bekle;
  const maksDeneme = Math.max(1, Number(opts.maksDeneme) || MAKS_DENEME);
  const timeoutMs = Math.max(500, Number(opts.timeoutMs) || TIMEOUT_MS);
  const butceMs = Math.max(1000, Number(opts.butceMs) || TOPLAM_BUTCE_MS);
  const beklemeTabani = Math.max(0, Number(opts.beklemeTabaniMs ?? BEKLEME_TABANI_MS));
  const log = opts.log ?? ((...a) => console.log(...a));
  const uyar = opts.hataLog ?? ((...a) => console.warn(...a));

  const baslangicTum = simdi();

  if (!anahtar) {
    return {
      ok: false, durum: null, sureMs: 0, deneme: 0, metin: '', kaynak: null,
      bosMu: false, hata: 'EVREN_LLM_API_KEY tanımlı değil.', kalanButceMs: null,
    };
  }

  let sonHata = null;
  let sonDurum = null;
  let zamanAsimiSayisi = 0;
  let httpHatasiSayisi = 0;

  for (let deneme = 1; deneme <= maksDeneme; deneme++) {
    // Kalan bütçe: her denemenin zaman aşımı bütçeyi aşamaz (30 sn garantisi).
    const kalanButce = butceMs - (simdi() - baslangicTum);
    if (kalanButce <= 250) {
      sonHata = sonHata || 'Toplam süre bütçesi doldu.';
      uyar(`⚠️ [check-ai] Toplam bütçe (${butceMs}ms) doldu, yeni deneme yapılmıyor.`);
      break;
    }
    const buDenemeTimeout = Math.min(timeoutMs, Math.max(250, kalanButce));
    const denemeBas = simdi();

    try {
      const res = await fetchFn(baseURL + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + anahtar },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Sadece "hazir" yaz.' }],
          max_tokens: 30,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(buDenemeTimeout),
      });

      const gecenMs = simdi() - denemeBas;
      const metin = await res.text();
      sonDurum = Number(res.status);

      // --- Geçici hata: bekle ve yeniden dene ---
      if (geciciHataMi(res.status) && deneme < maksDeneme) {
        const beklemeMs = deneme * beklemeTabani;
        uyar(`⚠️ [check-ai] EVREN HTTP ${res.status} döndürdü, ${beklemeMs}ms sonra yeniden deneniyor (${deneme}/${maksDeneme})…`);
        await uyu(beklemeMs);
        sonHata = `HTTP ${res.status}`;
        continue;
      }

      if (!res.ok) {
        httpHatasiSayisi++;
        return {
          ok: false, durum: sonDurum, sureMs: gecenMs, deneme,
          metin: '', kaynak: null, bosMu: false,
          hata: `HTTP ${res.status} — ${String(metin).slice(0, 200)}`,
          kalanButceMs: Math.max(0, butceMs - (simdi() - baslangicTum)),
        };
      }

      // --- Başarı: JSON'u ayrıştır, içeriği akıllıca seç ---
      let data;
      try {
        data = JSON.parse(metin);
      } catch {
        return {
          ok: false, durum: sonDurum, sureMs: gecenMs, deneme,
          metin: '', kaynak: null, bosMu: false,
          hata: 'Yanıt JSON değil — ' + String(metin).slice(0, 160),
          kalanButceMs: Math.max(0, butceMs - (simdi() - baslangicTum)),
        };
      }

      const { metin: yanit, kaynak } = yanitMetni(data?.choices?.[0]?.message);
      return {
        ok: true, durum: sonDurum, sureMs: gecenMs, deneme,
        metin: yanit, kaynak, bosMu: !yanit,
        hata: null,
        kalanButceMs: Math.max(0, butceMs - (simdi() - baslangicTum)),
      };
    } catch (e) {
      sonHata = e;
      const zamanAsimi = zamanAsimiMi(e);
      if (zamanAsimi) zamanAsimiSayisi++;
      const hataTuru = zamanAsimi
        ? `Zaman Aşımı (>${buDenemeTimeout}ms)`
        : String(e?.message || e).slice(0, 160);

      if (deneme < maksDeneme) {
        const istenen = deneme * beklemeTabani;
        // Bekleme bütçeyi aşacaksa KISALT (tamamen iptal etme): 3. denemeye
        // yine de bir şans kalsın. En az 1,5 sn'lik deneme payı bırakılır.
        const kalan = butceMs - (simdi() - baslangicTum);
        const beklemeMs = Math.max(0, Math.min(istenen, kalan - 1500));
        if (beklemeMs < 250) {
          uyar(`⚠️ [check-ai] ${hataTuru}. Kalan bütçe (${Math.max(0, Math.round(kalan))}ms) yeni denemeye yetmiyor, durduruluyor.`);
          break;
        }
        const kisaNot = beklemeMs < istenen ? ` (bütçe için ${istenen}ms → ${Math.round(beklemeMs)}ms)` : '';
        uyar(`⚠️ [check-ai] Bağlantı hatası: ${hataTuru}. ${Math.round(beklemeMs)}ms sonra tekrar deneniyor (${deneme}/${maksDeneme})…${kisaNot}`);
        await uyu(beklemeMs);
        continue;
      }
    }
  }

  // Zaman aşımı ile kalıcı hatayı AYIR: ikisi aynı şey değildir. Servis yavaş
  // olduğu için zaman aşımına uğradıysa "bağlantı yok" demek yanıltıcı olur.
  const sadeceZamanAsimi = zamanAsimiSayisi > 0 && httpHatasiSayisi === 0;
  const neden = sadeceZamanAsimi
    ? `${zamanAsimiSayisi} deneme ${TIMEOUT_MS}ms içinde yanıt vermedi — servis yavaş/yoğun olabilir `
      + '(bağlantı büyük olasılıkla çalışıyor; ana uygulama 120 sn bekler). '
      + String(sonHata?.message || sonHata || '')
    : `${maksDeneme} deneme sonrası başarısız — ${String(sonHata?.message || sonHata || 'bilinmeyen hata')}`;

  return {
    ok: false,
    durum: sonDurum,
    sureMs: simdi() - baslangicTum,
    deneme: maksDeneme,
    metin: '',
    kaynak: null,
    bosMu: false,
    hata: neden,
    zamanAsimiSayisi,
    httpHatasiSayisi,
    kalanButceMs: Math.max(0, butceMs - (simdi() - baslangicTum)),
  };
}

/**
 * CLI sarmalayıcısı: sonucu okunur biçimde yazar ve çıkış kodunu verir.
 * @param {object} [opts] `kontrolEt` seçenekleri (test için)
 * @returns {Promise<number>} çıkış kodu
 */
export async function main(opts = {}) {
  const log = opts.log ?? ((...a) => console.log(...a));
  const uyar = opts.hataLog ?? ((...a) => console.warn(...a));

  const r = await kontrolEt({ ...opts, log, hataLog: uyar });

  if (!r.ok) {
    // Zaman aşımı ayrı işaretlenir: "bağlantı yok" değil, "çok yavaş" demektir.
    const onEk = r.zamanAsimiSayisi > 0 && !r.httpHatasiSayisi ? '⚠️ YAVAŞ' : '❌ HAZIR DEĞİL';
    log(`${onEk}: ${r.hata}`);
    return 1;
  }

  const ozet = r.bosMu
    ? 'yanıt BOŞ (model içerik ve reasoning alanlarını boş döndürdü)'
    : `"${r.metin.slice(0, 60)}"`;
  const kaynakNotu = r.kaynak && r.kaynak !== 'content' ? ` [${r.kaynak}]` : '';
  log(`✅ OK: model yanıt verdi (${r.sureMs}ms, deneme ${r.deneme}/${MAKS_DENEME}) -> ${ozet}${kaynakNotu}`);
  return 0;
}

/* ------------------------------------------------------------------ */
// Doğrudan çalıştırıldığında (npm run check:ai) çıkış kodunu uygula.
// `import` edildiğinde (testler) süreç sonlanmaz.
const dogrudanCalisti = (() => {
  try {
    const girilen = process.argv?.[1] || '';
    if (!girilen) return false;
    // DİKKAT: `test-check-ai.mjs` da "check-ai.mjs" ile BİTİYOR. Bu yüzden yalnızca
    // dosya adının TAM olarak `check-ai.mjs` olması yeterli (2026-11-10: gevşek
    // regex test sırasında CLI'yi çalıştırıp gerçek ağ isteği atıyordu).
    const ad = girilen.replace(/\\/g, '/').split('/').pop().toLowerCase();
    return ad === 'check-ai.mjs';
  } catch {
    return false;
  }
})();

if (dogrudanCalisti) {
  main().then((kod) => { process.exitCode = kod; }).catch((e) => {
    console.error('❌ HAZIR DEĞİL: ' + (e?.message || e));
    process.exitCode = 1;
  });
}
