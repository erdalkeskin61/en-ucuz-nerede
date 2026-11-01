"""
Net Etkin Fiyat Motoru (Net Effective Price Engine)
====================================================

Bir ürünün ETİKET FİYATINDAN yola çıkarak kullanıcının cebinden gerçekte
çıkacak tutarı hesaplar:

    Net Etkin Fiyat = Etiket − (ürün + sepet + kupon + banka indirimleri)
                      + kargo + hizmet bedeli + (gerekirse vergi/vade farkı)
                      − (sonradan kullanılabilen cashback/puan değeri)

Temel ilkeler:
  * Tüm para hesapları `decimal.Decimal` ile yapılır (kuruş hassasiyeti).
  * İndirimler GERÇEK düzendeki sırayla uygulanır: ürün → sepet → kupon → banka.
  * Yüzde indirimler o anki ara toplam üzerinden hesaplanır; her adımda
    para birimi hassasiyetiyle yuvarlanır (ROUND_HALF_UP — POS sistemleri gibi).
  * Banka kampanyaları kuponlarla birleşemiyorsa motor, kullanıcı için EN İYİ
    geçerli kombinasyonu seçer ve bunu "varsayım" olarak raporlar.
  * Cashback/puan ödeme anında düşülmez (gelecek değer) → ayrı raporlanır:
    payable_now (şimdi ödenecek) vs effective_cost (cashback düşülmüş etkin maliyet).
  * Sahte veri üretilmez: uygulanamayan her indirim, nedeniyle birlikte
    "skipped" listesine yazılır.
"""

from __future__ import annotations

import datetime as _dt
import itertools
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Para yardımcıları
# ---------------------------------------------------------------------------

#: Para birimi başına ondalık basamak sayısı (küsurat hassasiyeti).
CURRENCY_PRECISION: dict[str, int] = {"TRY": 2, "USD": 2, "EUR": 2, "GBP": 2, "JPY": 0}


def _quantize_exp(currency: str) -> Decimal:
    """Para biriminin quantize üssünü döndürür (ör. TRY -> Decimal('0.01'))."""
    basamak = CURRENCY_PRECISION.get(currency, 2)
    return Decimal(1).scaleb(-basamak)


def money(value: Any, currency: str = "TRY") -> Decimal:
    """Değeri Decimal'e çevirip para hassasiyetiyle yuvarlar (ROUND_HALF_UP)."""
    exp = _quantize_exp(currency)
    return Decimal(str(value)).quantize(exp, rounding=ROUND_HALF_UP)


def _dec(value: Any) -> Decimal:
    """Yuvarlamasız Decimal dönüşümü (girdi normalizasyonu için)."""
    if value is None:
        return Decimal(0)
    return value if isinstance(value, Decimal) else Decimal(str(value))


# ---------------------------------------------------------------------------
# Numaralandırmalar
# ---------------------------------------------------------------------------

class DiscountMethod(str, Enum):
    """İndirimin hesaplanma biçimi."""
    PERCENT = "percent"   # value = yüzde (ör. 10 -> %10)
    FIXED = "fixed"       # value = tutar (ör. 50 -> 50 TL)


class StackGroup(str, Enum):
    """İndirim yığılma grubu — uygulama sırasını belirler."""
    PRODUCT = "product"   # ürün indirimi (etiket -> satış fiyatı)
    CART = "cart"         # sepet/kampanya indirimi
    COUPON = "coupon"     # kupon
    BANK = "bank"         # banka/POS kampanyası


class ThresholdBase(str, Enum):
    """Ücretsiz kargo eşiğinin HANGİ tutarla karşılaştırılacağı."""
    AFTER_DISCOUNTS = "after_discounts"   # indirim sonrası ara toplam (en yaygın)
    LIST_PRICE = "list_price"             # etiket/satış fiyatı
    PAYABLE_BEFORE_SHIPPING = "payable_before_shipping"  # kargo öncesi ödenecek


class CashbackBase(str, Enum):
    """Cashback/puanın hangi tutar üzerinden hesaplanacağı."""
    PAYABLE = "payable"           # net ödeme üzerinden
    POST_DISCOUNT = "post_discount"  # indirimli ara toplam üzerinden


