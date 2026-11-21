/**
 * ⚡ IndexNow Entegrasyonu (Bing + Yandex anlık dizin bildirimi) — 2026-11-22
 *
 * Nasıl çalışır:
 *   1) Tek seferlik 32 karakterlik hex anahtar üretilir (ya da .env INDEXNOW_KEY
 *      kullanılır) ve `settings` tablosunda kalıcılaştırılır.
 *   2) `GET /:anahtar.txt` ucu bu anahtarı düz metin olarak döndürür (IndexNow
 *      sahiplik doğrulaması).
 *   3) Otonom radar fiyatları güncellediğinde veya yönetici tetiklediğinde,
 *      `https://api.indexnow.org/indexnow` üzerinden Bing + Yandex'e güncellenen
 *      sayfalar anında bildirilir.
 */
import crypto from 'node:crypto';
import { dbBaglantisi } from './store.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const COOLDOWN_MS = 30 * 60 * 1000;
const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

let bellekAnahtar = null;
let sonGonderimTs = 0;
let sonDurum = null;

/** Geçerli IndexNow anahtarını döndürür (yoksa üretip SQLite'a kaydeder). */
export function indexNowAnahtari() {
  const envKey = String(process.env.INDEXNOW_KEY || '').trim();
  if (KEY_RE.test(envKey)) return envKey;
  if (bellekAnahtar) return bellekAnahtar;

  try {
    const db = dbBaglantisi();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'indexnow_key'").get();
    if (row?.value) {
      let parsed = String(row.value);
      try { parsed = JSON.parse(parsed); } catch { /* ham metin olabilir */ }
      if (KEY_RE.test(String(parsed).trim())) {
        bellekAnahtar = String(parsed).trim();
        return bellekAnahtar;
      }
    }
    const yeni = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('indexnow_key', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(yeni));
    bellekAnahtar = yeni;
    return yeni;
  } catch {
    bellekAnahtar = bellekAnahtar || crypto.randomBytes(16).toString('hex');
    return bellekAnahtar;
  }
}

function canliHttpsTaban(tabanUrl) {
  const ham = String(tabanUrl || process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!ham) return null;
  try {
    const u = new URL(ham);
    if (u.protocol !== 'https:') return null;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Verilen URL listesini (veya göreli yolları) IndexNow API'ye bildirir.
 */
export async function indexNowBildir(urller = [], { tabanUrl = '', zorla = false, fetchFn = fetch } = {}) {
  const parsedBase = canliHttpsTaban(tabanUrl);
  if (!parsedBase) {
    return { ok: false, atlandi: true, neden: 'PUBLIC_URL canlı HTTPS değil' };
  }

  const simdi = Date.now();
  if (!zorla && sonGonderimTs && (simdi - sonGonderimTs) < COOLDOWN_MS) {
    return { ok: true, atlandi: true, neden: 'Bekleme süresi aktif (30 dk)' };
  }

  const key = indexNowAnahtari();
  const keyLocation = `${parsedBase.origin}/${key}.txt`;

  const temizSet = new Set();
  for (const ham of urller) {
    if (!ham) continue;
    try {
      const u = String(ham).startsWith('http')
        ? new URL(String(ham))
        : new URL(String(ham), parsedBase.origin);
      if (u.origin === parsedBase.origin) temizSet.add(u.toString());
    } catch { /* bozuk url atlanır */ }
  }

  const urlList = [...temizSet].slice(0, 10000);
  if (!urlList.length) {
    return { ok: false, atlandi: true, neden: 'Bildirilecek geçerli URL yok' };
  }

  try {
    const res = await fetchFn(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: parsedBase.host,
        key,
        keyLocation,
        urlList,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const basarili = res.status === 200 || res.status === 202;
    sonGonderimTs = simdi;
    sonDurum = {
      ts: new Date(simdi).toISOString(),
      ok: basarili,
      status: res.status,
      gonderilenSayi: urlList.length,
      ornekler: urlList.slice(0, 5),
      hata: basarili ? null : `HTTP ${res.status}`,
    };
    return sonDurum;
  } catch (e) {
    sonDurum = {
      ts: new Date(simdi).toISOString(),
      ok: false,
      status: 0,
      gonderilenSayi: 0,
      ornekler: [],
      hata: String(e?.message || e).slice(0, 160),
    };
    return sonDurum;
  }
}

export function indexNowDurum(tabanUrl = '') {
  const parsed = canliHttpsTaban(tabanUrl);
  const key = indexNowAnahtari();
  return {
    hazir: Boolean(parsed),
    key,
    keyLocation: parsed ? `${parsed.origin}/${key}.txt` : `/${key}.txt`,
    sonDurum,
  };
}
