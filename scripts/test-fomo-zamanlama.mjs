/**
 * 🟢 FOMO — "ŞİMDİ AL" Aciliyet Kartı Test Paketi (2026-11-08)
 *
 * Kapsam:
 *  1) Dip fiyat senaryosu → `SIMDI_AL` + `fomo.aktif`, risk %80-95, tasarruf doğru
 *  2) Sahte FOMO önleme: normal/pahalı/cold-start → `fomo.aktif === false`
 *  3) Risk bandı sınırları (80..95, derin dipte 88..94)
 *  4) Sosyal kanıt DÜRÜSTLÜĞÜ: yalnızca gerçek gözlem; veri yoksa satır yok
 *  5) SQLite dip süresi medyanı + son 24 saat gözlem sayısı (gerçek DB)
 *  6) Telegram mesajının EN ÜSTÜNDE aciliyet satırı (yalnızca gerçek fırsatta)
 *  7) İstemci `renderFomoUyarisi` davranışı (gerçek fonksiyon çalıştırılır)
 *  8) CSS / Pulse / responsive / reduced-motion sözleşmeleri
 *
 *   node scripts/test-fomo-zamanlama.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { zamanlamaTahminiYap, fomoMetrikleriUret } from '../src/fiyatZamanlama.js';
import { sonucMesajiOlustur } from '../src/telegramBot.js';
import { addPricePoint, deletePricePoints, getFiyatAnalizi, closeDatabase } from '../src/store.js';

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

const DIP_ANALIZ = {
  bulundu: true,
  yeterliVeri: true,
  gunSayisi: 45,
  veriNoktasi: 12,
  minFiyat90: 750,
  maxFiyat60: 1050,
  ortFiyat30: 920,
  dipSuresiGun: 1.8,
  dipSayisi: 3,
  son24SaatGozlem: 5,
  son7GunGozlem: 12,
};

/* ------------------------------------------------------------------ */
bolum('1) 🟢 Dip fiyat — SIMDI_AL + FOMO metrikleri');

const dip = zamanlamaTahminiYap({ guncelFiyat: 758, analiz: DIP_ANALIZ, magazaId: 'robotistan' });

kontrol('karar SIMDI_AL', dip.karar === 'SIMDI_AL', dip.karar);
kontrol('fomo.aktif true', dip.fomo?.aktif === true);
kontrol('risk %80-95 aralığında',
  dip.fomo.tukenmeRiskiYuzde >= 80 && dip.fomo.tukenmeRiskiYuzde <= 95,
  String(dip.fomo.tukenmeRiskiYuzde));
kontrol('derin dipte risk %88-94 bandında',
  dip.fomo.tukenmeRiskiYuzde >= 88 && dip.fomo.tukenmeRiskiYuzde <= 94,
  String(dip.fomo.tukenmeRiskiYuzde));
kontrol('tasarruf = ortalama − güncel = 162',
  dip.fomo.tasarrufTL === 162, String(dip.fomo.tasarrufTL));
kontrol('dipFiyatTL = 750', dip.fomo.dipFiyatTL === 750, String(dip.fomo.dipFiyatTL));
kontrol('ortalamaFiyatTL = 920', dip.fomo.ortalamaFiyatTL === 920);
kontrol('dip süresi metni 24 saat vurgusu içerir',
  /24 saat/.test(dip.fomo.sureTahminiMetni || ''), dip.fomo.sureTahminiMetni);
kontrol('dip süresi metni gerçek medyanı yazar',
  /1,8 gün/.test(dip.fomo.sureTahminiMetni || ''), dip.fomo.sureTahminiMetni);
kontrol('CTA metni stok aciliyeti içerir',
  /Stoklar Bitmeden/.test(dip.fomo.ctaMetni || ''), dip.fomo.ctaMetni);
kontrol('sosyal kanıt gerçek gözlem sayısını yazar',
  /Son 24 saatte fiyat 5 kez doğrulandı/.test(dip.fomo.sosyalKanitMetni || ''),
  dip.fomo.sosyalKanitMetni);
