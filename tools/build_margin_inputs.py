from __future__ import annotations

import csv
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
ORDERS_CSV = ROOT / "shopify" / "ventas" / "orders_export_1.csv"
OUT = ROOT / "data" / "extracted"


@dataclass
class OrderLine:
    order_name: str
    created_at: str
    financial_status: str
    fulfillment_status: str
    subtotal: Optional[float]
    shipping: Optional[float]
    taxes: Optional[float]
    total: Optional[float]
    discount_amount: Optional[float]
    refunded_amount: Optional[float]
    lineitem_quantity: int
    lineitem_name: str
    lineitem_price: Optional[float]
    lineitem_sku: str


@dataclass
class LineItemRule:
    lineitem_name: str
    orders_count: int
    units_sold: int
    revenue: float
    component_type_guess: str
    component_quantity_per_line: Optional[float]
    cost_source_status: str
    notes: str


def money(value: str | None) -> Optional[float]:
    if value is None or value.strip() == "":
        return None
    return round(float(value.replace(",", ".")), 4)


def classify_lineitem(name: str) -> tuple[str, Optional[float], str, str]:
    lower = name.lower()
    if "kit müa" in lower or "kit mua" in lower or "kit m" in lower:
        return "kit_base", 1.0, "manual_needed", "Consume todos los componentes base del kit."
    if "segundo kit" in lower:
        return "kit_base_extra", 1.0, "manual_needed", "Añade otro set de componentes base sin duplicar joya si el producto lo define así; revisar."
    if lower.startswith("material de la joya"):
        return "material_marker", None, "no_cost", "Marcador de material; el coste real lo aporta la joya elegida."
    if "cadena" in lower:
        return "cadena", 1.0, "candidate_available", "Coste candidato desde AliExpress/Shopify; revisar por modelo."
    if any(word in lower for word in ["colgante", "anillo", "pulsera", "charm", "pendientes", "llavero"]):
        return "joya", 1.0, "candidate_or_manual", "Necesita coste por modelo/material."
    if "letras" in lower:
        return "topping", 1.0, "candidate_or_manual", "Topping incluido o extra según posicion en pedido; revisar regla."
    if any(word in lower for word in ["flor", "brillo", "nácar", "nacar", "lazito", "pigmento", "toping", "topping"]):
        return "topping_extra", 1.0, "candidate_or_manual", "Añadido seleccionable; puede tener coste mínimo por unidad."
    return "other", 1.0, "manual_needed", "Clasificacion pendiente."


def read_order_lines() -> list[OrderLine]:
    lines: list[OrderLine] = []
    current_name = ""
    headers: dict[str, dict[str, str]] = {}
    with ORDERS_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["Name"].strip():
                current_name = row["Name"].strip()
                if row["Financial Status"].strip() or row["Total"].strip():
                    headers[current_name] = row
            if not current_name or current_name not in headers or not row["Lineitem name"].strip():
                continue
            current = headers[current_name]
            qty = int(float(row["Lineitem quantity"] or 0)) if row["Lineitem quantity"] else 0
            lines.append(
                OrderLine(
                    order_name=current_name,
                    created_at=current["Created at"],
                    financial_status=current["Financial Status"],
                    fulfillment_status=current["Fulfillment Status"] or "",
                    subtotal=money(current["Subtotal"]),
                    shipping=money(current["Shipping"]),
                    taxes=money(current["Taxes"]),
                    total=money(current["Total"]),
                    discount_amount=money(current["Discount Amount"]),
                    refunded_amount=money(current["Refunded Amount"]),
                    lineitem_quantity=qty,
                    lineitem_name=row["Lineitem name"].strip(),
                    lineitem_price=money(row["Lineitem price"]),
                    lineitem_sku=row["Lineitem sku"].strip(),
                )
            )
    return lines


def build_rules(lines: list[OrderLine]) -> list[LineItemRule]:
    units: Counter[str] = Counter()
    orders: dict[str, set[str]] = defaultdict(set)
    revenue: Counter[str] = Counter()
    for line in lines:
        units[line.lineitem_name] += line.lineitem_quantity
        orders[line.lineitem_name].add(line.order_name)
        revenue[line.lineitem_name] += line.lineitem_quantity * (line.lineitem_price or 0)
    rules: list[LineItemRule] = []
    for item, qty in units.most_common():
        component_type, component_qty, status, notes = classify_lineitem(item)
        rules.append(
            LineItemRule(
                lineitem_name=item,
                orders_count=len(orders[item]),
                units_sold=qty,
                revenue=round(revenue[item], 2),
                component_type_guess=component_type,
                component_quantity_per_line=component_qty,
                cost_source_status=status,
                notes=notes,
            )
        )
    return rules


def write_csv(path: Path, rows: list[object]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    dicts = [asdict(row) for row in rows]
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(dicts[0].keys()))
        writer.writeheader()
        writer.writerows(dicts)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    lines = read_order_lines()
    rules = build_rules(lines)
    write_csv(OUT / "shopify_order_lines_normalized.csv", lines)
    write_csv(OUT / "lineitem_component_rules_seed.csv", rules)
    print(
        {
            "order_lines": len(lines),
            "unique_lineitems": len(rules),
            "orders": len({line.order_name for line in lines}),
        }
    )


if __name__ == "__main__":
    main()
