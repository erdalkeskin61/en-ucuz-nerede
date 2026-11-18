/**
 * Admin Paneli (/admin.html) ve Son Kullanıcı Ayrımı Doğrulama Testi
 *
 * Çalıştır:
 *   node scripts/test-admin-panel.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
let gecti = 0;
let kaldi = 0;

function test(ad, fn) {
  try {
    fn();
    console.log(`✅ ${ad}`);
    gecti++;
  } catch (e) {
    console.error(`❌ ${ad}\n   → ${e.message}`);
    kaldi++;
  }
}

async function asyncTest(ad, fn) {
  try {
    await fn();
    console.log(`✅ ${ad}`);
    gecti++;
  } catch (e) {
    console.error(`❌ ${ad}\n   → ${e.message}`);
    kaldi++;
  }
}

function oku(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const ayarHtml = oku('public/ayarlar.html');
const ayarJs = oku('public/ayarlar.js');
const adminHtml = oku('public/admin.html');
const adminJs = oku('public/admin.js');
const adminCss = oku('public/admin.css');
const afiliyeJs = oku('public/afiliye-ayar.js');
const indexHtml = oku('public/index.html');
const appJs = oku('public/app.js');

console.log('🔐 Admin Paneli ve Son Kullanıcı İzolasyonu Testleri Başlıyor...\n');

// 1) Son kullanıcı ayarlar.html/ayarlar.js izolasyonu
test('Son kullanıcı ayarlar.html ve ayarlar.js yönetici araçlarını içermemeli', () => {
  const yasakHtml = [
    'afiliyePaneli',
    'afiliyeEtkin',
    'smtpHost',
    'smtpPass',
    'telegramBotToken',
    'waKanalToken',
    'dbBakimBtn',
    'krediPanosu',
    'radarKatalogListe',
    'kuponPanosu',
  ];
  for (const id of yasakHtml) {
    assert.ok(!ayarHtml.includes(id), `ayarlar.html içinde yönetici öğesi kalmış: ${id}`);
  }

  const yasakApi = ['/api/settings', '/api/afiliye', '/api/db/bakim', '/api/kredi', '/api/kuponlar'];
  for (const ep of yasakApi) {
    assert.ok(!ayarJs.includes(ep), `ayarlar.js içinde yönetici API çağrısı kalmış: ${ep}`);
  }
});

test('Son kullanıcı ayarlar.html/ayarlar.js fiyat alarmları ve Web Push UI bileşenlerini korumalı', () => {
  assert.ok(ayarHtml.includes('id="takipListesi"'), '#takipListesi bulunamadı');
  assert.ok(ayarHtml.includes('id="pushAboneBtn"'), '#pushAboneBtn bulunamadı');
  assert.ok(ayarHtml.includes('id="pushTestBtn"'), '#pushTestBtn bulunamadı');
  assert.ok(ayarHtml.includes('id="temaTercihBtn"'), '#temaTercihBtn bulunamadı');
  assert.ok(ayarJs.includes('hedefMesafe'), 'hedefMesafe modülü kullanılmıyor');
  assert.ok(ayarJs.includes('grafikSvg'), 'grafikSvg eksik');
  assert.ok(ayarJs.includes('/api/tracked'), '/api/tracked eksik');
  assert.ok(ayarJs.includes('/api/push/test'), '/api/push/test eksik');
});

// 2) Admin paneli HTML/JS/CSS sözleşmeleri
test('Admin paneli noindex/nofollow, giriş kapısı, KPI ve 4 sekmeyi içermeli', () => {
  assert.ok(adminHtml.includes('<meta name="robots" content="noindex, nofollow"'), 'noindex meta eksik');
  assert.ok(adminHtml.includes('id="adminGirisAlani"'), '#adminGirisAlani eksik');
  assert.ok(adminHtml.includes('id="adminGirisForm"'), '#adminGirisForm eksik');
  assert.ok(adminHtml.includes('id="adminAnahtarInput"'), '#adminAnahtarInput eksik');
  assert.ok(adminHtml.includes('id="adminCikisBtn"'), '#adminCikisBtn eksik');
  assert.ok(adminHtml.includes('id="adminIcerik"'), '#adminIcerik eksik');

  for (const kpi of ['kpiSaglik', 'kpiAfiliye', 'kpiSponsor', 'kpiOtonom', 'kpiDb']) {
    assert.ok(adminHtml.includes(`id="${kpi}"`), `KPI kartı eksik: ${kpi}`);
  }
  for (const sekme of ['gelir', 'radar', 'botlar', 'sistem']) {
    assert.ok(adminHtml.includes(`data-admin-sekme="${sekme}"`), `Sekme butonu eksik: ${sekme}`);
    assert.ok(adminHtml.includes(`data-admin-panel="${sekme}"`), `Sekme paneli eksik: ${sekme}`);
  }
  assert.ok(adminCss.includes('.admin-kpi-izgara') && adminCss.includes('.admin-giris-kart'), 'admin.css stilleri eksik');
});

test('Admin paneli Sponsorlu Vitrin, Doğrulanmış Mağazalar ve Mağaza Sağlığı UI bileşenlerine sahip olmalı', () => {
  for (const id of [
    'sponsorTabloAlani',
    'spMarka',
    'spBaslik',
    'spKampanyaFiyat',
    'spYonlendirmeUrl',
    'spKaydetBtn',
    'dogrulanmisListe',
    'dmSiteId',
    'dmEkleBtn',
    'saglikKontrolBtn',
    'saglikIzgara',
    'afiliyePaneli',
    'smtpHost',
    'dbBakimBtn',
  ]) {
    assert.ok(adminHtml.includes(`id="${id}"`), `admin.html içinde #${id} eksik`);
  }
  assert.ok(adminJs.includes('/api/admin/oturum'), 'admin.js oturum kontrolü eksik');
  assert.ok(adminJs.includes('/api/admin/sponsor-vitrin'), 'admin.js sponsor CRUD eksik');
  assert.ok(adminJs.includes('/api/admin/dogrulanmis-magaza'), 'admin.js doğrulanmış mağaza CRUD eksik');
  assert.ok(afiliyeJs.includes('admin:yetkili'), 'afiliye-ayar.js admin:yetkili olayını dinlemiyor');
});

test('index.html affiliate şeffaflık notu varsayılan gizli olmalı ve app.js afiliyeAktif ile yönetmeli', () => {
  assert.match(indexHtml, /id="afiliyeBildirim"[^>]*\bhidden\b/, '#afiliyeBildirim varsayılan hidden olmalı');
  assert.ok(appJs.includes('afiliyeAktif'), 'app.js içinde afiliyeAktif kontrolü yok');
});

// 3) Canlı HTTP yetki izolasyonu testi
const TEST_PORT = 3199;
const TEST_KEY = 'test-admin-2026';
const BASE = `http://127.0.0.1:${TEST_PORT}`;

async function sunucuyuBaslat() {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: '127.0.0.1',
      ADMIN_ANAHTARI: TEST_KEY,
      ERISIM_ANAHTARI: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  proc.stdout.on('data', (d) => { stdoutBuf += d.toString(); });
  proc.stderr.on('data', (d) => { stderrBuf += d.toString(); });

  const son = Date.now() + 30000;
  while (Date.now() < son) {
    if (proc.exitCode !== null) {
      throw new Error(`Sunucu erken kapandı (${proc.exitCode}): ${stderrBuf}\n${stdoutBuf}`);
    }
    try {
      const res = await fetch(`${BASE}/api/ping`);
      if (res.ok) return proc;
    } catch { /* henüz dinlemiyor */ }
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error(`Test sunucusu 30s içinde hazır olmadı.\nSTDOUT:\n${stdoutBuf.slice(-1000)}\nSTDERR:\n${stderrBuf.slice(-1000)}`);
}

