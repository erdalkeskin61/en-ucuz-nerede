# -*- coding: utf-8 -*-
"""
En Ucuz Nerede — Filament Maliyet Radarı (Cura eklentisi)

Dilimleme bittiğinde harcanacak filament gramajını okur, En Ucuz Nerede
API'sinden (GET /api/embed/oner) en ucuz stoklu makarayı sorar ve Cura
içinde tek tıkla satın alma bağlantısı olan bir bildirim gösterir.

TASARIM KURALLARI
-----------------
* Cura akışını ASLA yavaşlatmaz: ağ isteği ayrı bir daemon thread'de yapılır.
* API erişilemezse / zaman aşımı olursa sessizce hiçbir şey göstermez
  (dilimleme asla kesintiye uğramaz).
* Hiçbir dosya değiştirilmez, hiçbir veri toplanmaz: yalnızca malzeme türü,
  gramaj ve kaynak adı gönderilir.
"""

import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from UM.Extension import Extension
from UM.Logger import Logger
from UM.Message import Message

# Test / kendi sunucunuz için ortam değişkeniyle geçersiz kılınabilir.
API_TABAN = os.environ.get("ENUCUZ_API", "https://enucuznerede.com").rstrip("/")
API_YOL = "/api/embed/oner"
ZAMAN_ASIMI = 1.5  # saniye — dilimlemeyi kilitlememeli

# Cura malzeme adı → API malzeme ailesi
MALZEME_ESLEME = {
    "PLA": "PLA",
    "PLA+": "PLA",
    "TOUGH PLA": "PLA",
    "PLA-CF": "PLA-CF",
    "PETG": "PETG",
    "ABS": "ABS",
    "ASA": "ASA",
    "TPU": "TPU",
    "FLEXIBLE": "TPU",
    "NYLON": "PA",
    "PA": "PA",
    "PC": "PC",
    "POLYCARBONATE": "PC",
}

# 1,75 mm PLA için metre → gram (π·0,875² · 100 cm · 1,24 g/cm³ ≈ 2,98 g/m)
METRE_GRAM = 2.98


def malzeme_adi(ham):
    """Cura malzeme adını API'nin beklediği aile adına çevirir."""
    s = str(ham or "").strip().upper()
    if not s:
        return "PLA"
    if s in MALZEME_ESLEME:
        return MALZEME_ESLEME[s]
    for anahtar in sorted(MALZEME_ESLEME, key=len, reverse=True):
        if anahtar in s:
            return MALZEME_ESLEME[anahtar]
    ilk = s.split()[0] if s.split() else "PLA"
    return MALZEME_ESLEME.get(ilk, "PLA")


def gramaj_hesapla(print_information, malzeme_index=0):
    """
    Cura'dan gramajı okur.

    Sıra: materialWeights (gram) → materialAmounts (metre) × yoğunluk.
    Hiçbiri yoksa None döner — UYDURMA değer üretilmez.
    """
    for okuma in (
        lambda: print_information.getMaterialWeights(),
        lambda: print_information.materialWeights,
    ):
        try:
            degerler = okuma()
            if degerler is not None and len(degerler) > malzeme_index:
                g = float(degerler[malzeme_index])
                if g > 0:
                    return round(g, 2)
        except Exception:
            pass

    for okuma in (
        lambda: print_information.getMaterialAmounts(),
        lambda: print_information.materialAmounts,
    ):
        try:
            degerler = okuma()
            if degerler is not None and len(degerler) > malzeme_index:
                metre = float(degerler[malzeme_index])
                if metre > 0:
                    return round(metre * METRE_GRAM, 2)
        except Exception:
            pass
    return None


def malzeme_listesi(print_information):
    """Kullanılan malzeme adları (materialNames)."""
    for okuma in (
        lambda: print_information.getMaterialNames(),
        lambda: print_information.materialNames,
    ):
        try:
            adlar = okuma()
            if adlar:
                return list(adlar)
        except Exception:
            pass
    return []


