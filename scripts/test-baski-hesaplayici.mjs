/**
 * 🧮 3D Baskı Maliyet & Kârlılık Hesaplayıcı — birim + sözleşme testleri
 * (2026-11-04)
 *
 * Kapsam:
 *   1) MATEMATİK: spec'teki örnek değerlerle birebir (160 g · ₺532,21/kg ·
 *      150 W · 4 sa · ₺2,90 · ₺3/sa → 85,15 / 1,74 / 12,00 / 98,89).
 *   2) DÜRÜSTLÜK: eksik/geçersiz girdide hesap yapılmaz, `neden` döner.
 *   3) YAZICI ŞABLONLARI: 6 şablon, her birinin watt değeri spec ile aynı.
 *   4) CANLI FİLAMENT: `radar_durum`dan gerçek kayıtlar; fiyatı/₺-kg'sı
 *      okunamayan GİRMEZ, liste ₺/kg artan sıralı, CTA linki gerçek.
 *   5) TEKLİF METNİ: panoya kopyalanan biçim spec ile uyumlu.
 *   6) ARAYÜZ SÖZLEŞMESİ: HTML id'leri, JS formülü (sunucuyla aynı),
 *      CSS mobil kırılımı, CTA ve kopyalama bağlantıları.
 *   7) SUNUCU: rotalar bağlı, POST /api/baski/hesapla doğrulaması.
 *
 * Kullanım: node scripts/test-baski-hesaplayici.mjs
 * Ağ isteği YOK. DB'ye YAZMAZ.
 */
import fs from 'node:fs';
import {
  maliyetMotoruHesapla, teklifMetni, YAZICI_SABLONLARI,
  YAZICI_GUC_W, ELEKTRIK_KWH_TL, YIPRANMA_SAAT_TL,
} from '../src/baskiMaliyet.js';
import { enUcuzFilamentler } from '../src/baskiApi.js';
import { closeDatabase } from '../src/store.js';

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
const yakin = (a, b, tol = 0.011) => Math.abs(Number(a) - Number(b)) <= tol;

/* ------------------------------------------------------------------ */
bolum('1) 📐 Matematik — spec örneği birebir');

const ornek = maliyetMotoruHesapla({
  gramaj: 160, sureSaat: 4, gucW: 150, kwhTl: 2.9, yipranmaSaatTl: 3,
  filamentTlKg: 532.21, karCarpani: 2.5,
});
kontrol('hesap geçerli', ornek.gecerli === true, ornek.neden);
kontrol('hammadde = 160g × ₺532,21/kg = ₺85,15', yakin(ornek.hammadde, 85.15), String(ornek.hammadde));
kontrol('elektrik = (150W×4sa/1000)×₺2,90 = ₺1,74', yakin(ornek.elektrik, 1.74), String(ornek.elektrik));
kontrol('amortisman = 4sa × ₺3 = ₺12,00', yakin(ornek.amortisman, 12), String(ornek.amortisman));
kontrol('net maliyet = ₺98,89', yakin(ornek.netMaliyet, 98.89), String(ornek.netMaliyet));
kontrol('kWh = 0,6', yakin(ornek.kwh, 0.6, 0.001), String(ornek.kwh));

kontrol('başabaş = net maliyet', yakin(ornek.satis.maliyet.fiyat, 98.89), String(ornek.satis.maliyet.fiyat));
kontrol('hobi (2x) ≈ ₺198', yakin(ornek.satis.hobi.fiyat, 197.79), String(ornek.satis.hobi.fiyat));
kontrol('atölye (2.5x) ≈ ₺247', yakin(ornek.satis.atolye.fiyat, 247.23), String(ornek.satis.atolye.fiyat));
kontrol('ticari (3x) ≈ ₺297', yakin(ornek.satis.ticari.fiyat, 296.68), String(ornek.satis.ticari.fiyat));
kontrol('kâr yüzdeleri %0/%100/%150/%200',
  ornek.satis.maliyet.karYuzde === 0 && ornek.satis.hobi.karYuzde === 100
  && ornek.satis.atolye.karYuzde === 150 && ornek.satis.ticari.karYuzde === 200);
