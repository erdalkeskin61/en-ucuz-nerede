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
for (const ad of ['karsilastir', 'takipler', 'firsatlar', 'sepet', 'ayarlar']) {
  kontrol(`alt nav öğesi: ${ad}`, new RegExp(`data-nav="${ad}"`).test(html));
}
kontrol('HTML: modal', /id="altModal"/.test(html) && /role="dialog"/.test(html));
kontrol('app: takipler modalı', /function altNavTakipler/.test(app) && /\/api\/tracked/.test(app));
kontrol('app: fırsatlar modalı', /function altNavFirsatlar/.test(app) && /\/api\/firsat\/durum/.test(app));
kontrol('app: sepet kaydırma', /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/.test(app));
kontrol('app: modal kapatma (perde/Esc)', /\[data-modal-kapat\]/.test(app) && /e\.key === 'Escape'/.test(app));
kontrol('CSS: masaüstünde gizli', /@media \(min-width: 769px\)[\s\S]{0,120}\.alt-nav, \.alt-modal\s*\{\s*display:\s*none/s.test(css));
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
bolum('7) Canlı uç (opsiyonel)');
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
