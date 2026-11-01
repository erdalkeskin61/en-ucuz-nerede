import { semanticMatch, explainCheapest } from './ai.js';
/**
 * Karşılaştırma işlem hattı.
 *
 * Akış:
 *  1. Kaynak URL'den site tespit edilir, ürün verisi çekilir (model kodu, barkod, renk, fiyat...).
 *  2. Diğer 6 site PARALEL araştırılır:
 *     - Sorgular önce model kodu üzerinden kurulur (kullanıcı kuralı).
 *     - Adaylar başlık benzerliğine göre sıralanır, en iyi adayların sayfaları çekilir.
 *     - Eşleştirme: model kodu -> barkod -> başlık benzerliği (renk kelimeleri ayıklanarak).
 *  3. Renk kontrolü: adayın rengi kaynak üründen farklıysa "farklı renk" olarak işaretlenir ve
 *     en ucuz yarışından çıkarılır (kartta rengi gösterilir).
 *  4. Kampanya metinleri YZ ile sınıflandırılır (ham HTML asla YZ'ye gitmez).
 *  5. Gerçek ödenecek fiyat hesaplanır: satış fiyatı + herkesin alabileceği ek indirimler
 *     - koşullular hariç + gerçekten uygulanan kargo.
 *  6. Aynı renktekiler arasında en ucuz işaretlenir.
 */
import { config } from './config.js';
import { adapters, detectSite } from './sites/index.js';
import { classifyCampaigns } from './ai.js';
import { computePricing, enUcuzFiyatDegerlendir } from './pricing.js';
import { getFiyatAnalizi } from './store.js';
import { urunIcinKampanyalar } from './kuponlar.js';
import { matchProducts, sameColor, titleSimilarity, titleTokens, countTokenOverlap, kritikVaryantCakismasi, toLowerTr, normalizeModelCode, normalizeBarcode, brandAyni, brandWords, extractColors, dominantColor } from './util.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { birimFiyat, birimSirala, birimFiyatHesapla } from './birimFiyat.js';
import {
  baskiKartiBilgisi, yuksekBirimMaliyet, baskiOzeti,
} from './baskiMaliyet.js';
import { stokSirala, stokOzet } from './stokSirala.js';
import { HIZLI_SITELER } from './basketOptimizer.js';

/** Kaynak üründen arama sorguları üretir: önce model kodu, yoksa marka + başlık anahtar kelimeleri. */
// Renk ton belirteçleri: tek başına renk DEĞİL ama renk ifadesinin parçasıdır
// ("açık gri", "koyu mavi"). Arama sorgusuna tek başına sızmamalı — 2026-10-25 hatası:
// "Esun Açık Gri PLA Basic Filament" → sorgu "esun açık" oluyordu, çoğu site 0 sonuç.
// DİKKAT: "matte"/"silk"/"parlak" ürün SERİSİ adıdır, ton değil — sorguda kalmalı.
const RENK_TONLARI = new Set(['acik', 'koyu', 'pastel', 'light', 'dark']);

/** Türkçe diakritikleri sadeleştirip küçük harfe indirir (açık → acik). */
function sadeKucuk(s) {
  return toLowerTr(s).replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');
}

/**
 * Kaynak üründen arama sorguları üretir.
 *
 * Sıra: model kodu → marka + model çizgisi (geniş) → marka + model çizgisi + renk (dar)
 * → yalnız marka. Renk, ilk sorguya KONMAZ: geniş sorgu tüm varyantları getirir, renk
 * eşleştirme aşamasında zaten denetlenir. Dar sorgu, geniş sorgunun alakasız liste
 * döndürdüğü siteler için yedektir.
 */
export function buildQueries(src) {
  const qs = [];
  const model = (src.modelCode || '').trim();
  const brand = (src.brand || '').trim();
  // Model kodu kaynağın KENDİ başlığında geçmiyorsa bu büyük olasılıkla bir mağaza içi
  // SKU'dur (küçük mağazalar kendi kodlarını yazar); başka sitelerde arama yapmak için
  // kullanılmaz — hiç sonuç getirmez. Bunun yerine marka + başlık kelimeleri kullanılır.
  const modelKodu = model && normalizeModelCode(src.title || '').includes(normalizeModelCode(model)) ? model : null;
  if (brand && modelKodu) qs.push(brand + ' ' + modelKodu);
  if (modelKodu) qs.push(model);

  if (qs.length < 2) {
    // Marka + başlıktaki en ayırt edici kelimeler — HAM haliyle (arama motorları kendi
    // tokenizasyonlarını yapar; "PLA+" -> "PLA" gibi). Marka sözcükleri, renkler ve renk
    // tonları ayıklanır; spec/sayı gürültüsü (10, 9, 000dpi) atılır.
    const markaKelimeleri = new Set(toLowerTr(brand).split(/\s+/).filter(Boolean));
    // "filament"/"yazıcı" gibi tür kelimeleri ayırt edici değildir; yeterli başka kelime
    // varsa sorguya girmez (aksi halde "esun filament" gibi zayıf sorgular oluşur).
    const TUR_KELIMELERI = new Set(['filament', 'yazici', 'printer', 'baski', 'urun']);
    const kelimeler = toLowerTr(src.title || '').replace(/[^\p{L}\p{N}+\s-]/gu, ' ').split(/[\s-]+/)
      .filter(w => w.length >= 3 && !/^\d/.test(w) && !markaKelimeleri.has(w) && extractColors(w).length === 0)
      // Arama motorları "+" gibi karakterlerde farklı davranır (bazı T-Soft aramaları
      // "pla+" sorgusunu hiç sonuç döndürmez); sorguda yalnız harf/rakam kalsın.
      .map(w => w.replace(/[^a-z0-9çğıöşü]/gi, ''))
      .filter(w => w.length >= 3 && !RENK_TONLARI.has(sadeKucuk(w)));

    const ayirtEdici = [...new Set(kelimeler.filter(w => !TUR_KELIMELERI.has(w)))];
    const havuz = ayirtEdici.length >= 2 ? ayirtEdici : [...new Set(kelimeler)];
    const secilen = havuz.slice(0, 3);

    if (brand && secilen.length) qs.push([brand, ...secilen.slice(0, 2)].join(' '));
    else if (secilen.length >= 2) qs.push(secilen.join(' '));

    // Dar sorgu: model çizgisi + renk (geniş sorgu alakasız liste döndürürse).
    const renk = (src.color || dominantColor(src.title || '') || '').trim();
    if (renk && qs.length) {
      const tonlu = toLowerTr(src.title || '').match(/\b(acik|koyu|pastel)\s+([a-zçğıöşü]+)/);
      const renkIfade = tonlu && extractColors(tonlu[0]).length ? tonlu[0] : renk;
      const taban = brand ? [brand, ...secilen.slice(0, 2)].join(' ') : secilen.join(' ');
      const dar = (taban + ' ' + renkIfade).trim();
      if (dar !== qs[qs.length - 1]) qs.push(dar);
    }

    // Yedek sorgu: yalnız marka. Uzun sorgular bazı arama motorlarında eşleşme
    // bulamayınca genel/popüler liste döndürür; marka sorgusu markanın ürünlerini
    // getirir (adaylar benzerlikle sıralandığı için bu da işe yarar).
    if (brand && qs.length && !qs.includes(brand)) qs.push(brand);
  }
  return [...new Set(qs.filter(q => q && q.trim().length >= 3))].slice(0, 4);
}

