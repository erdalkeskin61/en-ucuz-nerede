/**
 * 📢 Otonom Fırsat Kanalı testleri — 2026-10-30
 *
 * Kapsam:
 *   1) Fırsat tespiti (firsatAdayiBul): indirim hesabı, referans fiyat dürüstlüğü,
 *      stok/iptal/eksik tarama reddi.
 *   2) Mesaj şablonu + Telegram isteği (görsel varsa sendPhoto, yoksa sendMessage).
 *   3) Spam filtresi: cooldown ve günlük üst sınır.
 *   4) Afiliye link üretimi (kayıtlı ayarla; ayar yoksa URL değişmez).
 *   5) Ayarlar (SQLite settings) ve kaynak sözleşmesi.
 *
 * Kullanım:
 *   node scripts/test-firsat-kanali.mjs            # birim + mock (ağ yok)
 *   node scripts/test-firsat-kanali.mjs --canli    # gerçek kanala test paylaşımı
 *                                                  # (Ayarlar'da kanal + token gerekir)
 *
 * Testin yazdığı firsat_gonderim satırları sonunda SİLİNİR; ayarlar değiştirilmez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import { getSettings, closeDatabase, DEFAULT_ALARM_SAATLERI } from '../src/store.js';
import {
  firsatAdayiBul, firsatMesajiOlustur, telegramIstegiOlustur,
  spamKontrolu, firsatKaydet, firsatAyar, firsatKapat, firsatTestGonder,
  FIRSAT_VARSAYILAN,
} from '../src/firsatKanali.js';
import { afiliyeLink } from '../src/afiliye.js';

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

const TEST_ONEK = 'test-firsat-' + Date.now() + '-';
const DB_YOLU = path.join(config.dataDir, 'en_ucuz_nerede.db');

/** Gerçekçi (ama test) karşılaştırma sonucu üretir. */
function sonucOlustur({
  fiyat = 17000, ortalama = null, yeterliVeri = false, etiket = null,
  etiketSisirilmis = false, durum = 'dip_fiyat', stok = true,
  taranmayan = 0, iptal = false, resim = null, toplamTukendi = false,
} = {}) {
  const fz = {
    durum, etiketSisirilmis, etiketOrani: etiketSisirilmis ? 1.6 : null,
    guncelFiyat: fiyat, minFiyat: fiyat, maxFiyat: ortalama, ortFiyat: ortalama,
    yeterliVeri, veriNoktasi: yeterliVeri ? 40 : 2, gunSayisi: yeterliVeri ? 12 : 1,
    // `etiket` gerçek şemada bir ETİKET METNİDİR; fiyat `etiketteGosterilen`dedir.
    etiket: durum === 'dip_fiyat' ? '🌟 Dip fiyat' : 'Fiyat Normal',
    etiketteGosterilen: etiket, ortPencereGun: 30,
  };
  return {
    kaynak: {
      site: 'kaynak', siteName: 'Kaynak', url: 'https://kaynak.test/u?productId=9',
      urun: 'Test Fırsat Ürünü', modelKodu: 'TF-1', barkod: '123', resim,
    },
    sonuclar: [
      {
        site: 'kaynak', siteName: 'Kaynak', status: 'found', renkAyni: true,
        kargoBedava: false,
        product: {
          url: 'https://kaynak.test/u?productId=9', title: 'Test Fırsat Ürünü',
          sellingPrice: fiyat + 1000, listPrice: etiket, inStock: stok,
          image: resim, pricing: { toplam: fiyat + 1000, etiket, kargo: { ucret: 49 } },
        },
      },
      {
        site: 'hepsiburada', siteName: 'Hepsiburada', status: 'found', renkAyni: true,
        kargoBedava: true,
        product: {
          url: 'https://hepsiburada.test/u', title: 'Test Fırsat Ürünü',
          sellingPrice: fiyat, inStock: stok, image: resim,
          pricing: { toplam: fiyat, etiket, kargo: { ucret: 0, uygulanir: false, aciklama: 'Ücretsiz kargo' } },
        },
      },
    ],
    ozet: {
      enUcuzSite: 'Hepsiburada', enUcuzFiyat: fiyat, bulunanSiteSayisi: 2,
      tamamiTukendi: toplamTukendi, taranmayanSiteSayisi: taranmayan,
      iptalEdildi: iptal, fiyatZekasi: fz, fiyatAnalizi: fz,
    },
  };
}