kontrol('sosyal kanıt "kişi" uydurmaz',
  !/kişi/.test(dip.fomo.sosyalKanitMetni || ''), dip.fomo.sosyalKanitMetni);

// Ortalamadan %15 ucuz (dip değil) → yine de gerçek fırsat, aktif olmalı.
const ortalamaFirsati = zamanlamaTahminiYap({
  guncelFiyat: 510,
  analiz: { ...DIP_ANALIZ, minFiyat90: 500, ortFiyat30: 600, dipSuresiGun: 4, dipSayisi: 1, son24SaatGozlem: 1 },
  magazaId: 'hepsiburada',
});
kontrol('%15 ortalamadan ucuz → fomo.aktif', ortalamaFirsati.fomo?.aktif === true);
kontrol('tasarruf = 90', ortalamaFirsati.fomo.tasarrufTL === 90, String(ortalamaFirsati.fomo.tasarrufTL));
kontrol('risk %80-95 bandında', ortalamaFirsati.fomo.tukenmeRiskiYuzde >= 80 && ortalamaFirsati.fomo.tukenmeRiskiYuzde <= 95);

bolum('2) 🚫 Sahte FOMO önleme — normal / pahalı / veri yok');

const normal = zamanlamaTahminiYap({ guncelFiyat: 930, analiz: DIP_ANALIZ, magazaId: 'trendyol' });
kontrol('normal fiyat → fomo.aktif false', normal.fomo?.aktif === false);
kontrol('normal fiyat → neden açıklanır', typeof normal.fomo?.neden === 'string' && normal.fomo.neden.length > 5);
kontrol('normal fiyat CTA üretmez', normal.fomo?.ctaMetni == null);

const pahali = zamanlamaTahminiYap({ guncelFiyat: 1100, analiz: DIP_ANALIZ, magazaId: 'trendyol' });
kontrol('pahalı ürün → fomo.aktif false', pahali.fomo?.aktif === false);
kontrol('pahalı ürün kararı BEKLE', pahali.karar === 'BEKLE', pahali.karar);

const veriYok = zamanlamaTahminiYap({ guncelFiyat: 400, analiz: { bulundu: false, gunSayisi: 0 }, magazaId: 'x' });
kontrol('cold-start → fomo.aktif false', veriYok.fomo?.aktif === false);
kontrol('cold-start → risk null', veriYok.fomo?.tukenmeRiskiYuzde == null);

// %12 eşiğinin hemen altı (ortalama 1000, fiyat 890 = %11) tetiklenmemeli.
const esikAlti = zamanlamaTahminiYap({
  guncelFiyat: 890,
  analiz: { ...DIP_ANALIZ, minFiyat90: 700, ortFiyat30: 1000, dipSuresiGun: 3 },
  magazaId: null,
});
kontrol('%11 ucuz → fırsat eşiği aşılmadı, fomo pasif', esikAlti.fomo?.aktif === false,
  String(esikAlti.fomo?.neden));

// Sosyal veri yoksa satır üretilmez (uydurma yok).
const sosyalYok = zamanlamaTahminiYap({
  guncelFiyat: 758,
  analiz: { ...DIP_ANALIZ, son24SaatGozlem: 0, dipSayisi: 0, dipSuresiGun: null },
  magazaId: 'robotistan',
});
kontrol('gözlem yoksa sosyalKanitMetni null', sosyalYok.fomo?.sosyalKanitMetni === null);
kontrol('gözlem yoksa incelemeSayisi null', sosyalYok.fomo?.incelemeSayisi === null);
kontrol('gözlem yoksa süre metni yine üretilir',
  /24 saat/.test(sosyalYok.fomo?.sureTahminiMetni || ''));

bolum('3) 📐 Risk bandı — sınırlar ve monotonluk');

