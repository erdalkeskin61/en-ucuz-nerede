/**
 * ⚡ Hızlı Kaynak Ürün Arama Modñlü (2026-11-01)
 *
 * Amaç: Kullanıcı bir link yerine doğrudan ürün adı yazdığında örn: "eSun PLA+",
 * "iPhone 15", "Bambu Lab P1S"), en uygun kaynak ürün URL'sini 1-3 saniyede bulup
 * tek bir tam karş�laştırma akışına yönlendirmek.
 */
import { adapterById } from './sites/index.js';
import { katalogUrunleriAra } from './katalogSync.js';
import {
  titleSimilarity, modelSerisiCakismasi, hatCakismasi, kapasiteCakismasi,
  extractColors, brandAyni, toLowerTr,
} from './util.js';

// Bellek içi hızlı önbellek (aynı arama tekrarlanırsa 0 ms)
const KAYNAK_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

const _3D_KELIMELER = /\b(filament|pla|petg|abs|tpu|asa|pc|pa|cf|reçine|recine|resin|ender|bambu|creality|elegoo|anycubic|prusa|esun|sunlu|porima|microzey|kobra|neptune|k1|k1c|p1s|p1p|a1|x1c|hyper|silk|nozzle|hotend|extruder|tabla|pei|3d|yazıcı|yazici|baskı|baski)\b/i;

export function dogalDilTavsiyeMi(metin) {
  if (!metin || typeof metin !== 'string') return false;
  const s = metin.trim().toLocaleLowerCase('tr-TR');
  if (!s) return false;

  // 1) Açık tavsiye/bütçe/karar kalıpları → danışman
  const tavsiyeKelimeleri = /\b(bütçe|bütçem|bütçeli|bütçesi|öneri|önerir|öner|tavsiye|tavsiyesi|almak istiyorum|almalıyım|alsam|hangi|hangisi|hangisini|en iyi|ne alabilirim|ne alsam|kararsızım|fikir ver|daha iyi|mi daha|karşılaştırır mısın)\b/i;
  if (tavsiyeKelimeleri.test(s)) return true;

  // 2) Net ürün/model işareti varsa (marka/model/3D terimi + sayısal ölçü)
  //    uzunluk ne olursa olsun DANIŞMAN DEĞİL. Bu kontrol, "eSun PLA+ Filament
  //    Siyah 1kg 1.75mm yüksek hızlı" (9 kelime) gibi uzun ürün adlarının
  //    yanlışlıkla danışmana gitmesini engeller (2026-11-13).
  const urunIsareti = /\b(filament|pla|petg|abs|asa|tpu|reçine|recine|resin|nozzle|hotend|extruder|kurutucu|dryer|ender|bambu|creality|elegoo|anycubic|prusa|esun|sunlu|porima|microzey|kobra|neptune|k1|p1s|a1|3d|yazıcı|yazici)\b/i;
  const olcu = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|mm|cm|ml|l|w|°c)\b/i;
  if (urunIsareti.test(s) || olcu.test(s)) {
    // Soru işareti + tavsiye bağlamı yoksa ürün aramasıdır.
    return false;
  }

  // 3) Uzun, yapılandırılmamış cümle → danışman
  const kelimeler = s.split(/\s+/).filter(Boolean);
  if (s.includes('?') && kelimeler.length >= 4) return true;
  if (kelimeler.length >= 9) return true;
  return false;
}

const AKSESUAR_REGEX = /\b(silikon\s*çorap|silikon\s*corap|çorap|corap|termistör|termistor|ısıtıcı\s*blok|isitici\s*blok|ısıtıcı|isitici|hotend|nozzle|nozül|nozul|tabla|pei|yay\s*çeliği|kayış|kayis|kasnak|step\s*motor|anakart|bltouch|sensör|sensor|prob|probe|fan|yedek\s*parça|yedek\s*parca|kablo|adaptör|adaptor)\b/i;

