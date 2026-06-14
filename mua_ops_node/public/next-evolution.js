(() => {
  const expensePage = document.querySelector("#invoices .invoice-page");
  const materialPage = document.querySelector("#materials .materials-page");
  const expenseDefault = expensePage ? Array.from(expensePage.children).filter((node) => !node.matches(".next-domain-tabs,#expenseImportPanel,.invoice-overview-head,#invoiceForm,#invoiceDetailPanel")) : [];
  const materialDefault = materialPage ? Array.from(materialPage.children).filter((node) => !node.matches(".next-domain-tabs,#replenishmentPanel,#purchasePlannerPanel,.materials-overview-head")) : [];
  let replenishmentRows = [];
  let currentPurchasePlan = null;
  let expensePoll = null;
  let importUploading = false;
  let importFilterTimer = null;
  let expenseImportRows = [];
  let currentImportId = null;
  let importFilters = { query: "", status: "pending_review", supplier: "", category: "", quality: "", issue: "" };
  const selectedImportIds = new Set();

  const fmt = (value) => euro.format(Number(value || 0));
  const metric = (label, value, hint) => `<article class="next-kpi"><small>${text(label)}</small><strong>${text(value)}</strong><span>${text(hint)}</span></article>`;
  const currencyFormat = (value, currency = "EUR") => new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(Number(value || 0));
  const expenseCategoryLabel = (value) => ({ materiales: "Materiales", envios: "Envíos", marketing: "Marketing", software: "Software", servicios: "Servicios", otros: "Otros" })[value] || "Sin clasificar";
  function importQuality(item) {
    if (["pending", "processing"].includes(item.status)) return { tone: "processing", label: "Procesando", hint: "Lectura en curso", missing: [] };
    if (item.status === "error") return { tone: "low", label: "Con error", hint: "Reprocesar documento", missing: [] };
    const fields = item.detected_fields || {};
    const required = [["suggested_supplier_id", "proveedor"], ["invoice_number", "número"], ["invoice_date", "fecha"], ["total", "total"], ["category", "tipo"]];
    const missing = required.filter(([key]) => fields[key] === null || fields[key] === undefined || fields[key] === "").map(([, label]) => label);
    const confidence = Math.round(Number(item.confidence || 0));
    if (confidence >= 90 && !missing.length) return { tone: "high", label: "Muy buena", hint: "Datos esenciales detectados", missing };
    if (confidence >= 70 && missing.length <= 1) return { tone: "medium", label: "Revisable", hint: missing.length ? `Falta ${missing[0]}` : "Comprobar lectura", missing };
    return { tone: "low", label: "Requiere atención", hint: missing.length ? `Faltan ${missing.join(", ")}` : "Confianza baja", missing };
  }
  const confidenceMarkup = (item, compact = false) => {
    const quality = importQuality(item);
    const confidence = Math.round(Number(item.confidence || 0));
    return `<div class="next-confidence quality-${quality.tone} ${compact ? "is-compact" : ""}">
      <div class="next-confidence-head"><span>${text(quality.label)}</span><strong>${["pending", "processing"].includes(item.status) ? `<span class="next-spinner"></span>` : `${confidence}%`}</strong></div>
      <span class="next-confidence-track"><i style="width:${Math.max(0, Math.min(100, confidence))}%"></i></span>
      <small>${text(quality.hint)}</small>
    </div>`;
  };
  const accountingMarkup = (quality = {}, compact = false) => {
    const checks = [
      ["Campos", !(quality.missing || []).length],
      ["Totales", quality.lines_match],
      ["Decisiones", quality.decisions_complete],
      ["Duplicado", !quality.duplicate]
    ];
    return `<div class="next-accounting-quality quality-${quality.tone || "low"} ${compact ? "is-compact" : ""}">
      <div class="next-accounting-head"><span>Control contable</span><strong>${Number(quality.score || 0)}/4</strong></div>
      <div class="next-quality-checks">${checks.map(([label, ok]) => `<span class="${ok ? "is-ok" : "is-pending"}">${ok ? "✓" : "!"} ${label}</span>`).join("")}</div>
    </div>`;
  };
  const duplicateInvoiceMarkup = (duplicate, exact = false) => {
    if (!duplicate) return "";
    const reference = duplicate.invoice_number || `Factura #${duplicate.id}`;
    return `<section class="next-duplicate-alert ${exact ? "is-blocking" : "is-warning"}">
      <div class="next-duplicate-alert-icon"><svg><use href="#icon-${exact ? "alert" : "eye"}"></use></svg></div>
      <div class="next-duplicate-alert-copy">
        <strong>${exact ? "Factura duplicada" : "Posible factura duplicada"}</strong>
        <span>${exact ? "Coinciden el proveedor y el número de factura." : "Coinciden el proveedor, la fecha y el total. El número de factura es diferente o no se ha podido comparar."}</span>
      </div>
      <div class="next-duplicate-invoice">
        <strong>${text(duplicate.supplier_name || "Sin proveedor")} · ${text(reference)}</strong>
        <span>${text(duplicate.invoice_date || "Sin fecha")} · ${currencyFormat(duplicate.total, duplicate.currency || "EUR")} · ${text(expenseCategoryLabel(duplicate.category))}</span>
      </div>
      <button type="button" class="ghost" data-open-duplicate-invoice="${duplicate.id}">Abrir factura existente</button>
    </section>`;
  };
  const reviewableRows = () => expenseImportRows.filter((row) => ["ready", "review", "error"].includes(row.status));
  const eligibleImportRows = (rows = filteredImportRows()) => rows.filter((row) => row.accounting_quality?.batch_eligible && ["ready", "review"].includes(row.status));
  const filteredImportRows = () => {
    const query = importFilters.query.toLocaleLowerCase("es");
    return expenseImportRows.filter((row) => {
      const fields = row.detected_fields || {};
      const accounting = row.accounting_quality || {};
      const haystack = [row.original_name, fields.suggested_supplier_name, fields.invoice_number].join(" ").toLocaleLowerCase("es");
      return row.status !== "discarded"
        && (!query || haystack.includes(query))
        && (!importFilters.status || (importFilters.status === "pending_review" ? ["pending", "processing", "ready", "review", "error"].includes(row.status) : row.status === importFilters.status))
        && (!importFilters.supplier || String(fields.suggested_supplier_id || "") === importFilters.supplier)
        && (!importFilters.category || fields.category === importFilters.category)
        && (!importFilters.quality || importQuality(row).tone === importFilters.quality)
        && (!importFilters.issue || (importFilters.issue === "duplicate" ? row.duplicate : importFilters.issue === "totals" ? !accounting.lines_match : importFilters.issue === "fields" ? accounting.missing?.length : importFilters.issue === "decisions" ? !accounting.decisions_complete : false));
    });
  };
  function showImportList() {
    currentImportId = null;
    $("#expenseImportListView").classList.remove("hidden");
    $("#expenseImportDetail").classList.add("hidden");
    $("#expenseImportDetail").innerHTML = "";
    loadImports();
  }

  function switchExpense(section) {
    if (section === "imports") closeInvoicePanels();
    document.querySelectorAll("[data-expense-section]").forEach((button) => button.classList.toggle("is-active", button.dataset.expenseSection === section));
    expenseDefault.forEach((node) => node.classList.toggle("hidden", section !== "registered"));
    $("#expenseImportPanel").classList.toggle("hidden", section !== "imports");
    if (section === "imports") showImportList();
  }

  function switchMaterials(section) {
    document.querySelectorAll("[data-materials-section]").forEach((button) => button.classList.toggle("is-active", button.dataset.materialsSection === section));
    materialDefault.forEach((node) => node.classList.toggle("hidden", section !== "catalog"));
    $("#replenishmentPanel").classList.toggle("hidden", section !== "replenishment");
    $("#purchasePlannerPanel").classList.toggle("hidden", section !== "purchases");
    if (section === "replenishment") loadReplenishment();
    if (section === "purchases") loadPurchasePlans();
  }

  function renderImportList() {
    const qualityOrder = { low: 0, medium: 1, processing: 2, high: 3 };
    const visibleRows = filteredImportRows().sort((a, b) => (qualityOrder[importQuality(a).tone] ?? 4) - (qualityOrder[importQuality(b).tone] ?? 4) || Number(b.id) - Number(a.id));
    const pending = expenseImportRows.filter((row) => ["pending", "processing"].includes(row.status)).length;
    const reliable = visibleRows.filter((row) => ["ready", "review"].includes(row.status) && importQuality(row).tone === "high").length;
    const attention = visibleRows.filter((row) => ["ready", "review", "error"].includes(row.status) && importQuality(row).tone !== "high").length;
    const eligibleRows = eligibleImportRows(visibleRows);
    const allEligibleSelected = eligibleRows.length > 0 && eligibleRows.every((row) => selectedImportIds.has(Number(row.id)));
    $("#expenseImportMetrics").innerHTML = metric("En proceso", pending, "Cola local secuencial") + metric("Lectura fiable", reliable, "Listas para validar") + metric("Requieren atención", attention, "Revisar datos detectados");
    const suppliers = [...new Map(expenseImportRows.filter((row) => row.detected_fields?.suggested_supplier_id).map((row) => [row.detected_fields.suggested_supplier_id, row.detected_fields.suggested_supplier_name])).entries()];
    $("#expenseImportTools").innerHTML = `<div class="next-import-filters">
      <label>Buscar<input type="search" data-import-filter="query" value="${text(importFilters.query)}" placeholder="Documento, proveedor, número"></label>
      <label>Estado<select data-import-filter="status"><option value="pending_review" ${importFilters.status === "pending_review" ? "selected" : ""}>Pendientes</option><option value="" ${importFilters.status === "" ? "selected" : ""}>Todos</option><option value="confirmed" ${importFilters.status === "confirmed" ? "selected" : ""}>Confirmadas</option><option value="error" ${importFilters.status === "error" ? "selected" : ""}>Con error</option></select></label>
      <label>Proveedor<select data-import-filter="supplier"><option value="">Todos</option>${suppliers.map(([id, name]) => `<option value="${id}" ${String(id) === importFilters.supplier ? "selected" : ""}>${text(name)}</option>`).join("")}</select></label>
      <label>Tipo<select data-import-filter="category"><option value="">Todos</option>${INVOICE_CATEGORIES.map((value) => `<option value="${value}" ${value === importFilters.category ? "selected" : ""}>${expenseCategoryLabel(value)}</option>`).join("")}</select></label>
      <label>Lectura<select data-import-filter="quality"><option value="">Todas</option><option value="high" ${importFilters.quality === "high" ? "selected" : ""}>Fiable</option><option value="medium" ${importFilters.quality === "medium" ? "selected" : ""}>Revisable</option><option value="low" ${importFilters.quality === "low" ? "selected" : ""}>Atención</option></select></label>
      <label>Incidencia<select data-import-filter="issue"><option value="">Todas</option><option value="fields" ${importFilters.issue === "fields" ? "selected" : ""}>Faltan campos</option><option value="totals" ${importFilters.issue === "totals" ? "selected" : ""}>Totales no cuadran</option><option value="decisions" ${importFilters.issue === "decisions" ? "selected" : ""}>Decisiones pendientes</option><option value="duplicate" ${importFilters.issue === "duplicate" ? "selected" : ""}>Duplicado</option></select></label>
    </div><div class="next-batch-bar"><span><strong>${selectedImportIds.size}</strong> seleccionadas para crear borradores · ${eligibleRows.length} candidatas visibles</span><div class="next-batch-actions"><button type="button" class="ghost" data-select-all-eligible-imports ${eligibleRows.length ? "" : "disabled"}>${allEligibleSelected ? "Limpiar candidatas" : "Seleccionar candidatas"}</button><button type="button" data-batch-confirm-imports ${selectedImportIds.size ? "" : "disabled"}>Confirmar selección</button></div></div>`;
    $("#expenseImportList").innerHTML = visibleRows.length ? visibleRows.map((row) => `<article class="next-import-row is-${row.status}">
      <input class="next-import-select" type="checkbox" data-select-expense-import="${row.id}" ${selectedImportIds.has(Number(row.id)) ? "checked" : ""} ${row.accounting_quality?.batch_eligible && ["ready", "review"].includes(row.status) ? "" : "disabled"}>
      ${row.detected_fields?.suggested_supplier_name ? entityIconMarkup(row.detected_fields.suggested_supplier_name, { type: "supplier", className: "supplier-avatar compact", label: row.detected_fields.suggested_supplier_name }) : `<span class="next-file-icon"><svg><use href="#icon-file"></use></svg></span>`}
      <div class="next-import-document"><strong>${text(row.original_name)}</strong><small>${row.detected_fields?.suggested_supplier_name ? `${text(row.detected_fields.suggested_supplier_name)} · ` : ""}${Math.round(Number(row.size || 0) / 1024)} KB</small><span class="next-import-facts"><em>${text(expenseCategoryLabel(row.detected_fields?.category))}</em>${row.detected_fields?.rule_source ? `<em>Regla aprendida</em>` : ""}${row.detected_fields?.invoice_date ? `<em>${text(row.detected_fields.invoice_date)}</em>` : ""}${row.detected_fields?.total !== null && row.detected_fields?.total !== undefined ? `<em>${currencyFormat(row.detected_fields.total, row.detected_fields.currency || "EUR")}</em>` : ""}</span></div>
      <span class="status-pill ${row.status === "error" ? "danger" : row.status === "confirmed" ? "ok" : "warn"}">${statusText(row.status)}</span>
      ${confidenceMarkup(row, true)}
      ${accountingMarkup(row.accounting_quality, true)}
      <button type="button" class="ghost" data-open-expense-import="${row.id}" ${["pending", "processing"].includes(row.status) ? "disabled" : ""}>${row.status === "confirmed" ? "Ver" : "Revisar"}</button>
    </article>`).join("") : `<div class="empty-state">No hay documentos que coincidan con los filtros.</div>`;
  }

  async function loadImports() {
    expenseImportRows = await api("/api/expense-imports");
    [...selectedImportIds].forEach((id) => {
      if (!expenseImportRows.some((row) => Number(row.id) === id && row.accounting_quality?.batch_eligible)) selectedImportIds.delete(id);
    });
    renderImportList();
    const active = expenseImportRows.some((row) => ["pending", "processing"].includes(row.status));
    if (active && !expensePoll) expensePoll = setInterval(loadImports, 1200);
    if (!active && expensePoll) { clearInterval(expensePoll); expensePoll = null; }
  }

  function statusText(status) {
    return ({ pending: "En cola", processing: "Procesando", ready: "Lista para validar", review: "Revisar", error: "Error", confirmed: "Confirmada", discarded: "Descartada" })[status] || status;
  }

  function showImportNotice(message, tone = "ok") {
    const node = $("#expenseImportNotice");
    node.className = `next-import-notice tone-${tone}`;
    node.innerHTML = message;
  }

  function renderSelectedFiles() {
    const input = $("#expenseImportUploadForm input[type=file]");
    const files = Array.from(input.files || []);
    const node = $("#expenseImportSelection");
    node.classList.toggle("hidden", !files.length);
    node.innerHTML = files.length ? `<strong>${files.length} ${files.length === 1 ? "factura seleccionada" : "facturas seleccionadas"}</strong>${files.slice(0, 5).map((file) => `<span><svg><use href="#icon-file"></use></svg>${text(file.name)}<small>${Math.round(file.size / 1024)} KB</small></span>`).join("")}${files.length > 5 ? `<em>+${files.length - 5} archivos más</em>` : ""}` : "";
    $("#expenseImportUploadForm button[type=submit]").disabled = !files.length || importUploading;
  }

  function normalizeEvidence(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function evidenceTexts(fields, lines) {
    const values = Object.values(fields.evidence || {}).map((item) => item?.text).filter(Boolean);
    values.push(fields.suggested_supplier_name, fields.invoice_number, fields.invoice_date, fields.total);
    lines.forEach((line) => {
      values.push(line.original_text, line.description);
      try {
        const evidence = JSON.parse(line.original_data_json || "{}").evidence?.text;
        if (evidence) values.push(evidence);
      } catch {}
    });
    return [...new Set(values.map(normalizeEvidence).filter(Boolean))];
  }

  function coordinateMatchesEvidence(coordinate, evidence) {
    const token = normalizeEvidence(coordinate.text || coordinate.symbol || "");
    return token.length > 2 && evidence.some((line) => line.includes(token));
  }

  async function renderAnnotatedImportViewer(item, lines) {
    const host = $("#expenseImportDetail [data-annotated-document-viewer]");
    const details = host?.closest(".document-viewer");
    if (!host || !details || host.dataset.ready === "true") return;
    host.dataset.ready = "true";
    const evidence = evidenceTexts(item.detected_fields || {}, lines);
    const source = host.dataset.documentSource;
    const renderOverlay = (stage, coordinates, page, widthRatio, heightRatio, nativeViewport = null) => {
      coordinates.filter((coordinate) => coordinateMatchesEvidence(coordinate, evidence)).forEach((coordinate) => {
        let left;
        let top;
        let width;
        let height;
        if (page.method === "native" && coordinate.transform && nativeViewport) {
          const x = Number(coordinate.transform[4] || 0);
          const y = Number(coordinate.transform[5] || 0);
          const first = nativeViewport.convertToViewportPoint(x, y);
          const second = nativeViewport.convertToViewportPoint(x + Number(coordinate.width || 0), y + Number(coordinate.height || coordinate.transform[3] || 10));
          left = Math.min(first[0], second[0]);
          top = Math.min(first[1], second[1]);
          width = Math.max(8, Math.abs(second[0] - first[0]));
          height = Math.max(12, Math.abs(second[1] - first[1]));
        } else {
          const box = coordinate.bbox || coordinate;
          left = Number(box.x0 || box.left || 0) * widthRatio;
          top = Number(box.y0 || box.top || 0) * heightRatio;
          width = Math.max(8, Number((box.x1 ?? box.right ?? 0) - (box.x0 ?? box.left ?? 0)) * widthRatio);
          height = Math.max(12, Number((box.y1 ?? box.bottom ?? 0) - (box.y0 ?? box.top ?? 0)) * heightRatio);
        }
        const marker = document.createElement("span");
        marker.className = `document-evidence-zone ${Number(page.confidence || 0) >= 85 ? "is-reliable" : "is-review"}`;
        marker.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
        marker.title = coordinate.text || "Zona detectada";
        stage.appendChild(marker);
      });
    };
    const renderImage = async () => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const stage = document.createElement("div");
      stage.className = "annotated-document-page";
      stage.style.width = `${image.naturalWidth}px`;
      stage.style.height = `${image.naturalHeight}px`;
      image.className = "annotated-document-image";
      stage.appendChild(image);
      host.replaceChildren(stage);
      const page = item.pages[0] || {};
      const maxX = Math.max(image.naturalWidth, ...((page.coordinates || []).map((word) => Number(word.bbox?.x1 || word.x1 || 0))));
      const maxY = Math.max(image.naturalHeight, ...((page.coordinates || []).map((word) => Number(word.bbox?.y1 || word.y1 || 0))));
      renderOverlay(stage, page.coordinates || [], page, image.naturalWidth / maxX, image.naturalHeight / maxY);
    };
    const renderPdf = async () => {
      if (!window.pdfjsLib) throw new Error("El motor de vista previa PDF no está disponible.");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
      const pdf = await window.pdfjsLib.getDocument(source).promise;
      host.replaceChildren();
      for (const pageData of item.pages) {
        const pdfPage = await pdf.getPage(pageData.page);
        const viewport = pdfPage.getViewport({ scale: 1.35 });
        const stage = document.createElement("div");
        stage.className = "annotated-document-page";
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        stage.style.width = `${canvas.width}px`;
        stage.style.height = `${canvas.height}px`;
        stage.appendChild(canvas);
        host.appendChild(stage);
        await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const sourceViewport = pdfPage.getViewport({ scale: 1.5 });
        renderOverlay(stage, pageData.coordinates || [], pageData, viewport.width / sourceViewport.width, viewport.height / sourceViewport.height, viewport);
      }
    };
    details.addEventListener("toggle", async () => {
      if (!details.open || host.dataset.rendered === "true") return;
      try {
        if (host.dataset.documentKind === "pdf") await renderPdf(); else await renderImage();
        host.dataset.rendered = "true";
      } catch (error) {
        host.innerHTML = `<div class="document-viewer-unsupported"><strong>No se pudo preparar el resaltado</strong><span>${text(error.message)}</span></div>`;
      }
    });
  }

  async function openImport(id) {
    const data = await api(`/api/expense-imports/${id}`);
    currentImportId = Number(id);
    const item = data.import;
    const fields = item.detected_fields || {};
    const quality = importQuality(item);
    const accounting = data.accounting_quality || {};
    const reviewRows = reviewableRows();
    const position = Math.max(0, reviewRows.findIndex((row) => Number(row.id) === currentImportId));
    const previous = reviewRows[position - 1];
    const next = reviewRows[position + 1];
    const isMaterialExpense = fields.category === "materiales";
    const materialOptionsMarkup = (selected) => `<option value="">${isMaterialExpense ? "Sin material sugerido" : "No aplica a este gasto"}</option>${isMaterialExpense ? (state.materials || []).filter((material) => !material.is_deleted).map((material) => `<option value="${material.id}" ${String(material.id) === String(selected) ? "selected" : ""}>${text(material.name)}</option>`).join("") : ""}`;
    const lineMarkup = (line) => {
      const original = (() => { try { return JSON.parse(line.original_data_json || "{}"); } catch { return {}; } })();
      return `<article class="next-editable-line" data-import-line-row="${line.id}">
        <input class="next-line-select" type="checkbox" data-select-import-line="${line.id}" aria-label="Seleccionar línea para combinar">
        <label>Concepto<input data-line-field="description" value="${text(line.description)}"></label>
        <label>Cantidad<input data-line-field="quantity" type="number" min="0" step="0.01" value="${number(line.quantity || 1)}"></label>
        <label>Material<select data-line-field="suggested_material_id" ${isMaterialExpense ? "" : "disabled"}>${materialOptionsMarkup(line.suggested_material_id)}</select></label>
        <label>Precio ud. ${text(fields.currency || "EUR")}<input data-line-field="unit_price" type="number" min="0" step="0.01" value="${number(line.unit_price ?? line.line_total).toFixed(2)}"></label>
        <label>Total ${text(fields.currency || "EUR")}<input data-line-field="line_total" type="number" min="0" step="0.01" value="${number(line.line_total).toFixed(2)}"></label>
        <label>Decisión<select data-line-field="human_decision"><option value="pending" ${line.human_decision === "pending" ? "selected" : ""}>Revisar</option><option value="accepted" ${line.human_decision === "accepted" ? "selected" : ""}>Aceptar</option><option value="rejected" ${line.human_decision === "rejected" ? "selected" : ""}>Excluir</option></select></label>
        <div class="next-editable-line-actions"><button type="button" class="ghost button-with-icon" data-save-import-line="${line.id}" data-import-id="${item.id}"><svg><use href="#icon-save"></use></svg><span>Guardar</span></button><button type="button" class="ghost" data-split-import-line="${line.id}" data-import-id="${item.id}">Dividir</button><button type="button" class="ghost danger-text" data-delete-import-line="${line.id}" data-import-id="${item.id}">Eliminar</button></div>
      </article>`;
    };
    $("#expenseImportListView").classList.add("hidden");
    $("#expenseImportDetail").classList.remove("hidden");
    $("#expenseImportDetail").innerHTML = `<div class="panel-head"><div><h2>Validación de factura</h2><p>${text(item.original_name)} · ${text(expenseCategoryLabel(fields.category))}</p></div><div class="next-import-navigation"><span>${position + 1} de ${reviewRows.length}</span><button class="ghost" data-open-expense-import="${previous?.id || ""}" ${previous ? "" : "disabled"}>Anterior</button><button class="ghost" data-open-expense-import="${next?.id || ""}" ${next ? "" : "disabled"}>Siguiente</button><button class="ghost button-with-icon" data-close-expense-import><svg><use href="#icon-arrow-left"></use></svg><span>Cerrar revisión</span></button><button class="ghost" data-reprocess-import="${item.id}">Reprocesar</button></div></div>
      <div class="next-review-quality quality-${quality.tone}">${confidenceMarkup(item)}${accountingMarkup(accounting)}<div><strong>${accounting.batch_eligible ? "Lista para confirmación segura" : "Aún necesita supervisión"}</strong><span>La lectura OCR mide lo entendido; el control contable comprueba campos, líneas, decisiones y duplicados.</span></div></div>
      ${duplicateInvoiceMarkup(data.duplicates.exact || data.duplicates.warning, Boolean(data.duplicates.exact))}
      ${documentViewerMarkup({ stored_name: item.stored_name, original_name: item.original_name, mime_type: item.mime_type }, { context: "original", annotated: true })}
      <div class="next-validation-grid">
        <form id="expenseImportReviewForm" data-import-id="${item.id}" class="form-grid three">
          <label>Proveedor sugerido<select name="suggested_supplier_id"><option value="">Sin proveedor</option>${(state.suppliers || []).filter((supplier) => !supplier.is_deleted).map((supplier) => `<option value="${supplier.id}" ${String(supplier.id) === String(fields.suggested_supplier_id) ? "selected" : ""}>${text(supplier.name)}</option>`).join("")}</select></label>
          <label>Tipo de gasto<select name="category">${INVOICE_CATEGORIES.map((category) => `<option value="${category}" ${category === fields.category ? "selected" : ""}>${text(category.charAt(0).toUpperCase() + category.slice(1))}</option>`).join("")}</select></label>
          <label>Número de factura<input name="invoice_number" value="${text(fields.invoice_number || "")}"></label>
          <label>Fecha<input name="invoice_date" value="${text(fields.invoice_date || "")}"></label>
          <label>Total<input name="total" type="number" step="0.01" value="${text(fields.total ?? "")}"></label>
          <label>Moneda<select name="currency"><option value="EUR" ${(fields.currency || "EUR") === "EUR" ? "selected" : ""}>EUR · Euro</option><option value="USD" ${fields.currency === "USD" ? "selected" : ""}>USD · Dólar</option></select></label>
          <button type="submit">Guardar revisión</button>
        </form>
        <div class="next-detected-pages"><strong>Lectura por página</strong>${item.pages.map((page) => `<div><span>Página ${page.page} · ${text(page.method)}</span><b>${Math.round(page.confidence)}%</b><i><em style="width:${Math.max(0, Math.min(100, Number(page.confidence || 0)))}%"></em></i></div>`).join("")}</div>
      </div>
      <div class="next-lines"><div class="next-lines-head"><div><h3>Líneas sugeridas</h3><p>Edita los datos detectados y decide qué líneas pasarán al gasto borrador.</p></div><div class="next-lines-head-actions"><div class="next-lines-balance"><span>Suma líneas <strong>${currencyFormat(accounting.line_total, fields.currency || "EUR")}</strong></span><span>Diferencia <strong>${currencyFormat(accounting.difference, fields.currency || "EUR")}</strong></span></div><button type="button" class="ghost" data-merge-import-lines="${item.id}">Combinar seleccionadas</button><button type="button" class="ghost" data-add-import-line="${item.id}">Añadir línea</button></div></div>${data.lines.length ? data.lines.map(lineMarkup).join("") : `<div class="empty-state">No se detectaron líneas fiables. Añade las necesarias antes de confirmar.</div>`}</div>
      <div class="row-actions next-import-final-actions"><div class="next-discard-action"><button type="button" class="ghost" data-request-discard-import="${item.id}">Eliminar importación</button><span>El archivo y su lectura se borrarán definitivamente.</span></div><button type="button" ${data.duplicates.exact ? "disabled" : ""} data-confirm-import="${item.id}">Confirmar y crear factura borrador</button></div>`;
    $("#expenseImportDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    renderAnnotatedImportViewer(item, data.lines);
  }

  async function loadReplenishment() {
    const data = await api("/api/replenishment/recommendations");
    replenishmentRows = data.recommendations;
    const actionable = replenishmentRows.filter((row) => row.suggested_quantity > 0);
    $("#replenishmentMetrics").innerHTML = metric("Compra sugerida", fmt(actionable.reduce((sum, row) => sum + row.estimated_cost, 0)), `${actionable.length} materiales`) + metric("Críticos", replenishmentRows.filter((row) => row.priority === "critical").length, "Rotura actual") + metric("Requieren configuración", replenishmentRows.filter((row) => row.priority === "configuration").length, "Stock desconocido");
    $("#replenishmentList").innerHTML = replenishmentRows.map((row) => `<article class="next-replenishment-row priority-${row.priority}">
      <input type="checkbox" data-replenishment-select="${row.id}" ${row.suggested_quantity > 0 ? "checked" : "disabled"}>
      <div><strong>${text(row.name)}</strong><small>${text(row.supplier_name || "Sin proveedor")} · ${text(row.reason)}</small></div>
      <div><small>Consumo 30/90</small><strong>${number(row.consumption_30).toFixed(0)} / ${number(row.consumption_90).toFixed(0)}</strong></div>
      <div><small>Cobertura</small><strong>${row.coverage_days === null ? "Configurar" : `${number(row.coverage_days).toFixed(1)} días`}</strong></div>
      <div><small>Sugerencia</small><strong>${number(row.suggested_quantity)} ${text(row.unit_label)}</strong><span>${fmt(row.estimated_cost)}</span></div>
      <span class="status-pill">${text(row.priority)}</span>
    </article>`).join("");
  }

  async function loadPurchasePlans() {
    const rows = await api("/api/purchase-plans");
    $("#purchasePlanList").innerHTML = rows.length ? rows.map((row) => `<article class="next-plan-row"><div><strong>${text(row.name)}</strong><small>${row.order_count} pedidos · ${text(row.status)}</small></div><b>${fmt(row.estimated_total)}</b><button class="ghost" data-open-plan="${row.id}">Abrir</button></article>`).join("") : `<div class="empty-state">No hay planes creados.</div>`;
  }

  async function openPlan(id) {
    const data = await api(`/api/purchase-plans/${id}`);
    currentPurchasePlan = data;
    $("#purchasePlanDetail").classList.remove("hidden");
    $("#purchasePlanDetail").innerHTML = `<div class="panel-head"><div><h2>${text(data.plan.name)}</h2><p>Snapshot de compra · ${fmt(data.plan.estimated_total)}</p></div></div>${data.orders.map((order) => `<section class="next-order"><div class="panel-head"><div><h3>${text(order.supplier_name || "Sin proveedor")}</h3><p>${text(order.status)} · ${fmt(order.estimated_total)}</p></div><button class="ghost" data-order-ordered="${order.id}">Marcar pedido</button></div>${order.lines.map((line) => `<article><span>${text(line.material_name)}</span><b>${number(line.received_quantity)} / ${number(line.ordered_quantity)} ${text(line.unit_label)}</b></article>`).join("")}<button type="button" data-receive-order="${order.id}">Registrar recepción completa pendiente</button></section>`).join("")}`;
  }

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.dataset.expenseSection) switchExpense(button.dataset.expenseSection);
      if (button.dataset.materialsSection) switchMaterials(button.dataset.materialsSection);
      if (button.dataset.openDuplicateInvoice) {
        switchExpense("registered");
        closeInvoicePanels();
        await openInvoice(button.dataset.openDuplicateInvoice);
      }
      if (Object.prototype.hasOwnProperty.call(button.dataset, "closeExpenseImport")) showImportList();
      if (button.dataset.openExpenseImport) await openImport(button.dataset.openExpenseImport);
      if (button.dataset.reprocessImport) { await api(`/api/expense-imports/${button.dataset.reprocessImport}/reprocess`, { method: "POST" }); await loadImports(); }
      if (Object.prototype.hasOwnProperty.call(button.dataset, "batchConfirmImports")) {
        const result = await api("/api/expense-imports/batch-confirm", { method: "POST", body: JSON.stringify({ ids: [...selectedImportIds] }) });
        selectedImportIds.clear();
        toast(`${result.confirmed.length} borradores creados${result.rejected.length ? ` · ${result.rejected.length} requieren revisión` : ""}`);
        await loadImports();
      }
      if (Object.prototype.hasOwnProperty.call(button.dataset, "selectAllEligibleImports")) {
        const eligibleRows = eligibleImportRows();
        const allSelected = eligibleRows.length > 0 && eligibleRows.every((row) => selectedImportIds.has(Number(row.id)));
        eligibleRows.forEach((row) => {
          if (allSelected) selectedImportIds.delete(Number(row.id)); else selectedImportIds.add(Number(row.id));
        });
        renderImportList();
      }
      if (button.dataset.requestDiscardImport) {
        const action = button.closest(".next-discard-action");
        action.classList.add("is-confirming");
        action.innerHTML = `<button type="button" class="danger-button" data-discard-import="${button.dataset.requestDiscardImport}">Sí, eliminar definitivamente</button><button type="button" class="ghost" data-cancel-discard-import="${button.dataset.requestDiscardImport}">Cancelar</button><span>No se podrá recuperar el documento ni su lectura.</span>`;
      }
      if (button.dataset.cancelDiscardImport) await openImport(button.dataset.cancelDiscardImport);
      if (button.dataset.discardImport) { await api(`/api/expense-imports/${button.dataset.discardImport}/discard`, { method: "POST" }); showImportList(); }
      if (button.dataset.confirmImport) {
        const nextId = reviewableRows().find((row) => Number(row.id) !== Number(button.dataset.confirmImport))?.id;
        const result = await api(`/api/expense-imports/${button.dataset.confirmImport}/confirm`, { method: "POST", body: JSON.stringify({}) });
        toast(`Factura borrador #${result.invoice_id} creada`);
        await loadImports();
        if (nextId && expenseImportRows.some((row) => Number(row.id) === Number(nextId))) await openImport(nextId); else showImportList();
      }
      if (button.dataset.addImportLine) {
        await api(`/api/expense-imports/${button.dataset.addImportLine}/lines`, { method: "POST", body: JSON.stringify({ description: "Nueva línea", quantity: 1, line_total: 0, human_decision: "pending" }) });
        await openImport(button.dataset.addImportLine);
      }
      if (button.dataset.deleteImportLine) {
        await api(`/api/expense-imports/${button.dataset.importId}/lines/${button.dataset.deleteImportLine}`, { method: "DELETE" });
        await openImport(button.dataset.importId);
      }
      if (button.dataset.splitImportLine) {
        const row = button.closest("[data-import-line-row]");
        const quantityInput = row.querySelector('[data-line-field="quantity"]');
        const totalInput = row.querySelector('[data-line-field="line_total"]');
        const quantity = number(quantityInput.value);
        const total = number(totalInput.value);
        const firstQuantity = quantity > 1 ? quantity / 2 : quantity;
        const firstTotal = total / 2;
        await api(`/api/expense-imports/${button.dataset.importId}/lines/${button.dataset.splitImportLine}`, { method: "PATCH", body: JSON.stringify({ quantity: firstQuantity, line_total: firstTotal, unit_price: firstQuantity ? firstTotal / firstQuantity : firstTotal }) });
        await api(`/api/expense-imports/${button.dataset.importId}/lines`, { method: "POST", body: JSON.stringify({ description: row.querySelector('[data-line-field="description"]').value, quantity: quantity > 1 ? quantity - firstQuantity : quantity, line_total: firstTotal, unit_price: firstQuantity ? firstTotal / firstQuantity : firstTotal, suggested_material_id: row.querySelector('[data-line-field="suggested_material_id"]').value || null, human_decision: "pending" }) });
        await openImport(button.dataset.importId);
      }
      if (button.dataset.mergeImportLines) {
        const rows = Array.from($("#expenseImportDetail").querySelectorAll("[data-select-import-line]:checked")).map((input) => input.closest("[data-import-line-row]"));
        if (rows.length < 2) throw new Error("Selecciona al menos dos líneas para combinarlas.");
        const first = rows[0];
        const total = rows.reduce((sum, row) => sum + number(row.querySelector('[data-line-field="line_total"]').value), 0);
        const quantity = rows.reduce((sum, row) => sum + number(row.querySelector('[data-line-field="quantity"]').value), 0);
        const description = rows.map((row) => row.querySelector('[data-line-field="description"]').value).filter(Boolean).join(" + ");
        await api(`/api/expense-imports/${button.dataset.mergeImportLines}/lines/${first.dataset.importLineRow}`, { method: "PATCH", body: JSON.stringify({ description, quantity, line_total: total, unit_price: quantity ? total / quantity : total, human_decision: "pending" }) });
        for (const row of rows.slice(1)) await api(`/api/expense-imports/${button.dataset.mergeImportLines}/lines/${row.dataset.importLineRow}`, { method: "DELETE" });
        await openImport(button.dataset.mergeImportLines);
      }
      if (button.dataset.saveImportLine) {
        const row = button.closest("[data-import-line-row]");
        const body = Object.fromEntries(Array.from(row.querySelectorAll("[data-line-field]")).map((input) => [input.dataset.lineField, input.value]));
        body.quantity = number(body.quantity);
        body.unit_price = number(body.unit_price);
        body.line_total = number(body.line_total);
        body.suggested_material_id = body.suggested_material_id || null;
        await api(`/api/expense-imports/${button.dataset.importId}/lines/${button.dataset.saveImportLine}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Línea actualizada");
        await openImport(button.dataset.importId);
      }
      if (button.id === "createPurchasePlan") {
        const material_ids = Array.from(document.querySelectorAll("[data-replenishment-select]:checked")).map((node) => Number(node.dataset.replenishmentSelect));
        await api("/api/purchase-plans", { method: "POST", body: JSON.stringify({ material_ids }) });
        toast("Plan de compra creado"); switchMaterials("purchases");
      }
      if (button.dataset.openPlan) await openPlan(button.dataset.openPlan);
      if (button.dataset.orderOrdered) { await api(`/api/purchase-orders/${button.dataset.orderOrdered}`, { method: "PATCH", body: JSON.stringify({ status: "ordered" }) }); toast("Pedido marcado como realizado"); }
      if (button.dataset.receiveOrder) {
        const order = currentPurchasePlan?.orders?.find((candidate) => String(candidate.id) === button.dataset.receiveOrder);
        if (order) {
          const result = await api(`/api/purchase-orders/${order.id}/receipts`, { method: "POST", body: JSON.stringify({ lines: order.lines.filter((line) => !line.is_excluded && line.received_quantity < line.ordered_quantity).map((line) => ({ purchase_order_line_id: line.id, quantity: line.ordered_quantity - line.received_quantity })) }) });
          toast(result.warning);
          await openPlan(currentPurchasePlan.plan.id);
        }
      }
    } catch (error) { toast(error.message); }
  });

  document.body.addEventListener("change", async (event) => {
    if (event.target.matches("[data-import-filter]")) {
      importFilters[event.target.dataset.importFilter] = event.target.value;
      renderImportList();
      return;
    }
    if (event.target.matches("[data-select-expense-import]")) {
      const id = Number(event.target.dataset.selectExpenseImport);
      if (event.target.checked) selectedImportIds.add(id); else selectedImportIds.delete(id);
      renderImportList();
      return;
    }
    const select = event.target.closest("[data-import-line]");
    if (!select) return;
    await api(`/api/expense-imports/${select.dataset.importId}/lines/${select.dataset.importLine}`, { method: "PATCH", body: JSON.stringify({ human_decision: select.value }) }).catch((error) => toast(error.message));
  });

  document.body.addEventListener("input", (event) => {
    if (event.target.matches('[data-import-filter="query"]')) {
      importFilters.query = event.target.value;
      clearTimeout(importFilterTimer);
      importFilterTimer = setTimeout(renderImportList, 180);
      return;
    }
    if (!event.target.matches('[data-line-field="quantity"],[data-line-field="unit_price"]')) return;
    const row = event.target.closest("[data-import-line-row]");
    const quantity = number(row.querySelector('[data-line-field="quantity"]').value);
    const unitPrice = number(row.querySelector('[data-line-field="unit_price"]').value);
    row.querySelector('[data-line-field="line_total"]').value = (quantity * unitPrice).toFixed(2);
  });

  $("#expenseImportUploadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (importUploading) return;
    const form = event.currentTarget;
    importUploading = true;
    renderSelectedFiles();
    const submit = form.querySelector("button[type=submit]");
    submit.querySelector("span").textContent = "Subiendo facturas...";
    showImportNotice(`<span class="next-spinner"></span><div><strong>Subiendo documentos</strong><small>En cuanto termine la subida aparecerán en la cola de procesamiento local.</small></div>`, "progress");
    try {
      const response = await fetch("/api/expense-imports", { method: "POST", body: new FormData(form) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && !result.rejected) throw new Error(result.error || "No se pudo completar la subida.");
      form.reset();
      const accepted = result.accepted?.length || 0;
      const rejected = result.rejected || [];
      showImportNotice(`<div><strong>${accepted ? `${accepted} ${accepted === 1 ? "factura añadida" : "facturas añadidas"} a la cola.` : "No se añadió ninguna factura."}</strong><small>${rejected.length ? `${rejected.length} rechazadas: ${rejected.map((item) => `${item.name} (${item.error})`).join(", ")}.` : "El estado se actualizará automáticamente mientras se procesan."}</small></div>`, rejected.length ? "warn" : "ok");
      await loadImports();
    } catch (error) {
      showImportNotice(`<div><strong>No se pudo completar la subida.</strong><small>${text(error.message || "Revisa el archivo e inténtalo de nuevo.")}</small></div>`, "danger");
    } finally {
      importUploading = false;
      submit.querySelector("span").textContent = "Importar facturas";
      renderSelectedFiles();
    }
  });

  $("#expenseImportUploadForm input[type=file]")?.addEventListener("change", renderSelectedFiles);
  const dropzone = $("#expenseImportDropzone");
  ["dragenter", "dragover"].forEach((name) => dropzone?.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add("is-dragging"); }));
  dropzone?.addEventListener("dragleave", (event) => { event.preventDefault(); dropzone.classList.remove("is-dragging"); });
  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    const input = $("#expenseImportUploadForm input[type=file]");
    if (event.dataTransfer?.files?.length) input.files = event.dataTransfer.files;
    renderSelectedFiles();
  });

  window.addEventListener("mua:shopify-synced", () => {
    if (!$("#replenishmentPanel")?.classList.contains("hidden")) loadReplenishment().catch((error) => toast(error.message));
    if (!$("#purchasePlannerPanel")?.classList.contains("hidden")) loadPurchasePlans().catch((error) => toast(error.message));
  });

  document.body.addEventListener("submit", async (event) => {
    if (event.target.id !== "expenseImportReviewForm") return;
    event.preventDefault();
    const detected_fields = Object.fromEntries(new FormData(event.target).entries());
    detected_fields.total = Number(detected_fields.total);
    await api(`/api/expense-imports/${event.target.dataset.importId}`, { method: "PATCH", body: JSON.stringify({ detected_fields }) });
    toast("Revisión guardada");
  });
})();
