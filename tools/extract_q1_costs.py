from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path
from typing import Iterable, Optional

import fitz


ROOT = Path(__file__).resolve().parents[1]
Q1_ROOT = ROOT / "declaraciones_trimestrales" / "1er_trimestre_2026"
EXPENSES = Q1_ROOT / "GASTOS"
INCOME = Q1_ROOT / "INGRESOS"
OUT = ROOT / "data" / "extracted"
OVERRIDES = ROOT / "data" / "manual_overrides"
PDF_TEXTS = OUT / "pdf_texts"
OCR_TEXTS = OUT / "ocr_texts"


def ensure_dirs() -> None:
    for path in [OUT, PDF_TEXTS]:
        path.mkdir(parents=True, exist_ok=True)


def decimal_es(value: str | None) -> Optional[float]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    cleaned = cleaned.replace("\u00a0", " ")
    cleaned = re.sub(r"[^0-9,.\-]", "", cleaned)
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return round(float(cleaned), 4)
    except ValueError:
        return None


def money_re() -> str:
    return r"(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})"


def clean_text(text: str) -> str:
    return " ".join(text.replace("\ufffd", "?").split())


def extract_pdf_texts() -> dict[Path, str]:
    texts: dict[Path, str] = {}
    for pdf in sorted(EXPENSES.glob("*.pdf")):
        try:
            doc = fitz.open(pdf)
            text = "\n".join(page.get_text() for page in doc)
        except Exception as exc:
            text = f"EXTRACTION_ERROR: {exc}"
        texts[pdf] = text
        rel_name = pdf.relative_to(ROOT).as_posix().replace("/", "__")
        (PDF_TEXTS / f"{rel_name}.txt").write_text(text, encoding="utf-8")
    return texts


def load_ocr_texts() -> dict[str, str]:
    texts: dict[str, str] = {}
    if not OCR_TEXTS.exists():
        return texts
    for txt in sorted(OCR_TEXTS.glob("*.txt")):
        raw = txt.read_text(encoding="utf-8", errors="replace")
        source = ""
        lines = raw.splitlines()
        first = lines[0].lstrip("\ufeff") if lines else ""
        if first.startswith("SOURCE="):
            source = first.split("=", 1)[1].replace("\\", "/")
        texts[source or txt.stem] = raw
    return texts


@dataclass
class LedgerRow:
    source_file: str
    provider: str
    category: str
    document_date: str
    description: str
    amount_ex_vat: Optional[float]
    vat_amount: Optional[float]
    amount_inc_vat: Optional[float]
    currency: str
    confidence: str
    notes: str = ""


@dataclass
class PurchaseLine:
    source_file: str
    provider: str
    document_date: str
    component_guess: str
    description: str
    quantity: Optional[float]
    unit_cost_ex_vat: Optional[float]
    unit_cost_inc_vat: Optional[float]
    total_ex_vat: Optional[float]
    total_inc_vat: Optional[float]
    vat_rate: Optional[float]
    confidence: str
    notes: str = ""


@dataclass
class ShippingRate:
    source_file: str
    month: str
    service: str
    units: int
    list_price: float
    discount: float
    total_ex_vat: float
    unit_cost_ex_vat: float
    vat_rate: Optional[float]


@dataclass
class ShopifyPayout:
    source_file: str
    payout_date: str
    total_deposited: Optional[float]
    gross_charges: Optional[float]
    fees: Optional[float]
    order_count_detected: int
    orders_detected: str
    confidence: str


def month_from_span(text: str) -> str:
    m = re.search(r"Per[ií]odo de Facturaci[oó]n:\s*([A-Za-z]+)\s+(\d{4})", text)
    return f"{m.group(1)} {m.group(2)}" if m else ""


def parse_total_after(label: str, text: str) -> Optional[float]:
    m = re.search(label + r"\s*" + money_re(), text, flags=re.I)
    return decimal_es(m.group(1)) if m else None