kontrol('seçili fiyat çarpanla uyumlu', yakin(ornek.secilen, ornek.netMaliyet * 2.5), String(ornek.secilen));
kontrol('kâr tutarı = seçili − net', yakin(ornek.karTl, ornek.secilen - ornek.netMaliyet), String(ornek.karTl));
kontrol('varsayımlar sonuçla dönüyor',
  ornek.varsayimlar.gucW === 150 && ornek.varsayimlar.kwhTl === 2.9
  && ornek.varsayimlar.yipranmaSaatTl === 3);

/* ------------------------------------------------------------------ */
bolum('2) 🛡️ Dürüstlük — eksik girdide hesap yok');

const bos = maliyetMotoruHesapla({});
kontrol('gramaj yoksa geçersiz', bos.gecerli === false && !!bos.neden, bos.neden);
const fiyatsiz = maliyetMotoruHesapla({ gramaj: 100, gucW: 150, kwhTl: 2.9 });
kontrol('filament fiyatı yoksa geçersiz', fiyatsiz.gecerli === false && /₺\/kg/.test(String(fiyatsiz.neden)), fiyatsiz.neden);
const negatif = maliyetMotoruHesapla({ gramaj: 100, filamentTlKg: 500, gucW: 150, kwhTl: 2.9, yipranmaSaatTl: -1 });
kontrol('negatif yıpranma reddedilir', negatif.gecerli === false, negatif.neden);
const asiri = maliyetMotoruHesapla({ gramaj: 100, filamentTlKg: 500, gucW: 150, kwhTl: 2.9, sureSaat: 24 * 40 });
kontrol('gerçekçi olmayan süre reddedilir', asiri.gecerli === false, asiri.neden);
kontrol('geçersiz hesapta teklif metni boş', teklifMetni(bos) === '');

// Süre verilmezse tahmin edilir ve İŞARETLENİR (gizli varsayım yok).
const tahmin = maliyetMotoruHesapla({ gramaj: 250, filamentTlKg: 600, gucW: 150, kwhTl: 2.9, yipranmaSaatTl: 3 });
kontrol('süre yoksa gramajdan tahmin', tahmin.gecerli === true && tahmin.sureTahmini === true, String(tahmin.sureSaat));
kontrol('tahmini süre = gramaj / 12,5', yakin(tahmin.sureSaat, 250 / 12.5), String(tahmin.sureSaat));

/* ------------------------------------------------------------------ */
bolum('3) ⚡ Yazıcı güç şablonları');

kontrol('6 şablon var', YAZICI_SABLONLARI.length === 6, String(YAZICI_SABLONLARI.length));
const gucBeklenen = {
  'bambu-p1s': 150, 'bambu-a1mini': 100, 'creality-k1': 350,
  'creality-ender3v3ke': 150, 'anycubic-kobra2neo': 120, ozel: null,
};
for (const [id, guc] of Object.entries(gucBeklenen)) {
  const y = YAZICI_SABLONLARI.find(x => x.id === id);
  kontrol(`${id} şablonu var ve ${guc ?? 'manuel'} W`,
    !!y && y.gucW === guc, y ? String(y.gucW) : 'yok');
}
kontrol('her şablonda ad var', YAZICI_SABLONLARI.every(y => typeof y.ad === 'string' && y.ad.length > 2));
kontrol('varsayılan güç ₺150 W', YAZICI_GUC_W === 150, String(YAZICI_GUC_W));
kontrol('varsayılan tarife ₺2,90/kWh', ELEKTRIK_KWH_TL === 2.9, String(ELEKTRIK_KWH_TL));
kontrol('varsayılan yıpranma ₺3/saat', YIPRANMA_SAAT_TL === 3, String(YIPRANMA_SAAT_TL));

// Şablon watt'ı değişince elektrik maliyeti değişmeli (deterministik).
const e150 = maliyetMotoruHesapla({ gramaj: 100, sureSaat: 5, gucW: 150, kwhTl: 2.9, yipranmaSaatTl: 3, filamentTlKg: 600 });
const e350 = maliyetMotoruHesapla({ gramaj: 100, sureSaat: 5, gucW: 350, kwhTl: 2.9, yipranmaSaatTl: 3, filamentTlKg: 600 });
kontrol('Watt artınca elektrik artar', e350.elektrik > e150.elektrik, `${e150.elektrik} → ${e350.elektrik}`);
kontrol('350W × 5sa / 1000 × 2,9 = ₺5,08', yakin(e350.elektrik, 5.08), String(e350.elektrik));

