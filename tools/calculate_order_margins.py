from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "extracted"


@dataclass
class CostCatalogRow:
    component_key: str
    component_label: str
    unit_cost_inc_vat: Optional[float]
    unit_cost_ex_vat: Optional[float]
    confidence: str
    source: str
    notes: str = ""


@dataclass
class ComponentBreakdownRow:
    order_name: str
    order_created_at: str
    lineitem_name: str
    component_key: str
    component_label: str
    quantity: float
    unit_cost_inc_vat: Optional[float]
    total_cost_inc_vat: Optional[float]
    confidence: str
    status: str
    notes: str = ""


@dataclass
class OrderMarginRow:
    order_name: str
    created_at: str
    month: str
    financial_status: str
    fulfillment_status: str
    subtotal: float
    shipping_charged: float
    discount_amount: float
    refunded_amount: float
    total_collected: float
    known_material_cost_inc_vat: float
    estimated_shipping_cost_inc_vat: float
    payment_fee_inc_vat: float
    known_operating_cost_inc_vat: float
    margin_before_marketing: float
    margin_before_marketing_pct: Optional[float]
    known_meta_allocated: float
    margin_after_known_meta: float
    margin_after_known_meta_pct: Optional[float]
    missing_cost_items_count: int
    missing_cost_items: str
    payment_fee_source: str
    shipping_cost_source: str
    notes: str = ""


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[object]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    dicts = [asdict(row) if hasattr(row, "__dataclass_fields__") else row for row in rows]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(dicts[0].keys()))
        writer.writeheader()
        writer.writerows(dicts)


def fnum(value: str | None, default: float = 0.0) -> float:
    if value is None or str(value).strip() == "":
        return default
    return float(str(value).replace(",", "."))


def parse_order_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S %z")


def pct(part: float, total: float) -> Optional[float]:
    if total == 0:
        return None
    return round(part / total * 100, 2)


def build_cost_catalog() -> dict[str, CostCatalogRow]:
    # Only confirmed or conservative costs go here. Unknowns remain visible in margin outputs.
    catalog = {
        "box_main": CostCatalogRow(
            "box_main",
            "Caja principal MalagaPack impresa",
            1.331,
            1.10,
            "high",
            "MalagaPack.pdf",
            "100 unidades a 1,10 EUR sin IVA; 1,331 EUR IVA incl.",
        ),
        "jewelry_box_simple": CostCatalogRow(
            "jewelry_box_simple",
            "Cajita joya simple",
            0.4375,
            None,
            "manual_high",
            "XES20260305096003498271_1.png",
            "7 paquetes x 12 cajas a 5,25 EUR por paquete.",
        ),
        "adhesive_base": CostCatalogRow(
            "adhesive_base",
            "Base adhesiva / cinta resistente",
            0.0131,
            0.0108,
            "medium",
            "Shein OCR",
            "Coste candidato OCR; revisar uso exacto.",
        ),
        "mixing_cup": CostCatalogRow(
            "mixing_cup",
            "Recipiente para mezcla",
            0.0192,
            None,
            "medium",
            "Shein OCR",
            "200 recipientes por 3,83 EUR.",
        ),
        "chain_steel_gold_plated": CostCatalogRow(
            "chain_steel_gold_plated",
            "Cadena acero banada dorada",
            0.838,
            None,
            "manual_high",
            "OrderSummary202604053068021828611055.png",
            "4 paquetes x 5 unidades a 4,19 EUR por paquete.",
        ),
        "chain_steel_silver": CostCatalogRow(
            "chain_steel_silver",
            "Cadena acero plateada",
            0.598,
            None,
            "manual_high",
            "OrderSummary202604053068021828611055.png",
            "4 paquetes x 5 unidades a 2,99 EUR por paquete.",
        ),
        "bezel_circle_steel": CostCatalogRow(
            "bezel_circle_steel",
            "Bisel colgante circulo acero",
            0.273,
            None,
            "manual_high",
            "OrderSummary202604053069962307281055.png",
            "2 paquetes x 10 unidades a 2,73 EUR por paquete.",
        ),
    }
    return catalog


