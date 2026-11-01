/**
 * Barkod tarayıcı — raf fiyatı akışı testleri (2026-10-28)
 *
 * İki ayrı sorunu kapsar:
 *  1) Kamera geri çağrısı raf fiyatını AÇIKÇA iletmeli (raporun işaret ettiği satır).
 *  2) Türkçe fiyat yazımı doğru okunmalı. Eski hâlde `type="number"` yüzünden
 *     "4.500" → 4,5 TL, "4500,50" → boş (raf fiyatı kayboluyordu).
 *
 * Yöntem: tarayıcı.js'i jsdom olmadan, küçük bir DOM taklidiyle yükler ve
 * `rafFiyatOku` fonksiyonunu doğrudan sınar. Ağa çıkmaz.
 */
import fs from 'node:fs';

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

const kaynak = fs.readFileSync('public/tarayici.js', 'utf8');

/* ---- 1) rafFiyatOku'yu izole et ve çalıştır ---- */
const bas = kaynak.indexOf('function rafFiyatOku(deger) {');
const son = kaynak.indexOf('/** Input alanından raf fiyatını okur');
if (bas < 0 || son < 0) { console.log('  ✗ rafFiyatOku bulunamadı'); process.exit(1); }
const govde = kaynak.slice(bas, son);
// eslint-disable-next-line no-new-func
const rafFiyatOku = new Function(govde + '\nreturn rafFiyatOku;')();

const beklentiler = [
  // [girdi, beklenen, açıklama]
  ['4299', 4299, 'düz tam sayı'],
  ['4.299', 4299, 'binlik nokta (Türkçe)'],
  ['4.299,90', 4299.90, 'binlik nokta + ondalık virgül'],
  ['4299,90', 4299.90, 'ondalık virgül'],
  ['4299.90', 4299.90, 'ondalık nokta'],
  ['4,299.90', 4299.90, 'İngiliz biçimi'],
  ['1.500.000', 1500000, 'çoklu binlik ayırıcı'],
  ['4299 TL', 4299, 'para birimi eki'],
  ['₺4.299,90', 4299.90, 'sembol önde'],
  ['  4.299,90  ', 4299.90, 'boşluklu'],
  ['4500,50', 4500.50, 'virgüllü ondalık (eskiden BOŞ dönüyordu)'],
  ['4.500', 4500, 'binlik nokta (eskiden 4,5 dönüyordu)'],
  ['0', null, 'sıfır geçersiz'],
  ['', null, 'boş'],
  ['   ', null, 'yalnız boşluk'],
  ['abc', null, 'harf'],
  ['TL', null, 'yalnız para birimi'],
  [null, null, 'null'],
  [undefined, null, 'undefined'],
  ['-500', null, 'negatif'],
  ['999999999999', null, 'aşırı büyük'],
  [4299, 4299, 'sayı olarak verilirse'],
];

for (const [girdi, beklenen, aciklama] of beklentiler) {
  const s = rafFiyatOku(girdi);
  kontrol(`rafFiyatOku(${JSON.stringify(girdi)}) = ${beklenen} — ${aciklama}`, s === beklenen, `bulunan: ${s}`);
}

/* ---- 2) Kamera geri çağrısı raf fiyatını iletiyor mu ---- */
const kameraBlok = kaynak.slice(kaynak.indexOf('barkodKameraBaslat'), kaynak.indexOf("const kameraBaslat ="));
kontrol('kamera çağrısı 2. parametreyi veriyor',
  /barkodAraBaslat\(temiz,\s*rafFiyatAl\('rafFiyatBarkod'\)\)/.test(kameraBlok),
  kameraBlok.match(/barkodAraBaslat\([^)]*\)/)?.[0]);
kontrol('kamera çağrısı eski hâle (tek parametre) dönmemiş',
  !/barkodAraBaslat\(temiz\)\s*;/.test(kameraBlok));

/* ---- 3) Elle giriş de Türkçe ayrıştırıcıyı kullanıyor ---- */
const elleBlok = kaynak.slice(kaynak.indexOf("barkodAraBtn.addEventListener"), kaynak.indexOf('const barkodElle ='));
kontrol('elle giriş rafFiyatOku kullanıyor', /rafFiyatOku\(rafHam\)/.test(elleBlok));
kontrol('elle giriş geçersiz fiyatı sessizce yutmuyor', /rafFiyatOku|okunamadı/.test(elleBlok) && /return barkodHataGoster/.test(elleBlok));

