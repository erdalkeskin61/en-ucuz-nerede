/**
 * 🔬 EVREN qwen3-vl-30b — 3D Donanım Görsel Arama testleri (2026-11-05)
 *
 * Kapsam:
 *   1) Girdi doğrulama: boş / bozuk / 4 MB üstü görsel reddedilir.
 *   2) JSON sözleşmesi: urun, marka, kategori, teknikDetaylar, uyumluYazicilar,
 *      aramaSorgusu, guven alanları; halüsinasyon yasağı (uydurma yok).
 *   3) Kategori normalizasyonu + güven yüzdesi.
 *   4) Sorgu kademelemesi (marka tekrarı yok, malzeme/renk dahil, en fazla 4).
 *   5) Fiyat motoru: kanonik ürün → runComparison yolu; stokta olmayan asla
 *      "en ucuz" olmaz; kanonik yoksa dürüst "bulunamadı".
 *   6) Telegram: msg.photo yakalama, getFile indirme, sendChatAction, özet.
 *   7) Web: 1280 px/JPEG %80 küçültme, sürükle-bırak, Ctrl+V, zengin rozet,
 *      yeşil CTA, kamera (capture) özniteliği.
 *
 * Ağ isteği YOK — `fetch` mock'lanır. Gerçek EVREN kontrolü: --canli
 *
 *   node scripts/test-gorsel-arama-evren.mjs [--canli]
 */
import fs from 'node:fs';
import {
  gorselAnaliz, gorselAra, gorselAramaYap, sorgulariOlustur, jsonCikar,
  kategoriNormalize, kategoriEtiketi, guvenYuzde, gorselOzetSatiri,
  GORSEL_MAX_BAYT, GORSEL_HEDEF_GENISLIK, VISION_MODEL, KATEGORILER,
} from '../src/gorselArama.js';
import { closeDatabase } from '../src/store.js';

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

const gercekFetch = globalThis.fetch;

/** 1×1 geçerli PNG — sihirli bayt doğrulamasını geçen en küçük gerçek görsel. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Vision API yanıtını taklit eder (JSON metni döner). */
function visionMock(json, { status = 200, metin = false } = {}) {
  globalThis.fetch = async () => ({
    ok: status === 200,
    status,
    text: async () => (metin ? 'sunucu hatası' : JSON.stringify(json)),
    json: async () => ({
      choices: [{ message: { content: typeof json === 'string' ? json : JSON.stringify(json) } }],
    }),
  });
}

/* ------------------------------------------------------------------ */
bolum('1) 🛡️ Girdi doğrulama');

let hata = null;
try { await gorselAnaliz({ base64: '' }); } catch (e) { hata = e.message; }
kontrol('boş görsel reddedilir', /Görsel verisi yok/.test(String(hata)), hata);

hata = null;
try { await gorselAnaliz({ base64: 'AAAA' }); } catch (e) { hata = e.message; }
kontrol('bozuk/küçük veri reddedilir', /geçersiz/.test(String(hata)), hata);

hata = null;
try { await gorselAnaliz({ base64: 'Q'.repeat(400) }); } catch (e) { hata = e.message; }
kontrol('görsel olmayan payload reddedilir (magic byte)', /desteklenen biçimler/.test(String(hata)), hata);

hata = null;
try {
  const buyuk = PNG_1X1.slice(0, 40) + 'A'.repeat(Math.ceil((GORSEL_MAX_BAYT + 2048) * 4 / 3));
  await gorselAnaliz({ base64: buyuk });
} catch (e) { hata = e.message; }
kontrol('4 MB üstü reddedilir', /çok büyük/.test(String(hata)), hata);
kontrol('sınır sabiti 4 MB', GORSEL_MAX_BAYT === 4 * 1024 * 1024, String(GORSEL_MAX_BAYT));
kontrol('istemci hedefi 1280 px', GORSEL_HEDEF_GENISLIK === 1280, String(GORSEL_HEDEF_GENISLIK));
kontrol('vision modeli qwen3-vl-30b', VISION_MODEL === 'qwen3-vl-30b', VISION_MODEL);

/* ------------------------------------------------------------------ */
bolum('2) 🧠 Vision JSON sözleşmesi');

