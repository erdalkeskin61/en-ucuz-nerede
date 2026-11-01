/**
 * 🎨 UI/UX Redesign sözleşme testi — 2026-10-31
 *
 * Amaç: modern tasarım sisteminin ve hibrit arama deneyiminin sessizce
 * bozulmamasını sağlamak. Görsel regresyon değil, sözleşme kontrolü yapar:
 * değişkenler, font, tema, hibrit form, skeleton, kart/filtre sınıfları.
 *
 * Kullanım: node scripts/test-ui-redesign.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

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
const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const css = oku('public/style.css');
const html = oku('public/index.html');
const app = oku('public/app.js');
const tema = oku('public/tema.js');
const ayarlarHtml = oku('public/ayarlar.html');
const manifest = oku('public/manifest.json');

/* ---------------------------------------------------------------- */
bolum('1) Tasarım sistemi ve renk paleti');
kontrol('Plus Jakarta Sans tanımlı', /--font:\s*"Plus Jakarta Sans"/.test(css));
kontrol('Google Fonts bağlantısı (index)', /fonts\.googleapis\.com\/css2\?family=Plus\+Jakarta\+Sans/.test(html));
kontrol('font ağırlıkları 400–800', /wght@400;500;600;700;800/.test(html));
kontrol('marka rengi #4338CA', /--ana:\s*#4338CA/.test(css));
kontrol('marka gradyanı #6366F1', /--ana-gradyan:.*#6366F1/.test(css));
kontrol('zümrüt tasarruf rengi', /--yesil:\s*#047857/.test(css) && /--yesil-parlak:\s*#10B981/.test(css));
kontrol('gül kurusu uyarı rengi', /--kirmizi:\s*#BE123C/.test(css) && /--kirmizi-parlak:\s*#F43F5E/.test(css));
kontrol('slate zemin #F8FAFC', /--zemin:\s*#F8FAFC/.test(css));
kontrol('kart sınırı #E2E8F0', /--cizgi:\s*#E2E8F0/.test(css));
kontrol('çok katmanlı kart gölgesi', /--kart-golge:.*0 4px 20px -2px rgba\(15, 23, 42, 0\.05\)/.test(css));
kontrol('20px kart yarıçapı', /--radius:\s*20px/.test(css));
kontrol('koyu mod değişkenleri', /html\[data-theme="dark"\]/.test(css) && /--zemin:\s*#0F172A/.test(css));
kontrol('koyu mod slate kart', /--kart:\s*#16213A/.test(css));
kontrol('color-scheme bildirimi', /color-scheme:\s*light/.test(css) && /color-scheme:\s*dark/.test(css));

/* ---------------------------------------------------------------- */
bolum('2) Hero ve hibrit arama');
kontrol('hero rozet şeridi', /hero-rozet/.test(html) && /\.hero-rozet\s*\{/.test(css));
kontrol('hero gradyan arka plan', /\.hero\s*\{[^}]*background:\s*var\(--ana-gradyan\)/s.test(css));
kontrol('hero h1 gradyan vurgu', /\.hero h1 b\s*\{[^}]*background-clip:\s*text/s.test(css));
kontrol('tek hibrit form', /class="hibrit-form"/.test(html) && /id="karsilastirForm"/.test(html));
kontrol('hibrit girdi açıklaması link + ürün adı', /Ürün linki yapıştır ya da ürün adı yaz/.test(html));
kontrol('gradyan "Fiyatları Bul" butonu', /id="araBtn"[^>]*>Fiyatları Bul</.test(html));
kontrol('buton gradyanı', /\.hibrit-form button\s*\{[^}]*var\(--ana-gradyan\)/s.test(css));
kontrol('odak halkası rgba(99,102,241,.2)', /--halka:\s*0 0 0 4px rgba\(99, 102, 241, 0\.18\)/.test(css));
kontrol('focus-within halkası uygulanıyor', /\.hibrit-form:focus-within[^}]*box-shadow:\s*var\(--halka\)/s.test(css));
for (const ad of ['eSun PLA+', 'Bambu Lab P1S', 'Ender 3 V3', 'AirPods Pro 2']) {
  kontrol(`hızlı arama çipi: ${ad}`, new RegExp(`data-hizli="${ad.replace(/[+]/g, '\\+')}"`).test(html));
}
kontrol('hızlı çip tıklama davranışı', /\.hizli-cip/.test(app) && /requestSubmit/.test(app));
kontrol('URL değilse doğal dil akışı', /const linkGirdi = linkGibiMi\(url\)/.test(app) && /ihtiyacAlani\.value = url/.test(app));
kontrol('doğal dilde önceki sonuç gizleniyor', /Doğal dil aramasında önceki link sonucu/.test(app));

/* ---------------------------------------------------------------- */
bolum('3) Tarama deneyimi (skeleton, pulse, gradyan)');
kontrol('skeleton ızgarası HTML', /class="skeleton-izgara"/.test(html));
kontrol('shimmer animasyonu', /@keyframes shimmer/.test(css));
kontrol('skeleton kartları', /\.skeleton-kart/.test(css) && /\.skeleton-cizgi\.w-100/.test(css));
kontrol('gradyan tarama çubuğu', /@keyframes taramaAkis/.test(css)
  && /\.tarama-dolgu\s*\{[^}]*background-size:\s*220%/s.test(css));
kontrol('çip nabız animasyonu', /@keyframes cipNabiz/.test(css) && /animation:\s*cipNabiz/.test(css));
kontrol('bulundu sıçraması', /@keyframes cipSicra/.test(css));
kontrol('skeleton ilk sonuçta gizleniyor', /skeleton-izgara/.test(app) && /iskelet\.hidden = true/.test(app));
kontrol('yeni aramada skeleton geri geliyor', /iskelet\.hidden = false/.test(app));
kontrol('hidden özniteliği güvenli', /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));

/* ---------------------------------------------------------------- */
bolum('4) Ürün kartları ve fiyat hiyerarşisi');
kontrol('kart hover süzülmesi', /\.urun-karti:hover\s*\{[^}]*translateY\(-4px\)/s.test(css));
kontrol('kart taşma gizli', /\.urun-karti\s*\{[^}]*overflow:\s*hidden/s.test(css));
kontrol('en ucuz yeşil ışıma', /\.urun-karti\.en-ucuz\s*\{[^}]*rgba\(16, 185, 129/s.test(css));
kontrol('en ucuz şerit gradyanı', /\.ucuz-serit\s*\{[^}]*linear-gradient\(135deg, #047857/s.test(css));
kontrol('tükendi kartı matlaştırma', /\.urun-karti\.stok-yok\s*\{[^}]*opacity:\s*\.7/s.test(css));
kontrol('net fiyat 28px / 800', /\.gercek-fiyat\s*\{[^}]*font-size:\s*28px;[^}]*font-weight:\s*800/s.test(css));
kontrol('ürün görseli beyaz çerçeve', /\.kart-resim\s*\{[^}]*background:\s*#fff/s.test(css));
kontrol('kupon/kargo hap dökümü', /\.fiyat-kupon,\s*\.fiyat-kampanya/.test(css));
kontrol('CTA gradyan buton', /\.urun-link\s*\{[^}]*var\(--ana-gradyan\)/s.test(css));
kontrol('CTA ok ikonu', /\.urun-link::after\s*\{[^}]*content:\s*"↗"/s.test(css));
kontrol('dokunmatik basılma efekti', /\.hibrit-form button:active\s*\{[^}]*scale\(\.98\)/s.test(css));
kontrol('kart dokunma efekti mobilde kapalı', /@media \(max-width: 720px\)[\s\S]*?\.urun-karti:hover\s*\{\s*transform:\s*none/.test(css));

/* ---------------------------------------------------------------- */
bolum('5) Tablo, filtre ve detay panelleri');
kontrol('zebra satırlar', /tbody tr:nth-child\(even\) td/.test(css));
kontrol('satır hover parlaması', /tbody tr:hover td\s*\{[^}]*var\(--ana-acik\)/s.test(css));
kontrol('sağa yaslı kalın fiyat', /td\.fiyat-hucre[^{]*\{[^}]*text-align:\s*right;[^}]*font-weight:\s*800/s.test(css));
kontrol('segmentli hap filtre', /\.filtre-chip\.aktif\s*\{[^}]*background:\s*var\(--kart\)/s.test(css));
kontrol('mobilde yatay kaydırma', /@media \(max-width: 720px\)[\s\S]*?\.filtre-bar\s*\{[^}]*overflow-x:\s*auto/s.test(css));
kontrol('grafik gradyan zemin', /\.fiyat-gecmisi-karti::before/.test(css));
kontrol('grafik kapsayıcı gradyanı', /\.grafik-kapsayici\s*\{[^}]*linear-gradient/s.test(css));
kontrol('mobil tek kolon kart', /@media \(max-width: 720px\)[\s\S]*?\.kart-izgarasi\s*\{\s*grid-template-columns:\s*1fr/.test(css));

/* ---------------------------------------------------------------- */
bolum('6) Tema değiştirici');
kontrol('üst barda tema düğmesi', /id="temaDegistir"/.test(html) && /id="temaDegistir"/.test(ayarlarHtml));
kontrol('tema betiği yükleniyor', /src="\/tema\.js"/.test(html) && /src="\/tema\.js"/.test(ayarlarHtml));
kontrol('FOUC önleyici head betiği', /documentElement\.setAttribute\('data-theme', 'dark'\)/.test(html));
kontrol('localStorage kalıcılığı', /localStorage\.setItem\('tema'/.test(tema));
kontrol('zorunlu restyle', /const restyle =/.test(tema) && /offsetHeight/.test(tema));
kontrol('meta theme-color güncelleniyor', /meta\[name="theme-color"\]/.test(tema));
kontrol('grafik tema olayını dinliyor', /tema:degisti/.test(app) && /sonTimeline/.test(app));
kontrol('manifest marka rengi', /"theme_color":\s*"#4338CA"/.test(manifest));
kontrol('erişilebilirlik: aria-pressed', /aria-pressed/.test(tema));
kontrol('ayarlar sayfası fontu', /Plus\+Jakarta\+Sans/.test(ayarlarHtml));

/* ---------------------------------------------------------------- */
bolum('7) Erişilebilirlik ve geriye dönük uyumluluk');
kontrol('hareket azaltma', /@media \(prefers-reduced-motion: reduce\)/.test(css));
kontrol('klavye odak halkası', /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ana-parlak\)/s.test(css));
kontrol('mevcut kart kimliği korunuyor', /id="kartlar"/.test(html) && /#kartlar|'kartlar'/.test(app));
kontrol('mevcut özet tablo korunuyor', /id="ozetTablo"/.test(html));
kontrol('mevcut filtre çipleri korunuyor', /data-filtre="stokta_var"/.test(html) && /data-filtre="taksit"/.test(html));
kontrol('3D çap/hammadde filtre grupları korunuyor', /id="capFiltreleri"/.test(html) && /id="hammaddeFiltreleri"/.test(html));
kontrol('SWR durum çubuğu korunuyor', /id="sonAramaNotu"/.test(html) && /id="sifirdanTaraBtn"/.test(html));
kontrol('sepet/barkod/görsel bölümleri korunuyor',
  /id="sepetSonuc"/.test(html) && /id="barkodSonuc"/.test(html) && /id="gorselSonuc"/.test(html));
kontrol('öneri akışı kimlikleri korunuyor', /id="oneriForm"/.test(html) && /id="ihtiyacMetni"/.test(html) && /id="oneriBtn"/.test(html));

console.log(`\nUI-REDESIGN ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
