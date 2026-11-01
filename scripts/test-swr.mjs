/**
 * SWR (stale-while-revalidate) doğrulama betiği — 2026-10-30
 *
 * Kullanım:
 *   node scripts/test-swr.mjs                        # birim testleri (sunucu gerekmez)
 *   node scripts/test-swr.mjs --url "https://..."    # canlı tarama + 0 sn SWR akışı
 *   node scripts/test-swr.mjs --url "https://..." --hizli
 *                                                    # mevcut snapshot ile hızlı SWR kontrolü
 *
 * Canlı test için sunucu açık olmalıdır (`npm start`). Erişim anahtarı .env'den
 * (ERISIM_ANAHTARI) otomatik okunur; farklı sunucu için BASE_URL kullanılabilir:
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-swr.mjs --url "..."
 *
 * Doğrulananlar:
 *   1) URL normalizasyonu (şema/www/izleme parametreleri/sıra/fragment/slash)
 *   2) SQLite snapshot şeması + WAL modu + sürüm temizliği
 *   3) TTL (varsayılan 5 saat) ve anlık okuma
 *   4) Canlı ilk arama: önbellek yok → stale değil
 *   5) İkinci arama: HTTP 200 + stale:true + onbellekSonuc, < 2,5 sn
 *   6) Arka plan tazeleme: iş sürümü artar, tazelemeBitti/tazelemeHatasi dürüstçe raporlanır
 *   7) `taze:true` önbelleği atlar
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import {
  anahtarCikar, anlikAl, anlikYaz, anlikIstatistik, snapshotSil, snapshotKapat,
  SNAPSHOT_SURUMU, yasMetni,
} from '../src/anlikOnbellek.js';

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

/* ---------------------------------------------------------------- */
/* 1) URL normalizasyonu                                            */
/* ---------------------------------------------------------------- */
bolum('1) URL normalizasyonu');
const A = anahtarCikar('https://www.trendyol.com/logitech-g102-p-123');
const ayniOlmali = [
  'http://trendyol.com/logitech-g102-p-123',
  'https://www.trendyol.com/logitech-g102-p-123/',
  'https://WWW.Trendyol.com/logitech-g102-p-123#yorumlar',
  'https://www.trendyol.com/logitech-g102-p-123?utm_source=e&utm_medium=cpc&utm_campaign=x',
  'https://www.trendyol.com/logitech-g102-p-123?gclid=abc&fbclid=def&srsltid=ghi',
  'https://www.trendyol.com/logitech-g102-p-123?ref=abc&source=def&campaign=ghi',
  '  https://www.trendyol.com/logitech-g102-p-123  ',
];
for (const v of ayniOlmali) {
  kontrol(`aynı anahtar: ${v.slice(0, 56)}`, anahtarCikar(v) === A, anahtarCikar(v));
}

const P1 = anahtarCikar('https://www.trendyol.com/x-p-1?boutiqueId=61&merchantId=1');
const P2 = anahtarCikar('https://www.trendyol.com/x-p-1?merchantId=1&boutiqueId=61');
kontrol('parametre sırası anahtarı değiştirmez', P1 === P2, `${P1} ≠ ${P2}`);
kontrol('ürün kimliği parametreleri korunur (productId)',
  anahtarCikar('https://ornek.com/u?productId=42&utm_source=x')?.includes('productId=42'));
kontrol('`?v=` ürün parametresi korunur',
  anahtarCikar('https://ornek.com/u?v=3&gclid=x')?.endsWith('?v=3'),
  anahtarCikar('https://ornek.com/u?v=3&gclid=x'));
kontrol('parametre var/yok farklı anahtar', anahtarCikar('https://www.trendyol.com/x-p-1') !== P1);
kontrol('geçersiz URL null', anahtarCikar('bu bir url değil') === null);
kontrol('boş URL null', anahtarCikar('') === null);
kontrol('http dışı şema reddedilir', anahtarCikar('javascript:alert(1)') === null);
kontrol('www2. öneki normalize edilir',
  anahtarCikar('https://www2.ornek.com/u') === anahtarCikar('https://ornek.com/u'));

/* ---------------------------------------------------------------- */
/* 2) SQLite şeması + WAL + sürüm temizliği                         */
/* ---------------------------------------------------------------- */
bolum('2) SQLite snapshot şeması');
const DB_YOLU = path.join(config.dataDir, 'en_ucuz_nerede.db');
kontrol('veritabanı dosyası var', fs.existsSync(DB_YOLU), DB_YOLU);

