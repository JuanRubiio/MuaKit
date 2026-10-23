export function createMarketingViews(ctx) {
  const { state, $, euro, text, number, compactTimeline, dashboardChart } = ctx;

  const formatNumber = (value) => number(value).toLocaleString("es-ES", { maximumFractionDigits: 0 });
  const formatPercent = (value) => value == null ? "-" : `${number(value).toFixed(1)}%`;
  const formatRatio = (value) => value == null ? "-" : `${number(value).toFixed(2)} €`;
  const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  const periodOptions = [
    ["this_month", "Este mes"],
    ["last_3_months", "Últimos 3 meses"],
    ["last_6_months", "Últimos 6 meses"],
    ["all", "Todo el periodo"],
    ["custom", "Personalizado"]
  ];

  function renderTrend(marketing, finance) {
    const chart = dashboardChart("marketingTrendChart");
    if (!chart) return;
    const rows = marketing.trend || [];
    chart.setOption({
      animationDuration: 350,
      grid: { left: 58, right: 58, top: 34, bottom: 40 },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const item = rows[params[0]?.dataIndex] || {};
          return `<div class="dashboard-chart-tooltip"><strong>${text(params[0]?.axisValue || "")}</strong><span><i style="background:#b85d72"></i>Marketing / pedido<b>${formatRatio(item.spend_per_order)}</b></span><span><i style="background:#166b5e"></i>Pedidos<b>${formatNumber(item.orders)}</b></span></div>`;
        }
      },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Marketing / pedido", "Pedidos"] },
      xAxis: { type: "category", data: compactTimeline(rows.map((row) => row.key), finance.granularity), axisLine: { lineStyle: { color: "#d9d2ca" } }, axisLabel: { color: "#766e68" }, axisTick: { show: false } },
      yAxis: [
        { type: "value", axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) }, splitLine: { lineStyle: { color: "#eee9e3" } } },
        { type: "value", axisLabel: { color: "#766e68", formatter: "{value}" }, splitLine: { show: false } }
      ],
      series: [
        { name: "Marketing / pedido", type: "line", smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: "#b85d72" }, itemStyle: { color: "#b85d72" }, data: rows.map((row) => row.spend_per_order) },
        { name: "Pedidos", type: "bar", yAxisIndex: 1, barMaxWidth: 32, itemStyle: { color: "#166b5e", borderRadius: [5, 5, 0, 0] }, data: rows.map((row) => row.orders) },
      ]
    }, true);
    requestAnimationFrame(() => chart.resize());
  }

  function renderReach(marketing, finance) {
    const chart = dashboardChart("marketingReachChart");
    if (!chart) return;
    const rows = marketing.trend || [];
    chart.setOption({
      animationDuration: 350,
      grid: { left: 58, right: 100, top: 34, bottom: 40 },
      tooltip: { trigger: "axis", formatter: (params) => {
        const item = rows[params[0]?.dataIndex] || {};
        return `<div class="dashboard-chart-tooltip"><strong>${text(params[0]?.axisValue || "")}</strong><span><i style="background:#b85d72"></i>Inversión Meta<b>${euro.format(number(item.spend))}</b></span><span><i style="background:#4f6d93"></i>Impresiones<b>${formatNumber(item.impressions)}</b></span><span><i style="background:#166b5e"></i>Pedidos<b>${formatNumber(item.orders)}</b></span></div>`;
      } },
      legend: { top: 0, textStyle: { color: "#766e68" }, data: ["Inversión Meta", "Impresiones", "Pedidos"] },
      xAxis: { type: "category", data: compactTimeline(rows.map((row) => row.key), finance.granularity), axisLine: { lineStyle: { color: "#d9d2ca" } }, axisLabel: { color: "#766e68" }, axisTick: { show: false } },
      yAxis: [
        { type: "value", axisLabel: { color: "#b85d72", formatter: (value) => euro.format(value) }, splitLine: { lineStyle: { color: "#eee9e3" } } },
        { type: "value", position: "right", axisLabel: { color: "#4f6d93", formatter: (value) => `${Math.round(value / 1000)}k` }, splitLine: { show: false } },
        { type: "value", position: "right", offset: 45, minInterval: 1, axisLabel: { color: "#166b5e", formatter: "{value}" }, splitLine: { show: false } }
      ],
      series: [
        { name: "Inversión Meta", type: "bar", barMaxWidth: 26, itemStyle: { color: "#b85d72", borderRadius: [4, 4, 0, 0] }, data: rows.map((row) => row.spend) },
        { name: "Impresiones", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 5, lineStyle: { width: 2, color: "#4f6d93" }, itemStyle: { color: "#4f6d93" }, data: rows.map((row) => row.impressions) },
        { name: "Pedidos", type: "line", yAxisIndex: 2, smooth: true, symbolSize: 5, lineStyle: { width: 2, color: "#166b5e" }, itemStyle: { color: "#166b5e" }, data: rows.map((row) => row.orders) }
      ]
    }, true);
    requestAnimationFrame(() => chart.resize());
  }

  function renderMarketing() {
    const finance = state.marketingFinance || state.dashboardFinance;
    if (!finance) return;
    const marketing = finance.marketing || { metrics: {}, campaigns: [], trend: [], data_quality: {} };
    const chartFinance = state.marketingHistoryFinance || finance;
    const chartMarketing = chartFinance.marketing || marketing;
    const isCurrentMonth = state.marketingPreset === "this_month" && chartFinance !== finance;
    const isCustom = state.marketingPreset === "custom";
    const metrics = marketing.metrics || {};
    const selectedPreset = state.marketingPreset || "this_month";
    $("#marketingPeriodOptions").innerHTML = periodOptions.map(([value, label]) => `<button type="button" class="${selectedPreset === value ? "is-active" : ""}" data-marketing-period-option="${value}"><i></i><span>${label}</span></button>`).join("");
    $("#marketingCustomRange")?.classList.toggle("hidden", !isCustom);
    if ($("#marketingFrom")) $("#marketingFrom").value = state.marketingFrom || "";
    if ($("#marketingTo")) $("#marketingTo").value = state.marketingTo || "";
    $("#marketingPeriodLabel").textContent = isCurrentMonth
      ? "Mes actual · evolución mensual de los últimos 6 meses."
      : `Comparativa mensual · ${finance.window?.label || "Periodo activo"}.`;
    $("#marketingWindowLabel").textContent = finance.window?.label || "Todo el periodo";
    $("#marketingFilterSummary").textContent = "Mensual";
    $("#marketingTrendText").textContent = isCurrentMonth ? "Últimos 6 meses: gasto medio por pedido y volumen." : "Gasto medio por pedido y volumen mensual.";
    $("#marketingReachText").textContent = isCurrentMonth ? "Últimos 6 meses: inversión, impresiones y pedidos." : "Inversión, impresiones y pedidos por mes.";
    const cards = [
      ["Inversión Meta", euro.format(number(metrics.spend)), `${metrics.invoice_count || 0} facturas`, "icon-megaphone", "rose"],
      ["Pedidos", formatNumber(metrics.orders), `${euro.format(number(metrics.sales))} venta neta`, "icon-kit", "green"],
      ["Marketing / pedido", formatRatio(metrics.spend_per_order), `${formatPercent(metrics.spend_share_of_sales)} de ventas`, "icon-percent", "attention"],
      ["Ventas / € invertido", metrics.sales_per_euro_spent == null ? "-" : `${number(metrics.sales_per_euro_spent).toFixed(2)} €`, "Indicador agregado, no atribución", "icon-activity", "neutral"]
    ];
    $("#marketingKpis").innerHTML = cards.map(([label, value, hint, itemIcon, tone]) => `<article class="marketing-kpi dashboard-kpi-card is-${tone}"><span class="dashboard-kpi-icon">${icon(itemIcon)}</span><span class="dashboard-kpi-label">${text(label)}</span><strong>${text(value)}</strong><small>${text(hint)}</small></article>`).join("");
    const trend = chartMarketing.trend || [];
    const last = trend.at(-1) || {};
    const previous = trend.at(-2) || {};
    const spendChange = previous.spend > 0 ? ((number(last.spend) - number(previous.spend)) / number(previous.spend)) * 100 : null;
    const orderChange = previous.orders > 0 ? ((number(last.orders) - number(previous.orders)) / number(previous.orders)) * 100 : null;
    const costChange = previous.spend_per_order > 0 ? ((number(last.spend_per_order) - number(previous.spend_per_order)) / number(previous.spend_per_order)) * 100 : null;
    const returnChange = previous.sales_per_euro_spent > 0 ? ((number(last.sales_per_euro_spent) - number(previous.sales_per_euro_spent)) / number(previous.sales_per_euro_spent)) * 100 : null;
    const worsening = (costChange != null && costChange >= 10 && (orderChange == null || orderChange <= 0)) || (returnChange != null && returnChange <= -10 && spendChange != null && spendChange >= 0);
    const improving = (costChange != null && costChange <= -10 && (orderChange == null || orderChange >= 0)) || (returnChange != null && returnChange >= 10 && (orderChange == null || orderChange >= 0));
    const signal = worsening ? "Señal mensual: eficiencia a la baja." : improving ? "Señal mensual: eficiencia mejora." : "Señal mensual: resultado mixto.";
    const comparison = trend.length > 1 && costChange != null
      ? `Marketing por pedido ${costChange >= 0 ? "sube" : "baja"} ${Math.abs(costChange).toFixed(0)}%; pedidos ${orderChange == null ? "sin referencia" : `${orderChange >= 0 ? "suben" : "bajan"} ${Math.abs(orderChange).toFixed(0)}%`}.`
      : `Marketing por pedido: ${formatRatio(metrics.spend_per_order)}.`;
    const topCampaign = (marketing.campaigns || [])[0];
    $("#marketingPulse").innerHTML = `<div class="marketing-pulse-icon">${icon("icon-activity")}</div><div><strong>${signal} ${comparison}</strong><span>${topCampaign ? `${topCampaign.name} concentra el ${formatPercent(topCampaign.spend_share)} de la inversión facturada. La comparación es agregada: no atribuye pedidos a una campaña.` : "Sin campañas identificadas en las facturas de este periodo."}</span></div><div class="marketing-pulse-context"><small>Periodo</small><b>${text(finance.window?.label || "Activo")}</b></div>`;
    const campaigns = marketing.campaigns || [];
    $("#marketingCampaigns").innerHTML = campaigns.length ? `<div class="marketing-campaign-table"><div class="marketing-campaign-head"><span>Campaña</span><span>Inversión</span><span>Impresiones</span><span>CPM</span><span>Peso</span></div>${campaigns.map((campaign) => `<article><span><strong>${text(campaign.name)}</strong><small>${formatNumber(campaign.invoice_count)} facturas</small></span><span>${euro.format(number(campaign.spend))}</span><span>${formatNumber(campaign.impressions)}</span><span>${campaign.cpm == null ? "-" : euro.format(campaign.cpm)}</span><span>${formatPercent(campaign.spend_share)}</span></article>`).join("")}</div>` : `<div class="empty-state small">Aún no hay líneas de campaña Meta confirmadas dentro de este periodo.</div>`;
    renderTrend(chartMarketing, chartFinance);
    renderReach(chartMarketing, chartFinance);
  }

  return { renderMarketing };
}
