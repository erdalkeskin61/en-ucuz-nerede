/**
 * ⏱️ Öneri & Arama Akışı Mimarisi Testi (2026-11-14)
 *
 * Kapsam
 *   1)  dogalDilTavsiyeMi — niyet yönlendirici (9 senaryo)
 *   2)  zamanAsimli — sert zaman bütçesi + iptal
 *   3)  selectModels — bütçe dolunca deterministik yedek (LLM hatalı/askıda)
 *   4)  CEKIRDEK_SITELER — 12 mağaza, adaptörlerde mevcut
 *   5)  oneri.js — watchdog / kısmi sonuç / AbortController sözleşmesi
 *   6)  server.js — /api/compare asenkron (anında isId), /api/oneri/:id/iptal
 *   7)  app.js — sayaç / aşama / durdur / kısmi kart entegrasyonu
 *   8)  style.css — yeni bileşen stilleri
 *   9)  (--canli) çalışan sunucuda /api/compare anında yanıt veriyor mu?
 *
 *   node scripts/test-oneri-akis.mjs
 *   node scripts/test-oneri-akis.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import { dogalDilTavsiyeMi } from '../src/urunArama.js';
import { zamanAsimli, selectModels, SELECT_MODELS_TIMEOUT_MS } from '../src/ai.js';
import { CEKIRDEK_SITELER, CEKIRDEK_HIZLI_SITELER, DANISMAN_ARAMA_SITELERI } from '../src/oneri.js';
import { adapters } from '../src/sites/index.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const CANLI = process.argv.includes('--canli');

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

/* ================================================================== */
bolum('1) 🧭 Niyet yönlendirici — dogalDilTavsiyeMi');

const URUN_SORULARI = [
  'eSun PLA+',
  'Creality K1C',
  'Porima PETG Siyah 1kg',
  'eSun PLA+ Filament Siyah 1kg 1.75mm yüksek hızlı',
  'Bambu Lab P1S 3D Yazıcı',
];
const DANISMAN_SORULARI = [
  'bütçem 3000 TL spor kulaklık öner',
  'hangi filament daha iyi?',
  'spor için kablosuz kulaklık arıyorum bütçem 3000 tl',
  'ne alsam acaba',
];
for (const s of URUN_SORULARI) {
  kontrol(`ÜRÜN olarak sınıflandı: "${s}"`, dogalDilTavsiyeMi(s) === false);
}
for (const s of DANISMAN_SORULARI) {
  kontrol(`DANIŞMAN olarak sınıflandı: "${s}"`, dogalDilTavsiyeMi(s) === true);
}

/* ================================================================== */
bolum('2) ⏱️ zamanAsimli — sert zaman bütçesi');

kontrol('SELECT_MODELS_TIMEOUT_MS = 15000', SELECT_MODELS_TIMEOUT_MS === 15000, String(SELECT_MODELS_TIMEOUT_MS));

const hizliSonuc = await zamanAsimli(Promise.resolve('tamam'), 1000, 'test');
kontrol('hızlı promise değerini döndürür', hizliSonuc === 'tamam');

let zamanAsimiOldu = false;
const askida = new Promise(() => { /* asla çözülmez */ });
const t0 = Date.now();
try {
  await zamanAsimli(askida, 120, 'test');
} catch (e) {
  zamanAsimiOldu = /zaman aşımı/i.test(String(e?.message));
}
const gecenSure = Date.now() - t0;
kontrol('askıda promise zaman aşımına düşer', zamanAsimiOldu);
kontrol('zaman aşımı bütçeye yakın sürede tetiklenir (<= 600 ms)', gecenSure <= 600, `${gecenSure} ms`);

/* ================================================================== */
bolum('3) 🛡️ selectModels — bütçe dolunca deterministik yedek');

const adaylar = [
  { site: 'trendyol', title: 'Pahalı Model', price: 5000, url: 'https://ornek.test/pahali', renkDurumu: 'yok' },
  { site: 'hepsiburada', title: 'Ucuz Model', price: 1200, url: 'https://ornek.test/ucuz', renkDurumu: 'yok' },
  { site: 'n11', title: 'Orta Model', price: 2500, url: 'https://ornek.test/orta', renkDurumu: 'yok' },
  { site: 'robotistan', title: 'Renkli Model', price: 3000, url: 'https://ornek.test/renkli', renkDurumu: 'tam' },
];