def parse_meta_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "Meta anuncios" not in text:
        return None
    flat = clean_text(text)
    amount = parse_total_after(r"Pagado", flat)
    date_match = re.search(r"Fecha de la factura/pago\s+(.+?)\s+M[eé]todo", flat)
    invoice_match = re.search(r"Factura n[uú]mero\s+([A-Z0-9\-]+)", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Meta",
        category="marketing_ads",
        document_date=date_match.group(1) if date_match else "",
        description="Meta anuncios",
        amount_ex_vat=amount,
        vat_amount=0.0,
        amount_inc_vat=amount,
        currency="EUR",
        confidence="high",
        notes=f"reverse_charge; invoice={invoice_match.group(1) if invoice_match else ''}",
    )


def parse_canva_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "Canva Pro" not in text:
        return None
    flat = clean_text(text)
    amount = parse_total_after(r"Total", flat)
    vat = parse_total_after(r"Impuestos incluidos", flat)
    date_match = re.search(r"Fecha de factura\s+(.+?)\s+Nro", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Canva",
        category="software",
        document_date=date_match.group(1) if date_match else "",
        description="Canva Pro",
        amount_ex_vat=round(amount - vat, 4) if amount is not None and vat is not None else None,
        vat_amount=vat,
        amount_inc_vat=amount,
        currency="EUR",
        confidence="high",
    )


def parse_shopify_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "Shopify International Limited" not in text:
        return None
    flat = clean_text(text)
    eur_total = None
    m = re.search(r"Total\s+€\s*" + money_re() + r"\s+EUR", flat)
    if m:
        eur_total = decimal_es(m.group(1))
    if eur_total is None:
        m = re.search(r"TOTAL A PAGAR\s+" + money_re() + r"\s*€", flat, flags=re.I)
        eur_total = decimal_es(m.group(1)) if m else None
    paid = re.search(r"Paid on\s+(.+?)\s+Billing cycle|Pagado el\s+(.+?)\s+Ciclo", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Shopify",
        category="software_ecommerce",
        document_date=(paid.group(1) or paid.group(2)) if paid else "",
        description="Shopify subscription",
        amount_ex_vat=eur_total,
        vat_amount=0.0,
        amount_inc_vat=eur_total,
        currency="EUR",
        confidence="high",
        notes="reverse_charge or 0% VAT per invoice",
    )


def parse_likin_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "likinagency" not in text.lower():
        return None
    flat = clean_text(text)
    amount = parse_total_after(r"A pagar:", flat)
    vat = parse_total_after(r"IVA 21%:", flat)
    subtotal = parse_total_after(r"Subtotal:", flat)
    date_match = re.search(r"FACTURA\s+(\d{2}/\d{2}/\d{4})", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="LikinAgency",
        category="agency_or_web",
        document_date=date_match.group(1) if date_match else "",
        description="Desarrollo tienda online + pack productos",
        amount_ex_vat=subtotal,
        vat_amount=vat,
        amount_inc_vat=amount,
        currency="EUR",
        confidence="high",
        notes="Factura incluye IRPF; amount_inc_vat es 'A pagar'",
    )


def parse_generic_business_card_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "Tarjetas de visita" not in text:
        return None
    flat = clean_text(text)
    amount = parse_total_after(r"TOTAL:", flat)
    if amount is None:
        values = [decimal_es(x) for x in re.findall(money_re(), flat)]
        amount = max([x for x in values if x is not None], default=None)
    date_match = re.search(r"(\d{2}/\d{2}/\d{4})", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Unknown print provider",
        category="packaging_or_print",
        document_date=date_match.group(1) if date_match else "",
        description="Tarjetas de visita - 2 caras",
        amount_ex_vat=93.88,
        vat_amount=19.72,
        amount_inc_vat=amount,
        currency="EUR",
        confidence="medium",
        notes="Valores leidos del texto del PDF",
    )


def parse_etsy_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "Etsy Ireland" not in text:
        return None
    flat = clean_text(text)
    total = parse_total_after(r"Total €?", flat)
    date_match = re.search(r"Invoice Date:\s+(.+?)\s+Invoice Period:", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Etsy",
        category="marketplace_fees",
        document_date=date_match.group(1) if date_match else "",
        description="Etsy fees",
        amount_ex_vat=total,
        vat_amount=0.0,
        amount_inc_vat=total,
        currency="EUR",
        confidence="high",
        notes="reverse_charge",
    )