BASE_KIT_COMPONENTS = [
    "box_main",
    "jewelry_box_simple",
    "adhesive_base",
    "mixing_cup",
]

BASE_KIT_UNKNOWN_COMPONENTS = [
    "lampara UV",
    "manual de instrucciones",
    "pinzas",
    "palillos",
    "caja de materiales",
    "trapo de limpieza",
    "pipeta de leche",
    "bote de resina",
    "pegatina de la resina",
    "resina",
    "papel tisu",
    "pegatina de cierre",
    "tarjeta",
]


def lookup_catalog(catalog: dict[str, CostCatalogRow], key: str) -> CostCatalogRow:
    return catalog[key]


def add_known_component(
    rows: list[ComponentBreakdownRow],
    catalog: dict[str, CostCatalogRow],
    order_name: str,
    created_at: str,
    lineitem: str,
    key: str,
    qty: float = 1.0,
    notes: str = "",
) -> None:
    cost = lookup_catalog(catalog, key)
    total = round((cost.unit_cost_inc_vat or 0.0) * qty, 4) if cost.unit_cost_inc_vat is not None else None
    rows.append(
        ComponentBreakdownRow(
            order_name=order_name,
            order_created_at=created_at,
            lineitem_name=lineitem,
            component_key=key,
            component_label=cost.component_label,
            quantity=qty,
            unit_cost_inc_vat=cost.unit_cost_inc_vat,
            total_cost_inc_vat=total,
            confidence=cost.confidence,
            status="known",
            notes=notes or cost.notes,
        )
    )


def add_unknown_component(
    rows: list[ComponentBreakdownRow],
    order_name: str,
    created_at: str,
    lineitem: str,
    key: str,
    label: str,
    qty: float = 1.0,
    notes: str = "",
) -> None:
    rows.append(
        ComponentBreakdownRow(
            order_name=order_name,
            order_created_at=created_at,
            lineitem_name=lineitem,
            component_key=key,
            component_label=label,
            quantity=qty,
            unit_cost_inc_vat=None,
            total_cost_inc_vat=None,
            confidence="manual_needed",
            status="missing_cost",
            notes=notes,
        )
    )


def line_components(
    order_name: str,
    created_at: str,
    lineitem_name: str,
    qty: int,
    catalog: dict[str, CostCatalogRow],
) -> list[ComponentBreakdownRow]:
    rows: list[ComponentBreakdownRow] = []
    lower = lineitem_name.lower()

    def add_base(qty_multiplier: float) -> None:
        for key in BASE_KIT_COMPONENTS:
            add_known_component(rows, catalog, order_name, created_at, lineitem_name, key, qty_multiplier)
        for label in BASE_KIT_UNKNOWN_COMPONENTS:
            add_unknown_component(
                rows,
                order_name,
                created_at,
                lineitem_name,
                "base_pending",
                label,
                qty_multiplier,
                "Componente base declarado, coste pendiente.",
            )

    if "kit müa" in lower or "kit mua" in lower or "kit m" in lower:
        add_base(qty)
        return rows

    if "segundo kit" in lower:
        add_base(qty)
        return rows

    if lower.startswith("material de la joya"):
        return rows

    if "cadena" in lower:
        if "plata de ley" in lower:
            add_unknown_component(rows, order_name, created_at, lineitem_name, "chain_silver_925", lineitem_name, qty, "Cadena plata de ley sin coste de compra confirmado.")
        elif "dorad" in lower or "oro" in lower:
            add_known_component(rows, catalog, order_name, created_at, lineitem_name, "chain_steel_gold_plated", qty)
        elif "platead" in lower or "plata" in lower:
            add_known_component(rows, catalog, order_name, created_at, lineitem_name, "chain_steel_silver", qty)
        else:
            add_unknown_component(rows, order_name, created_at, lineitem_name, "chain_unknown", lineitem_name, qty, "Cadena sin color/material reconocible.")
        return rows

    if "colgante" in lower and ("círculo" in lower or "circulo" in lower) and "acero" in lower:
        add_known_component(rows, catalog, order_name, created_at, lineitem_name, "bezel_circle_steel", qty)
        return rows

    if any(word in lower for word in ["colgante", "anillo", "pulsera", "charm", "pendientes", "llavero"]):
        add_unknown_component(rows, order_name, created_at, lineitem_name, "jewel_pending", lineitem_name, qty, "Joya sin coste unitario confirmado.")
        return rows

    if any(word in lower for word in ["letras", "flor", "brillo", "nácar", "nacar", "lazito", "pigmento", "toping", "topping"]):
        add_unknown_component(rows, order_name, created_at, lineitem_name, "topping_pending", lineitem_name, qty, "Topping/pigmento sin coste unitario confirmado.")
        return rows

    add_unknown_component(rows, order_name, created_at, lineitem_name, "lineitem_pending", lineitem_name, qty, "Linea Shopify sin regla de coste.")
    return rows


