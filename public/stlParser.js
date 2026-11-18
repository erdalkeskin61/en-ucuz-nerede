/**
 * 📐 STL / 3MF Model Ayrıştırıcı — saf JavaScript (2026-11-06)
 *
 * AMAÇ: Kullanıcı 3D model dosyasını (.stl / .3mf) tarayıcıya sürükleyip
 * bıraktığında hacmi ve boyutları **sunucuya hiçbir şey göndermeden** hesaplar.
 * Sıfır ağ trafiği, sıfır sunucu maliyeti, %100 gizlilik.
 *
 * HARİCİ BAĞIMLILIK YOK: ne three.js ne başka bir kütüphane. Yalnızca
 * ArrayBuffer / DataView / TextDecoder.
 *
 * HACİM MATEMATİĞİ (işaretli dörtyüzlü integrali):
 *   Her üçgen (v1, v2, v3) için köşe noktasına göre işaretli dörtyüzlü hacmi
 *   toplanır; kapalı (manifold) bir yüzeyde toplam, modelin gerçek hacmini verir.
 *
 *   V_i = 1/6 · det([v1, v2, v3])
 *
 *   Kapalı yüzeyde iç yüzler birbirini götürür, sonuç orijin seçiminden
 *   BAĞIMSIZDIR (test: merkezlenmiş küp de 8000 mm³ verir).
 *
 * DÜRÜSTLÜK: bozuk/eksik dosyada uydurma hacim ÜRETİLMEZ; açık hata döner.
 */

/** Malzeme yoğunlukları (g/cm³) — üretici nominal değerleri. */
export const MALZEME_YOGUNLUK = Object.freeze({
  PLA: 1.24,
  'PLA+': 1.24,
  PETG: 1.27,
  ABS: 1.04,
  TPU: 1.21,
  ASA: 1.07,
  PC: 1.20,
  NAYLON: 1.14,
});

/** Kabuk (duvar/perimeter) oranı: 2–3 duvar kalınlığında hacmin ~%18'i katıdır. */
export const KABUK_ORANI = 0.18;

/** Desteklenen doluluk seçenekleri (%). */
export const DOLULUK_SECENEKLERI = Object.freeze([10, 20, 40, 100]);

/** İstemcide kabul edilen en büyük dosya (100 MB) — tamamı bellekte işlenir. */
export const MAKS_DOSYA_BAYT = 100 * 1024 * 1024;

const GECERLI_UZANTI = /\.(stl|3mf)$/i;

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/** Uzantıya göre tür tahmini (magic byte kontrolü sonra yapılır). */
export function dosyaTuru(ad) {
  const s = String(ad || '');
  if (/\.3mf$/i.test(s)) return '3mf';
  if (/\.stl$/i.test(s)) return 'stl';
  return null;
}

/** Malzeme adını normalize eder ("pla+" → "PLA+"). */
export function malzemeNormalize(ad) {
  const s = String(ad || '').trim().toUpperCase().replace(/\s+/g, '');
  if (MALZEME_YOGUNLUK[s]) return s;
  if (/^PLA\+?$/.test(s)) return s.startsWith('PLA+') ? 'PLA+' : 'PLA';
  if (/^PETG/.test(s)) return 'PETG';
  if (/^ABS/.test(s)) return 'ABS';
  if (/^TPU/.test(s)) return 'TPU';
  if (/^ASA/.test(s)) return 'ASA';
  if (/^PC/.test(s)) return 'PC';
  if (/NAYLON|NYLON|^PA/.test(s)) return 'NAYLON';
  return 'PLA';
}

/** Yoğunluk (g/cm³). */
export function yogunlukAl(malzeme) {
  return MALZEME_YOGUNLUK[malzemeNormalize(malzeme)] || MALZEME_YOGUNLUK.PLA;
}

