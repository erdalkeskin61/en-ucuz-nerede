/**
 * TARAMA DAYANIKLILIĞI regresyonu (2026-11-03)
 *
 * Neden var: "Borsa en ucuzu göstermiyor" şikâyetinin kökünde ÜÇ hata vardı:
 *   1) Kazıma havuzunda YUVA SIZINTISI: `acquire()` yuvayı alıyor, `releaseSlot()`
 *      hiç çağrılmıyordu. 8 istekten sonra havuz kalıcı olarak doluyor ve TÜM
 *      kazıma kilitleniyordu (tarama 27 sn'de donuyordu).
 *   2) Site zaman aşımı DUVAR SAATİ ile ölçülüyordu. 61 site paralel taranırken
 *      istekler 8'li kuyrukta bekliyor; sırada bekleyen site hiç çalışmadan
 *      "10 sn içinde yanıt vermedi" diye düşürülüyordu → 61 sitenin 38'i timeout.
 *   3) İkas adaptörü mağaza para birimini (USD) TL sanıyor ve JWT'yi her aramada
 *      yeniden çekiyordu; yük altında JWT bulunamayınca sorguyu yok sayan render
 *      yedeğine düşüp ürün yerine aksesuar inceliyordu (fixx3d / Creality K1 Max).
 *
 * Kullanım:
 *   node scripts/test-tarama-dayaniklilik.mjs           (statik + birim, ağa çıkmaz)
 *   node scripts/test-tarama-dayaniklilik.mjs --canli   (+ gerçek 61 site taraması)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { kuyrukDurumu } from '../src/scraper.js';
import { config } from '../src/config.js';
import { matchProducts, yilEdisyonAyniMi } from '../src/util.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANLI = process.argv.includes('--canli');
const TABAN = process.env.TABAN || 'http://localhost:3000';
const ANAHTAR = process.env.ERISIM_ANAHTARI || 'qx2kjlgmwhfnzc1p6b3r4ayd';

let gecen = 0, kalan = 0;
const hatalar = [];
function kontrol(ad, kosul, detay = '') {
  if (kosul) { gecen++; console.log(`  ✓ ${ad}`); }
  else { kalan++; hatalar.push(ad + (detay ? ` → ${detay}` : '')); console.log(`  ✗ ${ad}${detay ? ' → ' + detay : ''}`); }
}
function bolum(ad) { console.log(`\n${ad}`); }
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

/* ============ 1) Havuz yuvası sızıntısı ============ */
bolum('1) Kazıma havuzu — yuva sızıntısı yok');

const scraper = oku('src/scraper.js');
const acquireSayisi = (scraper.match(/await acquire\(\)/g) || []).length;
const releaseSayisi = (scraper.match(/releaseSlot\(\);/g) || []).length;
kontrol('3 sağlayıcıda acquire() var', acquireSayisi === 3, String(acquireSayisi));
kontrol('her acquire için finally\'de releaseSlot var', releaseSayisi >= 3,
  `acquire=${acquireSayisi} release=${releaseSayisi}`);
kontrol('releaseSlot ScraperAPI finally içinde',
  /saglayici: 'scraperapi' \};\s*\n\s*\} finally \{[\s\S]{0,120}?releaseSlot\(\);/.test(scraper));
kontrol('releaseSlot Crawlbase finally içinde',
  /saglayici: 'crawlbase' \};\s*\n\s*\} finally \{[\s\S]{0,120}?releaseSlot\(\);/.test(scraper));
kontrol('releaseSlot ZenRows finally içinde',
  /saglayici: 'zenrows' \};\s*\n\s*\} finally \{[\s\S]{0,120}?releaseSlot\(\);/.test(scraper));

const k0 = kuyrukDurumu();
kontrol('kuyrukDurumu() alanları', ['inFlight', 'bekleyen', 'max'].every(k => k in k0), JSON.stringify(k0));
kontrol('başlangıçta kuyruk boş', k0.bekleyen === 0, String(k0.bekleyen));
kontrol('eşzamanlılık sınırı makul (4–16)', k0.max >= 4 && k0.max <= 16, String(k0.max));

/* ============ 2) Zaman aşımı ============ */
bolum('2) Site zaman aşımı — ilerleme temelli');

const pipe = oku('src/pipeline.js');
kontrol('duvar saati yarışı kaldırıldı (Promise.race + setTimeout yok)',
  !/siteZamanAsimi\s*\n?\s*\? await Promise\.race/.test(pipe));
