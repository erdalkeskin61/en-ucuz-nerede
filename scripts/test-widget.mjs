/**
 * 🔌 Gömülebilir Canlı Fiyat Widget'ı — sözleşme testleri (2026-11-05)
 *
 * Kapsam:
 *   1) Slug üretimi (Türkçe karakterler) ve ürün çözümleme (id / urun / q).
 *   2) Herkese açık yük: fiyat, mağaza, kargo, birim, gerçek fırsat.
 *   3) GÜVENLİK: token/PID/sohbet kimliği sızmıyor; bilinmeyen ürün dürüstçe
 *      "bulunamadı" dönüyor (yanlış ürün göstermek yok).
 *   4) Referral: `ref` gitUrl'de korunuyor; tıklama kaydı ve istatistik.
 *   5) Sunucu: /widget · /widget.html · /api/widget · /widget/git rotaları,
 *      CSP `frame-ancestors *`, X-Frame-Options'ın widget'ta OLMAMASI,
 *      diğer sayfalarda SAMEORIGIN, 5 dk Cache-Control.
 *   6) Widget dosyaları: bağımlılık yok, toplam <15 KB, tema desteği,
 *      CTA `_blank + sponsored`, alt imza dofollow, XSS kaçışı.
 *   7) "Sitene Ekle" modalı: buton, önizleme, tema seçici, kod üretimi, kopyalama.
 *
 * Kullanım: node scripts/test-widget.mjs
 * Ağ isteği YOK; DB'ye kalıcı yazım yok (tıklama testi kendi kaydını siler).
 */
import fs from 'node:fs';
import {
  slugYap, refTemizle, widgetVerisi, widgetUrunBul,
  widgetTiklamaKaydet, widgetIstatistik, widgetOrnekUrunler,
} from '../src/widget.js';
import { dbBaglantisi, closeDatabase } from '../src/store.js';

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

/* ------------------------------------------------------------------ */
bolum('1) 🏷️ Slug ve parametre temizliği');

kontrol('Türkçe slug', slugYap('Creality Ender PLA Gri 1kg') === 'creality-ender-pla-gri-1kg',
  slugYap('Creality Ender PLA Gri 1kg'));
kontrol('Türkçe karakterler katlanır',
  slugYap('Porima Şişli Ölçü İğne') === 'porima-sisli-olcu-igne', slugYap('Porima Şişli Ölçü İğne'));
kontrol('boşluk/noktalama tek tireye iner',
  slugYap('Bambu  Lab   P1S / Combo') === 'bambu-lab-p1s-combo', slugYap('Bambu  Lab   P1S / Combo'));
kontrol('slug 90 karakterle sınırlı', slugYap('a'.repeat(200)).length <= 90);
kontrol('boş slug güvenli', slugYap(null) === '' && slugYap(undefined) === '');
kontrol('ref temizlenir', refTemizle('Maker Blog!') === 'maker-blog', refTemizle('Maker Blog!'));
kontrol('tehlikeli ref temizlenir', refTemizle('<script>x</script>') === 'script-x-script',
  refTemizle('<script>x</script>'));
kontrol('ref 40 karakterle sınırlı', String(refTemizle('a'.repeat(100))).length <= 40);
kontrol('boş ref null', refTemizle('') === null);

/* ------------------------------------------------------------------ */
bolum('2) 🔎 Ürün çözümleme');

const katalog = widgetOrnekUrunler({ limit: 5 });
kontrol('örnek ürünler dönüyor', Array.isArray(katalog) && katalog.length > 0, String(katalog.length));
kontrol('örnek ürünlerde fiyat var', katalog.every(u => Number(u.fiyat) > 0));
kontrol('örnek ürünlerde slug var', katalog.every(u => typeof u.slug === 'string' && u.slug.length > 2));

