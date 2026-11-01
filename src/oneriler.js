/**
 * 🔍 Arama önerileri (typeahead) — 2026-11-01
 *
 * Kaynaklar (hepsi YEREL, ağ isteği yok):
 *  1) Popüler 3D yazıcı / filament / teknoloji modelleri (statik, gerçek ürün adları)
 *  2) Kayıtlı arama geçmişi (SQLite `history`)
 *  3) Takip edilen ürünler (SQLite `tracked`)
 *
 * Performans: dinamik kaynaklar 60 sn bellekte önbelleklenir; sorgu yalnızca
 * dizi üzerinde puanlama yapar. Hedef < 15 ms (ölçüm endpoint'te döner).
 *
 * DÜRÜSTLÜK: öneri metinleri uydurulmaz; geçmiş/takip kayıtlarından ya da
 * tanımlı popüler ürün listesinden gelir. Eşleşme yoksa boş dizi döner.
 */
import { getHistory, getTracked, dbBaglantisi } from './store.js';

/** Gerçek, yaygın ürün adları (statik öneri havuzu). */
export const POPULER_URUNLER = Object.freeze([
  // 3D yazıcılar (FDM)
  'Bambu Lab P1S',
  'Bambu Lab A1 Mini',
  'Bambu Lab A1',
  'Bambu Lab X1-Carbon',
  'Creality K1 Max',
  'Creality K1',
  'Creality Ender 3 V3',
  'Anycubic Kobra 2',
  'Anycubic Kobra X',
  'Anycubic Kobra 2 Pro',
  'Prusa MK4S',
  'Flashforge Creator 5',
  // Reçine yazıcılar
  'Elegoo Saturn 4',
  'Elegoo Saturn 4 Ultra',
  'Elegoo Mars 5 Ultra',
  // Filament markaları / modelleri
  'eSun PLA+ Siyah',
  'eSun PLA+',
  'eSun PETG',
  'eSun TPU 95A',
  'Porima PLA',
  'Microzey PLA',
  'Bambu Lab PLA Basic',
  'Polymaker PolyTerra PLA',
  'Sunlu PETG',
  'Creality Hyper PLA',
  'Anycubic PLA',
  'Devil Design PLA',
  'Filamentum PLA Extrafill',
  // Kategoriler
  'PLA Filament',
  'PETG Filament',
  'TPU Filament',
  'ABS Filament',
  'Karbon Fiber Filament',
  'Reçine',
  // Reçine markaları
  'Anycubic Water Washable Reçine',
  'Elegoo Standard Reçine',
  'Siraya Tech Blu',
  // Ekipman / aksesuar
  'Sunlu Filament Kurutucu',
  // Teknoloji
  'AirPods Pro 2',
  'Logitech G102',
  'iPhone 15',
  'Samsung 990 Pro',
  'Anker Powerbank',
]);

const ONBELLEK_MS = 60 * 1000;
let dinamikOnbellek = { ts: 0, kayitlar: [] };

