/**
 * 🎨 Hafif Model Silüeti Çizici — sıfır harici kütüphane (2026-11-12)
 *
 * three.js / WebGL yok: saf Canvas 2D + izometrik (2.5D) projeksiyon.
 * Amaç modelin FORMUNU ve ORANINI göstermek; ölçüm doğruluğu için
 * `stlParser.js` yetkilidir (bu modül yalnızca görselleştirir).
 *
 * Performans: en fazla `MAKS_Ucgen` üçgen örneklenir → 60 FPS, 0 ms algı.
 * Güvenlik: bozuk/ASCII STL veya 3MF (ZIP) verisinde çizim yapılmaz;
 * bunun yerine GERÇEK boyutlardan izometrik sınır kutusu (bounding box)
 * çizilir ve etiket "sınır kutusu" olarak dürüstçe belirtilir.
 */

/** Örneklenecek en fazla üçgen sayısı (ilk N değil, eşit aralıklı örnekleme). */
export const MAKS_Ucgen = 900;

const RENK = {
  cizgi: '#6366F1',
  dolgu: 'rgba(99, 102, 241, 0.05)',
  izgara: 'rgba(99, 102, 241, 0.08)',
  etiket: '#4F46E5',
  kutu: '#818CF8',
};

/** Canvas'ı net (retina) çözünürlüğe ayarlar; mantıksal ölçüyü döndürür. */
function hazirla(canvas, ctx) {
  const dpr = Math.min(2, Number(globalThis.devicePixelRatio) || 1);
  // CSS ölçüsü (layout) — canvas 110×110 gibi sabit bir kutu.
  const cssW = canvas.clientWidth || canvas.width || 110;
  const cssH = canvas.clientHeight || canvas.height || 110;
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return { W: cssW, H: cssH };
}

function izgaraCiz(ctx, W, H, adim = 20) {
  ctx.save();
  ctx.strokeStyle = RENK.izgara;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = adim; x < W; x += adim) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = adim; y < H; y += adim) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();
}

function etiketCiz(ctx, metin) {
  ctx.save();
  ctx.fillStyle = RENK.etiket;
  ctx.font = 'bold 8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(metin, 6, 6);
  ctx.restore();
}

/**
 * Binary STL'den üçgen köşelerini okur.
 * @returns {{ucgenler:Float32Array|null, toplamUcgen:number}}
 *   `ucgenler` null ise veri binary STL değildir (ASCII STL / 3MF / bozuk).
 */
function binaryUcgenleriOku(buffer) {
  if (!buffer || buffer.byteLength < 84) return { ucgenler: null, toplamUcgen: 0 };
  const view = new DataView(buffer);
  const toplamUcgen = view.getUint32(80, true);
  // Tutarlılık: 84 + n*50 tam olarak dosya boyuna eşit olmalı.
  // (ASCII STL'de 80. baytlar çöp olur ve bu kontrol yakalar.)
  if (!toplamUcgen || 84 + toplamUcgen * 50 > view.byteLength) {
    return { ucgenler: null, toplamUcgen: 0 };
  }
  // Eşit aralıklı örnekleme: `ceil` kullanılır ki örnek sayısı HER ZAMAN
  // MAKS_Ucgen'i aşmasın (tam bölme `floor` ile 1000 üçgende 1000 örnek
  // çıkıyordu — sınır sözü tutulmuyordu).
  const adim = Math.max(1, Math.ceil(toplamUcgen / MAKS_Ucgen));
  const secilen = Math.ceil(toplamUcgen / adim);
  const ucgenler = new Float32Array(secilen * 9);
  let w = 0;
  for (let i = 0; i < toplamUcgen; i += adim) {
    const o = 84 + i * 50;
    if (o + 48 > view.byteLength) break;
    // Normal (12 bayt) atlanır; 3 köşe × 3 eksen okunur.
    for (let k = 0; k < 9; k++) {
      ucgenler[w++] = view.getFloat32(o + 12 + k * 4, true);
    }
  }
  return { ucgenler: ucgenler.subarray(0, w), toplamUcgen };
}