def shipping_average_inc_vat() -> float:
    rows = read_csv(OUT / "q1_expense_ledger.csv")
    correos_total = sum(fnum(r.get("amount_inc_vat")) for r in rows if r.get("provider") == "Correos")
    rates = read_csv(OUT / "correos_service_rates.csv")
    units = sum(int(fnum(r.get("units"))) for r in rates)
    return round(correos_total / units, 4) if units else 0.0


def payment_fee_allocations() -> tuple[dict[str, float], float]:
    rows = read_csv(OUT / "shopify_payouts.csv")
    exact: dict[str, float] = defaultdict(float)
    gross_sum = 0.0
    fee_sum = 0.0
    for row in rows:
        gross = fnum(row.get("gross_charges"))
        fees = abs(fnum(row.get("fees")))
        if gross <= 0 or fees <= 0:
            continue
        rate = fees / gross
        if rate >= 0.10:
            continue
        gross_sum += gross
        fee_sum += fees
        orders = [o for o in (row.get("orders_detected") or "").split(";") if o]
        if not orders:
            continue
        per_order = fees / len(set(orders))
        for order in set(orders):
            exact[order] += per_order
    fallback_rate = fee_sum / gross_sum if gross_sum else 0.02856
    return {k: round(v, 4) for k, v in exact.items()}, round(fallback_rate, 6)


def meta_spend_by_month() -> dict[str, float]:
    rows = read_csv(OUT / "q1_expense_ledger.csv")
    spend: dict[str, float] = defaultdict(float)
    for row in rows:
        if row.get("provider") != "Meta":
            continue
        source = row.get("source_file", "")
        m = re.search(r"(2026)-(\d{2})-\d{2}", source)
        if not m:
            continue
        spend[f"{m.group(1)}-{m.group(2)}"] += fnum(row.get("amount_inc_vat"))
    return {k: round(v, 2) for k, v in spend.items()}


