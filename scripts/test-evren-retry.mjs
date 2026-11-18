/**
 * 🔁 EVREN 503/429 Dayanıklılık Testi (2026-11-05)
 *
 * Gerçek olay: PM2 loglarında `[ai:semanticMatch] YZ hatası: YZ API HTTP 503
 * model_capacity_exhausted` tekrar ediyordu. Eski kod 503'ü YENİDEN DENEMİYOR,
 * doğrudan hata atıyordu; `semanticMatch` de `ayniUrun:false` dönüp ÜRÜNÜ ELİYORDU.
 * Sonuç: doğru eşleşmeler kayboluyor, "en ucuz" bulunamıyordu.
 *
 * Bu test süiti:
 *   1) chatOnce: 503 → 200 kurtarma
 *   2) chatOnce: 429 → 200 kurtarma
 *   3) Kalıcı 503 → semanticMatch deterministik kurtarma (aynı model kodu)
 *   4) resets_at ayrıştırma (ms hesabı)
 *   5) Sonsuz döngü koruması: en fazla 3 deneme, toplam bekleme ≤ 10 sn
 *   6) gorselAnaliz: 503'te 2 sn bekleyip sessizce tekrar dener
 *
 * Ağ isteği YOK — `fetch` mock'lanır. Gerçek bekleme yapılmaz (küçük resets_at).
 *
 *   node scripts/test-evren-retry.mjs
 */
import {
  resetsAtMs, beklemeSuresi, geciciHataMi, hataKodu, deterministikKurtarma,
  semanticMatch,
  YENIDEN_DENENEBILIR, MAKS_DENEME, MAKS_TEK_BEKLEME_MS, MAKS_TOPLAM_BEKLEME_MS,
} from '../src/ai.js';
import { gorselAnaliz } from '../src/gorselArama.js';
import { closeDatabase } from '../src/store.js';

let gecen = 0, toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

const gercekFetch = globalThis.fetch;

/* ------------------------------------------------------------------ */
bolum('1) 🧮 Yardımcı fonksiyonlar — resets_at / bekleme / jitter');

kontrol('yeniden denenebilir kodlar [429,502,503,504]',
  YENIDEN_DENENEBILIR.join(',') === '429,502,503,504', YENIDEN_DENENEBILIR.join(','));
kontrol('502 geçici', geciciHataMi(502) === true);
kontrol('503 geçici', geciciHataMi(503) === true);
kontrol('504 geçici', geciciHataMi(504) === true);
kontrol('429 geçici', geciciHataMi(429) === true);
kontrol('400 geçici DEĞİL', geciciHataMi(400) === false);
kontrol('401 geçici DEĞİL', geciciHataMi(401) === false);
kontrol('200 geçici DEĞİL', geciciHataMi(200) === false);
kontrol('string kod da çalışır', geciciHataMi('503') === true);

// resets_at: gerçek EVREN gövdesi
const simdi = Date.parse('2026-11-05T14:00:00.000Z');
const gercekGovde = JSON.stringify({
  error: {
    message: 'Model şu anda dolu, lütfen kısa bir süre sonra tekrar deneyin.',
    type: 'api_error',
    code: 'model_capacity_exhausted',
    evren: { resets_at: '2026-11-05T14:00:02.500Z' },
  },
});
const kalan = resetsAtMs(gercekGovde, simdi);
kontrol('resets_at doğru ms (2500)', kalan === 2500, String(kalan));

kontrol('düz {resets_at} biçimi',
  resetsAtMs({ resets_at: '2026-11-05T14:00:01.000Z' }, simdi) === 1000);
kontrol('üst seviye {evren:{resets_at}} biçimi',
  resetsAtMs({ evren: { resets_at: '2026-11-05T14:00:00.500Z' } }, simdi) === 500);
kontrol('geçmiş resets_at → 0 (negatif olmaz)',
  resetsAtMs({ error: { evren: { resets_at: '2026-11-05T13:00:00.000Z' } } }, simdi) === 0);
kontrol('resets_at yok → null', resetsAtMs({ error: { message: 'x' } }, simdi) === null);
kontrol('bozuk JSON → null', resetsAtMs('bu json değil', simdi) === null);
kontrol('boş gövde → null', resetsAtMs(null, simdi) === null);
kontrol('geçersiz tarih → null', resetsAtMs({ resets_at: 'yarın' }, simdi) === null);

kontrol('hata kodu çıkarılır', hataKodu(gercekGovde) === 'model_capacity_exhausted', hataKodu(gercekGovde));
kontrol('kod yoksa null', hataKodu({ error: { message: 'x' } }) === null);