/** Türkçe küçük harfe çevirir (İ→i, I→ı). */
export function kucult(s) {
  return String(s ?? '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

/** Karşılaştırma için sadeleştirir: boşluk/noktalama ve birim farklarını atar. */
function sadeleştir(s) {
  return kucult(s).replace(/[\s\-_+/.,()]+/g, '');
}

/**
 * Sorgu–aday puanı. Yüksek puan önce gelir.
 * 100 tam eşleşme · 80 baştan · 60 kelime başı · 45 içerir · 25 sadeleşmiş içerir
 */
export function puanla(metin, sorgu) {
  const m = kucult(metin);
  const q = kucult(sorgu);
  if (!q) return 0;
  if (m === q) return 100;
  if (m.startsWith(q)) return 80;
  const kelimeler = m.split(/[\s\-_+/.,()]+/).filter(Boolean);
  if (kelimeler.some((k) => k.startsWith(q))) return 60;
  if (m.includes(q)) return 45;
  const ms = sadeleştir(metin);
  const qs = sadeleştir(sorgu);
  if (qs && ms.includes(qs)) return 25;
  return 0;
}

/** Dinamik kayıtları (geçmiş + takip) TTL'li önbellekle toplar. */
function dinamikKayitlar() {
  const simdi = Date.now();
  if (simdi - dinamikOnbellek.ts < ONBELLEK_MS && dinamikOnbellek.kayitlar.length) {
    return dinamikOnbellek.kayitlar;
  }
  const kayitlar = [];
  const gorulen = new Set();

  const ekle = (metin, tur, url, etiket) => {
    const m = String(metin || '').trim();
    if (m.length < 2) return;
    const anahtar = kucult(m);
    if (gorulen.has(anahtar)) return;
    gorulen.add(anahtar);
    kayitlar.push({ metin: m.slice(0, 120), tur, url: url || null, etiket });
  };

  try {
    for (const h of getHistory()) {
      if (h?.urun) ekle(h.urun, 'gecmis', h.url || null, 'Son arama');
    }
  } catch { /* tablo yoksa yoksay */ }

  try {
    for (const t of getTracked()) {
      if (!t?.urun) continue;
      const url = Array.isArray(t.urunler) && t.urunler[0]?.url ? t.urunler[0].url : null;
      ekle(t.urun, 'takip', url, 'Takipte');
    }
  } catch { /* tablo yoksa yoksay */ }

  // 📚 Daha önce TARANMIŞ ürün başlıkları (snapshot tablosu).
  // SQLite LIKE Türkçe büyük/küçük harfte güvenilir değildir; bu yüzden
  // son N başlık bir kez okunur ve Türkçe-duyarlı filtre bellekte yapılır.
  // (Sorgu başına disk okuması yok → <10 ms hedefi korunur.)
  try {
    const db = dbBaglantisi();
    const satirlar = db.prepare(`
      SELECT urun, anahtar FROM snapshot
      WHERE urun IS NOT NULL AND length(urun) > 3
      ORDER BY ts DESC LIMIT 400
    `).all();
    for (const s of satirlar) ekle(s.urun, 'tarama', null, 'Taranmış');
  } catch { /* tablo yoksa yoksay */ }

  dinamikOnbellek = { ts: simdi, kayitlar };
  return kayitlar;
}

/** Test/kapanış için önbelleği temizler. */
export function oneriOnbelleginiTemizle() {
  dinamikOnbellek = { ts: 0, kayitlar: [] };
}

/**
 * Sorguya uygun önerileri döndürür.
 *
 * @param {string} sorgu
 * @param {{limit?:number, bosSorguPopuler?:boolean}} [opts]
 * @returns {Array<{metin:string, tur:string, etiket:string, url:string|null}>}
 */
export function onerileriGetir(sorgu, opts = {}) {
  const q = String(sorgu || '').trim().slice(0, 80);
  const limit = Math.max(1, Math.min(Number(opts.limit) || 8, 20));

  const havuz = [
    ...POPULER_URUNLER.map((m) => ({ metin: m, tur: 'populer', url: null, etiket: 'Popüler' })),
    ...dinamikKayitlar(),
  ];

  // Boş sorgu: popüler listeyi döndür (odaklanınca kutu boş kalmasın).
  if (!q) {
    return opts.bosSorguPopuler === false
      ? []
      : havuz.filter((x) => x.tur === 'populer').slice(0, limit);
  }

  const puanli = [];
  for (let i = 0; i < havuz.length; i++) {
    const aday = havuz[i];
    const p = puanla(aday.metin, q);
    if (!p) continue;
    // Dinamik kayıtlar (kullanıcının kendi araması) eşit puanda öne geçsin.
    const ekPuan = aday.tur === 'gecmis' ? 6 : (aday.tur === 'takip' ? 8 : 0);
    puanli.push({ ...aday, _puan: p + ekPuan, _sira: i });
  }

  // Eşit puanda katalog sırası korunur ("bamb" → önce Bambu Lab P1S).
  puanli.sort((a, b) => b._puan - a._puan || a._sira - b._sira || a.metin.localeCompare(b.metin, 'tr'));
  return puanli.slice(0, limit).map(({ _puan, _sira, ...k }) => k);
}
