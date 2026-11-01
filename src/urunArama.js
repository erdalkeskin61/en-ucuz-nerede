/**
 * ⚡ Hızlı Kaynak Ürün Arama Modñlü (2026-11-01)
 *
 * Amaç: Kullanıcı bir link yerine doğrudan ürün adı yazdığında örn: "eSun PLA+",
 * "iPhone 15", "Bambu Lab P1S"), en uygun kaynak ürün URL'sini 1-3 saniyede bulup
 * tek bir tam karş�laştırma akışına yönlendirmek.
 */
import { adapterById } from './sites/index.js';
import { titleSimilarity } from './util.js';

// Bellek içi hızlı önbellek (aynı arama tekrarlanırsa 0 ms)
const KAYNAK_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

const _3D_KELIMELER = /\b(filament|pla|petg|abs|tpu|reçine|recine|resin|ender|bambu|creality|elegoo|anycubic|prusa|nozzle|hotend|extruder|tabla|3d|yazıcı|yazici)\b/i;

export function dogalDilTavsiyeMi(metin) {
  if (!metin || typeof metin !== 'string') return false;
  const s = metin.trim().toLocaleLowerCase('tr-TR');
  const tavsiyeKelimeleri = /\b(büt`å|bütçem|bütçeli|öneri|önerir|öner|tavsiye|tavsiyesi|almak istiyorum|hangisi|hangisini|en iyi|ne alabiririm|kararsızım|fikir ver|hangisini almalıyım)\b/i;
  if (tavsiyeKelimeleri.test(s)) return true;
  const kelimeler = s.split(/\s+/).filter(Boolean);
  if (s.includes('?') && kelimeler.length >= 4) return true;
  if (kelimeler.length >= 9) return true;
  return false;
}

export function sorguPuanla(urunBaslik, sorgu) {
  if (!urunBaslik || !sorgu) return 0;
  const b = String(urunBaslik).toLocaleLowerCase('tr-TR');
  const s = String(sorgu).toLocaleLowerCase('tr-TR');
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

export async function hizliKaynakUrunBul(sorgu, { timeoutMs = 3500 } = {}) {
  const temizSorgu = String(sorgu || '').trim();
  if (!temizSorgu || temizSorgu.length < 2) return null;

  const key = temizSorgu.toLocaleLowerCase('tr-TR');
  const cached = KAYNAK_CACHE.get(key);
  if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
    return cached.urun;
  }

  const is3D = _3D_KELIMELER.test(temizSorgu);
  const hedefSiteler = is3D
    ? ['trendyol', 'hepsiburada', 'robotistan', '3dmarketim', 'samm']
    : ['trendyol', 'hepsiburada', 'amazon', 'n11', 'vatan', 'mediamarkt'];

  const sureli = (promise, ms) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('zaman aşımı')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });

  const istekler = hedefSiteler.map(async (siteId) => {
    try {
      const adapter = adapterById(siteId);
      if (!adapter || typeof adapter.searchProducts !== 'function') return [];
      const sonuclar = await sureli(adapter.searchProducts(temizSorgu, { spend: 0 }), timeoutMs);
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
  const puanli = tumAdaylar
    .filter(a => a && a.url && a.title && Number(a.price) > 0)
    .map(a => ({
      ...a,
      puan: sorguPuanla(a.title, temizSorgu),
    }))
    .filter(a => a.puan >= 0.35)
    .sort((a, b) => b.puan - a.puan);

  const enIyi = puanli[0] || null;
  if (enIyi) {
    KAYNAK_CACHE.set(key, { ts: Date.now(), urun: enIyi });
  }
  return enIyi;
}