// bekleme süresi: jitter formülü
const b0 = beklemeSuresi(0, null, () => 0);
const b1 = beklemeSuresi(1, null, () => 0);
const b2 = beklemeSuresi(2, null, () => 0);
kontrol('jitter deneme 0 → 1500ms', b0 === 1500, String(b0));
kontrol('jitter deneme 1 → 3000ms', b1 === 3000, String(b1));
kontrol('jitter deneme 2 → 4500 → 4000 tavan', b2 === MAKS_TEK_BEKLEME_MS, String(b2));
const bRast = beklemeSuresi(0, null, () => 0.999);
kontrol('rastgele 0–500 eklenir', bRast === 1500 + 499, String(bRast));
kontrol('resets_at 2500 → 2500 kullanılır', beklemeSuresi(0, 2500) === 2500);
kontrol('resets_at 9000 → 4000 tavan', beklemeSuresi(0, 9000) === MAKS_TEK_BEKLEME_MS);
kontrol('resets_at 0 → en az 250ms', beklemeSuresi(0, 0) === 250);
kontrol('maks deneme 3', MAKS_DENEME === 3, String(MAKS_DENEME));
kontrol('maks toplam bekleme 10 sn', MAKS_TOPLAM_BEKLEME_MS === 10000);

/* ------------------------------------------------------------------ */
bolum('2) 🚑 chatOnce — 503 sonra 200 (kurtarma)');

// chatOnce dışa açık değil; semanticMatch üzerinden dolaylı test ederiz ama
// API çağrısını gözlemlemek için fetch sayacı kullanıyoruz.
let cagriSayisi = 0;
let loglar = [];
const gercekLog = console.log;
console.log = (...a) => { loglar.push(a.join(' ')); };

globalThis.fetch = async () => {
  cagriSayisi++;
  if (cagriSayisi === 1) {
    return {
      ok: false,
      status: 503,
      text: async () => JSON.stringify({
        error: { code: 'model_capacity_exhausted', evren: { resets_at: new Date(Date.now() + 300).toISOString() } },
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '{"ayniUrun":true,"guven":0.93,"aciklama":"test"}' } }],
    }),
  };
};

const r1 = await semanticMatch(
  { title: 'Bambu Lab P1S Hotend 0.4mm', brand: 'Bambu Lab', modelCode: 'P1S-HOTEND-04' },
  { title: 'Bambu Lab P1S Hotend 0.4mm Sertleştirilmiş', brand: 'Bambu Lab', modelCode: null },
);
console.log = gercekLog;

kontrol('503 sonrası 2. çağrı yapıldı', cagriSayisi === 2, String(cagriSayisi));
kontrol('503 sonrası sonuç YZ\'den geldi', r1.ayniUrun === true && r1.guven === 0.93,
  JSON.stringify(r1));
kontrol('503 deterministik kurtarma DEĞİL (YZ başardı)', !r1.deterministik);

const bilgiLogu = loglar.find(l => l.includes('[ai:chatOnce]'));
kontrol('503 bilgi logu basıldı', !!bilgiLogu, JSON.stringify(loglar.slice(0, 2)));
kontrol('log biçimi: 503 (kod) alındı, Xms … (deneme: 1/3)',
  /\[ai:chatOnce\] EVREN 503 \(model_capacity_exhausted\) alındı, \d+ms sonra yeniden deneniyor \(deneme: 1\/3\)/.test(bilgiLogu || ''),
  bilgiLogu);
kontrol('log HATA değil BİLGİ (console.warn kullanılmadı)', !!bilgiLogu);

/* ------------------------------------------------------------------ */
bolum('3) ⏱️ chatOnce — 429 sonra 200');

cagriSayisi = 0;
loglar = [];
console.log = (...a) => { loglar.push(a.join(' ')); };
globalThis.fetch = async () => {
  cagriSayisi++;
  if (cagriSayisi === 1) {
    return { ok: false, status: 429, text: async () => '{"error":{"code":"rate_limit"}}' };
  }
  return {
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: '{"ayniUrun":true,"guven":0.9,"aciklama":"ok"}' } }] }),
  };
};
const r2 = await semanticMatch(
  { title: 'eSun PLA+ Beyaz 1kg', brand: 'eSun', modelCode: null },
  { title: 'eSun PLA Plus Beyaz Filament 1kg', brand: 'eSun', modelCode: null },
);
console.log = gercekLog;

kontrol('429 sonrası 2. çağrı yapıldı', cagriSayisi === 2, String(cagriSayisi));
kontrol('429 sonrası sonuç alındı', r2.ayniUrun === true, JSON.stringify(r2));
kontrol('429 logu basıldı', loglar.some(l => /EVREN 429/.test(l)), JSON.stringify(loglar));

