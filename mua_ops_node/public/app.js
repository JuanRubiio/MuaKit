const state = {
  suppliers: [],
  materials: [],
  invoices: [],
  payouts: [],
  incomeSummary: null,
  costs: [],
  kits: [],
  ordersProfitability: { active_set: null, fixed_sets: [], orders: [] },
  selectedFixedSetId: null,
  settings: null,
  shopifyConnection: null,
  shopifySyncStatus: null,
  systemHealth: null,
  systemTestHealth: null,
  dashboardFinance: null,
  dashboardLiveRefreshTimer: null,
  dashboardLiveRefreshInFlight: false,
  dashboardSpendView: "suppliers",
  dashboardExpenseTrendView: "total",
  dashboardIncomeTrendView: "cobros",
  dashboardMode: "operation",
  dashboardComparison: true,
  dashboardWindowPreset: "this_month",
  dashboardWindowFrom: "",
  dashboardWindowTo: "",
  dashboardGranularity: "auto",
  auditLane: "all",
  auditQuick: "week",
  selectedAuditId: null,
  settingsSection: "general",
  dashboardCharts: {},
  selectedInvoiceId: null,
  selectedPayoutId: null,
  incomeReviewFilter: "",
  invoiceReviewFilter: "",
  invoiceLineFormOpen: false,
  invoiceOpenLineAfterSave: false,
  invoiceEditorLineCount: 0,
  shopifyAutoSyncTimer: null,
  technicalAudit: [],
  technicalLogLevel: "relevant",
  pagination: {
    invoices: { page: 1, pageSize: 20 },
    payouts: { page: 1, pageSize: 20 },
    materials: { page: 1, pageSize: 24 },
    suppliers: { page: 1, pageSize: 20 },
    kits: { page: 1, pageSize: 20 },
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
const ENTITY_ICON_KEYS = {
  suppliers: {
    aliexpress: "aliexpress",
    shein: "shein",
    etsy: "etsy",
    malagapack: "malagapack",
    correos: "correos",
    meta: "meta",
    shopify: "shopify",
    likinagency: "likinagency",
    canva: "canva",
    capcut: "capcut",
    vodafone: "vodafone",
    otro: "otro"
  },
  payers: {
    "shopify payments": "shopify-payments",
    shopify_payments: "shopify-payments",
    shopify: "shopify",
    etsy: "etsy",
    bizum: "bizum",
    klarna: "klarna",
    visa: "visa",
    master: "mastercard",
    mastercard: "mastercard",
    manual: "manual",
    card: "card"
  },
  channels: {
    shopify: "shopify",
    etsy: "etsy",
    bizum: "bizum"
  }
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
  servicios: "#8a8178",
  software: "#7b6f85",
  otros: "#b7a992",
  cobros: "#166b5e",
  fees: "#b85d72",
  balance: "#c18a3a",
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
  sales_order_line: "Línea de pedido",
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
  shopify_sync_update: "Actualización sincronizada",
  fixed_set_update: "Cambio de set fijo",
  include_in_cost: "Incluido en coste",
  exclude_from_cost: "Excluido del coste"
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
  is_complete: "completo",
  include_in_cost: "incluido en coste",
  preferred_supplier_id: "proveedor preferente",
  is_outlet: "outlet",
  is_priority_restock: "reposición prioritaria",
  is_deleted: "archivado",
  document_id: "documento",
  original_name: "nombre original",
  stored_name: "archivo guardado"
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
  system: null,
  materials: null,
  invoices: null,
  operations: null,
  audit: null
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
    optionList,
    distinctValues,
    supplierOptions,
    img,
    entityIconKey,
    entityIconPath,
    entityIconMarkup,
    statusLabel,
    docLink,
    documentViewerMarkup,
    hierarchySummary,
    materialPickerMarkup,
    syncMaterialPicker,
    updateLinePreview,
    isMaterialInvoiceCategory,
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
    technicalLogLevel,
    technicalLogSource,
    technicalLogMessage,
    technicalLogContext,
    TECHNICAL_LOG_LEVELS,
    shopifyFreshnessState,
    syncFreshnessMarkup,
    chartColors,
    dashboardChart
  };
}

async function loadViewModules() {
  const context = createViewContext();
  const [dashboardModule, incomeModule, systemModule, materialsModule, invoicesModule, operationsModule, auditModule] = await Promise.all([
    import("/views-dashboard.mjs"),
    import("/views-income.mjs"),
    import("/views-system.mjs"),
    import("/views-materials.mjs"),
    import("/views-invoices.mjs"),
    import("/views-operations.mjs"),
    import("/views-audit.mjs")
  ]);
  viewModules.dashboard = dashboardModule.createDashboardViews(context);
  viewModules.income = incomeModule.createIncomeViews(context);
  viewModules.system = systemModule.createSystemViews(context);
  viewModules.materials = materialsModule.createMaterialViews(context);
  viewModules.invoices = invoicesModule.createInvoiceViews(context);
  viewModules.operations = operationsModule.createOperationViews(context);
  viewModules.audit = auditModule.createAuditViews(context);
}

function chartColors() {
  const settings = state.settings || {};
  return {
    total: settings.dashboard_color_total || DASHBOARD_TREND_COLORS.total,
    materiales: settings.dashboard_color_materiales || DASHBOARD_TREND_COLORS.materiales,
    marketing: settings.dashboard_color_marketing || DASHBOARD_TREND_COLORS.marketing,
    envios: settings.dashboard_color_envios || DASHBOARD_TREND_COLORS.envios,
    servicios: settings.dashboard_color_servicios || DASHBOARD_TREND_COLORS.servicios,
    software: settings.dashboard_color_software || DASHBOARD_TREND_COLORS.software,
    otros: settings.dashboard_color_otros || DASHBOARD_TREND_COLORS.otros,
    cobros: settings.dashboard_color_cobros || DASHBOARD_TREND_COLORS.cobros,
    fees: settings.dashboard_color_fees || DASHBOARD_TREND_COLORS.fees,
    balance: settings.dashboard_color_balance || DASHBOARD_TREND_COLORS.balance,
    shopify: settings.dashboard_color_shopify || "#166b5e",
    etsy: settings.dashboard_color_etsy || "#9f7234",
    bizum: settings.dashboard_color_bizum || "#c18a3a",
    channel_shopify: settings.dashboard_color_shopify || "#166b5e",
    channel_etsy: settings.dashboard_color_etsy || "#9f7234",
    channel_bizum: settings.dashboard_color_bizum || "#c18a3a",
    profit_sales: settings.dashboard_color_profit_sales || "#087c6d",
    profit_cost: settings.dashboard_color_profit_cost || "#bd4e68",
    profit_margin: settings.dashboard_color_profit_margin || "#cc7d13",
    sales_revenue: settings.dashboard_color_sales_revenue || "#087c6d",
    sales_orders: settings.dashboard_color_sales_orders || "#3b7f87",
    sales_ticket: settings.dashboard_color_sales_ticket || "#cc7d13",
    sales_previous: settings.dashboard_color_sales_previous || "#8a8178",
    margin_critical: settings.dashboard_color_margin_critical || "#b84c5f",
    margin_pressure: settings.dashboard_color_margin_pressure || "#d89a3a",
    margin_healthy: settings.dashboard_color_margin_healthy || "#18836f",
    cost_content: settings.dashboard_color_cost_content || "#bd4e68",
    cost_fixed: settings.dashboard_color_cost_fixed || "#d89a3a"
  };
}

function applyConfiguredColorVars() {
  const colors = chartColors();
  const root = document.documentElement;
  root.style.setProperty("--channel-shopify", colors.channel_shopify);
  root.style.setProperty("--channel-etsy", colors.channel_etsy);
  root.style.setProperty("--channel-bizum", colors.channel_bizum);
}

function shopifyFreshnessState(source = state.shopifySyncStatus || state.shopifyConnection || {}) {
  const running = Boolean(source.running || state.shopifySyncStatus?.running);
  const lastSync = source.last_sync_at || source.finished_at || state.shopifySyncStatus?.last_sync_at || state.shopifyConnection?.last_sync_at || "";
  if (running) return { tone: "syncing", label: "Sincronizando Shopify", hours: 0, lastSync };
  if (!lastSync) return { tone: "danger", label: "Sin sincronizar", hours: null, lastSync };
  const timestamp = new Date(lastSync);
  if (Number.isNaN(timestamp.getTime())) return { tone: "danger", label: "Sincronización desconocida", hours: null, lastSync };
  const hours = Math.max(0, (Date.now() - timestamp.getTime()) / 36e5);
  const sameDay = timestamp.toDateString() === new Date().toDateString();
  const label = hours < 1
    ? "Actualizado hace menos de 1 h"
    : hours < 24
      ? `Actualizado hace ${Math.round(hours)} h`
      : `Actualizado ${timestamp.toLocaleDateString("es-ES")}`;
  if (!sameDay) return { tone: "danger", label, hours, lastSync };
  if (hours > 5) return { tone: "warning", label, hours, lastSync };
  return { tone: "fresh", label, hours, lastSync };
}

function syncFreshnessMarkup(source = state.shopifySyncStatus || state.shopifyConnection || {}, className = "dashboard-freshness") {
  const freshness = shopifyFreshnessState(source);
  return `<span class="${className} is-${freshness.tone}"><i></i>${text(freshness.label)}</span>`;
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
  if (id === "payoutForm") {
    form.dataset.submitMode = "save";
    $("#payoutFormSubtitle").textContent = "Alta manual de un cobro o ingreso recibido.";
    $("#payoutFormStatusBadge").textContent = "Pagado";
    if ($("#payoutFooterSummary")) $("#payoutFooterSummary").textContent = "Ingreso manual";
    if ($("#payoutConfidenceLabel")) $("#payoutConfidenceLabel").textContent = "Media";
    if ($("#payoutConfidenceValue")) $("#payoutConfidenceValue").textContent = "60%";
    if ($("#payoutConfidenceBar")) $("#payoutConfidenceBar").style.width = "60%";
    $$("[data-payout-save-label]").forEach((button) => {
      const label = button.querySelector("[data-button-label]");
      if (label) label.textContent = "Guardar ingreso";
      else button.textContent = "Guardar ingreso";
    });
  }
  if (id === "materialForm") {
    form.dataset.submitMode = "save";
    if ($("#materialFormStatusBadge")) {
      $("#materialFormStatusBadge").textContent = "Borrador catálogo";
      $("#materialFormStatusBadge").className = "status-pill warn";
    }
    if ($("#materialFormSubtitle")) $("#materialFormSubtitle").textContent = "Completa la información del material para inventario, stock y costes.";
    $$("[data-material-save-label]").forEach((button) => {
      const label = button.querySelector("[data-button-label]");
      if (label) label.textContent = "Guardar material";
      else button.textContent = "Guardar material";
    });
  }
}

function payoutStatusLabel(value) {
  return PAYOUT_STATUS_LABELS[value] || value;
}

function channelLabel(value) {
  return CHANNEL_LABELS[value] || value;
}

function updatePayoutFormPreview() {
  const form = $("#payoutForm");
  if (!form) return;
  const gross = number(form.elements.gross_amount?.value);
  const fees = number(form.elements.fees_amount?.value);
  const net = number(form.elements.net_amount?.value) || Math.max(0, gross - fees);
  const status = form.elements.status?.value || "paid";
  const channel = form.elements.channel?.value || "shopify";
  const source = form.elements.raw_source_file?.value ? "Importado" : "Manual";
  $("#payoutFormStatusBadge").textContent = payoutStatusLabel(status);
  $("#payoutFormGrossPreview").textContent = euro.format(gross);
  $("#payoutFormFeesPreview").textContent = euro.format(fees);
  $("#payoutFormNetPreview").textContent = euro.format(net);
  $("#payoutFooterGross").textContent = euro.format(gross);
  $("#payoutFooterFees").textContent = euro.format(fees);
  $("#payoutFooterNet").textContent = euro.format(net);
  $("#payoutFooterSummary").textContent = source === "Importado" ? `Ingreso ${channelLabel(channel)} importado` : `Ingreso manual ${channelLabel(channel)}`;
  $("#payoutFormSourceLabel").innerHTML = entityIconLabelMarkup(channel, {
    type: "channel",
    label: `${source} · ${channelLabel(channel)}`,
    iconClass: "income-origin-avatar"
  });
  $("#payoutFormReferenceLabel").textContent = form.elements.bank_reference?.value?.trim() || "Pendiente";
  $("#payoutFormAccountLabel").textContent = form.elements.bank_account_hint?.value?.trim() || "Sin asignar";
}

function renderPayoutFormReview() {
  const form = $("#payoutForm");
  const review = $("#payoutFormReviewState");
  const suggestion = $("#payoutFormSuggestion");
  if (!form || !review || !suggestion) return;
  const hasReference = Boolean(form.elements.bank_reference?.value?.trim());
  const hasAccount = Boolean(form.elements.bank_account_hint?.value?.trim());
  const gross = number(form.elements.gross_amount?.value);
  const fees = number(form.elements.fees_amount?.value);
  const net = number(form.elements.net_amount?.value);
  const computedNet = gross ? Math.max(0, gross - fees) : net;
  const coherent = !gross || Math.abs(net - computedNet) <= 0.02;
  const ready = hasReference && hasAccount && net > 0;
  const score = (hasReference ? 25 : 0) + (hasAccount ? 25 : 0) + (coherent ? 25 : 0) + (net > 0 ? 25 : 0);
  const confidenceLabel = score >= 90 ? "Alta" : score >= 65 ? "Media" : "Baja";
  review.innerHTML = [
    ["Referencia pendiente", hasReference ? "La referencia del pedido o del banco ya está informada." : "Añade la referencia del banco o del pedido.", hasReference ? "OK" : "Pendiente", hasReference ? "ok" : "warn", hasReference ? "icon-check-circle" : "icon-alert"],
    ["Cuenta sin asignar", hasAccount ? "La cuenta donde entró el abono ya está indicada." : "Selecciona la cuenta o deja una pista del abono.", hasAccount ? "OK" : "Pendiente", hasAccount ? "ok" : "warn", hasAccount ? "icon-check-circle" : "icon-bank"],
    ["Importe válido", coherent ? "El neto es coherente con bruto y comisiones." : "Revisa bruto, neto o comisiones antes de guardar.", coherent ? "OK" : "Revisar", coherent ? "ok" : "warn", coherent ? "icon-check-circle" : "icon-alert"],
    ["Listo para ejecutar", ready ? "Todo correcto para registrar el ingreso." : "Completa referencia y cuenta para conciliar.", ready ? "OK" : "Pendiente", ready ? "ok" : "neutral", ready ? "icon-check-circle" : "icon-clock"]
  ].map(([label, hint, statusText, tone, icon]) => `
    <span class="${tone}">
      <span class="invoice-check-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
      <strong>${label}</strong>
      <small>${hint}</small>
      <em>${statusText}</em>
    </span>
  `).join("");
  suggestion.innerHTML = ready
    ? `<span class="invoice-check-icon ok" aria-hidden="true"><svg><use href="#icon-check-circle"></use></svg></span><div><strong>Listo para registrar</strong><small>Ya podemos guardar el ingreso con una conciliación bastante limpia.</small></div>`
    : `<span class="invoice-check-icon warn" aria-hidden="true"><svg><use href="#icon-plus"></use></svg></span><div><strong>Siguiente acción sugerida</strong><small>Completa referencia y cuenta para dejar este ingreso bien conciliado.</small></div>`;
  const labelNode = $("#payoutConfidenceLabel");
  const barNode = $("#payoutConfidenceBar");
  const valueNode = $("#payoutConfidenceValue");
  if (labelNode) labelNode.textContent = confidenceLabel;
  if (barNode) barNode.style.width = `${Math.max(12, score)}%`;
  if (valueNode) valueNode.textContent = `${score}%`;
}

function closeInvoicePanels() {
  state.invoiceEditorActive = false;
  $("#invoiceForm")?.classList.add("hidden");
  $("#invoiceDetailPanel")?.classList.add("hidden");
  $("#invoices .invoice-page")?.classList.remove("invoice-focus-mode");
  document.body.classList.remove("invoice-focus-active");
  state.selectedInvoiceId = null;
  state.invoiceLineFormOpen = false;
  state.invoiceOpenLineAfterSave = false;
  renderInvoices();
}

function updateInvoiceFormPreview() {
  const form = $("#invoiceForm");
  if (!form) return;
  const total = number(form.elements.total?.value);
  const status = form.elements.status?.value || "draft";
  $("#invoiceFormTotalPreview").textContent = euro.format(total);
  $("#invoiceFormStatusBadge").textContent = statusLabel(status);
  renderInvoiceFormReview();
}

function invoiceDocumentMeta(invoice = {}) {
  const fileName = text(invoice.document_name || invoice.document_stored_name || "");
  const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  if (["jpg", "jpeg"].includes(ext)) return { label: "JPG", hint: "Imagen actual de la factura." };
  if (ext === "png") return { label: "PNG", hint: "Imagen actual de la factura." };
  if (ext === "webp") return { label: "WEBP", hint: "Imagen actual de la factura." };
  if (ext === "pdf") return { label: "PDF", hint: "Documento actual de la factura." };
  if (ext) return { label: ext.toUpperCase(), hint: "Documento actual de la factura." };
  return { label: "DOC", hint: "Documento actual de la factura." };
}

function renderInvoiceWorkspaceLines(lines = []) {
  const mount = $("#invoiceFormLinesState");
  if (!mount) return;
  const activeLines = lines.filter((line) => !line.is_deleted);
  if (!activeLines.length) {
    mount.innerHTML = `
      <div class="invoice-lines-empty">
        <span class="file-dropzone-icon muted"><svg><use href="#icon-kit"></use></svg></span>
        <strong>Aún no hay líneas añadidas</strong>
        <small>Guarda la factura y añade una línea para registrar el gasto.</small>
      </div>
    `;
    return;
  }
  mount.innerHTML = `
    <div class="line-list invoice-line-table">
      ${activeLines.map((line, index) => {
        const summary = hierarchySummary({
          usage_type: line.material_usage_type,
          family: line.material_family,
          subfamily: line.material_subfamily,
          variant: line.material_variant,
          base_material: line.material_base_material,
          finish: line.material_finish
        });
        return `
          <article class="line-card workspace-line-card">
            <span class="line-index">${index + 1}</span>
            <div class="line-card-main ${line.material_image_url ? "with-image" : ""}">
              ${line.material_image_url ? `<div class="material-mini-thumb">${img(line.material_image_url)}</div>` : ""}
              <div>
                <strong>${text(line.material_name, "Sin material")}</strong>
                <div class="meta">${line.package_count} paquetes · ${line.units_per_package} ud/paquete · ${line.total_units} ud totales</div>
                ${summary ? `<div class="meta">${text(summary)}</div>` : ""}
                ${line.description ? `<p>${text(line.description)}</p>` : ""}
                ${number(line.impressions) > 0 ? `<div class="invoice-marketing-metrics"><span>${number(line.impressions).toLocaleString("es-ES")} impresiones</span><span>${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(number(line.line_total) / number(line.impressions))} € / imp.</span><span>${euro.format((number(line.line_total) / number(line.impressions)) * 1000)} CPM</span></div>` : ""}
              </div>
            </div>
            <span class="amount">${euro.format(number(line.unit_price))} / ud</span>
            <strong class="amount">${euro.format(number(line.line_total))}</strong>
            <span class="line-readonly-flag">${badge("Registrada", "ok")}</span>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderInvoiceFormReview(invoice = null) {
  const form = $("#invoiceForm");
  const review = $("#invoiceFormReviewState");
  if (!form || !review) return;
  const hasSupplier = Boolean(form.elements.supplier_id?.value);
  const hasTotal = number(form.elements.total?.value) > 0;
  const hasDocument = Boolean(form.elements.document_id?.value) || Boolean($("#documentFile")?.files?.length);
  const lineCount = number(invoice?.line_count ?? state.invoiceEditorLineCount);
  review.innerHTML = [
    ["Proveedor", hasSupplier ? "Proveedor seleccionado." : "Selecciona proveedor si aplica.", hasSupplier ? "OK" : "Revisar", hasSupplier ? "ok" : "warn", hasSupplier ? "icon-check-circle" : "icon-alert"],
    ["Total", hasTotal ? "Importe informado." : "Debe coincidir con el documento.", hasTotal ? "OK" : "Obligatorio", hasTotal ? "ok" : "warn", hasTotal ? "icon-check-circle" : "icon-alert"],
    ["Líneas", lineCount ? `${lineCount} línea${lineCount === 1 ? "" : "s"} registrada${lineCount === 1 ? "" : "s"}.` : "Se podrán añadir tras guardar.", lineCount ? "OK" : "Pendiente", lineCount ? "ok" : "warn", lineCount ? "icon-check-circle" : "icon-minus-circle"],
    ["Adjunto", hasDocument ? "Documento asociado." : "Opcional pero recomendable.", hasDocument ? "OK" : "Opcional", hasDocument ? "ok" : "neutral", hasDocument ? "icon-check-circle" : "icon-paperclip"]
  ].map(([label, hint, statusText, tone, icon]) => `
    <span class="${tone}">
      <span class="invoice-check-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
      <strong>${label}</strong>
      <small>${hint}</small>
      <em>${statusText}</em>
    </span>
  `).join("");
}

function showInvoiceEditor(source = null) {
  const form = $("#invoiceForm");
  const invoice = source?.invoice || source;
  const lines = source?.lines || [];
  state.invoiceEditorActive = true;
  const ensureInvoiceEditorFocus = () => {
    if (!state.invoiceEditorActive) return;
    $("#invoiceDetailPanel")?.classList.add("hidden");
    $("#invoiceForm")?.classList.remove("hidden");
  };
  ensureInvoiceEditorFocus();
  $("#invoices .invoice-page")?.classList.add("invoice-focus-mode");
  document.body.classList.add("invoice-focus-active");
  form.classList.remove("hidden");
  form.classList.toggle("is-editing", Boolean(invoice));
  state.invoiceOpenLineAfterSave = false;
  resetForm("invoiceForm");
  if (invoice) {
    state.selectedInvoiceId = invoice.id;
    state.invoiceEditorLineCount = lines.length ? lines.filter((line) => !line.is_deleted).length : number(invoice.line_count);
    setForm(form, invoice);
    $("#invoiceFormTitle").textContent = text(invoice.supplier_name, `Editar factura #${invoice.id}`);
    $("#invoiceFormSubtitle").textContent = `${text(invoice.invoice_number, "Sin referencia")} · ${text(invoice.invoice_date, "Sin fecha")}`;
    $("#invoiceFormStatusBadge").textContent = statusLabel(invoice.status);
    $("#invoiceFormTotalPreview").textContent = euro.format(number(invoice.total));
    $$("[data-invoice-save-label]").forEach((button) => {
      const label = button.querySelector("[data-button-label]");
      if (label) label.textContent = "Guardar cambios";
      else button.textContent = "Guardar cambios";
    });
    const docMeta = invoiceDocumentMeta(invoice);
    $("#invoiceFormDocumentState").innerHTML = invoice.document_stored_name
      ? `<div class="invoice-doc-file compact"><span class="doc-file-icon">${docMeta.label}</span><span><strong>${text(invoice.document_name, "Documento adjunto")}</strong><small>${docMeta.hint}</small></span></div>`
      : `<div class="inline-note">Esta factura no tiene adjunto guardado.</div>`;
    renderInvoiceWorkspaceLines(lines);
  } else {
    state.invoiceEditorLineCount = 0;
    state.selectedInvoiceId = null;
    $("#invoiceFormTitle").textContent = "Nueva factura";
    $("#invoiceFormSubtitle").textContent = "Completa los datos de la factura y guarda para añadir líneas.";
    $("#invoiceFormStatusBadge").textContent = "Borrador";
    $("#invoiceFormTotalPreview").textContent = euro.format(0);
    $$("[data-invoice-save-label]").forEach((button) => {
      const label = button.querySelector("[data-button-label]");
      if (label) label.textContent = "Guardar factura";
      else button.textContent = "Guardar factura";
    });
    $("#invoiceFormDocumentState").innerHTML = "";
    if (state.settings) {
      if (form.elements.status) form.elements.status.value = state.settings.default_invoice_status || "draft";
      if (form.elements.category) form.elements.category.value = state.settings.default_invoice_category || "materiales";
    }
    renderInvoiceWorkspaceLines([]);
  }
  updateInvoiceFormPreview();
  renderInvoiceFormReview(invoice);
  requestAnimationFrame(ensureInvoiceEditorFocus);
  setTimeout(ensureInvoiceEditorFocus, 50);
  setTimeout(ensureInvoiceEditorFocus, 250);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeMaterialPanels() {
  $("#materialForm")?.classList.add("hidden");
  $("#materials .materials-page")?.classList.remove("materials-focus-mode");
  document.body.classList.remove("materials-focus-active");
}

function showMaterialEditor(material = null) {
  const form = $("#materialForm");
  $("#materials .materials-page")?.classList.add("materials-focus-mode");
  document.body.classList.add("materials-focus-active");
  form.classList.remove("hidden");
  resetForm("materialForm");
  if (material) {
    setForm(form, material);
  }
  $$("[data-material-save-label]").forEach((button) => {
    const label = button.querySelector("[data-button-label]");
    if (label) label.textContent = material ? "Guardar cambios" : "Guardar material";
    else button.textContent = material ? "Guardar cambios" : "Guardar material";
  });
  renderMaterialWorkspace(material);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSupplierPanels() {
  $("#supplierForm")?.classList.add("hidden");
  $("#suppliers .suppliers-page")?.classList.remove("suppliers-focus-mode");
  document.body.classList.remove("suppliers-focus-active");
}

function showSupplierEditor(supplier = null) {
  const form = $("#supplierForm");
  form.classList.remove("hidden");
  $("#suppliers .suppliers-page")?.classList.add("suppliers-focus-mode");
  document.body.classList.add("suppliers-focus-active");
  resetForm("supplierForm");
  if (supplier) {
    setForm(form, supplier);
    $("#supplierFormTitle").textContent = supplier.name || `Editar proveedor #${supplier.id}`;
  } else {
    $("#supplierFormTitle").textContent = "Nuevo proveedor";
  }
  viewModules.operations?.renderSupplierWorkspace?.(supplier);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeKitPanels() {
  $("#kitForm")?.classList.add("hidden");
  $("#kitDetailPanel")?.classList.add("hidden");
  $("#kits .orders-page")?.classList.remove("orders-focus-mode");
}

function closePayoutPanels() {
  $("#payoutForm")?.classList.add("hidden");
  $("#payoutDetailPanel")?.classList.add("hidden");
  $("#income .income-page")?.classList.remove("income-focus-mode");
  document.body.classList.remove("income-focus-active");
  state.selectedPayoutId = null;
  renderPayouts();
}

function showKitEditor(kit = null, keepDetail = false) {
  const form = $("#kitForm");
  if (!keepDetail) $("#kitDetailPanel")?.classList.add("hidden");
  $("#kits .orders-page")?.classList.add("orders-focus-mode");
  form.classList.remove("hidden");
  resetForm("kitForm");
  if (kit) {
    setForm(form, kit);
    $("#kitFormTitle").textContent = kit.name || `Editar set #${kit.id}`;
  } else {
    $("#kitFormTitle").textContent = "Nuevo set fijo";
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPayoutEditor(payout = null, keepDetail = false) {
  const form = $("#payoutForm");
  if (!keepDetail) $("#payoutDetailPanel")?.classList.add("hidden");
  $("#income .income-page")?.classList.add("income-focus-mode");
  document.body.classList.add("income-focus-active");
  form.classList.remove("hidden");
  form.classList.toggle("is-editing", Boolean(payout));
  resetForm("payoutForm");
  if (payout) {
    setForm(form, payout);
    $("#payoutFormTitle").textContent = `Editar ingreso #${payout.id}`;
    $("#payoutFormSubtitle").textContent = `${channelLabel(payout.channel)} · ${text(payout.payout_date, "Sin fecha")} · ${euro.format(number(payout.net_amount))}`;
    $("#payoutFormStatusBadge").textContent = payoutStatusLabel(payout.status);
    $$("[data-payout-save-label]").forEach((button) => {
      const label = button.querySelector("[data-button-label]");
      if (label) label.textContent = "Guardar cambios";
      else button.textContent = "Guardar cambios";
    });
  } else {
    $("#payoutFormTitle").textContent = "Nuevo ingreso";
    $("#payoutFormSubtitle").textContent = "Alta manual de un cobro o ingreso recibido.";
    $("#payoutFormStatusBadge").textContent = "Pagado";
    if (state.settings) {
      if (form.elements.channel) {
        const defaultChannel = state.settings.default_payout_channel || "shopify";
        const radio = form.querySelector(`input[name="channel"][value="${defaultChannel}"]`);
        if (radio) radio.checked = true;
      }
      if (form.elements.status) form.elements.status.value = state.settings.default_payout_status || "paid";
      if (form.elements.currency) form.elements.currency.value = state.settings.currency || "EUR";
    }
    $$("[data-payout-save-label]").forEach((button) => {
      const label = button.querySelector("[data-button-label]");
      if (label) label.textContent = "Guardar ingreso";
      else button.textContent = "Guardar ingreso";
    });
  }
  updatePayoutFormPreview();
  renderPayoutFormReview();
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
  return url
    ? `<img src="${escapeHtml(url)}" loading="lazy" alt="" onerror="this.outerHTML='&lt;div class=&quot;image-empty&quot;&gt;&lt;/div&gt;'">`
    : `<div class="image-empty"></div>`;
}

function normalizeEntityIconKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function entityIconKey(value, type = "supplier") {
  const normalized = normalizeEntityIconKey(value);
  if (!normalized) {
    return type === "supplier" ? "otro" : type === "channel" ? "bizum" : "manual";
  }
  const map = type === "channel"
    ? ENTITY_ICON_KEYS.channels
    : type === "payer"
      ? ENTITY_ICON_KEYS.payers
      : ENTITY_ICON_KEYS.suppliers;
  return map[normalized] || (type === "supplier" ? "otro" : type === "channel" ? "bizum" : "manual");
}

function entityIconPath(value, type = "supplier") {
  return `/assets/entity-icons/${entityIconKey(value, type)}.svg`;
}

function entityIconMarkup(value, options = {}) {
  const type = options.type || "supplier";
  const className = options.className ? ` ${options.className}` : "";
  const label = options.label || value || type;
  return `<span class="entity-avatar${className}" aria-hidden="true"><img src="${escapeHtml(entityIconPath(value, type))}" loading="lazy" alt="${escapeHtml(label)}"></span>`;
}

function entityIconLabelMarkup(value, options = {}) {
  const type = options.type || "channel";
  const label = options.label || value || "";
  const iconClass = options.iconClass || "";
  const textClass = options.textClass ? ` ${options.textClass}` : "";
  return `${entityIconMarkup(value, { type, className: iconClass, label })}<span class="entity-label-text${textClass}">${escapeHtml(label)}</span>`;
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
  if (row.entity_type === "sales_order_line") return source.title || source.sku || `Línea de pedido #${row.entity_id}`;
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

function buildSystemTestClipboardText(testHealth) {
  const payload = testHealth || {};
  const suites = Array.isArray(payload.suites) ? payload.suites : [];
  const history = Array.isArray(payload.history) ? payload.history : [];
  const coverage = payload.coverage || null;
  return [
    `Estado: ${payload.status || "unknown"}`,
    `Resumen: ${payload.summary || "Sin ejecuciones registradas"}`,
    `Ultima ejecucion: ${payload.last_run_at || "Nunca"}`,
    `Duracion total: ${payload.duration_ms ? `${Math.round(payload.duration_ms / 1000)} s` : "-"}`,
    ...(coverage ? [
      `Cobertura backend (lineas): ${coverage.lines?.pct?.toFixed(1) || "0.0"}%`,
      `Cobertura backend (branches): ${coverage.branches?.pct?.toFixed(1) || "0.0"}%`,
      `Cobertura backend (funciones): ${coverage.functions?.pct?.toFixed(1) || "0.0"}%`,
      `Cobertura backend (statements): ${coverage.statements?.pct?.toFixed(1) || "0.0"}%`
    ] : []),
    "",
    "Suites:",
    ...(suites.length ? suites.map((suite) => [
      `- ${suite.label}: ${suite.status || "unknown"}`,
      `  Duracion: ${suite.duration_ms ? `${Math.round(suite.duration_ms / 1000)} s` : "-"}`,
      `  Salida: ${(suite.output || "").trim() || "Sin salida"}`
    ].join("\n")) : ["- Sin suites ejecutadas"]),
    "",
    "Historial reciente:",
    ...(history.length ? history.slice(0, 5).map((run) => `- ${run.last_run_at || "-"} · ${run.status || "unknown"} · ${run.duration_ms ? `${Math.round(run.duration_ms / 1000)} s` : "-"}`) : ["- Sin historial"])
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
  const impressions = number(form.elements.impressions?.value);
  const impressionMetric = preview.querySelector("[data-preview-impression]");
  if (impressionMetric) impressionMetric.textContent = impressions > 0
    ? `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(totals.lineTotal / impressions)} €`
    : "-";
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

function setupDashboardLiveRefresh() {
  if (state.dashboardLiveRefreshTimer) clearInterval(state.dashboardLiveRefreshTimer);
  const refreshDashboardIfVisible = async () => {
    if (state.dashboardLiveRefreshInFlight) return;
    if (document.visibilityState !== "visible") return;
    if (!$("#dashboard")?.classList.contains("active")) return;
    state.dashboardLiveRefreshInFlight = true;
    try {
      await loadDashboardFinance();
    } catch (error) {
      clientLog("dashboard_live_refresh_error", { message: error.message }, "error");
    } finally {
      state.dashboardLiveRefreshInFlight = false;
    }
  };
  state.dashboardLiveRefreshTimer = setInterval(refreshDashboardIfVisible, 30000);
}

async function loadSettings() {
  state.settings = await api("/api/settings");
  state.dashboardExpenseTrendView = state.settings.dashboard_monthly_view || "total";
  state.dashboardIncomeTrendView = state.settings.dashboard_income_monthly_view || "cobros";
  state.dashboardWindowPreset = state.settings.dashboard_window_preset || "this_month";
  state.dashboardGranularity = "auto";
  applyConfiguredColorVars();
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
  const [health, technicalAudit, testHealth] = await Promise.all([
    api("/api/system/health"),
    api("/api/audit-log?scope=technical&limit=50"),
    api("/api/system/test-health")
  ]);
  state.systemHealth = health;
  state.technicalAudit = technicalAudit;
  state.systemTestHealth = testHealth;
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
  if (mode === "week") {
    return keys.map((key) => {
      const [, month, day] = String(key || "").split("-");
      return month && day ? `sem ${day}/${month}` : key;
    });
  }
  if (mode === "quarter") return keys.map((key) => String(key || "").replace("-", " "));
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

async function loadMaterials() {
  const result = await viewModules.materials?.loadMaterials();
  if ($("#dashboard")?.classList.contains("active") && state.dashboardFinance) renderDashboard();
  return result;
}

function refreshMaterialSelects() {
  return viewModules.materials?.refreshMaterialSelects();
}

function refreshMaterialHierarchyFilters() {
  return viewModules.materials?.refreshMaterialHierarchyFilters();
}

function renderMaterials() {
  return viewModules.materials?.renderMaterials();
}

function renderMaterialWorkspace(material = null) {
  return viewModules.materials?.renderMaterialWorkspace(material);
}

async function loadInvoices() {
  return viewModules.invoices?.loadInvoices();
}

function renderInvoices() {
  return viewModules.invoices?.renderInvoices();
}

async function openInvoice(id, options = {}) {
  return viewModules.invoices?.openInvoice(id, options);
}

async function openInvoiceWorkspace(id) {
  return viewModules.invoices?.openInvoiceWorkspace(id);
}

function bindLineForm() {
  return viewModules.invoices?.bindLineForm();
}

async function loadSuppliers() {
  return viewModules.operations?.loadSuppliers();
}

function renderSuppliers() {
  return viewModules.operations?.renderSuppliers();
}

async function loadCosts() {
  state.costs = await api("/api/costs/materials");
  if ($("#materials")?.classList.contains("active")) renderMaterials();
}

async function openCostDetail(materialId) {
  const item = state.materials.find((material) => String(material.id) === String(materialId));
  setActiveView("materials");
  if (!item) {
    toast("No se encontro el material asociado al coste");
    return;
  }
  showMaterialEditor(item);
  requestAnimationFrame(() => {
    document.querySelector("#materialForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadKits() {
  const result = await viewModules.operations?.loadKits();
  if ($("#materials")?.classList.contains("active")) renderMaterials();
  return result;
}

function renderKits() {
  return viewModules.operations?.renderKits();
}

async function openKit(id) {
  return viewModules.operations?.openKit(id);
}

async function openKitWorkspace(id) {
  return viewModules.operations?.openKitWorkspace(id);
}

function bindKitItemForm() {
  return viewModules.operations?.bindKitItemForm();
}

function openOrderDetail(id) {
  return viewModules.operations?.openOrderDetail(id);
}

async function loadAudit() {
  return viewModules.audit?.loadAudit();
}

function resetAuditFilters() {
  return viewModules.audit?.resetAuditFilters();
}

async function refreshAfterShopifySync(result = {}) {
  const completed = (name) => result?.[name]?.status === "ok";
  const loaders = [
    loadShopifyConnection,
    loadSystemHealth,
    loadSummary,
    loadDashboardFinance
  ];
  if (completed("products") || completed("inventory")) loaders.push(loadMaterials, loadCosts);
  if (completed("orders")) loaders.push(loadKits);
  if (completed("payouts")) loaders.push(loadIncome);
  await Promise.all([...new Set(loaders)].map((loader) => loader()));
  window.dispatchEvent(new CustomEvent("mua:shopify-synced", { detail: result }));
}

window.muaRefreshExpenses = async function muaRefreshExpenses() {
  await Promise.all([loadInvoices(), loadCosts(), loadSummary(), loadDashboardFinance()]);
};

window.addEventListener("mua:expenses-changed", () => {
  window.muaRefreshExpenses?.().catch((error) => toast(error.message));
});

async function maybeRunShopifyAutoSync() {
  if (!state.shopifySyncStatus?.sync_enabled) return;
  if (document.visibilityState !== "visible") return;
  const status = await api("/api/shopify/sync-status");
  state.shopifySyncStatus = status;
  renderShopifyConnection();
  if (!status.due || status.running) return;
  const result = await api("/api/shopify/sync", { method: "POST", body: "{}" });
  await refreshAfterShopifySync(result);
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

function refreshSupplierSelects() {
  $$("select[name=preferred_supplier_id], select[name=supplier_id]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = supplierOptions(selected);
  });
  $("#invoiceSupplierFilter").innerHTML = supplierOptions($("#invoiceSupplierFilter").value, "Todos");
  $("#materialSupplierFilter").innerHTML = supplierOptions($("#materialSupplierFilter").value, "Todos");
}

async function saveMaterial(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const data = formObject(form);
    data.is_outlet = Boolean(form.elements.is_outlet?.checked);
    data.is_priority_restock = Boolean(form.elements.is_priority_restock?.checked);
    data.tracks_inventory = Boolean(form.elements.tracks_inventory?.checked);
    data.purchase_pack_size = number(data.purchase_pack_size || 1);
    data.minimum_order_quantity = number(data.minimum_order_quantity || 1);
    const id = data.id;
    delete data.id;
    const saved = await api(id ? `/api/materials/${id}` : "/api/materials", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
    await Promise.all([loadMaterials(), loadSummary(), loadDashboardFinance(), loadCosts(), loadKits()]);
    const current = state.materials.find((item) => item.id == saved.id) || saved;
    current.is_outlet = Boolean(current.is_outlet ?? data.is_outlet);
    current.is_priority_restock = Boolean(current.is_priority_restock ?? data.is_priority_restock);
    toast("Material guardado");
    try {
      showMaterialEditor(current);
    } catch (renderError) {
      clientLog("material_editor_refresh_error", { message: renderError.message, id: current.id }, "warn");
      renderMaterials();
    }
    if (form.dataset.submitMode === "save_and_cost") {
      setActiveView("materials");
      await openCostDetail(current.id);
    }
    form.dataset.submitMode = "save";
  } catch (error) {
    form.dataset.submitMode = "save";
    clientLog("material_save_error", { message: error.message }, "error");
    toast(error.message || "No se pudo guardar el material");
  }
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
  data.is_default = Boolean(form.elements.is_default?.checked);
  const id = data.id;
  delete data.id;
  const saved = await api(id ? `/api/kit-recipes/${id}` : "/api/kit-recipes", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
  await Promise.all([loadKits(), loadDashboardFinance()]);
  const current = state.kits.find((item) => item.id == saved.id) || saved;
  state.selectedFixedSetId = current.id;
  showKitEditor(current);
  await openKit(saved.id);
  toast("Set fijo guardado");
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
  toast("Componente añadido al set fijo");
}

function sanitizePayoutData(data = {}) {
  return {
    id: data.id,
    channel: data.channel,
    external_id: data.external_id,
    payout_date: data.payout_date,
    status: data.status,
    currency: data.currency,
    gross_amount: data.gross_amount,
    fees_amount: data.fees_amount,
    net_amount: data.net_amount,
    bank_reference: data.bank_reference,
    bank_account_hint: data.bank_account_hint,
    raw_source_file: data.raw_source_file,
    notes: data.notes
  };
}

async function savePayout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = sanitizePayoutData(formObject(form));
  const reconcileMode = form.dataset.submitMode === "reconcile";
  const gross = number(data.gross_amount);
  const fees = number(data.fees_amount);
  if (!String(data.net_amount || "").trim() && gross) {
    data.net_amount = String(Math.max(0, gross - fees));
  }
  if (!String(data.gross_amount || "").trim() && String(data.net_amount || "").trim()) {
    data.gross_amount = data.net_amount;
  }
  if (reconcileMode && data.bank_reference && data.bank_account_hint && ["in_transit"].includes(String(data.status || ""))) {
    data.status = "executed";
  }
  const id = data.id;
  delete data.id;
  const saved = await api(id ? `/api/channel-payouts/${id}` : "/api/channel-payouts", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(data)
  });
  form.dataset.submitMode = "save";
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
  state.dashboardWindowPreset = state.settings.dashboard_window_preset || "this_month";
  applyConfiguredColorVars();
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
  const result = await api("/api/shopify/sync", { method: "POST", body: "{}" });
  await refreshAfterShopifySync(result);
  toast("Shopify sincronizado");
}

async function createSystemBackup() {
  const backup = await api("/api/system/backup", { method: "POST", body: JSON.stringify({ reason: "ui-manual" }) });
  await loadSystemHealth();
  toast(`Backup creado · ${backup.reason}`);
}

async function runSystemTests() {
  await api("/api/system/test-health/run", { method: "POST", body: "{}" });
  await loadSystemHealth();
  toast("Tests de salud actualizados");
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
  $("#invoiceForm")?.classList.add("hidden");
  await openInvoice(saved.id, { openForm: Boolean(state.invoiceOpenLineAfterSave) });
  state.invoiceOpenLineAfterSave = false;
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
  await loadMaterials();
  await loadDashboardFinance();
  await loadIncome();
  await loadSuppliers();
  await loadInvoices();
  await loadCosts();
  await loadKits();
  renderSuppliers();
}

function setActiveView(view) {
  if (view !== "invoices") document.body.classList.remove("invoice-focus-active");
  if (view !== "income") document.body.classList.remove("income-focus-active");
  if (view !== "materials") document.body.classList.remove("materials-focus-active");
  if (view !== "suppliers") document.body.classList.remove("suppliers-focus-active");
  if (view !== "invoices") $("#invoices .invoice-page")?.classList.remove("invoice-focus-mode");
  if (view !== "income") $("#income .income-page")?.classList.remove("income-focus-mode");
  if (view !== "materials") $("#materials .materials-page")?.classList.remove("materials-focus-mode");
  if (view !== "suppliers") $("#suppliers .suppliers-page")?.classList.remove("suppliers-focus-mode");
  document.body.classList.toggle("income-view-active", view === "income");
  document.body.classList.toggle("materials-view-active", view === "materials");
  document.body.classList.toggle("suppliers-view-active", view === "suppliers");
  document.body.classList.toggle("kits-view-active", view === "kits");
  document.body.classList.toggle("audit-view-active", view === "audit");
  document.body.classList.toggle("settings-view-active", view === "settings");
  $$(".tab,.view").forEach((el) => el.classList.remove("active"));
  $(`.tab[data-view="${view}"]`)?.classList.add("active");
  $(`#${view}`)?.classList.add("active");
  const title = $(`.tab[data-view="${view}"]`)?.textContent || "Mua Ops";
  $("#pageTitle").textContent = title;
  if (view === "audit") loadAudit().catch((error) => toast(error.message));
  if (view === "dashboard") requestAnimationFrame(() => renderDashboardCharts());
  if (view === "income") requestAnimationFrame(() => renderPayouts());
  if (view === "kits") requestAnimationFrame(() => renderKits());
}

async function openDashboardContext(view, context = "") {
  setActiveView(view);
  if (!context) return;

  if (view === "materials" && context === "replenishment") {
    document.querySelector('[data-materials-section="replenishment"]')?.click();
    return;
  }
  if (view === "invoices" && context === "imports") {
    document.querySelector('[data-expense-section="imports"]')?.click();
    return;
  }
  if (view === "invoices" && context === "draft") {
    document.querySelector('[data-expense-section="registered"]')?.click();
    state.invoiceReviewFilter = "draft";
    if ($("#invoicesDeleted")) $("#invoicesDeleted").checked = false;
    if ($("#invoiceStatusFilter")) $("#invoiceStatusFilter").value = "draft";
    if ($("#invoiceLineFilter")) $("#invoiceLineFilter").value = "";
    if ($("#invoiceSupplierFilter")) $("#invoiceSupplierFilter").value = "";
    if ($("#invoiceSearch")) $("#invoiceSearch").value = "";
    resetPagination("invoices");
    await loadInvoices();
    return;
  }
  if (view === "kits" && context === "low_margin") {
    document.querySelector('[data-orders-section="orders"]')?.click();
    if ($("#orderStatusFilter")) $("#orderStatusFilter").value = "low_margin";
    if ($("#orderSort")) $("#orderSort").value = "margin_asc";
    resetPagination("kits");
    renderKits();
    return;
  }
  if (view === "income" && context === "pending") {
    state.incomeReviewFilter = "";
    if ($("#incomeStatusTabs")) $("#incomeStatusTabs").dataset.activeLane = "pending";
    resetPagination("payouts");
    renderPayouts();
  }
}

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setActiveView(tab.dataset.view)));
  document.body.addEventListener("click", async (event) => {
    const t = event.target.closest("button");
    if (!t) return;
    try {
      if (t.dataset.jumpView) await openDashboardContext(t.dataset.jumpView, t.dataset.jumpContext || "");
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
      if (t.dataset.dashboardMode) {
        state.dashboardMode = t.dataset.dashboardMode;
        renderDashboard();
      }
      if (t.dataset.incomeLane) {
        $("#incomeStatusTabs").dataset.activeLane = t.dataset.incomeLane;
        state.incomeReviewFilter = "";
        resetPagination("payouts");
        renderPayouts();
      }
      if (t.dataset.incomeReview) {
        state.incomeReviewFilter = t.dataset.incomeReview;
        $("#incomeStatusTabs").dataset.activeLane = "all";
        resetPagination("payouts");
        renderPayouts();
      }
      if (t.dataset.invoiceQuickStatus !== undefined) {
        state.invoiceReviewFilter = "";
        const quick = t.dataset.invoiceQuickStatus;
        if (quick === "archived") {
          $("#invoicesDeleted").checked = true;
          $("#invoiceStatusFilter").value = "";
        } else {
          $("#invoicesDeleted").checked = false;
          $("#invoiceStatusFilter").value = quick || "";
        }
        resetPagination("invoices");
        await loadInvoices();
      }
      if (t.dataset.invoiceReviewFilter) {
        const reviewFilter = t.dataset.invoiceReviewFilter === "all" ? "" : t.dataset.invoiceReviewFilter;
        state.invoiceReviewFilter = reviewFilter;
        $("#invoicesDeleted").checked = false;
        $("#invoiceStatusFilter").value = "";
        $("#invoiceLineFilter").value = "";
        $("#invoiceSupplierFilter").value = "";
        $("#invoiceSearch").value = "";
        if (reviewFilter === "draft") $("#invoiceStatusFilter").value = "draft";
        if (reviewFilter === "without_lines") $("#invoiceLineFilter").value = "without";
        resetPagination("invoices");
        await loadInvoices();
      }
      if (t.dataset.settingsSection) {
        state.settingsSection = t.dataset.settingsSection;
        renderSettings();
        if (["general", "dashboard", "cobros"].includes(state.settingsSection)) {
          requestAnimationFrame(() => {
            document.querySelector(`[data-settings-panel="${state.settingsSection}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
      if (t.dataset.discardSettings !== undefined) {
        renderSettings();
        renderShopifyConnection();
        toast("Cambios descartados");
      }
      if (t.dataset.auditLane) {
        state.auditLane = t.dataset.auditLane;
        resetPagination("audit");
        $$("#auditLaneTabs button").forEach((button) => button.classList.toggle("is-active", button.dataset.auditLane === state.auditLane));
        await loadAudit();
      }
      if (t.dataset.auditQuick) {
        await viewModules.audit?.setAuditQuick?.(t.dataset.auditQuick);
      }
      if (t.dataset.openAuditDetail) {
        viewModules.audit?.openAuditDetail?.(t.dataset.openAuditDetail);
      }
      if (t.dataset.closeAuditDetail !== undefined) {
        viewModules.audit?.closeAuditDetail?.();
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
      if (t.dataset.saveInvoiceAddLine !== undefined) state.invoiceOpenLineAfterSave = true;
      if (t.dataset.closeInvoicePanels !== undefined) closeInvoicePanels();
      if (t.dataset.newPayout !== undefined) showPayoutEditor();
      if (t.dataset.payoutSaveLabel !== undefined) $("#payoutForm").dataset.submitMode = "save";
      if (t.dataset.savePayoutReconcile !== undefined) $("#payoutForm").dataset.submitMode = "reconcile";
      if (t.dataset.closePayoutPanels !== undefined) closePayoutPanels();
      if (t.dataset.testShopifyConnection !== undefined) await testShopifyConnectionAction();
      if (t.dataset.syncShopifyNow !== undefined) await syncShopifyNow();
      if (t.dataset.saveShopifyConnection !== undefined) await saveShopifyConnection($("#shopifyConnectionForm"));
      if (t.dataset.refreshDiagnostics !== undefined) await loadSystemHealth();
      if (t.dataset.createBackup !== undefined) await createSystemBackup();
      if (t.dataset.runSystemTests !== undefined) await runSystemTests();
      if (t.dataset.newMaterial !== undefined) showMaterialEditor();
      if (t.dataset.materialLane) {
        state.materialLane = t.dataset.materialLane;
        resetPagination("materials");
        renderMaterials();
      }
      if (t.dataset.closeMaterialPanels !== undefined) closeMaterialPanels();
      if (t.dataset.materialSaveLabel !== undefined) $("#materialForm").dataset.submitMode = "save";
      if (t.dataset.saveMaterialCost !== undefined) $("#materialForm").dataset.submitMode = "save_and_cost";
      if (t.dataset.newSupplier !== undefined) showSupplierEditor();
      if (t.dataset.closeSupplierPanels !== undefined) closeSupplierPanels();
      if (t.dataset.supplierLane !== undefined) {
        const lane = t.dataset.supplierLane === "all" ? "" : t.dataset.supplierLane;
        $("#supplierStatusTabs").dataset.activeLane = lane;
        resetPagination("suppliers");
        renderSuppliers();
      }
      if (t.dataset.openSupplierCritical !== undefined) {
        $("#supplierStatusTabs").dataset.activeLane = "critical";
        resetPagination("suppliers");
        renderSuppliers();
      }
      if (t.dataset.openSupplierRecent !== undefined) {
        $("#supplierSort").value = "name_asc";
        $("#supplierSearch").value = "";
        resetPagination("suppliers");
        renderSuppliers();
      }
      if (t.dataset.supplierCategoryChip) {
        viewModules.operations?.applySupplierCategoryChip?.(t.dataset.supplierCategoryChip);
      }
      if (t.id === "supplierOpenMaterialsButton") {
        const supplierId = $("#supplierForm")?.elements.id?.value;
        setActiveView("materials");
        if (supplierId && $("#materialSupplierFilter")) $("#materialSupplierFilter").value = supplierId;
        resetPagination("materials");
        renderMaterials();
      }
      if (t.dataset.newKit !== undefined) showKitEditor();
      if (t.dataset.closeKitPanels !== undefined) closeKitPanels();
      if (t.dataset.ordersSection) {
        const section = t.dataset.ordersSection;
        $("#kits .orders-page")?.classList.remove("orders-focus-mode");
        $("#kitForm")?.classList.add("hidden");
        $("#kitDetailPanel")?.classList.add("hidden");
        $$(".orders-tabs [data-orders-section]").forEach((button) => button.classList.toggle("is-active", button.dataset.ordersSection === section));
        $$("[data-orders-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.ordersPanel !== section));
      }
      if (t.dataset.setTypeFilter !== undefined && t.tagName === "BUTTON") {
        viewModules.operations?.setOrderSetTypeFilter?.(t.dataset.setTypeFilter || "");
        document.querySelector('[data-orders-section="fixed"]')?.click();
      }
      if (t.dataset.orderStatusFilter) {
        const allowed = ["low_margin", "complete", "missing_set"];
        const value = allowed.includes(t.dataset.orderStatusFilter) ? t.dataset.orderStatusFilter : "missing";
        if ($("#orderStatusFilter")) $("#orderStatusFilter").value = value;
        resetPagination("kits");
        renderKits();
      }
      if (t.dataset.selectPreparationCandidates !== undefined) {
        viewModules.operations?.selectVisiblePreparationCandidates?.();
      }
      if (t.dataset.clearPreparationSelection !== undefined) {
        viewModules.operations?.clearPreparationSelection?.();
      }
      if (t.dataset.generatePreparationSheet !== undefined) {
        t.disabled = true;
        try {
          const result = await viewModules.operations?.generatePreparationSheet?.();
          await Promise.all([loadKits(), loadDashboardFinance()]);
          toast(`Hoja generada para ${result?.order_ids?.length || 0} pedidos`);
        } finally {
          t.disabled = false;
        }
      }
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
      if (t.dataset.copySystemTests !== undefined) {
        await copyToClipboard(buildSystemTestClipboardText(state.systemTestHealth));
        toast("Detalle de verificación copiado");
      }
      if (t.dataset.openCost) {
        await openCostDetail(t.dataset.openCost);
      }
      if (t.dataset.viewInvoice) {
        setActiveView("invoices");
        await openInvoiceWorkspace(t.dataset.viewInvoice);
      }
      if (t.dataset.openPayout) {
        setActiveView("income");
        await openPayout(t.dataset.openPayout);
      }
      if (t.dataset.editPayoutDetails) {
        const payout = await api(`/api/channel-payouts/${t.dataset.editPayoutDetails}`);
        showPayoutEditor(payout);
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
        $("#invoiceDetailPanel")?.classList.add("hidden");
        const detail = await api(`/api/invoices/${t.dataset.editInvoiceDetails}`);
        showInvoiceEditor(detail);
        $("#invoiceDetailPanel")?.classList.add("hidden");
        $("#invoiceForm")?.classList.remove("hidden");
        setTimeout(() => $("#invoiceDetailPanel")?.classList.add("hidden"), 0);
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
      if (t.dataset.selectFixedSet) {
        state.selectedFixedSetId = Number(t.dataset.selectFixedSet);
        renderKits();
      }
      if (t.dataset.editKit) {
        const kit = state.kits.find((item) => String(item.id) === String(t.dataset.editKit)) || (await api("/api/kit-recipes")).find((item) => String(item.id) === String(t.dataset.editKit));
        if (kit) showKitEditor(kit);
      }
      if (t.dataset.defaultKit) {
        await api(`/api/kit-recipes/${t.dataset.defaultKit}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) });
        await Promise.all([loadKits(), loadDashboardFinance()]);
        toast("Set por defecto actualizado");
      }
      if (t.dataset.syncOrderLines !== undefined) {
        t.disabled = true;
        const result = await api("/api/shopify/sync/orders", { method: "POST", body: JSON.stringify({ full: true }) });
        await refreshAfterShopifySync(result);
        toast("Desglose de pedidos actualizado");
      }
      if (t.dataset.openOrder) openOrderDetail(t.dataset.openOrder);
      if (t.dataset.closeKitDetail !== undefined) {
        $("#kitDetailPanel")?.classList.add("hidden");
        $("#kits .orders-page")?.classList.remove("orders-focus-mode");
      }
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
        const pricePerPackage = line.price_per_package ?? (number(line.package_count) ? number(line.line_total) / number(line.package_count) : line.line_total);
        setForm($("#lineForm"), { ...line, price_per_package: pricePerPackage, invoice_id: state.selectedInvoiceId, invoice_category: detail.invoice.category });
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
    if (event.target.id?.startsWith("invoice")) state.invoiceReviewFilter = "";
    if (event.target.closest("#invoiceForm")) updateInvoiceFormPreview();
    if (event.target.closest("#payoutForm")) {
      updatePayoutFormPreview();
      renderPayoutFormReview();
    }
    if (event.target.closest("#materialForm")) renderMaterialWorkspace();
    if (event.target.closest("#supplierForm")) viewModules.operations?.renderSupplierWorkspace?.();
    if (event.target.closest("#lineForm")) updateLinePreview();
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.id?.startsWith("invoice")) state.invoiceReviewFilter = "";
    if (event.target.closest("#invoiceForm")) updateInvoiceFormPreview();
    if (event.target.closest("#payoutForm")) {
      updatePayoutFormPreview();
      renderPayoutFormReview();
    }
    if (event.target.closest("#materialForm")) renderMaterialWorkspace();
    if (event.target.closest("#supplierForm")) viewModules.operations?.renderSupplierWorkspace?.();
    if (event.target.closest("#lineForm")) updateLinePreview();
    if (event.target.closest("#lineForm") && event.target.name?.startsWith("line_")) syncMaterialPicker($("#lineForm"), "line", { required: true });
    if (event.target.closest("#lineForm") && event.target.name === "material_id") syncMaterialPicker($("#lineForm"), "line", { required: true });
    if (event.target.closest("#kitItemForm") && event.target.name?.startsWith("kit_")) syncMaterialPicker($("#kitItemForm"), "kit", { required: true });
    if (event.target.closest("#kitItemForm") && event.target.name === "material_id") syncMaterialPicker($("#kitItemForm"), "kit", { required: true });
    if (event.target.matches("[data-order-fixed-set-select]")) {
      const select = event.target;
      api(`/api/orders/${select.dataset.orderFixedSetSelect}/fixed-set`, {
        method: "PATCH",
        body: JSON.stringify({ kit_recipe_id: select.value || null })
      }).then(() => loadKits())
        .then(() => openOrderDetail(select.dataset.orderFixedSetSelect))
        .then(() => toast("Set aplicado al pedido"))
        .catch((error) => toast(error.message));
    }
    if (event.target.matches("[data-order-type-select]")) {
      const select = event.target;
      const id = select.dataset.orderTypeSelect;
      const applyRecommended = Boolean(document.querySelector(`[data-order-type-apply-set="${id}"]`)?.checked);
      api(`/api/orders/${id}/type`, {
        method: "PATCH",
        body: JSON.stringify({ order_type: select.value || "", apply_recommended_set: applyRecommended })
      }).then(() => loadKits())
        .then(() => openOrderDetail(id))
        .then(() => toast("Tipologia actualizada"))
        .catch((error) => toast(error.message));
    }
    if (event.target.matches("[data-set-type-filter]")) {
      viewModules.operations?.setOrderSetTypeFilter?.(event.target.value || "");
    }
    if (event.target.matches("[data-preparation-order]")) {
      viewModules.operations?.togglePreparationOrder?.(event.target.dataset.preparationOrder, event.target.checked);
    }
    if (event.target.matches("[data-order-line-include]")) {
      const input = event.target;
      api(`/api/order-lines/${input.dataset.orderLineInclude}/include`, {
        method: "PATCH",
        body: JSON.stringify({ include_in_cost: input.checked })
      }).then(() => loadKits())
        .then(() => openOrderDetail(input.dataset.orderId))
        .then(() => toast(input.checked ? "Material incluido en coste" : "Material excluido del coste"))
        .catch((error) => toast(error.message));
    }
    if (event.target.matches("[data-kit-item-include]")) {
      const input = event.target;
      api(`/api/kit-recipes/${input.dataset.kitId}/items/${input.dataset.kitItemInclude}/include`, {
        method: "PATCH",
        body: JSON.stringify({ include_in_cost: input.checked })
      }).then(() => loadKits())
        .then(() => toast(input.checked ? "Componente incluido en el set" : "Componente desactivado del set"))
        .catch((error) => toast(error.message));
    }
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
    ["#supplierLeadFilter", renderSuppliers, "suppliers"],
    ["#supplierWebFilter", renderSuppliers, "suppliers"],
    ["#supplierSort", renderSuppliers, "suppliers"],
    ["#suppliersWithMaterials", renderSuppliers, "suppliers"],
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

    ["#orderSearch", renderKits, "kits"],
    ["#orderChannelFilter", renderKits, "kits"],
    ["#orderStatusFilter", renderKits, "kits"],
    ["#orderTypeFilter", renderKits, "kits"],
    ["#orderSetFilter", renderKits, "kits"],
    ["#orderMetalFilter", renderKits, "kits"],
    ["#orderPreparationFilter", renderKits, "kits"],
    ["#orderSort", renderKits, "kits"],
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
    state.dashboardWindowPreset = event.currentTarget.value || "this_month";
    if (state.dashboardWindowPreset !== "custom") {
      state.dashboardWindowFrom = "";
      state.dashboardWindowTo = "";
    }
    await loadDashboardFinance();
  });
  $("#dashboardFrom")?.addEventListener("change", async (event) => {
    state.dashboardWindowFrom = event.currentTarget.value || "";
    state.dashboardWindowPreset = "custom";
    renderDashboard();
  });
  $("#dashboardTo")?.addEventListener("change", async (event) => {
    state.dashboardWindowTo = event.currentTarget.value || "";
    state.dashboardWindowPreset = "custom";
    renderDashboard();
  });
  $("#dashboardGranularity")?.addEventListener("change", async (event) => {
    state.dashboardGranularity = event.currentTarget.value || "auto";
    await loadDashboardFinance();
  });
  $("#dashboardComparison")?.addEventListener("change", (event) => {
    state.dashboardComparison = Boolean(event.currentTarget.checked);
    renderDashboard();
  });
  $("#dashboardFilterTrigger")?.addEventListener("click", () => {
    const popover = $("#dashboardFilterPopover");
    const opening = popover?.classList.contains("hidden");
    popover?.classList.toggle("hidden", !opening);
    $("#dashboardFilterTrigger")?.setAttribute("aria-expanded", opening ? "true" : "false");
  });
  $("#dashboardPeriodOptions")?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-dashboard-period-option]");
    if (!option) return;
    state.dashboardWindowPreset = option.dataset.dashboardPeriodOption || "this_month";
    if (state.dashboardWindowPreset !== "custom") {
      state.dashboardWindowFrom = "";
      state.dashboardWindowTo = "";
    }
    renderDashboard();
  });
  $("#dashboardGranularityOptions")?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-dashboard-granularity-option]");
    if (!option) return;
    state.dashboardGranularity = option.dataset.dashboardGranularityOption || "auto";
    renderDashboard();
  });
  $("#dashboardFilterApply")?.addEventListener("click", async () => {
    $("#dashboardFilterPopover")?.classList.add("hidden");
    $("#dashboardFilterTrigger")?.setAttribute("aria-expanded", "false");
    await loadDashboardFinance();
  });
  $("#dashboardFilterReset")?.addEventListener("click", async () => {
    state.dashboardWindowPreset = "this_month";
    state.dashboardWindowFrom = "";
    state.dashboardWindowTo = "";
    state.dashboardGranularity = "auto";
    state.dashboardComparison = true;
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
      if ($("#dashboard")?.classList.contains("active")) loadDashboardFinance().catch((error) => clientLog("dashboard_visibility_refresh_error", { message: error.message }, "error"));
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
  setupDashboardLiveRefresh();
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