/* ------------------------------------------------------------------ */
bolum('4) 🧵 Canlı filament listesi (radar_durum)');

const fil = enUcuzFilamentler({ limit: 20 });
kontrol('uç yanıtı ok', fil.ok === true);
kontrol('filament dizisi var', Array.isArray(fil.filamentler));
if (fil.toplam === 0) {
  kontrol('liste boşsa neden açıklanır', typeof fil.neden === 'string' && fil.neden.length > 10, fil.neden);
} else {
  kontrol('her kayıtta ₺/kg okunabilir', fil.filamentler.every(f => Number(f.tlKg) > 0));
  kontrol('her kayıtta fiyat okunabilir', fil.filamentler.every(f => Number(f.fiyat) > 0));
  kontrol('her kayıtta gerçek link', fil.filamentler.every(f => /^https?:\/\//.test(String(f.url || ''))));
  kontrol('her kayıtta mağaza adı', fil.filamentler.every(f => String(f.site || '').length > 1));
  kontrol('₺/kg artan sıralı',
    fil.filamentler.every((f, i) => i === 0 || fil.filamentler[i - 1].tlKg <= f.tlKg));
  kontrol('aynı ürün tekrarlanmaz',
    new Set(fil.filamentler.map(f => String(f.ad).toLocaleLowerCase('tr-TR'))).size === fil.filamentler.length);
  kontrol('₺/kg = fiyat / kg tutarlı',
    fil.filamentler.every(f => {
      const m = /(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/i.exec(String(f.ilan || f.ad));
      if (!m) return true; // gramaj başlıkta yoksa kontrol edilemez
      const mik = parseFloat(String(m[1]).replace(',', '.'));
      const gram = m[2].toLowerCase() === 'kg' ? mik * 1000 : mik;
      if (gram < 100) return true;
      return Math.abs(f.tlKg - f.fiyat / (gram / 1000)) < 1.5;
    }));
  // CTA hedefi: en ucuz kayıt gerçekten en düşük ₺/kg olmalı
  const enUcuz = fil.filamentler[0];
  kontrol('CTA en ucuz kaydı gösterir',
    enUcuz.tlKg === Math.min(...fil.filamentler.map(f => f.tlKg)),
    `${enUcuz.tlKg} (${enUcuz.site})`);
  kontrol('CTA linki afiliye ya da ham URL',
    typeof enUcuz.url === 'string' && enUcuz.url.length > 10);

  // Bu listeden bir filament ile hesap yapılabiliyor mu?
  const canli = maliyetMotoruHesapla({
    gramaj: 160, sureSaat: 4, gucW: 150, kwhTl: 2.9, yipranmaSaatTl: 3,
    filamentTlKg: enUcuz.tlKg,
  });
  kontrol('canlı fiyatla hesap geçerli', canli.gecerli === true, canli.neden);
  kontrol('canlı hammadde = 160g × en ucuz ₺/kg',
    yakin(canli.hammadde, (160 / 1000) * enUcuz.tlKg, 0.02), String(canli.hammadde));
}

/* ------------------------------------------------------------------ */
bolum('5) 📋 Teklif metni');

const tel = teklifMetni(ornek);
kontrol('başlık satırı', tel.startsWith('🖨️ 3D BASKI FİYAT TEKLİFİ'), tel.slice(0, 30));
kontrol('gramaj satırı', /Model Ağırlığı: 160 gram/.test(tel));
kontrol('süre satırı', /Baskı Süresi: ~4 saat/.test(tel));
kontrol('birim fiyat KDV hariç', /Birim Fiyat: 247,23 TL \(KDV Hariç\)/.test(tel), tel);
kontrol('hazırlayan satırı', /Hazırlayan: Baskı Hesap Baskı Asistanı/.test(tel));
kontrol('malzeme satırı var', /Malzeme: /.test(tel));

/* ------------------------------------------------------------------ */
bolum('6) 🖥️ Arayüz sözleşmesi (HTML / JS / CSS)');

const html = fs.readFileSync('public/maliyet.html', 'utf8');
const js = fs.readFileSync('public/maliyet.js', 'utf8');
const css = fs.readFileSync('public/maliyet.css', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

const zorunluId = [
  'gramaj', 'gramajKaydirici', 'sure', 'sureKaydirici', 'sureTahmin', 'yazici',
  'yaziciHizli', 'gucW', 'gucManuel', 'filamentCanli', 'filamentManuel',
  'manuelTlKg', 'kwhTl', 'yipranma', 'karKaydirici', 'karCarpanlar',
  'ciktiHammadde', 'ciktiElektrik', 'ciktiAmortisman', 'ciktiNet',
  'fiyatPanosu', 'secilenFiyat', 'secilenKar', 'ctaKart', 'ctaBtn',
  'kopyalaBtn', 'kopyalaDurum', 'varsayimKutu',
];
for (const id of zorunluId) {
  kontrol(`HTML: #${id}`, html.includes(`id="${id}"`));
}

kontrol('HTML: maliyet.css bağlı', /href="\/maliyet\.css"/.test(html));
kontrol('HTML: maliyet.js bağlı', /src="\/maliyet\.js"/.test(html));
kontrol('HTML: erisim.js önce yükleniyor (anahtar)', html.indexOf('/erisim.js') < html.indexOf('/maliyet.js'));
kontrol('HTML: gramaj slider 1–1000', /id="gramajKaydirici"[^>]*min="1"[^>]*max="1000"/.test(html));
kontrol('HTML: varsayılan gramaj 160', /id="gramaj"[^>]*value="160"/.test(html));
kontrol('HTML: varsayılan süre 4 sa', /id="sure"[^>]*value="4"/.test(html));
kontrol('HTML: varsayılan tarife 2.90', /id="kwhTl"[^>]*value="2\.90"/.test(html));
kontrol('HTML: varsayılan yıpranma 3.00', /id="yipranma"[^>]*value="3\.00"/.test(html));
kontrol('HTML: kâr slider %50–%300', /id="karKaydirici"[^>]*min="50"[^>]*max="300"/.test(html));
kontrol('HTML: hızlı çarpan butonları 1.5/2/2.5/3',
  ['1.5', '2', '2.5', '3'].every(c => html.includes(`data-carpan="${c}"`)));
kontrol('HTML: canlı/manuel sekmesi var', html.includes('data-mod="canli"') && html.includes('data-mod="manuel"'));
kontrol('HTML: CTA yeni sekmede açılır', /id="ctaBtn"[^>]*target="_blank"/.test(html));
kontrol('HTML: CTA sponsored rel', /id="ctaBtn"[^>]*rel="noopener sponsored"/.test(html));
kontrol('HTML: mobil viewport meta', /name="viewport"/.test(html));

// JS formülü sunucuyla aynı olmalı (yanıltıcı sapma kabul edilmez).
kontrol('JS: hammadde formülü (g/1000)×₺kg', /\(g \/ 1000\) \* tlKg/.test(js));
kontrol('JS: elektrik formülü (W×sa/1000)×tarife', /\(guc \* sure\) \/ 1000/.test(js));
kontrol('JS: amortisman = sa × ₺/sa', /sure \* yipranma/.test(js));
kontrol('JS: net = üçünün toplamı', /hammadde \+ elektrik \+ amortisman/.test(js));
kontrol('JS: kâr çarpanları 1/2/2.5/3',
  /fiyat\(1\)/.test(js) && /fiyat\(2\)/.test(js) && /fiyat\(2\.5\)/.test(js) && /fiyat\(3\)/.test(js));
kontrol('JS: canlı filament ucu çağrılıyor', /\/api\/baski\/en-ucuz-filamentler/.test(js));
kontrol('JS: yazıcı ucu çağrılıyor', /\/api\/baski\/yazicilar/.test(js));
kontrol('JS: yazıcı seçimi watt dolduruyor', /durum\.gucW = y\.gucW/.test(js));
kontrol('JS: pano yedeği var (clipboard yoksa)', /execCommand\('copy'\)/.test(js));
kontrol('JS: teklif metni başlığı', /3D BASKI FİYAT TEKLİFİ/.test(js));
kontrol('JS: CTA yalnızca canlı modda', /f && durum\.filamentModu === 'canli'/.test(js));
kontrol('JS: slider input olayı bağlı', /addEventListener\('input'/.test(js));

// CSS: mobil kırılımı ve bento
kontrol('CSS: mobil kırılımı (≤920px tek sütun)', /@media \(max-width: 920px\)/.test(css));
kontrol('CSS: bento ızgara', /\.mz-bento\s*\{[^}]*display:\s*grid/s.test(css));
kontrol('CSS: bento mobil (≤560px tek sütun)', /@media \(max-width: 560px\)[\s\S]{0,400}\.mz-bento\s*\{\s*grid-template-columns:\s*1fr/.test(css));
kontrol('CSS: koyu tema desteği', /data-theme="dark"/.test(css));
kontrol('CSS: azaltılmış hareket desteği', /prefers-reduced-motion/.test(css));

// --- Mobil regresyonları (2026-11-04'te ölçülen iki gerçek hata) ---
// 1) `.mz-satır` (noktalı ı) sınıfı HTML'deki `.mz-satir` ile eşleşmiyordu.
kontrol('CSS: .mz-satir yazımı doğru (noktalı ı YOK)',
  /\.mz-satir\s*\{/.test(css) && !/\.mz-satır/.test(css));
// 2) Grid çocuklarında min-width:auto yatay taşma üretiyordu (320px'de 401px).
kontrol('CSS: grid çocukları min-width:0 (taşma koruması)',
  /\.mz-duzen > \*[\s\S]{0,200}min-width:\s*0/.test(css));
kontrol('CSS: girdilerde min-width:0', /input\[type="number"\][^{]*\{[^}]*min-width:\s*0/s.test(css));
// 3) Başlık çubuğu dar ekranda taşıyordu.
kontrol('CSS: başlık taşma koruması (.sayfa-maliyet)', /\.sayfa-maliyet \.menu/.test(css));
kontrol('HTML: body sayfa-maliyet sınıfı', /<body class="sayfa-maliyet">/.test(html));
// 4) Dokunma hedefleri ≥ 40px
kontrol('CSS: mobil dokunma hedefi ≥40px',
  /@media \(max-width: 920px\)[\s\S]{0,600}min-height:\s*40px/.test(css));
kontrol('CSS: mobilde giriş yazı boyutu 16px (iOS zoom)', /font-size:\s*16px/.test(css));

// Ana sayfadan erişim
const anaHtml = fs.readFileSync('public/index.html', 'utf8');
kontrol('ana sayfa menüsünde maliyet bağlantısı', /href="\/maliyet\.html"/.test(anaHtml));

/* ------------------------------------------------------------------ */
bolum('7) 🌐 Sunucu rotaları');

kontrol('server.js: baskiApiBagla import', /import \{ baskiApiBagla \}/.test(server));
kontrol('server.js: baskiApiBagla(app) çağrısı', /baskiApiBagla\(app\)/.test(server));
kontrol('rota: GET /api/baski/yazicilar', /'\/api\/baski\/yazicilar'/.test(fs.readFileSync('src/baskiApi.js', 'utf8')));
kontrol('rota: GET /api/baski/en-ucuz-filamentler', /'\/api\/baski\/en-ucuz-filamentler'/.test(fs.readFileSync('src/baskiApi.js', 'utf8')));
kontrol('rota: POST /api/baski/hesapla', /'\/api\/baski\/hesapla'/.test(fs.readFileSync('src/baskiApi.js', 'utf8')));
kontrol('POST doğrulaması: geçersizde 400', /hesap\.gecerli\)\s*\{[\s\S]{0,80}status\(400\)/.test(fs.readFileSync('src/baskiApi.js', 'utf8')));
kontrol('POST: canlı filament sunucuda tazeleniyor', /filamentId != null/.test(fs.readFileSync('src/baskiApi.js', 'utf8')));

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