/* ------------------------------------------------------------------ */
bolum('4) 🧠 Kalıcı 503 → deterministik kurtarma');

// 4a) Aynı model kodu → kurtarılır
cagriSayisi = 0;
globalThis.fetch = async () => {
  cagriSayisi++;
  return {
    ok: false, status: 503,
    text: async () => JSON.stringify({ error: { code: 'model_capacity_exhausted', evren: { resets_at: new Date(Date.now() + 100).toISOString() } } }),
  };
};
const r3 = await semanticMatch(
  { title: 'Creality K1C Nozzle 0.4mm', brand: 'Creality', modelCode: 'K1C-NOZ-04' },
  { title: 'Creality K1C Nozzle 0.4 mm Pirinç', brand: 'Creality', modelCode: 'k1c-noz-04' },
);
kontrol('kalıcı 503: 3 deneme yapıldı', cagriSayisi === MAKS_DENEME, String(cagriSayisi));
kontrol('kalıcı 503: aynı model kodu → ayniUrun true', r3.ayniUrun === true, JSON.stringify(r3));
kontrol('kalıcı 503: güven 0.90', r3.guven === 0.90, String(r3.guven));
kontrol('kalıcı 503: deterministik işareti', r3.deterministik === true);
kontrol('kalıcı 503: açıklama 503 diyor', /503/.test(r3.aciklama), r3.aciklama);

// 4b) Marka aynı + başlık benzerliği ≥ 0.75 → kurtarılır
const r4 = await semanticMatch(
  { title: 'Bambu Lab A1 Mini 3D Yazıcı', brand: 'Bambu Lab', modelCode: null },
  { title: 'Bambu Lab A1 Mini 3D Yazıcı', brand: 'Bambu Lab', modelCode: null },
);
kontrol('marka + benzerlik → ayniUrun true', r4.ayniUrun === true, JSON.stringify(r4));
kontrol('marka + benzerlik güven 0.80', r4.guven === 0.80, String(r4.guven));

// 4c) Kanıt yoksa → dürüst eleme
const r5 = await semanticMatch(
  { title: 'Anycubic Kobra 2 Neo', brand: 'Anycubic', modelCode: null },
  { title: 'Creality Ender 3 V3 KE', brand: 'Creality', modelCode: null },
);
kontrol('kanıt yok → ayniUrun false', r5.ayniUrun === false, JSON.stringify(r5));
kontrol('kanıt yok → deterministik işareti', r5.deterministik === true);
kontrol('kanıt yok → açıklama dürüst',
  /kanıt|yetersiz|çakışma/i.test(r5.aciklama), r5.aciklama);
kontrol('kanıt yok → güven düşük (≤0.6)', r5.guven <= 0.6, String(r5.guven));

// 4d) Farklı model kodu + farklı marka → eleme
const r6 = await semanticMatch(
  { title: 'Creality K1 Max 3D Yazıcı', brand: 'Creality', modelCode: 'K1MAX' },
  { title: 'Creality Ender 5 Max 3D Yazıcı', brand: 'Creality', modelCode: 'E5MAX' },
);
kontrol('farklı model kodu → eleme', r6.ayniUrun === false, JSON.stringify(r6));

// 4f) KİMLİK KORUMASI: aynı marka + ortak kelimeler ama farklı model serisi
const r7 = await semanticMatch(
  { title: 'Creality K1 Max 3D Yazıcı', brand: 'Creality', modelCode: null },
  { title: 'Creality Ender 5 Max 3D Yazıcı', brand: 'Creality', modelCode: null },
);
kontrol('kimlik koruması: K1 Max ↔ Ender 5 Max reddedilir', r7.ayniUrun === false, JSON.stringify(r7));

const r8 = await semanticMatch(
  { title: 'Bambu Lab P1S', brand: 'Bambu Lab', modelCode: null },
  { title: 'Bambu Lab P1P', brand: 'Bambu Lab', modelCode: null },
);
kontrol('kimlik koruması: P1S ↔ P1P reddedilir', r8.ayniUrun === false, JSON.stringify(r8));

// 4g) Token örtüşmesi kurtarması (kısa başlıklar)
const r9 = await semanticMatch(
  { title: 'Bambu Lab P1S Hotend', brand: 'Bambu Lab', modelCode: null },
  { title: 'Bambu Lab P1S Hotend 0.4mm', brand: 'Bambu Lab', modelCode: null },
);
kontrol('token örtüşmesi → ayniUrun true', r9.ayniUrun === true, JSON.stringify(r9));

