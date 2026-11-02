/**
 * 📈 Sunucu tarafı fiyat trend grafiği — 2026-11-03
 *
 * Telegram `sendPhoto` yalnızca gerçek raster görselleri kabul eder (SVG değil).
 * Projede canvas/sharp gibi ağır bağımlılık yok; bu yüzden grafik doğrudan
 * RGBA/RGB piksel tamponuna çizilir ve saf Node (`node:zlib`) ile PNG'ye
 * kodlanır. Böylece:
 *   - ek bağımlılık yok, derleme (native build) yok,
 *   - çizim ~5 ms, dosya ~20-40 KB,
 *   - aynı kod hem radar kartlarında hem kişisel fiyat alarmlarında kullanılır.
 *
 * GRAFİK VERİSİ UYDURULMAZ: yalnızca gerçek fiyat geçmişi noktaları çizilir.
 * İki noktadan az veri varsa `null` döner ve çağıran taraf metin kartına düşer.
 */
import { deflateSync } from 'node:zlib';

/* ------------------------------------------------------------------ */
/* Seri hazırlama                                                      */
/* ------------------------------------------------------------------ */

/**
 * Farklı kaynaklardaki geçmiş kayıtlarını tek biçime çevirir.
 * Kabul edilen alanlar: `ts|tarih|date`, `fiyat|enUcuzFiyat|price|lowest`.
 *
 * @param {Array<object>} gecmis
 * @param {{gun?:number, simdi?:number, minNokta?:number}} [opts]
 * @returns {Array<{ts:number, fiyat:number}>} zamana göre artan, tekilleştirilmiş
 */
export function fiyatSerisi(gecmis, opts = {}) {
  const gun = Number.isFinite(opts.gun) ? opts.gun : 90;
  const simdi = Number.isFinite(opts.simdi) ? opts.simdi : Date.now();
  const minNokta = Number.isFinite(opts.minNokta) ? opts.minNokta : 2;
  const esik = simdi - Math.max(1, gun) * 86400000;

  const noktalar = [];
  for (const g of Array.isArray(gecmis) ? gecmis : []) {
    if (!g || typeof g !== 'object') continue;
    let ts = Date.parse(g.ts || g.tarih || g.date || '');
    if (!Number.isFinite(ts)) ts = Number(g.ts);
    const fiyat = Number(g.fiyat ?? g.enUcuzFiyat ?? g.price ?? g.lowest);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
    if (ts < esik) continue; // 90 günden eski kayıt grafiğe girmez
    noktalar.push({ ts, fiyat: Math.round(fiyat * 100) / 100 });
  }
  noktalar.sort((a, b) => a.ts - b.ts);

  const tekil = [];
  for (const n of noktalar) {
    const onceki = tekil[tekil.length - 1];
    if (onceki && onceki.ts === n.ts) {
      tekil[tekil.length - 1] = n; // aynı ts → son kayıt geçerli
      continue;
    }
    tekil.push(n);
  }
  return tekil.length >= Math.max(2, minNokta) ? tekil : [];
}

/** Grafiğin özet matematiği (test/başlık için). */
export function grafikOzeti(seri) {
  if (!Array.isArray(seri) || !seri.length) return null;
  const fiyatlar = seri.map(n => n.fiyat);
  const min = Math.min(...fiyatlar);
  const max = Math.max(...fiyatlar);
  const ilk = seri[0].fiyat;
  const son = seri[seri.length - 1].fiyat;
  return {
    min,
    max,
    ilk,
    son,
    degisim: Math.round((son - ilk) * 100) / 100,
    degisimYuzde: ilk > 0 ? Math.round(((son - ilk) / ilk) * 1000) / 10 : 0,
    nokta: seri.length,
    baslangic: new Date(seri[0].ts).toISOString(),
    bitis: new Date(seri[seri.length - 1].ts).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Piksel çizimi                                                       */
/* ------------------------------------------------------------------ */

const crcTablo = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTablo[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngParca(tur, veri) {
  const tip = Buffer.from(tur, 'ascii');
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tip, veri])), 0);
  return Buffer.concat([uzunluk, tip, veri, crc]);
}

/**
 * 8-bit RGB piksel tamponunu PNG'ye kodlar (sıkıştırma: zlib).
 * @param {number} w
 * @param {number} h
 * @param {Buffer} rgb w*h*3
 * @returns {Buffer}
 */