function temizle() {
  try {
    const db = new DatabaseSync(DB_YOLU);
    db.prepare('DELETE FROM firsat_gonderim WHERE anahtar LIKE ?').run(TEST_ONEK + '%');
    db.close();
  } catch { /* yok say */ }
}

/* ---------------------------------------------------------------- */
/* 1) Fırsat tespiti                                                 */
/* ---------------------------------------------------------------- */
bolum('1) Fırsat tespiti');
const dip = firsatAdayiBul(sonucOlustur({ fiyat: 17000, ortalama: 22000, yeterliVeri: true }));
kontrol('dip fiyat aday oldu', dip.uygun === true, dip.neden);
kontrol('en ucuz mağaza seçildi', dip.site === 'Hepsiburada', dip.site);
kontrol('gerçek fiyat kullanıldı (kaynak fiyatı değil)', dip.fiyat === 17000, String(dip.fiyat));
kontrol('referans 30 gün ortalaması', dip.referans === 22000 && /ortalama/.test(dip.referansKaynagi));
kontrol('indirim oranı %22,7', dip.indirim === 22.7, String(dip.indirim));
kontrol('tasarruf 5000 TL', dip.fark === 5000, String(dip.fark));
kontrol('ücretsiz kargo algılandı', dip.kargo === 'Ücretsiz Kargo', dip.kargo);
kontrol('dip fiyat durum metni', /en düşük fiyatında/.test(dip.durum), dip.durum);
kontrol('anahtar model kodundan', dip.anahtar === 'TF-1', dip.anahtar);
kontrol('afiliye linki alanı dolu', typeof dip.url === 'string' && dip.url.length > 0);

// Eşik altı reddedilir
const dusuk = firsatAdayiBul(sonucOlustur({ fiyat: 21000, ortalama: 22000, yeterliVeri: true }));
kontrol('eşik altı indirim reddedildi', dusuk.uygun === false && /eşik/.test(dusuk.neden), dusuk.neden);

// Yeterli geçmiş yoksa ortalama referans OLMAZ
const yetersiz = firsatAdayiBul(sonucOlustur({ fiyat: 17000, ortalama: 22000, yeterliVeri: false }));
kontrol('yetersiz geçmişte ortalama kullanılmadı', yetersiz.uygun === false, yetersiz.neden);

// Liste fiyatı (gerçek etiket) referans olabilir
const etiketli = firsatAdayiBul(sonucOlustur({ fiyat: 17000, etiket: 25000, yeterliVeri: false }));
kontrol('mağaza liste fiyatı referans oldu', etiketli.uygun === true && etiketli.referans === 25000, etiketli.neden);
kontrol('liste fiyatı kaynağı doğru', /liste fiyatı/.test(etiketli.referansKaynagi), etiketli.referansKaynagi);

// Şişirilmiş etiket referans olarak KULLANILMAZ
const sisirilmis = firsatAdayiBul(sonucOlustur({ fiyat: 17000, etiket: 25000, etiketSisirilmis: true }));
kontrol('şişirilmiş etiket reddedildi (uydurma indirim yok)', sisirilmis.uygun === false, sisirilmis.neden);

// `fiyatZekasi.etiket` bir METİNDİR ("🌟 Dip fiyat") — fiyat sanılmamalı.
const etiketsiz = firsatAdayiBul(sonucOlustur({ fiyat: 17000, yeterliVeri: false }));
kontrol('etiket metni referans fiyat sanılmıyor', etiketsiz.uygun === false, etiketsiz.neden);

// Dürüstlük: stok/tarama durumu
kontrol('tükendi reddedildi', firsatAdayiBul(sonucOlustur({ stok: false })).uygun === false);
kontrol('tümü tükendi reddedildi', firsatAdayiBul(sonucOlustur({ toplamTukendi: true })).uygun === false);
kontrol('iptal edilen tarama reddedildi', firsatAdayiBul(sonucOlustur({ iptal: true })).uygun === false);
kontrol('eksik tarama reddedildi',
  firsatAdayiBul(sonucOlustur({ taranmayan: 3 })).uygun === false);
