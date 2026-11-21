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

/** Katalog listesinden ad/slug deseniyle en uygun canlı ürünü bulur. */
function urunBul(tumUrunler, regex) {
  return tumUrunler.find(u => regex.test(`${u.ad} ${u.slug} ${u.sorgu}`)) || null;
}

/** İki canlı ürün kartını yan yana ve fiyat farkını özet kutusu olarak çizer. */
function canliKarsilastirmaKutusu(solUrun, sagUrun, solBaslik, sagBaslik, solSorgu, sagSorgu) {
  const kart = (u, baslik, sorgu) => {
    const fiyatMetin = u?.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara';
    const altMetin = u?.enUcuzFiyat > 0
      ? `${htmlKacis(u.enUcuzSite || 'Mağaza')} · ${u.stokluSayisi || 1} stoklu mağaza`
      : 'Anlık fiyatları 60+ mağazada kontrol et';
    const detayHref = u ? u.yol : `/?url=${encodeURIComponent(sorgu)}`;
    return `<div class="seo-mini-kart" style="gap:10px">
      <div class="seo-mini-ad">${htmlKacis(u?.ad || baslik)}</div>
      <div class="seo-mini-fiyat">${fiyatMetin}</div>
      <div class="seo-mini-alt">${altMetin}</div>
      <div class="seo-butonlar" style="margin-top:4px">
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
      farkNotu = `<div class="seo-fiyat-kutu"><div><b>Canlı Fiyat Özeti:</b> Bugün kargo dahil en ucuz teklifte <b>${htmlKacis(ucuzAd)}</b> <b>${formatTL(fark)} daha uygun</b>.</div></div>`;
    }
  }

  return `${farkNotu}<div class="seo-izgara" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${kart(solUrun, solBaslik, solSorgu)}${kart(sagUrun, sagBaslik, sagSorgu)}</div>`;
}

/** FAQ HTML + FAQPage JSON-LD çifti üretir. */
function sssBolumu(sssListesi) {
  if (!sssListesi?.length) return { html: '', jsonLd: null };
  const html = `<section class="seo-kart">
    <h2 style="margin-top:0">Sık Sorulan Sorular</h2>
    <div style="display:grid;gap:12px">
      ${sssListesi.map(s => `<div style="border-bottom:1px solid var(--cizgi);padding-bottom:10px">
        <h3 style="margin:0 0 6px;font-size:16px">${htmlKacis(s.soru)}</h3>
        <p style="margin:0;color:var(--gri-metin);font-size:14.5px;line-height:1.55">${htmlKacis(s.cevap)}</p>
      </div>`).join('')}
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

  const sss = sssBolumu(tanim.sss);
  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/rehber">Rehber &amp; Karşılaştırmalar</a> › <span>${htmlKacis(tanim.kisaBaslik)}</span>
    </nav>
    <section class="seo-kart">
      <h1 class="seo-baslik">${htmlKacis(tanim.h1)}</h1>
      <p class="seo-alt">${htmlKacis(tanim.ozet)}</p>
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
          <div class="seo-mini-ad">${htmlKacis(tanim.solAd)} kimler için?</div>
          <p style="margin:0;font-size:14px;color:var(--gri-metin);line-height:1.55">${htmlKacis(tanim.solKimler)}</p>
        </div>
        <div class="seo-mini-kart">
          <div class="seo-mini-ad">${htmlKacis(tanim.sagAd)} kimler için?</div>
          <p style="margin:0;font-size:14px;color:var(--gri-metin);line-height:1.55">${htmlKacis(tanim.sagKimler)}</p>
        </div>
      </div>
      <div class="seo-butonlar">
        <a class="seo-cta ikincil" href="/kategori/3d-yazici">Tüm 3D Yazıcı Fiyatları →</a>
        <a class="seo-cta ikincil" href="/rehber/en-ucuz-pla-filament">En Ucuz PLA Filament Sıralaması →</a>
      </div>
    </section>
    ${sss.html}`;

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
  },
  {
    yol: '/karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro',
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
  },
];

function enUcuzPlaRehberiHtml(tumUrunler, tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber/en-ucuz-pla-filament`;
  const plaUrunler = tumUrunler
    .filter(u => u.kategoriSlug === 'pla-filament' && u.enUcuzFiyat > 0)
    .sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat);

  const satirlar = plaUrunler.map((u, idx) => `
    <tr>
      <td><b>#${idx + 1}</b></td>
      <td><a href="${htmlKacis(u.yol)}" style="color:var(--ana);font-weight:700;text-decoration:none">${htmlKacis(u.ad)}</a></td>
      <td>${htmlKacis(u.enUcuzSite || '—')}</td>
      <td>${u.stokluSayisi || 1} mağaza</td>
      <td><b>${formatTL(u.enUcuzFiyat)}</b></td>
      <td>${u.enUcuzUrl ? `<a href="${htmlKacis(u.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">Mağaza ↗</a>` : `<a href="${htmlKacis(u.yol)}">İncele</a>`}</td>
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
      <section class="seo-kart">
        <h1 class="seo-baslik">En Ucuz PLA &amp; PLA+ Filamentler (Canlı Liste)</h1>
        <p class="seo-alt">Türkiye mağazalarından çekilen kargo dahil stoklu PLA filament teklifleri en düşük fiyattan başlayarak otomatik sıralanır.</p>
        ${enUcuz ? `<div class="seo-fiyat-kutu"><div><b>Şu An En Ucuz Stoklu PLA:</b> ${htmlKacis(enUcuz.ad)} — <b style="color:#059669">${formatTL(enUcuz.enUcuzFiyat)}</b> (${htmlKacis(enUcuz.enUcuzSite || '')})</div></div>` : ''}
        <div class="seo-butonlar">
          <a class="seo-cta" href="/sepet.html">🧺 Çoklu Filamentte Kargoyu Sıfırla (Akıllı Sepet)</a>
          <a class="seo-cta ikincil" href="/kategori/pla-filament">PLA Kategorisi →</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">Güncel Kargo Dahil PLA Sıralaması</h2>
        ${plaUrunler.length
          ? `<div style="overflow-x:auto"><table class="seo-tablo"><thead><tr><th>Sıra</th><th>Ürün</th><th>En Ucuz Mağaza</th><th>Teklif</th><th>Toplam</th><th>Link</th></tr></thead><tbody>${satirlar}</tbody></table></div>`
          : '<p>Henüz taraması tamamlanan PLA kaydı yok; ana sayfadan doğrudan aratarak canlı fiyat çekebilirsiniz.</p>'}
      </section>
      ${sss.html}`,
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
      <section class="seo-kart">
        <h1 class="seo-baslik">PLA vs PETG Filament Farkları ve Canlı Fiyatlar</h1>
        <p class="seo-alt">Hangi baskıda PLA, hangisinde PETG seçilmeli? Baskı sıcaklıkları, mekanik farklar ve bugünkü kargo dahil en ucuz makara teklifleri.</p>
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
        <div class="seo-butonlar">
          <a class="seo-cta ikincil" href="/kategori/pla-filament">Tüm PLA Modelleri →</a>
          <a class="seo-cta ikincil" href="/kategori/petg-tpu-filament">Tüm PETG / TPU Modelleri →</a>
        </div>
      </section>
      ${sss.html}`,
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
      <section class="seo-kart">
        <h1 class="seo-baslik">3D Baskı Maliyeti Nasıl Hesaplanır?</h1>
        <p class="seo-alt">Satış veya teklif verirken yalnızca filament gramajına bakmak zarar ettirir. Doğru maliyet hesabı 4 kalemin toplamıdır.</p>
        <div class="seo-fiyat-kutu">
          <div><b>Örnek 100 g / 8 saatlik baskı:</b> ${plaOrnek ? `Bugünkü en ucuz PLA (${htmlKacis(plaOrnek.ad)} ≈ ${formatTL(ornekKg)}/kg) bazında` : '600 TL/kg örnek PLA bazında'} %10 fireli ham madde (~${formatTL(hamMadde)}) + elektrik (~${formatTL(elektrik)}) ≈ <b>${formatTL(toplamMaliyet)}</b> temel maliyet (yıpranma ve işçilik hariç).</div>
        </div>
        <div class="seo-butonlar">
          <a class="seo-cta" href="/maliyet.html">🧮 STL Yükle &amp; Maliyeti Hesapla →</a>
          <a class="seo-cta ikincil" href="/rehber/en-ucuz-pla-filament">Güncel PLA Kg Fiyatları →</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">4 Adımda Baskı Maliyet Formülü</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr><th>Kalem</th><th>Formül / Kural</th><th>Önemli İpucu</th></tr></thead>
            <tbody>
              <tr><td><b>1. Filament + Fire</b></td><td><code>(gram / 1000) × ₺/kg × 1.10</code></td><td>Destek (support), purge kulesi ve olası hatalı baskılar için %10–15 fire ekleyin.</td></tr>
              <tr><td><b>2. Elektrik</b></td><td><code>saat × 0.15 kW × tarife</code></td><td>Kapalı kasa ve yüksek tabla sıcaklığı (PETG/ABS) tüketimi hafif artırır.</td></tr>
              <tr><td><b>3. Makine Yıpranması</b></td><td><code>saat × (yazıcıFiyatı / 2000)</code></td><td>Nozul, PEI tabla, kayış ve fan ömrü her saat başına maliyete yazılmalıdır.</td></tr>
              <tr><td><b>4. Emek &amp; Kâr Marjı</b></td><td><code>(temel + emek) × 2x–3x</code></td><td>Destek temizleme, paketleme ve pazaryeri komisyonu (varsa %15–22) unutulmamalıdır.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      ${sss.html}`,
  });
}

