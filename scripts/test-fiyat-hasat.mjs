/**
 * 🔁 Fiyat Hasadı + SEO Ürün Sayfaları Testi — 2026-11-28
 *
 * Kapsam
 *   1)  Katalog şeması: katalog_urunleri + katalog_hasat
 *   2)  Aday seçimi: yalnızca "başka mağazada fiyatlı" fiyatsız ürünler
 *   3)  Defter mantığı: yakın zamanda denenen aday tekrar seçilmez
 *   4)  Fiyat yazma: gerçek fiyat, kaynakTur='sayfa', güncel ts
 *   5)  Uydurma koruması: fiyat yoksa NULL kalır
 *   6)  SEO entegrasyonu: 2+ teklifli ürün dizinlenebilir, sitemap'e girer
 *   7)  server.js: admin uçları + zamanlayıcı + /api/durum alanı
 *   8)  panel: HTML/JS sözleşmesi
 *   9)  (--canli) çalışan sunucuda uçlar
 *
 *   node scripts/test-fiyat-hasat.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const varMi = (p) => fs.existsSync(path.join(KOK, p));
const CANLI = process.argv.includes('--canli');

let gecen = 0, toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

/* ================================================================== */
bolum('1) 🗄️ Şema — katalog_urunleri + katalog_hasat');

const storeSrc = oku('src/store.js');
kontrol('katalog_urunleri tablosu tanımlı', /CREATE TABLE IF NOT EXISTS katalog_urunleri/.test(storeSrc));
kontrol('katalog_hasat defteri tanımlı', /CREATE TABLE IF NOT EXISTS katalog_hasat/.test(storeSrc));
kontrol('hasat: siteId+urunUrl tekil', /PRIMARY KEY \(siteId, urunUrl\)/.test(storeSrc));
kontrol('hasat: durum/fiyat/not kolonları',
  /durum TEXT NOT NULL/.test(storeSrc) && /fiyat REAL/.test(storeSrc) && /not_ TEXT/.test(storeSrc));

const { dbBaglantisi, closeDatabase } = await import('../src/store.js');
{
  const db = dbBaglantisi();
  const urunler = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='katalog_urunleri'").get();
  const hasat = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='katalog_hasat'").get();
  kontrol('DB: katalog_urunleri var', !!urunler);
  kontrol('DB: katalog_hasat var', !!hasat);
  const ix = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='katalog_hasat'").all();
  kontrol('DB: hasat durum indeksi', ix.some(x => /durum/.test(x.name)));
}

/* ================================================================== */
bolum('2) 📦 src/fiyatHasat.js — modül sözleşmesi');

kontrol('src/fiyatHasat.js mevcut', varMi('src/fiyatHasat.js'));
const hasatSrc = oku('src/fiyatHasat.js');
for (const fn of ['hasatAdaylari', 'fiyatHasadiniCalistir', 'hasatDurumu',
  'hasatZamanlayiciBaslat', 'hasatZamanlayiciDurdur', 'hasatHedefSiteleri']) {
  kontrol(`dışa açık: ${fn}`, new RegExp(`export (?:async )?function ${fn}\\b`).test(hasatSrc));
}
kontrol('JSON-LD Product fiyatı okunur',
  /function jsonLdFiyat/.test(hasatSrc) && hasatSrc.includes("'Product'") && /offers\?\.price/.test(hasatSrc));
kontrol('self-healing kaskadı yedek', /extractSelfHealingPrice/.test(hasatSrc));
kontrol('başlık doğrulaması (yanlış ürün koruması)', /titleSimilarity/.test(hasatSrc) && /BASLIK_ESIK/.test(hasatSrc));
kontrol('fiyat aralığı sanity (10–500.000)', /fiyat < 10 \|\| fiyat > 500000/.test(hasatSrc));
kontrol('uydurma yok: fiyat yalnızca bulunursa yazılır',
  /fiyat: null/.test(hasatSrc) && /kayit\.fiyat = Math\.round/.test(hasatSrc));