// anlikYaz/Önbellek bağlantısını açsın (tablo + WAL kurulumu)
const TEST_URL = 'https://swr-test.invalid/urun-' + Date.now();
const ornekSonuc = {
  kaynak: { site: 'swr-test', urun: 'SWR Test Ürünü', modelKodu: 'SWR-T1' },
  sonuclar: [
    { site: 'a', siteName: 'A', status: 'found', enUcuz: true,
      product: { url: 'https://a.invalid/u', title: 'Test', sellingPrice: 1000, pricing: { toplam: 1000 } } },
    { site: 'b', siteName: 'B', status: 'found',
      product: { url: 'https://b.invalid/u', title: 'Test', sellingPrice: 1100, pricing: { toplam: 1100 } } },
  ],
  ozet: { enUcuzFiyat: 1000, enUcuzSite: 'A' },
};
kontrol('snapshot yazılabiliyor', anlikYaz(TEST_URL, ornekSonuc) === true);

{
  const db = new DatabaseSync(DB_YOLU);
  const mod = db.prepare('PRAGMA journal_mode').get()?.journal_mode;
  kontrol('WAL modu açık', String(mod).toLowerCase() === 'wal', String(mod));
  const kolonlar = db.prepare('PRAGMA table_info(snapshot)').all().map(c => c.name);
  for (const k of ['anahtar', 'ts', 'surum', 'urun', 'en_ucuz', 'en_ucuz_site', 'payload']) {
    kontrol(`snapshot kolonu: ${k}`, kolonlar.includes(k), kolonlar.join(','));
  }
  db.close();
}

const okunan = anlikAl(TEST_URL);
kontrol('snapshot geri okunuyor', !!okunan);
kontrol('payload bütünlüğü korunuyor', okunan?.payload?.sonuclar?.length === 2);
kontrol('yaş 0 (az önce)', okunan?.yasMs < 5000, String(okunan?.yasMs));
kontrol('yaş metni Türkçe', yasMetni(12 * 60000) === '12 dk önce', yasMetni(12 * 60000));
kontrol('TTL varsayılanı 5 saat', anlikIstatistik().ttlDakika === 300, String(anlikIstatistik().ttlDakika));
kontrol('TTL dışı kayıt dönmez', anlikAl(TEST_URL, { maxYasMs: 1 }) === null);

// Sürüm kontrolü: eski sürümlü kayıt açılışta temizlenmeli.
try {
  snapshotKapat();
  const db = new DatabaseSync(DB_YOLU);
  db.prepare(`
    INSERT INTO snapshot (anahtar, ts, surum, urun, en_ucuz, en_ucuz_site, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(anahtar) DO UPDATE SET surum = excluded.surum
  `).run('eski-surum-testi.invalid/u', Date.now(), SNAPSHOT_SURUMU - 1, 'Eski', 1, 'X', '{}');
  db.close();
  // anlikAl → veritabani() → sürüm temizliği
  anlikAl(TEST_URL);
  const db2 = new DatabaseSync(DB_YOLU);
  const eski = db2.prepare('SELECT COUNT(*) adet FROM snapshot WHERE anahtar = ?')
    .get('eski-surum-testi.invalid/u')?.adet;
  db2.close();
  kontrol('eski şema sürümü temizlendi', Number(eski) === 0, String(eski));
} catch (e) {
  kontrol('eski şema sürümü temizlendi', false, String(e.message || e));
}
snapshotSil(TEST_URL);

/* ---------------------------------------------------------------- */
/* 3) Canlı uçtan uca (opsiyonel --url)                             */
/* ---------------------------------------------------------------- */
const arg = (ad, varsayilan = '') => {
  const i = process.argv.indexOf(ad);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
};
const canliUrl = arg('--url');
const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
const anahtar = arg('--anahtar', config.erisimAnahtari || '');
// Tam tarama 61 sitede yapılır; yavaş ağda/YSA yoğunluğunda 10+ dakika sürebilir.
const zamanAsimi = Number(arg('--timeout', '1200000'));
const hizli = process.argv.includes('--hizli');

const basliklar = { 'Content-Type': 'application/json' };
if (anahtar) basliklar['x-erisim-anahtari'] = anahtar;

