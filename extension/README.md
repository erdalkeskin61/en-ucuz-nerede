# 🏷️ En Ucuz Nerede? — Chrome & Edge Alışveriş Eklentisi (Extension)

Bu eklenti, popüler e-ticaret sitelerinde (Trendyol, Hepsiburada, Amazon TR, MediaMarkt, Vatan, N11, İtopya, Pazarama vb.) bir ürünü incelerken **tek tıkla Türkiye'deki diğer 54 sitedeki en ucuz net fiyatı** bulmanızı sağlar.

---

## 🌟 Öne Çıkan Özellikler

1. **Akıllı Floating Badge (Yüzen Buton):**
   - Desteklenen herhangi bir sitede ürün sayfasına girdiğinizde sağ altta otomatik, şık ve rahatsız etmeyen bir rozet belirir.
   - Ürün adını algılar ve *"54 Sitede Tara ➔"* çağrısı sunar.
   - Tıkladığınızda yeni sekmede karşılaştırma otomatik olarak başlatılır.
   - İstemezseniz tek tıkla (`✕`) o oturum için kapatabilirsiniz.

2. **Tarayıcı Araç Çubuğu Popup Menüsü:**
   - Hangi sitede olduğunuzu ve ürün sayfasını otomatik tespit eder.
   - **Sunucu Durumu:** Yerel sunucunuzun açık olup olmadığını ve 55 sitenin aktifliğini anlık gösterir (`🟢 55 Site Aktif`).
   - Tek tıkla Karşılaştır, Ana Sayfayı Aç veya Fiyat Takiplerim / Ayarlar sayfasına geçiş sağlar.
   - Sunucu adresi varsayılan olarak `http://localhost:3000` ayarlıdır, istenirse yerel ağ IP'si (`http://192.168.1.8:3000`) ile değiştirilebilir.

---

## 🛠️ Kurulum Adımları (Chrome & Microsoft Edge)

### 1. Google Chrome / Brave / Opera için:
1. Tarayıcınızda adres çubuğuna şunu yazıp Enter'a basın:
   ```text
   chrome://extensions/
   ```
2. Sağ üst köşedeki **"Geliştirici modu" (Developer mode)** anahtarını **Açık** konuma getirin.
3. Sol üstte beliren **"Paketlenmemiş öğe yükle" (Load unpacked)** butonuna tıklayın.
4. Açılan dosya seçim penceresinde projenizdeki `extension` klasörünü seçin:
   ```text
   C:\Users\Erdal Keskin\Documents\Varsayılan Proje\en-ucuz-nerede\extension
   ```
5. Eklenti yüklendi! Sağ üstteki yapboz simgesine tıklayıp **En Ucuz Nerede?** eklentisini sabitleyin (Pin).

---

### 2. Microsoft Edge için:
1. Edge adres çubuğuna şunu yazıp Enter'a basın:
   ```text
   edge://extensions/
   ```
2. Sol menünün altındaki **"Geliştirici modu"** anahtarını **Açık** konuma getirin.
3. **"Paketlenmemiş öğeyi yükle"** butonuna tıklayın.
4. `extension` klasörünü seçin ve onaylayın.

---

## 🧪 Nasıl Test Edilir?
1. Uygulamanızın arka planda çalıştığından emin olun (`http://localhost:3000`).
2. Tarayıcınızda herhangi bir ürün sayfasına gidin:
   - Örn: Trendyol veya Hepsiburada'da bir telefon, filament veya kulaklık sayfası.
3. Sayfanın sağ altında beliren **"🏷️ En Ucuz Nerede? — 54 Sitede Tara ➔"** rozetine tıklayın.
4. Veya tarayıcı araç çubuğundaki eklenti simgesine basıp **"Karşılaştır"** deyin.
5. Karşılaştırma sayfası otomatik açılacak ve 55 sitedeki en ucuz fiyatlar semantik doğrulama ile listelenecektir!