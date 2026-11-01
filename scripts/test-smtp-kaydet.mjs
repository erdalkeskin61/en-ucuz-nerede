/**
 * SMTP şifresi kaydetme zinciri testi (2026-10-28 düzeltmesi).
 *
 * Kontrol: frontend gövdesinde pass, smtp nesnesinin İÇİNDE mi? Sunucuya ulaşıyor mu?
 * Gerçek şifreye dokunmamak için: mevcut değer okunur, sentinel yazılır, doğrulanır,
 * ESKİ DEĞER geri yazılır.
 */
import { getSettings, closeDatabase } from '../src/store.js';
import fs from 'node:fs';

const ANAHTAR = process.env.ERISIM_ANAHTARI || '';
const TABAN = 'http://localhost:3000';
const HDR = { 'Content-Type': 'application/json', 'x-erisim-anahtari': ANAHTAR };

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

const api = async (yol, opts = {}) => {
  const r = await fetch(TABAN + yol, { ...opts, headers: { ...HDR, ...(opts.headers || {}) } });
  return { ok: r.ok, status: r.status, d: await r.json().catch(() => null) };
};

/* 1) Kaynak kodu: pass, smtp içinde ve whatsapp içinde DEĞİL */
const kaynak = fs.readFileSync('public/ayarlar.js', 'utf8');
const smtpBlok = kaynak.slice(kaynak.indexOf('smtp: {'), kaynak.indexOf('telegram: {'));
const whatsappBlok = kaynak.slice(kaynak.indexOf('whatsapp: {'), kaynak.indexOf('if (!body.smtp.pass)'));
kontrol('pass satırı smtp bloğunda', /pass:\s*\$\('#smtpPass'\)/.test(smtpBlok));
kontrol('pass satırı whatsapp bloğunda DEĞİL', !/pass:/.test(whatsappBlok), whatsappBlok.trim().slice(0, 60));

/* 2) Sunucu: gizli değer maskeleniyor, şifre sızmıyor */
const once = await api('/api/settings');
kontrol('GET /api/settings şifreyi maskeleyip *** döner',
  once.d.smtp.pass === '***' || once.d.smtp.pass === '', JSON.stringify(once.d.smtp.pass));

/* 3) Kaydetme: sentinel şifre gerçekten yazılıyor mu? */
const ESKI = getSettings().smtp;
// NOT: alarmEmail'i ASLA boş gönderme — bu gerçek kullanıcı ayarını siler.
const ESKI_EPOSTA = getSettings().alarmEmail;
const SENTINEL = 'test-sifre-' + Date.now();

try {
  const kaydet = await api('/api/settings', {
    method: 'POST',
    // Frontend'in gönderdiği gövdenin aynısı: pass smtp içinde
    body: JSON.stringify({
      alarmEmail: ESKI_EPOSTA,
      smtp: { host: ESKI.host, port: ESKI.port, user: ESKI.user, from: ESKI.from, secure: ESKI.secure, pass: SENTINEL },
      whatsapp: { enabled: false, webhookUrl: '', phone: '' },
    }),
  });
  kontrol('POST /api/settings kabul edildi', kaydet.ok, JSON.stringify(kaydet.d).slice(0, 80));
  kontrol('yanıtta şifre maskeli', kaydet.d?.smtp?.pass === '***', JSON.stringify(kaydet.d?.smtp?.pass));

  const dbde = getSettings().smtp.pass;
  kontrol('şifre DB’ye YAZILDI', dbde === SENTINEL, `bulunan: ${dbde ? dbde.slice(0, 10) + '…' : '(boş)'}`);

  /* 4) Boş gönderim mevcut şifreyi SİLMEMELİ (form şifreyi geri yazmıyor) */
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ smtp: { host: ESKI.host, port: ESKI.port, user: ESKI.user, from: ESKI.from, secure: ESKI.secure } }),
  });
  kontrol('boş pass gönderimi mevcut şifreyi korur', getSettings().smtp.pass === SENTINEL);

  /* 5) '***' gönderimi de şifreyi silmemeli (maske geri gönderilirse) */
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ smtp: { ...ESKI, pass: '***' } }),
  });
  kontrol("'***' gönderimi şifreyi korur", getSettings().smtp.pass === SENTINEL);

  /* 6) whatsapp nesnesine pass konursa SMTP şifresi olarak KULLANILMAMALI */
  const ESKI_WHATSAPP = getSettings().whatsapp;
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ smtp: { ...ESKI, pass: SENTINEL }, whatsapp: { ...ESKI_WHATSAPP, pass: 'yanlis-yer' } }),
  });
  kontrol('whatsapp.pass SMTP şifresini ezmez', getSettings().smtp.pass === SENTINEL);
  kontrol('whatsapp.pass DB’ye HİÇ yazılmaz', getSettings().whatsapp.pass === undefined,
    JSON.stringify(Object.keys(getSettings().whatsapp || {})));
} finally {
  // ESKİ ŞİFREYİ AYNEN GERİ YAZ (kullanıcının gerçek Gmail şifresi)
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ smtp: ESKI }) });
  const son = getSettings().smtp;
  kontrol('eski SMTP yapılandırması geri yüklendi',
    son.pass === ESKI.pass && son.host === ESKI.host && son.user === ESKI.user);
}

console.log(`SMTP-KAYDET ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
// `process.exit()` Windows'ta (Node 25) açık async tutamaklarla çökebiliyor;
// çıkış kodunu ayarlayıp sürecin doğal kapanmasına izin veriyoruz.
closeDatabase();
process.exitCode = gecen === toplam ? 0 : 1;
