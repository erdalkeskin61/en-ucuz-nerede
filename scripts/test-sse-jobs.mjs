/**
 * Kalıcı iş kuyruğu (SQLite) + SSE canlı akış testleri — 2026-10-29
 *
 *   node scripts/test-sse-jobs.mjs                # tam test (PM2 yeniden başlatma dahil)
 *   node scripts/test-sse-jobs.mjs --restartsiz   # yeniden başlatma adımını atla
 *
 * Kapsam:
 *  1) SQLite iş tablosu: yaz / oku / ilerleme / bitir / temizle
 *  2) SSE akışı: progress olayları GERÇEKTEN canlı mı (olaylar arası süre)
 *  3) SSE bittiğinde 'done' olayı ve sonuç
 *  4) Sunucu yeniden başladıktan sonra iş kaydı + sonucu VERİTABANINDAN okunabiliyor mu
 *  5) REST uçları geriye dönük uyumlu (aynı alanlar)
 *  6) Olmayan iş → 404
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ANAHTAR = process.env.ERISIM_ANAHTARI || '';
const TABAN = process.env.TABAN || 'http://localhost:3000';
const PM2 = process.env.PM2_PATH || path.join(process.env.APPDATA || '', 'npm', 'pm2.cmd');
const SERVIS = 'en-ucuz-nerede';
const restartsiz = process.argv.includes('--restartsiz');

// Test için küçük ve hızlı bir karşılaştırma (site alt kümesi — 61 site 3 dk sürer)
const URUN = process.env.URUN || 'https://www.robo90.com/nanelab-hyper-pla-koyu-gri-filament-175mm-1kg';
const TEST_SITELERI = [
  'robo90', 'filamentsan', 'bisiparisver', '3dmarketim',
  'robomer', 'pusula3d', '3dcim', 'robitshop',
  'teknikfilament3d', 'filamentdepom', 'deneystore', 'tou3d',
];

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

const HDR = { 'Content-Type': 'application/json', 'x-erisim-anahtari': ANAHTAR };
const api = async (yol, opts = {}) => {
  const r = await fetch(TABAN + yol, { ...opts, headers: { ...HDR, ...(opts.headers || {}) } });
  return { ok: r.ok, status: r.status, d: await r.json().catch(() => null) };
};

/* ============ 1) SQLite iş tablosu (doğrudan store) ============ */
console.log('\n1) SQLite iş tablosu (store katmanı)');
const storeModul = 'file:///' + path.join(KOK, 'src', 'store.js').replace(/\\/g, '/').replace(/ /g, '%20');
const {
  saveJob, getJob, updateJobProgress, finishJob, cleanupOldJobs,
  markInterruptedJobs, jobIstatistik, closeDatabase,
} = await import(storeModul);

const TID = '__test_sse_' + Date.now();
kontrol('saveJob yeni kayıt', saveJob({
  id: TID, tur: 'compare', status: 'running', startedAt: Date.now(),
  progress: { faz: 'arama', biten: 1 },
  ek: null, url: 'https://ornek.test/x',
}) === true);
const okunan = getJob(TID);
kontrol('getJob tur', okunan?.tur === 'compare', okunan?.tur);
kontrol('getJob progress JSON parse', okunan?.progress?.biten === 1, JSON.stringify(okunan?.progress));
kontrol('getJob ek alanı', okunan?.url === 'https://ornek.test/x', okunan?.url);
kontrol('updateJobProgress', updateJobProgress(TID, { faz: 'urun', biten: 5 }) === true);
kontrol('progress güncellendi', getJob(TID)?.progress?.biten === 5);
kontrol('finishJob done', finishJob(TID, { status: 'done', result: { ozet: { fiyat: 42 } } }) === true);
kontrol('result yazıldı', getJob(TID)?.result?.ozet?.fiyat === 42);
kontrol('status done', getJob(TID)?.status === 'done');

// 7 günden eski iş temizliği
saveJob({ id: TID + '_eski', tur: 'compare', status: 'done', startedAt: Date.now() - 9 * 86400000, updatedAt: Date.now() - 8 * 86400000 });
const silinen = cleanupOldJobs(7);
kontrol('cleanupOldJobs çalıştı', silinen >= 1, String(silinen));
kontrol('eski iş silindi', getJob(TID + '_eski') === null);
kontrol('yeni iş korundu', !!getJob(TID));
kontrol('jobIstatistik toplam sayı', typeof jobIstatistik().toplam === 'number');

// test kaydını temizle
try {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(KOK, 'data', 'en_ucuz_nerede.db'));
  db.prepare('DELETE FROM jobs WHERE id LIKE ?').run('__test_sse_%');
  db.close();
} catch { /* yok */ }