let bandHatasi = null;
for (let fiyat = 700; fiyat <= 940; fiyat += 10) {
  const r = fomoMetrikleriUret({
    guncelFiyat: fiyat,
    analiz: { ...DIP_ANALIZ, minFiyat90: 750 },
    dipSeviyede: fiyat <= 750 * 1.015,
    farkOrtalama: (fiyat - 920) / 920,
  });
  if (!r.aktif) continue;
  if (!(r.tukenmeRiskiYuzde >= 80 && r.tukenmeRiskiYuzde <= 95)) {
    bandHatasi = `${fiyat} TL → %${r.tukenmeRiskiYuzde}`;
    break;
  }
}
kontrol('tüm aktif fiyatlarda risk 80-95', bandHatasi === null, bandHatasi || '');

const cokDerin = fomoMetrikleriUret({
  guncelFiyat: 500,
  analiz: { ...DIP_ANALIZ, ortFiyat30: 1200, minFiyat90: 750, dipSuresiGun: 0.5 },
  dipSeviyede: true,
  farkOrtalama: (500 - 1200) / 1200,
});
kontrol('aşırı derin + kısa dipte risk 95 tavanına oturur', cokDerin.tukenmeRiskiYuzde === 95,
  String(cokDerin.tukenmeRiskiYuzde));

const derinOrtalama = fomoMetrikleriUret({
  guncelFiyat: 500,
  analiz: { ...DIP_ANALIZ, ortFiyat30: 1200, minFiyat90: 750, dipSuresiGun: 0.5 },
  dipSeviyede: false,
  farkOrtalama: (500 - 1200) / 1200,
});
kontrol('dip olmayan derin fırsatta risk ≤ 95', derinOrtalama.tukenmeRiskiYuzde <= 95,
  String(derinOrtalama.tukenmeRiskiYuzde));

bolum('4) 🗄️ SQLite — dip süresi medyanı ve son 24 saat gözlem');

const PID = '__TEST_FOMO_DIP__';
deletePricePoints(PID);
const gun = 24 * 3600 * 1000;
// 2026-11-12 DÜZELTME (test kırılganlığı): `Date.now()` doğrudan kullanılınca
// gece yarısına yakın (UTC) çalışan testte `+1s/+2s` kaymaları ertesi güne
// taşıyor, dip bloğu 3 güne çıkıp medyan 2.5 oluyordu (yanlış alarm).
// Gözlemleri bugünün UTC gün ortasına sabitleyerek gün anahtarları deterministik olur.
const bugunUtc = new Date();
const simdi = Date.UTC(
  bugunUtc.getUTCFullYear(), bugunUtc.getUTCMonth(), bugunUtc.getUTCDate(),
  12, 0, 0,
);
const kaydet = (gunOnce, fiyat, saatKaymasi = 0) =>
  addPricePoint({
    productId: PID,
    site: 'robotistan',
    price: fiyat,
    netPrice: fiyat,
    ts: new Date(simdi - gunOnce * gun + saatKaymasi).toISOString(),
  });

// 10 günlük gerçek seri: iki ayrı 2 günlük dip bloğu → medyan 2 gün.
kaydet(10, 1000);
kaydet(9, 760);
kaydet(8, 770);
kaydet(7, 900);
kaydet(6, 950);
kaydet(5, 980);
kaydet(4, 940);
kaydet(3, 900);
kaydet(1, 758);
kaydet(0, 758, 3600 * 1000);
kaydet(0, 758, 2 * 3600 * 1000);

const analizDb = getFiyatAnalizi(PID, null, null);
kontrol('DB analizi bulundu', analizDb.bulundu === true);
kontrol('minFiyat90 = 758', analizDb.minFiyat90 === 758, String(analizDb.minFiyat90));
kontrol('dipSayisi = 2 blok', analizDb.dipSayisi === 2, String(analizDb.dipSayisi));
kontrol('dipSuresiGun medyanı = 2', analizDb.dipSuresiGun === 2, String(analizDb.dipSuresiGun));
kontrol('son24SaatGozlem gerçek sayı (≥2)', analizDb.son24SaatGozlem >= 2, String(analizDb.son24SaatGozlem));
kontrol('son7GunGozlem ≥ son24SaatGozlem', analizDb.son7GunGozlem >= analizDb.son24SaatGozlem);

