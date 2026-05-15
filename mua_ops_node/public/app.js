const state = {
  suppliers: [],
  materials: [],
  invoices: [],
  payouts: [],
  incomeSummary: null,
  incomeImports: [],
  costs: [],
  kits: [],
  settings: null,
  shopifyConnection: null,
  shopifySyncStatus: null,
  dashboardFinance: null,
  dashboardSpendView: "suppliers",
  dashboardExpenseTrendView: "total",
  dashboardIncomeTrendView: "cobros",
  dashboardCharts: {},
  selectedInvoiceId: null,
  selectedPayoutId: null,
  invoiceLineFormOpen: false,
  shopifyAutoSyncTimer: null
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
  fees: "Fees",
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
const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

function clientLog(action, context = {}, level = "info") {
  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, context, level })
  }).catch(() => {});
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value, fallback = "") {
  const raw = value ?? fallback;
  return escapeHtml(raw === "" ? fallback : raw);
}

function lower(value) {
  return String(value ?? "").toLocaleLowerCase("es");
}

function number(value) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  setTimeout(() => node.classList.remove("visible"), 2400);
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setForm(form, data) {
  for (const element of Array.from(form.elements)) {
    if (!element.name) continue;
    if (element.type === "checkbox") {
      element.checked = Boolean(data[element.name]);
    } else {
      element.value = data[element.name] ?? "";
    }
  }
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
  if (id === "payoutForm") $("#payoutFormTitle").textContent = "Nuevo cobro";
  if (id === "lineForm") {
    $("#lineFormTitle").textContent = "Nueva línea";
    form.elements.invoice_id.value = state.selectedInvoiceId || "";
    form.elements.affects_stock.checked = true;
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
              ${hierarchyParts(material).map((value) => badge(value)).join("")}
            </div>
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
    $("#payoutFormTitle").textContent = `Editar cobro #${payout.id}`;
  } else {
    $("#payoutFormTitle").textContent = "Nuevo cobro";
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

function activeMaterials() {
  return state.materials.filter((material) => !material.is_deleted);
}

function materialsMatching(filters = {}) {
  return activeMaterials().filter((material) => MATERIAL_HIERARCHY.every((field) => {
    const wanted = String(filters[field.key] || "").trim();
    if (!wanted) return true;
    return String(material[field.key] || "").trim() === wanted;
  }));
}

function hierarchyValueOptions(key, filters = {}) {
  const scopedFilters = { ...filters };
  delete scopedFilters[key];
  return Array.from(new Set(
    materialsMatching(scopedFilters)
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
  const filters = Object.fromEntries(MATERIAL_HIERARCHY.map((field) => [field.key, form.elements[`${context}_${field.key}`]?.value || ""]));
  for (const field of MATERIAL_HIERARCHY) {
    const select = form.elements[`${context}_${field.key}`];
    if (!select) continue;
    const options = hierarchyValueOptions(field.key, filters);
    const current = select.value;
    select.innerHTML = optionList(options, current, field.empty);
    if (current && !options.includes(current)) select.value = "";
  }
  const narrowedFilters = Object.fromEntries(MATERIAL_HIERARCHY.map((field) => [field.key, form.elements[`${context}_${field.key}`]?.value || ""]));
  const materialSelect = form.elements.material_id;
  if (!materialSelect) return;
  const selectedMaterialId = materialSelect.value;
  const matches = materialsMatching(narrowedFilters);
  materialSelect.innerHTML = filteredMaterialOptions(selectedMaterialId, required ? "Selecciona material" : "Sin material", matches);
  if (selectedMaterialId && !matches.some((material) => String(material.id) === String(selectedMaterialId))) {
    materialSelect.value = "";
  }
  const selected = activeMaterials().find((material) => String(material.id) === String(materialSelect.value));
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
  const s = await api("/api/summary");
  $("#summaryText").textContent = `${s.materials} materiales · ${s.suppliers} proveedores · ${s.invoices} facturas · ${s.payouts || 0} cobros · ${s.documents} documentos`;
}

async function loadDashboardFinance() {
  state.dashboardFinance = await api("/api/dashboard/finance");
  renderDashboard();
}

async function loadSettings() {
  state.settings = await api("/api/settings");
  state.dashboardExpenseTrendView = state.settings.dashboard_monthly_view || "total";
  state.dashboardIncomeTrendView = state.settings.dashboard_income_monthly_view || "cobros";
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

function dashboardChart(id) {
  if (!window.echarts) return null;
  const node = document.getElementById(id);
  if (!node) return null;
  const existing = state.dashboardCharts[id];
  if (existing) return existing;
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

function renderDashboardCharts() {
  if (!$("#dashboard")?.classList.contains("active")) return;
  const finance = state.dashboardFinance;
  if (!finance || !window.echarts) return;
  const expenseKey = state.dashboardExpenseTrendView || "total";
  const incomeKey = state.dashboardIncomeTrendView || "cobros";
  const colors = chartColors();
  const months = finance.monthly_breakdown?.months?.length ? finance.monthly_breakdown.months : finance.monthly_spend.map((row) => row.month);
  const monthLabels = compactMonths(months);
  const expenseValues = finance.monthly_breakdown?.series?.[expenseKey]?.length
    ? finance.monthly_breakdown.series[expenseKey]
    : finance.monthly_spend.map((row) => row.total);
  const incomeValues = finance.monthly_breakdown?.series?.[incomeKey]?.length
    ? finance.monthly_breakdown.series[incomeKey]
    : finance.monthly_breakdown?.series?.cobros || [];
  const balanceValues = finance.monthly_breakdown?.series?.balance || months.map((_, index) => number(finance.monthly_breakdown?.series?.cobros?.[index]) - number(finance.monthly_breakdown?.series?.total?.[index]));

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
      data: monthLabels,
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
      data: monthLabels,
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
      data: monthLabels,
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
        itemStyle: { color: colors.total, borderRadius: [6, 6, 0, 0] },
        data: finance.monthly_breakdown?.series?.total || []
      },
      {
        name: "Cobro neto",
        type: "bar",
        barMaxWidth: 22,
        itemStyle: { color: colors.cobros, borderRadius: [6, 6, 0, 0] },
        data: finance.monthly_breakdown?.series?.cobros || []
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
    legend: { bottom: 0, textStyle: { color: "#766e68" } },
    series: [{
      type: "pie",
      radius: ["48%", "74%"],
      center: ["50%", "44%"],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
      label: { color: "#171412", formatter: ({ name, percent }) => `${name}\n${percent}%` },
      data: finance.category_spend.map((row) => ({ name: row.category, value: row.total }))
    }]
  }, true);

  incomeMixChart.setOption({
    animationDuration: 400,
    color: [colors.shopify, colors.etsy, colors.bizum, colors.cobros],
    tooltip: { trigger: "item", valueFormatter: (value) => euro.format(Number(value || 0)) },
    legend: { bottom: 0, textStyle: { color: "#766e68" } },
    series: [{
      type: "pie",
      radius: ["48%", "74%"],
      center: ["50%", "44%"],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
      label: { color: "#171412", formatter: ({ name, percent }) => `${name}\n${percent}%` },
      data: finance.income_channels
        .map((row) => ({ name: channelLabel(row.channel), value: row.net_amount }))
        .filter((row) => number(row.value) > 0)
    }]
  }, true);
}

function renderDashboard() {
  const finance = state.dashboardFinance;
  if (!finance) return;

  const k = finance.kpis;
  const expenseLabel = DASHBOARD_EXPENSE_LABELS[state.dashboardExpenseTrendView] || DASHBOARD_EXPENSE_LABELS.total;
  const incomeLabel = DASHBOARD_INCOME_LABELS[state.dashboardIncomeTrendView] || DASHBOARD_INCOME_LABELS.cobros;
  $("#dashboardExpenseTitle").textContent = `Gastos mensuales · ${expenseLabel}`;
  $("#dashboardExpenseText").textContent = `Lectura mensual de ${expenseLabel.toLocaleLowerCase("es")} para seguir el peso real de los gastos.`;
  $("#dashboardIncomeTitle").textContent = `Cobros mensuales · ${incomeLabel}`;
  $("#dashboardIncomeText").textContent = `Seguimiento de ${incomeLabel.toLocaleLowerCase("es")} con la misma paleta del resto de la app.`;
  $("#dashboardCards").innerHTML = [
    ["Gasto total", euro.format(k.total_expense), `${k.invoice_count} facturas activas`],
    ["Cobrado neto", euro.format(k.total_net_received || 0), `${k.payout_count || 0} cobros activos`],
    ["Mes actual gasto", euro.format(k.current_month_expense), "Seguimiento mensual"],
    ["Mes actual cobrado", euro.format(k.current_month_net_received || 0), "Cobros del mes"],
    ["Balance del mes", euro.format(k.current_month_balance || 0), "Cobros menos gasto"],
    ["Fees del mes", euro.format(k.current_month_fees_received || 0), "Coste de cobro"],
    ["Borrador", k.draft_invoice_count, "Pendientes de cerrar"],
    ["Cobros pendientes", k.pending_payout_count || 0, "Pendientes o en tránsito"],
    ["Materiales", euro.format(k.materials_expense), "Coste de compras"],
    ["Marketing", euro.format(k.marketing_expense), "Publicidad y agencia"]
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
      label: "Cobros pendientes",
      count: operational.pending_payouts.length,
      hint: operational.pending_payouts[0]
        ? `${channelLabel(operational.pending_payouts[0].channel)} · ${text(operational.pending_payouts[0].payout_date)}`
        : "Todos los cobros están ejecutados",
      action: "income",
      tone: operational.pending_payouts.length ? "warn" : "ok"
    },
    {
      label: "Facturas en borrador",
      count: operational.draft_invoices.length,
      hint: operational.draft_invoices[0]
        ? `${text(operational.draft_invoices[0].supplier_name, "Sin proveedor")} · ${text(operational.draft_invoices[0].invoice_date)}`
        : "No quedan facturas en borrador",
      action: "invoices",
      tone: operational.draft_invoices.length ? "warn" : "ok"
    },
    {
      label: "Materiales sin imagen",
      count: operational.materials_without_image.length,
      hint: operational.materials_without_image[0] ? text(operational.materials_without_image[0].name) : "Catálogo visual al día",
      action: "materials",
      tone: operational.materials_without_image.length ? "warn" : "ok"
    },
    {
      label: "Materiales sin coste",
      count: operational.materials_without_cost.length,
      hint: operational.materials_without_cost[0] ? text(operational.materials_without_cost[0].name) : "Compras con coste medio resuelto",
      action: "costs",
      tone: operational.materials_without_cost.length ? "warn" : "ok"
    },
    {
      label: "Kits incompletos",
      count: operational.incomplete_kits.length,
      hint: operational.incomplete_kits[0]
        ? `${text(operational.incomplete_kits[0].name)}${operational.incomplete_kits[0].version ? ` · ${text(operational.incomplete_kits[0].version)}` : ""}`
        : "No hay kits pendientes",
      action: "kits",
      tone: operational.incomplete_kits.length ? "warn" : "ok"
    },
    {
      label: "Importaciones de cobros",
      count: operational.recent_payout_imports.length,
      hint: operational.recent_payout_imports[0]
        ? `${channelLabel(operational.recent_payout_imports[0].channel)} · ${text(operational.recent_payout_imports[0].source_file)}`
        : "Todavía no hay importaciones de cobros",
      action: "income",
      tone: operational.recent_payout_imports.length ? "ok" : "warn"
    }
  ];
  $("#dashboardOpsList").innerHTML = `<div class="ops-list">${opsRows.map((item) => `
    <button type="button" class="ops-item" data-jump-view="${item.action}">
      <span>
        <strong>${item.label}</strong>
        <p>${item.hint}</p>
      </span>
      <span>
        <span class="amount">${item.count}</span>
        ${badge(item.tone === "warn" ? "revisar" : "ok", item.tone)}
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

  requestAnimationFrame(() => renderDashboardCharts());
}

async function loadIncome() {
  const includeDeleted = $("#payoutsDeleted")?.checked ? 1 : 0;
  const [summary, payouts, imports] = await Promise.all([
    api("/api/income/summary"),
    api(`/api/channel-payouts?include_deleted=${includeDeleted}`),
    api("/api/income/imports")
  ]);
  state.incomeSummary = summary;
  state.payouts = payouts;
  state.incomeImports = imports;
  renderIncome();
}

function renderIncome() {
  const summary = state.incomeSummary;
  if (!summary) return;
  $("#incomeSummaryCards").innerHTML = [
    ["Cobrado neto", euro.format(number(summary.total_net_amount)), `${summary.payout_count || 0} cobros`],
    ["Bruto", euro.format(number(summary.total_gross_amount)), "Importe antes de fees"],
    ["Fees", euro.format(number(summary.total_fees_amount)), "Coste acumulado de cobro"],
    ["Mes actual", euro.format(number(summary.current_month_net_amount)), "Neto cobrado del mes"],
    ["Fees mes", euro.format(number(summary.current_month_fees_amount)), "Fees del mes"],
    ["Pendientes", summary.pending_count || 0, summary.last_payout_date ? `Último cobro ${text(summary.last_payout_date)}` : "Sin cobros todavía"]
  ].map(([label, value, hint]) => `
    <article class="card dashboard-kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `).join("");
  renderPayouts();
  renderIncomeImports();
}

function renderPayouts() {
  let rows = [...state.payouts];
  rows = applyTextSearch(rows, $("#payoutSearch")?.value, ["channel", "bank_reference", "raw_source_file", "notes"]);
  const channel = $("#payoutChannelFilter")?.value;
  const status = $("#payoutStatusFilter")?.value;
  const from = $("#payoutFromFilter")?.value;
  const to = $("#payoutToFilter")?.value;
  if (channel) rows = rows.filter((row) => row.channel === channel);
  if (status) rows = rows.filter((row) => row.status === status);
  if (from) rows = rows.filter((row) => String(row.payout_date || "") >= from);
  if (to) rows = rows.filter((row) => String(row.payout_date || "") <= to);
  rows = sortRows(rows, $("#payoutSort")?.value, {
    date_asc: (a, b) => String(a.payout_date).localeCompare(String(b.payout_date)),
    net_desc: (a, b) => number(b.net_amount) - number(a.net_amount),
    net_asc: (a, b) => number(a.net_amount) - number(b.net_amount),
    fees_desc: (a, b) => number(b.fees_amount) - number(a.fees_amount),
    channel_asc: (a, b) => lower(a.channel).localeCompare(lower(b.channel)) || String(b.payout_date).localeCompare(String(a.payout_date)),
    default: (a, b) => String(b.payout_date).localeCompare(String(a.payout_date))
  });
  $("#incomeResultText").textContent = `${rows.length} cobros visibles.`;
  $("#payoutList").innerHTML = rows.map((payout) => `
    <article class="invoice-card ${payout.is_deleted ? "deleted" : ""} ${state.selectedPayoutId == payout.id ? "active" : ""}">
      <button type="button" class="invoice-open" data-open-payout="${payout.id}">
        <span>
          <strong>${channelLabel(payout.channel)}</strong>
          <div class="meta">${text(payout.payout_date)}${payout.bank_reference ? ` · ${text(payout.bank_reference)}` : ""}</div>
        </span>
        <span class="amount">${euro.format(number(payout.net_amount))}</span>
      </button>
      <div class="tags">
        ${badge(channelLabel(payout.channel), payout.channel === "bizum" ? "ok" : "")}
        ${badge(payoutStatusLabel(payout.status), ["paid", "executed"].includes(payout.status) ? "ok" : "warn")}
        ${badge(`Bruto ${euro.format(number(payout.gross_amount))}`)}
        ${badge(`Fees ${euro.format(number(payout.fees_amount))}`)}
      </div>
      <div class="row-actions">
        <button data-open-payout="${payout.id}" type="button">Ver</button>
        ${payout.is_deleted ? `<button data-restore-payout="${payout.id}" type="button">Restaurar</button>` : `<button class="ghost danger-text" data-delete-payout="${payout.id}" type="button">Archivar</button>`}
      </div>
    </article>
  `).join("") || `<div class="empty-state">No hay cobros con esos filtros.</div>`;
}

function renderIncomeImports() {
  $("#payoutImportList").innerHTML = state.incomeImports.map((row) => `
    <article class="row">
      <div class="row-main">
        <strong>${channelLabel(row.channel)} · ${text(row.source_file)}</strong>
        <div class="meta">${text(row.created_at)} · ${row.rows_total} filas · ${row.rows_created} nuevas · ${row.rows_updated} actualizadas · ${row.rows_skipped} sin cambios</div>
        ${row.notes ? `<p>${text(row.notes)}</p>` : ""}
      </div>
      <div class="tags">${badge(payoutStatusLabel(row.status), row.status === "completed" ? "ok" : "warn")}</div>
    </article>
  `).join("") || `<div class="empty-state">Todavía no hay importaciones de cobros.</div>`;
}

async function openPayout(id) {
  const payout = state.payouts.find((row) => row.id == id) || await api(`/api/channel-payouts/${id}`);
  if (!payout) return;
  $("#payoutForm")?.classList.add("hidden");
  state.selectedPayoutId = payout.id;
  const panel = $("#payoutDetailPanel");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="selected-invoice">
      <div class="panel-head">
        <div>
          <h2>${channelLabel(payout.channel)} · ${text(payout.payout_date)}</h2>
          <p>${euro.format(number(payout.net_amount))} netos · ${payout.bank_reference ? text(payout.bank_reference) : "sin referencia bancaria"}</p>
        </div>
        <div class="row-actions">
          <button type="button" data-edit-payout-details="${payout.id}">Editar cobro</button>
          <button type="button" class="ghost" data-close-payout-panels>Cerrar</button>
        </div>
      </div>
      <div class="tags">
        ${badge(channelLabel(payout.channel))}
        ${badge(payoutStatusLabel(payout.status), ["paid", "executed"].includes(payout.status) ? "ok" : "warn")}
        ${badge(payout.currency || "EUR")}
        ${payout.channel === "etsy" ? badge("Depósito neto", "warn") : ""}
        ${payout.channel === "bizum" ? badge("Cobro directo", "ok") : ""}
      </div>
    </div>
    <div class="form-grid three">
      <div class="inline-note">Bruto: <strong>${euro.format(number(payout.gross_amount))}</strong></div>
      <div class="inline-note">Fees: <strong>${euro.format(number(payout.fees_amount))}</strong></div>
      <div class="inline-note">Neto: <strong>${euro.format(number(payout.net_amount))}</strong></div>
    </div>
    <div class="form-grid three">
      <div class="inline-note">Estado: <strong>${text(payoutStatusLabel(payout.status))}</strong></div>
      <div class="inline-note">Cuenta banco: <strong>${text(payout.bank_account_hint || "-")}</strong></div>
      <div class="inline-note">Referencia: <strong>${text(payout.bank_reference || "-")}</strong></div>
    </div>
    <div class="line-list">
      <article class="line-card">
        <div class="row-main">
          <strong>Origen</strong>
          <div class="meta">${text(payout.raw_source_file || "Creado manualmente")}</div>
          ${payout.external_id ? `<div class="meta">ID externo · ${text(payout.external_id)}</div>` : ""}
          ${payout.notes ? `<p>${text(payout.notes)}</p>` : ""}
        </div>
      </article>
    </div>
  `;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  renderPayouts();
}

function renderSettings() {
  const form = $("#settingsForm");
  if (!form || !state.settings) return;
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
}

function renderShopifyConnection() {
  const form = $("#shopifyConnectionForm");
  const statusNode = $("#shopifySyncStatus");
  const connection = state.shopifyConnection;
  const status = state.shopifySyncStatus;
  if (!form || !connection || !statusNode) return;
  form.querySelector('[name="store_domain"]').value = connection.store_domain || "";
  form.querySelector('[name="api_version"]').value = connection.api_version || "2026-01";
  form.querySelector('[name="admin_token"]').value = "";
  form.querySelector('[name="admin_token"]').placeholder = connection.admin_token_masked || "shpat_...";
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
        <strong>${connection.token_configured ? "Conexión configurada" : "Conexión pendiente"}</strong>
        <div class="meta">${connection.store_domain ? text(connection.store_domain) : "Todavía no hay dominio configurado"} · API ${text(connection.api_version || "2026-01")}</div>
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

async function maybeRunShopifyAutoSync() {
  if (!state.shopifySyncStatus?.sync_enabled) return;
  if (document.visibilityState !== "visible") return;
  const status = await api("/api/shopify/sync-status");
  state.shopifySyncStatus = status;
  renderShopifyConnection();
  if (!status.due || status.running) return;
  await api("/api/shopify/sync", { method: "POST", body: "{}" });
  await Promise.all([loadShopifyConnection(), loadMaterials(), loadIncome(), loadSummary(), loadDashboardFinance()]);
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
  $("#supplierResultText").textContent = `${rows.length} proveedores visibles.`;
  $("#supplierList").innerHTML = rows.map((supplier) => `
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
}

async function loadMaterials() {
  const includeDeleted = $("#materialsDeleted")?.checked ? 1 : 0;
  state.materials = await api(`/api/materials?include_deleted=${includeDeleted}`);
  refreshMaterialSelects();
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
  if (category) rows = rows.filter((material) => material.category === category);
  if (supplier) rows = rows.filter((material) => String(material.preferred_supplier_id || "") === String(supplier));
  rows = sortRows(rows, $("#materialSort")?.value, {
    category_asc: (a, b) => lower(a.category).localeCompare(lower(b.category)) || lower(a.name).localeCompare(lower(b.name)),
    stock_asc: (a, b) => number(a.manual_stock) - number(b.manual_stock),
    stock_desc: (a, b) => number(b.manual_stock) - number(a.manual_stock),
    default: (a, b) => lower(a.name).localeCompare(lower(b.name)),
    name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name))
  });
  $("#materialResultText").textContent = `${rows.length} materiales visibles.`;
  $("#materialList").innerHTML = rows.map((material) => `
    <article class="row material-row ${material.is_deleted ? "deleted" : ""}">
      <div class="material-thumb">${img(material.image_url)}</div>
      <div class="row-main">
        <strong>${text(material.name)}</strong>
        <div class="tags">
          ${badge(material.category)}
          ${badge(material.unit_label || "ud")}
          ${badge(material.preferred_supplier_name || "sin proveedor")}
          ${material.linked_product_count ? badge(`${material.linked_product_count} imagen`, "ok") : badge("sin imagen", "warn")}
          ${material.usage_type ? badge(material.usage_type) : ""}
          ${material.family ? badge(material.family) : ""}
          ${material.subfamily ? badge(material.subfamily) : ""}
          ${material.variant ? badge(material.variant) : ""}
          ${material.base_material ? badge(material.base_material) : ""}
          ${material.finish ? badge(material.finish) : ""}
        </div>
        <div class="meta">Stock ${material.manual_stock ?? "-"} · Reposición ${material.reorder_point ?? "-"} · Objetivo ${material.target_stock ?? "-"}</div>
        ${material.notes ? `<p>${text(material.notes)}</p>` : ""}
      </div>
      <div class="row-actions">
        <button data-view-material="${material.id}" type="button" class="ghost">Ver</button>
        ${material.is_deleted ? `<button data-restore-material="${material.id}" type="button">Restaurar</button>` : `<button class="ghost" data-delete-material="${material.id}" type="button">Archivar</button>`}
      </div>
    </article>
  `).join("") || `<div class="empty-state">No hay materiales con esos filtros.</div>`;
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
  $("#invoiceResultText").textContent = `${rows.length} facturas visibles.`;
  $("#invoiceList").innerHTML = rows.map((invoice) => {
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
      ${materialInvoice
        ? `<label class="check"><input name="affects_stock" type="checkbox" checked> Afecta a stock</label>`
        : `<input type="hidden" name="affects_stock" value="0">`}
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
  let rows = [...state.costs];
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
  $("#costResultText").textContent = `${rows.length} materiales visibles.`;
  $("#costTable").innerHTML = `
    <div class="cost-row header"><span>Material</span><span>Categoría</span><span>Proveedor</span><span>Coste medio</span><span>Último coste</span><span>Gasto</span><span>Lotes</span></div>
    ${rows.map((row) => `
      <div class="cost-row">
        <strong data-label="Material">${text(row.name)}</strong>
        <span data-label="Categoría">${text(row.category)}</span>
        <span data-label="Proveedor">${text(row.main_supplier_name || row.preferred_supplier_name || "")}</span>
        <span data-label="Coste medio">${row.weighted_avg_unit_cost_inc_vat == null ? "-" : euro.format(number(row.weighted_avg_unit_cost_inc_vat))}</span>
        <span data-label="Último coste">${row.last_unit_cost_inc_vat == null ? "-" : euro.format(number(row.last_unit_cost_inc_vat))}</span>
        <span data-label="Gasto">${euro.format(number(row.total_spend))}</span>
        <span data-label="Lotes">${row.purchase_lots || 0}</span>
      </div>
    `).join("")}
  `;
}

async function loadKits() {
  state.kits = await api("/api/kit-recipes");
  renderKits();
}

function renderKits() {
  const list = $("#kitList");
  if (!list) return;
  $("#kitResultText").textContent = `${state.kits.length} versiones definidas.`;
  list.innerHTML = state.kits.map((kit) => `
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
  const entity = encodeURIComponent($("#auditEntity").value || "");
  const id = encodeURIComponent($("#auditId").value || "");
  const rows = await api(`/api/audit-log?entity=${entity}&id=${id}`);
  $("#auditList").innerHTML = rows.map((row) => `
    <article class="row">
      <div class="row-main">
        <strong>${text(row.entity_type)} #${row.entity_id} · ${text(row.action)}</strong>
        <div class="meta">${text(row.created_at)} · ${text(row.actor)}</div>
      </div>
    </article>
  `).join("") || `<div class="empty-state">No hay cambios con esos filtros.</div>`;
}

async function saveMaterial(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
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
  toast("Cobro guardado");
}

async function runPayoutImport(channel) {
  const route = channel === "etsy" ? "/api/import/payouts/etsy" : "/api/import/payouts/shopify";
  const result = await api(route, { method: "POST", body: "{}" });
  await Promise.all([loadIncome(), loadSummary(), loadDashboardFinance()]);
  toast(`${channelLabel(channel)} importado · ${result.rows_created || 0} nuevas, ${result.rows_updated || 0} actualizadas`);
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  state.settings = await api("/api/settings", { method: "PATCH", body: JSON.stringify(data) });
  state.dashboardExpenseTrendView = state.settings.dashboard_monthly_view || "total";
  state.dashboardIncomeTrendView = state.settings.dashboard_income_monthly_view || "cobros";
  renderSettings();
  if (state.dashboardFinance) renderDashboard();
  toast("Configuración guardada");
}

function shopifyConnectionDataFromForm(form) {
  const field = (name) => form?.querySelector(`[name="${name}"]`);
  return {
    store_domain: field("store_domain")?.value.trim() || "",
    api_version: field("api_version")?.value.trim() || "2026-01",
    admin_token: field("admin_token")?.value.trim() || "",
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
  if (!data.admin_token) delete data.admin_token;
  state.shopifyConnection = await api("/api/shopify/connection", {
    method: "PATCH",
    body: JSON.stringify(data)
  });
  await loadShopifyConnection();
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
  await Promise.all([loadShopifyConnection(), loadMaterials(), loadIncome(), loadSummary(), loadDashboardFinance()]);
  toast("Shopify sincronizado");
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
  data.affects_stock = form.elements.affects_stock?.type === "checkbox" ? form.elements.affects_stock.checked : false;
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
      if (t.dataset.newInvoice !== undefined) showInvoiceEditor();
      if (t.dataset.closeInvoicePanels !== undefined) closeInvoicePanels();
      if (t.dataset.newPayout !== undefined) showPayoutEditor();
      if (t.dataset.closePayoutPanels !== undefined) closePayoutPanels();
      if (t.dataset.importShopifyPayouts !== undefined) await runPayoutImport("shopify");
      if (t.dataset.importEtsyPayouts !== undefined) await runPayoutImport("etsy");
      if (t.dataset.testShopifyConnection !== undefined) await testShopifyConnectionAction();
      if (t.dataset.syncShopifyNow !== undefined) await syncShopifyNow();
      if (t.dataset.saveShopifyConnection !== undefined) await saveShopifyConnection($("#shopifyConnectionForm"));
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
      if (t.dataset.deletePayout) await archiveOrRestore(`/api/channel-payouts/${t.dataset.deletePayout}`, "Cobro archivado");
      if (t.dataset.restorePayout) await archiveOrRestore(`/api/channel-payouts/${t.dataset.restorePayout}/restore`, "Cobro restaurado");
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
        setForm($("#lineForm"), { ...line, invoice_id: state.selectedInvoiceId, affects_stock: Boolean(line.affects_stock) });
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
  });

  [
    ["#materialSearch", renderMaterials],
    ["#materialCategoryFilter", renderMaterials],
    ["#materialSupplierFilter", renderMaterials],
    ["#materialSort", renderMaterials],
    ["#supplierSearch", renderSuppliers],
    ["#supplierCategoryFilter", renderSuppliers],
    ["#supplierSort", renderSuppliers],
    ["#invoiceSearch", renderInvoices],
    ["#invoiceSupplierFilter", renderInvoices],
    ["#invoiceCategoryFilter", renderInvoices],
    ["#invoiceStatusFilter", renderInvoices],
    ["#invoiceLineFilter", renderInvoices],
    ["#invoiceFromFilter", renderInvoices],
    ["#invoiceToFilter", renderInvoices],
    ["#invoiceSort", renderInvoices],
    ["#payoutSearch", renderPayouts],
    ["#payoutChannelFilter", renderPayouts],
    ["#payoutStatusFilter", renderPayouts],
    ["#payoutFromFilter", renderPayouts],
    ["#payoutToFilter", renderPayouts],
    ["#payoutSort", renderPayouts],
    ["#costSearch", renderCosts],
    ["#costCategoryFilter", renderCosts],
    ["#costSort", renderCosts],
    ["#costOnlyWithPurchases", renderCosts],
  ].forEach(([selector, handler]) => {
    const node = $(selector);
    if (!node) return;
    const eventName = node.tagName === "INPUT" && node.type !== "checkbox" ? "input" : "change";
    node.addEventListener(eventName, debounce(handler, eventName === "input" ? 120 : 0));
  });

  $("#materialsDeleted")?.addEventListener("change", loadMaterials);
  $("#suppliersDeleted")?.addEventListener("change", loadSuppliers);
  $("#invoicesDeleted")?.addEventListener("change", loadInvoices);
  $("#payoutsDeleted")?.addEventListener("change", loadIncome);
  $("#auditSearch")?.addEventListener("click", loadAudit);

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

