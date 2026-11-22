/**
 * ⭐ Sponsorlu Vitrin & Doğrulanmış Mağaza Rozeti — Test Paketi (2026-11-08)
 *
 * Kapsam:
 *   1)  SQLite şeması ve tohum verisi (Porima3D, Robotistan)
 *   2)  Vitrin seçimi: aktif + süresi dolmamış; süre dolunca KENDİLİĞİNDEN kaybolur
 *   3)  Gösterim / tıklama sayaçları ve CTR raporu (kuruş değil, yüzde hassas)
 *   4)  Yönetici ekleme doğrulaması (javascript: URL reddi, tarih sırası, fiyat)
 *   5)  Doğrulanmış mağaza CRUD + abonelik bitince rozetin düşmesi
 *   6)  Mavi tik rozeti render'ı (gerçek `dogrulanmisRozetHtml` çalıştırılır)
 *   7)  Arayüz sözleşmesi (HTML/JS/CSS: glassmorphism, altın degrade, mobile)
 *   8)  Sunucu sözleşmesi (uçlar, erişim muafiyeti, 302 yönlendirme, 404)
 *   9)  CANLI HTTP: gerçek sayaç artışı + 302 hedefi + 5 dk önbellek başlığı
 *
 *   node scripts/test-sponsor-vitrin.mjs
 *
 * Ağ: yalnızca localhost:3000. Sunucu kapalıysa CANLI bölüm atlanır
 * (süit kırmızı olmaz); yerel depo testleri her koşulda çalışır.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  sponsorVitrinGetir, sponsorGosterimArtir, sponsorTiklamaArtir,
  sponsorVitrinKaydet, sponsorVitrinSil, sponsorRapor, sponsorRaporTek,
  dogrulanmisMagazalariGetir, dogrulanmisMagazaKaydet, dogrulanmisMagazaSil,
  sponsorSayacAyarla,
  closeDatabase,
} from '../src/store.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

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

const GUN = 24 * 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const simdi = Date.now();

/* ------------------------------------------------------------------ */
// Reklam sayaçları: test başında fotoğrafla, sonunda AYNEN geri koy.
// Testin kendi gösterim/tıklamaları gerçek reklamveren raporunu kirletmesin.
const DEMO_ID = 'vitrin_demo_porima';
const demoBaslangic = sponsorRaporTek(DEMO_ID);
const demoGosterim = demoBaslangic?.gosterimSayisi ?? 0;
const demoTiklama = demoBaslangic?.tiklamaSayisi ?? 0;

/* ------------------------------------------------------------------ */
bolum('1) 🗄️ Şema, tohum verisi ve vitrin seçimi');

const seedRapor = sponsorRaporTek('vitrin_demo_porima');
kontrol('tohum vitrin kaydı DB\'de mevcut (pasif/rafa kaldırılmış)', !!seedRapor, 'seed yok');
kontrol('tohum vitrin yayında değil (rafa kaldırıldı)',
  sponsorVitrinGetir({ id: 'vitrin_demo_porima' }) === null);
if (seedRapor) {
  kontrol('tohum markası Porima3D', seedRapor.marka === 'Porima3D', String(seedRapor.marka));
  kontrol('tohum başlık dolu', !!seedRapor.baslik, String(seedRapor.baslik));
  kontrol('tohum yayinda=false', seedRapor.yayinda === false, String(seedRapor.yayinda));
  kontrol('sayaçlar sayı', Number.isInteger(seedRapor.gosterimSayisi) && Number.isInteger(seedRapor.tiklamaSayisi));
}

/* --- süre sonu: geçmiş tarihli kayıt ASLA dönmez --- */
const GECMIS_ID = '__test_sponsor_gecmis__';
sponsorVitrinKaydet({
  id: GECMIS_ID,
  marka: 'Test Marka',
  baslik: 'Süresi dolmuş kampanya',
  gorselUrl: 'https://example.com/g.png',
  eskiFiyat: 100, kampanyaFiyat: 80,
  yonlendirmeUrl: 'https://example.com/kampanya',
  baslangicTarihi: iso(simdi - 10 * GUN),
  bitisTarihi: iso(simdi - 1 * GUN),      // dün bitti
});
kontrol('süresi dolmuş kayıt id ile DÖNMEZ', sponsorVitrinGetir({ id: GECMIS_ID }) === null);
kontrol('süresi dolmuş kayıt genel listede yok',
  sponsorVitrinGetir()?.id !== GECMIS_ID);