async function istek(yol, secenekler = {}) {
  const res = await fetch(taban + yol, { ...secenekler, headers: { ...basliklar, ...(secenekler.headers || {}) } });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${veri.hata || 'bilinmeyen hata'}`);
  return veri;
}

/** İş bitene kadar izler; zaman aşımında `null` döner (betik çökmez, dürüst rapor verir). */
async function isBiteneKadar(id, etiket) {
  const bas = Date.now();
  while (Date.now() - bas < zamanAsimi) {
    const job = await istek('/api/compare/' + encodeURIComponent(id));
    if (job.status === 'error') {
      console.log(`     ℹ️  ${etiket}: sunucu hatası — ${job.error || 'bilinmeyen'}`);
      return job;
    }
    if (job.status === 'done' && !job.tazeleniyor) return job;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`     ⚠️  ${etiket}: ${Math.round(zamanAsimi / 1000)} sn içinde bitmedi`
    + ' (tarama sunucuda sürüyor olabilir; --timeout ile artırılabilir)');
  return null;
}

if (!canliUrl) {
  console.log('\nℹ️  Canlı akış testi için: node scripts/test-swr.mjs --url "https://..."');
  console.log('    Hızlı kontrol (mevcut snapshot ile): --hizli');
} else {
  bolum('3) Canlı ilk tarama');
  if (hizli) {
    // Hızlı mod: tarama beklemeden mevcut (gerçek) snapshot ile SWR yolunu doğrular.
    const mevcut = anlikAl(canliUrl);
    kontrol('hızlı mod: TTL içinde gerçek snapshot var', !!mevcut,
      'önce bir kez normal arama yapın ya da --hizli olmadan çalıştırın');
  } else {
    // Testi gerçekten "ilk arama" yapmak için sadece bu ürünün snapshot'ı silinir.
    snapshotSil(canliUrl);

    const t0 = Date.now();
    const ilk = await istek('/api/compare', {
      method: 'POST', body: JSON.stringify({ url: canliUrl }),
    });
    const ilkMs = Date.now() - t0;
    kontrol('ilk arama önbellek kullanmıyor', ilk.stale !== true && !ilk.onbellekSonuc, JSON.stringify(ilk).slice(0, 120));
    kontrol('ilk arama iş kimliği döndürüyor', typeof ilk.isId === 'string');
    kontrol('ilk yanıt canlı tarama (anlik:false)', ilk.anlik === false);
    const ilkIs = await isBiteneKadar(ilk.isId, 'ilk tarama');
    if (ilkIs) {
      kontrol('ilk tarama gerçek sonuç üretti', !!ilkIs.result?.kaynak, ilkIs.error || '');
      kontrol('ilk tarama tamamlandı', ilkIs.status === 'done');
      console.log(`     ilk yanıt: ${ilkMs} ms · tarama: ${Math.round(ilkIs.sureMs / 1000)} sn`);
    }
  }

  bolum('4) İkinci arama (0 sn SWR)');
  const t1 = Date.now();
  const ikinci = await istek('/api/compare', {
    method: 'POST', body: JSON.stringify({ url: canliUrl }),
  });
  const ikinciMs = Date.now() - t1;
  kontrol('ikinci arama stale:true', ikinci.stale === true);
  kontrol('onbellekSonuc döndü', !!ikinci.onbellekSonuc?.sonuclar);
  kontrol('sonGuncelleme zaman damgası', Number.isFinite(ikinci.sonGuncelleme));
  kontrol('yasMs sayısal ve TTL içinde',
    Number.isFinite(ikinci.yasMs) && ikinci.yasMs >= 0
    && ikinci.yasMs <= (ikinci.ttlMs || config.snapshotTtlMs));
  kontrol('yanıt 2,5 sn altında (0 sn deneyimi)', ikinciMs < 2500, `${ikinciMs} ms`);
  kontrol('yaş metni insan tarafından okunur', typeof ikinci.yasMetni === 'string' && ikinci.yasMetni.length > 0);
  console.log(`     SWR yanıtı: ${ikinciMs} ms · ${yasMetni(ikinci.yasMs)} tarandı · surum=${ikinci.surum}`);

  bolum('5) Arka plan tazeleme');
  let tazeIs = null;
  if (hizli) {
    // Hızlı modda tam tazelemeyi bekleme: arka plan işinin BAŞLADIĞINI doğrula.
    // Kısmi sonuç ilk sitelerden gelene kadar en fazla 20 sn izle.
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      tazeIs = await istek('/api/compare/' + encodeURIComponent(ikinci.isId));
      if (Array.isArray(tazeIs.partialResults) && tazeIs.partialResults.length > 0) break;
      if (!tazeIs.tazeleniyor) break; // bitti/hata
    }
    kontrol('arka plan tazeleme başladı', tazeIs?.tazeleniyor === true || tazeIs?.tazelemeBitti === true
      || Number(tazeIs?.surum) > Number(ikinci.surum));
    kontrol('tazelemede kısmi sonuçlar akıyor', Array.isArray(tazeIs?.partialResults) && tazeIs.partialResults.length > 0);
    try {
      await istek('/api/compare/' + encodeURIComponent(ikinci.isId) + '/iptal', { method: 'POST' });
      const durdu = await istek('/api/compare/' + encodeURIComponent(ikinci.isId));
      kontrol('iptal sonrası tazeleme durdu', durdu.tazeleniyor === false);
      kontrol('iptal eski sonucu koruyor',
        Array.isArray(durdu.result?.sonuclar)
        && durdu.result.sonuclar.length === ikinci.onbellekSonuc.sonuclar.length);
      kontrol('iptal dürüstçe raporlanıyor', /durduruldu/i.test(String(durdu.tazelemeHatasi || '')));
    } catch (e) {
      kontrol('iptal akışı', false, String(e.message || e));
    }
  } else {
    tazeIs = await isBiteneKadar(ikinci.isId, 'SWR tazeleme');
  }
  if (tazeIs && !hizli) {
    kontrol('tazeleme bitti ya da dürüst hata', tazeIs.tazelemeBitti === true || !!tazeIs.tazelemeHatasi,
      JSON.stringify({ bitti: tazeIs.tazelemeBitti, hata: tazeIs.tazelemeHatasi }));
    kontrol('iş sürümü arttı', Number(tazeIs.surum) >= 2, String(tazeIs.surum));
    if (tazeIs.tazelemeFarki) {
      const f = tazeIs.tazelemeFarki;
      kontrol('fiyatFarki yapısı geçerli',
        Array.isArray(f.degisen) && Array.isArray(f.yeni) && Array.isArray(f.kaybolan));
      console.log(`     ${f.degisen.length} değişen · ${f.yeni.length} yeni · ${f.kaybolan.length} kaybolan`);
    }
  }

  bolum('6) Zorla yenileme (taze:true)');
  const zorla = await istek('/api/compare', {
    method: 'POST', body: JSON.stringify({ url: canliUrl, taze: true }),
  });
  kontrol('taze:true önbelleği atlıyor', zorla.stale !== true && !zorla.onbellekSonuc);
  if (hizli) {
    // Hızlı modda tam taramayı beklemeyiz; hemen iptal edip kaynağı boşa harcamayız.
    try {
      await istek('/api/compare/' + encodeURIComponent(zorla.isId) + '/iptal', { method: 'POST' });
    } catch { /* yoksay */ }
  } else {
    const zorlaIs = await isBiteneKadar(zorla.isId, 'zorla tarama');
    if (zorlaIs) kontrol('zorla tarama tamamlandı', zorlaIs.status === 'done' && !!zorlaIs.result?.kaynak);
  }
}

/* ---------------------------------------------------------------- */
/* 7) Arayüz / sunucu sözleşmesi (kaynak düzeyi)                     */
/* ---------------------------------------------------------------- */
bolum('7) Arayüz ve sunucu sözleşmesi');
{
  const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  const app = oku('public/app.js');
  const css = oku('public/style.css');
  const html = oku('public/index.html');
  const server = oku('server.js');

  kontrol('sunucu: stale + onbellekSonuc yanıtı',
    /onbellekSonuc:\s*anlik\.payload/.test(server) && /stale:\s*true/.test(server));
  kontrol('sunucu: sonGuncelleme + yasMs', /sonGuncelleme:\s*anlik\.ts/.test(server) && /yasMs:\s*anlik\.yasMs/.test(server));
  kontrol('sunucu: arka plan mod: tazeleme', /mod:\s*'tazeleme'/.test(server));
  kontrol('sunucu: fiyat farkı hesaplanıyor', /fiyatFarki\(anlik\.payload, yeni\)/.test(server));
  kontrol('sunucu: taze:true önbelleği atlıyor', /req\.body\?\.taze === true/.test(server));
  kontrol('sunucu: snapshot hata olursa korunur (tazelemeHatasi)',
    /job\.tazelemeHatasi = String/.test(server));

  kontrol('arayüz: stale yanıtta anında çizim',
    /\(data\.anlik \|\| data\.stale\) && onbellekSonuc/.test(app));
  kontrol('arayüz: hafızadan gösteriliyor metni', /Hafızadan gösteriliyor/.test(app));
  kontrol('arayüz: canlı kontrol ediliyor metni', /canlı kontrol ediliyor/.test(app));
  kontrol('arayüz: "N mağazada fiyat güncellendi" özeti', /mağazada fiyat güncellendi/.test(app));
  kontrol('arayüz: doğrulandı mesajı', /Tüm fiyatlar güncel ve doğrulandı/.test(app));
  kontrol('arayüz: sıfırdan tara butonu', /sifirdanTara/.test(app) && /taze: true/.test(app));
  kontrol('HTML: sıfırdan tara butonu var', /id="sifirdanTaraBtn"/.test(html));
  kontrol('CSS: @keyframes fiyatDustu', /@keyframes fiyatDustu/.test(css));
  kontrol('CSS: fiyat-dustu kart sınıfı', /\.urun-karti\.fiyat-dustu/.test(css));
  kontrol('CSS: hareket azaltma desteği', /prefers-reduced-motion/.test(css));
}

snapshotKapat();
console.log(`\nSWR ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