/* ---- 4) barkodAraBaslat yedeği de Türkçe ayrıştırıcıyla ---- */
kontrol('barkodAraBaslat yedeği rafFiyatAl kullanıyor', /const raf = rafFiyat \?\? rafFiyatAl\('rafFiyatBarkod'\)/.test(kaynak));
kontrol('eski Number(...) yedeği kalmadı', !/Number\(document\.getElementById\('rafFiyatBarkod'\)/.test(kaynak));

/* ---- 5) HTML: type=number kalmadı (virgül girilebilsin) ---- */
const html = fs.readFileSync('public/index.html', 'utf8');
const rafBarkod = (html.match(/<input[^>]*id="rafFiyatBarkod"[^>]*>/) || [''])[0];
const rafElle = (html.match(/<input[^>]*id="rafFiyatElle"[^>]*>/) || [''])[0];
kontrol('rafFiyatBarkod type="text"', /type="text"/.test(rafBarkod), rafBarkod);
kontrol('rafFiyatBarkod inputmode="decimal"', /inputmode="decimal"/.test(rafBarkod));
kontrol('rafFiyatBarkod type="number" DEĞİL', !/type="number"/.test(rafBarkod));
kontrol('rafFiyatElle type="text"', /type="text"/.test(rafElle), rafElle);
kontrol('rafFiyatElle inputmode="decimal"', /inputmode="decimal"/.test(rafElle));

/* ---- 6) Tasarruf metni mantığı (kart) ---- */
const tmBas = kaynak.indexOf('function tasarrufMetni');
const tmSon = kaynak.indexOf('function barkodSonucGoster');
const tl = (n) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
// eslint-disable-next-line no-new-func
const tasarrufMetni = new Function('tl', kaynak.slice(tmBas, tmSon) + '\nreturn tasarrufMetni;')(tl);

const t1 = tasarrufMetni(4500, 4950);
kontrol('internet ucuzsa tasarruf kâr gösterir', t1?.tur === 'iyi' && t1.metin.includes('450,00'), JSON.stringify(t1));
const t2 = tasarrufMetni(5000, 4950);
kontrol('raf ucuzsa "raf avantajı" gösterir', t2?.tur === 'kotu', JSON.stringify(t2));
const t3 = tasarrufMetni(4950, 4950);
kontrol('eşitse "fiyatlar aynı"', t3?.tur === 'notr', JSON.stringify(t3));
kontrol('raf fiyatı yoksa tasarruf yok', tasarrufMetni(4500, null) === null);
kontrol('internet fiyatı yoksa tasarruf yok', tasarrufMetni(null, 4500) === null);

/* ---- 7) Kamera akışı uçtan uca: raf fiyatı karta yansıyor mu (DOM taklidi) ---- */
// barkodSonucGoster'i sahte DOM ile çalıştır
const el = (id) => ({ id, hidden: false, innerHTML: '', textContent: '', scrollIntoView() {} });
const dom = {
  barkodSonuc: el('barkodSonuc'), barkodOzet: el('barkodOzet'), barkodKartlar: el('barkodKartlar'),
};
const sahteSonuc = {
  barkod: '8691234567890',
  urun: 'Test Ürün',
  barkodGecerli: true,
  ozet: { enUcuzFiyat: 4500, enUcuzSite: 'Robo90', tarananSite: 12, toplamSureMs: 4000 },
  sonuclar: [{
    site: 'robo90', siteName: 'Robo90', status: 'found', enUcuz: true, barkodDogrulandi: true,
    product: { title: 'Test Ürün', url: 'https://x/y', sellingPrice: 4500, pricing: { toplam: 4500, kargo: {} } },
  }],
};
const gsBas = kaynak.indexOf('function barkodSonucGoster');
const gsSon = kaynak.indexOf('/* --------------------------- görsel arama');
// eslint-disable-next-line no-new-func
const barkodSonucGoster = new Function('document', 'esc', 'tl', 'tasarrufMetni',
  kaynak.slice(gsBas, gsSon) + '\nreturn barkodSonucGoster;')(
  { getElementById: (id) => dom[id] || el(id) },
  (s) => String(s ?? ''),
  tl,
  tasarrufMetni,
);

barkodSonucGoster(sahteSonuc, 4950);
kontrol('raf fiyatı kartta görünüyor', dom.barkodOzet.innerHTML.includes('Mağaza raf fiyatı'));
kontrol('tasarruf kutusu çizildi', dom.barkodOzet.innerHTML.includes('💰 Tasarruf'));
kontrol('tasarruf tutarı doğru (450,00)', dom.barkodOzet.innerHTML.includes('450,00'), dom.barkodOzet.innerHTML.match(/Tasarruf[\s\S]{0,120}/)?.[0]?.replace(/\s+/g, ' '));

// Raf fiyatı verilmezse kutu ÇIKMAMALI
dom.barkodOzet.innerHTML = '';
barkodSonucGoster(sahteSonuc, null);
kontrol('raf fiyatı yoksa tasarruf kutusu yok', !dom.barkodOzet.innerHTML.includes('Tasarruf'));
kontrol('raf fiyatı yoksa raf kutusu yok', !dom.barkodOzet.innerHTML.includes('Mağaza raf fiyatı'));

/* ---- 8) Türkçe yazımla uçtan uca ---- */
dom.barkodOzet.innerHTML = '';
const turkceRaf = rafFiyatOku('4.950,00');
barkodSonucGoster(sahteSonuc, turkceRaf);
kontrol('"4.950,00" → 4950 olarak kartta', turkceRaf === 4950 && dom.barkodOzet.innerHTML.includes('4.950,00'));

/* ---- 9) Asılı kalan site tüm taramayı kilitlemiyor (zaman aşımı) ---- */
// Sahte adaptör: biri hiç yanıt vermez, biri hızlı sonuç verir.
const { barkodAra } = await import('../src/barkod.js');
const { adapterById } = await import('../src/sites/index.js');

const asiliId = 'robo90';
const hizliId = 'filamentsan';
const asilAsili = adapterById(asiliId);
const asilHizli = adapterById(hizliId);
const asilSearchAsili = asilAsili.searchProducts;
const asilSearchHizli = asilHizli.searchProducts;
const asilProductHizli = asilHizli.getProduct;

let zamanAsimiTesti = null;
try {
  // Asılı adaptör: asla çözülmeyen söz
  asilAsili.searchProducts = () => new Promise(() => {});
  // Hızlı adaptör: barkodu listede taşıyan sahte aday + sahte ürün sayfası
  asilHizli.searchProducts = async () => ([{
    title: 'Test Ürün (hızlı site)', url: 'https://ornek.test/u', price: 100, barcode: '8682008472281',
  }]);
  asilHizli.getProduct = async () => ({
    url: 'https://ornek.test/u', title: 'Test Ürün (hızlı site)', sellingPrice: 100,
    listPrice: 100, barcode: '8682008472281', inStock: true, campaigns: [], shipping: null,
  });

  const t0 = Date.now();
  const r = await barkodAra('8682008472281', {
    siteler: [asiliId, hizliId],
    siteTimeoutMs: 5000,
    onProgress: () => {},
  });
  const sure = Date.now() - t0;

  zamanAsimiTesti = { r, sure };
  kontrol('asılı site zaman aşımına düştü (iş bitti)', r && Array.isArray(r.sonuclar), JSON.stringify(r?.ozet));
  kontrol('iş makul sürede tamamlandı (< 12 sn)', sure < 12000, `${Math.round(sure / 1000)} sn`);
  const asiliKayit = (r.sonuclar || []).find(s => s.site === asiliId);
  kontrol('asılı site "hata" olarak işaretlendi', asiliKayit?.status === 'error', asiliKayit?.status);
  kontrol('hata metni zaman aşımını söylüyor', /zaman aşımı/.test(asiliKayit?.reason || ''), asiliKayit?.reason);
  const hizliKayit = (r.sonuclar || []).find(s => s.site === hizliId);
  kontrol('diğer site yine de bulundu', hizliKayit?.status === 'found', hizliKayit?.status);
  kontrol('tüm siteler sayıldı', r.ozet?.tarananSite === 2, String(r.ozet?.tarananSite));
} finally {
  asilAsili.searchProducts = asilSearchAsili;
  asilHizli.searchProducts = asilSearchHizli;
  asilHizli.getProduct = asilProductHizli;
}

console.log(`BARKOD-RAF ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);
