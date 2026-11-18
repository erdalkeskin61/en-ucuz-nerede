import { spawnSync } from 'node:child_process';
import path from 'node:path';

const KOK = path.resolve(import.meta.dirname, '..');
const testler = [
  'test-canli-hazirlik.mjs', 'test-admin-panel.mjs', 'test-impit-katalog.mjs',
  'test-self-healing.mjs', 'test-tarama-dayaniklilik.mjs',
  'test-swr.mjs', 'test-oneri-akis.mjs', 'test-ui-ux-2026.mjs', 'test-widget.mjs',
  'test-stok.mjs', 'test-link-arama.mjs', 'test-anlik.mjs', 'test-katalog-eslesme.mjs',
  'test-fiyat-zekasi.mjs', 'test-otonom-radar.mjs', 'test-vitrin-borsa.mjs',
  'test-anti-flapping.mjs', 'test-sepet-optimizer-ui.mjs', 'test-telegram-assistant.mjs',
  'test-muadil.mjs', 'test-sahte-indirim-v2.mjs',
];

let hatali = 0;
for (const t of testler) {
  const r = spawnSync(process.execPath, [path.join('scripts', t)], { cwd: KOK, encoding: 'utf8', timeout: 900000 });
  const cikti = `${r.stdout || ''}\n${r.stderr || ''}`;
  const satir = cikti.split(/\r?\n/).filter(l => /Sonuç:|kontrol geçti|\d+\/\d+ ✓|geçti, 0 kaldı/.test(l)).pop() || '(özet yok)';
  const basarisiz = /Başarısız|Hatalar:|✗/.test(cikti) || r.status !== 0;
  if (basarisiz) hatali++;
  console.log(`${basarisiz ? '✗' : '✓'} ${t.padEnd(32)} ${satir.replace(/\s+/g, ' ').trim()}`);}
console.log(hatali === 0 ? '\nTÜM SÜİT YEŞİL' : `\n${hatali} süit başarısız`);
process.exitCode = hatali === 0 ? 0 : 1;