export function pngKodla(w, h, rgb) {
  const satir = w * 3 + 1;
  const ham = Buffer.alloc(satir * h);
  for (let y = 0; y < h; y++) {
    ham[y * satir] = 0; // filtre: None
    rgb.copy(ham, y * satir + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit derinliği
  ihdr[9] = 2;  // renk türü: RGB
  ihdr[10] = 0; // sıkıştırma
  ihdr[11] = 0; // filtre
  ihdr[12] = 0; // interlace yok
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngParca('IHDR', ihdr),
    pngParca('IDAT', deflateSync(ham, { level: 9 })),
    pngParca('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Grafik                                                              */
/* ------------------------------------------------------------------ */

/** 0-255 arası alpha karışımı. */
function karistir(tampon, i, r, g, b, a) {
  if (a <= 0) return;
  if (a >= 1) { tampon[i] = r; tampon[i + 1] = g; tampon[i + 2] = b; return; }
  tampon[i] = Math.round(tampon[i] * (1 - a) + r * a);
  tampon[i + 1] = Math.round(tampon[i + 1] * (1 - a) + g * a);
  tampon[i + 2] = Math.round(tampon[i + 2] * (1 - a) + b * a);
}

function disk(tampon, w, h, cx, cy, yari, renk, alfa = 1) {
  const r2 = yari * yari;
  const x0 = Math.max(0, Math.floor(cx - yari));
  const x1 = Math.min(w - 1, Math.ceil(cx + yari));
  const y0 = Math.max(0, Math.floor(cy - yari));
  const y1 = Math.min(h - 1, Math.ceil(cy + yari));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      karistir(tampon, (y * w + x) * 3, renk[0], renk[1], renk[2], alfa);
    }
  }
}

function cizgi(tampon, w, h, x1, y1, x2, y2, kalinlik, renk, alfa = 1) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const adim = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= adim; i++) {
    const t = i / adim;
    disk(tampon, w, h, x1 + dx * t, y1 + dy * t, kalinlik, renk, alfa);
  }
}

function yatayCizgi(tampon, w, h, x1, x2, y, kalinlik, renk, alfa = 1) {
  cizgi(tampon, w, h, x1, y, x2, y, kalinlik, renk, alfa);
}

/**
 * Fiyat trend grafiğini PNG üretir.
 *
 * Renk paleti Telegram'ın açık/koyu temasında da okunacak şekilde koyu lacivert
 * zemin + yeşil çizgidir. Görselde metin yoktur; tüm sayılar caption'dadır
 * (güvenli, font bağımlılığı yok).
 *
 * @param {Array<{ts:number, fiyat:number}>} seri
 * @param {{genislik?:number, yukseklik?:number}} [opts]
 * @returns {Buffer|null}
 */