def build_margin() -> tuple[list[OrderMarginRow], list[ComponentBreakdownRow], list[dict[str, object]]]:
    catalog = build_cost_catalog()
    lines = read_csv(OUT / "shopify_order_lines_normalized.csv")
    orders: dict[str, list[dict[str, str]]] = defaultdict(list)
    for line in lines:
        orders[line["order_name"]].append(line)

    paid_orders = {
        order_name: order_lines
        for order_name, order_lines in orders.items()
        if order_lines and order_lines[0].get("financial_status") == "paid" and not fnum(order_lines[0].get("refunded_amount"))
    }

    shipping_cost = shipping_average_inc_vat()
    payment_exact, payment_fallback_rate = payment_fee_allocations()
    meta_by_month = meta_spend_by_month()
    paid_order_counts_by_month = Counter(parse_order_date(v[0]["created_at"]).strftime("%Y-%m") for v in paid_orders.values())
    meta_per_order_month = {
        month: round(spend / paid_order_counts_by_month[month], 4)
        for month, spend in meta_by_month.items()
        if paid_order_counts_by_month[month]
    }

    margin_rows: list[OrderMarginRow] = []
    breakdown_rows: list[ComponentBreakdownRow] = []

    for order_name, order_lines in sorted(paid_orders.items(), key=lambda kv: kv[1][0]["created_at"]):
        header = order_lines[0]
        created = parse_order_date(header["created_at"])
        month = created.strftime("%Y-%m")
        components: list[ComponentBreakdownRow] = []
        for line in order_lines:
            components.extend(
                line_components(
                    order_name,
                    header["created_at"],
                    line["lineitem_name"],
                    int(fnum(line["lineitem_quantity"])),
                    catalog,
                )
            )
        breakdown_rows.extend(components)
        known_material = round(sum(row.total_cost_inc_vat or 0 for row in components), 4)
        missing = [row.component_label for row in components if row.status == "missing_cost"]
        total_collected = fnum(header.get("total"))
        if order_name in payment_exact:
            payment_fee = payment_exact[order_name]
            payment_source = "shopify_payout_allocated"
        else:
            payment_fee = round(total_collected * payment_fallback_rate, 4)
            payment_source = f"estimated_rate_{payment_fallback_rate:.4%}"
        known_operating = round(known_material + shipping_cost + payment_fee, 4)
        margin_before = round(total_collected - known_operating, 4)
        meta_alloc = meta_per_order_month.get(month, 0.0)
        margin_after_meta = round(margin_before - meta_alloc, 4)
        margin_rows.append(
            OrderMarginRow(
                order_name=order_name,
                created_at=header["created_at"],
                month=month,
                financial_status=header["financial_status"],
                fulfillment_status=header["fulfillment_status"],
                subtotal=fnum(header.get("subtotal")),
                shipping_charged=fnum(header.get("shipping")),
                discount_amount=fnum(header.get("discount_amount")),
                refunded_amount=fnum(header.get("refunded_amount")),
                total_collected=total_collected,
                known_material_cost_inc_vat=known_material,
                estimated_shipping_cost_inc_vat=shipping_cost,
                payment_fee_inc_vat=payment_fee,
                known_operating_cost_inc_vat=known_operating,
                margin_before_marketing=margin_before,
                margin_before_marketing_pct=pct(margin_before, total_collected),
                known_meta_allocated=meta_alloc,
                margin_after_known_meta=margin_after_meta,
                margin_after_known_meta_pct=pct(margin_after_meta, total_collected),
                missing_cost_items_count=len(missing),
                missing_cost_items="; ".join(sorted(set(missing))),
                payment_fee_source=payment_source,
                shipping_cost_source="Correos Q1 average invoice cost per shipment",
                notes="V0 conservative: missing costs are not subtracted.",
            )
        )

    catalog_rows = list(catalog.values())
    return margin_rows, breakdown_rows, [asdict(row) for row in catalog_rows]


def summarize_by_month(margins: list[OrderMarginRow]) -> list[dict[str, object]]:
    grouped: dict[str, list[OrderMarginRow]] = defaultdict(list)
    for row in margins:
        grouped[row.month].append(row)
    summaries: list[dict[str, object]] = []
    for month, rows in sorted(grouped.items()):
        total = sum(row.total_collected for row in rows)
        margin = sum(row.margin_before_marketing for row in rows)
        margin_meta = sum(row.margin_after_known_meta for row in rows)
        summaries.append(
            {
                "month": month,
                "orders": len(rows),
                "total_collected": round(total, 2),
                "known_material_cost_inc_vat": round(sum(row.known_material_cost_inc_vat for row in rows), 2),
                "estimated_shipping_cost_inc_vat": round(sum(row.estimated_shipping_cost_inc_vat for row in rows), 2),
                "payment_fee_inc_vat": round(sum(row.payment_fee_inc_vat for row in rows), 2),
                "known_meta_allocated": round(sum(row.known_meta_allocated for row in rows), 2),
                "margin_before_marketing": round(margin, 2),
                "margin_before_marketing_pct": pct(margin, total),
                "margin_after_known_meta": round(margin_meta, 2),
                "margin_after_known_meta_pct": pct(margin_meta, total),
                "orders_with_missing_costs": sum(1 for row in rows if row.missing_cost_items_count),
            }
        )
    return summaries


