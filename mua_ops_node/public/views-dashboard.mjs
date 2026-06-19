export function createDashboardViews(ctx) {
  const { state, $, euro, text, number, badge, channelLabel, chartColors, compactTimeline, dashboardChart, img, entityIconMarkup } = ctx;

  const percent = (value, digits = 1) => value == null ? "—" : `${number(value).toFixed(digits)}%`;
  const delta = (value) => value == null ? "" : `<span class="dashboard-delta ${value >= 0 ? "is-positive" : "is-negative"}">${value >= 0 ? "↑" : "↓"} ${Math.abs(number(value)).toFixed(1)}%</span>`;
  const marginTone = (value, thresholds) => value == null ? "neutral" : value < thresholds.critical ? "warn" : value < thresholds.healthy ? "attention" : "ok";
  const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  const categoryLabel = (value) => ({
    materiales: "Materiales",
    marketing: "Marketing",
    envios: "Envíos",
    servicios: "Servicios",
    software: "Software",
    otros: "Otros"
  })[value] || text(value);
  const categoryColor = (value, colors) => colors[value] || colors.total;
  const marginBandLabel = (value) => ({ critical: "Crítico", pressure: "En presión", healthy: "Saludable" })[value] || text(value);
  const marginBandColor = (value, colors) => ({ critical: colors.margin_critical, pressure: colors.margin_pressure, healthy: colors.margin_healthy })[value] || colors.margin_pressure;
  const materialThumb = (row) => `<span class="dashboard-material-thumb">${img(row.image_url || row.material_image_url || row.image_url_override || "")}</span>`;

  function setChart(id, option) {
    const chart = dashboardChart(id);
    if (chart) chart.setOption(option, true);
  }

  function renderDashboardCharts() {
    if (!$("#dashboard")?.classList.contains("active")) return;
    const finance = state.dashboardFinance;
    if (!finance || !window.echarts) return;
    const mode = state.dashboardMode || "operation";
    const mobile = window.innerWidth <= 720;
    const colors = chartColors();
    const labels = compactTimeline(finance.trend?.keys || [], finance.granularity);
    const commonAxis = {
      axisLine: { lineStyle: { color: "#d9d2ca" } },
      axisLabel: { color: "#766e68" },
      splitLine: { lineStyle: { color: "#eee9e3" } }
    };
    const tooltipBox = (title, rows) => `
      <div class="dashboard-chart-tooltip">
        <strong>${title}</strong>
        ${rows.map((row) => `<span><i style="background:${row.color || colors.cobros}"></i>${row.label}<b>${row.value}</b></span>`).join("")}
      </div>`;

    if (mode === "operation") {
      const income = number(finance.kpis.period_net_received);
      const balance = number(finance.kpis.period_balance);
      const category = Object.fromEntries((finance.category_spend || []).map((row) => [row.category, number(row.total)]));
      const categorySpendTotal = (finance.category_spend || []).reduce((sum, row) => sum + number(row.total), 0);
      const steps = [
        { label: "Ingresos\ncobrados", value: income, type: "income", color: colors.cobros },
        { label: "Materiales", value: category.materiales || 0, type: "expense", color: categoryColor("materiales", colors) },
        { label: "Marketing", value: category.marketing || 0, type: "expense", color: categoryColor("marketing", colors) },
        { label: "Envíos", value: category.envios || 0, type: "expense", color: categoryColor("envios", colors) },
        { label: "Servicios", value: category.servicios || 0, type: "expense", color: categoryColor("servicios", colors) },
        { label: "Software", value: category.software || 0, type: "expense", color: categoryColor("software", colors) },
        { label: "Otros", value: category.otros || 0, type: "expense", color: categoryColor("otros", colors) },
        { label: "Saldo\noperativo", value: balance, type: "balance", color: colors.balance || colors.cobros }
      ];
      let running = income;
      const bridgeBase = [0];
      const bridgeValues = [income];
      const bridgeTooltips = [{ before: 0, movement: income, after: income, label: "Entra" }];
      for (let index = 1; index < steps.length - 1; index += 1) {
        const before = running;
        running -= steps[index].value;
        bridgeBase.push(Math.max(0, running));
        bridgeValues.push(steps[index].value);
        bridgeTooltips.push({ before, movement: -steps[index].value, after: running, label: "Menos gasto" });
      }
      bridgeBase.push(0);
      bridgeValues.push(balance);
      bridgeTooltips.push({ before: balance, movement: 0, after: balance, label: "Saldo final" });
      const bridgeLine = [income];
      let bridgeRunning = income;
      for (let index = 1; index < steps.length - 1; index += 1) {
        bridgeRunning -= steps[index].value;
        bridgeLine.push(bridgeRunning);
      }
      bridgeLine.push(balance);
      setChart("dashboardBalanceChart", {
        animationDuration: 350,
        grid: { left: mobile ? 44 : 64, right: mobile ? 10 : 24, top: 34, bottom: mobile ? 58 : 48 },
        tooltip: { trigger: "item", formatter: ({ dataIndex }) => {
          const step = steps[dataIndex] || {};
          const tip = bridgeTooltips[dataIndex] || { before: 0, movement: 0, after: 0, label: "Movimiento" };
          const rows = step.type === "balance"
            ? [{ label: "Queda", value: euro.format(tip.after), color: step.color }]
            : [
              { label: "Había", value: euro.format(tip.before), color: "#9e948b" },
              { label: tip.label, value: `${tip.movement < 0 ? "-" : ""}${euro.format(Math.abs(tip.movement))}`, color: step.color },
              { label: "Queda", value: euro.format(tip.after), color: tip.after >= 0 ? colors.cobros : colors.marketing }
            ];
          return tooltipBox(String(step.label || "").replace(/\n/g, " "), rows);
        } },
        xAxis: { type: "category", data: steps.map((row) => row.label), ...commonAxis, axisLabel: { color: "#766e68", fontSize: mobile ? 8 : 11, interval: 0, formatter: (value, index) => mobile && ![0, steps.length - 1].includes(index) ? "" : value } },
        yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis.splitLine },
        series: [
          { type: "bar", stack: "bridge", silent: true, itemStyle: { color: "transparent" }, emphasis: { itemStyle: { color: "transparent" } }, data: bridgeBase },
          { type: "bar", stack: "bridge", barMaxWidth: mobile ? 32 : 58, data: bridgeValues.map((value, index) => ({ value, itemStyle: { color: steps[index].color, borderRadius: [5, 5, 0, 0] } })), label: { show: true, position: "top", formatter: ({ value, dataIndex }) => Math.abs(number(value)) < 0.005 || (mobile && ![0, steps.length - 1].includes(dataIndex)) ? "" : `${steps[dataIndex].type === "expense" ? "-" : ""}${euro.format(value)}`, fontWeight: 700, color: "#241f1b", fontSize: mobile ? 8 : 11 } },
          { type: "line", silent: true, symbol: "none", lineStyle: { color: "#9e948b", type: "dashed", width: 1 }, data: bridgeLine, z: 1 }
        ]
      });
      setChart("dashboardExpenseChart", {
        animationDuration: 350,
        grid: { left: 56, right: 56, top: 34, bottom: 38 },
        tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [
          { label: "Ingreso neto", value: euro.format(number(params.find((row) => row.seriesName === "Ingreso neto")?.value)), color: colors.cobros },
          { label: "Gasto", value: euro.format(number(params.find((row) => row.seriesName === "Gasto")?.value)), color: colors.total },
          { label: "Balance", value: euro.format(number(params.find((row) => row.seriesName === "Balance")?.value)), color: colors.balance }
        ]) },
        legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Ingreso neto", "Gasto", "Balance"] },
        xAxis: { type: "category", data: compactTimeline(finance.trend?.keys || [], finance.granularity), ...commonAxis },
        yAxis: [
          { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis.splitLine }
        ],
        series: [
          { name: "Ingreso neto", type: "bar", barMaxWidth: 22, itemStyle: { color: colors.cobros, borderRadius: [4, 4, 0, 0] }, data: finance.trend?.series?.cobros || [] },
          { name: "Gasto", type: "bar", barMaxWidth: 22, itemStyle: { color: colors.total, borderRadius: [4, 4, 0, 0] }, data: finance.trend?.series?.total || [] },
          { name: "Balance", type: "line", smooth: (finance.trend?.keys || []).length < 20, symbolSize: 6, lineStyle: { width: 2, color: colors.balance }, itemStyle: { color: colors.balance }, data: finance.trend?.series?.balance || [] }
        ]
      });
      const sortedCategorySpend = finance.category_spend.slice().sort((a, b) => b.total - a.total);
      setChart("dashboardIncomeChart", {
        animationDuration: 350,
        grid: { left: 115, right: 112, top: 12, bottom: 24 },
        tooltip: { trigger: "axis", formatter: (params) => tooltipBox(categoryLabel(params[0]?.axisValue || ""), [{ label: "Gasto registrado", value: euro.format(number(params[0]?.value)), color: categoryColor(params[0]?.axisValue, colors) }]) },
        xAxis: { type: "value", axisLabel: { show: false }, splitLine: commonAxis.splitLine },
        yAxis: { type: "category", inverse: true, data: sortedCategorySpend.map((row) => row.category), axisLabel: { color: "#5d5650", formatter: categoryLabel }, axisLine: { show: false }, axisTick: { show: false } },
        series: [{ type: "bar", barMaxWidth: 18, data: sortedCategorySpend.map((row) => ({ value: row.total, itemStyle: { color: categoryColor(row.category, colors), borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "right", formatter: ({ value }) => `${euro.format(number(value))} - ${categorySpendTotal ? number(value / categorySpendTotal * 100).toFixed(0) : 0}%`, color: "#241f1b", fontWeight: 700, fontSize: 10 } }]
      });
    } else {
      const profitability = finance.profitability;
      const thresholds = profitability.thresholds;
      setChart("dashboardBalanceChart", {
        animationDuration: 350,
        grid: { left: 58, right: 62, top: 34, bottom: 38 },
        tooltip: { trigger: "axis", formatter: (params) => tooltipBox(params[0]?.axisValue || "", [
          { label: "Venta neta", value: euro.format(number(params.find((row) => row.seriesName === "Venta neta")?.value)), color: colors.profit_sales },
          { label: "Coste real", value: euro.format(number(params.find((row) => row.seriesName === "Coste real")?.value)), color: colors.profit_cost },
          { label: "Margen ponderado", value: percent(params.find((row) => row.seriesName === "Margen ponderado")?.value), color: colors.profit_margin }
        ]) },
        legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Venta neta", "Coste real", "Margen ponderado"] },
        xAxis: { type: "category", data: compactTimeline(profitability.series.map((row) => row.key), finance.granularity), ...commonAxis },
        yAxis: [
          { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: commonAxis.splitLine },
          { type: "value", min: 0, max: 100, axisLabel: { color: "#766e68", formatter: "{value}%" }, splitLine: { show: false } }
        ],
        series: [
          { name: "Venta neta", type: "bar", barMaxWidth: 28, itemStyle: { color: colors.profit_sales, borderRadius: [4, 4, 0, 0] }, data: profitability.series.map((row) => row.sales) },
          { name: "Coste real", type: "bar", barMaxWidth: 28, itemStyle: { color: colors.profit_cost, borderRadius: [4, 4, 0, 0] }, data: profitability.series.map((row) => row.cost) },
          { name: "Margen ponderado", type: "line", yAxisIndex: 1, smooth: profitability.series.length < 20, symbolSize: 7, lineStyle: { width: 3, color: colors.profit_margin }, itemStyle: { color: colors.profit_margin }, markLine: { silent: true, symbol: "none", data: [{ yAxis: thresholds.critical, lineStyle: { color: colors.margin_critical, type: "dotted" } }, { yAxis: thresholds.healthy, lineStyle: { color: colors.margin_healthy, type: "dashed" } }] }, data: profitability.series.map((row) => row.weighted_margin_percent) }
        ]
      });
      setChart("dashboardExpenseChart", {
        animationDuration: 350,
        color: [colors.margin_critical, colors.margin_pressure, colors.margin_healthy],
        grid: { left: 48, right: 18, top: 48, bottom: 34 },
        tooltip: { trigger: "item", formatter: ({ value, dataIndex }) => tooltipBox(marginBandLabel(profitability.bands[dataIndex]?.band), [{ label: "Venta neta", value: percent(value), color: marginBandColor(profitability.bands[dataIndex]?.band, colors) }, { label: "Pedidos", value: `${profitability.bands[dataIndex]?.orders || 0}`, color: "#766e68" }]) },
        xAxis: { type: "category", data: profitability.bands.map((row) => marginBandLabel(row.band)), ...commonAxis },
        yAxis: { type: "value", axisLabel: { color: "#766e68", formatter: "{value}%" }, splitLine: commonAxis.splitLine },
        series: [{ type: "bar", barMaxWidth: 64, data: profitability.bands.map((row) => ({ value: row.share_of_sales, itemStyle: { color: marginBandColor(row.band, colors), borderRadius: [6, 6, 0, 0] } })), label: { show: true, position: "top", formatter: ({ value, dataIndex }) => `${number(value).toFixed(1)}%\n${profitability.bands[dataIndex]?.orders || 0} pedidos`, lineHeight: 15, fontWeight: 700, fontSize: 10 } }]
      });
      const costDrivers = profitability.cost_drivers || [];
      setChart("dashboardIncomeChart", {
        animationDuration: 350,
        grid: { left: 118, right: 18, top: 10, bottom: 24 },
        tooltip: { trigger: "axis", formatter: (params) => {
          const row = costDrivers[params[0]?.dataIndex] || {};
          return tooltipBox(row.label || "", [{ label: "Coste", value: euro.format(number(row.total)), color: params[0]?.color }, { label: "Peso del coste", value: percent(row.share_of_cost, 0), color: "#766e68" }]);
        } },
        xAxis: { type: "value", axisLabel: { show: false }, splitLine: commonAxis.splitLine },
        yAxis: { type: "category", inverse: true, data: costDrivers.map((row) => row.label), axisLabel: { color: "#5d5650", width: 105, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
        series: [{ type: "bar", barMaxWidth: 30, data: costDrivers.map((row) => ({ value: row.total, itemStyle: { color: row.key === "content" ? colors.cost_content : colors.cost_fixed, borderRadius: [0, 5, 5, 0] } })), label: { show: true, position: "insideRight", formatter: ({ value, dataIndex }) => `${euro.format(number(value))} · ${number(costDrivers[dataIndex]?.share_of_cost).toFixed(0)}% coste`, color: "#fff", fontWeight: 700, fontSize: 9 } }]
      });
    }
  }

  function actionRows(finance) {
    const operational = finance.operational || {};
    const replenishment = finance.replenishment || {};
    const quality = finance.data_quality || {};
    return [
      { label: "Compras urgentes", hint: `${replenishment.critical_count || 0} críticas · ${euro.format(replenishment.estimated_cost || 0)} recomendados`, count: replenishment.actionable_count || 0, icon: "icon-truck", action: "materials", context: "replenishment", tone: replenishment.critical_count ? "warn" : "ok" },
      { label: "Gastos por cerrar", hint: "El importe ya está incluido en el balance", count: quality.draft_expenses || 0, icon: "icon-save", action: "invoices", context: "draft", tone: quality.draft_expenses ? "attention" : "ok" },
      { label: "Importaciones por validar", hint: `${quality.import_pending || 0} procesándose`, count: quality.import_review || 0, icon: "icon-refresh", action: "invoices", context: "imports", tone: quality.import_review ? "attention" : "ok" },
      { label: "Pedidos con margen en presión", hint: `Umbral saludable desde ${percent(finance.profitability?.thresholds?.healthy, 0)}`, count: (finance.profitability?.bands || []).filter((row) => row.band !== "healthy").reduce((sum, row) => sum + number(row.orders), 0), icon: "icon-percent", action: "kits", context: "low_margin", tone: finance.profitability?.low_margin_orders?.length ? "warn" : "ok" },
      { label: "Ingresos pendientes", hint: "Cobros todavía no ejecutados", count: operational.pending_payouts?.length || 0, icon: "icon-wallet", action: "income", context: "pending", tone: operational.pending_payouts?.length ? "attention" : "ok" }
    ];
  }

  function renderDashboard() {
    const finance = state.dashboardFinance;
    if (!finance) return;
    const mode = state.dashboardMode || "operation";
    const dashboardColors = chartColors();
    const p = finance.profitability || { metrics: {}, thresholds: {}, bands: [], low_margin_orders: [], kits: [], material_cost_impact: [] };
    const k = finance.kpis;
    const comparison = state.dashboardComparison === false ? {} : (finance.comparison || {});
    const periodOptions = [
      ["this_month", "Este mes"], ["last_30_days", "Últimos 30 días"], ["this_quarter", "Este trimestre"],
      ["last_3_months", "Últimos 3 meses"], ["last_6_months", "Últimos 6 meses"], ["this_year", "Este año"],
      ["all", "Todo el periodo"], ["custom", "Personalizado"]
    ];
    const granularityOptions = [["auto", "Auto"], ["day", "Diaria"], ["week", "Semanal"], ["month", "Mensual"], ["quarter", "Trimestral"]];
    const selectedGranularity = state.dashboardGranularity || "auto";
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

    const cards = mode === "operation" ? [
      ["Ingreso neto", euro.format(k.period_net_received), delta(comparison.income_change_percent), "icon-chart", "green"],
      ["Gasto comprometido", euro.format(k.period_expense), `${k.draft_invoice_count} borradores incluidos`, "icon-file", "rose"],
      ["Balance operativo", euro.format(k.period_balance), delta(comparison.balance_change_percent), "icon-activity", k.period_balance >= 0 ? "green" : "rose"],
      ["Margen ponderado", percent(k.weighted_margin_percent), `${percent(k.reliable_coverage_percent)} cobertura fiable`, "icon-coin", marginTone(k.weighted_margin_percent, p.thresholds)],
      ["Ticket medio", euro.format(p.metrics.average_ticket), `${p.metrics.total_orders || 0} pedidos`, "icon-tag", "neutral"]
    ] : [
      ["Ventas fiables", euro.format(p.metrics.net_sales), `${p.metrics.reliable_orders || 0} pedidos`, "icon-chart", "green"],
      ["Beneficio estimado", euro.format(p.metrics.total_profit), "Venta menos coste real", "icon-coin", "green"],
      ["Margen ponderado", percent(p.metrics.weighted_margin_percent), `${percent(p.metrics.reliable_coverage_percent)} cobertura fiable`, "icon-activity", marginTone(p.metrics.weighted_margin_percent, p.thresholds)],
      ["Coste real vendido", euro.format((p.metrics.net_sales || 0) - (p.metrics.total_profit || 0)), "Contenido más set fijo", "icon-cube", "rose"],
      ["Ticket medio", euro.format(p.metrics.average_ticket), `${p.metrics.total_orders || 0} pedidos`, "icon-tag", "neutral"]
    ];
    $("#dashboardCards").innerHTML = cards.map(([label, value, hint, itemIcon, tone]) => `<article class="dashboard-kpi-card is-${tone}"><span class="dashboard-kpi-icon">${icon(itemIcon)}</span><span class="dashboard-kpi-label">${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join("");

    $("#dashboardPrimaryTitle").textContent = mode === "operation" ? "Cómo se forma el saldo operativo" : "Evolución de la rentabilidad";
    $("#dashboardPrimaryText").textContent = mode === "operation" ? "Desglose del ingreso neto cobrado y los principales costes registrados." : "Venta neta, coste real y margen ponderado de pedidos fiables.";
    $("#dashboardPrimaryBadge").textContent = mode === "operation" ? finance.window.label : `${percent(p.metrics.reliable_coverage_percent)} cobertura`;
    $("#dashboardActionTitle").textContent = mode === "operation" ? "Prioridades de hoy" : "Pedidos bajo presión";
    $("#dashboardActionText").textContent = mode === "operation" ? "Problemas concretos que necesitan una decisión." : `Pedidos por debajo del umbral saludable de ${percent(p.thresholds.healthy, 0)}.`;

    const rows = mode === "operation" ? actionRows(finance) : p.low_margin_orders.map((order) => ({
      label: order.order_number || `Pedido #${order.id}`,
      hint: `${euro.format(order.net_amount)} venta · ${euro.format(order.real_cost)} coste real`,
      count: percent(order.margin_percent),
      icon: "icon-chart",
      action: "kits",
      context: "low_margin",
      tone: order.margin_band === "critical" ? "warn" : "attention"
    }));
    $("#dashboardOpsList").innerHTML = `<div class="dashboard-action-list">${rows.map((row) => `<button type="button" class="dashboard-action-row is-${row.tone}" data-jump-view="${row.action}" data-jump-context="${row.context || ""}"><span class="dashboard-action-icon">${icon(row.icon)}</span><span class="dashboard-action-copy"><strong>${row.label}</strong><small>${row.hint}</small></span><b>${row.count}</b><span class="dashboard-action-arrow">${icon("icon-arrow-right")}</span></button>`).join("") || `<div class="empty-state small">No hay decisiones pendientes en este bloque.</div>`}</div>`;

    const insightGrid = $("#dashboardInsightGrid");
    insightGrid.classList.toggle("hidden", mode !== "operation");
    if (mode === "operation") {
      const recommendations = (finance.replenishment?.recommendations || []).slice(0, 3);
      const channelTotal = (finance.income_channels || []).reduce((sum, row) => sum + number(row.net_amount), 0);
      const marginBands = p.bands || [];
      const marginSalesTotal = marginBands.reduce((sum, row) => sum + number(row.sales), 0);
      insightGrid.innerHTML = `
        <section class="panel dashboard-driver-panel">
          <div class="dashboard-driver-head"><span>${icon("icon-cube")}</span><div><small>Compra recomendada</small><strong>${finance.replenishment?.actionable_count || 0} materiales · ${euro.format(finance.replenishment?.estimated_cost || 0)}</strong></div><button type="button" data-jump-view="materials" data-jump-context="replenishment"><span>Revisar</span>${icon("icon-arrow-right")}</button></div>
          <div class="dashboard-driver-list dashboard-recommendation-list">${recommendations.map((row) => `<div>${materialThumb(row)}<span><strong>${text(row.name)}</strong><small>${text(row.supplier_name || row.preferred_supplier_name, "Sin proveedor")} - ${number(row.suggested_quantity)} uds</small></span><b>${euro.format(row.estimated_cost || 0)}</b></div>`).join("") || `<p>Sin compras recomendadas.</p>`}</div>
        </section>
        <section class="panel dashboard-driver-panel">
          <div class="dashboard-driver-head"><span>${icon("icon-wallet")}</span><div><small>Canales de ingreso</small><strong>${euro.format(channelTotal)}</strong></div><button type="button" data-jump-view="income"><span>Ver</span>${icon("icon-arrow-right")}</button></div>
          <div class="dashboard-channel-bar">${(finance.income_channels || []).map((row) => `<i style="width:${channelTotal ? (number(row.net_amount) / channelTotal) * 100 : 0}%;background:${dashboardColors[row.channel] || dashboardColors.cobros}"></i>`).join("")}</div>
          <div class="dashboard-driver-list dashboard-channel-list">${(finance.income_channels || []).slice(0, 3).map((row) => `<div>${entityIconMarkup(row.channel, { type: "channel", className: "dashboard-entity-icon", label: channelLabel(row.channel) })}<span><strong>${channelLabel(row.channel)}</strong><small>${channelTotal ? percent((number(row.net_amount) / channelTotal) * 100) : "-"}</small></span><b>${euro.format(row.net_amount)}</b></div>`).join("")}</div>
        </section>
        <section class="panel dashboard-driver-panel dashboard-margin-panel">
          <div class="dashboard-driver-head"><span>${icon("icon-percent")}</span><div><small>Margen en pedidos</small><strong>${percent(p.metrics.weighted_margin_percent)} ponderado</strong></div><button type="button" data-jump-view="kits" data-jump-context="low_margin"><span>Ver</span>${icon("icon-arrow-right")}</button></div>
          <div class="dashboard-margin-band">${marginBands.map((row) => `<i style="width:${marginSalesTotal ? (number(row.sales) / marginSalesTotal) * 100 : 0}%;background:${marginBandColor(row.band, dashboardColors)}"></i>`).join("")}</div>
          <div class="dashboard-driver-list">${marginBands.map((row) => `<div><span><strong>${marginBandLabel(row.band)}</strong><small>${row.orders || 0} pedidos · ${euro.format(row.sales || 0)} de venta</small></span><b>${percent(row.share_of_sales, 0)}</b></div>`).join("") || `<p>Sin pedidos fiables en el periodo.</p>`}</div>
        </section>`;
    }

    $("#dashboardSecondaryTitle").textContent = mode === "operation" ? "Evolución de resultados" : "Distribución del margen";
    $("#dashboardSecondaryText").textContent = mode === "operation" ? "Ingreso neto, gasto comprometido y saldo por granularidad." : "Pedidos y venta neta por rango de margen.";
    $("#dashboardTertiaryTitle").textContent = mode === "operation" ? "Dónde se va el gasto" : "Qué consume el margen";
    $("#dashboardTertiaryText").textContent = mode === "operation" ? "Categorías que explican el gasto registrado." : "Bloques que forman el coste real de los pedidos fiables.";
    $("#dashboardDetailTitle").textContent = mode === "operation" ? "Dependencia de proveedores" : "Rentabilidad por set fijo";
    $("#dashboardDetailText").textContent = mode === "operation" ? "Proveedores que concentran mayor gasto comprometido y su peso." : "Comparativa ponderada de las configuraciones aplicadas a pedidos.";

    const detailRows = mode === "operation" ? finance.top_suppliers.map((row) => ({
      title: row.supplier_name,
      hint: `${row.invoice_count} gastos registrados`,
      value: euro.format(row.total_spend),
      extra: k.period_expense ? percent((row.total_spend / k.period_expense) * 100) : "-",
      avatar: entityIconMarkup(row.supplier_name, { type: "supplier", className: "dashboard-entity-icon", label: row.supplier_name })
    })) : p.kits.map((row) => ({
      title: row.name,
      hint: `${row.orders} pedidos · ${euro.format(row.sales)} ventas`,
      value: percent(row.weighted_margin_percent),
      extra: euro.format(row.profit),
      avatar: `<span class="dashboard-rank-index">#</span>`
    }));
    $("#dashboardSpendList").innerHTML = `<div class="dashboard-rank-list">${detailRows.map((row, index) => `<div class="dashboard-rank-row">${row.avatar || `<span class="dashboard-rank-index">${index + 1}</span>`}<span><strong>${text(row.title)}</strong><small>${row.hint}</small></span><b>${row.value}</b><em>${row.extra}</em></div>`).join("") || `<div class="empty-state small">Todavía no hay datos suficientes para esta lectura.</div>`}</div>`;
    requestAnimationFrame(renderDashboardCharts);
  }

  return { renderDashboardCharts, renderDashboard };
}