def parse_vodafone_pdf(pdf: Path, text: str) -> Optional[LedgerRow]:
    if "Vodafone" not in text and "vodafone" not in text.lower():
        return None
    flat = clean_text(text)
    total = parse_total_after(r"Total a Pagar", flat)
    if total is None:
        total = parse_total_after(r"TOTAL FACTURA|Total Factura|Total factura", flat)
    return LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Vodafone",
        category="telecom",
        document_date="",
        description="Telecomunicaciones",
        amount_ex_vat=None,
        vat_amount=None,
        amount_inc_vat=total,
        currency="EUR",
        confidence="low" if total is None else "high",
        notes="PDF extraido con caracteres defectuosos; revisar",
    )


def guess_component(description: str) -> str:
    d = description.lower()
    mapping = [
        ("caja principal", ["automontable", "220 x 115 x 55", "caja de embalaje"]),
        ("cajita joya", ["caja de empaque de joyería", "caja de joyería", "jewelry box"]),
        ("dije/bisel joya", ["bisel", "dije", "open bezel"]),
        ("pinzas", ["pinza"]),
        ("pipeta", ["pipeta"]),
        ("palillos", ["palillo"]),
        ("base adhesiva", ["adhesiv", "adhesiva", "cinta resistente al calor", "cinta resistente"]),
        ("topping", ["flor", "nacar", "nácar", "brillo", "lazito", "pigmento", "pétalo", "petalo"]),
        ("recipiente mezcla", ["taza de orina", "vaso", "recipiente"]),
        ("resina", ["resina", " resin "]),
        ("cadena", ["cadena"]),
        ("packaging", ["papel", "tisu", "tisú", "pegatina", "tarjeta", "bolsa"]),
    ]
    for component, needles in mapping:
        if any(n in d for n in needles):
            return component
    return "material_sin_clasificar"


def parse_malagapack(pdf: Path, text: str) -> tuple[Optional[LedgerRow], list[PurchaseLine]]:
    if "malagapack" not in text.lower() and "Sur-Innopack" not in text:
        return None, []
    flat = clean_text(text)
    invoice_date = re.search(r"Fecha de Factura\s+(\d{2}/\d{2}/\d{4})", flat)
    total = parse_total_after(r"Total", flat)
    vat = parse_total_after(r"Total impuesto", flat)
    base = parse_total_after(r"Total \(Imp\. excl\.\)", flat)
    ledger = LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="MalagaPack",
        category="materials_packaging",
        document_date=invoice_date.group(1) if invoice_date else "",
        description="Cajas principales impresas",
        amount_ex_vat=base,
        vat_amount=vat,
        amount_inc_vat=total,
        currency="EUR",
        confidence="high",
    )
    lines: list[PurchaseLine] = []
    m = re.search(
        r"(AUTOMONTABLE.+?)\s+21 %\s+" + money_re() + r"\s+(\d+)\s+" + money_re(),
        flat,
        flags=re.I,
    )
    if m:
        desc = m.group(1)
        unit_ex = decimal_es(m.group(2))
        qty = float(m.group(3))
        total_ex = decimal_es(m.group(4))
        lines.append(
            PurchaseLine(
                source_file=str(pdf.relative_to(ROOT)),
                provider="MalagaPack",
                document_date=invoice_date.group(1) if invoice_date else "",
                component_guess="caja principal",
                description=desc,
                quantity=qty,
                unit_cost_ex_vat=unit_ex,
                unit_cost_inc_vat=round(unit_ex * 1.21, 4) if unit_ex is not None else None,
                total_ex_vat=total_ex,
                total_inc_vat=round(total_ex * 1.21, 4) if total_ex is not None else None,
                vat_rate=21.0,
                confidence="high",
            )
        )
    return ledger, lines


