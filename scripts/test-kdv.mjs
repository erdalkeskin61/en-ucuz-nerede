/**
 * 🧾 KDV (VAT) testleri — 2026-10-31
 *
 * Gerçek vaka: direnc.net ürün sayfası "567,11 TL + KDV" ve "680,53 TL KDV Dahil"
 * gösteriyor; JSON-LD ise yalnızca KDV HARİÇ 567,11 veriyor. Uygulama KDV dahil
 * 680,53 TL göstermeli, aksi hâlde ürün %20 ucuz görünür.
 *
 * Kullanım:
 *   node scripts/test-kdv.mjs           # birim + sözleşme
 *   node scripts/test-kdv.mjs --canli   # gerçek direnc.net sayfası (ağ)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  kdvDahilFiyat, sayfaKdvFiyatlari, kdvOraniBul,
  VARSAYILAN_KDV_ORANI, gorunurMetin,
} from '../src/kdv.js';

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
const yakin = (a, b, tol = 0.01) => Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) <= tol;

/* ---------------------------------------------------------------- */
bolum('1) Sayfa fiyatlarını okuma');
const direncHtml = `
  <div class="detay">
    <span class="fiyat">567,11 TL + KDV</span>
    <span class="fiyat-kdv">680,53 TL KDV Dahil</span>
  </div>
  <script>window.P = {"VAT": 20};</script>
`;
const sf = sayfaKdvFiyatlari(direncHtml);
kontrol('KDV hariç okundu (567,11)', yakin(sf.haric, 567.11), String(sf.haric));
kontrol('KDV dahil okundu (680,53)', yakin(sf.dahil, 680.53), String(sf.dahil));
kontrol('ham metinler saklandı', sf.ham.haric === '567,11' && sf.ham.dahil === '680,53',
  JSON.stringify(sf.ham));
kontrol('KDV oranı sayfadan okundu (%20)', kdvOraniBul(direncHtml) === 20, String(kdvOraniBul(direncHtml)));
kontrol('varsayılan oran %20', VARSAYILAN_KDV_ORANI === 20);

const tersHtml = '<p>KDV Dahil: 1.200,00 TL</p><p>1.000,00 TL + KDV</p>';
const ters = sayfaKdvFiyatlari(tersHtml);
kontrol('"KDV Dahil:" öneki okunur', yakin(ters.dahil, 1200), String(ters.dahil));
kontrol('binlik ayırıcı doğru', yakin(ters.haric, 1000), String(ters.haric));

const scriptYok = gorunurMetin('<script>var x = "999,99 TL KDV Dahil";</script><div>100,00 TL</div>');
kontrol('script içindeki sahte fiyat yok sayılır', !/999/.test(scriptYok), scriptYok);
kontrol('görünür metin kaldı', /100,00 TL/.test(scriptYok), scriptYok);

/* ---------------------------------------------------------------- */
bolum('2) KDV dahil fiyat hesabı');
const d1 = kdvDahilFiyat(direncHtml, 567.11, { zorunlu: true });
kontrol('direnc: 567,11 → 680,53', yakin(d1.fiyat, 680.53), String(d1.fiyat));
kontrol('direnc: uygulandı', d1.uygulandi === true);
kontrol('direnc: KDV hariç tutar taşınır', yakin(d1.haric, 567.11), String(d1.haric));
kontrol('direnc: oran %20', d1.oran === 20, String(d1.oran));
kontrol('direnc: kaynak sayfa', d1.kaynak === 'sayfa-kdv-dahil', d1.kaynak);

const d2 = kdvDahilFiyat(direncHtml, 680.53, { zorunlu: true });
kontrol('zaten KDV dahil fiyat ikinci kez artırılmaz', yakin(d2.fiyat, 680.53), String(d2.fiyat));
kontrol('zaten dahilse uygulandı=false', d2.uygulandi === false, String(d2.uygulandi));

const sadeceHaric = '<div>1.234,56 TL + KDV</div>';
const d3 = kdvDahilFiyat(sadeceHaric, 1234.56, { zorunlu: true });
kontrol('yalnızca +KDV varsa %20 eklenir', yakin(d3.fiyat, 1481.47), String(d3.fiyat));
kontrol('kaynak sayfa-plus-kdv', d3.kaynak === 'sayfa-plus-kdv', d3.kaynak);

