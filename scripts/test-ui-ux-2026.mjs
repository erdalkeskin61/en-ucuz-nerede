/**
 * 🎯 UX/UI 2026 dönüşümü testleri — 2026-11-01
 *
 * Kapsam:
 *  1) /api/search-suggestions: sorgu eşleşmesi, hız (<15 ms hedefi), boş sorgu
 *  2) Typeahead: 150 ms debounce, min 2 karakter, klavye (↑/↓/Enter/Esc), ARIA
 *  3) Skeleton: arama başında iskelet, canlı iskelet sayacı, staggered giriş
 *  4) Bento: 3 blok, spotlight/trend/dağılım, gerçek geçmiş yoksa dürüst boş durum
 *  5) Mobil alt navigasyon: 5 öğe, <768px kuralı, modal, dokunma efekti
 *  6) Kontrast: WCAG AA (açık + koyu tema ana çiftleri)
 *
 * Kullanım:
 *   node scripts/test-ui-ux-2026.mjs
 *   node scripts/test-ui-ux-2026.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { onerileriGetir, puanla, POPULER_URUNLER } from '../src/oneriler.js';

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

/* ---------------------------------------------------------------- */
bolum('1) Öneri motoru ve /api/search-suggestions sözleşmesi');
kontrol('popüler havuz yeterli (≥20)', POPULER_URUNLER.length >= 20, String(POPULER_URUNLER.length));
for (const ad of ['Bambu Lab P1S', 'eSun PLA+', 'Creality K1', 'Anycubic Kobra', 'Elegoo Saturn']) {
  kontrol(`popüler listede: ${ad}`, POPULER_URUNLER.some(x => x.includes(ad)), ad);
}
kontrol('tam eşleşme en yüksek puan', puanla('Bambu Lab P1S', 'bambu lab p1s') === 100);
kontrol('baştan eşleşme', puanla('Bambu Lab P1S', 'bam') === 80);
kontrol('kelime başı eşleşme', puanla('eSun PLA+ Filament', 'filament') === 60);
kontrol('içerir eşleşme', puanla('Kırmızı PLA Plus', 'pla') >= 45);
kontrol('eşleşmeyen 0', puanla('Bambu Lab', 'zzzz') === 0);
kontrol('Türkçe İ normalize', puanla('İncehesap', 'ince') === 80);

const bam = onerileriGetir('bam', { limit: 5 });
kontrol('"bam" öneri döndürüyor', bam.length > 0, String(bam.length));
kontrol('"bam" ilk sonuç Bambu', /Bambu/i.test(bam[0]?.metin || ''), bam[0]?.metin);
kontrol('öneri alanları tam', bam.every(x => x.metin && x.tur && x.etiket));
kontrol('boş sorgu popüler döndürür', onerileriGetir('', { limit: 4 }).length === 4);
kontrol('eşleşmeyen sorgu boş dizi', onerileriGetir('zzzzqqq').length === 0);

// Hız: önbellek ısındıktan sonra ortalama < 15 ms
onerileriGetir('isit');
const t0 = process.hrtime.bigint();
for (let i = 0; i < 20; i++) onerileriGetir('pla');
const ortMs = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
kontrol('sorgu ortalaması <15 ms', ortMs < 15, ortMs.toFixed(2) + ' ms');
console.log(`     ısınmış ortalama: ${ortMs.toFixed(2)} ms`);

/* ---------------------------------------------------------------- */
bolum('2) Typeahead arayüz sözleşmesi');
const app = oku('public/app.js');
const html = oku('public/index.html');
const css = oku('public/style.css');
const server = oku('server.js');