const hedef = katalog[0];
const byId = widgetUrunBul({ id: hedef.id });
kontrol('id ile bulunur', !!byId && Number(byId.id) === Number(hedef.id));
const bySlug = widgetUrunBul({ slug: hedef.slug });
kontrol('slug ile bulunur', !!bySlug && Number(bySlug.id) === Number(hedef.id), hedef.slug);
const byKismiSlug = widgetUrunBul({ slug: hedef.slug.slice(0, 12) });
kontrol('kısmi slug ile bulunur', !!byKismiSlug);
const byQ = widgetUrunBul({ q: hedef.ad.split(' ').slice(0, 3).join(' ') });
kontrol('q (ilk kelimeler) ile bulunur', !!byQ, hedef.ad);
kontrol('alakasız q bulunamaz', widgetUrunBul({ q: 'zzz-qqq-olmayan' }) === null);
// 2026-11-05: "+" işareti slug'da kayboluyor ("PLA+" → "pla"). Elle yazılan
// "pla-plus" slug'ı da çözülmeli; aksi hâlde widget "bulunamadı" diyordu.
if (/pla\+/i.test(hedef.ad)) {
  const plusSlug = hedef.slug.replace(/-filament/, '-plus-filament');
  kontrol('"plus" yazımlı slug toleransı', !!widgetUrunBul({ slug: plusSlug }), plusSlug);
}
kontrol('slug kelime kapsamı (fazladan kelime tolere edilir)',
  !!widgetUrunBul({ slug: hedef.slug + '-ekstra-kelime' }), hedef.slug);
kontrol('alakasız slug bulunamaz',
  widgetUrunBul({ slug: 'zzz-qqq-olmayan-urun' }) === null);
kontrol('geçersiz id bulunamaz', widgetUrunBul({ id: 999999 }) === null);
kontrol('parametresiz bulunamaz', widgetUrunBul({}) === null);

/* ------------------------------------------------------------------ */
bolum('3) 📦 Widget yükü ve dürüstlük');