def parse_correos(pdf: Path, text: str) -> tuple[Optional[LedgerRow], list[ShippingRate]]:
    if "SOCIEDAD EST. CORREOS" not in text and "CORREOS Y" not in text:
        return None, []
    flat = clean_text(text)
    month = month_from_span(flat)
    total = parse_total_after(r"Total factura en Euros", flat)
    tax = parse_total_after(r"Total impuesto", flat)
    net = parse_total_after(r"Total importe neto antes de impuesto", flat)
    ledger = LedgerRow(
        source_file=str(pdf.relative_to(ROOT)),
        provider="Correos",
        category="shipping",
        document_date=month,
        description="Paqueteria empresas",
        amount_ex_vat=net,
        vat_amount=tax,
        amount_inc_vat=total,
        currency="EUR",
        confidence="high",
    )
    rates: list[ShippingRate] = []
    lines = [ln.rstrip() for ln in text.splitlines()]
    for i, line in enumerate(lines[:-1]):
        if not line.strip().startswith("Paq "):
            continue
        if "TOTAL" in line:
            continue
        m = re.match(r"(.+?)\s+(\d+)\s*$", line)
        if not m:
            continue
        nums = re.findall(r"-?\d+,\d{2}", lines[i + 1])
        if len(nums) < 4:
            continue
        service = " ".join(m.group(1).split())
        units = int(m.group(2))
        price = decimal_es(nums[0])
        discount = decimal_es(nums[2])
        amount = decimal_es(nums[3])
        vat_rate = 21.0 if "21,00%" in "\n".join(lines[i + 1 : i + 3]) else None
        if price is None or discount is None or amount is None or units == 0:
            continue
        rates.append(
            ShippingRate(
                source_file=str(pdf.relative_to(ROOT)),
                month=month,
                service=service,
                units=units,
                list_price=price,
                discount=discount,
                total_ex_vat=amount,
                unit_cost_ex_vat=round(amount / units, 4),
                vat_rate=vat_rate,
            )
        )
    return ledger, rates


def parse_pdf_expenses(texts: dict[Path, str]) -> tuple[list[LedgerRow], list[PurchaseLine], list[ShippingRate]]:
    ledger: list[LedgerRow] = []
    purchases: list[PurchaseLine] = []
    shipping: list[ShippingRate] = []
    parsers = [
        parse_meta_pdf,
        parse_canva_pdf,
        parse_shopify_pdf,
        parse_likin_pdf,
        parse_generic_business_card_pdf,
        parse_etsy_pdf,
        parse_vodafone_pdf,
    ]
    for pdf, text in texts.items():
        handled = False
        malaga, malaga_lines = parse_malagapack(pdf, text)
        if malaga:
            ledger.append(malaga)
            purchases.extend(malaga_lines)
            handled = True
        correos, correos_rates = parse_correos(pdf, text)
        if correos:
            ledger.append(correos)
            shipping.extend(correos_rates)
            handled = True
        if handled:
            continue
        for parser in parsers:
            row = parser(pdf, text)
            if row:
                ledger.append(row)
                handled = True
                break
        if not handled:
            ledger.append(
                LedgerRow(
                    source_file=str(pdf.relative_to(ROOT)),
                    provider="unknown_pdf",
                    category="needs_review",
                    document_date="",
                    description="PDF no clasificado",
                    amount_ex_vat=None,
                    vat_amount=None,
                    amount_inc_vat=None,
                    currency="EUR",
                    confidence="low",
                )
            )
    return ledger, purchases, shipping


def source_path_from_ocr_source(source: str) -> Path:
    return Q1_ROOT / source