/* ============ 2) SSE canlı akış ============ */
console.log('\n2) SSE canlı akış (gerçek tarama)');
const bas = await api('/api/compare', {
  method: 'POST',
  body: JSON.stringify({
    url: URUN, taze: true,
    siteler: TEST_SITELERI,
    // Testte bir site yavaşlarsa sürünmesin (üretim varsayılanı: zaman aşımı yok)
    siteTimeoutMs: 12000,
  }),
});
const isId = bas.d?.isId;
kontrol('iş oluşturuldu', !!isId, JSON.stringify(bas.d));
if (!isId) { console.log('Devam edilemiyor.'); closeDatabase(); process.exit(1); }

// SSE bağlantısı: erişim anahtarı sorgu parametresiyle (EventSource başlık gönderemez)
const sseUrl = `${TABAN}/api/stream/${isId}?anahtar=${encodeURIComponent(ANAHTAR)}`;
const t0 = Date.now();
const sseRes = await fetch(sseUrl);
kontrol('SSE HTTP 200', sseRes.status === 200, String(sseRes.status));
kontrol('Content-Type text/event-stream',
  /text\/event-stream/.test(sseRes.headers.get('content-type') || ''),
  sseRes.headers.get('content-type'));
kontrol('Cache-Control no-cache', /no-cache/.test(sseRes.headers.get('cache-control') || ''),
  sseRes.headers.get('cache-control'));
kontrol('Connection keep-alive', /keep-alive/i.test(sseRes.headers.get('connection') || ''),
  sseRes.headers.get('connection'));

const olaylar = []; // {ad, ts, veri}
const okuyucu = sseRes.body.getReader();
const cozucu = new TextDecoder();
let tampon = '';
let akisBitti = false;
let pingGoruldu = false;

const akisOku = (async () => {
  while (!akisBitti) {
    let parca;
    try { parca = await okuyucu.read(); } catch { break; }
    if (parca.done) break;
    tampon += cozucu.decode(parca.value, { stream: true });

    let ayrac;
    while ((ayrac = tampon.indexOf('\n\n')) >= 0) {
      const blok = tampon.slice(0, ayrac);
      tampon = tampon.slice(ayrac + 2);
      if (!blok.trim()) continue;
      if (blok.startsWith(':')) { pingGoruldu = true; continue; }
      const adSatiri = blok.split('\n').find(l => l.startsWith('event: '));
      const veriSatiri = blok.split('\n').find(l => l.startsWith('data: '));
      if (!adSatiri) continue;
      const ad = adSatiri.slice(7).trim();
      let veri = null;
      if (veriSatiri) { try { veri = JSON.parse(veriSatiri.slice(6)); } catch { veri = null; } }
      olaylar.push({ ad, ts: Date.now() - t0, veri });
      if (ad === 'done' || ad === 'error') { akisBitti = true; break; }
    }
  }
})();

// En fazla 150 sn bekle
const akisSon = Date.now() + 150000;while (!akisBitti && Date.now() < akisSon) await bekle(200);
try { okuyucu.cancel(); } catch { /* kapalı */ }
await Promise.race([akisOku, bekle(3000)]);

kontrol('SSE olayları geldi', olaylar.length > 0, String(olaylar.length));
const progressOlaylari = olaylar.filter(o => o.ad === 'progress');
kontrol('progress olayı var', progressOlaylari.length > 0, String(progressOlaylari.length));
kontrol('done olayı var', olaylar.some(o => o.ad === 'done'), olaylar.map(o => o.ad).join(','));
// İlk olay: bağlantı kurulduğu an mevcut durum gönderilir. Tarama başlarken sunucu
// yoğun olabildiği için 8 sn'ye kadar tolerans tanınır (asıl ölçüt aşağıdaki GECİKME).
kontrol('ilk olay makul sürede (<8 sn)', (olaylar[0]?.ts ?? 1e9) < 8000, `${olaylar[0]?.ts} ms`);

/* ============ 2b) YAYIN → ALIM GECİKMESİ (asıl canlılık ölçütü) ============
 * Her olayın içinde `sunucuTs` (yayın anı, sunucu saati) var. Aynı makinede
 * olduğumuz için gecikme = (t0 + olay.ts) − sunucuTs.
 * Polling'de bu gecikme ortalama polling aralığının yarısı (~375–500 ms) olurdu;
 * SSE'de olay yayınlandığı anda iletilir.
 */
