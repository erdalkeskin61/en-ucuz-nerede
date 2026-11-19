/**
 * 🚀 Dağıtım paketi üretici — 2026-11-19
 *
 * `deploy/en-ucuz-nerede-<zaman>.tar.gz` üretir. İçinde YALNIZCA kod vardır:
 *   • node_modules HARİÇ (sunucuda `npm ci --omit=dev` ile kurulur)
 *   • data/        HARİÇ (canlı SQLite + önbellek ASLA ezilmez)
 *   • .env         HARİÇ (sunucudaki gerçek anahtarlar korunur)
 *   • .git, deploy/ HARİÇ
 *
 * Kullanım:  node scripts/deploy-paket.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const KOK = path.resolve(import.meta.dirname, '..');
const CIKTI_DIZIN = path.join(KOK, 'deploy');
fs.mkdirSync(CIKTI_DIZIN, { recursive: true });

const damga = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const dosyaAdi = `en-ucuz-nerede-${damga}.tar.gz`;
const hedef = path.join(CIKTI_DIZIN, dosyaAdi);

const haric = [
  'node_modules',
  'data',
  '.env',
  '.git',
  'deploy',
  'certs',
  '.opencode',
  'coverage',
  'test-results',
  'playwright-report',
  '*.log',
  '*.db',
  '*.db-wal',
  '*.db-shm',
];

// Windows'ta `tar` (bsdtar) mevcut; --exclude desenlerini destekler.
const args = ['-czf', hedef, ...haric.flatMap((d) => ['--exclude', d]), '.'];
try {
  execFileSync('tar', args, { cwd: KOK, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  console.error('Paket oluşturulamadı:', String(e.stderr || e.message).slice(0, 500));
  process.exitCode = 1;
  throw e;
}

const boyut = fs.statSync(hedef).size;
console.log('✅ Paket hazır:', path.relative(KOK, hedef));
console.log('   Boyut:', (boyut / 1024 / 1024).toFixed(2), 'MB');

// Doğrulama: hassas dosyalar sızmadı mı?
const liste = execFileSync('tar', ['-tzf', hedef], { encoding: 'utf8' });
const sizinti = liste.split(/\r?\n/).filter((l) => (
  /(^|\/)\.env($|\.)/.test(l) && !/\.env\.example$/.test(l)
  || /(^|\/)data\//.test(l)
  || /node_modules\//.test(l)
  || /\.db(-wal|-shm)?$/.test(l)
  || /(^|\/)\.git\//.test(l)
));
if (sizinti.length) {
  console.error('❌ Pakete girmemesi gereken dosyalar var:');
  for (const s of sizinti.slice(0, 10)) console.error('   ' + s);
  process.exitCode = 1;
} else {
  console.log('   ✅ data/, .env, node_modules, .git pakette YOK');
  const logo = liste.split(/\r?\n/).some((l) => /(^|\/)public\/logo\.png$/.test(l));
  console.log('   ' + (logo ? '✅' : '❌') + ' public/logo.png pakette var');
}

console.log('\nSunucuya göndermek için:');
console.log(`  scp "${hedef}" KULLANICI@158.158.38.174:/tmp/`);
console.log('  ssh KULLANICI@158.158.38.174');
console.log('  # sunucuda:');
console.log('  bash /tmp/sunucu-guncelle.sh /tmp/' + dosyaAdi);