const v = widgetVerisi({ id: hedef.id, ref: 'maker-blogu', tabanUrl: 'https://enucuznerede.com' });
kontrol('bulundu', v.bulundu === true, v.neden);
kontrol('ok:true', v.ok === true);
kontrol('ürün adı var', typeof v.urun?.ad === 'string' && v.urun.ad.length > 2);
kontrol('fiyat pozitif', Number(v.urun?.fiyat) > 0, String(v.urun?.fiyat));
kontrol('stok bayrağı boolean', typeof v.urun?.stokta === 'boolean');
kontrol('mağaza adı var', typeof v.urun?.site === 'string' && v.urun.site.length > 1);
kontrol('slug üretilmiş', /^[a-z0-9-]+$/.test(String(v.urun?.slug)));
kontrol('hedef http(s) linki', /^https?:\/\//.test(String(v.hedef)));
kontrol('gitUrl ref içeriyor', String(v.gitUrl).includes('ref=maker-blogu'), String(v.gitUrl));
kontrol('gitUrl widget/git yolu', String(v.gitUrl).includes('/widget/git?id='), String(v.gitUrl));
kontrol('güncelleme zamanı sayı', Number(v.guncelleme) > 0);

// GÜVENLİK: herkese açık yükte iç bilgi olmamalı.
const yuk = JSON.stringify(v);
kontrol('PID sızmıyor', !/"?pid"?\s*:/.test(yuk) && !yuk.includes('__gizli'));
kontrol('token/sohbet sızmıyor', !/token|chatId|chat_id|botToken|mesaj_id/i.test(yuk));
kontrol('kaynak URL (katalog iç kaydı) sızmıyor', !yuk.includes('kaynakUrl'));

// Bilinmeyen ürün: yanlış ürün DEĞİL, dürüst hata.
const yok = widgetVerisi({ q: 'zzz-qqq-olmayan' });
kontrol('bilinmeyen ürün: bulundu=false', yok.bulundu === false);
kontrol('bilinmeyen ürün: neden açıklanır',
  typeof yok.neden === 'string' && yok.neden.length > 10, yok.neden);
kontrol('bilinmeyen ürün: fiyat uydurulmaz', yok.urun === null && yok.gitUrl === null);

/* ------------------------------------------------------------------ */
bolum('4) 📊 Referral tıklama kaydı');

const tabloVar = (() => {
  try {
    widgetTiklamaKaydet({ ref: 'test-widget-ref', katalogId: hedef.id, siteId: 'test' });
    return true;
  } catch { return false; }
})();
kontrol('tıklama kaydedilebiliyor', tabloVar);

const ist = widgetIstatistik({ gun: 1 });
kontrol('istatistik ok', ist.ok === true);
kontrol('tıklama sayacı arttı', Number(ist.toplam) >= 1, String(ist.toplam));
kontrol('ref kırılımı listeleniyor',
  Array.isArray(ist.refler) && ist.refler.some(r => r.ref === 'test-widget-ref'),
  JSON.stringify(ist.refler));

// Test kaydını temizle (paylaşılan DB'yi kirletme).
try {
  dbBaglantisi().prepare('DELETE FROM widget_tiklama WHERE ref = ?').run('test-widget-ref');
} catch { /* yoksay */ }
const istSonra = widgetIstatistik({ gun: 1 });
kontrol('test kaydı temizlendi',
  !istSonra.refler.some(r => r.ref === 'test-widget-ref'), JSON.stringify(istSonra.refler));

/* ------------------------------------------------------------------ */
bolum('5) 🛡️ Sunucu rotaları ve başlıklar');

const server = fs.readFileSync('server.js', 'utf8');
kontrol('rota: /widget', /app\.get\('\/widget', widgetSayfasi\)/.test(server));
kontrol('rota: /widget.html', /app\.get\('\/widget\.html', widgetSayfasi\)/.test(server));
kontrol('rota: /api/widget', /app\.get\('\/api\/widget',/.test(server));
kontrol('rota: /widget/git', /app\.get\('\/widget\/git',/.test(server));
kontrol('widget için CSP frame-ancestors *', /frame-ancestors \*/.test(server));
kontrol('widget için X-Frame-Options KALDIRILIYOR',
  /removeHeader\('X-Frame-Options'\)/.test(server));
kontrol('diğer sayfalar SAMEORIGIN', /setHeader\('X-Frame-Options', 'SAMEORIGIN'\)/.test(server));
kontrol('widget 5 dk önbellek', /max-age=300/.test(server));
kontrol('widget erişim anahtarından muaf', /req\.path === '\/api\/widget'/.test(server));
kontrol('git yönlendirici anahtardan muaf', /req\.path === '\/widget\/git'/.test(server));
kontrol('yönlendirme açık yönlendirme yapmıyor (hedef kayıttan)',
  /redirect\(302, veri\.hedef\)/.test(server));
kontrol('yönlendirme no-store', /setHeader\('Cache-Control', 'no-store'\)/.test(server));
kontrol('bilinmeyen üründe 404', /status\(404\)/.test(server));

/* ------------------------------------------------------------------ */
bolum('6) 🎨 Widget dosyaları');

const html = fs.readFileSync('public/widget.html', 'utf8');
const css = fs.readFileSync('public/widget.css', 'utf8');
const js = fs.readFileSync('public/widget.js', 'utf8');
const boyut = Buffer.byteLength(html) + Buffer.byteLength(css) + Buffer.byteLength(js);

kontrol('toplam boyut < 15 KB', boyut < 15 * 1024, `${(boyut / 1024).toFixed(1)} KB`);
kontrol('harici kütüphane yok', !/https?:\/\/(cdn|unpkg|jsdelivr|googleapis)/i.test(html + css + js));
kontrol('harici font yok', !/@import|fonts\.googleapis/.test(css));
kontrol('widget.css bağlı', /href="\/widget\.css"/.test(html));
kontrol('widget.js bağlı', /src="\/widget\.js"/.test(html));
kontrol('HTML lang=tr', /<html lang="tr"/.test(html));
kontrol('aria-live (fiyat duyurusu)', /aria-live="polite"/.test(html));
kontrol('robots noindex (widget kendi başına indekslenmez)', /name="robots" content="noindex/.test(html));

kontrol('koyu tema varsayılan (#0f172a)', /--w-zemin:\s*#0f172a/i.test(css));
kontrol('açık tema beyaz zemin', /data-tema="light"[\s\S]{0,200}--w-zemin:\s*#ffffff/i.test(css));
kontrol('320px altı dar gömme desteği', /@media \(max-width: 300px\)/.test(css));
kontrol('hareket azaltma desteği', /prefers-reduced-motion/.test(css));
kontrol('başlık tek satır + üç nokta',
  /\.widget-ad[\s\S]{0,260}text-overflow:\s*ellipsis/.test(css));

kontrol('tema URL parametresi okunuyor', /get\('tema'\)/.test(js));
kontrol('veri ucu /api/widget', /\/api\/widget/.test(js));
kontrol('CTA yeni sekmede', /target="_blank"/.test(js));
kontrol('CTA sponsored', /rel="noopener sponsored"/.test(js));
kontrol('CTA yönlendiriciden geçiyor', /'\/widget\/git\?id='/.test(js));
// 2026-11-05: yerelde var olmayan alan adına link verilmez; üretimde dofollow.
kontrol('alt imza dofollow (nofollow YOK)', /widget-imza"/.test(js) && !/widget-imza[^>]{0,120}nofollow/.test(js));
kontrol('yerelde sunucu adresi gösterilir', /yerelMi/.test(js) && /markaAdi/.test(js));
kontrol('XSS kaçışı var', /function kac\(/.test(js) && /&amp;/.test(js));
kontrol('bulunamadı durumunda sahte fiyat yok',
  /v\.bulundu !== true/.test(js) && /durumHtml/.test(js));
kontrol('stokta yoksa "satın al" denmez', /Stokta Yok/.test(js) && /Fiyatı Sitede Gör/.test(js));
kontrol('birim fiyat gösteriliyor', /widget-birim/.test(js));
kontrol('gerçek fırsat rozeti (DİP)', /DİP/.test(js));

/* ------------------------------------------------------------------ */
bolum('7) 🔌 "Sitene Ekle" modalı');

const appJs = fs.readFileSync('public/app.js', 'utf8');
const style = fs.readFileSync('public/style.css', 'utf8');

kontrol('kartta "Sitene Ekle" butonu', /class="embed-btn"/.test(appJs));
kontrol('buton ürün adını taşıyor', /data-embed-q=/.test(appJs));
kontrol('modal açıcı', /function embedModalAc\(/.test(appJs));
kontrol('iframe kodu üretici', /function embedKodu\(/.test(appJs));
kontrol('kodda width=320 height=180', /width="320" height="180"/.test(appJs));
kontrol('kodda loading="lazy"', /loading="lazy"/.test(appJs));
kontrol('tema seçici (koyu/açık)', /data-embed-tema="dark"/.test(appJs) && /data-embed-tema="light"/.test(appJs));
kontrol('canlı önizleme iframe\'i', /embed-onizleme/.test(appJs));
kontrol('kopyalama butonu', /embedKopyala/.test(appJs));
kontrol('kopyalama yedeği (execCommand)', /execCommand\('copy'\)/.test(appJs));
kontrol('delege tıklama dinleyicisi', /\[data-embed-q\]/.test(appJs));
kontrol('CSS: embed buton stili', /\.embed-btn\s*\{/.test(style));
kontrol('CSS: embed modal stili', /\.embed-modal\s*\{/.test(style));
kontrol('CSS: önizleme kutusu', /\.embed-onizleme\s*\{/.test(style));
kontrol('CSS: kod alanı', /\.embed-kod\s*\{/.test(style));

/* 🐞 2026-11-15 gerileme koruması: "Sitene Ekle" masaüstünde görünmüyor ve
 * sayfa kaydırılamaz kalıyordu (`.alt-modal` >768px'te display:none). */
kontrol('CSS: masaüstünde .alt-modal GİZLENMİYOR',
  !/@media \(min-width: 769px\)\s*\{[^}]*\.alt-modal[^{]*\{[^}]*display:\s*none/.test(style));
kontrol('CSS: masaüstü modal ortalanıyor', /@media \(min-width: 769px\)[\s\S]{0,400}\.alt-modal\s*\{[^}]*align-items:\s*center/.test(style));
kontrol('JS: kaydırma kilidi yalnızca görünür modalda', /const gorunur = getComputedStyle\(m\)\.display !== 'none'/.test(appJs));
kontrol('JS: modal görünmezse kullanıcıya bildirilir', /Gömme kodu penceresi açılamadı/.test(appJs));

// 🐞 2026-11-15: gizliyken kaynak atanan lazy iframe hiç yüklenmiyordu → önizleme boş.
kontrol('JS: önizleme iframe kimliği', /id="embedOnizleme"/.test(appJs));
kontrol('JS: önizleme adresi modal açıldıktan SONRA atanır',
  /if \(onizleme\) onizleme\.src = embedOnizlemeUrl\(q, tema\)/.test(appJs));
kontrol('JS: önizleme iframe\'i src taşımadan üretilir',
  /id="embedOnizleme" width="320" height="180" frameborder="0" '[\s\S]{0,60}title="Widget önizleme"/.test(appJs)
  && !/embedOnizleme" src=/.test(appJs));
kontrol('JS: tema değişince önizleme yenilenir', /cerceve\.src = embedOnizlemeUrl\(q, tema\)/.test(appJs));

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