const gecikmeler = olaylar
  .filter(o => Number.isFinite(o.veri?.sunucuTs))
  .map(o => (t0 + o.ts) - o.veri.sunucuTs)
  .filter(x => x >= 0 && x < 60000);
const gecikmeMedyan = gecikmeler.length
  ? [...gecikmeler].sort((a, b) => a - b)[Math.floor(gecikmeler.length / 2)]
  : null;
const gecikmeMaks = gecikmeler.length ? Math.max(...gecikmeler) : null;
console.log(`    yayın→alım gecikmesi: medyan ${gecikmeMedyan ?? '-'} ms | maks ${gecikmeMaks ?? '-'} ms (${gecikmeler.length} olay)`);
kontrol('yayın→alım gecikmesi medyanı < 150 ms', gecikmeMedyan != null && gecikmeMedyan < 150, `${gecikmeMedyan} ms`);
kontrol('yayın→alım gecikmesi maks < 1000 ms', gecikmeMaks != null && gecikmeMaks < 1000, `${gecikmeMaks} ms`);

// CANLILIK KANITI: SSE sunucu İTME (push) akışıdır — istemci TEK istek açtı,
// tüm olaylar o bağlantıdan geldi. Polling'de her olay ayrı bir HTTP isteği gerektirir.
const progressZamanlari = progressOlaylari.map(o => o.ts);
const araliklar = progressZamanlari.slice(1).map((t, i) => t - progressZamanlari[i]).filter(x => x >= 0);
const enKisa = araliklar.length ? Math.min(...araliklar) : null;
const medyan = araliklar.length
  ? [...araliklar].sort((a, b) => a - b)[Math.floor(araliklar.length / 2)]
  : null;
console.log(`    progress olayı: ${progressOlaylari.length} | aralık medyanı: ${medyan ?? '-'} ms | en kısa: ${enKisa ?? '-'} ms`);

// 1) Sunucu itmesi: tek bağlantıdan çok sayıda olay
kontrol('tek SSE bağlantısından ≥3 progress olayı (server push)', progressOlaylari.length >= 3,
  String(progressOlaylari.length));
// 2) Sunucu itmesi kanıtı: en az bir kez 400 ms'den hızlı ardışık olay
//    (polling'de olaylar en iyi durumda polling aralığı kadar arayla gelirdi)
kontrol('milisaniye düzeyinde ardışık olay (en kısa < 400 ms)', enKisa != null && enKisa < 400, `${enKisa} ms`);

const doneOlay = olaylar.find(o => o.ad === 'done');
kontrol('done olayında sonuç var', !!doneOlay?.veri?.result, JSON.stringify(doneOlay?.veri?.status));
kontrol('done olayında kaynak var', !!doneOlay?.veri?.result?.kaynak);

/* ============ 2c) DETERMİNİSTİK 'done' TESTİ (ağa hiç çıkmaz) ============
 * Gerçek tarama dış sitelere bağlı; `done` olayının doğruluğunu ağdan bağımsız
 * kanıtlamak için ANINDA biten bir iş kullanılır: muadil motoru hazır `sonuc`
 * verilip `elle:false` ise hiç arama yapmaz → iş anında tamamlanır.
 */
const hazirSonuc = {
  kaynak: { site: 'robo90', siteName: 'Robo90', urun: 'Test Filament', modelKodu: 'TEST1' },
  sonuclar: [{
    site: 'robo90', siteName: 'Robo90', status: 'found', renkAyni: true,
    product: {
      url: 'https://ornek.test/u', title: 'Test Filament 1kg', sellingPrice: 500,
      pricing: { toplam: 500, kargo: {} }, inStock: true,
    },
  }],
  ozet: { enUcuzFiyat: 500, enUcuzSite: 'Robo90' },
};
const hizli = await api('/api/muadil', {
  method: 'POST',
  body: JSON.stringify({ sonuc: hazirSonuc, elle: false }),
});
const hizliId = hizli.d?.isId || hizli.d?.id;
kontrol('deterministik iş oluşturuldu', !!hizliId, JSON.stringify(hizli.d));

