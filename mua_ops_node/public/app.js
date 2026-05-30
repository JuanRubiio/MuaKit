const state = {
  suppliers: [],
  materials: [],
  invoices: [],
  payouts: [],
  incomeSummary: null,
  costs: [],
  kits: [],
  settings: null,
  shopifyConnection: null,
  shopifySyncStatus: null,
  systemHealth: null,
  dashboardFinance: null,
  dashboardSpendView: "suppliers",
  dashboardExpenseTrendView: "total",
  dashboardIncomeTrendView: "cobros",
  dashboardWindowPreset: "all",
  dashboardWindowFrom: "",
  dashboardWindowTo: "",
  dashboardGranularity: "auto",
  auditLane: "all",
  settingsSection: "general",
  dashboardCharts: {},
  selectedInvoiceId: null,
  selectedPayoutId: null,
  selectedCostMaterialId: null,
  invoiceLineFormOpen: false,
  shopifyAutoSyncTimer: null,
  technicalAudit: [],
  technicalLogLevel: "relevant",
  pagination: {
    invoices: { page: 1, pageSize: 20 },
    payouts: { page: 1, pageSize: 20 },
    materials: { page: 1, pageSize: 24 },
    suppliers: { page: 1, pageSize: 20 },
    costs: { page: 1, pageSize: 20 },
    kits: { page: 1, pageSize: 12 },
    audit: { page: 1, pageSize: 20 },
    technicalLogs: { page: 1, pageSize: 20 }
  }
};

const CATEGORIES = ["kit", "joya", "cadena", "topping", "packaging", "consumible", "servicio", "material"];
const INVOICE_CATEGORIES = ["materiales", "envios", "marketing", "software", "servicios", "otros"];
const STATUSES = ["draft", "posted", "paid", "archived"];
const STATUS_LABELS = {
  draft: "Borrador",
  posted: "Contabilizada",
  paid: "Pagada",
  archived: "Archivada"
};
const PAYOUT_STATUSES = ["in_transit", "paid", "executed"];
const PAYOUT_STATUS_LABELS = {
  in_transit: "En tránsito",
  paid: "Pagado",
  executed: "Ejecutado",
  completed: "Completada"
};
const CHANNEL_LABELS = {
  shopify: "Shopify",
  etsy: "Etsy",
  bizum: "Bizum"
};
const DASHBOARD_EXPENSE_LABELS = {
  total: "Gasto total",
  materiales: "Materiales",
  marketing: "Marketing",
  envios: "Envíos"
};
const DASHBOARD_INCOME_LABELS = {
  cobros: "Cobrado neto",
  channel_shopify: "Shopify",
  channel_etsy: "Etsy",
  channel_bizum: "Bizum"
};
const DASHBOARD_TREND_COLORS = {
  total: "#166b5e",
  materiales: "#9f7234",
  marketing: "#b85d72",
  envios: "#4f6d93",
  cobros: "#166b5e",
  fees: "#b85d72",
  channel_shopify: "#166b5e",
  channel_etsy: "#9f7234",
  channel_bizum: "#c18a3a"
};
const MATERIAL_HIERARCHY = [
  { key: "usage_type", label: "Uso", empty: "Todos", materialOnly: false },
  { key: "family", label: "Familia", empty: "Todas", materialOnly: false },
  { key: "subfamily", label: "Subfamilia", empty: "Todas", materialOnly: false },
  { key: "variant", label: "Variante", empty: "Todas", materialOnly: false },
  { key: "base_material", label: "Material", empty: "Todos", materialOnly: false },
  { key: "finish", label: "Acabado", empty: "Todos", materialOnly: false }
];
const AUDIT_ENTITY_LABELS = {
  material: "Material",
  supplier: "Proveedor",
  invoice: "Factura",
  invoice_line: "Línea de factura",
  channel_payout: "Ingreso",
  kit_recipe: "Kit",
  kit_recipe_item: "Material de kit",
  sales_order: "Pedido",
  document: "Documento",
  app_settings: "Configuración",
  system: "Sistema",
  shopify_product: "Shopify",
  client: "Cliente"
};
const AUDIT_ACTION_LABELS = {
  create: "Creación",
  update: "Edición",
  archive: "Archivado",
  restore: "Restauración",
  duplicate: "Duplicado",
  backup_create: "Backup",
  import_create: "Importación",
  import_update: "Actualización importada",
  legacy_import: "Importación histórica",
  shopify_auto_create: "Alta automática Shopify",
  shopify_api_create: "Alta Shopify",
  shopify_api_update: "Actualización Shopify",
  shopify_api_inventory: "Stock Shopify",
  shopify_sync_create: "Alta sincronizada",
  shopify_sync_update: "Actualización sincronizada"
};
const AUDIT_FIELD_LABELS = {
  name: "nombre",
  category: "categoría",
  unit: "unidad",
  status: "estado",
  supplier_id: "proveedor",
  supplier_name: "proveedor",
  invoice_number: "número",
  invoice_date: "fecha",
  total: "total",
  subtotal: "subtotal",
  shipping_fee: "envío",
  tax_amount: "IVA",
  gross_amount: "bruto",
  net_amount: "neto",
  fees_amount: "fees",
  payout_date: "fecha cobro",
  stock_reorder_point: "punto reposición",
  stock_target_qty: "stock objetivo",
  effective_stock_qty: "stock Shopify",
  quantity_per_kit: "cantidad por kit",
  price_per_package: "precio por paquete",
  units_per_package: "ud/paquete",
  package_count: "paquetes",
  is_complete: "completo"
};
const AUDIT_LANE_ENTITIES = {
  all: [],
  invoices: ["invoice", "invoice_line"],
  income: ["channel_payout", "sales_order"],
  materials: ["material", "kit_recipe", "kit_recipe_item"],
  suppliers: ["supplier"]
};
const TECHNICAL_LOG_LEVELS = {
  error: "Error",
  warn: "Warning",
  info: "Info",
  debug: "Debug"
};
const PAGINATION_PAGE_SIZES = [10, 20, 50, 100];
const viewModules = {
  dashboard: null,
  income: null,
  system: null
};

function createViewContext() {
  return {
    state,
    $,
    $$,
    api,
    euro,
    text,
    number,
    lower,
    badge,
    channelLabel,
    payoutStatusLabel,
    setForm,
    chartColors,
    compactTimeline,
    dashboardChart,
    DASHBOARD_EXPENSE_LABELS,
    DASHBOARD_INCOME_LABELS,
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination,
    auditActionLabel,
    formatAuditTimestamp,
    technicalLogLevel,
    technicalLogSource,
    technicalLogMessage,
    technicalLogContext,
    TECHNICAL_LOG_LEVELS
  };
}

async function loadViewModules() {
  const context = createViewContext();
  const [dashboardModule, incomeModule, systemModule] = await Promise.all([
    import("/views-dashboard.mjs"),
    import("/views-income.mjs"),
    import("/views-system.mjs")
  ]);
  viewModules.dashboard = dashboardModule.createDashboardViews(context);
  viewModules.income = incomeModule.createIncomeViews(context);
  viewModules.system = systemModule.createSystemViews(context);
}

function chartColors() {
  const settings = state.settings || {};
  return {
    total: settings.dashboard_color_total || DASHBOARD_TREND_COLORS.total,
    materiales: settings.dashboard_color_materiales || DASHBOARD_TREND_COLORS.materiales,
    marketing: settings.dashboard_color_marketing || DASHBOARD_TREND_COLORS.marketing,
    envios: settings.dashboard_color_envios || DASHBOARD_TREND_COLORS.envios,
    cobros: settings.dashboard_color_cobros || DASHBOARD_TREND_COLORS.cobros,
    fees: settings.dashboard_color_fees || DASHBOARD_TREND_COLORS.fees,
    shopify: settings.dashboard_color_shopify || "#166b5e",
    etsy: settings.dashboard_color_etsy || "#9f7234",
    bizum: settings.dashboard_color_bizum || "#c18a3a",
    channel_shopify: settings.dashboard_color_shopify || "#166b5e",
    channel_etsy: settings.dashboard_color_etsy || "#9f7234",
    channel_bizum: settings.dashboard_color_bizum || "#c18a3a"
  };
}

function ensurePaginationState(key) {
  if (!state.pagination[key]) {
    state.pagination[key] = { page: 1, pageSize: 20 };
  }
  return state.pagination[key];
}

function resetPagination(key) {
  ensurePaginationState(key).page = 1;
}