let proc;
try {
  proc = await sunucuyuBaslat();

  await asyncTest('GET /admin.html 200 ve X-Robots-Tag: noindex, nofollow döndürmeli', async () => {
    const res = await fetch(`${BASE}/admin.html`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await res.text();
    assert.ok(html.includes('Yönetici Kontrol Merkezi'));
  });

  await asyncTest('Halka açık uçlar admin anahtarı olmadan çalışmalı ve afiliyeAktif dönmeli', async () => {
    const durumRes = await fetch(`${BASE}/api/durum`);
    assert.equal(durumRes.status, 200);
    const durum = await durumRes.json();
    assert.equal(typeof durum.afiliyeAktif, 'boolean');

    const vitrinRes = await fetch(`${BASE}/api/sponsor/vitrin`);
    assert.equal(vitrinRes.status, 200);

    const dmRes = await fetch(`${BASE}/api/dogrulanmis-magazalar`);
    assert.equal(dmRes.status, 200);

    const trackedRes = await fetch(`${BASE}/api/tracked`);
    assert.equal(trackedRes.status, 200);

    const tiklaRes = await fetch(`${BASE}/api/afiliye/tikla`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'bilinmeyen_test_site' }),
    });
    assert.equal(tiklaRes.status, 204);
  });

  await asyncTest('Yetkisiz isteklerde yönetici uçları 401 döndürmeli', async () => {
    const oturumRes = await fetch(`${BASE}/api/admin/oturum`);
    assert.equal(oturumRes.status, 200);
    const oturum = await oturumRes.json();
    assert.equal(oturum.yetkili, false);
    assert.equal(oturum.anahtarTanimli, true);

    const korunanGetler = [
      '/api/settings',
      '/api/afiliye',
      '/api/afiliye/tikla',
      '/api/admin/ozet',
      '/api/admin/sponsor-rapor',
      '/api/kredi',
      '/api/db/bakim',
    ];
    for (const yol of korunanGetler) {
      const r = await fetch(`${BASE}${yol}`);
      assert.equal(r.status, 401, `GET ${yol} yetkisizken 401 vermedi (aldı: ${r.status})`);
    }

    const postAyar = await fetch(`${BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(postAyar.status, 401, 'POST /api/settings 401 vermedi');
  });

  await asyncTest('Admin giriş çerezi ile korunan uçlara erişim açılmalı ve çıkışla kapanmalı', async () => {
    const hatali = await fetch(`${BASE}/api/admin/giris`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anahtar: 'yanlis-anahtar' }),
    });
    assert.equal(hatali.status, 401);

    const giris = await fetch(`${BASE}/api/admin/giris`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anahtar: TEST_KEY }),
    });
    assert.equal(giris.status, 200);
    const setCookie = giris.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('admin_anahtari='), 'admin_anahtari çerezi verilmedi');
    assert.ok(/httponly/i.test(setCookie), 'Çerez HttpOnly değil');
    const cookieHeader = setCookie.split(';')[0];

    const oturumOk = await fetch(`${BASE}/api/admin/oturum`, { headers: { Cookie: cookieHeader } });
    assert.equal((await oturumOk.json()).yetkili, true);

    for (const yol of ['/api/admin/ozet', '/api/settings', '/api/afiliye', '/api/admin/sponsor-rapor', '/api/db/bakim']) {
      const r = await fetch(`${BASE}${yol}`, { headers: { Cookie: cookieHeader } });
      assert.equal(r.status, 200, `Yetkili GET ${yol} 200 dönmedi (aldı: ${r.status})`);
    }

    const ozet = await (await fetch(`${BASE}/api/admin/ozet`, { headers: { Cookie: cookieHeader } })).json();
    assert.equal(ozet.ok, true);
    assert.equal(typeof ozet.saglikOzet?.toplam, 'number');
    assert.equal(typeof ozet.afiliye?.etkin, 'boolean');
    assert.equal(typeof ozet.takipSayisi, 'number');
    assert.equal(typeof ozet.dogrulanmisSayisi, 'number');
    assert.ok(ozet.sponsor && typeof ozet.sponsor.aktif === 'number');

    const cikis = await fetch(`${BASE}/api/admin/cikis`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    assert.equal(cikis.status, 200);
  });
} finally {
  if (proc && proc.exitCode === null) {
    proc.kill();
  }
}

console.log(`\nSonuç: ${gecti} geçti, ${kaldi} kaldı.`);
if (kaldi > 0) process.exit(1);
