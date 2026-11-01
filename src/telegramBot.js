/**
 * En Ucuz Nerede — Telegram İnteraktif Karşılaştırma Botu
 * 
 * Kullanıcı Telegram'dan bir ürün linki attığında:
 * 1) Linki algılar ve kullanıcıya "54 site taranıyor..." der.
 * 2) Arka planda runComparison çalıştırır.
 * 3) Sonucu en ucuz fiyat, fiyat farkı, diğer mağazalar ve "Neden ucuz?" açıklamasıyla gönderir.
 */
import { getSettings, getTracked, addTracked } from './store.js';
import { runComparison } from './pipeline.js';
import { detectSite } from './sites/index.js';
import { formatTL } from './util.js';
import { stokSirala } from './stokSirala.js';

let isPolling = false;
let stopRequested = false;
let lastUpdateId = 0;

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegram(token, chatId, text, opts = {}) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview ?? false,
    ...opts.extra,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function editTelegram(token, chatId, messageId, text, opts = {}) {
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: opts.disablePreview ?? false,
    ...opts.extra,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function handleMessage(token, msg) {
  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();
  if (!chatId || !text) return;

  // Komut: /start veya /yardim
  if (text === '/start' || text === '/yardim' || text === '/help') {
    const welcome = `🏷️ <b>En Ucuz Nerede? — Fiyat Karşılaştırma Asistanı</b>

Hoş geldiniz! Türkiye'deki 55 e-ticaret sitesinde en net, en ucuz fiyatı bulmak için:

👉 <b>Herhangi bir ürün linkini doğrudan buraya gönderin!</b>
<i>(Örn: Trendyol, Hepsiburada, Amazon TR, Robitshop, Vatan, MediaMarkt vb.)</i>

📦 <b>Komutlar:</b>
• /takipler - Aktif fiyat alarmlarınız
• /yardim - Kullanım kılavuzu`;
    await sendTelegram(token, chatId, welcome);
    return;
  }

  // Komut: /takipler
  if (text === '/takipler') {
    const list = getTracked();
    if (!list || !list.length) {
      await sendTelegram(token, chatId, '📭 Henüz takibe aldığınız bir ürün bulunmuyor.\n\nBir ürün linki göndererek ya da web arayüzünden hedef fiyat belirleyip alarm kurabilirsiniz.');
      return;
    }
    const lines = list.map((t, idx) => {
      const u = t.sonuc?.kaynak?.urun || t.urun || 'Ürün';
      const hedef = t.hedefFiyat ? formatTL(t.hedefFiyat) : '—';
      const sonFiyat = t.sonuc?.ozet?.enUcuzFiyat ? formatTL(t.sonuc.ozet.enUcuzFiyat) : '—';
      return `${idx + 1}. <b>${esc(u)}</b>\n   🎯 Hedef: ${hedef} · Son: ${sonFiyat}`;
    });
    await sendTelegram(token, chatId, `🔔 <b>Aktif Fiyat Takipleriniz (${list.length}):</b>\n\n${lines.join('\n\n')}`);
    return;
  }

  // URL Kontrolü
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (!urlMatch) {
    await sendTelegram(token, chatId, '💡 Bir ürünün Türkiye genelindeki en ucuz fiyatını bulmak için ürün sayfasının linkini gönderebilirsiniz.\n\n<i>Örn: https://www.trendyol.com/... veya https://www.robitshop.com/...</i>');
    return;
  }

  const targetUrl = urlMatch[0];
  const detected = detectSite(targetUrl);
  if (!detected) {
    await sendTelegram(token, chatId, '⚠️ Bu e-ticaret sitesi henüz desteklenmiyor.\n\nDesteklenen siteler arasında Trendyol, Hepsiburada, Amazon, Vatan, MediaMarkt, Robitshop, Robotistan, Teknosa, N11 ve 45+ mağaza bulunmaktadır.');
    return;
  }

  // 1) Bilgilendirme mesajı gönder
  const initMsg = await sendTelegram(
    token,
    chatId,
    `🔍 <b>${esc(detected.name)} ürünü algılandı!</b>\n\n🚀 Türkiye'deki diğer 54 sitede fiyatlar taranıyor, lütfen birkaç saniye bekleyin... ⏳`
  );
  const msgId = initMsg?.result?.message_id;

  try {
    // 2) Karşılaştırmayı çalıştır
    const res = await runComparison(targetUrl);
    const k = res?.kaynak || {};
    const o = res?.ozet || {};

    const baseResult = (res?.sonuclar || []).find(r => r.matchBasis === 'kaynak') || (res.sonuclar || [])[0];
    const basePrice = baseResult?.product?.pricing?.toplam ?? baseResult?.product?.sellingPrice ?? null;
    const cheapestPrice = o.enUcuzFiyat;
    const cheapestSite = o.enUcuzSite;
    const cheapestUrl = o.enUcuzUrl;

    let farkMetni = '';
    if (basePrice && cheapestPrice) {
      const diff = basePrice - cheapestPrice;
      if (diff > 1) {
        farkMetni = `💰 <b>Kazanç:</b> 🟢 <b>${formatTL(diff)} daha ucuz!</b>`;
      } else if (diff < -1) {
        farkMetni = `ℹ️ <i>Baktığınız sitedeki fiyat şu an diğer sitelerden daha uygun.</i>`;
      } else {
        farkMetni = `⚖️ <i>Diğer sitelerdeki en ucuz fiyat bu siteyle aynı seviyede.</i>`;
      }
    }

    // Neden daha ucuz?
    let nedenMetni = '';
    if (o.nedenDahaUcuz) {
      nedenMetni = `\n\n💡 <b>Neden Daha Ucuz?</b>\n${esc(o.nedenDahaUcuz)}`;
    }

    // Bulunan diğer mağazalar — stok hiyerarşisi (2026-10-30): stokta olanlar önce,
    // tükenenler sonda. Fiyatı ucuz diye tükenmiş ürün "en ucuz" gibi görünmesin.
    const digerleri = stokSirala(
      (res.sonuclar || []).filter(r => r.status === 'found' && r.product && r.site !== detected.id)
    ).slice(0, 5);

    let digerleriMetni = '';
    if (digerleri.length) {
      const satirlar = digerleri.map(d => {
        const pr = d.product.pricing?.toplam ?? d.product.sellingPrice;
        const kargoRozet = d.kargoBedava ? ' 📦' : '';
        const tukendiRozet = d.product.inStock === false ? '🔴 Tükendi · ' : '';
        return `• <b>${esc(d.siteName || d.site)}:</b> ${tukendiRozet}${formatTL(pr)}${kargoRozet}`;
      });
      digerleriMetni = `\n\n📊 <b>Diğer Mağazalar:</b>\n${satirlar.join('\n')}`;
    }

    const stokSatiri = o.tamamiTukendi
      ? '⚠️ <b>Tüm mağazalarda tükendi</b>'
      : (o.stoktaVarSayisi != null
        ? `📦 <b>Stok:</b> 🟢 ${o.stoktaVarSayisi} mağazada var${o.stoktaYokSayisi ? ` · 🔴 ${o.stoktaYokSayisi} tükendi` : ''}`
        : '');
    const enUcuzSatiri = o.tamamiTukendi
      ? '⚠️ <b>En Ucuz:</b> stokta ürün yok'
      : `🥇 <b>En Ucuz:</b> <b>${formatTL(cheapestPrice)}</b> (${esc(cheapestSite)})`;

    const sonucMetni = `🏷️ <b>${esc(k.urun || 'Ürün Karşılaştırma Sonucu')}</b>

${enUcuzSatiri}
🏬 <b>Mevcut Siteniz:</b> ${formatTL(basePrice)} (${esc(detected.name)})
${stokSatiri ? stokSatiri + '\n' : ''}${farkMetni}${nedenMetni}${digerleriMetni}`;

    // Butonlar
    const inlineButtons = [];
    if (cheapestUrl) {
      inlineButtons.push([{ text: `🛍️ ${cheapestSite}'de Aç (${formatTL(cheapestPrice)})`, url: cheapestUrl }]);
    }

    if (msgId) {
      await editTelegram(token, chatId, msgId, sonucMetni, {
        extra: inlineButtons.length ? { reply_markup: { inline_keyboard: inlineButtons } } : {},
      });
    } else {
      await sendTelegram(token, chatId, sonucMetni, {
        extra: inlineButtons.length ? { reply_markup: { inline_keyboard: inlineButtons } } : {},
      });
    }
  } catch (err) {
    const errMsg = `❌ <b>Karşılaştırma sırasında bir sorun oluştu:</b>\n${esc(err.message || 'Ürün bilgileri alınamadı.')}`;
    if (msgId) {
      await editTelegram(token, chatId, msgId, errMsg);
    } else {
      await sendTelegram(token, chatId, errMsg);
    }
  }
}

export async function startTelegramBot() {
  if (isPolling) return;
  isPolling = true;
  stopRequested = false;

  console.log('[Telegram Bot] İnteraktif sohbet dinleyici başlatılıyor...');

  while (!stopRequested) {
    const settings = getSettings();
    const token = settings.telegram?.botToken;
    const enabled = settings.telegram?.enabled;

    if (!enabled || !token) {
      // Bot aktif değilse 15 saniye bekle ve tekrar kontrol et
      await new Promise(r => setTimeout(r, 15000));
      continue;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          if (update.message) {
            handleMessage(token, update.message).catch(err => {
              console.error('[Telegram Bot] Mesaj işleme hatası:', err.message);
            });
          }
        }
      }
    } catch (e) {
      // Ağ kesintisi veya zaman aşımı durumunda sessizce bekle ve devam et
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  isPolling = false;
  console.log('[Telegram Bot] Dinleyici durduruldu.');
}

export function stopTelegramBot() {
  stopRequested = true;
}