/**
 * Etkin doluluk oranı.
 *
 *   efektif = kabuk + (1 − kabuk) × (infill / 100)
 *
 * Kabuk her zaman katıdır; dolgu yalnızca iç hacme uygulanır.
 *
 * @param {number} infillYuzde 0–100
 * @returns {number} 0.18 – 1.0 arası
 */
export function etkinDoluluk(infillYuzde) {
  const i = Math.max(0, Math.min(100, Number(infillYuzde) || 0)) / 100;
  return KABUK_ORANI + (1 - KABUK_ORANI) * i;
}

/**
 * Hacimden filament gramajı.
 *
 * @param {number} hacimCm3 modelin katı hacmi (cm³)
 * @param {number} infillYuzde doluluk (%)
 * @param {string} malzemeTipi PLA / PETG / ABS / TPU / ASA …
 * @returns {{gram:number, etkinDoluluk:number, yogunluk:number, hacimCm3:number}}
 */
export function hesaplaGramaj(hacimCm3, infillYuzde, malzemeTipi = 'PLA') {
  const hacim = Number(hacimCm3);
  if (!Number.isFinite(hacim) || hacim <= 0) {
    return { gram: 0, etkinDoluluk: 0, yogunluk: yogunlukAl(malzemeTipi), hacimCm3: 0 };
  }
  const doluluk = etkinDoluluk(infillYuzde);
  const yogunluk = yogunlukAl(malzemeTipi);
  const gram = hacim * doluluk * yogunluk;
  return {
    gram: Math.round(gram * 1000) / 1000,
    etkinDoluluk: Math.round(doluluk * 1000) / 1000,
    yogunluk,
    hacimCm3: Math.round(hacim * 1000) / 1000,
  };
}

/* ------------------------------------------------------------------ */
/* Binary STL                                                          */
/* ------------------------------------------------------------------ */

/**
 * Binary STL mi? (84 + N×50 === boyut)
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {number|null} üçgen sayısı (binary değilse null)
 */
export function binaryStlUcgenSayisi(buffer) {
  const bayt = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bayt.byteLength < 84) return null;
  const gorunum = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  const n = gorunum.getUint32(80, true);
  if (n === 0) return null;
  // 84 + N*50 tam eşleşmeli (bazı dosyalarda sonda dolgu baytı olabilir → hoşgörü)
  const beklenen = 84 + n * 50;
  if (bayt.byteLength === beklenen) return n;
  if (bayt.byteLength > beklenen && bayt.byteLength - beklenen <= 1024) return n;
  return null;
}

/**
 * Binary STL ayrıştırır: hacim + bounding box.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {number} n üçgen sayısı
 */
function binaryStlOku(buffer, n) {
  const bayt = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let hacim6 = 0; // 6·V toplamı (1/6 en sonda bir kez uygulanır)

  const getF32 = dv.getFloat32.bind(dv);
  let off = 84 + 12; // normali atla

  for (let i = 0; i < n; i++) {
    const ax = getF32(off, true);
    const ay = getF32(off + 4, true);
    const az = getF32(off + 8, true);
    const bx = getF32(off + 12, true);
    const by = getF32(off + 16, true);
    const bz = getF32(off + 20, true);
    const cx = getF32(off + 24, true);
    const cy = getF32(off + 28, true);
    const cz = getF32(off + 32, true);

    // Bounding box
    if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
    if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
    if (az < minZ) minZ = az; if (az > maxZ) maxZ = az;
    if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
    if (by < minY) minY = by; if (by > maxY) maxY = by;
    if (bz < minZ) minZ = bz; if (bz > maxZ) maxZ = bz;
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;

    // det([a, b, c]) — işaretli dörtyüzlü hacminin 6 katı
    hacim6 += ax * (by * cz - bz * cy)
      - ay * (bx * cz - bz * cx)
      + az * (bx * cy - by * cx);

    off += 50;
  }

  return {
    ucgenSayisi: n,
    hacimMm3: Math.abs(hacim6) / 6,
    boyutlar: {
      genislik: maxX - minX,
      derinlik: maxY - minY,
      yukseklik: maxZ - minZ,
    },
    bbox: { minX, minY, minZ, maxX, maxY, maxZ },
  };
}

