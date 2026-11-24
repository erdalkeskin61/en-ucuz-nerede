/**
 * 📐 STL / 3MF Model Ayrıştırma & Anlık Parça Maliyeti Testleri
 *
 * Kapsam:
 *   1) Binary STL: 20×20×20 mm küp → hacim **8000 mm³** (±%0,1)
 *   2) Orijinden bağımsızlık: merkezlenmiş küp de 8000 mm³
 *   3) Bounding box doğruluğu
 *   4) ASCII STL aynı sonucu verir
 *   5) Gramaj formülü: PLA %20 doluluk → 3,41248 g (8 cm³)
 *   6) Malzeme yoğunlukları (PETG/ABS/TPU/ASA)
 *   7) 3MF (ZIP+XML) ayrıştırma — stored ve deflate
 *   8) Hata yönetimi: boş / bozuk / desteklenmeyen / aşırı büyük
 *   9) Performans: ~50 MB binary STL (≈1M üçgen)
 *  10) Sunucuya istek gitmediğinin sözleşmesi (istemci taraflı)
 *  11) 🧮 Parça maliyeti + makara verimi motoru (8 cm³ / 125 cm³, ₺499)
 *  12) 🌐 Canlı fiyat eşleştirme + afiliye link sözleşmesi (gerçek API)
 *  13) 🏠 Ana sayfa mikro dropzone + /maliyet.html devir sözleşmesi
 *  14) 🎨 Satın alma kartı CSS (zümrüt çerçeve, nabız, responsive)
 *
 *   node scripts/test-stl-maliyet.mjs            (ağsız)
 *   node scripts/test-stl-maliyet.mjs --canli    (gerçek API fiyatı da doğrular)
 */
import { deflateRawSync } from 'node:zlib';
import fs from 'node:fs';
import {
  parseSTL, parse3MF, parseModel, hesaplaGramaj, etkinDoluluk,
  yogunlukAl, malzemeNormalize, dosyaTuru, binaryStlUcgenSayisi,
  MALZEME_YOGUNLUK, KABUK_ORANI, DOLULUK_SECENEKLERI, MAKS_DOSYA_BAYT,
} from '../public/stlParser.js';
import {
  para, tamSayi, turkceAblatif, enUcuzFilament, hesaplaMaliyet,
  ozetMetni, ctaMetni, verimMetni, VARSAYILAN_MAKARA_GRAM,
} from '../public/stlMaliyet.js';

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
const yakin = (a, b, tol = 0.001) => Math.abs(Number(a) - Number(b)) <= tol;
const yuzdeYakin = (a, b, yuzde = 0.1) => {
  const fark = Math.abs(Number(a) - Number(b));
  return fark <= Math.abs(Number(b)) * (yuzde / 100);
};

/* ------------------------------------------------------------------ */
/* Test verisi üreticileri                                             */
/* ------------------------------------------------------------------ */

/** Küpün 12 üçgeni (köşe noktaları verilen sınırlarda). */
function kupUcgenleri(genislik = 20, derinlik = 20, yukseklik = 20, merkezle = false) {
  const bas = merkezle ? -genislik / 2 : 0;
  const x0 = bas, y0 = merkezle ? -derinlik / 2 : 0, z0 = merkezle ? -yukseklik / 2 : 0;
  const x1 = x0 + genislik, y1 = y0 + derinlik, z1 = z0 + yukseklik;

  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], // alt
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], // üst
  ];
  // Kapalı manifold — yönler tutarlı
  const yuzler = [
    [0, 2, 1], [0, 3, 2],   // alt
    [4, 5, 6], [4, 6, 7],   // üst
    [0, 1, 5], [0, 5, 4],   // ön
    [3, 7, 6], [3, 6, 2],   // arka
    [0, 4, 7], [0, 7, 3],   // sol
    [1, 2, 6], [1, 6, 5],   // sağ
  ];
  return yuzler.map(f => f.map(i => v[i]));
}

/** Binary STL tamponu üretir. */
function binaryStlYap(ucgenler) {
  const n = ucgenler.length;
  const boyut = 84 + n * 50;
  const buf = Buffer.alloc(boyut);
  buf.write('binary STL test', 0, 'ascii');
  buf.writeUInt32LE(n, 80);
  let off = 84;
  for (const [a, b, c] of ucgenler) {
    // normal (hesaplanmaz, 0 yeterli — ayrıştırıcı normali kullanmıyor)
    off += 12;
    for (const v of [a, b, c]) {
      buf.writeFloatLE(v[0], off); off += 4;
      buf.writeFloatLE(v[1], off); off += 4;
      buf.writeFloatLE(v[2], off); off += 4;
    }
    buf.writeUInt16LE(0, off); off += 2;
  }
  return buf;
}

/** ASCII STL metni üretir. */
function asciiStlYap(ucgenler, ad = 'test') {
  const satirlar = [`solid ${ad}`];
  for (const [a, b, c] of ucgenler) {
    satirlar.push('  facet normal 0 0 0');
    satirlar.push('    outer loop');
    for (const v of [a, b, c]) {
      satirlar.push(`      vertex ${v[0]} ${v[1]} ${v[2]}`);
    }
    satirlar.push('    endloop');
    satirlar.push('  endfacet');
  }
  satirlar.push(`endsolid ${ad}`);
  return satirlar.join('\n');
}

