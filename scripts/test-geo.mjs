/**
 * 🤖 GEO (Generative Engine Optimization) Sözleşme Testleri (2026-11-28)
 *
 * Kapsam:
 *  1) /llms.txt ve /llms-full.txt içerik, metodoloji, kanonik URL ve gizlilik
 *  2) piyasaEndeksiVerisi() gerçek veri dürüstlüğü (sahte/sıfır/negatif fiyat yok)
 *  3) /piyasa-endeksi & /en/market-index HTML + Dataset JSON-LD
 *  4) public/robots.txt AI tarayıcı politikası + tam Sitemap URL
 *  5) Answer-First (.geo-ozet), Organization & WebSite Schema.org zenginleştirmeleri
 *
 * Kullanım: node scripts/test-geo.mjs
 */
import fs from 'node:fs';
import {
  llmsTxtOlustur, llmsFullTxtOlustur, piyasaEndeksiVerisi,
  piyasaEndeksiSayfasiHtml, geoSitemapKayitlari,
} from '../src/geo.js';
import { globalDuelloBul } from '../src/globalDuelloRehberleri.js';
import { closeDatabase } from '../src/store.js';

let gecen = 0; let toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

bolum('1) 📄 llms.txt & llms-full.txt');
const llms = llmsTxtOlustur('https://baskihesap.tech');
const llmsFull = llmsFullTxtOlustur('https://baskihesap.tech');

kontrol('llms.txt Markdown başlığı ve özet taşır',
  llms.startsWith('# Baskı Hesap (baskihesap.tech)') && llms.includes('## Methodology & Data Integrity'));
kontrol('llms.txt ana araç URL’lerini içerir',
  llms.includes('https://baskihesap.tech/en/cost-calculator')
  && llms.includes('https://baskihesap.tech/en/slicer')
  && llms.includes('https://baskihesap.tech/en/embed')
  && llms.includes('https://baskihesap.tech/en/market-index'));
kontrol('llms-full.txt 4 bölgesel pazarı içerir',
  llmsFull.includes('(TR · TRY)') && llmsFull.includes('(US · USD)')
  && llmsFull.includes('(FR · EUR)') && llmsFull.includes('(JP · JPY)'));
kontrol('llms-full.txt gizli alan sızdırmaz',
  !/token|chatId|chat_id|botToken|kaynakUrl|adminAnahtari|erisimAnahtari|"?pid"?\s*:/i.test(llms + llmsFull));

bolum('2) 📊 piyasaEndeksiVerisi — gerçek veri dürüstlüğü');
for (const mk of ['tr', 'us', 'fr', 'jp']) {
  const e = piyasaEndeksiVerisi(mk);
  const katlar = Object.values(e.kategoriler);
  const tutarli = katlar.every(k =>
    (k.adet === 0 && k.enDusuk === null && k.medyan === null)
    || (k.adet > 0 && k.enDusuk > 0 && k.medyan >= k.enDusuk));
  kontrol(`${mk.toUpperCase()} piyasa endeksi tutarlı ve sahte değer yok`,
    e.market === mk && /^\d{4}-\d{2}-\d{2}$/.test(e.guncelleme) && tutarli,
    JSON.stringify(e.kategoriler));
}

bolum('3) 🌐 /piyasa-endeksi & /en/market-index + Dataset JSON-LD');
for (const [dil, bekH1] of [['tr', 'Fiyat Endeksi'], ['en', 'Price Index']]) {
  const html = piyasaEndeksiSayfasiHtml(dil, 'https://baskihesap.tech');
  kontrol(`${dil.toUpperCase()} endeks sayfası HTML + Dataset JSON-LD içerir`,
    html.includes(bekH1)
    && html.includes('"@type":"Dataset"')
    && html.includes('"temporalCoverage"')
    && html.includes('"measurementTechnique"')
    && html.includes('"variableMeasured"')
    && html.includes('geo-ozet'));
}
const sm = geoSitemapKayitlari();
kontrol('geoSitemapKayitlari TR + EN döndürür', sm.length === 2 && sm.some(x => x.yol === '/piyasa-endeksi') && sm.some(x => x.yol === '/en/market-index'));

bolum('4) 🤖 robots.txt & server.js GEO rotaları');
const robots = fs.readFileSync('public/robots.txt', 'utf8');
for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended']) {
  kontrol(`robots.txt ${bot} kuralı var`, robots.includes(`User-agent: ${bot}`));
}
kontrol('robots.txt /llms.txt ve /llms-full.txt izni',
  robots.includes('Allow: /llms.txt') && robots.includes('Allow: /llms-full.txt'));
kontrol('robots.txt tam Sitemap URL’si',
  robots.includes('Sitemap: https://baskihesap.tech/sitemap.xml'));
kontrol('robots.txt admin/api/widget kısıtları korunuyor',
  robots.includes('Disallow: /admin') && robots.includes('Disallow: /api/') && robots.includes('Disallow: /widget'));

const srv = fs.readFileSync('server.js', 'utf8');
kontrol('server.js /llms.txt ve /llms-full.txt rotaları',
  srv.includes("app.get('/llms.txt'") && srv.includes("app.get('/llms-full.txt'"));
kontrol('server.js /piyasa-endeksi ve /en/market-index rotaları',
  srv.includes("app.get(['/piyasa-endeksi', '/en/market-index']"));

bolum('5) ✨ Answer-First (.geo-ozet) & Schema.org Zenginleştirme');
const idxHtml = fs.readFileSync('public/index.html', 'utf8');
const guvenSrc = fs.readFileSync('src/guvenSayfalar.js', 'utf8');
const rehberSrc = fs.readFileSync('src/rehberSayfalar.js', 'utf8');
const seoSrc = fs.readFileSync('src/seoSayfalar.js', 'utf8');
const duelloKayit = globalDuelloBul('/en/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra');
const duelloHtml = duelloKayit ? duelloKayit.olustur('https://baskihesap.tech', []) : '';

kontrol('index.html WebSite JSON-LD knowsAbout + areaServed + publishingPrinciples',
  idxHtml.includes('"knowsAbout"') && idxHtml.includes('"areaServed"') && idxHtml.includes('"publishingPrinciples"'));
kontrol('guvenSayfalar Organization knowsAbout + areaServed + publishingPrinciples',
  guvenSrc.includes('knowsAbout:') && guvenSrc.includes('areaServed:') && guvenSrc.includes('publishingPrinciples:'));
kontrol('globalDuelloRehberleri Quick Answer (.geo-ozet) + speakable',
  duelloHtml.includes('geo-ozet') && duelloHtml.includes('Quick Answer') && duelloHtml.includes('SpeakableSpecification'));
kontrol('rehberSayfalar Answer-First (.geo-ozet) + speakable',
  rehberSrc.includes('geo-ozet') && rehberSrc.includes('SpeakableSpecification'));
kontrol('seoSayfalar ürün detay tek cümlelik fiyat özeti (.geo-ozet)',
  seoSrc.includes('class="geo-ozet"') && seoSrc.includes('geoTekCumle'));

console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
} else {
  console.log('✅ Tüm GEO sözleşme testleri geçti.');
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