kontrol('boş sonuç güvenli', firsatAdayiBul(null).uygun === false);

// Referans yoksa paylaşım YOK
kontrol('referanssız ürün paylaşılmaz',
  firsatAdayiBul(sonucOlustur({ fiyat: 17000, yeterliVeri: false })).uygun === false);

/* ---------------------------------------------------------------- */
/* 2) Mesaj şablonu + Telegram isteği                                */
/* ---------------------------------------------------------------- */
bolum('2) Mesaj ve Telegram isteği');
const mesaj = firsatMesajiOlustur(dip);
for (const metin of ['GÜNÜN FIRSATI', 'Mağaza:', 'İndirim:', 'Kargo:', 'Durum:', '@EnUcuzNerede', 'Tasarruf']) {
  kontrol(`mesajda "${metin}" var`, mesaj.includes(metin));
}
kontrol('mesajda eski fiyat <s> ile', mesaj.includes('<s>22.000,00 TL</s>'));
kontrol('mesajda güncel fiyat kalın', mesaj.includes('<b>17.000,00 TL</b>'));
kontrol('mesajda indirim yüzdesi', mesaj.includes('%22,7'));
kontrol('mesajda afiliye linki', mesaj.includes(dip.url));

const istekMesaj = telegramIstegiOlustur({ ...dip, image: null }, { chatId: '-100123' });
kontrol('görsel yoksa sendMessage', istekMesaj.yontem === 'sendMessage', istekMesaj.yontem);
kontrol('sendMessage HTML parse mode', istekMesaj.body.parse_mode === 'HTML');

const istekFoto = telegramIstegiOlustur({ ...dip, image: 'https://img.test/x.jpg' }, { chatId: '@kanal' });
kontrol('görsel varsa sendPhoto', istekFoto.yontem === 'sendPhoto', istekFoto.yontem);
kontrol('sendPhoto caption HTML', istekFoto.body.parse_mode === 'HTML' && typeof istekFoto.body.caption === 'string');
kontrol('caption 1024 sınırına uyar', istekFoto.body.caption.length <= 1024);
kontrol('sendPhoto chat_id doğru', istekFoto.body.chat_id === '@kanal');

/* ---------------------------------------------------------------- */
/* 3) Uçtan uca mock paylaşım (ağ isteği YOK)                        */
/* ---------------------------------------------------------------- */
bolum('3) Uçtan uca mock paylaşım');
temizle();
const MOCK_URL = 'https://mock-firsat.test/urun-' + Date.now();
{
  const { anlikYaz, snapshotSil } = await import('../src/anlikOnbellek.js');
  const sn = sonucOlustur({ fiyat: 17000, ortalama: 22000, yeterliVeri: true, resim: 'https://img.test/x.jpg' });
  sn.kaynak.modelKodu = TEST_ONEK + 'mock';
  sn.kaynak.url = MOCK_URL;
  sn.sonuclar[1].product.url = MOCK_URL;
  anlikYaz(MOCK_URL, sn);

  const { firsatlariTara } = await import('../src/firsatKanali.js');
  const r = await firsatlariTara({ gonder: true, kuru: true, zorla: true, taze: false });
  const g = (r.gonderimler || [])[0];
  kontrol('mock tur tamamlandı', r.tamam === true, JSON.stringify(r).slice(0, 120));
  kontrol('fırsat aday olarak bulundu', r.uygunSayisi >= 1, String(r.uygunSayisi));
  kontrol('mock gönderim başarılı sayıldı', g?.durum === 'gonderildi', JSON.stringify(g));
  kontrol('görselli ürün sendPhoto kullandı', g?.yontem === 'sendPhoto', g?.yontem);
  kontrol('mock gönderim kayda yazıldı', (await import('../src/firsatKanali.js'))
    .firsatIstatistik().bugun >= 1);

  // Aynı ürün tekrar taranırsa cooldown devreye girer
  const r2 = await firsatlariTara({ gonder: true, kuru: true, zorla: true, taze: false });
  const g2 = (r2.gonderimler || []).find(x => /cooldown/.test(String(x.neden)));
  kontrol('mock ikinci gönderim cooldown ile engellendi', !!g2, JSON.stringify(r2.gonderimler));

  temizle();
  snapshotSil(MOCK_URL);
}

