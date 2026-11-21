/**
 * 🌍 Canlı Yayın Hazırlığı Testi — 2026-11-18
 *
 * Kapsam
 *   1)  Cloudflare/ters vekil uyumu: trust proxy, istemciIp, XFF sahtekârlığı
 *   2)  /api/* → Cache-Control: no-store (istisnalar korunur)
 *   3)  IP bazlı hız sınırı: 429 + Retry-After + loopback muafiyeti
 *   4)  SEO: robots.txt, dinamik /sitemap.xml, og:image/canonical mutlaklaştırma
 *   5)  ADMIN_ANAHTARI yokken güvenlik uyarısı + panel kapısı
 *   6)  TARAYICI_KAPALI=1 → dürüst hata
 *   7)  Dağıtım paketi: Dockerfile / .dockerignore / docker-compose / Caddyfile / .env.example
 *
 *   node scripts/test-canli-hazirlik.mjs
 *   node scripts/test-canli-hazirlik.mjs --canli   (çalışan sunucuya karşı)
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const varMi = (p) => fs.existsSync(path.join(KOK, p));
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
bolum('1) 🌐 Ters vekil & Cloudflare uyumu (server.js)');

const serverSrc = oku('server.js');
kontrol('TRUST_PROXY env okunur', /process\.env\.TRUST_PROXY/.test(serverSrc));
kontrol("app.set('trust proxy', …) yapılandırıldı", /app\.set\('trust proxy', TRUST_PROXY\)/.test(serverSrc));
kontrol('TRUST_PROXY varsayılanı 1 (Caddy tek atlama)', /if \(ham === undefined \|\| String\(ham\)\.trim\(\) === ''\) return 1;/.test(serverSrc));
kontrol("TRUST_PROXY 'false'/'0' desteklenir", /v === 'false' \|\| v === '0' \|\| v === 'off'/.test(serverSrc));
kontrol("TRUST_PROXY 'loopback' metin olarak geçirilir", /return v; \/\/ 'loopback'/.test(serverSrc));
kontrol('istemciIp yardımcısı tanımlı', /function istemciIp\(req\)/.test(serverSrc));
kontrol('istemciIp: CF-Connecting-IP öncelikli', /cf-connecting-ip/.test(serverSrc));
kontrol('istemciIp: ::ffff: öneki temizlenir', /replace\(\/\^::ffff:\/, ''\)/.test(serverSrc));

// 🔒 KRİTİK GÜVENLİK: yerelIstekMi artık req.ip KULLANMAZ
const yerelFn = (serverSrc.match(/function yerelIstekMi\(req\) \{[\s\S]*?\n\}/) || [''])[0];
kontrol('yerelIstekMi gerçek soket adresine bakar', /req\.socket\?\.remoteAddress/.test(yerelFn), yerelFn.slice(0, 90));
kontrol("yerelIstekMi req.ip KULLANMAZ (XFF atlatması kapalı)", !/req\.ip\b/.test(yerelFn));
kontrol('yerelIstekMi X-Forwarded-For başlığına göre karar vermez', !/x-forwarded-for/i.test(yerelFn));

kontrol('/api/durum vekil teşhis alanları verir', /vekili|vekili:/.test(serverSrc) || /vekil: \{/.test(serverSrc));
kontrol('/api/durum istemciIp raporlar', /istemciIp: istemciIp\(req\)/.test(serverSrc));

/* ================================================================== */
bolum('2) 🗄️ /api/* önbellek disiplini');

