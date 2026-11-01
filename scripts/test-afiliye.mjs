/**
 * Satış ortaklığı (affiliate) testleri — 2026-10-28
 *
 * Kapsam:
 *  1) Parametre ekleme + mevcut sorgunun korunması
 *  2) Token yoksa linkin DEĞİŞMEMESİ (uydurma referans yok)
 *  3) Yönlendirme şablonu ({url}, {token})
 *  4) Siteye özel şablonun ağ şablonundan önce gelmesi
 *  5) TARAFSIZLIK: fiyat/sıralama alanlarına dokunulmaması
 *  6) Ağ kapalıyken / genel anahtar kapalıyken linkin sade kalması
 *  7) Ayar kaydetme/yükleme (DB) + bilinmeyen ağ reddi
 *  8) Tıklama sayacı (gerçek veri dosyasına yazmadan, geçici yolla)
 *
 * Not: Bu test CANLI İNTERNETE çıkmaz ve gerçek ayarları bozmaz — kaydettiği
 * değerleri sonunda eski hâline döndürür.
 */
import { afiliyeLink, afiliyeKaydet, afiliyeAyarlari, afiliyeOzet, AG_BILGILERI } from '../src/afiliye.js';

let gecen = 0;
let toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
}

const ESKI = afiliyeAyarlari();

/* ---------- 1) Parametre modu ---------- */
const a1 = {
  etkin: true,
  aglar: { amazon: { etkin: true, parametre: 'tag', token: 'ornek-21', sablon: '' } },
  siteAg: {},
  siteSablon: {},
};
kontrol('Amazon tag eklenir',
  afiliyeLink('amazon', 'https://www.amazon.com.tr/dp/B0ABC123', a1) === 'https://www.amazon.com.tr/dp/B0ABC123?tag=ornek-21');
kontrol('mevcut sorgu korunur',
  afiliyeLink('amazon', 'https://www.amazon.com.tr/dp/B0?th=1&psc=1', a1) ===
  'https://www.amazon.com.tr/dp/B0?th=1&psc=1&tag=ornek-21');
kontrol('tanımsız site değişmez',
  afiliyeLink('vatan', 'https://www.vatanbilgisayar.com/x', a1) === 'https://www.vatanbilgisayar.com/x');
kontrol('geçersiz URL dokunulmaz',
  afiliyeLink('amazon', 'bu bir url değil', a1) === 'bu bir url değil');

/* ---------- 2) Eksik yapılandırma → sade link (dürüstlük) ---------- */
const a2 = { etkin: true, aglar: { amazon: { etkin: true, parametre: 'tag', token: '', sablon: '' } }, siteAg: {}, siteSablon: {} };
kontrol('token yoksa link DEĞİŞMEZ',
  afiliyeLink('amazon', 'https://www.amazon.com.tr/dp/B0', a2) === 'https://www.amazon.com.tr/dp/B0');
const a2b = { etkin: true, aglar: { trendyol: { etkin: true, parametre: '', token: 'gizli', sablon: '' } }, siteAg: {}, siteSablon: {} };
kontrol('parametre adı yoksa link DEĞİŞMEZ (uydurma yok)',
  afiliyeLink('trendyol', 'https://www.trendyol.com/x-p-1', a2b) === 'https://www.trendyol.com/x-p-1');

/* ---------- 3) Yönlendirme şablonu ---------- */
const a3 = {
  etkin: true,
  aglar: { gelirortaklari: { etkin: true, parametre: '', token: 'REF9', sablon: 'https://ag.example.com/git?u={url}&ref={token}' } },
  siteAg: {},
  siteSablon: {},
};
const l3 = afiliyeLink('3dmarketim', 'https://www.3dmarketim.com/urun/x', { ...a3, siteAg: { '3dmarketim': 'gelirortaklari' } });
kontrol('şablon {url} kodlanır', l3.startsWith('https://ag.example.com/git?u=https%3A%2F%2Fwww.3dmarketim.com%2Furun%2Fx'), l3);
kontrol('şablon {token} doldurulur', l3.includes('ref=REF9'), l3);

/* ---------- 4) Site şablonu ağ şablonundan önce ---------- */
const a4 = {
  ...a3,
  siteAg: { '3dmarketim': 'gelirortaklari' },
  siteSablon: { '3dmarketim': 'https://ozel.example.com/?hedef={url}' },
};
kontrol('siteye özel şablon öncelikli',
  afiliyeLink('3dmarketim', 'https://www.3dmarketim.com/u', a4).startsWith('https://ozel.example.com/?hedef='));