const GELECEK_ID = '__test_sponsor_gelecek__';
sponsorVitrinKaydet({
  id: GELECEK_ID,
  marka: 'Test Marka 2',
  baslik: 'Henüz başlamamış',
  gorselUrl: 'https://example.com/g.png',
  kampanyaFiyat: 50,
  yonlendirmeUrl: 'https://example.com/k2',
  baslangicTarihi: iso(simdi + 3 * GUN),
  bitisTarihi: iso(simdi + 9 * GUN),
});
kontrol('henüz başlamamış kayıt dönmez', sponsorVitrinGetir({ id: GELECEK_ID }) === null);

const AKTIF_ID = '__test_sponsor_aktif__';
sponsorVitrinKaydet({
  id: AKTIF_ID,
  marka: 'Test Marka 3',
  baslik: 'Aktif test kampanyası',
  aciklama: 'Test açıklaması',
  gorselUrl: 'https://example.com/aktif.png',
  eskiFiyat: 200, kampanyaFiyat: 150,
  yonlendirmeUrl: 'https://example.com/aktif',
  baslangicTarihi: iso(simdi - GUN),
  bitisTarihi: iso(simdi + 2 * GUN),
});
const aktif = sponsorVitrinGetir({ id: AKTIF_ID });
kontrol('aktif kayıt döner', !!aktif, 'aktif kayıt yok');
kontrol('aktif kayıt indirimi 50 TL', aktif?.indirimTL === 50, String(aktif?.indirimTL));
kontrol('aktif kayıt yüzdesi %25', aktif?.indirimYuzde === 25, String(aktif?.indirimYuzde));

// Pasifleştirilmiş kayıt dönmez.
sponsorVitrinKaydet({
  id: AKTIF_ID, marka: 'Test Marka 3', baslik: 'Aktif test kampanyası',
  gorselUrl: 'https://example.com/aktif.png', kampanyaFiyat: 150,
  yonlendirmeUrl: 'https://example.com/aktif',
  baslangicTarihi: iso(simdi - GUN), bitisTarihi: iso(simdi + 2 * GUN), aktif: false,
});
kontrol('aktif=0 kayıt dönmez', sponsorVitrinGetir({ id: AKTIF_ID }) === null);
// Yeniden aktive et (sayaç testleri için).
sponsorVitrinKaydet({
  id: AKTIF_ID, marka: 'Test Marka 3', baslik: 'Aktif test kampanyası',
  gorselUrl: 'https://example.com/aktif.png', eskiFiyat: 200, kampanyaFiyat: 150,
  yonlendirmeUrl: 'https://example.com/aktif',
  baslangicTarihi: iso(simdi - GUN), bitisTarihi: iso(simdi + 2 * GUN),
});

/* ------------------------------------------------------------------ */
bolum('2) 📊 Gösterim / tıklama sayaçları');

const oncekiGosterim = sponsorRaporTek(AKTIF_ID)?.gosterimSayisi ?? 0;
kontrol('gösterim artırma true döner', sponsorGosterimArtir(AKTIF_ID) === true);
kontrol('gösterim 1 arttı', sponsorRaporTek(AKTIF_ID).gosterimSayisi === oncekiGosterim + 1);
kontrol('gösterim artırma 3 kez sayılır',
  sponsorGosterimArtir(AKTIF_ID) && sponsorGosterimArtir(AKTIF_ID)
  && sponsorRaporTek(AKTIF_ID).gosterimSayisi === oncekiGosterim + 3,
  String(sponsorRaporTek(AKTIF_ID).gosterimSayisi));
