from __future__ import annotations

import csv
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "extracted"
OPS = ROOT / "data" / "ops"


@dataclass
class MaterialLot:
    material_key: str
    material_name: str
    category: str
    supplier: str
    document_date: str
    quantity: Optional[float]
    unit_cost_inc_vat: Optional[float]
    unit_cost_ex_vat: Optional[float]
    total_inc_vat: Optional[float]
    confidence: str
    source_file: str
    description: str
    notes: str = ""


@dataclass
class MaterialAverage:
    material_key: str
    material_name: str
    category: str
    primary_supplier: str
    lots_count: int
    total_quantity: float
    total_cost_inc_vat: float
    weighted_avg_unit_cost_inc_vat: Optional[float]
    min_unit_cost_inc_vat: Optional[float]
    max_unit_cost_inc_vat: Optional[float]
    confidence: str
    last_purchase_date: str
    suppliers_seen: str
    notes: str = ""


@dataclass
class SupplierRow:
    supplier: str
    category: str
    lots_count: int
    total_spend_inc_vat: float
    materials_seen: str
    notes: str = ""


@dataclass
class WorkflowTask:
    cadence: str
    owner_role: str
    task: str
    input_data: str
    output_data: str
    done_when: str


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    dicts = [asdict(row) if hasattr(row, "__dataclass_fields__") else row for row in rows]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(dicts[0].keys()))
        writer.writeheader()
        writer.writerows(dicts)


def fnum(value: str | None) -> Optional[float]:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def slug(value: str) -> str:
    value = value.lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ü": "u",
        "ñ": "n",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    return value or "unknown"


def normalize_material(row: dict[str, str]) -> tuple[str, str, str]:
    component = (row.get("component_guess") or "").strip()
    description = (row.get("description") or "").strip()
    text = f"{component} {description}".lower()

    if "cadena acero banada dorada" in text or ("cadena" in text and ("dorad" in text or "gold" in text)):
        return "chain_steel_gold_plated", "Cadena acero banada dorada", "cadena"
    if "cadena acero plateada" in text or ("cadena" in text and ("platead" in text or "steel" in text)):
        return "chain_steel_silver", "Cadena acero plateada", "cadena"
    if "bisel colgante circulo acero" in text or ("bisel" in text and ("circulo" in text or "círculo" in text)):
        return "bezel_circle_steel", "Bisel colgante circulo acero", "joya_acero"
    if "caja principal" in text or "automontable" in text:
        return "box_main", "Caja principal MalagaPack impresa", "packaging"
    if "cajita joya" in text or "caja de empaque de joyeria" in text or "caja de empaque de joyería" in text:
        return "jewelry_box_simple", "Cajita joya simple", "packaging"
    if "base adhesiva" in text or "cinta resistente" in text:
        return "adhesive_base", "Base adhesiva / cinta resistente", "consumible"
    if "taza de orina" in text or "recipiente" in text:
        return "mixing_cup", "Recipiente para mezcla", "consumible"
    if "petalo" in text or "pétalo" in text or "flor" in text:
        return "topping_petals", "Topping petalos/flores", "topping"
    if "lazo" in text or "lazito" in text:
        return "topping_bow", "Topping lazito", "topping"
    if component:
        key = f"{slug(component)}__{slug(description)[:48]}"
        return key, description[:90] or component, component
    return f"unknown__{slug(description)[:48]}", description[:90] or "Material sin clasificar", "sin_clasificar"


def build_lots() -> list[MaterialLot]:
    lots: list[MaterialLot] = []
    for row in read_csv(OUT / "material_purchase_lines.csv"):
        key, name, category = normalize_material(row)
        qty = fnum(row.get("quantity"))
        unit_inc = fnum(row.get("unit_cost_inc_vat"))
        unit_ex = fnum(row.get("unit_cost_ex_vat"))
        total_inc = fnum(row.get("total_inc_vat"))
        if total_inc is None and qty is not None and unit_inc is not None:
            total_inc = round(qty * unit_inc, 4)
        lots.append(
            MaterialLot(
                material_key=key,
                material_name=name,
                category=category,
                supplier=row.get("provider") or "",
                document_date=row.get("document_date") or "",
                quantity=qty,
                unit_cost_inc_vat=unit_inc,
                unit_cost_ex_vat=unit_ex,
                total_inc_vat=total_inc,
                confidence=row.get("confidence") or "",
                source_file=row.get("source_file") or "",
                description=row.get("description") or "",
                notes=row.get("notes") or "",
            )
        )
    return lots