/* ---------- 5) Tarafsızlık: fiyat/sıralama dokunulmaz ---------- */
const urunler = [
  { site: 'trendyol', fiyat: 100, sira: 1 },
  { site: 'amazon', fiyat: 90, sira: 2 },
];
const once = JSON.stringify(urunler);
const a5 = { etkin: true, aglar: { amazon: { etkin: true, parametre: 'tag', token: 'x-21', sablon: '' } }, siteAg: {}, siteSablon: {} };
for (const u of urunler) u.link = afiliyeLink(u.site, `https://ornek.com/${u.site}`, a5);
kontrol('fiyat ve sıralama alanları aynı kalır',
  JSON.stringify(urunler.map(u => ({ site: u.site, fiyat: u.fiyat, sira: u.sira }))) === once);
kontrol('yalnızca amazon linki süslendi', urunler[1].link.includes('tag=x-21') && !urunler[0].link.includes('tag='));

/* ---------- 6) Ana anahtar kapalı ---------- */
kontrol('etkin=false → sade link',
  afiliyeLink('amazon', 'https://www.amazon.com.tr/dp/B0', { ...a1, etkin: false }) === 'https://www.amazon.com.tr/dp/B0');
kontrol('ağ kapalı → sade link',
  afiliyeLink('amazon', 'https://www.amazon.com.tr/dp/B0',
    { etkin: true, aglar: { amazon: { etkin: false, parametre: 'tag', token: 'x-21', sablon: '' } }, siteAg: {}, siteSablon: {} })
  === 'https://www.amazon.com.tr/dp/B0');

/* ---------- 7) Kaydet / oku ---------- */
try {
  afiliyeKaydet({
    etkin: true,
    aglar: { amazon: { etkin: true, parametre: 'tag', token: 'test-21', sablon: '' }, bilinmeyenag: { etkin: true, token: 'x' } },
    siteSablon: { '3dmarketim': 'https://ag.example.com/?u={url}' },
  });
  const y = afiliyeAyarlari();
  kontrol('kaydedilen token okunur', y.aglar.amazon.token === 'test-21');
  kontrol('bilinmeyen ağ yazılmaz', y.aglar.bilinmeyenag === undefined);
  kontrol('site şablonu kaydedilir', y.siteSablon['3dmarketim']?.sablon === 'https://ag.example.com/?u={url}',
    JSON.stringify(y.siteSablon['3dmarketim']));

  // Kayıtlı ayarla gerçek link
  kontrol('kayıtlı ayar linke uygulanır',
    afiliyeLink('amazon', 'https://www.amazon.com.tr/dp/B0').includes('tag=test-21'));

  const ozet = afiliyeOzet();
  kontrol('özet token maskeler', /…/.test(ozet.aglar.find(a => a.id === 'amazon').tokenMaskeli));
  kontrol('özet token düz metni vermez', !JSON.stringify(ozet).includes('test-21'));
  kontrol('özet durum "aktif"', ozet.durum === 'aktif', ozet.durum);
  kontrol('komisyon aralığı bilgisi var', AG_BILGILERI.trendyol.komisyon.includes('%1,5'));
} finally {
  // Eski ayarlara dön (gerçek yapılandırmayı bozmayalım)
  afiliyeKaydet({
    etkin: ESKI.etkin,
    aglar: Object.fromEntries(Object.entries(ESKI.aglar).map(([k, v]) => [k, { etkin: v.etkin, parametre: v.parametre, token: v.token, sablon: v.sablon }])),
    siteAg: ESKI.siteAg,
    siteSablon: ESKI.siteSablon,
  });
}

kontrol('test sonrası ayarlar geri yüklendi',
  afiliyeAyarlari().aglar.amazon.token === ESKI.aglar.amazon.token);

/* ---------- 8) Sepet teklifleri referansı taşır, fiyat değişmez ---------- */
import { teklifleriCikar, gruplariOlustur } from '../src/basketOptimizer.js';
const sahteKarsilastirma = {
  sonuclar: [
    { status: 'found', site: 'robo90', siteName: 'Robo90', renkAyni: true,
      product: { url: 'https://www.robo90.com/u1', afiliyeUrl: 'https://ag.example.com/git?u=x', sellingPrice: 120, pricing: { araToplam: 120, toplam: 120 } } },
    { status: 'found', site: 'filamentsan', siteName: 'FilamentSan', renkAyni: true,
      product: { url: 'https://filamentsan.com/u2', sellingPrice: 95, pricing: { araToplam: 95, toplam: 95 } } },
  ],
};
const teklifler = teklifleriCikar(sahteKarsilastirma);
kontrol('sepet teklifi fiyatı değişmez', teklifler.find(t => t.site === 'robo90')?.urunFiyati === 120);
kontrol('referanssız sitede afiliyeUrl = url',
  teklifler.find(t => t.site === 'filamentsan')?.afiliyeUrl === 'https://filamentsan.com/u2');

