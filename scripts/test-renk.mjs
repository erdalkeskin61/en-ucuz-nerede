/**
 * Renk niyeti testi (kredi harcamaz, ağa çıkmaz).
 *   node scripts/test-renk.mjs
 *
 * Kapsam: kullanıcı cümlesinden renk/ton çıkarımı, aday başlığı sınıflandırması,
 * renk ailesi toleransı ve yanlış renklerin elenmesi.
 */
import { extractColorIntent, adayRenkDurumu, renkAilesi, extractColors, dominantColor } from '../src/util.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul) {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}`);
}

// ---- Niyet çıkarımı ----
const acikGri = extractColorIntent('3D yazıcı için açık gri PLA filament 1kg bütçem 900 TL');
kontrol('niyet metni "açık gri"', acikGri?.metin === 'açık gri');
kontrol('ana renk gri', acikGri?.ana === 'gri');
kontrol('ton acik', acikGri?.ton === 'acik');
kontrol('gri ailesi gümüş içerir', acikGri?.aile.includes('gumus'));
kontrol('gri ailesi antrasit içerir', acikGri?.aile.includes('antrasit'));
kontrol('renk isteği yoksa null', extractColorIntent('kablosuz kulaklık bütçem 3000 TL') === null);
kontrol('"koyu mavi" tonu', extractColorIntent('koyu mavi kapaklı telefon')?.metin === 'koyu mavi');
kontrol('siyah ailesi antrasit içerir', renkAilesi('siyah').includes('antrasit'));
// Türkçe ton adları (2026-10-25 eklendi)
kontrol('eflatun → mor ailesi', extractColorIntent('eflatun PLC modülü')?.aile.includes('eflatun'));
kontrol('eflatun metni korunur', extractColorIntent('eflatun PLC modülü')?.metin === 'eflatun');
kontrol('fuşya → pembe ailesi', extractColorIntent('fuşya kılıf')?.ana === 'pembe');
kontrol('haki → yeşil ailesi', extractColorIntent('haki çanta')?.ana === 'yeşil');
kontrol('hardal → sarı ailesi', extractColorIntent('hardal cüzdan')?.ana === 'sarı');
kontrol('çelik gri → gri', extractColorIntent('çelik gri kasa')?.ana === 'gri');
kontrol('eflatun adayı uygun', adayRenkDurumu('Philips Eflatun Sensör', extractColorIntent('eflatun PLC'))?.durum === 'aile');

// ---- Aday sınıflandırması (açık gri isteği) ----
const d = (b) => adayRenkDurumu(b, acikGri).durum;
kontrol('açık gri → tam', d('Esun PLA Basic Açık Gri Filament 1.75mm 1 KG') === 'tam');
kontrol('koyu gri → aile', d('Esun PLA Basic Koyu Gri Filament') === 'aile');
kontrol('antrasit → aile', d('Esun PLA Antrasit Filament') === 'aile');
kontrol('gümüş → aile', d('Creality PLA Gümüş Filament') === 'aile');
kontrol('Slate Gray → aile', d('Filamix PLA+ Slate Gray Filament') === 'aile');
kontrol('kırmızı → farkli', d('Fibromast PLA Kırmızı Filament') === 'farkli');
kontrol('Dark Red → farkli', d('Bambu Lab PLA Matte Dark Red Filament') === 'farkli');
kontrol('siyah → farkli', d('Esun PLA Siyah Filament') === 'farkli');
kontrol('magenta → farkli', d('Bambu Lab PLA Basic Magenta Filament') === 'farkli');
kontrol('cyan → farkli', d('Bambu Lab PLA Basic Cyan Filament') === 'farkli');
kontrol('renksiz → bilinmiyor', d('Esun PLA Basic Filament 1 KG') === 'bilinmiyor');

// ---- Renk isteği yokken sınıflandırma engellemez ----
kontrol('niyet yok → durum yok', adayRenkDurumu('Kırmızı Filament', null).durum === 'yok');

// ---- Mevcut yardımcılar bozulmadı ----
kontrol('extractColors açık gri', extractColors('açık gri filament').includes('gri'));
kontrol('dominantColor kırmızı', dominantColor('Bambu PLA Dark Red') === 'kırmızı');
kontrol('dominantColor gümüş', dominantColor('Creality PLA Gümüş') === 'gümüş');

console.log(`RENK ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