export function grafikPng(seri, opts = {}) {
  if (!Array.isArray(seri) || seri.length < 2) return null;
  const w = Math.max(320, Math.min(1200, Math.round(opts.genislik || 800)));
  const h = Math.max(160, Math.min(800, Math.round(opts.yukseklik || 400)));
  const tampon = Buffer.alloc(w * h * 3);

  // Zemin: dikey degrade (#0b1220 → #111f38)
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const r = Math.round(11 + (17 - 11) * t);
    const g = Math.round(18 + (31 - 18) * t);
    const b = Math.round(32 + (56 - 32) * t);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      tampon[i] = r; tampon[i + 1] = g; tampon[i + 2] = b;
    }
  }

  // Çizim alanı
  const padX = Math.round(w * 0.07);
  const padUst = Math.round(h * 0.16);
  const padAlt = Math.round(h * 0.16);
  const x0 = padX;
  const x1 = w - padX;
  const y0 = padUst;
  const y1 = h - padAlt;
  const cw = x1 - x0;
  const ch = y1 - y0;

  // Yatay ızgara (%25 adım)
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (ch * i) / 4;
    yatayCizgi(tampon, w, h, x0, x1, y, 0.6, [148, 163, 184], 0.10);
  }
  // Dikey hafif ızgara
  for (let i = 0; i <= 6; i++) {
    const x = x0 + (cw * i) / 6;
    cizgi(tampon, w, h, x, y0, x, y1, 0.5, [148, 163, 184], 0.06);
  }

  const fiyatlar = seri.map(n => n.fiyat);
  const min = Math.min(...fiyatlar);
  const max = Math.max(...fiyatlar);
  const aralik = max - min || Math.max(1, max * 0.02);
  const ts0 = seri[0].ts;
  const ts1 = seri[seri.length - 1].ts;
  const zamanAralik = ts1 - ts0;

  const X = (n) => (zamanAralik > 0
    ? x0 + ((n.ts - ts0) / zamanAralik) * cw
    : x0 + (seri.indexOf(n) / Math.max(1, seri.length - 1)) * cw);
  const Y = (f) => y0 + (1 - (f - min) / aralik) * ch;

  const yesil = [34, 197, 94];
  const yesilAcik = [74, 222, 128];

  // Alan dolgusu: her sütunda çizgi ile taban arasını yumuşak yeşil boya.
  for (let px = Math.round(x0); px <= Math.round(x1); px++) {
    // Bu sütunun çizgi yüksekliğini enterpolasyonla bul.
    let noktaX = x0;
    let noktaY = Y(seri[0].fiyat);
    for (let i = 1; i < seri.length; i++) {
      const ax = X(seri[i - 1]);
      const bx = X(seri[i]);
      if (px >= ax && px <= bx) {
        const t = bx === ax ? 0 : (px - ax) / (bx - ax);
        noktaX = px;
        noktaY = Y(seri[i - 1].fiyat) + (Y(seri[i].fiyat) - Y(seri[i - 1].fiyat)) * t;
        break;
      }
      if (px > bx) { noktaX = bx; noktaY = Y(seri[i].fiyat); }
    }
    if (noktaX <= 0) continue;
    for (let y = Math.round(noktaY); y <= Math.round(y1); y++) {
      const t = (y - noktaY) / Math.max(1, y1 - noktaY);
      karistir(tampon, (y * w + px) * 3, yesil[0], yesil[1], yesil[2], 0.34 * (1 - t) + 0.01);
    }
  }

  // Dip fiyat referans çizgisi (kesikli, amber)
  const yMin = Y(min);
  for (let x = x0; x <= x1; x += 10) {
    const bitis = Math.min(x + 5, x1);
    cizgi(tampon, w, h, x, yMin, bitis, yMin, 0.7, [245, 158, 11], 0.45);
  }

  // Ana trend çizgisi (çift geçiş: dış parıltı + net çizgi)
  for (let i = 1; i < seri.length; i++) {
    cizgi(tampon, w, h, X(seri[i - 1]), Y(seri[i - 1].fiyat), X(seri[i]), Y(seri[i].fiyat),
      3.4, yesil, 0.18);
  }
  for (let i = 1; i < seri.length; i++) {
    cizgi(tampon, w, h, X(seri[i - 1]), Y(seri[i - 1].fiyat), X(seri[i]), Y(seri[i].fiyat),
      1.6, yesilAcik, 0.95);
  }

  // Dip ve zirve işaretleri
  const minI = fiyatlar.indexOf(min);
  const maxI = fiyatlar.lastIndexOf(max);
  disk(tampon, w, h, X(seri[maxI]), Y(max), 5.5, [100, 116, 139], 0.9);
  disk(tampon, w, h, X(seri[maxI]), Y(max), 3, [15, 23, 42], 1);
  disk(tampon, w, h, X(seri[minI]), Y(min), 8, [245, 158, 11], 0.22);
  disk(tampon, w, h, X(seri[minI]), Y(min), 4.5, [245, 158, 11], 1);
  disk(tampon, w, h, X(seri[minI]), Y(min), 2, [15, 23, 42], 1);

  // Son nokta: nabız halkası
  const sonX = X(seri[seri.length - 1]);
  const sonY = Y(seri[seri.length - 1].fiyat);
  disk(tampon, w, h, sonX, sonY, 11, yesil, 0.14);
  disk(tampon, w, h, sonX, sonY, 6.5, yesil, 0.35);
  disk(tampon, w, h, sonX, sonY, 4, yesilAcik, 1);

  // Alt eksen
  yatayCizgi(tampon, w, h, x0, x1, y1, 1, [148, 163, 184], 0.28);

  return pngKodla(w, h, tampon);
}