/**
 * Tire normalizasyonu (2026-11-10).
 *
 * Ölçülen sorun: "Anycubic Kobra 2 Neo" sorgusu ile ilan başlığındaki
 * "Kobra-2 Neo" eşleşmiyordu — kelime örtüşmesi düşük kalıyor, doğru yazıcı
 * eleniyordu. Aynı şekilde "Ender-3 V3 KE" ↔ "Ender 3 V3 KE".
 *
 * Kural: tire/uzun tire/en-dash ve alt çizgi boşluğa çevrilir; ardından
 * ardışık boşluklar tekleştirilir. Böylece "kobra-2" ≡ "kobra 2".
 *
 * NOT: `+` KORUNUR (PLA+ ile PLA farklı üründür); yalnızca ayırıcılar normalize
 * edilir. Marka/model kimliği bozulmaz.
 */
export function tireNormalize(metin) {
  return String(metin ?? '')
    .replace(/[-–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sorguPuanla(urunBaslik, sorgu) {
  if (!urunBaslik || !sorgu) return 0;
  // Tire normalizasyonu (2026-11-10): "Kobra-2" ≡ "Kobra 2", "Ender-3" ≡ "Ender 3".
  // Kimlik denetimleri (modelSerisiCakismasi vb.) ham metinle çalışır; yalnızca
  // KELİME ÖRTÜŞMESİ normalleştirilmiş metin üzerinden hesaplanır.
  const b = tireNormalize(String(urunBaslik).toLocaleLowerCase('tr-TR'));
  const s = tireNormalize(String(sorgu).toLocaleLowerCase('tr-TR'));

  // Sorguda aksesuar/parça aranmıyorsa, adayda aksesuar geçiyorsa ASLA ana ürün sayılamaz!
  if (!AKSESUAR_REGEX.test(s) && AKSESUAR_REGEX.test(b)) {
    return 0;
  }

  // MODEL SERİSİ ÇAKIŞMASI → aday bu sorgunun ürünü DEĞİLDİR (2026-11-04).
  // Ölçülen hata: "Anycubic Kobra 2 Neo 3D Yazıcı" sorgusunda "Anycubic Kobra X"
  // ilanı en yüksek puanı alıp kaynak seçildi; ardından radar "Kobra 2 Neo"
  // yerine bu yanlış kaynağa göre eşleşen "Kobra 4"ü en ucuz gösterdi.
  // Kelime örtüşmesi (anycubic/kobra/3d/yazıcı) burada yanıltıcıydı.
  if (modelSerisiCakismasi(urunBaslik, sorgu)) return 0;
  // ÜRÜN HATTI / MALZEME (2026-11-04): "eSun PLA+ Beyaz" sorgusunda kaynak
  // "eSun Hyper PLA" seçiliyordu; "Sunlu PLA+ Filament 1kg" sorgusunda ise
  // "Sunlu Silk PLA+" — ikisi de farklı ürün, fiyatları kıyaslanamaz.
  if (hatCakismasi(urunBaslik, sorgu)) return 0;
  // KAPASİTE (8GB ↔ 16GB gibi) farklı üründür.
  if (kapasiteCakismasi(urunBaslik, sorgu)) return 0;

  const kelimeler = s.split(/\s+/).filter(w => w.length >= 2);
  if (!kelimeler.length) return 0;
  
  let eslesenKelime = 0;
  for (const k of kelimeler) {
    if (b.includes(k)) eslesenKelime++;
  }
  const kelimeOrani = eslesenKelime / kelimeler.length;
  const benzerlik = titleSimilarity(urunBaslik, sorgu);
  
  // Tüm kelimeler geçiyorsa büyük bonus
  const tamKelimeBonusu = kelimeOrani === 1 ? 0.3 : 0;
  return (kelimeOrani * 0.5) + (benzerlik * 0.2) + tamKelimeBonusu;
}

/**
 * Kaynak adayı gerçekten sorgudaki ürün mü? (2026-11-04)
 *
 * `sorguPuanla` kelime örtüşmesine bakar; MARKA ve RENK farkını göremez.
 * Ölçülen hata: "Sunlu PLA+ Filament 1kg" sorgusunda **"Solid Hyper PLA+
 * Nane Yeşili"** (farklı marka + farklı renk) kaynak seçildi ve borsada
 * Sunlu ürünü gibi ₺674'e gösterildi.
 *
 * Neden tam `matchProducts` değil? Katalog adları kısaltılmış olabiliyor
 * ("Microzey PLA Filament Gri" ↔ gerçek "Microzey PLA Pro Max …"); tam
 * eşleştirici bunları varyant farkı sayıp eliyor ve meşru ürün kayboluyordu.
 * Bu yüzden yalnızca iki güçlü sinyal uygulanır: MARKA ve RENK.
 */
const MARKA_GENEL = new Set([
  'filament', 'yazici', 'yazıcı', 'printer', 'baski', 'baskı', 'set', 'paket',
  'adet', 'combo', 'model', 'seri', 'renk', 'pla', 'petg', 'abs', 'tpu', 'asa',
  'pa', 'pc', 'resin', 'reçine', 'recine', '3d', 'yeni', 'orijinal', 'original',
]);

function katla(s) {
  return toLowerTr(String(s || ''))
    .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');
}

/** Sorgudaki ilk anlamlı kelimeyi "muhtemel marka" sayar. */
function muhtemelMarka(sorgu) {
  const kelimeler = katla(sorgu).replace(/[^a-z0-9\s+]/g, ' ').split(/\s+/).filter(Boolean);
  for (const w of kelimeler) {
    if (w.length < 3) continue;
    if (/^\d/.test(w)) continue;
    if (MARKA_GENEL.has(w)) continue;
    if (extractColors(w).length) continue;
    return w;
  }
  return null;
}

/** Katalogda "yazıcı" olarak aranan bir sorgu mu? (yedek parça filtresi için) */
export function yaziciSorgusuMu(sorgu) {
  const s = tireNormalize(String(sorgu || '')).toLocaleLowerCase('tr-TR');
  return /\b(yazıcı|yazici|printer|3d\s*printer)\b/.test(s)
    || /\b(ender|kobra|neptune|k1c|k1\s*max|p1s|a1\s*mini|x1c|k1)\b/.test(s);
}

/**
 * Adayın yedek parça/aksesuar olup olmadığını söyler.
 * Sorgu bir YAZICI ise, aksesuar kelimesi geçen aday ASLA kaynak olamaz
 * (2026-11-10: "Anycubic Kobra 2 Neo" aramasında ₺187'lik silikon çorap
 * dönüyordu; sıkı filtre bunu eliyor ve geriye ürün kalmıyordu).
 */
export function aksesuarAdayMi(sorgu, adayBaslik) {
  const baslik = String(adayBaslik || '');
  if (!baslik) return false;
  // Kullanıcı zaten parça arıyorsa parça sonucu geçerlidir.
  if (AKSESUAR_REGEX.test(String(sorgu || ''))) return false;
  // Sorgu ana ürün (yazıcı/filament) ise, başlığında parça geçen aday elenir.
  return AKSESUAR_REGEX.test(baslik);
}

export function kaynakEslesirMi(sorgu, aday) {
  const baslik = String(aday?.title || '');
  if (!baslik) return false;

  // 0) YEDEK PARÇA KORUMASI (2026-11-10): yazıcı ararken aksesuar seçilmez.
  if (aksesuarAdayMi(sorgu, baslik)) return false;

  // 1) RENK: iki tarafta da bilinen renk varsa ve kesişmiyorsa farklı ürün.
  const qRenk = extractColors(sorgu);
  const cRenk = extractColors(baslik);
  if (qRenk.length && cRenk.length) {
    const ortak = qRenk.some(r => cRenk.includes(r));
    if (!ortak) return false;
  }

  // 2) MARKA: adayın marka alanı sorgunun markasıyla çelişiyorsa farklı ürün.
  //    İstisna: sorgunun markası aday başlığında geçiyorsa (satıcı adı marka
  //    alanına yazılmış olabilir) veya markalar birbirini kapsıyorsa kabul.
  const qb = muhtemelMarka(sorgu);
  const cb = aday?.brand ? String(aday.brand) : null;
  if (qb && cb && !brandAyni(qb, cb)) {
    const qf = katla(qb);
    const cf = katla(cb);
    const bas = katla(baslik);
    const kanit = bas.includes(qf) || qf.includes(cf) || cf.includes(qf);
    if (!kanit) return false;
  }

  return true;
}

/**
 * KADEMELİ SORGU ÜRETİCİ (2026-11-05)
 *
 * PROBLEM: radar kataloğundaki "eSun ePLA-HS (High Speed) PLA Siyah 1kg" gibi
 * niş ürünlerde mağaza arama motorları 0 sonuç döndürüyordu. Ürün mağazalarda
 * "eSun ePLA HS Siyah", "Esun Pla-hs Yüksek Hızlı Siyah" gibi FARKLI yazımlarla
 * duruyor. Tek sorguyla arama yapmak bu ürünleri kaybediyordu.
 *
 * Çözüm: en özelden en gene doğru esnetilmiş sorgu kademeleri üretilir. Çağıran
 * taraf sırayla dener ve İLK BAŞARILI kademede durur (fazladan ağ isteği yok).
 *
 * Örnek — "eSun ePLA-HS (High Speed) PLA Siyah 1kg":
 *   0) "eSun ePLA-HS (High Speed) PLA Siyah 1kg"   orijinal
 *   1) "eSun ePLA-HS PLA Siyah 1kg"                parantez içi atıldı
 *   2) "eSun ePLA HS PLA Siyah"                    tire→boşluk, ölçü atıldı
 *   3) "eSun ePLA HS Siyah"                        gereksiz "PLA" atıldı (ePLA içinde)
 *   4) "eSun ePLA-HS Siyah"                        tire korunmuş çekirdek
 *
 * VARYANT KORUMASI: renk (Siyah ↔ Beyaz) ve malzeme (PLA ↔ PETG/ABS) ASLA
 * esnetilmez — bunlar farklı üründür. Yalnızca yazım/ölçü/gürültü esnetilir.
 *
 * @param {string} sorgu
 * @returns {string[]} tekilleştirilmiş kademeler (en fazla 5)
 */
export function sorguKademeleriUret(sorgu) {
  const orijinal = String(sorgu || '').replace(/\s+/g, ' ').trim();
  if (orijinal.length < 2) return [];

  const kademeler = [];
  const ekle = (x) => {
    const t = String(x || '').replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && !kademeler.some(k => k.toLowerCase() === t.toLowerCase())) {
      kademeler.push(t);
    }
  };

  // 0) Orijinal — hiç bozulmadan
  ekle(orijinal);

  // 1) Parantez içi açıklamalar atılır: "(High Speed)"
  const parantezsiz = orijinal.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  ekle(parantezsiz);

  // 2) Tire → boşluk, ölçü/gürültü (1kg, 1.75mm, ml) atılır
  const tiresiz = parantezsiz
    .replace(/([A-Za-z0-9])[-–—]([A-Za-z0-9])/g, '$1 $2')
    .replace(/\b\d+[.,]?\d*\s*(kg|kgs|gr|g|mm|cm|mt|ml|lt|l)\b/gi, ' ')
    .replace(/\b(yüksek|yuksek|high)\s+(hızlı|hizli|speed)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  ekle(tiresiz);

  // 3) Gereksiz malzeme kelimesi atılır: "ePLA" varken ayrıca "PLA" yazmak gürültü.
  //    ("ePLA HS PLA Siyah" → "ePLA HS Siyah") — arama motoru için daha temiz.
  const MALZEME = ['pla', 'petg', 'abs', 'tpu', 'asa', 'pc', 'pa'];
  const kelimeler = tiresiz.split(' ').filter(Boolean);
  const malzemeVar = kelimeler.filter(w => MALZEME.includes(w.toLowerCase()));
  let cekirdek = tiresiz;
  if (malzemeVar.length) {
    const kalan = kelimeler.filter((w) => {
      if (!MALZEME.includes(w.toLowerCase())) return true;
      // Başka bir token bu malzeme adını içeriyorsa (ePLA ⊃ PLA) at.
      return !kelimeler.some(o => o !== w && o.toLowerCase().includes(w.toLowerCase()));
    });
    cekirdek = kalan.join(' ');
    ekle(cekirdek);
  }

  // 4) Tire korunmuş çekirdek: "eSun ePLA-HS Siyah"
  //    Çekirdekte modelin TİRESİZ hâli ("ePLA HS") varsa, onu tireli biçimle
  //    DEĞİŞTİR — yanına eklemek "ePLA-HS ePLA HS" gibi bozuk sorgu üretiyordu.
  const tireliModel = orijinal.match(/\b[A-Za-z]+[-–—][A-Za-z0-9]+\b/);
  if (tireliModel) {
    const model = tireliModel[0];
    const modelTiresiz = model.replace(/[-–—]/g, ' ');
    const taban = cekirdek || tiresiz;
    // Tiresiz biçimi tireliyle değiştir (yanına eklemek sorguyu bozuyordu:
    // "ePLA-HS ePLA HS Siyah"). Kelime çifti eşleşirse tireli model yazılır.
    const modelTiresizKucuk = modelTiresiz.toLowerCase();
    const parcalar = taban.split(' ').filter(Boolean);
    let degisti = false;
    for (let i = 0; i < parcalar.length - 1; i++) {
      if ((parcalar[i] + ' ' + parcalar[i + 1]).toLowerCase() === modelTiresizKucuk) {
        parcalar.splice(i, 2, model);
        degisti = true;
        break;
      }
    }
    if (degisti) {
      ekle(parcalar.join(' '));
    } else if (!taban.toLowerCase().includes(model.toLowerCase())) {
      const govde = taban.split(' ').filter(Boolean);
      if (govde[0]) ekle([govde[0], model, ...govde.slice(1)].join(' '));
    }
  }

  return kademeler.slice(0, 5);
}

/**
 * 🗂️ KATMAN 0 — Yerel katalog indeksinden kaynak aday (2026-11-17).
 *
 * Mağazaların kendi beslemelerinden (Shopify products.json, sitemap, XML)
 * toplanan `katalog_urunleri` tablosuna bakar. Kayıt TAZEyse dış mağazaya
 * HİÇ HTTP/Chromium isteği atmadan kaynak URL döner.
 *
 * Dürüstlük:
 *  - Yalnızca GFresh (TTL içindeki) kayıtlar kullanılır.
 *  - Ürün kimliği `kaynakEslesirMi()` + `sorguPuanla()` ile doğrulanır;
 *    eşleşme yoksa `null` döner (yanlış kaynak seçilmez).
 *  - Fiyat beslemede yoksa `price: null` kalır; uydurulmaz.
 *  - `guncellemeTs`/`katalogYasMs` çağırana taşınır → arayüz tarama zamanını
 *    açıkça yazabilir.
 *
 * @param {string} sorgu
 * @param {{ttlMs?:number}} [opts]
 */
/**
 * Veri merkezi IP'lerinde (Azure/AWS/Oracle) getProduct sayfası sık 403/WAF
 * engeline takılan mağazalar. Ürün adı aramasında kaynak seçerken açık 3D/teknoloji
 * mağazaları her zaman bunların ÖNÜNE alınır (yine de karşılaştırmada taranırlar).
 */
export const KIRILGAN_KAYNAK_SITELER = new Set([
  'trendyol', 'amazon', 'n11', 'hepsiburada', 'ciceksepeti',
  'teknosa', 'pttavm', 'vatan', 'mediamarkt', 'itopya',
]);

function kaynakOncelikSirala(liste) {
  return [...liste].sort((a, b) => {
    const aKirilgan = KIRILGAN_KAYNAK_SITELER.has(a.siteId) ? 1 : 0;
    const bKirilgan = KIRILGAN_KAYNAK_SITELER.has(b.siteId) ? 1 : 0;
    if (aKirilgan !== bKirilgan) return aKirilgan - bKirilgan;
    // Stokta olduğu bilinen adaylar stokta olmayanların önüne geçer
    const aStokDisi = (a.stokta === 0 || a.stokta === false) ? 1 : 0;
    const bStokDisi = (b.stokta === 0 || b.stokta === false) ? 1 : 0;
    if (aStokDisi !== bStokDisi) return aStokDisi - bStokDisi;
    const puanFark = (b.puan || 0) - (a.puan || 0);
    if (Math.abs(puanFark) > 1e-6) return puanFark;
    const af = a.fiyat != null ? 0 : (a.price != null ? 0 : 1);
    const bf = b.fiyat != null ? 0 : (b.price != null ? 0 : 1);
    if (af !== bf) return af - bf;
    return (a.fiyat ?? a.price ?? Infinity) - (b.fiyat ?? b.price ?? Infinity);
  });
}

function benzersizSiteAdaylari(siraliListe, max = 5) {
  const goruldu = new Set();
  const out = [];
  for (const x of siraliListe) {
    if (!x || !x.url) continue;
    const anahtar = x.siteId || x.url;
    if (goruldu.has(anahtar)) continue;
    goruldu.add(anahtar);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

export function katalogdanKaynakAdayi(sorgu, opts = {}) {
  const temiz = String(sorgu || '').trim();
  if (temiz.length < 2) return null;

  let adaylar = [];
  try {
    adaylar = katalogUrunleriAra(temiz, { limit: 15, ttlMs: opts.ttlMs });
  } catch {
    return null;
  }
  if (!Array.isArray(adaylar) || !adaylar.length) return null;

  const puanli = adaylar
    .map(a => ({ ...a, url: a.urunUrl, puan: sorguPuanla(a.baslik, temiz) + (a.fiyat != null ? 0.03 : 0) }))
    .filter(a => a.puan >= 0.35);

  const eslesenler = kaynakOncelikSirala(
    puanli.filter(a => kaynakEslesirMi(temiz, {
      title: a.baslik, brand: a.marka, url: a.urunUrl,
    }))
  );
  const benzersiz = benzersizSiteAdaylari(eslesenler, 5);
  const secilen = benzersiz[0];
  if (!secilen) return null;

  const cevir = (x) => {
    const adapter = adapterById(x.siteId);
    return {
      url: x.urunUrl,
      title: x.baslik,
      price: x.fiyat ?? null,
      brand: x.marka ?? null,
      siteId: x.siteId,
      siteName: adapter?.name || x.siteId,
      stokta: x.stokta,
      gorselUrl: x.gorselUrl || null,
      paraBirimi: x.paraBirimi || null,
      // 🗂️ Katalogdan geldiğini AÇIKÇA işaretle (uydurma "canlı tarama" görüntüsü yok).
      kaynak: 'katalog',
      kaynakTur: x.kaynakTur || null,
      guncellemeTs: x.guncellemeTs || null,
      katalogYasMs: x.yasMs ?? null,
      aramaKademesi: 0,
      aramaSorgusu: temiz,
    };
  };

  return {
    ...cevir(secilen),
    yedekAdaylar: benzersiz.slice(1).map(cevir),
  };
}

export async function hizliKaynakUrunBul(sorgu, { timeoutMs = 6500, signal: disSinyal = null, katalogTtlMs = undefined } = {}) {
  const temizSorgu = String(sorgu || '').trim();
  if (!temizSorgu || temizSorgu.length < 2) return null;

  const key = temizSorgu.toLocaleLowerCase('tr-TR');
  const cached = KAYNAK_CACHE.get(key);
  if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
    return cached.urun;
  }

  // 🗂️ KATMAN 0: yerel katalog indeksi — ağ isteği yok, milisaniyeler sürer.
  const katalogAdayi = katalogdanKaynakAdayi(temizSorgu, { ttlMs: katalogTtlMs });
  if (katalogAdayi) {
    KAYNAK_CACHE.set(key, { ts: Date.now(), urun: katalogAdayi });
    console.log('[urunArama] kaynak katalog indeksinden bulundu (ağ isteği yok): "'
      + katalogAdayi.title.slice(0, 60) + '"');
    return katalogAdayi;
  }

  // Dış iptal: çağıran (job worker) iptal ederse tarama durur.
  const iptal = disSinyal || new AbortController().signal;

  // 3D kategorisinde n11 de taranır (2026-11-05): eSun ePLA-HS gibi niş
  // filamentler yalnız n11'de stokta olabiliyor.
  const is3D = _3D_KELIMELER.test(temizSorgu);
  const hedefSiteler = is3D
    ? ['porima3d', 'robotistan', 'filamentdepom', '3dortgen', 'filamentsan', 'kirpilab', 'efilament', 'makerpazar', '3dmarketim', 'samm', 'filamentmarketim', 'domirobot', 'robolinkmarket', 'hepsiburada', 'trendyol', 'n11']
    : ['robotistan', 'samm', 'direnc', 'hepsiburada', 'vatan', 'mediamarkt', 'trendyol', 'amazon', 'n11'];

  // 🛑 2026-11-14: AbortController yayılımı. Zaman aşımında promise'i yalnızca
  // reddetmek yetmiyordu — altındaki fetch/tarayıcı isteği arka planda çalışmaya
  // devam ediyordu (zombi istek birikmesi). Artık sinyal adaptöre iletilir.
  const sureli = (promise, ms, signal = null) => new Promise((resolve, reject) => {
    let bitti = false;
    const bitir = (fn, arg) => { if (bitti) return; bitti = true; clearTimeout(t); fn(arg); };
    const t = setTimeout(() => bitir(reject, new Error('zaman aşımı')), ms);
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => bitir(reject, new Error('iptal edildi')), { once: true });
    }
    promise.then(v => bitir(resolve, v), e => bitir(reject, e));
  });

  /**
   * Tek bir sorguyla hedef siteleri tarar ve en iyi adayı döndürür.
   * Bulunamazsa `null` (çağıran bir sonraki kademeyi dener).
   */
  const tekSorguAra = async (aramaSorgusu) => {
    const istekler = hedefSiteler.map(async (siteId) => {
      try {
        const adapter = adapterById(siteId);
        if (!adapter || typeof adapter.searchProducts !== 'function') return [];
        const sonuclar = await sureli(
          adapter.searchProducts(aramaSorgusu, { spend: 0, signal: iptal }),
          timeoutMs,
          iptal,
        );
        return (sonuclar || []).map(u => ({ ...u, siteId, siteName: adapter.name }));
      } catch {
        return [];
      }
    });

    const gruplar = await Promise.allSettled(istekler);
    const tumAdaylar = [];
    for (const g of gruplar) {
      if (g.status === 'fulfilled' && Array.isArray(g.value)) {
        tumAdaylar.push(...g.value);
      }
    }
    if (!tumAdaylar.length) return null;

    // Adayları puanla
    // NOT (2026-11-03): fiyat ZORUNLU DEĞİL. İkas mağazaları fiyatı mağaza para
    // biriminde (ör. USD) döndürebiliyor; adaptör o durumda price:null verir ve TL
    // sanılmaz. Kaynak URL seçimi BAŞLIK puanına dayanır, fiyata değil.
    const puanli = tumAdaylar
      .filter(a => a && a.url && a.title && (a.price == null || Number(a.price) > 0))
      .map(a => ({
        ...a,
        puan: sorguPuanla(a.title, aramaSorgusu),
      }))
      .filter(a => a.puan >= 0.35);

    // Sıralamadan sonra ÜRÜN KİMLİĞİ doğrulaması: açık mağazalar (non-WAF)
    // her zaman kırılgan pazaryerlerinin (Trendyol/Amazon/HB) önüne alınır.
    // İlk kaynak okunamazsa (403) yedek adaylar sırayla denenebilir.
    const eslesenler = kaynakOncelikSirala(
      puanli.filter(a => kaynakEslesirMi(aramaSorgusu, a))
    );
    const benzersiz = benzersizSiteAdaylari(eslesenler, 5);
    if (!benzersiz.length) return null;
    return {
      ...benzersiz[0],
      yedekAdaylar: benzersiz.slice(1),
    };
  };

  // KADEMELİ ARAMA (2026-11-05): ilk kademede bulunursa DUR (fazladan istek yok).
  const kademeler = sorguKademeleriUret(temizSorgu);
  for (let i = 0; i < kademeler.length; i++) {
    const sonuc = await tekSorguAra(kademeler[i]);
    if (sonuc) {
      const enIyi = { ...sonuc, aramaKademesi: i, aramaSorgusu: kademeler[i] };
      // Önbellek: orijinal sorgu anahtarıyla saklanır (aynı ürün için tekrar arama yok).
      KAYNAK_CACHE.set(key, { ts: Date.now(), urun: enIyi });
      if (i > 0) {
        console.log('[urunArama] kaynak kademeli aramayla bulundu'
          + ' (kademe ' + (i + 1) + '/' + kademeler.length + '): "' + kademeler[i] + '"');
      }
      return enIyi;
    }
  }

  return null;
}
