#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baskı Hesap — Evrensel Slicer Post-Processor
================================================

Bambu Studio, OrcaSlicer ve PrusaSlicer'ın "Post-processing scripts" alanına
bu dosyanın yolunu yazın. Slicer, G-Code'u kaydettikten sonra betiği şu
şekilde çağırır:

    en_ucuz_slicer.exe "C:\\path\\to\\model.gcode"

Betik G-Code'un son satırlarındaki meta yorumları okur:

    ; filament used [g] = 340.5
    ; filament_type = PLA
    ; filament_colour = #000000

… ardından Baskı Hesap API'sinden en ucuz stoklu makarayı sorar ve
Windows / macOS / Linux bildirimi gösterir.

GÜVENLİK KURALLARI
------------------
1. **G-Code dosyası ASLA değiştirilmez** — yalnızca okunur (son 200 satır).
2. **Slicer ASLA kilitlenmez**: betik meta veriyi okur, bildirimi AYRI ve
   BAĞIMSIZ bir süreçte başlatır, hemen `exit 0` ile döner. Ağ isteği ve
   bildirim ana dilimleme sürecinde çalışmaz.
3. Ağ yoksa / API hata verirse sessizce çıkar (1,5 sn zaman aşımı).
4. Hiçbir dosya yüklenmez; yalnızca malzeme türü + gramaj gönderilir.

KULLANIM
--------
    python en_ucuz_slicer.py "model.gcode"       # slicer'ın çağırdığı mod
    python en_ucuz_slicer.py --notify '<json>'   # dahili bildirim süreci
    python en_ucuz_slicer.py --test              # kurulum testi
