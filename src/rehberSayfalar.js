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
import { htmlKacis, sayfaIskeleti } from './seoSayfalar.js';
import { formatTL } from './util.js';

function urunBul(tumUrunler, regex) {
  return tumUrunler.find(u => regex.test(`${u.ad} ${u.slug} ${u.sorgu}`)) || null;
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
      ${kazananMi ? '<span class="seo-vs-etiket">🏷️ BUGÜN EN UCUZ</span>' : ''}
      <div class="seo-vs-baslik">
        ${u?.gorsel ? `<img class="seo-vs-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad || baslik)}" loading="lazy" />` : ''}
        <div class="seo-mini-ad">${htmlKacis(u?.ad || baslik)}</div>
      </div>
      <div class="seo-mini-fiyat">${fiyatMetin}</div>
      <div class="seo-mini-alt">${altMetin}</div>
      <div class="seo-butonlar" style="margin-top:auto">
        <a class="seo-cta" style="padding:8px 14px;font-size:13px" href="${htmlKacis(detayHref)}">${u ? 'Tüm Teklifleri Gör' : 'Canlı Tara ⚡'}</a>
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
    <h2 style="margin-top:0">❓ Sık Sorulan Sorular</h2>
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
      <a href="/rehber">📖 Tüm Rehberler</a>
      <a href="/kategori/3d-yazici">🖨️ 3D Yazıcı Fiyatları</a>
      <a href="/kategori/pla-filament">🧵 PLA &amp; PLA+ Filamentler</a>
      <a href="/kategori/petg-tpu-filament">🦾 PETG, TPU &amp; ABS</a>
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
];

function madalya(idx) {
  if (idx === 0) return '🥇 #1';
  if (idx === 1) return '🥈 #2';
  if (idx === 2) return '🥉 #3';
  return `#${idx + 1}`;
}

function enUcuzPlaRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/en-ucuz-pla-filament`;
  const plaUrunler = tumUrunler
    .filter(u => u.kategoriSlug === 'pla-filament' && u.enUcuzFiyat > 0)
    .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat);

  const satirlar = plaUrunler.map((u, idx) => `
    <tr>
      <td><span class="sira-madalya">${madalya(idx)}</span></td>
      <td><a href="${htmlKacis(u.yol)}" style="color:var(--ana);font-weight:700;text-decoration:none">${htmlKacis(u.ad)}</a></td>
      <td>${htmlKacis(u.enUcuzSite || '—')}</td>
      <td>${u.stokluSayisi || 1} mağaza</td>
      <td><b style="color:var(--yesil)">${formatTL(u.enUcuzFiyat)}</b></td>
      <td>${u.enUcuzUrl ? `<a class="seo-cta ikincil" style="padding:5px 10px;font-size:12px" href="${htmlKacis(u.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">Mağaza ↗</a>` : `<a href="${htmlKacis(u.yol)}">İncele</a>`}</td>
    </tr>`).join('');

  const sss = sssBolumu([
    { soru: 'Bu listedeki PLA fiyatlarına kargo dahil mi?', cevap: 'Evet. Kargo ücreti bilinen tüm mağazalarda kargo bedeli toplama eklenerek sıralama yapılır; sepette kargo hesaplayan mağazalar ise ürün sayfasında açıkça işaretlenir.' },
    { soru: 'Çoklu PLA alırken kargodan nasıl tasarruf edilir?', cevap: 'Akıllı Sepet aracında istediğiniz filamentleri girerseniz, sistem mağazaların ücretsiz kargo eşiklerini hesaplayıp tek mağaza mı yoksa bölünmüş sepet mi daha ucuz olduğunu çıkarır.' },
  ]);

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Rehberler', item: `${tabanUrl}/rehber` },
        { '@type': 'ListItem', position: 3, name: 'En Ucuz PLA Filamentler', item: canonicalUrl },
      ],
    },
    ...(plaUrunler.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: plaUrunler.slice(0, 20).map((u, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${tabanUrl}${u.yol}`,
        name: u.ad,
      })),
    }] : []),
    ...(sss.jsonLd ? [sss.jsonLd] : []),
  ];

  const enUcuz = plaUrunler[0];
  return sayfaIskeleti({
    title: 'Kilogramı En Ucuz PLA Filamentler — Canlı Türkiye Sıralaması | Baskı Hesap',
    description: 'Sunlu, Porima, Creality Ender PLA, eSun ve diğer 1.75mm PLA filamentlerin kargo dahil en ucuz güncel fiyat sıralaması.',
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    jsonLdList,
    aktifNav: 'rehber',
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <a href="/rehber">Rehberler</a> › <span>En Ucuz PLA Filamentler</span></nav>
      ${heroAlani({
        rozet: '🏷️ Canlı ₺/kg PLA Sıralaması',
        baslikHtml: 'Türkiye\'nin <b>en ucuz PLA</b> filamentleri',
        altMetin: '60+ mağazadan çekilen kargo dahil stoklu 1.75mm PLA ve PLA+ filament teklifleri en düşük fiyattan başlayarak otomatik sıralanır.',
        istatistikler: [
          enUcuz ? `🥇 Lider: <b>${htmlKacis(enUcuz.ad)} · ${formatTL(enUcuz.enUcuzFiyat)}</b>` : '🔍 Canlı sıralama',
          `📦 <b>${plaUrunler.length}</b> stoklu model`,
          '🚚 Kargo dahil kıyas',
        ],
      })}
      <section class="seo-kart">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <h2 style="margin:0">Güncel Kargo Dahil PLA Sıralaması</h2>
          <a class="seo-cta" style="padding:9px 15px;font-size:13px" href="/sepet.html">🧺 Çoklu Filamentte Kargoyu Sıfırla</a>
        </div>
        ${plaUrunler.length
          ? `<div style="overflow-x:auto"><table class="seo-tablo"><thead><tr><th>Sıra</th><th>Ürün</th><th>En Ucuz Mağaza</th><th>Teklif</th><th>Toplam</th><th>Link</th></tr></thead><tbody>${satirlar}</tbody></table></div>`
          : '<p>Henüz taraması tamamlanan PLA kaydı yok; ana sayfadan doğrudan aratarak canlı fiyat çekebilirsiniz.</p>'}
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
];

export function rehberSitemapKayitlari() {
  const bugun = new Date().toISOString().slice(0, 10);
  return [
    { yol: '/rehber', oncelik: '0.85', siklik: 'weekly', lastmod: bugun },
    ...REHBER_SAYFALARI.map(r => ({ yol: r.yol, oncelik: '0.85', siklik: 'daily', lastmod: bugun })),
  ];
}

export function rehberDiziniHtml(tabanUrl, tumUrunler = []) {
  const canonicalUrl = `${tabanUrl}/rehber`;
  const title = '3D Yazıcı Karşılaştırma ve Filament Rehberleri | Baskı Hesap';
  const description = 'Bambu Lab, Creality, Elegoo 3D yazıcı karşılaştırmaları, canlı en ucuz PLA filament sıralaması ve 3D baskı maliyet rehberleri.';

  const kartlar = REHBER_SAYFALARI.map(r => {
    const canliNot = typeof r.canliOzet === 'function' ? r.canliOzet(tumUrunler) : '';
    return `<a class="rehber-kart" href="${htmlKacis(r.yol)}">
      <div class="rehber-kart-ust">
        <span class="rehber-ikon" aria-hidden="true">${r.ikon || '📖'}</span>
        <span class="rehber-rozet">${htmlKacis(r.tur)}</span>
      </div>
      <h2 class="rehber-baslik">${htmlKacis(r.baslik)}</h2>
      <p class="rehber-ozet">${htmlKacis(r.ozet)}</p>
      ${canliNot ? `<div class="rehber-canli-band">⚡ ${htmlKacis(canliNot)}</div>` : ''}
      <span class="rehber-cta">Rehberi İncele →</span>
    </a>`;
  }).join('');

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    aktifNav: 'rehber',
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
        rozet: '📖 Canlı Fiyatlı Karşılaştırmalar · 2026',
        baslikHtml: 'Doğru 3D yazıcıyı <b>gerçek fiyatla</b> seç',
        altMetin: 'Statik blog yazıları değil — her karşılaştırma ve alım rehberi veritabanımızdaki kargo dahil güncel Türkiye mağaza fiyatlarını otomatik çeker.',
        istatistikler: [
          `📚 <b>${REHBER_SAYFALARI.length}</b> canlı rehber`,
          '⚖️ Yan yana VS kıyaslama',
          '🔄 Fiyatlar radardan otomatik güncellenir',
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
