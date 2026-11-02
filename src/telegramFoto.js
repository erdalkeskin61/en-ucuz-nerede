/**
 * 📷 Telegram fotoğraf gönderimi (multipart) — 2026-11-03
 *
 * `sendPhoto` bir dosya yüklemesi gerektirir; `sendMessage` gibi JSON kabul
 * etmez. Bu modül PNG tamponunu `FormData` ile yükler ve **altyazıyı Telegram'ın
 * 1024 karakter sınırına** güvenli biçimde kısaltır.
 *
 * Ayrı modül olmasının nedeni: hem kişisel alarmlar (`alarms.js`) hem otonom
 * radar (`otonomRadar.js`) aynı yardımcıyı kullanır; `telegramBot.js`'e bağımlı
 * olmak döngüsel import riski taşır.
 */

/** Telegram caption üst sınırı (biraz pay bırakıyoruz). */
export const ALTYAZI_LIMIT = 1000;

/**
 * Metni satır sınırında kısaltır; HTML etiketi ortadan kesilmez.
 * Çağıran taraf zaten `esc()` uygulamış olmalıdır.
 * @param {string} metin
 * @param {number} [limit]
 */
export function guvenliAltyazi(metin, limit = ALTYAZI_LIMIT) {
  const s = String(metin ?? '').trim();
  const max = Math.max(80, Math.min(1024, Number(limit) || ALTYAZI_LIMIT));
  if (s.length <= max) return s;
  const kes = s.slice(0, max - 1);
  const satir = kes.lastIndexOf('\n');
  const govde = satir > max * 0.55 ? kes.slice(0, satir) : kes;
  return govde.trimEnd() + '…';
}

/**
 * PNG tamponunu Telegram'a fotoğraf olarak gönderir.
 *
 * @param {string} token bot token
 * @param {string|number} chatId
 * @param {Buffer|Uint8Array} png
 * @param {string} altyazi HTML (çağıran escape eder)
 * @param {{replyMarkup?:object, timeoutMs?:number, dosyaAdi?:string}} [opts]
 * @returns {Promise<{ok:true, yontem:'sendPhoto', messageId:number|null}>}
 */
export async function fotoGonder(token, chatId, png, altyazi, opts = {}) {
  if (!token) throw new Error('Telegram Bot Token tanımlı değil.');
  if (!chatId) throw new Error('Telegram sohbet kimliği tanımlı değil.');
  if (!png || !png.length) throw new Error('Gönderilecek görsel boş.');
  if (typeof FormData !== 'function' || typeof Blob !== 'function') {
    throw new Error('Bu Node sürümünde FormData/Blob yok (Node 20+ gerekli).');
  }

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([png], { type: 'image/png' }), opts.dosyaAdi || 'fiyat-trendi.png');
  form.append('caption', guvenliAltyazi(altyazi));
  form.append('parse_mode', 'HTML');
  form.append('disable_web_page_preview', 'true');
  if (opts.replyMarkup) {
    form.append('reply_markup', JSON.stringify(opts.replyMarkup));
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(Number(opts.timeoutMs) || 25000),
  });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok || veri.ok === false) {
    const desc = String(veri.description || `HTTP ${res.status}`).slice(0, 200);
    const hata = new Error('Telegram sendPhoto hatası: ' + desc);
    hata.statusCode = res.status;
    throw hata;
  }
  return { ok: true, yontem: 'sendPhoto', messageId: veri.result?.message_id ?? null };
}