"""

import json
import os
import re
import subprocess
import sys

# ----------------------------------------------------------------------
# Konsol kodlaması (Windows cp1254 ₺ karakterini yazamıyor)
# ----------------------------------------------------------------------
def _cikti_utf8():
    """stdout/stderr'ı UTF-8'e çevirir; başarısız olursa sessizce geçer."""
    for akis_adi in ("stdout", "stderr"):
        akis = getattr(sys, akis_adi, None)
        if akis is None:
            continue
        try:
            akis.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


# ----------------------------------------------------------------------
# Ayarlar
# ----------------------------------------------------------------------
API_TABAN_DEFAULT = os.environ.get("BASKIHESAP_API", "https://baskihesap.tech").rstrip("/")
API_YOL = "/api/embed/oner"
ZAMAN_ASIMI = 1.5          # saniye (spec)
SON_SATIR_SAYISI = 200     # G-Code'un sonu taranır

# Slicer'a göre kaynak etiketi
KAYNAK_ETIKETI = {
    "bambu": "bambu",
    "orca": "orca",
    "prusa": "prusa",
}

# Renk kodu → Türkçe ad
RENK_ADLARI = {
    "000000": "Siyah", "ffffff": "Beyaz", "ff0000": "Kırmızı",
    "00ff00": "Yeşil", "0000ff": "Mavi", "ffff00": "Sarı",
    "ffa500": "Turuncu", "800080": "Mor", "ffc0cb": "Pembe",
    "808080": "Gri", "c0c0c0": "Gümüş", "a52a2a": "Kahverengi",
    "008080": "Turkuaz", "4b0082": "Lacivert", "d4af37": "Altın",
}


# ----------------------------------------------------------------------
# G-Code ayrıştırma
# ----------------------------------------------------------------------
def _sayi(metin):
    """'340.5' / '340,5' → float; geçersizse None."""
    try:
        return float(str(metin).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


def _renk_adi(hex_kod):
    """'#000000' → 'Siyah'. Bilinmiyorsa None."""
    if not hex_kod:
        return None
    kod = str(hex_kod).strip().lstrip("#").lower()
    if not re.fullmatch(r"[0-9a-f]{6}", kod):
        return None
    if kod in RENK_ADLARI:
        return RENK_ADLARI[kod]
    # En yakın temel renk (kaba ama dürüst: yalnızca çok yakınsa eşle)
    hedef = tuple(int(kod[i:i + 2], 16) for i in (0, 2, 4))
    en_yakin, en_mesafe = None, 10 ** 9
    for k, ad in RENK_ADLARI.items():
        r = tuple(int(k[i:i + 2], 16) for i in (0, 2, 4))
        d = sum((a - b) ** 2 for a, b in zip(hedef, r))
        if d < en_mesafe:
            en_yakin, en_mesafe = ad, d
    # 3 kanalda 40 birim ortalama farktan fazlaysa isim uydurmayalım
    return en_yakin if en_mesafe <= 3 * (40 ** 2) else None


def _coklu_sayi_topla(metin):
    """'120.5, 45.2' ya da '340.5' satırındaki tüm pozitif sayıları toplar."""
    parcalar = re.findall(r"[\d]+(?:[.,][\d]+)?", str(metin or ""))
    degerler = [_sayi(p) for p in parcalar]
    degerler = [v for v in degerler if v and v > 0]
    return round(sum(degerler), 2) if degerler else None


def _baski_suresi_dk(metin):
    """'estimated printing time ... = 2h 15m 10s' veya '1d 3h 20m' satırını dakikaya çevirir."""
    m = re.search(
        r";\s*estimated printing time[^:=\r\n]*[:=]\s*([^\r\n]+)",
        metin,
        re.IGNORECASE,
    )
    if not m:
        return None
    s = m.group(1)
    gun = re.search(r"(\d+)\s*(?:d|g)", s, re.IGNORECASE)
    saat = re.search(r"(\d+)\s*(?:h|s\b)", s, re.IGNORECASE)
    dk = re.search(r"(\d+)\s*m\b", s, re.IGNORECASE)
    sn = re.search(r"(\d+)\s*s\b", s, re.IGNORECASE)
    toplam = (
        (int(gun.group(1)) * 1440 if gun else 0)
        + (int(saat.group(1)) * 60 if saat else 0)
        + (int(dk.group(1)) if dk else 0)
        + (round(int(sn.group(1)) / 60.0) if sn else 0)
    )
    return toplam if toplam > 0 else None


def gcode_meta_ayikla(dosya_yolu):
    """
    G-Code dosyasının son 200 satırından filament meta verisini çıkarır.

    Desteklenen biçimler:
      ; filament used [g] = 340.5         (Prusa/Bambu/Orca tek veya AMS virgüllü)
      ; total filament used [g] = 340
      ; total filament weight [g] : 185.4
      ; filament used [mm] = 1025.5       (gram yoksa mm → g)
      ; filament_type = PLA               (veya PLA;PETG)
      ; filament_colour = #000000
      ; estimated printing time ... = 2h 15m

    @returns {{gramaj:float|None, malzeme:str, renk:str|None, sureDk:int|None, kaynak:str}}
    """
    sonuc = {"gramaj": None, "malzeme": "PLA", "renk": None, "sureDk": None, "kaynak": "prusa"}

    try:
        with open(dosya_yolu, "r", encoding="utf-8", errors="replace") as f:
            satirlar = f.readlines()[-SON_SATIR_SAYISI:]
    except OSError:
        return sonuc

    metin = "".join(satirlar)

    # --- Gramaj (gram) — AMS / çok renkli virgüllü listeleri de destekler ---
    for desen in (
        r";\s*total filament (?:used|weight) \[g\]\s*[:=]\s*([^\r\n]+)",
        r";\s*filament used \[g\]\s*[:=]\s*([^\r\n]+)",
        r";\s*filament_used_g\s*[:=]\s*([^\r\n]+)",
    ):
        for m in re.finditer(desen, metin, re.IGNORECASE):
            deger = _coklu_sayi_topla(m.group(1))
            if deger and deger > 0:
                if sonuc["gramaj"] is None or deger > sonuc["gramaj"]:
                    sonuc["gramaj"] = deger

    # --- Gramaj (mm) → gram (1,75 mm PLA ≈ 2,98 g/m) ---
    if sonuc["gramaj"] is None:
        for m in re.finditer(r";\s*filament used \[mm\]\s*[:=]\s*([^\r\n]+)", metin, re.IGNORECASE):
            mm = _coklu_sayi_topla(m.group(1))
            if mm and mm > 0:
                g = mm / 1000.0 * 2.98
                if sonuc["gramaj"] is None or g > sonuc["gramaj"]:
                    sonuc["gramaj"] = round(g, 2)

    # --- Malzeme (AMS çoklu "PLA;PETG" → ilk geçerli malzeme) ---
    m = re.search(r";\s*filament_type\s*=\s*([^\r\n]+)", metin, re.IGNORECASE)
    if m:
        ilk = re.split(r"[;,\s]+", m.group(1).strip())[0]
        temiz = re.sub(r"[^A-Za-z0-9+\-]", "", ilk).upper()
        if temiz:
            sonuc["malzeme"] = temiz

    # --- Renk ---
    m = re.search(r";\s*filament_colou?r\s*=\s*(#[0-9A-Fa-f]{6})", metin, re.IGNORECASE)
    if m:
        sonuc["renk"] = _renk_adi(m.group(1))

    # --- Tahmini baskı süresi (dakika) ---
    sonuc["sureDk"] = _baski_suresi_dk(metin)

    # --- Kaynak tahmini (yalnızca etiket için; davranışı değiştirmez) ---
    alt = metin.lower()
    if "bambu" in alt:
        sonuc["kaynak"] = "bambu"
    elif "orca" in alt:
        sonuc["kaynak"] = "orca"
    elif "prusa" in alt:
        sonuc["kaynak"] = "prusa"

    return sonuc


# ----------------------------------------------------------------------
# Bildirim (ayrı süreçte çalışır)
# ----------------------------------------------------------------------
def _windows_toast(baslik, govde, link):
    """Windows: tıklanınca tarayıcıyı açabilen PowerShell toast bildirimi."""
    if link:
        script = (
            "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, "
            "ContentType = WindowsRuntime] > $null;"
            "$Sablon = [Windows.UI.Notifications.ToastNotificationManager]::"
            "GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);"
            "$Metinler = $Sablon.GetElementsByTagName('text');"
            "$Metinler.Item(0).AppendChild($Sablon.CreateTextNode($env:ENU_TITLE)) > $null;"
            "$Metinler.Item(1).AppendChild($Sablon.CreateTextNode($env:ENU_BODY)) > $null;"
            "if ($env:ENU_LINK) { "
            "$Sablon.DocumentElement.SetAttribute('activationType', 'protocol'); "
            "$Sablon.DocumentElement.SetAttribute('launch', $env:ENU_LINK); "
            "}"
            "$toast = [Windows.UI.Notifications.ToastNotification]::new($Sablon);"
            "$toast.Tag = 'BaskiHesap';"
            "[Windows.UI.Notifications.ToastNotificationManager]::"
            "CreateToastNotifier('Baskı Hesap').Show($toast);"
        )
        ortam = dict(os.environ, ENU_TITLE=baslik, ENU_BODY=govde, ENU_LINK=str(link))
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                capture_output=True, timeout=8, env=ortam,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return True
        except Exception:
            pass
    return False


def _tkinter_pencere(baslik, govde, link):
    """Son çare: 10 sn sonra kapanan küçük Tkinter penceresi (butonlu)."""
    try:
        import tkinter as tk
        import webbrowser

        kok = tk.Tk()
        kok.title(baslik)
        kok.attributes("-topmost", True)
        kok.geometry("420x160")
        kok.resizable(False, False)

        etiket = tk.Label(kok, text=govde, wraplength=390, justify="left",
                          font=("Segoe UI", 9), padx=14, pady=12)
        etiket.pack(fill="both", expand=True)

        if link:
            def _ac():
                webbrowser.open(link)
                kok.destroy()

            tk.Button(kok, text="Satın Al / İncele", command=_ac,
                      bg="#047857", fg="white", font=("Segoe UI", 9, "bold"),
                      relief="flat", padx=12, pady=4).pack(pady=(0, 10))

        kok.after(10000, kok.destroy)  # 10 sn sonra otomatik kapan
        kok.mainloop()
        return True
    except Exception:
        return False


def bildirim_goster(baslik, govde, link=None):
    """Platforma göre bildirim gösterir. Hata fırlatmaz."""
    platform = sys.platform
    try:
        if platform.startswith("win"):
            if _windows_toast(baslik, govde, link):
                return True
            return _tkinter_pencere(baslik, govde, link)

        if platform == "darwin":
            betik = 'display notification %s with title %s' % (
                json.dumps(govde), json.dumps(baslik),
            )
            subprocess.run(["osascript", "-e", betik], capture_output=True, timeout=8)
            return True

        # Linux
        subprocess.run(
            ["notify-send", baslik, govde], capture_output=True, timeout=8,
        )
        return True
    except Exception:
        return False


# ----------------------------------------------------------------------
# API sorgusu
# ----------------------------------------------------------------------
def api_sorgula(malzeme, gramaj, renk=None, kaynak="orca", taban=None, sure_dk=None):
    """API'yi sorgular. Hata/zaman aşımında None döner."""
    taban = (taban or API_TABAN_DEFAULT).rstrip("/")
    parametreler = "malzeme=%s&gramaj=%s&kaynak=%s" % (
        _url_kodla(malzeme), _url_kodla(gramaj), _url_kodla(kaynak),
    )
    if renk:
        parametreler += "&renk=" + _url_kodla(renk)
    if sure_dk:
        parametreler += "&sureDk=" + _url_kodla(sure_dk)
    url = "%s%s?%s" % (taban, API_YOL, parametreler)

    try:
        import urllib.request
        istek = urllib.request.Request(
            url, headers={"User-Agent": "BaskiHesap-Slicer/1.0"},
        )
        with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI) as yanit:
            return json.loads(yanit.read().decode("utf-8"))
    except Exception:
        return None