const s1 = Date.now();
let yedek = null, yedekHata = null;
try {
  // 1 ms bütçe → LLM'e hiç çıkmadan deterministik seçime düşmeli.
  yedek = await selectModels('spor kulaklık', 3000, adaylar, null, { timeoutMs: 1 });
} catch (e) {
  yedekHata = e;
}
const s1Sure = Date.now() - s1;
kontrol('bütçe dolunca hata fırlatmaz (akış kilitlenmez)', yedekHata === null, String(yedekHata?.message || ''));
kontrol('deterministik seçim dizi döndürür', Array.isArray(yedek));
kontrol('seçim en fazla 5 model', Array.isArray(yedek) && yedek.length <= 5, String(yedek?.length));
kontrol('seçim hızla döner (<= 2000 ms)', s1Sure <= 2000, `${s1Sure} ms`);
kontrol('her seçimde url + model var',
  Array.isArray(yedek) && yedek.every(x => x.url && x.model));
kontrol('renk uyumu önce sıralanır', yedek?.[0]?.url === 'https://ornek.test/renkli',
  JSON.stringify(yedek?.[0]));

let adayYokHata = null;
try {
  await selectModels('x', null, [], null, { timeoutMs: 1 });
} catch (e) { adayYokHata = e; }
kontrol('aday yoksa anlamlı hata verir', adayYokHata instanceof Error && /Model seçimi yapılamadı/.test(adayYokHata.message),
  String(adayYokHata?.message || ''));

// 🎯 İlgililik: ucuz aksesuar, sorguya uyan filamentin önüne geçmemeli.
const karisikAdaylar = [
  { site: 'trendyol', title: 'Mini Filament Temizleyici', price: 47.77, url: 'https://ornek.test/temizleyici', renkDurumu: 'yok' },
  { site: 'hepsiburada', title: '3D Yazıcı Extruder Filament İtici MK7', price: 42.22, url: 'https://ornek.test/itici', renkDurumu: 'yok' },
  { site: 'porima3d', title: 'Porima PLA Filament 1.75mm Siyah 1kg 3D Yazıcı Filament', price: 899, url: 'https://ornek.test/filament-a', renkDurumu: 'yok' },
  { site: 'n11', title: 'eSun PLA+ Filament 1kg 3D Yazıcı', price: 1150, url: 'https://ornek.test/filament-b', renkDurumu: 'yok' },
];
const karisikSecim = await selectModels('bütçem 1200 TL 3d yazıcı filament öner', 1200, karisikAdaylar, null, { timeoutMs: 1 });
kontrol('aksesuar adaylar elenir (ilgililik önce)', Array.isArray(karisikSecim)
  && karisikSecim.every(x => !/temizleyici|itici/i.test(x.model)), JSON.stringify(karisikSecim?.map(x => x.model)));
kontrol('ilgili filament adayları seçilir', Array.isArray(karisikSecim) && karisikSecim.length >= 1
  && karisikSecim.every(x => /filament/i.test(x.model)),
  JSON.stringify(karisikSecim?.map(x => x.model)));

/* ================================================================== */
bolum('4) 🏪 CEKIRDEK_SITELER — danışman mağaza seti');

kontrol('çekirdek set dondurulmuş (frozen)', Object.isFrozen(CEKIRDEK_SITELER));
kontrol('tam 12 mağaza', CEKIRDEK_SITELER.length === 12, String(CEKIRDEK_SITELER.length));
kontrol('tekrarlı mağaza yok', new Set(CEKIRDEK_SITELER).size === CEKIRDEK_SITELER.length);
const adapterIdleri = new Set(adapters.map(a => a.id));
kontrol('tüm çekirdek mağazalar adaptör listesinde', CEKIRDEK_SITELER.every(id => adapterIdleri.has(id)),
  CEKIRDEK_SITELER.filter(id => !adapterIdleri.has(id)).join(','));