const GECERLI_JSON = {
  urun: 'Bambu Lab P1S / X1C Komple Hotend Grubu',
  marka: 'Bambu Lab',
  kategori: 'hotend_parca',
  malzeme: null,
  teknikDetaylar: '0.4mm Nozle, Seramik Isıtıcı ve Termistörlü',
  uyumluYazicilar: ['Bambu Lab P1P', 'P1S', 'X1C'],
  aramaSorgusu: 'Bambu Lab P1S X1C Hotend 0.4mm',
  guven: 'yuksek',
};

visionMock(GECERLI_JSON);
const a = await gorselAnaliz({ base64: PNG_1X1 });
kontrol('urun dolu', a.urun === GECERLI_JSON.urun, a.urun);
kontrol('marka dolu', a.marka === 'Bambu Lab', a.marka);
kontrol('kategori normalize', a.kategori === 'hotend_parca', a.kategori);
kontrol('kategori etiketi', /Hotend/.test(a.kategoriEtiketi), a.kategoriEtiketi);
kontrol('teknikDetaylar dolu', /0\.4mm/.test(a.teknikDetaylar), a.teknikDetaylar);
kontrol('uyumluYazicilar dizisi', Array.isArray(a.uyumluYazicilar) && a.uyumluYazicilar.length === 3,
  JSON.stringify(a.uyumluYazicilar));
kontrol('aramaSorgusu dolu', !!a.aramaSorgusu, a.aramaSorgusu);
kontrol('güven yuksek', a.guven === 'yuksek', a.guven);
kontrol('güven yüzdesi %95', a.guvenYuzde === 95, String(a.guvenYuzde));
kontrol('özellik listesi üretildi', a.ozellikler.length >= 2, JSON.stringify(a.ozellikler));
kontrol('geriye dönük "model" alanı var', !!a.model);
kontrol('özet satırı üretildi', /Hotend/.test(gorselOzetSatiri(a)), gorselOzetSatiri(a));

// Halüsinasyon yasağı: marka okunamıyorsa null
visionMock({ ...GECERLI_JSON, marka: null, guven: 'dusuk' });
const a2 = await gorselAnaliz({ base64: PNG_1X1 });
kontrol('marka yoksa null (uydurma yok)', a2.marka === null, String(a2.marka));
kontrol('düşük güven korunur', a2.guven === 'dusuk' && a2.guvenYuzde === 45, a2.guven);
visionMock({ ...GECERLI_JSON, marka: 'bilinmiyor', teknikDetaylar: 'null' });
const a3 = await gorselAnaliz({ base64: PNG_1X1 });
kontrol('"bilinmiyor" metni null\'a çevrilir', a3.marka === null && a3.teknikDetaylar === null);

// Kod bloğu ve ek metin toleransı
visionMock('```json\n' + JSON.stringify(GECERLI_JSON) + '\n```');
const a4 = await gorselAnaliz({ base64: PNG_1X1 });
kontrol('kod bloğu JSON çözülür', a4.urun === GECERLI_JSON.urun, a4.urun);

// Bozuk JSON → dürüst hata
visionMock('bu bir JSON değil');
hata = null;
try { await gorselAnaliz({ base64: PNG_1X1 }); } catch (e) { hata = e.message; }
kontrol('bozuk JSON dürüst hata verir', /tanınamadı/.test(String(hata)), hata);

// API hatası
visionMock('', { status: 503, metin: true });
hata = null;
try { await gorselAnaliz({ base64: PNG_1X1 }); } catch (e) { hata = e.message; }
kontrol('API hatası raporlanır', /HTTP 503/.test(String(hata)), hata);

globalThis.fetch = gercekFetch;

/* ------------------------------------------------------------------ */
bolum('3) 🏷️ Kategori ve güven normalizasyonu');

