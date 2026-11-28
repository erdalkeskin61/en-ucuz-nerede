/**
 * 📖 Karşılaştırma & Alım Rehberleri (SSR) — 2026-11-22
 *
 * Yüksek niyetli, düşük rekabetli "vs" ve rehber sorguları için canlı veritabanı
 * fiyatlarıyla (`seoUrunListesi`) otomatik güncellenen SSR sayfaları üretir:
 *   - GET /rehber
 *   - GET /karsilastir/bambu-lab-p1s-vs-creality-k1c
 *   - GET /karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro
 *   - GET /rehber/en-ucuz-pla-filament
 *   - GET /rehber/pla-vs-petg-filament
 *   - GET /rehber/3d-baski-maliyeti-nasil-hesaplanir
 *
 * Dürüstlük ilkesi: hiçbir ürün/mağaza fiyatı uydurulmaz; yalnızca canlı
 * `seoUrunListesi()` sonuçları gösterilir, kayıt yoksa "Canlı Tara" sunulur.
 */
import {
  htmlKacis, sayfaIskeleti, crealityResmiMagazaLink,
  GLOBAL_REHBER_YOLLARI,
} from './seoSayfalar.js';
import { formatPara, formatTL, parcaMi } from './util.js';
import { aiModelPartnerLinkleri } from './afiliye.js';
import { GLOBAL_AI_REHBER_YOLLARI, GLOBAL_MALIYET_YOLLARI } from './globalAracSayfalar.js';
import { GLOBAL_DUELLO_YOLLARI, globalDuelloSitemapKayitlari } from './globalDuelloRehberleri.js';

function urunBul(tumUrunler, regex) {
  const comboIstendi = /combo/i.test(regex.source);
  const adaylar = tumUrunler.filter((u) => {
    if (!regex.test(`${u.ad} ${u.slug} ${u.sorgu}`)) return false;
    if (parcaMi(u.ad)) return false;
    if (u.kategori !== 'yazici' && u.kategoriSlug !== '3d-yazici') return false;
    if (u.enUcuzFiyat > 0 && u.enUcuzFiyat < 4500) return false;
    if (!comboIstendi && /\bcombo\b/i.test(u.ad)) return false;
    return true;
  });
  return adaylar.find(u => u.stokluSayisi > 0 && u.enUcuzFiyat > 0) || adaylar[0] || null;
}

function heroAlani({ rozet, baslikHtml, altMetin, istatistikler = [] }) {
  const istHtml = istatistikler.length
    ? `<div class="hero-istatistik">${istatistikler.map(s => `<span>${s}</span>`).join('')}</div>`
    : '';
  return `<section class="hero seo-hero">
    <div class="hero-ic">
      <span class="hero-rozet">${rozet}</span>
      <h1>${baslikHtml}</h1>
      <p>${htmlKacis(altMetin)}</p>
      ${istHtml}
    </div>
  </section>`;
}

/** İki canlı ürün kartını VS rozetiyle yan yana ve fiyat farkı vurgusuyla çizer. */
function canliKarsilastirmaKutusu(solUrun, sagUrun, solBaslik, sagBaslik, solSorgu, sagSorgu) {
  const solUcuz = solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0 && solUrun.enUcuzFiyat < sagUrun.enUcuzFiyat;
  const sagUcuz = solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0 && sagUrun.enUcuzFiyat < solUrun.enUcuzFiyat;

  const kart = (u, baslik, sorgu, kazananMi) => {
    const fiyatMetin = u?.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara';
    const altMetin = u?.enUcuzFiyat > 0
      ? `${htmlKacis(u.enUcuzSite || 'Mağaza')} · ${u.stokluSayisi || 1} stoklu mağaza`
      : 'Anlık fiyatları 60+ mağazada kontrol et';
    const detayHref = u ? u.yol : `/?url=${encodeURIComponent(sorgu)}`;
    return `<div class="seo-mini-kart seo-vs-kart${kazananMi ? ' kazanan' : ''}" style="gap:10px">
      ${kazananMi ? '<span class="seo-vs-etiket">Bugün En Ucuz</span>' : ''}
      <div class="seo-vs-baslik">
        ${u?.gorsel ? `<img class="seo-vs-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad || baslik)}" loading="lazy" />` : ''}
        <div class="seo-mini-ad">${htmlKacis(u?.ad || baslik)}</div>
      </div>
      <div class="seo-mini-fiyat">${fiyatMetin}</div>
      <div class="seo-mini-alt">${altMetin}</div>
      <div class="seo-butonlar" style="margin-top:auto">
        <a class="seo-cta" style="padding:8px 14px;font-size:13px" href="${htmlKacis(detayHref)}">${u ? 'Tüm Teklifleri Gör' : 'Canlı Tara'}</a>
        ${u?.enUcuzUrl ? `<a class="seo-cta ikincil" style="padding:8px 12px;font-size:13px" href="${htmlKacis(u.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">Mağaza ↗</a>` : ''}
      </div>
    </div>`;
  };

  let farkNotu = '';
  if (solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0) {
    const fark = Math.abs(solUrun.enUcuzFiyat - sagUrun.enUcuzFiyat);
    if (fark < 1) {
      farkNotu = '<div class="seo-fiyat-kutu">Bugün kargo dahil en ucuz tekliflerde iki model aynı fiyatta.</div>';
    } else {
      const ucuzAd = solUrun.enUcuzFiyat < sagUrun.enUcuzFiyat ? solBaslik : sagBaslik;
      farkNotu = `<div class="seo-fiyat-kutu"><div>⚡ <b>Canlı Fiyat Özeti:</b> Bugün kargo dahil en ucuz teklifte <b>${htmlKacis(ucuzAd)}</b> <b>${formatTL(fark)} daha uygun</b>.</div></div>`;
    }
  }

  return `${farkNotu}<div class="seo-vs-izgara">${kart(solUrun, solBaslik, solSorgu, solUcuz)}<div class="seo-vs-orta"><span class="seo-vs-rozet">VS</span></div>${kart(sagUrun, sagBaslik, sagSorgu, sagUcuz)}</div>`;
}

/** Etkileşimli akordeon FAQ + FAQPage JSON-LD çifti üretir. */
function sssBolumu(sssListesi) {
  if (!sssListesi?.length) return { html: '', jsonLd: null };
  const html = `<section class="seo-kart">
    <h2 style="margin-top:0">Sık Sorulan Sorular</h2>
    <div class="seo-sss">
      ${sssListesi.map((s, idx) => `<details${idx === 0 ? ' open' : ''}>
        <summary>${htmlKacis(s.soru)}</summary>
        <p>${htmlKacis(s.cevap)}</p>
      </details>`).join('')}
    </div>
  </section>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: sssListesi.map(s => ({
      '@type': 'Question',
      name: s.soru,
      acceptedAnswer: { '@type': 'Answer', text: s.cevap },
    })),
  };
  return { html, jsonLd };
}

function altAraclarCubugu() {
  return `<section class="seo-rehber-kart" aria-label="Hızlı Geçişler" style="margin-top:6px">
    <div class="seo-rehber-ust">
      <div>
        <h2 class="bolum-baslik" style="margin:0 0 4px">Diğer Canlı Araçlar &amp; Sayfalar</h2>
        <p class="ipucu" style="margin:0">Karşılaştırma sonrası kargo sıfırlamak veya parça maliyeti çıkarmak için:</p>
      </div>
      <a class="seo-tum-link" href="/urunler">Tüm Ürün Kataloğu →</a>
    </div>
    <div class="seo-rehber-baglar">
      <a href="/rehber">Tüm Rehberler</a>
      <a href="/rehber/meshy-vs-hi3d-3d-baski-maliyeti">Meshy vs Hi3D Maliyet Rehberi</a>
      <a href="/kategori/3d-yazici">3D Yazıcı Fiyatları</a>
      <a href="/kategori/pla-filament">PLA &amp; PLA+ Filamentler</a>
      <a href="/kategori/petg-tpu-filament">PETG, TPU &amp; ABS</a>
      <a href="/kategori/3d-yazici-yedek-parca">⚙️ Yedek Parça</a>
      <a href="/maliyet.html">🧮 Baskı Maliyet Hesaplayıcı</a>
      <a href="/sepet.html">🧺 Akıllı Sepet Sihirbazı</a>
    </div>
  </section>`;
}

/** Yazıcı "vs" karşılaştırma sayfaları için veri tabanlı şablon. */
function yaziciKarsilastirmaOlustur(tanim, tumUrunler, tabanUrl) {
  const solUrun = urunBul(tumUrunler, tanim.solRegex);
  const sagUrun = urunBul(tumUrunler, tanim.sagRegex);
  const canonicalUrl = `${tabanUrl}${tanim.yol}`;

  const ozellikSatirlari = tanim.ozellikler.map(([alan, solDeger, sagDeger]) => `
    <tr>
      <td><b>${htmlKacis(alan)}</b></td>
      <td>${htmlKacis(solDeger)}</td>
      <td>${htmlKacis(sagDeger)}</td>
    </tr>`).join('');

  const farkBilgisi = (solUrun?.enUcuzFiyat > 0 && sagUrun?.enUcuzFiyat > 0)
    ? `💰 Fark: <b>${formatTL(Math.abs(solUrun.enUcuzFiyat - sagUrun.enUcuzFiyat))}</b>`
    : '⚡ 60+ mağazada canlı kıyas';

  const crealityTaraf = /creality|\bender|\bk1|\bk3/i.test(tanim.solAd)
    ? tanim.solAd
    : (/creality|\bender|\bk1|\bk3/i.test(tanim.sagAd) ? tanim.sagAd : '');
  const globalCreality = crealityTaraf ? crealityResmiMagazaLink(crealityTaraf) : null;

  const sss = sssBolumu(tanim.sss);
  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/rehber">Rehber &amp; Karşılaştırmalar</a> › <span>${htmlKacis(tanim.kisaBaslik)}</span>
    </nav>
    ${heroAlani({
      rozet: '⚖️ Canlı Yazıcı Karşılaştırması',
      baslikHtml: `${htmlKacis(tanim.solAd)} <b>vs</b> ${htmlKacis(tanim.sagAd)}`,
      altMetin: tanim.ozet,
      istatistikler: [
        farkBilgisi,
        '🚚 Kargo dahil gerçek tutar',
        '🔒 Stoklu mağaza kontrolü',
      ],
    })}
    <section class="seo-kart">
      <h2 style="margin-top:0">Canlı Fiyat ve Stok Kıyaslaması</h2>
      ${canliKarsilastirmaKutusu(solUrun, sagUrun, tanim.solAd, tanim.sagAd, tanim.solAd, tanim.sagAd)}
      ${globalCreality ? `<div class="seo-butonlar" style="margin-top:14px"><a class="seo-cta ikincil" href="${htmlKacis(globalCreality.url)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="creality">🌍 ${htmlKacis(crealityTaraf)} — Creality Resmî Mağaza (Global) ↗</a></div>` : ''}
    </section>
    <section class="seo-kart">
      <h2 style="margin-top:0">Teknik Özellikler ve Kullanım Farkları</h2>
      <div style="overflow-x:auto">
        <table class="seo-tablo">
          <thead><tr><th>Özellik</th><th>${htmlKacis(tanim.solAd)}</th><th>${htmlKacis(tanim.sagAd)}</th></tr></thead>
          <tbody>${ozellikSatirlari}</tbody>
        </table>
      </div>
    </section>
    <section class="seo-kart">
      <h2 style="margin-top:0">Hangisini Seçmelisiniz?</h2>
      <div class="seo-izgara" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
        <div class="seo-mini-kart">
          <div class="seo-mini-ad">✅ ${htmlKacis(tanim.solAd)} kimler için?</div>
          <p style="margin:0;font-size:14px;color:var(--gri-metin);line-height:1.55">${htmlKacis(tanim.solKimler)}</p>
        </div>
        <div class="seo-mini-kart">
          <div class="seo-mini-ad">✅ ${htmlKacis(tanim.sagAd)} kimler için?</div>
          <p style="margin:0;font-size:14px;color:var(--gri-metin);line-height:1.55">${htmlKacis(tanim.sagKimler)}</p>
        </div>
      </div>
    </section>
    ${/ams|combo|p1s|a1/i.test(`${tanim.solAd} ${tanim.sagAd}`) ? (() => {
      const aiLink = aiModelPartnerLinkleri();
      const hi3dRel = aiLink.hi3dAfiliye ? 'noopener sponsored nofollow' : 'noopener';
      const hi3dPromo = aiLink.hi3dPromo ? ` · 🎁 ${htmlKacis(aiLink.hi3dPromo)}` : '';
      return `<section class="seo-kart" id="amsCokRenkliRehberKart">
        <h2 style="margin-top:0">🎨 Çok Renkli (AMS / Combo) Baskı Hazırlığı &amp; Filament Planı</h2>
        <p style="margin:0 0 12px;font-size:14px;color:var(--gri-metin);line-height:1.55">Çok renkli ünite (AMS / AMS Lite / CFS) almayı düşünenlerin en büyük sorusu “Modeli bölmeden nasıl çok renkli baskı hazırlarım?”dır. <b>Hi3D</b>, modeli bölmeden fiziksel çok renkli baskıya uygun çıktı üretmeye odaklanır; renk değişiminde kule (purge) payı için +%15–25 ek filament bütçelemek ve 3–4 rengi <a href="/sepet.html">Akıllı Sepet</a> üzerinden tek kargoda birleştirmek maliyeti düşürür.</p>
        <div class="seo-butonlar">
          <a class="seo-cta" href="/rehber/meshy-vs-hi3d-3d-baski-maliyeti">🤖 Çok Renkli Maliyet &amp; Purge Rehberi →</a>
          <a class="seo-cta ikincil" href="/?url=eSUN%20PLA%2B">🌈 Çok Renkli PLA+ Ara →</a>
          <a class="seo-cta ikincil" href="/sepet.html">🧺 3–4 Renk Filament Sepetle →</a>
          <a class="seo-cta ikincil" href="${htmlKacis(aiLink.hi3dUrl)}" target="_blank" rel="${hi3dRel}" data-afiliye-site="hi3d">Hi3D Çok Renkli Yaklaşımını İncele ↗${hi3dPromo}</a>
        </div>
      </section>`;
    })() : ''}
    ${sss.html}
    ${altAraclarCubugu()}`;

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
        { '@type': 'ListItem', position: 3, name: tanim.kisaBaslik, item: canonicalUrl },
      ],
    },
    ...(sss.jsonLd ? [sss.jsonLd] : []),
  ];

  return sayfaIskeleti({
    title: tanim.title,
    description: tanim.description,
    canonicalUrl,
    ogImage: solUrun?.gorsel || sagUrun?.gorsel || `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    jsonLdList,
    govdeHtml,
    aktifNav: 'rehber',
  });
}

