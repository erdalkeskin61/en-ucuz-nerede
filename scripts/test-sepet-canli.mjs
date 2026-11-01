/**
 * Sepet canlı uçtan uca testi (2026-10-28)
 *
 * Kullanıcının 5 ürünlük gerçek sepetiyle /api/sepet akışını çalıştırır ve
 * sonucu (hangi ürünler okundu, hangileri okunamadı, senaryo toplamları)
 * özetler. Kalıcı düzeltmenin (host başına nezaket + hata sayfası koruması)
 * sağlığını ölçmek için kullanılır.
 *
 * Kullanım: node scripts/test-sepet-canli.mjs
 */
const ANAHTAR = process.env.ERISIM_ANAHTARI || '';
const TABAN = process.env.TABAN || 'http://localhost:3000';

const urunler = [
  'https://filamentdepom.com/sunlu-yuksek-hizli-pla-filament-gri-1kg-175mm-852',
  'https://www.domirobot.com/sunlu-pla-filament-gri-175mm-1kg-pmu7929',
  'https://www.robo90.com/nanelab-hyper-pla-koyu-gri-filament-175mm-1kg',
  'https://filamentsan.com/creality-ender-pla-gri-filament-175mm-1kg',
  'https://www.3dmarketim.com/urun/creality-ender-pla-gri-filament-1-75mm-1kg-guclu-ve-puruzsuz-baski',
].map((url) => ({ url }));

const HDR = { 'Content-Type': 'application/json', 'x-erisim-anahtari': ANAHTAR };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const bas = await fetch(TABAN + '/api/sepet', {
  method: 'POST',
  headers: HDR,
  body: JSON.stringify({ urunler, hizliMod: true }),
});
const basJson = await bas.json();
if (!basJson.isId) {
  console.error('Sepet başlatılamadı:', basJson);
  process.exit(1);
}
console.log('İş:', basJson.isId, '| ürün:', urunler.length, '\n');

const t0 = Date.now();
let j = null;
let sonNot = '';
for (;;) {
  await bekle(2000);
  const y = await fetch(TABAN + '/api/sepet/' + basJson.isId, { headers: { 'x-erisim-anahtari': ANAHTAR } });
  j = await y.json();
  const p = j.progress || {};
  if (p.not && p.not !== sonNot) {
    sonNot = p.not;
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}sn | ${p.biten ?? 0}/${p.toplam ?? '?'} | ${String(p.not).slice(0, 78)}`);
  }
  if (j.status !== 'running') break;
  if (Date.now() - t0 > 600000) { console.error('Zaman aşımı'); process.exit(1); }
}

console.log(`\nDurum: ${j.status} | süre: ${(j.sureMs / 1000).toFixed(1)} sn`);
if (j.status !== 'done') {
  console.error('Hata:', j.error);
  process.exit(1);
}

const r = j.result || {};
console.log('Okunan ürün:', (r.urunler || []).length, '/', urunler.length);
for (const u of r.urunler || []) {
  const en = (u.teklifler || []).reduce((a, b) => (b.urunFiyati < a.urunFiyati ? b : a), u.teklifler?.[0]);
  console.log(`  ✓ ${String(u.ad || '').slice(0, 46)} | ${u.teklifler?.length ?? 0} site | en ucuz: ${en ? Number(en.urunFiyati).toFixed(2) + ' TL (' + en.siteName + ')' : '?'}`);
}
if ((r.bulunamayanlar || []).length) {
  console.log('Okunamayan:', r.bulunamayanlar.join(', '));
}
for (const s of Object.values(r.senaryolar || {})) {
  if (!s) continue;
  console.log(`  · ${s.etiket || s.anahtar}: ${Number(s.toplam).toFixed(2)} TL (${s.magazaSayisi} mağaza)`);
}
for (const u of r.uyarilar || []) console.log('  ⚠', u);
process.exit(0);