# ---------------------------------------------------------------------------
# Veri modeli — girdi şartnamesi
# ---------------------------------------------------------------------------

@dataclass
class DiscountSpec:
    """Genel indirim şartnamesi (sepet/kampanya ve kupon için ortak taban)."""
    id: str
    method: DiscountMethod
    value: Decimal                       # percent: 10 -> %10 | fixed: 50 -> 50 TL
    min_basket: Optional[Decimal] = None  # uygulanabilmesi için minimum ara toplam
    max_discount: Optional[Decimal] = None  # yüzde indirimde tavan tutar
    label: str = ""
    expires_at: Optional[_dt.datetime] = None
    stock_limited: bool = False          # stok/bitirilebilir kampanya
    source: str = ""                     # nereden okundu (site, kampanya sayfası...)

    @staticmethod
    def from_dict(d: dict) -> "DiscountSpec":
        return DiscountSpec(
            id=str(d["id"]),
            method=DiscountMethod(d.get("method", "fixed")),
            value=_dec(d["value"]),
            min_basket=_dec(d["min_basket"]) if d.get("min_basket") is not None else None,
            max_discount=_dec(d["max_discount"]) if d.get("max_discount") is not None else None,
            label=str(d.get("label", "")),
            expires_at=_dt.datetime.fromisoformat(d["expires_at"]) if d.get("expires_at") else None,
            stock_limited=bool(d.get("stock_limited", False)),
            source=str(d.get("source", "")),
        )


@dataclass
class CouponSpec(DiscountSpec):
    """Kupon: kodla sahiplenilir, kullanıcı bağlamında 'sahip olunması' gerekir."""
    code: str = ""
    stack_group: StackGroup = field(default=StackGroup.COUPON, init=False)

    @staticmethod
    def from_dict(d: dict) -> "CouponSpec":
        base = DiscountSpec.from_dict(d)
        return CouponSpec(
            id=base.id, method=base.method, value=base.value,
            min_basket=base.min_basket, max_discount=base.max_discount,
            label=base.label or f"Kupon {d.get('code', '')}",
            expires_at=base.expires_at, stock_limited=base.stock_limited,
            source=base.source, code=str(d.get("code", d["id"])),
        )


@dataclass
class InstallmentPlan:
    """Taksit planı: vade farkı maliyet, taksit indirimi ise sayılmaz."""
    count: int
    surcharge: Decimal          # vade farkı (tutar); 0 = vade farkısız

    @staticmethod
    def from_dict(d: dict) -> "InstallmentPlan":
        return InstallmentPlan(int(d["count"]), _dec(d.get("surcharge", 0)))


@dataclass
class BankCampaignSpec:
    """Banka/POS kampanyası: belirli kart/banka ile ödemede geçerli."""
    id: str
    bank: str                                # ör. "Ziraat"
    card_program: str = ""                   # ör. "Bankkart" (boşsa banka yeterli)
    method: DiscountMethod = DiscountMethod.FIXED
    value: Decimal = Decimal(0)
    min_basket: Optional[Decimal] = None
    combinable_with_coupons: bool = False    # kuponlarla birleşebilir mi?
    installments: list[InstallmentPlan] = field(default_factory=list)
    label: str = ""

    @staticmethod
    def from_dict(d: dict) -> "BankCampaignSpec":
        return BankCampaignSpec(
            id=str(d["id"]),
            bank=str(d.get("bank", "")),
            card_program=str(d.get("card_program", "")),
            method=DiscountMethod(d.get("method", "fixed")),
            value=_dec(d.get("value", 0)),
            min_basket=_dec(d["min_basket"]) if d.get("min_basket") is not None else None,
            combinable_with_coupons=bool(d.get("combinable_with_coupons", False)),
            installments=[InstallmentPlan.from_dict(i) for i in d.get("installments", [])],
            label=str(d.get("label", f"{d.get('bank', 'Banka')} kampanyası")),
        )

    def matches_card(self, card: Optional["CardContext"]) -> bool:
        """Kullanıcının kartı bu kampanyaya uygun mu?"""
        if card is None:
            return False
        if self.bank and card.bank != self.bank:
            return False
        if self.card_program and card.program != self.card_program:
            return False
        return True