/** Adayları kaynak ürüne benzerliğe göre sıralar. */
function rankCandidates(candidates, src) {
  // Marka disiplini: kaynak markası biliniyorsa, başlığında marka sözcüklerinden
  // hiçbiri geçmeyen adaylar geriye sıralanır (bazı mağazalar markayı başlığa
  // yazmaz — bu yüzden tamamen elenmez, yalnız öncelik kaybeder).
  const srcMarkaKelimeleri = brandWords(src.brand);
  return candidates
    .map(c => {
      let score = titleSimilarity(src.title, c.title, src.brand, c.brand);
      if (brandAyni(src.brand, c.brand)) score += 0.1;
      if (srcMarkaKelimeleri.length && !srcMarkaKelimeleri.some(w => toLowerTr(c.title || '').includes(w))) {
        score -= 0.25;
      }
      // Renk disiplini: arama sonucu renk alanı taşımıyorsa başlıktan çıkar
      // (ör. "eSun PLA Basic Beton Gri" → gri). Kaynak rengiyle aynı olan adaylar
      // renkli varyantların önüne geçer — eşleşen renk önce incelenir.
      const adayRenk = c.color || dominantColor(c.title || '');
      if (src.color && adayRenk) {
        score -= sameColor(src.color, adayRenk) === false ? 0.15 : 0;
      }
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Bir sitede kaynak ürünü arar; eşleşen ürünü (varsa) döndürür.
 *  Sorgu yedeklemesi: bir sorgunun adayları eşleşme üretmezse sıradaki sorgu
 *  denenir (ilk sorgu bazı arama motorlarında alakasız/popüler liste döndürebilir). */
async function findOnSite(adapter, src, queries, onProgress, maxCandidates = config.maxCandidatesPerSite, iptalMi = null, opts = {}) {
  const result = {
    site: adapter.id,
    siteName: adapter.name,
    status: 'not_found',
    reason: '',
    product: null,
    matchBasis: null,
    renkAyni: null,
    examined: [],
    queriesTried: [],
    requestsSpent: 0,
  };
  const ctx = { spend: 0 };
  // Arka plan tazelemesi (2026-10-29): sayfa önbelleğini atla, gerçekten siteye git.
  // Aksi hâlde 6 saatlik sayfa önbelleği tazelemeyi "değişiklik yok" gibi gösteriyordu.
  const tazeOpts = opts && opts.taze ? { fresh: true } : {};
  const durduruldu = () => !!(iptalMi && iptalMi());

  /** Sıralı adayları ön elemeden geçirip en iyi N tanesini inceler; seçilen ürünü döndürür. */
  const adaylariIncele = async (candidates) => {
    // Model kodu ön eleme: kaynak ürünün model kodu KENDİ başlığında geçiyorsa gerçek
    // bir model kodudur (mağaza SKU'su değil — buildQueries ile aynı kural); başlığında/
    // modelinde bu kod geçmeyen adaylar sayfa çekilmeden elenir (kredi tasarrufu).
    // Yalnızca barkod eşleşen ya da markası tutan adaylar elenmez: küçük mağazalar
    // aynı ürün için kendi SKU'larını "model kodu" olarak yazar.
    const srcModel = normalizeModelCode(src.modelCode);
    const srcBarcode = normalizeBarcode(src.barcode);
    const modelGercek = srcModel && srcModel.length >= 3 && normalizeModelCode(src.title || '').includes(srcModel);
    let pool = candidates;
    if (modelGercek) {
      const filtered = candidates.filter(c => {
        const t = normalizeModelCode(c.title || '');
        const cm = normalizeModelCode(c.modelCode || '');
        if (t.includes(srcModel) || (cm.length >= 3 && (cm === srcModel || cm.includes(srcModel) || srcModel.includes(cm)))) return true;
        const cb = normalizeBarcode(c.barcode || '');
        if (srcBarcode && cb && cb === srcBarcode) return true;
        if (brandAyni(src.brand, c.brand)) return true;
        // Markanın ayırt edici sözcükleri ("Beta Filament" -> "beta") aday başlığında geçiyorsa korunur
        const mw = brandWords(src.brand);
        if (mw.length && mw.some(w => toLowerTr(c.title || '').includes(w))) return true;
        return false;
      });
      if (!filtered.length) {
        result.reason = 'Aramada ' + candidates.length + ' sonuç var ancak hiçbiri model kodunu (' + src.modelCode + ') içermiyor';
        return { chosen: null, kesin: true };
      }
      pool = filtered;
    }

    let sameColorMatch = null;
    let diffColorMatch = null;
    const bakilanUrl = new Set(result.examined.map(e => e.url)); // sorgular arası tekrar inceleme yok
    // Şablon/boş URL koruması: bazı temalar arama listesinde işlenmemiş şablon
    // bağlantısı basıyor (ör. robotizmo "https://robotizmo.net/{{seoName}}"). Böyle bir
    // URL'yi çekmek anlamsızdır (404/403) ve gerçek adayları sıradan düşürür.
    const gecerliUrl = (u) => typeof u === 'string' && u.startsWith('http') && !u.includes('{{') && !u.includes('}}');
    for (const cand of pool.filter(c => gecerliUrl(c.url)).slice(0, maxCandidates)) {
      // Hız ön elemesi: başlık benzerliği aşırı düşük (<%20) ve kelime kesişimi yoksa sayfayı çekme
      const candBenzerlik = titleSimilarity(src.title, cand.title);
      const candOverlap = countTokenOverlap(src.title, cand.title);
      if (candBenzerlik < 0.20 && candOverlap === 0 && !normalizeBarcode(cand.barcode)) {
        result.examined.push({ url: cand.url, sonuc: 'başlık ilgisiz (%' + Math.round(candBenzerlik * 100) + ')' });
        continue;
      }
      if (durduruldu()) break;
      if (bakilanUrl.has(cand.url)) continue;
      bakilanUrl.add(cand.url);
      let product;
      try {
        // `opts.taze` → sayfa önbelleğini atla (arka plan tazelemesi gerçekten
        // siteye gitsin; 2026-10-29: aksi hâlde 6 saatlik sayfa önbelleği
        // tazelemeyi "hiçbir şey değişmedi" gibi gösteriyordu).
        product = await adapter.getProduct(cand.url, ctx, tazeOpts);
      } catch (e) {
        result.examined.push({ url: cand.url, sonuc: 'sayfa okunamadı: ' + String(e.message || e).slice(0, 120) });
        continue;
      }
      let match = matchProducts(src, product);

      // Belirsiz / Gri Alan Kontrolü:
      // (1) match.griAlan ise (skor 0.35 - 0.85)
      // (2) VEYA match kuralda null döndüğü halde marka aynı ve başlıkta en az 2 kelime örtüşüyor (string similarity'nin yanıldığı durumlar)
      const markaAyni = brandAyni(src.brand, product.brand);
      const overlapTokens = countTokenOverlap(src.title, product.title);
      const varyantCakisma = kritikVaryantCakismasi(src.title, product.title);
      const belirsizAday = !varyantCakisma && ((match && match.griAlan) || (!match && markaAyni && overlapTokens >= 3));

      // Semantik YZ eşleştirmesi: PAHALI ve YAVAŞ (çağrı başına 120 sn'ye kadar).
      // Sepet gibi toplu işlerde `semantik:false` ile kapatılır — kural tabanlı
      // eşleştirme yeterlidir ve dürüsttür (marka/renk disiplini zaten devrede).
      const semantikAcik = opts.semantik !== false;
      if (belirsizAday && semantikAcik && config.matching?.enableSemanticLLM && config.ai.apiKey) {
        try {
          const sem = await Promise.race([
            semanticMatch(src, product),
            new Promise((_, rej) => setTimeout(() => rej(new Error('semantik YZ zaman aşımı')), 3000))
          ]);
          if (sem.ayniUrun) {
            match = {
              eslesme: 'semantik_yz (%' + Math.round((sem.guven || 0.95) * 100) + ')',
              skor: sem.guven || 0.95,
              aciklama: sem.aciklama,
              semantik: true,
            };
          } else {
            result.examined.push({
              url: cand.url,
              sonuc: 'farklı ürün (DeepSeek YZ: ' + (sem.aciklama || 'model uyuşmazlığı') + ')',
            });
            continue;
          }
        } catch (e) {
          // LLM çağrısı başarısızsa kural tabanlı karara güven
        }
      }

      if (!match) {
        result.examined.push({ url: cand.url, sonuc: 'aynı ürün değil' });
        continue;
      }
      const colorSame = sameColor(src.color, product.color);
      result.examined.push({
        url: cand.url,
        sonuc: colorSame === false ? 'aynı ürün, farklı renk (' + (product.color || '?') + ')' : 'eşleşti (' + match.eslesme + ')',
      });
      if (colorSame === false) {
        if (!diffColorMatch) {
          diffColorMatch = product;
          diffColorMatch.renkAyni = false;
          diffColorMatch.matchBasis = match.eslesme;
        }
      } else {
        sameColorMatch = product;
        sameColorMatch.renkAyni = colorSame; // true ya da null (bilinmiyor)
        sameColorMatch.matchBasis = match.eslesme;
        break; // aynı renkte eşleşme bulundu
      }
    }
    return { chosen: sameColorMatch || diffColorMatch, kesin: false };
  };

  try {
    for (const q of queries) {
      if (durduruldu()) break;
      result.queriesTried.push(q);
      let found;
      try {
        found = await adapter.searchProducts(q, ctx);
      } catch (e) {
        // Bu sorgunun araması patladı. Daha önce incelenmiş aday varsa (kısmi sonuç:
        // örn. farklı renk eşleşmesi) sonuç korunur — hata yalnız hiçbir şey
        // öğrenilmediyse raporlanır.
        if (result.examined.length) {
          result.reason += (result.reason ? ' · ' : '') + 'Sonraki sorgu okunamadı (' + q + '): ' + String(e.message || e).slice(0, 80);
          break;
        }
        result.reason = 'Arama sayfası okunamadı: ' + (e.message || e);
        result.status = 'error';
        break;
      }
      const candidates = rankCandidates(found, src);
      if (!candidates.length) continue; // bu sorgu sonuç vermedi → sıradaki sorgu
      const { chosen, kesin } = await adaylariIncele(candidates);
      if (chosen) {
        result.status = 'found';
        result.product = chosen;
        result.matchBasis = chosen.matchBasis;
        result.renkAyni = chosen.renkAyni;
        result.reason = chosen.renkAyni === false
          ? 'Aynı ürün bulundu ancak rengi farklı: ' + (chosen.color || '?')
          : '';
        break;
      }
      if (kesin) {
        // Model kodu ön elemesi tüm adayları eledi — gerçek model koduyla eşleşen
        // bu sitede yok; diğer sorguları denemek anlamsız.
        result.status = 'not_found';
        break;
      }
      // Bu sorgunun adayları eşleşmedi → sıradaki sorgu denenecek
    }
    if (result.status === 'not_found' && !result.reason) {
      result.reason = result.examined.length
        ? 'Aday ürünler incelendi ancak aynı ürün bulunamadı'
        : 'Aramada hiç sonuç bulunamadı (' + result.queriesTried.join(' / ') + ')';
    }
  } catch (e) {
    result.status = 'error';
    result.reason = String(e.message || e).slice(0, 300);
  }
  result.requestsSpent = ctx.spend;
  if (onProgress) onProgress(adapter.id, result);
  return result;
}

/**
 * Ürünü YZ'ye gitmeden fiyatlar (sepet optimizasyonu gibi toplu işler için).
 * Kampanya sınıflandırması yapılmaz → koşullu/koşulsuz kampanya indirimleri
 * uygulanmaz. Bu muhafazakâr bir varsayımdır: fiyat asla olduğundan UCUZ görünmez.
 */
function fiyatlaHizli(product) {
  product.siteKampanyalari = [];
  product.classifiedCampaigns = [];
  product.pricing = computePricing(product, []);
}

/**
 * Bulunan bir ürünün kampanya metinlerini YZ ile sınıflandırır ve gerçek fiyatını
 * hesaplar. Karşılaştırma sırasında site sonuçlandığı anda çağrılır — kalan
 * sitelerin taraması sürerken arka planda çalışır (toplam süreye eklenmez).
 */
async function classifyAndPrice(product, siteName) {
  // Ventatek özel kargo kuralı: 129 TL sabit kargo, 3000 TL üzeri ücretsiz
  if ((product.site === 'ventatek' || /ventatek/i.test(siteName || '') || /ventatek\.com/i.test(product.url || '')) &&
      (!product.shipping || product.shipping.fee == null)) {
    product.shipping = {
      fee: 129,
      freeOver: 3000,
      applies: true,
      note: 'Kargo 129 TL · 3.000 TL üzeri ücretsiz',
    };
  }

  // Site geneli kampanya/kuponları ürüne bağla (kupon toplayıcıdan). Fiyat motoru
  // koşulsuz site kampanyalarını uygular, kodlu olanları "kuponla X TL" gösterir,
  // koşulluları ayrı listeler.
  try {
    product.siteKampanyalari = urunIcinKampanyalar(product);
  } catch {
    product.siteKampanyalari = [];
  }
  let classified = [];
  try {
    classified = await classifyCampaigns({
      site: siteName,
      urunBasligi: product.title,
      fiyatlar: { etiket: product.listPrice, satis: product.sellingPrice },
      kampanyalar: product.campaigns || [],
    });
  } catch (e) {
    classified = (product.campaigns || []).map(m => ({ metin: m, tur: 'bilgi', kosul: null, kosul_aciklamasi: null, fiyata_dahil: true, indirim: null, not: 'Sınıflandırılamadı' }));
  }
  product.classifiedCampaigns = classified;
  product.pricing = computePricing(product, classified);
}

/**
 * Tam karşılaştırma çalıştırır.
 * @param {string} sourceUrl kullanıcının yapıştırdığı ürün linki
 * @param {{onProgress?: Function, maxCandidates?: number}} opts
 */
export async function runComparison(sourceUrl, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const maxCandidates = opts.maxCandidates || config.maxCandidatesPerSite;
  // İptal sinyali (2026-10-27): kullanıcı "İptal" derse kalan siteler taranmaz,
  // o ana kadar bulunan sonuçlar kısmi olarak döner. O anda uçuşta olan istekler
  // (en fazla ESZAMANLI_SITE kadar) kendi zaman aşımına kadar sürer; yeni istek açılmaz.
  const signal = opts.signal || null;
  const iptalMi = () => !!(signal && signal.aborted);
  // YZ kampanya sınıflandırması: sepet gibi toplu işlerde kapatılabilir (hız).
  const siniflandir = opts.siniflandir !== false;
  const startedAt = Date.now();

  const adapter = detectSite(sourceUrl);
  if (!adapter) {
    throw new Error('Bu site desteklenmiyor. Desteklenen siteler: ' + adapters.map(a => a.name).join(', '));
  }
  const u = new URL(sourceUrl);
  if (!adapter.isProductUrl(u)) {
    throw new Error('Bu bağlantı ' + adapter.name + ' ürün sayfası gibi görünmüyor. Lütfen doğrudan ürün linkini yapıştırın.');
  }

  // 1) Kaynak ürün
  // Geçici kazıma hataları (boş sayfa, anlık 403/429, yavaş SSR) tek denemeyle
  // ürünü tamamen düşürüyordu — sepet gibi toplu işlerde bu bir ürünü kaybetmek
  // demek. Bir kez TAZE sayfayla yeniden denenir (2026-10-28).
  onProgress(adapter.id, { site: adapter.id, status: 'running', note: 'Kaynak ürün okunuyor...' });
  const srcCtx = { spend: 0 };
  // İkinci turda (sepet) kaynak ürün önbellekten değil, canlı okunur: ilk turda önbelleğe
  // sağlıklı ama fiyatsız bir sayfa yazılmış olabilir (2026-10-28).
  const kaynakOpts = (opts.tazeKaynak || opts.taze) ? { fresh: true } : {};
  let srcProduct;
  try {
    srcProduct = await adapter.getProduct(sourceUrl, srcCtx, kaynakOpts);
  } catch (e) {
    const ilkHata = e;
    // Nazik bekleme (2026-10-28): aynı siteye anında ikinci istek atmak, sitenin
    // yumuşak engellemesini (404 + hata sayfası) büyütüyordu. Kısa ve rastgele bir
    // aradan sonra taze sayfayla bir kez daha denenir.
    await new Promise((r) => setTimeout(r, 1200 + Math.floor(Math.random() * 1300)));
    try {
      onProgress(adapter.id, { site: adapter.id, status: 'running', note: 'Kaynak ürün yeniden okunuyor...' });
      srcProduct = await adapter.getProduct(sourceUrl, srcCtx, { fresh: true });
    } catch (e2) {
      console.error('[pipeline] kaynak okunamadı', adapter.id,
        '| 1. deneme:', (ilkHata.message || '').slice(0, 90),
        '| 2. deneme (taze):', (e2.message || '').slice(0, 90));
      const mesaj = (ilkHata.message || String(ilkHata));
      const ayrinti = /HTTP 40[34]|HTTP 410/.test(mesaj)
        ? 'site bu ürün sayfasını geçici olarak engelledi (HTTP ' + (mesaj.match(/HTTP (\d+)/)?.[1] || '40x') + '). Birkaç dakika sonra "tekrar dene" ile yeniden taranabilir.'
        : mesaj;
      throw new Error('Kaynak ürün okunamadı (' + adapter.name + '): ' + ayrinti);
    }
  }
  const sourceResult = {
    site: adapter.id,
    siteName: adapter.name,
    status: 'found',
    reason: '',
    product: srcProduct,
    matchBasis: 'kaynak',
    renkAyni: true,
    examined: [],
    queriesTried: [],
    requestsSpent: srcCtx.spend,
  };
  onProgress(adapter.id, sourceResult);

  // 2) Sorgular ve paralel arama
  // Sorgu sayısı sınırlandırılabilir: sepet gibi toplu işlerde bulunamayan her site
  // 4 sorgu deniyordu (30 site × 4 = 120 arama). 2 sorgu süreyi kabaca yarıya indirir.
  const tumSorgular = buildQueries(srcProduct);
  const sorguSiniri = Number.isFinite(opts.maxQueries) && opts.maxQueries > 0
    ? Math.floor(opts.maxQueries)
    : tumSorgular.length;
  const queries = tumSorgular.slice(0, sorguSiniri);
  // Siteler isteğe bağlı olarak sınırlandırılabilir (sepet "hızlı mod").
  const siteFiltresi = Array.isArray(opts.siteler) && opts.siteler.length ? new Set(opts.siteler) : null;
  const hizliKume = new Set(HIZLI_SITELER);
  const others = adapters
    .filter(a => a.id !== adapter.id && (!siteFiltresi || siteFiltresi.has(a.id)))
    .sort((a, b) => (hizliKume.has(b.id) ? 1 : 0) - (hizliKume.has(a.id) ? 1 : 0));
  for (const a of others) {
    onProgress(a.id, { site: a.id, status: 'running', note: 'Aranıyor: ' + (queries[0] || '') });
  }

  // Kaynak ürünün YZ sınıflandırması arama sürerken başlar (kritik yola eklenmez)
  const kaynakSiniflandirma = (siniflandir
    ? classifyAndPrice(srcProduct, adapter.name)
    : Promise.resolve().then(() => fiyatlaHizli(srcProduct)))
    .then(() => onProgress(adapter.id, sourceResult));

  // 3) Siteler paralel araştırılır; bir sitede ürün bulunduğu anda o sitenin YZ
  //    kampanya sınıflandırması + fiyat hesabı çalışır (tarama sürerken).
  //
  //    İPTAL (2026-10-27): iptal edilirse TÜM sitelerin bitmesini beklemeyiz — o ana
  //    kadar tamamlanmış sonuçlarla hemen döneriz. Uçuştaki istekler arka planda
  //    kendi kendine biter (sonuçları yok sayılır). Aksi halde "iptal" 76 saniye
  //    sürüyordu çünkü Promise.all 60 sitenin hepsini bekliyordu.
  const tamamlananlar = [];
  const isler = others.map(a => (async () => {
    if (iptalMi()) return null;
    const siteZamanAsimi = Math.max(3000, Number(opts.siteTimeoutMs) || 10000);
    const arama = findOnSite(a, srcProduct, queries, (id, r) => {
      onProgress(id, r.status === 'found' || r.status === 'error' || r.status === 'not_found'
        ? r
        : { site: id, status: 'running', note: 'Aranıyor...' });
    }, maxCandidates, iptalMi, { semantik: opts.semantik !== false, taze: opts.taze === true });

    // Site bazlı zaman aşımı (sepet gibi toplu işlerde): yavaş bir site tüm işi
    // kilitlemesin. Uçuştaki istek arka planda kendi bitişini bekler, sonucu yok sayılır.
    const res = siteZamanAsimi
      ? await Promise.race([
        arama,
        new Promise((cozum) => {
          const t = setTimeout(() => cozum({
            site: a.id, siteName: a.name, status: 'timeout',
            reason: `Bu site ${Math.round(siteZamanAsimi / 1000)} sn içinde yanıt vermedi`,
            product: null, matchBasis: null, renkAyni: null, examined: [], queriesTried: [], requestsSpent: 0,
          }), siteZamanAsimi);
          if (t.unref) t.unref();
        }),
      ])
      : await arama;
    if (iptalMi() && res.status !== 'found') {
      return { ...res, status: 'iptal', reason: 'Kullanıcı iptal etti' };
    }
    if (res.status === 'found' && res.product) {
      // ⚡ Fiyatlandırma hemen hesaplanır ve anında arayüze basılır (0 ms gecikme)
      fiyatlaHizli(res.product);
      onProgress(a.id, res);
      // Kampanya analizi arka planda zenginleştirir (kritik yolu bekletmez)
      if (siniflandir) {
        classifyAndPrice(res.product, res.siteName)
          .then(() => onProgress(a.id, res))
          .catch(() => {});
      }
    } else if (res.status === 'timeout' || res.status === 'error') {
      onProgress(a.id, res);
    }
    tamamlananlar.push(res);
    return res;
  })().catch(() => null));

  if (signal) {
    // Tüm işlerin bitmesi YA DA iptal sinyali — hangisi önce gelirse
    await new Promise((resolve) => {
      // DİKKAT: sinyal bu noktaya gelmeden ÖNCE iptal edilmiş olabilir (kaynak ürün
      // okunurken tıklanması gibi). addEventListener geçmiş olayı yakalamaz; bu yüzden
      // önce mevcut durumu kontrol etmek ZORUNLU — aksi halde promise hiç çözülmüyor
      // ve iptal, tüm sitelerin bitmesini bekliyordu (2026-10-28 hatası).
      if (iptalMi()) return resolve();
      let kalan = isler.length;
      if (!kalan) return resolve();
      isler.forEach(p => p.then(() => { if (--kalan <= 0) resolve(); }, () => { if (--kalan <= 0) resolve(); }));
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    // İptal edildiyse kaynak sınıflandırmasını da beklemeyiz (YZ yavaş olabilir)
    if (iptalMi()) kaynakSiniflandirma.catch(() => {});
    else await Promise.race([kaynakSiniflandirma, new Promise(r => setTimeout(r, 4000))]);
  } else {
    await Promise.all(isler);
    await Promise.race([kaynakSiniflandirma, new Promise(r => setTimeout(r, 4000))]);
  }

  // Hiç sonuç üretmeyen siteler (iptal anında uçuşta kalanlar) "iptal" olarak işaretlenir
  const iptalEdilenler = others
    .filter(a => !tamamlananlar.some(r => r && r.site === a.id))
    .map(a => ({
      site: a.id, siteName: a.name, status: 'iptal', reason: 'Kullanıcı iptal etti',
      product: null, matchBasis: null, renkAyni: null, examined: [], queriesTried: [], requestsSpent: 0,
    }));

  const siteResults = [...tamamlananlar.filter(Boolean), ...iptalEdilenler];

  const allResults = [sourceResult, ...siteResults];
  const found = allResults.filter(r => r.status === 'found' && r.product);
  const stok = stokOzet(allResults);
  // KESİN HİYERARŞİ (2026-10-30): stokta olanlar her zaman önce. Sıralama burada
  // BİR KEZ yapılır; web arayüzü, öneri kartları, sepet ve tarayıcı eklentisi aynı
  // sırayı devralır. Böylece "en ucuz tükendi" hiçbir katmanda üste geçemez.
  const siraliResults = stokSirala(allResults);

  // ---- FİYAT ZEKASI (2026-10-30) ----
  // Sahte indirim & dip fiyat radarı: güncel en ucuz fiyatı SQLite geçmişiyle kıyaslar.
  // Geçmiş yoksa uydurma yapılmaz; "veri yok" denir (arayüz bunu dürüstçe gösterir).
  let fiyatAnalizi = null;
  let fiyatZekasi = null;
  try {
    const pid = srcProduct?.modelCode || srcProduct?.barcode || srcProduct?.title || '';
    fiyatAnalizi = getFiyatAnalizi(pid, srcProduct?.barcode, sourceUrl);
    fiyatZekasi = enUcuzFiyatDegerlendir(allResults, fiyatAnalizi);
    // Kart bazlı şişirilmiş etiket: mağazanın üstü çizili liste fiyatı, 30 günlük
    // piyasa ortalamasının %20 üzerindeyse o kart uyarı alır.
    const ort = fiyatZekasi?.ortFiyat;
    if (ort > 0) {
      for (const r of allResults) {
        if (r.status !== 'found' || !r.product) continue;
        const etiket = Number(r.product.listPrice ?? r.product.pricing?.etiket);
        r.sisirilmisEtiket = Number.isFinite(etiket) && etiket > 0 && etiket > ort * 1.2;
        r.etiketOrani = Number.isFinite(etiket) && etiket > 0 ? Math.round((etiket / ort) * 1000) / 1000 : null;
      }
    }
  } catch (e) {
    // Geçmiş okunamazsa karşılaştırma YİNE çalışır; yalnızca radar görünmez.
    fiyatZekasi = { tavsiye: 'veri_yok', durum: null, neden: 'Fiyat geçmişi okunamadı: ' + String(e.message || e).slice(0, 80) };
  }

  // 4) En ucuz: aynı renkteki, stoğu olan, fiyatı hesaplanabilen ürünler arasından
  const eligible = found.filter(r => r.renkAyni !== false && r.product?.pricing?.toplam != null && r.product.inStock !== false);
  let cheapest = null;
  for (const r of eligible) {
    if (!cheapest || r.product.pricing.toplam < cheapest.product.pricing.toplam) cheapest = r;
  }
  if (cheapest) cheapest.enUcuz = true;

  // İkinci en ucuz teklif (neden daha ucuz açıklaması için)
  const sortedEligible = [...eligible].sort((a, b) => (a.product?.pricing?.toplam || 0) - (b.product?.pricing?.toplam || 0));
  const runnerUp = sortedEligible.length > 1 ? sortedEligible[1] : null;
  let nedenDahaUcuz = null;
  // İptal edildiyse YZ açıklamasını ATLA: bu çağrı yavaş olabiliyor (60-120 sn) ve
  // kullanıcı zaten taramayı durdurmuş durumda. 2026-10-27: iptal 90 sn sürüyordu,
  // sebep buydu.
  if (cheapest && runnerUp && !iptalMi()) {
    try {
      nedenDahaUcuz = await Promise.race([
        explainCheapest(cheapest, runnerUp, srcProduct),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
      ]);
    } catch {}
  }

  const totalRequests = allResults.reduce((s, r) => s + (r.requestsSpent || 0), 0);

  // Satış ortaklığı ayarları TEK KEZ okunur (2026-10-28): sonuç başına DB sorgusu
  // yapılmasın. Yalnızca dışa giden adres süslenir; fiyat/sıralama dokunulmaz.
  const afiliyeAyar = afiliyeAyarlari();

  const sonuc = {
    kaynak: {
      site: adapter.id,
      siteName: adapter.name,
      url: sourceUrl,
      afiliyeUrl: afiliyeLink(adapter.id, sourceUrl, afiliyeAyar),
      urun: srcProduct.title,
      marka: srcProduct.brand,
      modelKodu: srcProduct.modelCode,
      barkod: srcProduct.barcode,
      renk: srcProduct.color,
      fiyat: srcProduct.pricing?.toplam ?? srcProduct.sellingPrice,
      resim: srcProduct.image,
      aramaSorgulari: queries,
    },
    sonuclar: siraliResults.map(r => ({
      site: r.site,
      siteName: r.siteName,
      status: r.status,
      reason: r.reason,
      matchBasis: r.matchBasis,
      renkAyni: r.renkAyni,
      enUcuz: !!r.enUcuz,
      // 🖨️ 3D Baskı Uzmanlık Modülü (2026-10-30): çap + hammadde + karta taşınan
      // birim maliyet verisi. 3D dışı ürünlerde null (kartta widget gösterilmez).
      baski: r.product ? baskiKartiBilgisi({
        ...r.product,
        birim: birimFiyat(r.product),
      }) : null,
      // Filtreleme etiketleri (Kargo Bedava, Resmi Satıcı, Vade Farksız Taksit)
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
      requestsSpent: r.requestsSpent,
      queriesTried: r.queriesTried,
      incelenen: r.examined,
      // Sahte indirim radarı: bu mağazanın üstü çizili etiketi piyasa
      // ortalamasının %20 üzerindeyse arayüz sarı uyarı basar (2026-10-30).
      sisirilmisEtiket: !!r.sisirilmisEtiket,
      etiketOrani: r.etiketOrani ?? null,
      product: r.product ? {
        url: r.product.url,
        // Yalnızca "Ürüne git" bağlantısında kullanılır; `url` temiz kalır
        // (önbellek/eşleştirme/yeniden tarama adresiyle birebir aynı olmalı).
        afiliyeUrl: afiliyeLink(r.site, r.product.url, afiliyeAyar),
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
        // 🧾 KDV şeffaflığı (2026-10-31): direnc.net gibi KDV hariç yayımlayan
        // mağazalarda gösterilen fiyat KDV DAHİL tutardır.
        vatIncluded: r.product.vatIncluded ?? null,
        vatRate: r.product.vatRate ?? null,
        priceExVat: r.product.priceExVat ?? null,
        // Birim fiyat (₺/kg, ₺/L) — 2026-10-29. Miktar okunamazsa null'lar döner;
        // uydurma yok. Sıralamayı DEĞİŞTİRMEZ, ayrı bir görünüm sunar.
        birim: birimFiyat(r.product),
        // 🧵 Filament/reçine birim fiyat rozeti (2026-11-01): yalnızca filament ve
        // reçinede dolu; yazıcı/aksesuarda null.
        birimHesap: birimFiyatHesapla(
          r.product.title,
          r.product.pricing?.toplam ?? r.product.sellingPrice,
        ),
      } : null,
    })),
    ozet: {
      toplamSureMs: Date.now() - startedAt,
      harcananIstek: totalRequests,
      bulunanSiteSayisi: stok.bulunanSiteSayisi,
      stoktaVarSayisi: stok.stoktaVarSayisi,
      stoktaYokSayisi: stok.stoktaYokSayisi,
      tamamiTukendi: stok.tamamiTukendi,
      ayniRenkSayisi: eligible.length,
      enUcuzSite: cheapest ? cheapest.siteName : null,
      enUcuzFiyat: cheapest ? cheapest.product.pricing.toplam : null,
      nedenDahaUcuz,
      // ---- SAHTE İNDİRİM & DİP FİYAT RADARI (2026-10-30) ----
      // Fiyat geçmişi varsa karar raporu; yoksa `tavsiye:'veri_yok'` (uydurma yok).
      fiyatZekasi: fiyatZekasi || null,
      fiyatAnalizi: fiyatAnalizi || null,
      // Birim fiyat görünümü (2026-10-29): farklı gramajlı ürünler arasında
      // "sahte ucuz" tuzağını gösterir. Sıralamayı DEĞİŞTİRMEZ.
      birimFiyat: (() => {
        try {
          const liste = allResults
            .filter(r => r.status === 'found' && r.product)
            .map(r => ({
              site: r.site,
              siteName: r.siteName,
              title: r.product.title,
              sellingPrice: r.product.sellingPrice,
              pricing: r.product.pricing,
              renkAyni: r.renkAyni !== false,
            }));
          const b = birimSirala(liste, {
            // Referans: kaynak ürünün gramajı (kullanıcının baktığı ürün)
            referansGram: birimFiyat({ title: srcProduct.title }).gram,
          });
          return {
            referansGram: b.referansGram,
            enIyiKg: b.enIyiKg ? {
              site: b.enIyiKg.site,
              siteName: b.enIyiKg.siteName,
              tlKg: b.enIyiKg.birim.tlKg,
              gram: b.enIyiKg.birim.gram,
              fiyat: b.enIyiKg.birim.fiyat,
              tahmini: b.enIyiKg.birim.tlKgTahmini,
            } : null,
            enIyiL: b.enIyiL ? {
              site: b.enIyiL.site,
              siteName: b.enIyiL.siteName,
              tlL: b.enIyiL.birim.tlL,
              ml: b.enIyiL.birim.ml,
              fiyat: b.enIyiL.birim.fiyat,
            } : null,
            tuzaklar: b.tuzaklar,
            okunamayan: b.okunamayan,
            toplam: b.toplam,
          };
        } catch {
          return null;
        }
      })(),
      // Kullanıcı iptal ettiyse hangi sitelerin taranamadığı görünsün
      iptalEdildi: iptalMi(),
      taranmayanSiteSayisi: allResults.filter(r => r.status === 'iptal').length,
    },
  };

  // ---- 🖨️ 3D Baskı Uzmanlık Modülü özeti (2026-10-30) ----
  // Medyan ₺/kg üzerinden "Yüksek Birim Maliyet" işareti ve filtre sayaçları.
  try {
    const medyanKg = sonuc.ozet?.birimFiyat?.medyanKg ?? null;
    for (const r of sonuc.sonuclar) {
      if (r?.product?.birim) {
        r.birimUyari = yuksekBirimMaliyet(r.product.birim, medyanKg);
      }
    }
    sonuc.ozet.baskiOzet = {
      ...baskiOzeti(sonuc.sonuclar),
      yuksekBirimSayisi: sonuc.sonuclar.filter(r => r.birimUyari).length,
    };
  } catch { /* 3D özeti başarısız olsa da ana sonuç döner */ }

  return sonuc;
}

/**
 * Fiyat alarmı kontrolü için: kayıtlı ürün URL'lerini tazeler ve fiyatları döndürür.
 * Kurallar:
 *  - İstekler önbelleği bypas eder (fresh) — güncel fiyat için.
 *  - Hata olursa bir kez tekrar denenir; yine olmazsa o site "kontrol edilemedi" işaretlenir.
 *  - Asla tahmini fiyat üretilmez; hatalı sitelerde son bilinen fiyat tarihineyle korunur.
 * @param {Array<{site:string, url:string}>} items
 * @param {{fresh?: boolean}} opts
 */
export async function refreshPrices(items, opts = {}) {
  const fresh = opts.fresh !== false;
  const { adapterById } = await import('./sites/index.js');
  const out = [];
  await Promise.all(items.map(async (item) => {
    const adapter = adapterById(item.site);
    if (!adapter) return;
    const ctx = { spend: 0 };
    let product = null;
    let hata = null;
    // İlk deneme + bir kez tekrar
    for (let deneme = 0; deneme < 2 && !product; deneme++) {
      try {
        product = await adapter.getProduct(item.url, ctx, { fresh });
      } catch (e) {
        hata = String(e.message || e).slice(0, 200);
      }
    }
    if (!product) {
      out.push({ site: item.site, siteName: adapter.name, url: item.url, product: null, pricing: null, requestsSpent: ctx.spend, hata: hata || 'kontrol edilemedi' });
      return;
    }
    let pricing = null;
    try {
      await classifyAndPrice(product, adapter.name);
      pricing = product.pricing;
    } catch (e) {
      hata = 'fiyat hesaplanamadı: ' + String(e.message || e).slice(0, 120);
    }
    out.push({ site: item.site, siteName: adapter.name, url: item.url, product, pricing, requestsSpent: ctx.spend, hata });
  }));
  return out;
}