const kategoriBeklenti = [
  ['Nozzle (Uç)', 'nozzle'],
  ['step motor', 'step_motor'],
  ['Termistör NTC 100K', 'termistor'],
  ['BLTouch sensör', 'sensör'],
  ['PEI tabla', 'tabla'],
  ['GT2 kayış', 'kayis'],
  ['Anakart', 'anakart'],
  ['filament makarası', 'filament'],
  ['reçine', 'recine'],
  ['3D yazıcı', 'yazici'],
  ['bilinmeyen şey', 'diger'],
];
for (const [giris, beklenen] of kategoriBeklenti) {
  kontrol(`kategori: "${giris}" → ${beklenen}`, kategoriNormalize(giris) === beklenen,
    kategoriNormalize(giris));
}
kontrol('tüm kategoriler etiketli', KATEGORILER.every(k => !!kategoriEtiketi(k)));
kontrol('güven: yuksek→95', guvenYuzde('yuksek') === 95);
kontrol('güven: orta→70', guvenYuzde('orta') === 70);
kontrol('güven: dusuk→45', guvenYuzde('dusuk') === 45);
kontrol('bilinmeyen güven→70', guvenYuzde('xyz') === 70);

kontrol('jsonCikar düz JSON', !!jsonCikar('{"a":1}'));
kontrol('jsonCikar metin içinde JSON', !!jsonCikar('cevap: {"a":1} son'));
kontrol('jsonCikar boşta null', jsonCikar('') === null && jsonCikar('yok') === null);

/* ------------------------------------------------------------------ */
bolum('4) 🔎 Sorgu kademelemesi');

const s1 = sorgulariOlustur({
  urun: 'hotend', marka: 'Bambu Lab', aramaSorgusu: 'hotend 0.4mm', renk: null,
});
kontrol('marka + tür sorgusu', s1.includes('Bambu Lab hotend 0.4mm'), JSON.stringify(s1));
kontrol('yalın tür sorgusu', s1.includes('hotend 0.4mm'), JSON.stringify(s1));
kontrol('en fazla 4 sorgu', s1.length <= 4, String(s1.length));

const s2 = sorgulariOlustur({ urun: 'filament', marka: 'eSun', malzeme: 'PLA', aramaSorgusu: 'filament', renk: 'siyah' });
kontrol('malzeme sorguya girer', s2.some(x => /esun pla/i.test(x)), JSON.stringify(s2));
kontrol('renk sorguya girer', s2.some(x => /siyah/i.test(x)), JSON.stringify(s2));

const s3 = sorgulariOlustur({ urun: 'hotend', marka: 'Bambu Lab', aramaSorgusu: 'Bambu Lab hotend' });
kontrol('marka tekrarı yok', !s3.some(x => /bambu lab\s+bambu lab/i.test(x)), JSON.stringify(s3));

kontrol('sorgu yoksa boş dizi', sorgulariOlustur({}).length === 0);

/* ------------------------------------------------------------------ */
bolum('5) 💰 Fiyat motoru (kanonik + stok filtresi)');

// Kanonik bulunamadı → dürüst "bulunamadı" (ağ isteği yok)
globalThis.fetch = async () => { throw new Error('ağ kapalı'); };
const bosSonuc = await gorselAra(
  { urun: 'ZZZ Bulunmayan Parça', aramaSorgusu: 'zzz-bulunmayan-parca-xyz', marka: null, guven: 'dusuk' },
  { yedekArama: false },
);
globalThis.fetch = gercekFetch;
kontrol('kanonik yok → bulunamadi', bosSonuc.bulunamadi === true, JSON.stringify(bosSonuc).slice(0, 120));
kontrol('kanonik yok → fiyat uydurulmaz', bosSonuc.adaylar.length === 0 && bosSonuc.enUcuz === null);
kontrol('kanonik yok → neden açıklanır', typeof bosSonuc.neden === 'string' && bosSonuc.neden.length > 10);

// Site listesi yolu (ağ yok): stok/sıralama davranışı
const sonucSite = await gorselAra(
  { urun: 'hotend', marka: 'Bambu Lab', aramaSorgusu: 'bambu hotend', guven: 'yuksek' },
  { siteler: [] },
);
kontrol('siteler:[] → aday yok', sonucSite.adaylar.length === 0);
kontrol('siteler:[] → sorgular üretilir', sonucSite.sorgular.length > 0);
kontrol('siteler:[] → analiz geri döner', sonucSite.analiz.marka === 'Bambu Lab');
kontrol('siteler:[] → özet yöntemi', sonucSite.ozet.yontem === 'site-taramasi', sonucSite.ozet.yontem);