@dataclass
class ShippingSpec:
    """Kargo: sabit ücret + ücretsiz eşik (+ eşik hangi tutarla karşılaştırılır)."""
    fee: Decimal = Decimal(0)
    free_over: Optional[Decimal] = None
    threshold_base: ThresholdBase = ThresholdBase.AFTER_DISCOUNTS
    weight_based: Optional[dict] = None     # {"base_fee": ..., "per_kg": ...} (uzatma)

    @staticmethod
    def from_dict(d: dict | None) -> "ShippingSpec":
        if not d:
            return ShippingSpec()
        return ShippingSpec(
            fee=_dec(d.get("fee", 0)),
            free_over=_dec(d["free_over"]) if d.get("free_over") is not None else None,
            threshold_base=ThresholdBase(d.get("threshold_base", "after_discounts")),
        )


@dataclass
class CashbackSpec:
    """Sadakat puanı / cashback — ödeme anında düşmez, gelecek değerdir."""
    id: str = "cashback"
    kind: str = "points"                    # "points" | "cash"
    rate: Decimal = Decimal(0)              # ör. 0.02 -> %2
    value: Optional[Decimal] = None         # sabit tutar (rate boşsa)
    base: CashbackBase = CashbackBase.POST_DISCOUNT
    usable_immediately: bool = False        # aynı sepette kullanılabilir mi?

    @staticmethod
    def from_dict(d: dict | None) -> "CashbackSpec":
        if not d:
            return CashbackSpec()
        return CashbackSpec(
            id=str(d.get("id", "cashback")),
            kind=str(d.get("kind", "points")),
            rate=_dec(d.get("rate", 0)),
            value=_dec(d["value"]) if d.get("value") is not None else None,
            base=CashbackBase(d.get("base", "post_discount")),
            usable_immediately=bool(d.get("usable_immediately", False)),
        )


@dataclass
class FeeSpec:
    """Hizmet bedeli / komisyon (ör. pazaryeri hizmet bedeli)."""
    kind: str = "service"
    amount: Decimal = Decimal(0)

    @staticmethod
    def from_dict(d: dict | None) -> "FeeSpec":
        if not d:
            return FeeSpec()
        return FeeSpec(kind=str(d.get("kind", "service")), amount=_dec(d.get("amount", 0)))


@dataclass
class TaxBreakdownItem:
    """Vergi kalemi (KDV/ÖTV) — etikete dahilse 'amount_included' ayrıştırılır."""
    type: str
    rate: Decimal
    amount_included: Optional[Decimal] = None  # dahilse içindeki vergi tutarı

    @staticmethod
    def from_dict(d: dict) -> "TaxBreakdownItem":
        return TaxBreakdownItem(
            type=str(d["type"]),
            rate=_dec(d["rate"]),
            amount_included=_dec(d["amount_included"]) if d.get("amount_included") is not None else None,
        )


@dataclass
class ProductData:
    """Ürün + fiyat + tüm indirim/kargo/cashback şartnameleri (site çıktısı)."""
    id: str
    title: str
    currency: str
    list_price: Decimal                    # etiket fiyatı
    selling_price: Optional[Decimal]       # güncel satış fiyatı (ürün indirimi uygulanmış)
    price_includes_tax: bool
    taxes: list[TaxBreakdownItem]
    cart_discounts: list[DiscountSpec]
    coupons: list[CouponSpec]
    bank_campaigns: list[BankCampaignSpec]
    shipping: ShippingSpec
    cashback: CashbackSpec
    fees: list[FeeSpec]

    @staticmethod
    def from_dict(d: dict) -> "ProductData":
        return ProductData(
            id=str(d.get("id", "")),
            title=str(d.get("title", "")),
            currency=str(d.get("currency", "TRY")),
            list_price=_dec(d["list_price"]),
            selling_price=_dec(d["selling_price"]) if d.get("selling_price") is not None else None,
            price_includes_tax=bool(d.get("price_includes_tax", True)),
            taxes=[TaxBreakdownItem.from_dict(t) for t in d.get("taxes", [])],
            cart_discounts=[DiscountSpec.from_dict(x) for x in d.get("cart_discounts", [])],
            coupons=[CouponSpec.from_dict(c) for c in d.get("coupons", [])],
            bank_campaigns=[BankCampaignSpec.from_dict(b) for b in d.get("bank_campaigns", [])],
            shipping=ShippingSpec.from_dict(d.get("shipping")),
            cashback=CashbackSpec.from_dict(d.get("cashback")),
            fees=[FeeSpec.from_dict(f) for f in d.get("fees", [])],
        )