function paginateRows(key, rows) {
  const pagination = ensurePaginationState(key);
  const total = rows.length;
  const pageSize = Math.max(1, Number(pagination.pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  pagination.page = Math.min(Math.max(1, Number(pagination.page) || 1), totalPages);
  const startIndex = total ? (pagination.page - 1) * pageSize : 0;
  const endIndex = total ? Math.min(total, startIndex + pageSize) : 0;
  return {
    rows: rows.slice(startIndex, endIndex),
    total,
    page: pagination.page,
    pageSize,
    totalPages,
    startIndex,
    endIndex
  };
}

function renderPagination(targetId, key, meta) {
  const node = $(targetId);
  if (!node) return;
  const pageState = ensurePaginationState(key);
  const pageButtons = [];
  const pages = new Set([1, meta.page - 1, meta.page, meta.page + 1, meta.totalPages].filter((value) => value >= 1 && value <= meta.totalPages));
  [...pages]
    .sort((a, b) => a - b)
    .forEach((pageNumber, index, array) => {
      const previous = array[index - 1];
      if (previous && pageNumber - previous > 1) {
        pageButtons.push(`<span class="meta">…</span>`);
      }
      pageButtons.push(`
        <button
          type="button"
          class="ghost ${pageNumber === meta.page ? "is-active" : ""}"
          data-page-target="${key}"
          data-page-number="${pageNumber}"
        >${pageNumber}</button>
      `);
    });
  node.classList.toggle("hidden", meta.total <= meta.pageSize && meta.totalPages <= 1);
  node.innerHTML = `
    <div class="pagination-meta">
      ${meta.total ? `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.total}` : "Sin resultados"}
    </div>
    <div class="pagination-controls">
      <label>Por página
        <select data-page-size-target="${key}">
          ${PAGINATION_PAGE_SIZES.map((size) => `<option value="${size}" ${Number(pageState.pageSize) === size ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <div class="pagination-buttons">
        <button type="button" class="ghost" data-page-target="${key}" data-page-action="prev" ${meta.page <= 1 ? "disabled" : ""}>Anterior</button>
        ${pageButtons.join("")}
        <button type="button" class="ghost" data-page-target="${key}" data-page-action="next" ${meta.page >= meta.totalPages ? "disabled" : ""}>Siguiente</button>
      </div>
    </div>
  `;
}

function rerenderPaginatedSection(key) {
  ({
    invoices: renderInvoices,
    payouts: renderPayouts,
    materials: renderMaterials,
    suppliers: renderSuppliers,
    costs: renderCosts,
    kits: renderKits,
    audit: () => loadAudit().catch((error) => toast(error.message)),
    technicalLogs: renderTechnicalLogs
  }[key] || (() => {}))();
}

function resetForm(id) {
  const form = document.getElementById(id);
  if (!form) return;
  form.reset();
  form.querySelectorAll("input[type=hidden]").forEach((input) => input.value = "");
  if (id === "materialForm") $("#materialFormTitle").textContent = "Nuevo material";
  if (id === "supplierForm") $("#supplierFormTitle").textContent = "Nuevo proveedor";
  if (id === "invoiceForm") $("#invoiceFormTitle").textContent = "Nueva factura";
  if (id === "kitForm") $("#kitFormTitle").textContent = "Nuevo kit";
  if (id === "payoutForm") $("#payoutFormTitle").textContent = "Nuevo ingreso";
  if (id === "lineForm") {
    $("#lineFormTitle").textContent = "Nueva línea";
    form.elements.invoice_id.value = state.selectedInvoiceId || "";
    updateLinePreview();
  }
}

function payoutStatusLabel(value) {
  return PAYOUT_STATUS_LABELS[value] || value;
}

function channelLabel(value) {
  return CHANNEL_LABELS[value] || value;
}

function closeInvoicePanels() {
  $("#invoiceForm")?.classList.add("hidden");
  $("#invoiceDetailPanel")?.classList.add("hidden");
  state.selectedInvoiceId = null;
  state.invoiceLineFormOpen = false;
  renderInvoices();
}

function showInvoiceEditor(invoice = null, keepDetail = false) {
  const form = $("#invoiceForm");
  if (!keepDetail) $("#invoiceDetailPanel")?.classList.add("hidden");
  form.classList.remove("hidden");
  resetForm("invoiceForm");
  if (invoice) {
    setForm(form, invoice);
    $("#invoiceFormTitle").textContent = `Editar factura #${invoice.id}`;
  } else {
    $("#invoiceFormTitle").textContent = "Nueva factura";
    if (state.settings) {
      if (form.elements.status) form.elements.status.value = state.settings.default_invoice_status || "draft";
      if (form.elements.category) form.elements.category.value = state.settings.default_invoice_category || "materiales";
    }
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeMaterialPanels() {
  $("#materialForm")?.classList.add("hidden");
}

function showMaterialEditor(material = null) {
  const form = $("#materialForm");
  const preview = $("#materialFormPreview");
  form.classList.remove("hidden");
  resetForm("materialForm");
  if (material) {
    setForm(form, material);
    $("#materialFormTitle").textContent = `Editar material #${material.id}`;
    const imageUrl = material.image_url || material.image_url_override || "";
    if (preview) {
      if (imageUrl) {
        preview.classList.remove("hidden");
        preview.innerHTML = `
          <div class="material-mini-thumb">${img(imageUrl)}</div>
          <div>
            <strong>${text(material.name)}</strong>
            <div class="tags">
              ${material.category ? badge(material.category) : ""}
              ${material.is_outlet ? badge("outlet", "warn") : ""}
              ${hierarchyParts(material).map((value) => badge(value)).join("")}
            </div>
            <div class="meta">Stock Shopify ${material.effective_stock_qty ?? "-"}</div>
          </div>
        `;
      } else {
        preview.classList.add("hidden");
        preview.innerHTML = "";
      }
    }
  } else {
    $("#materialFormTitle").textContent = "Nuevo material";
    if (preview) {
      preview.classList.add("hidden");
      preview.innerHTML = "";
    }
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSupplierPanels() {
  $("#supplierForm")?.classList.add("hidden");
}

function showSupplierEditor(supplier = null) {
  const form = $("#supplierForm");
  form.classList.remove("hidden");
  resetForm("supplierForm");
  if (supplier) {
    setForm(form, supplier);
    $("#supplierFormTitle").textContent = `Editar proveedor #${supplier.id}`;
  } else {
    $("#supplierFormTitle").textContent = "Nuevo proveedor";
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeKitPanels() {
  $("#kitForm")?.classList.add("hidden");
  $("#kitDetailPanel")?.classList.add("hidden");
}

function closePayoutPanels() {
  $("#payoutForm")?.classList.add("hidden");
  $("#payoutDetailPanel")?.classList.add("hidden");
  state.selectedPayoutId = null;
  renderPayouts();
}

function showKitEditor(kit = null, keepDetail = false) {
  const form = $("#kitForm");
  if (!keepDetail) $("#kitDetailPanel")?.classList.add("hidden");
  form.classList.remove("hidden");
  resetForm("kitForm");
  if (kit) {
    setForm(form, kit);
    $("#kitFormTitle").textContent = `Editar kit #${kit.id}`;
  } else {
    $("#kitFormTitle").textContent = "Nuevo kit";
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPayoutEditor(payout = null, keepDetail = false) {
  const form = $("#payoutForm");
  if (!keepDetail) $("#payoutDetailPanel")?.classList.add("hidden");
  form.classList.remove("hidden");
  resetForm("payoutForm");
  if (payout) {
    setForm(form, payout);
    $("#payoutFormTitle").textContent = `Editar ingreso #${payout.id}`;
  } else {
    $("#payoutFormTitle").textContent = "Nuevo ingreso";
    if (state.settings) {
      if (form.elements.channel) form.elements.channel.value = state.settings.default_payout_channel || "shopify";
      if (form.elements.status) form.elements.status.value = state.settings.default_payout_status || "paid";
      if (form.elements.currency) form.elements.currency.value = state.settings.currency || "EUR";
    }
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function optionList(values, selected = "", first = "") {
  const firstOption = first ? `<option value="">${escapeHtml(first)}</option>` : "";
  return `${firstOption}${values.map((value) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
}

function distinctValues(rows, key) {
  return Array.from(new Set(rows.map((row) => String(row[key] || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

function supplierOptions(selected = "", first = "Sin proveedor") {
  const active = state.suppliers.filter((supplier) => !supplier.is_deleted);
  return `<option value="">${escapeHtml(first)}</option>${active.map((supplier) => `
    <option value="${supplier.id}" ${String(supplier.id) === String(selected) ? "selected" : ""}>${text(supplier.name)}</option>
  `).join("")}`;
}

function materialOptions(selected = "", first = "Sin material") {
  const active = state.materials.filter((material) => !material.is_deleted);
  return `<option value="">${escapeHtml(first)}</option>${active.map((material) => `
    <option value="${material.id}" ${String(material.id) === String(selected) ? "selected" : ""}>${text(material.name)} · ${text(material.category)}</option>
  `).join("")}`;
}

function docLink(row) {
  if (!row.document_stored_name) return "";
  return `<a class="doc-link" href="/uploads/${encodeURIComponent(row.document_stored_name)}" target="_blank" rel="noreferrer">Adjunto</a>`;
}

function filteredMaterialOptions(selected = "", first = "Sin material", source = activeMaterials()) {
  return `<option value="">${escapeHtml(first)}</option>${source.map((material) => `
    <option value="${material.id}" ${String(material.id) === String(selected) ? "selected" : ""}>${text(material.name)}${hierarchySummary(material) ? ` · ${text(hierarchySummary(material))}` : ""}</option>
  `).join("")}`;
}

function img(url) {
  return url ? `<img src="${escapeHtml(url)}" loading="lazy" alt="">` : `<div class="image-empty"></div>`;
}

function badge(value, tone = "") {
  return `<span class="badge ${tone}">${text(value)}</span>`;
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value;
}

function isMaterialInvoiceCategory(category) {
  return category === "materiales";
}

function hierarchyParts(material) {
  return MATERIAL_HIERARCHY
    .map((field) => material?.[field.key])
    .filter((value) => String(value || "").trim() !== "");
}

function hierarchySummary(material) {
  return hierarchyParts(material).join(" · ");
}

function parseAuditJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function auditEntityLabel(value) {
  return AUDIT_ENTITY_LABELS[value] || value;
}

function auditActionLabel(value) {
  return AUDIT_ACTION_LABELS[value] || value;
}

function formatAuditTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return text(date.toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }));
}

function normalizeAuditField(field) {
  return AUDIT_FIELD_LABELS[field] || String(field || "").replaceAll("_", " ");
}

function auditDiffFields(before, after) {
  const base = before || {};
  const next = after || {};
  const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(next)]));
  return keys.filter((key) => !["id", "created_at", "updated_at", "synced_at", "last_seen_at", "last_inventory_sync_at"].includes(key))
    .filter((key) => JSON.stringify(base[key] ?? null) !== JSON.stringify(next[key] ?? null));
}

function auditEntityTitle(row, before, after) {
  const source = after || before || {};
  if (row.entity_type === "material") return source.name || `Material #${row.entity_id}`;
  if (row.entity_type === "supplier") return source.name || `Proveedor #${row.entity_id}`;
  if (row.entity_type === "invoice") return source.invoice_number || `Factura #${row.entity_id}`;
  if (row.entity_type === "invoice_line") return source.description || source.material_name || `Línea #${row.entity_id}`;
  if (row.entity_type === "channel_payout") return source.bank_reference || `${channelLabel(source.channel || "")} · ${source.payout_date || `Ingreso #${row.entity_id}`}`;
  if (row.entity_type === "kit_recipe") return source.name || `Kit #${row.entity_id}`;
  if (row.entity_type === "kit_recipe_item") return source.material_name || `Material de kit #${row.entity_id}`;
  if (row.entity_type === "sales_order") return source.order_number || source.external_id || `Pedido #${row.entity_id}`;
  if (row.entity_type === "document") return source.original_name || source.stored_name || `Documento #${row.entity_id}`;
  if (row.entity_type === "shopify_product") return source.title || source.handle || `Producto Shopify #${row.entity_id}`;
  if (row.entity_type === "app_settings") return "Configuración general";
  if (row.entity_type === "system") return source.label || "Sistema";
  if (row.entity_type === "client") return source.message || source.action || "Evento cliente";
  return `${auditEntityLabel(row.entity_type)} #${row.entity_id}`;
}

function auditSummary(row, before, after) {
  const source = after || before || {};
  const changed = auditDiffFields(before, after).slice(0, 4).map(normalizeAuditField);
  const changedText = changed.length ? `Cambios: ${changed.join(", ")}.` : "";
  if (row.action === "create") return `Se creó ${auditEntityLabel(row.entity_type).toLowerCase()}.`;
  if (row.action === "update") return changedText || `Se actualizó ${auditEntityLabel(row.entity_type).toLowerCase()}.`;
  if (row.action === "archive") return `Se archivó ${auditEntityLabel(row.entity_type).toLowerCase()}.`;
  if (row.action === "restore") return `Se restauró ${auditEntityLabel(row.entity_type).toLowerCase()}.`;
  if (row.action === "duplicate") return `Se duplicó ${auditEntityLabel(row.entity_type).toLowerCase()}.`;
  if (row.action === "backup_create") return `Se creó una copia de seguridad en ${source.filename || "disco local"}.`;
  if (row.action === "import_create") return `Entrada incorporada desde importación.`;
  if (row.action === "import_update") return changedText || `Entrada actualizada desde importación.`;
  if (row.action === "legacy_import") return `Entrada recuperada desde la migración histórica.`;
  if (row.action === "shopify_auto_create") return `Material creado automáticamente a partir del inventario de Shopify.`;
  if (row.action === "shopify_sync_create") return `Pedido o ingreso incorporado desde Shopify.`;
  if (row.action === "shopify_sync_update") return changedText || `Pedido o ingreso actualizado desde Shopify.`;
  if (row.entity_type === "client") return source.message || "Evento técnico registrado desde el navegador.";
  if (row.entity_type === "system") return source.message || source.filename || "Evento técnico del sistema.";
  return changedText || auditActionLabel(row.action);
}

function technicalLogSource(row) {
  if (row.entity_type === "shopify_product") return "shopify";
  if (row.entity_type === "system") return "system";
  return "client";
}

function technicalLogLevel(row) {
  const after = parseAuditJson(row.after_json) || {};
  if (after.level && TECHNICAL_LOG_LEVELS[after.level]) return after.level;
  if (String(row.action || "").includes("error")) return "error";
  if (String(row.action || "").includes("warn")) return "warn";
  if (row.action === "app_init_success") return "debug";
  return "info";
}

function technicalLogMessage(row) {
  const after = parseAuditJson(row.after_json) || {};
  return after.message || auditSummary(row, null, after);
}

function technicalLogContext(row) {
  const after = parseAuditJson(row.after_json) || {};
  return after.context || {};
}

function buildTechnicalLogClipboardText(row) {
  const payload = parseAuditJson(row.after_json) || {};
  const context = payload.context || {};
  return [
    `Acción: ${auditActionLabel(row.action)}`,
    `Origen: ${technicalLogSource(row)}`,
    `Nivel: ${TECHNICAL_LOG_LEVELS[technicalLogLevel(row)] || technicalLogLevel(row)}`,
    `Fecha: ${row.created_at}`,
    `Actor: ${row.actor || ""}`,
    `Mensaje: ${technicalLogMessage(row)}`,
    `Contexto: ${JSON.stringify(context, null, 2)}`
  ].join("\n");
}

async function copyToClipboard(textValue) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textValue);
    return;
  }
  const input = document.createElement("textarea");
  input.value = textValue;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function auditJump(row, before, after) {
  const source = after || before || {};
  if (row.entity_type === "material") return { label: "Abrir material", attrs: `data-open-audit-material="${row.entity_id}"` };
  if (row.entity_type === "supplier") return { label: "Abrir proveedor", attrs: `data-open-audit-supplier="${row.entity_id}"` };
  if (row.entity_type === "invoice") return { label: "Abrir factura", attrs: `data-view-invoice="${row.entity_id}"` };
  if (row.entity_type === "invoice_line" && source.invoice_id) return { label: "Abrir factura", attrs: `data-view-invoice="${source.invoice_id}"` };
  if (row.entity_type === "channel_payout") return { label: "Abrir ingreso", attrs: `data-open-payout="${row.entity_id}"` };
  if (row.entity_type === "kit_recipe") return { label: "Abrir kit", attrs: `data-open-kit="${row.entity_id}"` };
  if (row.entity_type === "kit_recipe_item" && source.recipe_id) return { label: "Abrir kit", attrs: `data-open-kit="${source.recipe_id}"` };
  return null;
}

function activeMaterials({ includeOutlet = true } = {}) {
  return state.materials.filter((material) => !material.is_deleted && (includeOutlet || !material.is_outlet));
}

function materialsMatching(filters = {}, options = {}) {
  return activeMaterials(options).filter((material) => MATERIAL_HIERARCHY.every((field) => {
    const wanted = String(filters[field.key] || "").trim();
    if (!wanted) return true;
    return String(material[field.key] || "").trim() === wanted;
  }));
}

function hierarchyValueOptions(key, filters = {}, options = {}) {
  const scopedFilters = { ...filters };
  delete scopedFilters[key];
  return Array.from(new Set(
    materialsMatching(scopedFilters, options)
      .map((material) => String(material[key] || "").trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, "es"));
}

function materialPickerMarkup({ context, required = true, includePreview = true }) {
  return `
    <div class="hierarchy-grid">
      ${MATERIAL_HIERARCHY.map((field) => `
        <label>${field.label}
          <select name="${context}_${field.key}">
            <option value="">${field.empty}</option>
          </select>
        </label>
      `).join("")}
    </div>
    <label>Material<select name="material_id" ${required ? "required" : ""}></select></label>
    ${includePreview ? `<div class="selected-material-card hidden" data-material-preview="${context}"></div>` : ""}
  `;
}

function syncMaterialPicker(form, context, { required = true } = {}) {
  if (!form) return;
  const includeOutlet = context !== "line";
  const filters = Object.fromEntries(MATERIAL_HIERARCHY.map((field) => [field.key, form.elements[`${context}_${field.key}`]?.value || ""]));
  for (const field of MATERIAL_HIERARCHY) {
    const select = form.elements[`${context}_${field.key}`];
    if (!select) continue;
    const options = hierarchyValueOptions(field.key, filters, { includeOutlet });
    const current = select.value;
    select.innerHTML = optionList(options, current, field.empty);
    if (current && !options.includes(current)) select.value = "";
  }
  const narrowedFilters = Object.fromEntries(MATERIAL_HIERARCHY.map((field) => [field.key, form.elements[`${context}_${field.key}`]?.value || ""]));
  const materialSelect = form.elements.material_id;
  if (!materialSelect) return;
  const selectedMaterialId = materialSelect.value;
  const selectedMaterial = state.materials.find((material) => String(material.id) === String(selectedMaterialId)) || null;
  const matches = materialsMatching(narrowedFilters, { includeOutlet });
  const optionsSource = selectedMaterial && !matches.some((material) => String(material.id) === String(selectedMaterialId))
    ? [selectedMaterial, ...matches]
    : matches;
  materialSelect.innerHTML = filteredMaterialOptions(selectedMaterialId, required ? "Selecciona material" : "Sin material", optionsSource);
  if (selectedMaterialId && !optionsSource.some((material) => String(material.id) === String(selectedMaterialId))) {
    materialSelect.value = "";
  }
  const selected = state.materials.find((material) => String(material.id) === String(materialSelect.value));
  const preview = form.querySelector(`[data-material-preview="${context}"]`);
  if (!preview) return;
  if (!selected) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="material-mini-thumb">${img(selected.image_url)}</div>
    <div>
      <strong>${text(selected.name)}</strong>
      <div class="tags">
        ${selected.category ? badge(selected.category) : ""}
        ${hierarchyParts(selected).map((value) => badge(value)).join("")}
      </div>
      ${selected.notes ? `<p>${text(selected.notes)}</p>` : ""}
    </div>
  `;
}

function lineFormTotals(form) {
  const packageCount = number(form.elements.package_count?.value || 1);
  const unitsPerPackage = number(form.elements.units_per_package?.value || 1);
  const totalUnits = packageCount * unitsPerPackage;
  const pricePerPackage = form.elements.price_per_package?.value === "" ? null : number(form.elements.price_per_package?.value);
  const lineTotal = pricePerPackage === null ? 0 : pricePerPackage * packageCount;
  const unitCost = totalUnits > 0 ? lineTotal / totalUnits : 0;
  return { totalUnits, lineTotal, unitCost };
}

function updateLinePreview() {
  const form = $("#lineForm");
  if (!form) return;
  const preview = $("#linePreview");
  if (!preview) return;
  const totals = lineFormTotals(form);
  preview.querySelector("[data-preview-units]").textContent = totals.totalUnits.toLocaleString("es-ES");
  preview.querySelector("[data-preview-line-total]").textContent = euro.format(totals.lineTotal);
  preview.querySelector("[data-preview-unit]").textContent = euro.format(totals.unitCost);
}

function applyTextSearch(rows, query, fields) {
  const q = lower(query).trim();
  if (!q) return rows;
  return rows.filter((row) => fields.some((field) => lower(row[field]).includes(q)));
}

function sortRows(rows, sort, handlers) {
  const copy = [...rows];
  const handler = handlers[sort] || handlers.default;
  return handler ? copy.sort(handler) : copy;
}

async function loadSummary() {
  await api("/api/summary");
  const node = $("#summaryText");
  node.textContent = "";
  node.classList.add("hidden");
}

async function loadDashboardFinance() {
  const params = new URLSearchParams();
  if (state.dashboardWindowPreset) params.set("preset", state.dashboardWindowPreset);
  if (state.dashboardWindowPreset === "custom") {
    if (state.dashboardWindowFrom) params.set("from", state.dashboardWindowFrom);
    if (state.dashboardWindowTo) params.set("to", state.dashboardWindowTo);
  }
  if (state.dashboardGranularity) params.set("granularity", state.dashboardGranularity);
  state.dashboardFinance = await api(`/api/dashboard/finance${params.toString() ? `?${params}` : ""}`);
  renderDashboard();
}

async function loadSettings() {
  state.settings = await api("/api/settings");
  state.dashboardExpenseTrendView = state.settings.dashboard_monthly_view || "total";
  state.dashboardIncomeTrendView = state.settings.dashboard_income_monthly_view || "cobros";
  state.dashboardWindowPreset = state.settings.dashboard_window_preset || "all";
  renderSettings();
}

async function loadShopifyConnection() {
  const [connection, status] = await Promise.all([
    api("/api/shopify/connection"),
    api("/api/shopify/sync-status")
  ]);
  state.shopifyConnection = connection;
  state.shopifySyncStatus = status;
  renderShopifyConnection();
  setupShopifyAutoSync();
}

async function loadSystemHealth() {
  const [health, technicalAudit] = await Promise.all([
    api("/api/system/health"),
    api("/api/audit-log?scope=technical&limit=50")
  ]);
  state.systemHealth = health;
  state.technicalAudit = technicalAudit;
  renderSystemHealth();
  renderTechnicalLogs();
}

function dashboardChart(id) {
  if (!window.echarts) return null;
  const node = document.getElementById(id);
  if (!node) return null;
  const existing = state.dashboardCharts[id];
  if (existing) {
    const currentDom = typeof existing.getDom === "function" ? existing.getDom() : null;
    if (currentDom === node) return existing;
    if (!(typeof existing.isDisposed === "function" && existing.isDisposed())) {
      existing.dispose();
    }
    delete state.dashboardCharts[id];
  }
  const chart = window.echarts.init(node, null, { renderer: "canvas" });
  state.dashboardCharts[id] = chart;
  return chart;
}

function compactMonths(months = []) {
  return months.map((month) => {
    const [year, rawMonth] = String(month || "").split("-");
    if (!year || !rawMonth) return month;
    return `${rawMonth}/${year.slice(2)}`;
  });
}

function compactTimeline(keys = [], mode = "month") {
  if (mode === "day") {
    return keys.map((key) => {
      const [year, month, day] = String(key || "").split("-");
      if (!year || !month || !day) return key;
      return `${day}/${month}`;
    });
  }
  return compactMonths(keys);
}

function renderDashboardCharts() {
  return viewModules.dashboard?.renderDashboardCharts();
}

function renderDashboard() {
  return viewModules.dashboard?.renderDashboard();
}

async function loadIncome() {
  const includeDeleted = $("#payoutsDeleted")?.checked ? 1 : 0;
  const [summary, payouts] = await Promise.all([
    api("/api/income/summary"),
    api(`/api/channel-payouts?include_deleted=${includeDeleted}`)
  ]);
  state.incomeSummary = summary;
  state.payouts = payouts;
  renderIncome();
}

function renderIncome() {
  return viewModules.income?.renderIncome();
}

function renderIncomeSummaryCards(rows) {
  return viewModules.income?.renderIncomeSummaryCards(rows);
}

function renderPayouts() {
  return viewModules.income?.renderPayouts();
}

async function openPayout(id) {
  return viewModules.income?.openPayout(id);
}

function renderSettings() {
  return viewModules.system?.renderSettings();
}

function renderShopifyConnection() {
  return viewModules.system?.renderShopifyConnection();
}

function renderSystemHealth() {
  return viewModules.system?.renderSystemHealth();
}

function renderTechnicalLogs() {
  return viewModules.system?.renderTechnicalLogs();
}

function technicalLogFilterValues() {
  return viewModules.system?.technicalLogFilterValues();
}

async function maybeRunShopifyAutoSync() {
  if (!state.shopifySyncStatus?.sync_enabled) return;
  if (document.visibilityState !== "visible") return;
  const status = await api("/api/shopify/sync-status");
  state.shopifySyncStatus = status;
  renderShopifyConnection();
  if (!status.due || status.running) return;
  await api("/api/shopify/sync", { method: "POST", body: "{}" });
  await Promise.all([loadShopifyConnection(), loadSystemHealth(), loadMaterials(), loadIncome(), loadSummary(), loadDashboardFinance()]);
  toast("Shopify sincronizado automáticamente");
}

function setupShopifyAutoSync() {
  if (state.shopifyAutoSyncTimer) clearInterval(state.shopifyAutoSyncTimer);
  if (!state.shopifySyncStatus?.sync_enabled) return;
  maybeRunShopifyAutoSync().catch((error) => clientLog("shopify_auto_sync_error", { message: error.message }, "error"));
  state.shopifyAutoSyncTimer = setInterval(() => {
    maybeRunShopifyAutoSync().catch((error) => clientLog("shopify_auto_sync_error", { message: error.message }, "error"));
  }, 60000);
}

async function loadSuppliers() {
  const includeDeleted = $("#suppliersDeleted")?.checked ? 1 : 0;
  state.suppliers = await api(`/api/suppliers?include_deleted=${includeDeleted}`);
  refreshSupplierSelects();
  renderSuppliers();
}

function refreshSupplierSelects() {
  $$("select[name=preferred_supplier_id], select[name=supplier_id]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = supplierOptions(selected);
  });
  $("#invoiceSupplierFilter").innerHTML = supplierOptions($("#invoiceSupplierFilter").value, "Todos");
  $("#materialSupplierFilter").innerHTML = supplierOptions($("#materialSupplierFilter").value, "Todos");
}

function refreshMaterialHierarchyFilters() {
  const mappings = [
    ["#materialUsageFilter", "usage_type", "Todos"],
    ["#materialFamilyFilter", "family", "Todas"],
    ["#materialSubfamilyFilter", "subfamily", "Todas"],
    ["#materialVariantFilter", "variant", "Todas"],
    ["#materialBaseFilter", "base_material", "Todos"],
    ["#materialFinishFilter", "finish", "Todos"]
  ];
  mappings.forEach(([selector, key, empty]) => {
    const select = $(selector);
    if (!select) return;
    const current = select.value;
    select.innerHTML = optionList(distinctValues(state.materials.filter((row) => !row.is_deleted), key), current, empty);
  });
}

function renderSuppliers() {
  let rows = [...state.suppliers];
  rows = applyTextSearch(rows, $("#supplierSearch")?.value, ["name", "category", "website", "notes"]);
  const category = lower($("#supplierCategoryFilter")?.value).trim();
  if (category) rows = rows.filter((supplier) => lower(supplier.category).includes(category));
  rows = sortRows(rows, $("#supplierSort")?.value, {
    category_asc: (a, b) => lower(a.category).localeCompare(lower(b.category)) || lower(a.name).localeCompare(lower(b.name)),
    lead_asc: (a, b) => number(a.lead_time_days) - number(b.lead_time_days),
    default: (a, b) => lower(a.name).localeCompare(lower(b.name)),
    name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name))
  });
  const meta = paginateRows("suppliers", rows);
  $("#supplierResultText").textContent = `${meta.total} proveedores visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
  $("#supplierList").innerHTML = meta.rows.map((supplier) => `
    <article class="row ${supplier.is_deleted ? "deleted" : ""}">
      <div class="row-main">
        <strong>${text(supplier.name)}</strong>
        <div class="meta">${text(supplier.category, "Sin categoría")} ${supplier.lead_time_days ? `· ${supplier.lead_time_days} días` : ""}</div>
        ${supplier.website ? `<a class="subtle-link" href="${text(supplier.website)}" target="_blank" rel="noreferrer">${text(supplier.website)}</a>` : ""}
        ${supplier.notes ? `<p>${text(supplier.notes)}</p>` : ""}
      </div>
      <div class="row-actions">
        <button data-view-supplier="${supplier.id}" type="button" class="ghost">Ver</button>
        ${supplier.is_deleted ? `<button data-restore-supplier="${supplier.id}" type="button">Restaurar</button>` : `<button class="ghost" data-delete-supplier="${supplier.id}" type="button">Archivar</button>`}
      </div>
    </article>
  `).join("") || `<div class="empty-state">No hay proveedores con esos filtros.</div>`;
  renderPagination("#supplierPagination", "suppliers", meta);
}

async function loadMaterials() {
  const includeDeleted = $("#materialsDeleted")?.checked ? 1 : 0;
  state.materials = await api(`/api/materials?include_deleted=${includeDeleted}`);
  refreshMaterialSelects();
  refreshMaterialHierarchyFilters();
  renderMaterials();
}

function refreshMaterialSelects() {
  $$("select[name=material_id]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = materialOptions(selected);
  });
}

function renderMaterials() {
  let rows = [...state.materials];
  rows = applyTextSearch(rows, $("#materialSearch")?.value, ["name", "category", "notes", "preferred_supplier_name", "usage_type", "family", "subfamily", "variant", "base_material", "finish"]);
  const category = $("#materialCategoryFilter")?.value;
  const supplier = $("#materialSupplierFilter")?.value;
  const usage = $("#materialUsageFilter")?.value;
  const family = $("#materialFamilyFilter")?.value;
  const subfamily = $("#materialSubfamilyFilter")?.value;
  const variant = $("#materialVariantFilter")?.value;
  const baseMaterial = $("#materialBaseFilter")?.value;
  const finish = $("#materialFinishFilter")?.value;
  const outlet = $("#materialOutletFilter")?.value;
  if (category) rows = rows.filter((material) => material.category === category);
  if (supplier) rows = rows.filter((material) => String(material.preferred_supplier_id || "") === String(supplier));
  if (usage) rows = rows.filter((material) => String(material.usage_type || "") === usage);
  if (family) rows = rows.filter((material) => String(material.family || "") === family);
  if (subfamily) rows = rows.filter((material) => String(material.subfamily || "") === subfamily);
  if (variant) rows = rows.filter((material) => String(material.variant || "") === variant);
  if (baseMaterial) rows = rows.filter((material) => String(material.base_material || "") === baseMaterial);
  if (finish) rows = rows.filter((material) => String(material.finish || "") === finish);
  if (outlet === "1") rows = rows.filter((material) => Boolean(material.is_outlet));
  if (outlet === "0") rows = rows.filter((material) => !material.is_outlet);
  rows = sortRows(rows, $("#materialSort")?.value, {
    category_asc: (a, b) => lower(a.category).localeCompare(lower(b.category)) || lower(a.name).localeCompare(lower(b.name)),
    stock_asc: (a, b) => number(a.effective_stock_qty) - number(b.effective_stock_qty),
    stock_desc: (a, b) => number(b.effective_stock_qty) - number(a.effective_stock_qty),
    default: (a, b) => lower(a.name).localeCompare(lower(b.name)),
    name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name))
  });
  const meta = paginateRows("materials", rows);
  $("#materialResultText").textContent = `${meta.total} materiales visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
  $("#materialList").innerHTML = meta.rows.map((material) => `
    <article class="row material-row ${material.is_deleted ? "deleted" : ""}">
      <div class="material-thumb">${img(material.image_url)}</div>
      <div class="row-main">
        <strong>${text(material.name)}</strong>
        <div class="tags">
          ${badge(material.category)}
          ${badge(material.unit_label || "ud")}
          ${badge(material.preferred_supplier_name || "sin proveedor")}
          ${material.linked_product_count ? badge(`${material.linked_product_count} imagen`, "ok") : badge("sin imagen", "warn")}
          ${material.is_outlet ? badge("outlet", "warn") : ""}
          ${material.usage_type ? badge(material.usage_type) : ""}
          ${material.family ? badge(material.family) : ""}
          ${material.subfamily ? badge(material.subfamily) : ""}
          ${material.variant ? badge(material.variant) : ""}
          ${material.base_material ? badge(material.base_material) : ""}
          ${material.finish ? badge(material.finish) : ""}
        </div>
        <div class="meta">Stock Shopify ${material.effective_stock_qty ?? "-"} · Reposición ${material.reorder_point ?? "-"} · Objetivo ${material.target_stock ?? "-"}</div>
        ${material.notes ? `<p>${text(material.notes)}</p>` : ""}
      </div>
      <div class="row-actions">
        <button data-view-material="${material.id}" type="button" class="ghost">Ver</button>
        ${material.is_deleted ? `<button data-restore-material="${material.id}" type="button">Restaurar</button>` : `<button class="ghost" data-delete-material="${material.id}" type="button">Archivar</button>`}
      </div>
    </article>
  `).join("") || `<div class="empty-state">No hay materiales con esos filtros.</div>`;
  renderPagination("#materialPagination", "materials", meta);
}

async function loadInvoices() {
  const include = $("#invoicesDeleted")?.checked ? 1 : 0;
  state.invoices = await api(`/api/invoices?include_deleted=${include}`);
  renderInvoices();
}

function renderInvoices() {
  let rows = [...state.invoices];
  rows = applyTextSearch(rows, $("#invoiceSearch")?.value, ["supplier_name", "invoice_number", "category", "status", "notes", "document_name"]);
  const supplier = $("#invoiceSupplierFilter")?.value;
  const category = $("#invoiceCategoryFilter")?.value;
  const status = $("#invoiceStatusFilter")?.value;
  const lineFilter = $("#invoiceLineFilter")?.value;
  const from = $("#invoiceFromFilter")?.value;
  const to = $("#invoiceToFilter")?.value;
  if (supplier) rows = rows.filter((invoice) => String(invoice.supplier_id || "") === String(supplier));
  if (category) rows = rows.filter((invoice) => invoice.category === category);
  if (status) rows = rows.filter((invoice) => invoice.status === status);
  if (lineFilter === "with") rows = rows.filter((invoice) => number(invoice.line_count) > 0);
  if (lineFilter === "without") rows = rows.filter((invoice) => number(invoice.line_count) === 0);
  if (from) rows = rows.filter((invoice) => String(invoice.invoice_date) >= from);
  if (to) rows = rows.filter((invoice) => String(invoice.invoice_date) <= to);
  rows = sortRows(rows, $("#invoiceSort")?.value, {
    date_asc: (a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || a.id - b.id,
    total_desc: (a, b) => number(b.total) - number(a.total),
    total_asc: (a, b) => number(a.total) - number(b.total),
    supplier_asc: (a, b) => lower(a.supplier_name).localeCompare(lower(b.supplier_name)),
    lines_asc: (a, b) => number(a.line_count) - number(b.line_count) || String(b.invoice_date).localeCompare(String(a.invoice_date)),
    default: (a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || b.id - a.id,
    date_desc: (a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || b.id - a.id
  });
  const meta = paginateRows("invoices", rows);
  $("#invoiceResultText").textContent = `${meta.total} facturas visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
  $("#invoiceList").innerHTML = meta.rows.map((invoice) => {
    const active = String(invoice.id) === String(state.selectedInvoiceId) ? "active" : "";
    const lineTone = invoice.line_count ? "ok" : "warn";
    return `
      <article class="invoice-card ${active} ${invoice.is_deleted ? "deleted" : ""}">
        <button type="button" class="invoice-open" data-view-invoice="${invoice.id}">
          <span>
            <strong>${text(invoice.supplier_name, "Sin proveedor")}</strong>
            <small>${text(invoice.invoice_date)} · ${text(invoice.invoice_number, "sin número")}</small>
          </span>
          <span class="amount">${euro.format(number(invoice.total))}</span>
        </button>
        <div class="tags">
          ${badge(invoice.category)}
          ${badge(statusLabel(invoice.status), invoice.status === "draft" ? "warn" : "ok")}
          ${badge(`${invoice.line_count || 0} líneas`, lineTone)}
          ${docLink(invoice)}
        </div>
        ${invoice.notes ? `<p>${text(invoice.notes)}</p>` : ""}
        <div class="row-actions slim">
          <button data-view-invoice="${invoice.id}" type="button">Ver</button>
          <button data-duplicate-invoice="${invoice.id}" type="button" class="ghost">Duplicar</button>
          ${invoice.is_deleted ? `<button data-restore-invoice="${invoice.id}" type="button">Restaurar</button>` : `<button class="ghost danger-text" data-delete-invoice="${invoice.id}" type="button">Archivar</button>`}
        </div>
      </article>
    `;
  }).join("") || `<div class="empty-state">No hay facturas con esos filtros.</div>`;
  renderPagination("#invoicePagination", "invoices", meta);
}

async function openInvoice(id, options = {}) {
  state.selectedInvoiceId = id;
  state.invoiceLineFormOpen = Boolean(options.openForm);
  const detail = await api(`/api/invoices/${id}`);
  const materialInvoice = isMaterialInvoiceCategory(detail.invoice.category);
  const activeLineCount = detail.lines.filter((line) => !line.is_deleted).length;
  renderInvoices();
  const panel = $("#invoiceDetailPanel");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="selected-invoice">
      <div class="panel-head">
        <div>
          <h2>${text(detail.invoice.supplier_name, "Factura sin proveedor")}</h2>
          <p>${text(detail.invoice.invoice_date)} · ${text(detail.invoice.invoice_number, "sin número")} · ${euro.format(number(detail.invoice.total))}</p>
        </div>
        <div class="row-actions">
          ${docLink(detail.invoice)}
          <button type="button" class="ghost" data-edit-invoice-details="${detail.invoice.id}">Editar factura</button>
          <button type="button" data-open-line-form="${detail.invoice.id}">Nueva línea</button>
          <button type="button" class="ghost" data-close-invoice-detail>Cerrar</button>
        </div>
      </div>
      <div class="tags">
        ${badge(detail.invoice.category)}
        ${badge(statusLabel(detail.invoice.status), detail.invoice.status === "draft" ? "warn" : "ok")}
        ${badge(`${activeLineCount} líneas`, detail.lines.length ? "ok" : "warn")}
      </div>
      ${detail.invoice.notes ? `<p>${text(detail.invoice.notes)}</p>` : ""}
    </div>

    <form id="lineForm" class="line-form ${state.invoiceLineFormOpen ? "" : "hidden"}">
      <div class="panel-head compact-head">
        <div>
          <h2 id="lineFormTitle">Nueva línea</h2>
          <p>Introduce paquetes, unidades y precio.</p>
        </div>
        <button type="button" class="ghost" data-close-line-form>Cerrar</button>
      </div>
      <input type="hidden" name="id">
      <input type="hidden" name="invoice_id" value="${detail.invoice.id}">
      <input type="hidden" name="invoice_category" value="${text(detail.invoice.category)}">
      ${materialInvoice
        ? materialPickerMarkup({ context: "line", required: true, includePreview: true })
        : `<input type="hidden" name="material_id" value="">
           <div class="inline-note">Esta factura es de ${text(detail.invoice.category)}. Las líneas se registran sin material del catálogo.</div>`}
      <label>Descripción (opcional)<input name="description" placeholder="Ej. 4 paquetes x 5 cadenas"></label>
      <div class="numbers">
        <label>Paquetes<input name="package_count" inputmode="decimal" value="1"></label>
        <label>Ud/paquete<input name="units_per_package" inputmode="decimal" value="1"></label>
        <label>Precio/paquete<input name="price_per_package" inputmode="decimal"></label>
      </div>
      <input type="hidden" name="affects_stock" value="0">
      <label>Notas<textarea name="notes" rows="2"></textarea></label>
      <div id="linePreview" class="calc-preview">
        <span><small>Unidades</small><strong data-preview-units>1</strong></span>
        <span><small>Total línea</small><strong data-preview-line-total>0,00 EUR</strong></span>
        <span><small>Coste unitario</small><strong data-preview-unit>0,00 EUR</strong></span>
      </div>
      <div class="row-actions">
        <button type="button" data-save-line>Guardar línea</button>
        <button type="button" class="ghost" data-reset-form="lineForm">Limpiar</button>
      </div>
    </form>

    <div class="line-list">
      ${detail.lines.map((line) => `
        <article class="line-card ${line.is_deleted ? "deleted" : ""}">
          <div class="line-card-main ${line.material_image_url ? "with-image" : ""}">
            ${line.material_image_url ? `<div class="material-mini-thumb">${img(line.material_image_url)}</div>` : ""}
            <div>
              <strong>${text(line.material_name, "Sin material")}</strong>
              <div class="meta">${line.package_count} paquetes · ${line.units_per_package} ud/paquete · ${line.total_units} ud · ${euro.format(number(line.price_per_package))} / paquete · ${euro.format(number(line.unit_price))} / ud · total ${euro.format(number(line.line_total))}</div>
              ${hierarchySummary({
                usage_type: line.material_usage_type,
                family: line.material_family,
                subfamily: line.material_subfamily,
                variant: line.material_variant,
                base_material: line.material_base_material,
                finish: line.material_finish
              }) ? `<div class="meta">${text(hierarchySummary({
                usage_type: line.material_usage_type,
                family: line.material_family,
                subfamily: line.material_subfamily,
                variant: line.material_variant,
                base_material: line.material_base_material,
                finish: line.material_finish
              }))}</div>` : ""}
              ${line.description ? `<p>${text(line.description)}</p>` : ""}
            </div>
          </div>
          <div class="row-actions slim">
            <button data-edit-line="${line.id}" type="button">Editar</button>
            <button data-duplicate-line="${line.id}" type="button" class="ghost">Duplicar</button>
            ${line.is_deleted ? `<button data-restore-line="${line.id}" type="button">Restaurar</button>` : `<button class="ghost danger-text" data-delete-line="${line.id}" type="button">Archivar</button>`}
          </div>
        </article>
      `).join("") || `<div class="empty-state small">Esta factura todavía no tiene líneas.</div>`}
    </div>
  `;
  bindLineForm();
  if (state.invoiceLineFormOpen) updateLinePreview();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openInvoiceWorkspace(id) {
  $("#invoiceForm")?.classList.add("hidden");
  await openInvoice(id, { openForm: false });
}

function bindLineForm() {
  const form = $("#lineForm");
  if (!form) return;
  if (isMaterialInvoiceCategory(form.elements.invoice_category?.value || "")) {
    syncMaterialPicker(form, "line", { required: true });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveLineForm(form).catch((error) => {
      clientLog("line_submit_error", { message: error.message, source: "direct_submit" }, "error");
      toast(error.message);
    });
  });
}

async function loadCosts() {
  state.costs = await api("/api/costs/materials");
  renderCosts();
}

function renderCosts() {
  let rows = state.costs.filter((row) => !row.is_outlet);
  rows = applyTextSearch(rows, $("#costSearch")?.value, ["name", "category", "preferred_supplier_name", "main_supplier_name"]);
  const category = $("#costCategoryFilter")?.value;
  if (category) rows = rows.filter((row) => row.category === category);
  if ($("#costOnlyWithPurchases")?.checked) rows = rows.filter((row) => number(row.purchase_lots) > 0);
  rows = sortRows(rows, $("#costSort")?.value, {
    avg_desc: (a, b) => number(b.weighted_avg_unit_cost_inc_vat) - number(a.weighted_avg_unit_cost_inc_vat),
    name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name)),
    lots_desc: (a, b) => number(b.purchase_lots) - number(a.purchase_lots),
    default: (a, b) => number(b.total_spend) - number(a.total_spend),
    spend_desc: (a, b) => number(b.total_spend) - number(a.total_spend)
  });
  const meta = paginateRows("costs", rows);
  $("#costResultText").textContent = `${meta.total} materiales visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
  $("#costTable").innerHTML = `
    <div class="cost-row header"><span>Material</span><span>Categoría</span><span>Proveedor</span><span>Coste medio</span><span>Último coste</span><span>Gasto</span><span>Lotes</span><span></span></div>
    ${meta.rows.length ? meta.rows.map((row) => `
      <div class="cost-row">
        <strong data-label="Material">${text(row.name)}</strong>
        <span data-label="Categoría">${text(row.category)}</span>
        <span data-label="Proveedor">${text(row.main_supplier_name || row.preferred_supplier_name || "")}</span>
        <span data-label="Coste medio">${row.weighted_avg_unit_cost_inc_vat == null ? "-" : `${euro.format(number(row.weighted_avg_unit_cost_inc_vat))}${row.inherited_cost ? " *" : ""}`}</span>
        <span data-label="Último coste">${row.last_unit_cost_inc_vat == null ? "-" : `${euro.format(number(row.last_unit_cost_inc_vat))}${row.inherited_cost ? " *" : ""}`}</span>
        <span data-label="Gasto">${euro.format(number(row.total_spend))}</span>
        <span data-label="Lotes">${row.purchase_lots || 0}</span>
        <span data-label="Detalle"><button type="button" class="ghost" data-open-cost="${row.material_id}">Ver</button></span>
      </div>
    `).join("") : `<div class="empty-state"><strong>Sin costes visibles</strong>Ajusta la búsqueda o los filtros para ver materiales con compras.</div>`}
  `;
  renderPagination("#costPagination", "costs", meta);
}

async function openCostDetail(materialId) {
  const detail = await api(`/api/costs/materials/${materialId}`);
  state.selectedCostMaterialId = Number(materialId);
  const panel = $("#costDetailPanel");
  if (!panel) return;
  const { summary, lots } = detail;
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${text(summary.name)}</h2>
        <p>${text(summary.category)} · ${lots.length} lotes activos · coste medio ${summary.weighted_avg_unit_cost_inc_vat == null ? "-" : euro.format(number(summary.weighted_avg_unit_cost_inc_vat))}</p>
      </div>
      <button type="button" class="ghost" data-close-cost-detail>Cerrar</button>
    </div>
    ${summary.inherited_cost ? `<div class="inline-note">Este material outlet hereda el coste de <strong>${text(summary.cost_reference_material_name)}</strong>.</div>` : ""}
    <div id="costHistoryChart" class="chart-surface chart-surface-small"></div>
    <div class="list compact">
      ${lots.length ? lots.map((lot) => `
        <article class="row">
          <div class="row-main">
            <strong>${text(lot.invoice_date)} · ${text(lot.supplier_name || "Sin proveedor")}</strong>
            <div class="meta">${text(lot.invoice_number || "Sin número")} · ${lot.package_count} paquetes · ${lot.units_per_package} ud/paquete · ${lot.total_units} unidades</div>
            ${lot.description ? `<p>${text(lot.description)}</p>` : ""}
          </div>
          <div class="row-side">
            <strong>${lot.unit_cost == null ? "-" : euro.format(number(lot.unit_cost))}</strong>
            <div class="meta">${euro.format(number(lot.line_total))}</div>
          </div>
        </article>
      `).join("") : `<div class="empty-state small">Este material todavía no tiene lotes registrados.</div>`}
    </div>
  `;
  renderCostHistoryChart(lots);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCostHistoryChart(lots) {
  const chart = dashboardChart("costHistoryChart");
  if (!chart) return;
  const colors = chartColors();
  chart.setOption({
    animationDuration: 350,
    grid: { left: 54, right: 18, top: 24, bottom: 36 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => euro.format(Number(value || 0))
    },
    xAxis: {
      type: "category",
      data: lots.map((lot) => `${String(lot.invoice_date || "").slice(2)} · ${lot.invoice_number || "s/n"}`),
      axisLine: { lineStyle: { color: "#c9bfb5" } },
      axisLabel: { color: "#766e68", interval: 0, rotate: 18 }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) },
      splitLine: { lineStyle: { color: "#ede7df" } }
    },
    series: [{
      name: "Coste por unidad",
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 8,
      lineStyle: { width: 3, color: colors.materiales },
      itemStyle: { color: colors.materiales },
      areaStyle: {
        color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: `${colors.materiales}33` },
          { offset: 1, color: `${colors.materiales}08` }
        ])
      },
      data: lots.map((lot) => number(lot.unit_cost))
    }]
  }, true);
}

async function loadKits() {
  state.kits = await api("/api/kit-recipes");
  renderKits();
}

function renderKits() {
  const list = $("#kitList");
  if (!list) return;
  const meta = paginateRows("kits", [...state.kits]);
  $("#kitResultText").textContent = `${meta.total} versiones definidas.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
  list.innerHTML = meta.rows.map((kit) => `
    <article class="row">
      <div class="row-main">
        <strong>${text(kit.name)} ${kit.version ? `· ${text(kit.version)}` : ""}</strong>
        <div class="meta">${kit.item_count} materiales · coste conocido ${euro.format(number(kit.known_cost))} · ${kit.missing_cost_items} sin coste</div>
        ${badge(kit.is_complete ? "completo" : "en curso", kit.is_complete ? "ok" : "warn")} ${kit.notes ? `<p>${text(kit.notes)}</p>` : ""}
      </div>
      <div class="row-actions">
        <button data-open-kit="${kit.id}" type="button">Ver</button>
        <button data-delete-kit="${kit.id}" type="button" class="ghost danger-text">Archivar</button>
      </div>
    </article>
  `).join("") || `<div class="empty-state">No hay composiciones de kit todavía.</div>`;
  renderPagination("#kitPagination", "kits", meta);
}

async function openKit(id) {
  const kit = state.kits.find((item) => item.id == id) || (await api("/api/kit-recipes")).find((item) => item.id == id);
  if (!kit) return;
  $("#kitForm")?.classList.add("hidden");
  const panel = $("#kitDetailPanel");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="selected-invoice">
      <div class="panel-head">
        <div>
          <h2>${text(kit.name)}${kit.version ? ` · ${text(kit.version)}` : ""}</h2>
          <p>${kit.item_count} materiales · coste medio conocido ${euro.format(number(kit.known_cost))}</p>
        </div>
        <div class="row-actions">
          <button type="button" class="ghost" data-toggle-kit-complete="${kit.id}" data-kit-complete="${kit.is_complete ? 1 : 0}">${kit.is_complete ? "Marcar incompleto" : "Marcar completo"}</button>
          <button type="button" class="ghost" data-close-kit-detail>Cerrar</button>
        </div>
      </div>
      <div class="tags">
        ${badge(kit.is_complete ? "completo" : "en curso", kit.is_complete ? "ok" : "warn")}
      </div>
    </div>
    ${kit.is_complete ? `<div class="inline-note">Este kit está marcado como completo. Si necesitas cambiar su composición, vuelve a marcarlo como incompleto.</div>` : `
    <form id="kitItemForm" class="line-form">
      <input type="hidden" name="id">
      <input type="hidden" name="recipe_id" value="${kit.id}">
      <div class="form-grid four">
        <div class="form-span-full">${materialPickerMarkup({ context: "kit", required: true, includePreview: true })}</div>
        <label>Cantidad por kit<input name="quantity" inputmode="decimal" value="1"></label>
        <label>Notas<input name="notes"></label>
      </div>
      <div class="row-actions">
        <button type="button" data-save-kit-item>Añadir material</button>
        <button type="button" class="ghost" data-reset-form="kitItemForm">Limpiar</button>
      </div>
    </form>`}
    <div class="line-list">
      ${kit.items.map((item) => `
        <article class="line-card">
          <div class="line-card-main ${item.material_image_url ? "with-image" : ""}">
            ${item.material_image_url ? `<div class="material-mini-thumb">${img(item.material_image_url)}</div>` : ""}
            <div>
              <strong>${text(item.material_name, "Sin material")}</strong>
              <div class="meta">${item.quantity} ${text(item.material_category || "")} · coste ud ${item.unit_cost == null ? "-" : euro.format(number(item.unit_cost))} · total ${item.total_cost == null ? "-" : euro.format(number(item.total_cost))}</div>
              ${hierarchySummary({
                usage_type: item.material_usage_type,
                family: item.material_family,
                subfamily: item.material_subfamily,
                variant: item.material_variant,
                base_material: item.material_base_material,
                finish: item.material_finish
              }) ? `<div class="meta">${text(hierarchySummary({
                usage_type: item.material_usage_type,
                family: item.material_family,
                subfamily: item.material_subfamily,
                variant: item.material_variant,
                base_material: item.material_base_material,
                finish: item.material_finish
              }))}</div>` : ""}
              ${item.notes ? `<p>${text(item.notes)}</p>` : ""}
            </div>
          </div>
          <div class="row-actions slim">
            ${kit.is_complete ? "" : `<button data-delete-kit-item="${item.id}" data-kit-id="${kit.id}" type="button" class="ghost danger-text">Archivar</button>`}
          </div>
        </article>
      `).join("") || `<div class="empty-state small">Este kit todavía no tiene materiales.</div>`}
    </div>
  `;
  bindKitItemForm();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openKitWorkspace(id) {
  const kit = state.kits.find((item) => item.id == id) || (await api("/api/kit-recipes")).find((item) => item.id == id);
  if (!kit) return;
  showKitEditor(kit, true);
  await openKit(id);
}

function bindKitItemForm() {
  const form = $("#kitItemForm");
  if (!form) return;
  syncMaterialPicker(form, "kit", { required: true });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveKitItem(event).catch((error) => toast(error.message));
  });
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
    limit: "200"
  });
  let rows = await api(`/api/audit-log?${params.toString()}`);
  const lane = state.auditLane || "all";
  const allowedEntities = AUDIT_LANE_ENTITIES[lane] || [];
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

async function saveMaterial(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  data.is_outlet = Boolean(form.elements.is_outlet?.checked);
  const id = data.id;
  delete data.id;
  const saved = await api(id ? `/api/materials/${id}` : "/api/materials", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
  await Promise.all([loadMaterials(), loadSummary(), loadDashboardFinance()]);
  const current = state.materials.find((item) => item.id == saved.id) || saved;
  showMaterialEditor(current);
  toast("Material guardado");
}

async function saveSupplier(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  const id = data.id;
  delete data.id;
  const saved = await api(id ? `/api/suppliers/${id}` : "/api/suppliers", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
  await Promise.all([loadSuppliers(), loadSummary(), loadDashboardFinance()]);
  const current = state.suppliers.find((item) => item.id == saved.id) || saved;
  showSupplierEditor(current);
  toast("Proveedor guardado");
}

async function saveKit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  const id = data.id;
  delete data.id;
  const saved = await api(id ? `/api/kit-recipes/${id}` : "/api/kit-recipes", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
  await Promise.all([loadKits(), loadDashboardFinance()]);
  const current = state.kits.find((item) => item.id == saved.id) || saved;
  showKitEditor(current);
  await openKit(saved.id);
  toast("Kit guardado");
}

async function saveKitItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  if (!data.material_id) throw new Error("Selecciona un material del kit");
  if (!String(data.quantity || "").trim()) throw new Error("Indica la cantidad por kit");
  const recipeId = data.recipe_id;
  delete data.recipe_id;
  await api(`/api/kit-recipes/${recipeId}/items`, { method: "POST", body: JSON.stringify(data) });
  await Promise.all([loadKits(), loadDashboardFinance()]);
  await openKit(recipeId);
  toast("Material añadido al kit");
}

function sanitizePayoutData(data = {}) {
  return {
    id: data.id,
    channel: data.channel,
    payout_date: data.payout_date,
    status: data.status,
    currency: data.currency,
    gross_amount: data.gross_amount,
    fees_amount: data.fees_amount,
    net_amount: data.net_amount,
    bank_reference: data.bank_reference,
    bank_account_hint: data.bank_account_hint,
    notes: data.notes
  };
}

async function savePayout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = sanitizePayoutData(formObject(form));
  const id = data.id;
  delete data.id;
  const saved = await api(id ? `/api/channel-payouts/${id}` : "/api/channel-payouts", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(data)
  });
  await Promise.all([loadIncome(), loadSummary(), loadDashboardFinance()]);
  await openPayout(saved.id);
  toast("Ingreso guardado");
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  if (!["cobros", "channel_shopify", "channel_etsy", "channel_bizum"].includes(data.dashboard_income_monthly_view)) {
    data.dashboard_income_monthly_view = "cobros";
  }
  state.settings = await api("/api/settings", { method: "PATCH", body: JSON.stringify(data) });
  state.dashboardExpenseTrendView = state.settings.dashboard_monthly_view || "total";
  state.dashboardIncomeTrendView = state.settings.dashboard_income_monthly_view || "cobros";
  state.dashboardWindowPreset = state.settings.dashboard_window_preset || "all";
  renderSettings();
  if (state.dashboardFinance) renderDashboard();
  toast("Configuración guardada");
}

function shopifyConnectionDataFromForm(form) {
  const field = (name) => form?.querySelector(`[name="${name}"]`);
  return {
    store_domain: field("store_domain")?.value.trim() || "",
    api_version: field("api_version")?.value.trim() || "2026-01",
    client_id: field("client_id")?.value.trim() || "",
    client_secret: field("client_secret")?.value.trim() || "",
    sync_enabled: Boolean(field("sync_enabled")?.checked),
    sync_interval_minutes: field("sync_interval_minutes")?.value || "",
    pull_products: Boolean(field("pull_products")?.checked),
    pull_inventory: Boolean(field("pull_inventory")?.checked),
    pull_orders: Boolean(field("pull_orders")?.checked),
    pull_payouts: Boolean(field("pull_payouts")?.checked)
  };
}

async function saveShopifyConnection(source) {
  if (source?.preventDefault) source.preventDefault();
  const form = source?.currentTarget || source || $("#shopifyConnectionForm");
  const data = shopifyConnectionDataFromForm(form);
  if (!data.client_id) delete data.client_id;
  if (!data.client_secret) delete data.client_secret;
  state.shopifyConnection = await api("/api/shopify/connection", {
    method: "PATCH",
    body: JSON.stringify(data)
  });
  await Promise.all([loadShopifyConnection(), loadSystemHealth()]);
  toast("Configuración Shopify guardada");
}

async function testShopifyConnectionAction() {
  const form = $("#shopifyConnectionForm");
  const data = shopifyConnectionDataFromForm(form);
  const result = await api("/api/shopify/connection/test", {
    method: "POST",
    body: JSON.stringify(data)
  });
  toast(`Conexión correcta con ${result.shop_name || result.myshopify_domain || "Shopify"}`);
}

async function syncShopifyNow() {
  await api("/api/shopify/sync", { method: "POST", body: "{}" });
  await Promise.all([loadShopifyConnection(), loadSystemHealth(), loadMaterials(), loadIncome(), loadSummary(), loadDashboardFinance()]);
  toast("Shopify sincronizado");
}

async function createSystemBackup() {
  const backup = await api("/api/system/backup", { method: "POST", body: JSON.stringify({ reason: "ui-manual" }) });
  await loadSystemHealth();
  toast(`Backup creado · ${backup.reason}`);
}

async function uploadDocumentIfNeeded() {
  const file = $("#documentFile").files[0];
  if (!file) return $("#invoiceForm input[name=document_id]").value || "";
  const formData = new FormData();
  formData.append("document", file);
  formData.append("related_entity", "invoice");
  const response = await fetch("/api/documents", { method: "POST", body: formData });
  if (!response.ok) throw new Error("No se pudo subir el documento");
  const doc = await response.json();
  return doc.id;
}

async function saveInvoice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  const id = data.id;
  data.document_id = await uploadDocumentIfNeeded();
  delete data.id;
  const saved = await api(id ? `/api/invoices/${id}` : "/api/invoices", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
  $("#documentFile").value = "";
  await Promise.all([loadInvoices(), loadSummary(), loadDashboardFinance()]);
  await openInvoiceWorkspace(saved.id);
  toast("Factura guardada");
}

async function saveLineForm(form) {
  const data = formObject(form);
  if (isMaterialInvoiceCategory(form.elements.invoice_category?.value || "") && !data.material_id) {
    throw new Error("Selecciona el material exacto antes de guardar la línea");
  }
  data.affects_stock = false;
  const id = data.id;
  const invoiceId = data.invoice_id || state.selectedInvoiceId;
  clientLog("line_submit_start", { id, invoiceId, data });
  delete data.id;
  delete data.invoice_id;
  await api(id ? `/api/invoices/${invoiceId}/lines/${id}` : `/api/invoices/${invoiceId}/lines`, { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
  await Promise.all([loadInvoices(), loadCosts(), loadSummary(), loadDashboardFinance()]);
  await openInvoice(invoiceId);
  clientLog("line_submit_success", { id, invoiceId });
  toast("Línea guardada");
}

async function archiveOrRestore(path, message) {
  await api(path, { method: path.includes("restore") ? "POST" : "DELETE" });
  await refreshAll();
  if (state.selectedInvoiceId) {
    await openInvoice(state.selectedInvoiceId).catch(() => {
      closeInvoicePanels();
    });
  }
  if (state.selectedPayoutId) {
    await openPayout(state.selectedPayoutId).catch(() => {
      closePayoutPanels();
    });
  }
  toast(message);
}

function populateStaticFilters() {
  $$("select[name=category]").forEach((select) => {
    if (select.closest("#invoiceForm")) return;
    select.innerHTML = optionList(CATEGORIES, select.value);
  });
  $$("select[name=status]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = `<option value="draft" ${selected === "draft" ? "selected" : ""}>Borrador</option>
      <option value="posted" ${selected === "posted" ? "selected" : ""}>Contabilizada</option>
      <option value="paid" ${selected === "paid" ? "selected" : ""}>Pagada</option>
      <option value="archived" ${selected === "archived" ? "selected" : ""}>Archivada</option>`;
  });
  $("#materialCategoryFilter").innerHTML = optionList(CATEGORIES, "", "Todas");
  $("#costCategoryFilter").innerHTML = optionList(CATEGORIES, "", "Todas");
  $("#invoiceCategoryFilter").innerHTML = optionList(INVOICE_CATEGORIES, "", "Todas");
  $("#invoiceStatusFilter").innerHTML = `<option value="">Todos</option>
    <option value="draft">Borrador</option>
    <option value="posted">Contabilizada</option>
    <option value="paid">Pagada</option>
    <option value="archived">Archivada</option>`;
  $("#payoutStatusFilter").innerHTML = `<option value="">Todos</option>${PAYOUT_STATUSES.map((value) => `<option value="${value}">${payoutStatusLabel(value)}</option>`).join("")}`;
  $$('select[name="status"]').forEach((select) => {
    if (select.closest("#payoutForm")) {
      const selected = select.value;
      select.innerHTML = PAYOUT_STATUSES.map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${payoutStatusLabel(value)}</option>`).join("");
    }
  });
  const defaultPayoutStatus = $('select[name="default_payout_status"]');
  if (defaultPayoutStatus) {
    const selected = defaultPayoutStatus.value;
    defaultPayoutStatus.innerHTML = PAYOUT_STATUSES.map((value) => `<option value="${value}" ${selected === value ? "selected" : ""}>${payoutStatusLabel(value)}</option>`).join("");
  }
}

async function refreshAll() {
  await loadSummary();
  await loadSettings();
  await loadShopifyConnection();
  await loadSystemHealth();
  await loadDashboardFinance();
  await loadIncome();
  await loadSuppliers();
  await loadMaterials();
  await loadInvoices();
  await loadCosts();
  await loadKits();
}

function setActiveView(view) {
  $$(".tab,.view").forEach((el) => el.classList.remove("active"));
  $(`.tab[data-view="${view}"]`)?.classList.add("active");
  $(`#${view}`)?.classList.add("active");
  const title = $(`.tab[data-view="${view}"]`)?.textContent || "Mua Ops";
  $("#pageTitle").textContent = title;
  if (view === "audit") loadAudit().catch((error) => toast(error.message));
  if (view === "dashboard") requestAnimationFrame(() => renderDashboardCharts());
}

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setActiveView(tab.dataset.view)));
  document.body.addEventListener("click", async (event) => {
    const t = event.target.closest("button");
    if (!t) return;
    try {
      if (t.dataset.jumpView) setActiveView(t.dataset.jumpView);
      if (t.dataset.dashboardSpendView) {
        state.dashboardSpendView = t.dataset.dashboardSpendView;
        $$("[data-dashboard-spend-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.dashboardSpendView === state.dashboardSpendView));
        renderDashboard();
      }
      if (t.dataset.dashboardExpenseTrendView) {
        state.dashboardExpenseTrendView = t.dataset.dashboardExpenseTrendView;
        if (state.settings) state.settings.dashboard_monthly_view = state.dashboardExpenseTrendView;
        renderSettings();
        renderDashboard();
      }
      if (t.dataset.dashboardIncomeTrendView) {
        state.dashboardIncomeTrendView = t.dataset.dashboardIncomeTrendView;
        if (state.settings) state.settings.dashboard_income_monthly_view = state.dashboardIncomeTrendView;
        renderSettings();
        renderDashboard();
      }
      if (t.dataset.settingsSection) {
        state.settingsSection = t.dataset.settingsSection;
        renderSettings();
      }
      if (t.dataset.auditLane) {
        state.auditLane = t.dataset.auditLane;
        resetPagination("audit");
        $$("#auditLaneTabs button").forEach((button) => button.classList.toggle("is-active", button.dataset.auditLane === state.auditLane));
        await loadAudit();
      }
      if (t.dataset.pageTarget && t.dataset.pageAction) {
        const pagination = ensurePaginationState(t.dataset.pageTarget);
        if (t.dataset.pageAction === "prev") pagination.page = Math.max(1, pagination.page - 1);
        if (t.dataset.pageAction === "next") pagination.page += 1;
        rerenderPaginatedSection(t.dataset.pageTarget);
      }
      if (t.dataset.pageTarget && t.dataset.pageNumber) {
        ensurePaginationState(t.dataset.pageTarget).page = Number(t.dataset.pageNumber) || 1;
        rerenderPaginatedSection(t.dataset.pageTarget);
      }
      if (t.dataset.newInvoice !== undefined) showInvoiceEditor();
      if (t.dataset.closeInvoicePanels !== undefined) closeInvoicePanels();
      if (t.dataset.newPayout !== undefined) showPayoutEditor();
      if (t.dataset.closePayoutPanels !== undefined) closePayoutPanels();
      if (t.dataset.testShopifyConnection !== undefined) await testShopifyConnectionAction();
      if (t.dataset.syncShopifyNow !== undefined) await syncShopifyNow();
      if (t.dataset.saveShopifyConnection !== undefined) await saveShopifyConnection($("#shopifyConnectionForm"));
      if (t.dataset.refreshDiagnostics !== undefined) await loadSystemHealth();
      if (t.dataset.createBackup !== undefined) await createSystemBackup();
      if (t.dataset.newMaterial !== undefined) showMaterialEditor();
      if (t.dataset.closeMaterialPanels !== undefined) closeMaterialPanels();
      if (t.dataset.newSupplier !== undefined) showSupplierEditor();
      if (t.dataset.closeSupplierPanels !== undefined) closeSupplierPanels();
      if (t.dataset.newKit !== undefined) showKitEditor();
      if (t.dataset.closeKitPanels !== undefined) closeKitPanels();
      if (t.dataset.resetForm) resetForm(t.dataset.resetForm);
      if (t.dataset.viewSupplier) {
        const item = state.suppliers.find((s) => s.id == t.dataset.viewSupplier);
        showSupplierEditor(item);
      }
      if (t.dataset.viewMaterial) {
        const item = state.materials.find((m) => m.id == t.dataset.viewMaterial);
        showMaterialEditor(item);
      }
      if (t.dataset.openAuditSupplier) {
        setActiveView("suppliers");
        const item = state.suppliers.find((s) => s.id == t.dataset.openAuditSupplier);
        showSupplierEditor(item);
      }
      if (t.dataset.openAuditMaterial) {
        setActiveView("materials");
        const item = state.materials.find((m) => m.id == t.dataset.openAuditMaterial);
        showMaterialEditor(item);
      }
      if (t.dataset.copyTechnicalLog) {
        const row = (state.technicalAudit || []).find((item) => String(item.id) === String(t.dataset.copyTechnicalLog));
        if (!row) throw new Error("No se encontró el log técnico");
        await copyToClipboard(buildTechnicalLogClipboardText(row));
        toast("Detalle técnico copiado");
      }
      if (t.dataset.openCost) {
        setActiveView("costs");
        await openCostDetail(t.dataset.openCost);
      }
      if (t.dataset.viewInvoice) {
        setActiveView("invoices");
        await openInvoiceWorkspace(t.dataset.viewInvoice);
      }
      if (t.dataset.closeCostDetail !== undefined) {
        $("#costDetailPanel")?.classList.add("hidden");
        state.selectedCostMaterialId = null;
      }
      if (t.dataset.openPayout) {
        setActiveView("income");
        await openPayout(t.dataset.openPayout);
      }
      if (t.dataset.editPayoutDetails) {
        const payout = await api(`/api/channel-payouts/${t.dataset.editPayoutDetails}`);
        showPayoutEditor(payout, true);
      }
      if (t.dataset.saveLine !== undefined) {
        const form = $("#lineForm");
        if (!form) throw new Error("No se encontró el formulario de línea");
        await saveLineForm(form);
      }
      if (t.dataset.openLineForm) await openInvoice(state.selectedInvoiceId, { openForm: true });
      if (t.dataset.closeLineForm !== undefined) await openInvoice(state.selectedInvoiceId, { openForm: false });
      if (t.dataset.closeInvoiceDetail !== undefined) closeInvoicePanels();
      if (t.dataset.editInvoiceDetails) {
        const detail = await api(`/api/invoices/${t.dataset.editInvoiceDetails}`);
        showInvoiceEditor(detail.invoice, true);
      }
      if (t.dataset.saveKitItem !== undefined) {
        const form = $("#kitItemForm");
        if (!form) throw new Error("No se encontró el formulario del kit");
        await saveKitItem({ preventDefault() {}, currentTarget: form });
      }
      if (t.dataset.deleteMaterial) await archiveOrRestore(`/api/materials/${t.dataset.deleteMaterial}`, "Material archivado");
      if (t.dataset.restoreMaterial) await archiveOrRestore(`/api/materials/${t.dataset.restoreMaterial}/restore`, "Material restaurado");
      if (t.dataset.deleteSupplier) await archiveOrRestore(`/api/suppliers/${t.dataset.deleteSupplier}`, "Proveedor archivado");
      if (t.dataset.restoreSupplier) await archiveOrRestore(`/api/suppliers/${t.dataset.restoreSupplier}/restore`, "Proveedor restaurado");
      if (t.dataset.deletePayout) await archiveOrRestore(`/api/channel-payouts/${t.dataset.deletePayout}`, "Ingreso archivado");
      if (t.dataset.restorePayout) await archiveOrRestore(`/api/channel-payouts/${t.dataset.restorePayout}/restore`, "Ingreso restaurado");
      if (t.dataset.openKit) await openKitWorkspace(t.dataset.openKit);
      if (t.dataset.closeKitDetail !== undefined) $("#kitDetailPanel")?.classList.add("hidden");
      if (t.dataset.toggleKitComplete) {
        const current = Number(t.dataset.kitComplete || 0);
        await api(`/api/kit-recipes/${t.dataset.toggleKitComplete}`, { method: "PATCH", body: JSON.stringify({ is_complete: current ? 0 : 1 }) });
        await Promise.all([loadKits(), loadDashboardFinance()]);
        await openKit(t.dataset.toggleKitComplete);
        toast(current ? "Kit reabierto" : "Kit marcado como completo");
      }
      if (t.dataset.deleteKit) {
        await api(`/api/kit-recipes/${t.dataset.deleteKit}`, { method: "DELETE" });
        await Promise.all([loadKits(), loadDashboardFinance()]);
        closeKitPanels();
        toast("Kit archivado");
      }
      if (t.dataset.deleteKitItem) {
        await api(`/api/kit-recipes/${t.dataset.kitId}/items/${t.dataset.deleteKitItem}`, { method: "DELETE" });
        await Promise.all([loadKits(), loadDashboardFinance()]);
        await openKit(t.dataset.kitId);
        toast("Material archivado del kit");
      }
      if (t.dataset.duplicateInvoice) {
        const invoice = await api(`/api/invoices/${t.dataset.duplicateInvoice}/duplicate`, { method: "POST", body: "{}" });
        await Promise.all([loadInvoices(), loadSummary(), loadDashboardFinance()]);
        await openInvoiceWorkspace(invoice.id);
        toast("Factura duplicada");
      }
      if (t.dataset.deleteInvoice) await archiveOrRestore(`/api/invoices/${t.dataset.deleteInvoice}`, "Factura archivada");
      if (t.dataset.restoreInvoice) await archiveOrRestore(`/api/invoices/${t.dataset.restoreInvoice}/restore`, "Factura restaurada");
      if (t.dataset.editLine) {
        const detail = await api(`/api/invoices/${state.selectedInvoiceId}`);
        const line = detail.lines.find((item) => item.id == t.dataset.editLine);
        await openInvoice(state.selectedInvoiceId, { openForm: true });
        setForm($("#lineForm"), { ...line, invoice_id: state.selectedInvoiceId });
        const material = state.materials.find((item) => item.id == line.material_id);
        if (material) {
          for (const field of MATERIAL_HIERARCHY) {
            const input = $("#lineForm")?.elements[`line_${field.key}`];
            if (input) input.value = material[field.key] || "";
          }
          syncMaterialPicker($("#lineForm"), "line", { required: true });
          $("#lineForm").elements.material_id.value = String(material.id);
          syncMaterialPicker($("#lineForm"), "line", { required: true });
        }
        $("#lineFormTitle").textContent = `Editar línea #${line.id}`;
        updateLinePreview();
      }
      if (t.dataset.duplicateLine) {
        await api(`/api/invoices/${state.selectedInvoiceId}/lines/${t.dataset.duplicateLine}/duplicate`, { method: "POST", body: "{}" });
        await Promise.all([loadInvoices(), loadCosts(), loadSummary(), loadDashboardFinance()]);
        await openInvoice(state.selectedInvoiceId);
        toast("Línea duplicada");
      }
      if (t.dataset.deleteLine) await archiveOrRestore(`/api/invoices/${state.selectedInvoiceId}/lines/${t.dataset.deleteLine}`, "Línea archivada");
      if (t.dataset.restoreLine) await archiveOrRestore(`/api/invoices/${state.selectedInvoiceId}/lines/${t.dataset.restoreLine}/restore`, "Línea restaurada");
    } catch (error) {
      clientLog("ui_click_error", { message: error.message, dataset: { ...t.dataset } }, "error");
      toast(error.message);
    }
  });

  $("#materialForm")?.addEventListener("submit", saveMaterial);
  $("#supplierForm")?.addEventListener("submit", saveSupplier);
  $("#invoiceForm")?.addEventListener("submit", saveInvoice);
  $("#kitForm")?.addEventListener("submit", saveKit);
  $("#payoutForm")?.addEventListener("submit", savePayout);
  $("#settingsForm")?.addEventListener("submit", saveSettings);
  document.body.addEventListener("submit", (event) => {
    if (event.target.id !== "lineForm") return;
    event.preventDefault();
    event.stopPropagation();
    saveLineForm(event.target).catch((error) => {
      clientLog("line_submit_error", { message: error.message }, "error");
      toast(error.message);
    });
  }, true);

  document.body.addEventListener("input", (event) => {
    if (event.target.closest("#lineForm")) updateLinePreview();
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.closest("#lineForm")) updateLinePreview();
    if (event.target.closest("#lineForm") && event.target.name?.startsWith("line_")) syncMaterialPicker($("#lineForm"), "line", { required: true });
    if (event.target.closest("#lineForm") && event.target.name === "material_id") syncMaterialPicker($("#lineForm"), "line", { required: true });
    if (event.target.closest("#kitItemForm") && event.target.name?.startsWith("kit_")) syncMaterialPicker($("#kitItemForm"), "kit", { required: true });
    if (event.target.closest("#kitItemForm") && event.target.name === "material_id") syncMaterialPicker($("#kitItemForm"), "kit", { required: true });
    if (event.target.matches("[data-page-size-target]")) {
      const key = event.target.dataset.pageSizeTarget;
      const pagination = ensurePaginationState(key);
      pagination.pageSize = Number(event.target.value) || pagination.pageSize;
      pagination.page = 1;
      rerenderPaginatedSection(key);
    }
  });

  [
    ["#materialSearch", renderMaterials, "materials"],
    ["#materialCategoryFilter", renderMaterials, "materials"],
    ["#materialSupplierFilter", renderMaterials, "materials"],
    ["#materialUsageFilter", renderMaterials, "materials"],
    ["#materialFamilyFilter", renderMaterials, "materials"],
    ["#materialSubfamilyFilter", renderMaterials, "materials"],
    ["#materialVariantFilter", renderMaterials, "materials"],
    ["#materialBaseFilter", renderMaterials, "materials"],
    ["#materialFinishFilter", renderMaterials, "materials"],
    ["#materialOutletFilter", renderMaterials, "materials"],
    ["#materialSort", renderMaterials, "materials"],
    ["#supplierSearch", renderSuppliers, "suppliers"],
    ["#supplierCategoryFilter", renderSuppliers, "suppliers"],
    ["#supplierSort", renderSuppliers, "suppliers"],
    ["#invoiceSearch", renderInvoices, "invoices"],
    ["#invoiceSupplierFilter", renderInvoices, "invoices"],
    ["#invoiceCategoryFilter", renderInvoices, "invoices"],
    ["#invoiceStatusFilter", renderInvoices, "invoices"],
    ["#invoiceLineFilter", renderInvoices, "invoices"],
    ["#invoiceFromFilter", renderInvoices, "invoices"],
    ["#invoiceToFilter", renderInvoices, "invoices"],
    ["#invoiceSort", renderInvoices, "invoices"],
    ["#payoutSearch", renderPayouts, "payouts"],
    ["#payoutChannelFilter", renderPayouts, "payouts"],
    ["#payoutStatusFilter", renderPayouts, "payouts"],
    ["#payoutFromFilter", renderPayouts, "payouts"],
    ["#payoutToFilter", renderPayouts, "payouts"],
    ["#payoutSort", renderPayouts, "payouts"],
    ["#costSearch", renderCosts, "costs"],
    ["#costCategoryFilter", renderCosts, "costs"],
    ["#costSort", renderCosts, "costs"],
    ["#costOnlyWithPurchases", renderCosts, "costs"],
  ].forEach(([selector, handler, pageKey]) => {
    const node = $(selector);
    if (!node) return;
    const eventName = node.tagName === "INPUT" && node.type !== "checkbox" ? "input" : "change";
    node.addEventListener(eventName, debounce(() => {
      if (pageKey) resetPagination(pageKey);
      handler();
    }, eventName === "input" ? 120 : 0));
  });

  $("#materialsDeleted")?.addEventListener("change", () => {
    resetPagination("materials");
    loadMaterials();
  });
  $("#suppliersDeleted")?.addEventListener("change", () => {
    resetPagination("suppliers");
    loadSuppliers();
  });
  $("#invoicesDeleted")?.addEventListener("change", () => {
    resetPagination("invoices");
    loadInvoices();
  });
  $("#payoutsDeleted")?.addEventListener("change", () => {
    resetPagination("payouts");
    loadIncome();
  });
  $("#auditReset")?.addEventListener("click", () => {
    resetAuditFilters();
    resetPagination("audit");
    loadAudit().catch((error) => toast(error.message));
  });
  ["#auditQuery", "#auditEntity", "#auditAction", "#auditId", "#auditFrom", "#auditTo"].forEach((selector) => {
    $(selector)?.addEventListener(selector === "#auditQuery" || selector === "#auditId" ? "input" : "change", debounce(() => {
      resetPagination("audit");
      loadAudit().catch((error) => toast(error.message));
    }, selector === "#auditQuery" ? 180 : 0));
  });
  $("#technicalLogReset")?.addEventListener("click", () => {
    $("#technicalLogQuery").value = "";
    $("#technicalLogSource").value = "";
    $("#technicalLogLevel").value = "relevant";
    $("#technicalLogFrom").value = "";
    $("#technicalLogTo").value = "";
    state.technicalLogLevel = "relevant";
    resetPagination("technicalLogs");
    renderTechnicalLogs();
  });
  ["#technicalLogQuery", "#technicalLogSource", "#technicalLogLevel", "#technicalLogFrom", "#technicalLogTo"].forEach((selector) => {
    $(selector)?.addEventListener(selector === "#technicalLogQuery" ? "input" : "change", debounce(() => {
      if (selector === "#technicalLogLevel") state.technicalLogLevel = $("#technicalLogLevel")?.value || "relevant";
      resetPagination("technicalLogs");
      renderTechnicalLogs();
    }, selector === "#technicalLogQuery" ? 180 : 0));
  });
  $("#dashboardWindowPreset")?.addEventListener("change", async (event) => {
    state.dashboardWindowPreset = event.currentTarget.value || "all";
    if (state.dashboardWindowPreset !== "custom") {
      state.dashboardWindowFrom = "";
      state.dashboardWindowTo = "";
    }
    await loadDashboardFinance();
  });
  $("#dashboardFrom")?.addEventListener("change", async (event) => {
    state.dashboardWindowFrom = event.currentTarget.value || "";
    state.dashboardWindowPreset = "custom";
    await loadDashboardFinance();
  });
  $("#dashboardTo")?.addEventListener("change", async (event) => {
    state.dashboardWindowTo = event.currentTarget.value || "";
    state.dashboardWindowPreset = "custom";
    await loadDashboardFinance();
  });
  $("#dashboardGranularity")?.addEventListener("change", async (event) => {
    state.dashboardGranularity = event.currentTarget.value || "auto";
    await loadDashboardFinance();
  });

  window.addEventListener("resize", debounce(() => {
    Object.values(state.dashboardCharts).forEach((chart) => {
      if (chart && !(typeof chart.isDisposed === "function" && chart.isDisposed())) chart.resize();
    });
  }, 100));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      maybeRunShopifyAutoSync().catch((error) => clientLog("shopify_visibility_sync_error", { message: error.message }, "error"));
    }
  });
}

function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

async function init() {
  await loadViewModules();
  populateStaticFilters();
  bindEvents();
  await refreshAll();
  clientLog("app_init_success", { path: location.pathname });
}

window.addEventListener("error", (event) => {
  clientLog("window_error", { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno }, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  clientLog("unhandled_rejection", { message: event.reason?.message || String(event.reason) }, "error");
});

init().catch((error) => {
  clientLog("app_init_error", { message: error.message }, "error");
  toast(error.message);
});

