/**
 * 🧾 Baskı Teklif Fişi — saf hesap + metin üretici (2026-11-12)
 *
 * KURAL (dürüstlük + tek kaynak): elektrik/amortisman/kâr çarpanı sabitleri
 * `public/maliyet.js` içindeki VARSAYILAN ile BİREBİR aynıdır. Aynı ürün için
 * iki farklı sayfa farklı fiyat gösteremez.
 *   maliyet.js → GRAM_SAAT = 12.5, gucW = 150, kwhTl = 2.9,
 *                 yipranmaSaatTl = 3, karCarpani = 2.5
 *
 * Modül bilinçli olarak DOM'a dokunmaz ve ağ isteği atmaz: saf fonksiyonlar,
 * testlerde doğrudan çağrılabilir.
 */

/** maliyet.js ile aynı varsayılanlar. */
export const TEKLIF_VARSAYILAN = Object.freeze({
  gramSaat: 12.5,
  gucW: 150,
  kwhTl: 2.9,
  yipranmaSaatTl: 3,
  karCarpani: 2.5,
});

/** ₺ biçimlendirme (tr-TR, 2 hane). */
export function para(n) {
  return Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Sondaki gereksiz sıfırları atan kısa sayı ("2,50" → "2,5"). */
function kisaSayi(n) {
  return Number(Number(n || 0).toFixed(2)).toLocaleString('tr-TR', {
    maximumFractionDigits: 2,
  });
}

/**
 * Teklif fişinin tüm sayılarını üretir.
 *
 * @param {{
 *   gram: number,            // dilimlenmiş gramaj
 *   tlKg?: number,           // canlı filament ₺/kg (0/undefined → fiyat yok)
 *   malzeme?: string,
 *   doluluk?: number,
 *   dosyaAdi?: string,
 *   boyutlar?: {genislik:number, derinlik:number, yukseklik:number},
 *   sureSaat?: number,       // verilirse tahmin yerine bu kullanılır
 *   gucW?: number, kwhTl?: number, yipranmaSaatTl?: number,
 *   karCarpani?: number,
 * }} girdi
 * @returns {object|null}
 */
export function teklifHesapla(girdi = {}) {
  const gram = Number(girdi.gram);
  if (!Number.isFinite(gram) || gram <= 0) return null;

  const ayar = (anahtar) => {
    const v = Number(girdi[anahtar]);
    return Number.isFinite(v) && v > 0 ? v : TEKLIF_VARSAYILAN[anahtar];
  };
  const gramSaat = TEKLIF_VARSAYILAN.gramSaat;
  const gucW = ayar('gucW');
  const kwhTl = ayar('kwhTl');
  const yipranmaSaatTl = ayar('yipranmaSaatTl');
  const karCarpani = ayar('karCarpani');

  const tlKg = Number(girdi.tlKg) > 0 ? Number(girdi.tlKg) : 0;

  // Süre: verilmişse onu kullan; yoksa gramajdan tahmin (maliyet.js ile aynı).
  const verilenSure = Number(girdi.sureSaat);
  const sureTahmini = !(Number.isFinite(verilenSure) && verilenSure > 0);
  const sureSaat = sureTahmini
    ? Math.round((gram / gramSaat) * 100) / 100
    : Math.round(verilenSure * 100) / 100;

  const hammadde = tlKg > 0 ? (gram / 1000) * tlKg : 0;
  const kwh = (gucW * sureSaat) / 1000;
  const elektrik = kwh * kwhTl;
  const amortisman = sureSaat * yipranmaSaatTl;
  const net = hammadde + elektrik + amortisman;
  const satisFiyati = Math.round(net * karCarpani * 100) / 100;
  const kar = Math.round((satisFiyati - net) * 100) / 100;

  return {
    gram,
    malzeme: String(girdi.malzeme || 'PLA').toUpperCase(),
    doluluk: Number(girdi.doluluk) > 0 ? Number(girdi.doluluk) : 20,
    dosyaAdi: girdi.dosyaAdi || '3D Parça',
    boyutlar: girdi.boyutlar || null,
    tlKg,
    // Maliyet kalemleri
    hammadde: Math.round(hammadde * 100) / 100,
    elektrik: Math.round(elektrik * 100) / 100,
    amortisman: Math.round(amortisman * 100) / 100,
    net: Math.round(net * 100) / 100,
    // Fiyat
    karCarpani,
    satisFiyati,
    kar,
    karYuzde: Math.round((karCarpani - 1) * 100),
    // Süre / enerji
    sureSaat,
    sureTahmini,
    gucW,
    kwhTl,
    yipranmaSaatTl,
    kwh: Math.round(kwh * 1000) / 1000,
    // Canlı filament fiyatı yoksa dürüstçe işaretle
    fiyatBilgisiVar: tlKg > 0,
  };
}

/** "45 × 45 × 18 mm" (boyut yoksa "—"). */
export function ebatMetni(boyutlar) {
  if (!boyutlar) return '—';
  const b = (n) => Math.round(Number(n) || 0);
  return `${b(boyutlar.genislik)} × ${b(boyutlar.derinlik)} × ${b(boyutlar.yukseklik)} mm`;
}

/** "14:32 · 12.11.2026" */
export function tarihMetni(tarih = new Date()) {
  const d = new Date(tarih);
  const iki = (n) => String(n).padStart(2, '0');
  return `${iki(d.getHours())}:${iki(d.getMinutes())} · `
    + `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * WhatsApp / pano için düz metin fiş.
 * Karakterler WhatsApp'ın kendi biçimini kullanır (*kalın*).
 *
 * @param {object} t teklifHesapla çıktısı
 * @param {{tarih?:Date}} [secenek]
 */
export function teklifMetni(t, secenek = {}) {
  if (!t) return '';
  const cizgi = '━━━━━━━━━━━━━━━━━━━━';
  const ebat = ebatMetni(t.boyutlar);
  const satirlar = [
    '🧾 *3D BASKI TEKLİF FİŞİ*',
    cizgi,
    `📦 *Model:* ${t.dosyaAdi}`,
    `📐 *Ebat:* ${ebat}`,
    `⚖️ *Gramaj:* ${Math.round(t.gram)} g (${t.malzeme} · %${t.doluluk} doluluk)`,
    `⏱️ *Tahmini Baskı:* ≈ ${kisaSayi(t.sureSaat)} saat${t.sureTahmini ? ' (tahmini)' : ''}`,
    `🕒 *Tarih:* ${tarihMetni(secenek.tarih || new Date())}`,
    cizgi,
    '*MALİYET KALEMLERİ*',
  ];
  if (t.fiyatBilgisiVar) {
    satirlar.push(`• Filament: ₺${para(t.hammadde)}`);
  } else {
    satirlar.push('• Filament: canlı fiyat alınamadı');
  }
  satirlar.push(`• Elektrik: ₺${para(t.elektrik)} (${t.kwh} kWh)`);
  satirlar.push(`• Cihaz amortismanı: ₺${para(t.amortisman)}`);
  satirlar.push(`*Net üretim maliyeti:* ₺${para(t.net)}`);
  satirlar.push(cizgi);
  satirlar.push(`🏷️ *TEKLİF TUTARI:* ₺${para(t.satisFiyati)}`);
  satirlar.push(`_(atölye kâr marjı %${t.karYuzde} dahil · kâr ₺${para(t.kar)})_`);
  satirlar.push(cizgi);
  satirlar.push('⚡ Fiyat doğrulama: Baskı Hesap · 62 mağaza canlı radar');
  return satirlar.join('\n');
}