/* ------------------------------------------------------------------ */
/* ASCII STL                                                           */
/* ------------------------------------------------------------------ */

const VERTEX_RE = /vertex\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

function asciiStlOku(metin) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let hacim6 = 0;
  let ucgenSayisi = 0;

  let ax = 0, ay = 0, az = 0;
  let bx = 0, by = 0, bz = 0;
  let sayac = 0;

  VERTEX_RE.lastIndex = 0;
  let m;
  while ((m = VERTEX_RE.exec(metin)) !== null) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const z = Number(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

    if (sayac === 0) { ax = x; ay = y; az = z; }
    else if (sayac === 1) { bx = x; by = y; bz = z; }
    else {
      hacim6 += ax * (by * z - bz * y)
        - ay * (bx * z - bz * x)
        + az * (bx * y - by * x);
      ucgenSayisi++;
      sayac = -1; // 0'a dönecek
    }
    sayac++;
  }

  if (!ucgenSayisi) {
    throw new Error('STL içinde üçgen (vertex) bulunamadı. Dosya bozuk olabilir.');
  }

  return {
    ucgenSayisi,
    hacimMm3: Math.abs(hacim6) / 6,
    boyutlar: {
      genislik: maxX - minX,
      derinlik: maxY - minY,
      yukseklik: maxZ - minZ,
    },
    bbox: { minX, minY, minZ, maxX, maxY, maxZ },
  };
}

/* ------------------------------------------------------------------ */
/* Ana giriş: STL                                                      */
/* ------------------------------------------------------------------ */

/**
 * STL dosyasını ayrıştırır (binary veya ASCII — otomatik algılar).
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {{ad?:string}} [opts]
 * @returns {{
 *   tur:'stl', format:'binary'|'ascii', ucgenSayisi:number,
 *   hacimMm3:number, hacimCm3:number,
 *   boyutlar:{genislik:number,derinlik:number,yukseklik:number},
 *   bbox:object
 * }}
 */
export function parseSTL(buffer, opts = {}) {
  const bayt = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!bayt.byteLength) throw new Error('Dosya boş.');
  if (bayt.byteLength > MAKS_DOSYA_BAYT) {
    throw new Error('Dosya çok büyük (en fazla 100 MB).');
  }

  const n = binaryStlUcgenSayisi(bayt);
  let sonuc;
  let format;

  if (n != null) {
    sonuc = binaryStlOku(bayt, n);
    format = 'binary';
  } else {
    // ASCII: metne çevir (ilk 512 baytta "solid" ipucu aranır, zorunlu değil)
    const metin = bayt.length > 4 * 1024 * 1024
      // Çok büyük dosyada tek parça string yerine parçalı decode daha güvenli;
      // yine de tek çağrı V8'de hızlıdır:
      ? new TextDecoder('utf-8').decode(bayt)
      : new TextDecoder('utf-8').decode(bayt);
    sonuc = asciiStlOku(metin);
    format = 'ascii';
  }

  if (!(sonuc.hacimMm3 > 0)) {
    throw new Error('Model hacmi hesaplanamadı (kapalı olmayan/bozuk mesh). Dosyayı dilimleyicide onarın.');
  }

  return {
    tur: 'stl',
    format,
    dosyaAdi: opts.ad || null,
    ...sonuc,
    hacimCm3: sonuc.hacimMm3 / 1000,
  };
}

/* ------------------------------------------------------------------ */
/* 3MF (ZIP + XML)                                                     */
/* ------------------------------------------------------------------ */

/** ZIP yerel dosya başlığı imzası. */
const ZIP_LOCAL = 0x04034b50;

