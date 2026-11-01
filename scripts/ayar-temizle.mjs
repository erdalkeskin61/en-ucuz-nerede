/**
 * Tek seferlik temizlik (2026-10-28): eski ön yüz hatası SMTP şifresini
 * `whatsapp.pass` içine yazıyordu. Sunucu artık tanımsız anahtarları yazmıyor ama
 * DB'de kalan kalıntı silinmelidir.
 *
 *   node scripts/ayar-temizle.mjs         # rapor
 *   node scripts/ayar-temizle.mjs --sil   # siler
 *
 * NOT: `smtp.pass` DEĞİL, yalnızca whatsapp/telegram içindeki tanımsız anahtarlar
 * temizlenir. SMTP yapılandırmasına dokunulmaz.
 */
import * as store from '../src/store.js';

const sil = process.argv.includes('--sil');
const s = store.getSettings();

const IZINLI = {
  smtp: ['host', 'port', 'secure', 'user', 'pass', 'from'],
  whatsapp: ['enabled', 'webhookUrl', 'phone'],
  telegram: ['enabled', 'botToken', 'chatId'],
};

let bulunan = 0;
for (const [grup, anahtarlar] of Object.entries(IZINLI)) {
  const nesne = s[grup];
  if (!nesne || typeof nesne !== 'object') continue;
  for (const k of Object.keys(nesne)) {
    if (anahtarlar.includes(k)) continue;
    bulunan++;
    // Değeri asla yazdırma (sır olabilir); yalnızca anahtar adı ve uzunluğu.
    const deger = nesne[k];
    const uzunluk = typeof deger === 'string' ? deger.length : typeof deger;
    console.log(`  • ${grup}.${k} → tanımsız anahtar (${uzunluk}) — kaldırılmalı`);
  }
}

if (!bulunan) {
  console.log('Tanımsız anahtar yok; ayarlar temiz.');
  process.exit(0);
}

if (!sil) {
  console.log(`\n${bulunan} tanımsız anahtar bulundu. Silmek için: node scripts/ayar-temizle.mjs --sil`);
  process.exit(0);
}

// Yalnızca ilgili grupları, izinli anahtarlarıyla yeniden yaz.
const patch = {};
for (const [grup, anahtarlar] of Object.entries(IZINLI)) {
  if (!s[grup]) continue;
  patch[grup] = Object.fromEntries(anahtarlar.filter(k => s[grup][k] !== undefined).map(k => [k, s[grup][k]]));
}
store.saveSettings(patch);

const sonra = store.getSettings();
let kalan = 0;
for (const [grup, anahtarlar] of Object.entries(IZINLI)) {
  for (const k of Object.keys(sonra[grup] || {})) if (!anahtarlar.includes(k)) kalan++;
}
console.log(kalan ? `Hâlâ ${kalan} tanımsız anahtar var.` : 'Temizlendi.');
console.log('SMTP yapılandırması korundu:', {
  host: sonra.smtp.host || '(boş)',
  user: sonra.smtp.user || '(boş)',
  sifreVar: !!sonra.smtp.pass,
});
process.exit(kalan ? 1 : 0);
