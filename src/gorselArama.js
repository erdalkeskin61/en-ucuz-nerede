/**
 * 🔬 Görsel ile 3D Donanım / Filament Tanıma — EVREN qwen3-vl-30b (2026-11-05)
 *
 * PROBLEM: Atölyede çalışan kişi elindeki parçanın (nozzle, hotend, step motor,
 * termistör, etiketi silinmiş makara) tam model kodunu bilmez.
 *
 * ÇÖZÜM: Fotoğraf yüklenir → EVREN'in çok modlu modeli (qwen3-vl-30b) parçayı
 * tanır → çıkan `aramaSorgusu` ile `hizliKaynakUrunBul` kanonik ürünü bulur →
 * `runComparison` **61 mağazada** stok/fiyat taraması yapar → en ucuz STOKLU
 * mağaza afiliye linkiyle döner.
 *
 * DÜRÜSTLÜK KURALLARI (proje anayasası):
 *  - Marka/model okunamıyorsa UYDURULMAZ; alan null döner, `guven` düşürülür.
 *  - Görsel hiçbir mağazaya gitmez; yalnızca EVREN'e gider, oradan metin çıkar.
 *  - 4 MB üstü görsel reddedilir (istemci tarafında 1280 px'e küçültülür).
 *  - Kanonik ürün bulunamazsa "bulunamadı" denir; tahmini fiyat ÜRETİLMEZ.
 *  - Stokta olmayan mağaza, fiyatı ucuz olsa da "en ucuz" olamaz (stokSirala).
 */
import { config } from './config.js';
import { adapters, adapterById } from './sites/index.js';
import { runComparison } from './pipeline.js';
import { hizliKaynakUrunBul } from './urunArama.js';
import { titleSimilarity, dominantColor, extractColors } from './util.js';
import { afiliyeLink } from './afiliye.js';
import { HIZLI_SITELER } from './basketOptimizer.js';
import { stokSirala, stoktaMi, karsilastirmaFiyati } from './stokSirala.js';

/** Vision modeli (.env: AI_VISION_MODEL). */
export const VISION_MODEL = process.env.AI_VISION_MODEL || 'qwen3-vl-30b';

/** Gönderilebilecek en büyük görsel (base64 çözülmüş hâli). */
export const GORSEL_MAX_BAYT = 4 * 1024 * 1024; // 4 MB

/** İstemci tarafında küçültme hedefi (spec). */
export const GORSEL_HEDEF_GENISLIK = 1280;

/** Tanınan 3D donanım/filament kategorileri. */
export const KATEGORILER = Object.freeze([
  'hotend_parca', 'nozzle', 'extruder', 'step_motor', 'termistor', 'isitici',
  'anakart', 'tabla', 'kayis', 'fan', 'sensör', 'guc_kaynagi',
  'filament', 'recine', 'yazici', 'aksesuar', 'diger',
]);

const KATEGORI_ETIKETI = {
  hotend_parca: '🔥 Hotend / Sıcak Uç Grubu',
  nozzle: '🔩 Nozzle (Uç)',
  extruder: '⚙️ Extruder',
  step_motor: '🔄 Step Motor',
  termistor: '🌡️ Termistör',
  isitici: '♨️ Isıtıcı / Kartuş',
  anakart: '🧩 Anakart',
  tabla: '🛏️ Tabla / PEI',
  kayis: '➰ Kayış / Kasnak',
  fan: '🌀 Fan',
  sensör: '📡 Sensör (BLTouch / CR-Touch)',
  guc_kaynagi: '🔌 Güç Kaynağı',
  filament: '🧵 Filament',
  recine: '🧴 Reçine',
  yazici: '🖨️ 3D Yazıcı',
  aksesuar: '🧰 Aksesuar',
  diger: '📦 Diğer',
};

export const kategoriEtiketi = (k) => KATEGORI_ETIKETI[k] || KATEGORI_ETIKETI.diger;