// Referans, sepet teklifinde HER ZAMAN güncel ayardan üretilir (önbellekteki bayat
// değere güvenilmez):
try {
  afiliyeKaydet({
    etkin: true,
    aglar: { gelirortaklari: { etkin: true, token: 'TST', sablon: 'https://ag.example.com/git?u={url}&ref={token}' } },
    siteAg: { robo90: 'gelirortaklari' },
    siteSablon: {},
  });
  const taze = teklifleriCikar(sahteKarsilastirma);
  kontrol('sepet teklifi güncel referansı üretir',
    taze.find(t => t.site === 'robo90')?.afiliyeUrl?.startsWith('https://ag.example.com/git?u='));
  kontrol('bayat afiliyeUrl önbellekten kullanılmaz',
    taze.find(t => t.site === 'robo90')?.afiliyeUrl !== 'https://ag.example.com/git?u=x');
  kontrol('fiyat yine aynı', taze.find(t => t.site === 'robo90')?.urunFiyati === 120);
} finally {
  afiliyeKaydet({
    etkin: ESKI.etkin,
    aglar: Object.fromEntries(Object.entries(ESKI.aglar).map(([k, v]) => [k, { etkin: v.etkin, parametre: v.parametre, token: v.token, sablon: v.sablon }])),
    siteAg: ESKI.siteAg,
    siteSablon: ESKI.siteSablon,
  });
}

// Sepet grubu, teklifteki referansı korur (fiyat dokunulmaz).
const gruplar = gruplariOlustur(
  [
    { id: 'a', ad: 'A', teklifler },
    { id: 'b', ad: 'B', teklifler },
  ],
  { a: 'robo90', b: 'filamentsan' },
);
const roboUrun = gruplar?.gruplar?.find(g => g.site === 'robo90')?.urunler?.[0];
kontrol('sepet grubunda referanssız link = url', roboUrun?.afiliyeUrl === 'https://www.robo90.com/u1');
kontrol('sepet grubunda fiyat korunur', roboUrun?.fiyat === 120);

// Referanslı teklifle grup kurulduğunda da fiyat aynı kalır
const referansliTeklifler = teklifler.map(t => (t.site === 'robo90' ? { ...t, afiliyeUrl: 'https://ag.example.com/git?u=x' } : t));
const grup2 = gruplariOlustur(
  [{ id: 'a', ad: 'A', teklifler: referansliTeklifler }, { id: 'b', ad: 'B', teklifler: referansliTeklifler }],
  { a: 'robo90', b: 'filamentsan' },
);
const robo2 = grup2?.gruplar?.find(g => g.site === 'robo90')?.urunler?.[0];
kontrol('sepet grubu referanslı linki taşır', robo2?.afiliyeUrl === 'https://ag.example.com/git?u=x');
kontrol('referanslı grupta fiyat aynı', robo2?.fiyat === 120);

/* ---------- 9) Boş url güvenli ---------- */
kontrol('boş url güvenli', afiliyeLink('amazon', '') === '');

/* ---------- 12) {url} ZORUNLU DEĞİL: teklif (offer) linkleri ---------- */
// Kullanıcı bildirimi (2026-10-29): ağ teklif linkleri ürün adresi almaz.
// ör. https://ad.reklm.com/aff_c?offer_id=62376&aff_id=39761
const TEKLIF = 'https://ad.reklm.com/aff_c?offer_id=62376&aff_id=39761';
const aTeklif = {
  etkin: true,
  aglar: {},
  siteAg: {},
  siteSablon: { flo: { sablon: TEKLIF, hedefParametre: '', token: '' } },
};
const teklifLink = afiliyeLink('flo', 'https://www.flo.com.tr/urun/ayakkabi', aTeklif);
kontrol('{url} olmayan teklif linki kabul edilir (boş dönmez)',
  teklifLink === TEKLIF, teklifLink);
kontrol('teklif linki olduğu gibi korunur (parametre uydurulmaz)',
  !teklifLink.includes('flo.com.tr'), teklifLink);

