/**
 * 🩺 healthPulse — Doğru Test Sorgusu Sınıflandırması (2026-11-10)
 *
 * SORUN: `sorguGrubu()` yalnızca listelenen kimlikleri 3D grubuna alıyordu.
 * Porima 3D ve URHANSHOP bu listede yoktu → gece 04:00 sağlık nöbetçisi saf
 * filament mağazasında **'kablo'** arıyor, sonuç bulunamayınca adaptör
 * haksız yere `fiyat_yok` (kırmızı) raporlanıyordu.
 *
 * KAPSAM
 *  1)  Sorgu sınıflandırması: porima3d / urhanshop → 'pla filament'
 *  2)  Genel mağazalar (trendyol, vatan, mediamarkt…) → 'kablo' grubu korunur
 *  3)  TÜM adaptör taraması: 3D mağazaları yanlış gruba düşmesin (regresyon ağı)
 *  4)  `sorguGrubu` dışa aktarım + büyük/küçük harf toleransı + kenar durumlar
 *  5)  CANLI `adaptorKontrol`: Porima 3D → sorgu 'pla filament', adet>0,
 *      ornekFiyat>0, durum 'ok' + `adapter_health` kaydı
 *  6)  Kaynak sözleşmesi
 *
 *   node scripts/test-health-pulse-queries.mjs
 *   node scripts/test-health-pulse-queries.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  sorguGrubu, adaptorKontrol, KONTROL_SAATI,
} from '../src/healthPulse.js';
import { adapters, adapterById } from '../src/sites/index.js';
import { getAdapterHealthLatest, addAdapterHealth, closeDatabase } from '../src/store.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

let gecen = 0, toplam = 0, atlanan = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const atla = (ad, neden) => { atlanan++; console.log(`  ℹ️  ATLANDI: ${ad} — ${neden}`); };
const bolum = (ad) => console.log(`\n${ad}`);

const d3Mu = (g) => Array.isArray(g) && g.includes('pla filament');

/* ------------------------------------------------------------------ */
bolum('1) 🎯 Sorgu sınıflandırması — 3D mağazaları');

kontrol('porima3d ilk sorgusu "pla filament"',
  sorguGrubu('porima3d')[0] === 'pla filament', String(sorguGrubu('porima3d')[0]));
kontrol('urhanshop ilk sorgusu "pla filament"',
  sorguGrubu('urhanshop')[0] === 'pla filament', String(sorguGrubu('urhanshop')[0]));
kontrol('porima3d grubu "kablo" İÇERMEZ',
  !sorguGrubu('porima3d').includes('kablo'), JSON.stringify(sorguGrubu('porima3d')));
kontrol('urhanshop grubu "kablo" İÇERMEZ',
  !sorguGrubu('urhanshop').includes('kablo'), JSON.stringify(sorguGrubu('urhanshop')));

// Diğer niş 3D mağazaları
for (const id of ['filamenthane', '3dteknomarket', 'filamentsan', 'robotistan', 'samm', '3dcim']) {
  kontrol(`${id} 3D grubunda`, d3Mu(sorguGrubu(id)), JSON.stringify(sorguGrubu(id)));
}

// Büyük harf / boşluk toleransı
kontrol('PORIMA3D (büyük harf) eşleşir', d3Mu(sorguGrubu('PORIMA3D')));
kontrol('" Porima3D " (boşluklu) eşleşir', d3Mu(sorguGrubu(' Porima3D ')));
kontrol('UrhanShop (karışık) eşleşir', d3Mu(sorguGrubu('UrhanShop')));

/* ------------------------------------------------------------------ */
bolum('2) 🛒 Genel mağazalar — "kablo" grubu korunur');

for (const id of ['trendyol', 'vatan', 'hepsiburada', 'amazon', 'mediamarkt', 'n11', 'teknosa', 'itopya']) {
  const g = sorguGrubu(id);
  kontrol(`${id} genel grupta`, g.includes('kablo') && !g.includes('pla filament'),
    JSON.stringify(g));
}

kontrol('bilinmeyen kimlik genel gruba düşer',
  sorguGrubu('olmayan-magaza')[0] === 'kablo', JSON.stringify(sorguGrubu('olmayan-magaza')));
kontrol('boş kimlik genel gruba düşer', sorguGrubu('')[0] === 'kablo');
kontrol('null kimlik çökmez', sorguGrubu(null)[0] === 'kablo');
kontrol('undefined kimlik çökmez', sorguGrubu(undefined)[0] === 'kablo');
kontrol('sayısal kimlik çökmez', Array.isArray(sorguGrubu(123)));

/* ------------------------------------------------------------------ */
bolum('3) 🔍 TÜM adaptör taraması (regresyon ağı)');