/**
 * 3D DONANIM UZMANI SİSTEM İSTEMİ.
 *
 * Kısa tutulur: EVREN uzun istemlerde token bütçesini "düşünmeye" harcayıp boş
 * içerik dönebiliyor (ölçüldü). Yalnızca 3D baskı alanına odaklanır ve
 * halüsinasyonu yasaklar.
 */
const VISION_SYSTEM = `Sen 3D yazıcı DONANIM ve FİLAMENT uzmanısın. Görseldeki parçayı tanımlarsın.
Yalnızca şu JSON'u döndür:
{"urun":"<parçanın tam adı>","marka":<marka|null>,"kategori":"<hotend_parca|nozzle|extruder|step_motor|termistor|isitici|anakart|tabla|kayis|fan|sensör|guc_kaynagi|filament|recine|yazici|aksesuar|diger>","malzeme":<PLA/PETG/ABS/ASA/TPU/PA-CF|null>,"teknikDetaylar":"<çap, diş, gerilim, güç, renk gibi ayırt edici bilgiler>","uyumluYazicilar":["<uyumlu model>"],"aramaSorgusu":"<mağazada aranacak 3-6 kelimelik Türkçe sorgu>","guven":"yuksek|orta|dusuk"}

TANIMA İPUÇLARI:
- Nozzle: diş yapısı (M6/M7), uç çapı (0.2/0.4/0.6/0.8mm), pirinç/sertleştirilmiş çelik/volcano/v6.
- Hotend: Bambu P1/X1, Creality K1/Sprite, E3D V6/Volcano, MK8, hepsinin ısıtıcı blok+termistör+nozzle farkı.
- Step motor: NEMA 17/14, 42-34/42-40, kablo sayısı.
- Termistör: NTC 100K, kartuş tipi, cam boncuk, kablolu/kablosuz.
- Tabla: PEI manyetik, cam, çelik sac, dokulu/pürüzsüz yüzey.
- Kayış: GT2 6mm/9mm, kasnak 20T.
- Sensör: BLTouch, CR-Touch, endstop.
- Filament makarası: etiketteki MARKA + MALZEME + RENK + gramaj (eSun, Porima, Bambu, Microzey, Sunlu, Creality).
- 3D yazıcı: gövde/logo ile model (Bambu A1/P1/X1, Creality K1/Ender, Anycubic Kobra, Elegoo).

KURALLAR:
- Etiket/marka OKUNAMIYORSA uydurma; null yaz ve guven'i "dusuk" yap.
- Emin değilsen guven "orta"/"dusuk" olsun. Emin olduğunda "yuksek".
- aramaSorgusu mağazada aranabilir olmalı; "bu parça" gibi belirsiz ifade KULLANMA.
- Yanıtta açıklama, markdown veya ek metin yok; YALNIZCA JSON.`;

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/** "null"/"bilinmiyor" gibi değerleri null'a çevirir. */
function temizMetin(deger, max = 160) {
  if (deger == null) return null;
  const s = String(deger).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/^(null|yok|bilinmiyor|belirsiz|unknown|n\/a|-|—)$/i.test(s)) return null;
  return s.slice(0, max);
}

/** YZ yanıtından JSON çıkarır (kod bloğu / ek metin toleranslı). */
export function jsonCikar(metin) {
  if (!metin) return null;
  const t = String(metin).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const bas = t.indexOf('{');
  const son = t.lastIndexOf('}');
  if (bas < 0 || son <= bas) return null;
  try {
    return JSON.parse(t.slice(bas, son + 1));
  } catch {
    return null;
  }
}

/** Güven skoru → yüzde (arayüzde %95 gibi göstermek için). */
export function guvenYuzde(guven) {
  const g = String(guven || '').toLowerCase();
  if (g === 'yuksek' || g === 'yüksek') return 95;
  if (g === 'dusuk' || g === 'düşük') return 45;
  return 70;
}

