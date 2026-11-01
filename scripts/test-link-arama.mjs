/**
 * 🔗 "Linkte ara" testleri — 2026-10-31
 *
 * Kapsam:
 *  1) URL normalizasyonu (şemasız link, tırnak/parantez temizliği, güvenlik).
 *  2) Mağaza tanıma (detectSite) ve desteklenmeyen site raporu.
 *  3) Ürün adı (arama sorgusu) çıkarımı — slug'dan, uydurma yok.
 *  4) Arayüz sözleşmesi: mod seçici, önizleme paneli, "Linkte Ara" / "Ürün adıyla ara".
 *  5) Sunucu ucu: POST /api/link-coz (canlı sunucu varsa).
 *
 * Kullanım:
 *   node scripts/test-link-arama.mjs
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-link-arama.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  linkCoz, linkMi, urlNormallestir, urundenSorguCikar,
} from '../src/linkArama.js';
import { config } from '../src/config.js';

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

/* ---------------------------------------------------------------- */
bolum('1) URL normalizasyonu');
kontrol('tam URL korunur',
  urlNormallestir('https://www.trendyol.com/urun-p-1') === 'https://www.trendyol.com/urun-p-1');
kontrol('şemasız alan adına https eklenir',
  urlNormallestir('trendyol.com/urun-p-1') === 'https://trendyol.com/urun-p-1');
kontrol('www ile başlayan şemasız link',
  urlNormallestir('www.hepsiburada.com/u-p-HBCV1') === 'https://www.hepsiburada.com/u-p-HBCV1');
kontrol('çevresel tırnak temizlenir',
  urlNormallestir('"https://www.trendyol.com/u-p-1"') === 'https://www.trendyol.com/u-p-1');
kontrol('parantez temizlenir',
  urlNormallestir('(https://www.trendyol.com/u-p-1)') === 'https://www.trendyol.com/u-p-1');
kontrol('fragment atılır',
  urlNormallestir('https://www.trendyol.com/u-p-1#yorumlar') === 'https://www.trendyol.com/u-p-1');
kontrol('javascript: reddedilir', urlNormallestir('javascript:alert(1)') === null);
kontrol('file: reddedilir', urlNormallestir('file:///C:/gizli.txt') === null);
kontrol('boş metin null', urlNormallestir('   ') === null);
kontrol('düz cümle null', urlNormallestir('spor için kulaklık') === null);
kontrol('linkMi: link true', linkMi('https://www.trendyol.com/u-p-1') === true);
kontrol('linkMi: şemasız link true', linkMi('trendyol.com/u-p-1') === true);
kontrol('linkMi: cümle false', linkMi('kablosuz kulaklık önerisi') === false);

/* ---------------------------------------------------------------- */
bolum('2) Mağaza tanıma ve destek durumu');
const trendyol = linkCoz('https://www.trendyol.com/logitech-g102-p-123');
kontrol('Trendyol linki çözüldü', trendyol.ok === true, trendyol.mesaj);
kontrol('Trendyol site kimliği', trendyol.site?.id === 'trendyol', JSON.stringify(trendyol.site));
kontrol('Trendyol görünen adı', trendyol.site?.name === 'Trendyol', trendyol.site?.name);
kontrol('destekleniyor bayrağı', trendyol.destekleniyor === true);

const hb = linkCoz('www.hepsiburada.com/apple-airpods-pro-2-p-HBCV0000');
kontrol('şemasız Hepsiburada çözüldü', hb.ok === true && hb.site?.id === 'hepsiburada', JSON.stringify(hb.site));

const desteklenmeyen = linkCoz('https://bilinmeyen-magaza.example/urun/guzel-urun-42');
kontrol('desteklenmeyen site ok=false', desteklenmeyen.ok === false);
kontrol('desteklenmeyen neden', desteklenmeyen.neden === 'desteklenmiyor', desteklenmeyen.neden);
kontrol('desteklenmeyen host raporlanır', /bilinmeyen-magaza/.test(desteklenmeyen.mesaj || ''), desteklenmeyen.mesaj);
kontrol('desteklenmeyen sitede ürün adı yine çıkarılır',
  typeof desteklenmeyen.urunAdi === 'string' && desteklenmeyen.urunAdi.length > 0,
  String(desteklenmeyen.urunAdi));

const gecersiz = linkCoz('bu bir link değil');
kontrol('geçersiz link ok=false', gecersiz.ok === false && gecersiz.neden === 'gecersiz', gecersiz.neden);
kontrol('geçersiz linkte örnek mesaj', /trendyol\.com/.test(gecersiz.mesaj || ''), gecersiz.mesaj);
kontrol('boş link', linkCoz('').neden === 'bos');

/* ---------------------------------------------------------------- */
bolum('3) Ürün adı (arama sorgusu) çıkarımı');
kontrol('Trendyol slug → "logitech g102"',
  urundenSorguCikar('https://www.trendyol.com/logitech-g102-p-123') === 'logitech g102',
  String(urundenSorguCikar('https://www.trendyol.com/logitech-g102-p-123')));
kontrol('Hepsiburada ürün kodu elenir',
  urundenSorguCikar('https://www.hepsiburada.com/apple-airpods-pro-2-p-HBCV0000') === 'apple airpods pro 2',
  String(urundenSorguCikar('https://www.hepsiburada.com/apple-airpods-pro-2-p-HBCV0000')));