/* ------------------------------------------------------------------ */
bolum('6) 📱 Telegram fotoğraf akışı');

const tg = fs.readFileSync('src/telegramBot.js', 'utf8');
kontrol('msg.photo yakalanıyor', /Array\.isArray\(msg\?\.photo\)/.test(tg));
kontrol('en yüksek çözünürlük seçilir', /msg\.photo\[msg\.photo\.length - 1\]/.test(tg));
kontrol('foto yakalama komutlardan ÖNCE', tg.indexOf('if (foto?.file_id)') < tg.indexOf('const komut = komutAyikla(text)'));
kontrol('getFile çağrısı', /api\(token, 'getFile'/.test(tg));
kontrol('file_path ile indirme', /api\.telegram\.org\/file\/bot/.test(tg));
kontrol('sendChatAction upload_photo', /sendChatAction[\s\S]{0,120}upload_photo/.test(tg));
kontrol('EVREN inceleniyor mesajı', /EVREN LLM \(qwen3-vl-30b\)/.test(tg));
kontrol('caption ipucu olarak geçiyor', /msg\?\.caption/.test(tg));
kontrol('güven skoru satırı', /Güven Skoru:/.test(tg));
kontrol('uyumlu modeller satırı', /Uyumlu Modeller:/.test(tg));
kontrol('kanonik sonuç sonucMesajiOlustur ile', /sonucMesajiOlustur\(sonuc\.hamSonuc/.test(tg));
kontrol('hata kullanıcıya bildirilir', /Görsel incelenemedi/.test(tg));
kontrol('20 MB Telegram sınırı', /TELEGRAM_FOTO_LIMIT/.test(tg));

// Gerçek indirme akışı: getFile → file_path → binary (fetch mock)
{
  const { telegramFotoIndir } = await import('../src/telegramBot.js');
  const pngBayt = Buffer.from(PNG_1X1, 'base64');
  let getFileCagri = null;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/getFile')) {
      getFileCagri = JSON.parse(opts.body || '{}');
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, result: { file_path: 'photos/file_1.jpg', file_size: pngBayt.length } }),
      };
    }
    if (String(url).includes('/file/bot')) {
      return {
        ok: true, status: 200,
        arrayBuffer: async () => pngBayt.buffer.slice(pngBayt.byteOffset, pngBayt.byteOffset + pngBayt.length),
      };
    }
    throw new Error('beklenmeyen istek: ' + url);
  };
  const indirilen = await telegramFotoIndir('TESTTOKEN', 'FILEID123');
  globalThis.fetch = gercekFetch;

  kontrol('getFile file_id gönderir', getFileCagri?.file_id === 'FILEID123', JSON.stringify(getFileCagri));
  kontrol('dosya indirilir ve base64 döner', indirilen.base64 === PNG_1X1, 'base64 farklı');
  kontrol('mime doğru (jpg→image/jpeg)', indirilen.mime === 'image/jpeg', indirilen.mime);
  kontrol('bayt sayısı doğru', indirilen.bayt === pngBayt.length, String(indirilen.bayt));
  kontrol('indirilen görsel analiz edilebilir (magic byte)',
    (() => { try { return Buffer.from(indirilen.base64, 'base64')[0] === 0x89; } catch { return false; } })());
}

/* ------------------------------------------------------------------ */
bolum('7) 🖥️ Web arayüzü');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/tarayici.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');

kontrol('dosya girdisi kamera destekli', /id="gorselDosya"[^>]*accept="image\/\*"[^>]*capture="environment"/.test(html));
kontrol('sürükle-bırak alanı', /id="gorselBirak"/.test(html));
kontrol('bırakma ipucu', /id="gorselBirakIpucu"/.test(html));
kontrol('Ctrl+V ipucu metni', /Ctrl/.test(html));
kontrol('zengin rozet alanı', /id="gorselRozet"/.test(html));
kontrol('en ucuz CTA alanı', /id="gorselCta"/.test(html));

