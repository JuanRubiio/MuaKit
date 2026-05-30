export function createInvoiceViews(ctx) {
  const {
    state,
    $,
    api,
    euro,
    text,
    number,
    lower,
    badge,
    statusLabel,
    docLink,
    img,
    hierarchySummary,
    materialPickerMarkup,
    syncMaterialPicker,
    updateLinePreview,
    isMaterialInvoiceCategory,
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination
  } = ctx;

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
        ${detail.lines.map((line) => {
          const summary = hierarchySummary({
            usage_type: line.material_usage_type,
            family: line.material_family,
            subfamily: line.material_subfamily,
            variant: line.material_variant,
            base_material: line.material_base_material,
            finish: line.material_finish
          });
          return `
            <article class="line-card ${line.is_deleted ? "deleted" : ""}">
              <div class="line-card-main ${line.material_image_url ? "with-image" : ""}">
                ${line.material_image_url ? `<div class="material-mini-thumb">${img(line.material_image_url)}</div>` : ""}
                <div>
                  <strong>${text(line.material_name, "Sin material")}</strong>
                  <div class="meta">${line.package_count} paquetes · ${line.units_per_package} ud/paquete · ${line.total_units} ud · ${euro.format(number(line.price_per_package))} / paquete · ${euro.format(number(line.unit_price))} / ud · total ${euro.format(number(line.line_total))}</div>
                  ${summary ? `<div class="meta">${text(summary)}</div>` : ""}
                  ${line.description ? `<p>${text(line.description)}</p>` : ""}
                </div>
              </div>
              <div class="row-actions slim">
                <button data-edit-line="${line.id}" type="button">Editar</button>
                <button data-duplicate-line="${line.id}" type="button" class="ghost">Duplicar</button>
                ${line.is_deleted ? `<button data-restore-line="${line.id}" type="button">Restaurar</button>` : `<button class="ghost danger-text" data-delete-line="${line.id}" type="button">Archivar</button>`}
              </div>
            </article>
          `;
        }).join("") || `<div class="empty-state small">Esta factura todavía no tiene líneas.</div>`}
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
      saveLineFormViaWindow(form);
    });
  }

  function saveLineFormViaWindow(form) {
    window.saveLineForm(form).catch((error) => {
      window.clientLog("line_submit_error", { message: error.message, source: "direct_submit" }, "error");
      window.toast(error.message);
    });
  }

  return { loadInvoices, renderInvoices, openInvoice, openInvoiceWorkspace, bindLineForm };
}