kontrol('zamanAsimliCalistir kullanılıyor', /zamanAsimliCalistir\(arama, siteZamanAsimi, a, aktivite\)/.test(pipe));
kontrol('kuyrukta bekleme sayılmıyor', /kuyrukDurumu\(\)\.bekleyen/.test(pipe) && /if \(kuyruk > 0\) return;/.test(pipe));
kontrol('ilerleme sayacı (aktivite) var', /aktivite\.deger\+\+/.test(pipe) && /aktivite\.deger !== sonAktivite/.test(pipe));
kontrol('sert üst sınır var (kuyruk tıkansa bile asılı kalmaz)', /sertSinir/.test(pipe));
kontrol('varsayılan site zaman aşımı >= 20 sn', config.siteTimeoutMs >= 20000, String(config.siteTimeoutMs));
kontrol('yapılandırılabilir (SITE_TIMEOUT_MS)', /SITE_TIMEOUT_MS/.test(oku('src/config.js')));
kontrol('timeout mesajı dürüst ("ilerleme kaydetmedi")', /ilerleme kaydetmedi/.test(pipe));

/* ============ 3) İkas adaptörü ============ */
bolum('3) İkas adaptörü — para birimi ve kimlik önbelleği');

const ikas = oku('src/sites/plt-ikas.js');
kontrol('para birimi TRY değilse fiyat null',
  /if \(kod !== 'TRY'\) return \{ fiyat: null/.test(ikas));
kontrol('para birimi bilinmiyorsa TL SAYILMAZ',
  /if \(kod !== 'TRY'\)/.test(ikas) && /currencyCode/.test(ikas));
kontrol('GraphQL sorgusu currencyCode istiyor', /prices \{ currencyCode discountPrice sellPrice buyPrice \}/.test(ikas));
kontrol('mağaza kimliği önbelleği var (30 dk)', /IKAS_KIMLIK_TTL_MS/.test(ikas) && /ikasKimlik/.test(ikas));
kontrol('JWT 401/403 alınca önbellek temizleniyor', /ikasKimlik\.delete\(base\)/.test(ikas));
kontrol('render yedeği sorgu kelimeleriyle süzülüyor', /kelimeler\.some\(w => t\.includes\(w\)\)/.test(ikas));
kontrol('source URL seçiminde fiyat ZORUNLU değil (null olabilir)',
  /\(a\.price == null \|\| Number\(a\.price\) > 0\)/.test(oku('src/urunArama.js')));

/* ============ 4) Eşleştirme: yıl eki + YZ koruması ============ */
bolum('4) Eşleştirme — yıl/sürüm eki ve YZ koruması');

const urun = (title, extra = {}) => ({ title, brand: 'Creality', modelCode: null, barcode: null, ...extra });
kontrol('yıl eki AYNI ürün sayılır (K1 Max 2025)',
  yilEdisyonAyniMi('Creality K1 Max 3d Yazıcı', 'Creality K1 Max 2025 3D Yazıcı') === true);
kontrol('yıl eki matchProducts ile eşleşir',
  !!matchProducts(urun('Creality K1 Max 3d Yazıcı'), urun('Creality K1 Max 2025 3D Yazıcı')));
kontrol('yıl eşleşmesi YZ\'ye sorulmaz (griAlan yok)',
  matchProducts(urun('Creality K1 Max 3d Yazıcı'), urun('Creality K1 Max 2025 3D Yazıcı'))?.griAlan !== true);
kontrol('farklı model (Ender 5 Max) REDDEDİLİR',
  matchProducts(urun('Creality K1 Max 3d Yazıcı'), urun('Creality Ender 5 Max 3D Yazıcı')) === null);
kontrol('aksesuar (PEI tabla) REDDEDİLİR',
  matchProducts(urun('Creality K1 Max 3d Yazıcı'), urun('Creality K1 Max Düz PEI Baskı Tablası Kiti')) === null);
kontrol('kapasite farkı KORUNUR (8GB vs 16GB)',
  matchProducts(urun('RAM 8GB DDR4', { brand: 'Kingston' }), urun('RAM 16GB DDR4', { brand: 'Kingston' })) === null);
kontrol('gramaj farkı KORUNUR (1kg vs 800gr)',
  matchProducts(urun('Filament 1kg'), urun('Filament 800gr')) === null);

kontrol('YZ daha güçlü adayı reddettiyse zayıf aday kabul edilmez',
  /llmRedSkor/.test(pipe) && /match\.eslesme === 'benzerlik' && llmRedSkor > 0/.test(pipe));

/* ============ 5) Borsa vitrini ============ */
bolum('5) Borsa vitrini');
const radar = oku('src/otonomRadar.js');
// 2026-11-12: vitrin sorgusu kategori JOIN'i ile yeniden yazıldı (d./k. önekli).
// Niyet korunur: fiyat/mağaza/stok alanları radar_durum'dan okunur.
kontrol('vitrin en ucuzu radar_durum fiyatından okur',
  /SELECT d\.katalog_id,\s*d\.urun,\s*d\.site,\s*d\.site_id,\s*d\.fiyat,\s*d\.stokta[\s\S]{0,260}FROM radar_durum d/.test(radar));
kontrol('stokta olmayanlar sonda', /ORDER BY (d\.)?stokta DESC, (d\.)?fiyat ASC/.test(radar));
kontrol('fiyatsız kart borsaya girmez', /fiyat == null \|\| fiyat <= 0/.test(radar));
kontrol('yanıltıcı yüksek yüzde rozeti engellendi (<=%60)', /farkGuvenilir/.test(radar) && /hamYuzde <= 60/.test(radar));
const appJs = oku('public/app.js');
kontrol("rozet \"İndirim\" değil \"Mağazalar arası fark\" diyor",
  /Mağazalar arası %/.test(appJs) && !/%\$\{Number\(u\.indirimYuzde\)\} İndirim/.test(appJs));
// 2026-11-12: istemci 12 kart ister; "pahalı ürünler kesilmez" güvencesi sunucuda
// limitin 24'e kadar kabul edilmesidir (kota ölçeklenir).
kontrol('vitrin limiti 24 (pahalı ürünler kesilmez)',
  /Math\.min\(24,/.test(radar) && /\/api\/vitrin\?limit=12/.test(appJs));

/* ============ 5) Canlı ============ */
if (CANLI) {
  bolum('5) Canlı 61 site taraması');
  const HDR = { 'x-erisim-anahtari': ANAHTAR, 'Content-Type': 'application/json' };
  const URL_X = 'https://www.trendyol.com/creality/k1-max-3d-yazici-p-809731914?boutiqueId=61&merchantId=992271';

  const t0 = Date.now();
  const bas = await (await fetch(TABAN + '/api/compare', {
    method: 'POST', headers: HDR,
    body: JSON.stringify({ url: URL_X, taze: true }),
  })).json();
  kontrol('canlı: iş oluştu', !!bas.isId, JSON.stringify(bas).slice(0, 120));

  let son = null;
  const bitis = Date.now() + 5 * 60 * 1000;
  while (Date.now() < bitis) {
    await new Promise(r => setTimeout(r, 3000));
    son = await (await fetch(`${TABAN}/api/compare/${bas.isId}`, { headers: HDR })).json();
    if (son.status !== 'running') break;
  }
  const sure = Math.round((Date.now() - t0) / 1000);
  const r = son?.result || {};
  const sonuclar = r.sonuclar || [];
  const timeoutSayisi = sonuclar.filter(s => s.status === 'timeout').length;
  const bulunan = sonuclar.filter(s => s.status === 'found' && s.product);

  kontrol('canlı: tarama tamamlandı', son?.status === 'done', son?.status);
  kontrol('canlı: tarama 3 dk içinde bitti (kilitlenme yok)', sure < 180, sure + ' sn');
  kontrol('canlı: timeout sayısı <= 3', timeoutSayisi <= 3, String(timeoutSayisi));
  kontrol('canlı: en az 20 sitede ürün bulundu', bulunan.length >= 20, String(bulunan.length));

  const f = sonuclar.find(s => s.site === 'fixx3d');
  kontrol('canlı: fixx3d bulundu (eski hata)', f?.status === 'found', f?.status);
  kontrol('canlı: fixx3d fiyatı TL aralığında (uydurma değil)',
    !f?.product || (f.product.pricing?.toplam > 1000 && f.product.pricing?.toplam < 200000),
    String(f?.product?.pricing?.toplam));

  // Borsa: K1 Max satırı hangi mağazayı gösteriyor?
  const v = await (await fetch(TABAN + '/api/vitrin?limit=24', { headers: HDR })).json();
  const k1 = (v.urunler || []).find(u => /K1 Max/i.test(u.ad));
  kontrol('canlı: borsada K1 Max var', !!k1, '-');
  if (k1) {
    console.log(`     → borsa: ${k1.site} — ${k1.fiyat} TL`);
    const enUcuzCanli = bulunan
      .filter(s => s.product.inStock !== false && s.product.pricing?.toplam != null)
      .sort((a, b) => a.product.pricing.toplam - b.product.pricing.toplam)[0];
    kontrol('canlı: borsa en ucuz mağazayı gösteriyor',
      enUcuzCanli && k1.site === enUcuzCanli.siteName,
      `borsa=${k1.site} canlı=${enUcuzCanli?.siteName}`);
  }
}

console.log(`\nTARAMA-DAYANIKLILIK ${gecen}/${gecen + kalan} ${kalan === 0 ? '✓' : '✗'}`);
if (kalan) { console.log('Başarısız:'); for (const h of hatalar) console.log('  - ' + h); }
process.exitCode = kalan === 0 ? 0 : 1;