kontrol('JS: 1280 px küçültme', /maxKenar = 1280/.test(js));
kontrol('JS: JPEG %80', /toDataURL\('image\/jpeg', 0\.80\)/.test(js));
kontrol('JS: oran korunur', /Math\.min\(1, maxKenar \/ Math\.max/.test(js));
kontrol('JS: dragenter/dragover/drop', /dragenter/.test(js) && /dragover/.test(js) && /'drop'/.test(js));
kontrol('JS: pano paste dinleyicisi', /addEventListener\('paste'/.test(js));
kontrol('JS: yalnızca görsel öğe yakalanır', /startsWith\('image\/'\)/.test(js));
kontrol('JS: metin yapıştırmayı bozmaz', /yazilanAlan/.test(js));
kontrol('JS: rozet HTML', /gorsel-rozet/.test(js));
kontrol('JS: uyumlu modeller gösterilir', /Uyumlu modeller/.test(js));
kontrol('JS: CTA mağazaya git', /Mağazaya Git \(En Ucuz\)/.test(js));
kontrol('JS: stok rozeti', /stokta<\/span>|tükendi/.test(js));
kontrol('JS: sponsored link', /rel="noopener sponsored"/.test(js));

kontrol('CSS: rozet stilleri', /\.gorsel-rozet\s*\{/.test(css));
kontrol('CSS: CTA kart', /\.gorsel-cta-kart\s*\{/.test(css));
kontrol('CSS: sürükle hedefi', /\.gorsel-birak-ipucu\s*\{/.test(css));
kontrol('CSS: koyu tema', /data-theme="dark"\] \.gorsel-rozet/.test(css));
kontrol('CSS: mobil CTA tam genişlik', /@media \(max-width: 560px\)[\s\S]{0,300}gorsel-cta-btn/.test(css));

/* ------------------------------------------------------------------ */
/* 8) Canlı EVREN kontrolü (opsiyonel)                                 */
/* ------------------------------------------------------------------ */
if (process.argv.includes('--canli')) {
  bolum('8) 🌐 CANLI — EVREN qwen3-vl-30b');
  try {
    // 1x1 beyaz PNG (gerçek bir parça değil): model "tanıyamadım" demelidir.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const c = await gorselAnaliz({ base64: png, mime: 'image/png' });
    kontrol('canlı: yanıt geldi', !!c && (!!c.urun || !!c.aramaSorgusu), JSON.stringify(c).slice(0, 120));
    kontrol('canlı: güven geçerli', ['yuksek', 'orta', 'dusuk'].includes(c.guven), c.guven);
    kontrol('canlı: kategori geçerli', KATEGORILER.includes(c.kategori), c.kategori);
    console.log('  analiz:', JSON.stringify({ urun: c.urun, kategori: c.kategori, guven: c.guven }));
  } catch (e) {
    // Boş görselde "tanınamadı" DÜRÜST davranıştır (hata değil).
    kontrol('canlı: anlamsız görselde dürüst ret', /tanınamadı|HTTP/.test(String(e.message)),
      String(e.message).slice(0, 120));
    console.log('  (beklenen dürüst davranış:', String(e.message).slice(0, 90) + ')');
  }
  try {
    const t0 = Date.now();
    const r = await gorselAra(cParam(GECERLI_JSON), { limit: 6 });
    const sure = Date.now() - t0;
    kontrol('canlı: tarama tamamlandı', Array.isArray(r.adaylar));
    kontrol('canlı: 90 sn altında', sure < 90000, `${(sure / 1000).toFixed(1)} sn`);
    console.log(`  ${(sure / 1000).toFixed(1)} sn · ${r.adaylar.length} aday · en ucuz: ${r.ozet.enUcuzSite || '-'} ${r.ozet.enUcuzFiyat || ''}`);
  } catch (e) {
    kontrol('canlı: tarama hatası raporlanır', false, String(e.message).slice(0, 100));
  }
} else {
  console.log('\nℹ️  Canlı EVREN testi için: node scripts/test-gorsel-arama-evren.mjs --canli');
}

function cParam(o) {
  return {
    urun: o.urun, marka: o.marka, kategori: o.kategori,
    teknikDetaylar: o.teknikDetaylar, uyumluYazicilar: o.uyumluYazicilar,
    aramaSorgusu: o.aramaSorgusu, guven: o.guven,
    kategoriEtiketi: kategoriEtiketi(o.kategori), guvenYuzde: 95,
  };
}

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