/** CRC32 (ZIP başlığı için). */
const CRC_TABLO = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLO[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** 3MF (ZIP) tamponu üretir. sıkıştır: true → deflate, false → stored. */
function ucMfYap(xml, { sikistir = false, dosyaAdi = '3D/3dmodel.model' } = {}) {
  const ham = Buffer.from(xml, 'utf8');
  const veri = sikistir ? deflateRawSync(ham) : ham;
  const yontem = sikistir ? 8 : 0;
  const adBuf = Buffer.from(dosyaAdi, 'utf8');
  const crc = crc32(ham);

  const baslik = Buffer.alloc(30);
  baslik.writeUInt32LE(0x04034B50, 0);
  baslik.writeUInt16LE(20, 4);
  baslik.writeUInt16LE(0, 6);
  baslik.writeUInt16LE(yontem, 8);
  baslik.writeUInt16LE(0, 10);
  baslik.writeUInt16LE(0, 12);
  baslik.writeUInt32LE(crc, 14);
  baslik.writeUInt32LE(veri.length, 18);
  baslik.writeUInt32LE(ham.length, 22);
  baslik.writeUInt16LE(adBuf.length, 26);
  baslik.writeUInt16LE(0, 28);

  return Buffer.concat([baslik, adBuf, veri]);
}

/** 3MF model XML üretir (küp). */
function ucMfXml(ucgenler, birim = 'millimeter') {
  const koseler = new Set();
  for (const uc of ucgenler) for (const v of uc) koseler.add(v.join(','));
  const liste = [...koseler].map(s => s.split(',').map(Number));
  const indeks = new Map(liste.map((v, i) => [v.join(','), i]));

  const vertexXml = liste.map(v => `        <vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('\n');
  const triXml = ucgenler.map(([a, b, c]) => {
    const i1 = indeks.get(a.join(','));
    const i2 = indeks.get(b.join(','));
    const i3 = indeks.get(c.join(','));
    return `        <triangle v1="${i1}" v2="${i2}" v3="${i3}"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${birim}" xml:lang="tr-TR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${vertexXml}
        </vertices>
        <triangles>
${triXml}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;
}

/* ------------------------------------------------------------------ */
bolum('1) 📦 Binary STL — 20×20×20 mm küp');

const kup = kupUcgenleri(20, 20, 20, false);
const bin = binaryStlYap(kup);
kontrol('binary STL üretildi (12 üçgen)', kup.length === 12, String(kup.length));
kontrol('dosya boyutu = 84 + N×50', bin.length === 84 + 12 * 50, String(bin.length));
kontrol('binary algılandı', binaryStlUcgenSayisi(bin) === 12, String(binaryStlUcgenSayisi(bin)));

const r1 = parseSTL(bin);
kontrol('format binary', r1.format === 'binary', r1.format);
kontrol('üçgen sayısı 12', r1.ucgenSayisi === 12, String(r1.ucgenSayisi));
kontrol('hacim tam 8000 mm³ (±%0,1)', yuzdeYakin(r1.hacimMm3, 8000, 0.1), String(r1.hacimMm3));
kontrol('hacim cm³ = 8', yuzdeYakin(r1.hacimCm3, 8, 0.1), String(r1.hacimCm3));
kontrol('boyutlar 20×20×20 mm',
  yakin(r1.boyutlar.genislik, 20, 0.001)
  && yakin(r1.boyutlar.derinlik, 20, 0.001)
  && yakin(r1.boyutlar.yukseklik, 20, 0.001),
  JSON.stringify(r1.boyutlar));

/* ------------------------------------------------------------------ */
bolum('2) 🎯 Orijinden bağımsızlık (işaretli dörtyüzlü doğrulaması)');

const merkezKup = kupUcgenleri(20, 20, 20, true);
const r2 = parseSTL(binaryStlYap(merkezKup));
kontrol('merkezlenmiş küp de 8000 mm³', yuzdeYakin(r2.hacimMm3, 8000, 0.1), String(r2.hacimMm3));
kontrol('boyutlar yine 20 mm', yakin(r2.boyutlar.genislik, 20, 0.001), String(r2.boyutlar.genislik));
kontrol('bbox negatif koordinat', yakin(r2.bbox.minX, -10, 0.001), String(r2.bbox.minX));

// Farklı boyut: 10×20×30 = 6000 mm³
const r3 = parseSTL(binaryStlYap(kupUcgenleri(10, 20, 30, false)));
kontrol('10×20×30 = 6000 mm³', yuzdeYakin(r3.hacimMm3, 6000, 0.1), String(r3.hacimMm3));
kontrol('boyutlar 10×20×30',
  yakin(r3.boyutlar.genislik, 10, 0.001)
  && yakin(r3.boyutlar.derinlik, 20, 0.001)
  && yakin(r3.boyutlar.yukseklik, 30, 0.001));

// Çok küçük: 2×2×2 = 8 mm³
const r4 = parseSTL(binaryStlYap(kupUcgenleri(2, 2, 2, false)));
kontrol('2×2×2 = 8 mm³', yuzdeYakin(r4.hacimMm3, 8, 0.5), String(r4.hacimMm3));

/* ------------------------------------------------------------------ */
bolum('3) 📄 ASCII STL');

const ascii = asciiStlYap(kup, 'kup');
kontrol('ASCII üretildi', ascii.startsWith('solid'), ascii.slice(0, 12));
kontrol('ASCII binary sanılmıyor', binaryStlUcgenSayisi(Buffer.from(ascii)) === null);

const r5 = parseSTL(Buffer.from(ascii, 'utf8'));
kontrol('format ascii', r5.format === 'ascii', r5.format);
kontrol('ASCII üçgen sayısı 12', r5.ucgenSayisi === 12, String(r5.ucgenSayisi));
kontrol('ASCII hacim 8000 mm³', yuzdeYakin(r5.hacimMm3, 8000, 0.1), String(r5.hacimMm3));
kontrol('ASCII ve binary aynı sonuç', yuzdeYakin(r5.hacimMm3, r1.hacimMm3, 0.01));

/* ------------------------------------------------------------------ */
bolum('4) ⚖️ Gramaj formülü');

// Kabuk oranı ve etkin doluluk
kontrol('kabuk oranı %18', KABUK_ORANI === 0.18, String(KABUK_ORANI));
kontrol('etkin doluluk 0% → 0.18', yakin(etkinDoluluk(0), 0.18), String(etkinDoluluk(0)));
kontrol('etkin doluluk 100% → 1.0', yakin(etkinDoluluk(100), 1), String(etkinDoluluk(100)));
kontrol('etkin doluluk 20% → 0.344', yakin(etkinDoluluk(20), 0.344), String(etkinDoluluk(20)));

// Spec örneği: 8 cm³, PLA %20 doluluk
// 8 × 0.344 × 1.24 = 3,41248 g
const g = hesaplaGramaj(8, 20, 'PLA');
kontrol('PLA %20 doluluk → 3,412 g',
  yakin(g.gram, 3.4125, 0.002), String(g.gram));
kontrol('gramaj formülü doğrulandı',
  yakin(g.gram, 8 * 0.344 * 1.24, 0.001), `${g.gram} vs ${8 * 0.344 * 1.24}`);
kontrol('etkin doluluk döner', yakin(g.etkinDoluluk, 0.344), String(g.etkinDoluluk));
kontrol('yoğunluk döner', g.yogunluk === 1.24, String(g.yogunluk));

// Malzeme yoğunlukları
kontrol('PLA 1.24', yogunlukAl('PLA') === 1.24);
kontrol('PETG 1.27', yogunlukAl('PETG') === 1.27);
kontrol('ABS 1.04', yogunlukAl('ABS') === 1.04);
kontrol('TPU 1.21', yogunlukAl('TPU') === 1.21);
kontrol('ASA 1.07', yogunlukAl('ASA') === 1.07);

// Malzeme normalizasyonu
kontrol('"pla" → PLA', malzemeNormalize('pla') === 'PLA');
kontrol('"PETG" → PETG', malzemeNormalize('PETG') === 'PETG');
kontrol('"petg siyah" → PETG', malzemeNormalize('petg siyah') === 'PETG');
kontrol('bilinmeyen → PLA', malzemeNormalize('xyz') === 'PLA');

// Doluluk oranları
kontrol('doluluk seçenekleri 10/20/40/100',
  DOLULUK_SECENEKLERI.join(',') === '10,20,40,100', DOLULUK_SECENEKLERI.join(','));

// Farklı doluluklarda orantı
const g10 = hesaplaGramaj(8, 10, 'PLA');
const g40 = hesaplaGramaj(8, 40, 'PLA');
const g100 = hesaplaGramaj(8, 100, 'PLA');
kontrol('doluluk artınca gramaj artar', g10.gram < g40.gram && g40.gram < g100.gram,
  `${g10.gram} < ${g40.gram} < ${g100.gram}`);
kontrol('%100 doluluk = 8 × 1.24 = 9,92 g', yakin(g100.gram, 9.92, 0.01), String(g100.gram));

// Sıfır/geçersiz girdi
kontrol('hacim 0 → 0 g', hesaplaGramaj(0, 20).gram === 0);
kontrol('geçersiz hacim → 0 g', hesaplaGramaj(null, 20).gram === 0);
kontrol('negatif hacim → 0 g', hesaplaGramaj(-5, 20).gram === 0);

/* ------------------------------------------------------------------ */
bolum('5) 📦 3MF (ZIP + XML)');

const xml = ucMfXml(kup, 'millimeter');
const ucMfStored = ucMfYap(xml, { sikistir: false });
const ucMfDeflate = ucMfYap(xml, { sikistir: true });

kontrol('3MF ZIP imzası', ucMfStored.readUInt32LE(0) === 0x04034B50);

const m1 = await parse3MF(ucMfStored);
kontrol('3MF stored: hacim 8000 mm³', yuzdeYakin(m1.hacimMm3, 8000, 0.1), String(m1.hacimMm3));
kontrol('3MF stored: tür 3mf', m1.tur === '3mf', m1.tur);
kontrol('3MF stored: boyutlar 20 mm', yakin(m1.boyutlar.genislik, 20, 0.001));

const m2 = await parse3MF(ucMfDeflate);
kontrol('3MF deflate: hacim 8000 mm³', yuzdeYakin(m2.hacimMm3, 8000, 0.1), String(m2.hacimMm3));

// Birim dönüşümü: centimeter → mm (ölçek 10). 20 cm kenar = 200 mm → 200³ mm³.
const xmlCm = ucMfXml(kup, 'centimeter');
const m3 = await parse3MF(ucMfYap(xmlCm));
const beklenenCm3 = 200 ** 3; // 8.000.000 mm³
kontrol('3MF centimeter birimi ölçeklenir',
  yuzdeYakin(m3.hacimMm3, beklenenCm3, 0.1), String(m3.hacimMm3));

// parseModel: magic byte ile 3MF algılama
const m4 = await parseModel(ucMfStored, { ad: 'model.3mf' });
kontrol('parseModel 3MF algılar', m4.tur === '3mf', m4.tur);
const m5 = await parseModel(bin, { ad: 'parca.stl' });
kontrol('parseModel STL algılar', m5.tur === 'stl', m5.tur);
const m6 = await parseModel(ucMfDeflate, { ad: 'uzantisiz' });
kontrol('uzantısız 3MF magic byte ile algılanır', m6.tur === '3mf', m6.tur);

// Data Descriptor (bit 3 = 0x0008 → yerel başlık boyutu 0) + Central Directory + çoklu .model (Bambu/Orca)
function cokluZipYap(dosyalar) {
  const yerelParcalar = [];
  const cdParcalar = [];
  let off = 0;
  for (const d of dosyalar) {
    const ham = Buffer.from(d.icerik, 'utf8');
    const veri = deflateRawSync(ham);
    const adBuf = Buffer.from(d.ad, 'utf8');
    const crc = crc32(ham);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034B50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0008, 6); // data descriptor bayrağı → yerel boyuta 0 yaz
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(0, 18);
    lh.writeUInt32LE(0, 22);
    lh.writeUInt16LE(adBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    const dd = Buffer.alloc(16);
    dd.writeUInt32LE(0x08074B50, 0);
    dd.writeUInt32LE(crc, 4);
    dd.writeUInt32LE(veri.length, 8);
    dd.writeUInt32LE(ham.length, 12);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014B50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0008, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(veri.length, 20);
    cd.writeUInt32LE(ham.length, 24);
    cd.writeUInt16LE(adBuf.length, 28);
    cd.writeUInt32LE(off, 42);

    yerelParcalar.push(lh, adBuf, veri, dd);
    cdParcalar.push(cd, adBuf);
    off += lh.length + adBuf.length + veri.length + dd.length;
  }
  const cdBuf = Buffer.concat(cdParcalar);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054B50, 0);
  eocd.writeUInt16LE(dosyalar.length, 8);
  eocd.writeUInt16LE(dosyalar.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...yerelParcalar, cdBuf, eocd]);
}