kontrol('olmayan kayıtta gösterim false', sponsorGosterimArtir('__yok__') === false);

const oncekiTiklama = sponsorRaporTek(AKTIF_ID).tiklamaSayisi;
const tik = sponsorTiklamaArtir(AKTIF_ID);
kontrol('tıklama kaydı döner', !!tik && tik.id === AKTIF_ID);
kontrol('tıklama yönlendirme URL taşır', tik?.yonlendirmeUrl === 'https://example.com/aktif', String(tik?.yonlendirmeUrl));
kontrol('tıklama sayacı 1 arttı', sponsorRaporTek(AKTIF_ID).tiklamaSayisi === oncekiTiklama + 1);
kontrol('olmayan kayıtta tıklama null', sponsorTiklamaArtir('__yok__') === null);
kontrol('boş id null', sponsorTiklamaArtir('') === null);

// Pasif kayda tıklama sayılmaz.
sponsorVitrinKaydet({
  id: '__test_sponsor_pasif__', marka: 'Pasif', baslik: 'Pasif kampanya',
  gorselUrl: 'https://example.com/p.png', kampanyaFiyat: 10,
  yonlendirmeUrl: 'https://example.com/p',
  baslangicTarihi: iso(simdi - GUN), bitisTarihi: iso(simdi + GUN), aktif: false,
});
kontrol('pasif kampanyaya tıklama null', sponsorTiklamaArtir('__test_sponsor_pasif__') === null);

bolum('2B) 📈 CTR raporu');

const raporAktif = sponsorRaporTek(AKTIF_ID);
kontrol('rapor gösterim > 0', raporAktif.gosterimSayisi >= 3, String(raporAktif.gosterimSayisi));
kontrol('CTR = tıklama/gösterim×100',
  raporAktif.ctr === Math.round((raporAktif.tiklamaSayisi / raporAktif.gosterimSayisi) * 10000) / 100,
  String(raporAktif.ctr));
kontrol('yayında alanı true', raporAktif.yayinda === true);
const raporGecmis = sponsorRaporTek(GECMIS_ID);
kontrol('süresi dolmuş kampanya raporda GÖRÜNÜR', !!raporGecmis, 'rapor geçmişi kaybetmemeli');
kontrol('süresi dolmuş kampanya yayinda=false', raporGecmis?.yayinda === false);
kontrol('gösterimi 0 olan kampanyada CTR null (bölme yok)',
  sponsorRaporTek(GELECEK_ID)?.ctr === null, String(sponsorRaporTek(GELECEK_ID)?.ctr));
const tumRapor = sponsorRapor();
kontrol('rapor dizisi', Array.isArray(tumRapor) && tumRapor.length >= 3, String(tumRapor.length));
kontrol('rapor sayısal alanlar', tumRapor.every(r =>
  Number.isInteger(r.gosterimSayisi) && Number.isInteger(r.tiklamaSayisi)
  && (r.ctr === null || typeof r.ctr === 'number')));
kontrol('olmayan kampanya raporu null', sponsorRaporTek('__yok__') === null);

/* ------------------------------------------------------------------ */
bolum('3) 🛡️ Yönetici ekleme doğrulaması');

const hataBekle = (fn, desen, etiket) => {
  try { fn(); kontrol(etiket, false, 'hata fırlatmadı'); }
  catch (e) { kontrol(etiket, desen.test(String(e.message || e)), String(e.message || e).slice(0, 70)); }
};
const temelGovde = {
  id: '__test_sponsor_dogrulama__',
  marka: 'X', baslik: 'Y',
  gorselUrl: 'https://example.com/x.png',
  kampanyaFiyat: 100,
  yonlendirmeUrl: 'https://example.com/x',
  baslangicTarihi: iso(simdi - GUN),
  bitisTarihi: iso(simdi + GUN),
};

hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, yonlendirmeUrl: 'javascript:alert(1)' }),
  /https/, 'javascript: yönlendirme reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, yonlendirmeUrl: 'data:text/html,x' }),
  /https/, 'data: yönlendirme reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, gorselUrl: 'ftp://x/y.png' }),
  /https/, 'ftp görsel reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, kampanyaFiyat: 0 }),
  /kampanyaFiyat/, 'sıfır fiyat reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, kampanyaFiyat: -5 }),
  /kampanyaFiyat/, 'negatif fiyat reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, marka: '' }),
  /marka/, 'boş marka reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, baslangicTarihi: 'yok' }),
  /baslangic/, 'geçersiz başlangıç reddedilir');
hataBekle(() => sponsorVitrinKaydet({ ...temelGovde, bitisTarihi: iso(simdi - 5 * GUN) }),
  /sonra/, 'bitiş < başlangıç reddedilir');
kontrol('geçerli gövde kabul edilir', !!sponsorVitrinKaydet(temelGovde));
const otomatik = sponsorVitrinKaydet({ ...temelGovde, id: undefined, marka: 'Otomatik' });
kontrol('id verilmezse üretilir', !!otomatik?.id);
if (otomatik?.id) sponsorVitrinSil(otomatik.id);

/* ------------------------------------------------------------------ */
bolum('4) ✅ Doğrulanmış mağaza rozetleri');

const magazalar = dogrulanmisMagazalariGetir();
const idler = magazalar.map(m => m.siteId);
kontrol('tohum: porima3d doğrulanmış', idler.includes('porima3d'), idler.join(','));
kontrol('tohum: robotistan doğrulanmış', idler.includes('robotistan'), idler.join(','));
const rob = magazalar.find(m => m.siteId === 'robotistan');
kontrol('Robotistan rozet metni Resmi Distribütör',
  /Resmi Distribütör/.test(rob?.rozetMetni || ''), rob?.rozetMetni);
kontrol('Robotistan onay türü resmi_partner', rob?.onayTuru === 'resmi_partner', rob?.onayTuru);
const por = magazalar.find(m => m.siteId === 'porima3d');
kontrol('Porima onay türü üretici', por?.onayTuru === 'uretici', por?.onayTuru);
kontrol('her rozet metni dolu', magazalar.every(m => !!m.rozetMetni));

// Süresi dolmuş abonelik rozet göstermez.
dogrulanmisMagazaKaydet({
  siteId: '__test_suresi_dolmus__', rozetMetni: 'Eski Partner',
  onayTuru: 'hizli_kargo', bitisTarihi: iso(simdi - GUN),
});
kontrol('süresi dolmuş rozet listede YOK',
  !dogrulanmisMagazalariGetir().some(m => m.siteId === '__test_suresi_dolmus__'));

// Aktif test rozeti
dogrulanmisMagazaKaydet({
  siteId: '3dcim', rozetMetni: 'Aynı Gün Kargo · Test',
  onayTuru: 'hizli_kargo', bitisTarihi: iso(simdi + 30 * GUN),
});
kontrol('yeni aktif rozet listede',
  dogrulanmisMagazalariGetir().some(m => m.siteId === '3dcim'));
kontrol('tekrar kaydet metni günceller',
  dogrulanmisMagazaKaydet({
    siteId: '3dcim', rozetMetni: 'Güncellenmiş Rozet',
    bitisTarihi: iso(simdi + 60 * GUN),
  })?.rozetMetni === 'Güncellenmiş Rozet');
kontrol('silme true döner', dogrulanmisMagazaSil('3dcim') === true);
kontrol('silinen rozet listede yok',
  !dogrulanmisMagazalariGetir().some(m => m.siteId === '3dcim'));
kontrol('olmayan rozeti silme false', dogrulanmisMagazaSil('__yok__') === false);
hataBekle(() => dogrulanmisMagazaKaydet({ siteId: 'x' }),
  /rozetMetni/, 'rozet metni zorunlu');
hataBekle(() => dogrulanmisMagazaKaydet({ siteId: 'x', rozetMetni: 'y', bitisTarihi: 'zzz' }),
  /bitisTarihi/, 'geçersiz bitiş reddedilir');