/** ArrayBuffer'da belirli bir imzayı arar (basit tarama). */
function zipGirisleri(bayt) {
  const girisler = [];
  const dv = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  let i = 0;
  while (i + 30 <= bayt.byteLength) {
    if (dv.getUint32(i, true) !== ZIP_LOCAL) { i++; continue; }
    const yontem = dv.getUint16(i + 8, true);
    const sikistirilmisBoyut = dv.getUint32(i + 18, true);
    const acilmisBoyut = dv.getUint32(i + 22, true);
    const adUzunluk = dv.getUint16(i + 26, true);
    const ekUzunluk = dv.getUint16(i + 28, true);
    const adBas = i + 30;
    if (adBas + adUzunluk > bayt.byteLength) break;
    const ad = new TextDecoder('utf-8').decode(bayt.subarray(adBas, adBas + adUzunluk));
    const veriBas = adBas + adUzunluk + ekUzunluk;
    // Boyutlar 0 ise (data descriptor) merkezi dizinden okumak gerekir; bu durumda
    // girişi atlarız — 3MF yazıcıları boyutu başlıkta yazar.
    if (sikistirilmisBoyut > 0 && veriBas + sikistirilmisBoyut <= bayt.byteLength) {
      girisler.push({
        ad,
        yontem,
        veri: bayt.subarray(veriBas, veriBas + sikistirilmisBoyut),
        boyut: acilmisBoyut,
      });
    }
    i = veriBas + sikistirilmisBoyut;
  }
  return girisler;
}

/** Deflate-raw açma: tarayıcıda DecompressionStream, Node'da zlib. */
async function deflateAc(veri) {
  // Node
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const zlib = await import('node:zlib');
      return new Uint8Array(zlib.inflateRawSync(veri));
    } catch { /* tarayıcıya düş */ }
  }
  // Tarayıcı
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate-raw');
    const akis = new Blob([veri]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }
  throw new Error('Bu tarayıcı 3MF sıkıştırmasını açamıyor (DecompressionStream yok).');
}

/**
 * 3MF dosyasını ayrıştırır (ZIP içindeki 3D/3dmodel.model XML'i).
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {{ad?:string}} [opts]
 * @returns {Promise<object>}
 */
export async function parse3MF(buffer, opts = {}) {
  const bayt = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!bayt.byteLength) throw new Error('Dosya boş.');
  if (bayt.byteLength > MAKS_DOSYA_BAYT) {
    throw new Error('Dosya çok büyük (en fazla 100 MB).');
  }

  const girisler = zipGirisleri(bayt);
  // Model dosyası: 3D/3dmodel.model (küçük/büyük harf farkı tolere edilir)
  const modelGirisi = girisler.find(g => /(^|\/)3dmodel\.model$/i.test(g.ad))
    || girisler.find(g => /\.model$/i.test(g.ad));

  if (!modelGirisi) {
    throw new Error('3MF içinde model dosyası (3D/3dmodel.model) bulunamadı.');
  }

  let ham;
  if (modelGirisi.yontem === 0) {
    ham = modelGirisi.veri; // sıkıştırılmamış
  } else if (modelGirisi.yontem === 8) {
    ham = await deflateAc(modelGirisi.veri);
  } else {
    throw new Error('Desteklenmeyen 3MF sıkıştırma yöntemi (' + modelGirisi.yontem + ').');
  }

  const xml = new TextDecoder('utf-8').decode(ham);
  return modelXmlOku(xml, opts);
}