const zatenDahil = '<div>1.480,00 TL KDV Dahil</div>';
const d4 = kdvDahilFiyat(zatenDahil, 1480);
kontrol('KDV dahil fiyat değişmez', yakin(d4.fiyat, 1480), String(d4.fiyat));
kontrol('çift KDV yok', d4.uygulandi === false);

const kanitsiz = '<div>Fiyat: 500,00 TL</div>';
kontrol('kanıt yoksa dokunulmaz', yakin(kdvDahilFiyat(kanitsiz, 500).fiyat, 500));
kontrol('kanıtsız uygulandı=false', kdvDahilFiyat(kanitsiz, 500).uygulandi === false);
kontrol('zorunlu mağazada KDV eklenir', yakin(kdvDahilFiyat(kanitsiz, 500, { zorunlu: true }).fiyat, 600));
kontrol('geçersiz fiyat güvenli', kdvDahilFiyat(direncHtml, null).fiyat === 680.53);

// Özel oran (ör. %10) sayfadan okunur
const onluk = '<div>100,00 TL + KDV 110,00 TL KDV Dahil</div><script>{"VAT":10}</script>';
const d5 = kdvDahilFiyat(onluk, 100, { zorunlu: true });
kontrol('%10 oran sayfadan', d5.oran === 10 && yakin(d5.fiyat, 110), `${d5.oran}/${d5.fiyat}`);

/* ---------------------------------------------------------------- */
bolum('3) Adaptör ve akış entegrasyonu');
{
  const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  const ucd = oku('src/sites/ucd.js');
  const tsoft = oku('src/sites/plt-tsoft.js');
  const pipeline = oku('src/pipeline.js');
  const server = oku('server.js');
  const app = oku('public/app.js');
  const css = oku('public/style.css');

  kontrol('direnc kdvDahil: true', /id: 'direnc'[^}]*kdvDahil: true/.test(ucd));
  kontrol('tsoft: KDV yardımcısı import', /from '\.\.\/kdv\.js'/.test(tsoft));
  kontrol('tsoft: JSON-LD yolunda KDV', /kdvDahilFiyat\(r\.body, hamFiyat/.test(tsoft));
  kontrol('tsoft: blog JSON yolunda KDV', /kdvDahilFiyat\(r\.body, price/.test(tsoft));
  kontrol('tsoft: liste fiyatı da KDV ile', /listeAyarli/.test(tsoft));
  kontrol('tsoft: arama fiyatı KDV çarpanı', /kdvCarpan/.test(tsoft));
  kontrol('tsoft: vatIncluded alanı', /vatIncluded:/.test(tsoft));
  kontrol('tsoft: priceExVat alanı', /priceExVat:/.test(tsoft));
  kontrol('pipeline: KDV alanları sonuca taşınıyor', /priceExVat: r\.product\.priceExVat/.test(pipeline));
  kontrol('server: canlı kartta KDV alanları', /priceExVat: r\.product\.priceExVat/.test(server));
  kontrol('arayüz: KDV dahil rozeti', /KDV Dahil/.test(app) && /class="kdv-not"/.test(app));
  kontrol('arayüz: KDV hariç tutar gösterilir', /KDV hariç/.test(app));
  kontrol('CSS: .kdv-not', /\.kdv-not\s*\{/.test(css));
  kontrol('CSS: koyu mod KDV rozeti', /html\[data-theme="dark"\] \.kdv-not/.test(css));
}

/* ---------------------------------------------------------------- */
bolum('4) Canlı doğrulama (opsiyonel)');
if (process.argv.includes('--canli')) {
  try {
    const { adapterById } = await import('../src/sites/index.js');
    const a = adapterById('direnc');
    const p = await a.getProduct(
      'https://www.direnc.net/kirmizi-pla-plus-filament-175mm-1kg-tri-d',
      { spend: 0 },
      { fresh: true },
    );
    kontrol('canlı: KDV dahil fiyat 680,53', yakin(p.sellingPrice, 680.53, 0.02), String(p.sellingPrice));
    kontrol('canlı: KDV hariç 567,11', yakin(p.priceExVat, 567.11, 0.02), String(p.priceExVat));
    kontrol('canlı: vatIncluded', p.vatIncluded === true);
    kontrol('canlı: oran %20', Number(p.vatRate) === 20, String(p.vatRate));
  } catch (e) {
    kontrol('canlı direnc sayfası okunabildi', false, String(e.message || e).slice(0, 140));
  }
} else {
  console.log('ℹ️  Gerçek sayfa testi için: --canli');
}

console.log(`\nKDV ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