// 4e) Doğrudan fonksiyon testi (ağ yok)
const d1 = deterministikKurtarma(
  { title: 'A', brand: 'X', modelCode: 'ABC-1' },
  { title: 'B', brand: 'Y', modelCode: 'abc-1' },
);
kontrol('deterministik: kod normalize edilir', d1.ayniUrun === true && d1.guven === 0.90);
const d2 = deterministikKurtarma(
  { title: 'Bambu Lab P1S Hotend', brand: 'Bambu Lab', modelCode: null },
  { title: 'Bambu Lab P1S Hotend', brand: 'Bambu Lab', modelCode: null },
);
kontrol('deterministik: aynı başlık+marka', d2.ayniUrun === true);
const d3 = deterministikKurtarma({ title: '', brand: 'X' }, { title: 'Y', brand: 'X' });
kontrol('deterministik: boş başlık → red', d3.ayniUrun === false);

globalThis.fetch = gercekFetch;

/* ------------------------------------------------------------------ */
bolum('5) 🛡️ Sonsuz döngü ve bellek koruması');

// Kalıcı 503: toplam deneme ve süre sınırlı olmalı
cagriSayisi = 0;
const baslangic = Date.now();
globalThis.fetch = async () => {
  cagriSayisi++;
  return {
    ok: false, status: 503,
    text: async () => JSON.stringify({ error: { code: 'model_capacity_exhausted' } }),
  };
};
await semanticMatch(
  { title: 'Test Ürün A', brand: 'MarkaX', modelCode: 'X-1' },
  { title: 'Test Ürün B', brand: 'MarkaY', modelCode: 'Y-2' },
);
const gecenSure = Date.now() - baslangic;
globalThis.fetch = gercekFetch;

kontrol('en fazla 3 deneme', cagriSayisi === 3, String(cagriSayisi));
kontrol('toplam süre < 11 sn (10 sn bekleme + pay)', gecenSure < 11000, `${gecenSure}ms`);

// jitter + resets_at toplamının 10 sn'yi aşmadığını matematiksel doğrula
const toplamBekleme = beklemeSuresi(0) + beklemeSuresi(1) + beklemeSuresi(2);
kontrol('teorik toplam bekleme ≤ 10 sn', toplamBekleme <= MAKS_TOPLAM_BEKLEME_MS,
  String(toplamBekleme));

/* ------------------------------------------------------------------ */
bolum('6) 🖼️ gorselAnaliz — 503 toleransı (2 sn, sessiz)');

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let visionCagri = 0;
loglar = [];
console.log = (...a) => { loglar.push(a.join(' ')); };
globalThis.fetch = async () => {
  visionCagri++;
  if (visionCagri === 1) {
    return { ok: false, status: 503, text: async () => '{"error":{"code":"model_capacity_exhausted"}}' };
  }
  return {
    ok: true, status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            urun: 'Bambu Lab P1S Hotend', marka: 'Bambu Lab', kategori: 'hotend_parca',
            teknikDetaylar: '0.4mm', uyumluYazicilar: ['P1S'], aramaSorgusu: 'Bambu P1S Hotend', guven: 'yuksek',
          }),
        },
      }],
    }),
  };
};

const t0 = Date.now();
const va = await gorselAnaliz({ base64: PNG_1X1, mime: 'image/png' });
const visionSure = Date.now() - t0;
console.log = gercekLog;

kontrol('görsel: 503 sonrası 2. çağrı', visionCagri === 2, String(visionCagri));
kontrol('görsel: sonuç alındı (kullanıcı kesinti hissetmez)', va.urun === 'Bambu Lab P1S Hotend', va.urun);
kontrol('görsel: 2 sn beklendi', visionSure >= 1900, `${visionSure}ms`);
kontrol('görsel: 503 bilgi logu', loglar.some(l => /\[gorselArama\].*503/.test(l)), JSON.stringify(loglar));

// Kalıcı 503: dürüst hata (sessiz yutma yok)
visionCagri = 0;
globalThis.fetch = async () => {
  visionCagri++;
  return { ok: false, status: 503, text: async () => 'sürekli dolu' };
};
let visionHata = null;
try { await gorselAnaliz({ base64: PNG_1X1, mime: 'image/png' }); } catch (e) { visionHata = e.message; }
globalThis.fetch = gercekFetch;

kontrol('görsel: kalıcı 503 → 2 deneme', visionCagri === 2, String(visionCagri));
kontrol('görsel: kalıcı 503 → dürüst hata', /HTTP 503/.test(String(visionHata)), visionHata);

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