const dbIleKarar = zamanlamaTahminiYap({
  guncelFiyat: 758,
  analiz: analizDb,
  magazaId: 'robotistan',
});
kontrol('gerçek DB verisiyle SIMDI_AL', dbIleKarar.karar === 'SIMDI_AL', dbIleKarar.karar);
kontrol('gerçek DB verisiyle fomo.aktif', dbIleKarar.fomo?.aktif === true);
kontrol('DB sosyal kanıtı gerçek doğrulama sayısı içerir',
  /kez doğrulandı/.test(dbIleKarar.fomo?.sosyalKanitMetni || ''),
  dbIleKarar.fomo?.sosyalKanitMetni);

deletePricePoints(PID);
kontrol('test verisi temizlendi', getFiyatAnalizi(PID, null, null).bulundu === false);

bolum('5) 📲 Telegram — mesajın en üstünde aciliyet satırı');

const dipSonuc = {
  kaynak: { urun: 'Creality Ender PLA Gri 1kg' },
  ozet: { bulunanSiteSayisi: 5, stoktaVarSayisi: 4, zamanlamaTavsiyesi: dip },
  sonuclar: [
    {
      site: 'robotistan', siteName: 'Robotistan', status: 'found', enUcuz: true,
      product: { title: 'Creality Ender PLA Gri', inStock: true, pricing: { toplam: 758, kargo: { ucret: 0 } }, url: 'https://example.com/urun' },
    },
    {
      site: 'trendyol', siteName: 'Trendyol', status: 'found',
      product: { title: 'Creality Ender PLA Gri', inStock: true, pricing: { toplam: 899, kargo: { ucret: 0 } }, url: 'https://example.com/urun2' },
    },
  ],
};

const mesaj = sonucMesajiOlustur(dipSonuc);
kontrol('Telegram mesajı 🟢 ŞİMDİ AL ile BAŞLAR',
  mesaj.startsWith('🟢 <b>ŞİMDİ AL:</b>'), JSON.stringify(mesaj.slice(0, 60)));
kontrol('Telegram satırı 60 gün dip vurgusu içerir', /günün dip seviyesinde/.test(mesaj));
kontrol('Telegram satırı risk yüzdesi içerir', /tükenme\/artış ihtimali %\d+/.test(mesaj), '');
kontrol('Telegram satırı dip fiyatı içerir', /758/.test(mesaj.slice(0, 200)));

const normalMesaj = sonucMesajiOlustur({
  ...dipSonuc,
  ozet: { ...dipSonuc.ozet, zamanlamaTavsiyesi: normal },
});
kontrol('normal üründe FOMO başlığı YOK',
  !normalMesaj.startsWith('🟢 <b>ŞİMDİ AL:</b>'), JSON.stringify(normalMesaj.slice(0, 40)));
kontrol('normal üründe risk satırı YOK', !/tükenme\/artış ihtimali/.test(normalMesaj));

bolum('6) 🖥️ İstemci renderFomoUyarisi — gerçek fonksiyon davranışı');

const appSrc = oku('public/app.js');
const fnMatch = appSrc.match(/function renderFomoUyarisi\([\s\S]*?\n\}/);
kontrol('renderFomoUyarisi kaynakta bulundu', !!fnMatch);

let render = () => '';
if (fnMatch) {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const tl = (n) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  const SITE_ADLARI = { robotistan: 'Robotistan' };
  render = new Function('esc', 'tl', 'SITE_ADLARI', `${fnMatch[0]}\nreturn renderFomoUyarisi;`)(esc, tl, SITE_ADLARI);
}

const enUcuz = {
  site: 'robotistan', siteName: 'Robotistan',
  product: {
    url: 'https://example.com/urun',
    afiliyeUrl: 'https://example.com/urun?ref=eun',
    pricing: { toplam: 758 },
  },
};