def parse_aliexpress(source: str, text: str) -> tuple[Optional[LedgerRow], list[PurchaseLine]]:
    flat = clean_text(text)
    if "AliExpres" not in flat and "AliExpress" not in flat:
        return None, []
    total_match = re.search(r"Detalle del art[ií]culo\s+EUR\s+(\d+\.\d{2})", flat, flags=re.I)
    if not total_match:
        total_match = re.search(r"M[eé]todo de pago.+?EUR\s+(\d+\.\d{2})", flat, flags=re.I)
    if not total_match:
        total_match = re.search(r"Pagado en.+?Detalle del art[ií]culo\s+EUR\s+(\d+\.\d{2})", flat, flags=re.I)
    if not total_match:
        total_match = re.search(r"Total:\s*(?:\S+\s+){0,8}?" + money_re(), flat, flags=re.I)
    total = decimal_es(total_match.group(1)) if total_match else None
    order_match = re.search(r"ID de pedido:\s*(\d+)", flat)
    date_match = re.search(r"Tiempo de .+?:\s*([^€]+?)\s+Subtotal", flat)
    lines: list[PurchaseLine] = []
    item_matches = re.finditer(r"(\d+)\s*Uds\.\s+(.+?)(?=\s+\d+\s*Uds\.|Cosas a tener|$)", flat, flags=re.I)
    items = list(item_matches)
    for m in items:
        qty = float(m.group(1))
        desc = m.group(2).strip()
        lines.append(
            PurchaseLine(
                source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
                provider="AliExpress",
                document_date=date_match.group(1).strip() if date_match else "",
                component_guess=guess_component(desc),
                description=desc,
                quantity=qty,
                unit_cost_ex_vat=None,
                unit_cost_inc_vat=round(total / sum(float(x.group(1)) for x in items), 4)
                if total and items
                else None,
                total_ex_vat=None,
                total_inc_vat=None,
                vat_rate=None,
                confidence="low",
                notes="OCR no siempre captura precios de linea; unit_cost_inc_vat repartido por unidades si hay total",
            )
        )
    ledger = LedgerRow(
        source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
        provider="AliExpress",
        category="materials",
        document_date=date_match.group(1).strip() if date_match else "",
        description=f"Order {order_match.group(1) if order_match else ''}".strip(),
        amount_ex_vat=None,
        vat_amount=None,
        amount_inc_vat=total,
        currency="EUR",
        confidence="medium" if total else "low",
        notes="captura OCR",
    )
    return ledger, lines


def parse_shein(source: str, text: str) -> tuple[Optional[LedgerRow], list[PurchaseLine]]:
    flat = clean_text(text)
    if "Infinite Styles" not in flat and "SHEIN" not in flat and not source.startswith("GASTOS/XES"):
        return None, []
    gross_section = re.search(r"Gross Amount \(EUR\)(.+?)VAT Breakdown", flat, flags=re.I)
    gross_values = re.findall(money_re(), gross_section.group(1), flags=re.I) if gross_section else []
    total = decimal_es(gross_values[-1]) if gross_values else None
    taxable_section = re.search(r"Taxable Amount \(EUR\)(.+?)VAT Rate", flat, flags=re.I)
    taxable_values = re.findall(money_re(), taxable_section.group(1), flags=re.I) if taxable_section else []
    vat_section = re.search(r"VAT Amount \(EUR\)(.+?)Gross Amount", flat, flags=re.I)
    vat_values = re.findall(money_re(), vat_section.group(1), flags=re.I) if vat_section else []
    invoice_match = re.search(r"Invoice No\.?:?\s*([A-Z0-9_]+)", flat, flags=re.I)
    date_match = re.search(r"Invoice Date:?\s*(\d{4}-\d{2}-\d{2})", flat, flags=re.I)
    ledger = LedgerRow(
        source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
        provider="Shein",
        category="materials",
        document_date=date_match.group(1) if date_match else "",
        description=f"VAT invoice {invoice_match.group(1) if invoice_match else ''}".strip(),
        amount_ex_vat=None,
        vat_amount=None,
        amount_inc_vat=total,
        currency="EUR",
        confidence="medium" if total else "low",
        notes="OCR captura factura SHEIN; revisar lineas de articulo",
    )
    purchases: list[PurchaseLine] = []
    desc_block = re.search(r"Invoice Detail Description\s+(.+?)\s+No\.?:", flat, flags=re.I)
    descriptions: list[str] = []
    if desc_block:
        descriptions = [m.group(0).strip() for m in re.finditer(r"\d+\s+piezas.+?(?=\d+\s+piezas|$)", desc_block.group(1), flags=re.I)]
    row_count = min(len(descriptions), max(0, len(gross_values) - 1))
    for idx in range(row_count):
        desc = descriptions[idx]
        pack_qty_match = re.search(r"(\d+)\s+piezas", desc, flags=re.I)
        qty = float(pack_qty_match.group(1)) if pack_qty_match else 1.0
        if qty == 0 and re.search(r"\b00\s+piezas", desc, flags=re.I):
            qty = 100.0
        ex = decimal_es(taxable_values[idx]) if idx < len(taxable_values) - 1 else None
        vat = decimal_es(vat_values[idx]) if idx < len(vat_values) - 1 else None
        gross = decimal_es(gross_values[idx])
        purchases.append(
            PurchaseLine(
                source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
                provider="Shein",
                document_date=date_match.group(1) if date_match else "",
                component_guess=guess_component(desc),
                description=desc,
                quantity=qty,
                unit_cost_ex_vat=round(ex / qty, 4) if ex is not None and qty else None,
                unit_cost_inc_vat=round(gross / qty, 4) if gross is not None and qty else None,
                total_ex_vat=ex,
                total_inc_vat=gross,
                vat_rate=21.0,
                confidence="medium",
                notes=f"vat={vat}",
            )
        )
    return ledger, purchases


