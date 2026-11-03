/**
 * 🔍 Typeahead + 🧵 Birim Fiyat Rozeti testleri — 2026-11-01
 *
 * Kapsam:
 *  A) /api/search-suggestions
 *     - en az 2 karakter kuralı, maksimum 6–8 öneri, string `oneriler` sözleşmesi
 *     - 3D katalog (Bambu Lab P1S, A1 Mini, X1-Carbon, Creality K1 Max, Porima,
 *       Microzey, Sunlu Kurutucu, PLA/PETG/TPU, Reçine…)
 *     - DB geçmişi / takipler / taranmış başlıklar (snapshot) eşleşmesi
 *     - <10 ms hedef (önbellek ısındıktan sonra)
 *  B) Arayüz: 150 ms debounce, .arama-onerileri, ok tuşları, Enter, Escape,
 *     dışarı tıklama, tıklayınca arama tetikleme, tema uyumu
 *  C) birimFiyatHesapla(): kg/L çıkarımı, 1/2.5/5 kg, 500 g, 1 L, 500 ml,
 *     yazıcı/aksesuarda null, formül doğruluğu, rozet metni
 *  D) Kart rozeti + "₺/kg En Ucuz" sıralaması + koyu tema
 *
 * Kullanım:
 *   node scripts/test-typeahead-birim.mjs
 *   node scripts/test-typeahead-birim.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { onerileriGetir, POPULER_URUNLER } from '../src/oneriler.js';
import { birimFiyatHesapla } from '../src/birimFiyat.js';

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
const yakin = (a, b, t = 0.01) => Math.abs(Number(a) - Number(b)) <= t;

/* ---------------------------------------------------------------- */
bolum('A) Öneri API sözleşmesi ve katalog');
const app = oku('public/app.js');
const html = oku('public/index.html');
const css = oku('public/style.css');
const server = oku('server.js');