/* ---------- 13) Hedef parametresi: ürün adresi parametreye eklenir ---------- */
const aHedef = {
  etkin: true,
  aglar: {},
  siteAg: {},
  siteSablon: { flo: { sablon: TEKLIF, hedefParametre: 'url', token: '' } },
};
const hedefliLink = afiliyeLink('flo', 'https://www.flo.com.tr/urun/ayakkabi', aHedef);
kontrol('hedef parametresi eklenir', hedefliLink.startsWith(TEKLIF + '&url='), hedefliLink);
kontrol('ürün adresi kodlanır', hedefliLink.includes(encodeURIComponent('https://www.flo.com.tr/urun/ayakkabi')));
kontrol('mevcut parametreler korunur', hedefliLink.includes('offer_id=62376') && hedefliLink.includes('aff_id=39761'));

/* ---------- 14) Site kimliği büyük harf (FLO) eşleşir ---------- */
try {
  afiliyeKaydet({
    etkin: true,
    aglar: {},
    siteSablon: { FLO: { sablon: TEKLIF, hedefParametre: '', token: '' } },
  });
  const kucuk = afiliyeAyarlari().siteSablon.flo;
  kontrol('site kimliği küçük harfe çevrilir', !!kucuk, JSON.stringify(Object.keys(afiliyeAyarlari().siteSablon)));
  kontrol('küçük harfli kimlikle link üretilir',
    afiliyeLink('flo', 'https://www.flo.com.tr/u') === TEKLIF);
  kontrol('büyük harfli kimlik de eşleşir',
    afiliyeLink('FLO', 'https://www.flo.com.tr/u') === TEKLIF);

  const ozet = afiliyeOzet();
  kontrol('site şablonu listede görünür', (ozet.siteSablonlari || []).some(x => x.site === 'flo'));
  kontrol('teklif linki "teklif" olarak etiketlenir',
    (ozet.siteSablonlari || []).find(x => x.site === 'flo')?.sablonTipi === 'teklif',
    JSON.stringify((ozet.siteSablonlari || []).find(x => x.site === 'flo')?.sablonTipi));
  kontrol('site şablonu varsa durum aktif', ozet.durum === 'aktif', ozet.durum);
} finally {
  afiliyeKaydet({
    etkin: ESKI.etkin,
    aglar: Object.fromEntries(Object.entries(ESKI.aglar).map(([k, v]) => [k, { etkin: v.etkin, parametre: v.parametre, token: v.token, sablon: v.sablon }])),
    siteAg: ESKI.siteAg,
    siteSablon: ESKI.siteSablon,
  });
}

/* ---------- 15) Şablon tipi ayrımı (ürün / parametre / teklif) ---------- */
const aTip = {
  etkin: true, aglar: {}, siteAg: {},
  siteSablon: {
    urunlu: { sablon: 'https://ag.example.com/?u={url}', hedefParametre: '', token: '' },
    parametreli: { sablon: 'https://ag.example.com/?o=1', hedefParametre: 'target', token: '' },
    teklifli: { sablon: 'https://ag.example.com/?o=1', hedefParametre: '', token: '' },
  },
};
kontrol('{url} → ürün bazlı', afiliyeLink('urunlu', 'https://x.test/p', aTip).includes('u=https%3A%2F%2Fx.test%2Fp'));
kontrol('hedef parametre → parametreli', afiliyeLink('parametreli', 'https://x.test/p', aTip).includes('target=https%3A%2F%2Fx.test%2Fp'));
kontrol('ikisi de yok → teklif linki', afiliyeLink('teklifli', 'https://x.test/p', aTip) === 'https://ag.example.com/?o=1');

/* ---------- 16) Arayüz: {url} zorunluluğu kaldırıldı ---------- */
const fsMod = await import('node:fs');
const ayarJs = fsMod.readFileSync('public/afiliye-ayar.js', 'utf8');
kontrol('eski katı hata mesajı kaldırıldı', !/yer tutucusunu içermeli/.test(ayarJs));
kontrol('geçerli adres kontrolü var', /https\?:\\\/\\\//.test(ayarJs) || /https\?:/.test(ayarJs));
kontrol('hedef parametresi alanı var', /afiliyeHedefParametre/.test(ayarJs));
// Not: Türkçe "İ" (U+0130) JS'in /i bayrağıyla eşleşmez (projedeki toLowerTr sorunu);
// bu yüzden "İ" içermeyen bir parça aranır.
kontrol('teklif linki kullanıcıya açıklanıyor', /sayfasına gider/.test(ayarJs));
const ayarHtml = fsMod.readFileSync('public/ayarlar.html', 'utf8');
kontrol('HTML’de hedef parametresi alanı var', /id="afiliyeHedefParametre"/.test(ayarHtml));
kontrol('HTML’de offer_id örneği var', /offer_id/.test(ayarHtml));

console.log(`AFILIYE ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);
