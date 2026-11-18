/**
 * ⚙️ Ayar kaydı testleri — 2026-11-01
 *
 * Gerçek vaka: "📢 Otonom Fırsat Kanalı → paylaşımı etkinleştir" kutusu
 * işaretlendiği hâlde F5 sonrası kayboluyordu. Sebep: kutu yalnızca sayfanın
 * üstündeki "Ayarları kaydet" düğmesiyle yazılıyordu; kullanıcı yalnızca
 * tikleyip yenilediğinde değişiklik hiç sunucuya gitmiyordu.
 *
 * Bu test şunları doğrular:
 *  1) Onay kutusu değişimi ANINDA (butona basmadan) kaydediliyor.
 *  2) Kısmi kayıt ({ firsat }) diğer ayarları (SMTP/Telegram/WhatsApp/afiliye)
 *     ezmiyor.
 *  3) Kaydedilen değer GET /api/settings ile geri okunuyor (F5 sonrası kalıcı).
 *  4) Sayısal alanlar sınırlandırılıyor, bozuk değer varsayılana düşüyor.
 *
 * Kullanım:
 *   node scripts/test-ayar-kayit.mjs
 *   node scripts/test-ayar-kayit.mjs --canli   (sunucu açık olmalı)
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

const js = oku('public/admin.js');
const html = oku('public/admin.html');

/* ---------------------------------------------------------------- */
bolum('1) Arayüz: otomatik kayıt sözleşmesi');
kontrol('fırsat onay kutusu var', /id="firsatEnabled"/.test(html));
kontrol('otomatik kayıt bilgi notu', /otomatik kaydedilir/i.test(html));
kontrol('kayıt durumu alanı', /id="firsatKaydetMesaj"/.test(html));
kontrol('onay kutusunda change dinleyicisi', /\$\('#firsatEnabled'\)\?\.addEventListener\('change'/.test(js));
kontrol('change → anında kaydet (debounce yok)',
  /\$\('#firsatEnabled'\)\?\.addEventListener\('change',[\s\S]{0,160}firsatAyarlariniKaydet\(\)/.test(js));
kontrol('diğer alanlar debounce ile', /firsatKaydetGecikmeli/.test(js) && /setTimeout\(firsatAyarlariniKaydet, 500\)/.test(js));
kontrol('kısmi gövde gönderiliyor', /JSON\.stringify\(\{ firsat: firsatFormDegeri\(\) \}\)/.test(js));
kontrol('pagehide sırasında keepalive kayıt', /keepalive: true/.test(js));
kontrol('sunucudan dönen değerler forma yansıtılıyor', /veri\.firsat \|\| \{\}/.test(js));
kontrol('başarı mesajı açık/kapalı ayrımı', /kanal paylaşımı AÇIK/.test(js) && /kanal paylaşımı kapalı/.test(js));

/* ---------------------------------------------------------------- */
bolum('2) Sunucu: kısmi kayıt diğer ayarları ezmiyor');
const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
const h = { 'Content-Type': 'application/json' };
if (config.erisimAnahtari) h['x-erisim-anahtari'] = config.erisimAnahtari;

const canli = process.argv.includes('--canli');
let apiTestEdildi = false;
if (canli) {
  try {
    const once = await (await fetch(taban + '/api/settings', { headers: h })).json();
    const yedek = {
      telegram: once.telegram,
      smtp: once.smtp,
      whatsapp: once.whatsapp,
      alarmEmail: once.alarmEmail,
      afiliye: once.afiliye,
      firsat: once.firsat,
    };

    // Kısmi kayıt: yalnızca firsat
    const hedef = { ...once.firsat, enabled: !once.firsat?.enabled, minIndirim: 17 };
    const p = await fetch(taban + '/api/settings', {
      method: 'POST', headers: h, body: JSON.stringify({ firsat: hedef }),
    });
    kontrol('canlı: kısmi kayıt 200', p.status === 200, String(p.status));
    const sonra = await (await fetch(taban + '/api/settings', { headers: h })).json();

    kontrol('canlı: firsat.enabled değişti', sonra.firsat?.enabled === hedef.enabled,
      `${sonra.firsat?.enabled} vs ${hedef.enabled}`);
    kontrol('canlı: firsat.minIndirim kaydedildi', sonra.firsat?.minIndirim === 17, String(sonra.firsat?.minIndirim));
    kontrol('canlı: telegram korundu',
      JSON.stringify(sonra.telegram) === JSON.stringify(yedek.telegram));
    kontrol('canlı: smtp korundu',
      (sonra.smtp?.host || '') === (yedek.smtp?.host || '') && (sonra.smtp?.user || '') === (yedek.smtp?.user || ''));
    kontrol('canlı: whatsapp korundu',
      JSON.stringify(sonra.whatsapp) === JSON.stringify(yedek.whatsapp));
    kontrol('canlı: alarmEmail korundu', sonra.alarmEmail === yedek.alarmEmail);
    kontrol('canlı: afiliye korundu', JSON.stringify(sonra.afiliye) === JSON.stringify(yedek.afiliye));

    // Sınır testi: bozuk değerler
    const p2 = await fetch(taban + '/api/settings', {
      method: 'POST', headers: h,
      body: JSON.stringify({ firsat: { minIndirim: 999, gunlukMax: 0, saatAraligi: 999 } }),
    });
    const s2 = await p2.json();
    kontrol('canlı: minIndirim 95 ile sınırlandı', s2.firsat?.minIndirim === 95, String(s2.firsat?.minIndirim));
    kontrol('canlı: gunlukMax en az 1', s2.firsat?.gunlukMax === 1, String(s2.firsat?.gunlukMax));
    kontrol('canlı: saatAraligi en çok 24', s2.firsat?.saatAraligi === 24, String(s2.firsat?.saatAraligi));

    // Yedeğe dön (test ortamı kirletilmesin)
    await fetch(taban + '/api/settings', {
      method: 'POST', headers: h,
      body: JSON.stringify({ firsat: yedek.firsat }),
    });
    apiTestEdildi = true;
    console.log('     canlı: ayarlar test sonrası eski değere döndürüldü');
  } catch (e) {
    kontrol('canlı: ayar uçlarına erişilebildi', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Sunucu testi için: --canli');
}

/* ---------------------------------------------------------------- */
bolum('3) Ayarlar deposu (kaynak düzeyi)');
{
  const store = oku('src/store.js');
  kontrol('FIRSAT_ANAHTARLARI enabled içeriyor', /FIRSAT_ANAHTARLARI = \[[\s\S]*?'enabled'/.test(store));
  kontrol('firsat kaydı doğrulanarak yazılıyor', /firsat: firsatSinirla\(/.test(store));
  kontrol('yazma anında sayısal sınırlama', /function firsatSinirla\(nesne\)/.test(store)
    && /Math\.min\(max, Math\.max\(min, n\)\)/.test(store));
  kontrol('DEFAULT_SETTINGS firsat varsayılanı', /firsat: \{[\s\S]{0,160}enabled: false/.test(store));
  kontrol('kayıt sonrası GET aynı anahtarı okur', /export function getSettings\(\)/.test(store));
}

/* ------------------------------------------------------------------ */
/* 🎯 Hedefe kalan mesafe + 🔔 Telegram canlı test (2026-11-12)        */
/* ------------------------------------------------------------------ */
console.log('\n🎯 Hedefe kalan mesafe + 🔔 Telegram test');

const ayarlarJs = oku('public/ayarlar.js');
const ayarlarHtml = oku('public/ayarlar.html');
const stilCss = oku('public/style.css');
const alarmsSrc = oku('src/alarms.js');
const serverSrc = oku('server.js');

const {
  hedefMesafeHesapla, mevcutEnUcuzFiyat, HEDEF_RENK_ESIKLERI,
} = await import('../public/hedefMesafe.js');

/* --- Saf matematik --- */
{
  const h = hedefMesafeHesapla(620, 550);
  kontrol('hedef: yolda durumu', h.durum === 'yol', h.durum);
  kontrol('hedef: kalan 70 TL', h.kalanTL === 70, String(h.kalanTL));
  kontrol('hedef: oran %89', h.oran === 89, String(h.oran));
  kontrol('hedef: %89 -> indigo', h.renk === 'indigo', h.renk);
  kontrol('hedef: %89 "cok yakin" degil', h.yakin === false);
}
{
  const h = hedefMesafeHesapla(620, 700);
  kontrol('hedef: ulasildi durumu', h.durum === 'ulasildi', h.durum);
  kontrol('hedef: ulasildi oran 100', h.oran === 100, String(h.oran));
  kontrol('hedef: ulasildi yesil', h.renk === 'yesil', h.renk);
  kontrol('hedef: ulasildi kalan 0', h.kalanTL === 0);
}
kontrol('hedef: tam esitlik -> ulasildi', hedefMesafeHesapla(620, 620).durum === 'ulasildi');
{
  const h = hedefMesafeHesapla(620, 585);
  kontrol('hedef: %94 -> yesil', h.renk === 'yesil', h.renk);
  kontrol('hedef: %94 -> cok yakin', h.yakin === true);
}
kontrol('hedef: %73 -> indigo', hedefMesafeHesapla(620, 450).renk === 'indigo',
  String(hedefMesafeHesapla(620, 450).oran));
kontrol('hedef: %90 sinirinda yesil', hedefMesafeHesapla(1000, 900).renk === 'yesil',
  String(hedefMesafeHesapla(1000, 900).oran));
kontrol('hedef: %69 -> amber', hedefMesafeHesapla(1000, 690).renk === 'amber',
  String(hedefMesafeHesapla(1000, 690).oran));
{
  const h = hedefMesafeHesapla(620, null);
  kontrol('hedef: hedef yok -> hedef_yok', h.durum === 'hedef_yok');
  kontrol('hedef: hedef yok oran null', h.oran === null);
  kontrol('hedef: hedef 0 -> hedef_yok', hedefMesafeHesapla(620, 0).durum === 'hedef_yok');
}
{
  const h = hedefMesafeHesapla(null, 550);
  kontrol('hedef: fiyat yok -> fiyat_yok', h.durum === 'fiyat_yok');
  kontrol('hedef: fiyat yok hedef korunur', h.hedef === 550, String(h.hedef));
}
{
  const cokUzak = hedefMesafeHesapla(10000, 10);
  kontrol('hedef: oran alt siniri 5', cokUzak.oran === 5, String(cokUzak.oran));
  const cokYakin = hedefMesafeHesapla(1000, 995);
  kontrol('hedef: oran ust siniri 99', cokYakin.oran === 99, String(cokYakin.oran));
  kontrol('hedef: 99 henuz ulasilmadi sayilir', cokYakin.durum === 'yol');
}
kontrol('hedef: esikler 90/70',
  HEDEF_RENK_ESIKLERI.yesil === 90 && HEDEF_RENK_ESIKLERI.indigo === 70,
  JSON.stringify(HEDEF_RENK_ESIKLERI));

/* --- mevcutEnUcuzFiyat: gerçek veri önceliği --- */
kontrol('fiyat: son kontrol enUcuzFiyat onceligi',
  mevcutEnUcuzFiyat({ fiyatGecmisi: [{ enUcuzFiyat: 620 }], sonFiyatlar: [{ fiyat: 500 }] }) === 620);
kontrol('fiyat: gecmis yoksa sonFiyatlar minimumu',
  mevcutEnUcuzFiyat({ sonFiyatlar: [{ fiyat: 655 }, { fiyat: 620 }, { fiyat: 0 }] }) === 620);
kontrol('fiyat: gecersiz gecmis -> sonFiyatlar',
  mevcutEnUcuzFiyat({ fiyatGecmisi: [{ enUcuzFiyat: null }], sonFiyatlar: [{ fiyat: 700 }] }) === 700);
kontrol('fiyat: veri yok -> null', mevcutEnUcuzFiyat({}) === null);
kontrol('fiyat: null takip guvenli', mevcutEnUcuzFiyat(null) === null);

/* --- ayarlar.js sözleşmesi --- */
kontrol('ayarlar: hedefMesafe modulu dinamik yuklenir', /import\('\/hedefMesafe\.js'\)/.test(ayarlarJs));
kontrol('ayarlar: hedefMesafeCubugu tanimli', /function hedefMesafeCubugu\(/.test(ayarlarJs));
kontrol('ayarlar: hedefMesafeGuncelle tanimli', /function hedefMesafeGuncelle\(/.test(ayarlarJs));
kontrol('ayarlar: kart sablonuna cubuk eklenir', /\$\{hedefMesafeCubugu\(t, modül\)\}/.test(ayarlarJs));
kontrol('ayarlar: kaydet sonrasi canli guncelleme', /hedefMesafeGuncelle\(takip, modül\)/.test(ayarlarJs));
kontrol('ayarlar: hedef yok -> rehber metni',
  /alarmı kurmak için yukarıdan hedef fiyat belirleyin/.test(ayarlarJs));
kontrol('ayarlar: ulasildi rozeti', /HEDEFE ULAŞILDI!/.test(ayarlarJs));
kontrol('ayarlar: "Hedefe X kaldi" metni', /Hedefe <b>\$\{tl\(hesap\.kalanTL\)\}<\/b> kaldı/.test(ayarlarJs));
kontrol('ayarlar: "%X tamamlandi" metni', /%\$\{hesap\.oran\} tamamlandı/.test(ayarlarJs));
kontrol('ayarlar: "Cok yakin!" rozeti', /Çok yakın!/.test(ayarlarJs));
kontrol('ayarlar: cubuk dolgusu renk sinifi', /hedef-mesafe-dolgu \$\{hesap\.renk\}/.test(ayarlarJs));
kontrol('ayarlar: tamamlandi dolgusu', /hedef-mesafe-dolgu tamamlandi yesil/.test(ayarlarJs));
kontrol('ayarlar: esc() ile kacis', /esc\(takip\.id\)/.test(ayarlarJs));
kontrol('ayarlar: XSS kacisi (CSS.escape)', /CSS\.escape\(String\(takip\.id\)\)/.test(ayarlarJs));
kontrol('ayarlar: fiyat yok durumu durust', /Henüz doğrulanmış fiyat yok/.test(ayarlarJs));

/* --- Telegram test butonu mikro durumları (Yönetici Paneli) --- */
kontrol('tg: buton pasife alinir', /btn\.disabled = true;[\s\S]{0,90}Gönderiliyor/.test(js));
kontrol('tg: gonderiliyor durumu', /Gönderiliyor\.\.\./.test(js));
kontrol('tg: Test Iletildi onayi', /Test İletildi!/.test(js));
kontrol('tg: yesil buton sinifi', /btn\.classList\.add\('btn-kopyalandi'\)/.test(js));
kontrol('tg: basari kutusu', /Telegram botunuz başarıyla doğrulandı!/.test(js));
kontrol('tg: bot kullanici adi gosterilir', /data\.bot\.username/.test(js));
kontrol('tg: hata kutusu net aciklama', /Telegram Hatası:/.test(js));
kontrol('tg: 3 sn sonra buton eski haline doner',
  /setTimeout\(\(\) => \{[\s\S]{0,260}btn\.disabled = false;[\s\S]{0,140}\}, 3000\)/.test(js));
kontrol('tg: ic dugum yeniden yaratilir (stil)',
  /el\.innerHTML = `<span class="telegram-test-hata">/.test(js)
  && /el\.innerHTML = `<span class="telegram-test-basarili">/.test(js));

/* --- Sunucu: biçimli test mesajı --- */
kontrol('alarms: sendTestTelegram bicimli kart',
  /En Ucuz Nerede — Canlı Fiyat Alarmı Testi/.test(alarmsSrc));
kontrol('alarms: test zamani satiri', /<b>Test Zamanı:<\/b>/.test(alarmsSrc));
kontrol('alarms: 7/24 tarama durumu', /Sistem 7\/24 fiyat düşüşlerini tarıyor/.test(alarmsSrc));
kontrol('alarms: getMe ile bot dogrulamasi', /getMe/.test(alarmsSrc));
kontrol('alarms: getMe hatasi gonderimi engellemez',
  /getMe başarısız olsa da mesaj gönderimi denenir/.test(alarmsSrc));
kontrol('alarms: hamHtml ile bicim korunur', /hamHtml: true/.test(alarmsSrc));
kontrol('alarms: telegramGonder hamHtml destegi', /opts\.hamHtml === true/.test(alarmsSrc));
kontrol('alarms: dinamik alanlar kacirilir', /const tg = \(x\) => String\(x \?\? ''\)/.test(alarmsSrc));
kontrol('server: test-telegram ucu', /sendTestTelegram\(\{ botToken, chatId \}\)/.test(serverSrc));

/* --- CSS --- */
kontrol('CSS: hedef-mesafe-kapsayici 10px yuvarlak',
  /\.hedef-mesafe-kapsayici\s*\{[^}]*border-radius:\s*10px/s.test(stilCss));
kontrol('CSS: kapsayici #f8fafc zemin',
  /\.hedef-mesafe-kapsayici\s*\{[^}]*background:\s*#f8fafc/s.test(stilCss));
kontrol('CSS: cubuk 10px yukseklik', /\.hedef-mesafe-ray\s*\{[^}]*height:\s*10px/s.test(stilCss));
kontrol('CSS: cubuk zemin #e2e8f0', /\.hedef-mesafe-ray\s*\{[^}]*background:\s*#e2e8f0/s.test(stilCss));
kontrol('CSS: dolgu gecisi 0.7s expo',
  /\.hedef-mesafe-dolgu\s*\{[^}]*transition:\s*width\s+0\.7s\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/s.test(stilCss));
kontrol('CSS: yesil gradyan (#10b981 -> #059669)',
  /\.hedef-mesafe-dolgu\.yesil\s*\{[^}]*linear-gradient\(90deg,\s*#10b981,\s*#059669\)/s.test(stilCss));
kontrol('CSS: indigo gradyan', /\.hedef-mesafe-dolgu\.indigo\s*\{[^}]*#6366f1,\s*#4f46e5/s.test(stilCss));
kontrol('CSS: amber gradyan', /\.hedef-mesafe-dolgu\.amber\s*\{[^}]*#f59e0b,\s*#d97706/s.test(stilCss));
kontrol('CSS: tamamlandi pulse animasyonu',
  /\.hedef-mesafe-dolgu\.tamamlandi\s*\{[^}]*animation:\s*pulse-green/s.test(stilCss));
kontrol('CSS: pulse-green keyframes', /@keyframes pulse-green/.test(stilCss));
kontrol('CSS: ulasildi karti yesil zemin',
  /\.hedef-ulasildi\s*\{[^}]*rgba\(16,\s*185,\s*129/s.test(stilCss));

kontrol('CSS: koyu tema kapsayici #1e293b',
  /html\[data-theme="dark"\]\s*\.hedef-mesafe-kapsayici\s*\{[^}]*#1e293b/s.test(stilCss));
kontrol('CSS: koyu tema cubuk #334155',
  /html\[data-theme="dark"\]\s*\.hedef-mesafe-ray\s*\{[^}]*#334155/s.test(stilCss));
kontrol('CSS: koyu tema metin kontrasti',
  /html\[data-theme="dark"\]\s*\.hedef-mesafe-ust,[\s\S]{0,140}#E2E8F0/s.test(stilCss));
kontrol('CSS: telegram basari kutusu yesil', /\.telegram-test-basarili\s*\{[^}]*#ecfdf5/s.test(stilCss));
kontrol('CSS: telegram hata kutusu kirmizi', /\.telegram-test-hata\s*\{[^}]*#fef2f2[^}]*#9f1239/s.test(stilCss));
kontrol('CSS: koyu tema telegram hata kutusu',
  /html\[data-theme="dark"\]\s*\.telegram-test-hata/.test(stilCss));
kontrol('CSS: mobil hedef cubugu',
  /@media \(max-width: 480px\)[\s\S]{0,400}\.hedef-mesafe-kapsayici/s.test(stilCss));
kontrol('CSS: reduced-motion pulse kapatir',
  /prefers-reduced-motion[\s\S]{0,400}\.hedef-mesafe-dolgu\.tamamlandi\s*\{\s*animation:\s*none/s.test(stilCss));

/* --- HTML --- */
kontrol('HTML: telegram test butonu (admin)', /id="telegramTestBtn"/.test(html));
kontrol('HTML: telegram test mesaj alani (admin)', /id="telegramTestMesaj"/.test(html));
kontrol('HTML: takip listesi kapsayicisi (ayarlar)', /id="takipListesi"/.test(ayarlarHtml));
console.log(`\nAYAR-KAYIT ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
