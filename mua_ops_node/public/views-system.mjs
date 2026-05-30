export function createSystemViews(ctx) {
  const {
    state,
    $,
    $$,
    text,
    badge,
    setForm,
    chartColors,
    formatAuditTimestamp,
    technicalLogLevel,
    technicalLogSource,
    technicalLogMessage,
    technicalLogContext
  } = ctx;

  function technicalLogFilterValues() {
    return {
      source: $("#technicalLogSource")?.value || "",
      level: $("#technicalLogLevel")?.value || state.technicalLogLevel || "relevant",
      query: String($("#technicalLogQuery")?.value || "").trim().toLowerCase(),
      from: $("#technicalLogFrom")?.value || "",
      to: $("#technicalLogTo")?.value || ""
    };
  }

  function renderSettings() {
    const form = $("#settingsForm");
    if (!form || !state.settings) return;
    if (!["cobros", "channel_shopify", "channel_etsy", "channel_bizum"].includes(state.settings.dashboard_income_monthly_view)) {
      state.settings.dashboard_income_monthly_view = "cobros";
    }
    setForm(form, state.settings);
    const colors = chartColors();
    if (form.elements.dashboard_color_total) form.elements.dashboard_color_total.value = state.settings.dashboard_color_total || colors.total;
    if (form.elements.dashboard_color_materiales) form.elements.dashboard_color_materiales.value = state.settings.dashboard_color_materiales || colors.materiales;
    if (form.elements.dashboard_color_marketing) form.elements.dashboard_color_marketing.value = state.settings.dashboard_color_marketing || colors.marketing;
    if (form.elements.dashboard_color_envios) form.elements.dashboard_color_envios.value = state.settings.dashboard_color_envios || colors.envios;
    if (form.elements.dashboard_color_cobros) form.elements.dashboard_color_cobros.value = state.settings.dashboard_color_cobros || colors.cobros;
    if (form.elements.dashboard_color_fees) form.elements.dashboard_color_fees.value = state.settings.dashboard_color_fees || colors.fees;
    if (form.elements.dashboard_color_shopify) form.elements.dashboard_color_shopify.value = state.settings.dashboard_color_shopify || colors.shopify;
    if (form.elements.dashboard_color_etsy) form.elements.dashboard_color_etsy.value = state.settings.dashboard_color_etsy || colors.etsy;
    if (form.elements.dashboard_color_bizum) form.elements.dashboard_color_bizum.value = state.settings.dashboard_color_bizum || colors.bizum;
    $("#brandName").textContent = state.settings.company_name || "Mua Ops";
    document.title = state.settings.company_name || "Mua Ops";
    $$("[data-dashboard-expense-trend-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.dashboardExpenseTrendView === state.dashboardExpenseTrendView);
    });
    $$("[data-dashboard-income-trend-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.dashboardIncomeTrendView === state.dashboardIncomeTrendView);
    });
    $$("[data-settings-section]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.settingsSection === state.settingsSection);
    });
    $$(".settings-section").forEach((section) => {
      section.classList.toggle("hidden", section.dataset.settingsPanel !== state.settingsSection);
    });
    if ($("#technicalLogLevel")) $("#technicalLogLevel").value = state.technicalLogLevel || "relevant";
    $("#settingsSubmitRow")?.classList.toggle("hidden", ["shopify", "diagnostico", "logs"].includes(state.settingsSection));
    renderSystemHealth();
    renderTechnicalLogs();
  }

  function renderShopifyConnection() {
    const form = $("#shopifyConnectionForm");
    const statusNode = $("#shopifySyncStatus");
    const connection = state.shopifyConnection;
    const status = state.shopifySyncStatus;
    if (!form || !connection || !statusNode) return;
    form.querySelector('[name="store_domain"]').value = connection.store_domain || "";
    form.querySelector('[name="api_version"]').value = connection.api_version || "2026-01";
    form.querySelector('[name="client_id"]').value = "";
    form.querySelector('[name="client_id"]').placeholder = connection.client_id_masked || "shpui_...";
    form.querySelector('[name="client_secret"]').value = "";
    form.querySelector('[name="client_secret"]').placeholder = connection.client_secret_masked || "shpss_...";
    form.querySelector('[name="sync_enabled"]').checked = Boolean(connection.sync_enabled);
    form.querySelector('[name="sync_interval_minutes"]').value = connection.sync_interval_minutes || 60;
    form.querySelector('[name="pull_products"]').checked = Boolean(connection.pull_products);
    form.querySelector('[name="pull_inventory"]').checked = Boolean(connection.pull_inventory);
    form.querySelector('[name="pull_orders"]').checked = Boolean(connection.pull_orders);
    form.querySelector('[name="pull_payouts"]').checked = Boolean(connection.pull_payouts);

    const summary = status.last_sync_summary;
    const summaryText = summary && typeof summary === "object"
      ? Object.entries(summary)
          .filter(([key, value]) => ["products", "inventory", "orders", "payouts"].includes(key) && value)
          .map(([key, value]) => `${key}: ${value.created ?? 0} nuevas / ${value.updated ?? 0} actualizadas`)
          .join(" · ")
      : (typeof summary === "string" ? summary : "");

    statusNode.innerHTML = `
      <article class="row">
        <div class="row-main">
          <strong>${connection.credentials_configured || connection.token_configured ? "Conexión configurada" : "Conexión pendiente"}</strong>
          <div class="meta">${connection.store_domain ? text(connection.store_domain) : "Todavía no hay dominio configurado"} · API ${text(connection.api_version || "2026-01")}</div>
          <div class="meta">Autenticación: ${connection.auth_mode === "client_credentials" ? "Dev Dashboard" : (connection.auth_mode === "admin_token" ? "Token admin" : "sin configurar")}</div>
          <div class="meta">Última sync: ${text(status.last_sync_at || "nunca")} · Próxima: ${text(status.next_sync_at || "manual")}</div>
          ${summaryText ? `<p>${text(summaryText)}</p>` : ""}
        </div>
        <div class="tags">
          ${badge(connection.sync_enabled ? "auto activa" : "manual", connection.sync_enabled ? "ok" : "warn")}
          ${badge(status.running ? "sincronizando" : (status.last_sync_status || "sin estado"), status.running ? "warn" : "ok")}
        </div>
      </article>
    `;
  }

  function renderSystemHealth() {
    const health = state.systemHealth;
    const cards = $("#systemHealthCards");
    const summary = $("#systemHealthSummary");
    const backups = $("#systemHealthBackups");
    const incidents = $("#systemHealthIncidents");
    const schema = $("#systemHealthSchema");
    const shopify = $("#systemHealthShopify");
    if (!cards || !summary || !backups || !incidents || !schema || !shopify) return;
    if (!health) {
      cards.innerHTML = "";
      summary.textContent = "Diagnóstico no disponible.";
      backups.innerHTML = "";
      incidents.innerHTML = "";
      schema.innerHTML = "";
      shopify.innerHTML = "";
      return;
    }
    cards.innerHTML = [
      ["Base", health.database?.exists ? "Disponible" : "Ausente", health.database?.integrity === "ok" ? "Integridad ok" : (health.database?.integrity || "Sin comprobar")],
      ["Backups", health.backups?.latest ? "Activos" : "Sin backup", health.backups?.latest ? text(health.backups.latest.created_at || "") : "Todavía no hay copia"],
      ["Migraciones", `${(health.schema?.applied_migrations || []).length}`, (health.schema?.pending_migrations || []).length ? `${health.schema.pending_migrations.length} pendientes` : "Sin pendientes"],
      ["Shopify", health.shopify?.credentials_configured || health.shopify?.token_configured ? "Configurado" : "Pendiente", health.shopify?.last_sync_status || "Sin sync"]
    ].map(([label, value, hint]) => `
      <article class="card dashboard-kpi-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${hint}</small>
      </article>
    `).join("");

    summary.innerHTML = `
      <strong>${health.ok ? "Estado general correcto" : "Hay elementos técnicos a revisar"}</strong>
      <span>DB ${text(health.database?.path || "-")} · tamaño ${health.database?.size_bytes || 0} bytes · actualizada ${text(health.database?.updated_at || "-")}</span>
    `;

    backups.innerHTML = `
      <article class="diagnostics-row">
        <strong>Backups</strong>
        <div class="meta">Carpeta · ${text(health.backups?.directory || "-")}</div>
        ${health.backups?.latest ? `
          <div class="meta">Último · ${text(health.backups.latest.created_at || "-")}</div>
          <div class="meta">Tamaño · ${health.backups.latest.size_bytes || 0} bytes</div>
          <code>${text(health.backups.latest.name || "")}</code>
        ` : `<div class="meta">Todavía no existe una copia registrada.</div>`}
      </article>
    `;

    const recentErrors = (state.technicalAudit || []).filter((row) => technicalLogLevel(row) === "error");
    const recentWarnings = (state.technicalAudit || []).filter((row) => technicalLogLevel(row) === "warn");
    const latestIncident = [...(state.technicalAudit || [])]
      .filter((row) => ["error", "warn"].includes(technicalLogLevel(row)))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];

    incidents.innerHTML = `
      <article class="diagnostics-row">
        <strong>Incidencias recientes</strong>
        <div class="meta">Errores · ${recentErrors.length}</div>
        <div class="meta">Warnings · ${recentWarnings.length}</div>
        <div class="meta">Última incidencia · ${latestIncident ? formatAuditTimestamp(latestIncident.created_at) : "sin incidencias recientes"}</div>
        <div class="meta">${latestIncident ? text(technicalLogMessage(latestIncident)) : "El sistema no ha registrado errores o warnings recientes."}</div>
      </article>
    `;

    schema.innerHTML = `
      <article class="diagnostics-row">
        <strong>Migraciones</strong>
        <div class="meta">Aplicadas · ${(health.schema?.applied_migrations || []).length}</div>
        <div class="meta">Esperadas · ${(health.schema?.expected_migrations || []).length}</div>
        <div class="meta">Pendientes · ${(health.schema?.pending_migrations || []).length}</div>
        ${(health.schema?.applied_migrations || []).slice(-4).map((row) => `<code>${text(row.id)} · ${text(row.applied_at || "")}</code>`).join("")}
      </article>
    `;

    shopify.innerHTML = `
      <article class="diagnostics-row">
        <strong>Shopify</strong>
        <div class="meta">Dominio · ${text(health.shopify?.store_domain || "sin configurar")}</div>
        <div class="meta">Auth · ${text(health.shopify?.auth_mode || "none")}</div>
        <div class="meta">Última sync · ${text(health.shopify?.last_sync_at || "nunca")}</div>
        <div class="meta">Estado sync · ${text(health.shopify?.last_sync_status || "sin estado")}</div>
        ${(health.shopify?.last_sync_summary && typeof health.shopify.last_sync_summary === "object")
          ? Object.entries(health.shopify.last_sync_summary)
              .filter(([key, value]) => ["products", "inventory", "orders", "payouts"].includes(key) && value)
              .map(([key, value]) => `<code>${text(key)} · ${value.status || "ok"} · ${value.duration_ms || 0} ms</code>`)
              .join("")
          : ""}
      </article>
    `;
  }

  function renderTechnicalLogs() {
    const summary = $("#technicalLogSummary");
    const list = $("#technicalLogList");
    if (!summary || !list) return;
    const { source, level, query: queryText, from, to } = technicalLogFilterValues();
    let rows = [...(state.technicalAudit || [])];
    rows = rows.filter((row) => {
      const rowSource = technicalLogSource(row);
      const rowLevel = technicalLogLevel(row);
      const haystack = `${row.action || ""} ${technicalLogMessage(row)} ${rowSource}`.toLowerCase();
      if (source && rowSource !== source) return false;
      if (level === "relevant" && !["error", "warn", "info"].includes(rowLevel)) return false;
      if (["error", "warn", "info", "debug"].includes(level) && rowLevel !== level) return false;
      if (queryText && !haystack.includes(queryText)) return false;
      if (from && String(row.created_at || "").slice(0, 10) < from) return false;
      if (to && String(row.created_at || "").slice(0, 10) > to) return false;
      return true;
    });
    const counts = {
      error: rows.filter((row) => technicalLogLevel(row) === "error").length,
      warn: rows.filter((row) => technicalLogLevel(row) === "warn").length,
      info: rows.filter((row) => technicalLogLevel(row) === "info").length,
      debug: rows.filter((row) => technicalLogLevel(row) === "debug").length
    };
    summary.textContent = `${rows.length} eventos · ${counts.error} errores · ${counts.warn} warnings · ${counts.info} info${level === "all" ? ` · ${counts.debug} debug` : ""}`;
    const meta = ctx.paginateRows("technicalLogs", rows);
    list.innerHTML = meta.rows.map((row) => {
      const rowLevel = technicalLogLevel(row);
      const rowSource = technicalLogSource(row);
      const context = technicalLogContext(row);
      return `
        <article class="audit-card technical-log-card">
          <div class="audit-card-head">
            <div class="row-main">
              <strong>${text(ctx.auditActionLabel ? ctx.auditActionLabel(row.action) : row.action)}</strong>
              <div class="meta">${formatAuditTimestamp(row.created_at)} · ${text(row.actor)}</div>
              <div class="tags">
                ${badge(ctx.TECHNICAL_LOG_LEVELS?.[rowLevel] || rowLevel, rowLevel === "error" ? "warn" : rowLevel === "info" ? "ok" : "")}
                ${badge(rowSource === "client" ? "Cliente" : rowSource === "system" ? "Sistema" : "Shopify")}
              </div>
              <div class="audit-note">${text(technicalLogMessage(row))}</div>
              ${Object.keys(context).length ? `<div class="meta">Contexto disponible para copia</div>` : ""}
            </div>
            <div class="row-actions slim">
              <button type="button" class="ghost" data-copy-technical-log="${row.id}">Copiar detalle</button>
            </div>
          </div>
        </article>
      `;
    }).join("") || `<div class="empty-state"><strong>Sin eventos técnicos visibles</strong>Ajusta el nivel, el origen o la búsqueda para ampliar la vista.</div>`;
    ctx.renderPagination("#technicalLogPagination", "technicalLogs", meta);
  }

  return {
    renderSettings,
    renderShopifyConnection,
    renderSystemHealth,
    renderTechnicalLogs,
    technicalLogFilterValues
  };
}