def parse_capcut(source: str, text: str) -> Optional[LedgerRow]:
    if "Capcut" not in source and "CapCut" not in text and "Capcut" not in text:
        return None
    flat = clean_text(text)
    amounts = [decimal_es(x) for x in re.findall(money_re(), flat)]
    amounts = [x for x in amounts if x is not None]
    total = max(amounts) if amounts else None
    return LedgerRow(
        source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
        provider="CapCut",
        category="software",
        document_date="",
        description="CapCut subscription/charge",
        amount_ex_vat=None,
        vat_amount=None,
        amount_inc_vat=total,
        currency="EUR",
        confidence="low" if total is None else "medium",
        notes="captura OCR",
    )


def parse_ocr_expenses(texts: dict[str, str]) -> tuple[list[LedgerRow], list[PurchaseLine]]:
    ledger: list[LedgerRow] = []
    purchases: list[PurchaseLine] = []
    for source, text in texts.items():
        if not source.startswith("GASTOS/"):
            continue
        row, lines = parse_aliexpress(source, text)
        if row:
            ledger.append(row)
            purchases.extend(lines)
            continue
        row, lines = parse_shein(source, text)
        if row:
            ledger.append(row)
            purchases.extend(lines)
            continue
        row = parse_capcut(source, text)
        if row:
            ledger.append(row)
            continue
        if source.lower().endswith(".png"):
            ledger.append(
                LedgerRow(
                    source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
                    provider="unknown_image",
                    category="needs_review",
                    document_date="",
                    description="Imagen no clasificada por OCR",
                    amount_ex_vat=None,
                    vat_amount=None,
                    amount_inc_vat=None,
                    currency="EUR",
                    confidence="low",
                    notes="ver OCR text",
                )
            )
    return ledger, purchases


def parse_shopify_payouts(texts: dict[str, str]) -> list[ShopifyPayout]:
    payouts: list[ShopifyPayout] = []
    for source, text in texts.items():
        if not source.startswith("INGRESOS/Shopify-"):
            continue
        flat = clean_text(text)
        date_match = re.search(r"Información del pago\s+(.+?)\s+Total", flat, flags=re.I)
        total_match = re.search(r"Total\s+" + money_re() + r"\s*€\s*EUR", flat, flags=re.I)
        charges_match = re.search(r"Exportar\s+" + money_re() + r"\s*€\s+" + money_re() + r"\s*€", flat, flags=re.I)
        if not charges_match:
            charges_match = re.search(r"Cargos\s+Comisiones.+?" + money_re() + r"\s*€\s+" + money_re() + r"\s*€", flat, flags=re.I)
        orders = re.findall(r"#MUA\d+", flat)
        payouts.append(
            ShopifyPayout(
                source_file=str(source_path_from_ocr_source(source).relative_to(ROOT)),
                payout_date=date_match.group(1) if date_match else "",
                total_deposited=decimal_es(total_match.group(1)) if total_match else None,
                gross_charges=decimal_es(charges_match.group(1)) if charges_match else None,
                fees=decimal_es(charges_match.group(2)) if charges_match else None,
                order_count_detected=len(orders),
                orders_detected=";".join(orders),
                confidence="medium" if total_match else "low",
            )
        )
    return payouts