def missing_cost_summary(breakdown: list[ComponentBreakdownRow]) -> list[dict[str, object]]:
    grouped: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for row in breakdown:
        if row.status != "missing_cost":
            continue
        grouped[(row.component_key, row.component_label)]["quantity"] += row.quantity
        grouped[(row.component_key, row.component_label)]["orders"] += 1
    result = []
    for (key, label), counter in grouped.items():
        result.append(
            {
                "component_key": key,
                "component_label": label,
                "occurrences": int(counter["orders"]),
                "quantity": round(counter["quantity"], 2),
            }
        )
    return sorted(result, key=lambda r: (-r["occurrences"], r["component_label"]))


def manual_cost_template(missing_rows: list[dict[str, object]]) -> list[dict[str, object]]:
    template: list[dict[str, object]] = []
    for row in missing_rows:
        occurrences = int(row["occurrences"])
        key = str(row["component_key"])
        if key == "base_pending":
            priority = "P1_base_universal"
        elif occurrences >= 25:
            priority = "P1_high_frequency"
        elif occurrences >= 10:
            priority = "P2_medium_frequency"
        else:
            priority = "P3_low_frequency"
        template.append(
            {
                "priority": priority,
                "component_key": row["component_key"],
                "component_label": row["component_label"],
                "occurrences": row["occurrences"],
                "quantity": row["quantity"],
                "unit_cost_inc_vat_manual": "",
                "unit_cost_ex_vat_manual": "",
                "confidence": "manual_needed",
                "notes": "Rellenar coste unitario y rerun tools/calculate_order_margins.py cuando integremos esta tabla.",
            }
        )
    return template


def export_excel(files: list[tuple[str, str]]) -> None:
    try:
        import pandas as pd

        with pd.ExcelWriter(OUT / "mua_order_margins_v0.xlsx", engine="openpyxl") as writer:
            for sheet, filename in files:
                path = OUT / filename
                if path.exists() and path.stat().st_size:
                    pd.read_csv(path).to_excel(writer, sheet_name=sheet[:31], index=False)
    except Exception as exc:
        print(f"Excel export skipped: {exc}")


def main() -> None:
    # Refresh normalized Shopify lines first so this script is safe to rerun after CSV updates.
    import subprocess
    import sys

    subprocess.run([sys.executable, str(ROOT / "tools" / "build_margin_inputs.py")], check=True)
    margin_rows, breakdown_rows, catalog_rows = build_margin()
    summary_rows = summarize_by_month(margin_rows)
    missing_rows = missing_cost_summary(breakdown_rows)

    write_csv(OUT / "cost_catalog_v0.csv", catalog_rows)
    write_csv(OUT / "order_margin_v0.csv", margin_rows)
    write_csv(OUT / "order_margin_component_breakdown_v0.csv", breakdown_rows)
    write_csv(OUT / "margin_summary_by_month_v0.csv", summary_rows)
    write_csv(OUT / "missing_costs_summary_v0.csv", missing_rows)
    write_csv(OUT / "manual_cost_inputs_needed_v0.csv", manual_cost_template(missing_rows))
    export_excel(
        [
            ("order_margin", "order_margin_v0.csv"),
            ("month_summary", "margin_summary_by_month_v0.csv"),
            ("component_breakdown", "order_margin_component_breakdown_v0.csv"),
            ("missing_costs", "missing_costs_summary_v0.csv"),
            ("manual_inputs_needed", "manual_cost_inputs_needed_v0.csv"),
            ("cost_catalog", "cost_catalog_v0.csv"),
        ]
    )
    print(
        {
            "orders": len(margin_rows),
            "component_rows": len(breakdown_rows),
            "orders_with_missing_costs": sum(1 for row in margin_rows if row.missing_cost_items_count),
            "output": str(OUT / "mua_order_margins_v0.xlsx"),
        }
    )


if __name__ == "__main__":
    main()