/** Kategori serbest metnini bilinen anahtara indirger. */
export function kategoriNormalize(ham) {
  const s = String(ham || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/g, '_');
  if (!s) return 'diger';
  if (/hotend|sicak_uc|sıcak_uç|heatbreak/.test(s)) return 'hotend_parca';
  if (/nozzle|nozul|uc$|uç/.test(s)) return 'nozzle';
  if (/extruder|ekstruder/.test(s)) return 'extruder';
  if (/step|motor|nema/.test(s)) return 'step_motor';
  if (/termist|thermist|ntc/.test(s)) return 'termistor';
  if (/isitici|ısıtıcı|heater|kartus|kartuş/.test(s)) return 'isitici';
  if (/anakart|mainboard|motherboard|board/.test(s)) return 'anakart';
  if (/tabla|pei|cam|yazı_yüzeyi|yaz_yuzeyi/.test(s)) return 'tabla';
  if (/kayis|kayış|belt|kasnak|pulley/.test(s)) return 'kayis';
  if (/fan|vantilat|soğut|sogut/.test(s)) return 'fan';
  if (/sensor|sensör|bltouch|crtouch|cr_touch|endstop|prob/.test(s)) return 'sensör';
  if (/guc|güç|power|psu/.test(s)) return 'guc_kaynagi';
  if (/reçine|recine|resin/.test(s)) return 'recine';
  if (/filament|makara|spool/.test(s)) return 'filament';
  if (/yazici|yazıcı|printer/.test(s)) return 'yazici';
  if (/aksesuar|accessory|parca|parça|yedek/.test(s)) return 'aksesuar';
  if (KATEGORILER.includes(s)) return s;
  return 'diger';
}

/* ------------------------------------------------------------------ */
/* Vision analizi                                                      */
/* ------------------------------------------------------------------ */

/**
 * Base64 görseli EVREN çok modlu modeline gönderir, 3D donanım bilgisi döndürür.
 *
 * @param {{base64:string, mime?:string, ipucu?:string, timeoutMs?:number}} girdi
 * @returns {Promise<{
 *   urun:string, marka:string|null, kategori:string, kategoriEtiketi:string,
 *   malzeme:string|null, teknikDetaylar:string|null, uyumluYazicilar:string[],
 *   aramaSorgusu:string, guven:'yuksek'|'orta'|'dusuk', guvenYuzde:number,
 *   model:string|null, renk:string|null, ozellikler:string[], ham:string
 * }>}
 */