kontrol('pazaryeri + uzman 3D mağazası birlikte', CEKIRDEK_SITELER.includes('trendyol') && CEKIRDEK_SITELER.includes('porima3d'));
kontrol('hızlı set dondurulmuş (frozen)', Object.isFrozen(CEKIRDEK_HIZLI_SITELER));
kontrol('hızlı set 8 mağaza', CEKIRDEK_HIZLI_SITELER.length === 8, String(CEKIRDEK_HIZLI_SITELER.length));
kontrol('hızlı set, tam setin alt kümesi', CEKIRDEK_HIZLI_SITELER.every(id => CEKIRDEK_SITELER.includes(id)));
kontrol('hızlı sette adaptörsüz mağaza yok', CEKIRDEK_HIZLI_SITELER.every(id => adapterIdleri.has(id)));

// ⚡ Aday arama havuzu: 49 mağaza yerine 20 (cevap süresi).
kontrol('danışman arama havuzu dondurulmuş (frozen)', Object.isFrozen(DANISMAN_ARAMA_SITELERI));
kontrol('danışman arama havuzu 20 mağaza', DANISMAN_ARAMA_SITELERI.length === 20, String(DANISMAN_ARAMA_SITELERI.length));
kontrol('arama havuzunda adaptörsüz mağaza yok', DANISMAN_ARAMA_SITELERI.every(id => adapterIdleri.has(id)));
kontrol('arama havuzu 3D uzmanı + pazaryeri içerir',
  DANISMAN_ARAMA_SITELERI.includes('porima3d') && DANISMAN_ARAMA_SITELERI.includes('trendyol'));

/* ================================================================== */
bolum('5) 🧩 oneri.js — watchdog / kısmi sonuç / iptal sözleşmesi');