@dataclass
class CardContext:
    """Kullanıcının ödeme kartı (banka kampanyası eşleşmesi için)."""
    bank: str
    program: str = ""


@dataclass
class UserContext:
    """Kullanıcı bağlamı: hangi kuponlara sahip, hangi kartla ödeyecek..."""
    currency: str = "TRY"
    coupons_owned: list[str] = field(default_factory=list)
    card: Optional[CardContext] = None
    installment_count: Optional[int] = None
    now: _dt.datetime = field(default_factory=_dt.datetime.now)
    exchange_rates: dict[str, Decimal] = field(default_factory=dict)  # {"USD": "34.50"}

    @staticmethod
    def from_dict(d: dict | None) -> "UserContext":
        d = d or {}
        card = d.get("card")
        return UserContext(
            currency=str(d.get("currency", "TRY")),
            coupons_owned=[str(c) for c in d.get("coupons_owned", [])],
            card=CardContext(str(card["bank"]), str(card.get("program", ""))) if card else None,
            installment_count=int(d["installment_count"]) if d.get("installment_count") else None,
            now=_dt.datetime.fromisoformat(d["now"]) if d.get("now") else _dt.datetime.now(),
            exchange_rates={k: _dec(v) for k, v in d.get("exchange_rates", {}).items()},
        )


# ---------------------------------------------------------------------------
# Çıktı modeli
# ---------------------------------------------------------------------------

@dataclass
class BreakdownEntry:
    """Hesap adımı — kullanıcıya şeffaflık için adım adım gösterilir."""
    step: str            # "list_price" | "product_discount" | "cart_discount" | ...
    label: str           # insan tarafından okunur açıklama
    amount: Decimal      # bu adımın tutarı (indirimler negatif yazılır)
    note: str = ""

    def to_dict(self) -> dict:
        return {"step": self.step, "label": self.label, "amount": str(self.amount), "note": self.note}


@dataclass
class SkippedItem:
    """Uygulanamayan indirim ve nedeni (dürüst raporlama)."""
    id: str
    label: str
    reason: str

    def to_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "reason": self.reason}


@dataclass
class NetPriceResult:
    """Net etkin fiyat sonucu."""
    currency: str
    list_price: Decimal
    selling_price: Decimal
    breakdown: list[BreakdownEntry] = field(default_factory=list)
    payable_now: Decimal = Decimal(0)        # şimdi cebinden çıkacak tutar
    cashback_value: Decimal = Decimal(0)     # sonradan kazanılacak puan/cashback
    effective_cost: Decimal = Decimal(0)     # payable_now - cashback_value
    skipped: list[SkippedItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "currency": self.currency,
            "list_price": str(self.list_price),
            "selling_price": str(self.selling_price),
            "breakdown": [b.to_dict() for b in self.breakdown],
            "payable_now": str(self.payable_now),
            "cashback_value": str(self.cashback_value),
            "effective_cost": str(self.effective_cost),
            "skipped": [s.to_dict() for s in self.skipped],
            "warnings": self.warnings,
            "assumptions": self.assumptions,
        }

    # -- Kullanıcı mesajı -----------------------------------------------------
    def format_user_message(self) -> str:
        """Doğal dil çıktısı (Türkçe) — bkz. Kullanıcı Mesajı Şablonu."""
        kur = self.currency
        satirlar: list[str] = []
        indirimler = [b for b in self.breakdown if b.amount < 0]
        ekler = [b for b in self.breakdown if b.amount > 0 and b.step not in ("list_price", "selling_price")]

        satirlar.append(f"Bu ürünün etiket fiyatı {self.list_price} {kur}.")
        if indirimler:
            parca = " + ".join(f"{b.label} (−{abs(b.amount)} {kur})" for b in indirimler)
            satirlar.append(f"{parca} uygulandı.")
        if ekler:
            parca = " + ".join(f"{b.label} (+{b.amount} {kur})" for b in ekler)
            satirlar.append(f"{parca} eklendi.")
        satirlar.append(f"💳 **Net etkin fiyat (şimdi ödeyeceğin): {self.payable_now} {kur}.**")
        if self.cashback_value > 0:
            satirlar.append(
                f"🪙 Ayrıca {self.cashback_value} {kur} değerinde puan/cashback kazanacaksın "
                f"— uzun vadeli etkin maliyet {self.effective_cost} {kur}."
            )
        for s in self.skipped:
            satirlar.append(f"ℹ️ {s.label}: {s.reason}")
        return " ".join(satirlar)