if (hizliId) {
  const tH = Date.now();
  const r2 = await fetch(`${TABAN}/api/stream/${hizliId}?anahtar=${encodeURIComponent(ANAHTAR)}`);
  const rd2 = r2.body.getReader();
  const dec2 = new TextDecoder();
  let metin2 = '';
  let gorulenDone = false;
  for (let i = 0; i < 25; i++) {
    const p2 = await Promise.race([rd2.read(), bekle(1000).then(() => ({ done: true }))]);
    if (p2.done) break;
    metin2 += dec2.decode(p2.value, { stream: true });
    // TAM blok geldi mi? ('event: done' görülmesi yetmez — data satırı sonra gelebilir)
    if (/event: done\ndata: .+\n\n/.test(metin2)) { gorulenDone = true; break; }
  }
  try { rd2.cancel(); } catch { /* kapalı */ }
  kontrol('anında biten işte SSE "done" olayı', gorulenDone, metin2.slice(0, 120));
  kontrol('"done" 3 sn içinde geldi', gorulenDone && Date.now() - tH < 3000, `${Date.now() - tH} ms`);
  const doneVeri = (() => {
    const m = metin2.match(/event: done\ndata: (.+)\n/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  })();
  // muadil işinin sonuç şeması farklı: {gerekli, tetik, mevcut, alternatifler, …}
  kontrol('anında biten işin sonucu SSE ile geldi (result dolu)', !!doneVeri?.result,
    JSON.stringify(doneVeri?.status));
  kontrol('SSE "done" olayında status=done', doneVeri?.status === 'done', String(doneVeri?.status));
  kontrol('sonuç içeriği doğru (mevcut.fiyat=500)', doneVeri?.result?.mevcut?.fiyat === 500,
    JSON.stringify(doneVeri?.result?.mevcut || null));
  kontrol('SSE olayında sunucuTs var', Number.isFinite(doneVeri?.sunucuTs), String(doneVeri?.sunucuTs));
  // Aynı iş REST üzerinden de okunabilmeli (geriye dönük uyum)
  const hizliRest = await api('/api/muadil/' + hizliId);
  kontrol('muadil REST ucu çalışıyor', hizliRest.ok && hizliRest.d?.status === 'done',
    String(hizliRest.d?.status));
}

/* ============ 3) REST uyumluluğu ============ */
console.log('\n3) REST uçları geriye dönük uyumlu');
const rest = await api('/api/compare/' + isId);
kontrol('GET /api/compare/:id 200', rest.ok && rest.status === 200);
kontrol('status done', rest.d?.status === 'done', rest.d?.status);
kontrol('result dolu', !!rest.d?.result?.kaynak);
kontrol('progress alanı var', 'progress' in (rest.d || {}));
kontrol('sureMs alanı var', typeof rest.d?.sureMs === 'number');
kontrol('kaynak alanı var', !!rest.d?.kaynak);
kontrol('partialResults alanı var', Array.isArray(rest.d?.partialResults));

const yok = await api('/api/compare/yok_boyle_is_123');
kontrol('olmayan iş 404', yok.status === 404, String(yok.status));

const jobsUc = await api('/api/jobs?limit=5');
kontrol('/api/jobs çalışıyor', jobsUc.ok && Array.isArray(jobsUc.d?.isler));
kontrol('/api/jobs bu işi listeliyor', (jobsUc.d?.isler || []).some(x => x.id === isId));

/* ============ 3b) DÜRÜSTLÜK: kısmi tarama anlık sonuca yazılmamalı ============
 * Bu test `siteler` alt kümesiyle taradı (61 sitenin 12'si). Böyle bir sonuç
 * 5 saat "anlık sonuç" olarak sunulursa kullanıcı eksik listeyi tam sanır.
 */
const { anahtarCikar } = await import('file:///' + path.join(KOK, 'src', 'anlikOnbellek.js').replace(/\\/g, '/').replace(/ /g, '%20'));
const { DatabaseSync: DbSync } = await import('node:sqlite');
const dbKontrol = new DbSync(path.join(KOK, 'data', 'en_ucuz_nerede.db'));
const anahtar = anahtarCikar(URUN);
const snapSayisi = dbKontrol.prepare('SELECT COUNT(*) c FROM snapshot WHERE anahtar = ?').get(anahtar).c;
dbKontrol.close();
kontrol("site alt kümesi taraması snapshot'a YAZILMADI", Number(snapSayisi) === 0, `${snapSayisi} kayıt`);

const durumUc = await api('/api/durum');
kontrol('/api/durum iş istatistiği içeriyor', !!durumUc.d?.isler && typeof durumUc.d.isler.toplam === 'number');

/* ============ 4) Yeniden başlatma sonrası kalıcılık ============ */
console.log('\n4) Sunucu yeniden başlatma → iş kaydı korunuyor mu?');
if (restartsiz) {
  console.log('    (--restartsiz: atlandı)');
} else {
  const baslat = Date.now();
  // Windows'ta yol boşluk içeriyor ("Erdal Keskin") → komutu TEK dizge olarak ve
  // tırnaklı ver (shell:true argümanları kaçışlamaz).
  const r = spawnSync(`"${PM2}" restart ${SERVIS}`, {
    encoding: 'utf8', shell: true, timeout: 180000,
  });
  kontrol('pm2 restart komutu çalıştı', r.status === 0, `kod ${r.status}: ${String(r.stderr || r.stdout || '').slice(-120)}`);

  // Sunucu ayağa kalksın
  let hazir = false;
  for (let i = 0; i < 60; i++) {
    await bekle(1000);
    try {
      const p = await fetch(TABAN + '/api/ping', { headers: { 'x-erisim-anahtari': ANAHTAR }, signal: AbortSignal.timeout(3000) });
      if (p.ok) { hazir = true; break; }
    } catch { /* henüz değil */ }
  }
  kontrol('sunucu yeniden ayağa kalktı', hazir, `${Math.round((Date.now() - baslat) / 1000)} sn`);

  if (hazir) {
    const sonra = await api('/api/compare/' + isId);
    kontrol('yeniden başlatma sonrası iş bulundu (DB)', sonra.status === 200, String(sonra.status));
    kontrol('yeniden başlatma sonrası durum done', sonra.d?.status === 'done', sonra.d?.status);
    kontrol('yeniden başlatma sonrası sonuç korundu', !!sonra.d?.result?.kaynak,
      JSON.stringify(sonra.d?.result?.kaynak?.urun || null));
    kontrol('sonuçtaki en ucuz fiyat korundu',
      Number(sonra.d?.result?.ozet?.enUcuzFiyat) > 0,
      String(sonra.d?.result?.ozet?.enUcuzFiyat));

    // Yarıda kalan işler dürüstçe 'interrupted' işaretlenmiş olmalı
    const jobs2 = await api('/api/jobs?limit=50');
    const interrupted = (jobs2.d?.isler || []).filter(x => x.status === 'interrupted');
    kontrol('yarıda kalan işler "interrupted" (uydurma "done" yok)',
      interrupted.length >= 0 && (jobs2.d?.isler || []).every(x => x.status !== 'running'),
      JSON.stringify((jobs2.d?.isler || []).map(x => x.status)));

    // SSE, yeniden başlatma sonrası bitmiş işi hemen done ile kapatmalı
    const sse2 = await fetch(`${TABAN}/api/stream/${isId}?anahtar=${encodeURIComponent(ANAHTAR)}`);
    kontrol('yeniden başlatma sonrası SSE 200', sse2.status === 200, String(sse2.status));
    let sseMetni = '';
    try {
      const rd = sse2.body.getReader();
      const dec = new TextDecoder();
      const son = Date.now() + 5000;
      while (Date.now() < son) {
        const p = await Promise.race([rd.read(), bekle(600).then(() => ({ done: true }))]);
        if (p.done) break;
        sseMetni += dec.decode(p.value, { stream: true });
        if (sseMetni.includes('event: done')) break;
      }
      try { rd.cancel(); } catch { /* kapalı */ }
    } catch { /* yok */ }
    kontrol('bitmiş iş için SSE hemen "done" gönderdi', sseMetni.includes('event: done'), sseMetni.slice(0, 80));
  }
}

/* ============ 5) İstemci kodu: SSE + fallback var mı ============ */
console.log('\n5) İstemci kodu (public/app.js)');
const fs = await import('node:fs');
const app = fs.readFileSync(path.join(KOK, 'public', 'app.js'), 'utf8');
kontrol('EventSource kullanılıyor', /new EventSource\(/.test(app));
kontrol('/api/stream/ çağrısı var', /\/api\/stream\//.test(app));
kontrol('SSE kopunca polling yedeği var', /yedekPoll/.test(app) && /yedegeGec/.test(app));
kontrol('20 sn sessizlik koruması var', /20 sn olay yok/.test(app));
kontrol('karşılaştırma SSE ile izleniyor', /canliIzle\(id, \{ etiket: 'compare'/.test(app));
kontrol('öneri SSE ile izleniyor', /canliIzle\(id, \{ etiket: 'oneri'/.test(app));
kontrol('sepet SSE ile izleniyor', /canliIzle\(id, \{ etiket: 'sepet'/.test(app));
kontrol('sekme kapanışında akış kapatılıyor', /tumAkislariKapat/.test(app));
kontrol('eski polling fonksiyonları korundu (fallback)',
  /function pollIs\(id\)/.test(app) && /function oneriPoll\(id\)/.test(app) && /function sepetPoll\(id\)/.test(app));

console.log(`\nSSE-JOBS ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
closeDatabase();
process.exitCode = gecen === toplam ? 0 : 1;
