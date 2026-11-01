/**
 * Fiyat takibi + günlük kontrol takvimi testi (ağa çıkmaz).
 *   node scripts/test-takip.mjs
 *
 * 2026-10-26: Kullanıcı "takip edilen ürünler günde 5 kez kontrol edilsin,
 * güncel fiyatlar yazılsın" dedi. İki hata bulundu ve düzeltildi:
 *   1) SQLite `tracked` tablosunda `fiyatGecmisi` kolonu YOKTU → her kontrol
 *      hesaplanıyor ama kaydedilmiyordu (geçmiş hep boş kalıyordu).
 *   2) Aynı şekilde `sonHedefBildirimi` / `sonDegisimBildirimi` kolonları yoktu →
 *      24 saatlik alarm sessizliği tutmuyor, aynı alarm her kontrolde tekrar
 *      gönderilebiliyordu.
 */
import { getSettings, DEFAULT_ALARM_SAATLERI } from '../src/store.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
}

// ---- 1) Günlük takvim ----
kontrol('varsayılan takvim 5 kontrol', DEFAULT_ALARM_SAATLERI.length === 5,
  'bulunan: ' + DEFAULT_ALARM_SAATLERI.length);
kontrol('saatler artan sırada', DEFAULT_ALARM_SAATLERI.join(',') === '09:00,12:00,15:00,18:00,21:00',
  DEFAULT_ALARM_SAATLERI.join(','));
kontrol('her saat HH:MM biçiminde', DEFAULT_ALARM_SAATLERI.every(s => /^\d{2}:\d{2}$/.test(s)));

const g = getSettings();
kontrol('ayarlarda en az 5 saat var', Array.isArray(g.alarmSaatleri) && g.alarmSaatleri.length >= 5,
  JSON.stringify(g.alarmSaatleri));

// ---- 2) Fiyat geçmişi kalıcı mı? ----
const { getTracked, updateTracked } = await import('../src/store.js');
const liste = getTracked();
kontrol('takip listesi okunabiliyor', Array.isArray(liste));

if (liste.length) {
  const t = liste[0];
  const oncekiSayi = (t.fiyatGecmisi || []).length;
  const deneme = {
    ts: '2026-01-01T00:00:00.000Z',
    enUcuzSite: 'Test Sitesi',
    enUcuzFiyat: 123.45,
    fiyatlar: [{ site: 'test', durum: 'ok', fiyat: 123.45 }],
  };
  updateTracked(t.id, { fiyatGecmisi: [...(t.fiyatGecmisi || []), deneme] });
  const sonra = getTracked().find(x => x.id === t.id);
  kontrol('fiyat geçmişi veritabanına yazılıyor', (sonra.fiyatGecmisi || []).length === oncekiSayi + 1,
    `önce ${oncekiSayi}, sonra ${(sonra.fiyatGecmisi || []).length}`);
  kontrol('yazılan kayıt geri okunabiliyor',
    (sonra.fiyatGecmisi || []).some(k => k.enUcuzFiyat === 123.45));

  // Geri al (test kaydını sil)
  updateTracked(t.id, { fiyatGecmisi: t.fiyatGecmisi || [] });
  const geri = getTracked().find(x => x.id === t.id);
  kontrol('test kaydı temizlendi', (geri.fiyatGecmisi || []).length === oncekiSayi);

  // ---- 3) Bildirim zamanları da kalıcı olmalı (24 saat sessizlik) ----
  const ts = '2026-01-01T00:00:00.000Z';
  updateTracked(t.id, { sonHedefBildirimi: ts, sonDegisimBildirimi: ts });
  const b = getTracked().find(x => x.id === t.id);
  kontrol('sonHedefBildirimi kalıcı', b.sonHedefBildirimi === ts, String(b.sonHedefBildirimi));
  kontrol('sonDegisimBildirimi kalıcı', b.sonDegisimBildirimi === ts, String(b.sonDegisimBildirimi));
  updateTracked(t.id, { sonHedefBildirimi: t.sonHedefBildirimi || null, sonDegisimBildirimi: t.sonDegisimBildirimi || null });
} else {
  console.log('  (takip listesi boş — DB yazma testleri atlandı)');
}

console.log(`TAKIP ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