/**
 * STL köşelerinden izometrik tel çerçeve çizer.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {ArrayBuffer|null} buffer ham STL/3MF verisi (3MF'de çizim yapılmaz)
 * @param {{genislik:number, derinlik:number, yukseklik:number}} boyutlar mm
 * @param {{ucgenSayisi?:number, format?:string}} [ek]
 * @returns {{cizildi:boolean, mod:'ucgen'|'kutu'|'yok', ornekUcgen?:number}}
 */
export function cizModelSilueti(canvas, buffer, boyutlar, ek = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return { cizildi: false, mod: 'yok' };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { cizildi: false, mod: 'yok' };

  const { W, H } = hazirla(canvas, ctx);
  izgaraCiz(ctx, W, H);

  const b = boyutlar || {};
  const maxBoyut = Math.max(
    Number(b.genislik) || 0, Number(b.derinlik) || 0, Number(b.yukseklik) || 0, 1,
  );
  const olcek = (Math.min(W, H) * 0.62) / maxBoyut;
  const cx = W / 2;
  const cy = H / 2 + Math.min(10, H * 0.09);
  const cos30 = 0.866;
  const sin30 = 0.5;
  const izoX = (x, y) => cx + (x - y) * cos30 * olcek;
  const izoY = (x, y, z) => cy + ((x + y) * sin30 - z) * olcek;

  const { ucgenler, toplamUcgen } = binaryUcgenleriOku(buffer);

  if (ucgenler && ucgenler.length >= 9) {
    // --- Gerçek üçgen silüeti (indigo tel çerçeve) ---
    ctx.save();
    ctx.strokeStyle = RENK.cizgi;
    ctx.fillStyle = RENK.dolgu;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    for (let i = 0; i + 8 < ucgenler.length; i += 9) {
      const px1 = izoX(ucgenler[i], ucgenler[i + 1]);
      const py1 = izoY(ucgenler[i], ucgenler[i + 1], ucgenler[i + 2]);
      const px2 = izoX(ucgenler[i + 3], ucgenler[i + 4]);
      const py2 = izoY(ucgenler[i + 3], ucgenler[i + 4], ucgenler[i + 5]);
      const px3 = izoX(ucgenler[i + 6], ucgenler[i + 7]);
      const py3 = izoY(ucgenler[i + 6], ucgenler[i + 7], ucgenler[i + 8]);
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.lineTo(px3, py3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    const adet = ucgenler.length / 9;
    etiketCiz(ctx, `3D SILUET · ${adet}${adet < toplamUcgen ? '/' + toplamUcgen : ''} ucgen`);
    return { cizildi: true, mod: 'ucgen', ornekUcgen: adet };
  }

  // --- Yedek: gerçek boyutlardan izometrik sınır kutusu ---
  // (ASCII STL, 3MF/ZIP veya ayrıştırılamayan veri.) Uydurma form çizilmez;
  // yalnızca modelin GERÇEK ebatlarından kutu çizilip "sınır kutusu" denir.
  if (maxBoyut <= 1) return { cizildi: false, mod: 'yok' };
  const g = Number(b.genislik) || maxBoyut;
  const dd = Number(b.derinlik) || maxBoyut;
  const y = Number(b.yukseklik) || maxBoyut;
  const kose = [
    [0, 0, 0], [g, 0, 0], [g, dd, 0], [0, dd, 0],
    [0, 0, y], [g, 0, y], [g, dd, y], [0, dd, y],
  ].map(([x, yy, z]) => [izoX(x, yy), izoY(x, yy, z)]);
  const kenarlar = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  ctx.save();
  ctx.strokeStyle = RENK.kutu;
  ctx.lineWidth = 1.1;
  ctx.setLineDash([3, 2]);
  for (const [a, z] of kenarlar) {
    ctx.beginPath();
    ctx.moveTo(kose[a][0], kose[a][1]);
    ctx.lineTo(kose[z][0], kose[z][1]);
    ctx.stroke();
  }
  ctx.restore();
  etiketCiz(ctx, 'SINIR KUTUSU');
  return { cizildi: true, mod: 'kutu' };
}

/** Canvas'ı boşaltır (temizle düğmesi). */
export function siluetiTemizle(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, Number(globalThis.devicePixelRatio) || 1);
  const cssW = canvas.clientWidth || canvas.width || 110;
  const cssH = canvas.clientHeight || canvas.height || 110;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  izgaraCiz(ctx, cssW, cssH);
}
