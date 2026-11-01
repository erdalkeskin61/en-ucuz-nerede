/**
 * GERÇEK e-posta gönderim testi (2026-10-28).
 *
 * Sunucudaki /api/alarm/test-email ucunu çağırır: nodemailer → Gmail SMTP.
 * Başarılıysa kullanıcının gelen kutusuna gerçek bir test e-postası düşer.
 *
 * SMTP şifresini ASLA yazdırmaz; yalnızca sonucu ve mesaj kimliğini gösterir.
 *
 *   node scripts/test-smtp-gonder.mjs
 */
const ANAHTAR = process.env.ERISIM_ANAHTARI || '';
const TABAN = process.env.TABAN || 'http://localhost:3000';

const r = await fetch(TABAN + '/api/alarm/test-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-erisim-anahtari': ANAHTAR },
  body: '{}',
});
const d = await r.json().catch(() => ({}));

if (!r.ok) {
  console.error('✗ Gönderilemedi:', d.hata || r.status);
  console.error('\nOlası nedenler: alarm e-posta adresi boş, SMTP bilgileri eksik,');
  console.error('Gmail uygulama şifresi geçersiz (2 adımlı doğrulama açık mı?).');
  process.exit(1);
}

console.log('✓ Test e-postası SMTP sunucusuna teslim edildi.');
console.log('  konu   :', d.konu);
console.log('  mesajId:', d.messageId || '(sunucu döndürmedi)');
console.log('  alıcı  :', d.alici || '(Ayarlar’daki alarm adresi)');
console.log('\nGelen kutusunu (ve spam klasörünü) kontrol edin.');
process.exit(0);
