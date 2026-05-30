export function createAuditViews(ctx) {
  const {
    state,
    $,
    $$,
    api,
    text,
    badge,
    auditActionLabel,
    auditEntityLabel,
    auditEntityTitle,
    auditSummary,
    auditJump,
    parseAuditJson,
    AUDIT_LANE_ENTITIES,
    formatAuditTimestamp,
    paginateRows,
    renderPagination
  } = ctx;

  async function loadAudit() {
    const params = new URLSearchParams({
      scope: "business",
      entity: $("#auditEntity").value || "",
      action: $("#auditAction").value || "",
      id: $("#auditId").value || "",
      q: $("#auditQuery").value || "",
      from: $("#auditFrom").value || "",
      to: $("#auditTo").value || "",
      limit: "200"
    });
    let rows = await api(`/api/audit-log?${params.toString()}`);
    const lane = state.auditLane || "all";
    const allowedEntities = AUDIT_LANE_ENTITIES?.[lane] || [];
    if (allowedEntities.length) rows = rows.filter((row) => allowedEntities.includes(row.entity_type));
    const laneLabels = {
      all: "toda la actividad de negocio",
      invoices: "facturas",
      income: "ingresos",
      materials: "materiales y kits",
      suppliers: "proveedores"
    };
    const meta = paginateRows("audit", rows);
    $("#auditSummary").textContent = meta.total
      ? `${meta.total} eventos en ${laneLabels[lane] || "actividad"}. Mostrando ${meta.startIndex + 1}-${meta.endIndex}.`
      : `Sin actividad reciente en ${laneLabels[lane] || "esta vista"}.`;
    $("#auditList").innerHTML = meta.rows.map((row) => {
      const before = parseAuditJson(row.before_json);
      const after = parseAuditJson(row.after_json);
      const jump = auditJump(row, before, after);
      return `
        <article class="audit-card">
          <div class="audit-card-head">
            <div class="row-main">
              <strong>${text(auditEntityTitle(row, before, after))}</strong>
              <div class="meta">${formatAuditTimestamp(row.created_at)} · ${text(row.actor)}</div>
              <div class="tags">
                ${badge(auditEntityLabel(row.entity_type))}
                ${badge(auditActionLabel(row.action), row.action === "archive" ? "warn" : row.action === "restore" || row.action === "create" ? "ok" : "")}
                ${state.auditScope !== "business" && (row.entity_type === "client" || row.entity_type === "shopify_product" || row.entity_type === "system") ? badge("técnico", "warn") : ""}
                ${row.entity_id ? badge(`ID ${row.entity_id}`) : ""}
              </div>
              <div class="audit-note">${text(auditSummary(row, before, after))}</div>
            </div>
            <div class="row-actions slim">
              ${jump ? `<button type="button" ${jump.attrs}>${text(jump.label)}</button>` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("") || `<div class="empty-state"><strong>Sin actividad visible</strong>Prueba con otra ventana, entidad o cambia a la vista técnica.</div>`;
    renderPagination("#auditPagination", "audit", meta);
  }

  function resetAuditFilters() {
    $("#auditQuery").value = "";
    $("#auditEntity").value = "";
    $("#auditAction").value = "";
    $("#auditId").value = "";
    $("#auditFrom").value = "";
    $("#auditTo").value = "";
    state.auditLane = "all";
    $$("#auditLaneTabs button").forEach((button) => button.classList.toggle("is-active", button.dataset.auditLane === state.auditLane));
  }

  return { loadAudit, resetAuditFilters };
}