# ---------------------------------------------------------------------------
# Motor
# ---------------------------------------------------------------------------

class NetEffectivePriceCalculator:
    """
    Net Etkin Fiyat hesaplayıcı.

    Kullanım:
        calc = NetEffectivePriceCalculator()
        result = calc.calculate(product_json, user_json)
        print(result.payable_now)          # Decimal("950.00")
        print(result.format_user_message())
    """

    def __init__(self, default_currency: str = "TRY"):
        self.default_currency = default_currency

    # -- ana giriş -------------------------------------------------------------
    def calculate(self, product_data: dict, user_context: dict | None = None) -> NetPriceResult:
        urun = ProductData.from_dict(product_data)
        ctx = UserContext.from_dict(user_context)
        return self._calculate(urun, ctx)

    # -- hesap -------------------------------------------------------------------
    def _calculate(self, p: ProductData, ctx: UserContext) -> NetPriceResult:
        kur = p.currency
        result = NetPriceResult(
            currency=kur,
            list_price=money(p.list_price, kur),
            selling_price=money(p.selling_price if p.selling_price is not None else p.list_price, kur),
        )
        skipped: list[SkippedItem] = result.skipped
        assumptions: list[str] = result.assumptions

        # NOT: Hesaplama ÜRÜNÜN para birimiyle yapılır (indirim/kargo/kuponlar da o
        # para birimindedir); kullanıcı para birimine çevirim en SONDA yapılır.

        # 1) Başlangıç tabanı: satış fiyatı (etiketten ürün indirimi düşülmüş hali)
        base = result.selling_price
        result.breakdown.append(BreakdownEntry(
            "list_price", f"Etiket fiyatı ({kur})", result.list_price))
        if p.selling_price is not None and p.selling_price != p.list_price:
            urun_indirimi = money(result.list_price - result.selling_price, kur)
            result.breakdown.append(BreakdownEntry(
                "product_discount", "Ürün indirimi (etiket → satış)", -urun_indirimi))
        result.breakdown.append(BreakdownEntry("selling_price", f"Satış fiyatı ({kur})", base))

        # 2) KDV/vergi ayrıştırması (bilgi amaçlı; etikete dahılsa eklenmez)
        if not p.price_includes_tax:
            for t in p.taxes:
                vergi = money(base * t.rate, kur)
                base = money(base + vergi, kur)
                yuzde = format((t.rate * Decimal(100)).normalize(), "f")  # bilimsel gösterim yok
                result.breakdown.append(BreakdownEntry(
                    "tax", f"{t.type} (%{yuzde})", vergi))
        elif p.taxes:
            # Dahil vergileri kuruş kuruş ayrıştır ve not olarak yaz
            toplam_vergi = sum((t.amount_included or Decimal(0)) for t in p.taxes)
            if toplam_vergi:
                result.assumptions.append(
                    f"Etiket fiyatı vergilidir; içinde yaklaşık {money(toplam_vergi, kur)} {kur} "
                    + ", ".join(t.type for t in p.taxes) + " var."
                )

        # 3) Geçerli sepet indirimlerini sırayla uygula
        cart = self._eligible_cart_discounts(p.cart_discounts, ctx, base, skipped, kur)
        for d in cart:
            base = self._apply_discount(d, base, kur, result.breakdown, "cart_discount")

        # 4) Kuponlar: kullanıcıya ait + geçerli olanlar
        coupons = self._eligible_coupons(p.coupons, ctx, base, skipped, kur)

        # 5) Banka kampanyaları: kart eşleşmesi + geçerlilik
        banks = self._eligible_bank_campaigns(p.bank_campaigns, ctx, base, skipped, kur)

        # 6) Kupon/banka birleşmezliği → alternatif kombinasyonları hesapla,
        #    kullanıcı için EN DÜŞÜK ödemeyi veren yolu seç.
        kullanilan_kuponlar, kullanilan_bankalar = self._resolve_combinations(
            coupons, banks, base, kur, result)

        for c in kullanilan_kuponlar:
            base = self._apply_discount(c, base, kur, result.breakdown, "coupon")
        for b in kullanilan_bankalar:
            base = self._apply_discount(
                self._bank_as_discount(b), base, kur, result.breakdown, "bank_discount")

        # Kullanılmayan ama geçerli kupon/banka alternatiflerini raporla
        for c in coupons:
            if c not in kullanilan_kuponlar:
                skipped.append(SkippedItem(c.id, c.label,
                    "Banka kampanyasıyla birleşmediği için uygulanmadı (daha avantajlı kombinasyon seçildi)"))
        for b in banks:
            if b not in kullanilan_bankalar:
                skipped.append(SkippedItem(b.id, b.label,
                    "Kuponla birleşmediği için uygulanmadı (daha avantajlı kombinasyon seçildi)"))

        payable_before_shipping = base

        # 7) Kargo: eşiğe göre bedava/ücretli
        kargo_ucreti = self._resolve_shipping(p.shipping, base, result.selling_price, kur)
        if kargo_ucreti > 0:
            result.breakdown.append(BreakdownEntry(
                "shipping", "Kargo ücreti", kargo_ucreti,
                note=self._shipping_note(p.shipping, base, result.selling_price)))
        elif p.shipping.free_over is not None:
            result.breakdown.append(BreakdownEntry(
                "shipping", "Kargo", Decimal(0), note=f"{p.shipping.free_over} {kur} üzeri ücretsiz — eşik aşıldı"))
        base = money(base + kargo_ucreti, kur)

        # 8) Hizmet bedelleri / komisyonlar
        for f in p.fees:
            if f.amount:
                base = money(base + f.amount, kur)
                result.breakdown.append(BreakdownEntry("fee", f"{f.kind} bedeli", f.amount))

        # 9) Taksit vade farkı (taksit İNDİRİMİ asla sayılmaz — sadece maliyet)
        if ctx.installment_count:
            plan = self._find_installment_plan(banks, ctx.installment_count)
            if plan is None:
                result.warnings.append(
                    f"{ctx.installment_count} taksit planı bulunamadı; peşin hesaplandı.")
            elif plan.surcharge > 0:
                vade = money(plan.surcharge, kur)
                base = money(base + vade, kur)
                result.breakdown.append(BreakdownEntry(
                    "installment_surcharge", f"{plan.count} taksit vade farkı", vade))

        result.payable_now = base

        # 10) Cashback / puan (ödeme anında düşmez → ayrı gösterilir)
        cb_base = result.payable_now if p.cashback.base == CashbackBase.PAYABLE else payable_before_shipping
        if p.cashback.value is not None:
            result.cashback_value = money(p.cashback.value, kur)
        elif p.cashback.rate:
            result.cashback_value = money(cb_base * p.cashback.rate, kur)
        if result.cashback_value:
            tur = "puan" if p.cashback.kind == "points" else "cashback"
            if not p.cashback.usable_immediately:
                result.assumptions.append(
                    f"{tur.title()} ödeme anında düşmez; sonraki alışverişte kullanılabilir.")
        result.effective_cost = money(result.payable_now - result.cashback_value, kur)

        # 11) Kullanıcı para birimi farklıysa SONUÇTA çevirim yapılır (tüm hesap
        #     ürün para birimiyle yapılmıştır — kargo/kupon/kampanya değerleri de öyle).
        if ctx.currency and ctx.currency != kur:
            oran = ctx.exchange_rates.get(kur)
            if oran:
                def cevir(v: Decimal) -> Decimal:
                    return money(v * oran, ctx.currency)
                result.currency = ctx.currency
                result.list_price = cevir(result.list_price)
                result.selling_price = cevir(result.selling_price)
                for b in result.breakdown:
                    b.amount = cevir(b.amount)
                result.payable_now = cevir(result.payable_now)
                result.cashback_value = cevir(result.cashback_value)
                result.effective_cost = cevir(result.effective_cost)
                assumptions.append(
                    f"Hesap {kur} ile yapıldı, sonuç {ctx.currency}'ya çevrildi (kur {oran})."
                )
            else:
                result.warnings.append(
                    f"{kur} -> {ctx.currency} kuru verilmedi; sonuç {kur} ile raporlandı."
                )

        return result

    # -- yardımcılar --------------------------------------------------------------

    def _apply_discount(self, d: DiscountSpec, base: Decimal, kur: str,
                        breakdown: list[BreakdownEntry], step: str) -> Decimal:
        """Tek bir indirimi ara toplama uygular; her adımda yuvarlanır."""
        if d.method == DiscountMethod.PERCENT:
            tutar = base * d.value / Decimal(100)
            if d.max_discount is not None:
                tutar = min(tutar, d.max_discount)
        else:
            tutar = d.value
        tutar = money(min(tutar, base), kur)   # ara toplamın altına düşmez + yuvarla
        breakdown.append(BreakdownEntry(step, d.label or d.id, -tutar,
                                        note=d.source or ""))
        return money(base - tutar, kur)

    def _bank_as_discount(self, b: BankCampaignSpec) -> DiscountSpec:
        """Banka kampanyasını genel indirim şartnamesine dönüştürür."""
        return DiscountSpec(
            id=b.id, method=b.method, value=b.value,
            min_basket=b.min_basket, label=b.label or f"{b.bank} kartı indirimi")

    def _eligible_cart_discounts(self, specs: list[DiscountSpec], ctx: UserContext,
                                 base: Decimal, skipped: list[SkippedItem], kur: str
                                 ) -> list[DiscountSpec]:
        """Sepet indirimlerini filtreler: süre, minimum sepet."""
        gecerli: list[DiscountSpec] = []
        for d in specs:
            if d.expires_at and d.expires_at < ctx.now:
                skipped.append(SkippedItem(d.id, d.label or d.id, "Süresi dolmuş"))
                continue
            if d.min_basket is not None and base < d.min_basket:
                skipped.append(SkippedItem(d.id, d.label or d.id,
                    f"Minimum sepet {d.min_basket} {kur} — ara toplam {base} {kur}"))
                continue
            gecerli.append(d)
        return gecerli

    def _eligible_coupons(self, specs: list[CouponSpec], ctx: UserContext,
                          base: Decimal, skipped: list[SkippedItem], kur: str
                          ) -> list[CouponSpec]:
        """Kuponları filtreler: sahiplik + süre + minimum sepet."""
        gecerli: list[CouponSpec] = []
        for c in specs:
            if ctx.coupons_owned and c.code and c.code not in ctx.coupons_owned:
                skipped.append(SkippedItem(c.id, c.label, "Bu kupon kullanıcının cüzdanında yok"))
                continue
            if c.expires_at and c.expires_at < ctx.now:
                skipped.append(SkippedItem(c.id, c.label, "Kuponun süresi dolmuş"))
                continue
            if c.min_basket is not None and base < c.min_basket:
                skipped.append(SkippedItem(c.id, c.label,
                    f"Kupon için minimum sepet {c.min_basket} {kur} gerekli"))
                continue
            gecerli.append(c)
        return gecerli

    def _eligible_bank_campaigns(self, specs: list[BankCampaignSpec], ctx: UserContext,
                                 base: Decimal, skipped: list[SkippedItem], kur: str
                                 ) -> list[BankCampaignSpec]:
        """Banka kampanyalarını filtreler: kart eşleşmesi + minimum sepet."""
        gecerli: list[BankCampaignSpec] = []
        for b in specs:
            if not b.matches_card(ctx.card):
                skipped.append(SkippedItem(b.id, b.label,
                    f"Kart uyuşmuyor (gereken: {b.bank} {b.card_program or 'herhangi bir program'})"))
                continue
            if b.min_basket is not None and base < b.min_basket:
                skipped.append(SkippedItem(b.id, b.label,
                    f"Kampanya için minimum sepet {b.min_basket} {kur}"))
                continue
            gecerli.append(b)
        return gecerli

    def _resolve_combinations(self, coupons: list[CouponSpec], banks: list[BankCampaignSpec],
                              base: Decimal, kur: str, result: NetPriceResult
                              ) -> tuple[list[CouponSpec], list[BankCampaignSpec]]:
        """
        Kupon/banka birleşmezlik kuralları altında kullanıcı için en düşük
        ödemeyi veren kombinasyonu seçer.

        Kural: combinable_with_coupons=False olan banka kampanyası kuponlarla
        birlikte KULLANILAMAZ → alternatifler: (kuponlar) vs (bankalar) vs ikisi de.
        Birleşebilir bankalar her zaman kuponlarla birlikte değerlendirilir.
        """
        birlesen_bankalar = [b for b in banks if b.combinable_with_coupons]
        ayri_bankalar = [b for b in banks if not b.combinable_with_coupons]

        def uygula(kuponlar: list[CouponSpec], bankalar: list[DiscountSpec]) -> Decimal:
            t = base
            for c in kuponlar:
                t = self._net_discount_amount(c, t, kur)
            for b in bankalar:
                t = self._net_discount_amount(b, t, kur)
            return t

        adaylar: list[tuple[Decimal, list, list, str]] = []
        # A) kuponlar + birleşebilir bankalar
        adaylar.append((uygula(coupons, [self._bank_as_discount(b) for b in birlesen_bankalar]),
                        coupons, birlesen_bankalar, "kupon + banka birlikte"))
        # B) yalnızca ayrı bankalar (kupon yok)
        if ayri_bankalar:
            for b in ayri_bankalar:
                adaylar.append((uygula([], [self._bank_as_discount(b)]), [], [b],
                                f"yalnızca {b.label} (kuponla birleşmiyor)"))
        # C) hiçbir şey (底线)
        adaylar.append((base, [], [], "indirim yok"))

        en_iyi = min(adaylar, key=lambda x: x[0])
        if en_iyi[3] != "kupon + banka birlikte":
            result.assumptions.append(
                f"Kupon/banka birleşmezliği: en avantajlı yol '{en_iyi[3]}' olarak seçildi.")
        return en_iyi[1], en_iyi[2]

    def _net_discount_amount(self, d: DiscountSpec, base: Decimal, kur: str) -> Decimal:
        """İndirim uygulanmiş ara toplamı döndürür (breakdown'a yazmadan)."""
        if d.method == DiscountMethod.PERCENT:
            tutar = base * d.value / Decimal(100)
            if d.max_discount is not None:
                tutar = min(tutar, d.max_discount)
        else:
            tutar = d.value
        return money(max(base - min(tutar, base), Decimal(0)), kur)

    def _resolve_shipping(self, ship: ShippingSpec, post_discount: Decimal,
                          selling: Decimal, kur: str) -> Decimal:
        """Kargo ücretini eşiğe göre çözer."""
        if ship.free_over is None:
            return money(ship.fee, kur)
        karsilastirma = {
            ThresholdBase.AFTER_DISCOUNTS: post_discount,
            ThresholdBase.LIST_PRICE: selling,
            ThresholdBase.PAYABLE_BEFORE_SHIPPING: post_discount,
        }[ship.threshold_base]
        if karsilastirma >= ship.free_over:
            return Decimal(0)
        return money(ship.fee, kur)

    def _shipping_note(self, ship: ShippingSpec, post_discount: Decimal,
                       selling: Decimal) -> str:
        if ship.free_over is None:
            return "Sabit kargo ücreti"
        return (f"{ship.free_over} {self.default_currency} üzeri ücretsiz "
                f"(eşik {'aşılamadı' if post_discount < ship.free_over else 'aşıldı'})")

    def _find_installment_plan(self, banks: list[BankCampaignSpec], count: int
                               ) -> Optional[InstallmentPlan]:
        """İstenen taksit sayısına uygun planı arar (kullanıcının kartına göre)."""
        for b in banks:
            for plan in b.installments:
                if plan.count == count:
                    return plan
        return None
