/**
 * 🔗 "Son aramalar" link testleri — 2026-10-31
 *
 * Doğrulananlar:
 *  1) Geçmiş kaydında ürün linki (`url`) ve en ucuz mağaza linki (`enUcuzUrl`)
 *     saklanıyor / sunuluyor.
 *  2) Arayüz her satırda tıklanabilir link + "Tekrar ara" düğmesi üretiyor.
 *  3) Aynı URL tekrar tekrar aranınca liste şişmiyor (tekilleştirme + ×N).
 *  4) Link etiketi host + kısa yol biçiminde.
 *  5) XSS: link metinleri `esc()` ile kaçırılıyor.
 *
 * Kullanım: node scripts/test-gecmis-link.mjs [--canli]
 */
import fs from 'node:fs';
import path from 'node:path';
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
const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const server = oku('server.js');
const app = oku('public/app.js');
const css = oku('public/style.css');

/* ---------------------------------------------------------------- */
bolum('1) Sunucu: geçmişte link saklama');
kontrol('addHistory enUcuzUrl alanını yazıyor', /enUcuzUrl:\s*enUcuzTeklif/.test(server));
kontrol('en ucuz teklif stok/renk filtresiyle seçiliyor',
  /s\.enUcuz && s\.status === 'found' && s\.product && s\.renkAyni !== false/.test(server));
kontrol('afiliye linki tercih ediliyor',
  /enUcuzTeklif\?\.product\?\.afiliyeUrl\s*\|\|\s*enUcuzTeklif\?\.product\?\.url/.test(server));
kontrol('enUcuzSiteId de saklanıyor', /enUcuzSiteId:\s*enUcuzTeklif\?\.site/.test(server));

/* ---------------------------------------------------------------- */
bolum('2) Sunucu: /api/history zenginleştirme');
kontrol('snapshot’tan tamamlama', /anlikAl\(h\.url\)/.test(server));
kontrol('kaynak site = en ucuz ise kaynak link kullanılıyor',
  /host\.startsWith\(site\) \|\| site\.startsWith\(host\)/.test(server));
kontrol('uydurma link yok (yalnızca eşleşmede)',
  /if \(site && host && \(host\.startsWith\(site\)/.test(server));

/* ---------------------------------------------------------------- */
bolum('3) Arayüz: linkli satırlar');
kontrol('linkEtiketi fonksiyonu', /function linkEtiketi\(url\)/.test(app));
kontrol('host › yol biçimi', /host \+ \(kisa && kisa !== '\/' \? ' › ' \+ kisa/.test(app));
kontrol('ürün linki tıklanabilir', /class="gecmis-link" href="\$\{esc\(h\.url\)\}"/.test(app));
kontrol('en ucuz mağaza linki', /class="gecmis-link en-ucuz-link" href="\$\{esc\(h\.enUcuzUrl\)\}"/.test(app));
kontrol('sponsored rel (afiliye şeffaflığı)', /rel="noopener sponsored"/.test(app));
kontrol('başlık da linke gidiyor', /<a href="\$\{esc\(h\.url\)\}" target="_blank"/.test(app));
kontrol('"Tekrar ara" düğmesi', /class="gecmis-tekrar" data-url/.test(app));
kontrol('tekrar ara tıklama davranışı', /closest\?\.\('\.gecmis-tekrar'\)/.test(app));
kontrol('tekrar ara formu gönderiyor', /input\.value = url;[\s\S]{0,200}requestSubmit/.test(app));

/* ---------------------------------------------------------------- */
bolum('4) Arayüz: tekilleştirme ve sayaç');
kontrol('URL’ye göre tekilleştirme', /const gorulen = new Map\(\)/.test(app));
kontrol('tekrar sayısı tutuluyor', /gorulen\.get\(anahtar\)\.adet \+= 1/.test(app));
kontrol('×N rozeti', /class="gecmis-adet"/.test(app));
kontrol('benzersiz liste çiziliyor', /benzersiz\.map\(h =>/.test(app));

/* ---------------------------------------------------------------- */
bolum('5) Güvenlik ve stil');
kontrol('link metni esc() ile kaçırılıyor', /esc\(linkEtiketi\(h\.url\)\)/.test(app));
kontrol('href esc() ile kaçırılıyor', /href="\$\{esc\(h\.url\)\}"/.test(app));
kontrol('CSS: .gecmis-link', /\.gecmis-link\s*\{/.test(css));
kontrol('CSS: .gecmis-link.en-ucuz-link', /\.gecmis-link\.en-ucuz-link\s*\{/.test(css));
kontrol('CSS: .gecmis-tekrar', /\.gecmis-tekrar\s*\{/.test(css));
kontrol('CSS: tek satır taşma koruması', /text-overflow: ellipsis/.test(css));
kontrol('CSS: koyu mod linkleri', /html\[data-theme="dark"\] \.gecmis-link/.test(css));
kontrol('CSS: mobil dikey düzen', /@media \(max-width: 620px\)[\s\S]{0,120}\.gecmis-oge\s*\{[^}]*column/s.test(css));

/* ---------------------------------------------------------------- */
bolum('6) Canlı API (opsiyonel)');
if (process.argv.includes('--canli')) {
  const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
  const basliklar = {};
  if (config.erisimAnahtari) basliklar['x-erisim-anahtari'] = config.erisimAnahtari;
  try {
    const res = await fetch(taban + '/api/history', { headers: basliklar });
    const list = await res.json();
    kontrol('canlı: geçmiş dizi döndü', Array.isArray(list), typeof list);
    if (list.length) {
      kontrol('canlı: her kayıtta ürün linki var', list.every(h => typeof h.url === 'string' && h.url.length > 0));
      const linkli = list.filter(h => h.enUcuzUrl);
      kontrol('canlı: en az bir en-ucuz linki', linkli.length > 0, String(linkli.length));
      if (linkli.length) {
        let gecerli = true;
        for (const h of linkli) { try { new URL(h.enUcuzUrl); } catch { gecerli = false; } }
        kontrol('canlı: en-ucuz linkleri geçerli URL', gecerli);
      }
    }
  } catch (e) {
    kontrol('canlı API erişilebilir', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Canlı API testi için: --canli');
}

console.log(`\nGECMIS-LINK ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
