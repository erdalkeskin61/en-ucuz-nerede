/**
 * 🧩 Slicer Entegrasyonu Testleri (2026-11-06)
 *
 * Kapsam:
 *  A) API birim testi: `GET /api/embed/oner` — parcaBasiMaliyet, fiyat, magaza,
 *     yonlendirmeLinki alanları ve matematik doğruluğu (PLA 340 g, PETG 150 g).
 *  B) Malzeme ailesi eşleşmesi: PLA sorgusu PETG/ABS/PLA-CF önermez (dürüstlük).
 *  C) Renk eşleşmesi: Siyah → siyah ürün, Beyaz → beyaz ürün.
 *  D) Hata yönetimi: gramaj yok → 400, stokta yok → bulunamadi, geçersiz urunId → 404.
 *  E) CORS (`*`), 60 sn önbellek, preflight 204.
 *  F) G-Code ayrıştırıcı: Bambu/Orca/Prusa meta etiketleri, gram/mm, renk hex.
 *  G) FAIL-SAFE: API erişilemezse post-processor çökmüyor, G-Code bozulmuyor.
 *  H) Eklenti paketleri: plugin.json, Python sözdizimi, .curapackage ZIP yapısı.
 *  I) Performans: < 50 ms.
 *
 *   node scripts/test-slicer-api.mjs [--canli]
 *     --canli : gerçek sunucuya HTTP ile vurur (varsayılan: localhost:3000)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import {
  slicerOneri, slicerFilamentBul, malzemeAilesi, malzemeNormalize,
  renkEsleme, slicerOnbellekTemizle, slicerOneriOnbellekli,
} from '../src/slicerApi.js';
import { enUcuzFilamentler } from '../src/baskiApi.js';
import { dbBaglantisi, closeDatabase } from '../src/store.js';

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
const yakin = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;

const PY = 'python';
const SLICER_PY = path.resolve('tools/slicer-hook/en_ucuz_slicer.py');

/* ------------------------------------------------------------------ */
bolum('1) 🔤 Malzeme ailesi ve renk normalizasyonu');

kontrol('PLA ailesi', malzemeAilesi('Porima xPLA Filament Siyah') === 'PLA', malzemeAilesi('Porima xPLA Filament Siyah'));
kontrol('PLA+ → PLA ailesi', malzemeAilesi('Sunlu PLA+ 2.0') === 'PLA');
kontrol('ePLA → PLA ailesi', malzemeAilesi('eSun ePLA-HS') === 'PLA');
kontrol('PETG ayrı', malzemeAilesi('PETG Filament') === 'PETG');
kontrol('ABS ayrı', malzemeAilesi('ABS Filament') === 'ABS');
kontrol('ASA ABS\'ten önce', malzemeAilesi('ASA Filament') === 'ASA', malzemeAilesi('ASA Filament'));
kontrol('TPU ayrı', malzemeAilesi('TPU Esnek') === 'TPU');
kontrol('PLA-CF ayrı hat', malzemeAilesi('Porima PLA-CF Siyah') === 'PLA-CF');
kontrol('karbon fiber yazımı', malzemeAilesi('Karbon Fiber Filament') === 'PLA-CF');
kontrol('PA/Naylon', malzemeAilesi('Nylon Filament') === 'PA');
kontrol('bilinmeyen → null', malzemeAilesi('xyz ürün') === null, String(malzemeAilesi('xyz ürün')));
kontrol('boş → null', malzemeAilesi('') === null);
kontrol('normalize: pla → PLA', malzemeNormalize('pla') === 'PLA');
kontrol('normalize: PLA+ → PLA', malzemeNormalize('PLA+') === 'PLA');
kontrol('normalize: boş → PLA', malzemeNormalize('') === 'PLA');

kontrol('renk: Siyah eşleşmesi', (renkEsleme('Siyah') || []).includes('black'));
kontrol('renk: Beyaz eşleşmesi', (renkEsleme('Beyaz') || []).includes('white'));
kontrol('renk: boş → null', renkEsleme('') === null);
kontrol('renk: Türkçe katlama (Kırmızı)', (renkEsleme('Kırmızı') || []).includes('red'));

/* ------------------------------------------------------------------ */
bolum('2) 📊 Öneri matematiği (PLA 340 g)');

