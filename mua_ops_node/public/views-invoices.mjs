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
    documentViewerMarkup,
    img,
    entityIconMarkup,
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
    rows = applyTextSearch(rows, $("#invoiceSearch")?.value, [
      "supplier_name",
      "invoice_number",
      "category",
      "status",
      "notes",
      "document_name"
    ]);
    const searchedRows = [...rows];
    const supplier = $("#invoiceSupplierFilter")?.value;
    const category = $("#invoiceCategoryFilter")?.value;
    const status = $("#invoiceStatusFilter")?.value;
    const lineFilter = $("#invoiceLineFilter")?.value;
    const from = $("#invoiceFromFilter")?.value;
    const to = $("#invoiceToFilter")?.value;
    const reviewFilter = state.invoiceReviewFilter;
    if (supplier) rows = rows.filter((invoice) => String(invoice.supplier_id || "") === String(supplier));
    if (category) rows = rows.filter((invoice) => invoice.category === category);
    if (status) rows = rows.filter((invoice) => invoice.status === status);
    if (lineFilter === "with") rows = rows.filter((invoice) => number(invoice.line_count) > 0);
    if (lineFilter === "without") rows = rows.filter((invoice) => number(invoice.line_count) === 0);
    if (from) rows = rows.filter((invoice) => String(invoice.invoice_date) >= from);
    if (to) rows = rows.filter((invoice) => String(invoice.invoice_date) <= to);
    if (reviewFilter === "supplier_missing") rows = rows.filter((invoice) => !text(invoice.supplier_name));
    if (reviewFilter === "attachment_missing") rows = rows.filter((invoice) => !invoice.document_id && !invoice.document_name);
    rows = sortRows(rows, $("#invoiceSort")?.value, {
      date_asc: (a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || a.id - b.id,
      total_desc: (a, b) => number(b.total) - number(a.total),
      total_asc: (a, b) => number(a.total) - number(b.total),
      supplier_asc: (a, b) => lower(a.supplier_name).localeCompare(lower(b.supplier_name)),
      lines_asc: (a, b) => number(a.line_count) - number(b.line_count) || String(b.invoice_date).localeCompare(String(a.invoice_date)),
      default: (a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || b.id - a.id,
      date_desc: (a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || b.id - a.id
    });

    const activeRows = searchedRows.filter((invoice) => !invoice.is_deleted);
    const totalVisible = activeRows.length;
    const draftCount = activeRows.filter((invoice) => invoice.status === "draft").length;
    const withoutLinesCount = activeRows.filter((invoice) => number(invoice.line_count) === 0).length;
    const withAttachmentCount = activeRows.filter((invoice) => invoice.document_id || invoice.document_name).length;
    const noSupplierCount = activeRows.filter((invoice) => !text(invoice.supplier_name)).length;
    const pendingAttachmentCount = activeRows.filter((invoice) => !invoice.document_id && !invoice.document_name).length;
    const totalAmount = activeRows.reduce((sum, invoice) => sum + number(invoice.total), 0);

    $("#invoiceSummaryCards").innerHTML = [
      ["Total visibles", totalVisible, totalVisible ? "100% del total" : "Sin resultados", "rose", "icon-file"],
      ["Pendientes / borrador", draftCount, totalVisible ? `${((draftCount / Math.max(totalVisible, 1)) * 100).toFixed(1).replace(".", ",")}% del total` : "0% del total", "gold", "icon-file"],
      ["Sin líneas", withoutLinesCount, totalVisible ? `${((withoutLinesCount / Math.max(totalVisible, 1)) * 100).toFixed(1).replace(".", ",")}% del total` : "0% del total", "gold", "icon-coin"],
      ["Con adjunto", withAttachmentCount, totalVisible ? `${((withAttachmentCount / Math.max(totalVisible, 1)) * 100).toFixed(1).replace(".", ",")}% del total` : "0% del total", "accent", "icon-image"],
      ["Importe total", euro.format(totalAmount), `${activeRows.length} gastos registrados`, "rose", "icon-coin"]
    ].map(([label, value, hint, tone, icon]) => `
      <article class="card invoice-summary-card invoice-summary-${tone}">
        <span class="invoice-summary-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
        <div>
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${hint}</small>
        </div>
      </article>
    `).join("");

    $("#invoiceStatusTabs").innerHTML = `
      <div class="invoice-status-strip">
        <button type="button" class="${!status && !$("#invoicesDeleted")?.checked ? "is-active" : ""}" data-invoice-quick-status="">Todas <span>${activeRows.length}</span></button>
        <button type="button" class="${status === "paid" && !$("#invoicesDeleted")?.checked ? "is-active" : ""}" data-invoice-quick-status="paid">Pagadas <span>${activeRows.filter((invoice) => invoice.status === "paid").length}</span></button>
        <button type="button" class="${status === "draft" && !$("#invoicesDeleted")?.checked ? "is-active" : ""}" data-invoice-quick-status="draft">Borrador <span>${draftCount}</span></button>
        <button type="button" class="${$("#invoicesDeleted")?.checked ? "is-active" : ""}" data-invoice-quick-status="archived">Archivadas <span>${searchedRows.filter((invoice) => invoice.is_deleted).length}</span></button>
      </div>
    `;

    const reviewRows = [
      ["Gastos en borrador", draftCount, draftCount ? "Pendientes de completar" : "Sin borradores", "draft", "icon-alert", "danger"],
      ["Sin líneas", withoutLinesCount, withoutLinesCount ? "Requieren revisar líneas" : "Todas con líneas", "without_lines", "icon-minus-circle", "warn"],
      ["Sin proveedor", noSupplierCount, noSupplierCount ? "Faltan datos del proveedor" : "Proveedor completo", "supplier_missing", "icon-users", "danger"],
      ["Adjuntos por revisar", pendingAttachmentCount, pendingAttachmentCount ? "Gastos sin adjunto" : "Adjuntos al día", "attachment_missing", "icon-paperclip", "accent"]
    ];

    $("#invoiceReviewQueue").innerHTML = `
      <div class="invoice-review-card">
        ${reviewRows.map(([label, count, hint, filter, icon, tone]) => `
          <button type="button" class="invoice-review-item invoice-review-${tone}" data-invoice-review-filter="${filter}">
            <span class="invoice-review-icon" aria-hidden="true"><svg><use href="#${icon}"></use></svg></span>
            <span class="invoice-review-copy">
              <strong>${label}</strong>
              <p>${hint}</p>
            </span>
            <span class="invoice-review-count">${count}</span>
            <span class="review-chevron" aria-hidden="true">&rsaquo;</span>
          </button>
        `).join("")}
        <button type="button" class="invoice-review-footer" data-invoice-review-filter="all">
          Ver todas las incidencias <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    `;

    const meta = paginateRows("invoices", rows);
    const invoiceResultNode = $("#invoiceResultText");
    if (invoiceResultNode) {
      invoiceResultNode.textContent = `${meta.total} gastos visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
    }
    $("#invoiceList").innerHTML = meta.rows.map((invoice) => {
      const active = String(invoice.id) === String(state.selectedInvoiceId) ? "active" : "";
      const lineTone = invoice.line_count ? "ok" : "warn";
      const attachment = invoice.document_id || invoice.document_name
        ? `<span class="table-attachment" title="${text(invoice.document_name, "Adjunto")}"><svg><use href="#icon-image"></use></svg></span>`
        : `<span class="table-attachment empty">-</span>`;
      return `
        <article class="invoice-table-row ${active} ${invoice.is_deleted ? "deleted" : ""}">
          <span class="invoice-cell-date">${text(invoice.invoice_date)}</span>
          <span class="invoice-cell-number" title="${text(invoice.invoice_number, "Sin referencia")}">${text(invoice.invoice_number, "Sin referencia")}</span>
          <span class="invoice-cell-supplier" title="${text(invoice.supplier_name, "Sin proveedor")}">
            ${entityIconMarkup(invoice.supplier_name, { type: "supplier", className: "invoice-supplier-avatar" })}
            <span class="invoice-cell-supplier-name">${text(invoice.supplier_name, "Sin proveedor")}</span>
          </span>
          <span>${badge(invoice.category)}</span>
          <span>${badge(statusLabel(invoice.status), invoice.status === "draft" ? "warn" : "ok")}</span>
          <span>${badge(`${invoice.line_count || 0}`, lineTone)}</span>
          <span>${attachment}</span>
          <strong class="amount">${euro.format(number(invoice.total))}</strong>
          <div class="row-actions slim invoice-table-actions">
            <button data-view-invoice="${invoice.id}" type="button" class="icon-action" aria-label="Ver factura" title="Ver factura"><svg><use href="#icon-eye"></use></svg></button>
            <button data-duplicate-invoice="${invoice.id}" type="button" class="icon-action" aria-label="Duplicar factura" title="Duplicar factura"><svg><use href="#icon-copy"></use></svg></button>
            ${invoice.is_deleted ? `<button data-restore-invoice="${invoice.id}" type="button" class="icon-action" aria-label="Restaurar factura" title="Restaurar factura"><svg><use href="#icon-archive"></use></svg></button>` : `<button class="icon-action danger-text" data-delete-invoice="${invoice.id}" type="button" aria-label="Archivar factura" title="Archivar factura"><svg><use href="#icon-archive"></use></svg></button>`}
          </div>
        </article>
      `;
    }).join("") || `<div class="empty-state">No hay gastos con esos filtros.</div>`;
    renderPagination("#invoicePagination", "invoices", meta);
  }

  async function openInvoice(id, options = {}) {
    state.invoiceEditorActive = false;
    state.selectedInvoiceId = id;
    state.invoiceLineFormOpen = Boolean(options.openForm);
    const detail = await api(`/api/invoices/${id}`);
    if (state.invoiceEditorActive && String(state.selectedInvoiceId) === String(id) && !options.openForm) return;
    const materialInvoice = isMaterialInvoiceCategory(detail.invoice.category);
    const activeLineCount = detail.lines.filter((line) => !line.is_deleted).length;
    renderInvoices();
    const panel = $("#invoiceDetailPanel");
    $("#invoiceForm")?.classList.add("hidden");
    $("#invoices .invoice-page")?.classList.add("invoice-focus-mode");
    document.body.classList.add("invoice-focus-active");
    panel.classList.remove("hidden");

    const fileName = text(detail.invoice.document_name || detail.invoice.document_stored_name || "");
    const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
    const docType = ["jpg", "jpeg"].includes(ext) ? "JPG" : ext === "png" ? "PNG" : ext === "webp" ? "WEBP" : ext === "pdf" ? "PDF" : (ext ? ext.toUpperCase() : "DOC");
    const docHint = ["jpg", "jpeg", "png", "webp"].includes(ext) ? "Imagen guardada en soporte local." : "Documento guardado en soporte local.";
    const docMarkup = detail.invoice.document_stored_name
      ? `<div class="invoice-doc-file">
          <span class="doc-file-icon">${docType}</span>
          <span><strong>${text(detail.invoice.document_name, "Documento adjunto")}</strong><small>${docHint}</small></span>
        </div>
        <div class="row-actions slim">${docLink(detail.invoice)}</div>`
      : `<div class="invoice-lines-empty compact">
          <span class="file-dropzone-icon muted"><svg><use href="#icon-paperclip"></use></svg></span>
          <strong>Sin adjunto</strong>
          <small>Esta factura no tiene documento asociado.</small>
        </div>`;

    const reviewItems = [
      ["Proveedor", detail.invoice.supplier_id ? "ok" : "warn", detail.invoice.supplier_id ? "Seleccionado" : "Falta proveedor"],
      ["Número de factura", detail.invoice.invoice_number ? "ok" : "warn", detail.invoice.invoice_number ? "Informado" : "Sin referencia"],
      ["Fecha", detail.invoice.invoice_date ? "ok" : "warn", detail.invoice.invoice_date ? "Informada" : "Pendiente"],
      ["Líneas", activeLineCount ? "ok" : "warn", activeLineCount ? `${activeLineCount} línea${activeLineCount === 1 ? "" : "s"} revisada${activeLineCount === 1 ? "" : "s"}` : "Sin líneas"],
      ["Total", number(detail.invoice.total) > 0 ? "ok" : "warn", number(detail.invoice.total) > 0 ? "Aceptado" : "Revisar"]
    ];

    panel.innerHTML = `
      <div class="invoice-detail-hero">
        <div>
          <p class="eyebrow">Operaciones / Gastos</p>
          <div class="invoice-title-row">
            <h2>${text(detail.invoice.supplier_name, "Factura sin proveedor")}</h2>
            <span class="external-link-mark" aria-hidden="true">&#8599;</span>
          </div>
          <p>${text(detail.invoice.invoice_number, "sin número")} · ${text(detail.invoice.invoice_date)}</p>
          <div class="tags">
            ${badge(statusLabel(detail.invoice.status), detail.invoice.status === "draft" ? "warn" : "ok")}
            ${badge(detail.invoice.category)}
            ${badge(`${activeLineCount} línea${activeLineCount === 1 ? "" : "s"}`, detail.lines.length ? "ok" : "warn")}
            ${detail.invoice.document_stored_name ? badge("Adjunto") : badge("Sin adjunto", "warn")}
          </div>
        </div>
        <strong class="invoice-hero-total">${euro.format(number(detail.invoice.total))}</strong>
        <div class="invoice-hero-actions">
          <button type="button" class="ghost" data-close-invoice-detail>Cerrar</button>
          <button type="button" class="ghost" data-duplicate-invoice="${detail.invoice.id}">Duplicar</button>
          <button type="button" class="ghost danger-text" data-delete-invoice="${detail.invoice.id}">Archivar</button>
          <button type="button" data-edit-invoice-details="${detail.invoice.id}">Editar factura</button>
          <button type="button" class="ghost accent-outline" data-open-line-form="${detail.invoice.id}">Nueva línea</button>
        </div>
      </div>

      ${documentViewerMarkup(detail.invoice, { context: "adjunto", annotated: true })}

      <div class="invoice-detail-grid">
        <section class="panel invoice-detail-data">
          <div class="panel-head compact-head">
            <div>
              <h2>Datos de factura</h2>
              <p>Resumen operativo del documento y sus importes.</p>
            </div>
          </div>
          <div class="invoice-fact-grid">
            <span><small>Proveedor</small><strong>${text(detail.invoice.supplier_name, "Sin proveedor")}</strong></span>
            <span><small>Fecha</small><strong>${text(detail.invoice.invoice_date, "-")}</strong></span>
            <span><small>Número / referencia</small><strong>${text(detail.invoice.invoice_number, "-")}</strong></span>
            <span><small>Categoría</small><strong>${text(detail.invoice.category)}</strong></span>
            <span><small>Estado</small><strong>${statusLabel(detail.invoice.status)}</strong></span>
            <span><small>Subtotal</small><strong>${euro.format(number(detail.invoice.subtotal))}</strong></span>
            <span><small>Envío</small><strong>${euro.format(number(detail.invoice.shipping))}</strong></span>
            <span><small>IVA</small><strong>${euro.format(number(detail.invoice.tax))}</strong></span>
            <span class="invoice-fact-total"><small>Total</small><strong>${euro.format(number(detail.invoice.total))}</strong></span>
          </div>
          ${detail.invoice.notes ? `<p class="invoice-note">${text(detail.invoice.notes)}</p>` : ""}
        </section>

        <aside class="invoice-detail-side">
          <section class="panel invoice-document-card">
            <div class="panel-head compact-head">
              <div>
                <h2>Documento adjunto</h2>
                <p>Soporte documental de la factura.</p>
              </div>
            </div>
            ${docMarkup}
          </section>

          <section class="panel invoice-check-card">
            <div class="panel-head compact-head">
              <div>
                <h2>Revisión</h2>
                <p>Estado de completitud de la factura.</p>
              </div>
            </div>
            <div class="invoice-validation-list">
              ${reviewItems.map(([label, tone, value]) => `
                <span class="${tone}">
                  <strong>${label}</strong>
                  <em>${value}</em>
                </span>
              `).join("")}
            </div>
          </section>
        </aside>
      </div>

      <section class="panel invoice-lines-panel">
        <div class="panel-head">
          <div>
            <h2>Líneas de factura (${activeLineCount})</h2>
            <p>Materiales o conceptos imputados a esta factura.</p>
          </div>
          <div class="row-actions">
            <button type="button" data-open-line-form="${detail.invoice.id}">Nueva línea</button>
          </div>
        </div>

        <div class="line-list invoice-line-table">
          ${detail.lines.map((line, index) => lineMarkup(line, index)).join("") || `<div class="invoice-lines-empty"><span class="file-dropzone-icon muted"><svg><use href="#icon-kit"></use></svg></span><strong>Aún no hay líneas añadidas</strong><small>Añade una línea para comenzar a registrar el gasto.</small></div>`}
        </div>
      </section>

      <form id="lineForm" class="panel line-form ${state.invoiceLineFormOpen ? "" : "hidden"}">
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
          ${detail.invoice.category === "marketing" ? `<label>Impresiones<input name="impressions" type="number" min="0" step="1" placeholder="Ej. 18764"></label>` : ""}
        </div>
        <input type="hidden" name="affects_stock" value="0">
        <label>Notas<textarea name="notes" rows="2"></textarea></label>
        <div id="linePreview" class="calc-preview">
          <span><small>Unidades</small><strong data-preview-units>1</strong></span>
          <span><small>Total línea</small><strong data-preview-line-total>0,00 EUR</strong></span>
          <span><small>Coste unitario</small><strong data-preview-unit>0,00 EUR</strong></span>
          ${detail.invoice.category === "marketing" ? `<span><small>Coste / impresión</small><strong data-preview-impression>-</strong></span>` : ""}
        </div>
        <div class="row-actions">
          <button type="button" data-save-line>Guardar línea</button>
          <button type="button" class="ghost" data-reset-form="lineForm">Limpiar</button>
        </div>
      </form>

      <div class="invoice-form-footer panel">
        <div class="invoice-amount-summary">
          <span><small>Subtotal</small><strong>${euro.format(number(detail.invoice.subtotal))}</strong></span>
          <span><small>Descuento</small><strong>${euro.format(number(detail.invoice.discount))}</strong></span>
          <span><small>Envío</small><strong>${euro.format(number(detail.invoice.shipping))}</strong></span>
          <span><small>IVA</small><strong>${euro.format(number(detail.invoice.tax))}</strong></span>
          <span class="total"><small>Total</small><strong>${euro.format(number(detail.invoice.total))}</strong></span>
        </div>
      </div>
    `;
    const annotatedViewer = panel.querySelector("[data-annotated-document-viewer]");
    if (annotatedViewer) window.renderAnnotatedDocumentViewer?.(annotatedViewer, detail.invoice, detail.lines);
    bindLineForm();
    if (state.invoiceLineFormOpen) updateLinePreview();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function lineMarkup(line, index) {
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
        <div class="row-actions slim">
          <button data-edit-line="${line.id}" type="button">Editar</button>
          <button data-duplicate-line="${line.id}" type="button" class="ghost">Duplicar</button>
          ${line.is_deleted ? `<button data-restore-line="${line.id}" type="button">Restaurar</button>` : `<button class="ghost danger-text" data-delete-line="${line.id}" type="button">Archivar</button>`}
        </div>
      </article>
    `;
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