/* ---------------------------------------------------------------- */
/* 4) Spam filtresi (cooldown + günlük sınır)                        */
/* ---------------------------------------------------------------- */
bolum('4) Spam filtresi');
temizle();
const ayar = firsatAyar({ ...FIRSAT_VARSAYILAN, gunlukMax: 2, cooldownSaat: 48, kanal: '@test' });
const aday = { ...dip, anahtar: TEST_ONEK + 'urun1' };
const simdi = Date.now();

kontrol('ilk gönderim serbest', spamKontrolu(aday, { ayar, simdi }).uygun === true);
firsatKaydet(aday, 'gonderildi', { ts: simdi });

const cd = spamKontrolu(aday, { ayar, simdi: simdi + 3600 * 1000 });
kontrol('cooldown içinde engellendi', cd.uygun === false && /cooldown/.test(cd.neden), cd.neden);

const cdAsildi = spamKontrolu(aday, { ayar, simdi: simdi + 49 * 3600 * 1000 });
kontrol('cooldown sonrası serbest', cdAsildi.uygun === true, cdAsildi.neden);

// Günlük sınır: bugün 2 gönderim varsa 3. engellenir (farklı ürün)
const aday2 = { ...dip, anahtar: TEST_ONEK + 'urun2' };
firsatKaydet(aday2, 'gonderildi', { ts: simdi });
const sinir = spamKontrolu({ ...dip, anahtar: TEST_ONEK + 'urun3' }, { ayar, simdi });
kontrol('günlük sınır uygulanıyor', sinir.uygun === false && /günlük sınır/.test(sinir.neden), sinir.neden);
kontrol('günlük sayaç doğru', sinir.bugun === 2, String(sinir.bugun));

// Hatalı gönderim sayaca DAHİL DEĞİL
firsatKaydet({ ...dip, anahtar: TEST_ONEK + 'hata' }, 'hata', { hata: 'test', ts: simdi });
kontrol('hatalı gönderim günlük sayaca dahil değil',
  spamKontrolu({ ...dip, anahtar: TEST_ONEK + 'urun4' }, { ayar, simdi }).bugun === 2);

// Ertesi gün sıfırlanır
const yarin = simdi + 25 * 3600 * 1000;
kontrol('ertesi gün sayaç sıfırlandı',
  spamKontrolu({ ...dip, anahtar: TEST_ONEK + 'urun5' }, { ayar, simdi: yarin }).uygun === true);

// Test modu cooldown'ı atlar (kanal testi için)
kontrol('test modu spam kontrolünü atlar',
  spamKontrolu(aday, { ayar, simdi, test: true }).uygun === true);
temizle();

/* ---------------------------------------------------------------- */
/* 4) Afiliye link                                                   */
/* ---------------------------------------------------------------- */
bolum('5) Afiliye link');
const kapaliAyar = { etkin: false, aglar: {}, siteAg: {}, siteSablon: {} };
kontrol('afiliye kapalıyken URL değişmez',
  afiliyeLink('hepsiburada', 'https://hepsiburada.test/u?x=1', kapaliAyar)
  === 'https://hepsiburada.test/u?x=1');

const acikAyar = {
  etkin: true,
  aglar: { testag: { etkin: true, parametre: 'ref', token: 'abc123' } },
  siteAg: { hepsiburada: 'testag' },
  siteSablon: {},
};
const afili = afiliyeLink('hepsiburada', 'https://hepsiburada.test/u?x=1', acikAyar);
kontrol('afiliye parametresi eklendi', /[?&]ref=abc123/.test(afili), afili);
kontrol('orijinal parametre korundu', /x=1/.test(afili), afili);
kontrol('geçersiz URL güvenli', afiliyeLink('hepsiburada', 'gecersiz', acikAyar) === 'gecersiz');
kontrol('fırsat linki gerçek ürün adresini taşır', /hepsiburada\.test/.test(dip.url), dip.url);

