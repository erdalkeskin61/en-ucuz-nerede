/**
 * Stok ("Stokta Var / Tükendi") standardı — regresyon testi (2026-10-30)
 *
 * Kapsam:
 *   1) src/stokSirala.js — 5 kademeli kesin hiyerarşi (birim)
 *   2) stokOzet — sayaçlar + dürüstlük (hiç ürün yoksa "tümü tükendi" DEĞİL)
 *   3) pipeline — sıralama/özet tek kaynaktan mı?
 *   4) basketOptimizer — tükenen ürün sepete girmiyor mu?
 *   5) Web arayüzü — kart/tablo/özet/filtre/ CSS sözleşmesi
 *   6) Tarayıcı eklentisi — aynı hiyerarşi + is-out-of-stock
 *   7) --canli: gerçek /api/compare yanıtı sıralı ve özetli mi?
 *
 * Kullanım:
 *   node scripts/test-stok.mjs            (ağa çıkmaz)
 *   node scripts/test-stok.mjs --canli    (+ gerçek tarama, birkaç site)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stokSirala, stokOzet, stokGrubu, karsilastirmaFiyati, STOK_GRUPLARI } from '../src/stokSirala.js';
import { teklifleriCikar } from '../src/basketOptimizer.js';
import { closeDatabase } from '../src/store.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANLI = process.argv.includes('--canli');
const ANAHTAR = process.env.ERISIM_ANAHTARI || '';
const TABAN = process.env.TABAN || 'http://localhost:3000';

let gecen = 0, kalan = 0;
const hatalar = [];
function kontrol(ad, kosul, detay = '') {
  if (kosul) { gecen++; console.log(`  ✓ ${ad}`); }
  else { kalan++; hatalar.push(ad + (detay ? ` → ${detay}` : '')); console.log(`  ✗ ${ad}${detay ? ' → ' + detay : ''}`); }
}
function bolum(ad) { console.log(`\n${ad}`); }
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

/* ---------- yardımcı: sentetik sonuç ---------- */
function r(site, { fiyat = null, stok = true, renk = true, durum = 'found' } = {}) {
  const urun = durum === 'found'
    ? { title: site + ' ürün', inStock: stok, sellingPrice: fiyat, pricing: fiyat != null ? { toplam: fiyat } : {} }
    : null;
  return { site, siteName: site, status: durum, renkAyni: renk, product: urun, reason: durum === 'found' ? '' : 'bulunamadı' };
}

/* ============ 1) Hiyerarşi ============ */
bolum('1) Stok sıralama hiyerarşisi (src/stokSirala.js)');

// Kasıtlı olarak en ucuz TÜKENMİŞ ürün başa koyuluyor: asla üste geçmemeli.
const karisik = [
  r('tukendiUcuz', { fiyat: 1, stok: false }),          // en ucuz ama tükendi
  r('stoktaPahali', { fiyat: 900, stok: true }),
  r('bulunamadi', { durum: 'not_found' }),
  r('farkliStokta', { fiyat: 500, stok: true, renk: false }),
  r('stoktaUcuz', { fiyat: 100, stok: true }),
  r('farkliTukendi', { fiyat: 50, stok: false, renk: false }),
  r('hata', { durum: 'error' }),
  r('tukendiPahali', { fiyat: 700, stok: false }),
];
const sirali = stokSirala(karisik);
const sitelerSirali = sirali.map(x => x.site);

kontrol('girdi dizisi DEĞİŞTİRİLMEDİ', karisik[0].site === 'tukendiUcuz', karisik[0].site);
kontrol('1. sıra: stokta + aynı renk (en ucuz)', sitelerSirali[0] === 'stoktaUcuz', sitelerSirali[0]);
kontrol('2. sıra: stokta + aynı renk (pahalı)', sitelerSirali[1] === 'stoktaPahali', sitelerSirali[1]);
kontrol('en ucuz TÜKENMİŞ ürün stokta olanların önüne GEÇMEDİ',
  sitelerSirali.indexOf('tukendiUcuz') > sitelerSirali.indexOf('stoktaPahali'),
  `tükendi=${sitelerSirali.indexOf('tukendiUcuz')} stokta=${sitelerSirali.indexOf('stoktaPahali')}`);