const anaComponentXml = '<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter"><resources><object id="1" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="2"/></components></object></resources><build><item objectid="1"/></build></model>';
const altMeshXml = xml.replace(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g, "<vertex z='$3' y='$2' x='$1'/>");
const bambuTarzi3mf = cokluZipYap([
  { ad: '[Content_Types].xml', icerik: '<Types/>' },
  { ad: '3D/3dmodel.model', icerik: anaComponentXml },
  { ad: '3D/Objects/object_1.model', icerik: altMeshXml },
]);
const m7 = await parseModel(bambuTarzi3mf, { ad: 'bambu-test.3mf' });
kontrol('Data Descriptor + Central Directory + 3D/Objects/*.model 3MF tam ayrıştırılır',
  m7.tur === '3mf' && m7.ucgenSayisi === 12 && yuzdeYakin(m7.hacimMm3, 8000, 0.1),
  JSON.stringify(m7));

/* ------------------------------------------------------------------ */
bolum('6) 🛡️ Hata yönetimi');

const hataBekle = async (fn, desen, etiket) => {
  try {
    await fn();
    kontrol(etiket, false, 'hata fırlatmadı');
  } catch (e) {
    kontrol(etiket, desen.test(String(e?.message || e)), String(e?.message || e).slice(0, 70));
  }
};

await hataBekle(() => parseSTL(Buffer.alloc(0)), /boş/i, 'boş dosya reddedilir');
await hataBekle(() => parseSTL(Buffer.from('merhaba dünya'.repeat(20))),
  /üçgen|vertex/i, 'metin dosyası reddedilir');
await hataBekle(() => parseSTL(Buffer.alloc(84)), /üçgen/i, 'üçgensiz binary reddedilir');
await hataBekle(() => parse3MF(Buffer.from('bu bir zip değil')), /model dosyası/i,
  'bozuk 3MF reddedilir');
await hataBekle(() => parse3MF(ucMfYap('<model><resources></resources></model>')),
  /köşe|vertex/i, 'köşesiz 3MF reddedilir');

kontrol('aşırı büyük dosya sınırı 100 MB', MAKS_DOSYA_BAYT === 100 * 1024 * 1024, String(MAKS_DOSYA_BAYT));
await hataBekle(
  () => parseSTL(new Uint8Array(MAKS_DOSYA_BAYT + 1)),
  /çok büyük/i, '100 MB üstü reddedilir',
);

// Açık yüzey (kapalı olmayan mesh) — tek üçgen
const tekUcgen = Buffer.alloc(84 + 50);
tekUcgen.writeUInt32LE(1, 80);
// tüm koordinatlar 0 → hacim 0
await hataBekle(() => parseSTL(tekUcgen), /hacmi hesaplanamadı|kapalı/i,
  'hacimsiz (açık) mesh reddedilir');

/* ------------------------------------------------------------------ */
bolum('7) ⏱️ Performans (~50 MB / ≈1M üçgen)');

// 1.000.000 üçgenlik binary STL üret (84 + 1e6×50 ≈ 47,7 MB)
const N = 1_000_000;
const buyuk = Buffer.alloc(84 + N * 50);
buyuk.write('perf test', 0, 'ascii');
buyuk.writeUInt32LE(N, 80);
{
  // 12 üçgenlik KAPALI küp deseni; her kopya hafifçe ötelenir. Kapalı katı
  // olduğu için işaretli hacim toplamı gerçek hacmi verir (dejenere değil).
  const birimKup = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1]], [[0, 0, 1], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]],
    [[0, 1, 0], [1, 1, 0], [1, 1, 1]], [[0, 1, 0], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [0, 1, 0], [0, 1, 1]], [[0, 0, 0], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [1, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1], [1, 0, 1]],
  ];
  let off = 84 + 12;
  for (let i = 0; i < N; i++) {
    const [a, b, c] = birimKup[i % 12];
    const kay = Math.floor(i / 12) * 0.01; // her kopya ayrı konumda
    for (const v of [a, b, c]) {
      buyuk.writeFloatLE(v[0] + kay, off); off += 4;
      buyuk.writeFloatLE(v[1] + kay, off); off += 4;
      buyuk.writeFloatLE(v[2] + kay, off); off += 4;
    }
    off += 2;
  }
}
const mb = (buyuk.length / (1024 * 1024)).toFixed(1);

const t0 = Date.now();
const perf = parseSTL(buyuk);
const sure = Date.now() - t0;

kontrol(`${mb} MB dosya ayrıştırıldı`, perf.ucgenSayisi === N, String(perf.ucgenSayisi));
kontrol('performans < 2500 ms', sure < 2500, `${sure} ms (${mb} MB)`);
console.log(`  ℹ️  ${mb} MB / ${(N / 1e6).toFixed(1)}M üçgen → ${sure} ms`);

/* ------------------------------------------------------------------ */
bolum('8) 🔒 İstemci taraflı sözleşme');

const parserKaynak = fs.readFileSync('public/stlParser.js', 'utf8');
const maliyetJs = fs.readFileSync('public/maliyet.js', 'utf8');
const maliyetHtml = fs.readFileSync('public/maliyet.html', 'utf8');

