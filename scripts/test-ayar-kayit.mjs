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

const js = oku('public/ayarlar.js');
const html = oku('public/ayarlar.html');

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

console.log(`\nAYAR-KAYIT ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