kontrol('3. sıra: tükendi + aynı renk (ucuz önce)',
  sitelerSirali[2] === 'tukendiUcuz' && sitelerSirali[3] === 'tukendiPahali',
  `${sitelerSirali[2]},${sitelerSirali[3]}`);
kontrol('4. sıra: stokta + farklı renk', sitelerSirali[4] === 'farkliStokta', sitelerSirali[4]);
kontrol('5. sıra: tükendi + farklı renk', sitelerSirali[5] === 'farkliTukendi', sitelerSirali[5]);
kontrol('bulunamadı/hata en sonda',
  ['bulunamadi', 'hata'].every(s => sitelerSirali.indexOf(s) >= 6), sitelerSirali.slice(6).join(','));
kontrol('grup numaraları monoton artıyor',
  sirali.every((x, i) => i === 0 || stokGrubu(sirali[i - 1]) <= stokGrubu(x)),
  sirali.map(stokGrubu).join(','));

kontrol('stoktaMi: inStock undefined → stokta sayılır', stokGrubu(r('a', { fiyat: 10 })) === STOK_GRUPLARI.STOKTA_AYNI);
kontrol('stoktaMi: inStock false → tükendi', stokGrubu(r('a', { fiyat: 10, stok: false })) === STOK_GRUPLARI.TUKENDI_AYNI);
kontrol('stoktaMi: inStock null → stokta sayılır', stokGrubu({ status: 'found', product: { inStock: null }, renkAyni: true }) === STOK_GRUPLARI.STOKTA_AYNI);

// Fiyatsız ürünler kendi grubunda sona düşer, NaN üretmez
const fiyatsiz = stokSirala([
  { site: 'fiyatsiz', status: 'found', renkAyni: true, product: { inStock: true, pricing: {} } },
  r('fiyatli', { fiyat: 100 }),
]);
kontrol('fiyatsız ürün grubunda sona düşer', fiyatsiz[0].site === 'fiyatli', fiyatsiz.map(x => x.site).join(','));
kontrol('fiyatsız ürün için Infinity döner', karsilastirmaFiyati({ product: {} }) === Infinity);
kontrol('satış fiyatına düşer (pricing yoksa)',
  karsilastirmaFiyati({ product: { sellingPrice: 42 } }) === 42);
kontrol('gerçek toplam fiyat öncelikli',
  karsilastirmaFiyati({ product: { sellingPrice: 42, pricing: { toplam: 39 } } }) === 39);

kontrol('boş liste sorunsuz', stokSirala([]).length === 0);
kontrol('null liste sorunsuz', stokSirala(null).length === 0);
kontrol('eşit fiyatlarda kararlı (girdi sırası korunur)',
  stokSirala([r('a', { fiyat: 10 }), r('b', { fiyat: 10 })]).map(x => x.site).join(',') === 'a,b');

/* ============ 2) Özet ============ */
bolum('2) Stok özeti (stokOzet)');
const oz = stokOzet(karisik);
kontrol('bulunanSiteSayisi = 6', oz.bulunanSiteSayisi === 6, String(oz.bulunanSiteSayisi));
kontrol('stoktaVarSayisi = 3', oz.stoktaVarSayisi === 3, String(oz.stoktaVarSayisi));
kontrol('stoktaYokSayisi = 3', oz.stoktaYokSayisi === 3, String(oz.stoktaYokSayisi));
kontrol('tamamiTukendi = false', oz.tamamiTukendi === false);
const hepsiTukendi = stokOzet([r('a', { fiyat: 10, stok: false }), r('b', { fiyat: 20, stok: false })]);
kontrol('hepsi tükendiyse tamamiTukendi = true', hepsiTukendi.tamamiTukendi === true);
const hicUrun = stokOzet([r('a', { durum: 'not_found' }), r('b', { durum: 'error' })]);
kontrol('hiç ürün yoksa tamamiTukendi = FALSE (dürüstlük)', hicUrun.tamamiTukendi === false);
kontrol('hiç ürün yoksa sayılar 0', hicUrun.bulunanSiteSayisi === 0 && hicUrun.stoktaVarSayisi === 0 && hicUrun.stoktaYokSayisi === 0);
kontrol('farklı renk de stok sayımına girer', stokOzet([r('a', { fiyat: 10, stok: true, renk: false })]).stoktaVarSayisi === 1);