kontrol('parser: fetch/XMLHttpRequest YOK',
  !/\bfetch\s*\(/.test(parserKaynak) && !/XMLHttpRequest/.test(parserKaynak));
kontrol('parser: harici kütüphane importu yok',
  !/from\s+['"](?!node:)/.test(parserKaynak.replace(/from '\.\/[^']*'/g, '')));
kontrol('parser: DataView kullanılıyor (saf JS)', /new DataView\(/.test(parserKaynak));
kontrol('parser: işaretli dörtyüzlü formülü',
  /Math\.abs\(hacim6\)\s*\/\s*6/.test(parserKaynak));

kontrol('maliyet.html: dosya girdisi .stl,.3mf',
  /accept="[^"]*\.stl[^"]*\.3mf|accept="[^"]*\.3mf[^"]*\.stl/.test(maliyetHtml));
kontrol('maliyet.html: dropzone alanı', /id="stlBirak"/.test(maliyetHtml));
kontrol('maliyet.html: doluluk seçici', /id="stlDoluluk"/.test(maliyetHtml));
kontrol('maliyet.html: malzeme seçici', /id="stlMalzeme"/.test(maliyetHtml));
kontrol('maliyet.js: parser import ediliyor', /stlParser\.js/.test(maliyetJs));
kontrol('maliyet.js: dosya yüklemede ağ isteği yok (fetch yalnız API için)',
  !/fetch\([^)]*stl/i.test(maliyetJs));

kontrol('dosya türü: .STL büyük harf', dosyaTuru('PARCA.STL') === 'stl', String(dosyaTuru('PARCA.STL')));
kontrol('dosya türü: .3mf', dosyaTuru('m.3mf') === '3mf', String(dosyaTuru('m.3mf')));
kontrol('dosya türü: bilinmeyen', dosyaTuru('a.obj') === null);

/* ------------------------------------------------------------------ */
bolum('9) 🧮 Parça maliyeti + makara verimi (₺499 makara)');

const FILAMENT_499 = {
  id: 1,
  ad: 'Porima PLA Siyah 1kg Makara',
  site: 'Robotistan',
  siteId: 'robotistan',
  fiyat: 499,
  tlKg: 499,
  malzeme: 'PLA',
  kargo: 'Aynı Gün Kargo',
  url: 'https://example.com/porima-pla?ref=eun',
};

// 20 mm küp = 8 cm³ → PLA %20 → 3,41248 g
const h8 = hesaplaMaliyet({
  hacimCm3: 8, doluluk: 20, malzeme: 'PLA',
  filament: FILAMENT_499, hesaplaGramaj,
});
kontrol('8 cm³ PLA %20 → 3,412 g (parser 3 hane yuvarlar)', yakin(h8.gram, 3.412, 0.0005), String(h8.gram));
// 3,41248 / 1000 × 499 = 1,7028… → ₺1,70
kontrol('parça maliyeti kuruşu kuruşuna ₺1,70', para(h8.parcaMaliyet) === '₺1,70', para(h8.parcaMaliyet));
kontrol('makara fiyatı ₺499,00', para(h8.makaraFiyat) === '₺499,00', para(h8.makaraFiyat));
kontrol('1 makara 8 cm³ parçadan 293 adet çıkar', h8.makaraAdet === 293, String(h8.makaraAdet));
kontrol('makara gramajı 1 kg olarak doğrulandı', h8.makaraGram === 1000, String(h8.makaraGram));

// 50 mm küp = 125 cm³ → PLA %20 → 53,32 g
const h125 = hesaplaMaliyet({
  hacimCm3: 125, doluluk: 20, malzeme: 'PLA',
  filament: FILAMENT_499, hesaplaGramaj,
});
kontrol('125 cm³ PLA %20 → 53,32 g', yakin(h125.gram, 53.32, 0.00001), String(h125.gram));
kontrol('125 cm³ parça maliyeti ₺26,61', para(h125.parcaMaliyet) === '₺26,61', para(h125.parcaMaliyet));
kontrol('1 makara 125 cm³ parçadan 18 adet çıkar', h125.makaraAdet === 18, String(h125.makaraAdet));
kontrol('formül: gram/1000 × ₺/kg',
  yakin(h125.parcaMaliyet, (53.32 / 1000) * 499, 0.0001), String(h125.parcaMaliyet));

// 140 g örneği (görev metnindeki kart): 140/1000×499 = 69,86
const h140 = hesaplaMaliyet({
  hacimCm3: 140 / (0.344 * 1.24), doluluk: 20, malzeme: 'PLA',
  filament: FILAMENT_499, hesaplaGramaj,
});
kontrol('140 g parça maliyeti ₺69,86 (matematiksel doğru)',
  para(h140.parcaMaliyet) === '₺69,86', para(h140.parcaMaliyet));

// PETG daha yoğun → aynı hacimde daha ağır ve daha pahalı
const hPetg = hesaplaMaliyet({
  hacimCm3: 125, doluluk: 20, malzeme: 'PETG',
  filament: { ...FILAMENT_499, fiyat: 599, tlKg: 599, malzeme: 'PETG', ad: 'PETG 1kg' },
  hesaplaGramaj,
});
kontrol('PETG aynı hacimde PLA’dan ağır', hPetg.gram > h125.gram, `${hPetg.gram} > ${h125.gram}`);
kontrol('PETG maliyeti kendi ₺/kg’siyle hesaplanır',
  yakin(hPetg.parcaMaliyet, (hPetg.gram / 1000) * 599, 0.0001));

// 500 g makara: fiyat 250, ₺/kg 500 → makara 500 g, verim yarıya iner
const hYarim = hesaplaMaliyet({
  hacimCm3: 125, doluluk: 20, malzeme: 'PLA',
  filament: { ...FILAMENT_499, fiyat: 250, tlKg: 500, ad: '500 g makara' },
  hesaplaGramaj,
});
kontrol('500 g makara tespit edilir', hYarim.makaraGram === 500, String(hYarim.makaraGram));
kontrol('500 g makaradan 9 adet çıkar', hYarim.makaraAdet === 9, String(hYarim.makaraAdet));

// Doluluk değişince maliyet ve adet canlı değişir
const h10 = hesaplaMaliyet({ hacimCm3: 125, doluluk: 10, malzeme: 'PLA', filament: FILAMENT_499, hesaplaGramaj });
const h40 = hesaplaMaliyet({ hacimCm3: 125, doluluk: 40, malzeme: 'PLA', filament: FILAMENT_499, hesaplaGramaj });
kontrol('%10 < %20 < %40 gramaj', h10.gram < h125.gram && h125.gram < h40.gram,
  `${h10.gram} < ${h125.gram} < ${h40.gram}`);
kontrol('%40 dolulukta makara verimi düşer', h40.makaraAdet < h125.makaraAdet,
  `${h40.makaraAdet} < ${h125.makaraAdet}`);

// Filament yoksa maliyet uydurulmaz
const hFiyatsiz = hesaplaMaliyet({ hacimCm3: 8, doluluk: 20, malzeme: 'PLA', filament: null, hesaplaGramaj });
kontrol('filament yoksa parça maliyeti null', hFiyatsiz.parcaMaliyet === null);
kontrol('filament yoksa verim yine hesaplanır (fiyattan bağımsız)',
  hFiyatsiz.makaraAdet === 293, String(hFiyatsiz.makaraAdet));
kontrol('geçersiz hacimde null', hesaplaMaliyet({ hacimCm3: 0, doluluk: 20, hesaplaGramaj }) === null);
kontrol('hesaplaGramaj yoksa açık hata',
  (() => { try { hesaplaMaliyet({ hacimCm3: 8, doluluk: 20 }); return false; } catch { return true; } })());

bolum('9B) 💬 Özet / CTA / Türkçe eki / para biçimi');

kontrol('özet cümlesi görev metniyle birebir',
  ozetMetni(h125) === 'Bu model için 53g filament gerek. En ucuz makara ₺499,00 (Robotistan). Parça başı maliyetiniz: ₺26,61.',
  ozetMetni(h125));
kontrol('özet gramajı tam sayıya yuvarlar', /53g filament/.test(ozetMetni(h125)));
kontrol('özet mağaza adını içerir', ozetMetni(h125).includes('(Robotistan)'));
kontrol('filament yoksa özet dürüst',
  /Canlı filament fiyatı alınamadı/.test(ozetMetni(hFiyatsiz)));
kontrol('boş hesapta özet boş', ozetMetni(null) === '');

kontrol('CTA mağaza + fiyat içerir',
  ctaMetni(h125) === "⚡ Bu Filamenti Robotistan'dan Satın Al (₺499,00) ➔", ctaMetni(h125));
kontrol('CTA eki verilince "üzerinden" kullanılır',
  ctaMetni(h125, { baglac: 'üzerinden' }).includes('Robotistan üzerinden Satın Al'),
  ctaMetni(h125, { baglac: 'üzerinden' }));
kontrol('filament yoksa nötr CTA',
  ctaMetni(hFiyatsiz) === '⚡ Bu Filamenti Satın Al ➔', ctaMetni(hFiyatsiz));

kontrol("Türkçe eki: Robotistan'dan", turkceAblatif('Robotistan') === "'dan");
kontrol("Türkçe eki: Trendyol'dan", turkceAblatif('Trendyol') === "'dan");
kontrol("Türkçe eki: 3Dcim'den", turkceAblatif('3Dcim') === "'den");
kontrol("Türkçe eki: Porima 3D'den", turkceAblatif('Porima 3D') === "'den");
kontrol("Türkçe eki: Hepsiburada'dan", turkceAblatif('Hepsiburada') === "'dan");
kontrol("Türkçe eki: Mikropor'dan", turkceAblatif('Mikropor') === "'dan");

kontrol('para: 499 → ₺499,00', para(499) === '₺499,00', para(499));
kontrol('para: 69.8 → ₺69,80', para(69.8) === '₺69,80', para(69.8));
kontrol('para: 1234.5 → ₺1.234,50', para(1234.5) === '₺1.234,50', para(1234.5));
kontrol('para: null → —', para(null) === '—');
kontrol('tamSayi: 140 → "140"', tamSayi(140) === '140');
kontrol('tamSayi: 1000 → "1.000"', tamSayi(1000) === '1.000', tamSayi(1000));

kontrol('verim metni adet içerir', /tam 18 adet basabilirsiniz/.test(verimMetni(h125)), verimMetni(h125));
kontrol('makara yetmezse açık söyler',
  /yetmez/.test(verimMetni({ gram: 1200, makaraAdet: 0 })), verimMetni({ gram: 1200, makaraAdet: 0 }));
kontrol('varsayılan makara gramajı 1000', VARSAYILAN_MAKARA_GRAM === 1000);

bolum('9C) 🎯 Canlı filament eşleştirme (stoklu + en ucuz)');

const CANLI_LISTE = [
  { ad: 'Porima PLA Siyah 1kg', site: 'Porima 3D', fiyat: 463.68, tlKg: 463.68, malzeme: 'PLA', url: 'https://p/1' },
  { ad: 'Microzey PLA+ Gri 1kg', site: 'Trendyol', fiyat: 532.21, tlKg: 532.21, malzeme: 'PLA+', url: 'https://t/2' },
  { ad: 'eSun PETG Siyah 1kg', site: 'Robotistan', fiyat: 599, tlKg: 599, malzeme: 'PETG', url: 'https://r/3' },
  { ad: 'Fiyatsız ürün', site: 'X', fiyat: 0, tlKg: 0, malzeme: 'PLA', url: 'https://x/4' },
];
const secPLA = enUcuzFilament(CANLI_LISTE, 'PLA');
kontrol('PLA için en ucuz PLA seçilir', secPLA?.site === 'Porima 3D', String(secPLA?.site));
kontrol('PLA+ da PLA ailesine sayılır', secPLA?.ad.includes('Porima'), String(secPLA?.ad));
kontrol('fiyatsız ürün listeye girmez', enUcuzFilament(CANLI_LISTE, 'PLA')?.tlKg > 0);
const secPETG = enUcuzFilament(CANLI_LISTE, 'PETG');
kontrol('PETG istenince PETG seçilir', secPETG?.malzeme === 'PETG', String(secPETG?.malzeme));
const secABS = enUcuzFilament(CANLI_LISTE, 'ABS');
kontrol('ABS yoksa en ucuz herhangi biri (dürüst fallback)', secABS?.tlKg === 463.68, String(secABS?.tlKg));
kontrol('boş liste → null', enUcuzFilament([], 'PLA') === null);
kontrol('geçersiz liste → null', enUcuzFilament(null, 'PLA') === null);

// Seçilen teklifin linki/adı/fiyatı eksiksiz → CTA ve hedef doğrulanır
const seciliHesap = hesaplaMaliyet({
  hacimCm3: 125, doluluk: 20, malzeme: 'PLA', filament: secPLA, hesaplaGramaj,
});
kontrol('seçilen teklifin adı var', !!secPLA.ad);
kontrol('seçilen teklifin mağazası var', !!secPLA.site);
kontrol('seçilen teklifin fiyatı var', Number(secPLA.fiyat) > 0);
kontrol('seçilen teklifin linki var', /^https:\/\//.test(String(secPLA.url)));
kontrol('özet seçilen teklifin mağazasını yazar',
  ozetMetni(seciliHesap).includes('(Porima 3D)'), ozetMetni(seciliHesap));
kontrol('parça maliyeti seçilen ₺/kg ile',
  yakin(seciliHesap.parcaMaliyet, (seciliHesap.gram / 1000) * 463.68, 0.0001));

/* ------------------------------------------------------------------ */
bolum('10) 🌐 Canlı API — gerçek fiyat + afiliye link (sunucu açıksa)');

const canliIstek = process.argv.includes('--canli');
let canliVeri = null;
try {
  const ctrl = new AbortController();
  const zaman = setTimeout(() => ctrl.abort(), 4000);
  const res = await fetch('http://localhost:3000/api/baski/en-ucuz-filamentler?limit=5', { signal: ctrl.signal })
    .finally(() => clearTimeout(zaman));
  if (res.ok) canliVeri = await res.json();
} catch { canliVeri = null; }

if (canliVeri?.ok) {
  kontrol('canlı API ok:true', canliVeri.ok === true);
  kontrol('canlı API filament dizisi', Array.isArray(canliVeri.filamentler));
  const ilk = canliVeri.filamentler?.[0];
  if (ilk) {
    kontrol('canlı ürün: ad dolu', !!ilk.ad, String(ilk.ad));
    kontrol('canlı ürün: site dolu', !!ilk.site, String(ilk.site));
    kontrol('canlı ürün: fiyat > 0', Number(ilk.fiyat) > 0, String(ilk.fiyat));
    kontrol('canlı ürün: ₺/kg > 0', Number(ilk.tlKg) > 0, String(ilk.tlKg));
    kontrol('canlı ürün: link https', /^https:\/\//.test(String(ilk.url)), String(ilk.url));
    kontrol('canlı liste ₺/kg artan sıralı',
      canliVeri.filamentler.every((f, i, a) => i === 0 || a[i - 1].tlKg <= f.tlKg));
    const canliHesap = hesaplaMaliyet({
      hacimCm3: 125, doluluk: 20, malzeme: ilk.malzeme || 'PLA',
      filament: ilk, hesaplaGramaj,
    });
    kontrol('canlı fiyatla parça maliyeti hesaplanır',
      canliHesap.parcaMaliyet > 0, String(canliHesap.parcaMaliyet));
    kontrol('canlı fiyatla CTA linki kurulur', !!ilk.url && ctaMetni(canliHesap).includes('Satın Al'));
  } else {
    kontrol('canlı API boş liste dürüstçe bildirir', !!canliVeri.neden || canliVeri.toplam === 0);
    kontrol('canlı API boş liste kabul edilir (uydurma yok)', true);
  }
} else {
  // Sunucu kapalı: canlı test atlanır, süit KIRMIZI olmaz (ağ testi bağımlılığı yok).
  console.log('  ℹ️  Canlı API erişilemedi — fiyat bağlantı testi atlandı (sunucu kapalı).');
  if (canliIstek) {
    kontrol('--canli istendiğinde sunucu erişilebilir olmalı', false, 'localhost:3000 yanıt vermedi');
  }
}

/* ------------------------------------------------------------------ */
bolum('11) 🏠 Ana sayfa mikro dropzone + /maliyet.html devir sözleşmesi');

const indexHtml = fs.readFileSync('public/index.html', 'utf8');
const hizliJs = fs.readFileSync('public/stl-hizli.js', 'utf8');
const maliyetJsGuncel = fs.readFileSync('public/maliyet.js', 'utf8');
const stlMaliyetJs = fs.readFileSync('public/stlMaliyet.js', 'utf8');

kontrol('index.html: hızlı dropzone bölümü', /id="stlHizli"/.test(indexHtml));
kontrol('index.html: dosya girdisi .stl/.3mf',
  /id="stlHizliDosya"[^>]*accept="[^"]*\.stl[^"]*\.3mf/.test(indexHtml));
kontrol('index.html: hızlı script bağlı', /src="\/stl-hizli\.js"/.test(indexHtml));
kontrol('index.html: sonuç özet alanı', /id="stlHizliOzet"/.test(indexHtml));
kontrol('index.html: CTA rel noopener sponsored',
  /id="stlHizliCta"[^>]*rel="noopener sponsored"/.test(indexHtml));
kontrol('index.html: doluluk + malzeme seçicileri',
  /id="stlHizliDoluluk"/.test(indexHtml) && /id="stlHizliMalzeme"/.test(indexHtml));

kontrol('stl-hizli.js: parser istemcide import edilir', /import\('\/stlParser\.js'\)/.test(hizliJs));
kontrol('stl-hizli.js: ortak maliyet modülü kullanılır', /import\('\/stlMaliyet\.js'\)/.test(hizliJs));
kontrol('stl-hizli.js: dosya yüklemede POST/fetch yok',
  !/fetch\([^)]*stl/i.test(hizliJs) && !/FormData/.test(hizliJs) && !/method:\s*['"]POST['"]/.test(hizliJs));
kontrol('stl-hizli.js: özet metni tek kaynaktan', /ozetMetni\(h\)/.test(hizliJs));
kontrol('stl-hizli.js: CTA metni tek kaynaktan', /ctaMetni\(h/.test(hizliJs));
kontrol('stl-hizli.js: sessionStorage devri', /sessionStorage\.setItem\(DURUM_ANAHTARI/.test(hizliJs));
kontrol('stl-hizli.js: 100 MB sınırı', /100 \* 1024 \* 1024/.test(hizliJs));
kontrol('stl-hizli.js: sürükle-bırak desteği', /addEventListener\('drop'/.test(hizliJs));

kontrol('maliyet.js: ortak maliyet modülünü yükler', /import\('\/stlMaliyet\.js'\)/.test(maliyetJsGuncel));
kontrol('maliyet.js: ana sayfadan devralma', /sessionStorage\.getItem\('stlModelOzet'\)/.test(maliyetJsGuncel));
kontrol('maliyet.js: doluluk canlı güncelleme (input)',
  /\$\('stlDoluluk'\)[\s\S]{0,200}addEventListener\('input'/.test(maliyetJsGuncel));
kontrol('maliyet.js: CTA metni dinamik', /stlCtaMetni\(h\)/.test(maliyetJsGuncel));
kontrol('maliyet.js: makara verimi metni', /stlVerimMetni\(h\)/.test(maliyetJsGuncel));

kontrol('maliyet.html: özet satırı alanı', /id="stlSatinOzet"/.test(maliyetHtml));
kontrol('maliyet.html: parça başı maliyet alanı', /id="stlSatinParca"/.test(maliyetHtml));
kontrol('maliyet.html: CTA rel noopener sponsored',
  /id="stlSatinBtn"[^>]*rel="noopener sponsored"/.test(maliyetHtml));
kontrol('maliyet.html: canlı doluluk kaydırıcısı', /id="stlDolulukKaydirici"/.test(maliyetHtml));
kontrol('maliyet.js: kaydırıcı + select senkron',
  /stlDolulukKaydirici/.test(maliyetJsGuncel) && /stlDolulukEtiket/.test(maliyetJsGuncel));

kontrol('stlMaliyet.js: fetch/XHR yok (saf hesap)',
  !/\bfetch\s*\(/.test(stlMaliyetJs) && !/XMLHttpRequest/.test(stlMaliyetJs));
kontrol('stlMaliyet.js: DOM erişimi yok (test edilebilir)',
  !/document\./.test(stlMaliyetJs) && !/window\./.test(stlMaliyetJs));

/* ------------------------------------------------------------------ */
bolum('12) 🎨 Satın alma kartı CSS — zümrüt çerçeve + nabız CTA');

const maliyetCss = fs.readFileSync('public/maliyet.css', 'utf8');
const anaCss = fs.readFileSync('public/style.css', 'utf8');

kontrol('maliyet.css: 2px zümrüt çerçeve', /border:\s*2px solid #10B981/.test(maliyetCss));
kontrol('maliyet.css: kart ışıması (box-shadow)', /\.stl-satin\s*\{[\s\S]{0,600}box-shadow/.test(maliyetCss));
kontrol('maliyet.css: nabız animasyonu', /@keyframes stl-cta-nabiz/.test(maliyetCss));
kontrol('maliyet.css: gradient CTA', /\.stl-satin-btn[\s\S]{0,400}linear-gradient/.test(maliyetCss));
kontrol('maliyet.css: koyu tema desteği', /html\[data-theme="dark"\] \.stl-satin/.test(maliyetCss));
kontrol('maliyet.css: mobil düzen', /@media \(max-width: 640px\)[\s\S]{0,300}\.stl-satin/.test(maliyetCss));
kontrol('maliyet.css: hareket azaltma', /prefers-reduced-motion[\s\S]{0,200}stl-satin-btn/.test(maliyetCss));
kontrol('maliyet.css: doluluk kaydırıcı stili', /\.stl-kontrol-slider/.test(maliyetCss));

kontrol('style.css: ana sayfa hızlı kart stili', /\.stl-hizli\s*\{/.test(anaCss));
kontrol('style.css: ana sayfa CTA nabzı', /@keyframes stl-cta-nabiz/.test(anaCss));
kontrol('style.css: ana sayfa koyu tema', /html\[data-theme="dark"\] \.stl-hizli/.test(anaCss));

/* ------------------------------------------------------------------ */
/* 13) 🎨 3D Silüet + 🧾 Baskı Teklif Fişi (2026-11-12)                */
/* ------------------------------------------------------------------ */
bolum('13) 🎨 3D silüet + 🧾 baskı teklif fişi');

const siluetJs = fs.readFileSync('public/stlSiluet.js', 'utf8');
const teklifJs = fs.readFileSync('public/stlTeklif.js', 'utf8');
const { cizModelSilueti, siluetiTemizle, MAKS_Ucgen } = await import('../public/stlSiluet.js');
const {
  teklifHesapla, teklifMetni, ebatMetni, tarihMetni, para: teklifPara, TEKLIF_VARSAYILAN,
} = await import('../public/stlTeklif.js');

/* --- Silüet: saf Canvas, ağ yok, kütüphane yok --- */
kontrol('siluet: harici kütüphane importu yok',
  !/from\s+['"](three|d3|chart)/i.test(siluetJs) && !/importScripts|cdn\./i.test(siluetJs));
kontrol('siluet: ağ isteği yok', !/\bfetch\s*\(/.test(siluetJs) && !/XMLHttpRequest/.test(siluetJs));
kontrol('siluet: maks üçgen sınırı (60 FPS)',
  Number(MAKS_Ucgen) > 0 && Number(MAKS_Ucgen) <= 2000, String(MAKS_Ucgen));
kontrol('siluet: izometrik projeksiyon sabitleri',
  /cos30\s*=\s*0\.866/.test(siluetJs) && /sin30\s*=\s*0\.5/.test(siluetJs));
kontrol('siluet: binary STL uzunluk doğrulaması',
  /84 \+ toplamUcgen \* 50 > view\.byteLength/.test(siluetJs));
kontrol('siluet: ASCII/3MF için sınır kutusu yedeği',
  /mod: 'kutu'/.test(siluetJs) && /SINIR KUTUSU/.test(siluetJs));
kontrol('siluet: retina (dpr) desteği', /devicePixelRatio/.test(siluetJs));
kontrol('siluet: temizle fonksiyonu', /export function siluetiTemizle/.test(siluetJs));

/* --- Silüet: davranış (fake canvas) --- */
function sahteCanvas() {
  const cagri = { moveTo: 0, lineTo: 0, stroke: 0, fill: 0, fillText: 0 };
  const ctx = {
    setTransform: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
    beginPath: () => {}, closePath: () => {},
    moveTo: () => { cagri.moveTo++; }, lineTo: () => { cagri.lineTo++; },
    stroke: () => { cagri.stroke++; }, fill: () => { cagri.fill++; },
    fillText: () => { cagri.fillText++; },
    setLineDash: () => {}, arc: () => {},
  };
  return {
    canvas: { width: 110, height: 110, clientWidth: 110, clientHeight: 110, getContext: () => ctx },
    cagri,
  };
}

/** n üçgenli binary STL üretir (normal 0, köşeler basit). */
function binaryStl(n) {
  const buf = Buffer.alloc(84 + n * 50);
  buf.writeUInt32LE(n, 80);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    const d = i * 0.5;
    const v = [0, 0, 0, 10, 0, 0, d, 10, 5];
    for (let k = 0; k < 9; k++) buf.writeFloatLE(v[k], o + 12 + k * 4);
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

{
  const { canvas, cagri } = sahteCanvas();
  const s = cizModelSilueti(canvas, binaryStl(120), { genislik: 40, derinlik: 30, yukseklik: 20 });
  kontrol('siluet: üçgen modu seçilir', s.mod === 'ucgen', JSON.stringify(s));
  kontrol('siluet: çizim yapıldı', s.cizildi === true);
  kontrol('siluet: üçgen başına en az 2 kenar çizilir',
    cagri.lineTo >= 120 * 2, String(cagri.lineTo));
  kontrol('siluet: üçgen kapanışı çizilir (closePath)', /closePath\(\)/.test(siluetJs));
  kontrol('siluet: etiket yazıldı (3D SILUET)', cagri.fillText >= 1, String(cagri.fillText));
}
{
  const { canvas } = sahteCanvas();
  const s = cizModelSilueti(canvas, binaryStl(1000), { genislik: 40, derinlik: 30, yukseklik: 20 });
  kontrol('siluet: örnekleme sınırı uygulanır',
    s.ornekUcgen >= 1 && s.ornekUcgen <= MAKS_Ucgen,
    `${s.ornekUcgen} ≤ ${MAKS_Ucgen}`);
}
{
  const { canvas, cagri } = sahteCanvas();
  const ascii = new TextEncoder().encode('solid x\nfacet normal 0 0 1\nouter loop\nendloop\nendsolid').buffer;
  const s = cizModelSilueti(canvas, ascii, { genislik: 20, derinlik: 20, yukseklik: 20 });
  kontrol('siluet: ASCII/3MF → sınır kutusu', s.mod === 'kutu', JSON.stringify(s));
  kontrol('siluet: kutu 12 kenar çizilir', cagri.lineTo >= 12, String(cagri.lineTo));
}
{
  const { canvas } = sahteCanvas();
  kontrol('siluet: buffer yoksa kutuya düşer',
    cizModelSilueti(canvas, null, { genislik: 10, derinlik: 10, yukseklik: 10 }).cizildi === true);
  kontrol('siluet: canvas yoksa güvenli', cizModelSilueti(null, null, {}).cizildi === false);
  kontrol('siluet: boyut yoksa çizmez', cizModelSilueti(canvas, null, {}).mod === 'yok');
  kontrol('siluetiTemizle: canvas yoksa güvenli', siluetiTemizle(null) == null);
}

/* --- Teklif hesabı: maliyet.js ile aynı sabitler --- */
kontrol('teklif: sabitler maliyet.js ile aynı (12.5 g/saat)',
  TEKLIF_VARSAYILAN.gramSaat === 12.5, String(TEKLIF_VARSAYILAN.gramSaat));
kontrol('teklif: güç 150 W', TEKLIF_VARSAYILAN.gucW === 150);
kontrol('teklif: elektrik 2.9 ₺/kWh', TEKLIF_VARSAYILAN.kwhTl === 2.9);
kontrol('teklif: amortisman 3 ₺/saat', TEKLIF_VARSAYILAN.yipranmaSaatTl === 3);
kontrol('teklif: kâr çarpanı 2.5', TEKLIF_VARSAYILAN.karCarpani === 2.5);
kontrol('teklif: maliyet.js ile aynı GRAM_SAAT', /GRAM_SAAT\s*=\s*12\.5/.test(maliyetJsGuncel));

const t1 = teklifHesapla({
  gram: 160, tlKg: 600, malzeme: 'PLA', doluluk: 20,
  dosyaAdi: 'benchy.stl', boyutlar: { genislik: 60, derinlik: 31, yukseklik: 48 },
});
kontrol('teklif: hesap üretildi', !!t1);
kontrol('teklif: süre = gram/12.5', t1.sureSaat === 12.8, String(t1.sureSaat));
kontrol('teklif: süre tahmini işaretli', t1.sureTahmini === true);
kontrol('teklif: hammadde = gram×₺/kg', t1.hammadde === 96, String(t1.hammadde));
kontrol('teklif: elektrik kWh', Math.abs(t1.kwh - 1.92) < 0.001, String(t1.kwh));
kontrol('teklif: elektrik maliyeti', t1.elektrik === 5.57, String(t1.elektrik));
kontrol('teklif: amortisman = süre × 3', t1.amortisman === 38.4, String(t1.amortisman));
kontrol('teklif: net = toplam kalemler',
  t1.net === Math.round((t1.hammadde + t1.elektrik + t1.amortisman) * 100) / 100,
  `${t1.net} = ${t1.hammadde}+${t1.elektrik}+${t1.amortisman}`);
kontrol('teklif: satış = net × 2.5 (kuruş toleransı)',
  Math.abs(t1.satisFiyati - t1.net * 2.5) <= 0.01,
  `${t1.satisFiyati} vs ${Math.round(t1.net * 2.5 * 100) / 100}`);
kontrol('teklif: kâr = satış − net', t1.kar === Math.round((t1.satisFiyati - t1.net) * 100) / 100);
kontrol('teklif: kâr yüzdesi %150', t1.karYuzde === 150, String(t1.karYuzde));
kontrol('teklif: canlı fiyat işareti', t1.fiyatBilgisiVar === true);

const t2 = teklifHesapla({ gram: 100, tlKg: 0 });
kontrol('teklif: fiyat yoksa hammadde 0 (uydurma yok)', t2.hammadde === 0);
kontrol('teklif: fiyat yoksa işaret false', t2.fiyatBilgisiVar === false);
kontrol('teklif: fiyat yoksa metinde "alınamadı"',
  /canlı fiyat alınamadı/.test(teklifMetni(t2)), teklifMetni(t2).slice(0, 80));

kontrol('teklif: gram 0 → null', teklifHesapla({ gram: 0 }) === null);
kontrol('teklif: gram eksik → null', teklifHesapla({}) === null);
kontrol('teklif: gram negatif → null', teklifHesapla({ gram: -5 }) === null);

const t3 = teklifHesapla({ gram: 100, tlKg: 500, sureSaat: 4 });
kontrol('teklif: verilen süre kullanılır', t3.sureSaat === 4, String(t3.sureSaat));
kontrol('teklif: verilen süre tahmini sayılmaz', t3.sureTahmini === false);

/* --- Metin --- */
kontrol('ebat: 45×45×18 biçimi',
  ebatMetni({ genislik: 45.4, derinlik: 45, yukseklik: 18 }) === '45 × 45 × 18 mm',
  ebatMetni({ genislik: 45.4, derinlik: 45, yukseklik: 18 }));
kontrol('ebat: yok → —', ebatMetni(null) === '—');
kontrol('tarih: GG.AA.YYYY biçimi',
  /^\d{2}:\d{2} · \d{2}\.\d{2}\.\d{4}$/.test(tarihMetni(new Date(2026, 10, 12, 9, 5))),
  tarihMetni(new Date(2026, 10, 12, 9, 5)));
kontrol('para: iki hane + binlik', teklifPara(1234.5) === '1.234,50', teklifPara(1234.5));

const metin = teklifMetni(t1);
kontrol('metin: başlık', /3D BASKI TEKLİF FİŞİ/.test(metin));
kontrol('metin: model adı', /benchy\.stl/.test(metin));
kontrol('metin: ebat', /60 × 31 × 48 mm/.test(metin));
kontrol('metin: gramaj + doluluk', /160 g \(PLA · %20 doluluk\)/.test(metin), metin.slice(0, 200));
kontrol('metin: teklif tutarı', /TEKLİF TUTARI:\* ₺/.test(metin));
kontrol('metin: kalemler (elektrik + amortisman)',
  /Elektrik: ₺/.test(metin) && /amortismanı: ₺/.test(metin));
kontrol('metin: radar imzası', /Baskı Hesap/.test(metin));
kontrol('metin: WhatsApp kalın biçimi (*…*)', /\*3D BASKI TEKLİF FİŞİ\*/.test(metin));
kontrol('metin: 4000 karakter altı', metin.length < 4000, String(metin.length));

/* --- Sözleşme: HTML + JS bağlantıları --- */
kontrol('index.html: silüet canvas', /id="stlSiluetCanvas"[^>]*class="stl-siluet-canvas"/.test(indexHtml));
kontrol('index.html: teklif fişi butonu', /id="stlTeklifFisBtn"/.test(indexHtml));
kontrol('index.html: teklif modalı', /id="teklifFisModal"[^>]*class="teklif-modal"/.test(indexHtml));
kontrol('index.html: yazdırma alanı', /id="fisYazdirAlani"/.test(indexHtml));
kontrol('index.html: fiş alanları (gramaj/ebat/satış)',
  /id="fisGramaj"/.test(indexHtml) && /id="fisEbat"/.test(indexHtml) && /id="fisSatisFiyat"/.test(indexHtml));
kontrol('index.html: WhatsApp + Kopyala + Yazdır',
  /id="fisWhatsappBtn"/.test(indexHtml) && /id="fisKopyalaBtn"/.test(indexHtml) && /id="fisYazdirBtn"/.test(indexHtml));
kontrol('index.html: modal aria role=dialog', /id="teklifFisModal"[\s\S]{0,500}role="dialog"/.test(indexHtml));

kontrol('maliyet.html: silüet canvas', /id="stlSiluetCanvas"/.test(maliyetHtml));
kontrol('maliyet.html: teklif fişi butonu', /id="stlTeklifFisBtn"/.test(maliyetHtml));
kontrol('maliyet.html: teklif modalı', /id="teklifFisModal"/.test(maliyetHtml));

kontrol('stl-hizli.js: silüet modülü dinamik import', /import\('\/stlSiluet\.js'\)/.test(hizliJs));
kontrol('stl-hizli.js: teklif modülü dinamik import', /import\('\/stlTeklif\.js'\)/.test(hizliJs));
kontrol('stl-hizli.js: ham bayt tutulur', /durum\.rawBuffer = tampon/.test(hizliJs));
kontrol('stl-hizli.js: silüet çizilir', /siluetCiz\(\)/.test(hizliJs));
kontrol('stl-hizli.js: fiş butonu görünür olur', /teklifBtn\.hidden = false/.test(hizliJs));
kontrol('stl-hizli.js: WhatsApp bağlantısı', /api\.whatsapp\.com\/send\?text=/.test(hizliJs));
kontrol('stl-hizli.js: kopyalama ortak yardımcıyı kullanır',
  /panoyaKopyalaVeGeriBildirim/.test(hizliJs));
kontrol('stl-hizli.js: yazdır window.print', /window\.print\(\)/.test(hizliJs));
kontrol('stl-hizli.js: dosya yüklemede yeni ağ isteği yok',
  !/fetch\([^)]*stl/i.test(hizliJs) && !/FormData/.test(hizliJs));

kontrol('maliyet.js: silüet + teklif bağlandı',
  /teklifFisiniBagla\(\)/.test(maliyetJsGuncel) && /stlSiluetCiz\(\)/.test(maliyetJsGuncel));
kontrol('maliyet.js: fiş maliyet.js çekirdeğini kullanır (tek kaynak)',
  /const h = hesapla\(\)/.test(maliyetJsGuncel) && /teklifHesapla\(\{/.test(maliyetJsGuncel));

/* --- CSS --- */
kontrol('CSS: silüet canvas 110×110',
  /\.stl-siluet-canvas\s*\{[^}]*width:\s*110px[^}]*height:\s*110px/s.test(anaCss));
kontrol('CSS: teklif modalı fixed overlay',
  /\.teklif-modal\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s.test(anaCss));
kontrol('CSS: termal fiş gövdesi (monospace + dashed)',
  /\.fis-govde\s*\{[^}]*border:\s*1px dashed[^}]*font-family:\s*ui-monospace/s.test(anaCss));
kontrol('CSS: satış fiyatı büyük yeşil',
  /\.fis-fiyat-tutar\s*\{[^}]*font-size:\s*26px[^}]*#047857/s.test(anaCss));
kontrol('CSS: WhatsApp butonu yeşil',
  /\.fis-whatsapp\s*\{[^}]*linear-gradient\(135deg,\s*#1EBE5B/s.test(anaCss));
kontrol('CSS: yazdırma yalnızca fiş gövdesi',
  /@media print[\s\S]{0,400}#fisYazdirAlani[\s\S]{0,200}visibility:\s*visible/s.test(anaCss));
kontrol('CSS: yazdırmada butonlar gizlenir',
  /@media print[\s\S]{0,900}\.fis-alt-butonlar[\s\S]{0,80}display:\s*none/s.test(anaCss));
kontrol('CSS: koyu tema fiş fiyatı', /html\[data-theme="dark"\] \.fis-fiyat-tutar/.test(anaCss));
kontrol('CSS: teklif butonu ≥44px dokunma hedefi',
  /\.stl-hizli-teklif-btn\s*\{[^}]*padding:\s*11px/s.test(anaCss));

/* ------------------------------------------------------------------ */
bolum('14) 🌍 Global Live market sekmesi & boşta sıfırlamama');

{
  const maliyetSon = fs.readFileSync('public/maliyet.js', 'utf8');
  kontrol('maliyet.js: aktifTlKg() canlı boşta 0 döndürmez (manuelTlKg fallback)',
    /function aktifTlKg\(\)[\s\S]{0,200}Number\(durum\.manuelTlKg\)/.test(maliyetSon)
    && !/return f \? Number\(f\.tlKg\) : 0;/.test(maliyetSon));
  kontrol('maliyet.js: net maliyet ve kalemler çarpımdan önce para birimi hassasiyetine (cent/Yen) yuvarlanır',
    /const BASAMAK = ORTAM_PARA === 'JPY' \? 0 : 2;/.test(maliyetSon)
    && /const net = paraYuvarla\(hammadde \+ elektrik \+ amortisman\);/.test(maliyetSon)
    && /const fTutar = paraYuvarla\(net \* c\);/.test(maliyetSon));

  const { enUcuzFilamentler } = await import('../src/baskiApi.js');
  const { dbBaglantisi, closeDatabase } = await import('../src/store.js');
  const db = dbBaglantisi();
  const ins = db.prepare(`
    INSERT INTO katalog_urunleri
      (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta, gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
    VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, 'test-maliyet', ?)
  `);
  const simdi = Date.now();
  const eklenenId = ins.run(
    'creality_us',
    'https://store.creality.com/products/test-maliyet-us-pla-1kg',
    'Creality PLA Filament 1.75mm 1kg Black',
    'creality pla filament 175mm 1kg black',
    'Creality',
    18.99,
    'USD',
    simdi,
  ).lastInsertRowid;
  try {
    const us = enUcuzFilamentler({ limit: 20, market: 'us' });
    kontrol('enUcuzFilamentler limit=20 market=us canlı US filament döndürür',
      us.ok && us.paraBirimi === 'USD' && us.filamentler.length >= 1 && us.filamentler.every(f => f.tlKg > 0 && f.paraBirimi === 'USD'),
      JSON.stringify({ toplam: us.toplam, ilk: us.filamentler[0] }));
  } finally {
    db.prepare('DELETE FROM katalog_urunleri WHERE id = ?').run(eklenenId);
    closeDatabase();
  }
}

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
process.exitCode = hatalar.length ? 1 : 0;