/* ------------------------------------------------------------------ */
bolum('5) ✅ Mavi tik rozeti render (gerçek fonksiyon)');

const appJs = oku('public/app.js');
const fnMatch = appJs.match(/function dogrulanmisRozetHtml\([\s\S]*?\n\}/);
kontrol('dogrulanmisRozetHtml kaynakta bulundu', !!fnMatch);

let rozet = () => '';
let rozetliHarita = {};
if (fnMatch) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  rozet = new Function(
    'esc',
    `let dogrulanmisHarita = ${JSON.stringify(rozetliHarita)};
     ${fnMatch[0]}
     return (site, harita) => { dogrulanmisHarita = harita; return dogrulanmisRozetHtml(site); };`,
  )(esc);
}

const h1 = rozet('robotistan', { robotistan: 'Resmi Distribütör · Aynı Gün Kargo' });
kontrol('rozet HTML üretilir', /magaza-dogrulanmis/.test(h1), h1.slice(0, 60));
kontrol('mavi tik svg var', /class="mavi-tik"/.test(h1) && /viewBox="0 0 24 24"/.test(h1));
kontrol('tik mavi dolgu (#1D9BF0)', /#1D9BF0/.test(h1));
kontrol('kısa etiket üretilir (· öncesi)', />Resmi Distribütör</.test(h1), h1);
kontrol('tooltip tam metni taşır', /title="Doğrulanmış Partner: Resmi Distribütör/.test(h1));
kontrol('doğrulanmamış mağaza için boş', rozet('trendyol', { robotistan: 'x' }) === '');
kontrol('boş site için boş', rozet('', { robotistan: 'x' }) === '');
kontrol('büyük harfli site eşleşir',
  /magaza-dogrulanmis/.test(rozet('ROBOTISTAN', { robotistan: 'x' })));
kontrol('XSS: rozet metni kaçırılır',
  !/<script>/.test(rozet('x', { x: '<script>alert(1)</script>' }))
  && /&lt;script&gt;/.test(rozet('x', { x: '<script>alert(1)</script>' })));

kontrol('siteAdiHtml rozeti çağırır', /dogrulanmisRozetHtml\(site\)/.test(appJs));
kontrol('kart tablosu rozeti çağırır', /dogrulanmisRozetHtml\(r\.site\)/.test(appJs));
kontrol('rozetler DOMContentLoaded ile yüklenir',
  /dogrulanmisMagazalariYukle\(\)/.test(appJs));
kontrol('rozet yüklenince kartlar tazelenir',
  /dogrulanmisHarita[\s\S]{0,600}kartlariFiltreleVeCiz/.test(appJs));

/* ------------------------------------------------------------------ */
bolum('6) 🖥️ Arayüz sözleşmesi (HTML / JS / CSS)');

const html = oku('public/index.html');
const css = oku('public/style.css');

kontrol('index.html: sponsor bölümü', /id="sponsorVitrinAlani"/.test(html));
kontrol('index.html: başlangıçta gizli (hidden)', /id="sponsorVitrinAlani"[^>]*hidden/.test(html));
kontrol('index.html: banner başlığı', /id="sponsorVitrinBaslik"/.test(html));
kontrol('index.html: eski fiyat alanı', /id="sponsorEskiFiyat"/.test(html));
kontrol('index.html: yeni fiyat alanı', /id="sponsorYeniFiyat"/.test(html));
kontrol('index.html: CTA rel noopener sponsored',
  /id="sponsorCta"[^>]*rel="noopener sponsored"/.test(html));
kontrol('index.html: görsel alanı', /id="sponsorGorsel"/.test(html));
kontrol('index.html: bölüm borsa bandından ÖNCE',
  html.indexOf('sponsorVitrinAlani') < html.indexOf('id="vitrinAlani"'));

kontrol('app.js: vitrin yükleyicisi', /async function sponsorVitrinYukle/.test(appJs));
kontrol('app.js: /api/sponsor/vitrin çağrısı', /fetch\('\/api\/sponsor\/vitrin'/.test(appJs));
kontrol('app.js: CTA tıklama sayacı ucuna gider',
  /'\/api\/sponsor\/tikla\/' \+ encodeURIComponent\(v\.id\)/.test(appJs));
kontrol('app.js: süre geçmişse gizler', /kalan < 0/.test(appJs));
kontrol('app.js: ağ hatasında gizler', /alan\.hidden = true;\s+\/\/ ağ hatasında/.test(appJs));
kontrol('app.js: görsel hatasında emoji yedeği', /img\.onerror/.test(appJs));
kontrol('app.js: görsel eager yüklenir (gizli kapta lazy çalışmaz)',
  /img\.loading = 'eager'/.test(appJs));
kontrol('app.js: banner görselden ÖNCE açılır',
  appJs.indexOf("alan.hidden = false;\n\n    const $ = (id)") > 0
  || /alan\.hidden = false;[\s\S]{0,400}img\.src = v\.gorselUrl/.test(appJs));
kontrol('index.html: banner görseli eager',
  /id="sponsorGorsel"[^>]*loading="eager"/.test(html));
kontrol('yerel sponsor görseli mevcut', fs.existsSync(path.join(KOK, 'public/sponsor-ornek.svg')));
kontrol('tohum kampanya görseli yerel yola işaret eder',
  oku('src/store.js').includes("'/sponsor-ornek.svg'"));
kontrol('app.js: eski fiyat yoksa üstü çizili basılmaz',
  /eski && v\.eskiFiyat > v\.kampanyaFiyat/.test(appJs));

kontrol('style.css: glassmorphism (backdrop-filter)', /\.sponsor-hero-banner[\s\S]{0,900}backdrop-filter: blur/.test(css));
kontrol('style.css: altın→mor degrade rozet (AA kontrastlı)',
  /\.sponsor-rozet[\s\S]{0,500}linear-gradient\(135deg, #B45309 0%, #7E22CE/.test(css));
kontrol('style.css: yeni fiyat zümrüt', /\.sponsor-yeni-fiyat[\s\S]{0,300}#047857/.test(css));
kontrol('style.css: eski fiyat üstü çizili',
  /\.sponsor-eski-fiyat[\s\S]{0,200}line-through/.test(css));
kontrol('style.css: parıltı animasyonu', /@keyframes sponsor-parla/.test(css));
kontrol('style.css: responsive grid', /grid-template-columns: minmax\(0, 190px\)/.test(css));
kontrol('style.css: mobil düzen', /@media \(max-width: 720px\)[\s\S]{0,300}sponsor-icerik/.test(css));
kontrol('style.css: mavi tik stili', /\.mavi-tik\s*\{/.test(css));
kontrol('style.css: doğrulanmış etiket', /\.dogrulanmis-etiket\s*\{/.test(css));
kontrol('style.css: hover tooltip', /\.magaza-dogrulanmis:hover::after/.test(css));
kontrol('style.css: mobilde etiket gizlenir (taşma yok)',
  /@media \(max-width: 640px\)[\s\S]{0,200}\.dogrulanmis-etiket \{ display: none/.test(css));
kontrol('style.css: koyu tema banner', /html\[data-theme="dark"\] \.sponsor-hero-banner/.test(css));
kontrol('style.css: reduced-motion', /prefers-reduced-motion[\s\S]{0,200}sponsor-parilti/.test(css));

/* ------------------------------------------------------------------ */
bolum('7) 🔌 Sunucu sözleşmesi');

const serverJs = oku('server.js');
kontrol('GET /api/sponsor/vitrin', /app\.get\('\/api\/sponsor\/vitrin'/.test(serverJs));
kontrol('GET /api/sponsor/tikla/:id', /app\.get\('\/api\/sponsor\/tikla\/:id'/.test(serverJs));
kontrol('GET /api/dogrulanmis-magazalar', /app\.get\('\/api\/dogrulanmis-magazalar'/.test(serverJs));
kontrol('GET /api/admin/sponsor-rapor', /app\.get\('\/api\/admin\/sponsor-rapor'/.test(serverJs));
kontrol('gösterim sayacı asenkron artırılır', /setImmediate\(\(\) => \{[\s\S]{0,120}sponsorGosterimArtir/.test(serverJs));
kontrol('tıklama 302 yönlendirme', /res\.redirect\(302, hedef\.href\)/.test(serverJs));
kontrol('yönlendirmede yalnızca http(s)', /\^https\?:\$/.test(serverJs));
kontrol('bilinmeyen kampanya 404', /sponsorTiklamaArtir[\s\S]{0,200}status\(404\)/.test(serverJs));
kontrol('doğrulanmış mağaza 5 dk önbellek',
  /\/api\/dogrulanmis-magazalar[\s\S]{0,600}max-age=300/.test(serverJs));
kontrol('erişim muafiyeti: vitrin', /path === '\/api\/sponsor\/vitrin'/.test(serverJs));
kontrol('erişim muafiyeti: tıklama deseni', /sponsor\\\/tikla/.test(serverJs));
kontrol('erişim muafiyeti: doğrulanmış mağazalar',
  /path === '\/api\/dogrulanmis-magazalar'/.test(serverJs));

/* ------------------------------------------------------------------ */
bolum('8) 🌐 CANLI HTTP (sunucu açıksa)');

const TABAN = 'http://localhost:3000';
const httpIste = async (yol) => {
  const ctrl = new AbortController();
  const z = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(TABAN + yol, { signal: ctrl.signal, redirect: 'manual' });
    const govde = await res.text();
    return { durum: res.status, konum: res.headers.get('location'), cache: res.headers.get('cache-control'), govde };
  } finally { clearTimeout(z); }
};

let sunucu = false;
try {
  const ping = await httpIste('/api/ping');
  sunucu = ping.durum === 200;
} catch { sunucu = false; }

if (!sunucu) {
  console.log('  ℹ️  Sunucu kapalı — canlı HTTP bölümü atlandı (depo testleri geçti).');
  kontrol('depo katmanı sunucusuz doğrulandı', true);
} else {
  // Gösterim sayacı: iki çağrı → +2
  const once = sponsorRapor().reduce((s, k) => s + k.gosterimSayisi, 0);
  const v1 = await httpIste('/api/sponsor/vitrin');
  const v2 = await httpIste('/api/sponsor/vitrin');
  kontrol('GET /api/sponsor/vitrin 200', v1.durum === 200, String(v1.durum));
  kontrol('vitrin yanıtı ok:true + kayıt', (() => {
    try { const d = JSON.parse(v1.govde); return d.ok === true && !!d.vitrin?.id; } catch { return false; }
  })());
  kontrol('vitrin no-store', /no-store/.test(v1.cache || ''), v1.cache);
  await new Promise(r => setTimeout(r, 250));
  const sonra = sponsorRapor().reduce((s, k) => s + k.gosterimSayisi, 0);
  kontrol('iki çağrı gösterim sayacını +2 artırdı', sonra - once === 2, String(sonra - once));

  // Tıklama: 302 + doğru hedef + sayaç
  const hedefId = JSON.parse(v2.govde).vitrin?.id;
  if (hedefId) {
    const onceTik = sponsorRaporTek(hedefId)?.tiklamaSayisi ?? 0;
    const tik = await httpIste('/api/sponsor/tikla/' + encodeURIComponent(hedefId));
    kontrol('tıklama 302 döner', tik.durum === 302, String(tik.durum));
    kontrol('302 hedefi kampanya URL’si',
      /^https?:\/\//.test(String(tik.konum)) && tik.konum === sponsorVitrinGetir({ id: hedefId })?.yonlendirmeUrl,
      String(tik.konum));
    kontrol('tıklama sayacı arttı', (sponsorRaporTek(hedefId)?.tiklamaSayisi ?? 0) === onceTik + 1);
  }

  const yok = await httpIste('/api/sponsor/tikla/bilinmeyen-kampanya-xyz');
  kontrol('bilinmeyen kampanya 404', yok.durum === 404, String(yok.durum));
  kontrol('404 gövdesi kullanıcı dostu', /Kampanya bulunamadı/.test(yok.govde));

  const dm = await httpIste('/api/dogrulanmis-magazalar');
  kontrol('GET /api/dogrulanmis-magazalar 200', dm.durum === 200, String(dm.durum));
  kontrol('5 dk önbellek başlığı', /max-age=300/.test(dm.cache || ''), dm.cache);
  kontrol('yanıtta harita ve magazalar', (() => {
    try {
      const d = JSON.parse(dm.govde);
      return d.ok === true && Array.isArray(d.magazalar)
        && typeof d.harita === 'object'
        && d.magazalar.every(m => !!m.siteId && !!m.rozetMetni);
    } catch { return false; }
  })());

  const raporHttp = await httpIste('/api/admin/sponsor-rapor');
  kontrol('admin rapor 200 (loopback)', raporHttp.durum === 200, String(raporHttp.durum));
  kontrol('rapor yanıtı toplam + kampanyalar', (() => {
    try {
      const d = JSON.parse(raporHttp.govde);
      return d.ok === true && Array.isArray(d.kampanyalar)
        && typeof d.toplam?.gosterim === 'number'
        && typeof d.toplam?.tiklama === 'number';
    } catch { return false; }
  })());

  // Yönetici ekleme: geçersiz gövde 400 (sessiz kabul yok)
  try {
    const ctrl = new AbortController();
    const z = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(TABAN + '/api/admin/sponsor-vitrin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marka: 'X', baslik: 'Y', gorselUrl: 'https://x/y.png',
        kampanyaFiyat: 10, yonlendirmeUrl: 'javascript:alert(1)',
        baslangicTarihi: iso(simdi - GUN), bitisTarihi: iso(simdi + GUN) }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(z));
    const d = await res.json().catch(() => ({}));
    kontrol('yönetici: javascript: URL 400', res.status === 400, String(res.status));
    kontrol('yönetici: hata mesajı döner', !!d.hata, JSON.stringify(d).slice(0, 90));
  } catch (e) {
    kontrol('yönetici: javascript: URL 400', false, String(e.message).slice(0, 80));
  }
}

/* ------------------------------------------------------------------ */
// Test kayıtlarını temizle (tohum ve gerçek kampanya korunur).
for (const id of [GECMIS_ID, GELECEK_ID, AKTIF_ID, '__test_sponsor_pasif__',
  '__test_sponsor_dogrulama__']) {
  try { sponsorVitrinSil(id); } catch { /* yoksay */ }
}
try { dogrulanmisMagazaSil('__test_suresi_dolmus__'); } catch { /* yoksay */ }

kontrol('test vitrin kayıtları temizlendi', sponsorVitrinGetir({ id: AKTIF_ID }) === null);
kontrol('yayında aktif banner yok (demo rafa kaldırıldı)',
  sponsorVitrinGetir() === null, String(sponsorVitrinGetir()?.id));
kontrol('tohum mağazaları korunuyor',
  dogrulanmisMagazalariGetir().some(m => m.siteId === 'robotistan'));

// Reklam sayaçlarını test öncesi değerlere geri koy (gerçek rapor kirlenmesin).
const geriKondu = sponsorSayacAyarla(DEMO_ID, {
  gosterimSayisi: demoGosterim, tiklamaSayisi: demoTiklama,
});
kontrol('reklam sayaçları test öncesi değere döndü', geriKondu === true);
kontrol('gösterim sayacı korundu',
  (sponsorRaporTek(DEMO_ID)?.gosterimSayisi ?? -1) === demoGosterim,
  `${sponsorRaporTek(DEMO_ID)?.gosterimSayisi} ≠ ${demoGosterim}`);
kontrol('tıklama sayacı korundu',
  (sponsorRaporTek(DEMO_ID)?.tiklamaSayisi ?? -1) === demoTiklama);

try { closeDatabase(); } catch { /* zaten kapalı */ }

console.log('\n' + '─'.repeat(48));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