/** 3MF model XML'inden hacim + bbox çıkarır. */
function modelXmlOku(xml, opts = {}) {
  // Birim: <model unit="millimeter"> (varsayılan millimeter)
  const birimM = xml.match(/<model[^>]*\bunit\s*=\s*"([^"]+)"/i);
  const birim = (birimM?.[1] || 'millimeter').toLowerCase();
  const olcek = birim === 'inch' ? 25.4
    : birim === 'centimeter' ? 10
      : birim === 'meter' ? 1000
        : birim === 'micron' ? 0.001
          : 1;

  // Köşe noktaları
  const xs = [];
  const ys = [];
  const zs = [];
  const VERTEX = /<vertex\s+[^>]*?\bx\s*=\s*"([^"]+)"[^>]*?\by\s*=\s*"([^"]+)"[^>]*?\bz\s*=\s*"([^"]+)"[^>]*?\/?>/gi;
  let m;
  const koordinat = [];
  while ((m = VERTEX.exec(xml)) !== null) {
    const x = Number(m[1]) * olcek;
    const y = Number(m[2]) * olcek;
    const z = Number(m[3]) * olcek;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    koordinat.push(x, y, z);
  }
  if (!koordinat.length) {
    throw new Error('3MF modelinde köşe noktası (vertex) bulunamadı.');
  }

  // Üçgenler
  const TRI = /<triangle\s+[^>]*?\bv1\s*=\s*"(\d+)"[^>]*?\bv2\s*=\s*"(\d+)"[^>]*?\bv3\s*=\s*"(\d+)"[^>]*?\/?>/gi;
  let hacim6 = 0;
  let ucgenSayisi = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const koseSayisi = koordinat.length / 3;
  while ((m = TRI.exec(xml)) !== null) {
    const i1 = Number(m[1]);
    const i2 = Number(m[2]);
    const i3 = Number(m[3]);
    if (i1 >= koseSayisi || i2 >= koseSayisi || i3 >= koseSayisi) continue;

    const ax = koordinat[i1 * 3], ay = koordinat[i1 * 3 + 1], az = koordinat[i1 * 3 + 2];
    const bx = koordinat[i2 * 3], by = koordinat[i2 * 3 + 1], bz = koordinat[i2 * 3 + 2];
    const cx = koordinat[i3 * 3], cy = koordinat[i3 * 3 + 1], cz = koordinat[i3 * 3 + 2];

    if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
    if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
    if (az < minZ) minZ = az; if (az > maxZ) maxZ = az;
    if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
    if (by < minY) minY = by; if (by > maxY) maxY = by;
    if (bz < minZ) minZ = bz; if (bz > maxZ) maxZ = bz;
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;

    hacim6 += ax * (by * cz - bz * cy)
      - ay * (bx * cz - bz * cx)
      + az * (bx * cy - by * cx);
    ucgenSayisi++;
  }

  if (!ucgenSayisi) throw new Error('3MF modelinde üçgen bulunamadı.');
  const hacimMm3 = Math.abs(hacim6) / 6;
  if (!(hacimMm3 > 0)) throw new Error('3MF hacmi hesaplanamadı (bozuk mesh).');

  return {
    tur: '3mf',
    format: '3mf',
    dosyaAdi: opts.ad || null,
    ucgenSayisi,
    hacimMm3,
    hacimCm3: hacimMm3 / 1000,
    boyutlar: { genislik: maxX - minX, derinlik: maxY - minY, yukseklik: maxZ - minZ },
    bbox: { minX, minY, minZ, maxX, maxY, maxZ },
    birim,
  };
}

/* ------------------------------------------------------------------ */
/* Birleşik giriş                                                      */
/* ------------------------------------------------------------------ */

/**
 * Dosya adına/magic byte'a göre uygun ayrıştırıcıyı seçer.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {{ad?:string}} [opts]
 * @returns {Promise<object>}
 */
export async function parseModel(buffer, opts = {}) {
  const bayt = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ad = String(opts.ad || '');
  const tur = dosyaTuru(ad);

  // Magic byte: ZIP 50 4B 03 04 (3MF), aksi hâlde STL
  const zipMi = bayt.length >= 4 && bayt[0] === 0x50 && bayt[1] === 0x4B;

  if (tur === '3mf' || zipMi) return parse3MF(bayt, opts);
  if (tur === 'stl' || tur == null) return parseSTL(bayt, opts);

  throw new Error('Desteklenmeyen dosya türü. Yalnızca .stl ve .3mf kabul edilir.');
}

export default { parseSTL, parse3MF, parseModel, hesaplaGramaj };
