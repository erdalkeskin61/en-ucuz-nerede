/**
 * 📉 Fiyat trend grafiği — tek giriş noktası (2026-11-03)
 *
 * Neden ayrı modül?
 *   `src/grafik.js` saf çizim/PNG kodlayıcıdır (veri bilmez). Bu modül ise
 *   SQLite'tan **gerçek** fiyat geçmişini okur, iki kaynağı (radar_gecmis +
 *   price_history) birleştirir ve Telegram'a gönderilebilecek PNG'yi üretir.
 *   Böylece radar kartları, kişisel alarmlar ve testler aynı davranışı kullanır.
 *
 * DÜRÜSTLÜK KURALLARI:
 *   - Grafikte UYDURMA nokta yoktur; yalnızca kayıtlı gözlemler çizilir.
 *   - 2'den az nokta varsa `null` döner; çağıran taraf metin kartına düşer
 *     (graceful fallback). Hata fırlatmaz.
 *   - 90 günden eski kayıtlar `fiyatSerisi` tarafından elenir.
 */
import { dbBaglantisi, getPriceHistory } from './store.js';
import { fiyatSerisi, grafikOzeti, grafikPng } from './grafik.js';

/**
 * Bir ürünün grafik için birleşik fiyat serisini toplar.
 *
 * @param {{
 *   katalogId?: number|string,  // radar kataloğu kimliği → radar_gecmis
 *   productId?: string,        // price_history ürün kimliği (pid / modelKodu)
 *   gun?: number,              // pencere (varsayılan 90)
 *   simdi?: number,
 * }} [opts]
 * @returns {{seri: Array<{ts:number, fiyat:number}>, ozet: object|null, kaynaklar: string[]}}
 */
export function fiyatGrafigiVerisi(opts = {}) {
  const gun = Number.isFinite(opts.gun) ? Math.max(1, opts.gun) : 90;
  const simdi = Number.isFinite(opts.simdi) ? opts.simdi : Date.now();
  const esik = simdi - gun * 86400000;
  const noktalar = [];
  const kaynaklar = [];

  const katalogId = Number(opts.katalogId);
  let db = null;
  try { db = dbBaglantisi(); } catch { db = null; }

  // 1) Radar geçmişi — saatlik otomatik taramalar.
  if (db && Number.isFinite(katalogId) && katalogId > 0) {
    try {
      const satirlar = db.prepare(`
        SELECT ts, fiyat FROM radar_gecmis
        WHERE katalog_id = ? AND fiyat IS NOT NULL AND fiyat > 0 AND ts >= ?
        ORDER BY ts ASC
      `).all(katalogId, esik);
      for (const r of satirlar) {
        const ts = Number(r.ts);
        const fiyat = Number(r.fiyat);
        if (Number.isFinite(ts) && ts > 0 && Number.isFinite(fiyat) && fiyat > 0) {
          noktalar.push({ ts, fiyat });
        }
      }
      if (satirlar.length) kaynaklar.push('radar_gecmis');
    } catch { /* tablo yoksa sessizce geç */ }
  }

  // 2) Web taramaları — price_history. Ürün kimliği verilmediyse radar
  //    durumundaki `pid` üzerinden çözülür.
  let productId = String(opts.productId ?? '').trim();
  if (!productId && db && Number.isFinite(katalogId) && katalogId > 0) {
    try {
      const r = db.prepare('SELECT veri FROM radar_durum WHERE anahtar = ?')
        .get(`katalog:${katalogId}`);
      const pid = r?.veri ? JSON.parse(r.veri)?.pid : null;
      if (pid) productId = String(pid);
    } catch { /* pid yoksa yalnızca radar geçmişi kullanılır */ }
  }

  if (productId) {
    try {
      const satirlar = getPriceHistory(productId, 2000) || [];
      for (const r of satirlar) {
        const ts = Date.parse(r.ts);
        const fiyat = Number(r.net_price ?? r.price);
        if (!Number.isFinite(ts) || ts < esik) continue;
        if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
        noktalar.push({ ts, fiyat });
      }
      if (satirlar.length) kaynaklar.push('price_history');
    } catch { /* tablo yoksa sessizce geç */ }
  }

  // Fiyat serisi: zamana göre sıralar, aynı zaman damgasını tekilleştirir,
  // 90 gün penceresini uygular ve 2'den az noktada boş dizi döner.
  const seri = fiyatSerisi(noktalar, { gun, simdi, minNokta: 2 });
  return { seri, ozet: grafikOzeti(seri), kaynaklar: [...new Set(kaynaklar)] };
}

/**
 * Telegram `sendPhoto` için PNG üretir.
 *
 * @param {{
 *   katalogId?: number|string, productId?: string, gun?: number, simdi?: number,
 *   genislik?: number, yukseklik?: number
 * }} [opts]
 * @returns {{png: Buffer, seri: Array, ozet: object, kaynaklar: string[], bayt: number}|null}
 *   2'den az gerçek gözlem varsa `null`.
 */
export function fiyatGrafigiUret(opts = {}) {
  const { seri, ozet, kaynaklar } = fiyatGrafigiVerisi(opts);
  if (!seri.length) return null;
  let png = null;
  try {
    png = grafikPng(seri, { genislik: opts.genislik, yukseklik: opts.yukseklik });
  } catch {
    png = null;
  }
  if (!png || !png.length) return null;
  return { png, seri, ozet, kaynaklar, bayt: png.length };
}

export default fiyatGrafigiUret;