export async function gorselAnaliz({ base64, mime = 'image/jpeg', ipucu = '', timeoutMs } = {}) {
  if (!base64 || typeof base64 !== 'string') throw new Error('Görsel verisi yok');
  const temiz = base64.replace(/^data:[^;]+;base64,/, '');

  // Base64 → bayt (yaklaşık). 4 MB sınırı: EVREN'e dev görsel göndermeyiz.
  const boyut = Math.floor((temiz.length * 3) / 4);
  if (boyut > GORSEL_MAX_BAYT) {
    throw new Error('Görsel çok büyük (en fazla 4 MB). Lütfen daha küçük bir fotoğraf seçin.');
  }
  if (boyut < 64) throw new Error('Görsel verisi geçersiz (bozuk veya çok küçük).');

  // Sihirli bayt kontrolü: yalnızca gerçek görseller EVREN'e gider.
  // (JPEG FFD8FF · PNG 89504E47 · WebP RIFF…WEBP · GIF 474946)
  const ilkBaytlar = Buffer.from(temiz.slice(0, 24), 'base64');
  const jpeg = ilkBaytlar[0] === 0xFF && ilkBaytlar[1] === 0xD8 && ilkBaytlar[2] === 0xFF;
  const png = ilkBaytlar[0] === 0x89 && ilkBaytlar.toString('ascii', 1, 4) === 'PNG';
  const gif = ilkBaytlar.toString('ascii', 0, 3) === 'GIF';
  const webp = ilkBaytlar.toString('ascii', 0, 4) === 'RIFF'
    && ilkBaytlar.toString('ascii', 8, 12) === 'WEBP';
  if (!(jpeg || png || gif || webp)) {
    throw new Error('Görsel verisi geçersiz (desteklenen biçimler: JPEG, PNG, WebP).');
  }

  const ipucuTemiz = temizMetin(ipucu, 120);
  const kullaniciIcerik = [
    {
      type: 'text',
      text: (ipucuTemiz ? `Kullanıcı ipucu: ${ipucuTemiz}\n` : '')
        + 'Görseldeki 3D yazıcı parçasını veya filament makarasını tanımla.',
    },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${temiz}` } },
  ];

  // 🔁 503/429 TOLERANSI (2026-11-05)
  // Model anlık dolu olduğunda (model_capacity_exhausted) kullanıcıya hata
  // göstermek yerine 2 sn bekleyip sessizce tekrar deneriz. Atölyede fotoğraf
  // yükleyen kişi kesinti hissetmez.
  const VISION_DENEME = 2;
  const VISION_BEKLEME_MS = 2000;

  let ham = null;
  let sonHata = null;
  for (let deneme = 0; deneme < VISION_DENEME; deneme++) {
    const controller = new AbortController();
    const sure = Number.isFinite(timeoutMs) ? timeoutMs : 90000;
    const timer = setTimeout(() => controller.abort(), sure);
    try {
      const res = await fetch(config.ai.baseURL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + config.ai.apiKey,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          temperature: 0,
          max_tokens: 700,
          messages: [
            { role: 'system', content: VISION_SYSTEM },
            { role: 'user', content: kullaniciIcerik },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        const gecici = [429, 502, 503, 504].includes(Number(res.status));
        sonHata = new Error('Vision API HTTP ' + res.status + ': ' + t.slice(0, 160));
        // Son deneme değilse bekle ve sessizce tekrar dene.
        if (gecici && deneme < VISION_DENEME - 1) {
          console.log('[gorselArama] EVREN ' + res.status
            + ' alındı, görsel analizi ' + VISION_BEKLEME_MS + 'ms sonra yeniden denenecek'
            + ' (deneme: ' + (deneme + 1) + '/' + VISION_DENEME + ')');
          await new Promise(r => setTimeout(r, VISION_BEKLEME_MS));
          continue;
        }
        throw sonHata;
      }

      const data = await res.json();
      ham = data.choices?.[0]?.message?.content || '';
      sonHata = null;
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  if (ham == null && sonHata) throw sonHata;
  if (ham == null) throw new Error('Vision API yanıt vermedi');

  const json = jsonCikar(ham);
  if (!json) {
    throw new Error('Görseldeki parça tanınamadı. Daha net, iyi ışıklı bir fotoğraf deneyin.');
  }

  const urun = temizMetin(json.urun, 160);
  const aramaSorgusu = temizMetin(json.aramaSorgusu, 120);
  if (!aramaSorgusu && !urun) {
    throw new Error('Görseldeki parça tanınamadı. Daha net bir fotoğraf deneyin.');
  }

  const kategori = kategoriNormalize(json.kategori);
  const teknik = temizMetin(json.teknikDetaylar, 300);
  const uyumlu = Array.isArray(json.uyumluYazicilar)
    ? json.uyumluYazicilar.map(x => temizMetin(x, 60)).filter(Boolean).slice(0, 8)
    : [];
  const guvenHam = String(json.guven || '').toLocaleLowerCase('tr-TR');
  const guven = ['yuksek', 'yüksek'].includes(guvenHam) ? 'yuksek'
    : ['dusuk', 'düşük'].includes(guvenHam) ? 'dusuk'
      : 'orta';

  // Özellik listesi: teknik detayı virgül/noktalı virgülden ayır (istemci uyumu).
  const ozellikler = teknik
    ? teknik.split(/[,;·]/).map(s => s.trim()).filter(Boolean).slice(0, 6)
    : uyumlu.slice(0, 3);

  return {
    urun: urun || aramaSorgusu,
    marka: temizMetin(json.marka, 60),
    kategori,
    kategoriEtiketi: kategoriEtiketi(kategori),
    malzeme: temizMetin(json.malzeme, 40),
    teknikDetaylar: teknik,
    uyumluYazicilar: uyumlu,
    aramaSorgusu: aramaSorgusu || urun,
    guven,
    guvenYuzde: guvenYuzde(guven),
    // Geriye dönük uyum (eski arayüz/istemciler bu alanları okuyor)
    model: teknik,
    renk: temizMetin(json.renk, 40) || null,
    ozellikler,
    ham: String(ham).slice(0, 400),
  };
}

/* ------------------------------------------------------------------ */
/* Sorgu kademelemesi                                                  */
/* ------------------------------------------------------------------ */

/**
 * Analizden arama sorgularını (en özelden en genele) üretir.
 * Mevcut davranış korunur (testler bunu doğrular).
 * @param {object} analiz
 * @returns {string[]} en fazla 4 sorgu
 */
export function sorgulariOlustur(analiz = {}) {
  const sorgular = [];
  const marka = analiz.marka;
  const tur = analiz.aramaSorgusu || analiz.urun;
  const renk = analiz.renk;
  const malzeme = analiz.malzeme;
  const turKucuk = String(tur || '').toLocaleLowerCase('tr-TR');
  const turMarkaIceriyor = !!(marka && tur && turKucuk.includes(String(marka).toLocaleLowerCase('tr-TR')));

  const ekle = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && !sorgular.includes(t)) sorgular.push(t);
  };

  if (turMarkaIceriyor) {
    if (renk) ekle(`${tur} ${renk}`);
    ekle(tur);
  } else {
    if (marka && tur && renk) ekle(`${marka} ${tur} ${renk}`);
    if (marka && malzeme && tur && !turKucuk.includes(String(malzeme).toLocaleLowerCase('tr-TR'))) {
      ekle(`${marka} ${malzeme} ${tur}`);
    }
    if (marka && tur) ekle(`${marka} ${tur}`);
    if (tur && renk) ekle(`${tur} ${renk}`);
    ekle(tur);
    if (marka && analiz.urun && tur !== analiz.urun) ekle(`${marka} ${analiz.urun}`);
  }
  return sorgular.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Fiyat arama                                                         */
/* ------------------------------------------------------------------ */

/** Kargo metni (telegramBot'a bağımlı olmadan — döngüsel import olmasın). */
function kargoEtiketi(r) {
  const kargo = r?.product?.pricing?.kargo || {};
  const bedava = kargo.uygulanir === false
    || r?.product?.shipping?.applies === false
    || (r?.kargoBedava === true && kargo.uygulanir == null);
  if (bedava) return 'Kargo Bedava';
  if (Number(kargo.ucret) > 0 && kargo.uygulanir !== false) return `+${Number(kargo.ucret).toFixed(2)} TL Kargo`;
  if (kargo.freeOver) return 'Sepette belli';
  return 'Kargo bilinmiyor';
}

/** Ham `product` nesnesinden aday kaydı üretir. */
function adayYap(r, analiz, hedefBaslik) {
  const p = r.product;
  const benzerlik = titleSimilarity(
    hedefBaslik,
    String(p.title || ''),
    analiz.marka || null,
    p.brand || null,
    { stripColors: true },
  );
  const fiyat = karsilastirmaFiyati(r);
  return {
    site: r.site,
    siteName: r.siteName || r.site,
    title: String(p.title || '').slice(0, 200),
    url: p.afiliyeUrl || afiliyeLink(r.site, p.url) || p.url,
    hamUrl: p.url,
    price: Number.isFinite(fiyat) ? Math.round(fiyat * 100) / 100 : null,
    kargo: kargoEtiketi(r),
    stokta: stoktaMi(r),
    renkAyni: r.renkAyni !== false,
    benzerlik: Math.round(benzerlik * 100) / 100,
    brand: p.brand || null,
    color: p.color || dominantColor(p.title || ''),
    birimMetni: p.birim?.tlKg ? `₺${p.birim.tlKg} / kg` : null,
  };
}

/**
 * Görselden çıkan sorguyla **61 mağazada** canlı fiyat taraması.
 *
 * Birincil yol (spec): `hizliKaynakUrunBul` → kanonik ürün URL'si →
 * `runComparison` (tüm siteler, stok filtresi, gerçek ödenecek tutar).
 * Kanonik ürün bulunamazsa hızlı site listesinde doğrudan arama yapılır.
 *
 * `opts.siteler` AÇIKÇA verilirse yalnız o siteler taranır (test/ileri düzey).
 *
 * @param {object} analiz gorselAnaliz çıktısı
 * @param {{onProgress?:Function, signal?:AbortSignal, siteler?:string[],
 *          hizliMod?:boolean, limit?:number, kanonikDeneme?:number}} opts
 */
export async function gorselAra(analiz = {}, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal || null;
  const iptalMi = () => !!(signal && signal.aborted);
  const basladi = Date.now();
  const limit = Math.max(3, Math.min(Number(opts.limit) || 12, 30));

  const sorgular = sorgulariOlustur(analiz);
  if (!sorgular.length) throw new Error('Aranacak sorgu üretilemedi');

  const hedefBaslik = [analiz.marka, analiz.urun, analiz.renk]
    .filter(Boolean).join(' ').trim() || sorgular[0];

  const temel = {
    analiz,
    sorgular,
    adaylar: [],
    enUcuz: null,
    ozet: { toplamSureMs: 0, tarananSite: 0, adaySayisi: 0 },
  };

  /* ---------- A) Açıkça site listesi verildi → doğrudan adaptör araması ---------- */
  if (Array.isArray(opts.siteler)) {
    const siteListesi = opts.siteler;
    onProgress({
      faz: 'arama', analiz, sorgular, toplam: siteListesi.length, biten: 0,
      not: `"${sorgular[0]}" ile sitelerde aranıyor…`,
    });
    const adaylar = [];
    const gorulen = new Set();
    let biten = 0;
    let imlec = 0;
    const isci = async () => {
      while (true) {
        if (iptalMi()) return;
        const i = imlec++;
        if (i >= siteListesi.length) return;
        const id = siteListesi[i];
        const adapter = adapterById(id);
        if (!adapter) { biten++; continue; }
        for (const sorgu of sorgular) {
          if (iptalMi()) break;
          let urunler = [];
          try { urunler = await adapter.searchProducts(sorgu, { spend: 0 }) || []; } catch { urunler = []; }
          if (!urunler.length) continue;
          for (const u of urunler) {
            if (!u?.title || !u?.url || gorulen.has(u.url)) continue;
            gorulen.add(u.url);
            const benzerlik = titleSimilarity(hedefBaslik, u.title, analiz.marka || null,
              u.brand || null, { stripColors: true });
            const adayRenkler = extractColors(u.title).map(r => String(r).toLowerCase());
            const arananRenk = analiz.renk ? String(analiz.renk).toLowerCase() : null;
            const renkUyum = arananRenk
              ? adayRenkler.some(r => r.includes(arananRenk) || arananRenk.includes(r))
              : null;
            adaylar.push({
              site: id, siteName: adapter.name,
              title: String(u.title).slice(0, 200),
              url: afiliyeLink(id, u.url) || u.url,
              hamUrl: u.url,
              price: u.price != null ? Math.round(Number(u.price) * 100) / 100 : null,
              kargo: null,
              stokta: true, // arama sonucu stok bilgisi taşımıyor → "uydurma tükendi" yok
              benzerlik: Math.round(benzerlik * 100) / 100,
              brand: u.brand || null,
              color: u.color || dominantColor(u.title),
              markaUyum: analiz.marka
                ? String(u.title).toLowerCase().includes(String(analiz.marka).toLowerCase())
                : null,
              renkUyum,
            });
          }
          if (adaylar.filter(a => a.site === id).length) break;
        }
        biten++;
        onProgress({
          faz: 'arama', analiz, sorgular, toplam: siteListesi.length, biten, site: id,
          siteName: adapter.name,
          adaySayisi: adaylar.filter(a => a.site === id).length,
          not: adaylar.filter(a => a.site === id).length ? 'aday var' : 'sonuç yok',
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, siteListesi.length) }, () => isci()));

    if (iptalMi()) {
      return { ...temel, iptalEdildi: true, ozet: { toplamSureMs: Date.now() - basladi, tarananSite: biten } };
    }

    const sirali = adaylar.map(a => {
      let puan = a.benzerlik;
      if (a.markaUyum === true) puan += 0.35;
      else if (a.markaUyum === false) puan -= 0.25;
      if (a.renkUyum === true) puan += 0.15;
      else if (a.renkUyum === false && analiz.renk) puan -= 0.30;
      return { ...a, puan: Math.round(puan * 1000) / 1000 };
    }).sort((a, b) => {
      if (b.puan !== a.puan) return b.puan - a.puan;
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    }).slice(0, limit);

    const fiyatli = sirali.filter(a => a.price != null && a.price > 0);
    const enUcuz = fiyatli.length ? fiyatli.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
    if (enUcuz) enUcuz.enUcuz = true;

    return {
      ...temel,
      adaylar: sirali,
      enUcuz,
      ozet: {
        toplamSureMs: Date.now() - basladi,
        tarananSite: biten,
        adaySayisi: sirali.length,
        enUcuzSite: enUcuz?.siteName || null,
        enUcuzFiyat: enUcuz?.price ?? null,
        enUcuzUrl: enUcuz?.hamUrl || enUcuz?.url || null,
        enUcuzAfiliyeUrl: enUcuz?.url || null,
        yontem: 'site-taramasi',
      },
    };
  }

  /* ---------- B) Kanonik ürün → runComparison (61 mağaza) ---------- */
  const deneme = Math.max(1, Math.min(Number(opts.kanonikDeneme) || 2, sorgular.length));
  onProgress({
    faz: 'arama', analiz, sorgular, toplam: 1, biten: 0,
    not: 'Kanonik ürün aranıyor…',
  });

  let kanonik = null;
  for (const sorgu of sorgular.slice(0, deneme)) {
    if (iptalMi()) break;
    try {
      const bulunan = await hizliKaynakUrunBul(sorgu);
      if (bulunan?.url) { kanonik = { ...bulunan, sorgu }; break; }
    } catch { /* sonraki sorgu */ }
  }

  if (kanonik && !iptalMi()) {
    onProgress({
      faz: 'arama', analiz, sorgular, toplam: 1, biten: 0,
      not: `Kanonik ürün: ${kanonik.title || kanonik.url}`,
      kaynak: kanonik.title || null,
    });

    let res = null;
    try {
      res = await runComparison(kanonik.url, {
        signal,
        onProgress: (p) => {
          // Pipeline ilerlemesini arayüze taşı (site sayısı).
          onProgress({
            faz: 'arama', analiz, sorgular,
            toplam: Number(p?.toplam) || 61,
            biten: Number(p?.biten) || 0,
            not: p?.not || `${kanonik.siteName || ''} taranıyor…`,
          });
        },
      });
    } catch (e) {
      // Kanonik ürün taranamazsa dürüstçe bildir; tahmini fiyat üretme.
      onProgress({ faz: 'bitti', analiz, not: 'Kanonik ürün taranamadı: ' + String(e?.message || e).slice(0, 80) });
    }

    if (res) {
      const siraliHam = stokSirala(res.sonuclar || []);
      const adaylar = siraliHam
        .filter(r => r?.status === 'found' && r?.product)
        .map(r => adayYap(r, analiz, hedefBaslik))
        .slice(0, limit);

      const stoklu = adaylar.filter(a => a.stokta && a.price != null && a.price > 0);
      const enUcuz = stoklu.length
        ? stoklu.reduce((a, b) => (a.price <= b.price ? a : b))
        : null;
      if (enUcuz) enUcuz.enUcuz = true;

      const o = res.ozet || {};
      onProgress({ faz: 'bitti', analiz, not: `${adaylar.length} teklif bulundu` });
      return {
        ...temel,
        adaylar,
        enUcuz,
        // Ham karşılaştırma sonucu: Telegram sonucMesajiOlustur ile biçimlendirir
        // (ikinci kez tarama YAPILMAZ).
        hamSonuc: res,
        kanonik: {
          title: kanonik.title || null,
          site: kanonik.siteName || null,
          url: kanonik.url,
          sorgu: kanonik.sorgu,
        },
        ozet: {
          toplamSureMs: Date.now() - basladi,
          tarananSite: Number(o.tarananSiteSayisi ?? o.bulunanSiteSayisi ?? 0),
          adaySayisi: adaylar.length,
          stoktaSayisi: stoklu.length,
          enUcuzSite: enUcuz?.siteName || null,
          enUcuzFiyat: enUcuz?.price ?? null,
          enUcuzUrl: enUcuz?.hamUrl || null,
          enUcuzAfiliyeUrl: enUcuz?.url || null,
          enUcuzKargo: enUcuz?.kargo || null,
          yontem: 'kanonik+runComparison',
          kismi: o.taranmayanSiteSayisi > 0,
          taranmayan: Number(o.taranmayanSiteSayisi) || 0,
        },
      };
    }
  }

  /* ---------- C) Kanonik bulunamadı → hızlı site araması (dürüst yedek) ---------- */
  if (iptalMi()) {
    return { ...temel, iptalEdildi: true, ozet: { toplamSureMs: Date.now() - basladi, tarananSite: 0 } };
  }
  if (opts.yedekArama === false) {
    return {
      ...temel,
      bulunamadi: true,
      neden: 'Parça için kanonik ürün bulunamadı (mağazalarda eşleşen ilan yok).',
      ozet: { toplamSureMs: Date.now() - basladi, tarananSite: 0, adaySayisi: 0, yontem: 'kanonik' },
    };
  }

  onProgress({
    faz: 'arama', analiz, sorgular,
    toplam: HIZLI_SITELER.length, biten: 0,
    not: 'Kanonik ürün yok; mağazalarda doğrudan aranıyor…',
  });
  const yedek = await gorselAra(analiz, { ...opts, siteler: opts.hizliMod === false
    ? adapters.map(a => a.id) : HIZLI_SITELER });
  return {
    ...yedek,
    ozet: { ...yedek.ozet, yontem: 'site-taramasi', kanonikBulunamadi: true },
  };
}

/** Tam akış: görsel → analiz → 61 mağaza fiyat taraması. */
export async function gorselAramaYap({ base64, mime, ipucu }, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  onProgress({ faz: 'analiz', not: 'Görsel EVREN (qwen3-vl-30b) ile inceleniyor…' });
  const analiz = await gorselAnaliz({ base64, mime, ipucu });
  onProgress({
    faz: 'analiz', analiz,
    not: `Tespit edildi: ${analiz.urun || analiz.aramaSorgusu} (${analiz.guven})`,
  });
  return gorselAra(analiz, { ...opts, onProgress });
}

/**
 * Telegram/kart için tek satırlık özet metni (HTML'siz, çağıran escape eder).
 * @param {object} analiz
 * @returns {string}
 */
export function gorselOzetSatiri(analiz) {
  if (!analiz) return '';
  const parcalar = [
    analiz.kategoriEtiketi || kategoriEtiketi(analiz.kategori),
    analiz.marka,
    analiz.teknikDetaylar,
  ].filter(Boolean);
  return parcalar.join(' · ');
}
