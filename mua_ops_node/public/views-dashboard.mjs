export function createDashboardViews(ctx) {
  const { state, $, euro, text, number, badge, channelLabel, chartColors, compactTimeline, dashboardChart, img, entityIconMarkup, shopifyFreshnessState } = ctx;

  const percent = (value, digits = 1) => value == null || Number.isNaN(Number(value)) ? "-" : `${number(value).toFixed(digits)}%`;
  const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  const delta = (value, options = {}) => {
    if (value == null || Number.isNaN(Number(value))) {
      if (options.neutral && options.empty) return `<span class="dashboard-delta is-neutral">${text(options.empty)}</span>`;
      return options.empty || "";
    }
    const badDirection = options.inverse ? value > 0 : value < 0;
    const suffix = options.pp ? " pp" : "%";
    return `<span class="dashboard-delta ${badDirection ? "is-negative" : "is-positive"}">${value >= 0 ? "↑" : "↓"} ${Math.abs(number(value)).toFixed(options.digits ?? 1)}${suffix}</span>`;
  };
  const categoryLabel = (value) => ({
    materiales: "Materiales",
    marketing: "Marketing",
    impuestos: "Impuestos",
    envios: "Envíos",
    servicios: "Servicios",
    software: "Software",
    otros: "Otros"
  })[value] || text(value);
  const categoryColor = (value, colors) => colors[value] || colors.total;
  const marginBandLabel = (value) => ({ critical: "Crítico", pressure: "En presión", healthy: "Saludable" })[value] || text(value);
  const marginBandColor = (value, colors) => ({ critical: colors.margin_critical, pressure: colors.margin_pressure, healthy: colors.margin_healthy })[value] || colors.margin_pressure;
  const marginTone = (value, thresholds = {}) => value == null ? "neutral" : value < thresholds.critical ? "warn" : value < thresholds.healthy ? "attention" : "ok";
  const materialThumb = (row) => `<span class="dashboard-material-thumb">${img(row.image_url || row.material_image_url || row.image_url_override || "")}</span>`;
  const changeTone = (value) => value == null || Number.isNaN(Number(value)) || Math.abs(number(value)) < 0.05 ? "neutral" : number(value) > 0 ? "positive" : "negative";

  function setChart(id, option) {
    const chart = dashboardChart(id);
    if (chart) chart.setOption(option, true);
  }

  function tooltipBox(title, rows) {
    return `<div class="dashboard-chart-tooltip"><strong>${text(title)}</strong>${rows.map((row) => `<span><i style="background:${row.color}"></i>${text(row.label)}<b>${text(row.value)}</b></span>`).join("")}</div>`;
  }

  function commonAxis() {
    return {
      axisLine: { lineStyle: { color: "#d9d2ca" } },
      axisLabel: { color: "#766e68" },
      splitLine: { lineStyle: { color: "#eee9e3" } }
    };
  }

  function renderOperationCharts(finance, colors, mobile) {
    const income = number(finance.kpis.period_net_received);
    const balance = number(finance.kpis.period_balance);
    const category = Object.fromEntries((finance.category_spend || []).map((row) => [row.category, number(row.total)]));
    const expenseSteps = ["materiales", "marketing", "envios", "servicios", "software", "impuestos", "otros"]
      .filter((key) => Math.abs(number(category[key])) > 0.004)
      .map((key) => ({ label: categoryLabel(key), value: category[key], type: "expense", color: categoryColor(key, colors) }));
    const steps = [
      { label: "Ingresos\ncobrados", value: income, type: "income", color: colors.cobros },
      ...expenseSteps,
      { label: "Saldo\noperativo", value: balance, type: "balance", color: colors.balance || colors.cobros }
    ];
    let running = income;
    const bridgeBase = [0];
    const bridgeValues = [income];
    const bridgeLine = [income];
    const bridgeTooltips = [{ before: 0, movement: income, after: income, label: "Entra" }];
    for (let index = 1; index < steps.length - 1; index += 1) {
      const before = running;
      running -= steps[index].value;
      bridgeBase.push(Math.max(0, running));
      bridgeValues.push(steps[index].value);
      bridgeLine.push(running);
      bridgeTooltips.push({ before, movement: -steps[index].value, after: running, label: "Menos gasto" });
    }
    bridgeBase.push(0);
    bridgeValues.push(balance);
    bridgeLine.push(balance);
    bridgeTooltips.push({ before: balance, movement: 0, after: balance, label: "Saldo final" });
    setChart("dashboardBalanceChart", {
      animationDuration: 350,
      grid: { left: mobile ? 44 : 64, right: mobile ? 8 : 10, top: 34, bottom: mobile ? 58 : 48 },
      tooltip: { trigger: "item", formatter: ({ dataIndex }) => {
        const step = steps[dataIndex] || {};
        const tip = bridgeTooltips[dataIndex] || {};
        const rows = step.type === "balance"
          ? [{ label: "Queda", value: euro.format(tip.after || 0), color: step.color }]
          : [
            { label: "Había", value: euro.format(tip.before || 0), color: "#9e948b" },
            { label: tip.label || "Movimiento", value: `${tip.movement < 0 ? "-" : ""}${euro.format(Math.abs(number(tip.movement)))}`, color: step.color },
            { label: "Queda", value: euro.format(tip.after || 0), color: tip.after >= 0 ? colors.cobros : colors.marketing }
          ];
        return tooltipBox(String(step.label || "").replace(/\n/g, " "), rows);
      } },
      xAxis: { type: "category", data: steps.map((row) => row.label), ...commonAxis(), axisLabel: { color: "#766e68", fontSize: mobile ? 8 : 11, interval: 0, formatter: (value, index) => mobile && ![0, steps.length - 1].includes(index) ? "" : value } },
      yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis().splitLine },
      series: [
        { type: "bar", stack: "bridge", silent: true, itemStyle: { color: "transparent" }, data: bridgeBase },
        { type: "bar", stack: "bridge", barMaxWidth: mobile ? 32 : 58, data: bridgeValues.map((value, index) => ({ value, itemStyle: { color: steps[index].color, borderRadius: [5, 5, 0, 0] } })), label: { show: true, position: "top", formatter: ({ value, dataIndex }) => Math.abs(number(value)) < 0.005 || (mobile && ![0, steps.length - 1].includes(dataIndex)) ? "" : `${steps[dataIndex].type === "expense" ? "-" : ""}${euro.format(value)}`, fontWeight: 700, color: "#241f1b", fontSize: mobile ? 8 : 11 } },
        { type: "line", silent: true, symbol: "none", lineStyle: { color: "#9e948b", type: "dashed", width: 1 }, data: bridgeLine, z: 1 }
      ]
    });
    renderResultTrend(finance, colors);
    renderCategorySpend(finance, colors);
  }

  function renderResultTrend(finance, colors) {
    setChart("dashboardExpenseChart", {
      animationDuration: 350,
      grid: { left: 56, right: 18, top: 34, bottom: 38 },
      tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [
        { label: "Ingreso neto", value: euro.format(number(params.find((row) => row.seriesName === "Ingreso neto")?.value)), color: colors.cobros },
        { label: "Gasto", value: euro.format(number(params.find((row) => row.seriesName === "Gasto")?.value)), color: colors.total },
        { label: "Balance", value: euro.format(number(params.find((row) => row.seriesName === "Balance")?.value)), color: colors.balance }
      ]) },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Ingreso neto", "Gasto", "Balance"] },
      xAxis: { type: "category", data: compactTimeline(finance.trend?.keys || [], finance.granularity), ...commonAxis() },
      yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis().splitLine },
      series: [
        { name: "Ingreso neto", type: "bar", barMaxWidth: 22, itemStyle: { color: colors.cobros, borderRadius: [4, 4, 0, 0] }, data: finance.trend?.series?.cobros || [] },
        { name: "Gasto", type: "bar", barMaxWidth: 22, itemStyle: { color: colors.total, borderRadius: [4, 4, 0, 0] }, data: finance.trend?.series?.total || [] },
        { name: "Balance", type: "line", smooth: (finance.trend?.keys || []).length < 20, symbolSize: 6, lineStyle: { width: 2, color: colors.balance }, itemStyle: { color: colors.balance }, data: finance.trend?.series?.balance || [] }
      ]
    });
  }

  function renderCategorySpend(finance, colors) {
    const rows = [...(finance.category_spend || [])].filter((row) => number(row.total) > 0).sort((a, b) => b.total - a.total);
    const total = rows.reduce((sum, row) => sum + number(row.total), 0);
    setChart("dashboardIncomeChart", {
      animationDuration: 350,
      grid: { left: 112, right: 112, top: 12, bottom: 24 },
      tooltip: { trigger: "axis", formatter: (params) => tooltipBox(categoryLabel(params[0]?.axisValue || ""), [{ label: "Gasto registrado", value: euro.format(number(params[0]?.value)), color: categoryColor(params[0]?.axisValue, colors) }]) },
      xAxis: { type: "value", axisLabel: { show: false }, splitLine: commonAxis().splitLine },
      yAxis: { type: "category", inverse: true, data: rows.map((row) => row.category), axisLabel: { color: "#5d5650", formatter: categoryLabel }, axisLine: { show: false }, axisTick: { show: false } },
      series: [{ type: "bar", barMaxWidth: 18, data: rows.map((row) => ({ value: row.total, itemStyle: { color: categoryColor(row.category, colors), borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: ({ value }) => `${euro.format(number(value))} · ${total ? number(value / total * 100).toFixed(0) : 0}%`, color: "#241f1b", fontWeight: 700, fontSize: 10 } }]
    });
  }

  function renderSalesCharts(finance, colors) {
    const sales = finance.sales || {};
    const labels = compactTimeline((sales.series || []).map((row) => row.key), finance.granularity);
    setChart("dashboardBalanceChart", {
      animationDuration: 350,
      grid: { left: 58, right: 8, top: 34, bottom: 38 },
      tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [
        { label: "Periodo actual", value: euro.format(number(params.find((row) => row.seriesName === "Periodo actual")?.value)), color: colors.sales_revenue },
        { label: "Periodo anterior", value: euro.format(number(params.find((row) => row.seriesName === "Periodo anterior")?.value)), color: colors.sales_previous }
      ]) },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Periodo actual", "Periodo anterior"] },
      xAxis: { type: "category", data: labels, ...commonAxis() },
      yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis().splitLine },
      series: [
        { name: "Periodo actual", type: "line", smooth: true, symbolSize: 7, areaStyle: { color: "rgba(8,124,109,.08)" }, lineStyle: { width: 3, color: colors.sales_revenue }, itemStyle: { color: colors.sales_revenue }, data: (sales.cumulative || []).map((row) => row.current_sales) },
        { name: "Periodo anterior", type: "line", smooth: true, symbolSize: 6, lineStyle: { width: 2, type: "dashed", color: colors.sales_previous }, itemStyle: { color: colors.sales_previous }, data: (sales.cumulative || []).map((row) => row.previous_sales) }
      ]
    });
    setChart("dashboardExpenseChart", {
      animationDuration: 350,
      grid: { left: 58, right: 48, top: 34, bottom: 38 },
      tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [
        { label: "Venta neta", value: euro.format(number(params.find((row) => row.seriesName === "Venta neta")?.value)), color: colors.sales_revenue },
        { label: "Pedidos", value: `${number(params.find((row) => row.seriesName === "Pedidos")?.value).toFixed(0)}`, color: colors.sales_orders }
      ]) },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Venta neta", "Pedidos"] },
      xAxis: { type: "category", data: labels, ...commonAxis() },
      yAxis: [
        { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis().splitLine },
        { type: "value", axisLabel: { color: "#766e68", formatter: "{value}" }, splitLine: { show: false } }
      ],
      series: [
        { name: "Venta neta", type: "bar", barMaxWidth: 24, itemStyle: { color: colors.sales_revenue, borderRadius: [4, 4, 0, 0] }, data: (sales.series || []).map((row) => row.sales) },
        { name: "Pedidos", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 6, lineStyle: { width: 2, color: colors.sales_orders }, itemStyle: { color: colors.sales_orders }, data: (sales.series || []).map((row) => row.orders) }
      ]
    });
    setChart("dashboardIncomeChart", {
      animationDuration: 350,
      grid: { left: 58, right: 8, top: 34, bottom: 38 },
      tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [{ label: "Ticket medio", value: euro.format(number(params[0]?.value)), color: colors.sales_ticket }]) },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Ticket medio"] },
      xAxis: { type: "category", data: labels, ...commonAxis() },
      yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis().splitLine },
      series: [{ name: "Ticket medio", type: "line", smooth: true, connectNulls: true, symbolSize: 7, areaStyle: { color: "rgba(204,125,19,.08)" }, lineStyle: { width: 3, color: colors.sales_ticket }, itemStyle: { color: colors.sales_ticket }, data: (sales.series || []).map((row) => row.average_ticket) }]
    });
  }

  function renderProfitabilityCharts(finance, colors) {
    const profitability = finance.profitability || { series: [], bands: [], thresholds: {}, cost_drivers: [] };
    const labels = compactTimeline(profitability.series.map((row) => row.key), finance.granularity);
    setChart("dashboardBalanceChart", {
      animationDuration: 350,
      grid: { left: 58, right: 62, top: 34, bottom: 38 },
      tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [
        { label: "Venta neta", value: euro.format(number(params.find((row) => row.seriesName === "Venta neta")?.value)), color: colors.profit_sales },
        { label: "Coste real", value: euro.format(number(params.find((row) => row.seriesName === "Coste real")?.value)), color: colors.profit_cost },
        { label: "Margen ponderado", value: percent(params.find((row) => row.seriesName === "Margen ponderado")?.value), color: colors.profit_margin }
      ]) },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Venta neta", "Coste real", "Margen ponderado"] },
      xAxis: { type: "category", data: labels, ...commonAxis() },
      yAxis: [
        { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis().splitLine },
        { type: "value", min: 0, max: 100, axisLabel: { color: "#766e68", formatter: "{value}%" }, splitLine: { show: false } }
      ],
      series: [
        { name: "Venta neta", type: "bar", barMaxWidth: 28, itemStyle: { color: colors.profit_sales, borderRadius: [4, 4, 0, 0] }, data: profitability.series.map((row) => row.sales) },
        { name: "Coste real", type: "bar", barMaxWidth: 28, itemStyle: { color: colors.profit_cost, borderRadius: [4, 4, 0, 0] }, data: profitability.series.map((row) => row.cost) },
        { name: "Margen ponderado", type: "line", yAxisIndex: 1, smooth: profitability.series.length < 20, symbolSize: 7, lineStyle: { width: 3, color: colors.profit_margin }, itemStyle: { color: colors.profit_margin }, data: profitability.series.map((row) => row.weighted_margin_percent) }
      ]
    });
    const marginBands = profitability.bands || [];
    setChart("dashboardExpenseChart", {
      animationDuration: 350,
      grid: { left: 48, right: 18, top: 34, bottom: 34 },
      tooltip: { trigger: "item", formatter: ({ value, dataIndex }) => tooltipBox(marginBandLabel(marginBands[dataIndex]?.band), [{ label: "Venta neta", value: percent(value), color: marginBandColor(marginBands[dataIndex]?.band, colors) }, { label: "Pedidos", value: `${marginBands[dataIndex]?.orders || 0}`, color: "#766e68" }]) },
      xAxis: { type: "category", data: marginBands.map((row) => marginBandLabel(row.band)), ...commonAxis() },
      yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: "{value}%" }, splitLine: commonAxis().splitLine },
      series: [{ type: "bar", barMaxWidth: 64, data: marginBands.map((row) => ({ value: row.share_of_sales, itemStyle: { color: marginBandColor(row.band, colors), borderRadius: [6, 6, 0, 0] } })), label: { show: true, position: "top", formatter: ({ value }) => `${number(value).toFixed(1)}%`, fontWeight: 700, fontSize: 10 } }]
    });
    const drivers = profitability.cost_drivers || [];
    setChart("dashboardIncomeChart", {
      animationDuration: 350,
      grid: { left: 118, right: 18, top: 10, bottom: 24 },
      tooltip: { trigger: "axis", formatter: (params) => {
        const row = drivers[params[0]?.dataIndex] || {};
        return tooltipBox(row.label || "", [{ label: "Coste", value: euro.format(number(row.total)), color: params[0]?.color }, { label: "Peso del coste", value: percent(row.share_of_cost, 0), color: "#766e68" }]);
      } },
      xAxis: { type: "value", axisLabel: { show: false }, splitLine: commonAxis().splitLine },
      yAxis: { type: "category", inverse: true, data: drivers.map((row) => row.label), axisLabel: { color: "#5d5650", width: 105, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
      series: [{ type: "bar", barMaxWidth: 30, data: drivers.map((row) => ({ value: row.total, itemStyle: { color: row.key === "content" ? colors.cost_content : colors.cost_fixed, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "insideRight", formatter: ({ value, dataIndex }) => `${euro.format(number(value))} · ${number(drivers[dataIndex]?.share_of_cost).toFixed(0)}% coste`, color: "#fff", fontWeight: 700, fontSize: 9 } }]
    });
  }

  function renderDashboardCharts() {
    if (!$("#dashboard")?.classList.contains("active")) return;
    const finance = state.dashboardFinance;
    if (!finance || !window.echarts) return;
    const colors = chartColors();
    const mode = state.dashboardMode || "operation";
    const mobile = window.innerWidth <= 720;
    if (mode === "sales") renderSalesCharts(finance, colors, mobile);
    else if (mode === "profitability") renderProfitabilityCharts(finance, colors, mobile);
    else renderOperationCharts(finance, colors, mobile);
  }

  function actionRows(finance) {
    const operational = finance.operational || {};
    const replenishment = finance.replenishment || {};
    const quality = finance.data_quality || {};
    return [
      { label: "Compras urgentes", hint: `${replenishment.critical_count || 0} críticas · ${euro.format(replenishment.estimated_cost || 0)} recomendados`, count: replenishment.actionable_count || 0, icon: "icon-truck", action: "materials", context: "replenishment", tone: replenishment.critical_count ? "warn" : "ok" },
      { label: "Gastos por cerrar", hint: "El importe ya está incluido en el balance", count: quality.draft_expenses || 0, icon: "icon-file", action: "invoices", context: "draft", tone: quality.draft_expenses ? "attention" : "ok" },
      { label: "Importaciones por validar", hint: `${quality.import_pending || 0} procesándose`, count: quality.import_review || 0, icon: "icon-refresh", action: "invoices", context: "imports", tone: quality.import_review ? "attention" : "ok" },
      { label: "Pedidos con margen en presión", hint: `Umbral saludable desde ${percent(finance.profitability?.thresholds?.healthy, 0)}`, count: (finance.profitability?.bands || []).filter((row) => row.band !== "healthy").reduce((sum, row) => sum + number(row.orders), 0), icon: "icon-percent", action: "kits", context: "low_margin", tone: finance.profitability?.low_margin_orders?.length ? "warn" : "ok" },
      { label: "Ingresos pendientes", hint: "Cobros todavía no ejecutados", count: operational.pending_payout_count || finance.kpis?.global_pending_payout_count || 0, icon: "icon-wallet", action: "income", context: "pending", tone: (operational.pending_payout_count || finance.kpis?.global_pending_payout_count) ? "attention" : "ok" }
    ];
  }

  function renderDashboard() {
    const finance = state.dashboardFinance;
    if (!finance) return;
    const mode = state.dashboardMode || "operation";
    const colors = chartColors();
    const p = finance.profitability || { metrics: {}, thresholds: {}, bands: [], low_margin_orders: [], kits: [] };
    const s = finance.sales || { metrics: {}, comparison: {}, ticket_bands: [], top_products: [] };
    const k = finance.kpis || {};
    const comparison = state.dashboardComparison === false ? {} : (finance.comparison || {});
    const salesComparison = state.dashboardComparison === false ? {} : (s.comparison || {});
    const periodOptions = [
      ["this_month", "Este mes"], ["last_30_days", "Últimos 30 días"], ["this_quarter", "Este trimestre"],
      ["last_3_months", "Últimos 3 meses"], ["last_6_months", "Últimos 6 meses"], ["this_year", "Este año"],
      ["all", "Todo el periodo"], ["custom", "Personalizado"]
    ];
    const granularityOptions = [["auto", "Auto"], ["day", "Diaria"], ["week", "Semanal"], ["month", "Mensual"], ["quarter", "Trimestral"]];
    const selectedGranularity = state.dashboardGranularity || "auto";
    const freshness = shopifyFreshnessState(state.shopifySyncStatus || state.shopifyConnection || {});
    $("#dashboardFreshness").className = `dashboard-freshness is-${freshness.tone}`;
    $("#dashboardFreshness").innerHTML = `<i></i>${text(freshness.label)}`;
    $("#dashboardPeriodOptions").innerHTML = periodOptions.map(([value, label]) => `<button type="button" class="${state.dashboardWindowPreset === value ? "is-active" : ""}" data-dashboard-period-option="${value}"><i></i><span>${label}</span></button>`).join("");
    $("#dashboardGranularityOptions").innerHTML = granularityOptions.map(([value, label]) => `<button type="button" class="${selectedGranularity === value ? "is-active" : ""}" data-dashboard-granularity-option="${value}"><i></i><span>${label}</span></button>`).join("");
    $("#dashboardWindowLabel").textContent = finance.window?.label || "Todo el periodo";
    $("#dashboardFilterSummary").textContent = `${granularityOptions.find(([value]) => value === selectedGranularity)?.[1] || "Mensual"} · ${state.dashboardComparison === false ? "sin comparación" : "vs. periodo anterior"}`;
    $("#dashboardWindowPreset").value = state.dashboardWindowPreset || "this_month";
    $("#dashboardGranularity").value = selectedGranularity;
    $("#dashboardComparison").checked = state.dashboardComparison !== false;
    $("#dashboardFrom").value = state.dashboardWindowFrom || "";
    $("#dashboardTo").value = state.dashboardWindowTo || "";
    $("#dashboardCustomRange").classList.toggle("hidden", state.dashboardWindowPreset !== "custom");
    document.querySelectorAll("[data-dashboard-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.dashboardMode === mode));

    const cards = mode === "sales" ? [
      ["Venta neta", euro.format(s.metrics.total_sales || 0), delta(salesComparison.sales_change_percent), "icon-chart", "green"],
      ["Pedidos", `${s.metrics.total_orders || 0}`, delta(salesComparison.orders_change_percent), "icon-kit", "green"],
      ["Ticket medio", euro.format(s.metrics.average_ticket || 0), delta(salesComparison.ticket_change_percent), "icon-tag", "neutral"],
      ["Beneficio medio fiable", s.metrics.average_profit_per_reliable_order == null ? "-" : euro.format(s.metrics.average_profit_per_reliable_order), delta(salesComparison.average_profit_per_reliable_order_change_percent, { empty: `${percent(p.metrics.reliable_coverage_percent)} cobertura fiable` }), "icon-coin", "green"],
      ["Marketing por pedido", s.metrics.marketing_per_order == null ? "-" : euro.format(s.metrics.marketing_per_order), delta(salesComparison.marketing_per_order_change_percent, { empty: "Sin periodo previo", neutral: true, inverse: true }), "icon-megaphone", "rose"]
    ] : mode === "profitability" ? [
      ["Ventas fiables", euro.format(p.metrics.net_sales), delta(comparison.net_sales_change_percent, { empty: `${p.metrics.reliable_orders || 0} pedidos` }), "icon-chart", "green"],
      ["Beneficio estimado", euro.format(p.metrics.total_profit), delta(comparison.total_profit_change_percent, { empty: "Venta menos coste real" }), "icon-coin", "green"],
      ["Margen ponderado", percent(p.metrics.weighted_margin_percent), delta(comparison.weighted_margin_change_points, { pp: true, empty: `${percent(p.metrics.reliable_coverage_percent)} cobertura fiable` }), "icon-percent", marginTone(p.metrics.weighted_margin_percent, p.thresholds)],
      ["Coste real vendido", euro.format((p.metrics.net_sales || 0) - (p.metrics.total_profit || 0)), delta(comparison.real_cost_sold_change_percent, { empty: "Contenido más set fijo" }), "icon-cube", "rose"],
      ["Ticket medio", euro.format(p.metrics.average_ticket), delta(comparison.average_ticket_change_percent, { empty: `${p.metrics.total_orders || 0} pedidos` }), "icon-tag", "neutral"]
    ] : [
      ["Ingreso neto", euro.format(k.period_net_received), delta(comparison.income_change_percent, { empty: "Sin periodo previo", neutral: true }), "icon-chart", "green"],
      ["Gasto comprometido", euro.format(k.period_expense), delta(comparison.expense_change_percent, { empty: "Sin periodo previo", neutral: true, inverse: true }), "icon-file", "rose"],
      ["Balance operativo", euro.format(k.period_balance), delta(comparison.balance_change_percent, { empty: "Sin periodo previo", neutral: true }), "icon-activity", k.period_balance >= 0 ? "green" : "rose"],
      ["Margen ponderado", percent(k.weighted_margin_percent), delta(comparison.weighted_margin_change_points, { pp: true, empty: "Sin periodo previo", neutral: true }), "icon-coin", marginTone(k.weighted_margin_percent, p.thresholds)],
      ["Ticket medio", euro.format(p.metrics.average_ticket), delta(comparison.average_ticket_change_percent), "icon-tag", "neutral"]
    ];
    $("#dashboardCards").innerHTML = cards.map(([label, value, hint, itemIcon, tone]) => `<article class="dashboard-kpi-card is-${tone}"><span class="dashboard-kpi-icon">${icon(itemIcon)}</span><span class="dashboard-kpi-label">${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join("");

    const titleMap = {
      operation: ["Cómo se forma el saldo operativo", "Desglose del ingreso neto cobrado y los principales costes registrados.", finance.window?.label || ""],
      sales: ["Ventas acumuladas vs. periodo anterior", "Ritmo comercial acumulado alineado con la misma duración del periodo previo.", finance.window?.label || ""],
      profitability: ["Evolución de la rentabilidad", "Venta neta, coste real y margen ponderado de pedidos fiables.", `${percent(p.metrics.reliable_coverage_percent)} cobertura`]
    };
    $("#dashboardPrimaryTitle").textContent = titleMap[mode][0];
    $("#dashboardPrimaryText").textContent = titleMap[mode][1];
    $("#dashboardPrimaryBadge").textContent = titleMap[mode][2];
    $("#dashboardActionTitle").textContent = mode === "profitability" ? "Pedidos bajo presión" : mode === "sales" ? "Lectura de ventas" : "Prioridades de hoy";
    $("#dashboardActionText").textContent = mode === "profitability" ? `Pedidos por debajo del umbral saludable de ${percent(p.thresholds.healthy, 0)}.` : mode === "sales" ? "Señales comerciales que no duplican los KPIs." : "Problemas concretos que necesitan una decisión.";

    const rows = mode === "profitability" ? p.low_margin_orders.map((order) => ({
      label: order.order_number || `Pedido #${order.id}`,
      hint: `${euro.format(order.net_amount)} venta · ${euro.format(order.real_cost)} coste real`,
      count: percent(order.margin_percent),
      icon: "icon-percent",
      action: "kits",
      context: "low_margin",
      tone: order.margin_band === "critical" ? "warn" : "attention"
    })) : mode === "sales" ? [
      { label: "Venta vs. periodo anterior", hint: "Ritmo acumulado del periodo activo", count: delta(salesComparison.sales_change_percent) || "-", icon: "icon-chart", action: "income", tone: "ok" },
      { label: "Pedidos registrados", hint: "Volumen de pedidos del periodo", count: s.metrics.total_orders || 0, icon: "icon-kit", action: "kits", tone: "ok" },
      { label: "Ticket medio", hint: "Cambio de valor por pedido", count: euro.format(s.metrics.average_ticket || 0), icon: "icon-tag", action: "kits", tone: "attention" },
      { label: "Marketing por pedido", hint: "Gasto marketing / pedidos del periodo", count: s.metrics.marketing_per_order == null ? "-" : euro.format(s.metrics.marketing_per_order), icon: "icon-megaphone", action: "invoices", tone: "warn" }
    ] : actionRows(finance);
    $("#dashboardOpsList").innerHTML = `<div class="dashboard-action-list">${rows.map((row) => `<button type="button" class="dashboard-action-row is-${row.tone}" data-jump-view="${row.action}" data-jump-context="${row.context || ""}"><span class="dashboard-action-icon">${icon(row.icon)}</span><span class="dashboard-action-copy"><strong>${row.label}</strong><small>${row.hint}</small></span><b>${row.count}</b><span class="dashboard-action-arrow">${icon("icon-arrow-right")}</span></button>`).join("") || `<div class="empty-state small">No hay decisiones pendientes en este bloque.</div>`}</div>`;

    const insightGrid = $("#dashboardInsightGrid");
    insightGrid.classList.toggle("hidden", mode === "profitability");
    if (mode === "operation") renderOperationInsights(finance, p, colors);
    if (mode === "sales") renderSalesInsights(s, p);

    $("#dashboardSecondaryTitle").textContent = mode === "sales" ? "Ventas y pedidos por periodo" : mode === "operation" ? "Evolución de resultados" : "Distribución del margen";
    $("#dashboardSecondaryText").textContent = mode === "sales" ? "Volumen vendido y carga comercial según la granularidad elegida." : mode === "operation" ? "Ingreso neto, gasto comprometido y saldo por granularidad." : "Pedidos y venta neta por rango de margen.";
    $("#dashboardTertiaryTitle").textContent = mode === "sales" ? "Evolución del ticket medio" : mode === "operation" ? "Dónde se va el gasto" : "Qué consume el margen";
    $("#dashboardTertiaryText").textContent = mode === "sales" ? "Cómo cambia el valor medio de cada pedido a lo largo del periodo." : mode === "operation" ? "Categorías que explican el gasto registrado." : "Bloques que forman el coste real de los pedidos fiables.";
    $("#dashboardDetailTitle").textContent = mode === "sales" ? "Joyas con mayor demanda" : mode === "operation" ? "Dependencia de proveedores" : "Rentabilidad por set fijo";
    $("#dashboardDetailText").textContent = mode === "sales" ? "Solo materiales tipo joya con más unidades y presencia en pedidos." : mode === "operation" ? "Proveedores que concentran mayor gasto comprometido y su peso." : "Comparativa ponderada de las configuraciones aplicadas a pedidos.";
    renderDetailRows(finance, p, s, mode);
    requestAnimationFrame(renderDashboardCharts);
  }

  function renderOperationInsights(finance, p, colors) {
    const recommendations = (finance.replenishment?.recommendations || []).slice(0, 3);
    const channelTotal = (finance.income_channels || []).reduce((sum, row) => sum + number(row.net_amount), 0);
    const marginBands = p.bands || [];
    const marginSalesTotal = marginBands.reduce((sum, row) => sum + number(row.sales), 0);
    $("#dashboardInsightGrid").innerHTML = `
      <section class="panel dashboard-driver-panel">
        <div class="dashboard-driver-head"><span>${icon("icon-cube")}</span><div><small>Compra recomendada</small><strong>${finance.replenishment?.actionable_count || 0} materiales · ${euro.format(finance.replenishment?.estimated_cost || 0)}</strong></div><button type="button" data-jump-view="materials" data-jump-context="replenishment"><span>Revisar</span>${icon("icon-arrow-right")}</button></div>
        <div class="dashboard-driver-list dashboard-recommendation-list">${recommendations.map((row) => `<div>${materialThumb(row)}<span><strong>${text(row.name)}</strong><small>${text(row.supplier_name || row.preferred_supplier_name, "Sin proveedor")} · ${number(row.suggested_quantity)} uds</small></span><b>${euro.format(row.estimated_cost || 0)}</b></div>`).join("") || `<p>Sin compras recomendadas.</p>`}</div>
      </section>
      <section class="panel dashboard-driver-panel">
        <div class="dashboard-driver-head"><span>${icon("icon-wallet")}</span><div><small>Canales de ingreso</small><strong>${euro.format(channelTotal)}</strong></div><button type="button" data-jump-view="income"><span>Ver</span>${icon("icon-arrow-right")}</button></div>
        <div class="dashboard-channel-bar">${(finance.income_channels || []).map((row) => `<i style="width:${channelTotal ? (number(row.net_amount) / channelTotal) * 100 : 0}%;background:${colors[`channel_${row.channel}`] || colors[row.channel] || colors.cobros}"></i>`).join("")}</div>
        <div class="dashboard-driver-list dashboard-channel-list">${(finance.income_channels || []).slice(0, 3).map((row) => `<div>${entityIconMarkup(row.channel, { type: "channel", className: "dashboard-entity-icon", label: channelLabel(row.channel) })}<span><strong>${channelLabel(row.channel)}</strong><small>${channelTotal ? percent((number(row.net_amount) / channelTotal) * 100) : "-"}</small></span><b>${euro.format(row.net_amount)}</b></div>`).join("")}</div>
      </section>
      <section class="panel dashboard-driver-panel dashboard-margin-panel">
        <div class="dashboard-driver-head"><span>${icon("icon-percent")}</span><div><small>Margen en pedidos</small><strong>${percent(p.metrics.weighted_margin_percent)} ponderado</strong></div><button type="button" data-jump-view="kits" data-jump-context="low_margin"><span>Ver</span>${icon("icon-arrow-right")}</button></div>
        <div class="dashboard-margin-band">${marginBands.map((row) => `<i style="width:${marginSalesTotal ? (number(row.sales) / marginSalesTotal) * 100 : 0}%;background:${marginBandColor(row.band, colors)}"></i>`).join("")}</div>
        <div class="dashboard-driver-list">${marginBands.map((row) => `<div><span><strong>${marginBandLabel(row.band)}</strong><small>${row.orders || 0} pedidos · ${euro.format(row.sales || 0)} de venta</small></span><b>${percent(row.share_of_sales, 0)}</b></div>`).join("") || `<p>Sin pedidos fiables en el periodo.</p>`}</div>
      </section>`;
  }

  function renderSalesInsights(s, p) {
    const bands = s.ticket_bands || [];
    const top = (s.top_products || []).slice(0, 3);
    $("#dashboardInsightGrid").innerHTML = `
      <section class="panel dashboard-driver-panel">
        <div class="dashboard-driver-head"><span>${icon("icon-tag")}</span><div><small>Distribución del ticket</small><strong>${s.metrics.total_orders || 0} pedidos</strong></div></div>
        <div class="dashboard-driver-list">${bands.map((row) => `<div><span><strong>${text(row.label)}</strong><small>${row.orders || 0} pedidos · ${euro.format(row.sales || 0)}</small></span><b>${percent(row.share_of_orders, 0)}</b></div>`).join("")}</div>
      </section>
      <section class="panel dashboard-driver-panel">
        <div class="dashboard-driver-head"><span>${icon("icon-cube")}</span><div><small>Joyas con salida</small><strong>${top.reduce((sum, row) => sum + number(row.units), 0).toFixed(0)} uds top</strong></div><button type="button" data-jump-view="kits"><span>Ver</span>${icon("icon-arrow-right")}</button></div>
        <div class="dashboard-driver-list dashboard-recommendation-list">${top.map((row) => `<div>${materialThumb(row)}<span><strong>${text(row.title)}</strong><small>${row.order_count || 0} pedidos · ${number(row.units).toFixed(0)} uds</small></span><b class="dashboard-change-pill is-${changeTone(row.units_change_percent)}">${percent(row.units_change_percent, 0)}</b></div>`).join("") || `<p>Sin joyas vendidas en este periodo.</p>`}</div>
      </section>
      <section class="panel dashboard-driver-panel">
        <div class="dashboard-driver-head"><span>${icon("icon-coin")}</span><div><small>Beneficio medio fiable</small><strong>${s.metrics.average_profit_per_reliable_order == null ? "-" : euro.format(s.metrics.average_profit_per_reliable_order)}</strong></div></div>
        <div class="dashboard-driver-list"><div><span><strong>Venta total</strong><small>Pedidos del periodo activo</small></span><b>${euro.format(s.metrics.total_sales || 0)}</b></div><div><span><strong>Ticket medio</strong><small>Lectura comercial principal</small></span><b>${euro.format(s.metrics.average_ticket || 0)}</b></div><div><span><strong>Cobertura fiable</strong><small>Pedidos con coste explicable</small></span><b>${percent(p.metrics.reliable_coverage_percent)}</b></div></div>
      </section>`;
  }

  function renderDetailRows(finance, p, s, mode) {
    const rows = mode === "sales" ? (s.top_products || []).map((row) => ({
      title: row.title,
      hint: `${row.order_count || 0} pedidos · ${number(row.units).toFixed(0)} uds`,
      value: percent(row.units_change_percent, 0),
      extra: "",
      avatar: materialThumb(row),
      tone: changeTone(row.units_change_percent)
    })) : mode === "operation" ? (finance.top_suppliers || []).map((row, index) => ({
      title: row.supplier_name,
      hint: `${row.invoice_count} gastos registrados`,
      value: euro.format(row.total_spend),
      extra: finance.kpis.period_expense ? percent((row.total_spend / finance.kpis.period_expense) * 100) : "-",
      avatar: entityIconMarkup(row.supplier_name, { type: "supplier", className: "dashboard-entity-icon", label: row.supplier_name }) || `<span class="dashboard-rank-index">${index + 1}</span>`
    })) : (p.kits || []).map((row) => ({
      title: row.name,
      hint: `${row.orders} pedidos · ${euro.format(row.sales)} ventas`,
      value: percent(row.weighted_margin_percent),
      extra: euro.format(row.profit),
      avatar: `<span class="dashboard-rank-index">#</span>`
    }));
    $("#dashboardSpendList").innerHTML = `<div class="dashboard-rank-list">${rows.map((row, index) => `<div class="dashboard-rank-row">${row.avatar || `<span class="dashboard-rank-index">${index + 1}</span>`}<span><strong>${text(row.title)}</strong><small>${row.hint}</small></span><b class="${row.tone ? `dashboard-change-pill is-${row.tone}` : ""}">${row.value}</b><em>${row.extra}</em></div>`).join("") || `<div class="empty-state small">Todavía no hay datos suficientes para esta lectura.</div>`}</div>`;
  }

  return { renderDashboardCharts, renderDashboard };
}
