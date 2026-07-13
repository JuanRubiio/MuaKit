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

  function icon(name) {
    return `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  }

  function renderSettingsStatusStrip() {
    const node = $("#settingsStatusStrip");
    if (!node || !state.settings) return;
    const connection = state.shopifyConnection || {};
    const status = state.shopifySyncStatus || {};
    const health = state.systemHealth || {};
    const logs = state.technicalAudit || [];
    const section = state.settingsSection || "general";
    const configured = Boolean(connection.credentials_configured || connection.token_configured);
    const errors = logs.filter((row) => technicalLogLevel(row) === "error").length;
    const warnings = logs.filter((row) => technicalLogLevel(row) === "warn").length;
    let items = [
      ["icon-check-circle", "Configuración guardada", "Activa", "Preferencias validadas", "ok"],
      ["icon-wallet", "Moneda", state.settings.currency || "EUR", "Moneda de trabajo", "accent"],
      ["icon-file", "Factura por defecto", ctx.statusLabel?.(state.settings.default_invoice_status) || state.settings.default_invoice_status || "Borrador", state.settings.default_invoice_category || "materiales", "warn"],
      ["icon-activity", "Reposición preventiva", `x${state.settings.reorder_alert_multiplier || "1.25"}`, `Stock base ${state.settings.low_stock_default || 10}`, "rose"],
      ["icon-channel-shopify", "Shopify", configured ? "Conectado" : "Pendiente", status.last_sync_at ? `Última sync ${formatAuditTimestamp(status.last_sync_at)}` : "Sin sincronización", configured ? "ok" : "warn"]
    ];
    if (section === "shopify") {
      items = [
        ["icon-channel-shopify", "Shopify", configured ? "Conectado" : "Pendiente", connection.store_domain || "Sin dominio", configured ? "ok" : "warn"],
        ["icon-clock", "Última sincronización", status.last_sync_at ? formatAuditTimestamp(status.last_sync_at) : "Nunca", status.last_sync_status || "Sin estado", "accent"],
        ["icon-refresh", "Auto refresco", connection.sync_enabled ? "Activo" : "Manual", connection.sync_enabled ? `Cada ${connection.sync_interval_minutes || 60} min` : "Sin ejecución automática", connection.sync_enabled ? "ok" : "warn"],
        ["icon-save", "Backup reciente", health.backups?.latest ? formatAuditTimestamp(health.backups.latest.created_at) : "Sin backup", health.backups?.latest?.name || "Crea una copia de seguridad", health.backups?.latest ? "rose" : "warn"]
      ];
    } else if (section === "logs") {
      items = [
        ["icon-note", "Logs relevantes", logs.length, "Eventos técnicos cargados", "accent"],
        ["icon-alert", "Errores", errors, errors ? "Requieren revisión" : "Sin errores", errors ? "danger" : "ok"],
        ["icon-alert", "Warnings", warnings, warnings ? "Conviene revisarlos" : "Sin avisos", warnings ? "warn" : "ok"],
        ["icon-channel-shopify", "Shopify sync", logs.filter((row) => technicalLogSource(row) === "shopify").length, "Eventos de sincronización", "ok"],
        ["icon-clock", "Último evento", logs[0]?.created_at ? formatAuditTimestamp(logs[0].created_at) : "Sin eventos", logs[0] ? technicalLogMessage(logs[0]) : "Todavía no hay actividad", "rose"]
      ];
    } else if (section === "diagnostico") {
      items = [
        ["icon-check-circle", "Estado general", health.ok ? "Correcto" : "Revisar", health.database?.integrity === "ok" ? "Integridad OK" : "Diagnóstico pendiente", health.ok ? "ok" : "warn"],
        ["icon-cube", "Base de datos", health.database?.exists ? "Disponible" : "Ausente", health.database?.integrity || "Sin comprobar", health.database?.exists ? "accent" : "danger"],
        ["icon-save", "Backups", health.backups?.latest ? "Activos" : "Pendientes", health.backups?.latest ? formatAuditTimestamp(health.backups.latest.created_at) : "Sin copia registrada", health.backups?.latest ? "ok" : "warn"],
        ["icon-activity", "Migraciones", (health.schema?.applied_migrations || []).length, (health.schema?.pending_migrations || []).length ? `${health.schema.pending_migrations.length} pendientes` : "Sin pendientes", (health.schema?.pending_migrations || []).length ? "warn" : "ok"]
      ];
    }
    node.innerHTML = items.map(([iconName, label, value, hint, tone]) => `
      <article class="settings-status-item tone-${tone}">
        <span>${icon(iconName)}</span>
        <div><small>${text(label)}</small><strong>${text(value)}</strong><em>${text(hint)}</em></div>
      </article>
    `).join("");
  }

  function renderSettingsContext() {
    const node = $("#settingsContextAside");
    if (!node || !state.settings) return;
    const section = state.settingsSection || "general";
    const health = state.systemHealth || {};
    const connection = state.shopifyConnection || {};
    const status = state.shopifySyncStatus || {};
    const logs = state.technicalAudit || [];
    const errors = logs.filter((row) => technicalLogLevel(row) === "error").length;
    const warnings = logs.filter((row) => technicalLogLevel(row) === "warn").length;
    const info = logs.filter((row) => technicalLogLevel(row) === "info").length;

    if (section === "shopify") {
      node.innerHTML = `
        <section class="settings-context-card">
          <div class="settings-context-head"><div><h3>Estado de Shopify</h3><p>Conexión y sincronización actual.</p></div>${icon("icon-channel-shopify")}</div>
          <div class="settings-context-hero tone-${connection.credentials_configured || connection.token_configured ? "ok" : "warn"}">
            <span>${icon("icon-channel-shopify")}</span>
            <div><small>Conexión</small><strong>${connection.credentials_configured || connection.token_configured ? "Configurada" : "Pendiente"}</strong><em>${text(connection.store_domain || "Sin dominio")}</em></div>
          </div>
          <dl class="settings-context-list">
            <div><dt>Auto refresco</dt><dd>${connection.sync_enabled ? "Activo" : "Manual"}</dd></div>
            <div><dt>Frecuencia</dt><dd>${connection.sync_interval_minutes || 60} min</dd></div>
            <div><dt>Última sync</dt><dd>${text(status.last_sync_at || "Nunca")}</dd></div>
            <div><dt>Estado</dt><dd>${text(status.last_sync_status || "Sin estado")}</dd></div>
          </dl>
        </section>
        <section class="settings-context-card">
          <div class="settings-context-head"><div><h3>Recursos activos</h3><p>Alcance configurado.</p></div></div>
          <div class="settings-scope-list">
            ${[["Catálogo", connection.pull_products], ["Inventario", connection.pull_inventory], ["Pedidos", connection.pull_orders], ["Payouts", connection.pull_payouts]]
              .map(([label, active]) => `<span class="${active ? "is-active" : ""}">${icon(active ? "icon-check-circle" : "icon-minus-circle")}${label}</span>`).join("")}
          </div>
        </section>
      `;
      return;
    }

    if (section === "diagnostico") {
      node.innerHTML = `
        <section class="settings-context-card">
          <div class="settings-context-head"><div><h3>Resumen técnico</h3><p>Estado de componentes críticos.</p></div>${icon("icon-check-circle")}</div>
          <div class="settings-context-hero tone-${health.ok ? "ok" : "warn"}">
            <span>${icon(health.ok ? "icon-check-circle" : "icon-alert")}</span>
            <div><small>Estado general</small><strong>${health.ok ? "Correcto" : "Requiere revisión"}</strong><em>${health.database?.integrity === "ok" ? "Integridad de base de datos OK" : "Comprobar diagnóstico"}</em></div>
          </div>
          <dl class="settings-context-list">
            <div><dt>Base de datos</dt><dd>${health.database?.exists ? "Disponible" : "Ausente"}</dd></div>
            <div><dt>Migraciones pendientes</dt><dd>${(health.schema?.pending_migrations || []).length}</dd></div>
            <div><dt>Último backup</dt><dd>${text(health.backups?.latest?.created_at || "Sin backup")}</dd></div>
            <div><dt>Shopify</dt><dd>${text(health.shopify?.last_sync_status || "Sin sync")}</dd></div>
          </dl>
        </section>
      `;
      return;
    }

    if (section === "logs") {
      node.innerHTML = `
        <section class="settings-context-card">
          <div class="settings-context-head"><div><h3>Resumen de logs</h3><p>Distribución de eventos técnicos.</p></div>${icon("icon-note")}</div>
          <div class="settings-log-summary">
            <div class="tone-danger"><span>Error</span><strong>${errors}</strong></div>
            <div class="tone-warn"><span>Warning</span><strong>${warnings}</strong></div>
            <div class="tone-ok"><span>Info</span><strong>${info}</strong></div>
            <div><span>Total</span><strong>${logs.length}</strong></div>
          </div>
        </section>
        <section class="settings-context-card">
          <div class="settings-context-head"><div><h3>Retención y soporte</h3><p>Información útil para diagnóstico.</p></div></div>
          <p class="settings-context-copy">Los logs técnicos no alteran datos de negocio. Utiliza "Copiar detalle" para compartir el contexto de un evento.</p>
        </section>
      `;
      return;
    }

    node.innerHTML = `
      <section class="settings-context-card">
        <div class="settings-context-head"><div><h3>Vista previa</h3><p>Así se aplicarán estas preferencias.</p></div>${icon("icon-activity")}</div>
        <div class="settings-preview-block">
          <strong>${icon("icon-activity")} Dashboard</strong>
          <div class="settings-preview-kpis">
            <span><small>Ventana</small><b>${text(state.settings.dashboard_window_preset || "all")}</b></span>
            <span><small>Gastos</small><b>${text(state.settings.dashboard_monthly_view || "total")}</b></span>
            <span><small>Ingresos</small><b>${text(state.settings.dashboard_income_monthly_view || "cobros")}</b></span>
          </div>
        </div>
        <div class="settings-preview-block">
          <strong>${icon("icon-file")} Facturas</strong>
          <dl class="settings-context-list compact">
            <div><dt>Estado</dt><dd>${text(ctx.statusLabel?.(state.settings.default_invoice_status) || "Borrador")}</dd></div>
            <div><dt>Categoría</dt><dd>${text(state.settings.default_invoice_category || "materiales")}</dd></div>
          </dl>
        </div>
        <div class="settings-preview-block">
          <strong>${icon("icon-wallet")} Ingresos</strong>
          <dl class="settings-context-list compact">
            <div><dt>Canal payout</dt><dd>${text(state.settings.default_payout_channel || "shopify")}</dd></div>
            <div><dt>Estado</dt><dd>${text(state.settings.default_payout_status || "paid")}</dd></div>
          </dl>
        </div>
      </section>
      <section class="settings-context-card">
        <div class="settings-context-head"><div><h3>Estado de cambios</h3><p>Validación antes de guardar.</p></div>${icon("icon-check-circle")}</div>
        <div class="settings-context-hero tone-ok">
          <span>${icon("icon-check-circle")}</span>
          <div><small>Valores válidos</small><strong>Listos para aplicar</strong><em>No modifican datos históricos</em></div>
        </div>
        <p class="settings-context-copy">Las preferencias afectan a nuevos registros, importaciones futuras y vistas iniciales.</p>
      </section>
    `;
  }

  function renderSettingsContextLatest() {
    const node = $("#settingsContextAside");
    if (!node || !state.settings) return;
    const section = state.settingsSection || "general";
    if (section !== "diagnostico") {
      renderSettingsContext();
      return;
    }
    const health = state.systemHealth || {};
    const testHealth = state.systemTestHealth || {};
    const failingSuite = (testHealth.suites || []).find((suite) => suite.status !== "ok");
    const coverage = testHealth.coverage || null;
    const coveragePct = Number(coverage?.lines?.pct || 0);
    const coverageTone = coverage ? (coveragePct >= 90 ? "ok" : coveragePct >= 75 ? "accent" : "warn") : "accent";
    const coverageLabel = coverage
      ? coveragePct >= 90 ? "Cobertura fuerte"
        : coveragePct >= 75 ? "Cobertura razonable"
          : "Cobertura baja"
      : "Sin cobertura";
    const ocr = health.automation?.ocr || {};
    const importCounts = Object.fromEntries((health.automation?.expense_imports || []).map((row) => [row.status, Number(row.count || 0)]));
    const importIssues = Number(importCounts.error || 0);
    const regressionLabel = testHealth.status === "ok"
      ? "Sin roturas detectadas"
      : testHealth.status === "error"
        ? "Hay fallos a revisar"
        : testHealth.running
          ? "Verificacion en curso"
          : "Pendiente de verificar";
    node.innerHTML = `
      <section class="settings-context-card">
        <div class="settings-context-head"><div><h3>Salud operativa</h3><p>Infraestructura, datos y sincronización.</p></div>${icon("icon-check-circle")}</div>
        <div class="settings-context-hero tone-${health.ok ? "ok" : "warn"}">
          <span>${icon(health.ok ? "icon-check-circle" : "icon-alert")}</span>
          <div><small>Estado general</small><strong>${health.ok ? "Correcto" : "Requiere revisión"}</strong><em>${health.database?.integrity === "ok" ? "Integridad de base de datos OK" : "Comprobar diagnóstico"}</em></div>
        </div>
        <dl class="settings-context-list">
          <div><dt>Base de datos</dt><dd>${health.database?.exists ? "Disponible" : "Ausente"}</dd></div>
          <div><dt>Migraciones pendientes</dt><dd>${(health.schema?.pending_migrations || []).length}</dd></div>
          <div><dt>Último backup</dt><dd>${text(health.backups?.latest?.created_at || "Sin backup")}</dd></div>
          <div><dt>Shopify</dt><dd>${text(health.shopify?.last_sync_status || "Sin sync")}</dd></div>
          <div><dt>Última sync</dt><dd>${text(health.shopify?.last_sync_at || "Nunca")}</dd></div>
          <div><dt>Motor OCR local</dt><dd>${ocr.available ? `${(ocr.languages || []).join("+")} disponible` : "No disponible"}</dd></div>
          <div><dt>Cola OCR</dt><dd>${Number(ocr.pending || 0)} pendientes · ${importIssues} fallidos</dd></div>
          <div><dt>Última reposición</dt><dd>${text(health.automation?.replenishment?.last_run_at || "Aún no ejecutada")}</dd></div>
        </dl>
      </section>
      <section class="settings-context-card">
        <div class="settings-context-head"><div><h3>Salud de regresión</h3><p>Tests, duración y cobertura para decidir con confianza.</p></div>${icon("icon-note")}</div>
        <div class="settings-context-hero tone-${testHealth.status === "ok" ? "ok" : testHealth.status === "error" ? "warn" : "accent"}">
          <span>${icon(testHealth.status === "ok" ? "icon-check-circle" : "icon-alert")}</span>
          <div><small>Regresión</small><strong>${regressionLabel}</strong><em>${failingSuite ? `Bloqueo actual en ${failingSuite.label}` : (testHealth.summary || "Sin ejecuciones registradas")}</em></div>
        </div>
        <dl class="settings-context-list">
          <div><dt>Estado</dt><dd>${text(testHealth.status || "unknown")}</dd></div>
          <div><dt>Última ejecución</dt><dd>${text(testHealth.last_run_at || "Nunca")}</dd></div>
          <div><dt>Duración</dt><dd>${testHealth.duration_ms ? `${Math.round(testHealth.duration_ms / 1000)} s` : "-"}</dd></div>
          <div><dt>Cobertura</dt><dd>${coverage ? `${coverage.lines?.pct?.toFixed(1) || "0.0"}% líneas` : "Sin resumen"}</dd></div>
        </dl>
        <div class="settings-context-hero tone-${coverageTone}">
          <span>${icon("icon-chart")}</span>
          <div><small>Cobertura actual</small><strong>${coverageLabel}</strong><em>${coverage ? `${coverage.branches?.pct?.toFixed(1) || "0.0"}% branches · ${coverage.functions?.pct?.toFixed(1) || "0.0"}% funciones · umbral recomendado 90% líneas` : "Ejecuta la verificación para generar cobertura"}</em></div>
        </div>
        <p class="settings-context-copy">Este bloque resume si la aplicación sigue sana tras cambios de código, ajustes de configuración o nuevas sincronizaciones. Las syncs manuales de Shopify lanzan esta verificación en segundo plano.</p>
        <div class="row-actions">
          <button type="button" class="ghost" data-copy-system-tests>${icon("icon-copy")}Copiar verificación</button>
        </div>
      </section>
    `;
  }

  function renderSettings() {
    const form = $("#settingsForm");
    if (!form || !state.settings) return;
    if (!["cobros", "channel_shopify", "channel_etsy", "channel_bizum"].includes(state.settings.dashboard_income_monthly_view)) {
      state.settings.dashboard_income_monthly_view = "cobros";
    }
    form.querySelectorAll('[data-settings-panel="general"] [name], [data-settings-panel="dashboard"] [name], [data-settings-panel="cobros"] [name]').forEach((element) => {
      if (!Object.prototype.hasOwnProperty.call(state.settings, element.name)) return;
      if (element.type === "checkbox") element.checked = Boolean(state.settings[element.name]);
      else element.value = state.settings[element.name] ?? "";
    });
    const colors = chartColors();
    if (form.elements.dashboard_color_total) form.elements.dashboard_color_total.value = state.settings.dashboard_color_total || colors.total;
    if (form.elements.dashboard_color_materiales) form.elements.dashboard_color_materiales.value = state.settings.dashboard_color_materiales || colors.materiales;
    if (form.elements.dashboard_color_marketing) form.elements.dashboard_color_marketing.value = state.settings.dashboard_color_marketing || colors.marketing;
    if (form.elements.dashboard_color_envios) form.elements.dashboard_color_envios.value = state.settings.dashboard_color_envios || colors.envios;
    if (form.elements.dashboard_color_servicios) form.elements.dashboard_color_servicios.value = state.settings.dashboard_color_servicios || colors.servicios;
    if (form.elements.dashboard_color_software) form.elements.dashboard_color_software.value = state.settings.dashboard_color_software || colors.software;
    if (form.elements.dashboard_color_impuestos) form.elements.dashboard_color_impuestos.value = state.settings.dashboard_color_impuestos || colors.impuestos;
    if (form.elements.dashboard_color_otros) form.elements.dashboard_color_otros.value = state.settings.dashboard_color_otros || colors.otros;
    if (form.elements.dashboard_color_cobros) form.elements.dashboard_color_cobros.value = state.settings.dashboard_color_cobros || colors.cobros;
    if (form.elements.dashboard_color_fees) form.elements.dashboard_color_fees.value = state.settings.dashboard_color_fees || colors.fees;
    if (form.elements.dashboard_color_balance) form.elements.dashboard_color_balance.value = state.settings.dashboard_color_balance || colors.balance;
    if (form.elements.dashboard_color_shopify) form.elements.dashboard_color_shopify.value = state.settings.dashboard_color_shopify || colors.shopify;
    if (form.elements.dashboard_color_etsy) form.elements.dashboard_color_etsy.value = state.settings.dashboard_color_etsy || colors.etsy;
    if (form.elements.dashboard_color_bizum) form.elements.dashboard_color_bizum.value = state.settings.dashboard_color_bizum || colors.bizum;
    if (form.elements.dashboard_color_profit_sales) form.elements.dashboard_color_profit_sales.value = state.settings.dashboard_color_profit_sales || colors.profit_sales;
    if (form.elements.dashboard_color_profit_cost) form.elements.dashboard_color_profit_cost.value = state.settings.dashboard_color_profit_cost || colors.profit_cost;
    if (form.elements.dashboard_color_profit_margin) form.elements.dashboard_color_profit_margin.value = state.settings.dashboard_color_profit_margin || colors.profit_margin;
    if (form.elements.dashboard_color_sales_revenue) form.elements.dashboard_color_sales_revenue.value = state.settings.dashboard_color_sales_revenue || colors.sales_revenue;
    if (form.elements.dashboard_color_sales_orders) form.elements.dashboard_color_sales_orders.value = state.settings.dashboard_color_sales_orders || colors.sales_orders;
    if (form.elements.dashboard_color_sales_ticket) form.elements.dashboard_color_sales_ticket.value = state.settings.dashboard_color_sales_ticket || colors.sales_ticket;
    if (form.elements.dashboard_color_sales_previous) form.elements.dashboard_color_sales_previous.value = state.settings.dashboard_color_sales_previous || colors.sales_previous;
    if (form.elements.dashboard_color_margin_critical) form.elements.dashboard_color_margin_critical.value = state.settings.dashboard_color_margin_critical || colors.margin_critical;
    if (form.elements.dashboard_color_margin_pressure) form.elements.dashboard_color_margin_pressure.value = state.settings.dashboard_color_margin_pressure || colors.margin_pressure;
    if (form.elements.dashboard_color_margin_healthy) form.elements.dashboard_color_margin_healthy.value = state.settings.dashboard_color_margin_healthy || colors.margin_healthy;
    if (form.elements.dashboard_color_cost_content) form.elements.dashboard_color_cost_content.value = state.settings.dashboard_color_cost_content || colors.cost_content;
    if (form.elements.dashboard_color_cost_fixed) form.elements.dashboard_color_cost_fixed.value = state.settings.dashboard_color_cost_fixed || colors.cost_fixed;
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
    const businessSections = ["general", "dashboard", "cobros"];
    const businessMode = businessSections.includes(state.settingsSection);
    $$(".settings-section").forEach((section) => {
      const panel = section.dataset.settingsPanel;
      section.classList.toggle("hidden", businessMode ? !businessSections.includes(panel) : panel !== state.settingsSection);
    });
    if ($("#technicalLogLevel")) $("#technicalLogLevel").value = state.technicalLogLevel || "relevant";
    $("#settingsSubmitRow")?.classList.toggle("hidden", ["shopify", "diagnostico", "logs"].includes(state.settingsSection));
    renderSettingsStatusStrip();
    renderSettingsContextLatest();
    renderSystemHealthLatest();
    renderTechnicalLogsModern();
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

    const resources = [
      ["products", "Catálogo", "icon-tag", connection.pull_products],
      ["inventory", "Inventario", "icon-cube", connection.pull_inventory],
      ["orders", "Pedidos", "icon-kit", connection.pull_orders],
      ["payouts", "Payouts", "icon-wallet", connection.pull_payouts]
    ];
    statusNode.innerHTML = `
      <div class="settings-sync-table-head"><span>Recurso</span><span>Estado</span><span>Registros</span><span>Duración</span></div>
      ${resources.map(([key, label, iconName, active]) => {
        const result = summary && typeof summary === "object" ? summary[key] : null;
        const rowStatus = !active ? "Desactivado" : result?.status === "ok" ? "OK" : status.running ? "En curso" : "Pendiente";
        const tone = !active ? "muted" : result?.status === "ok" ? "ok" : status.running ? "warn" : "muted";
        return `
          <article class="settings-sync-row">
            <div>${icon(iconName)}<span><strong>${label}</strong><small>${active ? "Incluido en el alcance" : "Fuera del alcance"}</small></span></div>
            <span>${badge(rowStatus, tone)}</span>
            <strong>${result ? `${result.created ?? 0} nuevas · ${result.updated ?? 0} act.` : "-"}</strong>
            <span>${result?.duration_ms != null ? `${result.duration_ms} ms` : "-"}</span>
          </article>
        `;
      }).join("")}
      <div class="settings-sync-foot"><span>${connection.store_domain ? text(connection.store_domain) : "Sin dominio"} · API ${text(connection.api_version || "2026-01")}</span><strong>${status.last_sync_at ? `Última sync ${formatAuditTimestamp(status.last_sync_at)}` : "Sin sincronización"}</strong></div>
    `;
    renderSettingsStatusStrip();
    renderSettingsContextLatest();
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
    renderSettingsContextLatest();
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

  function renderTechnicalLogsModern() {
    const summary = $("#technicalLogSummary");
    const list = $("#technicalLogList");
    if (!summary || !list) return;
    const { source, level, query: queryText, from, to } = technicalLogFilterValues();
    let rows = [...(state.technicalAudit || [])].filter((row) => {
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
    const logRows = meta.rows.map((row) => {
      const rowLevel = technicalLogLevel(row);
      const rowSource = technicalLogSource(row);
      const context = technicalLogContext(row);
      return `
        <article class="settings-log-row">
          <span><strong>${formatAuditTimestamp(row.created_at)}</strong><small>${text(row.actor || "Sistema")}</small></span>
          <span><b class="settings-log-level tone-${rowLevel}">${text(ctx.TECHNICAL_LOG_LEVELS?.[rowLevel] || rowLevel)}</b></span>
          <span><b class="settings-log-source">${text(rowSource === "client" ? "Cliente" : rowSource === "system" ? "Sistema" : "Shopify")}</b></span>
          <span><strong>${text(ctx.auditActionLabel ? ctx.auditActionLabel(row.action) : row.action)}</strong><small>${Object.keys(context).length ? "Contexto disponible" : "Evento registrado"}</small></span>
          <span class="settings-log-message">${text(technicalLogMessage(row))}</span>
          <span><button type="button" class="ghost" data-copy-technical-log="${row.id}">${icon("icon-copy")}Copiar</button></span>
        </article>
      `;
    }).join("");
    list.innerHTML = logRows ? `
      <div class="settings-log-head">
        <span>Fecha y hora</span><span>Nivel</span><span>Origen</span><span>Acción / Evento</span><span>Mensaje</span><span>Acciones</span>
      </div>
      ${logRows}
    ` : `<div class="empty-state"><strong>Sin eventos técnicos visibles</strong>Ajusta el nivel, el origen o la búsqueda para ampliar la vista.</div>`;
    ctx.renderPagination("#technicalLogPagination", "technicalLogs", meta);
    renderSettingsContextLatest();
  }

  function renderSystemHealthModern() {
    const health = state.systemHealth;
    const cards = $("#systemHealthCards");
    const summary = $("#systemHealthSummary");
    const backups = $("#systemHealthBackups");
    const incidents = $("#systemHealthIncidents");
    const schema = $("#systemHealthSchema");
    const shopify = $("#systemHealthShopify");
    const qa = $("#systemHealthQa");
    if (!cards || !summary || !backups || !incidents || !schema || !shopify || !qa) return;
    if (!health) {
      cards.innerHTML = "";
      summary.textContent = "Diagnostico no disponible.";
      backups.innerHTML = "";
      incidents.innerHTML = "";
      schema.innerHTML = "";
      shopify.innerHTML = "";
      qa.innerHTML = "";
      return;
    }

    const queueState = shopifySyncStateFromHealth(health);
    cards.innerHTML = [
      ["Base de datos", health.database?.exists && health.database?.integrity === "ok", "icon-cube", health.database?.integrity === "ok" ? "Integridad OK" : (health.database?.integrity || "Sin comprobar")],
      ["Migraciones", (health.schema?.pending_migrations || []).length === 0, "icon-activity", (health.schema?.pending_migrations || []).length ? `${health.schema.pending_migrations.length} pendientes` : "Sin pendientes"],
      ["Backups", Boolean(health.backups?.latest), "icon-save", health.backups?.latest ? formatAuditTimestamp(health.backups.latest.created_at) : "Sin backup"],
      ["Shopify API", health.shopify?.last_sync_status === "ok" || !(health.shopify?.credentials_configured || health.shopify?.token_configured), "icon-channel-shopify", health.shopify?.credentials_configured || health.shopify?.token_configured ? (health.shopify?.last_sync_status || "Sin sync") : "No configurado"],
      ["Storage", Boolean(health.uploads?.exists), "icon-file", health.uploads?.exists ? "Uploads accesibles" : "Sin carpeta de uploads"],
      ["Colas / jobs", !queueState.hasFailures, "icon-refresh", queueState.label]
    ].map(([label, ok, iconName, hint]) => `
      <article class="settings-health-tile ${ok ? "is-ok" : "is-warn"}">
        <span>${icon(iconName)}</span>
        <strong>${label}</strong>
        <b>${ok ? "OK" : "Revisar"}</b>
        <small>${text(hint)}</small>
      </article>
    `).join("");

    summary.innerHTML = `
      <div class="settings-diagnostics-hero ${health.ok ? "is-ok" : "is-warn"}">
        <span>${icon(health.ok ? "icon-check-circle" : "icon-alert")}</span>
        <div>
          <strong>${health.ok ? "Operacion estable" : "Hay senales para revisar"}</strong>
          <small>DB ${text(health.database?.path || "-")} · ${formatBytes(health.database?.size_bytes || 0)} · actualizada ${text(health.database?.updated_at || "-")}</small>
        </div>
      </div>
    `;

    backups.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Ultimo backup disponible</strong>
        <div class="meta">Carpeta · ${text(health.backups?.directory || "-")}</div>
        ${health.backups?.latest ? `
          <div class="diagnostics-inline-grid">
            <span><small>Fecha</small><b>${text(health.backups.latest.created_at || "-")}</b></span>
            <span><small>Tamano</small><b>${formatBytes(health.backups.latest.size_bytes || 0)}</b></span>
            <span><small>Estado</small><b>Disponible</b></span>
          </div>
          <code>${text(health.backups.latest.name || "")}</code>
        ` : `<div class="meta">Todavia no existe una copia registrada.</div>`}
      </article>
    `;

    const recentErrors = (state.technicalAudit || []).filter((row) => technicalLogLevel(row) === "error");
    const recentWarnings = (state.technicalAudit || []).filter((row) => technicalLogLevel(row) === "warn");
    const latestIncident = [...(state.technicalAudit || [])]
      .filter((row) => ["error", "warn"].includes(technicalLogLevel(row)))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];

    incidents.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Incidencias recientes</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Errores</small><b>${recentErrors.length}</b></span>
          <span><small>Warnings</small><b>${recentWarnings.length}</b></span>
          <span><small>Ultima</small><b>${latestIncident ? formatAuditTimestamp(latestIncident.created_at) : "Sin incidencias"}</b></span>
        </div>
        <div class="meta">${latestIncident ? text(technicalLogMessage(latestIncident)) : "El sistema no ha registrado errores o warnings recientes."}</div>
      </article>
    `;

    schema.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Migraciones y estructura</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Aplicadas</small><b>${(health.schema?.applied_migrations || []).length}</b></span>
          <span><small>Esperadas</small><b>${(health.schema?.expected_migrations || []).length}</b></span>
          <span><small>Pendientes</small><b>${(health.schema?.pending_migrations || []).length}</b></span>
        </div>
        <div class="settings-health-checklist">
          <div class="${health.database?.exists ? "is-ok" : "is-warn"}"><span>${icon(health.database?.exists ? "icon-check-circle" : "icon-alert")}</span><strong>Base de datos</strong><small>${health.database?.exists ? "Disponible" : "No encontrada"}</small></div>
          <div class="${health.uploads?.exists ? "is-ok" : "is-warn"}"><span>${icon(health.uploads?.exists ? "icon-check-circle" : "icon-alert")}</span><strong>Storage</strong><small>${health.uploads?.exists ? "Uploads accesibles" : "Sin carpeta"}</small></div>
          <div class="${(health.schema?.pending_migrations || []).length ? "is-warn" : "is-ok"}"><span>${icon((health.schema?.pending_migrations || []).length ? "icon-alert" : "icon-check-circle")}</span><strong>Migraciones</strong><small>${(health.schema?.pending_migrations || []).length ? `${health.schema.pending_migrations.length} pendientes` : "Todo al dia"}</small></div>
        </div>
        ${(health.schema?.applied_migrations || []).slice(-4).map((row) => `<code>${text(row.id)} · ${text(row.applied_at || "")}</code>`).join("")}
      </article>
    `;

    shopify.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Sincronizacion Shopify</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Dominio</small><b>${text(health.shopify?.store_domain || "Sin configurar")}</b></span>
          <span><small>Estado</small><b>${text(health.shopify?.last_sync_status || "Sin sync")}</b></span>
          <span><small>Ultima sync</small><b>${text(health.shopify?.last_sync_at || "Nunca")}</b></span>
        </div>
        ${(health.shopify?.last_sync_summary && typeof health.shopify.last_sync_summary === "object")
          ? Object.entries(health.shopify.last_sync_summary)
              .filter(([key, value]) => ["products", "inventory", "orders", "payouts"].includes(key) && value)
              .map(([key, value]) => `<code>${text(key)} · ${value.status || "ok"} · ${value.duration_ms || 0} ms</code>`)
              .join("")
          : ""}
      </article>
    `;

    const testHealth = state.systemTestHealth || { status: "unknown", suites: [], summary: "Sin ejecuciones registradas" };
    qa.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Verificacion automatica</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Estado</small><b>${text(testHealth.status || "unknown")}</b></span>
          <span><small>Ultima ejecucion</small><b>${text(testHealth.last_run_at ? formatAuditTimestamp(testHealth.last_run_at) : "Nunca")}</b></span>
          <span><small>Duracion</small><b>${testHealth.duration_ms ? `${Math.round(testHealth.duration_ms / 1000)} s` : "-"}</b></span>
        </div>
        <div class="meta">${text(testHealth.summary || "Sin ejecuciones registradas")}</div>
        <div class="settings-health-checklist">
          ${(testHealth.suites || []).map((suite) => `<div class="${suite.status === "ok" ? "is-ok" : "is-warn"}"><span>${icon(suite.status === "ok" ? "icon-check-circle" : "icon-alert")}</span><strong>${text(suite.label)}</strong><small>${suite.duration_ms ? `${Math.round(suite.duration_ms / 1000)} s` : suite.status}</small></div>`).join("")}
        </div>
        <div class="row-actions">
          <button type="button" class="ghost" data-run-system-tests ${testHealth.running ? "disabled" : ""}>${testHealth.running ? "Ejecutando..." : "Lanzar tests"}</button>
        </div>
      </article>
    `;
    renderSettingsContextLatest();
  }

  function renderSystemHealthLatest() {
    const health = state.systemHealth;
    const cards = $("#systemHealthCards");
    const summary = $("#systemHealthSummary");
    const backups = $("#systemHealthBackups");
    const incidents = $("#systemHealthIncidents");
    const schema = $("#systemHealthSchema");
    const shopify = $("#systemHealthShopify");
    const qa = $("#systemHealthQa");
    if (!cards || !summary || !backups || !incidents || !schema || !shopify || !qa) return;
    if (!health) {
      cards.innerHTML = "";
      summary.textContent = "Diagnostico no disponible.";
      backups.innerHTML = "";
      incidents.innerHTML = "";
      schema.innerHTML = "";
      shopify.innerHTML = "";
      qa.innerHTML = "";
      return;
    }

    const queueState = shopifySyncStateFromHealth(health);
    cards.innerHTML = [
      ["Base de datos", health.database?.exists && health.database?.integrity === "ok", "icon-cube", health.database?.integrity === "ok" ? "Integridad OK" : (health.database?.integrity || "Sin comprobar")],
      ["Migraciones", (health.schema?.pending_migrations || []).length === 0, "icon-activity", (health.schema?.pending_migrations || []).length ? `${health.schema.pending_migrations.length} pendientes` : "Sin pendientes"],
      ["Backups", Boolean(health.backups?.latest), "icon-save", health.backups?.latest ? formatAuditTimestamp(health.backups.latest.created_at) : "Sin backup"],
      ["Shopify API", health.shopify?.last_sync_status === "ok" || !(health.shopify?.credentials_configured || health.shopify?.token_configured), "icon-channel-shopify", health.shopify?.credentials_configured || health.shopify?.token_configured ? (health.shopify?.last_sync_status || "Sin sync") : "No configurado"],
      ["Storage", Boolean(health.uploads?.exists), "icon-file", health.uploads?.exists ? "Uploads accesibles" : "Sin carpeta de uploads"],
      ["Colas / jobs", !queueState.hasFailures, "icon-refresh", queueState.label]
    ].map(([label, ok, iconName, hint]) => `
      <article class="settings-health-tile ${ok ? "is-ok" : "is-warn"}">
        <span>${icon(iconName)}</span>
        <strong>${label}</strong>
        <b>${ok ? "OK" : "Revisar"}</b>
        <small>${text(hint)}</small>
      </article>
    `).join("");

    summary.innerHTML = `
      <div class="settings-diagnostics-hero ${health.ok ? "is-ok" : "is-warn"}">
        <span>${icon(health.ok ? "icon-check-circle" : "icon-alert")}</span>
        <div>
          <strong>${health.ok ? "Operacion estable" : "Hay senales para revisar"}</strong>
          <small>${health.ok ? "La base operativa responde y no hay bloqueos estructurales detectados." : "Conviene revisar los avisos antes de seguir con cambios o sincronizaciones."}</small>
        </div>
      </div>
    `;

    backups.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Ultimo backup disponible</strong>
        <div class="meta">${text(health.backups?.directory || "-")}</div>
        ${health.backups?.latest ? `
          <div class="diagnostics-inline-grid">
            <span><small>Fecha</small><b>${text(health.backups.latest.created_at || "-")}</b></span>
            <span><small>Tamano</small><b>${formatBytes(health.backups.latest.size_bytes || 0)}</b></span>
            <span><small>Base de datos</small><b>${formatBytes(health.database?.size_bytes || 0)}</b></span>
          </div>
          <code>${text(health.backups.latest.name || "")}</code>
        ` : `<div class="meta">Todavia no existe una copia registrada.</div>`}
      </article>
    `;

    const recentErrors = (state.technicalAudit || []).filter((row) => technicalLogLevel(row) === "error");
    const recentWarnings = (state.technicalAudit || []).filter((row) => technicalLogLevel(row) === "warn");
    const latestIncident = [...(state.technicalAudit || [])]
      .filter((row) => ["error", "warn"].includes(technicalLogLevel(row)))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];

    incidents.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Incidencias recientes</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Errores</small><b>${recentErrors.length}</b></span>
          <span><small>Warnings</small><b>${recentWarnings.length}</b></span>
          <span><small>Ultimo aviso</small><b>${latestIncident ? formatAuditTimestamp(latestIncident.created_at) : "Sin incidencias"}</b></span>
        </div>
        <div class="meta">${latestIncident ? text(technicalLogMessage(latestIncident)) : "El sistema no ha registrado errores o warnings recientes."}</div>
      </article>
    `;

    schema.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Migraciones y estructura</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Aplicadas</small><b>${(health.schema?.applied_migrations || []).length}</b></span>
          <span><small>Esperadas</small><b>${(health.schema?.expected_migrations || []).length}</b></span>
          <span><small>Pendientes</small><b>${(health.schema?.pending_migrations || []).length}</b></span>
        </div>
        <div class="settings-health-checklist">
          <div class="${health.database?.exists ? "is-ok" : "is-warn"}"><span>${icon(health.database?.exists ? "icon-check-circle" : "icon-alert")}</span><strong>Base de datos</strong><small>${health.database?.exists ? "Disponible" : "No encontrada"}</small></div>
          <div class="${health.uploads?.exists ? "is-ok" : "is-warn"}"><span>${icon(health.uploads?.exists ? "icon-check-circle" : "icon-alert")}</span><strong>Storage</strong><small>${health.uploads?.exists ? "Uploads accesibles" : "Sin carpeta"}</small></div>
          <div class="${(health.schema?.pending_migrations || []).length ? "is-warn" : "is-ok"}"><span>${icon((health.schema?.pending_migrations || []).length ? "icon-alert" : "icon-check-circle")}</span><strong>Migraciones</strong><small>${(health.schema?.pending_migrations || []).length ? `${health.schema.pending_migrations.length} pendientes` : "Todo al dia"}</small></div>
        </div>
        ${(health.schema?.applied_migrations || []).slice(-4).map((row) => `<code>${text(row.id)} · ${text(row.applied_at || "")}</code>`).join("")}
      </article>
    `;

    shopify.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Sincronizacion Shopify</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Dominio</small><b>${text(health.shopify?.store_domain || "Sin configurar")}</b></span>
          <span><small>Estado</small><b>${text(health.shopify?.last_sync_status || "Sin sync")}</b></span>
          <span><small>Ultima sync</small><b>${text(health.shopify?.last_sync_at || "Nunca")}</b></span>
        </div>
        <div class="meta">${health.shopify?.sync_enabled ? "Sincronizacion automatica activa." : "Sincronizacion automatica desactivada; solo manual."}</div>
        ${(health.shopify?.last_sync_summary && typeof health.shopify.last_sync_summary === "object")
          ? Object.entries(health.shopify.last_sync_summary)
              .filter(([key, value]) => ["products", "inventory", "orders", "payouts"].includes(key) && value)
              .map(([key, value]) => `<code>${text(key)} · ${value.status || "ok"} · ${value.duration_ms || 0} ms</code>`)
              .join("")
          : ""}
      </article>
    `;

    const testHealth = state.systemTestHealth || { status: "unknown", suites: [], history: [], summary: "Sin ejecuciones registradas" };
    const lastFailingSuite = (testHealth.suites || []).find((suite) => suite.status !== "ok");
    const coverage = testHealth.coverage;
    const coverageTone = coverage?.lines?.pct >= 90 ? "is-ok" : coverage?.lines?.pct >= 75 ? "is-warn" : "";
    const coverageHeadline = coverage
      ? coverage.lines?.pct >= 90 ? "Cobertura backend solida"
        : coverage.lines?.pct >= 75 ? "Cobertura backend util"
          : "Cobertura backend insuficiente"
      : "Cobertura pendiente";
    qa.innerHTML = `
      <article class="diagnostics-row diagnostics-row-compact">
        <strong>Salud de regresion</strong>
        <div class="diagnostics-inline-grid">
          <span><small>Estado</small><b>${text(testHealth.status || "unknown")}</b></span>
          <span><small>Ultima ejecucion</small><b>${text(testHealth.last_run_at ? formatAuditTimestamp(testHealth.last_run_at) : "Nunca")}</b></span>
          <span><small>Duracion</small><b>${testHealth.duration_ms ? `${Math.round(testHealth.duration_ms / 1000)} s` : "-"}</b></span>
        </div>
        <div class="meta">${text(testHealth.summary || "Sin ejecuciones registradas")}</div>
        <div class="settings-health-checklist">
          ${(testHealth.suites || []).map((suite) => `<div class="${suite.status === "ok" ? "is-ok" : "is-warn"}"><span>${icon(suite.status === "ok" ? "icon-check-circle" : "icon-alert")}</span><strong>${text(suite.label)}</strong><small>${suite.duration_ms ? `${Math.round(suite.duration_ms / 1000)} s` : suite.status}</small></div>`).join("")}
        </div>
        ${coverage ? `
          <div class="meta">${coverageHeadline}. La señal de referencia es la cobertura de líneas; por debajo de 90% conviene vigilar regresiones con más cuidado.</div>
          <div class="settings-health-checklist">
            <div class="${coverageTone}"><span>${icon("icon-chart")}</span><strong>Cobertura backend</strong><small>${coverage.lines?.pct?.toFixed(1) || "0.0"}% lineas</small></div>
            <div><span>${icon("icon-activity")}</span><strong>Branches</strong><small>${coverage.branches?.pct?.toFixed(1) || "0.0"}%</small></div>
            <div><span>${icon("icon-check-circle")}</span><strong>Funciones</strong><small>${coverage.functions?.pct?.toFixed(1) || "0.0"}%</small></div>
            <div><span>${icon("icon-file")}</span><strong>Statements</strong><small>${coverage.statements?.pct?.toFixed(1) || "0.0"}%</small></div>
          </div>
          <div class="meta">La cobertura resume la suite API instrumentada; el smoke UI sigue siendo una señal de regresión funcional, no de cobertura. Las syncs manuales de Shopify disparan esta verificación en segundo plano.</div>
        ` : `<div class="meta">Todavia no hay resumen de cobertura generado.</div>`}
        ${lastFailingSuite ? `<div class="meta">Bloqueo actual: ${text(lastFailingSuite.label)}.</div>` : ""}
        ${(testHealth.history || []).length ? `
          <div class="settings-health-run-history">
            ${(testHealth.history || []).slice(0, 4).map((run) => `
              <article class="settings-health-run ${run.status === "ok" ? "is-ok" : "is-warn"}">
                <strong>${run.status === "ok" ? "OK" : "Fallo"}</strong>
                <small>${text(run.last_run_at ? formatAuditTimestamp(run.last_run_at) : "-")}</small>
                <b>${run.coverage?.lines_pct != null ? `${run.coverage.lines_pct.toFixed(0)}% cov.` : (run.duration_ms ? `${Math.round(run.duration_ms / 1000)} s` : "-")}</b>
              </article>
            `).join("")}
          </div>
        ` : ""}
        <div class="row-actions">
          <button type="button" class="ghost" data-copy-system-tests>${icon("icon-copy")}Copiar detalle</button>
          <button type="button" class="ghost" data-run-system-tests ${testHealth.running ? "disabled" : ""}>${testHealth.running ? "Ejecutando..." : "Ejecutar verificacion"}</button>
        </div>
      </article>
    `;
    renderSettingsContextLatest();
  }

  function shopifySyncStateFromHealth(health) {
    const summary = health?.shopify?.last_sync_summary;
    if (!summary || typeof summary !== "object") return { hasFailures: false, label: "Sin fallos recientes" };
    const failed = Object.entries(summary)
      .filter(([key, value]) => ["products", "inventory", "orders", "payouts"].includes(key) && value && value.status && value.status !== "ok");
    return failed.length ? { hasFailures: true, label: `${failed.length} bloqueos detectados` } : { hasFailures: false, label: "Sin tareas fallidas" };
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  return {
    renderSettings,
    renderShopifyConnection,
    renderSystemHealth: renderSystemHealthLatest,
    renderTechnicalLogs: renderTechnicalLogsModern,
    technicalLogFilterValues
  };
}