kontrol('Robitshop slug Türkçe karakter korunur',
  /esun acik gri pla basic filament/.test(urundenSorguCikar('https://www.robitshop.com/urun/esun-acik-gri-pla-basic-filament-1-75mm-1kg-1143') || ''),
  String(urundenSorguCikar('https://www.robitshop.com/urun/esun-acik-gri-pla-basic-filament-1-75mm-1kg-1143')));
kontrol('"urun" gürültü kelimesi atılır',
  !/^urun\b/.test(urundenSorguCikar('https://ornek.com/urun/kulaklik-500') || ''));
kontrol('sorgu parametresi kullanılır',
  (urundenSorguCikar('https://ornek.com/ara?q=logitech%20g102') || '').includes('logitech'),
  String(urundenSorguCikar('https://ornek.com/ara?q=logitech%20g102')));
kontrol('anlamsız slug → null (uydurma yok)',
  urundenSorguCikar('https://ornek.com/p/123456') === null,
  String(urundenSorguCikar('https://ornek.com/p/123456')));
kontrol('kök URL → null', urundenSorguCikar('https://www.trendyol.com/') === null);

/* ---------------------------------------------------------------- */
bolum('4) Arayüz sözleşmesi');
{
  const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  const html = oku('public/index.html');
  const app = oku('public/app.js');
  const css = oku('public/style.css');
  const server = oku('server.js');

  for (const mod of ['oto', 'link', 'ad']) {
    kontrol(`mod seçici: ${mod}`, new RegExp(`data-mod="${mod}"`).test(html));
  }
  kontrol('mod çubuğu rol=tablist', /class="arama-modu"[^>]*role="tablist"/.test(html));
  kontrol('link önizleme paneli', /id="linkOnizleme"/.test(html));
  kontrol('linkte ara düğmesi', /id="linkteAraBtn"/.test(html));
  kontrol('ürün adıyla ara düğmesi', /id="linkAdiylaAraBtn"/.test(html));

  kontrol('app: arama modu durumu', /let aramaModu = 'oto'/.test(app));
  kontrol('app: link önizleme isteği', /\/api\/link-coz/.test(app));
  kontrol('app: debounce', /linkCozGecikmeli/.test(app) && /setTimeout\(async \(\) =>/.test(app));
  kontrol('app: yarışan istek koruması', /linkCozSayaci/.test(app));
  kontrol('app: yapıştırma dinleyicisi', /addEventListener\('paste'/.test(app));
  kontrol('app: linkte ara akışı', /async function linkteAra/.test(app));
  kontrol('app: ürün adıyla ara akışı', /function linkAdiylaAra/.test(app));
  kontrol('app: link modunda URL zorunlu', /Linkte arama için geçerli bir ürün linki/.test(app));
  kontrol('app: normalize edilmiş URL kullanılıyor', /url = cozum\.url \|\| url/.test(app));

  kontrol('CSS: mod çubuğu', /\.arama-modu\s*\{/.test(css));
  kontrol('CSS: önizleme paneli', /\.link-onizleme\s*\{/.test(css));
  kontrol('CSS: hata durumu', /\.link-onizleme\.link-onizleme-hata/.test(css));
  kontrol('CSS: koyu mod önizleme', /html\[data-theme="dark"\] \.link-onizleme/.test(css));
  kontrol('CSS: mobil mod çubuğu', /@media \(max-width: 720px\)[\s\S]*?\.arama-modu\s*\{[^}]*width:\s*100%/s.test(css));

  kontrol('sunucu: /api/link-coz ucu', /app\.post\('\/api\/link-coz'/.test(server));
  kontrol('sunucu: linkCoz import', /from '\.\/src\/linkArama\.js'/.test(server));
}

/* ---------------------------------------------------------------- */
bolum('5) Canlı uç (opsiyonel)');
if (process.argv.includes('--canli')) {
  const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
  const basliklar = { 'Content-Type': 'application/json' };
  if (config.erisimAnahtari) basliklar['x-erisim-anahtari'] = config.erisimAnahtari;
  const dene = async (url) => {
    const res = await fetch(taban + '/api/link-coz', {
      method: 'POST', headers: basliklar, body: JSON.stringify({ url }),
    });
    return { status: res.status, veri: await res.json().catch(() => ({})) };
  };
  try {
    const t1 = await dene('https://www.trendyol.com/logitech-g102-p-123');
    kontrol('canlı: Trendyol 200', t1.status === 200 && t1.veri.ok === true, JSON.stringify(t1.veri).slice(0, 120));
    kontrol('canlı: site adı döndü', t1.veri.site?.name === 'Trendyol', t1.veri.site?.name);
    const t2 = await dene('javascript:alert(1)');
    kontrol('canlı: tehlikeli şema reddedildi', t2.veri.ok === false, JSON.stringify(t2.veri).slice(0, 100));
    const t3 = await dene('');
    kontrol('canlı: boş istek 400', t3.status === 400, String(t3.status));
  } catch (e) {
    kontrol('canlı uç erişilebilir', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Canlı uç testi için: --canli (sunucu açık olmalı)');
}

console.log(`\nLINK-ARAMA ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
