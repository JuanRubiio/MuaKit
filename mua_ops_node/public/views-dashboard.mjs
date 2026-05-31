export function createDashboardViews(ctx) {
  const {
    state,
    $,
    euro,
    text,
    number,
    badge,
    channelLabel,
    chartColors,
    compactTimeline,
    dashboardChart,
    img,
    DASHBOARD_EXPENSE_LABELS,
    DASHBOARD_INCOME_LABELS
  } = ctx;

  function renderDashboardCharts() {
    if (!$("#dashboard")?.classList.contains("active")) return;
    const finance = state.dashboardFinance;
    if (!finance || !window.echarts) return;
    const expenseKey = state.dashboardExpenseTrendView || "total";
    const incomeKey = state.dashboardIncomeTrendView || "cobros";
    const colors = chartColors();
    const trend = finance.trend || {};
    const keys = trend.keys?.length ? trend.keys : finance.monthly_breakdown?.months || [];
    const labels = compactTimeline(keys, trend.mode || finance.granularity || "month");
    const expenseValues = trend.series?.[expenseKey]?.length
      ? trend.series[expenseKey]
      : finance.monthly_breakdown?.series?.[expenseKey] || finance.monthly_spend.map((row) => row.total);
    const incomeValues = trend.series?.[incomeKey]?.length
      ? trend.series[incomeKey]
      : finance.monthly_breakdown?.series?.[incomeKey] || finance.monthly_breakdown?.series?.cobros || [];
    const balanceValues = trend.series?.balance || keys.map((_, index) => number(trend.series?.cobros?.[index]) - number(trend.series?.total?.[index]));

    const expenseChart = dashboardChart("dashboardExpenseChart");
    const incomeChart = dashboardChart("dashboardIncomeChart");
    const balanceChart = dashboardChart("dashboardBalanceChart");
    const categoryChart = dashboardChart("dashboardCategoryChart");
    const incomeMixChart = dashboardChart("dashboardIncomeMixChart");
    if (!expenseChart || !incomeChart || !balanceChart || !categoryChart || !incomeMixChart) return;

    expenseChart.setOption({
      animationDuration: 400,
      grid: { left: 50, right: 18, top: 28, bottom: 32 },
      tooltip: { trigger: "axis", valueFormatter: (value) => euro.format(Number(value || 0)) },
      color: [colors[expenseKey] || colors.total],
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: "#c9bfb5" } },
        axisLabel: { color: "#766e68" }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) },
        splitLine: { lineStyle: { color: "#ede7df" } }
      },
      series: [{
        name: DASHBOARD_EXPENSE_LABELS[expenseKey] || DASHBOARD_EXPENSE_LABELS.total,
        data: expenseValues,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 3, color: colors[expenseKey] || colors.total },
        itemStyle: { color: colors[expenseKey] || colors.total },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${(colors[expenseKey] || colors.total)}33` },
            { offset: 1, color: `${(colors[expenseKey] || colors.total)}08` }
          ])
        }
      }]
    }, true);

    incomeChart.setOption({
      animationDuration: 400,
      grid: { left: 50, right: 18, top: 28, bottom: 32 },
      tooltip: { trigger: "axis", valueFormatter: (value) => euro.format(Number(value || 0)) },
      color: [colors[incomeKey] || colors.cobros],
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: "#c9bfb5" } },
        axisLabel: { color: "#766e68" }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) },
        splitLine: { lineStyle: { color: "#ede7df" } }
      },
      series: [{
        name: DASHBOARD_INCOME_LABELS[incomeKey] || DASHBOARD_INCOME_LABELS.cobros,
        data: incomeValues,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 3, color: colors[incomeKey] || colors.cobros },
        itemStyle: { color: colors[incomeKey] || colors.cobros },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${(colors[incomeKey] || colors.cobros)}33` },
            { offset: 1, color: `${(colors[incomeKey] || colors.cobros)}08` }
          ])
        }
      }]
    }, true);

    balanceChart.setOption({
      animationDuration: 400,
      grid: { left: 54, right: 24, top: 26, bottom: 34 },
      tooltip: { trigger: "axis", valueFormatter: (value) => euro.format(Number(value || 0)) },
      legend: { top: 0, textStyle: { color: "#766e68" } },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: "#c9bfb5" } },
        axisLabel: { color: "#766e68" }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) },
        splitLine: { lineStyle: { color: "#ede7df" } }
      },
      series: [
        {
          name: "Gasto",
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { color: colors.fees, borderRadius: [6, 6, 0, 0] },
          data: trend.series?.total || finance.monthly_breakdown?.series?.total || []
        },
        {
          name: "Ingreso neto",
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { color: colors.cobros, borderRadius: [6, 6, 0, 0] },
          data: trend.series?.cobros || finance.monthly_breakdown?.series?.cobros || []
        },
        {
          name: "Balance",
          type: "line",
          smooth: true,
          symbolSize: 7,
          lineStyle: { width: 3, color: colors.channel_bizum || "#c18a3a" },
          itemStyle: { color: colors.channel_bizum || "#c18a3a" },
          data: balanceValues
        }
      ]
    }, true);

    categoryChart.setOption({
      animationDuration: 400,
      color: [colors.materiales, colors.marketing, colors.envios, colors.total, "#7c746c", "#dcc8ad"],
      tooltip: { trigger: "item", valueFormatter: (value) => euro.format(Number(value || 0)) },
      legend: {
        bottom: 6,
        left: "center",
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { color: "#5d5650", fontSize: 12, fontWeight: 600 }
      },
      series: [{
        type: "pie",
        radius: ["50%", "72%"],
        center: ["50%", "38%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          label: {
            show: true,
            color: "#171412",
            fontWeight: 700,
            formatter: ({ name, percent }) => `${name}\n${percent}%`
          }
        },
        data: finance.category_spend.map((row) => ({ name: row.category, value: row.total }))
      }]
    }, true);

    incomeMixChart.setOption({
      animationDuration: 400,
      color: [colors.shopify, colors.etsy, colors.bizum, colors.cobros],
      tooltip: { trigger: "item", valueFormatter: (value) => euro.format(Number(value || 0)) },
      legend: {
        bottom: 6,
        left: "center",
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { color: "#5d5650", fontSize: 12, fontWeight: 600 }
      },
      series: [{
        type: "pie",
        radius: ["50%", "72%"],
        center: ["50%", "38%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          label: {
            show: true,
            color: "#171412",
            fontWeight: 700,
            formatter: ({ name, percent }) => `${name}\n${percent}%`
          }
        },
        data: finance.income_channels
          .map((row) => ({ name: channelLabel(row.channel), value: row.net_amount }))
          .filter((row) => number(row.value) > 0)
      }]
    }, true);

  }

  function renderDashboard() {
    const finance = state.dashboardFinance;
    if (!finance) return;
    if (!["cobros", "channel_shopify", "channel_etsy", "channel_bizum"].includes(state.dashboardIncomeTrendView)) {
      state.dashboardIncomeTrendView = "cobros";
    }

    const k = finance.kpis;
    const expenseLabel = DASHBOARD_EXPENSE_LABELS[state.dashboardExpenseTrendView] || DASHBOARD_EXPENSE_LABELS.total;
    const incomeLabel = DASHBOARD_INCOME_LABELS[state.dashboardIncomeTrendView] || DASHBOARD_INCOME_LABELS.cobros;
    const trendWord = (finance.granularity || "month") === "day" ? "diarios" : "mensuales";
    $("#dashboardWindowLabel").textContent = finance.window?.label || "Todo el periodo";
    if ($("#dashboardWindowPreset")) $("#dashboardWindowPreset").value = state.dashboardWindowPreset || "all";
    if ($("#dashboardFrom")) $("#dashboardFrom").value = state.dashboardWindowFrom || "";
    if ($("#dashboardTo")) $("#dashboardTo").value = state.dashboardWindowTo || "";
    if ($("#dashboardGranularity")) $("#dashboardGranularity").value = state.dashboardGranularity || "auto";
    $("#dashboardCustomRange")?.classList.toggle("hidden", state.dashboardWindowPreset !== "custom");
    $("#dashboardExpenseTitle").textContent = `Gastos ${trendWord}`;
    $("#dashboardExpenseText").textContent = `Lectura de ${expenseLabel.toLocaleLowerCase("es")} en ${finance.window?.label?.toLocaleLowerCase("es") || "todo el periodo"}.`;
    $("#dashboardIncomeTitle").textContent = `Ingresos ${trendWord}`;
    $("#dashboardIncomeText").textContent = `Seguimiento de ${incomeLabel.toLocaleLowerCase("es")} en ${finance.window?.label?.toLocaleLowerCase("es") || "todo el periodo"}.`;
    $("#dashboardCards").innerHTML = [
      ["Gasto del periodo", euro.format(k.period_expense), `${k.invoice_count} facturas imputadas`],
      ["Ingreso neto", euro.format(k.period_net_received || 0), `${k.payout_count || 0} ingresos registrados`],
      ["Balance", euro.format(k.period_balance || 0), "Ingresos menos gasto"],
      ["Materiales", euro.format(k.materials_expense), "Compras del periodo"],
      ["Marketing", euro.format(k.marketing_expense), "Publicidad y agencia"],
      ["Envíos", euro.format(k.shipping_expense), "Coste logístico"],
      ["Facturas del periodo", k.invoice_count, "Registros incluidos"]
    ].map(([label, value, hint]) => `
      <article class="card dashboard-kpi-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${hint}</small>
      </article>
    `).join("");

    const operational = finance.operational;
    const opsRows = [
      {
        label: "Ingresos pendientes",
        icon: "icon-chart",
        count: operational.pending_payouts.length,
        hint: operational.pending_payouts[0]
          ? `${channelLabel(operational.pending_payouts[0].channel)} · ${text(operational.pending_payouts[0].payout_date)}`
          : "Todos los ingresos están ejecutados",
        action: "income",
        tone: operational.pending_payouts.length ? "warn" : "ok"
      },
      {
        label: "Facturas en borrador",
        icon: "icon-file",
        count: operational.draft_invoices.length,
        hint: operational.draft_invoices[0]
          ? `${text(operational.draft_invoices[0].supplier_name, "Sin proveedor")} · ${text(operational.draft_invoices[0].invoice_date)}`
          : "No quedan facturas en borrador",
        action: "invoices",
        tone: operational.draft_invoices.length ? "warn" : "ok"
      },
      {
        label: "Materiales a reponer",
        icon: "icon-cube",
        count: operational.reorder_materials.length,
        hint: operational.reorder_materials[0]
          ? `${text(operational.reorder_materials[0].name)} · stock ${operational.reorder_materials[0].effective_stock_qty} / aviso ${number(operational.reorder_materials[0].reorder_alert_threshold)}`
          : "Sin alertas de reposición",
        action: "materials",
        tone: operational.reorder_materials.length ? "warn" : "ok"
      },
      {
        label: "Materiales sin imagen",
        icon: "icon-image",
        count: operational.materials_without_image.length,
        hint: operational.materials_without_image[0] ? text(operational.materials_without_image[0].name) : "Catálogo visual al día",
        action: "materials",
        tone: operational.materials_without_image.length ? "warn" : "ok"
      },
      {
        label: "Materiales sin coste",
        icon: "icon-coin",
        count: operational.materials_without_cost.length,
        hint: operational.materials_without_cost[0] ? text(operational.materials_without_cost[0].name) : "Compras con coste medio resuelto",
        action: "costs",
        tone: operational.materials_without_cost.length ? "warn" : "ok"
      },
      {
        label: "Kits incompletos",
        icon: "icon-kit",
        count: operational.incomplete_kits.length,
        hint: operational.incomplete_kits[0]
          ? `${text(operational.incomplete_kits[0].name)}${operational.incomplete_kits[0].version ? ` · ${text(operational.incomplete_kits[0].version)}` : ""}`
          : "No hay kits pendientes",
        action: "kits",
        tone: operational.incomplete_kits.length ? "warn" : "ok"
      }
    ];
    $("#dashboardOpsList").innerHTML = `<div class="ops-list">${opsRows.map((item) => `
      <button type="button" class="ops-item" data-jump-view="${item.action}">
        <span class="ops-item-main">
          <span class="ops-item-icon" aria-hidden="true"><svg><use href="#${item.icon}"></use></svg></span>
          <span>
            <strong>${item.label}</strong>
            <p>${item.hint}</p>
          </span>
        </span>
        <span class="ops-item-side">
          <span class="amount">${item.count}</span>
          ${badge(item.tone === "warn" ? "revisar" : "ok", item.tone)}
        </span>
        </span>
      </button>
    `).join("")}</div>`;

    const spendRows = state.dashboardSpendView === "materials" ? finance.top_materials : finance.top_suppliers;
    $("#dashboardSpendList").innerHTML = `<div class="rank-list">${spendRows.map((row) => `
      <div class="rank-item">
        <span>
          <strong>${text(row.name || row.supplier_name)}</strong>
          <small>${state.dashboardSpendView === "materials" ? `${text(row.category)} · ${row.purchase_lots || 0} lotes` : `${row.invoice_count || 0} facturas imputadas`}</small>
        </span>
        <span>
          <span class="amount">${euro.format(number(row.total_spend))}</span>
          ${state.dashboardSpendView === "materials" ? badge(row.weighted_avg_unit_cost_inc_vat == null ? "sin coste" : euro.format(number(row.weighted_avg_unit_cost_inc_vat)), "ok") : ""}
        </span>
      </div>
    `).join("") || `<div class="empty-state small">Todavía no hay gasto suficiente para este ranking.</div>`}</div>`;

    const reorderRows = (operational.reorder_materials || []).slice(0, 4);
    $("#dashboardReorderList").innerHTML = reorderRows.length ? `
      <div class="dashboard-reorder-table">
        <div class="dashboard-reorder-head">
          <span>Material</span>
          <span>Stock</span>
          <span>Mínimo</span>
          <span>Estado</span>
        </div>
        ${reorderRows.map((row) => {
          const material = state.materials.find((item) => item.name === row.name);
          const thumb = img(material?.image_url || "", text(row.name));
          const critical = number(row.effective_stock_qty) <= number(row.reorder_point);
          return `
            <button type="button" class="dashboard-reorder-row" data-jump-view="materials">
              <span class="dashboard-reorder-material">
                <span class="dashboard-reorder-thumb">${thumb}</span>
                <strong>${text(row.name)}</strong>
              </span>
              <span>${number(row.effective_stock_qty)} ${text(material?.unit_label || "ud")}</span>
              <span>${number(row.reorder_point)} ${text(material?.unit_label || "ud")}</span>
              <span>${badge(critical ? "Crítico" : "Bajo", critical ? "warn" : "neutral")}</span>
            </button>
          `;
        }).join("")}
      </div>
    ` : `<div class="empty-state small">No hay materiales en reposición ahora mismo.</div>`;

    requestAnimationFrame(() => renderDashboardCharts());
  }

  return { renderDashboardCharts, renderDashboard };
}