const html = render(dip, enUcuz);
kontrol('aktif fırsatta kart HTML üretilir', html.includes('fomo-kart'));
kontrol('CTA afiliye linkini kullanır', html.includes('https://example.com/urun?ref=eun'));
kontrol('CTA yeni sekmede açılır', html.includes('target="_blank"') && html.includes('rel="noopener sponsored"'));
kontrol('kart risk yüzdesini gösterir', html.includes(`%${dip.fomo.tukenmeRiskiYuzde}`));
kontrol('kart güncel fiyatı gösterir (ödeyeceği tutar)', html.includes('758,00 TL'));
kontrol('tarihi dip ayrıca yazılır', html.includes('tarihi dip') && html.includes('750,00 TL'));
kontrol('kart mağaza adını gösterir', html.includes('Robotistan'));
kontrol('kart dip notunda gerçek gözlem sayısı', /11 gözlem|12 gözlem/.test(html), html.slice(0, 0));
kontrol('kart canlı nabız öğesi içerir', html.includes('fomo-beacon'));

kontrol('normal üründe HTML boş', render(normal, enUcuz) === '');
kontrol('bayat fiyat (tazeleme) kart basmaz',
  render(dip, { site: 'robotistan', product: { afiliyeUrl: 'https://x/1', pricing: { toplam: 900 } } }) === '');
kontrol('fiyat yoksa HTML boş', render(dip, { site: 'x', product: { pricing: {} } }) === '');
kontrol('URL yoksa HTML boş', render(dip, { site: 'x', product: { pricing: { toplam: 758 } } }) === '');
kontrol('fomo.aktif false ise HTML boş', render({ ...dip, fomo: { ...dip.fomo, aktif: false } }, enUcuz) === '');
kontrol('karar SIMDI_AL değilse HTML boş', render({ ...dip, karar: 'BEKLE' }, enUcuz) === '');
kontrol('sosyal veri yoksa sosyal satır basılmaz', !render(sosyalYok, enUcuz).includes('fomo-sosyal'));

kontrol('FOMO kartı iki render noktasında da kullanılır',
  (appSrc.match(/fomoIleBasla\(/g) || []).length >= 3,
  String((appSrc.match(/fomoIleBasla\(/g) || []).length));
kontrol('filtreli görünümde FOMO basılmaz', /filtre !== 'hepsi'/.test(appSrc));

bolum('7) 🎨 CSS — pulse, zümrüt ışıma, mobil, reduced-motion');

const css = oku('public/style.css');
kontrol('fomo-pulse animasyonu var', /@keyframes fomo-pulse/.test(css));
kontrol('pulse başlangıç gölgesi rgba(16,185,129,0.7)', /rgba\(16,\s*185,\s*129,\s*0\.7\)/.test(css));
kontrol('zümrüt çerçeve 1.5px #10B981', /border:\s*1\.5px solid #10B981/.test(css));
kontrol('kart grid tam genişlik', /\.fomo-kart[\s\S]{0,200}grid-column:\s*1 \/ -1/.test(css));
kontrol('koyu tema zümrüt ışıma', /html\[data-theme="dark"\] \.fomo-kart/.test(css));
kontrol('mobil duyarlı tasarım', /@media \(max-width: 640px\)[\s\S]*?\.fomo-kart/.test(css));
kontrol('hareket azaltma desteği', /prefers-reduced-motion[\s\S]*?\.fomo-beacon/.test(css));
kontrol('CTA degrade yeşil buton', /\.fomo-cta[\s\S]{0,300}linear-gradient/.test(css));
kontrol('ilk 2 saniyede ışıma animasyonu', /fomo-ilk-isima 2s/.test(css));

/* ------------------------------------------------------------------ */
closeDatabase();

console.log(`\n${gecen}/${toplam} test geçti`);
if (hatalar.length) {
  console.log(`\nBaşarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
