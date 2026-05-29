import type { FunctionalComponent } from "preact";
import { useEffect, useRef } from "preact/hooks";
import * as echarts from "echarts";
import type { CostDetail, DashboardFinance } from "./types";

export const ChartSurface: FunctionalComponent<{ option: echarts.EChartsCoreOption | null; className?: string }> = ({
  option,
  className
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current || !option) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} className={`next-chart ${className || ""}`.trim()} />;
};

export function buildExpenseChart(finance: DashboardFinance | null) {
  if (!finance) return null;
  const keys = finance.monthly_breakdown?.keys ?? [];
  const total = finance.monthly_breakdown?.series?.total ?? [];
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 18, top: 20, bottom: 30 },
    xAxis: { type: "category", data: keys },
    yAxis: { type: "value" },
    series: [
      {
        data: total,
        type: "line",
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(22,107,94,0.25)" },
            { offset: 1, color: "rgba(22,107,94,0.02)" }
          ])
        },
        lineStyle: { color: "#166b5e", width: 3 },
        itemStyle: { color: "#166b5e" }
      }
    ]
  } as echarts.EChartsCoreOption;
}

export function buildIncomeChart(finance: DashboardFinance | null) {
  if (!finance) return null;
  const keys = finance.monthly_breakdown?.keys ?? [];
  const income = finance.monthly_breakdown?.series?.cobros ?? [];
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 18, top: 20, bottom: 30 },
    xAxis: { type: "category", data: keys },
    yAxis: { type: "value" },
    series: [
      {
        data: income,
        type: "line",
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(15,79,69,0.22)" },
            { offset: 1, color: "rgba(15,79,69,0.03)" }
          ])
        },
        lineStyle: { color: "#0f4f45", width: 3 },
        itemStyle: { color: "#0f4f45" }
      }
    ]
  } as echarts.EChartsCoreOption;
}

export function buildBalanceChart(finance: DashboardFinance | null) {
  if (!finance) return null;
  const keys = finance.monthly_breakdown?.keys ?? [];
  const total = finance.monthly_breakdown?.series?.total ?? [];
  const income = finance.monthly_breakdown?.series?.cobros ?? [];
  const balance = finance.monthly_breakdown?.series?.balance ?? [];
  return {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 48, right: 18, top: 36, bottom: 30 },
    xAxis: { type: "category", data: keys },
    yAxis: { type: "value" },
    series: [
      { name: "Gasto", data: total, type: "bar", itemStyle: { color: "#b85d72" } },
      { name: "Ingreso", data: income, type: "bar", itemStyle: { color: "#166b5e" } },
      { name: "Balance", data: balance, type: "line", smooth: true, itemStyle: { color: "#c18a3a" }, lineStyle: { color: "#c18a3a", width: 3 } }
    ]
  } as echarts.EChartsCoreOption;
}

export function buildCategoryChart(finance: DashboardFinance | null) {
  if (!finance) return null;
  const categories = finance.expense_categories ?? [];
  return {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{ type: "pie", radius: ["48%", "70%"], center: ["50%", "42%"], label: { show: false }, data: categories.map((row) => ({ name: row.category, value: row.total })) }]
  } as echarts.EChartsCoreOption;
}

export function buildIncomeMixChart(finance: DashboardFinance | null) {
  if (!finance) return null;
  const channels = finance.income_channels ?? [];
  return {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{ type: "pie", radius: ["48%", "70%"], center: ["50%", "42%"], label: { show: false }, data: channels.map((row) => ({ name: row.channel, value: row.net_amount })) }]
  } as echarts.EChartsCoreOption;
}

export function buildReorderChart(finance: DashboardFinance | null) {
  if (!finance) return null;
  const rows = (finance.reorder_alerts ?? []).slice(0, 8);
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 132, right: 18, top: 16, bottom: 30 },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: rows.map((row) => row.name) },
    series: [
      { name: "Stock", type: "bar", data: rows.map((row) => row.effective_stock_qty), itemStyle: { color: "#166b5e" } },
      { name: "Reposición", type: "line", data: rows.map((row) => row.reorder_point), itemStyle: { color: "#c18a3a" }, lineStyle: { color: "#c18a3a", width: 3 } }
    ]
  } as echarts.EChartsCoreOption;
}

export function buildCostEvolutionChart(costDetail: CostDetail | null) {
  if (!costDetail) return null;
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 18, top: 16, bottom: 30 },
    xAxis: { type: "category", data: costDetail.lots.map((lot) => lot.invoice_date) },
    yAxis: { type: "value" },
    series: [{ name: "Coste ud", type: "line", smooth: false, data: costDetail.lots.map((lot) => lot.unit_cost), itemStyle: { color: "#9f7234" }, lineStyle: { color: "#9f7234", width: 3 } }]
  } as echarts.EChartsCoreOption;
}