/* ---------------------------------------------------------------- */
/* 5) Ayarlar (SQLite) + varsayılanlar                               */
/* ---------------------------------------------------------------- */
bolum('6) Ayarlar ve yapılandırma');
const s = getSettings();
kontrol('settings.firsat var', !!s.firsat && typeof s.firsat === 'object');
kontrol('varsayılan min indirim %15', firsatAyar({}).minIndirim === 15, String(firsatAyar({}).minIndirim));
kontrol('varsayılan günlük max 12', firsatAyar({}).gunlukMax === 12, String(firsatAyar({}).gunlukMax));
kontrol('varsayılan kapalı', firsatAyar({}).enabled === false);
kontrol('geçersiz değerler sınırlandı', firsatAyar({ minIndirim: 'abc', gunlukMax: 0 }).minIndirim === 15
  && firsatAyar({ gunlukMax: 0 }).gunlukMax === 1);
kontrol('kanal boşlukları kırpılır', firsatAyar({ kanal: '  @kanal  ' }).kanal === '@kanal');
kontrol('alarm saatleri korunuyor', Array.isArray(DEFAULT_ALARM_SAATLERI) && DEFAULT_ALARM_SAATLERI.length === 5);

/* ---------------------------------------------------------------- */
/* 6) Kaynak sözleşmesi                                              */
/* ---------------------------------------------------------------- */
bolum('7) Sunucu / arayüz sözleşmesi');
{
  const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  const server = oku('server.js');
  const html = oku('public/ayarlar.html');
  const js = oku('public/ayarlar.js');
  const alarms = oku('src/alarms.js');

  kontrol('sunucu: fırsat durum ucu', /app\.get\('\/api\/firsat\/durum'/.test(server));
  kontrol('sunucu: test paylaşım ucu', /app\.post\('\/api\/firsat\/test'/.test(server));
  kontrol('sunucu: elle çalıştırma ucu', /app\.post\('\/api\/firsat\/calistir'/.test(server));
  kontrol('sunucu: zamanlayıcı başlatılıyor', /startFirsatScheduler\(\)/.test(server));
  kontrol('sunucu: ayar kaydında zamanlayıcı yenileniyor',
    /saveSettings[\s\S]{0,200}startFirsatScheduler\(\)/.test(server));
  kontrol('sunucu: kapanışta zamanlayıcı durduruluyor', /firsatZamanlayiciDurdur\(\)/.test(server));
  kontrol('alarm sonrası fırsat taraması tetikleniyor',
    /firsatlariTara\(\{ taze: false \}\)/.test(alarms));

  kontrol('ayarlar: kart başlığı', /Otonom Fırsat Kanalı/.test(html));
  for (const id of ['firsatEnabled', 'firsatKanal', 'firsatMinIndirim', 'firsatGunlukMax', 'firsatTestBtn']) {
    kontrol(`ayarlar: #${id} alanı`, new RegExp(`id="${id}"`).test(html));
  }
  kontrol('ayarlar: test butonu isteği', /\/api\/firsat\/test/.test(js));
  kontrol('ayarlar: ayarlar kaydında firsat nesnesi', /firsat:\s*\{[\s\S]{0,240}minIndirim/.test(js));
  kontrol('ayarlar: kanal durumu gösteriliyor', /firsatDurumuYukle/.test(js));
}

/* ---------------------------------------------------------------- */
/* 8) Canlı test (opsiyonel)                                         */
/* ---------------------------------------------------------------- */
if (process.argv.includes('--canli')) {
  bolum('8) Canlı kanal testi');
  try {
    const r = await firsatTestGonder({});
    kontrol('canlı test paylaşımı gönderildi', r.ok === true, JSON.stringify(r).slice(0, 160));
    console.log(`     yöntem: ${r.yontem} · gerçek fırsat: ${r.gercekFirsat ? 'evet' : 'hayır (bağlantı testi)'}`);
  } catch (e) {
    kontrol('canlı test paylaşımı gönderildi', false, String(e.message || e));
  }
} else {
  console.log('\nℹ️  Gerçek kanal testi için: node scripts/test-firsat-kanali.mjs --canli');
}

/* ---------------------------------------------------------------- */
temizle();
firsatKapat();
closeDatabase();
console.log(`\nFIRSAT-KANALI ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
