export function createAuditViews(ctx) {
  const {
    state,
    $,
    $$,
    api,
    text,
    auditActionLabel,
    auditEntityLabel,
    auditEntityTitle,
    auditSummary,
    auditJump,
    parseAuditJson,
    normalizeAuditField,
    auditDiffFields,
    AUDIT_LANE_ENTITIES,
    formatAuditTimestamp,
    paginateRows,
    renderPagination
  } = ctx;

  let visibleRows = [];
  let allFilteredRows = [];

  const entityIcons = {
    material: "icon-cube",
    supplier: "icon-users",
    invoice: "icon-file",
    invoice_line: "icon-file",
    channel_payout: "icon-chart",
    kit_recipe: "icon-kit",
    kit_recipe_item: "icon-link",
    sales_order: "icon-kit",
    sales_order_line: "icon-link",
    document: "icon-note",
    app_settings: "icon-settings",
    system: "icon-settings",
    shopify_product: "icon-channel-shopify",
    client: "icon-activity"
  };

  function icon(name) {
    return `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  }

  function rowData(row) {
    const before = parseAuditJson(row.before_json);
    const after = parseAuditJson(row.after_json);
    return { before, after, jump: auditJump(row, before, after) };
  }

  function dateValue(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timeLabel(value) {
    const date = dateValue(value);
    if (!date) return text(value || "");
    return text(date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
  }

  function shortDateLabel(value) {
    const date = dateValue(value);
    if (!date) return "";
    return text(date.toLocaleDateString("es-ES", { day: "numeric", month: "short" }));
  }

  function actionTone(action) {
    if (["archive", "exclude_from_cost"].includes(action)) return "danger";
    if (["create", "restore", "include_in_cost"].includes(action)) return "ok";
    if (String(action).includes("import") || String(action).includes("sync")) return "info";
    return "edit";
  }

  function actorInitials(actor) {
    return String(actor || "Sistema").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function formatValue(value) {
    if (value == null || value === "") return "—";
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function isImport(row) {
    return String(row.action || "").includes("import") || String(row.action || "").includes("sync");
  }

  function isCritical(row) {
    const criticalEntity = ["material", "kit_recipe", "kit_recipe_item", "sales_order_line"].includes(row.entity_type);
    return ["archive", "exclude_from_cost"].includes(row.action)
      || String(row.action || "").includes("error")
      || (criticalEntity && auditDiffFields(parseAuditJson(row.before_json), parseAuditJson(row.after_json))
        .some((field) => ["price_per_package", "stock_target_qty", "stock_reorder_point", "supplier_id"].includes(field)));
  }

  function applyQuickFilter(rows) {
    const quick = state.auditQuick || "today";
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (quick === "today") return rows.filter((row) => String(row.created_at || "").slice(0, 10) === today);
    if (quick === "week") return rows.filter((row) => dateValue(row.created_at) >= weekAgo);
    if (quick === "critical") return rows.filter(isCritical);
    if (quick === "archive") return rows.filter((row) => row.action === "archive");
    if (quick === "imports") return rows.filter(isImport);
    return rows;
  }

  function renderKpis(rows) {
    const edits = rows.filter((row) => ["update", "fixed_set_update", "include_in_cost", "exclude_from_cost"].includes(row.action)).length;
    const creations = rows.filter((row) => ["create", "restore"].includes(row.action)).length;
    const archived = rows.filter((row) => row.action === "archive").length;
    const imports = rows.filter(isImport).length;
    const latest = rows[0];
    const cards = [
      ["icon-clock", "Eventos visibles", rows.length, "Según los filtros activos", "accent"],
      ["icon-pencil", "Ediciones", edits, `${rows.length ? Math.round((edits / rows.length) * 100) : 0}% del total`, "edit"],
      ["icon-plus", "Creaciones", creations, `${rows.length ? Math.round((creations / rows.length) * 100) : 0}% del total`, "ok"],
      ["icon-archive", "Archivados", archived, "Cambios reversibles", "warn"],
      ["icon-refresh", "Importaciones", imports, "Shopify y cargas externas", "info"],
      ["icon-activity", "Último cambio", latest ? timeLabel(latest.created_at) : "—", latest ? auditEntityLabel(latest.entity_type) : "Sin actividad", "accent"]
    ];
    $("#auditKpis").innerHTML = cards.map(([iconName, label, value, note, tone]) => `
      <article class="audit-kpi tone-${tone}">
        <span class="audit-kpi-icon">${icon(iconName)}</span>
        <span>
          <small>${text(label)}</small>
          <strong>${text(value)}</strong>
          <em>${text(note)}</em>
        </span>
      </article>
    `).join("");
  }

  function renderLaneCounts(rows) {
    Object.entries(AUDIT_LANE_ENTITIES || {}).forEach(([lane, entities]) => {
      const count = entities.length ? rows.filter((row) => entities.includes(row.entity_type)).length : rows.length;
      const target = $(`[data-audit-count="${lane}"]`);
      if (target) target.textContent = count;
    });
  }

  function renderReview(rows) {
    const reviewItems = [
      { label: "Cambios críticos", note: "Costes, stock y archivados", count: rows.filter(isCritical).length, icon: "icon-alert", quick: "critical", tone: "danger" },
      { label: "Importaciones", note: "Shopify y cargas externas", count: rows.filter(isImport).length, icon: "icon-refresh", quick: "imports", tone: "info" },
      { label: "Elementos archivados", note: "Disponibles para revisión", count: rows.filter((row) => row.action === "archive").length, icon: "icon-archive", quick: "archive", tone: "warn" }
    ];
    $("#auditReviewList").innerHTML = reviewItems.map((item) => `
      <button type="button" class="audit-review-item tone-${item.tone}" data-audit-quick="${item.quick}">
        <span class="audit-review-icon">${icon(item.icon)}</span>
        <span><strong>${text(item.label)}</strong><small>${text(item.note)}</small></span>
        <b>${item.count}</b>
        ${icon("icon-arrow-right")}
      </button>
    `).join("");

    $("#auditRecentList").innerHTML = rows.slice(0, 4).map((row) => {
      const { before, after } = rowData(row);
      return `
        <button type="button" class="audit-recent-item" data-open-audit-detail="${row.id}">
          <span class="audit-review-icon tone-${actionTone(row.action)}">${icon(entityIcons[row.entity_type] || "icon-activity")}</span>
          <span>
            <strong>${text(auditEntityTitle(row, before, after))}</strong>
            <small>${shortDateLabel(row.created_at)} · ${text(auditActionLabel(row.action))}</small>
          </span>
          ${icon("icon-arrow-right")}
        </button>
      `;
    }).join("") || `<div class="empty-state"><strong>Sin actividad reciente</strong>No hay eventos para mostrar.</div>`;
  }

  function renderRow(row) {
    const { before, after, jump } = rowData(row);
    const changed = auditDiffFields(before, after).slice(0, 2).map(normalizeAuditField);
    const detail = changed.length ? changed.join(" · ") : auditSummary(row, before, after);
    return `
      <article class="audit-table-row" data-open-audit-detail="${row.id}" tabindex="0">
        <span class="audit-time-cell"><strong>${timeLabel(row.created_at)}</strong><small>${shortDateLabel(row.created_at)}</small></span>
        <span class="audit-entity-cell">
          <i class="audit-entity-icon tone-${actionTone(row.action)}">${icon(entityIcons[row.entity_type] || "icon-activity")}</i>
          <span><strong>${text(auditEntityLabel(row.entity_type))}</strong><small>${text(auditEntityTitle(row, before, after))}</small></span>
        </span>
        <span><b class="audit-action tone-${actionTone(row.action)}">${text(auditActionLabel(row.action))}</b></span>
        <span class="audit-actor"><i>${text(actorInitials(row.actor))}</i><span>${text(row.actor || "Sistema")}</span></span>
        <span class="audit-change"><strong>${text(detail)}</strong><small>${text(auditSummary(row, before, after))}</small></span>
        <span><b class="audit-id">#${text(row.entity_id || row.id)}</b></span>
        <span class="audit-row-actions">
          ${jump ? `<button type="button" class="ghost" ${jump.attrs}>${text(jump.label)}</button>` : ""}
          <button type="button" class="icon-action" data-open-audit-detail="${row.id}" title="Ver actividad">${icon("icon-eye")}</button>
        </span>
      </article>
    `;
  }

  function renderDetail(row) {
    const panel = $("#auditDetailPanel");
    const overview = $("#auditOverview");
    if (!row || !panel || !overview) return;
    const { before, after, jump } = rowData(row);
    const diffFields = auditDiffFields(before, after);
    const related = allFilteredRows.filter((item) => item.id !== row.id && item.entity_type === row.entity_type && item.entity_id === row.entity_id).slice(0, 5);
    const historyRows = allFilteredRows.slice(0, 12);
    overview.classList.add("hidden");
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <header class="audit-detail-head">
        <div>
          <span class="domain-kicker">Sistema / Actividad</span>
          <h2>${text(auditEntityTitle(row, before, after))}</h2>
          <p>${text(auditActionLabel(row.action))} · ${formatAuditTimestamp(row.created_at)}</p>
          <div class="audit-detail-tags">
            <span>${icon(entityIcons[row.entity_type] || "icon-activity")}${text(auditEntityLabel(row.entity_type))}</span>
            <span>${icon("icon-pencil")}${text(auditActionLabel(row.action))}</span>
            <span>${icon("icon-hash")}ID ${text(row.entity_id || row.id)}</span>
            <span>${icon("icon-users")}${text(row.actor || "Sistema")}</span>
          </div>
        </div>
        <div class="audit-detail-actions">
          ${jump ? `<button type="button" class="ghost" ${jump.attrs}>${text(jump.label)}${icon("icon-arrow-right")}</button>` : ""}
          <button type="button" class="ghost" data-close-audit-detail>${icon("icon-x")}Cerrar</button>
        </div>
      </header>

      <div class="audit-detail-layout">
        <aside class="audit-detail-history">
          <section class="audit-detail-panel">
            <div class="audit-section-head"><div><h3>Actividad</h3><p>Eventos recientes del sistema.</p></div></div>
            <div class="audit-history-list">
              ${historyRows.map((item) => {
                const data = rowData(item);
                return `
                  <button type="button" class="${Number(item.id) === Number(row.id) ? "is-active" : ""}" data-open-audit-detail="${item.id}">
                    <span class="audit-history-time">${timeLabel(item.created_at)}</span>
                    <span class="audit-review-icon tone-${actionTone(item.action)}">${icon(entityIcons[item.entity_type] || "icon-activity")}</span>
                    <span><strong>${text(auditActionLabel(item.action))}</strong><small>${text(auditEntityTitle(item, data.before, data.after))}</small></span>
                    <b>#${text(item.entity_id || item.id)}</b>
                  </button>
                `;
              }).join("")}
            </div>
          </section>
        </aside>
        <main class="audit-detail-main">
          <section class="audit-detail-panel audit-diff-panel">
            <div class="audit-section-head"><div><h3>Cambios detectados</h3><p>Comparación de valores antes y después del evento.</p></div><b>${diffFields.length}</b></div>
            <div class="audit-diff-head"><span>Campo</span><span>Antes</span><span></span><span>Después</span></div>
            <div class="audit-diff-list">
              ${diffFields.map((field) => `
                <div class="audit-diff-row">
                  <span><strong>${text(normalizeAuditField(field))}</strong><small>${text(typeof (after?.[field] ?? before?.[field]))}</small></span>
                  <span class="audit-before">${text(formatValue(before?.[field]))}</span>
                  <span>${icon("icon-arrow-right")}</span>
                  <span class="audit-after">${text(formatValue(after?.[field]))}</span>
                </div>
              `).join("") || `<div class="empty-state"><strong>Sin diferencias de campos</strong>${text(auditSummary(row, before, after))}</div>`}
            </div>
          </section>

          <div class="audit-detail-lower">
            <section class="audit-detail-panel">
              <div class="audit-section-head"><div><h3>Detalles del evento</h3><p>Contexto registrado en el sistema.</p></div></div>
              <dl class="audit-event-details">
                <div><dt>Entidad</dt><dd>${text(auditEntityLabel(row.entity_type))}</dd></div>
                <div><dt>Acción</dt><dd>${text(auditActionLabel(row.action))}</dd></div>
                <div><dt>Actor</dt><dd>${text(row.actor || "Sistema")}</dd></div>
                <div><dt>Fecha y hora</dt><dd>${formatAuditTimestamp(row.created_at)}</dd></div>
                <div><dt>ID de evento</dt><dd>#${text(row.id)}</dd></div>
                <div><dt>ID de entidad</dt><dd>#${text(row.entity_id || "—")}</dd></div>
              </dl>
            </section>
            <section class="audit-detail-panel">
              <div class="audit-section-head"><div><h3>Resumen</h3><p>Lectura rápida del impacto registrado.</p></div></div>
              <div class="audit-impact-card tone-${actionTone(row.action)}">
                <span>${icon(entityIcons[row.entity_type] || "icon-activity")}</span>
                <div><strong>${text(auditSummary(row, before, after))}</strong><p>${diffFields.length ? `${diffFields.length} campo(s) modificados.` : "Evento sin cambios de campos comparables."}</p></div>
              </div>
            </section>
          </div>

          <section class="audit-detail-panel audit-raw-panel">
            <div class="audit-section-head"><div><h3>Datos técnicos</h3><p>Información original conservada para auditoría.</p></div></div>
            <details><summary>before_json</summary><pre>${text(JSON.stringify(before, null, 2) || "Sin datos")}</pre></details>
            <details><summary>after_json</summary><pre>${text(JSON.stringify(after, null, 2) || "Sin datos")}</pre></details>
          </section>
        </main>
        <aside class="audit-detail-side">
          <section class="audit-detail-panel">
            <div class="audit-section-head"><div><h3>Actividad relacionada</h3><p>Misma entidad y referencia.</p></div></div>
            <div class="audit-related-list">
              ${related.map((item) => `
                <button type="button" data-open-audit-detail="${item.id}">
                  <span>${icon(entityIcons[item.entity_type] || "icon-activity")}</span>
                  <span><strong>${text(auditActionLabel(item.action))}</strong><small>${formatAuditTimestamp(item.created_at)}</small></span>
                  ${icon("icon-arrow-right")}
                </button>
              `).join("") || `<div class="empty-state"><strong>Sin eventos relacionados</strong>Este es el único evento visible para la entidad.</div>`}
            </div>
          </section>
        </aside>
      </div>
    `;
  }

  async function loadAudit() {
    const params = new URLSearchParams({
      scope: "business",
      entity: $("#auditEntity").value || "",
      action: $("#auditAction").value || "",
      id: $("#auditId").value || "",
      q: $("#auditQuery").value || "",
      from: $("#auditFrom").value || "",
      to: $("#auditTo").value || "",
      limit: "500"
    });
    const fetchedRows = await api(`/api/audit-log?${params.toString()}`);
    allFilteredRows = fetchedRows;
    renderKpis(fetchedRows);
    renderLaneCounts(fetchedRows);
    renderReview(fetchedRows);

    const lane = state.auditLane || "all";
    const allowedEntities = AUDIT_LANE_ENTITIES?.[lane] || [];
    let rows = allowedEntities.length ? fetchedRows.filter((row) => allowedEntities.includes(row.entity_type)) : fetchedRows;
    rows = applyQuickFilter(rows);
    visibleRows = rows;
    const meta = paginateRows("audit", rows);
    $("#auditSummary").textContent = meta.total
      ? `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.total} eventos filtrados.`
      : "Sin actividad para los filtros seleccionados.";
    $("#auditUpdatedAt").textContent = `Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    $("#auditList").innerHTML = meta.rows.map(renderRow).join("")
      || `<div class="empty-state"><strong>Sin actividad visible</strong>Ajusta el dominio, la ventana temporal o los filtros.</div>`;
    renderPagination("#auditPagination", "audit", meta);
  }

  function setAuditQuick(value) {
    state.auditQuick = value;
    if (state.pagination?.audit) state.pagination.audit.page = 1;
    $$(".audit-quick-filters [data-audit-quick]").forEach((button) => button.classList.toggle("is-active", button.dataset.auditQuick === value));
    return loadAudit();
  }

  function openAuditDetail(id) {
    state.selectedAuditId = Number(id);
    const row = allFilteredRows.find((item) => Number(item.id) === Number(id)) || visibleRows.find((item) => Number(item.id) === Number(id));
    renderDetail(row);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeAuditDetail() {
    state.selectedAuditId = null;
    $("#auditDetailPanel")?.classList.add("hidden");
    $("#auditOverview")?.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function resetAuditFilters() {
    $("#auditQuery").value = "";
    $("#auditEntity").value = "";
    $("#auditAction").value = "";
    $("#auditId").value = "";
    $("#auditFrom").value = "";
    $("#auditTo").value = "";
    state.auditLane = "all";
    state.auditQuick = "week";
    $$("#auditLaneTabs button").forEach((button) => button.classList.toggle("is-active", button.dataset.auditLane === state.auditLane));
    $$(".audit-quick-filters [data-audit-quick]").forEach((button) => button.classList.toggle("is-active", button.dataset.auditQuick === state.auditQuick));
  }

  return { loadAudit, resetAuditFilters, setAuditQuick, openAuditDetail, closeAuditDetail };
}