def _url_kodla(deger):
    try:
        from urllib.parse import quote
        return quote(str(deger), safe="")
    except Exception:
        return str(deger)


# ----------------------------------------------------------------------
# Bildirim sürecini AYRI ve BAĞIMSIZ başlat (slicer'ı kilitlemez)
# ----------------------------------------------------------------------
def bildirimi_ayri_baslat(meta, taban):
    """
    Bildirimi kendi sürecinde başlatır ve hemen döner.

    Böylece slicer'ın post-processing adımı milisaniyeler içinde biter;
    ağ beklemesi ve pencere açılışı ayrı süreçte olur.
    """
    yuk = json.dumps({
        "malzeme": meta.get("malzeme"),
        "gramaj": meta.get("gramaj"),
        "renk": meta.get("renk"),
        "sureDk": meta.get("sureDk"),
        "kaynak": meta.get("kaynak"),
        "taban": taban,
    }, ensure_ascii=False)

    # Python yorumlayıcısı: donmuş (PyInstaller) ise kendi exe'miz
    if getattr(sys, "frozen", False):
        komut = [sys.executable, "--notify", yuk]
    else:
        komut = [sys.executable, os.path.abspath(__file__), "--notify", yuk]

    kwargs = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if sys.platform.startswith("win"):
        # DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP: ebeveyn çıksa da yaşar
        kwargs["creationflags"] = (
            getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
            | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
            | getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        )
    else:
        kwargs["start_new_session"] = True

    try:
        subprocess.Popen(komut, **kwargs)
        return True
    except Exception:
        return False