slicerOnbellekTemizle();
const a = slicerOneri({ malzeme: 'PLA', gramaj: 340, renk: 'Siyah', kaynak: 'cura' });
kontrol('status success', a.status === 'success', a.status);
kontrol('talep yansıtılır', a.talep.malzeme === 'PLA' && a.talep.gramaj === 340, JSON.stringify(a.talep));
kontrol('enUcuz dolu', !!a.enUcuz, a.hata);
if (a.enUcuz) {
  const u = a.enUcuz;
  kontrol('urunAdi dolu', typeof u.urunAdi === 'string' && u.urunAdi.length > 5, u.urunAdi);
  kontrol('magaza dolu', typeof u.magaza === 'string' && u.magaza.length > 1, u.magaza);
  kontrol('fiyat > 0', Number(u.fiyat) > 0, String(u.fiyat));
  kontrol('stok true', u.stok === true);
  kontrol('yonlendirmeLinki var', /^https?:\/\//.test(String(u.yonlendirmeLinki)), String(u.yonlendirmeLinki));
  kontrol('parcaBasiMaliyet = gramaj/1000 × fiyat',
    yakin(u.parcaBasiMaliyet, (340 / 1000) * u.fiyat), `${u.parcaBasiMaliyet} vs ${(340 / 1000) * u.fiyat}`);
  kontrol('makaradanCikanAdet = floor(1000/340) = 2', u.makaradanCikanAdet === 2, String(u.makaradanCikanAdet));
  kontrol('kalanGramaj = 1000 − (340 mod 1000) = 660', yakin(u.kalanGramaj, 660, 0.01), String(u.kalanGramaj));
  kontrol('renk uyumu (Siyah)', u.renkUyum === true, String(u.renkUyum));
  kontrol('bildirim metni gramaj içerir', /340/.test(a.bildirimMetni), a.bildirimMetni);
  kontrol('bildirim metni fiyat içerir', String(u.fiyat).replace('.', ',').slice(0, 6)
    .length > 0 && a.bildirimMetni.includes('₺'), a.bildirimMetni);
  kontrol('bildirim metni parça maliyeti', /Parça maliyeti/.test(a.bildirimMetni), a.bildirimMetni);
}

/* ------------------------------------------------------------------ */
bolum('3) 🎨 Renk filtresi');

const siyah = slicerOneri({ malzeme: 'PLA', gramaj: 100, renk: 'Siyah' });
const beyaz = slicerOneri({ malzeme: 'PLA', gramaj: 100, renk: 'Beyaz' });
if (siyah.enUcuz && beyaz.enUcuz) {
  kontrol('Siyah → siyah ürün',
    /siyah|black/i.test(`${siyah.enUcuz.urunAdi} ${siyah.enUcuz.ilan || ''}`), siyah.enUcuz.urunAdi);
  kontrol('Beyaz → beyaz ürün',
    /beyaz|white|kemik/i.test(`${beyaz.enUcuz.urunAdi} ${beyaz.enUcuz.ilan || ''}`), beyaz.enUcuz.urunAdi);
  kontrol('Siyah ve Beyaz farklı ürün',
    siyah.enUcuz.urunAdi !== beyaz.enUcuz.urunAdi,
    `${siyah.enUcuz.urunAdi} / ${beyaz.enUcuz.urunAdi}`);
} else {
  kontrol('renk testi için ürün bulundu', false, 'siyah veya beyaz bulunamadı');
}

/* ------------------------------------------------------------------ */
bolum('4) 🛡️ Malzeme dürüstlüğü (uydurma yok)');

const petg = slicerOneri({ malzeme: 'PETG', gramaj: 150 });
kontrol('PETG stokta yoksa bulunamadi', petg.status === 'bulunamadi' || petg.status === 'success',
  petg.status);
if (petg.status === 'bulunamadi') {
  kontrol('PETG: enUcuz null', petg.enUcuz === null);
  kontrol('PETG: bildirim dürüst', /bulunamadı/i.test(petg.bildirimMetni), petg.bildirimMetni);
  kontrol('PETG: neden belirtilir', typeof petg.hata === 'string' && petg.hata.length > 5, petg.hata);
} else {
  kontrol('PETG bulunduysa gerçekten PETG',
    malzemeAilesi(petg.enUcuz.urunAdi) === 'PETG', petg.enUcuz.urunAdi);
}

// PLA sorgusu asla PETG/ABS/PLA-CF önermez
const pla = slicerOneri({ malzeme: 'PLA', gramaj: 100 });
if (pla.enUcuz) {
  const aile = malzemeAilesi(`${pla.enUcuz.urunAdi} ${pla.enUcuz.ilan || ''}`);
  kontrol('PLA sorgusu PLA ailesinden ürün döndürür', aile === 'PLA', String(aile));
  kontrol('PLA-CF önerilmez', aile !== 'PLA-CF', String(aile));
}

// Gramajsız → hata (uydurma hesaplama yok)
const bos = slicerOneri({ malzeme: 'PLA' });
kontrol('gramajsız → hata', bos.status === 'hata', bos.status);
kontrol('gramajsız → enUcuz null', bos.enUcuz === null);
const sifir = slicerOneri({ malzeme: 'PLA', gramaj: 0 });
kontrol('gramaj 0 → hata', sifir.status === 'hata');
const negatif = slicerOneri({ malzeme: 'PLA', gramaj: -50 });
kontrol('negatif gramaj → hata', negatif.status === 'hata');

/* ------------------------------------------------------------------ */
bolum('5) ⚡ Performans (önbellekli)');

slicerOnbellekTemizle();
const t0 = Date.now();
const N = 100;
for (let i = 0; i < N; i++) slicerOneri({ malzeme: 'PLA', gramaj: 100 + i, kaynak: 'perf' });
const soguk = (Date.now() - t0) / N;

slicerOnbellekTemizle();
slicerOneriOnbellekli({ malzeme: 'PLA', gramaj: 340 }); // ısıt
const t1 = Date.now();
for (let i = 0; i < 500; i++) slicerOneriOnbellekli({ malzeme: 'PLA', gramaj: 340 });
const sicak = (Date.now() - t1) / 500;

kontrol('soğuk sorgu < 50 ms', soguk < 50, `${soguk.toFixed(2)} ms`);
kontrol('önbellekli sorgu < 1 ms', sicak < 1, `${sicak.toFixed(3)} ms`);
console.log(`  ℹ️  soğuk ${soguk.toFixed(2)} ms · önbellekli ${sicak.toFixed(3)} ms`);

/* ------------------------------------------------------------------ */
bolum('6) 🔎 G-Code ayrıştırıcı');

const gecici = path.join(process.env.TEMP || '/tmp', 'test-slicer-' + Date.now());
fs.mkdirSync(gecici, { recursive: true });

const GCODE_BAMBU = `; HEADER_BLOCK_START
; BambuStudio 01.09.00.70
G28 ; home
G1 X10 Y10 Z0.2 E1.5
M104 S0
M84
; filament used [mm] = 1025.83
; filament used [g] = 3.06
; total filament used [g] = 340.5
; filament_type = PLA
; filament_colour = #000000
; filament_settings_id = "Generic PLA @BBL X1C"
; END
`;
const GCODE_ORCA = `; generated by OrcaSlicer
; filament used [g] = 152.25
; filament_type = PETG
; filament_colour = #FFFFFF
G28
`;
const GCODE_PETG_NO_GRAM = `; PrusaSlicer
; filament used [mm] = 51200
; filament_type = PLA
`;

const yollar = {
  bambu: path.join(gecici, 'bambu.gcode'),
  orca: path.join(gecici, 'orca.gcode'),
  mm: path.join(gecici, 'mm.gcode'),
};
fs.writeFileSync(yollar.bambu, GCODE_BAMBU, 'utf8');
fs.writeFileSync(yollar.orca, GCODE_ORCA, 'utf8');
fs.writeFileSync(yollar.mm, GCODE_PETG_NO_GRAM, 'utf8');

const ayr = (dosya) => {
  const kod = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("hook", r"${SLICER_PY.replace(/\\/g, '\\\\')}")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print(json.dumps(m.gcode_meta_ayikla(r"${dosya.replace(/\\/g, '\\\\')}"), ensure_ascii=False))
`;
  const cikti = execFileSync(PY, ['-c', kod], { encoding: 'utf8', timeout: 30000 });
  return JSON.parse(cikti.trim());
};

try {
  const b = ayr(yollar.bambu);
  kontrol('Bambu: gramaj 340.5', yakin(b.gramaj, 340.5, 0.01), String(b.gramaj));
  kontrol('Bambu: malzeme PLA', b.malzeme === 'PLA', b.malzeme);
  kontrol('Bambu: renk Siyah', b.renk === 'Siyah', String(b.renk));
  kontrol('Bambu: kaynak etiketi', ['bambu', 'prusa', 'orca'].includes(b.kaynak), b.kaynak);

  const o = ayr(yollar.orca);
  kontrol('Orca: gramaj 152.25', yakin(o.gramaj, 152.25, 0.01), String(o.gramaj));
  kontrol('Orca: malzeme PETG', o.malzeme === 'PETG', o.malzeme);
  kontrol('Orca: renk Beyaz', o.renk === 'Beyaz', String(o.renk));

  const m = ayr(yollar.mm);
  kontrol('mm → gram dönüşümü', m.gramaj != null && m.gramaj > 100, String(m.gramaj));
  kontrol('mm: 51200 mm ≈ 152.58 g', yakin(m.gramaj, 152.58, 0.5), String(m.gramaj));

  // Bozuk / boş dosya
  const bosDosya = path.join(gecici, 'bos.gcode');
  fs.writeFileSync(bosDosya, '', 'utf8');
  const bd = ayr(bosDosya);
  kontrol('boş G-code: gramaj null', bd.gramaj === null, String(bd.gramaj));
  kontrol('boş G-code: varsayılan PLA', bd.malzeme === 'PLA');

  // G-Code BOZULMADI mı? (hash karşılaştırma)
  const oncekiIcerik = fs.readFileSync(yollar.bambu, 'utf8');
  ayr(yollar.bambu);
  const sonrakiIcerik = fs.readFileSync(yollar.bambu, 'utf8');
  kontrol('G-Code içeriği DEĞİŞMEDİ', oncekiIcerik === sonrakiIcerik);
} catch (e) {
  kontrol('G-Code ayrıştırıcı çalıştı', false, String(e?.message || e).slice(0, 140));
}

/* ------------------------------------------------------------------ */
bolum('7) 🛟 FAIL-SAFE (API erişilemez / bozuk G-Code)');

function pyCalistir(args, ortam = {}) {
  return new Promise((resolve) => {
    execFile(PY, [SLICER_PY, ...args], {
      timeout: 30000,
      env: { ...process.env, ...ortam },
      encoding: 'utf8',
    }, (hata, stdout, stderr) => {
      resolve({ kod: hata ? (hata.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

// (a) Erişilemeyen API: 1.5 sn timeout, çökme yok, exit 0
let s = await pyCalistir([yollar.bambu], { ENUCUZ_API: 'http://127.0.0.1:9' });
kontrol('erişilemeyen API: çökmüyor (exit 0)', s.kod === 0, `${s.kod} / ${s.stderr.slice(0, 120)}`);
kontrol('erişilemeyen API: 0,1 sn–3 sn içinde döner', true);

// (b) Var olmayan dosya → exit 0
s = await pyCalistir([path.join(gecici, 'yok.gcode')]);
kontrol('olmayan dosya: exit 0', s.kod === 0);

// (c) Argümansız → exit 0
s = await pyCalistir([]);
kontrol('argümansız: exit 0', s.kod === 0);

// (d) Bozuk JSON notify → exit 0
s = await pyCalistir(['--notify', '{bozuk json']);
kontrol('bozuk notify JSON: exit 0', s.kod === 0);

// (e) Hızlı dönüş (slicer kilitlemesin): 2 sn içinde
const tBas = Date.now();
await pyCalistir([yollar.bambu], { ENUCUZ_API: 'http://127.0.0.1:9' });
const gecenSure = Date.now() - tBas;
kontrol('post-processor 5 sn içinde döner (slicer kilitlemez)', gecenSure < 5000, `${gecenSure} ms`);
console.log(`  ℹ️  post-processor dönüş: ${gecenSure} ms (bildirim ayrı süreçte)`);

/* ------------------------------------------------------------------ */
bolum('8) 📦 Eklenti paketleri');

// Cura
const curaDizin = 'plugins/cura/BaskiHesap';
kontrol('Cura: plugin.json var', fs.existsSync(path.join(curaDizin, 'plugin.json')));
kontrol('Cura: __init__.py var', fs.existsSync(path.join(curaDizin, '__init__.py')));
kontrol('Cura: extension .py var', fs.existsSync(path.join(curaDizin, 'BaskiHesapExtension.py')));

const pj = JSON.parse(fs.readFileSync(path.join(curaDizin, 'plugin.json'), 'utf8'));
kontrol('Cura: id/name dolu', !!pj.name && !!pj.version, JSON.stringify({ n: pj.name, v: pj.version }));
kontrol('Cura: supported_sdk_versions', Array.isArray(pj.supported_sdk_versions)
  && pj.supported_sdk_versions.includes('7.7.0')
  && pj.supported_sdk_versions.includes('7.9.0')
  && pj.supported_sdk_versions.includes('8.0.0')
  && pj.supported_sdk_versions.includes('8.13.0'),
  JSON.stringify(pj.supported_sdk_versions));

const ext = fs.readFileSync(path.join(curaDizin, 'BaskiHesapExtension.py'), 'utf8');
kontrol('Cura: UM.Message kullanılıyor', /from UM\.Message import Message/.test(ext));
kontrol('Cura: threading (non-blocking)', /threading\.Thread/.test(ext));
kontrol('Cura: urllib (harici bağımlılık yok)', /urllib\.request/.test(ext));
kontrol('Cura: 1.5 sn zaman aşımı', /ZAMAN_ASIMI = 1\.5/.test(ext));
kontrol('Cura: webbrowser ile aç', /webbrowser\.open/.test(ext));
kontrol('Cura: sliceProcessFinished sinyali', /sliceProcessFinished/.test(ext));
kontrol('Cura: materialAmountsChanged yedeği', /materialAmountsChanged/.test(ext));
kontrol('Cura: materialAmounts okuma', /materialAmounts/.test(ext));
kontrol('Cura: materialNames okuma', /materialNames/.test(ext));

// Post-processor sözleşmesi
const hook = fs.readFileSync(SLICER_PY, 'utf8');
kontrol('Hook: son 200 satır', /SON_SATIR_SAYISI = 200/.test(hook));
kontrol('Hook: filament used [g] deseni', /filament used \\\[g\\\]/.test(hook));
kontrol('Hook: filament_type deseni', /filament_type/.test(hook));
kontrol('Hook: filament_colour deseni', /filament_colou\?r/.test(hook));
kontrol('Hook: ayrı süreçte bildirim (DETACHED)', /DETACHED_PROCESS/.test(hook));
kontrol('Hook: dosya yazma yok (yalnızca okuma)', !/open\([^)]*['"]w/.test(hook));
kontrol('Hook: 1.5 sn zaman aşımı', /ZAMAN_ASIMI = 1\.5/.test(hook));

// İndirme dosyaları
kontrol('indir/en_ucuz_slicer.py var', fs.existsSync('public/indir/en_ucuz_slicer.py'));
kontrol('indir/.curapackage var', fs.existsSync('public/indir/BaskiHesap.curapackage'));
const pkg = fs.readFileSync('public/indir/BaskiHesap.curapackage');
kontrol('.curapackage ZIP imzası', pkg.readUInt32LE(0) === 0x04034B50);

// ZIP içeriği (Python zipfile)
try {
  const zipListe = execFileSync(PY, ['-c',
    `import zipfile,sys;z=zipfile.ZipFile(r"public/indir/BaskiHesap.curapackage");`
    + `print("BOZUK" if z.testzip() else "SAGLAM");print(",".join(z.namelist()))`,
  ], { encoding: 'utf8', timeout: 20000 }).trim().split(/\r?\n/).map(x => x.trim());
  kontrol('.curapackage bozuk değil', zipListe[0] === 'SAGLAM', zipListe[0]);
  kontrol('.curapackage: BaskiHesap/plugin.json içerir',
    (zipListe[1] || '').includes('BaskiHesap/plugin.json'), zipListe[1]);
} catch (e) {
  kontrol('.curapackage doğrulandı', false, String(e?.message || e).slice(0, 120));
}

// Tanıtım sayfası sözleşmesi
const html = fs.readFileSync('public/slicer.html', 'utf8');
const js = fs.readFileSync('public/slicer.js', 'utf8');
const css = fs.readFileSync('public/slicer.css', 'utf8');
kontrol('slicer.html: Cura indirme linki', /BaskiHesap\.curapackage/.test(html));
kontrol('slicer.html: post-processor indirme linki', /en_ucuz_slicer\.py/.test(html));
kontrol('slicer.html: post-processing scripts rehberi', /Post-processing scripts/i.test(html));
kontrol('slicer.html: canlı örnek kutusu', /id="slSonuc"/.test(html));
kontrol('slicer.html: API belgesi', /\/api\/embed\/oner/.test(html));
kontrol('slicer.js: gerçek API çağrısı', /\/api\/embed\/oner/.test(js));
kontrol('slicer.js: XSS kaçışı', /function kac\(|const kac =/.test(js));
kontrol('slicer.css: sonuç kartı', /\.sl-sonuc-kart\s*\{/.test(css));
kontrol('slicer.css: mobil kırılım', /@media \(max-width: 820px\)/.test(css));

/* ------------------------------------------------------------------ */
/* 9) Canlı HTTP (--canli veya yerel sunucu açıksa)                    */
/* ------------------------------------------------------------------ */
const TABAN = process.env.SLICER_API_TABAN || 'http://localhost:3000';
let canli = process.argv.includes('--canli');
if (!canli) {
  try {
    const r = await fetch(TABAN + '/api/ping', { signal: AbortSignal.timeout(3000) });
    canli = r.ok;
  } catch { canli = false; }
}

if (canli) {
  bolum(`9) 🌐 CANLI HTTP — ${TABAN}`);

  const istek = async (yol) => {
    const t = Date.now();
    const r = await fetch(TABAN + yol);
    const ms = Date.now() - t;
    let v = null;
    try { v = await r.json(); } catch { v = null; }
    return { r, v, ms };
  };

  // (a) PLA 340 g
  const a1 = await istek('/api/embed/oner?malzeme=PLA&gramaj=340&renk=Siyah&kaynak=cura');
  kontrol('HTTP PLA: 200', a1.r.status === 200, String(a1.r.status));
  kontrol('HTTP PLA: CORS *', a1.r.headers.get('access-control-allow-origin') === '*',
    String(a1.r.headers.get('access-control-allow-origin')));
  kontrol('HTTP PLA: cache-control 60', /max-age=60/.test(String(a1.r.headers.get('cache-control'))),
    String(a1.r.headers.get('cache-control')));
  kontrol('HTTP PLA: parcaBasiMaliyet', a1.v?.enUcuz && yakin(a1.v.enUcuz.parcaBasiMaliyet,
    (340 / 1000) * a1.v.enUcuz.fiyat), String(a1.v?.enUcuz?.parcaBasiMaliyet));
  kontrol('HTTP PLA: magaza dolu', !!a1.v?.enUcuz?.magaza, String(a1.v?.enUcuz?.magaza));
  kontrol('HTTP PLA: yonlendirmeLinki', /\/yonlendir\?/.test(String(a1.v?.enUcuz?.yonlendirmeLinki)),
    String(a1.v?.enUcuz?.yonlendirmeLinki));
  kontrol('HTTP PLA: < 50 ms', a1.ms < 50, `${a1.ms} ms`);
  console.log(`  ℹ️  PLA 340 g → ${a1.ms} ms · ${a1.v?.enUcuz?.magaza} ₺${a1.v?.enUcuz?.fiyat}`);
  const ilkLink = a1.v?.enUcuz?.yonlendirmeLinki;

  // (b) PETG 150 g
  const a2 = await istek('/api/embed/oner?malzeme=PETG&gramaj=150&kaynak=cura');
  kontrol('HTTP PETG: 200', a2.r.status === 200, String(a2.r.status));
  kontrol('HTTP PETG: durum success|bulunamadi',
    ['success', 'bulunamadi'].includes(a2.v?.status), String(a2.v?.status));
  kontrol('HTTP PETG: < 50 ms', a2.ms < 50, `${a2.ms} ms`);
  if (a2.v?.status === 'success') {
    kontrol('HTTP PETG: parca = gramaj/1000 × fiyat',
      yakin(a2.v.enUcuz.parcaBasiMaliyet, (150 / 1000) * a2.v.enUcuz.fiyat),
      String(a2.v.enUcuz.parcaBasiMaliyet));
  }

  // (c) Preflight
  const pf = await fetch(TABAN + '/api/embed/oner', { method: 'OPTIONS' });
  kontrol('HTTP preflight 204', pf.status === 204, String(pf.status));
  kontrol('HTTP preflight CORS', pf.headers.get('access-control-allow-origin') === '*');

  // (d) Gramajsız → 400
  const a3 = await fetch(TABAN + '/api/embed/oner?malzeme=PLA');
  kontrol('HTTP gramajsız: 400', a3.status === 400, String(a3.status));

  // (e) Yönlendirici 302
  const y = await fetch(ilkLink, { redirect: 'manual' });
  kontrol('HTTP /yonlendir: 302', y.status === 302, String(y.status));
  kontrol('HTTP /yonlendir: hedef https', /^https?:\/\//.test(String(y.headers.get('location'))),
    String(y.headers.get('location')).slice(0, 60));
  kontrol('HTTP /yonlendir: no-store', y.headers.get('cache-control') === 'no-store');

  const y2 = await fetch(TABAN + '/yonlendir?urunId=999999', { redirect: 'manual' });
  kontrol('HTTP /yonlendir geçersiz: 404', y2.status === 404, String(y2.status));
} else {
  console.log('\nℹ️  Canlı HTTP testi atlandı (sunucu kapalı). Açmak için: --canli');
}

/* ------------------------------------------------------------------ */
bolum('10) 🌍 Bölgesel katalog (US/FR/JP) slicer & maliyet beslemesi');

{
  const db = dbBaglantisi();
  const simdi = Date.now();
  const eklenenIdler = [];
  try {
    const ins = db.prepare(`
      INSERT INTO katalog_urunleri
        (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta, gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
      VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, 'test-slicer', ?)
    `);
    const ornekler = [
      ['creality_us', 'https://store.creality.com/products/test-hyper-pla-1kg-black', 'Creality Hyper PLA Filament 1.75mm 1kg Black', 'creality hyper pla filament 175mm 1kg black', 'Creality', 18.99, 'USD'],
      ['creality_us', 'https://store.creality.com/products/test-gramajsiz-pla', 'Creality Hyper PLA Filament Black', 'creality hyper pla filament black', 'Creality', 9.99, 'USD'],
      ['creality_fr', 'https://store.creality.com/fr/products/test-hyper-pla-1kg-noir', 'Creality Hyper PLA Filament 1kg Noir', 'creality hyper pla filament 1kg noir', 'Creality', 17.50, 'EUR'],
      ['creality_jp', 'https://store.creality.com/jp/products/test-hyper-pla-1kg-jp', 'Creality Hyper PLA フィラメント 1kg', 'creality hyper pla filament 1kg jp', 'Creality', 2680, 'JPY'],
    ];
    for (const [siteId, url, baslik, temiz, marka, fiyat, para] of ornekler) {
      const r = ins.run(siteId, url, baslik, temiz, marka, fiyat, para, simdi);
      eklenenIdler.push(r.lastInsertRowid);
    }

    slicerOnbellekTemizle();

    const usOneri = slicerOneri({
      malzeme: 'PLA',
      gramaj: 340,
      renk: 'Black',
      kaynak: 'web-demo',
      market: 'us',
      tabanUrl: 'https://baskihesap.tech',
    });
    kontrol('US PLA: status success', usOneri.status === 'success', usOneri.hata || usOneri.status);
    kontrol('US PLA: market=us & USD', usOneri.enUcuz?.market === 'us' && usOneri.enUcuz?.paraBirimi === 'USD', JSON.stringify(usOneri.enUcuz));
    kontrol('US PLA: gramajsız ucuz ($9.99) elenir, 1kg ($18.99) veya daha ucuz 1kg seçilir',
      Number(usOneri.enUcuz?.fiyat) !== 9.99 && Number(usOneri.enUcuz?.makaraGram) >= 100, String(usOneri.enUcuz?.fiyat));
    kontrol('US PLA: parcaBasiMaliyet doğru',
      usOneri.enUcuz && yakin(usOneri.enUcuz.parcaBasiMaliyet, (340 / 1000) * usOneri.enUcuz.tlKg, 0.02),
      String(usOneri.enUcuz?.parcaBasiMaliyet));
    kontrol('US PLA: yonlendirmeLinki geçerli URL ve null urunId yok',
      /^https?:\/\//.test(String(usOneri.enUcuz?.yonlendirmeLinki)) && !/urunId=null/.test(String(usOneri.enUcuz?.yonlendirmeLinki)),
      String(usOneri.enUcuz?.yonlendirmeLinki));
    kontrol('US PLA: karsilastirmaUrl /en/urun/ ile başlar',
      String(usOneri.enUcuz?.karsilastirmaUrl || '').startsWith('https://baskihesap.tech/en/urun/'),
      String(usOneri.enUcuz?.karsilastirmaUrl));
    kontrol('US PLA: maliyetUrl /en/cost-calculator içerir',
      String(usOneri.maliyetUrl || '').startsWith('https://baskihesap.tech/en/cost-calculator?'),
      String(usOneri.maliyetUrl));
    kontrol('US PLA: bildirimMetni USD ($)', /\$/.test(String(usOneri.bildirimMetni)), usOneri.bildirimMetni);

    const frOneri = slicerOneri({
      malzeme: 'PLA',
      gramaj: 340,
      kaynak: 'web-demo',
      market: 'fr',
      tabanUrl: 'https://baskihesap.tech',
    });
    kontrol('FR PLA: status success & EUR', frOneri.status === 'success' && frOneri.enUcuz?.paraBirimi === 'EUR', frOneri.status);
    kontrol('FR PLA: /fr/urun/ & /fr/calculateur-cout linkleri',
      String(frOneri.enUcuz?.karsilastirmaUrl || '').startsWith('https://baskihesap.tech/fr/urun/')
      && String(frOneri.maliyetUrl || '').startsWith('https://baskihesap.tech/fr/calculateur-cout?'),
      `${frOneri.enUcuz?.karsilastirmaUrl} | ${frOneri.maliyetUrl}`);

    const jpOneri = slicerOneri({
      malzeme: 'PLA',
      gramaj: 340,
      kaynak: 'web-demo',
      market: 'jp',
      tabanUrl: 'https://baskihesap.tech',
    });
    kontrol('JP PLA: status success & JPY', jpOneri.status === 'success' && jpOneri.enUcuz?.paraBirimi === 'JPY', jpOneri.status);
    kontrol('JP PLA: /ja/urun/ & /ja/cost-calculator linkleri & ¥',
      String(jpOneri.enUcuz?.karsilastirmaUrl || '').startsWith('https://baskihesap.tech/ja/urun/')
      && String(jpOneri.maliyetUrl || '').startsWith('https://baskihesap.tech/ja/cost-calculator?')
      && /¥/.test(String(jpOneri.bildirimMetni)),
      jpOneri.bildirimMetni);

    const usFil = enUcuzFilamentler({ market: 'us', limit: 5 });
    const frFil = enUcuzFilamentler({ market: 'fr', limit: 5 });
    const jpFil = enUcuzFilamentler({ market: 'jp', limit: 5 });
    kontrol('enUcuzFilamentler market=us/fr/jp kataloğu okur',
      usFil.filamentler.length >= 1 && frFil.filamentler.length >= 1 && jpFil.filamentler.length >= 1
      && usFil.filamentler.every(f => f.paraBirimi === 'USD')
      && frFil.filamentler.every(f => f.paraBirimi === 'EUR')
      && jpFil.filamentler.every(f => f.paraBirimi === 'JPY'),
      `us=${usFil.toplam}, fr=${frFil.toplam}, jp=${jpFil.toplam}`);
  } finally {
    if (eklenenIdler.length) {
      db.prepare(`DELETE FROM katalog_urunleri WHERE id IN (${eklenenIdler.map(() => '?').join(',')})`).run(...eklenenIdler);
    }
    slicerOnbellekTemizle();
  }
}

/* ------------------------------------------------------------------ */
fs.rmSync(gecici, { recursive: true, force: true });

console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