const YAZICI_KARSILASTIRMALARI = [
  {
    yol: '/karsilastir/bambu-lab-p1s-vs-creality-k1c',
    ikon: '⚔️',
    kisaBaslik: 'Bambu Lab P1S vs Creality K1C',
    h1: 'Bambu Lab P1S vs Creality K1C — Hangisi Alınır?',
    title: 'Bambu Lab P1S vs Creality K1C Karşılaştırması + Canlı Fiyat | Baskı Hesap',
    description: 'Bambu Lab P1S ve Creality K1C teknik farkları, çok renkli baskı, karbon fiber desteği ve Türkiye mağazalarındaki kargo dahil canlı en ucuz fiyatları.',
    ozet: 'Kapalı kasa CoreXY sınıfının en çok kıyaslanan iki modelini baskı hacmi, çok renkli baskı, mühendislik filament desteği ve bugünkü kargo dahil Türkiye fiyatlarıyla karşılaştırdık.',
    solAd: 'Bambu Lab P1S',
    sagAd: 'Creality K1C',
    solRegex: /bambu\s*lab\s*p1s/i,
    sagRegex: /creality\s*k1c|\bk1c\b/i,
    ozellikler: [
      ['Mimari & Kasa', 'CoreXY, tam kapalı kasa', 'CoreXY, tam kapalı kasa'],
      ['Baskı Hacmi', '256 × 256 × 256 mm', '220 × 220 × 250 mm'],
      ['Maksimum Hız / İvme', '500 mm/s · 20.000 mm/s²', '600 mm/s · 20.000 mm/s²'],
      ['Nozul & Karbon Fiber', 'Paslanmaz nozul (sertleştirilmiş yükseltme ile CF)', 'Dahili Unicorn üç metal sertleştirilmiş nozul (CF hazır)'],
      ['Çoklu Renk / Malzeme', 'AMS ünitesiyle kutudan 4 (toplam 16) renk', 'Tek makara (CFS / çok renk için farklı donanım gerekir)'],
      ['Yazılım Ekosistemi', 'Bambu Studio / Bambu Handy', 'Creality Print / açık Klipper erişimi'],
    ],
    solKimler: 'Daha geniş 256 mm baskı tablası isteyenler, ileride AMS ile çok renkli baskıya geçmeyi planlayanlar ve kutudan çıktığı gibi sorunsuz ekosistem arayanlar için öne çıkar.',
    sagKimler: 'Doğrudan kutudan sertleştirilmiş nozul ile karbon fiber (PA-CF / PETG-CF) basmak isteyenler, açık Klipper esnekliği arayanlar ve fiyatı daha aşağıda yakaladığında F/P odaklı kullanıcılar için idealdir.',
    sss: [
      { soru: 'Bambu Lab P1S mi Creality K1C mi daha büyük baskı alır?', cevap: 'Bambu Lab P1S 256×256×256 mm ile Creality K1C’nin 220×220×250 mm hacminden belirgin şekilde daha geniştir.' },
      { soru: 'Hangisi çok renkli baskıya daha uygundur?', cevap: 'Bambu Lab P1S doğrudan AMS ünitesi ile 4 renge kadar (çoklu AMS ile 16 renge kadar) kolay kurulum sunar.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*p1s/i);
      const b = urunBul(u, /creality\s*k1c|\bk1c\b/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `P1S: ${formatTL(a.enUcuzFiyat)} · K1C: ${formatTL(b.enUcuzFiyat)}`;
      return 'CoreXY kapalı kasa canlı fiyat kıyaslaması';
    },
  },
  {
    yol: '/karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro',
    ikon: '⚡',
    kisaBaslik: 'Ender 3 V3 KE vs Neptune 4 Pro',
    h1: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
    title: 'Ender 3 V3 KE vs Elegoo Neptune 4 Pro Karşılaştırması + Canlı Fiyat | Baskı Hesap',
    description: 'Creality Ender 3 V3 KE ve Elegoo Neptune 4 Pro teknik karşılaştırması, Klipper hızı, soğutma farkı ve 60+ mağazada kargo dahil canlı fiyatlar.',
    ozet: 'Orta-giriş fiyat segmentinde yüksek hızlı Klipper tabanlı iki popüler yazıcının teknik detaylarını ve Türkiye mağazalarındaki kargo dahil güncel fiyat farkını tek sayfada görün.',
    solAd: 'Creality Ender 3 V3 KE',
    sagAd: 'Elegoo Neptune 4 Pro',
    solRegex: /ender\s*3\s*v3\s*ke/i,
    sagRegex: /neptune\s*4\s*pro/i,
    ozellikler: [
      ['Baskı Hacmi', '220 × 220 × 240 mm', '225 × 225 × 265 mm'],
      ['Maksimum Hız', '500 mm/s (Klipper / Creality OS)', '500 mm/s (Klipper)'],
      ['X Ekseni Rayı', 'Lineer ray (lineer kızak)', 'Tam metal lineer kılavuz (X ve Y)'],
      ['Parça Soğutma', 'Çift taraflı model fanı', 'Arka ek 4-fanlı yüksek hız soğutma barı'],
      ['Tabla / Nozul Sıcaklığı', '100°C tabla / 300°C Sprite Direct Drive', '110°C çift bölgeli tabla / 300°C Direct Drive'],
      ['Otomatik Kalibrasyon', 'CR Touch + gerinim sensörü ile tam otomatik Z-offset', '121 nokta otomatik seviyeleme (manuel ilk Z ayarı)'],
    ],
    solKimler: 'Tam otomatik Z-offset ve dokunmatik Creality OS arayüzü sayesinde uğraşmadan hızlı başlangıç yapmak isteyenler için çok pratiktir.',
    sagKimler: 'Yüksek hızlı PLA köprülemelerinde ekstra arka fan soğutması, 265 mm Z yüksekliği ve çift bölgeli ısıtmalı tabla isteyen kullanıcılar için güçlü bir seçenektir.',
    sss: [
      { soru: 'Ender 3 V3 KE ile Neptune 4 Pro arasında kurulum kolaylığı farkı var mı?', cevap: 'Ender 3 V3 KE otomatik Z-offset sensörü ile ilk katman ayarını neredeyse tamamen otomatik yapar; Neptune 4 Pro ise klasik kağıt/kalibrasyon adımı sonrası 121 nokta mesh alır.' },
      { soru: 'İki modelde de PLA dışında PETG veya TPU basılabilir mi?', cevap: 'Evet, her iki model de 300°C Direct Drive ekstrüdere sahip olduğu için PLA, PETG ve TPU filamentleri rahatlıkla basabilir.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /ender\s*3\s*v3\s*ke/i);
      const b = urunBul(u, /neptune\s*4\s*pro/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `Ender 3 V3 KE: ${formatTL(a.enUcuzFiyat)} · N4 Pro: ${formatTL(b.enUcuzFiyat)}`;
      return '500 mm/s Klipper giriş-orta segment karşılaştırması';
    },
  },
  {
    yol: '/karsilastir/bambu-lab-a1-mini-vs-creality-ender-3-v3-ke',
    ikon: '🚀',
    kisaBaslik: 'Bambu Lab A1 Mini vs Ender 3 V3 KE',
    h1: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
    title: 'Bambu Lab A1 Mini vs Ender 3 V3 KE — Başlangıç İçin Hangisi? | Baskı Hesap',
    description: 'Bambu Lab A1 Mini (180mm, AMS Lite) ve Creality Ender 3 V3 KE (220mm, Klipper) teknik farkları ve bugünkü kargo dahil Türkiye fiyatları.',
    ozet: 'İlk 3D yazıcısını alacakların en çok sorduğu iki modeli baskı alanı, çok renkli baskı (AMS Lite), ses seviyesi ve bugünkü Türkiye fiyatlarıyla kıyasladık.',
    solAd: 'Bambu Lab A1 Mini',
    sagAd: 'Creality Ender 3 V3 KE',
    solRegex: /bambu\s*lab\s*a1\s*mini/i,
    sagRegex: /ender\s*3\s*v3\s*ke/i,
    ozellikler: [
      ['Baskı Hacmi', '180 × 180 × 180 mm', '220 × 220 × 240 mm (%85+ daha fazla hacim)'],
      ['Mekanik Yapı', 'Kantilever + lineer raylar', 'Çift Z + lineer X raylı köprü gövde'],
      ['Çoklu Renk Desteği', 'AMS Lite ile 4 renge kadar tak-çalıştır', 'Tek renk (harici mod olmadan tek makara)'],
      ['Hız & Kalibrasyon', 'Tam otomatik titreşim/akış + sessiz motor', '500 mm/s Klipper + CR Touch otomatik Z-offset'],
      ['Nozul Değişimi', 'Tek klipsli hızlı nozul değişimi', 'Unicorn / vida tipi değişim'],
      ['Fiyat / Başlangıç Konforu', 'Tak-çalıştır ekosistem, sıfır ayar gereksinimi', 'Genelde daha düşük maliyet + geniş tabla'],
    ],
    solKimler: '180 mm baskı hacmi yeten, çok sessiz çalışma, tek tıkla çok renkli (AMS Lite) yükseltme ve minimum bakım isteyen kullanıcılar için idealdir.',
    sagKimler: 'Kask, büyük kutu veya geniş parça basacağı için 220×220×240 mm hacme ihtiyaç duyan ve bütçeyi daha aşağıda tutmak isteyenler için güçlüdür.',
    sss: [
      { soru: '180 mm baskı hacmi küçük kalır mı?', cevap: 'Figür, hobi ve günlük düzenleyicilerin çoğu 180 mm içine sığar; ancak büyük kutular veya kask parçaları için Ender 3 V3 KE’nin 220 mm tablası ciddi avantaj sağlar.' },
      { soru: 'Hangisi daha sessiz çalışır?', cevap: 'Bambu Lab A1 Mini aktif motor gürültüsü iptali sayesinde masa başında çok daha sessiz baskı alır.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*a1\s*mini/i);
      const b = urunBul(u, /ender\s*3\s*v3\s*ke/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `A1 Mini: ${formatTL(a.enUcuzFiyat)} · V3 KE: ${formatTL(b.enUcuzFiyat)}`;
      return 'Başlangıç segmenti: AMS Lite konforu vs 220mm hacim';
    },
  },
  {
    yol: '/karsilastir/creality-k1-max-vs-bambu-lab-p1s',
    ikon: '🏗️',
    kisaBaslik: 'Creality K1 Max vs Bambu Lab P1S',
    h1: 'Creality K1 Max vs Bambu Lab P1S Karşılaştırması',
    title: 'Creality K1 Max vs Bambu Lab P1S + Canlı Türkiye Fiyatları | Baskı Hesap',
    description: '300mm hacimli Creality K1 Max ile 256mm Bambu Lab P1S CoreXY yazıcıların teknik farkları ve kargo dahil en ucuz mağaza fiyatları.',
    ozet: 'Üst segment CoreXY alırken "300×300 mm dev baskı alanı mı (K1 Max), yoksa AMS çok renkli baskı ve Bambu ekosistemi mi (P1S)?" sorusunu canlı fiyatlarla yanıtlıyoruz.',
    solAd: 'Creality K1 Max',
    sagAd: 'Bambu Lab P1S',
    solRegex: /creality\s*k1\s*max|\bk1\s*max\b/i,
    sagRegex: /bambu\s*lab\s*p1s/i,
    ozellikler: [
      ['Baskı Hacmi', '300 × 300 × 300 mm', '256 × 256 × 256 mm'],
      ['Kasa & Mimari', 'CoreXY kapalı kasa + LiDAR ilk katman', 'CoreXY kapalı kasa'],
      ['Maksimum Hız', '600 mm/s (Klipper / Creality OS)', '500 mm/s'],
      ['Çoklu Renk', 'Tek makara odaklı', 'AMS ile 4–16 renk destekli'],
      ['Yapay Zeka Kamera / LiDAR', 'Dahili AI kamera + LiDAR tarayıcı', 'Dahili izleme kamerası (LiDAR yok)'],
      ['Kullanım Odağı', 'Büyük tek parça endüstriyel/prototip baskılar', 'Çok renkli baskı + yüksek baskı tutarlılığı'],
    ],
    solKimler: 'Tek seferde 30 cm’ye varan büyük gövde, kask veya mimari maket basması gerekenler için fiyatıyla çok güçlüdür.',
    sagKimler: '256 mm tabla yeterli olan, çok renkli/çok malzemeli baskı (AMS) ve sıfıra yakın kalibrasyon zahmeti arayanlar için öne çıkar.',
    sss: [
      { soru: 'Creality K1 Max’ın en büyük artısı nedir?', cevap: '300×300×300 mm baskı hacmi sayesinde 256 mm sınıfı yazıcılarda ikiye bölmek zorunda kalacağınız parçaları tek seferde basabilirsiniz.' },
      { soru: 'P1S ile K1 Max aynı dayanıklılıkta filamentler basabilir mi?', cevap: 'Evet, ikisi de kapalı kasalı CoreXY olduğu için ABS, ASA, PETG ve doğru nozul/tabla ile teknik filamentleri basabilir.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /creality\s*k1\s*max|\bk1\s*max\b/i);
      const b = urunBul(u, /bambu\s*lab\s*p1s/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `K1 Max: ${formatTL(a.enUcuzFiyat)} · P1S: ${formatTL(b.enUcuzFiyat)}`;
      return '300mm dev hacim vs Bambu AMS CoreXY kıyaslaması';
    },
  },
  {
    yol: '/karsilastir/bambu-lab-a1-vs-bambu-lab-a1-mini',
    ikon: '⚖️',
    kisaBaslik: 'Bambu Lab A1 vs A1 Mini',
    h1: 'Bambu Lab A1 vs Bambu Lab A1 Mini Karşılaştırması',
    title: 'Bambu Lab A1 mi A1 Mini mi? Farklar + Canlı Türkiye Fiyatları | Baskı Hesap',
    description: 'Bambu Lab A1 (256mm) ile Bambu Lab A1 Mini (180mm) arasındaki baskı hacmi, gövde yapısı, AMS Lite ve kargo dahil canlı Türkiye fiyat farkları.',
    ozet: '"A1 mi almalıyım, A1 Mini yeter mi?" sorusunu 256 mm vs 180 mm baskı alanı, gürültü/yer ihtiyacı, AMS Lite uyumu ve bugünkü Türkiye mağaza fiyatlarıyla yanıtlıyoruz.',
    solAd: 'Bambu Lab A1',
    sagAd: 'Bambu Lab A1 Mini',
    solRegex: /bambu\s*lab\s*a1(?!\s*mini)/i,
    sagRegex: /bambu\s*lab\s*a1\s*mini/i,
    ozellikler: [
      ['Baskı Hacmi', '256 × 256 × 256 mm', '180 × 180 × 180 mm'],
      ['Gövde Mimarisi', 'Tam köprü (çift sütunlu bedslinger)', 'Tek kollu kompakt kantilever'],
      ['Çok Renkli Baskı', 'AMS Lite (4 renge kadar)', 'AMS Lite (4 renge kadar)'],
      ['Tabla Sıcaklığı', '100°C (PETG / büyük parçalarda daha stabil)', '80°C (PLA / PETG / TPU için yeterli)'],
      ['Hız & Nozul', '500 mm/s · hızlı klipsli nozul değişimi', '500 mm/s · aynı hızlı klipsli nozul'],
      ['Masa İhtiyacı', 'Geniş çalışma yüzeyi gerektirir', 'Çok kompakt, masaüstü dostu'],
    ],
    solKimler: 'Kask, büyük kutu, birden fazla parçayı tek tablada basma veya 256×256 mm standart MakerWorld profillerini ölçeklemeden direkt basmak isteyenler için idealdir.',
    sagKimler: 'Daha düşük bütçeyle aynı Bambu Lab baskı kalitesini ve otomatik akış kalibrasyonunu isteyen, masasında az yeri olan ve çoğunlukla 18 cm altı modeller basan kullanıcılar için öne çıkar.',
    sss: [
      { soru: 'Bambu Lab A1 ve A1 Mini baskı kalitesi aynı mı?', cevap: 'Evet, her iki model de aynı hızlı değişimli hotend sistemini, aktif motor gürültü iptalini ve otomatik akış dinamikleri kalibrasyonunu kullandığı için küçük-orta parçalarda baskı kalitesi neredeyse aynıdır.' },
      { soru: 'Hangisi daha mantıklı: A1 mi A1 Mini mi?', cevap: 'Bütçeniz elveriyorsa ve 256 mm standart MakerWorld modellerini bölmeden basmak istiyorsanız Bambu Lab A1 daha uzun ömürlüdür; masa alanı ve bütçe öncelikliyse A1 Mini fiyat/performans şampiyonudur.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*a1(?!\s*mini)/i);
      const b = urunBul(u, /bambu\s*lab\s*a1\s*mini/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `A1: ${formatTL(a.enUcuzFiyat)} · A1 Mini: ${formatTL(b.enUcuzFiyat)}`;
      return '256 mm standart hacim vs 180 mm kompakt kıyaslaması';
    },
  },
  {
    yol: '/karsilastir/bambu-lab-a1-vs-creality-k1c',
    ikon: '🔥',
    kisaBaslik: 'Bambu Lab A1 vs Creality K1C',
    h1: 'Bambu Lab A1 vs Creality K1C Karşılaştırması',
    title: 'Bambu Lab A1 vs Creality K1C — Açık Çok Renk vs Kapalı Kasa | Baskı Hesap',
    description: 'Bambu Lab A1 ve Creality K1C teknik karşılaştırması: açık kasa AMS Lite çok renkli baskı vs kapalı kasa CoreXY karbon fiber ve canlı Türkiye fiyatları.',
    ozet: 'Bütçesi yakın bu iki popüler yazıcıda "Bambu ekosistemi + 256 mm alan + AMS Lite şansı (A1)" mı, yoksa "kapalı kasa CoreXY + ABS/ASA/CF uyumu (K1C)" mi daha doğru tercih?',
    solAd: 'Bambu Lab A1',
    sagAd: 'Creality K1C',
    solRegex: /bambu\s*lab\s*a1(?!\s*mini)/i,
    sagRegex: /creality\s*k1c|\bk1c\b/i,
    ozellikler: [
      ['Mimari & Kasa', 'Açık kasa bedslinger', 'CoreXY tam kapalı kasa'],
      ['Baskı Hacmi', '256 × 256 × 256 mm', '220 × 220 × 250 mm'],
      ['Malzeme Uyumu', 'PLA, PETG, TPU (ABS/ASA için kapalı ortam önerilmez)', 'PLA, PETG, TPU + ABS, ASA, PA-CF (karbon fiber)'],
      ['Çoklu Renk', 'AMS Lite ile sonradan 4 renge yükseltilebilir', 'Tek makara odaklı (CFS kiti ayrı)'],
      ['Ses Seviyesi', 'Aktif motor gürültü azaltma ile çok sessiz', 'Kapalı kasa egzoz/kasa fanları nedeniyle daha sesli'],
      ['Nozul Değişimi', 'Aletsiz tek klipsli hızlı değişim', 'Unicorn tek parça nozul'],
    ],
    solKimler: 'Evde/ofiste ağırlıklı PLA, PETG ve TPU basacak, sessiz çalışma, 256 mm geniş tabla ve ileride AMS Lite ile renkli baskı almak isteyenler için en pratik seçenektir.',
    sagKimler: 'Mühendislik parçaları (ABS, ASA, Naylon, Karbon Fiber) basacağı için kapalı kabin ve dahili karbon filtre isteyenler için CoreXY avantajı sunar.',
    sss: [
      { soru: 'Evde PLA baskı için Bambu Lab A1 mi Creality K1C mi alınmalı?', cevap: 'Yalnızca PLA/PETG/TPU basacaksanız Bambu Lab A1 hem daha sessizdir hem daha geniş 256×256 mm tabla sunar; ABS/ASA gibi mühendislik malzemeleri basacaksanız kapalı kasalı Creality K1C şarttır.' },
      { soru: 'Hangisinin yedek parça ve nozul maliyeti daha pratik?', cevap: 'Bambu Lab A1 tek klipsle saniyeler içinde nozul değiştirmenize izin verir; K1C ise uzun ömürlü tek parça Unicorn nozul kullanır.' },
    ],
    canliOzet: (u) => {
      const a = urunBul(u, /bambu\s*lab\s*a1(?!\s*mini)/i);
      const b = urunBul(u, /creality\s*k1c|\bk1c\b/i);
      if (a?.enUcuzFiyat > 0 && b?.enUcuzFiyat > 0) return `A1: ${formatTL(a.enUcuzFiyat)} · K1C: ${formatTL(b.enUcuzFiyat)}`;
      return 'Açık kasa 256mm + AMS Lite vs Kapalı CoreXY CF';
    },
  },
];

function madalya(idx) {
  if (idx === 0) return '🥇 #1';
  if (idx === 1) return '🥈 #2';
  if (idx === 2) return '🥉 #3';
  return `#${idx + 1}`;
}

/** PLA ve PETG/TPU gibi canlı sıralama listeleri için ortak şablon. */
function canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
  yol, breadcrumbAd, rozet, h1Html, title, description, altMetin, bosMesaj, filtreFn, sssListesi,
}) {
  const canonicalUrl = `${tabanUrl}${yol}`;
  const urunler = tumUrunler
    .filter(u => filtreFn(u) && u.enUcuzFiyat > 0)
    .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat);

  const satirlar = urunler.map((u, idx) => `
    <tr>
      <td><span class="sira-madalya">${madalya(idx)}</span></td>
      <td><a href="${htmlKacis(u.yol)}" style="color:var(--ana);font-weight:700;text-decoration:none">${htmlKacis(u.ad)}</a></td>
      <td>${htmlKacis(u.enUcuzSite || '—')}</td>
      <td>${u.stokluSayisi || 1} mağaza</td>
      <td><b style="color:var(--yesil)">${formatTL(u.enUcuzFiyat)}</b></td>
      <td>${u.enUcuzUrl ? `<a class="seo-cta ikincil" style="padding:5px 10px;font-size:12px" href="${htmlKacis(u.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">Mağaza ↗</a>` : `<a href="${htmlKacis(u.yol)}">İncele</a>`}</td>
    </tr>`).join('');

  const sss = sssBolumu(sssListesi);
  const enUcuz = urunler[0];
  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
        { '@type': 'ListItem', position: 3, name: breadcrumbAd, item: canonicalUrl },
      ],
    },
    ...(urunler.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: urunler.slice(0, 20).map((u, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${tabanUrl}${u.yol}`,
        name: u.ad,
      })),
    }] : []),
    ...(sss.jsonLd ? [sss.jsonLd] : []),
  ];

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    jsonLdList,
    aktifNav: 'rehber',
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>${htmlKacis(breadcrumbAd)}</span></nav>
      ${heroAlani({
        rozet,
        baslikHtml: h1Html,
        altMetin,
        istatistikler: [
          enUcuz ? `🥇 Lider: <b>${htmlKacis(enUcuz.ad)} · ${formatTL(enUcuz.enUcuzFiyat)}</b>` : '🔍 Canlı sıralama',
          `📦 <b>${urunler.length}</b> stoklu model`,
          '🚚 Kargo dahil kıyas',
        ],
      })}
      <section class="seo-kart">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <h2 style="margin:0">Güncel Kargo Dahil Fiyat Sıralaması</h2>
          <a class="seo-cta" style="padding:9px 15px;font-size:13px" href="/sepet.html">🧺 Çoklu Alımda Kargoyu Sıfırla</a>
        </div>
        ${urunler.length
          ? `<div style="overflow-x:auto"><table class="seo-tablo"><thead><tr><th>Sıra</th><th>Ürün</th><th>En Ucuz Mağaza</th><th>Teklif</th><th>Toplam</th><th>Link</th></tr></thead><tbody>${satirlar}</tbody></table></div>`
          : `<p>${htmlKacis(bosMesaj)}</p>`}
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function baslangicYaziciRehberiHtml(tumUrunler, tabanUrl) {
  return canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
    yol: '/rehber/baslangic-icin-en-iyi-3d-yazicilar',
    breadcrumbAd: 'Başlangıç İçin En İyi 3D Yazıcılar',
    rozet: '🖨️ Canlı Bütçe & Fiyat Sıralaması · 2026',
    h1Html: 'Başlangıç için <b>en iyi 3D yazıcılar</b> (canlı Türkiye fiyatları)',
    title: 'Başlangıç İçin En İyi 3D Yazıcılar 2026 — Bütçeye Göre Canlı Fiyatlar | Baskı Hesap',
    description: 'İlk 3D yazıcısını alacaklar için Bambu Lab A1 Mini, Ender 3 V3 SE/KE, Elegoo Neptune 4 ve kapalı kasa modellerin kargo dahil güncel Türkiye fiyat sıralaması.',
    altMetin: 'Türkiye’deki 60+ mağazadan otomatik taranan stoklu 3D yazıcılar (yedek parçalar ve combo paketler hariç) kargo dahil en düşük bütçeden başlayarak sıralanır.',
    bosMesaj: 'Henüz taraması tamamlanan stoklu 3D yazıcı kaydı yok; ana sayfadan model aratarak canlı fiyat çekebilirsiniz.',
    filtreFn: (u) => (u.kategori === 'yazici' || u.kategoriSlug === '3d-yazici')
      && !parcaMi(u.ad)
      && u.enUcuzFiyat >= 4500
      && !/\bcombo\b/i.test(u.ad),
    sssListesi: [
      { soru: 'İlk kez 3D yazıcı alırken kaç TL bütçe ayırmak gerekir?', cevap: 'Giriş seviyesinde otomatik kalibrasyonlu, hızlı bir FDM 3D yazıcı için bütçe genellikle 10.000–16.000 TL bandından başlar; kapalı kasa CoreXY modeller ise 20.000 TL üzerinde yer alır.' },
      { soru: 'Başlangıçta açık kasa mı kapalı kasa mı tercih edilmeli?', cevap: 'Evde hobi ve figür/aparat için PLA, PETG ve TPU basacaksanız açık kasalı Bambu Lab A1 Mini, A1 veya Ender 3 V3 KE çok pratik ve sessizdir. ABS veya ASA gibi sıcak oda isteyen teknik malzemeler için kapalı kasa (K1C, P1S) gerekir.' },
      { soru: 'Bu listede neden yedek parça veya Combo paketler karışmıyor?', cevap: 'Sıralama yalnızca tekil gövde yazıcı ilanlarını kapsar; nozzle/tabla gibi aksesuarlar ve çoklu AMS Combo paketler fiyat kıyasını bozmaması için elenir.' },
    ],
  });
}

function enUcuzPlaRehberiHtml(tumUrunler, tabanUrl) {
  return canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
    yol: '/rehber/en-ucuz-pla-filament',
    breadcrumbAd: 'En Ucuz PLA Filamentler',
    rozet: '🏷️ Canlı ₺/kg PLA Sıralaması',
    h1Html: 'Türkiye\'nin <b>en ucuz PLA</b> filamentleri',
    title: 'Kilogramı En Ucuz PLA Filamentler — Canlı Türkiye Sıralaması | Baskı Hesap',
    description: 'Sunlu, Porima, Creality Ender PLA, eSun ve diğer 1.75mm PLA filamentlerin kargo dahil en ucuz güncel fiyat sıralaması.',
    altMetin: '60+ mağazadan çekilen kargo dahil stoklu 1.75mm PLA ve PLA+ filament teklifleri en düşük fiyattan başlayarak otomatik sıralanır.',
    bosMesaj: 'Henüz taraması tamamlanan PLA kaydı yok; ana sayfadan doğrudan aratarak canlı fiyat çekebilirsiniz.',
    filtreFn: (u) => u.kategoriSlug === 'pla-filament',
    sssListesi: [
      { soru: 'Bu listedeki PLA fiyatlarına kargo dahil mi?', cevap: 'Evet. Kargo ücreti bilinen tüm mağazalarda kargo bedeli toplama eklenerek sıralama yapılır; sepette kargo hesaplayan mağazalar ise ürün sayfasında açıkça işaretlenir.' },
      { soru: 'Çoklu PLA alırken kargodan nasıl tasarruf edilir?', cevap: 'Akıllı Sepet aracında istediğiniz filamentleri girerseniz, sistem mağazaların ücretsiz kargo eşiklerini hesaplayıp tek mağaza mı yoksa bölünmüş sepet mi daha ucuz olduğunu çıkarır.' },
    ],
  });
}

function enUcuzPetgTpuRehberiHtml(tumUrunler, tabanUrl) {
  return canliSiralamaRehberiHtml(tumUrunler, tabanUrl, {
    yol: '/rehber/en-ucuz-petg-ve-tpu-filamentler',
    breadcrumbAd: 'En Ucuz PETG & TPU Filamentler',
    rozet: '🦾 Canlı PETG, TPU & ABS Sıralaması',
    h1Html: 'En ucuz <b>PETG &amp; TPU</b> teknik filamentler',
    title: 'En Ucuz PETG, TPU & ABS Filamentler — Canlı Türkiye Sıralaması | Baskı Hesap',
    description: 'Porima, eSun, Microzey, Creality PETG ve esnek TPU filamentlerin Türkiye mağazalarındaki kargo dahil en ucuz güncel fiyatları.',
    altMetin: 'Dış mekan, sıcaklığa dayanıklı mekanik parça ve esnek baskılar için PETG / TPU filamentlerde 60+ mağazadaki kargo dahil en düşük teklifler.',
    bosMesaj: 'Henüz taraması tamamlanan PETG/TPU kaydı yok; ana sayfadan aratarak anlık kontrol edebilirsiniz.',
    filtreFn: (u) => u.kategoriSlug === 'petg-tpu-filament',
    sssListesi: [
      { soru: 'PETG ile esnek TPU arasında baskı hızı farkı var mı?', cevap: 'PETG standart 60–150 mm/s hızlarda rahat basılırken, 95A–98A TPU filamentler ekstrüderde bükülme olmaması için daha düşük hızlarda (20–45 mm/s) basılmalıdır.' },
      { soru: 'PETG ve TPU filamentler nem çeker mi?', cevap: 'Evet, hem PETG hem TPU higroskopiktir; uzun süre açıkta kaldığında çıtırtı ve yüzey bozulması yapmaması için filament kurutucu veya nem alıcılı saklama önerilir.' },
    ],
  });
}

function filamentKurutucuRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/filament-kurutucu-gerekli-mi`;
  const kurutucular = tumUrunler
    .filter(u => /kurutucu|dryer|ebox|spacepi|filadryer/i.test(`${u.ad} ${u.sorgu}`))
    .sort((a, b) => (a.enUcuzFiyat || 9e9) - (b.enUcuzFiyat || 9e9));
  const enUcuz = kurutucular.find(k => k.enUcuzFiyat > 0);

  const kartlar = kurutucular.map(u => `<a class="seo-urun-kart" href="${htmlKacis(u.yol)}">
    <div class="seo-urun-ust">
      ${u.gorsel ? `<img class="seo-urun-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad)}" loading="lazy" />` : '<span class="seo-urun-ikon">🌡️</span>'}
      <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
    </div>
    <div class="seo-urun-etiketler">
      <span class="seo-urun-etiket">🏪 ${htmlKacis(u.enUcuzSite || 'Katalog')}</span>
      ${u.stokluSayisi > 1 ? `<span class="seo-urun-etiket">${u.stokluSayisi} mağaza</span>` : ''}
    </div>
    <div class="seo-urun-alt">
      <span class="seo-mini-fiyat">${u.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara'}</span>
      <span class="seo-urun-ok">Teklifleri Gör →</span>
    </div>
  </a>`).join('');

  const sss = sssBolumu([
    { soru: 'Hangi filamentlerde kurutucu kesin gereklidir?', cevap: 'Naylon (PA), TPU, PETG ve PVA çok hızlı nem çeker. Kuru PLA bile birkaç ay açıkta beklediğinde kolay kırılmaya ve ipliklenmeye başlar.' },
    { soru: 'Yazıcının ısıtmalı tablasıyla kurutma yapılabilir mi?', cevap: 'Acil durumda karton kutu + ısıtmalı tabla geçici çözüm sunar; ancak sıcaklık dağılımı ve enerji verimliliği açısından aktif fanlı bir kurutucu çok daha güvenlidir.' },
  ]);

  return sayfaIskeleti({
    title: 'Filament Kurutucu Gerekli mi? Hangi Sıcaklıkta Kurutulur + Canlı Fiyatlar | Baskı Hesap',
    description: 'PLA, PETG, TPU ve ABS kurutma sıcaklıkları/süreleri ve Türkiye mağazalarındaki eSun eBOX, Sunlu SP2, Creality SpacePi X4 canlı fiyatları.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: 'Filament Kurutucu Rehberi', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>Filament Kurutucu</span></nav>
      ${heroAlani({
        rozet: '🌡️ Baskı Kalitesi & Saklama Rehberi',
        baslikHtml: 'Filament kurutucu <b>gerçekten gerekli mi?</b>',
        altMetin: 'İpliklenme (stringing), nozul çıtırtısı ve kırılgan katmanların çoğu nemli filamentten kaynaklanır. Kurutma sıcaklıkları ve güncel cihaz fiyatları burada.',
        istatistikler: [
          enUcuz ? `🔥 En ucuz cihaz: <b>${formatTL(enUcuz.enUcuzFiyat)}</b>` : '🌡️ 45–70°C kurutma rehberi',
          `📦 <b>${kurutucular.length}</b> canlı model`,
          '💧 %15 altı bağıl nem hedefi',
        ],
      })}
      <section class="seo-kart">
        <h2 style="margin-top:0">Canlı Türkiye Filament Kurutucu Fiyatları</h2>
        <div class="seo-izgara">${kartlar || '<p>Kurutucu modelleri için Reçine &amp; Sarf kategorisini inceleyebilirsiniz.</p>'}</div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Filamentlere Göre Kurutma Sıcaklığı ve Süresi</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Malzeme</th><th>Sıcaklık</th><th>Önerilen Süre</th><th>Nem Hassasiyeti</th></tr></thead>
            <tbody>
              <tr><td><b>PLA / PLA+</b></td><td>45 – 50 °C</td><td>4 – 6 saat</td><td>Orta (kırılganlaşma yapar)</td></tr>
              <tr><td><b>PETG</b></td><td>60 – 65 °C</td><td>4 – 6 saat</td><td>Yüksek (pürüz &amp; ipliklenme yapar)</td></tr>
              <tr><td><b>TPU (Esnek)</b></td><td>50 – 55 °C</td><td>4 – 6 saat</td><td>Çok Yüksek (kabarcık/çıtırtı)</td></tr>
              <tr><td><b>ABS / ASA</b></td><td>65 – 75 °C</td><td>4 – 6 saat</td><td>Orta-Yüksek</td></tr>
              <tr><td><b>PA / Naylon</b></td><td>70 – 80 °C</td><td>8 – 12 saat</td><td>Aşırı Yüksek (kurutucusuz basılmaz)</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function plaVsPetgRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/pla-vs-petg-filament`;
  const plaTop = tumUrunler.filter(u => u.kategoriSlug === 'pla-filament' && u.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat).slice(0, 4);
  const petgTop = tumUrunler.filter(u => u.kategoriSlug === 'petg-tpu-filament' && /petg/i.test(u.ad) && u.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat).slice(0, 4);

  const kartListe = (liste, bosMetin) => liste.length
    ? `<div class="seo-izgara">${liste.map(u => `<a class="seo-mini-kart" href="${htmlKacis(u.yol)}">
        <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
        <div class="seo-mini-fiyat">${formatTL(u.enUcuzFiyat)}</div>
        <div class="seo-mini-alt">${htmlKacis(u.enUcuzSite || '')} · Kargo dahil</div>
      </a>`).join('')}</div>`
    : `<p>${htmlKacis(bosMetin)}</p>`;

  const sss = sssBolumu([
    { soru: 'Araba içi veya güneş gören parçalarda PLA kullanılır mı?', cevap: 'Hayır, PLA yaklaşık 55°C civarında yumuşamaya başlar. Güneş gören ya da araç içi parçalarda en az PETG veya ABS/ASA tercih edilmelidir.' },
    { soru: 'PETG basarken neden daha dikkatli tabla ayarı gerekir?', cevap: 'PETG cam tablaya aşırı yapışıp yüzeyi koparabilir; PEI dokulu tabla veya yapıştırıcı/ayırıcı ince bir tabaka kullanmak güvenlidir.' },
  ]);

  return sayfaIskeleti({
    title: 'PLA vs PETG Filament Farkları, Sıcaklık Ayarları ve Canlı Fiyatlar | Baskı Hesap',
    description: 'PLA ve PETG filament arasındaki dayanıklılık, sıcaklık, esneklik, kullanım alanı farkları ve Türkiye mağazalarındaki en ucuz canlı fiyatlar.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: 'PLA vs PETG Filament', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>PLA vs PETG</span></nav>
      ${heroAlani({
        rozet: '🧵 Malzeme Seçim Rehberi',
        baslikHtml: 'PLA <b>vs</b> PETG — Hangisini seçmeli?',
        altMetin: 'Baskı sıcaklıkları, ısı/UV dayanımı, esneklik farkları ve bugünkü kargo dahil en ucuz makara teklifleri.',
        istatistikler: [
          plaTop[0] ? `🧵 PLA: <b>${formatTL(plaTop[0].enUcuzFiyat)}</b>'den` : '🧵 PLA',
          petgTop[0] ? `🦾 PETG: <b>${formatTL(petgTop[0].enUcuzFiyat)}</b>'den` : '🦾 PETG',
          '🌡️ 55°C vs 75°C ısı eşiği',
        ],
      })}
      <section class="seo-kart">
        <h2 style="margin-top:0">Mekanik &amp; Baskı Ayarı Karşılaştırması</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Kriter</th><th>PLA / PLA+</th><th>PETG</th></tr></thead>
            <tbody>
              <tr><td><b>Nozul Sıcaklığı</b></td><td>195 – 220 °C</td><td>230 – 250 °C</td></tr>
              <tr><td><b>Tabla Sıcaklığı</b></td><td>55 – 65 °C</td><td>75 – 85 °C</td></tr>
              <tr><td><b>Isı Dayanımı (HDT)</b></td><td>~55 °C (güneşte eğilebilir)</td><td>~70–75 °C</td></tr>
              <tr><td><b>Dayanım &amp; Esneklik</b></td><td>Sert ama ani darbede kırılgan</td><td>Darbe dayanımı ve esneme daha yüksek</td></tr>
              <tr><td><b>Baskı Kolaylığı</b></td><td>Çok kolay, ipliklenme az</td><td>Orta (nem tutar, daha fazla ipliklenebilir)</td></tr>
              <tr><td><b>İdeal Kullanım</b></td><td>Figür, prototip, dekoratif parça, kalıp</td><td>Braket, dış mekan, mekanik tutucu, su teması</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Bugünkü En Ucuz PLA Teklifleri</h2>
        ${kartListe(plaTop, 'PLA fiyatlarını görmek için PLA kategorisine göz atabilirsiniz.')}
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Bugünkü En Ucuz PETG Teklifleri</h2>
        ${kartListe(petgTop, 'PETG tekliflerini görmek için PETG/TPU kategorisine geçebilirsiniz.')}
      </section>
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function baskiMaliyetiRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/3d-baski-maliyeti-nasil-hesaplanir`;
  const plaOrnek = tumUrunler
    .filter(u => u.kategoriSlug === 'pla-filament' && u.enUcuzFiyat > 0)
    .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];

  const ornekKg = plaOrnek ? Math.round(plaOrnek.enUcuzFiyat) : 600;
  const hamMadde = Math.round((100 / 1000) * ornekKg * 1.1);
  const elektrik = Math.round(8 * 0.15 * 2.9);
  const toplamMaliyet = hamMadde + elektrik;

  const sss = sssBolumu([
    { soru: '3D yazıcı saatte ne kadar elektrik yakar?', cevap: 'Standart bir FDM 3D yazıcı ısıtma sonrası baskı sırasında ortalama 120–180 Watt (0.15 kWh civarı) tüketir; günde 8 saatlik bir baskı mesken tarifesinde birkaç TL tutar.' },
    { soru: 'STL dosyasından otomatik fiyat çıkarabilir miyim?', cevap: 'Evet. Baskı Maliyet Hesaplayıcı sayfamıza doğrudan STL dosyanızı sürükleyip bırakarak hacim, gramaj, elektrik ve satış fiyatını saniyeler içinde hesaplayabilirsiniz.' },
  ]);

  return sayfaIskeleti({
    title: '3D Baskı Maliyeti Nasıl Hesaplanır? (Filament + Elektrik + Satış) | Baskı Hesap',
    description: '3D yazıcı baskı maliyeti formülü: filament gramajı, fire oranı, saatlik elektrik tüketimi, yıpranma payı ve ücretsiz STL maliyet hesaplayıcı.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: '3D Baskı Maliyeti Nasıl Hesaplanır? (2026 Formülü & Fotoğraftan Bas-Sat)',
        description: 'Filament gramajı, elektrik, makine amortismanı, fire payı ve Fotoğraftan Bas-Sat 3 adımlı fiyatlandırma rehberi.',
        inLanguage: 'tr',
        mainEntityOfPage: canonicalUrl,
        dateModified: new Date().toISOString().slice(0, 10),
        author: { '@type': 'Organization', name: 'Baskı Hesap' },
        publisher: { '@type': 'Organization', name: 'Baskı Hesap' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: '3D Baskı Maliyeti Hesaplama', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>3D Baskı Maliyeti</span></nav>
      ${heroAlani({
        rozet: '🧮 Fiyatlandırma & Maliyet Rehberi',
        baslikHtml: '3D baskı maliyeti <b>nasıl hesaplanır?</b>',
        altMetin: 'Satış veya teklif verirken yalnızca filament gramajına bakmak zarar ettirir. Doğru maliyet hesabı filament, fire, elektrik ve yıpranma payının toplamıdır.',
        istatistikler: [
          `⚖️ 100g örnek: <b>~${formatTL(toplamMaliyet)}</b>`,
          '⚡ Ortalama güç: ~150 W',
          '📐 STL ile saniyede hesapla',
        ],
      })}
      <section class="seo-kart">
        <div class="seo-fiyat-kutu">
          <div>💡 <b>Canlı Örnek (100 g / 8 saatlik parça):</b> ${plaOrnek ? `Bugünkü en ucuz PLA (${htmlKacis(plaOrnek.ad)} ≈ ${formatTL(ornekKg)}/kg)` : '600 TL/kg örnek PLA'} bazında %10 fireli ham madde (~${formatTL(hamMadde)}) + elektrik (~${formatTL(elektrik)}) ≈ <b style="color:var(--yesil)">${formatTL(toplamMaliyet)}</b> temel maliyet.</div>
        </div>
        <div class="seo-butonlar">
          <a class="seo-cta" href="/maliyet.html">🧮 STL Yükle &amp; Maliyeti Hesapla →</a>
          <a class="seo-cta ikincil" href="/rehber/en-ucuz-pla-filament">Güncel PLA Kg Fiyatları →</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">4 Adımda Baskı Maliyet Formülü</h2>
        <div class="formul-izgara">
          <div class="formul-kart">
            <b>1️⃣ Filament + Fire</b>
            <code>(gram / 1000) × ₺/kg × 1.10</code>
            <span class="seo-mini-alt">Destek (support), purge kulesi ve hatalı baskılar için %10–15 fire ekleyin.</span>
          </div>
          <div class="formul-kart">
            <b>2️⃣ Elektrik Tüketimi</b>
            <code>saat × 0.15 kW × tarife</code>
            <span class="seo-mini-alt">Yüksek tabla sıcaklığı (PETG/ABS) tüketimi hafif artırır.</span>
          </div>
          <div class="formul-kart">
            <b>3️⃣ Makine Yıpranması</b>
            <code>saat × (yazıcı / 2000)</code>
            <span class="seo-mini-alt">Nozul, PEI tabla, kayış ve fan ömrü her saat başına maliyete yazılır.</span>
          </div>
          <div class="formul-kart">
            <b>4️⃣ Emek &amp; Satış Fiyatı</b>
            <code>(temel + emek) × 2x–3x</code>
            <span class="seo-mini-alt">Destek temizleme, kutu/kargo ve varsa pazaryeri komisyonu eklenir.</span>
          </div>
        </div>
      </section>
      ${basSatAkisBolumuHtml('tr')}
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

function basSatAkisBolumuHtml(dil = 'tr') {
  const aiLink = aiModelPartnerLinkleri();
  const meshyRel = aiLink.meshyAfiliye ? 'noopener sponsored nofollow' : 'noopener';
  const hi3dRel = aiLink.hi3dAfiliye ? 'noopener sponsored nofollow' : 'noopener';
  const malYol = dil === 'tr' ? '/maliyet.html' : (GLOBAL_MALIYET_YOLLARI[dil] || '/en/cost-calculator');
  const sepYol = dil === 'tr' ? '/sepet.html' : (dil === 'fr' ? '/fr/panier' : `/${dil}/basket`);
  const anaYol = dil === 'tr' ? '/' : `/${dil}`;
  const mLink = `<a href="${htmlKacis(aiLink.meshyUrl)}" target="_blank" rel="${meshyRel}" data-afiliye-site="meshy">Meshy AI</a>${aiLink.meshyPromo ? ` <span class="stl-promo-rozet">🎁 ${htmlKacis(aiLink.meshyPromo)}</span>` : ''}`;
  const hLink = `<a href="${htmlKacis(aiLink.hi3dUrl)}" target="_blank" rel="${hi3dRel}" data-afiliye-site="hi3d">Hi3D</a>${aiLink.hi3dPromo ? ` <span class="stl-promo-rozet">🎁 ${htmlKacis(aiLink.hi3dPromo)}</span>` : ''}`;
  const k = {
    tr: {
      h2: '💼 Fotoğraftan Özel Ürün Bas-Sat Akışı (Atölye &amp; Ek Gelir Planı)',
      s1t: '1️⃣ Fotoğraf / Fikir → 3D Model',
      s1p: `Müşterinin gönderdiği evcil hayvan fotoğrafını, maskotu veya figür fikrini ${mLink} ya da ${hLink} ile baskıya hazır <code>.stl/.3mf</code> dosyasına çevirin.`,
      s2t: '2️⃣ Maliyet + Kâr &amp; Müşteri Teklifi',
      s2p: `Modeli <a href="${malYol}">Maliyet Hesaplayıcı</a> içine bırakın; gramaj, elektrik, yıpranma ve hedef kâr çarpanıyla satış fiyatını saniyede çıkarın.`,
      s3t: '3️⃣ En Ucuz Renk &amp; Makarayı Seçin',
      s3p: `Gereken renkteki en ucuz makarayı <a href="${anaYol}">canlı fiyat taramasından</a> bulun ya da çok renkli siparişlerde 3–4 rengi <a href="${sepYol}">Akıllı Sepet</a> ile birleştirin.`,
    },
    en: {
      h2: '💼 Photo-to-Print &amp; Sell Workflow (Print Farms &amp; Etsy Sellers)',
      s1t: '1️⃣ Turn Customer Photo / Idea into STL',
      s1p: `Convert a pet photo, mascot, or gift prompt into a printable <code>.stl/.3mf</code> via ${mLink} (single-color figures) or ${hLink} (no-split multi-color prints).`,
      s2t: '2️⃣ Calculate Print Cost &amp; Profit Margin',
      s2p: `Drop the file into the <a href="${malYol}">STL Cost Calculator</a> to compute filament grams, electricity, machine wear, and retail price.`,
      s3t: '3️⃣ Source the Cheapest Matching Spools',
      s3p: `Compare <a href="${anaYol}">live regional filament deals</a> or combine 3–4 spool colors inside <a href="${sepYol}">Smart Basket</a>.`,
    },
    fr: {
      h2: '💼 Flux Photo-à-Vente 3D (Ateliers &amp; Créateurs)',
      s1t: '1️⃣ Photo / Idée → Modèle STL imprimable',
      s1p: `Transformez une photo client en <code>.stl/.3mf</code> avec ${mLink} ou ${hLink} (multicouleur sans découpe).`,
      s2t: '2️⃣ Calculer coût réel &amp; marge de vente',
      s2p: `Déposez le fichier dans le <a href="${malYol}">Calculateur de Coût STL</a> pour obtenir filament, électricité, amortissement et tarif client.`,
      s3t: '3️⃣ Choisir les bobines au meilleur prix',
      s3p: `Trouvez <a href="${anaYol}">la bobine la moins chère en EUR</a> ou groupez 3–4 couleurs via <a href="${sepYol}">Panier Intelligent</a>.`,
    },
    ja: {
      h2: '💼 写真・アイデアから造形＆販売ワークフロー（工房・副業向け）',
      s1t: '1️⃣ 写真・案 → 造形用STL/3MFモデル',
      s1p: `顧客の写真やキャラクター案を ${mLink} または ${hLink} で印刷可能な <code>.stl/.3mf</code> に変換します。`,
      s2t: '2️⃣ 原価・利益率・販売価格を算出',
      s2p: `<a href="${malYol}">原価シミュレーター</a> にドロップしてフィラメント重量・電気代・償却費と適正売価を即時算出。`,
      s3t: '3️⃣ 必要な色の最安フィラメントを調達',
      s3p: `<a href="${anaYol}">リアルタイム価格検索</a> や <a href="${sepYol}">スマートカート</a> で必要色の最安スプールを調達します。`,
    },
  }[dil] || {};

  return `<section class="seo-kart" id="basSatAkisKart">
    <h2 style="margin-top:0">${k.h2}</h2>
    <div class="seo-izgara" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">
      <div class="seo-mini-kart">
        <div class="seo-mini-ad">${k.s1t}</div>
        <p style="margin:0;font-size:13.5px;color:var(--gri-metin);line-height:1.5">${k.s1p}</p>
      </div>
      <div class="seo-mini-kart">
        <div class="seo-mini-ad">${k.s2t}</div>
        <p style="margin:0;font-size:13.5px;color:var(--gri-metin);line-height:1.5">${k.s2p}</p>
      </div>
      <div class="seo-mini-kart">
        <div class="seo-mini-ad">${k.s3t}</div>
        <p style="margin:0;font-size:13.5px;color:var(--gri-metin);line-height:1.5">${k.s3p}</p>
      </div>
    </div>
  </section>`;
}

function enUcuzPlaBul(tumUrunler = [], plusMi = false) {
  const havuz = (Array.isArray(tumUrunler) ? tumUrunler : []).filter(u =>
    u && Number(u.enUcuzFiyat) > 0
    && (u.kategori === 'filament' || ['pla-filament', 'filament'].includes(u.kategoriSlug))
    && (plusMi ? /pla\+|pla\s+plus/i.test(u.ad || '') : !/pla\+|pla\s+plus/i.test(u.ad || '')));
  const stoklu = havuz.filter(u => (u.stokluSayisi ?? 1) > 0);
  const liste = stoklu.length ? stoklu : havuz;
  return [...liste].sort((a, b) => Number(a.enUcuzFiyat) - Number(b.enUcuzFiyat))[0] || null;
}

function meshyVsHi3dRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}${GLOBAL_AI_REHBER_YOLLARI.tr}`;
  const aiLink = aiModelPartnerLinkleri();
  const meshyRel = aiLink.meshyAfiliye ? 'noopener sponsored nofollow' : 'noopener';
  const hi3dRel = aiLink.hi3dAfiliye ? 'noopener sponsored nofollow' : 'noopener';

  const plaUrun = enUcuzPlaBul(tumUrunler, false) || enUcuzPlaBul(tumUrunler, true);
  const plaPlusUrun = enUcuzPlaBul(tumUrunler, true) || plaUrun;
  const plaKg = plaUrun ? Math.round(plaUrun.enUcuzFiyat) : 600;
  const plaPlusKg = plaPlusUrun ? Math.round(plaPlusUrun.enUcuzFiyat) : 680;
  const etiketKaynak = plaUrun ? `Bugünkü en ucuz stoklu PLA (${htmlKacis(plaUrun.ad)} ≈ ${formatTL(plaKg)}/kg)` : 'Örnek referans PLA (600 TL/kg)';

  // Yerel STL analizörümüzden ölçülen gerçek örnek modeller + çok renkli purge senaryosu
  const senaryolar = [
    {
      ad: 'Masaüstü Figür (örnek STL · 56×56×98 mm)',
      gram: 43.3,
      sureSa: 3.5,
      kgFiyat: plaKg,
      not: 'Tek renk baskı + %10 destek/fire · Meshy tarzı tek gövde figür boyutu',
    },
    {
      ad: 'Çok Renkli Rozet (örnek STL · 92×92×26 mm)',
      gram: 36.2,
      sureSa: 2.9,
      kgFiyat: plaPlusKg,
      ekPurge: 1.20,
      not: 'Model bölmeden çok renkli baskıda +%20 renk geçiş (purge) payı eklenir',
    },
    {
      ad: 'Orta Boy Çok Renkli Büst (120 g senaryo)',
      gram: 120,
      sureSa: 9.6,
      kgFiyat: plaPlusKg,
      ekPurge: 1.22,
      not: 'Çok renkli AMS/Combo baskılarda kule + temizleme atığı ~26 g ekler',
    },
  ].map((s) => {
    const carpan = s.ekPurge || 1.10;
    const etkinGram = s.gram * carpan;
    const hammadde = (etkinGram / 1000) * s.kgFiyat;
    const elektrik = s.sureSa * 0.15 * 2.9;
    const amortisman = s.sureSa * 3.0;
    const toplam = hammadde + elektrik + amortisman;
    return { ...s, etkinGram, hammadde, elektrik, toplam };
  });

  const sss = sssBolumu([
    {
      soru: 'Meshy ve Hi3D çıktıları doğrudan 3D yazıcıda basılabilir mi?',
      cevap: 'Evet, dışa aktarılan .stl veya .obj/.3mf dosyalarını Bambu Studio, OrcaSlicer veya Cura içine atabilirsiniz. İnce çıkıntıları (parmak, kılıç, kulak gibi) yazdırmadan önce dilimleyicide otomatik destek ve "Non-manifold / Fix model" kontrolü yapmanız önerilir.',
    },
    {
      soru: 'Çok renkli (Hi3D / AMS / Combo) baskı neden tek renk baskıdan daha maliyetlidir?',
      cevap: 'Modeli elle bölmeden çok renkli bastığınızda yazıcı her katmanda renk değiştirirken filament temizleme (purge / prime tower) yapar. Renk sayısına bağlı olarak net parça ağırlığının %15–%25 fazlası kadar filament tüketimi eklenir.',
    },
    {
      soru: 'Dosyam olmadan Baskı Hesap STL maliyet hesaplayıcıyı deneyebilir miyim?',
      cevap: 'Evet. Maliyet Hesaplayıcı sayfasındaki "Örnek STL ile 1 tıkta dene" butonlarıyla yerleşik Masaüstü Figür (43,3 g) ve Çok Renkli Rozet (36,2 g) modellerini tek tıkla tarayıcınızda ölçebilirsiniz.',
    },
  ]);

  return sayfaIskeleti({
    title: 'Meshy vs Hi3D: 3D Yazıcı Baskısı & Gerçek Maliyet Rehberi | Baskı Hesap',
    description: 'Meshy AI ve Hi3D ile text/image-to-3D model üretiminin 3D baskı farkları, çok renkli purge tüketimi ve canlı Türkiye PLA fiyatlarıyla gerçek maliyet hesabı.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    dilYolHaritasi: GLOBAL_AI_REHBER_YOLLARI,
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: 'Meshy vs Hi3D: 3D Yazıcı Baskısı & Gerçek Maliyet Rehberi',
        description: 'Meshy AI ve Hi3D ile text/image-to-3D model üretiminin 3D baskı farkları, çok renkli purge tüketimi ve canlı Türkiye PLA fiyatlarıyla gerçek maliyet hesabı.',
        inLanguage: 'tr',
        mainEntityOfPage: canonicalUrl,
        dateModified: new Date().toISOString().slice(0, 10),
        author: { '@type': 'Organization', name: 'Baskı Hesap' },
        publisher: { '@type': 'Organization', name: 'Baskı Hesap' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
          { '@type': 'ListItem', position: 3, name: 'Meshy vs Hi3D Baskı Maliyeti', item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>Meshy vs Hi3D</span></nav>
      ${heroAlani({
        rozet: '🤖 AI 3D Üretim & Gerçek Baskı Maliyeti',
        baslikHtml: 'Meshy vs Hi3D: <b>3D Baskıda Gerçek Gramaj &amp; Maliyet</b>',
        altMetin: 'Yapay zekâyla metinden veya fotoğraftan 3D model üretmek işin yarısı; gerçek fark dilimleyicideki gramaj, destek temizliği ve çok renkli filament tüketiminde ortaya çıkar.',
        istatistikler: [
          `🧵 Canlı baz PLA: <b>${formatTL(plaKg)}/kg</b>`,
          '🗿 Yerleşik örnekler: <b>43,3 g &amp; 36,2 g</b>',
          '🎨 Çok renkli purge payı: <b>+%15–25</b>',
        ],
      })}
      <section class="seo-kart">
        <div class="seo-fiyat-kutu">
          <div>💡 <b>Canlı Piyasa Referansı:</b> ${etiketKaynak}${plaPlusUrun && plaPlusUrun !== plaUrun ? ` · En ucuz PLA+: <b>${formatTL(plaPlusKg)}/kg</b> (${htmlKacis(plaPlusUrun.ad)})` : ''}. Kendi STL dosyan yoksa hesaplayıcıdaki 1 tık örneklerle hemen test edebilirsin.</div>
        </div>
        <div class="seo-butonlar">
          <a class="seo-cta" href="/maliyet.html">🧮 Örnek STL ile Maliyet Hesapla →</a>
          <a class="seo-cta ikincil" href="${htmlKacis(aiLink.meshyUrl)}" target="_blank" rel="${meshyRel}" data-afiliye-site="meshy">Meshy AI'ı İncele ↗${aiLink.meshyPromo ? ` · 🎁 ${htmlKacis(aiLink.meshyPromo)}` : ''}</a>
          <a class="seo-cta ikincil" href="${htmlKacis(aiLink.hi3dUrl)}" target="_blank" rel="${hi3dRel}" data-afiliye-site="hi3d">Hi3D'yi İncele ↗${aiLink.hi3dPromo ? ` · 🎁 ${htmlKacis(aiLink.hi3dPromo)}` : ''}</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Meshy vs Hi3D: Hangisi Hangi Baskıya Uygun?</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Kriter</th><th>Meshy AI</th><th>Hi3D</th></tr></thead>
            <tbody>
              <tr><td><b>Temel Odak</b></td><td>Text-to-3D, Image-to-3D, AI Texturing &amp; düzenlenebilir asset</td><td>Model bölmeden fiziksel ürünler için çok renkli baskı &amp; 8K doku</td></tr>
              <tr><td><b>En İyi Baskı Tipi</b></td><td>Tek renk figür, prototip, sonradan akrilikle boyanacak modeller</td><td>Bambu AMS, Creality K2/K3/Hi Combo gibi çok renkli yazıcılar</td></tr>
              <tr><td><b>Dilimleyici Hazırlığı</b></td><td>%10 destek/fire payıyla tek filamentten düşük maliyetli baskı</td><td>Çok renkli baskıda purge kulesi nedeniyle +%15–25 ek filament</td></tr>
              <tr><td><b>Atölye / Satış Avantajı</b></td><td>Müşteri fotoğrafından hızlı konsept ve seri baskı prototipi</td><td>Boyama işçiliği olmadan doğrudan çok renkli son ürün çıkarma</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Örnek Ölçüm &amp; Çok Renkli Maliyet Karşılaştırması (Canlı PLA Bazlı)</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Model / Senaryo</th><th>Parça + Fire/Purge</th><th>Süre</th><th>Ham Madde</th><th>Toplam Net Maliyet</th></tr></thead>
            <tbody>
              ${senaryolar.map(s => `<tr>
                <td><b>${htmlKacis(s.ad)}</b><br><span class="seo-mini-alt">${htmlKacis(s.not)}</span></td>
                <td>${s.gram.toFixed(1).replace('.', ',')} g → <b>${Math.round(s.etkinGram)} g</b></td>
                <td>~${s.sureSa.toFixed(1).replace('.', ',')} sa</td>
                <td>${formatTL(Math.round(s.hammadde))}</td>
                <td><b style="color:var(--yesil)">${formatTL(Math.round(s.toplam))}</b></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="ipucu" style="margin:10px 0 0">Not: İlk iki satırdaki hacim ve gramaj değerleri Baskı Hesap tarayıcı STL ayrıştırıcısındaki yerleşik örnek dosyalarla (<code>ornek-masaustu-figur.stl</code> ve <code>ornek-cok-renkli-rozet.stl</code>, %20 doluluk, 1,24 g/cm³ PLA) ölçülmüştür; elektrik 2,90 TL/kWh ve amortisman 3,00 TL/saat varsayılmıştır.</p>
      </section>
      ${basSatAkisBolumuHtml('tr')}
      ${sss.html}
      ${altAraclarCubugu()}`,
  });
}

export const REHBER_SAYFALARI = [
  ...YAZICI_KARSILASTIRMALARI.map(y => ({
    yol: y.yol,
    ikon: y.ikon,
    baslik: y.h1,
    ozet: y.description,
    tur: 'Yazıcı Karşılaştırma',
    canliOzet: y.canliOzet,
    olustur: (tumUrunler, tabanUrl) => yaziciKarsilastirmaOlustur(y, tumUrunler, tabanUrl),
  })),
  {
    yol: '/rehber/baslangic-icin-en-iyi-3d-yazicilar',
    ikon: '🖨️',
    baslik: 'Başlangıç İçin En İyi 3D Yazıcılar (Bütçe Sıralaması)',
    ozet: 'İlk 3D yazıcısını alacaklar için stoklu modellerin kargo dahil güncel en düşük Türkiye fiyatları.',
    tur: 'Alım Rehberi',
    canliOzet: (u) => {
      const en = u.filter(x => (x.kategori === 'yazici' || x.kategoriSlug === '3d-yazici') && !parcaMi(x.ad) && x.enUcuzFiyat >= 4500 && !/\bcombo\b/i.test(x.ad))
        .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `Şu an en uygun: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : '10.000 TL+ canlı başlangıç 3D yazıcı listesi';
    },
    olustur: baslangicYaziciRehberiHtml,
  },
  {
    yol: '/rehber/en-ucuz-pla-filament',
    ikon: '🏷️',
    baslik: 'Kilogramı En Ucuz PLA & PLA+ Filamentler',
    ozet: 'Türkiye mağazalarında kargo dahil en ucuz stoklu PLA filament tekliflerini anlık sıralayın.',
    tur: 'Canlı Sıralama',
    canliOzet: (u) => {
      const en = u.filter(x => x.kategoriSlug === 'pla-filament' && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `Şu an #1: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : 'Kargo dahil canlı ₺/kg PLA sıralaması';
    },
    olustur: enUcuzPlaRehberiHtml,
  },
  {
    yol: '/rehber/en-ucuz-petg-ve-tpu-filamentler',
    ikon: '🦾',
    baslik: 'En Ucuz PETG, TPU & ABS Filamentler',
    ozet: 'Dayanıklı dış mekan ve esnek baskılar için Türkiye mağazalarındaki en ucuz teklifler.',
    tur: 'Canlı Sıralama',
    canliOzet: (u) => {
      const en = u.filter(x => x.kategoriSlug === 'petg-tpu-filament' && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `Şu an #1: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : 'Kargo dahil canlı PETG / TPU sıralaması';
    },
    olustur: enUcuzPetgTpuRehberiHtml,
  },
  {
    yol: '/rehber/filament-kurutucu-gerekli-mi',
    ikon: '🌡️',
    baslik: 'Filament Kurutucu Gerekli mi? Sıcaklıklar & Fiyatlar',
    ozet: 'İpliklenme ve kırılmayı önleyen kurutma süreleri ile eBOX / SP2 / SpacePi X4 canlı fiyatları.',
    tur: 'Ekipman Rehberi',
    canliOzet: (u) => {
      const en = u.filter(x => /kurutucu|dryer|ebox|spacepi|filadryer/i.test(`${x.ad} ${x.sorgu}`) && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      return en ? `En ucuz kurutucu: ${en.ad} · ${formatTL(en.enUcuzFiyat)}` : 'PLA/PETG/TPU kurutma sıcaklık tablosu';
    },
    olustur: filamentKurutucuRehberiHtml,
  },
  {
    yol: '/rehber/pla-vs-petg-filament',
    ikon: '🧵',
    baslik: 'PLA vs PETG Filament Farkları & Fiyatları',
    ozet: 'Isı dayanımı, esneklik, nozul sıcaklığı ve canlı Türkiye makara fiyatları tek sayfada.',
    tur: 'Malzeme Rehberi',
    canliOzet: (u) => {
      const pla = u.filter(x => x.kategoriSlug === 'pla-filament' && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      const petg = u.filter(x => x.kategoriSlug === 'petg-tpu-filament' && /petg/i.test(x.ad) && x.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat)[0];
      if (pla && petg) return `PLA: ${formatTL(pla.enUcuzFiyat)}'den · PETG: ${formatTL(petg.enUcuzFiyat)}'den`;
      return '55°C vs 75°C ısı dayanımı & canlı fiyatlar';
    },
    olustur: plaVsPetgRehberiHtml,
  },
  {
    yol: '/rehber/3d-baski-maliyeti-nasil-hesaplanir',
    ikon: '🧮',
    baslik: '3D Baskı Maliyeti Nasıl Hesaplanır?',
    ozet: 'Adım adım baskı maliyet formülü, örnek hesaplama ve ücretsiz STL maliyet hesaplayıcı.',
    tur: 'Maliyet Rehberi',
    canliOzet: () => '4 adımlı formül + canlı PLA maliyet örneği',
    olustur: baskiMaliyetiRehberiHtml,
  },
  {
    yol: '/rehber/meshy-vs-hi3d-3d-baski-maliyeti',
    ikon: '🤖',
    baslik: 'Meshy vs Hi3D: 3D Baskıda Gerçek Gramaj & Maliyet',
    ozet: 'Metinden/fotoğraftan üretilen modellerin dilimleyici gramajı, çok renkli purge payı ve canlı PLA maliyeti.',
    tur: 'AI Model & Maliyet',
    canliOzet: () => 'Yerleşik örnek STL ölçümleri + canlı çok renkli maliyet',
    olustur: meshyVsHi3dRehberiHtml,
  },
];

export function rehberSitemapKayitlari() {
  const bugun = new Date().toISOString().slice(0, 10);
  return [
    { yol: '/rehber', oncelik: '0.85', siklik: 'weekly', lastmod: bugun },
    ...REHBER_SAYFALARI.map(r => ({
      yol: r.yol,
      oncelik: '0.85',
      siklik: 'daily',
      lastmod: bugun,
      ...(r.yol === GLOBAL_AI_REHBER_YOLLARI.tr ? { alternates: { ...GLOBAL_AI_REHBER_YOLLARI, 'x-default': GLOBAL_AI_REHBER_YOLLARI.en } } : {}),
    })),
  ];
}

export function globalRehberSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const alternates = { ...GLOBAL_AI_REHBER_YOLLARI, 'x-default': GLOBAL_AI_REHBER_YOLLARI.en };
  const liste = [
    ...['en', 'fr', 'ja'].map(d => ({
      dil: d,
      yol: GLOBAL_AI_REHBER_YOLLARI[d],
      oncelik: '0.85',
      siklik: 'weekly',
      lastmod: bugun,
      alternates,
    })),
    ...globalDuelloSitemapKayitlari(),
  ];
  if (!dil) return liste;
  return liste.filter(x => x.dil === dil);
}

export function rehberDiziniHtml(tabanUrl, tumUrunler = []) {
  const canonicalUrl = `${tabanUrl}/rehber`;
  const title = '3D Yazıcı Karşılaştırma ve Filament Rehberleri | Baskı Hesap';
  const description = 'Bambu Lab, Creality, Elegoo 3D yazıcı karşılaştırmaları, canlı en ucuz PLA filament sıralaması ve 3D baskı maliyet rehberleri.';

  const kartlar = REHBER_SAYFALARI.map(r => {
    const canliNot = typeof r.canliOzet === 'function' ? r.canliOzet(tumUrunler) : '';
    return `<a class="rehber-kart" href="${htmlKacis(r.yol)}">
      <div class="rehber-kart-ust">
        <span class="rehber-ikon" aria-hidden="true">${rehberIkonSvg(r.id || r.yol)}</span>
        <span class="rehber-rozet">${htmlKacis(r.tur)}</span>
      </div>
      <h2 class="rehber-baslik">${htmlKacis(r.baslik)}</h2>
      <p class="rehber-ozet">${htmlKacis(r.ozet)}</p>
      ${canliNot ? `<div class="rehber-canli-band">${htmlKacis(canliNot)}</div>` : ''}
      <span class="rehber-cta">Rehberi İncele →</span>
    </a>`;
  }).join('');

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    aktifNav: 'rehber',
    dilYolHaritasi: GLOBAL_REHBER_YOLLARI,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <span>Rehber &amp; Karşılaştırmalar</span></nav>
      ${heroAlani({
        rozet: 'Canlı Fiyatlı Karşılaştırmalar · 2026',
        baslikHtml: 'Doğru 3D yazıcıyı <b>gerçek fiyatla</b> seç',
        altMetin: 'Statik blog yazıları değil — her karşılaştırma ve alım rehberi veritabanımızdaki kargo dahil güncel Türkiye mağaza fiyatlarını otomatik çeker.',
        istatistikler: [
          `<b>${REHBER_SAYFALARI.length}</b> canlı rehber`,
          'Yan yana VS kıyaslama',
          'Fiyatlar radardan otomatik güncellenir',
        ],
      })}
      <div class="rehber-izgara">${kartlar}</div>
      ${altAraclarCubugu()}`,
  });
}

export function rehberSayfasiBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '').toLowerCase();
  return REHBER_SAYFALARI.find(r => r.yol === temiz) || null;
}

function rehberIkonSvg(id) {
  const v = String(id || '');
  const s = 'class="svg-ik svg-ik-18" viewBox="0 0 24 24" aria-hidden="true"';
  if (v === 'guide-printers' || v.includes('3d-yazicilar')) return `<svg ${s}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`;
  if (v === 'guide-pla' || v.includes('filament')) return `<svg ${s}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`;
  if (v === 'guide-cost' || v.includes('maliyet')) return `<svg ${s}><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="8" x2="16" y1="14" y2="14"/><line x1="8" x2="12" y1="18" y2="18"/></svg>`;
  if (v === 'guide-ai-3d' || v.includes('meshy') || v.includes('hi3d')) return `<svg ${s}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
  return `<svg ${s}><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/></svg>`;
}

const GLOBAL_REHBER_KOPYA = Object.freeze({
  en: {
    title: '3D Printer Comparisons & Filament Buying Guides | Baski Hesap',
    desc: 'Live-priced 3D printer head-to-head comparisons, cheapest USD filament guides, and print cost calculation walkthroughs across verified US stores.',
    yolAna: 'Home',
    yolAd: 'Guides & Comparisons',
    rozet: 'Live-Priced Buying Guides · 2026',
    h1: 'Choose the right 3D printer with <b>live market pricing</b>',
    alt: 'Not static blog posts — compare Bambu Lab, Creality, Elegoo, and Prusa printers plus real USD filament unit costs across US stores.',
    ist1: 'live buying guides',
    ist2: 'Head-to-head VS specs',
    ist3: 'Real USD store checks',
    cta: 'Read Guide →',
    aracBaslik: 'Tools to Estimate & Optimize Your Print',
    aracAlt: 'Jump straight to STL cost estimation, smart basket splitting, or the full US product catalog:',
    aracLink1: 'US Product Catalog',
    aracLink2: 'STL Cost Calculator ($)',
    aracLink3: 'Smart Basket Optimizer',
    aracLink4: 'Cura & Slicer Plugin',
    kartlar: [
      {
        id: 'vs-p1s-k1c',
        ikon: '⚖️',
        tur: 'VS Comparison',
        baslik: 'Bambu Lab P1S vs Creality K1C',
        ozet: '256 mm AMS multicolor ecosystem vs enclosed Klipper CoreXY with hardened carbon-fiber nozzle and live US pricing.',
        band: '256×256×256 mm vs 220×220×250 mm · Enclosed CoreXY',
        sorgu: 'Bambu Lab P1S vs Creality K1C',
        urunA: 'Bambu Lab P1S',
        urunB: 'Creality K1C',
        detay: 'Compare build volume, AMS multi-color support, hardened nozzle durability, and live checkout pricing including shipping across US retailers (Creality US, Bambu Lab US, Amazon US, Best Buy, Walmart, MatterHackers).',
      },
      {
        id: 'vs-a1mini-v3ke',
        ikon: '🚀',
        tur: 'VS Comparison',
        baslik: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
        ozet: 'Compact 180 mm quiet AMS Lite desktop printer vs 220 mm Klipper bedslinger with 500 mm/s peak speed.',
        band: '180 mm AMS Lite vs 220 mm 500 mm/s Klipper',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Creality Ender 3 V3 KE',
        detay: 'Best entry-level showdown: automatic flow-rate calibration and ultra-quiet operation on the A1 Mini versus larger build plate and open Klipper firmware on the Ender 3 V3 KE.',
      },
      {
        id: 'vs-v3ke-n4pro',
        ikon: '⚡',
        tur: 'VS Comparison',
        baslik: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
        ozet: 'Two fast budget Klipper printers head-to-head: Sprite direct drive vs dual-zone heated bed & metal rails.',
        band: 'Dual-zone 250W bed vs 300°C Sprite hotend',
        sorgu: 'Elegoo Neptune 4 Pro',
        urunA: 'Creality Ender 3 V3 KE',
        urunB: 'Elegoo Neptune 4 Pro',
        detay: 'Evaluate high-flow hotend throughput, segmented bed heating efficiency, noise levels, and current US store availability.',
      },
      {
        id: 'guide-printers',
        ikon: '🖨️',
        tur: 'Buying Guide',
        baslik: 'Best Budget 3D Printers for Beginners (US Pricing)',
        ozet: 'Reliable plug-and-play FDM printers under $500 sorted by print speed, auto-leveling reliability, and real US stock.',
        band: 'Starter & mid-range FDM picks in USD',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Prusa MK4S',
        detay: 'From compact starter machines to enclosed multi-material workhorses, filter real US merchant offers with shipping included.',
      },
      {
        id: 'guide-pla',
        ikon: '🥇',
        tur: 'Filament Guide',
        baslik: 'Cheapest PLA & PLA+ Filaments per Kilogram ($/kg)',
        ozet: 'Compare 1 kg spools from eSun, SUNLU, Polymaker, Overture, and Creality Hyper PLA by real $/kg unit price.',
        band: 'Normalized $/kg comparison across US stores',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detay: 'Never overpay on multi-packs or 2 kg spools: compare normalized $/kg prices after shipping across Amazon US, SUNLU, Polymaker, Overture, and MatterHackers.',
      },
      {
        id: 'guide-cost',
        ikon: '🧮',
        tur: 'Cost Guide',
        baslik: 'How to Calculate 3D Print Cost & Selling Price',
        ozet: 'Step-by-step formula covering filament grams, kWh electricity ($0.16/kWh), machine wear, and workshop profit margin.',
        band: '4-step formula + free client-side STL calculator',
        sorgu: 'PLA filament 1kg',
        urunA: 'Creality Hyper PLA 1kg',
        urunB: 'Polymaker PLA 1kg',
        detay: 'Formula: Net Cost = (Grams / 1000 × $/kg) + ((Watts × Hours / 1000) × $/kWh) + (Hours × $/hr Depreciation). Use the STL Cost Calculator to compute instantly in your browser.',
      },
      {
        id: 'guide-ai-3d',
        ikon: '🤖',
        tur: 'AI 3D & Print Cost',
        baslik: 'Meshy vs Hi3D: Real 3D Print Weight & Filament Cost Guide',
        ozet: 'Compare Text/Image-to-3D printing workflows, multi-color purge overhead (+15–25%), and live USD filament costs.',
        band: 'Built-in sample STLs + multi-color purge breakdown',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'Polymaker PLA 1kg',
        detayYolu: GLOBAL_AI_REHBER_YOLLARI.en,
        detay: 'When to use Meshy (single-color figurines & Image-to-3D prototypes) vs Hi3D (no-split multi-color physical prints) — plus how multi-color swaps change real filament cost.',
      },
      {
        id: 'vs-heygears-saturn',
        ikon: '🧪',
        tur: 'Resin Duel',
        baslik: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra',
        ozet: 'Industrial 8K force-sensing resin automation vs 12K 150 mm/h tilt-release speed and open third-party resin economics.',
        band: '222×122×230 vs 219×123×220 mm · MSLA Breakdown',
        sorgu: 'HeyGears Reflex RS',
        urunA: 'HeyGears Reflex RS',
        urunB: 'ELEGOO Saturn 4 Ultra',
        detayYolu: GLOBAL_DUELLO_YOLLARI['heygears-vs-saturn'].en,
        detay: 'Resin per-print cost, IPA/FEP waste control, and official store pricing for Reflex RS vs Saturn 4 Ultra.',
      },
      {
        id: 'vs-snapmaker-k1max',
        ikon: '⚔️',
        tur: 'Toolchanger VS',
        baslik: 'Snapmaker Artisan / U1 vs Creality K1 Max',
        ozet: '4-toolhead SnapSwap™ color printing & 400 mm 3-in-1 CNC/Laser versus 600 mm/s enclosed CoreXY speed.',
        band: '4-Toolhead CoreXY vs 3-in-1 400 mm vs 600 mm/s K1 Max',
        sorgu: 'Snapmaker U1',
        urunA: 'Snapmaker U1',
        urunB: 'Creality K1 Max',
        detayYolu: GLOBAL_DUELLO_YOLLARI['snapmaker-vs-k1max'].en,
        detay: 'Compare multi-material purge savings on the U1, CNC/laser versatility on Artisan, and high-speed enclosed ABS/PLA output on K1 Max.',
      },
      {
        id: 'vs-sv08-ad5m-n4max',
        ikon: '🏎️',
        tur: '3-Way FDM VS',
        baslik: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max',
        ozet: 'Voron-style 350 mm CoreXY (700 mm/s) vs HEPA-enclosed 220 mm CoreXY vs 420×420×480 mm giant bed-slinger.',
        band: '350 mm CoreXY vs 220 mm HEPA vs 420 mm Max',
        sorgu: 'Sovol SV08',
        urunA: 'Sovol SV08',
        urunB: 'Flashforge Adventurer 5M Pro',
        detayYolu: GLOBAL_DUELLO_YOLLARI['sv08-vs-ad5m-vs-n4max'].en,
        detay: 'Electricity draw, Klipper speed, and build volume trade-offs across Sovol, Flashforge, and ELEGOO.',
      },
    ],
  },
  fr: {
    title: 'Comparatifs Imprimantes 3D & Guides d’Achat Filament | Baski Hesap',
    desc: 'Duels techniques, classements des filaments PLA au meilleur prix au €/kg et calculateur de coût réel dans les boutiques européennes.',
    yolAna: 'Accueil',
    yolAd: 'Guides & Comparatifs',
    rozet: 'Guides d’Achat & Comparatifs · 2026',
    h1: 'Choisissez la bonne imprimante 3D au <b>prix réel (€)</b>',
    alt: 'Comparez Bambu Lab, Creality, Elegoo et Prusa ainsi que le coût réel au kilogramme de vos bobines sur les boutiques EU/FR.',
    ist1: 'guides pratiques',
    ist2: 'Comparatifs côte à côte',
    ist3: 'Prix vérifiés en EUR (€)',
    cta: 'Lire le guide →',
    aracBaslik: 'Outils d’estimation et d’optimisation',
    aracAlt: 'Accédez directement au calculateur de coût STL, au panier intelligent ou au catalogue européen :',
    aracLink1: 'Catalogue Produits EU',
    aracLink2: 'Calculateur de Coût (€)',
    aracLink3: 'Panier Intelligent',
    aracLink4: 'Extension Cura & Slicer',
    kartlar: [
      {
        id: 'vs-p1s-k1c',
        ikon: '⚖️',
        tur: 'Duel VS',
        baslik: 'Bambu Lab P1S vs Creality K1C',
        ozet: 'Écosystème multicouleur AMS (256 mm) contre CoreXY rapide avec buse renforcée pour fibre de carbone.',
        band: '256×256×256 mm vs 220×220×250 mm · CoreXY fermée',
        sorgu: 'Bambu Lab P1S',
        urunA: 'Bambu Lab P1S',
        urunB: 'Creality K1C',
        detay: 'Comparaison du volume d’impression, du support AMS, des températures admissibles et des tarifs TTC livraison incluse sur Bambu Lab EU, Creality EU, Amazon.fr, 3DJake et LDLC.',
      },
      {
        id: 'vs-a1mini-v3ke',
        ikon: '🚀',
        tur: 'Duel VS',
        baslik: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
        ozet: 'Imprimante silencieuse 180 mm compatible AMS Lite face à une cartésienne Klipper 220 mm à 500 mm/s.',
        band: '180 mm AMS Lite vs 220 mm Klipper 500 mm/s',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Creality Ender 3 V3 KE',
        detay: 'Calibration automatique du débit et silence remarquable pour la A1 Mini vs grand plateau 220 mm et firmware Klipper ouvert sur la V3 KE.',
      },
      {
        id: 'vs-v3ke-n4pro',
        ikon: '⚡',
        tur: 'Duel VS',
        baslik: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
        ozet: 'Deux imprimantes Klipper abordables : extrudeur Sprite 300 °C contre plateau chauffant double zone.',
        band: 'Plateau bi-zone 250 W vs Sprite 300 °C',
        sorgu: 'Elegoo Neptune 4 Pro',
        urunA: 'Creality Ender 3 V3 KE',
        urunB: 'Elegoo Neptune 4 Pro',
        detay: 'Analyse des performances de chauffe, des rails métalliques et des prix actuels port compris en Europe.',
      },
      {
        id: 'guide-printers',
        ikon: '🖨️',
        tur: 'Guide d’achat',
        baslik: 'Meilleures Imprimantes 3D pour Débuter (Prix EU)',
        ozet: 'Modèles fiables prêts à imprimer avec nivellement automatique et disponibilité immédiate en France/UE.',
        band: 'Sélection entrée & milieu de gamme en €',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Prusa MK4S',
        detay: 'Des machines compactes aux stations CoreXY rapides, vérifiez les stocks européens port inclus.',
      },
      {
        id: 'guide-pla',
        ikon: '🥇',
        tur: 'Guide Filament',
        baslik: 'Filaments PLA & PLA+ les moins chers au kilo (€/kg)',
        ozet: 'Comparez le vrai prix au kg (eSun, SUNLU, Overture, Elegoo, Bambu) livraison incluse.',
        band: 'Prix normalisé au €/kg sur boutiques EU',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detay: 'Comparez le coût réel au kilogramme sur les packs 1 kg, 2 kg et bobines recharge.',
      },
      {
        id: 'guide-cost',
        ikon: '🧮',
        tur: 'Guide Coût',
        baslik: 'Comment calculer le coût de revient d’une impression 3D ?',
        ozet: 'Formule complète (filament, électricité 0,25 €/kWh, usure machine, marge) et calculateur STL gratuit.',
        band: 'Formule en 4 étapes + calculateur STL local',
        sorgu: 'PLA filament 1kg',
        urunA: 'Creality Hyper PLA 1kg',
        urunB: 'Overture PLA 1kg',
        detay: 'Coût net = (Grammes / 1000 × €/kg) + (kWh × tarif EDF) + (Heures × amortissement). Testez vos fichiers STL sans rien envoyer en ligne.',
      },
      {
        id: 'guide-ai-3d',
        ikon: '🤖',
        tur: 'IA 3D & Coût',
        baslik: 'Meshy vs Hi3D : Poids Réel et Coût d’Impression 3D',
        ozet: 'Comparez Text/Image-to-3D, le surcoût de purge multicouleur (+15–25 %) et les prix réels des bobines en EUR.',
        band: 'Exemples STL intégrés + calcul purge multicouleur',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detayYolu: GLOBAL_AI_REHBER_YOLLARI.fr,
        detay: 'Quand privilégier Meshy (figurines & prototypes mono-couleur) vs Hi3D (impression physique multicouleur sans découpe) et impact sur le coût filament en €.',
      },
      {
        id: 'vs-heygears-saturn',
        ikon: '🧪',
        tur: 'Duel Résine',
        baslik: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra',
        ozet: 'Automatisation MSLA 8K par capteur de force contre vitesse tilt-release 12K et liberté résines en EUR.',
        band: '222×122×230 vs 219×123×220 mm · Flux Résine',
        sorgu: 'HeyGears Reflex RS',
        urunA: 'HeyGears Reflex RS',
        urunB: 'ELEGOO Saturn 4 Ultra',
        detayYolu: GLOBAL_DUELLO_YOLLARI['heygears-vs-saturn'].fr,
        detay: 'Coût par tirage, taux d’échec, solvant IPA et liens officiels HeyGears & ELEGOO EU.',
      },
      {
        id: 'vs-snapmaker-k1max',
        ikon: '⚔️',
        tur: 'Duel Multi-outils',
        baslik: 'Snapmaker Artisan / U1 vs Creality K1 Max',
        ozet: 'Changeur 4 têtes sans purge massive (U1) & station 400 mm 3-en-1 contre CoreXY fermée à 600 mm/s.',
        band: '4 têtes CoreXY vs 3-en-1 400 mm vs 600 mm/s',
        sorgu: 'Snapmaker U1',
        urunA: 'Snapmaker U1',
        urunB: 'Creality K1 Max',
        detayYolu: GLOBAL_DUELLO_YOLLARI['snapmaker-vs-k1max'].fr,
        detay: 'Économies de purge sur le U1, polyvalence CNC/Laser sur l’Artisan et productivité ABS/PLA sur K1 Max.',
      },
      {
        id: 'vs-sv08-ad5m-n4max',
        ikon: '🏎️',
        tur: 'Comparatif 3 FDM',
        baslik: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max',
        ozet: 'CoreXY 350 mm type Voron (700 mm/s) contre caisson filtré HEPA 220 mm et plateau XXL 420×420×480 mm.',
        band: '350 mm CoreXY vs 220 mm HEPA vs 420 mm XXL',
        sorgu: 'Sovol SV08',
        urunA: 'Sovol SV08',
        urunB: 'Flashforge Adventurer 5M Pro',
        detayYolu: GLOBAL_DUELLO_YOLLARI['sv08-vs-ad5m-vs-n4max'].fr,
        detay: 'Consommation EDF (0,25 €/kWh), vitesse Klipper et comparaison des volumes utiles.',
      },
    ],
  },
  ja: {
    title: '3Dプリンター徹底比較＆フィラメント購入ガイド | Baski Hesap',
    desc: '人気3Dプリンターのスペック比較、kg単価ベースの最安PLAフィラメント、3Dプリント原価計算方法を日本市場の円（¥）基準で解説。',
    yolAna: 'ホーム',
    yolAd: 'ガイド・徹底比較',
    rozet: '3Dプリント購入ガイド・比較 · 2026',
    h1: '<b>実勢価格（円）</b>と性能で失敗しない3Dプリンター選び',
    alt: 'Bambu Lab・Creality・Elegoo・Prusaのスペック比較や、日本国内ストア対応のkgあたり最安フィラメント選びをサポートします。',
    ist1: '件の比較・ガイド',
    ist2: '人気機種の徹底比較',
    ist3: '日本円（¥）リアルタイム検索対応',
    cta: 'ガイドを見る →',
    aracBaslik: '見積もり・まとめ買いツール',
    aracAlt: 'STL原価シミュレーターやスマートカート、日本製品カタログへ直接移動できます：',
    aracLink1: '日本向け製品カタログ',
    aracLink2: '原価シミュレーター (¥)',
    aracLink3: 'スマートカート＆送料最適化',
    aracLink4: 'Cura・スライサー連携',
    kartlar: [
      {
        id: 'vs-p1s-k1c',
        ikon: '⚖️',
        tur: '徹底比較 VS',
        baslik: 'Bambu Lab P1S vs Creality K1C',
        ozet: 'AMS多色造形対応の256mm密閉型P1Sと、カーボン強化ノズル標準装備のKlipper機K1Cを比較。',
        band: '256mm vs 220mm · 密閉型CoreXY高速機',
        sorgu: 'Bambu Lab P1S',
        urunA: 'Bambu Lab P1S',
        urunB: 'Creality K1C',
        detay: '造形サイズ、多色印刷（AMS）対応、炭素繊維入りフィラメント適正、日本国内公式ストア・Amazon.co.jpでの送料込み価格を比較します。',
      },
      {
        id: 'vs-a1mini-v3ke',
        ikon: '🚀',
        tur: '徹底比較 VS',
        baslik: 'Bambu Lab A1 Mini vs Creality Ender 3 V3 KE',
        ozet: '静音＆AMS Lite対応の180mmコンパクト機と、500mm/s高速220mmベッドスリンガーを比較。',
        band: '180mm 静音AMS Lite vs 220mm Klipper高速機',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Creality Ender 3 V3 KE',
        detay: '初心者向けの扱いやすさ・静音性と、より広い造形スペースのどちらを優先すべきか比較できます。',
      },
      {
        id: 'vs-v3ke-n4pro',
        ikon: '⚡',
        tur: '徹底比較 VS',
        baslik: 'Creality Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
        ozet: '高コスパKlipper機対決：300℃ Spriteホットエンド vs デュアルゾーン加熱ベッド＆金属レール。',
        band: '2エリア独立加熱ベッド vs 300℃ダイレクト',
        sorgu: 'Elegoo Neptune 4 Pro',
        urunA: 'Creality Ender 3 V3 KE',
        urunB: 'Elegoo Neptune 4 Pro',
        detay: '消費電力節約に効く独立加熱ベッドや高速出力時の冷却性能、日本国内の送料込み価格をチェック。',
      },
      {
        id: 'guide-printers',
        ikon: '🖨️',
        tur: '購入ガイド',
        baslik: '初心者におすすめの高コスパ3Dプリンター（日本価格）',
        ozet: 'オートレベリング対応で失敗しにくい人気エントリー〜中級機を日本円の実勢価格でチェック。',
        band: '入門・中級FDMプリンター比較',
        sorgu: 'Bambu Lab A1 Mini',
        urunA: 'Bambu Lab A1 Mini',
        urunB: 'Prusa MK4S',
        detay: '設置スペースや予算別に日本公式サイト・国内代理店の在庫と送料込み価格を比較できます。',
      },
      {
        id: 'guide-pla',
        ikon: '🥇',
        tur: 'フィラメント',
        baslik: 'kg単価が最安のPLA・PLA+フィラメント比較 (¥/kg)',
        ozet: 'eSun・SUNLU・Bambu Lab・Creality・QIDIの1kgスプールを送料込kg単価で徹底比較。',
        band: '1kg換算 ¥/kg ベース比較',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detay: 'まとめ買いや容量違いスプールを1kg単価へ自動換算して最安ショップを見つけます。',
      },
      {
        id: 'guide-cost',
        ikon: '🧮',
        tur: '原価計算',
        baslik: '3Dプリントの原価（材料費・電気代・償却費）の計算方法',
        ozet: 'フィラメント使用量・電力単価（31円/kWh）・機体消耗費から適正販売価格を導く計算式。',
        band: '4ステップ計算式＋ローカルSTL見積もり',
        sorgu: 'PLA filament 1kg',
        urunA: 'Creality Hyper PLA 1kg',
        urunB: 'eSun PLA+ 1kg',
        detay: '原価 = (使用グラム/1000 × ¥/kg) + (消費電力kW × 時間 × 電力単価) + (時間 × 償却費)。原価シミュレーターで即計算できます。',
      },
      {
        id: 'guide-ai-3d',
        ikon: '🤖',
        tur: 'AI 3D・原価比較',
        baslik: 'Meshy vs Hi3D：3Dプリント実重量とフィラメント原価ガイド',
        ozet: 'Text/Image-to-3Dモデルの造形グラム数・多色印刷のパージ増分（+15〜25%）と日本円での実質コスト比較。',
        band: 'サンプルSTL計測値＋多色パージ原価試算',
        sorgu: 'eSun PLA+ 1kg',
        urunA: 'eSun PLA+ 1kg',
        urunB: 'SUNLU PLA+ 1kg',
        detayYolu: GLOBAL_AI_REHBER_YOLLARI.ja,
        detay: '単色フィギュア向けのMeshyと分割不要の多色造形向けHi3Dの使い分け、およびAMS等の色替えロスを含めた原価比較。',
      },
      {
        id: 'vs-heygears-saturn',
        ikon: '🧪',
        tur: '光造形比較',
        baslik: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra',
        ozet: '圧力センサーによる残渣検知8K機と、チルトリリース12K高速機の造形精度・レジンコスト比較。',
        band: '222×122×230 vs 219×123×220 mm · 光造形',
        sorgu: 'HeyGears Reflex RS',
        urunA: 'HeyGears Reflex RS',
        urunB: 'ELEGOO Saturn 4 Ultra',
        detayYolu: GLOBAL_DUELLO_YOLLARI['heygears-vs-saturn'].ja,
        detay: '造形失敗ロスの低減と汎用レジン単価の違いを公式ストア情報付きで比較。',
      },
      {
        id: 'vs-snapmaker-k1max',
        ikon: '⚔️',
        tur: '多機能 VS',
        baslik: 'Snapmaker Artisan / U1 vs Creality K1 Max',
        ozet: '4独立ヘッド交換式のU1・CNC/レーザー兼用400mm Artisanと、600mm/s密閉型CoreXY K1 Maxを比較。',
        band: '4ヘッド交換 vs 3in1 400mm vs 600mm/s',
        sorgu: 'Snapmaker U1',
        urunA: 'Snapmaker U1',
        urunB: 'Creality K1 Max',
        detayYolu: GLOBAL_DUELLO_YOLLARI['snapmaker-vs-k1max'].ja,
        detay: '多色パージ削減効果、CNC/レーザー兼用、単色高速出力の違いを解説。',
      },
      {
        id: 'vs-sv08-ad5m-n4max',
        ikon: '🏎️',
        tur: '3機種比較',
        baslik: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max',
        ozet: 'Voron系350mm CoreXY（700mm/s）vs HEPA密閉220mm機 vs 420×420×480mm超大型ベッドスリンガー。',
        band: '350mm CoreXY vs 220mm密閉 vs 420mm大型',
        sorgu: 'Sovol SV08',
        urunA: 'Sovol SV08',
        urunB: 'Flashforge Adventurer 5M Pro',
        detayYolu: GLOBAL_DUELLO_YOLLARI['sv08-vs-ad5m-vs-n4max'].ja,
        detay: '大型加熱ベッドの電気代、Klipper速度、室内ABS適性を3方向から比較。',
      },
    ],
  },
});

function rehberIcinUrunBul(g, tumUrunler = []) {
  if (!Array.isArray(tumUrunler) || !tumUrunler.length) return null;
  const filamentKartMi = g.id === 'guide-pla' || g.id === 'guide-cost' || g.id === 'guide-ai-3d';
  const havuz = tumUrunler.filter((u) => {
    if (!u || !(Number(u.enUcuzFiyat) > 0)) return false;
    if (filamentKartMi) {
      return u.kategori === 'filament' || ['pla-filament', 'filament'].includes(u.kategoriSlug);
    }
    return (u.kategoriSlug === '3d-yazici' || u.kategori === 'yazici') && !parcaMi(u.ad);
  });
  if (!havuz.length) return null;

  const adayEslesirMi = (u, hedef) => {
    const baglam = `${u.ad || ''} ${u.sorgu || ''}`.toLowerCase();
    const tokenler = String(hedef || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t && !['3d', 'printer', '1kg', 'filament'].includes(t));
    if (!tokenler.length) return false;
    return tokenler.every(t => baglam.includes(t));
  };

  const tamA = havuz.find(u => adayEslesirMi(u, g.urunA));
  if (tamA) return tamA;
  const tamB = havuz.find(u => adayEslesirMi(u, g.urunB));
  if (tamB) return tamB;

  if (g.id === 'guide-cost') {
    const pla = havuz
      .filter(u => u.kategoriSlug === 'pla-filament')
      .sort((a, b) => Number(a.enUcuzFiyat) - Number(b.enUcuzFiyat));
    if (pla.length) return pla[0];
  }
  return null;
}

export function globalRehberDiziniHtml(dil = 'en', tabanUrl = '', tumUrunler = []) {
  const kod = dil === 'fr' ? 'fr' : (dil === 'ja' ? 'ja' : 'en');
  const k = GLOBAL_REHBER_KOPYA[kod];
  const onEk = `/${kod}`;
  const canonicalUrl = `${tabanUrl}${GLOBAL_REHBER_YOLLARI[kod]}`;
  const varsayilanPara = kod === 'fr' ? 'EUR' : (kod === 'ja' ? 'JPY' : 'USD');
  const katYol = kod === 'fr' ? '/fr/produits' : (kod === 'ja' ? '/ja/products' : '/en/products');
  const malYol = kod === 'fr' ? '/fr/calculateur-cout' : (kod === 'ja' ? '/ja/cost-calculator' : '/en/cost-calculator');
  const sepYol = kod === 'fr' ? '/fr/panier' : (kod === 'ja' ? '/ja/basket' : '/en/basket');
  const slcYol = `/${kod}/slicer`;
  const karsilastirEtiket = kod === 'fr' ? 'Comparer →' : (kod === 'ja' ? '価格比較 →' : 'Compare →');

  const kartlarHtml = k.kartlar.map((g) => {
    const araLinkA = `${onEk}?url=${encodeURIComponent(g.urunA)}`;
    const araLinkB = `${onEk}?url=${encodeURIComponent(g.urunB)}`;
    const tekUrun = rehberIcinUrunBul(g, tumUrunler);
    const canliSatir = tekUrun?.enUcuzFiyat > 0
      ? `${tekUrun.ad} · ${formatPara(tekUrun.enUcuzFiyat, tekUrun.paraBirimi || varsayilanPara)}${tekUrun.enUcuzSite ? ` (${tekUrun.enUcuzSite})` : ''}`
      : g.band;
    return `<article class="rehber-kart" id="${htmlKacis(g.id)}">
      <div class="rehber-kart-ust">
        <span class="rehber-ikon" aria-hidden="true">${rehberIkonSvg(g.id)}</span>
        <span class="rehber-rozet">${htmlKacis(g.tur)}</span>
      </div>
      <h2 class="rehber-baslik">${htmlKacis(g.baslik)}</h2>
      <p class="rehber-ozet">${htmlKacis(g.ozet)}</p>
      <p class="rehber-ozet" style="font-size:12.5px;opacity:.92">${htmlKacis(g.detay)}</p>
      <div class="rehber-canli-band">${htmlKacis(canliSatir)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
        ${g.detayYolu ? `<a class="rehber-cta" href="${htmlKacis(g.detayYolu)}">${htmlKacis(k.cta)}</a>` : ''}
        <a class="rehber-cta" href="${htmlKacis(araLinkA)}">${htmlKacis(g.urunA)} →</a>
        <a class="rehber-cta" href="${htmlKacis(araLinkB)}">${htmlKacis(g.urunB)} →</a>
      </div>
    </article>`;
  }).join('');

  return sayfaIskeleti({
    title: k.title,
    description: k.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    aktifNav: 'rehber',
    dil: kod,
    dilYolHaritasi: GLOBAL_REHBER_YOLLARI,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: k.title,
      description: k.desc,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="${onEk}">${htmlKacis(k.yolAna)}</a> › <span>${htmlKacis(k.yolAd)}</span></nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">${k.rozet}</span>
          <h1>${k.h1}</h1>
          <p>${htmlKacis(k.alt)}</p>
          <div class="hero-istatistik">
            <span><b>${k.kartlar.length}</b> ${htmlKacis(k.ist1)}</span>
            <span>${k.ist2}</span>
            <span>${k.ist3}</span>
          </div>
        </div>
      </section>
      <div class="rehber-izgara">${kartlarHtml}</div>
      <section class="seo-rehber-kart" aria-label="${htmlKacis(k.aracBaslik)}">
        <div class="seo-rehber-ust">
          <div>
            <h2 class="bolum-baslik" style="margin:0 0 4px">${htmlKacis(k.aracBaslik)}</h2>
            <p class="ipucu" style="margin:0">${htmlKacis(k.aracAlt)}</p>
          </div>
          <a class="seo-tum-link" href="${onEk}">${karsilastirEtiket}</a>
        </div>
        <div class="seo-rehber-baglar">
          <a href="${katYol}">${k.aracLink1}</a>
          <a href="${malYol}">${k.aracLink2}</a>
          <a href="${sepYol}">${k.aracLink3}</a>
          <a href="${slcYol}">${k.aracLink4}</a>
        </div>
      </section>`,
  });
}

const GLOBAL_AI_REHBER_KOPYA = Object.freeze({
  en: {
    title: 'Meshy vs Hi3D: AI 3D Print Weight & Filament Cost Guide | Baski Hesap',
    desc: 'Compare Meshy AI and Hi3D for 3D printing: single-color Image-to-3D figurines vs multi-color purge overhead (+15–25%) with live USD filament pricing.',
    home: 'Home', guides: 'Guides', crumb: 'Meshy vs Hi3D',
    rozet: 'AI 3D Generation &amp; Real Print Cost',
    h1: 'Meshy vs Hi3D: <b>Real 3D Print Weight &amp; Filament Cost</b>',
    alt: 'Generating a 3D mesh from text or an image is step one — real cost depends on slicer grams, support waste, and multi-color purge swaps.',
    ctaCalc: 'Test Sample STL in Cost Calculator →',
    ctaMeshy: 'Try Meshy AI ↗',
    ctaHi3d: 'Try Hi3D ↗',
    vsH2: 'Meshy vs Hi3D: Which Fits Your 3D Printer?',
    th1: 'Criterion', th2: 'Meshy AI', th3: 'Hi3D',
    rows: [
      ['Primary Strength', 'Text-to-3D, Image-to-3D, AI Texturing &amp; editable assets', 'No-split multi-color physical printing &amp; 8K texture workflow'],
      ['Best Print Setup', 'Single-extruder printers (figurines, prototypes, painted models)', 'Multi-color systems (Bambu AMS, Creality K2/K3/Hi Combo, ACE Pro)'],
      ['Material Overhead', '~10% support &amp; brim allowance', '+15% to +25% filament waste from color-swap purge towers'],
      ['Workshop Use Case', 'Turning customer photos or prompts into fast prototypes', 'Ready-to-gift multi-color physical items without manual painting'],
    ],
    costH2: 'Measured Sample Models &amp; Multi-Color Cost Breakdown',
    mTh1: 'Model / Scenario', mTh2: 'Part → With Waste', mTh3: 'Est. Time', mTh4: 'Filament', mTh5: 'Net Cost',
    s1: 'Tabletop Figurine (built-in STL · 56×56×98 mm)', s1n: 'Single-color PLA + 10% support/brim allowance',
    s2: 'Multi-Color Badge (built-in STL · 92×92×26 mm)', s2n: 'Multi-color print assuming +20% color-swap purge',
    s3: 'Medium Multi-Color Bust (120 g scenario)', s3n: 'AMS/Combo tower &amp; flush waste (~22% overhead)',
    note: 'Geometry and grams for the first two rows are measured directly by Baski Hesap’s local STL parser at 20% infill (1.24 g/cm³ PLA). Electricity ($0.16/kWh) and wear ($0.25/hr) match our US calculator defaults.',
    para: 'USD', bazPla: 19.99, bazPlus: 21.99, kwh: 0.16, amp: 0.25,
    canliEtiket: 'Live US filament reference:',
    faq: [
      { soru: 'Can Meshy and Hi3D exports be 3D printed directly?', cevap: 'Yes. Export .stl, .obj, or .3mf files into Bambu Studio, OrcaSlicer, or Cura. Always run non-manifold repair if needed and enable supports for thin overhangs.' },
      { soru: 'Why does multi-color printing cost more than single-color?', cevap: 'Every filament swap purges melted plastic into a flush chute or prime tower, typically adding 15%–25% to total filament weight.' },
    ],
  },
  fr: {
    title: 'Meshy vs Hi3D : Poids Réel et Coût d’Impression 3D | Baski Hesap',
    desc: 'Comparatif Meshy AI vs Hi3D pour l’impression 3D : mono-couleur vs surcoût de purge multicouleur (+15–25 %) et prix des bobines en EUR.',
    home: 'Accueil', guides: 'Guides', crumb: 'Meshy vs Hi3D',
    rozet: 'Génération 3D IA &amp; Coût Réel',
    h1: 'Meshy vs Hi3D : <b>Poids Réel et Coût d’Impression 3D</b>',
    alt: 'Générer un maillage 3D depuis un texte ou une photo n’est que la première étape : le coût réel dépend des grammes, des supports et de la purge multicouleur.',
    ctaCalc: 'Tester un STL dans le Calculateur →',
    ctaMeshy: 'Découvrir Meshy AI ↗',
    ctaHi3d: 'Découvrir Hi3D ↗',
    vsH2: 'Meshy vs Hi3D : Quelle approche pour votre imprimante ?',
    th1: 'Critère', th2: 'Meshy AI', th3: 'Hi3D',
    rows: [
      ['Point fort', 'Text-to-3D, Image-to-3D, texturisation IA &amp; maillages éditables', 'Impression physique multicouleur sans découpe &amp; textures 8K'],
      ['Imprimante idéale', 'Imprimantes mono-buse (figurines, prototypes à peindre)', 'Systèmes multicouleurs (Bambu AMS, Creality K2/K3/Hi Combo)'],
      ['Perte matière', '~10 % pour supports et bordure', '+15 % à +25 % de filament pour les purges de couleur'],
      ['Usage atelier', 'Prototypage rapide à partir de photos clients', 'Pièces physiques multicouleurs prêtes sans peinture manuelle'],
    ],
    costH2: 'Mesures STL &amp; Comparatif de Coût Multicouleur (EUR)',
    mTh1: 'Modèle / Scénario', mTh2: 'Pièce → Avec pertes', mTh3: 'Durée est.', mTh4: 'Filament', mTh5: 'Coût net',
    s1: 'Figurine de bureau (STL intégré · 56×56×98 mm)', s1n: 'PLA mono-couleur + 10 % supports/pertes',
    s2: 'Badge multicouleur (STL intégré · 92×92×26 mm)', s2n: 'Impression multicouleur (+20 % purge estimée)',
    s3: 'Buste multicouleur moyen (scénario 120 g)', s3n: 'Tour de purge AMS/Combo (~22 % de surconsommation)',
    note: 'Les volumes et poids des deux premières lignes sont mesurés par le parseur STL de Baski Hesap (remplissage 20 %, PLA 1,24 g/cm³) avec électricité à 0,25 €/kWh et usure à 0,25 €/h.',
    para: 'EUR', bazPla: 19.99, bazPlus: 21.99, kwh: 0.25, amp: 0.25,
    canliEtiket: 'Référence filament EU en direct :',
    faq: [
      { soru: 'Peut-on imprimer directement les modèles Meshy et Hi3D ?', cevap: 'Oui, importez les fichiers .stl, .obj ou .3mf dans Bambu Studio, OrcaSlicer ou Cura et activez la réparation automatique si nécessaire.' },
      { soru: 'Pourquoi l’impression multicouleur consomme-t-elle plus ?', cevap: 'Chaque changement de filament génère une purge, ajoutant en moyenne 15 % à 25 % de masse totale.' },
    ],
  },
  ja: {
    title: 'Meshy vs Hi3D：3Dプリント実重量・フィラメント原価ガイド | Baski Hesap',
    desc: 'Meshy AIとHi3Dの3Dプリント比較：単色造形と多色パージ増分（+15〜25%）を含む日本円（¥）での実質コスト試算。',
    home: 'ホーム', guides: 'ガイド', crumb: 'Meshy vs Hi3D',
    rozet: 'AI 3Dモデル生成 &amp; 実造形原価',
    h1: 'Meshy vs Hi3D：<b>3Dプリント実重量と原価比較</b>',
    alt: 'テキストや画像から3Dモデルを生成した後、実際の造形コストはスライサー上のグラム数・サポート材・多色印刷時のパージロスで決まります。',
    ctaCalc: '原価シミュレーターでサンプルSTLを試算 →',
    ctaMeshy: 'Meshy AI を見る ↗',
    ctaHi3d: 'Hi3D を見る ↗',
    vsH2: 'Meshy vs Hi3D：3Dプリンター用途別の使い分け',
    th1: '比較項目', th2: 'Meshy AI', th3: 'Hi3D',
    rows: [
      ['主な強み', 'Text/Image-to-3D、AIテクスチャ、編集しやすいメッシュ', 'モデル分割不要の物理多色プリント向け造形・8Kテクスチャ'],
      ['適したプリンター', '単色FDM機（フィギュア試作・塗装前提モデル）', 'AMS・Creality K3 Combo等のマルチカラー機'],
      ['フィラメントロス', 'サポート・ブリム分で約+10%', '色替えパージタワーで+15%〜+25%加算'],
      ['活用シーン', '写真からの迅速なプロトタイプ・カスタム造形', '後塗装なしでの多色グッズ直接出力'],
    ],
    costH2: '内蔵STL実測値＆多色パージ原価シミュレーション (JPY)',
    mTh1: 'モデル / シナリオ', mTh2: '本体 → ロス込み', mTh3: '予想時間', mTh4: '材料費', mTh5: '合計原価',
    s1: '卓上フィギュア (内蔵STL · 56×56×98 mm)', s1n: '単色PLA + サポートロス10%',
    s2: '多色バッジ (内蔵STL · 92×92×26 mm)', s2n: '色替えパージ+20%想定',
    s3: '中型マルチカラー胸像 (120 g シナリオ)', s3n: 'AMS色替えパージ含む (+22%)',
    note: '上位2行の体積・重量はBaski HesapローカルSTLパーサー（インフィル20%、PLA密度1.24g/cm³）の実測値です。電気代31円/kWh・償却費40円/時間で計算しています。',
    para: 'JPY', bazPla: 2600, bazPlus: 2900, kwh: 31, amp: 40,
    canliEtiket: '日本国内フィラメント参考価格:',
    faq: [
      { soru: 'MeshyやHi3Dの書き出しデータはそのまま印刷できますか？', cevap: 'はい。.stl・.obj・.3mfをBambu StudioやOrcaSlicer、Curaに読み込み、必要に応じて非多様体修復とサポートを有効にしてスライスできます。' },
      { soru: 'なぜ多色印刷は単色よりフィラメント代が高くなりますか？', cevap: '色を切り替えるたびにノズル内の旧色をパージするため、通常15%〜25%ほど追加のフィラメントを消費します。' },
    ],
  },
});

export function globalAi3dRehberiHtml(dil = 'en', tabanUrl = '', tumUrunler = []) {
  const kod = dil === 'fr' ? 'fr' : (dil === 'ja' ? 'ja' : 'en');
  const t = GLOBAL_AI_REHBER_KOPYA[kod];
  const aiLink = aiModelPartnerLinkleri();
  const meshyRel = aiLink.meshyAfiliye ? 'noopener sponsored nofollow' : 'noopener';
  const hi3dRel = aiLink.hi3dAfiliye ? 'noopener sponsored nofollow' : 'noopener';
  const canonicalUrl = `${tabanUrl}${GLOBAL_AI_REHBER_YOLLARI[kod]}`;
  const malYol = GLOBAL_MALIYET_YOLLARI[kod];
  const guidesIndex = GLOBAL_REHBER_YOLLARI[kod];

  const plaUrun = enUcuzPlaBul(tumUrunler, false) || enUcuzPlaBul(tumUrunler, true);
  const plaPlusUrun = enUcuzPlaBul(tumUrunler, true) || plaUrun;
  const paraKodu = plaUrun?.paraBirimi || t.para;
  const plaKg = plaUrun?.enUcuzFiyat > 0 ? Number(plaUrun.enUcuzFiyat) : t.bazPla;
  const plaPlusKg = plaPlusUrun?.enUcuzFiyat > 0 ? Number(plaPlusUrun.enUcuzFiyat) : t.bazPlus;

  const senaryolar = [
    { ad: t.s1, not: t.s1n, gram: 43.3, sureSa: 3.5, kg: plaKg, carpan: 1.10 },
    { ad: t.s2, not: t.s2n, gram: 36.2, sureSa: 2.9, kg: plaPlusKg, carpan: 1.20 },
    { ad: t.s3, not: t.s3n, gram: 120, sureSa: 9.6, kg: plaPlusKg, carpan: 1.22 },
  ].map((s) => {
    const etkinGram = s.gram * s.carpan;
    const mat = (etkinGram / 1000) * s.kg;
    const el = s.sureSa * 0.15 * t.kwh;
    const am = s.sureSa * t.amp;
    return { ...s, etkinGram, mat, toplam: mat + el + am };
  });

  const sss = sssBolumu(t.faq);
  const canliMetin = plaUrun
    ? `${t.canliEtiket} ${htmlKacis(plaUrun.ad)} — <b>${formatPara(plaKg, paraKodu)}/kg</b>`
    : `${t.canliEtiket} <b>${formatPara(plaKg, paraKodu)}/kg</b>`;

  return sayfaIskeleti({
    title: t.title,
    description: t.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    dil: kod,
    dilYolHaritasi: GLOBAL_AI_REHBER_YOLLARI,
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: t.title.replace(/ \| Baski Hesap$/, ''),
        description: t.desc,
        inLanguage: kod,
        mainEntityOfPage: canonicalUrl,
        dateModified: new Date().toISOString().slice(0, 10),
        author: { '@type': 'Organization', name: 'Baskı Hesap' },
        publisher: { '@type': 'Organization', name: 'Baskı Hesap' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t.home, item: `${tabanUrl}/${kod}` },
          { '@type': 'ListItem', position: 2, name: t.guides, item: `${tabanUrl}${guidesIndex}` },
          { '@type': 'ListItem', position: 3, name: t.crumb, item: canonicalUrl },
        ],
      },
      ...(sss.jsonLd ? [sss.jsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/${kod}">${htmlKacis(t.home)}</a> › <a href="${htmlKacis(guidesIndex)}">${htmlKacis(t.guides)}</a> › <span>${htmlKacis(t.crumb)}</span></nav>
      ${heroAlani({
        rozet: t.rozet,
        baslikHtml: t.h1,
        altMetin: t.alt,
        istatistikler: [
          `PLA: <b>${formatPara(plaKg, paraKodu)}/kg</b>`,
          '43.3 g &amp; 36.2 g STLs',
          '+15–25% purge',
        ],
      })}
      <section class="seo-kart">
        <div class="seo-fiyat-kutu"><div>${canliMetin}</div></div>
        <div class="seo-butonlar">
          <a class="seo-cta" href="${htmlKacis(malYol)}">${t.ctaCalc}</a>
          <a class="seo-cta ikincil" href="${htmlKacis(aiLink.meshyUrl)}" target="_blank" rel="${meshyRel}" data-afiliye-site="meshy">${t.ctaMeshy}${aiLink.meshyPromo ? ` · ${htmlKacis(aiLink.meshyPromo)}` : ''}</a>
          <a class="seo-cta ikincil" href="${htmlKacis(aiLink.hi3dUrl)}" target="_blank" rel="${hi3dRel}" data-afiliye-site="hi3d">${t.ctaHi3d}${aiLink.hi3dPromo ? ` · ${htmlKacis(aiLink.hi3dPromo)}` : ''}</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${t.vsH2}</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>${t.th1}</th><th>${t.th2}</th><th>${t.th3}</th></tr></thead>
            <tbody>${t.rows.map(([a, b, c]) => `<tr><td><b>${htmlKacis(a)}</b></td><td>${b}</td><td>${c}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${t.costH2}</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>${t.mTh1}</th><th>${t.mTh2}</th><th>${t.mTh3}</th><th>${t.mTh4}</th><th>${t.mTh5}</th></tr></thead>
            <tbody>${senaryolar.map(s => `<tr>
              <td><b>${htmlKacis(s.ad)}</b><br><span class="seo-mini-alt">${s.not}</span></td>
              <td>${s.gram} g → <b>${Math.round(s.etkinGram)} g</b></td>
              <td>~${s.sureSa} h</td>
              <td>${formatPara(s.mat, paraKodu)}</td>
              <td><b style="color:var(--yesil)">${formatPara(s.toplam, paraKodu)}</b></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="ipucu" style="margin:10px 0 0">${htmlKacis(t.note)}</p>
      </section>
      ${basSatAkisBolumuHtml(kod)}
      ${sss.html}`,
  });
}