kontrol("kaynakTur = 'sayfa' işaretlenir", /kaynakTur = 'sayfa'/.test(hasatSrc));
kontrol('404/410 → yok defteri', /r\.status === 404 \|\| r\.status === 410/.test(hasatSrc));
kontrol('defter upsert (tekrar deneme koruması)', /ON CONFLICT\(siteId, urunUrl\) DO UPDATE/.test(hasatSrc));
kontrol('nazik mod: eşzamanlılık + bekleme', /ESZAMANLI/.test(hasatSrc) && /ARASI_MS/.test(hasatSrc));
kontrol('SEO önbelleği temizlenir (anında yansıma)', /seoOnbelleginiTemizle/.test(hasatSrc));
kontrol('env ile ayarlanabilir (HASAT_*)', /HASAT_MAKS/.test(hasatSrc) && /HASAT_ARASI_MS/.test(hasatSrc));

/* ================================================================== */
bolum('3) 🎯 Aday seçimi — yalnızca kıyas üretecek ürünler');

const mod = await import('../src/fiyatHasat.js');
const adaylar = mod.hasatAdaylari({ limit: 3000 });
kontrol('aday listesi dizi', Array.isArray(adaylar), String(typeof adaylar));

{
  const db = dbBaglantisi();
  // Adayların hepsi: fiyatı NULL + aynı temizBaslik başka sitede fiyatlı
  if (adaylar.length) {
    const ornek = adaylar[0];
    const satir = db.prepare(
      'SELECT fiyat, temizBaslik FROM katalog_urunleri WHERE siteId = ? AND urunUrl = ?'
    ).get(ornek.siteId, ornek.urunUrl);
    kontrol('aday kaydı fiyatsız', satir && satir.fiyat === null, String(satir?.fiyat));
    const rakip = db.prepare(
      'SELECT COUNT(*) c FROM katalog_urunleri WHERE temizBaslik = ? AND fiyat IS NOT NULL AND siteId != ?'
    ).get(ornek.temizBaslik, ornek.siteId);
    kontrol('adayın fiyatlı rakibi var (kıyas üretir)', Number(rakip.c) > 0, String(rakip.c));
  } else {
    kontrol('aday listesi boş olabilir (hasat tamamlanmış)', true);
  }
}

/* ================================================================== */
bolum('4) 🔗 SEO entegrasyonu — dizinlenebilirlik ve sitemap');

const seoSrc = oku('src/seoSayfalar.js');
kontrol('besleme kataloğdan okur', /FROM katalog_urunleri/.test(seoSrc));
kontrol('tek teklifli besleme noindex (ince içerik koruması)',
  /if \(teklifSay >= 2\) return true;/.test(seoSrc) && /kaynakTip !== 'besleme'/.test(seoSrc));
kontrol('BESLEME_MAKS_URUN >= 1500 (hasat sonrası tavan)', /BESLEME_MAKS_URUN = (\d+)/.test(seoSrc)
  && Number((seoSrc.match(/BESLEME_MAKS_URUN = (\d+)/) || [])[1]) >= 1500,
  (seoSrc.match(/BESLEME_MAKS_URUN = (\d+)/) || [])[1]);
