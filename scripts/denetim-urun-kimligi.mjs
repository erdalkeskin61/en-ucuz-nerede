/**
 * 🔎 Radar kataloğu ↔ eşleşen ilan kimlik denetimi (2026-11-04)
 *
 * Neden: kullanıcı bildirimi — borsada/Telegram'da "Anycubic Kobra 2 Neo"
 * kartı ₺17.000 gösteriyordu ama "Mağazaya git" Hepsiburada'daki
 * **Anycubic Kobra 4** ilanına gidiyordu.
 *
 * Bu betik `radar_durum` içindeki HER kartın, eşleştiği ilan başlığıyla
 * gerçekten aynı ürün olup olmadığını `util.js` kimlik kurallarıyla denetler:
 *   - model serisi (Kobra 2 Neo ↔ Kobra 4)
 *   - ürün hattı / malzeme (PLA ↔ PLA-CF, PLA+ ↔ PLA+HS, Silk ↔ düz PLA)
 *   - kapasite (8GB ↔ 16GB)
 *
 * Kullanım:
 *   node scripts/denetim-urun-kimligi.mjs          # rapor + çıkış kodu
 *   node scripts/denetim-urun-kimligi.mjs --ayrinti
 *
 * Çıkış kodu 1 = en az bir çakışma var (CI/otomasyon için).
 * Veritabanına YAZMAZ.
 */
import { dbBaglantisi, closeDatabase } from '../src/store.js';
import {
  modelSerisiCakismasi, hatCakismasi, kapasiteCakismasi, muhtemelMarka, brandAyni,
} from '../src/util.js';

/**
 * Katalog adı ile eşleşen ilan FARKLI MARKA mı? (2026-11-04)
 * Trendyol kaynağında marka alanı boşken "eSun … Kemik Beyazı" yerine
 * "Filamix … Kemik Beyazı" kartı gösterilmişti. Marka kelimeleri başlıklarda
 * geçiyorsa (pazaryeri satıcı adı durumu) çelişki sayılmaz.
 */
function markaCakismasi(katalogAd, ilan) {
  const a = muhtemelMarka(katalogAd);
  const b = muhtemelMarka(ilan);
  if (!a || !b || brandAyni(a, b)) return false;
  const basK = String(katalogAd).toLocaleLowerCase('tr-TR');
  const basI = String(ilan).toLocaleLowerCase('tr-TR');
  return !(basI.includes(a) || basK.includes(b));
}

/**
 * AYKIRI FİYAT (2026-11-04): yazıcı kategorisinde aksesuar, yazıcı fiyatı gibi
 * görünebiliyor ("A1/A1 Mini Enclosed Kit" ₺2.846 ↔ yazıcı ₺14.020).
 * Kart fiyatı, diğer stoklu tekliflerin en ucuzunun yarısından düşükse uyarır.
 */
function aykiriFiyat(d) {
  if (String(d?.kategori || '').toLowerCase() !== 'yazici') return false;
  const fiyat = Number(d?.fiyat);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return false;
  const diger = (d.digerleri || []).map(x => Number(x.fiyat)).filter(n => Number.isFinite(n) && n > 0);
  if (!diger.length) return false;
  return fiyat < Math.min(...diger) * 0.5;
}

const ayrinti = process.argv.includes('--ayrinti');
const db = dbBaglantisi();
const satirlar = db.prepare(`
  SELECT k.id, k.ad, k.url AS katalogUrl, d.veri
  FROM radar_katalog k
  LEFT JOIN radar_durum d ON d.katalog_id = k.id
  ORDER BY k.id
`).all();

let uyumlu = 0;
let durumsuz = 0;
const cakismalar = [];

for (const r of satirlar) {
  if (!r.veri) { durumsuz++; continue; }
  let d = null;
  try { d = JSON.parse(r.veri); } catch { durumsuz++; continue; }
  const ilan = String(d?.urun || '');
  if (!ilan) { durumsuz++; continue; }

  const neden = markaCakismasi(r.ad, ilan) ? 'marka'
    : modelSerisiCakismasi(r.ad, ilan) ? 'model serisi'
      : hatCakismasi(r.ad, ilan) ? 'ürün hattı/malzeme'
        : kapasiteCakismasi(r.ad, ilan) ? 'kapasite'
          : aykiriFiyat(d) ? 'aykırı fiyat (aksesuar olabilir)'
            : null;
  if (neden) cakismalar.push({ ...r, d, ilan, neden });
  else uyumlu++;
}

if (cakismalar.length) {
  console.log(`\n🔴 ${cakismalar.length} kartta YANLIŞ ÜRÜN eşleşmesi:\n`);
  for (const c of cakismalar) {
    console.log(`• katalog ${c.id}: ${c.ad}`);
    console.log(`  neden   : ${c.neden}`);
    console.log(`  ilan    : ${c.ilan}`);
    console.log(`  mağaza  : ${c.d.site ?? '—'} ${c.d.fiyat != null ? '₺' + c.d.fiyat : ''}`
      + ` · stokta: ${c.d.stokta ? 'evet' : 'hayır'}`);
    if (ayrinti) {
      console.log(`  link    : ${c.d.hamUrl || '—'}`);
      console.log(`  kaynak  : ${c.d.kaynakUrl || '—'}`);
      if (c.d.digerleri?.length) {
        console.log(`  diğer   : ${c.d.digerleri.map(x => `${x.site} ₺${x.fiyat}`).join(' · ')}`);
      }
    }
    console.log('');
  }
}

console.log('─'.repeat(52));
console.log(`uyumlu: ${uyumlu} · çakışan: ${cakismalar.length} · durumsuz: ${durumsuz}`);
console.log(cakismalar.length
  ? '❌ Denetim başarısız — radar taraması bu kartları düzeltene kadar yanlış link riski var.'
  : '✅ Tüm radar kartları katalog ürünüyle aynı kimlikte.');

closeDatabase();
process.exitCode = cakismalar.length ? 1 : 0;
