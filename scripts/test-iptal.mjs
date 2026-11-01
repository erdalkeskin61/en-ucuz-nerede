/**
 * Karşılaştırma iptali testi (2026-10-27).
 *   node scripts/test-iptal.mjs [--canli]
 *
 * Birim kısım ağa çıkmaz; --canli ile gerçek bir karşılaştırma başlatıp iptal eder.
 *
 * Kullanıcı isteği: "Karşılaştır aramasını iptal edecek buton koy".
 *
 * Davranış sözleşmesi:
 *  - İptal edilince kalan siteler TARANMAZ.
 *  - O ana kadar bulunmuş ürünler KORUNUR (kısmi sonuç gösterilir).
 *  - İptal HIZLI döner (tüm sitelerin bitmesini beklemez).
 *  - İptalde YZ "neden daha ucuz" açıklaması atlanır (yavaş, gereksiz).
 *  - Sonuçta `ozet.iptalEdildi` ve `ozet.taranmayanSiteSayisi` dolu olur.
 *  - Bitmiş bir işi iptal etmek hata değildir (zatenBitti).
 */
import { runComparison } from '../src/pipeline.js';
import { detectSite } from '../src/sites/index.js';
import { closeDatabase } from '../src/store.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  âœ— ${ad}${ek ? ' â€” ' + ek : ''}`);
}

// ---- 1) Birim: iptal edilmiş sinyalle başlatılan karşılaştırma ----
const URL_ = 'https://www.robitshop.com/urun/esun-acik-gri-pla-basic-filament-1-75mm-1kg-1143';
const ac = new AbortController();

const CANLI = process.argv.includes('--canli');
if (!CANLI) {
  // Sinyal zaten iptal edilmişse hiçbir site taranmamalı
  ac.abort();
  const t0 = Date.now();
  const r = await runComparison(URL_, { signal: ac.signal, maxCandidates: 1 });
  const sure = Date.now() - t0;
  kontrol('iptal sinyali ile hızlı döner', sure < 30000, `${(sure / 1000).toFixed(1)} sn`);
  kontrol('kaynak ürün yine okunur', !!r.kaynak?.urun, r.kaynak?.urun);
  kontrol('iptalEdildi işareti var', r.ozet?.iptalEdildi === true);
  kontrol('tüm siteler iptal durumunda', (r.sonuclar || []).filter(s => s.status !== 'iptal').length <= 1);
  kontrol('taranmayanSiteSayisi > 0', (r.ozet?.taranmayanSiteSayisi || 0) > 0,
    String(r.ozet?.taranmayanSiteSayisi));
  kontrol('YZ açıklaması yok (boş)', r.ozet?.nedenDahaUcuz == null);
  console.log(`  (iptal sinyali ile ${(sure / 1000).toFixed(1)} sn, ${r.ozet?.taranmayanSiteSayisi} site taranmadı)`);
  console.log(`IPTAL ${gecen}/${toplam} (birim)`);
  console.log('  (gerçek tarama + iptal testi için: node scripts/test-iptal.mjs --canli)');
  // Windows'ta node:sqlite tutamakları process.exit() sırasında 0xC0000409 ile
  // çökmeye yol açabiliyor; önce veritabanını kapat.
  closeDatabase();
  process.exit(gecen === toplam ? 0 : 1);
}

// ---- 2) Canlı: taranmaya başla, 4 sn sonra iptal et ----
const ac2 = new AbortController();
const t0 = Date.now();
let iptalZamani = null;
setTimeout(() => { iptalZamani = Date.now(); ac2.abort(); }, 4000);

const r = await runComparison(URL_, { signal: ac2.signal, maxCandidates: 1 });
const toplamSure = Date.now() - t0;
const iptalSonrasi = iptalZamani ? Date.now() - iptalZamani : null;

const bulunan = (r.sonuclar || []).filter(s => s.status === 'found');
const iptaller = (r.sonuclar || []).filter(s => s.status === 'iptal');

kontrol('iptal edildi işareti', r.ozet?.iptalEdildi === true);
kontrol('bazı siteler taranmadı', iptaller.length > 0, `${iptaller.length} site`);
kontrol('bulunan ürünler korundu', bulunan.length > 0, `${bulunan.length} ürün`);
kontrol('kısmi sonuçta en ucuz hesaplandı', r.ozet?.enUcuzFiyat != null, String(r.ozet?.enUcuzFiyat));
kontrol('YZ açıklaması atlandı', r.ozet?.nedenDahaUcuz == null);
kontrol('iptal sonrası 10 sn içinde döndü', iptalSonrasi != null && iptalSonrasi < 10000,
  iptalSonrasi != null ? `${(iptalSonrasi / 1000).toFixed(1)} sn` : 'ölçülemedi');

console.log(`  toplam ${(toplamSure / 1000).toFixed(1)} sn | iptalden sonra ${iptalSonrasi != null ? (iptalSonrasi / 1000).toFixed(1) : '?'} sn`);
console.log(`  bulunan ${bulunan.length} | taranmayan ${iptaller.length}`);
for (const s of bulunan.slice(0, 6)) {
  console.log(`    ✓ ${String(s.site).padEnd(18)} ${s.product?.pricing?.toplam ?? s.product?.sellingPrice}`);
}
console.log(`IPTAL ${gecen}/${toplam} (canlı)`);
closeDatabase();
process.exit(gecen === toplam ? 0 : 1);