kontrol('sitemap ürünleri indekslenebilirlik filtresinden geçirir',
  /for \(const u of seoUrunListesi\(\)\) \{\s*\n?\s*if \(!urunIndekslenebilirMi\(u\)\) continue;/.test(seoSrc));

{
  const seo = await import('../src/seoSayfalar.js');
  const urunler = seo.seoUrunListesi({ taze: true });
  kontrol('SEO ürün listesi üretiliyor', urunler.length > 0, String(urunler.length));
  const indeksli = urunler.filter(seo.urunIndekslenebilirMi);
  kontrol('dizinlenebilir ürün var', indeksli.length > 0, String(indeksli.length));
  kontrol('tüm dizinlenebilirler 2+ teklifli ya da radar',
    indeksli.every(u => (u.teklifler || []).length >= 2 || u.kaynakTip !== 'besleme'));
  const cokTeklif = urunler.filter(u => (u.teklifler || []).length >= 2).length;
  kontrol('çok teklifli ürün sayısı > 0', cokTeklif > 0, String(cokTeklif));
  console.log(`   ℹ️  ${urunler.length} ürün · ${cokTeklif} çok teklifli · ${indeksli.length} dizinlenebilir`);
}

/* ================================================================== */
bolum('5) 🌐 server.js — uçlar, zamanlayıcı, /api/durum');

const sunucuSrc = oku('server.js');
kontrol('fiyatHasat import edilir', /from '\.\/src\/fiyatHasat\.js'/.test(sunucuSrc));
kontrol('GET /api/admin/katalog-hasat (adminGerekli)',
  /app\.get\('\/api\/admin\/katalog-hasat', adminGerekli/.test(sunucuSrc));
kontrol('POST /api/admin/katalog-hasat (adminGerekli)',
  /app\.post\('\/api\/admin\/katalog-hasat', adminGerekli/.test(sunucuSrc));
kontrol('açılışta zamanlayıcı başlar', /hasatZamanlayiciBaslat\(\)/.test(sunucuSrc));
kontrol('kapanışta zamanlayıcı durur', /hasatZamanlayiciDurdur\(\)/.test(sunucuSrc));
kontrol('/api/durum hasat özeti', /hasat: \(\(\) => \{/.test(sunucuSrc));
kontrol('panel tetiklemesi arka planda', /fiyatHasadiniCalistir\(\{ limit, siteler, kaynak: 'panel' \}\)/.test(sunucuSrc));

/* ================================================================== */
bolum('6) 🖥️ Panel — HTML + JS sözleşmesi');

const adminHtml = oku('public/admin.html');
for (const id of ['hasatBulunan', 'hasatBekleyen', 'hasatSonBitis', 'hasatBtn', 'hasatLimit', 'hasatSite', 'hasatSiteListe']) {
  kontrol(`admin.html: #${id}`, adminHtml.includes(`id="${id}"`));
}
const adminJs = oku('public/admin.js');
kontrol('admin.js: hasatDurumCiz', /function hasatDurumCiz/.test(adminJs));
kontrol('admin.js: manuel başlatma', /'\/api\/admin\/katalog-hasat', \{/.test(adminJs));
kontrol('admin.js: polling', /function hasatPollBaslat/.test(adminJs));
kontrol('admin.js: mağaza filtresi gönderilir', /govde\.siteler = \[site\]/.test(adminJs));

/* ================================================================== */
bolum('7) ⚙️ Davranış — defter ve yazma (yalıtılmış)');

{
  const db = dbBaglantisi();
  const TEST_SITE = '__hasat_test__';
  const TEST_URL = 'https://ornek.test/hasat-urun';
  const temizBaslik = 'hasattestmarka pla plus siyah 1kg';

  // Temizlik
  db.prepare('DELETE FROM katalog_urunleri WHERE siteId = ?').run(TEST_SITE);
  db.prepare('DELETE FROM katalog_hasat WHERE siteId = ?').run(TEST_SITE);

  // 1) Fiyatlı rakip
  db.prepare(`INSERT INTO katalog_urunleri
    (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta, gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    TEST_SITE + '_fiyatli', 'https://ornek.test/rakip', 'HasatTestMarka PLA+ Siyah 1kg',
    temizBaslik, 'HasatTestMarka', 500, 1, null, 'TRY', 'shopify', Date.now(),
  );
  // 2) Fiyatsız hedef (sitemap benzeri)
  db.prepare(`INSERT INTO katalog_urunleri
    (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta, gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    TEST_SITE, TEST_URL, 'HasatTestMarka PLA+ Siyah 1kg',
    temizBaslik, 'HasatTestMarka', null, null, null, 'TRY', 'sitemap', Date.now(),
  );
  // 3) Fiyatsız ama RAKİBİ OLMAYAN ürün → aday olmamalı
  db.prepare(`INSERT INTO katalog_urunleri
    (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta, gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    TEST_SITE, 'https://ornek.test/rakipsiz', 'Rakipsiz Uydurma Urun XYZ',
    'rakipsiz uydurma urun xyz', null, null, null, null, 'TRY', 'sitemap', Date.now(),
  );

  const testAdaylar = mod.hasatAdaylari({ limit: 3000, siteler: [TEST_SITE] });
  kontrol('aday: fiyatlı rakibi olan seçildi', testAdaylar.some(a => a.urunUrl === TEST_URL),
    JSON.stringify(testAdaylar.map(a => a.urunUrl)));
  kontrol('aday: rakipsiz ürün SEÇİLMEDİ',
    !testAdaylar.some(a => a.urunUrl === 'https://ornek.test/rakipsiz'));

  // 4) Defter: yakın zamanda "yok" denenmiş aday atlanmalı
  db.prepare(`INSERT INTO katalog_hasat (siteId, urunUrl, sonDenemeTs, durum, fiyat, not_)
    VALUES (?,?,?,?,?,?)`).run(TEST_SITE, TEST_URL, Date.now(), 'yok', null, 'HTTP 404');
  const sonra = mod.hasatAdaylari({ limit: 3000, siteler: [TEST_SITE] });
  kontrol('defter: yakında "yok" denenmiş aday atlanır',
    !sonra.some(a => a.urunUrl === TEST_URL), JSON.stringify(sonra.map(a => a.urunUrl)));

  // 5) Defter: eski "yok" kaydı tekrar denenir
  const eski = Date.now() - 40 * 86400000;
  db.prepare('UPDATE katalog_hasat SET sonDenemeTs = ? WHERE siteId = ? AND urunUrl = ?')
    .run(eski, TEST_SITE, TEST_URL);
  const ucuncu = mod.hasatAdaylari({ limit: 3000, siteler: [TEST_SITE] });
  kontrol('defter: eski deneme yeniden aday olur',
    ucuncu.some(a => a.urunUrl === TEST_URL), JSON.stringify(ucuncu.map(a => a.urunUrl)));

  // Temizlik
  db.prepare('DELETE FROM katalog_urunleri WHERE siteId LIKE ?').run(TEST_SITE + '%');
  db.prepare('DELETE FROM katalog_hasat WHERE siteId = ?').run(TEST_SITE);
}

/* ================================================================== */
bolum('7b) 🛡️ Senkron hasat fiyatını EZMEMELİ (2026-11-28 kritik hata)');

{
  const { katalogSatirlariYaz } = await import('../src/katalogSync.js');
  const db = dbBaglantisi();
  const SITE = '__hasat_koru__';
  const URL = 'https://ornek.test/korunan-urun';
  const SIMDI = Date.now();

  db.prepare('DELETE FROM katalog_urunleri WHERE siteId = ?').run(SITE);

  // 1) Hasat edilmiş kayıt: fiyatlı, kaynakTur='sayfa'
  katalogSatirlariYaz([{
    siteId: SITE, urunUrl: URL, baslik: 'Korunan Urun PLA 1kg',
    temizBaslik: 'korunan urun pla 1kg', marka: null, fiyat: 777.5, stokta: 1,
    gorselUrl: null, paraBirimi: 'TRY', kaynakTur: 'sayfa', guncellemeTs: SIMDI,
  }]);

  // 2) Sitemap senkronu AYNI ürünü fiyatsız yazar (gerçek davranış)
  katalogSatirlariYaz([{
    siteId: SITE, urunUrl: URL, baslik: 'Korunan Urun PLA 1kg',
    temizBaslik: 'korunan urun pla 1kg', marka: null, fiyat: null, stokta: null,
    gorselUrl: null, paraBirimi: 'TRY', kaynakTur: 'sitemap', guncellemeTs: SIMDI + 1000,
  }]);

  const son = db.prepare('SELECT fiyat, stokta, kaynakTur FROM katalog_urunleri WHERE siteId = ? AND urunUrl = ?')
    .get(SITE, URL);
  kontrol('senkron hasat fiyatını KORUR', Number(son?.fiyat) === 777.5, String(son?.fiyat));
  kontrol('senkron hasat stok bilgisini korur', Number(son?.stokta) === 1, String(son?.stokta));
  kontrol("kaynakTur 'sayfa' olarak kalır", son?.kaynakTur === 'sayfa', String(son?.kaynakTur));

  // 3) Fiyatlı besleme (Shopify) GERÇEKTEN güncel fiyat verirse ezmeli
  katalogSatirlariYaz([{
    siteId: SITE, urunUrl: URL, baslik: 'Korunan Urun PLA 1kg',
    temizBaslik: 'korunan urun pla 1kg', marka: null, fiyat: 800, stokta: 1,
    gorselUrl: null, paraBirimi: 'TRY', kaynakTur: 'shopify', guncellemeTs: SIMDI + 2000,
  }]);
  const guncel = db.prepare('SELECT fiyat, kaynakTur FROM katalog_urunleri WHERE siteId = ? AND urunUrl = ?')
    .get(SITE, URL);
  kontrol('fiyatlı besleme yeni fiyatı EZER (doğru davranış)',
    Number(guncel?.fiyat) === 800 && guncel?.kaynakTur === 'shopify',
    `fiyat=${guncel?.fiyat} tur=${guncel?.kaynakTur}`);

  db.prepare('DELETE FROM katalog_urunleri WHERE siteId = ?').run(SITE);
}

/* ================================================================== */
bolum('8) 📊 Durum raporu');

{
  const d = mod.hasatDurumu();
  kontrol('durum: defter nesnesi', d.defter && typeof d.defter === 'object');
  kontrol('durum: bekleyen sayı', typeof d.bekleyen === 'number');
  kontrol('durum: maksTur', d.maksTur > 0, String(d.maksTur));
  kontrol('durum: ayar bloğu', d.ayar && d.ayar.yokTekrarGun >= 1);
  const siteler = mod.hasatHedefSiteleri();
  kontrol('hedef siteler listesi', Array.isArray(siteler));
  kontrol('hedef siteler yalnızca fiyatsızı olanlar', siteler.every(s => s.fiyatsiz > 0));
  console.log(`   ℹ️  defter: ${JSON.stringify(d.defter)} · bekleyen: ${d.bekleyen}`);
}

/* ================================================================== */
if (CANLI) {
  bolum('9) 🔌 Canlı sunucu — hasat uçları');
  const ANAHTAR = process.env.ERISIM_ANAHTARI || 'qx2kjlgmwhfnzc1p6b3r4ayd';
  const TABAN = process.env.SUNUCU || 'http://127.0.0.1:3000';
  const H = { 'x-erisim-anahtari': ANAHTAR };
  try {
    const r = await fetch(`${TABAN}/api/admin/katalog-hasat`, { headers: H, signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => null);
    kontrol('canlı: GET hasat 200', r.status === 200 && d?.ok === true, `HTTP ${r.status}`);
    kontrol('canlı: durum defter içerir', !!d?.defter);
    kontrol('canlı: hedef siteler listelenir', Array.isArray(d?.siteler));

    const durum = await fetch(`${TABAN}/api/durum`, { headers: H, signal: AbortSignal.timeout(15000) })
      .then(x => x.json()).catch(() => null);
    kontrol('canlı: /api/durum hasat alanı', !!durum?.hasat);
  } catch (e) {
    kontrol('canlı sunucuya erişilebildi', false, String(e?.message || e));
  }
}

/* ================================================================== */
closeDatabase();
console.log('\n' + '─'.repeat(56));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
