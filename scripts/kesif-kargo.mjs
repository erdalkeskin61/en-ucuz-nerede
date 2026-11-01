/**
 * Önbellekteki ürün sayfalarında kargo bilgisi keşfi.
 * Her siteden örnek bir ürün sayfası bulup kargo desenlerini ara.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = 'data/cache';
// Sorgu sayfaları değil ürün sayfaları: purpose bilgisi logda yok, ama URL desenlerinden
// ürün sayfalarını ayırt edebiliriz. Basitlik: tüm cache'i tara, her siteden 1 örnek.
const dosyalar = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));

// Site -> kargo desenleri
const KARGO_DESENLERI = [
  /ücretsiz\s*kargo/gi,
  /kargo\s*bedava/gi,
  /(?:kargo|teslimat)\s*(?:ücreti|bedeli)?\s*[:=]?\s*([\d.,]+)\s*(?:tl|₺)/gi,
  /([\d.,]+)\s*(?:tl|₺)[^.]{0,30}(?:üzeri|üstü)[^.]{0,30}ücretsiz\s*kargo/gi,
  /kargo\s*(?:ücreti)?\s*([\d.,]+)\s*(?:tl|₺)/gi,
];

const siteSayfa = new Map();
for (const f of dosyalar) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    const url = j.url || '';
    if (!/^https?:\/\/[^/]+/.test(url)) continue;
    const host = url.split('/')[2].replace(/^www\./, '');
    // Ana sayfa/arama değil, içerik dolgun sayfalar (ürün ya da kargo sayfası olabilir)
    if ((j.body || '').length < 20000) continue;
    if (!siteSayfa.has(host)) siteSayfa.set(host, { url, body: j.body });
  } catch {}
}

console.log('örnek sayfa sayısı:', siteSayfa.size, '\n');
for (const [host, { url, body }] of [...siteSayfa].sort()) {
  const satirlar = [];
  const alt = body.toLowerCase();
  if (/ücretsiz kargo|kargo bedava/.test(alt)) {
    // Bağlam al: ilk 2 geçiş
    let idx = -1, n = 0;
    while (n < 2) {
      idx = alt.indexOf('kargo', idx + 1);
      if (idx < 0) break;
      const cevre = alt.slice(Math.max(0, idx - 60), idx + 80);
      if (/ücretsiz|bedava/.test(cevre)) {
        satirlar.push('  ÜCRETSİZ: ...' + body.slice(Math.max(0, idx - 60), idx + 80).replace(/\s+/g, ' ').trim().slice(0, 120));
        n++;
      }
    }
  }
  const ucretM = body.match(/kargo[^<]{0,60}?([\d.,]+)\s*(?:TL|₺)/i) || body.match(/([\d.,]+)\s*(?:TL|₺)[^<]{0,40}kargo/i);
  if (ucretM) satirlar.push('  ÜCRETLİ: ' + ucretM[0].replace(/\s+/g, ' ').slice(0, 110));
  const esikM = body.match(/([\d.,]+)\s*(?:TL|₺)[^<]{0,60}(?:üzeri|üstü)[^<]{0,60}ücretsiz/i);
  if (esikM) satirlar.push('  EŞİK: ' + esikM[0].replace(/\s+/g, ' ').slice(0, 110));
  if (satirlar.length) {
    console.log(host, '->', url.slice(0, 70));
    for (const s of satirlar) console.log(s);
  }
}