# ----------------------------------------------------------------------
# Ana akış
# ----------------------------------------------------------------------
def ana(argv):
    _cikti_utf8()
    # 1) Dahili bildirim modu
    if len(argv) >= 3 and argv[1] == "--notify":
        try:
            istek = json.loads(argv[2])
        except Exception:
            return 0
        gramaj = istek.get("gramaj")
        malzeme = istek.get("malzeme") or "PLA"
        if not gramaj:
            return 0
        veri = api_sorgula(malzeme, gramaj, istek.get("renk"),
                           istek.get("kaynak") or "orca", istek.get("taban"), istek.get("sureDk"))
        if not veri or veri.get("status") != "success" or not veri.get("enUcuz"):
            return 0
        en_ucuz = veri["enUcuz"]
        link = en_ucuz.get("yonlendirmeLinki") or en_ucuz.get("hamLink")
        baslik = "⚡ Baskı Hesap: Filament Fırsatı"
        govde = veri.get("bildirimMetni") or (
            "Bu baskı %.0f g %s harcayacak. En ucuz makara ₺%.2f (%s)."
            % (float(gramaj), malzeme, float(en_ucuz.get("fiyat") or 0),
               en_ucuz.get("magaza") or "")
        )
        bildirim_goster(baslik, govde, link)
        return 0

    # 2) Kurulum testi
    if len(argv) >= 2 and argv[1] == "--test":
        print("Baskı Hesap — Slicer eklentisi kurulum testi")
        print("API:", API_TABAN_DEFAULT + API_YOL)
        veri = api_sorgula("PLA", 340, None, "test")
        if not veri:
            print("SONUÇ: API'ye ulaşılamadı (internet/bağlantı kontrolü).")
            return 1
        print("SONUÇ:", veri.get("status"), "|", veri.get("bildirimMetni"))
        ok = bildirim_goster("⚡ Baskı Hesap", "Kurulum testi başarılı!", None)
        print("Bildirim:", "gösterildi" if ok else "gösterilemedi (sorun değil)")
        return 0

    # 3) Slicer modu: G-Code yolu verilir
    if len(argv) < 2:
        return 0

    dosya = argv[1]
    if not os.path.isfile(dosya):
        return 0  # slicer bazen geçici dosya vermez → sessiz çık

    meta = gcode_meta_ayikla(dosya)
    if not meta.get("gramaj"):
        return 0  # gramaj yoksa sorgu anlamsız

    # Bildirimi ayrı süreçte başlat → bu betik HEMEN döner.
    bildirimi_ayri_baslat(meta, API_TABAN_DEFAULT)

    # G-Code dosyasına DOKUNULMAZ. Slicer'ın devam etmesi için 0 döneriz.
    return 0


if __name__ == "__main__":
    try:
        sys.exit(ana(sys.argv))
    except Exception:
        # Ne olursa olsun slicer'ı durdurmayalım.
        sys.exit(0)