kontrol('sunucu: /api/search-suggestions', /app\.get\('\/api\/search-suggestions'/.test(server));
kontrol('sunucu: sureMs raporlanıyor', /sureMs:/.test(server));
kontrol('sunucu: açılışta öneri ısınması', /onerileriGetir\(''\)/.test(server));

kontrol('HTML: combobox rolü', /role="combobox"/.test(html));
kontrol('HTML: listbox kutusu', /id="onerilerKutusu"[^>]*role="listbox"/.test(html));
kontrol('HTML: aria-controls bağlantısı', /aria-controls="onerilerKutusu"/.test(html));
kontrol('app: 150 ms debounce', /setTimeout\(\(\) => onerileriYukle\(metin\), 150\)/.test(app));
kontrol('app: en az 2 karakter', /if \(metin\.length < 2\) \{ onerileriKapat/.test(app));
kontrol('app: ↑/↓ gezinme', /e\.key === 'ArrowDown'/.test(app) && /e\.key === 'ArrowUp'/.test(app));
kontrol('app: Enter seçim', /e\.key === 'Enter'/.test(app) && /oneriSec\(oneriAktif\)/.test(app));
kontrol('app: Escape kapat', /e\.key === 'Escape'/.test(app));
kontrol('app: ARIA active descendant', /aria-activedescendant/.test(app));
kontrol('app: yarışan istek koruması', /oneriIstegeSayaci/.test(app));
kontrol('app: eşleşme vurgusu', /<mark>/.test(app));
kontrol('app: seçimde arama tetikleniyor', /function oneriSec[\s\S]{0,700}requestSubmit/.test(app));
kontrol('CSS: dropdown konumu', /\.oneriler-kutusu\s*\{[^}]*position:\s*absolute/s.test(css));
kontrol('CSS: koyu mod dropdown', /html\[data-theme="dark"\] \.oneriler-kutusu/.test(css));

/* ---------------------------------------------------------------- */
bolum('3) İskelet ve kademeli geçiş');
kontrol('HTML: skeleton ızgarası', /class="skeleton-izgara"/.test(html));
kontrol('app: arama başında iskelet dolduruluyor', /iskeletKartHtml\(\)\.repeat\(6\)/.test(app));
kontrol('app: canlı iskelet sayacı', /function canliIskeletleriGuncelle/.test(app));
kontrol('app: kalan site hesabı', /const kalanSite = Math\.max\(0, SITE_SIRASI\.length - islenen\)/.test(app));
kontrol('app: kademeli giriş', /function kartGirisAnimasyonu/.test(app)
  && /animationDelay = Math\.min\(i \* 24, 320\)/.test(app));
kontrol('CSS: shimmer', /@keyframes shimmer/.test(css));
kontrol('CSS: kart giriş animasyonu', /@keyframes kartGiris/.test(css));
kontrol('CSS: iskelet sönme', /@keyframes iskeletSonme/.test(css));

/* ---------------------------------------------------------------- */
bolum('4) Bento özet');
kontrol('HTML: bento alanı', /id="bentoOzet"[^>]*class="bento-ozet"/.test(html));
kontrol('app: bento hesaplama', /function bentoVerisiHesapla/.test(app));
kontrol('app: spotlight + trend + dağılım', /bento-spot/.test(app) && /bento-trend/.test(app) && /bento-dagilim/.test(app));
kontrol('app: en ucuz stok filtresi', /const uygun = fiyatli\.filter\(x => x\.stokta\)/.test(app));
kontrol('app: fark ve yüzde', /const fark = enUcuz && enPahali/.test(app) && /yuzde/.test(app));
kontrol('app: gerçek sparkline (SVG)', /function bentoSparklineCiz/.test(app)
  && /getElementById\('bentoSparkline'\)/.test(app));
kontrol('app: geçmiş yoksa dürüst mesaj', /Henüz yeterli fiyat geçmişi yok/.test(app));
kontrol('app: kargo rozeti', /Kargo dahil/.test(app));
kontrol('app: CTA mağaza linki', /class="bento-cta" href="\$\{esc\(link\)\}"/.test(app));
kontrol('app: kart favicon', /function faviconUrl/.test(app) && /class="site-favicon"/.test(app));
kontrol('CSS: bento grid', /\.bento-ozet\s*\{[^}]*grid-template-columns/s.test(css));
kontrol('CSS: bento mobil tek kolon', /@media \(max-width: 720px\)[\s\S]{0,200}\.bento-ozet\s*\{\s*grid-template-columns:\s*1fr/s.test(css));

/* ---------------------------------------------------------------- */
bolum('5) Mobil alt navigasyon');
kontrol('HTML: alt nav', /id="altNav"[^>]*class="alt-nav"/.test(html));
for (const ad of ['karsilastir', 'borsa', 'takipler', 'ayarlar']) {
  kontrol(`alt nav öğesi: ${ad}`, new RegExp(`data-nav="${ad}"`).test(html));
}
kontrol('alt nav: tam 4 öğe', (html.match(/class="alt-nav-oge[^"]*" data-nav=/g) || []).length === 4);
kontrol('alt nav: Sepetim yok', !/data-nav="sepet"/.test(html));
kontrol('alt nav: Dip Fırsatlar etiketi', /data-nav="borsa"[\s\S]{0,180}Dip Fırsatlar</.test(html));
kontrol('alt nav: Alarmlarım etiketi', />Alarmlarım</.test(html));
kontrol('alt nav: Ara & Kıyasla etiketi', /Ara &amp; Kıyasla/.test(html));
kontrol('vitrin: fırsatlar çipi (alt bardan taşındı)', /data-firsat-ac/.test(html));
kontrol('vitrin: canlı borsa bölümü', /id="vitrinAlani"/.test(html) && /id="vitrinGrid"/.test(html));
kontrol('vitrin: CSS ızgara', /\.vitrin-grid\s*\{[^}]*grid-template-columns/.test(css));
kontrol('HTML: modal', /id="altModal"/.test(html) && /role="dialog"/.test(html));
kontrol('app: takipler modalı', /function altNavTakipler/.test(app) && /\/api\/tracked/.test(app));
kontrol('app: fırsatlar modalı', /function altNavFirsatlar/.test(app) && /\/api\/firsat\/durum/.test(app));
kontrol('app: sepet kaydırma', /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/.test(app));
kontrol('app: modal kapatma (perde/Esc)', /\[data-modal-kapat\]/.test(app) && /e\.key === 'Escape'/.test(app));
// 2026-11-15: masaüstünde yalnızca .alt-nav gizlenir; .alt-modal masaüstünde
// ortalanmış diyalog olarak AÇILABİLMELİ (Sitene Ekle) — bu yüzden alt-modal
// gizleme kuralı kaldırıldı, test bunu doğruluyor.
kontrol('CSS: masaüstünde alt navigasyon gizli', /@media \(min-width: 769px\)[\s\S]{0,400}\.alt-nav\s*\{\s*display:\s*none/s.test(css));
kontrol('CSS: masaüstünde modal gizlenmiyor', !/@media \(min-width: 769px\)\s*\{[^}]*\.alt-modal[^{]*\{[^}]*display:\s*none/s.test(css));
kontrol('CSS: mobilde sabit', /@media \(max-width: 768px\)[\s\S]{0,300}\.alt-nav\s*\{[^}]*position:\s*fixed/s.test(css));
kontrol('CSS: safe-area', /env\(safe-area-inset-bottom/.test(css));
kontrol('CSS: dokunma efekti', /\.alt-nav-oge:active\s*\{[^}]*scale\(\.94\)/s.test(css));
kontrol('CSS: iOS zoom önleme (16px)', /font-size:\s*16px/.test(css));
kontrol('CSS: scroll-padding', /scroll-padding-top:\s*84px/.test(css));

/* ---------------------------------------------------------------- */
bolum('6) Kontrast (WCAG AA)');
/** '#RRGGBB' → göreli parlaklık. */
function parlaklik(hex) {
  const h = String(hex).replace('#', '');
  const kanal = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * kanal[0] + 0.7152 * kanal[1] + 0.0722 * kanal[2];
}
function kontrast(a, b) {
  const l1 = parlaklik(a), l2 = parlaklik(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
// Değerler style.css'ten okunur (kopya değil, gerçek kaynak).
function degisken(blok, ad) {
  const re = new RegExp('--' + ad + ':\\s*(#[0-9A-Fa-f]{6})');
  return blok.match(re)?.[1] || null;
}
const acikBlok = css.slice(css.indexOf(':root {'), css.indexOf('html[data-theme="dark"]'));
const koyuBlok = css.slice(css.indexOf('html[data-theme="dark"]'));
const ciftler = [
  ['AÇIK metin/kart', acikBlok, 'metin', acikBlok, 'kart'],
  ['AÇIK gövde/zemin', acikBlok, 'gri-metin', acikBlok, 'zemin'],
  ['AÇIK hafif/kart', acikBlok, 'gri-metin-hafif', acikBlok, 'kart'],
  ['AÇIK placeholder/kart', acikBlok, 'gri-secil', acikBlok, 'kart'],
  ['AÇIK marka/ana-acik', acikBlok, 'ana', acikBlok, 'ana-acik'],
  ['AÇIK yeşil/yeşil-acik', acikBlok, 'yesil', acikBlok, 'yesil-acik'],
  ['AÇIK kırmızı/kırmızı-acik', acikBlok, 'kirmizi', acikBlok, 'kirmizi-acik'],
  ['KOYU metin/kart', koyuBlok, 'metin', koyuBlok, 'kart'],
  ['KOYU gövde/zemin', koyuBlok, 'gri-metin', koyuBlok, 'zemin'],
  ['KOYU hafif/kart', koyuBlok, 'gri-metin-hafif', koyuBlok, 'kart'],
  ['KOYU placeholder/kart', koyuBlok, 'gri-secil', koyuBlok, 'kart'],
  ['KOYU marka-parlak/kart', koyuBlok, 'ana-parlak', koyuBlok, 'kart'],
  ['KOYU yeşil/kart', koyuBlok, 'yesil', koyuBlok, 'kart'],
  ['KOYU kırmızı/kart', koyuBlok, 'kirmizi', koyuBlok, 'kart'],
];
for (const [ad, b1, v1, b2, v2] of ciftler) {
  const r1 = degisken(b1, v1), r2 = degisken(b2, v2);
  if (!r1 || !r2) { kontrol(ad, false, `${r1} / ${r2}`); continue; }
  const oran = kontrast(r1, r2);
  kontrol(`${ad} ≥ 4.5`, oran >= 4.5, oran.toFixed(2) + ':1');
}

/* ---------------------------------------------------------------- */
bolum('7) 📍 Link aramasında otomatik kaydırma (2026-11-11)');

// CSS: sticky navbar altına girmeyi önleyen kaydırma boşluğu.
// 2026-11-11: tek kaynak `html { scroll-padding-top: 84px }`. Element bazlı
// 84 px scroll-margin eklenirse ikisi TOPLANIR (168 px) → ölü boşluk.
kontrol('CSS: scroll-padding-top 84px (tek kaynak)',
  /html\s*\{\s*scroll-padding-top:\s*84px;\s*\}/.test(css));
kontrol('CSS: kaydırma hedefleri listesinde #durumAlani var',
  /\.hibrit-kart,[\s\S]{0,120}#durumAlani[\s\S]{0,120}#sonucAlani[\s\S]{0,120}#sepetSonuc[\s\S]{0,120}\.takip-alani\s*\{[^}]*scroll-margin-top:\s*0/s.test(css));
kontrol('CSS: hedeflerde çift boşluk yok (margin 0)',
  /#durumAlani[\s\S]{0,160}scroll-margin-top:\s*0/.test(css));
kontrol('CSS: #durumAlani 84px çift margin ile ezilmiyor',
  !/#durumAlani[\s\S]{0,160}scroll-margin-top:\s*84px/.test(css));

// Form gönderimi: canlı tarama alanına yumuşak kaydırma (60 ms gecikme).
const submitBolum = app.slice(app.indexOf("$('#karsilastirForm').addEventListener('submit'"));
kontrol('app: submit içinde #durumAlani kaydırma',
  /getElementById\('durumAlani'\)[\s\S]{0,260}scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/.test(submitBolum));
kontrol('app: kaydırma setTimeout 60 ms',
  /setTimeout\(\(\) => \{[\s\S]{0,260}durumAlani[\s\S]{0,120}\}, 60\)/.test(submitBolum));
kontrol('app: durumAlani hidden kontrolü',
  /hedef && !hedef\.hidden/.test(app));

// Sonuç geldiğinde sonuç alanına odaklanma (kaydir: true).
kontrol('app: SWR anlık sonuç kaydir: true', /sonucGoster\(onbellekSonuc, \{ kaydir: true/.test(app));
const kaydirTrue = (app.match(/sonucGoster\(job\.result, \{ kaydir: true/g) || []).length;
kontrol('app: final + geri yükleme kaydir: true (2 yer)', kaydirTrue >= 2, String(kaydirTrue));
kontrol('app: eski sabit kaydir: false kalmadı (final)',
  !/sonucGoster\(job\.result, \{ kaydir: false \}\)/.test(app));

// Anti-jitter: canlı/kısmi SSE güncellemeleri kaydırmaz.
kontrol('app: sonucGoster kaydırma canli/keepDurum ile korunur',
  /opts\.kaydir === true && opts\.canli !== true && opts\.keepDurum !== true/.test(app));
kontrol('app: kaydırma hedefi hidden değilse',
  /const hedef = document\.getElementById\('sonucAlani'\);\s*\n\s*if \(hedef && !hedef\.hidden\)/.test(app)
  || /hedef && !hedef\.hidden/.test(app.slice(app.indexOf('opts.kaydir === true'))));
kontrol('app: sonuç kaydırma setTimeout 50 ms',
  /setTimeout\(\(\) => \{[\s\S]{0,240}sonucAlani[\s\S]{0,140}\}, 50\)/.test(app));
kontrol('app: canlı akış kaydırma yapmaz',
  /sonucGoster\(liveResult, \{ keepDurum: true, kaydir: false, canli: true/.test(app));
kontrol('app: tazeleme kaydırma yapmaz',
  /sonucGoster\(birlestirilmis, \{ keepDurum: true, kaydir: false, canli: true/.test(app));

/* ---------------------------------------------------------------- */
bolum('8) ✨ Görsel cila & mikro-etkileşimler (2026-11-12)');

// --- 1) Kart hover / yükselme ---
kontrol('CSS: vitrin-kart translateY(-4px) yükselme',
  /\.vitrin-kart:hover,\s*\n?\.vitrin-kart:focus-visible\s*\{[^}]*translateY\(-4px\)/s.test(css));
kontrol('CSS: vitrin-kart expo-out geçiş eğrisi',
  /\.vitrin-kart\s*\{[^}]*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/s.test(css));
kontrol('CSS: vitrin-kart will-change transform',
  /\.vitrin-kart\s*\{[^}]*will-change:\s*transform,\s*box-shadow/s.test(css));
kontrol('CSS: vitrin-kart :active 2px',
  /\.vitrin-kart:active\s*\{\s*transform:\s*translateY\(-2px\)/.test(css));
kontrol('CSS: vitrin-kart indigo kenarlık parıltısı',
  /\.vitrin-kart:hover[\s\S]{0,260}rgba\(99,\s*102,\s*241,\s*0?\.45\)/.test(css));
kontrol('CSS: dip kart yeşil hover parıltısı',
  /\.vitrin-kart-dip:hover[\s\S]{0,220}rgba\(5,\s*150,\s*105,\s*0?\.22\)/.test(css));
kontrol('CSS: urun-karti translateY(-4px)',
  /\.urun-karti:hover\s*\{[^}]*translateY\(-4px\)/s.test(css));
kontrol('CSS: urun-karti expo-out geçiş',
  /\.urun-karti\s*\{[^}]*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/s.test(css));
kontrol('CSS: en-ucuz kart yeşil hover',
  /\.urun-karti\.en-ucuz:hover\s*\{[^}]*rgba\(16,\s*185,\s*129,\s*0?\.65\)/s.test(css));
kontrol('CSS: koyu tema kart hover kuralı',
  /html\[data-theme="dark"\]\s*\.vitrin-kart:hover/.test(css)
  && /html\[data-theme="dark"\]\s*\.urun-karti:hover/.test(css));

// --- 2) Sparkline çizim animasyonu ---
kontrol('CSS: sparkline stroke-dasharray 100',
  /\.vitrin-spark-cizgi\s*\{[^}]*stroke-dasharray:\s*100/s.test(css));
kontrol('CSS: sparkline dashoffset 100 (gizli başlangıç)',
  /\.vitrin-spark-cizgi\s*\{[^}]*stroke-dashoffset:\s*100/s.test(css));
kontrol('CSS: sparkCiz keyframes', /@keyframes sparkCiz\s*\{\s*to\s*\{\s*stroke-dashoffset:\s*0/s.test(css));
kontrol('CSS: sparkAlan keyframes', /@keyframes sparkAlan/.test(css));
kontrol('CSS: spark alanı 0.2s gecikmeli', /\.vitrin-spark-alan\s*\{[^}]*animation:[^;]*0\.2s/s.test(css));
kontrol('CSS: sparkline reduced-motion kapatır',
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,220}\.vitrin-spark-cizgi[\s\S]{0,160}animation:\s*none/s.test(css));
kontrol('app: polyline pathLength=100 (normalize dash)',
  /<polyline class="vitrin-spark-cizgi" pathLength="100"/.test(app));

// --- 3) Rozet nabzı ---
kontrol('CSS: .vitrin-rozet.dip nabız animasyonu',
  /\.vitrin-rozet\.dip\s*\{[^}]*animation:\s*rozetNabizYesil 2\.8s/s.test(css));
kontrol('CSS: rozetNabizYesil keyframes', /@keyframes rozetNabizYesil/.test(css));
kontrol('CSS: .vitrin-rozet.indirim nabız animasyonu',
  /\.vitrin-rozet\.indirim\s*\{[^}]*animation:\s*rozetNabizKirmizi 2\.8s/s.test(css));
kontrol('CSS: rozetNabizKirmizi keyframes', /@keyframes rozetNabizKirmizi/.test(css));
kontrol('CSS: sahte-indirim rozeti turuncu nabız',
  /\.sahte-indirim-rozet\s*\{[^}]*animation:\s*rozetNabizTuruncu/s.test(css));
kontrol('CSS: nabız scale(1.03) (abartısız)',
  /@keyframes rozetNabizYesil\s*\{[\s\S]{0,220}scale\(1\.03\)/.test(css));
kontrol('CSS: rozet nabzı reduced-motion kapatır',
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,320}\.vitrin-rozet\.dip[\s\S]{0,160}animation:\s*none/s.test(css));
kontrol('CSS: fırsat rozetleri font-weight 800',
  /\.vitrin-rozet\.dip,\s*\n?\.vitrin-rozet\.indirim,[\s\S]{0,200}font-weight:\s*800/.test(css));

// --- 4) Toast & buton geri bildirimi ---
kontrol('HTML: evrensel toast konteyneri', /id="genelToast"/.test(html));
kontrol('HTML: toast role=status + aria-live=polite',
  /id="genelToast"[^>]*role="status"[^>]*aria-live="polite"/.test(html));
kontrol('HTML: toast ikon + metin alanları',
  /id="genelToastIkon"/.test(html) && /id="genelToastMetin"/.test(html));
kontrol('HTML: toast başlangıçta hidden', /id="genelToast"[^>]*hidden/.test(html));
kontrol('CSS: .mikro-toast fixed konum', /\.mikro-toast\s*\{[^}]*position:\s*fixed/s.test(css));
kontrol('CSS: toast safe-area-inset-bottom',
  /\.mikro-toast\s*\{[^}]*env\(safe-area-inset-bottom/s.test(css));
kontrol('CSS: toast z-index 9999', /\.mikro-toast\s*\{[^}]*z-index:\s*9999/s.test(css));
kontrol('CSS: toast pointer-events none', /\.mikro-toast\s*\{[^}]*pointer-events:\s*none/s.test(css));
kontrol('CSS: toastGir / toastCik keyframes',
  /@keyframes toastGir/.test(css) && /@keyframes toastCik/.test(css));
kontrol('CSS: mobilde alt navigasyon üstünde toast',
  /@media \(max-width: 768px\)[\s\S]{0,160}\.mikro-toast\s*\{[^}]*bottom:[^;]*76px/s.test(css));
kontrol('CSS: .btn-kopyalandi yeşil onay',
  /\.btn-kopyalandi\s*\{[^}]*background:\s*#065F46/s.test(css));

kontrol('app: toastGoster tanımlı', /function toastGoster\(metin, tur = 'basarili'\)/.test(app));
kontrol('app: toast 1.5 sn sonra kapanır',
  /toastZamanlayici = setTimeout\([\s\S]{0,420}\}, 1500\)/.test(app));
kontrol('app: toast kapanış animasyonu sınıfı', /classList\.add\('kapanis'\)/.test(app));
kontrol('app: toast ikon türleri (✓/⚠️/ℹ️)',
  /tur === 'basarili' \? '✓' : \(tur === 'hata' \? '⚠️' : 'ℹ️'\)/.test(app));
kontrol('app: panoyaKopyalaVeGeriBildirim tanımlı',
  /async function panoyaKopyalaVeGeriBildirim\(/.test(app));
kontrol('app: pano yedeği kopyala() ile',
  /typeof kopyala === 'function'/.test(app));
kontrol('app: buton onayı 1.5 sn sonra geri alınır',
  /classList\.add\('btn-kopyalandi'\)[\s\S]{0,320}\}, 1500\)/.test(app));
kontrol('app: sepet kopyala butonu yardımcıyı kullanır',
  /sepetPaylasLinki,\s*\n?\s*btn,\s*\n?\s*'Sepet bağlantısı panoya kopyalandı!'/.test(app));
kontrol('app: kupon kodu kopyalama yardımcıyı kullanır',
  /panoyaKopyalaVeGeriBildirim\(kod, btn,/.test(app));
kontrol('app: kupon hepsini kopyala yardımcıyı kullanır',
  /panoyaKopyalaVeGeriBildirim\(metin, hepsi,/.test(app));
kontrol('app: gömme kodu kopyalama yardımcıyı kullanır',
  /panoyaKopyalaVeGeriBildirim\(metin, kopyala,/.test(app));
kontrol('app: toast aria canlı bölge (role=status) HTML ile',
  /role="status"/.test(html));

/* ---------------------------------------------------------------- */
bolum('9) 🛡️ Hata yönetimi, boş durumlar & ağ dayanıklılığı (2026-11-12)');

// --- Rehber hata kartı ---
kontrol('CSS: hata-kutusu nötr kart (beyaz zemin)',
  /\.hata-kutusu\s*\{[^}]*background:\s*var\(--kart\)/s.test(css));
kontrol('CSS: hata-kutusu yumuşak kırmızı kenar',
  /\.hata-kutusu\s*\{[^}]*rgba\(239,\s*68,\s*68,\s*0?\.25\)/s.test(css));
kontrol('CSS: hata-kutusu 16px yuvarlak + gölge',
  /\.hata-kutusu\s*\{[^}]*border-radius:\s*16px[^}]*box-shadow/s.test(css));
kontrol('CSS: rehber-hata-icerik flex', /\.rehber-hata-icerik\s*\{[^}]*display:\s*flex/s.test(css));
kontrol('CSS: rehber-hata-ikon', /\.rehber-hata-ikon\s*\{[^}]*font-size:\s*26px/s.test(css));
kontrol('CSS: rehber-hata-baslik 800', /\.rehber-hata-baslik\s*\{[^}]*font-weight:\s*800/s.test(css));
kontrol('CSS: rehber-ornek-btn çip stili', /\.rehber-ornek-btn\s*\{[^}]*border-radius:\s*999px/s.test(css));
kontrol('CSS: rehber-ornek-btn hover yükselme', /\.rehber-ornek-btn:hover\s*\{[^}]*translateY\(-1px\)/s.test(css));

kontrol('app: REHBER_ORNEK_URUNLER listesi', /const REHBER_ORNEK_URUNLER = \[/.test(app));
kontrol('app: 3+ gerçek örnek ürün', (app.match(/ad: '[^']+', url: 'https:\/\//g) || []).length >= 3);
kontrol('app: hataGoster tur parametresi alır', /function hataGoster\(mesaj, tur = 'genel'\)/.test(app));
kontrol('app: kategori durumu başlığı', /Doğrudan Ürün Linki Gerekiyor/.test(app));
kontrol('app: ağ hatası başlığı', /İnternet Bağlantısı Hatası/.test(app));
kontrol('app: hata türü otomatik sezimi', /kategori\|desteklenmiyor\|ürün linki/.test(app));
kontrol('app: örnek çip tek tıkla arama başlatır',
  /querySelectorAll\('\.rehber-ornek-btn'\)[\s\S]{0,500}requestSubmit/.test(app));
kontrol('app: örnek çip input değerini doldurur',
  /dataset\.ornekUrl[\s\S]{0,200}input\.value = u/.test(app));

// --- Tükendi → alternatifler ---
kontrol('CSS: tukendi-alternatif-blok dashed kenar',
  /\.tukendi-alternatif-blok\s*\{[^}]*border:[^;]*dashed/s.test(css));
kontrol('CSS: alternatif blok tam satır (1 / -1)',
  /\.tukendi-alternatif-blok\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(css));
kontrol('CSS: tükendi başlığı kırmızı', /\.tukendi-alternatif-baslik\s*\{[^}]*color:\s*#B91C1C/s.test(css));
kontrol('CSS: koyu tema tükendi başlığı', /html\[data-theme="dark"\]\s*\.tukendi-alternatif-baslik/.test(css));
kontrol('app: tukendiAlternatifleriniEkle tanımlı', /function tukendiAlternatifleriniEkle\(/.test(app));
kontrol('app: alternatifler stokta + fiyatlı filtrelenir',
  /filter\(u => u && u\.stokta && Number\(u\.fiyat\) > 0\)/.test(app));
kontrol('app: en fazla 3 alternatif', /kaynak\.slice\(0, 3\)/.test(app));
kontrol('app: alternatifler canlı vitrinden', /Array\.isArray\(vitrinUrunleri\)/.test(app));
kontrol('app: tükendi/0-teklif durumunda çağrılır',
  /tukendiAlternatifleriniEkle\(\{ tamamiTukendi, hicBulunamadi: bulunanlar\.length === 0 \}\)/.test(app));
kontrol('app: tükendi başlık metni', /tüm mağazalarda tükenmiş görünüyor/.test(app));
kontrol('app: bulunamadı başlık metni', /eşleşen fiyat bulunamadı/.test(app));
kontrol('app: alternatif blok tekrar eklenmez',
  /querySelectorAll\('\.tukendi-alternatif-blok'\)\.forEach\(el => el\.remove\(\)\)/.test(app));

// --- Erken sonuç butonu ---
kontrol('CSS: erken-sonuc-btn degrade mor',
  /\.erken-sonuc-btn\s*\{[^}]*linear-gradient\(135deg,\s*#4F46E5/s.test(css));
kontrol('CSS: erken-sonuc-btn 999px çip', /\.erken-sonuc-btn\s*\{[^}]*border-radius:\s*999px/s.test(css));
kontrol('CSS: erken-sonuc-btn pulse animasyonu',
  /\.erken-sonuc-btn\s*\{[^}]*animation:\s*pulseButon/s.test(css));
kontrol('CSS: pulseButon keyframes', /@keyframes pulseButon/.test(css));
kontrol('CSS: erken buton reduced-motion kapatır',
  /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.erken-sonuc-btn\s*\{\s*animation:\s*none/s.test(css));
kontrol('app: ERKEN_SONUC_MS = 10000', /const ERKEN_SONUC_MS = 10000;/.test(app));
kontrol('app: erken sonuç zamanlayıcısı', /function erkenSonucZamanlayicisiniKur\(\)/.test(app));
kontrol('app: en az 1 mağaza hazır şartı',
  /querySelectorAll\('#siteCipleri \.cip\.bulundu'\)\.length/.test(app));
kontrol('app: buton metni mağaza sayısını taşır',
  /Kalanı beklemeden bulunan sonuçları göster \(\$\{hazir\} Mağaza Hazır\)/.test(app));
kontrol('app: buton iptal akışını tetikler', /karsilastirmayiIptalEt\(\)/.test(app));
kontrol('app: submit içinde zamanlayıcı kurulur',
  /iptalDurumunuSifirla\(\);\s*\n\s*\/\/[^\n]*\n\s*erkenSonucZamanlayicisiniKur\(\);/.test(app));
kontrol('app: kesin sonuçta buton kaldırılır',
  /if \(opts\.canli !== true && opts\.keepDurum !== true\) erkenSonucButonunuKaldir\(\)/.test(app));
kontrol('app: hata durumunda buton kaldırılır',
  /iptalDurumunuSifirla\(\);\s*\n\s*erkenSonucButonunuKaldir\(\);/.test(app));

// --- Ağ durumu ---
kontrol('app: offline dinleyicisi', /addEventListener\('offline'/.test(app));
kontrol('app: online dinleyicisi', /addEventListener\('online'/.test(app));
kontrol('app: offline toast hatası', /İnternet bağlantınız koptu/.test(app));
kontrol('app: online toast onayı', /İnternet bağlantısı yeniden sağlandı/.test(app));

/* ---------------------------------------------------------------- */
bolum('10) 📱 Mobil dokunmatik ergonomi (2026-11-12)');

// --- Viewport / klavye ---
kontrol('HTML: viewport interactive-widget=resizes-content',
  /name="viewport"[^>]*interactive-widget=resizes-content/.test(html));
kontrol('HTML: viewport-fit=cover korunur', /name="viewport"[^>]*viewport-fit=cover/.test(html));
kontrol('app: mobil klavye ergonomisi fonksiyonu',
  /function mobilKlavyeErgonomisiAyarla\(\)/.test(app));
kontrol('app: input focus → form ortalanır',
  /urunInput\.addEventListener\('focus'[\s\S]{0,320}block: 'center'/.test(app));
kontrol('app: klavye animasyonu için 250 ms gecikme',
  /addEventListener\('focus'[\s\S]{0,400}\}, 250\)/.test(app));
kontrol('app: visualViewport resize dinlenir',
  /window\.visualViewport\.addEventListener\('resize'/.test(app));
kontrol('app: buton görünür alan dışındaysa kaydırır',
  /kutu\.bottom > gorunurAlt \|\| kutu\.top < 0/.test(app));
kontrol('app: masaüstünde klavye mantığı çalışmaz',
  /const mobilMi = \(\) => window\.innerWidth <= 768;/.test(app));
kontrol('app: reduced-motion → animasyonsuz kaydırma',
  /prefers-reduced-motion: reduce[\s\S]{0,80}'auto' : 'smooth'/.test(app));
kontrol('app: DOMContentLoaded / hazırsa hemen başlat',
  /document\.readyState === 'loading'/.test(app) && /mobilKlavyeErgonomisiAyarla\(\);/.test(app));

// --- Dokunma alanları ≥ 44px ---
kontrol('CSS: mobil arama input 16px (iOS zoom)',
  /@media \(max-width: 640px\)[\s\S]{0,2200}\.arama-satiri input\s*\{[^}]*font-size:\s*16px\s*!important/s.test(css));
kontrol('CSS: mobil arama input min-height ≥48px',
  /\.arama-satiri input\s*\{[^}]*min-height:\s*48px/s.test(css)
  && /\.hibrit-form input,[\s\S]{0,80}\.arama-satiri input\s*\{[^}]*min-height:\s*48px/s.test(css));
kontrol('CSS: mobil arama butonu tam genişlik + 50px',
  /#araBtn\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*50px/s.test(css)
  || /\.arama-satiri button,\s*\n\s*#araBtn\s*\{[^}]*min-height:\s*50px/s.test(css));
kontrol('CSS: kategori çipi min-height 44px',
  /\.vitrin-filtre-cip\s*\{[^}]*min-height:\s*44px/s.test(css));
kontrol('CSS: hızlı arama çipi min-height 40px',
  /\.hizli-cip\s*\{[^}]*min-height:\s*40px/s.test(css));

// --- Yatay scroll-snap carousel ---
kontrol('CSS: vitrin-filtre scroll-snap x mandatory',
  /\.vitrin-filtre\s*\{[^}]*scroll-snap-type:\s*x mandatory/s.test(css));
kontrol('CSS: kategori çipi scroll-snap-align start',
  /\.vitrin-filtre-cip\s*\{[^}]*scroll-snap-align:\s*start/s.test(css));
kontrol('CSS: hızlı-arama scroll-snap x mandatory',
  /\.hizli-arama\s*\{[^}]*scroll-snap-type:\s*x mandatory/s.test(css));
kontrol('CSS: mobil vitrin-grid flex carousel',
  /@media \(max-width: 580px\)[\s\S]{0,400}\.vitrin-grid\s*\{[^}]*display:\s*flex/s.test(css));
kontrol('CSS: mobil vitrin-grid scroll-snap x mandatory',
  /@media \(max-width: 580px\)[\s\S]{0,500}scroll-snap-type:\s*x mandatory/s.test(css));
kontrol('CSS: mobil kart scroll-snap-align center',
  /@media \(max-width: 580px\)[\s\S]{0,900}\.vitrin-kart\s*\{[^}]*scroll-snap-align:\s*center/s.test(css));
kontrol('CSS: mobil kart genişliği 78vw (yan kart görünür)',
  /\.vitrin-kart\s*\{[^}]*flex:\s*0 0 78vw/s.test(css));
kontrol('CSS: mobil carousel margin negatif (kenara taşma)',
  /@media \(max-width: 580px\)[\s\S]{0,500}\.vitrin-grid\s*\{[^}]*margin:\s*0 -14px/s.test(css));
kontrol('CSS: carousel scrollbar gizli',
  /\.vitrin-grid::-webkit-scrollbar\s*\{\s*display:\s*none/.test(css));
kontrol('CSS: alternatif blok kartları da carousel',
  /\.tukendi-alternatif-blok \.vitrin-kart\s*\{[^}]*flex:\s*0 0 82vw/s.test(css));
kontrol('CSS: mobilde overscroll-behavior-x contain',
  /overscroll-behavior-x:\s*contain/.test(css));
kontrol('CSS: masaüstü vitrin ızgarası korunur (grid)',
  /\.vitrin-grid\s*\{\s*\n?\s*display:\s*grid;\s*\n?\s*grid-template-columns:\s*repeat\(4/s.test(css));
kontrol('CSS: reduced-motion carousel scroll-behavior auto',
  /prefers-reduced-motion: reduce[\s\S]{0,220}scroll-behavior:\s*auto/.test(css));

/* ---------------------------------------------------------------- */
bolum('11) 💎 Net tasarruf bandı, kargo eşiği & güvenilirlik mührü (2026-11-12)');

// --- HTML iskeleti ---
kontrol('HTML: tasarruf bandı konteyneri', /id="tasarrufVurguBanti"[^>]*class="tasarruf-vurgu-banti"/.test(html));
kontrol('HTML: bant başlangıçta hidden', /id="tasarrufVurguBanti"[^>]*hidden/.test(html));
kontrol('HTML: 🎉 ikon', /class="tasarruf-vurgu-ikon"[^>]*>🎉</.test(html));
kontrol('HTML: tutar + detay alanları', /id="tasarrufVurguTutar"/.test(html) && /id="tasarrufVurguDetay"/.test(html));
kontrol('HTML: doğrulama mührü + nokta', /id="dogrulamaMuhru"/.test(html) && /class="dogrulama-nokta"/.test(html));
kontrol('HTML: bant bento özetten ÖNCE gelir',
  html.indexOf('id="tasarrufVurguBanti"') < html.indexOf('id="bentoOzet"'));
kontrol('HTML: bant sonuç alanı içinde',
  (() => {
    const bas = html.indexOf('id="sonucAlani"');
    const bant = html.indexOf('id="tasarrufVurguBanti"');
    return bas > -1 && bant > bas;
  })());

// --- CSS ---
kontrol('CSS: bant flex + zümrüt degrade',
  /\.tasarruf-vurgu-banti\s*\{[^}]*display:\s*flex[^}]*linear-gradient\(135deg,\s*rgba\(16,\s*185,\s*129/s.test(css));
kontrol('CSS: bant 16px yuvarlak + gölge',
  /\.tasarruf-vurgu-banti\s*\{[^}]*border-radius:\s*16px[^}]*box-shadow/s.test(css));
kontrol('CSS: tutar 800 ağırlık + zümrüt',
  /\.tasarruf-vurgu-tutar\s*\{[^}]*font-weight:\s*800[^}]*color:\s*#065F46/s.test(css));
kontrol('CSS: detay metni', /\.tasarruf-vurgu-detay\s*\{[^}]*color:\s*#047857/s.test(css));
kontrol('CSS: doğrulama mührü çip', /\.dogrulama-muhru\s*\{[^}]*border-radius:\s*999px/s.test(css));
kontrol('CSS: doğrulama noktası yeşil', /\.dogrulama-nokta\s*\{[^}]*background:\s*#10B981/s.test(css));
kontrol('CSS: kargo eşiği ipucu amber',
  /\.kargo-esik-ipucu\s*\{[^}]*rgba\(245,\s*158,\s*11,\s*0?\.10?\)/s.test(css)
  && /\.kargo-esik-ipucu\s*\{[^}]*color:\s*#B45309/s.test(css));
kontrol('CSS: kargo ipucu 8px yuvarlak', /\.kargo-esik-ipucu\s*\{[^}]*border-radius:\s*8px/s.test(css));
kontrol('CSS: koyu tema bant', /html\[data-theme="dark"\]\s*\.tasarruf-vurgu-banti\s*\{/.test(css));
kontrol('CSS: koyu tema tutar #34D399', /html\[data-theme="dark"\]\s*\.tasarruf-vurgu-tutar\s*\{[^}]*#34D399/.test(css));
kontrol('CSS: koyu tema kargo ipucu', /html\[data-theme="dark"\]\s*\.kargo-esik-ipucu\s*\{[^}]*#FCD34D/.test(css));
kontrol('CSS: mobilde bant dikey', /@media \(max-width: 640px\)[\s\S]{0,200}\.tasarruf-vurgu-banti\s*\{[^}]*flex-direction:\s*column/s.test(css));
kontrol('CSS: reduced-motion bant animasyonsuz',
  /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,160}\.tasarruf-vurgu-banti\s*\{\s*animation:\s*none/.test(css));

// --- JS: tasarruf bandı ---
kontrol('app: tasarrufBandiCiz tanımlı', /function tasarrufBandiCiz\(sonuc, opts = \{\}\)/.test(app));
kontrol('app: sonuç çiziminde çağrılıyor', /tasarrufBandiCiz\(sonuc, \{ yasMetni: opts\.yasMetni \|\| null \}\)/.test(app));
kontrol('app: yalnızca stokta + aynı renk teklifler',
  /r\.product\.inStock !== false && r\.renkAyni !== false/.test(app));
kontrol('app: en az 2 teklif şartı', /stokluTeklifler\.length < 2/.test(app));
kontrol('app: en az 2 teklif yoksa bant gizli', /bant\.hidden = true;\s*\n\s*return;/.test(app));
kontrol('app: net tasarruf metni', /net tasarruf<\/b> ediyorsunuz!/.test(app));
kontrol('app: yüzde kazanç hesabı', /yuzdeKazanc = Math\.round\(\(netFark \/ enPahali\.fiyat\) \* 100\)/.test(app));
kontrol('app: en ucuz + en pahalı mağaza detayda',
  /En ucuz: \$\{tl\(enUcuz\.fiyat\)\} \(\$\{enUcuz\.site\}\)/.test(app));
kontrol('app: fark yoksa "en dip fiyat" mesajı', /Tüm mağazalarda en dip fiyat/.test(app));

// --- JS: güvenilirlik mührü ---
kontrol('app: muhurYasi modül değişkeni', /let muhurYasi = null;/.test(app));
kontrol('app: canlı sonuçta "Az önce ... canlı doğrulandı"',
  /Az önce \$\{siteSayisi\} mağazadan canlı doğrulandı/.test(app));
kontrol('app: bayat veride yaş metni', /`🕒 \$\{yas\} \$\{siteSayisi\} mağazadan doğrulandı`/.test(app));
kontrol('app: site sayısı dinamik (SITE_SIRASI)', /SITE_SIRASI\.length\) \? SITE_SIRASI\.length : 62/.test(app));
kontrol('app: SWR önbellekte yasMetni iletilir',
  /sonucGoster\(onbellekSonuc, \{ kaydir: true, yasMetni: data\.yasMetni \|\| null \}\)/.test(app));
kontrol('app: önbellek geri yüklemede geçmiş yaşı',
  /sonucGoster\(job\.result, \{ kaydir: true, yasMetni: gecmisYas \}\)/.test(app));
kontrol('app: taze tarama mührü sıfırlar', /sonucGoster\(job\.result, \{ kaydir: true, taze: true \}\)/.test(app));
kontrol('app: tazeleme bitince taze bayrağı', /taze: !!job\.tazelemeBitti/.test(app));

// --- JS: kargo eşiği ipucu ---
kontrol('app: kargoEsikIpucuHtml hesaplanır', /const kargoEsikIpucuHtml = \(!stoktaYok/.test(app));
kontrol('app: eşik 80 TL farkla sınırlı', /kargoEksik > 0 && kargoEksik <= 80/.test(app));
kontrol('app: kargo ücreti > 0 şartı', /&& kargoUcreti > 0\)/.test(app));
kontrol('app: stokta olmayan ürüne ipucu yok', /const kargoEsikIpucuHtml = \(!stoktaYok/.test(app));
kontrol('app: eşik alanları (freeOver) okunur',
  /pr\.kargo\?\.freeOver[\s\S]{0,80}p\.shippingInfo\?\.freeOver/.test(app));
kontrol('app: ipucu kargo alanına yerleşir', /\$\{kargoEsikIpucuHtml\}\s*\n\s*\$\{tamamlayiciButonu/.test(app));
kontrol('app: ipucu metni "kargo BEDAVA"', /kargo BEDAVA olur!/.test(app));
kontrol('app: TDZ yok — stoktaYok önce bildirilir',
  app.indexOf('const stoktaYok = p.inStock === false;') < app.indexOf('const kargoEsikIpucuHtml'));

/* ---------------------------------------------------------------- */
bolum('12) ⚡ Hız, CLS ve 60 FPS optimizasyonu (2026-11-12)');

// --- Skeleton ↔ gerçek kart piksel uyumu (CLS = 0) ---
kontrol('CSS: iskelet ızgarası gerçek ızgarayla aynı (360px)',
  /\.skeleton-izgara\s*\{[^}]*minmax\(360px,\s*1fr\)/s.test(css));
kontrol('CSS: iskelet ızgarası gap 20px (gerçek kartla aynı)',
  /\.skeleton-izgara\s*\{[^}]*gap:\s*20px/s.test(css));
kontrol('CSS: iskelet kartı padding 20px',
  /\.skeleton-kart\s*\{[^}]*padding:\s*20px/s.test(css));
kontrol('CSS: iskelet kartı border-radius var(--radius)',
  /\.skeleton-kart\s*\{[^}]*border-radius:\s*var\(--radius\)/s.test(css));
kontrol('CSS: iskelet kartı min-height 284px (ölçülen medyan)',
  /\.skeleton-kart\s*\{[^}]*min-height:\s*284px/s.test(css));
kontrol('CSS: iskelet box-sizing border-box', /\.skeleton-kart\s*\{[^}]*box-sizing:\s*border-box/s.test(css));
kontrol('CSS: iskelet resim 76x76 + aspect-ratio 1',
  /\.skeleton-resim\s*\{[^}]*width:\s*76px[^}]*height:\s*76px[^}]*aspect-ratio:\s*1/s.test(css));
kontrol('CSS: iskelet fiyat çizgisi', /\.skeleton-cizgi\.fiyat-cizgisi\s*\{[^}]*height:\s*24px/s.test(css));
kontrol('CSS: vitrin iskeleti min-height 168px (gerçek vitrin kartı)',
  /\.vitrin-iskelet\s*\{[^}]*min-height:\s*168px/s.test(css));
kontrol('CSS: vitrin iskeleti padding 14px 14px 12px',
  /\.vitrin-iskelet\s*\{[^}]*padding:\s*14px 14px 12px/s.test(css));
kontrol('CSS: mobil vitrin iskeleti 158px',
  /@media \(max-width: 520px\)[\s\S]{0,200}\.vitrin-iskelet\s*\{[^}]*min-height:\s*158px/s.test(css));
kontrol('CSS: shimmerAkici keyframes', /@keyframes shimmerAkici/.test(css));
kontrol('CSS: iskelet shimmer 1.4s', /animation:\s*shimmerAkici 1\.4s/s.test(css));

// --- Görsel lazy loading & LCP ---
kontrol('app: ürün resmi lazy + async decode',
  /loading="lazy"[\s\S]{0,80}decoding="async"/.test(app));
kontrol('app: ürün resmi fetchpriority low', /fetchpriority="low"/.test(app));
kontrol('app: ürün resmi sabit 76x76', /width="76"[\s\S]{0,40}height="76"/.test(app));
kontrol('app: ürün resmi alt metni', /alt="\$\{esc\(p\.title \|\| 'Ürün'\)\}"/.test(app));
kontrol('app: kırık resimde this.onerror=null (bellek)',
  /this\.onerror=null; this\.parentElement\.innerHTML/.test(app));
kontrol('app: favicon da onerror temizler',
  /this\.onerror=null; this\.replaceWith/.test(app));
kontrol('app: favicon sabit 14x14', /width="14" height="14" loading="lazy" decoding="async"/.test(app));
kontrol('HTML: sponsor görseli fetchpriority high', /id="sponsorGorsel"[\s\S]{0,240}fetchpriority="high"/.test(html));
kontrol('HTML: sponsor görseli sabit 140x140', /id="sponsorGorsel"[\s\S]{0,160}width="140"[\s\S]{0,60}height="140"/.test(html));
kontrol('HTML: sponsor görseli eager + async', /id="sponsorGorsel"[\s\S]{0,220}loading="eager"[\s\S]{0,60}decoding="async"/.test(html));

// --- GPU ivmesi & content-visibility ---
kontrol('CSS: .urun-karti content-visibility auto',
  /\.urun-karti\s*\{[^}]*content-visibility:\s*auto/s.test(css));
kontrol('CSS: .urun-karti contain-intrinsic-size 284px',
  /\.urun-karti\s*\{[^}]*contain-intrinsic-size:\s*0 284px/s.test(css));
kontrol('CSS: .urun-karti translateZ(0)', /\.urun-karti\s*\{[^}]*translateZ\(0\)/s.test(css));
kontrol('CSS: .urun-karti backface-visibility hidden',
  /\.urun-karti\s*\{[^}]*backface-visibility:\s*hidden/s.test(css));
kontrol('CSS: .vitrin-kart translateZ(0)', /\.vitrin-kart,\s*\n?\.vitrin-iskelet\s*\{[^}]*translateZ\(0\)/s.test(css)
  || /\.vitrin-kart\s*\{[^}]*translateZ\(0\)/s.test(css));
kontrol('CSS: .vitrin-spark translateZ(0)', /\.vitrin-spark\s*\{\s*transform:\s*translateZ\(0\)/.test(css));
kontrol('CSS: sparkline will-change stroke-dashoffset',
  /\.vitrin-spark-cizgi\s*\{[^}]*will-change:\s*stroke-dashoffset/s.test(css));
kontrol('CSS: toast will-change transform,opacity',
  /\.mikro-toast\s*\{[^}]*will-change:\s*transform,\s*opacity/s.test(css));
kontrol('CSS: skeleton reduced-motion → animation none',
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,220}\.skeleton-kutu[\s\S]{0,160}animation:\s*none/s.test(css));

/* ---------------------------------------------------------------- */
bolum('13) Canlı uç (opsiyonel)');
if (process.argv.includes('--canli')) {
  const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
  const h = {};
  if (config.erisimAnahtari) h['x-erisim-anahtari'] = config.erisimAnahtari;
  try {
    const t = Date.now();
    const r = await (await fetch(taban + '/api/search-suggestions?q=bam&limit=6', { headers: h })).json();
    const gecenMs = Date.now() - t;
    kontrol('canlı: 200 + öneriler', Array.isArray(r.oneriler) && r.oneriler.length > 0);
    kontrol('canlı: Bambu öne çıkıyor', /Bambu/i.test(r.oneriler[0]?.metin || ''), r.oneriler[0]?.metin);
    kontrol('canlı: sunucu süresi <15 ms', Number(r.sureMs) < 15, String(r.sureMs));
    kontrol('canlı: ağ dahil <250 ms', gecenMs < 250, gecenMs + ' ms');
    const bos = await (await fetch(taban + '/api/search-suggestions?q=', { headers: h })).json();
    kontrol('canlı: boş sorgu popüler döndürür', bos.oneriler?.length > 0, String(bos.oneriler?.length));
    console.log(`     canlı: sunucu ${r.sureMs} ms · ağ dahil ${gecenMs} ms`);
  } catch (e) {
    kontrol('canlı uç erişilebilir', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Canlı test için: --canli');
}

console.log(`\nUX-2026 ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
