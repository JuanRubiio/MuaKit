from __future__ import annotations

import csv
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OPS = ROOT / "data" / "ops"


@dataclass
class StockPolicy:
    material_key: str
    material_name: str
    category: str
    primary_supplier: str
    weighted_avg_unit_cost_inc_vat: str
    current_stock_manual: str
    reorder_point_manual: str
    target_stock_manual: str
    lead_time_days_manual: str
    preferred_order_qty_manual: str
    storage_location_manual: str
    notes: str


@dataclass
class StockCount:
    count_date: str
    material_key: str
    material_name: str
    counted_qty: str
    counted_by: str
    location: str
    notes: str


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
    dicts = [asdict(row) for row in rows]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(dicts[0].keys()))
        writer.writeheader()
        writer.writerows(dicts)


def build_stock_policy() -> list[StockPolicy]:
    rows = []
    for material in read_csv(OPS / "material_average_costs_v0.csv"):
        rows.append(
            StockPolicy(
                material_key=material["material_key"],
                material_name=material["material_name"],
                category=material["category"],
                primary_supplier=material["primary_supplier"],
                weighted_avg_unit_cost_inc_vat=material["weighted_avg_unit_cost_inc_vat"],
                current_stock_manual="",
                reorder_point_manual="",
                target_stock_manual="",
                lead_time_days_manual="",
                preferred_order_qty_manual="",
                storage_location_manual="",
                notes="Rellenar manualmente; luego la app calculara riesgo de rotura y compra recomendada.",
            )
        )
    return rows


def build_stock_count_template() -> list[StockCount]:
    rows = []
    for material in read_csv(OPS / "material_average_costs_v0.csv"):
        rows.append(
            StockCount(
                count_date="",
                material_key=material["material_key"],
                material_name=material["material_name"],
                counted_qty="",
                counted_by="",
                location="",
                notes="",
            )
        )
    return rows


def main() -> None:
    policy = build_stock_policy()
    counts = build_stock_count_template()
    write_csv(OPS / "stock_policy_template_v0.csv", policy)
    write_csv(OPS / "stock_count_template_v0.csv", counts)
    print({"stock_policy_rows": len(policy), "stock_count_rows": len(counts)})


if __name__ == "__main__":
    main()