def average_costs(lots: list[MaterialLot]) -> list[MaterialAverage]:
    grouped: dict[str, list[MaterialLot]] = defaultdict(list)
    for lot in lots:
        grouped[lot.material_key].append(lot)

    averages: list[MaterialAverage] = []
    for key, rows in grouped.items():
        known = [r for r in rows if r.quantity and r.quantity > 0 and r.unit_cost_inc_vat is not None]
        total_qty = sum(r.quantity or 0 for r in known)
        total_cost = sum((r.total_inc_vat if r.total_inc_vat is not None else (r.quantity or 0) * (r.unit_cost_inc_vat or 0)) for r in known)
        unit_values = [r.unit_cost_inc_vat for r in known if r.unit_cost_inc_vat is not None]
        supplier_spend: dict[str, float] = defaultdict(float)
        for r in rows:
            supplier_spend[r.supplier] += r.total_inc_vat or 0
        primary_supplier = max(supplier_spend.items(), key=lambda item: item[1])[0] if supplier_spend else ""
        confidence_values = {r.confidence for r in rows}
        if any("manual_high" in c for c in confidence_values):
            confidence = "manual_high"
        elif any("high" in c for c in confidence_values):
            confidence = "high"
        elif any("medium" in c for c in confidence_values):
            confidence = "medium"
        else:
            confidence = "low"
        averages.append(
            MaterialAverage(
                material_key=key,
                material_name=rows[0].material_name,
                category=rows[0].category,
                primary_supplier=primary_supplier,
                lots_count=len(rows),
                total_quantity=round(total_qty, 4),
                total_cost_inc_vat=round(total_cost, 4),
                weighted_avg_unit_cost_inc_vat=round(total_cost / total_qty, 4) if total_qty else None,
                min_unit_cost_inc_vat=round(min(unit_values), 4) if unit_values else None,
                max_unit_cost_inc_vat=round(max(unit_values), 4) if unit_values else None,
                confidence=confidence,
                last_purchase_date=max([r.document_date for r in rows if r.document_date] or [""]),
                suppliers_seen="; ".join(sorted({r.supplier for r in rows if r.supplier})),
                notes="Coste medio ponderado desde lotes historicos; revisar outliers antes de usar en margen final.",
            )
        )
    return sorted(averages, key=lambda r: (r.category, r.material_name))


def supplier_rows(lots: list[MaterialLot]) -> list[SupplierRow]:
    grouped: dict[str, list[MaterialLot]] = defaultdict(list)
    for lot in lots:
        grouped[lot.supplier].append(lot)
    rows: list[SupplierRow] = []
    for supplier, supplier_lots in sorted(grouped.items()):
        categories = sorted({lot.category for lot in supplier_lots if lot.category})
        materials = sorted({lot.material_name for lot in supplier_lots if lot.material_name})
        rows.append(
            SupplierRow(
                supplier=supplier,
                category="; ".join(categories),
                lots_count=len(supplier_lots),
                total_spend_inc_vat=round(sum(lot.total_inc_vat or 0 for lot in supplier_lots), 2),
                materials_seen="; ".join(materials[:30]),
                notes="Completar URL, plazo medio, MOQ y proveedor preferente en la app/tabla maestra.",
            )
        )
    return rows


def workflow_tasks() -> list[WorkflowTask]:
    return [
        WorkflowTask(
            "Cada compra",
            "Compras/Admin",
            "Guardar factura o captura en la carpeta del trimestre y registrar proveedor si es nuevo.",
            "PDF/PNG proveedor",
            "material_purchase_lines + q1_expense_ledger",
            "Cada compra tiene fecha, proveedor, material, cantidad y total pagado.",
        ),
        WorkflowTask(
            "Semanal",
            "Operaciones",
            "Ejecutar OCR/extraccion y revisar filas low/medium confidence.",
            "tools/ocr_pngs.ps1 + tools/extract_q1_costs.py",
            "mua_q1_cost_extraction.xlsx",
            "No quedan importes vacios y los manual_high estan documentados.",
        ),
        WorkflowTask(
            "Semanal",
            "Compras",
            "Actualizar coste medio ponderado y detectar materiales sin proveedor/coste fiable.",
            "tools/build_material_catalog.py",
            "material_average_costs_v0.csv",
            "Los P1 tienen coste medio y proveedor preferente.",
        ),
        WorkflowTask(
            "Diario en dias de pedidos",
            "Preparacion",
            "Exportar pedidos Shopify y recalcular margen/consumo.",
            "orders_export_1.csv",
            "order_margin_v0.csv",
            "Pedidos nuevos aparecen con coste conocido y huecos visibles.",
        ),
        WorkflowTask(
            "Mensual",
            "Direccion/Admin",
            "Revisar margen por mes, gasto Meta/agencia y coste de envio real.",
            "margin_summary_by_month_v0.csv + q1_expense_summary.csv",
            "decision mensual de precios, compras y marketing",
            "margen real y decisiones de precio/marketing actualizadas.",
        ),
        WorkflowTask(
            "Antes de comprar",
            "Compras",
            "Comparar stock real contra stock comprometido y punto de reposicion.",
            "inventario fisico + ventas + material_average_costs",
            "purchase_plan",
            "lista de compra priorizada por riesgo de rotura.",
        ),
    ]


def export_excel() -> None:
    try:
        import pandas as pd

        files = [
            ("material_lots", OPS / "material_lots_v0.csv"),
            ("average_costs", OPS / "material_average_costs_v0.csv"),
            ("suppliers", OPS / "suppliers_v0.csv"),
            ("workflow", OPS / "ops_workflow_tasks.csv"),
        ]
        with pd.ExcelWriter(OPS / "mua_material_catalog_v0.xlsx", engine="openpyxl") as writer:
            for sheet, path in files:
                if path.exists() and path.stat().st_size:
                    pd.read_csv(path).to_excel(writer, sheet_name=sheet[:31], index=False)
    except Exception as exc:
        print(f"Excel export skipped: {exc}")


def main() -> None:
    lots = build_lots()
    averages = average_costs(lots)
    suppliers = supplier_rows(lots)
    workflow = workflow_tasks()
    write_csv(OPS / "material_lots_v0.csv", lots)
    write_csv(OPS / "material_average_costs_v0.csv", averages)
    write_csv(OPS / "suppliers_v0.csv", suppliers)
    write_csv(OPS / "ops_workflow_tasks.csv", workflow)
    export_excel()
    print(
        {
            "material_lots": len(lots),
            "materials": len(averages),
            "suppliers": len(suppliers),
            "output": str(OPS / "mua_material_catalog_v0.xlsx"),
        }
    )


if __name__ == "__main__":
    main()
