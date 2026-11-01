/**
 * "From" alanı sağlamlaştırmasının testi (2026-10-28).
 *
 * Bulgu (dürüst not): Gmail geçersiz "From" başlığını ("indirim botu (erdal)")
 * REDDETMEDİ — gönderimi kabul edip başlığı kendisi düzeltti. Yani bu alan
 * e-postanın gitmesini engelleyen ASIL neden değildi. Yine de başlığın doğru
 * olması ve başka SMTP sunucularında (daha katı olanlarda) reddedilmemesi için
 * geçersiz adres yerine oturum adresi kullanılıyor.
 *
 * Gerçek gönderim doğrulaması: scripts/test-smtp-gonder.mjs
 */
import { getSettings } from '../src/store.js';

const s = getSettings();
const gecerliEposta = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(x || '').trim());

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => { toplam++; if (kosul) gecen++; else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`); };

kontrol('mevcut "from" geçersiz adres olarak tanınır', gecerliEposta(s.smtp.from) === false, JSON.stringify(s.smtp.from));
kontrol('kullanıcı adresi geçerli tanınır', gecerliEposta(s.smtp.user) === true);
kontrol('boş "from" geçersiz sayılır (oturum adresine düşer)', gecerliEposta('') === false);
kontrol('"ad <adres>" biçimi geçersiz sayılır (ayrı işlenir)', gecerliEposta('Bot <a@b.com>') === false);
kontrol('normal adres geçerli', gecerliEposta('bot@ornek.com') === true);
kontrol('boşluklu adres kırpılarak geçerli sayılır', gecerliEposta('  bot@ornek.com  ') === true);

console.log(`FROM-ALANI ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);

