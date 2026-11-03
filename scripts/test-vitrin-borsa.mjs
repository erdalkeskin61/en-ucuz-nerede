/**
 * 📊 Ana sayfa "Canlı Filament & 3D Yazıcı Borsası" testleri — 2026-11-03
 *
 * Kapsam:
 *  1) vitrinVerisi(): stokta önce + fiyat artan sıralama, limit, fiyatsız/URL'siz
 *     kart elenmesi, afiliye URL tercihi.
 *  2) Rozet dürüstlüğü: "En Dip Fiyat" yalnızca gerçek geçmiş minimumu ve
 *     en az 2 nokta varsa; indirim yüzdesi gerçek tasarruftan.
 *  3) Gizlilik: yanıtta token/chatId/PID/veri yok (herkese açık uç).
 *  4) Sunucu: /api/vitrin ucu + erişim anahtarı muafiyeti (yalnızca GET).
 *  5) Ön yüz sözleşmeleri: HTML bölümü, 60 sn tazeleme, sparkline,
 *     mobil alt gezinme (Ara & Kıyasla / Borsa / Alarmlarım / Sepetim / Ayarlar).
 *  6) CSS: bento ızgara, koyu tema, mobil tek/iki kolon, tabular-nums,
 *     reduced-motion.
 *
 * Testin yazdığı radar_durum/radar_gecmis kayıtları sonunda SİLİNİR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import { vitrinVerisi, radarKapat } from '../src/otonomRadar.js';

let gecen = 0;
let toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

const dbYolu = path.join(config.dataDir, 'en_ucuz_nerede.db');
const db = new DatabaseSync(dbYolu);
const TABAN = 970000 + (Date.now() % 1000);
const idler = {
  dip: TABAN + 1,
  indirim: TABAN + 2,
  tukendi: TABAN + 3,
  urlsuz: TABAN + 4,
  verisiz: TABAN + 5,
};

const durumEkle = (id, d) => db.prepare(`
  INSERT INTO radar_durum (anahtar, katalog_id, urun, site, site_id, fiyat, stokta, ts, paylasim_ts, veri)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  ON CONFLICT(anahtar) DO UPDATE SET veri = excluded.veri, fiyat = excluded.fiyat, stokta = excluded.stokta
`).run(
  `katalog:${id}`, id, d.ad, d.site || null, d.siteId || null,
  d.fiyat ?? null, d.stokta ? 1 : 0, Date.now(),
  JSON.stringify({
    anahtar: `katalog:${id}`, katalogId: id, ad: d.ad, kategori: d.kategori || 'filament',
    site: d.site, siteId: d.siteId, fiyat: d.fiyat, stokta: d.stokta,
    hamUrl: d.hamUrl ?? null, afiliyeUrl: d.afiliyeUrl ?? null,
    birimMetni: d.birimMetni ?? null, kargo: d.kargo ?? null,
    enPahaliFiyat: d.enPahaliFiyat ?? null, tasarruf: d.tasarruf ?? null,
    pid: '__gizli_pid__',
  }),
);

const gecmisEkle = (id, gunOnce, fiyat) => db.prepare(`
  INSERT INTO radar_gecmis (katalog_id, ts, fiyat, site, stokta)
  VALUES (?, ?, ?, 'TestMarket', 1)
`).run(id, Date.now() - gunOnce * 86400000, fiyat);

const temizle = () => {
  for (const id of Object.values(idler)) {
    db.prepare('DELETE FROM radar_durum WHERE katalog_id = ?').run(id);
    db.prepare('DELETE FROM radar_gecmis WHERE katalog_id = ?').run(id);
  }
};

try {
  /* ---------------------------------------------------------------- */
  bolum('1) 📊 vitrinVerisi — sıralama ve temizlik');

  durumEkle(idler.dip, {
    ad: 'TEST VITRIN En Dip Filament 1kg', kategori: 'filament', site: 'Ventatek',
    siteId: 'ventatek', fiyat: 500, stokta: true,
    hamUrl: 'https://ventatek.test/urun',
    afiliyeUrl: 'https://ventatek.test/urun?utm_source=eun',
    birimMetni: '₺500,00 / kg', kargo: 'Ücretsiz Kargo',
    enPahaliFiyat: 700, tasarruf: 200,
  });
  gecmisEkle(idler.dip, 20, 620);
  gecmisEkle(idler.dip, 9, 560);
  gecmisEkle(idler.dip, 2, 500);

  durumEkle(idler.indirim, {
    ad: 'TEST VITRIN Indirimli Filament 1kg', category: undefined, kategori: 'filament',
    site: 'Trendyol', siteId: 'trendyol', fiyat: 532.21, stokta: true,
    hamUrl: 'https://trendyol.test/urun', afiliyeUrl: null,
    enPahaliFiyat: 619, tasarruf: 86.79,
  });
  gecmisEkle(idler.indirim, 5, 600);

  durumEkle(idler.tukendi, {
    ad: 'TEST VITRIN Tukenen Yazici', kategori: 'yazici', site: '3Dcim',
    siteId: '3dcim', fiyat: 24287.71, stokta: false,
    hamUrl: 'https://3dcim.test/yazici',
  });

  durumEkle(idler.urlsuz, {
    ad: 'TEST VITRIN Linki Olmayan', kategori: 'genel', site: 'Yok',
    fiyat: 100, stokta: true, hamUrl: null, afiliyeUrl: null,
  });

  db.prepare(`
    INSERT INTO radar_durum (anahtar, katalog_id, urun, site, site_id, fiyat, stokta, ts, paylasim_ts, veri)
    VALUES (?, ?, 'TEST VITRIN Bozuk', 'X', 'x', 1, 1, ?, NULL, 'bozuk-json')
  `).run(`katalog:${idler.verisiz}`, idler.verisiz, Date.now());

  const v = vitrinVerisi({ limit: 24 });
  kontrol('vitrin ok döner', v.ok === true);
  kontrol('urunler dizi', Array.isArray(v.urunler));
  kontrol('gosterilen = urunler uzunluğu', v.gosterilen === v.urunler.length);
  kontrol('bozuk JSON kartı atlanır', !v.urunler.some(u => u.ad === 'TEST VITRIN Bozuk'));
  kontrol('URL yoksa kart yok', !v.urunler.some(u => u.ad === 'TEST VITRIN Linki Olmayan'));

  const dipKart = v.urunler.find(u => u.id === idler.dip);
  const indirimKart = v.urunler.find(u => u.id === idler.indirim);
  const tukendiKart = v.urunler.find(u => u.id === idler.tukendi);

  kontrol('dip ürün vitrinde', !!dipKart);
  kontrol('indirimli ürün vitrinde', !!indirimKart);
  kontrol('tükenen ürün de listelenir (sonlarda)', !!tukendiKart);

  // Stokta olanlar tükenenden ÖNCE gelir.
  const iDip = v.urunler.findIndex(u => u.id === idler.dip);
  const iTuk = v.urunler.findIndex(u => u.id === idler.tukendi);
  kontrol('stokta olan tükenenden önce', iDip < iTuk, `${iDip} < ${iTuk}`);

  // Stokta grubu fiyat artan sıralı.
  const stokluFiyatlar = v.urunler.filter(u => u.stokta).map(u => u.fiyat);
  kontrol('stokta grubu fiyat artan', stokluFiyatlar.every((f, i) => i === 0 || stokluFiyatlar[i - 1] <= f),
    stokluFiyatlar.slice(0, 5).join(','));
  kontrol('tükenen ürün stokta:false', tukendiKart?.stokta === false);

  /* ---------------------------------------------------------------- */
  bolum('2) 🏷️ Rozet dürüstlüğü (En Dip / İndirim)');

  kontrol('gerçek dip → En Dip Fiyat', dipKart?.dip === true);
  kontrol('tek noktalı geçmiş dip rozeti vermez', indirimKart?.dip === false);
  kontrol('indirim yüzdesi gerçek tasarruftan', indirimKart?.indirimYuzde === 14,
    String(indirimKart?.indirimYuzde));
  kontrol('tükenen ürün dip rozeti almaz', tukendiKart?.dip === false);
  kontrol('tasarruf aktarılır', dipKart?.tasarruf === 200);
  kontrol('birim fiyat aktarılır', dipKart?.birimMetni === '₺500,00 / kg');
  kontrol('kargo aktarılır', dipKart?.kargo === 'Ücretsiz Kargo');
  kontrol('kategori ikonu filament', dipKart?.ikon === '🧵');
  kontrol('kategori ikonu yazıcı', tukendiKart?.ikon === '🖨️');
  kontrol('afiliye link tercih edilir', dipKart?.url.includes('utm_source=eun'));
  kontrol('afiliye işareti', dipKart?.afiliye === true);
  kontrol('afiliyesiz link aynen', indirimKart?.url === 'https://trendyol.test/urun');

  const seriKart = v.urunler.find(u => u.id === idler.dip);
  kontrol('trend serisi gelir (3 nokta)', seriKart?.seri?.length === 3, String(seriKart?.seri?.length));
  kontrol('seri fiyatları doğru', JSON.stringify(seriKart?.seri) === JSON.stringify([620, 560, 500]));
  kontrol('önceki fiyata göre değişim', seriKart?.degisim === -60, String(seriKart?.degisim));

  /* ---------------------------------------------------------------- */
  bolum('3) 🔒 Gizlilik — yalnızca herkese açık alanlar');

  const izinli = new Set([
    'id', 'ad', 'kategori', 'ikon', 'site', 'siteId', 'fiyat', 'stokta',
    'birimMetni', 'kargo', 'url', 'afiliye', 'dip', 'indirimYuzde', 'tasarruf',
    'degisim', 'seri', 'ts',
  ]);
  const tumAnahtarlar = new Set();
  for (const u of v.urunler) for (const k of Object.keys(u)) tumAnahtarlar.add(k);
  const sizan = [...tumAnahtarlar].filter(k => !izinli.has(k));
  kontrol('fazladan/gizli alan yok', sizan.length === 0, sizan.join(','));
  kontrol('PID sızmaz', !JSON.stringify(v).includes('__gizli_pid__'));
  kontrol('sohbet kimliği yok', !/chatId|chat_id|botToken|token|mesaj_id/i.test(JSON.stringify(v)));

  /* ---------------------------------------------------------------- */
  bolum('4) 🧮 Limit ve boş durum');

  const az = vitrinVerisi({ limit: 2 });
  kontrol('limit uygulanır', az.urunler.length === 2, String(az.urunler.length));
  kontrol('limit 1 altına inmez', vitrinVerisi({ limit: 0 }).urunler.length >= 1);
  kontrol('güncelleme ISO tarih', /^\d{4}-\d{2}-\d{2}T/.test(v.guncelleme || ''), String(v.guncelleme));

  /* ---------------------------------------------------------------- */
  bolum('5) 🌐 Sunucu / API sözleşmesi');

  const kok = path.resolve(import.meta.dirname, '..');
  const oku = (p) => fs.readFileSync(path.join(kok, p), 'utf8');
  const serverSrc = oku('server.js');
  const html = oku('public/index.html');
  const app = oku('public/app.js');
  const css = oku('public/style.css');

  kontrol('server: /api/vitrin ucu', /app\.get\('\/api\/vitrin'/.test(serverSrc));
  kontrol('server: vitrinVerisi importu', /vitrinVerisi/.test(serverSrc));
  kontrol('server: erişim anahtarı muafiyeti (GET)', /req\.method === 'GET' && req\.path === '\/api\/vitrin'/.test(serverSrc));
  kontrol('server: en fazla 60 sn önbellek', /max-age=60/.test(serverSrc));

  /* ---------------------------------------------------------------- */
  bolum('6) 🖥️ Ön yüz — HTML / JS / CSS');

  kontrol('HTML: vitrin bölümü', /id="vitrinAlani"[^>]*class="vitrin"/.test(html));
  kontrol('HTML: borsa başlığı', /Canlı Filament &amp; 3D Yazıcı Borsası/.test(html));
  kontrol('HTML: canlı ızgara', /id="vitrinGrid"[^>]*class="vitrin-grid"/.test(html));
  kontrol('HTML: aria-live', /id="vitrinGrid"[^>]*aria-live="polite"/.test(html));
  kontrol('HTML: boş durum', /id="vitrinBos"/.test(html));
  kontrol('HTML: yenile butonu', /id="vitrinYenile"/.test(html));
  kontrol('HTML: fırsatlar çipi', /data-firsat-ac/.test(html));

  kontrol('JS: /api/vitrin çağrısı', /fetch\('\/api\/vitrin\?limit=12'/.test(app));
  kontrol('JS: 60 sn tazeleme', /VITRIN_ARALIK_MS = 60 \* 1000/.test(app));
  kontrol('JS: sekme görünürlüğünde tazeleme', /visibilitychange/.test(app));
  kontrol('JS: sparkline SVG', /function vitrinSparkline/.test(app) && /polyline/.test(app));
  kontrol('JS: ₺ biçimi + tabular', /function vitrinPara/.test(app));
  kontrol('JS: dip rozeti', /En Dip Fiyat/.test(app));
  kontrol('JS: indirim rozeti', /İndirim/.test(app));
  kontrol('JS: afiliye tıklama işareti', /data-afiliye-site/.test(app));
  kontrol('JS: borsa sekmesi işleyicisi', /function borsaGoster/.test(app) && /ad === 'borsa'/.test(app));
  kontrol('JS: iskelet yükleme', /vitrinIskelet/.test(app));

  kontrol('HTML: alt nav borsa', /data-nav="borsa"/.test(html));
  kontrol('HTML: Ara & Kıyasla etiketi', /Ara &amp; Kıyasla/.test(html));
  kontrol('HTML: Dip Fırsatlar etiketi', /Dip Fırsatlar/.test(html));
  kontrol('HTML: Fiyat Alarmlarım aria etiketi', /Fiyat alarmlarım/i.test(html));
  kontrol('HTML: Alarmlarım etiketi', />Alarmlarım</.test(html));
  kontrol('HTML: Ayarlar öğesi', /data-nav="ayarlar"/.test(html));
  // Spec: 4 butonlu alt bar (Sepetim sayfa içinde kalır, alt barda değil).
  const navOgeSayisi = (html.match(/class="alt-nav-oge[^"]*" data-nav=/g) || []).length;
  kontrol('HTML: alt bar 4 öğe', navOgeSayisi === 4, String(navOgeSayisi));
  kontrol('HTML: Sepetim alt barda değil', !/data-nav="sepet"/.test(html));
  kontrol('CSS: alt bar 4 kolon', /grid-template-columns: repeat\(4, 1fr\)/.test(css));

  kontrol('CSS: vitrin ızgarası', /\.vitrin-grid\s*\{[^}]*grid-template-columns/.test(css));
  kontrol('CSS: masaüstü 4 kolon', /repeat\(4, minmax\(0, 1fr\)\)/.test(css));
  kontrol('CSS: mobil 1 kolon (<=380)', /@media \(max-width: 380px\)[\s\S]{0,120}\.vitrin-grid\s*\{\s*grid-template-columns:\s*1fr/.test(css));
  kontrol('CSS: tabular-nums fiyat', /\.vitrin-fiyat\s*\{[^}]*font-variant-numeric:\s*tabular-nums/.test(css));
  kontrol('CSS: koyu tema', /html\[data-theme="dark"\] \.vitrin/.test(css));
  kontrol('CSS: reduced-motion', /prefers-reduced-motion[\s\S]{0,200}\.vitrin-kart/.test(css));
  kontrol('CSS: odak halkası', /\.vitrin-kart:focus-visible\s*\{[^}]*box-shadow/.test(css));
  kontrol('CSS: dip kart vurgusu', /\.vitrin-kart-dip\s*\{/.test(css));
  kontrol('CSS: canlı nabız', /@keyframes vitrinNabiz/.test(css));
  kontrol('CSS: dokunma hedefi yenile 38px', /\.vitrin-yenile\s*\{[^}]*width:\s*38px/s.test(css));
} finally {
  temizle();
  db.close();
  try { radarKapat(); } catch { /* yoksay */ }
}

console.log(`\n${'─'.repeat(46)}`);
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
} else {
  console.log('✅ Tüm canlı borsa vitrini testleri geçti.');
}
process.exit(hatalar.length ? 1 : 0);