/* ============ 3) Pipeline ============ */
bolum('3) Pipeline tek kaynağı kullanıyor mu?');
const pipe = oku('src/pipeline.js');
kontrol("pipeline stokSirala'yı import ediyor", /import\s*\{[^}]*stokSirala[^}]*\}\s*from\s*'\.\/stokSirala\.js'/.test(pipe));
kontrol('pipeline çıktıyı stokSirala ile sıralıyor', /sonuclar:\s*siraliResults\.map/.test(pipe) && /const siraliResults = stokSirala\(/.test(pipe));
kontrol('pipeline özeti stokOzet ile üretiyor', /const stok = stokOzet\(/.test(pipe) && /stoktaVarSayisi:\s*stok\.stoktaVarSayisi/.test(pipe));
kontrol('ozet.stoktaVarSayisi var', /stoktaVarSayisi:/.test(pipe));
kontrol('ozet.stoktaYokSayisi var', /stoktaYokSayisi:/.test(pipe));
kontrol('ozet.tamamiTukendi var', /tamamiTukendi:/.test(pipe));
kontrol('eski kopya sıralama kodu kalmadı (inStockFound)', !/inStockFound/.test(pipe));

/* ============ 4) Sepet motoru ============ */
bolum('4) Sepet motoru — tükenen ürün sepete girmemeli');
const sepetGirdi = {
  sonuclar: [
    r('stokta', { fiyat: 100 }),
    r('tukendiUcuz', { fiyat: 10, stok: false }),
    r('farkliRenk', { fiyat: 80, renk: false }),
    r('bulunamadi', { durum: 'not_found' }),
  ],
};
const teklifler = teklifleriCikar(sepetGirdi);
kontrol('teklifleriCikar tükenen ürünü eledi', !teklifler.some(t => t.site === 'tukendiUcuz'), teklifler.map(t => t.site).join(','));
kontrol('teklifleriCikar stokta olanları aldı', teklifler.some(t => t.site === 'stokta'));
kontrol('teklifleriCikar bulunamayanı eledi', !teklifler.some(t => t.site === 'bulunamadi'));
const bo = oku('src/basketOptimizer.js');
kontrol('basketOptimizer kaynakta inStock !== false filtresi var', /s\.product\.inStock !== false/.test(bo));

/* ============ 4b) Bildirimler ============ */
bolum('4b) Bildirimlerde stok dili');
const { stokOzetSatiri } = await import('../src/alarms.js');
kontrol('hepsi stokta → yeşil özet',
  stokOzetSatiri([{ durum: 'ok' }, { durum: 'ok' }]) === '🟢 2 mağazada stokta',
  stokOzetSatiri([{ durum: 'ok' }, { durum: 'ok' }]));
kontrol('karışık → hem yeşil hem kırmızı',
  stokOzetSatiri([{ durum: 'ok' }, { durum: 'stokta_yok' }]) === '🟢 1 mağazada stokta · 🔴 1 mağazada tükendi',
  stokOzetSatiri([{ durum: 'ok' }, { durum: 'stokta_yok' }]));
kontrol('hepsi tükendi → kırmızı uyarı',
  stokOzetSatiri([{ durum: 'stokta_yok' }, { durum: 'stokta_yok' }]) === '🔴 2 mağazanın tamamında tükendi',
  stokOzetSatiri([{ durum: 'stokta_yok' }, { durum: 'stokta_yok' }]));
kontrol('okunamayan mağazalar uydurulmaz',
  stokOzetSatiri([{ durum: 'hata' }, { durum: 'dogrulanamadi' }]) === 'stok bilgisi okunamadı');
kontrol('boş/bozuk girdi güvenli', stokOzetSatiri(null) === 'stok bilgisi okunamadı');
const alarmKod = oku('src/alarms.js');
kontrol('alarm: tükendi/yeniden stokta tetikleyicisi var',
  /stok_tukendi/.test(alarmKod) && /stok_yenilendi/.test(alarmKod));
kontrol('alarm: stok bildirimi 24 saat sessizlik kuralına bağlı',
  /sonStokBildirimi.*BILDIRIM_SONUK_MS|BILDIRIM_SONUK_MS[\s\S]{0,200}sonStokBildirimi/.test(alarmKod));
kontrol('alarm: fiyat alarmı iletisinde Stok satırı var', /'Stok: ' \+ stokOzetSatiri/.test(alarmKod));
const tg = oku('src/telegramBot.js');
kontrol('telegram: stok hiyerarşisi kullanılıyor', /stokSirala\(/.test(tg));
kontrol('telegram: tükendi rozeti', /🔴 Tükendi · /.test(tg));
kontrol('telegram: stok özet satırı', /📦 <b>Stok:<\/b>/.test(tg));
kontrol('telegram: tümü tükendiyse uyarı', /Tüm mağazalarda tükendi/.test(tg));
kontrol('pipeline: en ucuz adayları stokta olanlardan',
  /const eligible = found\.filter\([^)]*inStock !== false\)/.test(pipe));

/* ============ 5) Web arayüzü ============ */
bolum('5) Web arayüzü sözleşmesi');
const app = oku('public/app.js');
const css = oku('public/style.css');
const html = oku('public/index.html');

kontrol('tek stokSirala tanımı var', (app.match(/function stokSirala\(/g) || []).length === 1,
  String((app.match(/function stokSirala\(/g) || []).length));
kontrol('eski kopya grup fonksiyonu kalmadı', !/const grup = r => \{/.test(app));
kontrol('kartlarda .stok-yok sınıfı', /stoktaYok \? 'stok-yok' : ''/.test(app));
kontrol('kartta 🔴 TÜKENDİ şeridi', /stok-yok-serit/.test(app) && /TÜKENDİ/.test(app));
kontrol('kartta 🟢 Stokta Var rozeti', /🟢 Stokta Var/.test(app));
kontrol('kartta 🔴 Stokta Yok rozeti', /🔴 Stokta Yok/.test(app));
kontrol('fiyat alanında "Tükendi" rozeti', /stok-fiyat-rozet/.test(app));
kontrol('"son bilinen fiyat" dipnotu', /son bilinen fiyat/.test(app));
kontrol('tükendi butonu: Mağazada Gör (Tükendi)', /Mağazada Gör \(Tükendi\)/.test(app));
kontrol('özet: Tüm Mağazalarda Tükendi', /Tüm Mağazalarda Tükendi/.test(app));
kontrol('özet: En ucuz (stokta var) + mağaza sayısı', /En ucuz \(stokta var\)/.test(app) && /mağazada stokta/.test(app));
kontrol('filtre çipleri dinamik sayaçlı', /Stokta Var \(\$\{stoktaVarSayisi\}\)/.test(app) && /Stokta Yok \(\$\{stoktaYokSayisi\}\)/.test(app));
kontrol('tablo stok hücresi (🟢 Var / 🔴 Yok)', /🟢 Var/.test(app) && /🔴 Yok/.test(app));
kontrol('tablo satırı tr.stok-yok', /<tr class="\$\{stoktaYok \? 'stok-yok' : ''\}">/.test(app));
kontrol('tablo başlığında <th>Stok</th>', /<th>Stok<\/th>/.test(html));
kontrol('CSS: .urun-karti.stok-yok opacity .72', /\.urun-karti\.stok-yok\s*\{[^}]*opacity:\s*0\.72/.test(css));
kontrol('CSS: hover opacity .95', /\.urun-karti\.stok-yok:hover\s*\{[^}]*opacity:\s*0\.95/.test(css));
kontrol('CSS: .stok-yok-serit', /\.stok-yok-serit\s*\{/.test(css));
kontrol('CSS: tr.stok-yok', /tr\.stok-yok\s*\{/.test(css));
kontrol('CSS: .stok-fiyat-rozet', /\.stok-fiyat-rozet\s*\{/.test(css));
kontrol('CSS: tükendi butonu grisi', /\.urun-link\.tukendi\s*\{/.test(css));

/* ============ 6) Eklenti ============ */
bolum('6) Tarayıcı eklentisi');
const extJs = oku('extension/content.js');
const extCss = oku('extension/content.css');
kontrol('eklentide 5 kademeli hiyerarşi var', /const stokGrubu = \(r\) =>/.test(extJs));
kontrol('eklentide aynı renk ayrımı var', /ayniRenk/.test(extJs));
kontrol('eklentide is-out-of-stock sınıfı', /is-out-of-stock/.test(extJs));
kontrol('eklentide 🔴 TÜKENDİ rozeti', /🔴 TÜKENDİ/.test(extJs));
kontrol('eklentide tükendi butonu "İncele ➔"', /İncele ➔/.test(extJs));
kontrol('eklenti CSS: is-out-of-stock opacity .72', /\.eun-item-card\.is-out-of-stock\s*\{[^}]*opacity:\s*0\.72/.test(extCss));
kontrol('eklenti CSS: hover .95', /\.eun-item-card\.is-out-of-stock:hover\s*\{[^}]*opacity:\s*0\.95/.test(extCss));

/* ============ 7) Canlı ============ */
if (CANLI) {
  bolum('7) Canlı API (gerçek tarama)');
  const HDR = { 'x-erisim-anahtari': ANAHTAR, 'Content-Type': 'application/json' };
  const siteler = ['robo90', 'filamentsan', 'bisiparisver'];
  const bas = await fetch(TABAN + '/api/compare', {
    method: 'POST', headers: HDR,
    body: JSON.stringify({
      url: 'https://www.robo90.com/nanelab-hyper-pla-koyu-gri-filament-175mm-1kg',
      taze: true, siteler, siteTimeoutMs: 20000,
    }),
  });
  const j = await bas.json();
  kontrol('canlı iş oluştu', bas.ok && !!j.isId, JSON.stringify(j).slice(0, 120));
  if (j.isId) {
    let son = null;
    const bitis = Date.now() + 120000;
    while (Date.now() < bitis) {
      son = await (await fetch(`${TABAN}/api/compare/${j.isId}`, { headers: HDR })).json();
      if (son.status !== 'running') break;
      await new Promise(r => setTimeout(r, 1200));
    }
    kontrol('canlı iş bitti', son?.status === 'done', son?.status);
    const s = son?.result?.sonuclar || [];
    kontrol('canlı yanıtta sonuclar var', s.length > 0, String(s.length));
    kontrol('canlı yanıt SIRALI (grup monoton)', s.every((x, i) => i === 0 || stokGrubu(s[i - 1]) <= stokGrubu(x)),
      s.map(stokGrubu).join(','));
    const o = son?.result?.ozet || {};
    kontrol('canlı ozet.stoktaVarSayisi sayı', Number.isInteger(o.stoktaVarSayisi), String(o.stoktaVarSayisi));
    kontrol('canlı ozet.stoktaYokSayisi sayı', Number.isInteger(o.stoktaYokSayisi), String(o.stoktaYokSayisi));
    kontrol('canlı ozet.tamamiTukendi boolean', typeof o.tamamiTukendi === 'boolean', String(o.tamamiTukendi));
    kontrol('canlı: sayaçlar bulunan sayısıyla tutarlı',
      (o.stoktaVarSayisi || 0) + (o.stoktaYokSayisi || 0) === o.bulunanSiteSayisi,
      `${o.stoktaVarSayisi}+${o.stoktaYokSayisi} vs ${o.bulunanSiteSayisi}`);
    // Tükendi varsa: hiçbiri stokta olanın önünde olmamalı (asıl kural)
    const ilkTukendi = s.findIndex(x => x.status === 'found' && x.product?.inStock === false);
    const sonStokta = s.map((x, i) => (x.status === 'found' && x.product?.inStock !== false ? i : -1)).filter(i => i >= 0).pop();
    kontrol('canlı: tükenen ürün stokta olanın önüne geçmedi',
      ilkTukendi === -1 || sonStokta === undefined || ilkTukendi > sonStokta,
      `ilkTukendi=${ilkTukendi} sonStokta=${sonStokta}`);
  }
}

console.log(`\nSTOK ${gecen}/${gecen + kalan} ${kalan === 0 ? '✓' : '✗'}`);
if (kalan) { console.log('Başarısız:'); for (const h of hatalar) console.log('  - ' + h); }
// Windows'ta node:sqlite tutamacı açıkken process.exit() libuv assert'i üretiyor
// (src\win\async.c:76). Önce bağlantıyı kapat; çıkışı zorlamak yerine kodu bırak —
// olay döngüsü boşalınca süreç kendiliğinden temiz kapanır.
try { closeDatabase(); } catch { /* zaten kapalı */ }
process.exitCode = kalan === 0 ? 0 : 1;