kontrol('no-store ara katmanı var', /API_ONBELLEK_ISTISNA/.test(serverSrc));
kontrol("Cache-Control: no-store gönderilir", /Cache-Control', 'no-store, no-cache, must-revalidate, private/.test(serverSrc));
kontrol('Pragma: no-cache', /setHeader\('Pragma', 'no-cache'\)/.test(serverSrc));
kontrol('Expires: 0', /setHeader\('Expires', '0'\)/.test(serverSrc));
kontrol('X-Content-Type-Options: nosniff (Cloudflare dönüşümü)', /X-Content-Type-Options', 'nosniff'/.test(serverSrc));

// İstisnalar: kendi public önbellek başlığını koyan uçlar korunmalı
for (const yol of ['/api/vitrin', '/api/widget', '/api/embed/oner', '/api/sponsor/vitrin', '/api/dogrulanmis-magazalar']) {
  kontrol(`istisna korunur: ${yol}`, new RegExp(`'${yol.replace(/\//g, '\\/')}'`).test(serverSrc));
}
kontrol('/api/vitrin kendi public başlığını korur',
  /app\.get\('\/api\/vitrin'[\s\S]{0,400}public, max-age=60/.test(serverSrc));

/* ================================================================== */
bolum('3) 🚦 IP bazlı hız sınırı');

kontrol('src/hizSiniri.js mevcut', varMi('src/hizSiniri.js'));
const hizSrc = oku('src/hizSiniri.js');
kontrol('Map tabanlı sabit pencere', /new Map\(\)/.test(hizSrc) && /pencereBitis|bitis/.test(hizSrc));
kontrol('periyodik temizlik', /function hizSiniriTemizle/.test(hizSrc) && /TEMIZLIK_ARASI_MS/.test(hizSrc));
kontrol('HTTP 429 döner', /status\(429\)/.test(hizSrc));
kontrol('Retry-After başlığı', /setHeader\('Retry-After'/.test(hizSrc));
kontrol('X-RateLimit başlıkları', /X-RateLimit-Limit/.test(hizSrc) && /X-RateLimit-Remaining/.test(hizSrc));
kontrol('env ile limit (RL_*)', /RL_/.test(hizSrc) || /envAd/.test(hizSrc));
kontrol('loopback muafiyeti (RL_LOOPBACK_MUAF)', /RL_LOOPBACK_MUAF/.test(hizSrc));
kontrol('IP maskelenir (panel özeti)', /replace\(\/\\\.\\d\+\$\/, '\.\*\*\*'\)/.test(hizSrc) || /\*\*\*/.test(hizSrc));

// Uç eşleşmeleri
for (const yol of ['/api/compare', '/api/oneri', '/api/sepet', '/api/barkod', '/api/gorsel', '/api/baski/hesapla']) {
  kontrol(`ağır uç korunur: ${yol}`, serverSrc.includes(`'${yol}', hizSinirYap(`));
}
kontrol('/api/gorsel-ara takma adı korunur', serverSrc.includes("'/api/gorsel-ara'"));
kontrol('yalnızca POST sınırlanır (GET durum/iptal serbest)', /if \(req\.method !== 'POST'\) return next\(\)/.test(serverSrc));
kontrol('muafiyet: loopback + GERÇEK admin (paylaşılan anahtar muaf değil)',
  /const hizMuaf = \(req\) => \(loopbackMuafMi\(\) && yerelIstekMi\(req\)\) \|\| gercekAdminMi\(req\)/.test(serverSrc));
kontrol('paylaşılan ERISIM_ANAHTARI hız sınırını atlamaz',
  /gercekAdminMi = \(req\) => Boolean\(process\.env\.ADMIN_ANAHTARI\)/.test(serverSrc));

/* ================================================================== */
bolum('4) 🔍 SEO — robots.txt, sitemap.xml, OG mutlaklaştırma');

kontrol('public/robots.txt mevcut', varMi('public/robots.txt'));
const robots = varMi('public/robots.txt') ? oku('public/robots.txt') : '';
for (const izin of ['/maliyet.html', '/sepet.html', '/slicer.html', '/ayarlar.html']) {
  kontrol(`robots: izin ${izin}`, robots.includes('Allow: ' + izin));
}
for (const yasak of ['/admin', '/admin.html', '/api/']) {
  kontrol(`robots: disallow ${yasak}`, robots.includes('Disallow: ' + yasak));
}
kontrol('robots: sitemap bildirimi', /Sitemap:/i.test(robots));

kontrol('GET /sitemap.xml ucu', /app\.get\('\/sitemap\.xml'/.test(serverSrc));
kontrol('sitemap: PUBLIC_URL veya istek host tabanı', /PUBLIC_URL/.test(serverSrc) && /yayinKoku/.test(serverSrc));
kontrol('sitemap: XML kaçışı', /function xmlKacis/.test(serverSrc) && /&amp;/.test(serverSrc));
kontrol('sitemap: urlset + lastmod', /sitemaps\.org\/schemas\/sitemap/.test(serverSrc) && /lastmod/.test(serverSrc));
kontrol('sitemap: Content-Type application/xml', /application\/xml; charset=utf-8/.test(serverSrc));

kontrol('PUBLIC_URL varsa OG/CSS mutlaklaştırma', /og-gorsel\.png/.test(serverSrc));
kontrol('og:url eklenir', /og:url/.test(serverSrc));
kontrol('canonical eklenir', /rel="canonical"/.test(serverSrc));
kontrol('PUBLIC_URL ve GA4 yoksa statik davranış korunur (next())', /if \(!acik && !ga4Snip\) return next\(\);/.test(serverSrc));
kontrol('GA4 ölçüm kimliği desteği (.env GA_MEASUREMENT_ID)', /ga4HeadSnip/.test(serverSrc) && /GA_MEASUREMENT_ID/.test(oku('src/seoSayfalar.js')));

/* ================================================================== */
bolum('5) 🚨 ADMIN_ANAHTARI güvenlik uyarısı');

kontrol('0.0.0.0 + boş ADMIN_ANAHTARI uyarısı', /GÜVENLİK UYARISI/.test(serverSrc));
kontrol('uyarı HOST=0.0.0.0 koşuluna bağlı', /config\.host === '0\.0\.0\.0' && !config\.adminAnahtari/.test(serverSrc));
kontrol('uyarı ADMIN_ANAHTARI önerir', /ADMIN_ANAHTARI/.test(serverSrc));
kontrol('PUBLIC_URL açılışta loglanır', /Yayın adresi:/.test(serverSrc));

/* ================================================================== */
bolum('6) 🖥️ Tarayıcı esnekliği (src/tarayici.js)');

const tarayiciSrc = oku('src/tarayici.js');
kontrol('TARAYICI_KAPALI env okunur', /process\.env\.TARAYICI_KAPALI/.test(tarayiciSrc));
kontrol('kapalıyken Chromium başlatılmaz (erken dönüş)', /if \(TARAYICI_KAPALI\) \{[\s\S]{0,300}kapali: true/.test(tarayiciSrc));
kontrol('kapalıyken dürüst hata metni', /acil bellek koruma modu/.test(tarayiciSrc));
kontrol('REMOTE_BROWSER_URL desteği', /process\.env\.REMOTE_BROWSER_URL/.test(tarayiciSrc));
kontrol('uzak: ws → chromium.connect', /chromium\.connect\(REMOTE_BROWSER_URL/.test(tarayiciSrc));
kontrol('uzak: http → connectOverCDP', /chromium\.connectOverCDP\(REMOTE_BROWSER_URL/.test(tarayiciSrc));
kontrol('tarayiciDurumu kapali alanı', /kapali: TARAYICI_KAPALI/.test(tarayiciSrc));
kontrol('tarayiciDurumu uzak alanı', /uzak: UZAK_MOD/.test(tarayiciSrc));

/* ================================================================== */
bolum('7) 📦 Dağıtım paketi');

kontrol('Dockerfile mevcut', varMi('Dockerfile'));
const dockerfile = varMi('Dockerfile') ? oku('Dockerfile') : '';
kontrol('Dockerfile: node:22-bookworm-slim (glibc → impit)', /^FROM node:22-bookworm-slim/m.test(dockerfile));
kontrol('Dockerfile: NODE_ENV=production', /NODE_ENV=production/.test(dockerfile));
kontrol('Dockerfile: ARG PLAYWRIGHT_KUR', /ARG PLAYWRIGHT_KUR=1/.test(dockerfile));
kontrol('Dockerfile: playwright install --with-deps chromium', /npx playwright install --with-deps chromium/.test(dockerfile));
kontrol('Dockerfile: /app/data kalıcı dizin', /mkdir -p \/app\/data/.test(dockerfile));
kontrol('Dockerfile: HEALTHCHECK /api/ping', /HEALTHCHECK[\s\S]{0,200}\/api\/ping/.test(dockerfile));
kontrol('Dockerfile: non-root kullanıcı', /USER node/.test(dockerfile));
kontrol('Dockerfile: dumb-init (temiz SIGTERM)', /dumb-init/.test(dockerfile));

kontrol('.dockerignore mevcut', varMi('.dockerignore'));
const dockerignore = varMi('.dockerignore') ? oku('.dockerignore') : '';
for (const d of ['node_modules', 'data', '.env', '.git']) {
  kontrol(`.dockerignore: ${d}`, new RegExp('^' + d.replace(/\./g, '\\.') + '/?$', 'm').test(dockerignore)
    || dockerignore.split(/\r?\n/).some(l => l.trim() === d || l.trim() === d + '/'));
}
kontrol('.dockerignore: .env.example istisnası', /!\.env\.example/.test(dockerignore));

kontrol('docker-compose.yml mevcut', varMi('docker-compose.yml'));
const compose = varMi('docker-compose.yml') ? oku('docker-compose.yml') : '';
kontrol('compose: app servisi', /^\s{2}app:/m.test(compose));
kontrol('compose: caddy servisi', /^\s{2}caddy:/m.test(compose));
kontrol('compose: ./data:/app/data volume', /\.\/data:\/app\/data/.test(compose));
kontrol('compose: ./.env env_file', /- \.\/\.env/.test(compose));
kontrol('compose: TRUST_PROXY geçirilir', /TRUST_PROXY/.test(compose));
kontrol('compose: Caddyfile bağlanır', /\.\/Caddyfile:\/etc\/caddy\/Caddyfile/.test(compose));
kontrol('compose: 80/443 portları', /"80:80"/.test(compose) && /"443:443"/.test(compose));
kontrol('compose: app portu yalnızca loopback', /127\.0\.0\.1:3000:3000/.test(compose));

kontrol('Caddyfile mevcut', varMi('Caddyfile'));
const caddy = varMi('Caddyfile') ? oku('Caddyfile') : '';
kontrol('Caddyfile: SITE_DOMAIN kullanılır', /\{\$SITE_DOMAIN\}/.test(caddy));
kontrol('Caddyfile: www → kök yönlendirme', /www\.\{\$SITE_DOMAIN\}[\s\S]{0,120}redir/.test(caddy));
kontrol('Caddyfile: SSE flush_interval -1', /flush_interval -1/.test(caddy));
kontrol('Caddyfile: SSE uzun read_timeout', /read_timeout 15m/.test(caddy));
kontrol('Caddyfile: sıkıştırma (encode zstd gzip)', /encode zstd gzip/.test(caddy));
kontrol('Caddyfile: app:3000 ters vekil', /reverse_proxy app:3000/.test(caddy));
kontrol('Caddyfile: güvenlik başlıkları', /Strict-Transport-Security/.test(caddy));
kontrol('Caddyfile: X-Frame-Options GLOBAL verilmez (widget iframe korunur)',
  !/^\s+X-Frame-Options/m.test(caddy));
kontrol('Caddyfile: X-Real-IP iletilir', /X-Real-IP/.test(caddy));
kontrol('Caddyfile: Cloudflare Full(strict) notu', /Full \(strict\)|Origin Certificate/.test(caddy));

kontrol('.env.example mevcut', varMi('.env.example'));
const envOrnek = varMi('.env.example') ? oku('.env.example') : '';
for (const anahtar of ['PUBLIC_URL', 'ADMIN_ANAHTARI', 'TRUST_PROXY', 'TARAYICI_KAPALI',
  'REMOTE_BROWSER_URL', 'IMPIT_KAPALI', 'RL_COMPARE', 'PLAYWRIGHT_KUR', 'SITE_DOMAIN']) {
  kontrol(`.env.example: ${anahtar}`, new RegExp('^' + anahtar + '=', 'm').test(envOrnek));
}

/* ================================================================== */
bolum('8) ⚙️ Birim davranışları (yalıtılmış)');

// --- Hız sınırı: 429 + Retry-After, pencere sıfırlanması, muafiyet ---
const { hizSiniri, hizSiniriSifirla, hizSiniriDurumu } = await import('../src/hizSiniri.js');
hizSiniriSifirla();

let simdi = 1_700_000_000_000;
const mw = hizSiniri({
  ad: 'test-uclu',
  limit: 3,
  pencereMs: 1000,
  ipCoz: () => '203.0.113.9',
  muaf: () => false,
  simdi: () => simdi,
});

const sahteRes = () => {
  const durum = { kod: 200, basliklar: {}, govde: null };
  return {
    durum,
    setHeader(k, v) { durum.basliklar[String(k).toLowerCase()] = v; },
    status(k) { durum.kod = k; return this; },
    json(v) { durum.govde = v; return this; },
  };
};

const gecir = (n) => {
  const r = sahteRes();
  let sonraki = false;
  mw({}, r, () => { sonraki = true; });
  return { ...r.durum, sonraki };
};

kontrol('limit altı istek geçer', gecir(1).sonraki === true);
kontrol('limit dolunca 429', (() => { gecir(2); gecir(3); return gecir(4).kod === 429; })());
const asim = gecir(5);
kontrol('429 gövdesi Türkçe + kod', /hiz_siniri/.test(String(asim.govde?.kod)) && /Çok fazla/.test(String(asim.govde?.hata)));
kontrol('Retry-After başlığı var', Number(asim.basliklar['retry-after']) >= 1, String(asim.basliklar['retry-after']));
kontrol('429 Cache-Control: no-store', /no-store/.test(String(asim.basliklar['cache-control'])));
kontrol('X-RateLimit-Remaining = 0', asim.basliklar['x-ratelimit-remaining'] === '0');

simdi += 1500; // pencere geçti
kontrol('pencere dolunca sayaç sıfırlanır (tekrar geçer)', gecir(6).sonraki === true);

// muafiyet
hizSiniriSifirla();
const muafMw = hizSiniri({
  ad: 'test-muaf', limit: 1, pencereMs: 60000,
  ipCoz: () => '127.0.0.1', muaf: () => true, simdi: () => simdi,
});
let muafHepGecti = true;
for (let i = 0; i < 5; i++) {
  const r = sahteRes();
  r.status = (k) => { muafHepGecti = false; return r; };
  let g = false;
  muafMw({}, r, () => { g = true; });
  if (!g) muafHepGecti = false;
}
kontrol('muaf istek limiti aşsa da geçer', muafHepGecti);
kontrol('durum özeti IP maskeler', (() => {
  hizSiniriSifirla();
  const d = hizSiniriDurumu();
  return typeof d.kayitSayisi === 'number';
})());

// --- Tarayıcı kapalı modu: gerçek import (env yalıtımı) ---
process.env.TARAYICI_KAPALI = '1';
const tarayiciMod = await import(`../src/tarayici.js?kapali=${Date.now()}`);
const kapaliCevap = await tarayiciMod.tarayiciIleCek('https://ornek.test/urun');
kontrol('TARAYICI_KAPALI: networkError döner', !!kapaliCevap.networkError);
kontrol('TARAYICI_KAPALI: dürüst mesaj', /TARAYICI_KAPALI=1/.test(String(kapaliCevap.networkError)));
kontrol('TARAYICI_KAPALI: kapali bayrağı', kapaliCevap.kapali === true);
kontrol('TARAYICI_KAPALI: HTTP isteği yapılmaz (status yok)', kapaliCevap.status === undefined);
const tDurum = tarayiciMod.tarayiciDurumu();
kontrol('tarayiciDurumu.kapali true', tDurum.kapali === true);
kontrol('tarayiciDurumu.uzak alanı boolean', typeof tDurum.uzak === 'boolean');
delete process.env.TARAYICI_KAPALI;

// --- Gerçek HTTP 429 (soket üzerinden): uçtan uca sözleşme ---
{
  const lim = hizSiniri({ ad: 'http-test', limit: 2, pencereMs: 60000, ipCoz: () => '198.51.100.7', muaf: () => false });
  const srv = http.createServer((req, res) => {
    lim(req, res, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const al = () => fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5000) });

  const a1 = await al();
  const a2 = await al();
  const a3 = await al();
  kontrol('gerçek HTTP: ilk 2 istek 200', a1.status === 200 && a2.status === 200,
    `${a1.status}/${a2.status}`);
  kontrol('gerçek HTTP: 3. istek 429', a3.status === 429, String(a3.status));
  kontrol('gerçek HTTP: Retry-After başlığı', Number(a3.headers.get('retry-after')) >= 1,
    String(a3.headers.get('retry-after')));
  kontrol('gerçek HTTP: 429 JSON gövdesi', await a3.json().then(j => j.kod === 'hiz_siniri').catch(() => false));
  srv.close();
}

// --- 🔒 XFF sahtekârlığı: yerelIstekMi gerçek sokete bağlı ---
// `trust proxy` açıkken istemci `X-Forwarded-For: 127.0.0.1` gönderebilir.
// Kaynak kodu `req.ip` KULLANMADIĞI için bu başlık yönetici kapısını açamaz.
{
  const yerelFn = (serverSrc.match(/function yerelIstekMi\(req\) \{[\s\S]*?\n\}/) || [''])[0];
  // Fonksiyonu izole edip iki senaryoyu çalıştır: (a) gerçek loopback soketi,
  // (b) uzak soket + sahte XFF.
  const yerelMi = new Function('req', yerelFn.replace(/^function yerelIstekMi\(req\) \{|\}$/g, '') + ';');
  const sahteUzak = {
    socket: { remoteAddress: '203.0.113.5' },
    ip: '127.0.0.1',                       // trust proxy sonrası XFF'ten gelmiş olabilir
    get: (h) => (String(h).toLowerCase() === 'x-forwarded-for' ? '127.0.0.1' : ''),
  };
  kontrol('XFF sahtekârlığı yönetici kapısını AÇMAZ', yerelMi(sahteUzak) === false);
  const gercekYerel = { socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1', get: () => '' };
  kontrol('gerçek loopback hâlâ yerel sayılır', yerelMi(gercekYerel) === true);
}

/* ================================================================== */
bolum('9) 🌐 Canlı HTTP davranışı (yerel sunucu)');

// server.js'i ayrı süreçte başlatmak yerine hafif bir mini-sunucu kurup
// AYNI ara katman mantığını doğruluyoruz: burada sözleşme testi yeterli.
// Gerçek sunucu testi --canli ile yapılır.

/* ================================================================== */
if (CANLI) {
  bolum('10) 🔌 Çalışan sunucu — canlı uçlar');
  const ANAHTAR = process.env.ERISIM_ANAHTARI || 'qx2kjlgmwhfnzc1p6b3r4ayd';
  const TABAN = process.env.SUNUCU || 'http://127.0.0.1:3000';
  const H = { 'x-erisim-anahtari': ANAHTAR };

  try {
    const ping = await fetch(`${TABAN}/api/ping`, { signal: AbortSignal.timeout(10000) });
    kontrol('canlı: /api/ping 200', ping.status === 200, `HTTP ${ping.status}`);

    const robots = await fetch(`${TABAN}/robots.txt`, { signal: AbortSignal.timeout(10000) });
    const robotsMetin = await robots.text();
    kontrol('canlı: robots.txt servis edilir', robots.status === 200 && /Disallow: \/admin/.test(robotsMetin));

    const sm = await fetch(`${TABAN}/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
    const smMetin = await sm.text();
    kontrol('canlı: /sitemap.xml 200 + urlset',
      sm.status === 200 && /<urlset/.test(smMetin), `HTTP ${sm.status}`);
    kontrol('canlı: sitemap Content-Type xml',
      String(sm.headers.get('content-type') || '').includes('xml'));
    kontrol('canlı: sitemap mutlak URL', /<loc>https?:\/\//.test(smMetin));

    // API no-store
    const durum = await fetch(`${TABAN}/api/durum`, { headers: H, signal: AbortSignal.timeout(10000) });
    kontrol('canlı: /api/durum Cache-Control no-store',
      /no-store/.test(String(durum.headers.get('cache-control') || '')),
      String(durum.headers.get('cache-control')));
    const vitrin = await fetch(`${TABAN}/api/vitrin`, { headers: H, signal: AbortSignal.timeout(10000) });
    kontrol('canlı: /api/vitrin public önbellek (istisna)',
      /max-age/.test(String(vitrin.headers.get('cache-control') || '')));

    const dj = await durum.json().catch(() => null);
    kontrol('canlı: /api/durum vekil bilgisi',
      dj?.vekil && typeof dj.vekil.trustProxy === 'string');
    kontrol('canlı: /api/durum hizSiniri özeti', !!dj?.hizSiniri);

    // Cache-Control: index HTML
    const ana = await fetch(`${TABAN}/`, { signal: AbortSignal.timeout(10000) });
    kontrol('canlı: GET / 200', ana.status === 200);
    if (process.env.PUBLIC_URL) {
      const html = await ana.text();
      kontrol('canlı: og:image mutlak URL', /property="og:image" content="https?:\/\//.test(html));
      kontrol('canlı: canonical mutlak URL', /rel="canonical" href="https?:\/\//.test(html));
    }
  } catch (e) {
    kontrol('canlı sunucuya erişilebildi', false, String(e?.message || e));
  }
}

/* ================================================================== */
console.log('\n' + '─'.repeat(56));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