export const REHBER_SAYFALARI = [
  ...YAZICI_KARSILASTIRMALARI.map(y => ({
    yol: y.yol,
    baslik: y.h1,
    ozet: y.description,
    tur: 'Yazıcı Karşılaştırma',
    olustur: (tumUrunler, tabanUrl) => yaziciKarsilastirmaOlustur(y, tumUrunler, tabanUrl),
  })),
  {
    yol: '/rehber/en-ucuz-pla-filament',
    baslik: 'Kilogramı En Ucuz PLA & PLA+ Filamentler (Canlı Sıralama)',
    ozet: 'Türkiye mağazalarında kargo dahil en ucuz stoklu PLA filament tekliflerini anlık karşılaştırın.',
    tur: 'Canlı Sıralama',
    olustur: enUcuzPlaRehberiHtml,
  },
  {
    yol: '/rehber/pla-vs-petg-filament',
    baslik: 'PLA vs PETG Filament Farkları, Ayarlar ve Canlı Fiyatlar',
    ozet: 'Isı dayanımı, esneklik, nozul sıcaklığı ve canlı Türkiye makara fiyatları tek sayfada.',
    tur: 'Malzeme Rehberi',
    olustur: plaVsPetgRehberiHtml,
  },
  {
    yol: '/rehber/3d-baski-maliyeti-nasil-hesaplanir',
    baslik: '3D Baskı Maliyeti Nasıl Hesaplanır? (Filament + Elektrik + Satış)',
    ozet: 'Adım adım baskı maliyet formülü, örnek hesaplama ve ücretsiz STL maliyet hesaplayıcı.',
    tur: 'Maliyet Rehberi',
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

export function rehberDiziniHtml(tabanUrl) {
  const canonicalUrl = `${tabanUrl}/rehber`;
  const title = '3D Yazıcı Karşılaştırma ve Filament Rehberleri | Baskı Hesap';
  const description = 'Bambu Lab, Creality, Elegoo 3D yazıcı karşılaştırmaları, canlı en ucuz PLA filament sıralaması ve 3D baskı maliyet rehberleri.';

  const kartlar = REHBER_SAYFALARI.map(r => `
    <a class="seo-mini-kart" href="${htmlKacis(r.yol)}">
      <div style="font-size:11.5px;font-weight:700;color:var(--ana);text-transform:uppercase">${htmlKacis(r.tur)}</div>
      <div class="seo-mini-ad">${htmlKacis(r.baslik)}</div>
      <div class="seo-mini-alt">${htmlKacis(r.ozet)}</div>
    </a>`).join('');

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
      <section class="seo-kart">
        <h1 class="seo-baslik">3D Yazıcı Karşılaştırmaları &amp; Alım Rehberleri</h1>
        <p class="seo-alt">Statik blog yazıları değil — her rehber sayfası veritabanımızdaki güncel, kargo dahil Türkiye mağaza fiyatlarını otomatik olarak içerir.</p>
        <div class="seo-izgara">${kartlar}</div>
      </section>`,
  });
}

export function rehberSayfasiBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '').toLowerCase();
  return REHBER_SAYFALARI.find(r => r.yol === temiz) || null;
}