const oneriSrc = oku('src/oneri.js');
kontrol('WATCHDOG_MS tanımlı', /const WATCHDOG_MS/.test(oneriSrc));
kontrol('watchdog varsayılanı 75000 ms', /: 75000;/.test(oneriSrc));
kontrol('kısmi sonuç alanı dönüyor', /kismi: watchdogDoldu/.test(oneriSrc));
kontrol('tamamlananModel alanı dönüyor', /tamamlananModel:/.test(oneriSrc));
kontrol('model eşzamanlılığı 3 ile sınırlı', /MODEL_ESZAMANLI = 3/.test(oneriSrc));
kontrol('hızlı kapsam varsayılan, tam kapsam opsiyonel', /opts\.tam === true\s*\n?\s*\? CEKIRDEK_SITELER/.test(oneriSrc));
kontrol('kapsam bilgisi sonuca ekleniyor', /kapsam: \{/.test(oneriSrc));
kontrol('AbortController iptali runComparison\'a geçiyor', /signal: opts\.signal/.test(oneriSrc));
kontrol('iptal edilince yeni model başlatılmıyor', /opts\.signal\?\.aborted/.test(oneriSrc));
kontrol('modelTamamlandi olayı yayınlanıyor', /modelTamamlandi: true/.test(oneriSrc));
kontrol('kısmi kart için hafif özet gönderiliyor', /modelSonuc: \{/.test(oneriSrc));

/* ================================================================== */
bolum('6) 🌐 server.js — asenkron compare + öneri iptali');

const serverSrc = oku('server.js');
kontrol('adAnahtariBenzer (Katman 0) tanımlı', /function adAnahtariBenzer/.test(serverSrc));
kontrol('/api/compare ürün adında anında job döner', /return res\.json\(\{ isId: job\.id/.test(serverSrc));
kontrol('compare faz alanları job görünümünde', /faz: job\.faz \|\| null/.test(serverSrc));
kontrol('katman alanı job görünümünde', /katman: job\.katman \?\? null/.test(serverSrc));
kontrol('arananSorgu alanı job görünümünde', /arananSorgu: job\.arananSorgu \|\| null/.test(serverSrc));
kontrol('/api/oneri/:id/iptal ucu var', /app\.post\('\/api\/oneri\/:id\/iptal'/.test(serverSrc));
kontrol('öneri işi AbortController taşıyor', /iptalKontrolu: new AbortController\(\)/.test(serverSrc));
kontrol('öneri iptali HTTP 200 döner', /iptalEdildi: true \}\)/.test(serverSrc));

/* ================================================================== */
bolum('7) 🖥️ app.js — sayaç / aşama / durdur / kısmi kart');

const appSrc = oku('public/app.js');
kontrol('oneriSayaciBaslat tanımlı', /function oneriSayaciBaslat\(\)/.test(appSrc));
kontrol('oneriSayaciDurdur tanımlı', /function oneriSayaciDurdur\(\)/.test(appSrc));
kontrol('oneriAsamaGuncelle tanımlı', /function oneriAsamaGuncelle\(faz\)/.test(appSrc));
kontrol('oneriKismiKartEkle tanımlı', /function oneriKismiKartEkle\(/.test(appSrc));
kontrol('oneriDurdur tanımlı', /async function oneriDurdur\(\)/.test(appSrc));
kontrol('durdur butonu dinleniyor', /oneriDurdurBtnEl\.addEventListener\('click'/.test(appSrc));
kontrol('ilerleme olayında aşama güncelleniyor', /oneriAsamaGuncelle\(p\.faz\)/.test(appSrc));
kontrol('modelTamamlandi kısmi kart basıyor', /p\.modelTamamlandi && p\.modelSonuc/.test(appSrc));
kontrol('sayaç form gönderiminde başlıyor', /oneriSayaciBaslat\(\);/.test(appSrc));
kontrol('hata/bitişte sayaç duruyor', /oneriSayaciDurdur\(\);/.test(appSrc));
kontrol('iptal ucu çağrılıyor', /\/api\/oneri\/' \+ encodeURIComponent\(oneriAktifId\) \+ '\/iptal'/.test(appSrc));
kontrol('kapsam satırı kartta gösteriliyor', /kapsamSatiri/.test(appSrc));
kontrol('tam tarama düğmesi bağlı', /tam-tara-btn'\)\.forEach/.test(appSrc));

/* ================================================================== */
bolum('8) 🎨 style.css + index.html — yeni bileşenler');

const cssSrc = oku('public/style.css');
for (const sinif of ['.oneri-sayac', '.oneri-asama', '.oneri-durdur-btn', '.oneri-kismi-kart']) {
  kontrol(`stil mevcut: ${sinif}`, cssSrc.includes(sinif));
}
const htmlSrc = oku('public/index.html');
for (const id of ['oneriSayac', 'oneriAsama', 'oneriDurdurBtn', 'oneriKismiKartlar']) {
  kontrol(`DOM öğesi mevcut: #${id}`, htmlSrc.includes(`id="${id}"`));
}

/* ================================================================== */
if (CANLI) {
  bolum('9) 🔌 Canlı sunucu — /api/compare anında yanıt');
  const ANAHTAR = process.env.ERISIM_ANAHTARI || 'qx2kjlgmwhfnzc1p6b3r4ayd';
  const TABAN = process.env.SUNUCU || 'http://127.0.0.1:3000';
  try {
    const bas = Date.now();
    const res = await fetch(`${TABAN}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-erisim-anahtari': ANAHTAR },
      body: JSON.stringify({ url: 'eSun PLA+' }),
      signal: AbortSignal.timeout(10000),
    });
    const sure = Date.now() - bas;
    const veri = await res.json().catch(() => null);
    kontrol('POST /api/compare hızlı yanıt verir (< 3000 ms)', sure < 3000, `${sure} ms`);
    kontrol('/api/compare anında iş kimliği döner', !!(veri?.isId || veri?.id), JSON.stringify(veri));
    if (veri?.isId) {
      kontrol('iş fazı çözüm/tarama/bitti', ['cozum', 'tarama', 'bitti', 'hata'].includes(veri.faz), String(veri.faz));
      const durum = await fetch(`${TABAN}/api/compare/${veri.isId}`, {
        headers: { 'x-erisim-anahtari': ANAHTAR },
        signal: AbortSignal.timeout(10000),
      }).then(r => r.json()).catch(() => null);
      kontrol('iş durumu faz alanı taşır', durum && 'faz' in durum, JSON.stringify(durum?.faz));
    }
  } catch (e) {
    kontrol('canlı sunucuya erişilebildi', false, String(e?.message || e));
  }
}

/* ================================================================== */
console.log('\n' + '─'.repeat(52));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
