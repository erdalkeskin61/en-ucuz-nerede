/**
 * Önbellek sağlık temizliği (2026-10-28)
 *
 * Neden: sepet yükü altında bazı siteler 404 + büyük "sayfa bulunamadı" sayfası
 * döndürüyordu; zincir bunu geçerli sanıp önbelleğe yazıyordu. Kod artık böyle
 * yanıtları yazmıyor, ama geçmişte yazılmış kayıtlar 6 saat boyunca "fiyat yok"
 * hatası veriyordu. Bu betik eski bozuk kayıtları bulup siler.
 *
 * Kullanım:
 *   node scripts/onbellek-temizle.mjs           # yalnız rapor (silmez)
 *   node scripts/onbellek-temizle.mjs --sil     # bulunanları siler
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const sil = process.argv.includes('--sil');
const CACHE_DIR = path.join(config.dataDir, 'cache');

if (!fs.existsSync(CACHE_DIR)) {
  console.log('Önbellek klasörü yok:', CACHE_DIR);
  process.exit(0);
}

const BASLIK_RE = /<title>([^<]*)<\/title>/i;
const H1_RE = /<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i;
const HATA_RE = /(^|\D)404(\D|$)|bulunamad[ıi]|sayfa bulunamad[ıi]|not found|page not found|arad[ıi][ğg][ıi]n[ıi]z sayfa/i;

/** Dosyanın yalnız başını okur: kayıt biçimi {"url":...,"status":200,"body":"<html>...
 *  olduğundan durum ve başlık ilk birkaç KB içinde. 4 GB önbelleği tek tek
 *  JSON.parse etmeden hızlı tarama yapılır. */
function bozukMu(dosya) {
  let fd;
  try {
    fd = fs.openSync(dosya, 'r');
    const boyut = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(boyut, 8192));
    fs.readSync(fd, buf, 0, buf.length, 0);
    const bas = buf.toString('utf8');
    const durum = Number((bas.match(/"status"\s*:\s*(\d+)/) || [])[1] || 0);
    if (durum === 404 || durum === 410) return `HTTP ${durum}`;
    if (durum !== 200) return null;
    // JSON gövde (API yanıtı) ise hata sayfası değildir.
    if (/"body"\s*:\s*"\s*[{[]/.test(bas)) return null;
    const baslik = (bas.match(BASLIK_RE) || [])[1] || '';
    const h1 = (bas.match(H1_RE) || [])[1] || '';
    const metin = (baslik + ' ' + h1).toLowerCase();
    if (HATA_RE.test(metin)) return `"${(baslik || h1).trim().slice(0, 50)}"`;
    return null;
  } catch {
    return 'okunamadı';
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* yok say */ }
  }
}

const dosyalar = fs.readdirSync(CACHE_DIR).filter((d) => d.endsWith('.json'));
let bozuk = 0;
let bayt = 0;
const ornekler = [];

for (const ad of dosyalar) {
  const tam = path.join(CACHE_DIR, ad);
  const neden = bozukMu(tam);
  if (!neden) continue;
  bozuk++;
  try { bayt += fs.statSync(tam).size; } catch { /* yok say */ }
  if (ornekler.length < 8) ornekler.push(`${ad} → ${neden}`);
  if (sil) { try { fs.unlinkSync(tam); } catch { /* yok say */ } }
}

console.log(`Taranan: ${dosyalar.length} kayıt`);
console.log(`Bozuk/zehirli: ${bozuk} (${(bayt / 1024 / 1024).toFixed(1)} MB)`);
for (const o of ornekler) console.log('  •', o);
console.log(sil ? (bozuk ? 'Silindi.' : 'Silinecek kayıt yok.') : 'Silmedim — gerçekten silmek için --sil ekleyin.');