// Adı/kimliği 3D/filament/yazıcı çağrıştıran adaptörler mutlaka 3D grubunda olmalı.
const d3Deseni = /3d|filament|yaz[ıi]c|resin|reçine|maker|robot|samm|porima|urhan/i;
const d3Adaylari = adapters.filter(a => d3Deseni.test(`${a.name} ${a.id}`));
const yanlisGrup = d3Adaylari.filter(a => !d3Mu(sorguGrubu(a.id)));

kontrol('3D benzeri adaptör var', d3Adaylari.length >= 25, String(d3Adaylari.length));
kontrol('hiçbir 3D mağazası genel grupta değil', yanlisGrup.length === 0,
  yanlisGrup.map(a => `${a.id}(${a.name})`).join(', ') || 'temiz');

// Genel mağazalar yanlışlıkla 3D grubuna alınmamış olmalı (gereksiz yavaşlama).
const genelBeklenen = ['trendyol', 'hepsiburada', 'amazon', 'n11', 'vatan', 'mediamarkt'];
const yanlis3D = genelBeklenen.filter(id => d3Mu(sorguGrubu(id)));
kontrol('genel pazaryerleri 3D grubuna alınmadı', yanlis3D.length === 0, yanlis3D.join(', ') || 'temiz');

kontrol('68 adaptör taranıyor', adapters.length === 68, String(adapters.length));

// Her adaptör için grup bir dizi ve en az 1 sorgu döner.
kontrol('tüm adaptörler için geçerli sorgu listesi',
  adapters.every(a => {
    const g = sorguGrubu(a.id);
    return Array.isArray(g) && g.length > 0 && g.every(s => typeof s === 'string' && s.trim());
  }));

// Sorgulara "kablo" sızması: 3D grubunda hiç kablo olmamalı
kontrol('3D grubunda "kablo" yok',
  adapters.filter(a => d3Mu(sorguGrubu(a.id)))
    .every(a => !sorguGrubu(a.id).some(s => /kablo/i.test(s))));

/* ------------------------------------------------------------------ */
bolum('4) 📄 Kaynak sözleşmesi');

const src = oku('src/healthPulse.js');
kontrol('sorguGrubu export edilmiş', /export function sorguGrubu/.test(src));
kontrol('d3 listesinde porima3d var',
  /'samm',[\s\S]{0,400}'porima3d'/.test(src));
kontrol('d3 listesinde urhanshop var',
  /'porima3d',[\s\S]{0,200}'urhanshop'/.test(src));
kontrol('3D sorgu havuzu "pla filament" içerir',
  /_3d:\s*\['pla filament'/.test(src) || /_3d:\s*\['pla filament',\s*'filament'\]/.test(src));
kontrol('KONTROL_SAATI 04:00', KONTROL_SAATI === 4, String(KONTROL_SAATI));

// 2026-11-10: sağlık kaydının hangi sorguyla yapıldığı DB'de tutulmalı.
const storeSrc = oku('src/store.js');
kontrol('store: adapter_health şemasında sorgu kolonu',
  /CREATE TABLE IF NOT EXISTS adapter_health[\s\S]{0,700}sorgu TEXT/.test(storeSrc));
kontrol('store: mevcut DB için ALTER göçü',
  /ALTER TABLE adapter_health ADD COLUMN sorgu TEXT/.test(storeSrc));
kontrol('store: addAdapterHealth sorguyu yazar',
  /INSERT INTO adapter_health[\s\S]{0,220}sorgu\)/.test(storeSrc));
kontrol('store: getAdapterHealthLatest sorguyu döndürür',
  /sorgu: r\.sorgu \?\? null/.test(storeSrc));
kontrol('healthPulse: sonuç nesnesinde sorgu alanı',
  /sorgu: null,/.test(src) && /taban\.sorgu = kullanilanSorgu/.test(src));
kontrol('healthPulse: panelde sorgu gösterilir',
  /sorgu: s\.sorgu \?\? null/.test(src));

/* ------------------------------------------------------------------ */
bolum('5) 🌐 CANLI adaptör sağlığı (--canli)');