def api_sorgula(malzeme, gramaj, kaynak="cura"):
    """
    API'yi sorgular. Hata/ zaman aşımında None döner — asla exception fırlatmaz.
    """
    try:
        parametreler = urllib.parse.urlencode({
            "malzeme": malzeme,
            "gramaj": gramaj,
            "kaynak": kaynak,
        })
        url = "%s%s?%s" % (API_TABAN, API_YOL, parametreler)
        istek = urllib.request.Request(
            url, headers={"User-Agent": "EnUcuzNerede-Cura/1.0"},
        )
        with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI) as yanit:
            return json.loads(yanit.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as hata:
        Logger.log("d", "[EnUcuzNerede] Sorgu başarısız (sessiz): %s", hata)
        return None
    except Exception as hata:  # noqa: BLE001
        Logger.log("w", "[EnUcuzNerede] Beklenmeyen hata: %s", hata)
        return None


class EnUcuzNeredeExtension(Extension):
    """Cura eklenti girişi."""

    def __init__(self):
        super().__init__()
        self._bagli = False
        self._deneme = 0

    # -- bağlama --------------------------------------------------------
    def baglanmayi_planla(self):
        """
        CuraApplication henüz hazır değilse 2 sn aralıkla 15 kez dener.
        QTimer yoksa tek denemeyle kalır (Cura'nın kendi döngüsü yoksa).
        """
        if self.cerceve_bagla():
            return
        try:
            from PyQt6.QtCore import QTimer  # Cura 5+ / 6 / 7
        except Exception:
            try:
                from PyQt5.QtCore import QTimer  # eski Cura
            except Exception:
                QTimer = None
        if QTimer is None:
            return

        def _tekrar():
            self._deneme += 1
            if self.cerceve_bagla() or self._deneme >= 15:
                try:
                    zamanlayici.stop()
                except Exception:
                    pass

        zamanlayici = QTimer()
        zamanlayici.timeout.connect(_tekrar)
        zamanlayici.start(2000)

    def cerceve_bagla(self):
        """CuraApplication hazır olduğunda sinyalleri bağlar."""
        if self._bagli:
            return True
        try:
            from cura.CuraApplication import CuraApplication
            uygulama = CuraApplication.getInstance()
            if uygulama is None:
                return False

            # 1) Tercih edilen: dilimleme tamamlandı
            for sinyal_adi in ("sliceProcessFinished", "printingStarted"):
                sinyal = getattr(uygulama, sinyal_adi, None)
                if sinyal is not None and hasattr(sinyal, "connect"):
                    sinyal.connect(self._dilimleme_bitti)
                    self._bagli = True
                    Logger.log("i", "[EnUcuzNerede] Bağlandı: %s", sinyal_adi)
                    return True

            # 2) Yedek: materialAmountsChanged
            try:
                bilgi = uygulama.getPrintInformation()
                sinyal = getattr(bilgi, "materialAmountsChanged", None)
                if sinyal is not None and hasattr(sinyal, "connect"):
                    sinyal.connect(self._dilimleme_bitti)
                    self._bagli = True
                    Logger.log("i", "[EnUcuzNerede] Bağlandı: materialAmountsChanged")
                    return True
            except Exception:
                pass
            return False
        except Exception as hata:  # Cura sürümü farklı olabilir — çökme yok
            Logger.log("w", "[EnUcuzNerede] Sinyal bağlanamadı: %s", hata)
            return False

    # -- olay -----------------------------------------------------------
    def _dilimleme_bitti(self, *args, **kwargs):
        """Sinyal geldiğinde arka planda sorguyu başlatır (bloklamaz)."""
        try:
            from cura.CuraApplication import CuraApplication
            uygulama = CuraApplication.getInstance()
            if uygulama is None:
                return
            bilgi = uygulama.getPrintInformation()
            gramaj = gramaj_hesapla(bilgi)
            if not gramaj or gramaj <= 0:
                return  # dilimlenmiş bir şey yok
            adlar = malzeme_listesi(bilgi)
            malzeme = malzeme_adi(adlar[0] if adlar else "PLA")
        except Exception as hata:
            Logger.log("w", "[EnUcuzNerede] Dilimleme verisi okunamadı: %s", hata)
            return

        # Ağ isteği AYRI thread'de — Cura arayüzü donmaz.
        threading.Thread(
            target=self._sorgula_ve_goster,
            args=(malzeme, gramaj),
            daemon=True,
        ).start()

    def _sorgula_ve_goster(self, malzeme, gramaj):
        veri = api_sorgula(malzeme, gramaj)
        if not veri:
            return
        try:
            if veri.get("status") != "success" or not veri.get("enUcuz"):
                return  # stokta yok → kullanıcıyı boş bildirimle rahatsız etme

            en_ucuz = veri["enUcuz"]
            link = en_ucuz.get("yonlendirmeLinki") or en_ucuz.get("hamLink")
            baslik = "🏷️ En Ucuz Nerede: Filament Fırsatı"
            govde = veri.get("bildirimMetni") or (
                "Bu baskı %.0f g %s harcayacak. En ucuz makara ₺%.2f (%s)."
                % (gramaj, malzeme, float(en_ucuz.get("fiyat") or 0),
                   en_ucuz.get("magaza") or "")
            )
            if link:
                govde = govde + "\n" + link

            mesaj = Message(govde, title=baslik, lifetime=30, dismissable=True)
            if link:
                # addAction imzası Cura sürümüne göre değişebiliyor → korumalı.
                try:
                    mesaj.addAction(
                        "button",
                        "Satın Al / İncele",
                        lambda *_: webbrowser.open(link),
                        icon="",
                    )
                except Exception:
                    pass  # metinde link zaten var
            mesaj.show()
        except Exception as hata:
            Logger.log("w", "[EnUcuzNerede] Bildirim gösterilemedi: %s", hata)
