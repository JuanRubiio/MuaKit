export function createIncomeViews(ctx) {
  const {
    state,
    $,
    euro,
    text,
    number,
    lower,
    badge,
    entityIconMarkup,
    channelLabel,
    payoutStatusLabel,
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination,
    chartColors,
    dashboardChart,
    compactTimeline
  } = ctx;

  const paidStatuses = new Set(["paid", "executed"]);

  function channelIconMarkup(channel, extraClass = "") {
    return entityIconMarkup(channel, { type: "channel", className: `income-channel-dot ${channel} ${extraClass}`.trim() });
  }

  function payoutPrimaryLabel(row) {
    const bankReference = text(row.bank_reference).trim();
    if (bankReference) return bankReference;
    const externalId = text(row.external_id).trim();
    if (!externalId) return "Ingreso manual";
    if (externalId.includes("|")) return "Ingreso manual";
    return externalId;
  }

  function payoutSecondaryLabel(row) {
    const accountHint = text(row.bank_account_hint).trim();
    if (accountHint) return accountHint;
    const sourceFile = text(row.raw_source_file).trim();
    if (sourceFile && !/manual\|/i.test(sourceFile)) return sourceFile;
    return `${channelLabel(row.channel)} \u00B7 ${text(row.payout_date)}`;
  }

  function renderIncome() {
    if (!state.incomeSummary) return;
    renderPayouts();
  }

  function filteredPayoutRows() {
    let rows = [...state.payouts];
    rows = applyTextSearch(rows, $("#payoutSearch")?.value, ["channel", "bank_reference", "bank_account_hint", "raw_source_file", "notes", "external_id"]);
    const channel = $("#payoutChannelFilter")?.value;
    const status = $("#payoutStatusFilter")?.value;
    const from = $("#payoutFromFilter")?.value;
    const to = $("#payoutToFilter")?.value;
    const lane = $("#incomeStatusTabs")?.dataset.activeLane || "all";
    if (channel) rows = rows.filter((row) => row.channel === channel);
    if (status) rows = rows.filter((row) => row.status === status);
    if (from) rows = rows.filter((row) => String(row.payout_date || "") >= from);
    if (to) rows = rows.filter((row) => String(row.payout_date || "") <= to);
    if (lane === "shopify" || lane === "etsy" || lane === "bizum") rows = rows.filter((row) => row.channel === lane);
    if (lane === "pending") rows = rows.filter((row) => !paidStatuses.has(String(row.status || "")));
    if (state.incomeReviewFilter === "missing_reference") rows = rows.filter((row) => !String(row.bank_reference || "").trim());
    if (state.incomeReviewFilter === "missing_account") rows = rows.filter((row) => !String(row.bank_account_hint || "").trim());
    if (state.incomeReviewFilter === "pending") rows = rows.filter((row) => !paidStatuses.has(String(row.status || "")));
    if (state.incomeReviewFilter === "reconcile") rows = rows.filter((row) => paidStatuses.has(String(row.status || "")) && (!String(row.bank_reference || "").trim() || !String(row.bank_account_hint || "").trim()));
    return rows;
  }

  function aggregateTrend(rows) {
    const dates = rows.map((row) => String(row.payout_date || "")).filter(Boolean).sort();
    const from = $("#payoutFromFilter")?.value || dates[0] || "";
    const to = $("#payoutToFilter")?.value || dates.at(-1) || "";
    const rangeDays = from && to ? Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1) : 999;
    const mode = rangeDays <= 45 ? "day" : "month";
    const buckets = new Map();
    for (const row of rows) {
      const key = mode === "day" ? String(row.payout_date || "") : String(row.payout_date || "").slice(0, 7);
      if (!key) continue;
      const bucket = buckets.get(key) || { net: 0, pending: 0 };
      bucket.net += number(row.net_amount);
      if (!paidStatuses.has(String(row.status || ""))) bucket.pending += number(row.net_amount);
      buckets.set(key, bucket);
    }
    const keys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
    return {
      mode,
      labels: compactTimeline(keys, mode),
      rows: keys.map((key) => ({
        key,
        net: number(buckets.get(key)?.net),
        pending: number(buckets.get(key)?.pending)
      }))
    };
  }

  function renderIncomeTrend(rows) {
    const chart = dashboardChart("incomeTrendChart");
    if (!chart) return;
    const colors = chartColors();
    const trend = aggregateTrend(rows);
    chart.setOption({
      animationDuration: 400,
      color: [colors.cobros, colors.marketing],
      grid: { left: 42, right: 20, top: 28, bottom: 36, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,.96)",
        borderColor: "rgba(201,186,172,.9)",
        textStyle: { color: "#2e2622", fontFamily: "Inter, sans-serif" },
        formatter(params) {
          const items = Array.isArray(params) ? params : [params];
          const title = items[0]?.axisValueLabel || "";
          return [title, ...items.map((item) => `${item.marker} ${item.seriesName} <strong>${euro.format(number(item.value))}</strong>`)].join("<br>");
        }
      },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 16,
        itemHeight: 10,
        textStyle: { color: "#6a6058", fontFamily: "Inter, sans-serif" }
      },
      xAxis: {
        type: "category",
        data: trend.labels,
        axisLine: { lineStyle: { color: "rgba(201,186,172,.88)" } },
        axisLabel: { color: "#6a6058" },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(226,214,203,.72)" } },
        axisLabel: { color: "#6a6058", formatter: (value) => euro.format(number(value)) }
      },
      series: [
        {
          name: "Ingreso neto",
          type: "bar",
          barMaxWidth: 18,
          itemStyle: { borderRadius: [10, 10, 0, 0], color: colors.cobros },
          data: trend.rows.map((row) => row.net)
        },
        {
          name: "Pendiente",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { width: 2.5, color: colors.marketing },
          itemStyle: { color: colors.marketing, borderColor: "#fff", borderWidth: 2 },
          data: trend.rows.map((row) => row.pending)
        }
      ]
    }, true);
    requestAnimationFrame(() => chart.resize());
  }

  function renderIncomeChannels(rows) {
    const chart = dashboardChart("incomeChannelChart");
    const channels = Array.from(
      rows.reduce((map, row) => {
        const key = row.channel;
        const bucket = map.get(key) || { channel: key, net_amount: 0 };
        bucket.net_amount += number(row.net_amount);
        map.set(key, bucket);
        return map;
      }, new Map()).values()
    )
      .map((row) => ({ ...row, label: channelLabel(row.channel) }))
      .sort((a, b) => number(b.net_amount) - number(a.net_amount));
    const total = channels.reduce((sum, row) => sum + number(row.net_amount), 0);
    if (chart) {
      const colors = chartColors();
      const compact = channels.length >= 4;
      chart.setOption({
        animationDuration: 350,
        color: [colors.shopify, colors.etsy, colors.bizum],
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(255,255,255,.96)",
          borderColor: "rgba(201,186,172,.9)",
          textStyle: { color: "#2e2622", fontFamily: "Inter, sans-serif" },
          formatter: ({ name, value, percent }) => `${name}<br><strong>${euro.format(number(value))}</strong> \u00B7 ${percent}%`
        },
        legend: { show: false },
        series: [{
          type: "pie",
          radius: compact ? ["64%", "88%"] : ["68%", "92%"],
          center: ["50%", "52%"],
          itemStyle: { borderColor: "#ffffff", borderWidth: 5, borderRadius: 10 },
          label: { show: false },
          data: channels.map((row) => ({ name: row.label, value: number(row.net_amount) }))
        }]
      }, true);
      requestAnimationFrame(() => chart.resize());
    }
    $("#incomeChannelBreakdown").innerHTML = channels.length
      ? `<div class="income-breakdown-list">${channels.map((row) => `
          <article class="income-breakdown-row">
            <span class="income-breakdown-dot ${row.channel}"></span>
            <strong>${row.label}</strong>
            <small>${euro.format(number(row.net_amount))}</small>
            <em>${total ? `${((number(row.net_amount) / total) * 100).toFixed(1).replace(".", ",")}%` : "0%"}</em>
          </article>
        `).join("")}</div>`
      : `<div class="empty-state compact">Todav\u00eda no hay ingresos por canal.</div>`;
  }

  function renderIncomeStatusTabs(sourceRows, filteredRows) {
    const counts = {
      all: sourceRows.length,
      shopify: sourceRows.filter((row) => row.channel === "shopify").length,
      etsy: sourceRows.filter((row) => row.channel === "etsy").length,
      bizum: sourceRows.filter((row) => row.channel === "bizum").length,
      pending: sourceRows.filter((row) => !paidStatuses.has(String(row.status || ""))).length
    };
    const tabs = [
      ["all", "Todos"],
      ["shopify", "Shopify"],
      ["etsy", "Etsy"],
      ["bizum", "Bizum"],
      ["pending", "Pendientes"]
    ];
    const node = $("#incomeStatusTabs");
    const activeLane = node?.dataset.activeLane || "all";
    if (node) {
      node.innerHTML = `
        <div class="invoice-status-strip">
          ${tabs.map(([key, label]) => `
            <button type="button" class="invoice-status-tab ${activeLane === key ? "is-active" : ""}" data-income-lane="${key}">
              ${label}<span>${counts[key]}</span>
            </button>
          `).join("")}
        </div>
      `;
    }
    $("#incomeUpdatedMeta").innerHTML = filteredRows.length
      ? `<svg><use href="#icon-refresh"></use></svg><span>Actualizado \u00B7 ${text(filteredRows[0]?.payout_date || "")}</span>`
      : `<svg><use href="#icon-refresh"></use></svg><span>Sin ingresos visibles</span>`;
  }

  function reviewItems(rows) {
    const pendingRows = rows.filter((row) => !paidStatuses.has(String(row.status || "")));
    const noReference = rows.filter((row) => !String(row.bank_reference || "").trim());
    const noAccount = rows.filter((row) => !String(row.bank_account_hint || "").trim());
    const toReconcile = rows.filter((row) => paidStatuses.has(String(row.status || "")) && (!String(row.bank_reference || "").trim() || !String(row.bank_account_hint || "").trim()));
    return [
      ["pending", "Pendientes de cobro", pendingRows.length, pendingRows[0] ? `${channelLabel(pendingRows[0].channel)} \u00B7 ${text(pendingRows[0].payout_date)}` : "Todos los ingresos est\u00e1n ejecutados", pendingRows.length ? "warn" : "ok", "icon-clock"],
      ["missing_reference", "Sin referencia", noReference.length, noReference[0] ? `${channelLabel(noReference[0].channel)} \u00B7 completar pedido o banco` : "Todos los ingresos tienen referencia", noReference.length ? "warn" : "ok", "icon-alert"],
      ["missing_account", "Sin cuenta", noAccount.length, noAccount[0] ? `${channelLabel(noAccount[0].channel)} \u00B7 asignar cuenta` : "Todas las cuentas est\u00e1n informadas", noAccount.length ? "warn" : "ok", "icon-bank"],
      ["reconcile", "Por conciliar", toReconcile.length, toReconcile[0] ? `${channelLabel(toReconcile[0].channel)} \u00B7 revisar conciliaci\u00f3n` : "No hay ingresos bloqueados", toReconcile.length ? "neutral" : "ok", "icon-check-circle"]
    ];
  }

  function renderReviewQueue(rows) {
    $("#incomeReviewQueue").innerHTML = reviewItems(rows).map(([key, label, count, hint, tone, icon]) => `
      <button type="button" class="invoice-review-item ${tone}" data-income-review="${key}">
        <span class="invoice-review-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
        <span class="invoice-review-copy">
          <strong>${label}</strong>
          <small>${hint}</small>
        </span>
        <span class="invoice-review-meta">
          <em>${count}</em>
          <svg aria-hidden="true"><use href="#icon-arrow-right"></use></svg>
        </span>
      </button>
    `).join("");
  }

  function renderRecentIncome(rows) {
    const recent = [...rows]
      .sort((a, b) => `${b.payout_date || ""}${b.id}`.localeCompare(`${a.payout_date || ""}${a.id}`))
      .slice(0, 5);
    $("#incomeRecentList").innerHTML = recent.map((row) => `
      <button type="button" class="income-recent-item" data-open-payout="${row.id}">
        ${channelIconMarkup(row.channel)}
        <span class="income-recent-copy">
          <strong>${payoutPrimaryLabel(row)}</strong>
          <small>${payoutSecondaryLabel(row)}</small>
        </span>
        <em>${euro.format(number(row.net_amount))}</em>
      </button>
    `).join("") || `<div class="empty-state compact">Todav\u00eda no hay ingresos recientes.</div>`;
  }

  function renderIncomeSummaryCards(rows) {
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthRows = rows.filter((row) => String(row.payout_date || "").slice(0, 7) === monthKey);
    const pendingRows = rows.filter((row) => !paidStatuses.has(String(row.status || "")));
    const lastRow = [...rows].sort((a, b) => `${b.payout_date || ""}${b.id}`.localeCompare(`${a.payout_date || ""}${a.id}`))[0];
    const totalNet = rows.reduce((sum, row) => sum + number(row.net_amount), 0);
    const monthNet = monthRows.reduce((sum, row) => sum + number(row.net_amount), 0);
    const pendingNet = pendingRows.reduce((sum, row) => sum + number(row.net_amount), 0);
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevKey = prevMonth.toISOString().slice(0, 7);
    const prevRows = rows.filter((row) => String(row.payout_date || "").slice(0, 7) === prevKey);
    const prevTotal = prevRows.reduce((sum, row) => sum + number(row.net_amount), 0);
    const delta = prevTotal > 0 ? ((monthNet - prevTotal) / prevTotal) * 100 : null;
    const deltaText = delta == null ? "Sin comparativa previa" : `${delta >= 0 ? "\u2191" : "\u2193"} ${Math.abs(delta).toFixed(1).replace(".", ",")}% vs. periodo anterior`;
    $("#incomeSummaryCards").innerHTML = `
      <article class="card income-kpi-card tone-accent">
        <span class="income-kpi-icon"><svg><use href="#icon-chart"></use></svg></span>
        <div class="income-kpi-copy">
          <span>Ingreso neto</span>
          <strong>${euro.format(totalNet)}</strong>
          <small>${rows.length} ingresos registrados</small>
        </div>
      </article>
      <article class="card income-kpi-card tone-ok">
        <span class="income-kpi-icon"><svg><use href="#icon-wallet"></use></svg></span>
        <div class="income-kpi-copy">
          <span>Ingresos del mes</span>
          <strong>${euro.format(monthNet)}</strong>
          <small>${monthRows.length} cobros del mes</small>
        </div>
        <em class="income-kpi-trend ${delta != null && delta < 0 ? "warn" : "ok"}">${deltaText}</em>
      </article>
      <article class="card income-kpi-card tone-warn">
        <span class="income-kpi-icon"><svg><use href="#icon-clock"></use></svg></span>
        <div class="income-kpi-copy">
          <span>Pendientes</span>
          <strong>${euro.format(pendingNet)}</strong>
          <small>${pendingRows.length} ingresos sin ejecutar</small>
        </div>
      </article>
      <article class="card income-kpi-card tone-gold">
        <span class="income-kpi-icon"><svg><use href="#icon-calendar"></use></svg></span>
        <div class="income-kpi-copy">
          <span>\u00daltimo ingreso</span>
          <strong>${lastRow ? text(lastRow.payout_date) : "Sin datos"}</strong>
          <small>${lastRow ? `${euro.format(number(lastRow.net_amount))} \u00B7 ${channelLabel(lastRow.channel)}` : "Todav\u00eda sin ingresos"}</small>
        </div>
      </article>
    `;
  }

  function conciliationStatus(payout) {
    const hasReference = Boolean(String(payout.bank_reference || "").trim());
    const hasAccount = Boolean(String(payout.bank_account_hint || "").trim());
    if (hasReference && hasAccount) return { label: "Conciliado", tone: "ok" };
    if (hasReference || hasAccount) return { label: "Por conciliar", tone: "neutral" };
    return { label: "Sin conciliar", tone: "warn" };
  }

  function payoutTableRow(payout) {
    const conciliation = conciliationStatus(payout);
    return `
      <article class="income-table-row ${payout.is_deleted ? "deleted" : ""} ${state.selectedPayoutId == payout.id ? "active" : ""}">
        <span class="income-channel-cell">${channelIconMarkup(payout.channel)}<strong>${channelLabel(payout.channel)}</strong></span>
        <span>${text(payout.payout_date)}</span>
        <span class="income-reference-cell"><strong>${payoutPrimaryLabel(payout)}</strong><small>${payoutSecondaryLabel(payout)}</small></span>
        <span>${badge(payoutStatusLabel(payout.status), paidStatuses.has(String(payout.status || "")) ? "ok" : "warn")}</span>
        <span class="amount strong">${euro.format(number(payout.net_amount))}</span>
        <span class="income-gross-stack"><strong>${euro.format(number(payout.gross_amount))}</strong><small>Fees: ${euro.format(number(payout.fees_amount))}</small></span>
        <span class="income-conciliation ${conciliation.tone}">${conciliation.label}</span>
        <span class="table-actions">
          <button type="button" class="ghost icon-only" data-open-payout="${payout.id}" aria-label="Ver ingreso"><svg><use href="#icon-eye"></use></svg></button>
          <button type="button" class="ghost icon-only" data-edit-payout-details="${payout.id}" aria-label="Editar ingreso"><svg><use href="#icon-pencil"></use></svg></button>
          ${payout.is_deleted
            ? `<button type="button" class="ghost icon-only" data-restore-payout="${payout.id}" aria-label="Restaurar ingreso"><svg><use href="#icon-check-circle"></use></svg></button>`
            : `<button type="button" class="ghost icon-only danger-text" data-delete-payout="${payout.id}" aria-label="Archivar ingreso"><svg><use href="#icon-archive"></use></svg></button>`}
        </span>
      </article>
    `;
  }

  function renderPayouts() {
    const allRows = [...state.payouts];
    let rows = filteredPayoutRows();
    renderIncomeSummaryCards(rows);
    renderIncomeTrend(rows);
    renderIncomeChannels(rows);
    renderIncomeStatusTabs(allRows, rows);
    renderReviewQueue(rows);
    $("#incomeRecentList")?.closest(".income-side-panel")?.classList.add("hidden");
    rows = sortRows(rows, $("#payoutSort")?.value, {
      date_asc: (a, b) => String(a.payout_date).localeCompare(String(b.payout_date)),
      net_desc: (a, b) => number(b.net_amount) - number(a.net_amount),
      net_asc: (a, b) => number(a.net_amount) - number(b.net_amount),
      fees_desc: (a, b) => number(b.fees_amount) - number(a.fees_amount),
      channel_asc: (a, b) => lower(a.channel).localeCompare(lower(b.channel)) || String(b.payout_date).localeCompare(String(a.payout_date)),
      default: (a, b) => String(b.payout_date).localeCompare(String(a.payout_date))
    });
    const meta = paginateRows("payouts", rows);
    $("#incomeResultText").textContent = `${meta.total} ingresos visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
    $("#payoutList").innerHTML = meta.rows.map(payoutTableRow).join("") || `<div class="empty-state">No hay ingresos con esos filtros.</div>`;
    renderPagination("#payoutPagination", "payouts", meta);
  }

  function detailReview(payout) {
    const hasReference = Boolean(String(payout.bank_reference || "").trim());
    const hasAccount = Boolean(String(payout.bank_account_hint || "").trim());
    const coherent = !number(payout.gross_amount) || Math.abs(number(payout.net_amount) - Math.max(0, number(payout.gross_amount) - number(payout.fees_amount))) <= 0.02;
    return [
      ["Referencia", hasReference ? "Referencia disponible." : "Pendiente de completar.", hasReference ? "ok" : "warn", hasReference ? "icon-check-circle" : "icon-alert"],
      ["Cuenta", hasAccount ? "Cuenta informada." : "Sin cuenta asignada.", hasAccount ? "ok" : "warn", hasAccount ? "icon-check-circle" : "icon-bank"],
      ["Importe", coherent ? "Importes coherentes." : "Hay que revisar bruto, neto o fees.", coherent ? "ok" : "warn", coherent ? "icon-check-circle" : "icon-alert"],
      ["Estado", payoutStatusLabel(payout.status), paidStatuses.has(String(payout.status || "")) ? "ok" : "neutral", paidStatuses.has(String(payout.status || "")) ? "icon-check-circle" : "icon-clock"]
    ].map(([label, hint, tone, icon]) => `
      <span class="${tone}">
        <span class="invoice-check-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
        <strong>${label}</strong>
        <small>${hint}</small>
      </span>
    `).join("");
  }

  async function openPayout(id) {
    const payout = state.payouts.find((row) => row.id == id);
    if (!payout) return;
    state.selectedPayoutId = payout.id;
    $("#payoutForm")?.classList.add("hidden");
    $("#income .income-page")?.classList.add("income-focus-mode");
    document.body.classList.add("income-focus-active");
    const panel = $("#payoutDetailPanel");
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="invoice-detail-hero">
        <div>
          <p class="eyebrow">Operaciones / Ingresos</p>
          <div class="invoice-title-row">
            <h2>${channelLabel(payout.channel)} \u00B7 ${text(payout.payout_date)}</h2>
            <span class="status-pill ${paidStatuses.has(String(payout.status || "")) ? "ok" : "warn"}">${payoutStatusLabel(payout.status)}</span>
          </div>
          <p>${channelLabel(payout.channel)} \u00B7 ${euro.format(number(payout.net_amount))} netos \u00B7 ${text(payout.bank_reference || "Sin referencia bancaria")}</p>
        </div>
        <div class="invoice-hero-actions">
          <button type="button" class="ghost button-with-icon" data-close-payout-panels><svg><use href="#icon-arrow-left"></use></svg><span>Cerrar</span></button>
          <button type="button" class="button-with-icon" data-edit-payout-details="${payout.id}"><svg><use href="#icon-pencil"></use></svg><span>Editar ingreso</span></button>
        </div>
      </div>

      <div class="invoice-detail-grid">
        <div class="invoice-detail-main">
          <section class="panel invoice-editor-card">
            <div class="panel-head compact-head">
              <div>
                <h2>1. Resumen del ingreso</h2>
                <p>Importes, canal y estado del movimiento.</p>
              </div>
            </div>
            <div class="form-grid four">
              <div class="inline-note"><small>Canal</small><strong>${channelLabel(payout.channel)}</strong></div>
              <div class="inline-note"><small>Fecha</small><strong>${text(payout.payout_date)}</strong></div>
              <div class="inline-note"><small>Estado</small><strong>${payoutStatusLabel(payout.status)}</strong></div>
              <div class="inline-note"><small>Moneda</small><strong>${text(payout.currency || "EUR")}</strong></div>
            </div>
            <div class="income-calc-summary detail">
              <span><small>Bruto</small><strong>${euro.format(number(payout.gross_amount))}</strong></span>
              <span class="operator">\u2212</span>
              <span><small>Comisiones</small><strong>${euro.format(number(payout.fees_amount))}</strong></span>
              <span class="operator">=</span>
              <span class="total"><small>Neto</small><strong>${euro.format(number(payout.net_amount))}</strong></span>
            </div>
            <div class="form-grid two">
              <div class="inline-note"><small>Referencia banco</small><strong>${text(payout.bank_reference || "Sin referencia")}</strong></div>
              <div class="inline-note"><small>Cuenta banco</small><strong>${text(payout.bank_account_hint || "Sin asignar")}</strong></div>
            </div>
            <div class="inline-note multi-line"><small>Notas</small><strong>${text(payout.notes || "Sin notas internas")}</strong></div>
          </section>
        </div>
        <aside class="invoice-detail-side">
          <section class="panel invoice-check-card">
            <div class="panel-head compact-head">
              <div>
                <h2>2. Conciliaci\u00f3n</h2>
                <p>Indicadores r\u00e1pidos del registro.</p>
              </div>
            </div>
            <div class="invoice-check-list">${detailReview(payout)}</div>
          </section>
          <section class="panel invoice-check-card">
            <div class="panel-head compact-head">
              <div>
                <h2>3. Origen</h2>
                <p>Trazabilidad de este ingreso.</p>
              </div>
            </div>
            <div class="income-origin-list detail">
              <article class="income-origin-item"><small>Origen</small><strong>${text(payout.raw_source_file || "Manual")}</strong></article>
              <article class="income-origin-item"><small>ID externo</small><strong>${text(payout.external_id || "No informado")}</strong></article>
              <article class="income-origin-item"><small>Cuenta</small><strong>${text(payout.bank_account_hint || "Pendiente")}</strong></article>
            </div>
          </section>
        </aside>
      </div>
    `;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    renderPayouts();
  }

  return { renderIncome, renderIncomeSummaryCards, renderPayouts, openPayout };
}
