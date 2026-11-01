/**
 * 🔗 Link ile arama çözümleyicisi — 2026-10-31
 *
 * Hibrit arama kutusuna yapıştırılan bağlantıyı çözer:
 *  - şemasız yazılmış adresleri (trendyol.com/...) https:// ile tamamlar,
 *  - yalnızca http/https kabul eder (javascript:, file: reddedilir),
 *  - bağlantının hangi desteklenen mağazaya ait olduğunu söyler,
 *  - ürün adresinden okunabilir bir arama sorgusu çıkarır (URL slug'ından).
 *
 * "Linkte ara" iki anlamda kullanılır:
 *  1) Desteklenen sitedeki ürün linki → 60+ mağazada aynı ürünü karşılaştır.
 *  2) Site desteklenmiyorsa → slug'dan çıkarılan ürün adıyla öneri/arama akışı.
 *
 * Dürüstlük: slug'dan ürün adı çıkarılamazsa uydurma sorgu ÜRETİLMEZ; null döner.
 */
import { detectSite } from './sites/index.js';

/** URL'yi http(s) biçimine getirir; geçersizse null. */
export function urlNormallestir(ham) {
  let s = String(ham || '').trim();
  if (!s) return null;
  // Çevresel tırnak/parantezler (kopyala-yapıştır kaynaklı)
  s = s.replace(/^[<("'\[]+/, '').replace(/[>)"'\]]+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    // Şemasız ama alan adı gibi görünüyorsa tamamla.
    if (!/^[\p{L}\d.-]+\.[a-z]{2,}(?:[/:?#]|$)/iu.test(s)) return null;
    s = 'https://' + s;
  }
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || !u.hostname.includes('.')) return null;
  // Fragment önbellek anahtarını etkilemez; kullanıcıya daha temiz adres gösterilir.
  u.hash = '';
  return u.toString();
}

/** Bir metnin link olarak değerlendirilip değerlendirileceğini söyler. */
export function linkMi(metin) {
  return urlNormallestir(metin) != null;
}

const GURULTU = new Set([
  'urun', 'product', 'products', 'p', 'item', 'detay', 'detail', 'sayfa', 'page',
  'tr', 'en', 'www', 'html', 'htm', 'php', 'aspx', 'asp', 'jsp',
  'ref', 'amp', 'index', 'kategori', 'category', 'magaza', 'store', 'shop',
]);

/**
 * URL yolundan okunabilir ürün arama sorgusu çıkarır.
 * Örn. /logitech-g102-p-123 → "logitech g102"
 *      /urun/esun-pla-basic-filament-1-75mm-1kg-1143 → "esun pla basic filament 1 75mm 1kg"
 *
 * @returns {string|null} güvenilir sorgu yoksa null
 */
export function urundenSorguCikar(url) {
  const norm = urlNormallestir(url);
  if (!norm) return null;
  let u;
  try { u = new URL(norm); } catch { return null; }

  // Yol + (varsa) ürün adı taşıyan sorgu parametreleri
  let kaynak = decodeURIComponent(u.pathname || '');
  for (const [k, v] of u.searchParams.entries()) {
    if (/^(?:q|query|search|s|kelime|ara|text)$/i.test(k) && v) kaynak += ' ' + v;
  }

  // Türkçe karakterleri koru; ayırıcıları boşluğa çevir.
  const parcalar = kaynak
    .replace(/\.(?:html?|php|aspx?|jsp)$/i, ' ')
    .replace(/[-_+/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean);

  const temiz = [];
  for (const p of parcalar) {
    const kucuk = p.toLowerCase();
    if (GURULTU.has(kucuk)) continue;
    // Yalnızca sayı/uzun kimlik (12345, hbcv0000123) olan parçalar ürün adı değildir.
    if (/^\d+$/.test(p) && p.length > 1) continue;
    if (/^(?:hbcv|hbv|p|sku|mpn)[\d-]{4,}$/i.test(p)) continue;
    if (p.length > 42) continue;
    temiz.push(p);
    if (temiz.length >= 12) break;
  }
  const sorgu = temiz.join(' ').trim();
  // En az 2 karakterli, en az bir harf içeren anlamlı bir metin olmalı.
  if (sorgu.length < 2 || !/\p{L}/u.test(sorgu)) return null;
  return sorgu;
}

/**
 * Bir linki "linkte ara" akışı için çözer.
 *
 * @param {string} hamUrl
 * @returns {{
 *   ok:boolean, neden?:'bos'|'gecersiz'|'desteklenmiyor',
 *   url?:string, host?:string, site?:{id:string,name:string}|null,
 *   destekleniyor?:boolean, urunAdi?:string|null, mesaj?:string
 * }}
 */
export function linkCoz(hamUrl) {
  const metin = String(hamUrl || '').trim();
  if (!metin) return { ok: false, neden: 'bos', mesaj: 'Bir ürün linki yapıştırın.' };

  const url = urlNormallestir(metin);
  if (!url) {
    return {
      ok: false,
      neden: 'gecersiz',
      mesaj: 'Bu bir ürün linki gibi görünmüyor. Örnek: https://www.trendyol.com/urun-adi-p-123',
    };
  }

  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* yukarıda doğrulandı */ }
  const adapter = detectSite(url);
  const urunAdi = urundenSorguCikar(url);

  if (!adapter) {
    return {
      ok: false,
      neden: 'desteklenmiyor',
      url,
      host,
      site: null,
      destekleniyor: false,
      urunAdi,
      mesaj: `${host} şu anda desteklenen mağazalar arasında değil.`
        + (urunAdi ? ` Linkteki ürün adıyla ("${urunAdi}") arama yapabilirsiniz.` : ''),
    };
  }

  return {
    ok: true,
    url,
    host,
    site: { id: adapter.id, name: adapter.name },
    destekleniyor: true,
    urunAdi,
    mesaj: `${adapter.name} linki algılandı — aynı ürün 60+ mağazada aranacak.`,
  };
}