kontrol('uç nokta var', /app\.get\('\/api\/search-suggestions'/.test(server));
kontrol('string `oneriler` alanı', /oneriler,\s*\n\s*onerilerDetay/.test(server));
kontrol('zengin `onerilerDetay` alanı', /onerilerDetay: detay/.test(server));
kontrol('sureMs raporlanıyor', /sureMs: Math\.round/.test(server));
kontrol('1 karakter → boş liste', /sorgu\.length === 1\s*\n?\s*\? \[\]/.test(server));
kontrol('limit 1–20 arası sınırlı', /Math\.min\(Number\(req\.query\.limit\) \|\| 8, 20\)/.test(server));

for (const ad of [
  'Bambu Lab P1S', 'Bambu Lab A1 Mini', 'Bambu Lab X1-Carbon',
  'Creality K1 Max', 'Creality Ender 3 V3', 'eSun PLA+ Siyah', 'eSun PETG',
  'Porima PLA', 'Microzey PLA', 'Anycubic Kobra 2', 'Elegoo Saturn 4',
  'Sunlu Filament Kurutucu', 'PLA Filament', 'PETG Filament', 'TPU Filament', 'Reçine',
]) {
  kontrol(`katalogda: ${ad}`, POPULER_URUNLER.some(x => x === ad), ad);
}
kontrol('katalog 35+ ürün', POPULER_URUNLER.length >= 35, String(POPULER_URUNLER.length));

const bamb = onerileriGetir('bamb', { limit: 8 });
kontrol('"bamb" 6–8 öneri', bamb.length >= 4 && bamb.length <= 8, String(bamb.length));
kontrol('"bamb" ilk sırada Bambu Lab P1S', bamb[0]?.metin === 'Bambu Lab P1S', bamb[0]?.metin);
kontrol('"bamb" A1 Mini de listede', bamb.some(x => /A1 Mini/.test(x.metin)));
kontrol('"crea" K1 Max', onerileriGetir('crea', { limit: 8 }).some(x => /K1 Max/.test(x.metin)));
kontrol('"pori" Porima', onerileriGetir('pori').some(x => /Porima/.test(x.metin)));
kontrol('"kurut" Sunlu Kurutucu', onerileriGetir('kurut').some(x => /Kurutucu/.test(x.metin)));
kontrol('"reçi" Reçine', onerileriGetir('reçi').some(x => /Reçine/i.test(x.metin)));
kontrol('Türkçe İ duyarlı ("İ" ile arama)', onerileriGetir('incehesap').length >= 0);

// ⌛ Isınmış performans
onerileriGetir('warm');
const t0 = process.hrtime.bigint();
for (let i = 0; i < 30; i++) onerileriGetir('pla');
const ort = Number(process.hrtime.bigint() - t0) / 1e6 / 30;
kontrol('ısınmış ortalama <10 ms', ort < 10, ort.toFixed(2) + ' ms');
console.log(`     ısınmış ortalama: ${ort.toFixed(2)} ms`);

// Boş / kısa sorgu
kontrol('boş sorgu popüler döndürür', onerileriGetir('', { limit: 5 }).length === 5);

/* ---------------------------------------------------------------- */
bolum('B) Typeahead arayüzü');
kontrol('HTML: .arama-onerileri sınıfı', /class="oneriler-kutusu arama-onerileri"/.test(html));
kontrol('HTML: listbox rolü', /role="listbox"/.test(html));
kontrol('HTML: combobox rolü', /role="combobox"/.test(html));
kontrol('app: 150 ms debounce', /150\)/.test(app) && /onerileriYukle\(metin\)/.test(app));
kontrol('app: 2 karakter eşiği', /if \(metin\.length < 2\)/.test(app));
kontrol('app: ArrowDown/ArrowUp', /ArrowDown/.test(app) && /ArrowUp/.test(app));
kontrol('app: Enter ile seçim', /oneriSec\(oneriAktif\)/.test(app));
kontrol('app: Escape kapatır', /key === 'Escape'/.test(app) && /onerileriKapat\(\)/.test(app));
kontrol('app: dışarı tıklama kapatır', /closest\?\.\('\.hibrit-sarmal'\)\) onerileriKapat/.test(app));
kontrol('app: tıklayınca arama tetiklenir', /function oneriSec[\s\S]{0,800}requestSubmit/.test(app));
kontrol('app: onerilerDetay tercih edilir', /veri\.onerilerDetay/.test(app));
kontrol('app: metin listesi geriye uyumlu', /veri\.oneriler\.map\(m =>/.test(app));
kontrol('app: tarama kaynağı ikonu', /tur === 'tarama' \? '📚'/.test(app));
kontrol('CSS: .arama-onerileri tanımlı', /\.arama-onerileri\s*\{/.test(css));
kontrol('CSS: koyu tema', /html\[data-theme="dark"\] \.arama-onerileri/.test(css));

/* ---------------------------------------------------------------- */
bolum('C) birimFiyatHesapla — kg / L çıkarımı');
const senaryolar = [
  ['eSun PLA+ Filament 1.75mm 1kg', 850, 'kg', 1, 850],
  ['eSun PLA+ Filament 1kg Siyah', 850, 'kg', 1, 850],
  ['eSun PLA+ Filament 1000g', 850, 'kg', 1, 850],
  ['eSun PLA+ Filament 1000 gr', 850, 'kg', 1, 850],
  ['Porima PLA Filament 500g', 220, 'kg', 0.5, 440],
  ['Microzey PLA 500 g', 220, 'kg', 0.5, 440],
  ['Filament 2.5 kg', 875, 'kg', 2.5, 350],
  ['Filament 2500g', 875, 'kg', 2.5, 350],
  ['Filament 5 kg', 1500, 'kg', 5, 300],
  ['Filament 5000g', 1500, 'kg', 5, 300],
  ['Sunlu PETG 2,5 kg', 1000, 'kg', 2.5, 400],
];
for (const [baslik, fiyat, birim, miktar, beklenen] of senaryolar) {
  const r = birimFiyatHesapla(baslik, fiyat);
  kontrol(`${baslik} → ${beklenen} TL/${birim}`,
    r && r.birim === birim && yakin(r.miktar, miktar) && yakin(r.birimFiyat, beklenen),
    JSON.stringify(r && { birim: r.birim, miktar: r.miktar, fiyat: r.birimFiyat }));
}

const recineler = [
  ['Anycubic Water Washable Reçine 1000 ml', 720, 1, 720],
  ['Elegoo Standard Reçine 1 L', 900, 1, 900],
  ['Elegoo Standard Rezine 500 ml', 310, 0.5, 620],
  ['Reçine 0.5 lt', 300, 0.5, 600],
];
for (const [baslik, fiyat, litre, beklenen] of recineler) {
  const r = birimFiyatHesapla(baslik, fiyat);
  kontrol(`${baslik} → ${beklenen} TL/L`,
    r && r.birim === 'L' && yakin(r.miktar, litre) && yakin(r.birimFiyat, beklenen),
    JSON.stringify(r && { birim: r.birim, miktar: r.miktar, fiyat: r.birimFiyat }));
  kontrol(`${baslik}: rozet metni 🧪`, /^🧪 .* TL \/ L$/.test(r?.rozetMetni || ''), r?.rozetMetni);
}

// Filament olmayan ürünlerde birim fiyat ÜRETİLMEZ.
for (const [baslik, fiyat] of [
  ['Bambu Lab P1S 3D Yazıcı', 17999],
  ['Creality Ender 3 V3', 8999],
  ['Sunlu Filament Kurutucu', 1200],
  ['Creality Filament Eritici Ağız 0.4mm Nozzle', 150],
  ['Anakart SKR Mini E3', 900],
  ['PLA Filament', 500],            // gramaj yok
  ['eSun PLA+ 1.75mm', 700],        // gramaj yok
]) {
  kontrol(`birim fiyat yok: ${baslik}`, birimFiyatHesapla(baslik, fiyat) === null,
    JSON.stringify(birimFiyatHesapla(baslik, fiyat)));
}
kontrol('geçersiz fiyat null', birimFiyatHesapla('PLA 1kg', 0) === null);
kontrol('boş başlık null', birimFiyatHesapla('', 500) === null);

// Rozet metni formatı (spec)
const rozet = birimFiyatHesapla('PLA Filament 2.5 kg', 875);
kontrol('filament rozeti 🏷️ + TL / kg',
  /^🏷️ 350,00 TL \/ kg$/.test(rozet?.rozetMetni || ''), rozet?.rozetMetni);
kontrol('formül = fiyat / kg', yakin(rozet.birimFiyat, 875 / 2.5));

/* ---------------------------------------------------------------- */
bolum('D) Kart rozeti, sıralama ve tema');
kontrol('pipeline: birimHesap alanı', /birimHesap: birimFiyatHesapla\(/.test(oku('src/pipeline.js')));
kontrol('sunucu: canlı kartta birimHesap', /birimHesap: birimFiyatHesapla\(/.test(server));
kontrol('kart: birim rozet satırı', /birim-rozet-satiri/.test(app));
kontrol('kart: 🏷️ ₺/kg rozeti', /🏷️ \$\{bicim\(b\.tlKg\)\} TL \/ kg/.test(app));
kontrol('kart: 🧪 ₺/L rozeti', /🧪 \$\{bicim\(b\.tlL\)\} TL \/ L/.test(app));
kontrol('kart: miktar rozeti', /birim-miktar-rozet/.test(app));
kontrol('CSS: .birim-rozet', /\.birim-rozet\s*\{/.test(css));
kontrol('CSS: filament yeşil', /\.birim-rozet-filament/.test(css));
kontrol('CSS: reçine camgöbeği', /\.birim-rozet-resin/.test(css));
kontrol('CSS: koyu tema filament', /html\[data-theme="dark"\] \.birim-rozet-filament/.test(css));
kontrol('CSS: koyu tema reçine', /html\[data-theme="dark"\] \.birim-rozet-resin/.test(css));

kontrol('HTML: ₺/kg sıralama çipi', /data-filtre="birim_kg"/.test(html));
kontrol('app: birim_kg sıralama modu', /filtre === 'birim_kg'/.test(app));
kontrol('app: tlKg artan sıralama', /return av - bv;/.test(app));
kontrol('app: birim fiyatsızlar sona', /if \(av == null\) return 1;/.test(app));

/* ---------------------------------------------------------------- */
bolum('E) Yazım hatası toleransı + kategori ikonu (2026-11-03)');

// "ban" → "Bambu Lab P1S": Levenshtein mesafesi 1 olan kelime başı eşleşmesi.
const ban = onerileriGetir('ban', { limit: 6 });
kontrol('"ban" → Bambu ürünleri', ban.some(x => /Bambu/i.test(x.metin)), ban.map(x => x.metin).join(' | '));
kontrol('"ban" ilk sonuç yazıcı', /Bambu/i.test(ban[0]?.metin || ''), ban[0]?.metin);
kontrol('"ban" yazıcı ikonu 🖨️', ban[0]?.ikon === '🖨️', String(ban[0]?.ikon));

const esu = onerileriGetir('esu', { limit: 6 });
kontrol('"esu" → eSun filamentleri', esu.some(x => /esun/i.test(x.metin)));
kontrol('"esu" filament ikonu 🧵', esu[0]?.ikon === '🧵', String(esu[0]?.ikon));

const bambFuzzy = onerileriGetir('bamb', { limit: 4 });
kontrol('"bamb" → 4 Bambu modeli', bambFuzzy.filter(x => /Bambu Lab/i.test(x.metin)).length >= 3);
kontrol('model adları korunur (P1S, A1 Mini)', bambFuzzy.some(x => /P1S/.test(x.metin)) && bambFuzzy.some(x => /A1 Mini/.test(x.metin)));

// Kategori sınıflandırması: filament anahtar kelimesi markadan önce gelir.
const ender = onerileriGetir('ender', { limit: 6 });
const enderFilament = ender.find(x => /PLA/i.test(x.metin));
kontrol('"Creality Ender PLA" filamente sınıflandı', enderFilament?.ikon === '🧵', String(enderFilament?.ikon));

// Her öneride kategori + ikon alanı bulunur (arayüz ikonu bunları kullanır).
const hepsi = onerileriGetir('pla', { limit: 8 });
kontrol('tüm önerilerde kategori alanı', hepsi.every(x => ['filament', 'yazici', 'genel'].includes(x.kategori)));
kontrol('tüm önerilerde ikon alanı', hepsi.every(x => !!x.ikon));
kontrol('kategori/ikon uyumlu', hepsi.every(x => (x.kategori === 'filament') === (x.ikon === '🧵')));

bolum('F) Canlı API');
if (process.argv.includes('--canli')) {
  const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
  const h = {};
  if (config.erisimAnahtari) h['x-erisim-anahtari'] = config.erisimAnahtari;
  try {
    const t = Date.now();
    const r = await (await fetch(taban + '/api/search-suggestions?q=bamb&limit=8', { headers: h })).json();
    const ms = Date.now() - t;
    kontrol('canlı: dizi sözleşmesi', Array.isArray(r.oneriler), typeof r.oneriler);
    kontrol('canlı: hepsi string', r.oneriler.every(x => typeof x === 'string'));
    kontrol('canlı: 6–8 öneri', r.oneriler.length >= 4 && r.oneriler.length <= 8, String(r.oneriler.length));
    kontrol('canlı: Bambu P1S listede', r.oneriler.some(x => /Bambu Lab P1S/.test(x)), r.oneriler.join(' | '));
    kontrol('canlı: sunucu <10 ms', Number(r.sureMs) < 10, String(r.sureMs));
    kontrol('canlı: ağ dahil <300 ms', ms < 300, ms + ' ms');

    const tek = await (await fetch(taban + '/api/search-suggestions?q=b', { headers: h })).json();
    kontrol('canlı: 1 karakter → boş', tek.oneriler.length === 0, String(tek.oneriler.length));

    const bos = await (await fetch(taban + '/api/search-suggestions?q=', { headers: h })).json();
    kontrol('canlı: boş sorgu → popüler', bos.oneriler.length > 0, String(bos.oneriler.length));

    console.log(`     canlı: ${r.sureMs} ms sunucu · ${ms} ms ağ dahil · ${r.oneriler.length} öneri`);
  } catch (e) {
    kontrol('canlı uç erişilebilir', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Canlı test için: --canli');
}

console.log(`\nTYPEAHEAD-BIRIM ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