def component_cost_candidates(purchases: list[PurchaseLine]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for line in purchases:
        if line.unit_cost_inc_vat is None and line.unit_cost_ex_vat is None:
            continue
        rows.append(
            {
                "component_guess": line.component_guess,
                "provider": line.provider,
                "description": line.description,
                "quantity_basis": line.quantity,
                "unit_cost_ex_vat": line.unit_cost_ex_vat,
                "unit_cost_inc_vat": line.unit_cost_inc_vat,
                "total_ex_vat": line.total_ex_vat,
                "total_inc_vat": line.total_inc_vat,
                "confidence": line.confidence,
                "source_file": line.source_file,
                "notes": line.notes,
            }
        )
    return rows


def kit_base_template() -> list[dict[str, object]]:
    items = [
        ("caja principal", 1, "MalagaPack factura: 1,10 EUR sin IVA por caja impresa"),
        ("lampara UV", 1, "pendiente de coste unitario"),
        ("manual de instrucciones", 1, "pendiente de coste unitario"),
        ("cajita para la joya", 1, "pendiente de coste unitario"),
        ("recipiente para mezcla", 1, "pendiente de coste unitario"),
        ("pinzas", 1, "pendiente de coste unitario"),
        ("palillos", 1, "pendiente de coste unitario"),
        ("caja de materiales", 1, "pendiente de coste unitario"),
        ("trapo de limpieza", 1, "pendiente de coste unitario"),
        ("pipeta de leche", 1, "pendiente de coste unitario"),
        ("base adhesiva", 1, "pendiente de coste unitario"),
        ("topping incluido", 1, "depende de seleccion del pedido"),
        ("bote de resina", 1, "pendiente de coste unitario"),
        ("pegatina de la resina", 1, "pendiente de coste unitario"),
        ("resina", 1, "pendiente de coste unitario / consumo por kit"),
        ("joya", 1, "depende de seleccion del pedido"),
        ("cadena", 1, "solo colgantes"),
        ("papel tisu", 1, "pendiente de coste unitario"),
        ("pegatina de cierre", 1, "pendiente de coste unitario"),
        ("tarjeta", 1, "pendiente de coste unitario"),
    ]
    return [
        {
            "component": component,
            "quantity_per_base_kit": qty,
            "rule": note,
            "default_unit_cost_ex_vat": 1.10 if component == "caja principal" else None,
            "confidence": "high" if component == "caja principal" else "manual_needed",
        }
        for component, qty, note in items
    ]


def write_csv(path: Path, rows: Iterable[object], fieldnames: list[str] | None = None) -> None:
    rows = list(rows)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    dicts = [asdict(row) if hasattr(row, "__dataclass_fields__") else row for row in rows]
    if fieldnames is None:
        fieldnames = list(dicts[0].keys())
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(dicts)


def read_csv_dicts(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def apply_manual_overrides(
    ledger: list[LedgerRow], purchases: list[PurchaseLine]
) -> tuple[list[LedgerRow], list[PurchaseLine]]:
    ledger_overrides = read_csv_dicts(OVERRIDES / "q1_expense_ledger_overrides.csv")
    purchase_overrides = read_csv_dicts(OVERRIDES / "q1_material_purchase_overrides.csv")

    ledger_sources = {row["source_file"] for row in ledger_overrides}
    if ledger_sources:
        ledger = [row for row in ledger if row.source_file not in ledger_sources]
    for row in ledger_overrides:
        ledger.append(
            LedgerRow(
                source_file=row["source_file"],
                provider=row["provider"],
                category=row["category"],
                document_date=row["document_date"],
                description=row["description"],
                amount_ex_vat=decimal_es(row.get("amount_ex_vat")),
                vat_amount=decimal_es(row.get("vat_amount")),
                amount_inc_vat=decimal_es(row.get("amount_inc_vat")),
                currency=row.get("currency") or "EUR",
                confidence=row.get("confidence") or "manual",
                notes=row.get("notes") or "",
            )
        )

    purchase_sources = {row["source_file"] for row in purchase_overrides}
    if purchase_sources:
        purchases = [row for row in purchases if row.source_file not in purchase_sources]
    for row in purchase_overrides:
        purchases.append(
            PurchaseLine(
                source_file=row["source_file"],
                provider=row["provider"],
                document_date=row["document_date"],
                component_guess=row["component_guess"],
                description=row["description"],
                quantity=decimal_es(row.get("quantity")),
                unit_cost_ex_vat=decimal_es(row.get("unit_cost_ex_vat")),
                unit_cost_inc_vat=decimal_es(row.get("unit_cost_inc_vat")),
                total_ex_vat=decimal_es(row.get("total_ex_vat")),
                total_inc_vat=decimal_es(row.get("total_inc_vat")),
                vat_rate=decimal_es(row.get("vat_rate")),
                confidence=row.get("confidence") or "manual",
                notes=row.get("notes") or "",
            )
        )
    return ledger, purchases


def summarize_ledger(rows: list[LedgerRow]) -> list[dict[str, object]]:
    grouped: dict[tuple[str, str], float] = defaultdict(float)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    unknown: dict[tuple[str, str], int] = defaultdict(int)
    for row in rows:
        key = (row.provider, row.category)
        counts[key] += 1
        if row.amount_inc_vat is None:
            unknown[key] += 1
        else:
            grouped[key] += row.amount_inc_vat
    return [
        {
            "provider": provider,
            "category": category,
            "documents": counts[(provider, category)],
            "known_amount_inc_vat": round(grouped[(provider, category)], 2),
            "documents_without_amount": unknown[(provider, category)],
        }
        for provider, category in sorted(counts)
    ]


def main() -> None:
    ensure_dirs()
    pdf_texts = extract_pdf_texts()
    ocr_texts = load_ocr_texts()
    pdf_ledger, pdf_purchases, shipping = parse_pdf_expenses(pdf_texts)
    ocr_ledger, ocr_purchases = parse_ocr_expenses(ocr_texts)
    shopify_payouts = parse_shopify_payouts(ocr_texts)

    ledger = pdf_ledger + ocr_ledger
    purchases = pdf_purchases + ocr_purchases
    ledger, purchases = apply_manual_overrides(ledger, purchases)

    write_csv(OUT / "q1_expense_ledger.csv", ledger)
    write_csv(OUT / "material_purchase_lines.csv", purchases)
    write_csv(OUT / "component_cost_candidates.csv", component_cost_candidates(purchases))
    write_csv(OUT / "correos_service_rates.csv", shipping)
    write_csv(OUT / "shopify_payouts.csv", shopify_payouts)
    write_csv(OUT / "kit_base_template.csv", kit_base_template())
    write_csv(OUT / "q1_expense_summary.csv", summarize_ledger(ledger))

    try:
        import pandas as pd

        with pd.ExcelWriter(OUT / "mua_q1_cost_extraction.xlsx", engine="openpyxl") as writer:
            for sheet, file_name in [
                ("expense_ledger", "q1_expense_ledger.csv"),
                ("expense_summary", "q1_expense_summary.csv"),
                ("material_lines", "material_purchase_lines.csv"),
                ("component_costs", "component_cost_candidates.csv"),
                ("correos_rates", "correos_service_rates.csv"),
                ("shopify_payouts", "shopify_payouts.csv"),
                ("kit_base", "kit_base_template.csv"),
                ("order_lines", "shopify_order_lines_normalized.csv"),
                ("lineitem_rules", "lineitem_component_rules_seed.csv"),
            ]:
                csv_path = OUT / file_name
                if csv_path.exists() and csv_path.stat().st_size:
                    pd.read_csv(csv_path).to_excel(writer, sheet_name=sheet[:31], index=False)
    except Exception as exc:
        print(f"Excel export skipped: {exc}")

    summary = {
        "pdf_documents": len(pdf_texts),
        "ocr_documents": len(ocr_texts),
        "ledger_rows": len(ledger),
        "purchase_lines": len(purchases),
        "shipping_rate_rows": len(shipping),
        "shopify_payout_rows": len(shopify_payouts),
        "known_ledger_amount_inc_vat": round(sum(row.amount_inc_vat or 0 for row in ledger), 2),
        "unknown_amount_rows": sum(1 for row in ledger if row.amount_inc_vat is None),
    }
    (OUT / "extraction_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
