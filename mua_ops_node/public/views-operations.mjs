export function createOperationViews(ctx) {
  const {
    state,
    $,
    $$,
    api,
    euro,
    text,
    number,
    lower,
    badge,
    img,
    entityIconMarkup,
    hierarchySummary,
    materialPickerMarkup,
    syncMaterialPicker,
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination,
    chartColors,
    dashboardChart,
    syncFreshnessMarkup,
    shopifyFreshnessState
  } = ctx;
  let selectedOrderSetType = "";
  const selectedPreparationOrders = new Set();

  async function loadSuppliers() {
    const includeDeleted = $("#suppliersDeleted")?.checked ? 1 : 0;
    state.suppliers = await api(`/api/suppliers?include_deleted=${includeDeleted}`);
    window.refreshSupplierSelects();
    refreshSupplierCategoryControls();
    renderSuppliersNew();
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
    if ($("#supplierResultText")) $("#supplierResultText").textContent = "";
    $("#supplierList").innerHTML = meta.rows.map((supplier) => `
      <article class="row ${supplier.is_deleted ? "deleted" : ""}">
        <div class="row-main">
          <div class="entity-row-head">
            ${entityIconMarkup(supplier.name, { type: "supplier", className: "supplier-avatar" })}
            <div>
          <strong>${text(supplier.name)}</strong>
          <div class="meta">${text(supplier.category, "Sin categoría")} ${supplier.lead_time_days ? `· ${supplier.lead_time_days} días` : ""}</div>
            </div>
          </div>
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

  function distinctSupplierCategories() {
    return Array.from(new Set(state.suppliers.map((supplier) => String(supplier.category || "").trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  function supplierCategoryValues() {
    const values = distinctSupplierCategories();
    return values.length ? values : ["materiales", "componentes", "packaging", "logistica", "plataforma", "servicios"];
  }

  function refreshSupplierCategoryControls() {
    const values = supplierCategoryValues();
    const filter = $("#supplierCategoryFilter");
    if (filter) {
      const selected = filter.value;
      filter.innerHTML = `<option value="">Todas</option>${values.map((value) => `<option value="${text(value)}" ${selected === value ? "selected" : ""}>${text(value)}</option>`).join("")}`;
    }
    const formCategory = $("#supplierFormCategory");
    if (formCategory) {
      const selected = formCategory.value;
      formCategory.innerHTML = values.map((value) => `<option value="${text(value)}" ${selected === value ? "selected" : ""}>${text(value)}</option>`).join("");
      if (selected && !values.includes(selected)) {
        formCategory.insertAdjacentHTML("afterbegin", `<option value="${text(selected)}" selected>${text(selected)}</option>`);
      }
    }
  }

  function supplierMaterials(supplier) {
    return state.materials.filter((material) => !material.is_deleted && String(material.preferred_supplier_id || "") === String(supplier?.id || ""));
  }

  function supplierInvoices(supplier) {
    return state.invoices.filter((invoice) => !invoice.is_deleted && String(invoice.supplier_id || "") === String(supplier?.id || ""));
  }

  function supplierStats(supplier) {
    const materials = supplierMaterials(supplier);
    const invoices = supplierInvoices(supplier);
    const spend = invoices.reduce((sum, invoice) => sum + number(invoice.total), 0);
    const lastInvoice = invoices.filter((invoice) => invoice.invoice_date).sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)))[0] || null;
    const multiplier = Math.max(1, number(state.settings?.reorder_alert_multiplier || 1.25) || 1.25);
    const criticalMaterials = materials.filter((material) => {
      const reorder = number(material.reorder_point);
      return reorder > 0 && number(material.effective_stock_qty) <= reorder * multiplier;
    });
    const missingCost = materials.filter((material) => {
      const cost = state.costs.find((row) => String(row.material_id) === String(material.id));
      return !cost || cost.weighted_avg_unit_cost_inc_vat == null;
    });
    return {
      materials,
      invoices,
      spend,
      lastInvoice,
      criticalMaterials,
      missingCost,
      hasWebsite: Boolean(String(supplier?.website || "").trim()),
      hasLead: number(supplier?.lead_time_days) > 0
    };
  }

  function supplierStatus(stats, supplier) {
    if (supplier?.is_deleted) return { label: "Archivado", tone: "warn" };
    if (stats.criticalMaterials.length) return { label: "Critico", tone: "danger" };
    if (!stats.hasWebsite || !stats.hasLead || !stats.materials.length) return { label: "Completar", tone: "warn" };
    return { label: "Activo", tone: "ok" };
  }

  function supplierLeadLabel(days) {
    const value = number(days);
    return value ? `${value} dias` : "Sin plazo";
  }

  function supplierLeadTone(days) {
    const value = number(days);
    if (!value) return "warn";
    if (value <= 7) return "ok";
    if (value <= 14) return "accent";
    return "warn";
  }

  function supplierFilteredRows() {
    let rows = applyTextSearch([...state.suppliers], $("#supplierSearch")?.value, ["name", "category", "website", "notes"]);
    const category = $("#supplierCategoryFilter")?.value;
    const lead = $("#supplierLeadFilter")?.value;
    const web = $("#supplierWebFilter")?.value;
    const lane = $("#supplierStatusTabs")?.dataset.activeLane || "";
    if (category) rows = rows.filter((supplier) => String(supplier.category || "") === String(category));
    if (lead === "short") rows = rows.filter((supplier) => number(supplier.lead_time_days) > 0 && number(supplier.lead_time_days) <= 7);
    if (lead === "medium") rows = rows.filter((supplier) => number(supplier.lead_time_days) >= 8 && number(supplier.lead_time_days) <= 14);
    if (lead === "long") rows = rows.filter((supplier) => number(supplier.lead_time_days) >= 15);
    if (web === "with") rows = rows.filter((supplier) => String(supplier.website || "").trim());
    if (web === "without") rows = rows.filter((supplier) => !String(supplier.website || "").trim());
    if ($("#suppliersWithMaterials")?.checked) rows = rows.filter((supplier) => supplierStats(supplier).materials.length > 0);
    if (lane) {
      rows = rows.filter((supplier) => {
        const stats = supplierStats(supplier);
        if (lane === "active") return !supplier.is_deleted;
        if (lane === "archived") return supplier.is_deleted;
        if (lane === "critical") return stats.criticalMaterials.length > 0;
        if (lane === "missing_web") return !stats.hasWebsite;
        if (lane === "missing_lead") return !stats.hasLead;
        if (lane === "missing_materials") return !stats.materials.length;
        return true;
      });
    }
    return sortRows(rows, $("#supplierSort")?.value, {
      category_asc: (a, b) => lower(a.category).localeCompare(lower(b.category)) || lower(a.name).localeCompare(lower(b.name)),
      lead_asc: (a, b) => number(a.lead_time_days || 9999) - number(b.lead_time_days || 9999),
      spend_desc: (a, b) => supplierStats(b).spend - supplierStats(a).spend,
      materials_desc: (a, b) => supplierStats(b).materials.length - supplierStats(a).materials.length,
      default: (a, b) => lower(a.name).localeCompare(lower(b.name)),
      name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name))
    });
  }

  function renderSupplierSummary(allRows) {
    const active = allRows.filter((supplier) => !supplier.is_deleted);
    const withMaterials = active.filter((supplier) => supplierStats(supplier).materials.length);
    const invoiceCount = state.invoices.filter((invoice) => !invoice.is_deleted && invoice.supplier_id).length;
    const totalSpend = state.invoices.filter((invoice) => !invoice.is_deleted && invoice.supplier_id).reduce((sum, invoice) => sum + number(invoice.total), 0);
    const leadValues = active.map((supplier) => number(supplier.lead_time_days)).filter(Boolean);
    const avgLead = leadValues.length ? Math.round(leadValues.reduce((sum, value) => sum + value, 0) / leadValues.length) : 0;
    const incomplete = active.filter((supplier) => {
      const stats = supplierStats(supplier);
      return !stats.hasWebsite || !stats.hasLead || !stats.materials.length;
    });
    const cards = [
      ["Proveedores activos", active.length, "Disponibles para compras", "icon-users", "accent"],
      ["Con materiales", withMaterials.length, "Asignados como preferentes", "icon-cube", "ok"],
      ["Gastos", invoiceCount, "Compras con proveedor", "icon-file", "neutral"],
      ["Gasto", euro.format(totalSpend), "Compras registradas", "icon-coin", "gold"],
      ["Plazo medio", avgLead ? `${avgLead} dias` : "-", "Tiempo de reposicion", "icon-clock", "rose"],
      ["Por completar", incomplete.length, "Web, plazo o materiales", "icon-alert", "warn"]
    ];
    $("#supplierSummaryCards").innerHTML = cards.map(([label, value, hint, icon, tone]) => `
      <article class="suppliers-summary-card tone-${tone}">
        <span class="suppliers-summary-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
        <span><small>${text(label)}</small><strong>${text(value)}</strong><em>${text(hint)}</em></span>
      </article>
    `).join("");
  }

  function renderSupplierCritical(allRows) {
    const critical = allRows.map((supplier) => ({ supplier, stats: supplierStats(supplier) }))
      .filter((item) => item.stats.criticalMaterials.length)
      .sort((a, b) => b.stats.criticalMaterials.length - a.stats.criticalMaterials.length)
      .slice(0, 4);
    $("#supplierCriticalCards").innerHTML = critical.length ? critical.map(({ supplier, stats }) => {
      const first = stats.criticalMaterials[0];
      const target = Math.max(1, number(first?.target_stock || first?.reorder_point || 1));
      const width = Math.min(100, Math.max(8, number(first?.effective_stock_qty) / target * 100));
      return `
        <button type="button" class="supplier-critical-card" data-view-supplier="${supplier.id}">
          <span class="supplier-critical-head">${entityIconMarkup(supplier.name, { type: "supplier", className: "supplier-avatar compact", label: supplier.name })}<span><strong>${text(supplier.name)}</strong><small>${text(stats.criticalMaterials.length)} materiales tensionados</small></span></span>
          <span class="supplier-critical-meter"><i style="width:${width}%"></i></span>
          <span class="supplier-critical-foot"><small>${text(first?.name || "Material sin nombre")}</small><strong>${text(first?.effective_stock_qty ?? "-")} / ${text(first?.reorder_point ?? "-")}</strong></span>
        </button>
      `;
    }).join("") : `<div class="empty-state small"><strong>Sin proveedores criticos</strong>La reposicion no senala proveedores tensionados.</div>`;
  }

  function renderSupplierReview(allRows) {
    const active = allRows.filter((supplier) => !supplier.is_deleted);
    const items = [
      ["critical", "Reposicion critica", active.filter((supplier) => supplierStats(supplier).criticalMaterials.length).length, "Materiales por debajo del aviso", "danger", "icon-alert"],
      ["missing_web", "Sin web", active.filter((supplier) => !supplierStats(supplier).hasWebsite).length, "Completa enlace de compra", "warn", "icon-link"],
      ["missing_lead", "Sin plazo", active.filter((supplier) => !supplierStats(supplier).hasLead).length, "Falta tiempo medio de entrega", "warn", "icon-clock"],
      ["missing_materials", "Sin materiales", active.filter((supplier) => !supplierStats(supplier).materials.length).length, "No suministra materiales preferentes", "accent", "icon-cube"],
      ["archived", "Archivados", allRows.filter((supplier) => supplier.is_deleted).length, "Fichas fuera de uso", "neutral", "icon-archive"]
    ];
    $("#supplierReviewQueue").innerHTML = items.map(([lane, label, count, hint, tone, icon]) => `
      <button type="button" class="invoice-review-item supplier-review-item invoice-review-${tone}" data-supplier-lane="${lane}">
        <span class="invoice-review-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
        <span class="invoice-review-copy"><strong>${text(label)}</strong><p>${text(hint)}</p></span>
        <span class="invoice-review-count">${text(count)}</span>
        <span class="review-chevron" aria-hidden="true">&rsaquo;</span>
      </button>
    `).join("");
  }

  function renderSupplierStatusTabs(allRows) {
    const lanes = [
      ["", "Todos", allRows.length],
      ["active", "Activos", allRows.filter((supplier) => !supplier.is_deleted).length],
      ["critical", "Criticos", allRows.filter((supplier) => supplierStats(supplier).criticalMaterials.length).length],
      ["missing_web", "Sin web", allRows.filter((supplier) => !supplierStats(supplier).hasWebsite).length],
      ["missing_materials", "Sin materiales", allRows.filter((supplier) => !supplierStats(supplier).materials.length).length]
    ];
    const active = $("#supplierStatusTabs")?.dataset.activeLane || "";
    $("#supplierStatusTabs").innerHTML = `<div class="invoice-status-strip">${lanes.map(([lane, label, count]) => `
      <button type="button" class="invoice-status-tab ${active === lane ? "is-active" : ""}" data-supplier-lane="${lane || "all"}">${text(label)}<span>${text(count)}</span></button>
    `).join("")}</div>`;
  }

  function renderSupplierRecent(allRows) {
    const recent = [...allRows].sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))).slice(0, 6);
    $("#supplierRecentList").innerHTML = recent.map((supplier) => {
      const stats = supplierStats(supplier);
      return `
        <button type="button" class="supplier-side-item" data-view-supplier="${supplier.id}">
          ${entityIconMarkup(supplier.name, { type: "supplier", className: "supplier-avatar", label: supplier.name })}
          <span><strong>${text(supplier.name)}</strong><small>${text(supplier.category || "Sin categoria")} - ${stats.materials.length} materiales</small></span>
        </button>
      `;
    }).join("") || `<div class="empty-state small">No hay proveedores recientes.</div>`;
  }

  function renderSuppliersNew() {
    refreshSupplierCategoryControls();
    const allRows = [...state.suppliers];
    const rows = supplierFilteredRows();
    const meta = paginateRows("suppliers", rows);
    if ($("#supplierResultText")) $("#supplierResultText").textContent = "";
    $("#supplierListMetaText").textContent = meta.total ? `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.total} proveedores filtrados.` : "No hay proveedores con esos filtros.";
    if ($("#supplierUpdatedMeta")) $("#supplierUpdatedMeta").textContent = "";
    renderSupplierSummary(allRows);
    renderSupplierCritical(allRows);
    renderSupplierReview(allRows);
    renderSupplierStatusTabs(allRows);
    renderSupplierRecent(allRows);
    $("#supplierList").innerHTML = `
      <div class="supplier-table-head">
        <span>Proveedor</span><span>Categoria</span><span>Plazo</span><span>Materiales</span><span>Gastos</span><span>Gasto</span><span>Estado</span><span>Acciones</span>
      </div>
      ${meta.rows.length ? meta.rows.map((supplier) => {
        const stats = supplierStats(supplier);
        const status = supplierStatus(stats, supplier);
        return `
          <article class="supplier-table-row ${supplier.is_deleted ? "deleted" : ""}">
            <span class="supplier-name-cell">
              ${entityIconMarkup(supplier.name, { type: "supplier", className: "supplier-avatar", label: supplier.name })}
              <span><strong>${text(supplier.name)}</strong><small>${supplier.website ? `<a href="${text(supplier.website)}" target="_blank" rel="noreferrer">${text(supplier.website)}</a>` : "Sin web"}</small></span>
            </span>
            <span>${badge(supplier.category || "Sin categoria")}</span>
            <span>${badge(supplierLeadLabel(supplier.lead_time_days), supplierLeadTone(supplier.lead_time_days))}</span>
            <span class="supplier-number-stack"><strong>${text(stats.materials.length)}</strong><small>${stats.criticalMaterials.length ? `${stats.criticalMaterials.length} a reponer` : "sin alertas"}</small></span>
            <span class="supplier-number-stack"><strong>${text(stats.invoices.length)}</strong><small>${stats.lastInvoice ? text(stats.lastInvoice.invoice_date) : "sin compras"}</small></span>
            <span class="amount">${euro.format(stats.spend)}</span>
            <span>${badge(status.label, status.tone)}</span>
            <span class="table-actions">
              <button type="button" class="icon-action" data-view-supplier="${supplier.id}" title="Ver proveedor"><svg><use href="#icon-eye"></use></svg></button>
              ${supplier.is_deleted ? `<button type="button" class="icon-action" data-restore-supplier="${supplier.id}" title="Restaurar"><svg><use href="#icon-check-circle"></use></svg></button>` : `<button type="button" class="icon-action danger-text" data-delete-supplier="${supplier.id}" title="Archivar"><svg><use href="#icon-archive"></use></svg></button>`}
            </span>
          </article>
        `;
      }).join("") : `<div class="empty-state"><strong>Sin proveedores visibles</strong>Ajusta la busqueda o limpia los filtros para recuperar la lista.</div>`}
    `;
    renderPagination("#supplierPagination", "suppliers", meta);
  }

  function renderSupplierWorkspace(supplier = null) {
    const form = $("#supplierForm");
    if (!form) return;
    refreshSupplierCategoryControls();
    const id = form.elements.id?.value || supplier?.id || "";
    const stored = id ? state.suppliers.find((item) => String(item.id) === String(id)) : null;
    const draft = {
      id,
      name: form.elements.name?.value || supplier?.name || "",
      category: form.elements.category?.value || supplier?.category || "",
      website: form.elements.website?.value || supplier?.website || "",
      lead_time_days: form.elements.lead_time_days?.value || supplier?.lead_time_days || "",
      notes: form.elements.notes?.value || supplier?.notes || "",
      is_deleted: stored?.is_deleted || supplier?.is_deleted || false
    };
    const stats = stored ? supplierStats(stored) : {
      materials: [],
      invoices: [],
      spend: 0,
      lastInvoice: null,
      criticalMaterials: [],
      missingCost: [],
      hasWebsite: Boolean(String(draft.website || "").trim()),
      hasLead: number(draft.lead_time_days) > 0
    };
    const status = supplierStatus(stats, draft);
    $("#supplierFormTitle").textContent = stored ? draft.name || `Proveedor #${id}` : "Nuevo proveedor";
    $("#supplierFormStatusBadge").textContent = stored ? status.label : "Ficha incompleta";
    $("#supplierFormStatusBadge").className = `status-pill ${stored ? status.tone : "warn"}`;
    $("#supplierFormSubtitle").textContent = stored
      ? `${draft.category || "Sin categoria"} - ${stats.materials.length} materiales - ${stats.invoices.length} facturas`
      : "Crea un nuevo proveedor para compras, materiales y gastos.";

    const websiteButton = $("#supplierOpenWebsiteButton");
    if (websiteButton) {
      websiteButton.classList.toggle("hidden", !draft.website);
      websiteButton.href = draft.website || "#";
    }
    const archiveButton = $("#supplierArchiveButton");
    if (archiveButton) {
      archiveButton.classList.toggle("hidden", !stored);
      archiveButton.dataset.deleteSupplier = stored ? stored.id : "";
    }

    $("#supplierFormMetrics").innerHTML = [
      ["Materiales", stats.materials.length, stats.criticalMaterials.length ? `${stats.criticalMaterials.length} a reponer` : "Asignados"],
      ["Gastos", stats.invoices.length, stats.lastInvoice ? `Último ${stats.lastInvoice.invoice_date}` : "Sin compras"],
      ["Gasto", euro.format(stats.spend), "Historial registrado"],
      ["Plazo", supplierLeadLabel(draft.lead_time_days), number(draft.lead_time_days) ? "Reposicion planificada" : "Completar"],
      ["Sin coste", stats.missingCost.length, "Materiales vinculados"]
    ].map(([label, value, hint]) => `
      <article class="supplier-workspace-kpi"><small>${text(label)}</small><strong>${text(value)}</strong><span>${text(hint)}</span></article>
    `).join("");

    $("#supplierCategoryChips").innerHTML = supplierCategoryValues().slice(0, 8).map((value) => `
      <button type="button" class="supplier-category-chip ${draft.category === value ? "is-active" : ""}" data-supplier-category-chip="${text(value)}">${text(value)}</button>
    `).join("");

    $("#supplierLinkedMaterials").innerHTML = stats.materials.length ? `
      <div class="supplier-linked-list">
        ${stats.materials.slice(0, 6).map((material) => `
          <button type="button" class="supplier-linked-item" data-view-material="${material.id}">
            <span class="supplier-linked-thumb">${img(material.image_url || material.image_url_override)}</span>
            <span><strong>${text(material.name)}</strong><small>${text(material.category || "material")} - stock ${text(material.effective_stock_qty ?? "-")} - reposicion ${text(material.reorder_point ?? "-")}</small></span>
            ${stats.criticalMaterials.some((row) => row.id === material.id) ? badge("reponer", "warn") : badge("ok", "ok")}
          </button>
        `).join("")}
      </div>
    ` : `<div class="empty-state small"><strong>Sin materiales vinculados</strong>Asigna este proveedor como preferente desde Materiales.</div>`;

    $("#supplierInvoiceHistory").innerHTML = stats.invoices.length ? `
      <div class="supplier-invoice-list">
        ${stats.invoices.slice().sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date))).slice(0, 5).map((invoice) => `
          <button type="button" class="supplier-invoice-item" data-view-invoice="${invoice.id}">
            <span><strong>${text(invoice.invoice_date || "Sin fecha")}</strong><small>${text(invoice.invoice_number || "Sin numero")} - ${text(invoice.category || "Sin categoria")}</small></span>
            <span class="amount">${euro.format(number(invoice.total))}</span>
          </button>
        `).join("")}
      </div>
    ` : `<div class="empty-state small"><strong>Sin gastos recientes</strong>Las compras aparecerán aquí cuando se registren.</div>`;

    const review = [
      ["Nombre", draft.name ? "ok" : "warn", draft.name ? "Nombre informado" : "Obligatorio"],
      ["Web", draft.website ? "ok" : "warn", draft.website ? "Enlace disponible" : "Pendiente"],
      ["Plazo", number(draft.lead_time_days) ? "ok" : "warn", number(draft.lead_time_days) ? `${number(draft.lead_time_days)} dias` : "Pendiente"],
      ["Materiales", stats.materials.length ? "ok" : "warn", stats.materials.length ? `${stats.materials.length} vinculados` : "Sin materiales"],
      ["Compras", stats.invoices.length ? "ok" : "neutral", stats.invoices.length ? `${stats.invoices.length} facturas` : "Sin historial"]
    ];
    $("#supplierFormReviewState").innerHTML = review.map(([label, tone, detail]) => `
      <div class="invoice-review-item static invoice-review-${tone}">
        <span class="invoice-review-icon" aria-hidden="true"><svg><use href="#${tone === "ok" ? "icon-check-circle" : "icon-alert"}"></use></svg></span>
        <span class="invoice-review-copy"><strong>${text(label)}</strong><p>${text(detail)}</p></span>
      </div>
    `).join("");

    $("#supplierFormPreview").innerHTML = `
      <div class="supplier-preview-head">
        ${entityIconMarkup(draft.name || "Proveedor", { type: "supplier", className: "supplier-avatar", label: draft.name || "Proveedor" })}
        <span><strong>${text(draft.name || "Nuevo proveedor")}</strong><small>${text(draft.category || "Sin categoria")}</small></span>
      </div>
      <div class="supplier-preview-grid">
        <span><small>Web</small><strong>${draft.website ? "OK" : "Pendiente"}</strong></span>
        <span><small>Plazo</small><strong>${text(supplierLeadLabel(draft.lead_time_days))}</strong></span>
        <span><small>Materiales</small><strong>${text(stats.materials.length)}</strong></span>
        <span><small>Gasto</small><strong>${euro.format(stats.spend)}</strong></span>
      </div>
      ${draft.notes ? `<p>${text(draft.notes)}</p>` : ""}
    `;
    $("#supplierActivityInfo").innerHTML = `
      <div class="income-origin-row"><span>Creado</span><strong>${text(stored?.created_at ? new Date(stored.created_at).toLocaleDateString("es-ES") : "Sin guardar")}</strong></div>
      <div class="income-origin-row"><span>Actualizado</span><strong>${text(stored?.updated_at ? new Date(stored.updated_at).toLocaleDateString("es-ES") : "Pendiente")}</strong></div>
      <div class="income-origin-row"><span>Ultima compra</span><strong>${text(stats.lastInvoice?.invoice_date || "-")}</strong></div>
    `;
  }

  function applySupplierCategoryChip(value) {
    const select = $("#supplierFormCategory");
    if (!select) return;
    select.value = value;
    renderSupplierWorkspace();
  }

  async function loadKits() {
    const [kits, profitability] = await Promise.all([
      api("/api/kit-recipes"),
      api("/api/orders/profitability")
    ]);
    state.kits = kits;
    state.ordersProfitability = profitability;
    renderKits();
  }

  function orderStatusMeta(status) {
    if (status === "complete") return { label: "Completo", tone: "ok" };
    if (status === "missing_lines") return { label: "Sin desglose", tone: "warn" };
    if (status === "missing_materials") return { label: "Sin material", tone: "danger" };
    if (status === "missing_costs") return { label: "Sin coste", tone: "warn" };
    if (status === "missing_set") return { label: "Sin set", tone: "warn" };
    if (status === "low_margin") return { label: "Margen bajo", tone: "danger" };
    return { label: "Revisar", tone: "warn" };
  }

  function orderMarginTone(order) {
    const margin = order?.margin_percent;
    if (margin == null) return "warn";
    if (number(margin) >= 85) return "ok";
    if (number(margin) >= 60) return "warn";
    return "danger";
  }

  function orderStatusTone(order) {
    return orderStatusMeta(order?.status).tone;
  }

  function activeFixedSet() {
    const sets = state.ordersProfitability?.fixed_sets || state.kits || [];
    return sets.find((set) => String(set.id) === String(state.selectedFixedSetId))
      || state.ordersProfitability?.active_set
      || sets.find((set) => Number(set.is_default || 0))
      || sets[0]
      || null;
  }

  function fixedSetRows(set = activeFixedSet()) {
    return set?.items || [];
  }

  function orderTypeOptions() {
    return state.ordersProfitability?.order_types || [];
  }

  function orderTypeMeta(order) {
    return order?.order_type_meta || orderTypeOptions().find((type) => type.code === order?.order_type) || {
      code: "",
      label: "Sin clasificar",
      shortLabel: "Sin tipología",
      icon: "icon-alert"
    };
  }

  function orderTypeBadge(order) {
    const meta = orderTypeMeta(order);
    const typeClass = meta.code ? `type-${String(meta.code).replace(/[^a-z0-9_-]/gi, "_")}` : "type-missing";
    return `
      <span class="order-type-badge ${typeClass}">
        <span class="order-type-icon"><svg><use href="#${text(meta.icon || "icon-tag")}"></use></svg></span>
        <span><strong>${text(meta.shortLabel || meta.label || "Sin tipología")}</strong><small>${text(meta.label || "Pendiente")}</small></span>
      </span>
    `;
  }

  function orderMetalBadge(order) {
    return order.contains_silver ? badge("Con plata", "ok") : badge("Sin plata", "neutral");
  }

  function recommendedOrderSet(order) {
    return order?.recommended_fixed_set || order?.recommended_set || null;
  }

  function appliedOrderSet(order) {
    return order?.fixed_set || null;
  }

  function orderSetLabel(order) {
    const set = appliedOrderSet(order);
    const recommended = recommendedOrderSet(order);
    if (order?.set_type_mismatch) return "Set no recomendado";
    if (order?.default_set_missing) return "Sin set por tipología";
    if (!set) return "Sin set aplicado";
    if (recommended && String(recommended.id) === String(set.id)) return `${set.name} - Set recomendado`;
    if (recommended) return `${set.name} - Set manual`;
    const suffix = "Set por defecto";
    return `${set.name} - ${suffix}`;
  }

  function refreshOrderFilterOptions() {
    const typeFilter = $("#orderTypeFilter");
    if (typeFilter) {
      const selected = typeFilter.value;
      typeFilter.innerHTML = `<option value="">Todas</option>${orderTypeOptions().map((type) => `<option value="${text(type.code)}" ${selected === type.code ? "selected" : ""}>${text(type.label)}</option>`).join("")}`;
    }
    const setFilter = $("#orderSetFilter");
    if (setFilter) {
      const selected = setFilter.value;
      const sets = state.ordersProfitability?.fixed_sets || state.kits || [];
      setFilter.innerHTML = `<option value="">Todos</option>${sets.map((set) => `<option value="${text(set.id)}" ${String(selected) === String(set.id) ? "selected" : ""}>${text(set.name)}${set.version ? ` - ${text(set.version)}` : ""}</option>`).join("")}`;
    }
  }

  function filteredOrderRows() {
    let rows = [...(state.ordersProfitability?.orders || [])];
    const search = lower($("#orderSearch")?.value).trim();
    if (search) {
      rows = rows.filter((order) => lower([
        order.order_number,
        order.channel,
        order.financial_status,
        order.fulfillment_status,
        orderTypeMeta(order).label,
        orderTypeMeta(order).shortLabel,
        order.fixed_set?.name,
        recommendedOrderSet(order)?.name,
        ...(order.lines || []).map((line) => `${line.title} ${line.material_name || ""}`)
      ].join(" ")).includes(search));
    }
    const channel = $("#orderChannelFilter")?.value;
    const status = $("#orderStatusFilter")?.value;
    const type = $("#orderTypeFilter")?.value;
    const set = $("#orderSetFilter")?.value;
    const metal = $("#orderMetalFilter")?.value;
    const preparation = $("#orderPreparationFilter")?.value;
    if (channel) rows = rows.filter((order) => order.channel === channel);
    if (type) rows = rows.filter((order) => String(order.order_type || "") === String(type));
    if (set) rows = rows.filter((order) => String(order.kit_recipe_id || order.fixed_set?.id || recommendedOrderSet(order)?.id || "") === String(set));
    if (metal === "silver") rows = rows.filter((order) => order.contains_silver);
    if (metal === "standard") rows = rows.filter((order) => !order.contains_silver);
    if (preparation) rows = rows.filter((order) => String(order.preparation_status || "") === String(preparation));
    if (status === "complete") rows = rows.filter((order) => order.status === "complete");
    if (status === "missing") rows = rows.filter((order) => order.status !== "complete");
    if (status === "missing_set") rows = rows.filter((order) => order.status === "missing_set" || order.default_set_missing || order.set_type_mismatch);
    if (status === "low_margin") rows = rows.filter((order) => order.status === "low_margin");
    return sortRows(rows, $("#orderSort")?.value, {
      margin_asc: (a, b) => (a.margin_percent == null ? 999 : number(a.margin_percent)) - (b.margin_percent == null ? 999 : number(b.margin_percent)),
      profit_desc: (a, b) => number(b.profit) - number(a.profit),
      sale_desc: (a, b) => number(b.net_amount) - number(a.net_amount),
      default: (a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")) || number(b.id) - number(a.id)
    });
  }

  function preparationMeta(order) {
    const status = order?.preparation_status || "not_prepared";
    if (status === "prepared") return { label: "Preparado", tone: "ok", hint: "Shopify lo marca enviado" };
    if (status === "sheet_generated") return { label: "Hoja generada", tone: "warn", hint: "Pendiente de envio Shopify" };
    return { label: "No preparado", tone: "rose", hint: "Disponible para hoja" };
  }

  function selectedPreparationRows() {
    const ids = new Set([...selectedPreparationOrders].map(String));
    return (state.ordersProfitability?.orders || []).filter((order) => ids.has(String(order.id)) && order.can_generate_preparation_sheet);
  }

  function renderPreparationBar(rows = filteredOrderRows()) {
    const bar = $("#ordersPreparationBar");
    if (!bar) return;
    const candidates = rows.filter((order) => order.can_generate_preparation_sheet);
    const selected = selectedPreparationRows();
    if (!candidates.length && !selected.length) {
      selectedPreparationOrders.clear();
      bar.classList.add("hidden");
      bar.innerHTML = "";
      return;
    }
    for (const id of [...selectedPreparationOrders]) {
      const order = (state.ordersProfitability?.orders || []).find((item) => String(item.id) === String(id));
      if (!order?.can_generate_preparation_sheet) selectedPreparationOrders.delete(id);
    }
    const itemCount = selected.reduce((sum, order) => sum + number(order.preparation_items_count || 0), 0);
    const candidateItems = candidates.reduce((sum, order) => sum + number(order.preparation_items_count || 0), 0);
    const selectedPreview = selected.slice(0, 3).map((order) => text(order.order_number || `Pedido #${order.id}`)).join(", ");
    bar.classList.remove("hidden");
    bar.innerHTML = `
      <div class="orders-preparation-copy">
        <span class="orders-preparation-icon" aria-hidden="true"><svg><use href="#icon-clipboard"></use></svg></span>
        <div>
          <strong>${selected.length ? `${selected.length} pedidos listos para imprimir` : `${candidates.length} pedidos no preparados`}</strong>
          <small>${selected.length ? `${itemCount} elementos de joyeria y extras${selectedPreview ? ` · ${selectedPreview}${selected.length > 3 ? "..." : ""}` : ""}` : `${candidateItems} elementos preparables disponibles en la vista`}</small>
        </div>
      </div>
      <div class="orders-preparation-stats" aria-hidden="true">
        <span><b>${candidates.length}</b><small>No preparados</small></span>
        <span><b>${selected.length}</b><small>Seleccionados</small></span>
        <span><b>${selected.length ? itemCount : candidateItems}</b><small>Elementos</small></span>
      </div>
      <div class="row-actions">
        <button type="button" class="ghost" data-select-preparation-candidates>Seleccionar visibles</button>
        ${selected.length ? `<button type="button" class="ghost" data-clear-preparation-selection>Limpiar</button>` : ""}
        <button type="button" class="primary button-with-icon" data-generate-preparation-sheet ${selected.length ? "" : "disabled"}><svg><use href="#icon-file"></use></svg><span>Generar PDF</span></button>
      </div>
    `;
  }

  function togglePreparationOrder(id, checked) {
    const order = (state.ordersProfitability?.orders || []).find((item) => String(item.id) === String(id));
    if (!order?.can_generate_preparation_sheet) return;
    if (checked) selectedPreparationOrders.add(String(id));
    else selectedPreparationOrders.delete(String(id));
    renderPreparationBar();
  }

  function selectVisiblePreparationCandidates() {
    filteredOrderRows().filter((order) => order.can_generate_preparation_sheet).forEach((order) => selectedPreparationOrders.add(String(order.id)));
    renderKits();
  }

  function clearPreparationSelection() {
    selectedPreparationOrders.clear();
    renderKits();
  }

  async function generatePreparationSheet() {
    const orderIds = selectedPreparationRows().map((order) => order.id);
    if (!orderIds.length) throw new Error("Selecciona al menos un pedido no preparado.");
    const result = await api("/api/orders/preparation-sheets", {
      method: "POST",
      body: JSON.stringify({ order_ids: orderIds })
    });
    selectedPreparationOrders.clear();
    if (result?.pdf_url) window.open(result.pdf_url, "_blank", "noopener");
    await loadKits();
    renderKits();
    return result;
  }

  function renderOrdersSummary(rows = state.ordersProfitability?.orders || []) {
    const metrics = state.ordersProfitability?.metrics || {};
    const avg = (values) => values.length ? values.reduce((sum, value) => sum + number(value), 0) / values.length : 0;
    const complete = rows.filter((order) => order.status === "complete");
    const classified = number(metrics.classified_orders ?? rows.filter((order) => order.order_type).length);
    const silver = number(metrics.silver_orders ?? rows.filter((order) => order.contains_silver).length);
    const cards = [
      ["Pedidos analizados", rows.length, "Pedidos sincronizados", "icon-kit", "accent"],
      ["Cobertura tipológica", rows.length ? `${Math.round((classified / rows.length) * 100)}%` : "-", `${classified} pedidos clasificados - ${number(metrics.configured_order_type_count || 0)}/${number(metrics.total_order_type_count || orderTypeOptions().length)} sets`, "icon-tag", "accent"],
      ["Margen fiable", metrics.average_margin_percent == null ? "-" : `${number(metrics.average_margin_percent).toFixed(1)}%`, `${text(metrics.complete_orders || complete.length)} pedidos explicables`, "icon-percent", "gold"],
      ["Con plata", silver, `${metrics.silver_average_ticket ? euro.format(number(metrics.silver_average_ticket)) : euro.format(avg(rows.filter((order) => order.contains_silver).map((order) => order.net_amount)))} ticket medio`, "icon-gem", "accent"],
      ["No preparados", number(metrics.preparation_not_prepared_orders ?? rows.filter((order) => order.preparation_status === "not_prepared").length), `${number(metrics.preparation_sheet_generated_orders ?? rows.filter((order) => order.preparation_status === "sheet_generated").length)} con hoja generada`, "icon-clipboard", "rose"]
    ];
    $("#ordersSummaryCards").innerHTML = cards.map(([label, value, hint, icon, tone]) => `
      <article class="orders-summary-card tone-${tone}">
        <span class="orders-summary-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
        <span><small>${text(label)}</small><strong>${text(value)}</strong><em>${text(hint)}</em></span>
      </article>
    `).join("");
  }

  function renderFixedPreview() {
    const sets = state.ordersProfitability?.fixed_sets || state.kits || [];
    const types = orderTypeOptions();
    const defaults = new Map(sets.filter((set) => set.order_type && Number(set.is_type_default || 0)).map((set) => [set.order_type, set]));
    const configured = types.filter((type) => defaults.has(type.code));
    const missing = types.filter((type) => !defaults.has(type.code));
    $("#ordersFixedSubtitle").textContent = `${configured.length} de ${types.length || 0} tipologías configuradas`;
    $("#ordersFixedPreview").innerHTML = types.length ? `
      <div class="orders-type-default-list">
        ${types.slice(0, 5).map((type) => {
          const set = defaults.get(type.code);
          return `<button type="button" data-set-type-filter="${text(type.code)}">
            <span class="order-type-icon"><svg><use href="#${text(type.icon || "icon-tag")}"></use></svg></span>
            <span><strong>${text(type.shortLabel || type.label)}</strong><small>${set ? `${text(set.name)} - ${text(set.included_item_count || 0)} componentes` : "Sin set por defecto"}</small></span>
            <em>${set ? euro.format(number(set.known_cost)) : "Pendiente"}</em>
          </button>`;
        }).join("")}
      </div>
      ${missing.length ? `<div class="orders-fixed-preview-more">Faltan: ${text(missing.map((type) => type.shortLabel || type.label).join(", "))}</div>` : ""}
    ` : `<div class="empty-state small">Define tipologías y sets fijos para calcular el coste por pedido.</div>`;
  }

  function renderOrdersReview(rows = state.ordersProfitability?.orders || []) {
    const total = rows.length || 0;
    const complete = rows.filter((order) => order.status === "complete");
    const missingLines = rows.filter((order) => !(order.lines || []).length);
    const missingMaterials = rows.filter((order) => order.missing_materials);
    const missingCosts = rows.filter((order) => order.status === "missing_costs");
    const missingSets = rows.filter((order) => order.status === "missing_set" || order.default_set_missing || order.set_type_mismatch);
    const lowMargin = rows.filter((order) => order.status === "low_margin");
    const reviewable = rows.filter((order) => ["missing_lines", "missing_materials", "missing_costs", "missing_set", "low_margin"].includes(order.status) || order.default_set_missing || order.set_type_mismatch);
    const reliableCoverage = total ? Math.round((complete.length / total) * 100) : 0;
    const items = [
      ["complete", "Cobertura fiable", `${reliableCoverage}%`, `${complete.length} pedidos con margen usable`, "ok", "icon-check-circle"],
      ["missing", "Pedidos revisables", reviewable.length, `${total ? Math.round((reviewable.length / total) * 100) : 0}% del total necesita revision`, reviewable.length ? "warn" : "ok", "icon-alert"],
      ["missing_lines", "Sin desglose", missingLines.length, "Pedidos sin lineas Shopify sincronizadas", missingLines.length ? "warn" : "ok", "icon-file"],
      ["missing_set", "Set pendiente", missingSets.length, "Tipología sin set por defecto", missingSets.length ? "warn" : "ok", "icon-layers"],
      ["missing_materials", "Bloqueo de coste", missingMaterials.length + missingCosts.length, `${missingMaterials.length} sin material · ${missingCosts.length} sin coste`, (missingMaterials.length + missingCosts.length) ? "danger" : "ok", "icon-link"],
      ["low_margin", "Presion de margen", lowMargin.length, "Pedidos por debajo del umbral operativo", lowMargin.length ? "danger" : "ok", "icon-chart"]
    ];
    $("#ordersReviewQueue").innerHTML = items.map(([status, label, count, hint, tone, icon]) => `
      <button type="button" class="invoice-review-item invoice-review-${tone}" data-order-status-filter="${status}">
        <span class="invoice-review-icon"><svg><use href="#${icon}"></use></svg></span>
        <span><strong>${text(label)}</strong><small>${text(hint)}</small></span>
        <em>${text(count)}</em>
      </button>
    `).join("");
  }

  function renderFixedSetView() {
    const set = activeFixedSet();
    const sets = state.ordersProfitability?.fixed_sets || state.kits || [];
    const typeOptions = orderTypeOptions();
    const filteredSets = selectedOrderSetType ? sets.filter((item) => String(item.order_type || item.type_code || "") === selectedOrderSetType) : sets;
    const rows = fixedSetRows(set);
    const componentForm = set ? `
      <form id="kitItemForm" class="orders-add-component">
        <input type="hidden" name="id">
        <input type="hidden" name="recipe_id" value="${set?.id || ""}">
        <div class="form-grid three">
          <div class="form-span-full">${materialPickerMarkup({ context: "kit", required: true, includePreview: true })}</div>
          <label>Cantidad por pedido<input name="quantity" inputmode="decimal" value="1"></label>
          <label>Notas<input name="notes" placeholder="Opcional"></label>
        </div>
        <div class="row-actions"><button type="button" data-save-kit-item>Anadir componente</button></div>
      </form>
    ` : "";
    $("#ordersFixedList").innerHTML = `
      <div class="orders-type-selector">
        <label>Tipología
          <select data-set-type-filter>
            <option value="">Todas las tipologías</option>
            ${typeOptions.map((type) => `<option value="${text(type.code)}" ${selectedOrderSetType === type.code ? "selected" : ""}>${text(type.label)}</option>`).join("")}
          </select>
        </label>
        <span>${text(filteredSets.length)} sets visibles</span>
      </div>
      <div class="orders-set-version-list">
        ${filteredSets.map((item) => `
          <article class="orders-set-version ${String(item.id) === String(set?.id) ? "is-active" : ""}">
            <button type="button" data-select-fixed-set="${item.id}">
              <span><strong>${text(item.name)}</strong><small>${text(item.version || "Sin version")}</small></span>
              <em>${euro.format(number(item.known_cost))}</em>
            </button>
            <div class="row-actions slim">
              ${Number(item.is_default || 0) ? badge("Por defecto", "ok") : `<button type="button" class="ghost" data-default-kit="${item.id}">Por defecto</button>`}
              <button type="button" class="icon-action" data-edit-kit="${item.id}" title="Editar set"><svg><use href="#icon-pencil"></use></svg></button>
            </div>
          </article>
        `).join("") || `<div class="empty-state small">Crea una version de set fijo para empezar.</div>`}
      </div>
      ${set ? `<div class="orders-selected-set-head"><div><small>Version seleccionada</small><strong>${text(set.name)}${set.version ? ` - ${text(set.version)}` : ""}</strong></div><button type="button" class="ghost button-with-icon" data-edit-kit="${set.id}"><svg><use href="#icon-pencil"></use></svg><span>Editar datos</span></button></div>` : ""}
      ${rows.length ? `
        <div class="orders-fixed-table">
          <div class="orders-fixed-table-head"><span>Componente</span><span>Cantidad</span><span>Coste ud</span><span>Total</span><span>Incluido</span><span>Acciones</span></div>
          ${rows.map((item) => `
            <article class="orders-fixed-row ${Number(item.include_in_cost ?? 1) === 0 ? "is-excluded" : ""}">
              <span class="orders-fixed-material"><span class="supplier-linked-thumb">${img(item.material_image_url)}</span><span><strong>${text(item.material_name || "Sin material")}</strong><small>${text(item.material_category || "material")}</small></span></span>
              <span>${text(item.quantity)}</span>
              <span>${Number(item.include_in_cost ?? 1) === 0 ? "-" : (item.unit_cost == null ? "-" : euro.format(number(item.unit_cost)))}</span>
              <span><strong>${Number(item.include_in_cost ?? 1) === 0 ? "Excluido" : (item.total_cost == null ? "-" : euro.format(number(item.total_cost)))}</strong></span>
              <span><label class="orders-include-toggle"><input type="checkbox" ${Number(item.include_in_cost ?? 1) === 0 ? "" : "checked"} data-kit-item-include="${item.id}" data-kit-id="${set.id}"><span></span></label>${Number(item.include_in_cost ?? 1) !== 0 && item.unit_cost == null ? badge("Sin coste", "warn") : ""}</span>
              <span class="row-actions slim"><button type="button" class="icon-action danger-text" data-delete-kit-item="${item.id}" data-kit-id="${set.id}" title="Archivar"><svg><use href="#icon-archive"></use></svg></button></span>
            </article>
          `).join("")}
        </div>
      ` : (set ? `<div class="empty-state">Esta version todavia no tiene componentes fijos.</div>` : "")}
      ${componentForm}
    `;
    $("#ordersFixedSummary").innerHTML = `
      <div class="supplier-preview-grid">
        <span><small>Total fijo</small><strong>${euro.format(number(set?.known_cost))}</strong></span>
        <span><small>Componentes</small><strong>${text(set?.included_item_count ?? rows.filter((item) => Number(item.include_in_cost ?? 1) !== 0).length)} / ${text(rows.length)}</strong></span>
        <span><small>Sin coste</small><strong>${text(set?.missing_cost_items || 0)}</strong></span>
        <span><small>Desactivados</small><strong>${text(set?.excluded_item_count || rows.filter((item) => Number(item.include_in_cost ?? 1) === 0).length)}</strong></span>
      </div>
      <div class="inline-note">El set por defecto se aplica a pedidos sin version propia; dentro de cada pedido puedes seleccionar otra version.</div>
    `;
    bindKitItemForm();
  }

  function renderKits() {
    const list = $("#kitList");
    if (!list) return;
    refreshOrderFilterOptions();
    const rows = filteredOrderRows();
    const meta = paginateRows("kits", rows);
    if ($("#kitResultText")) $("#kitResultText").textContent = "";
    const ordersMeta = $("#ordersUpdatedMeta");
    if (ordersMeta) {
      const freshness = shopifyFreshnessState(state.shopifySyncStatus || state.shopifyConnection || {});
      ordersMeta.className = `dashboard-freshness is-${freshness.tone}`;
      ordersMeta.innerHTML = `<i></i>${text(freshness.label)}`;
    }
    renderOrdersSummary(state.ordersProfitability?.orders || []);
    renderFixedPreview();
    renderOrdersReview(state.ordersProfitability?.orders || []);
    renderFixedSetView();
    $("#ordersListMetaText").textContent = meta.total ? `Mostrando ${meta.startIndex + 1}-${meta.endIndex} de ${meta.total} pedidos filtrados.` : "No hay pedidos con esos filtros.";
    renderPreparationBar(rows);
    list.innerHTML = `
      <div class="orders-table-head"><span></span><span>Pedido</span><span>Fecha</span><span>Tipología</span><span>Contenido</span><span>Venta</span><span>Beneficio real</span><span>Margen</span><span>Preparación</span><span>Estado</span><span>Acción</span></div>
      ${meta.rows.length ? meta.rows.map((order) => {
        const status = orderStatusMeta(order.status);
        const marginTone = orderMarginTone(order);
        const statusTone = orderStatusTone(order);
        const prep = preparationMeta(order);
        const selected = selectedPreparationOrders.has(String(order.id));
        return `
          <article class="orders-table-row">
            <span class="orders-preparation-cell"><label class="orders-preparation-check-wrap ${order.can_generate_preparation_sheet ? "" : "is-disabled"}"><input type="checkbox" class="orders-preparation-check" data-preparation-order="${order.id}" ${selected ? "checked" : ""} ${order.can_generate_preparation_sheet ? "" : "disabled"} aria-label="Seleccionar ${text(order.order_number || "pedido")}"><span aria-hidden="true"></span></label></span>
            <span><strong>${text(order.order_number || `Pedido #${order.id}`)}</strong><small>${text(order.channel || "canal")}</small></span>
            <span>${text(order.order_date || "-")}</span>
            <span>${orderTypeBadge(order)}${orderMetalBadge(order)}<small>${text(orderSetLabel(order))}</small></span>
            <span><strong>${(order.lines || []).length ? `${order.lines.length} lineas` : "Sin desglose"}</strong><small>${text(order.preparation_items_count ? `${order.preparation_items_count} elementos preparables` : ((order.lines || []).slice(0, 2).map((line) => line.title).join(", ") || "Pendiente de sincronizar"))}</small></span>
            <span>${euro.format(number(order.net_amount))}</span>
            <span><strong>${order.profit == null ? "-" : euro.format(number(order.profit))}</strong><small>Coste real ${order.real_cost == null ? "-" : euro.format(number(order.real_cost))}</small></span>
            <span class="orders-chip-cell">${badge(order.margin_percent == null ? "-" : `${number(order.margin_percent).toFixed(1)}%`, marginTone)}</span>
            <span class="orders-prep-status-cell">${badge(prep.label, prep.tone)}<small>${text(prep.hint)}</small></span>
            <span class="orders-chip-cell">${badge(status.label, statusTone)}</span>
            <span class="row-actions slim"><button type="button" class="icon-action" data-open-order="${order.id}" title="Ver pedido"><svg><use href="#icon-eye"></use></svg></button></span>
          </article>
        `;
      }).join("") : `<div class="empty-state">No hay pedidos sincronizados todavia.</div>`}
    `;
    renderPagination("#kitPagination", "kits", meta);
  }

  function openOrderDetail(id) {
    const order = (state.ordersProfitability?.orders || []).find((item) => String(item.id) === String(id));
    if (!order) return;
    $("#kitForm")?.classList.add("hidden");
    $("#kits .orders-page")?.classList.add("orders-focus-mode");
    const set = appliedOrderSet(order);
    const setOptions = order.fixed_set_options || state.ordersProfitability?.fixed_sets || [];
    const panel = $("#kitDetailPanel");
    const status = orderStatusMeta(order.status);
    const prep = preparationMeta(order);
    const preparationItems = order.preparation_items || [];
    const preparationUnits = preparationItems.reduce((sum, item) => sum + number(item.quantity || 1), 0);
    const issueList = [
      !(order.lines || []).length ? "Falta desglose Shopify del pedido." : "",
      order.missing_materials ? `${order.missing_materials} linea(s) sin material vinculado.` : "",
      order.missing_line_costs ? `${order.missing_line_costs} material(es) sin coste registrado.` : "",
      order.default_set_missing ? "Falta set por defecto para esta tipología." : "",
      order.set_type_mismatch ? "El set aplicado pertenece a otra tipología." : "",
      !set ? "No hay set fijo aplicado." : "",
      set?.missing_cost_items ? `${set.missing_cost_items} componente(s) del set sin coste.` : "",
      order.status === "low_margin" ? "Margen por debajo del umbral operativo." : ""
    ].filter(Boolean);
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="invoice-workspace-hero">
        <div><p class="eyebrow">OPERACIONES / PEDIDOS</p><h1>${text(order.order_number || `Pedido #${order.id}`)}</h1><p>${text(order.channel || "Shopify")} - ${text(order.order_date || "")} - ${(order.lines || []).length} lineas</p></div>
        <div class="invoice-hero-actions"><button type="button" class="ghost button-with-icon" data-close-kit-detail><svg><use href="#icon-x"></use></svg><span>Cerrar</span></button></div>
      </div>
      <section class="panel order-identity-card">
        <div class="order-identity-band">
          <div class="order-identity-type">${orderTypeBadge(order)}</div>
          <div><small>Metal</small><strong>${order.contains_silver ? "Con plata" : "Sin plata"}</strong><em>${text(order.silver_profile || "standard")}</em></div>
          <div><small>Preparación</small><strong>${text(prep.label)}</strong><em>${text(order.preparation_items_count || 0)} elementos para hoja</em></div>
          <div><small>Beneficio real</small><strong>${order.profit == null ? "-" : euro.format(number(order.profit))}</strong><em>Venta menos coste real</em></div>
          <div><small>Set recomendado</small><strong>${text(recommendedOrderSet(order)?.name || "Sin recomendación")}</strong><em>${text(orderSetLabel(order))}</em></div>
        </div>
        <div class="order-type-editor">
          <label>Tipología del pedido
            <select data-order-type-select="${order.id}">
              <option value="">Sin clasificar</option>
              ${orderTypeOptions().map((type) => `<option value="${text(type.code)}" ${String(type.code) === String(order.order_type || "") ? "selected" : ""}>${text(type.label)}</option>`).join("")}
            </select>
          </label>
          <label class="check"><input type="checkbox" data-order-type-apply-set="${order.id}" checked> Aplicar set recomendado al guardar tipología</label>
          <div class="order-type-preview"><small>La tipología decide el set fijo por defecto y separa pedidos con plata para leer margen y beneficio sin mezclar comportamientos distintos.</small></div>
        </div>
      </section>
      <section class="panel orders-audit-panel">
        <div class="panel-head compact">
          <div><h2>Auditoria de rentabilidad</h2><p>Selecciona el set fijo aplicado y revisa el margen real de este pedido.</p></div>
          ${badge(status.label, status.tone)}
        </div>
        <div class="orders-audit-topline">
          <div class="orders-detail-toolbar">
            <label>Set aplicado
              <select data-order-fixed-set-select="${order.id}">
                <option value="">Set por defecto</option>
                ${setOptions.map((option) => `<option value="${option.id}" ${String(option.id) === String(order.kit_recipe_id || set?.id) ? "selected" : ""}>${text(option.name)}${option.version ? ` - ${text(option.version)}` : ""} (${euro.format(number(option.known_cost))})</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="orders-sale-context"><small>Venta neta</small><strong>${euro.format(number(order.net_amount))}</strong><span>${(order.lines || []).length} lineas Shopify</span></div>
        </div>
        <div class="orders-formula orders-profit-strip">
          <span class="tone-shopify"><small>Coste Shopify</small><strong>${order.content_cost == null ? "Pendiente" : euro.format(number(order.content_cost))}</strong><em>Contenido del pedido</em></span>
          <i>+</i>
          <span class="tone-fixed"><small>Set fijo</small><strong>${euro.format(number(order.fixed_set_cost))}</strong><em>${text(set?.name || "Sin set")}</em></span>
          <i>=</i>
          <span class="tone-real"><small>Coste real</small><strong>${order.content_cost == null ? "Pendiente" : euro.format(number(order.real_cost))}</strong><em>Coste total</em></span>
          <i>-></i>
          <span class="accent tone-margin"><small>Margen</small><strong>${order.margin_percent == null ? "-" : `${number(order.margin_percent).toFixed(1)}%`}</strong><em>${order.content_cost == null ? "Pendiente" : `${euro.format(number(order.profit))} beneficio`}</em></span>
        </div>
      </section>
      <div class="invoice-workspace-grid">
        <div class="invoice-workspace-main">
          <section class="panel order-preparation-items-card">
            <div class="panel-head compact">
              <div><h2>Elementos para preparar</h2><p>Joyas, toppings y extras del pedido. No incluye el set fijo.</p></div>
              ${badge(prep.label, prep.tone)}
            </div>
            ${preparationItems.length ? `<div class="orders-preparation-hero">
              <span class="orders-preparation-hero-icon"><svg><use href="#icon-clipboard"></use></svg></span>
              <span><strong>Checklist de preparacion</strong><small>Solo aparecen los articulos que se meten en el paquete: joyas, toppings y extras.</small></span>
              <span class="orders-preparation-hero-count"><strong>${number(preparationUnits)}</strong><small>uds</small></span>
            </div>
            <div class="orders-preparation-summary">
              <span><svg><use href="#icon-package"></use></svg><strong>${number(order.preparation_items_count || preparationItems.length)}</strong><small>lineas preparables</small></span>
              <span><svg><use href="#icon-check-circle"></use></svg><strong>${text(prep.label)}</strong><small>${text(prep.hint)}</small></span>
            </div><div class="orders-preparation-items">
              ${preparationItems.map((item) => `<article>
                <i class="orders-preparation-item-check" aria-hidden="true"></i>
                <span class="supplier-linked-thumb">${img(item.image_url)}</span>
                <span class="orders-preparation-item-copy"><strong>${text(item.title || item.material_name || "Elemento")}</strong><small>${text([item.material_name, item.sku].filter(Boolean).join(" - ") || "sin SKU")}</small></span>
                <span class="orders-preparation-qty"><strong>${text(item.quantity || 1)}</strong><small>ud</small></span>
              </article>`).join("")}
            </div><p class="orders-preparation-footnote">El set fijo se controla en rentabilidad, pero no se imprime en la hoja de preparacion.</p>` : `<div class="empty-state small">Este pedido no tiene elementos preparables detectados.</div>`}
          </section>
          <section class="panel invoice-editor-card"><div class="panel-head compact"><div><h2>Contenido Shopify</h2><p>Lineas del pedido, coste y material vinculado.</p></div></div>
            ${(order.lines || []).length ? `<div class="orders-material-table">
              <div class="orders-material-head"><span>Producto</span><span>Material</span><span>Cantidad</span><span>Coste ud</span><span>Total</span><span>Incluido</span></div>
              ${(order.lines || []).map((line) => {
                const missingCost = line.material_id && line.unit_cost == null;
                const included = Number(line.include_in_cost ?? 1) !== 0 && !missingCost;
                const materialLabel = line.material_name && lower(line.material_name) !== lower(line.title) ? line.material_name : (line.material_id ? "Material vinculado" : "Sin material");
                return `<article class="orders-material-row ${included ? "" : "is-excluded"}">
                  <span class="orders-material-product"><span class="supplier-linked-thumb">${img(line.material_image_url)}</span><span><strong>${text(line.title || "Producto")}</strong><small>${text(line.sku || "sin SKU")}</small></span></span>
                  <span><strong>${text(materialLabel)}</strong><small>${line.material_id ? "vinculado" : "pendiente"}</small></span>
                  <span>${text(line.quantity)}</span>
                  <span>${!included ? "-" : (line.unit_cost == null ? "-" : euro.format(number(line.unit_cost)))}</span>
                  <span><strong>${!included ? "Excluido" : (line.total_cost == null ? "-" : euro.format(number(line.total_cost)))}</strong>${missingCost ? badge("Sin coste", "warn") : (line.total_cost == null && included ? badge("Sin material", "warn") : "")}</span>
                  <span><label class="orders-include-toggle"><input type="checkbox" ${included ? "checked" : ""} ${missingCost ? "disabled" : ""} data-order-line-include="${line.id}" data-order-id="${order.id}"><span></span></label></span>
                </article>`;
              }).join("")}
            </div>` : `<div class="empty-state small">Este pedido todavia no tiene lineas sincronizadas. Usa completar desglose en la portada.</div>`}
          </section>
          <section class="panel supplier-linked-panel order-fixed-set-card"><div class="panel-head compact"><div><h2>Set fijo aplicado</h2><p>Componentes que se suman automaticamente a este pedido.</p></div><strong>${euro.format(number(order.fixed_set_cost))}</strong></div><div class="orders-line-list order-fixed-set-list">
            ${fixedSetRows(set).map((item) => `<article class="supplier-linked-item order-fixed-set-item"><span class="supplier-linked-thumb">${img(item.material_image_url)}</span><span><strong>${text(item.material_name || "Componente")}</strong><small>${text(item.quantity)} por pedido</small></span><span>${item.total_cost == null ? badge("Sin coste", "warn") : euro.format(number(item.total_cost))}</span></article>`).join("") || `<div class="empty-state small">No hay set fijo aplicado.</div>`}
          </div></section>
        </div>
        <aside class="invoice-workspace-side"><section class="panel invoice-check-card"><div class="panel-head compact"><div><h2>Incidencias</h2><p>Bloqueos para confiar en el margen.</p></div></div><div class="orders-issues-list">
          ${issueList.length ? issueList.map((issue) => `<span><svg><use href="#icon-alert"></use></svg>${text(issue)}</span>`).join("") : `<div class="empty-state small">Pedido listo para revisar margen.</div>`}
        </div></section></aside>
      </div>
    `;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openKit(id) {
    const kit = state.kits.find((item) => item.id == id) || (await api("/api/kit-recipes")).find((item) => item.id == id);
    if (!kit) return;
    window.showKitEditor(kit, true);
    const panel = $("#kitDetailPanel");
    $("#kitForm")?.classList.add("hidden");
    $("#kits .orders-page")?.classList.add("orders-focus-mode");
    panel.classList.remove("hidden");
    panel.innerHTML = `<div class="empty-state">Edita ${text(kit.name)} desde la vista de sets creados o el boton Editar.</div>`;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openKitWorkspace(id) {
    const kit = state.kits.find((item) => item.id == id) || (await api("/api/kit-recipes")).find((item) => item.id == id);
    if (!kit) return;
    window.showKitEditor(kit, true);
    await openKit(id);
  }
  function bindKitItemForm() {
    const form = $("#kitItemForm");
    if (!form) return;
    syncMaterialPicker(form, "kit", { required: true });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.saveKitItem(event).catch((error) => window.toast(error.message));
    });
  }

  function setOrderSetTypeFilter(value = "") {
    selectedOrderSetType = value;
    renderFixedSetView();
  }

  return {
    loadSuppliers,
    renderSuppliers: renderSuppliersNew,
    renderSupplierWorkspace,
    applySupplierCategoryChip,
    loadKits,
    renderKits,
    openKit,
    openOrderDetail,
    openKitWorkspace,
    bindKitItemForm,
    setOrderSetTypeFilter,
    togglePreparationOrder,
    selectVisiblePreparationCandidates,
    clearPreparationSelection,
    generatePreparationSheet
  };
}