const canli = process.argv.includes('--canli');
if (!canli) {
  console.log('  ℹ️  Canlı yoklama için: node scripts/test-health-pulse-queries.mjs --canli');
} else {
  const ONCEKI = getAdapterHealthLatest();
  const hedefler = ['porima3d', 'urhanshop'];

  for (const id of hedefler) {
    const adapter = adapterById(id);
    kontrol(`${id}: adaptör kayıtlı`, !!adapter, id);
    if (!adapter) continue;

    const oncekiKayit = (ONCEKI || []).find(x => x.site === id);

    let r = null;
    for (let deneme = 1; deneme <= 2; deneme++) {
      try { r = await adaptorKontrol(adapter); }
      catch (e) { r = { durum: 'hata', hata: String(e.message || e).slice(0, 150), adet: 0 }; }
      // Ağ/rate limit ise bir kez daha dene (bizim kodumuz değil).
      const disEtken = /429|rate.?limit|timeout|zaman aşımı|ECONN|Crawlbase|ScraperAPI|proxy|cooldown/i
        .test(String(r?.hata || '')) || r?.durum === 'bot_korumasi';
      if (r?.durum === 'ok' || !disEtken || deneme === 2) break;
      console.log(`  ℹ️  ${id}: ${r.durum} → 15 sn sonra tekrar`);
      await new Promise(res => setTimeout(res, 15000));
    }

    try { addAdapterHealth(r); } catch { /* yazılamazsa test sürer */ }

    console.log(`  ℹ️  ${id}: sorgu="${r?.sorgu}" · adet=${r?.adet} · ₺${r?.ornekFiyat}`
      + ` · ${r?.durum}${r?.ornekBaslik ? ' · ' + String(r.ornekBaslik).slice(0, 50) : ''}`);

    // 1) Sorgu asla 'kablo' olmamalı (görevin özü)
    kontrol(`${id}: sorgu 'kablo' DEĞİL`, !/kablo/i.test(String(r?.sorgu || '')),
      String(r?.sorgu));
    kontrol(`${id}: sorgu 'pla filament'`,
      String(r?.sorgu || '').startsWith('pla filament') || String(r?.sorgu || '') === 'filament',
      String(r?.sorgu));

    if (r?.durum === 'ok') {
      kontrol(`${id}: durum ok`, true);
      kontrol(`${id}: adet > 0`, Number(r?.adet) > 0, String(r?.adet));
      kontrol(`${id}: ornekFiyat > 0`, Number(r?.ornekFiyat) > 0, String(r?.ornekFiyat));
      kontrol(`${id}: örnek başlık var`, !!r?.ornekBaslik, String(r?.ornekBaslik));
    } else {
      const disEtken = /429|rate.?limit|timeout|zaman aşımı|ECONN|Crawlbase|ScraperAPI|proxy|cooldown/i
        .test(String(r?.hata || '')) || r?.durum === 'bot_korumasi';
      if (disEtken) atla(`${id}: durum ok`, `dış etken (${String(r?.hata || '').slice(0, 60)})`);
      else kontrol(`${id}: durum ok`, false, `${r?.durum} — ${String(r?.hata || '').slice(0, 80)}`);
    }

    if (oncekiKayit) {
      console.log(`  ℹ️  ${id}: önceki kayıt ${oncekiKayit.durum}`
        + ` (sorgu: ${oncekiKayit.sorgu || '?'}) → şimdi ${r?.durum}`);
      kontrol(`${id}: önceki "kablo" kaydı yeni kayıtla geçildi`,
        !/kablo/i.test(String(r?.sorgu || '')), String(r?.sorgu));
    }
  }

  // SQLite: son kayıt gerçekten temiz mi?
  const son = getAdapterHealthLatest();
  for (const id of hedefler) {
    const kayit = (son || []).find(x => x.site === id);
    if (!kayit) { atla(`${id}: adapter_health kaydı`, 'kayıt yok'); continue; }
    kontrol(`${id}: DB'de sorgu 'kablo' değil`, !/kablo/i.test(String(kayit.sorgu || '')),
      String(kayit.sorgu));
    kontrol(`${id}: DB'de sorgu 'pla filament' kaydedildi`,
      /^pla filament/.test(String(kayit.sorgu || '')), String(kayit.sorgu));
    if (kayit.durum === 'ok') {
      kontrol(`${id}: DB'de durum ok`, true);
      kontrol(`${id}: DB'de fiyat > 0`, Number(kayit.ornekFiyat) > 0, String(kayit.ornekFiyat));
    }
  }

  // Genel mağaza canlı olarak hâlâ 'kablo' grubunu kullanıyor mu?
  // (Sınıflandırma tersine dönmediğinin uçtan uca kanıtı.)
  const genel = adapterById('trendyol');
  if (genel) {
    let gr = null;
    try { gr = await adaptorKontrol(genel); }
    catch (e) { gr = { durum: 'hata', hata: String(e.message || e).slice(0, 120), sorgu: null }; }
    if (gr?.sorgu) {
      kontrol('genel mağaza (trendyol) canlı sorgusu "kablo"',
        /^kablo/.test(String(gr.sorgu)), String(gr.sorgu));
    } else {
      atla('genel mağaza canlı sorgusu', 'sorgu okunamadı (ağ/rate limit)');
    }
  }
}

/* ------------------------------------------------------------------ */
try { closeDatabase(); } catch { /* zaten kapalı */ }

console.log('\n' + '─'.repeat(52));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti${atlanan ? ` · ${atlanan} atlandı (dış etken)` : ''}`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
