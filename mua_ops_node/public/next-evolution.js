(() => {
  const expensePage = document.querySelector("#invoices .invoice-page");
  const materialPage = document.querySelector("#materials .materials-page");
  const expenseDefault = expensePage ? Array.from(expensePage.children).filter((node) => !node.matches(".next-domain-tabs,#expenseImportPanel,.invoice-overview-head,#invoiceForm,#invoiceDetailPanel")) : [];
  const materialDefault = materialPage ? Array.from(materialPage.children).filter((node) => !node.matches(".next-domain-tabs,#replenishmentPanel,#purchasePlannerPanel,.materials-overview-head")) : [];
  let replenishmentRows = [];
  let replenishmentParameters = {};
  let replenishmentFilters = { decision: "buy", query: "", supplier: "", confidence: "", family: "", sort: "risk_desc" };
  const replenishmentQuantities = new Map();
  const selectedReplenishmentIds = new Set();
  let replenishmentSelectionInitialized = false;
  let expandedReplenishmentId = null;
  let replenishmentPage = 1;
  const replenishmentPageSize = 10;
  const replenishmentCharts = new Map();
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
  async function refreshRegisteredExpenses() {
    if (typeof window.muaRefreshExpenses === "function") {
      await window.muaRefreshExpenses();
      return;
    }
    window.dispatchEvent(new CustomEvent("mua:expenses-changed"));
  }
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

  function evidenceTokens(fields, lines) {
    const values = Object.values(fields.evidence || {}).map((item) => item?.text).filter(Boolean);
    values.push(fields.suggested_supplier_name, fields.invoice_number, fields.invoice_date, fields.subtotal, fields.discount, fields.shipping, fields.tax, fields.total);
    lines.forEach((line) => {
      values.push(line.original_text, line.description);
      try {
        const evidence = JSON.parse(line.original_data_json || "{}").evidence?.text;
        if (evidence) values.push(evidence);
      } catch {}
    });
    const stopWords = new Set(["para", "como", "este", "esta", "estos", "estas", "desde", "hasta", "todos", "todas", "pedido", "detalle", "articulo", "incluido", "incluida", "unids", "lote", "pago", "tiempo", "orden", "total", "subtotal"]);
    const tokens = new Set(values.flatMap((value) => normalizeEvidence(value).split(" "))
      .filter((token) => (/\d/.test(token) ? token.length >= 3 : token.length >= 5) && !stopWords.has(token)));
    [fields.invoice_number, fields.subtotal, fields.discount, fields.shipping, fields.tax, fields.total].forEach((value) => {
      const token = normalizeEvidence(value);
      if (token.length >= 3) tokens.add(token);
    });
    return tokens;
  }

  function coordinateMatchesEvidence(coordinate, evidence) {
    const token = normalizeEvidence(coordinate.text || coordinate.symbol || "");
    return evidence.has(token) || token.split(" ").some((part) => evidence.has(part));
  }

  async function renderAnnotatedImportViewer(item, lines, providedHost = null) {
    const host = providedHost || $("#expenseImportDetail [data-annotated-document-viewer]");
    const details = host?.closest(".document-viewer");
    if (!host || !details || host.dataset.ready === "true") return;
    host.dataset.ready = "true";
    const evidence = evidenceTokens(item.detected_fields || {}, lines);
    const source = host.dataset.documentSource;
    const setZoom = (value) => {
      const zoom = Math.max(0.5, Math.min(4, Number(value) || 1));
      host.dataset.zoom = String(zoom);
      host.style.setProperty("--document-zoom", zoom);
      const label = details.querySelector(".document-zoom-value");
      if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    };
    host.setZoom = setZoom;
    const renderOverlay = (stage, coordinates, page, widthRatio, heightRatio, nativeViewport = null, offset = { x: 0, y: 0 }) => {
      const zones = [];
      const seenTokens = new Set();
      coordinates.filter((coordinate) => {
        const token = normalizeEvidence(coordinate.text || coordinate.symbol || "");
        if (!coordinateMatchesEvidence(coordinate, evidence) || seenTokens.has(token)) return false;
        seenTokens.add(token);
        return true;
      }).forEach((coordinate) => {
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
          left = Number(box.x0 || box.left || 0) * widthRatio - offset.x;
          top = Number(box.y0 || box.top || 0) * heightRatio - offset.y;
          width = Math.max(8, Number((box.x1 ?? box.right ?? 0) - (box.x0 ?? box.left ?? 0)) * widthRatio);
          height = Math.max(12, Number((box.y1 ?? box.bottom ?? 0) - (box.y0 ?? box.top ?? 0)) * heightRatio);
        }
        if (left + width < 0 || top + height < 0) return;
        const sameLine = zones.find((zone) => Math.abs(zone.top - top) <= Math.max(zone.height, height) * 0.75 && left <= zone.left + zone.width + 18);
        if (sameLine) {
          const right = Math.max(sameLine.left + sameLine.width, left + width);
          sameLine.left = Math.min(sameLine.left, left);
          sameLine.top = Math.min(sameLine.top, top);
          sameLine.width = right - sameLine.left;
          sameLine.height = Math.max(sameLine.height, height);
          sameLine.title = `${sameLine.title} ${coordinate.text || ""}`.trim();
        } else {
          zones.push({ left, top, width, height, title: coordinate.text || "Zona detectada" });
        }
      });
      zones.slice(0, 18).forEach((zone) => {
        const marker = document.createElement("span");
        marker.className = `document-evidence-zone ${Number(page.confidence || 0) >= 85 ? "is-reliable" : "is-review"}`;
        marker.style.cssText = `left:${zone.left}px;top:${zone.top}px;width:${zone.width}px;height:${zone.height}px`;
        marker.title = zone.title;
        stage.appendChild(marker);
      });
    };
    const usefulImageBounds = (image) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const index = (y * canvas.width + x) * 4;
          if (pixels[index + 3] > 10 && (pixels[index] < 246 || pixels[index + 1] < 246 || pixels[index + 2] < 246)) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      const padding = 14;
      return {
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        width: Math.min(image.naturalWidth, maxX + padding) - Math.max(0, minX - padding),
        height: Math.min(image.naturalHeight, maxY + padding) - Math.max(0, minY - padding)
      };
    };
    const renderImage = async () => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const bounds = usefulImageBounds(image);
      const stage = document.createElement("div");
      stage.className = "annotated-document-page";
      stage.style.width = `${bounds.width}px`;
      stage.style.height = `${bounds.height}px`;
      const canvas = document.createElement("canvas");
      canvas.className = "annotated-document-image";
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      canvas.getContext("2d").drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      stage.appendChild(canvas);
      host.replaceChildren(stage);
      host.dataset.fitZoom = String(Math.max(0.5, Math.min(3, (host.clientWidth - 44) / bounds.width)));
      setZoom(1.5);
      const page = item.pages[0] || {};
      const coordinates = page.coordinates || page.words || [];
      const widthRatio = image.naturalWidth / Number(page.ocr_width || image.naturalWidth);
      const heightRatio = image.naturalHeight / Number(page.ocr_height || image.naturalHeight);
      renderOverlay(stage, coordinates, page, widthRatio, heightRatio, null, { x: bounds.x, y: bounds.y });
    };
    const renderPdf = async () => {
      if (!window.pdfjsLib) throw new Error("El motor de vista previa PDF no está disponible.");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
      const pdfSource = typeof source === "string"
        ? { url: source, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/" }
        : { ...source, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/" };
      const pdf = await window.pdfjsLib.getDocument(pdfSource).promise;
      host.replaceChildren();
      host.dataset.fitZoom = "1";
      setZoom(1);
      const pages = item.pages?.length ? item.pages : Array.from({ length: pdf.numPages }, (_, index) => ({ page: index + 1, method: "native", coordinates: [], confidence: 100 }));
      for (const pageData of pages) {
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
  window.renderAnnotatedDocumentViewer = (host, document, lines = []) => renderAnnotatedImportViewer({
    pages: document.document_pages || document.pages || [],
    detected_fields: document.document_detected_fields || document.detected_fields || {}
  }, lines, host);

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
      const precise = (value) => Number(number(value).toFixed(6)).toString();
      return `<article class="next-editable-line" data-import-line-row="${line.id}">
        <input class="next-line-select" type="checkbox" data-select-import-line="${line.id}" aria-label="Seleccionar línea para combinar">
        <label>Concepto<input data-line-field="description" value="${text(line.description)}"></label>
        <label>Paquetes<input data-line-field="package_count" type="number" min="0" step="0.01" value="${number(line.package_count || 1)}"></label>
        <label>Ud/paquete<input data-line-field="units_per_package" type="number" min="0" step="0.01" value="${number(line.units_per_package || line.quantity || 1)}"></label>
        <label>Material<select data-line-field="suggested_material_id" ${isMaterialExpense ? "" : "disabled"}>${materialOptionsMarkup(line.suggested_material_id)}</select></label>
        <label>Precio/paquete ${text(fields.currency || "EUR")}<input data-line-field="price_per_package" type="number" min="0" step="0.000001" value="${precise(line.price_per_package ?? line.line_total)}"></label>
        <label>Precio ud. ${text(fields.currency || "EUR")}<input data-line-field="unit_price" type="number" min="0" step="0.000001" value="${precise(line.unit_price ?? line.line_total)}" readonly></label>
        <label>Total ${text(fields.currency || "EUR")}<input data-line-field="line_total" type="number" min="0" step="0.01" value="${number(line.line_total).toFixed(2)}" readonly></label>
        ${fields.category === "marketing" ? `<label>Impresiones<input data-line-field="impressions" type="number" min="0" step="1" value="${number(line.impressions) || ""}" placeholder="Opcional"></label>` : ""}
        <label>Decisión<select data-line-field="human_decision"><option value="pending" ${line.human_decision === "pending" ? "selected" : ""}>Revisar</option><option value="accepted" ${line.human_decision === "accepted" ? "selected" : ""}>Aceptar</option><option value="rejected" ${line.human_decision === "rejected" ? "selected" : ""}>Excluir</option></select></label>
        <div class="next-editable-line-actions"><button type="button" class="ghost button-with-icon" data-save-import-line="${line.id}" data-import-id="${item.id}" aria-label="Guardar línea" title="Guardar línea"><svg><use href="#icon-save"></use></svg><span>Guardar</span></button><button type="button" class="ghost icon-only" data-split-import-line="${line.id}" data-import-id="${item.id}" aria-label="Dividir línea" title="Dividir línea"><svg><use href="#icon-split"></use></svg></button><button type="button" class="ghost icon-only danger-text" data-delete-import-line="${line.id}" data-import-id="${item.id}" aria-label="Eliminar línea" title="Eliminar línea"><svg><use href="#icon-trash"></use></svg></button></div>
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
          <label>Subtotal<input name="subtotal" type="number" step="0.01" value="${text(fields.subtotal ?? fields.total ?? "")}"></label>
          <label>Descuento<input name="discount" type="number" step="0.01" value="${text(fields.discount ?? 0)}"></label>
          <label>Envío<input name="shipping" type="number" step="0.01" value="${text(fields.shipping ?? 0)}"></label>
          <label>IVA<input name="tax" type="number" step="0.01" value="${text(fields.tax ?? 0)}"></label>
          <label>Total pagado<input name="total" type="number" step="0.01" value="${text(fields.total ?? "")}"></label>
          <label>Moneda<select name="currency"><option value="EUR" ${(fields.currency || "EUR") === "EUR" ? "selected" : ""}>EUR · Euro</option><option value="USD" ${fields.currency === "USD" ? "selected" : ""}>USD · Dólar</option></select></label>
          <button type="submit">Guardar revisión</button>
        </form>
        <div class="next-detected-pages"><strong>Lectura por página</strong>${item.pages.map((page) => `<div><span>Página ${page.page} · ${text(page.method)}</span><b>${Math.round(page.confidence)}%</b><i><em style="width:${Math.max(0, Math.min(100, Number(page.confidence || 0)))}%"></em></i></div>`).join("")}</div>
      </div>
      <div class="next-lines"><div class="next-lines-head"><div><h3>Líneas sugeridas</h3><p>Los precios conservan el importe del producto con IVA incluido cuando el documento lo informa. Descuentos y envío permanecen en la cabecera.</p></div><div class="next-lines-head-actions"><div class="next-lines-balance"><span>Productos <strong>${currencyFormat(accounting.line_total, fields.currency || "EUR")}</strong></span><span>Subtotal <strong>${currencyFormat(accounting.subtotal, fields.currency || "EUR")}</strong></span><span>Descuento <strong>−${currencyFormat(accounting.discount, fields.currency || "EUR")}</strong></span><span>Envío <strong>${currencyFormat(accounting.shipping, fields.currency || "EUR")}</strong></span><span>Total pagado <strong>${currencyFormat(fields.total, fields.currency || "EUR")}</strong></span></div><button type="button" class="ghost" data-merge-import-lines="${item.id}">Combinar seleccionadas</button><button type="button" class="ghost" data-add-import-line="${item.id}">Añadir línea</button></div></div>${data.lines.length ? data.lines.map(lineMarkup).join("") : `<div class="empty-state">No se detectaron líneas fiables. Añade las necesarias antes de confirmar.</div>`}</div>
      <div class="row-actions next-import-final-actions"><div class="next-discard-action"><button type="button" class="ghost" data-request-discard-import="${item.id}">Eliminar importación</button><span>El archivo y su lectura se borrarán definitivamente.</span></div><button type="button" ${data.duplicates.exact ? "disabled" : ""} data-confirm-import="${item.id}">Confirmar y crear factura borrador</button></div>`;
    $("#expenseImportDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    renderAnnotatedImportViewer(item, data.lines);
  }

  async function loadReplenishment() {
    const data = await api("/api/replenishment/recommendations");
    replenishmentRows = data.recommendations;
    replenishmentParameters = data.parameters || {};
    replenishmentRows.forEach((row) => {
      if (!replenishmentQuantities.has(Number(row.id))) replenishmentQuantities.set(Number(row.id), Number(row.suggested_quantity || 0));
    });
    replenishmentSelectionInitialized = true;
    renderReplenishment();
  }


  function replenishmentConfidenceText(value) {
    return ({ high: "Alta", medium: "Media", low: "Baja", manual: "Manual", incomplete: "Incompleta" })[value] || "Media";
  }

  function replenishmentPriorityText(value) {
    return ({ critical: "Rotura", high: "Urgente", medium: "Vigilar", low: "Cubierto", configuration: "Configurar" })[value] || "Revisar";
  }

  function replenishmentTrendMeta(value) {
    return {
      accelerating: { label: "Demanda al alza", icon: "trending-up", className: "accelerating" },
      slowing: { label: "Demanda a la baja", icon: "trending-down", className: "slowing" },
      stable: { label: "Demanda estable", icon: "minus", className: "stable" }
    }[value] || { label: "Demanda estable", icon: "minus", className: "stable" };
  }

  function replenishmentCoverageDays(row, quantity = 0) {
    const daily = number(row.weighted_daily_demand || row.daily_demand);
    if (!daily) return 0;
    return Math.round((number(row.effective_stock) + number(quantity)) / daily);
  }

  function replenishmentWeeklyDemand(row) {
    const daily = number(row.weighted_daily_demand || row.daily_demand);
    if (daily > 0) return daily * 7;
    const recent = number(row.consumption_30) / 30;
    const baseline = number(row.consumption_90) / 90;
    return (recent * 0.7 + baseline * 0.3) * 7;
  }

  function replenishmentReasonText(row, quantity = 0) {
    if (row.blockers?.includes("supplier")) return "Falta proveedor";
    if (row.blockers?.includes("stock")) return "Falta stock";
    if (!row.stock_known) return "Sin stock conocido";
    const stock = number(row.effective_stock);
    const target = number(row.calculated_target_stock);
    const coverage = row.coverage_days === null ? null : number(row.coverage_days);
    const leadDays = number(row.lead_days);
    if (stock <= 0 && number(quantity) > 0) return "Stock agotado";
    if (row.decision === "healthy" || (number(quantity) <= 0 && stock >= target)) return "Stock suficiente";
    if (coverage !== null && leadDays && coverage <= leadDays) return "Riesgo de rotura";
    if (row.trend === "accelerating") return "Demanda al alza";
    if (row.decision === "monitor") return "Vigilar cobertura";
    if (row.reason_code) return String(row.reason_code).replaceAll("_", " ");
    return "Revisar cobertura";
  }

  function replenishmentDetailTitle(row, quantity = 0) {
    return number(quantity) > 0 ? `Por que recomendamos ${number(quantity)} ${text(row.unit_label)}` : "No recomendamos compra ahora";
  }

  function replenishmentDetailExplanation(row, quantity = 0) {
    if (number(quantity) <= 0 && row.stock_known) {
      const coverage = row.coverage_days === null ? "sin limite calculado" : `${Math.round(number(row.coverage_days))} dias`;
      return `La cobertura actual es de ${coverage} frente a ${number(row.lead_days)} dias de plazo. No hay deficit hasta el objetivo calculado.`;
    }
    return row.explanation || row.reason || "La cobertura no alcanza el plazo de entrega configurado.";
  }

  function replenishmentMaterialThumb(row) {
    if (row.image_url) return `<img src="${text(row.image_url)}" alt="">`;
    return `<span><svg><use href="#icon-cube"></use></svg></span>`;
  }

  function replenishmentFilteredRows() {
    const query = replenishmentFilters.query.toLocaleLowerCase("es");
    const priorityRank = { critical: 0, high: 1, medium: 2, configuration: 3, low: 4 };
    const rows = replenishmentRows.filter((row) => (!replenishmentFilters.decision || row.decision === replenishmentFilters.decision)
      && (!replenishmentFilters.supplier || row.supplier_name === replenishmentFilters.supplier)
      && (!replenishmentFilters.family || (row.family || row.category) === replenishmentFilters.family)
      && (!replenishmentFilters.confidence || row.confidence === replenishmentFilters.confidence)
      && (!query || [row.name, row.supplier_name, row.family, row.category].join(" ").toLocaleLowerCase("es").includes(query)));
    const sort = replenishmentFilters.sort || "risk_desc";
    return rows.sort((a, b) => {
      if (sort === "cost_desc") return number(b.unit_cost) * number(replenishmentQuantities.get(Number(b.id))) - number(a.unit_cost) * number(replenishmentQuantities.get(Number(a.id)));
      if (sort === "demand_desc") return number(b.weighted_daily_demand || b.daily_demand) - number(a.weighted_daily_demand || a.daily_demand);
      if (sort === "name_asc") return String(a.name || "").localeCompare(String(b.name || ""), "es");
      return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || number(b.suggested_quantity) - number(a.suggested_quantity);
    });
  }

  function getReplenishmentChart(node) {
    if (!window.echarts || !node) return null;
    const current = replenishmentCharts.get(node.id);
    if (current) return current;
    const chart = window.echarts.init(node, null, { renderer: "canvas" });
    replenishmentCharts.set(node.id, chart);
    return chart;
  }

  function renderReplenishmentCharts() {
    if (!window.echarts) return;
    const live = new Set();
    document.querySelectorAll("[data-replenishment-demand-chart]").forEach((node) => {
      const id = Number(node.dataset.replenishmentDemandChart);
      const row = replenishmentRows.find((item) => Number(item.id) === id);
      if (!row) return;
      live.add(node.id);
      const chart = getReplenishmentChart(node);
      const history = Array.isArray(row.demand_history) ? row.demand_history : [];
      const labels = history.length ? history.map((item) => text(item.label || item.week)) : ["30d", "90d"];
      const direct = history.length ? history.map((item) => number(item.direct)) : [number(row.consumption_30), number(row.consumption_90)];
      const sets = history.length ? history.map((item) => number(item.sets)) : [0, 0];
      const total = history.length ? history.map((item) => number(item.total)) : [number(row.consumption_30), number(row.consumption_90)];
      const weeklyAverage = replenishmentWeeklyDemand(row);
      chart.setOption({
        animation: false,
        grid: { left: 42, right: 14, top: 24, bottom: 34 },
        color: ["#0b8778", "#d08a28", "#cf304b", "#8f7d70"],
        tooltip: { trigger: "axis", valueFormatter: (value) => `${number(value).toFixed(1)} ud` },
        legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 6, textStyle: { fontSize: 10 } },
        xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLabel: { color: "#6f6762", fontSize: 10 } },
        yAxis: { type: "value", min: 0, axisLabel: { color: "#6f6762", fontSize: 10 }, splitLine: { lineStyle: { color: "#eee6de" } } },
        series: [
          { name: "Pedidos", type: "bar", stack: "usage", data: direct, barMaxWidth: 20, itemStyle: { borderRadius: [4, 4, 0, 0] } },
          { name: "Sets", type: "bar", stack: "usage", data: sets, barMaxWidth: 20, itemStyle: { borderRadius: [4, 4, 0, 0] } },
          { name: "Total", type: "line", data: total, smooth: true, symbolSize: 5, lineStyle: { width: 2 } },
          { name: "Media semanal", type: "line", data: labels.map(() => weeklyAverage), symbol: "none", lineStyle: { width: 1.8, type: "dashed", color: "#8f7d70" }, itemStyle: { color: "#8f7d70" } }
        ]
      });
      chart.resize();
    });
    document.querySelectorAll("[data-replenishment-projection-chart]").forEach((node) => {
      const id = Number(node.dataset.replenishmentProjectionChart);
      const row = replenishmentRows.find((item) => Number(item.id) === id);
      if (!row) return;
      live.add(node.id);
      const chart = getReplenishmentChart(node);
      const quantity = number(replenishmentQuantities.get(id));
      const daily = number(row.weighted_daily_demand || row.daily_demand);
      const stock = number(row.effective_stock);
      const arrival = Math.max(0, number(row.projection?.arrival_day || row.lead_days || 0));
      const safety = number(row.projection?.safety_level || replenishmentParameters.safety_days || 0);
      const horizon = Math.max(30, Math.min(90, number(row.projection?.horizon_days || 72)));
      const points = Array.from(new Set([0, arrival, horizon, ...Array.from({ length: Math.floor(horizon / 6) + 1 }, (_, index) => index * 6).filter((day) => day <= horizon)])).sort((a, b) => a - b);
      const labels = points.map((day) => `${day}d`);
      const withoutPurchase = points.map((day) => Math.max(0, stock - daily * day));
      const withPurchase = points.map((day) => Math.max(0, stock + (day >= arrival ? quantity : 0) - daily * day));
      const safetyLine = points.map(() => safety);
      chart.setOption({
        animation: false,
        grid: { left: 42, right: 18, top: 24, bottom: 34 },
        tooltip: { trigger: "axis", valueFormatter: (value) => `${number(value).toFixed(1)} ud` },
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 6, textStyle: { fontSize: 10 } },
        xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLabel: { color: "#6f6762", fontSize: 10 } },
        yAxis: { type: "value", min: 0, axisLabel: { color: "#6f6762", fontSize: 10 }, splitLine: { lineStyle: { color: "#eee6de" } } },
        series: [
          { name: "Sin comprar", type: "line", data: withoutPurchase, smooth: true, symbolSize: 4, lineStyle: { width: 2, type: "dashed", color: "#cf304b" }, itemStyle: { color: "#cf304b" } },
          { name: "Con compra", type: "line", data: withPurchase, smooth: true, symbolSize: 4, lineStyle: { width: 2, color: "#0b8778" }, itemStyle: { color: "#0b8778" }, markLine: { symbol: "none", label: { formatter: "Llegada", color: "#0b8778" }, lineStyle: { color: "#0b8778", type: "dashed" }, data: [{ xAxis: `${arrival}d` }] } },
          { name: "Seguridad", type: "line", data: safetyLine, symbol: "none", lineStyle: { color: "#d08a28", type: "dotted" } }
        ]
      });
      chart.resize();
    });
    for (const [id, chart] of replenishmentCharts.entries()) {
      if (!live.has(id)) {
        chart.dispose();
        replenishmentCharts.delete(id);
      }
    }
  }

  function renderReplenishment() {
    const actions = [
      { key: "buy", decision: "buy", label: "Comprar ahora" },
      { key: "monitor", decision: "monitor", label: "Comprar pronto" },
      { key: "review", decision: "configure", label: "Revisar" },
      { key: "healthy", decision: "healthy", label: "Cubierto" }
    ];
    const actionable = replenishmentRows.filter((row) => row.decision === "buy");
    const planReady = actionable.filter((row) => row.can_plan);
    const estimated = planReady.reduce((sum, row) => sum + number(row.unit_cost) * number(replenishmentQuantities.get(Number(row.id))), 0);
    const unpriced = planReady.filter((row) => !row.cost_known).length;
    const atRisk = replenishmentRows.filter((row) => row.risk_before_arrival).length;
    const blocked = replenishmentRows.filter((row) => row.decision === "configure" || (row.decision === "buy" && !row.can_plan)).length;
    const metricCard = (tone, icon, label, value, hint) => `<article class="replenishment-kpi tone-${tone}"><span class="replenishment-kpi-icon"><svg><use href="#icon-${icon}"></use></svg></span><div><small>${text(label)}</small><strong>${text(value)}</strong><span>${text(hint)}</span></div></article>`;
    $("#replenishmentMetrics").innerHTML = [
      metricCard("danger", "alert", "Riesgo de rotura", atRisk, "Se agotan antes de la llegada"),
      metricCard("success", "package", "Compra recomendada", planReady.length, "Materiales con evidencia fiable"),
      metricCard("neutral", "coin", "Inversion estimada", fmt(estimated), `${planReady.length} de ${actionable.length} con coste`),
      metricCard("warning", "clipboard", "Requieren revision", blocked + unpriced, "Datos o referencias manuales")
    ].join("");

    const suppliers = [...new Set(replenishmentRows.map((row) => row.supplier_name).filter(Boolean))].sort();
    const families = [...new Set(replenishmentRows.map((row) => row.family || row.category).filter(Boolean))].sort();
    const visible = replenishmentFilteredRows();
    const totalPages = Math.max(1, Math.ceil(visible.length / replenishmentPageSize));
    replenishmentPage = Math.min(Math.max(1, replenishmentPage), totalPages);
    const pageRows = visible.slice((replenishmentPage - 1) * replenishmentPageSize, replenishmentPage * replenishmentPageSize);
    const selected = [...selectedReplenishmentIds];
    const selectedSpend = selected.reduce((sum, id) => {
      const row = replenishmentRows.find((item) => Number(item.id) === id);
      return sum + number(row?.unit_cost) * number(replenishmentQuantities.get(id));
    }, 0);
    const activeAction = actions.find((action) => action.decision === replenishmentFilters.decision)?.key || "buy";

    $("#replenishmentTools").innerHTML = `<div class="next-replenishment-tabs">${actions.map((action) => `<button type="button" class="ghost ${activeAction === action.key ? "is-active" : ""}" data-replenishment-action="${action.key}">${action.label} <span>${replenishmentRows.filter((row) => row.decision === action.decision).length}</span></button>`).join("")}</div>
      <div class="replenishment-filter-panel"><div class="next-replenishment-filters"><label>Buscar<input type="search" data-replenishment-filter="query" value="${text(replenishmentFilters.query)}" placeholder="Material o proveedor"></label><label>Proveedor<select data-replenishment-filter="supplier"><option value="">Todos</option>${suppliers.map((supplier) => `<option ${supplier === replenishmentFilters.supplier ? "selected" : ""}>${text(supplier)}</option>`).join("")}</select></label><label>Confianza<select data-replenishment-filter="confidence"><option value="">Todas</option><option value="high" ${replenishmentFilters.confidence === "high" ? "selected" : ""}>Alta</option><option value="medium" ${replenishmentFilters.confidence === "medium" ? "selected" : ""}>Media</option><option value="manual" ${replenishmentFilters.confidence === "manual" ? "selected" : ""}>Manual</option><option value="low" ${replenishmentFilters.confidence === "low" ? "selected" : ""}>Baja</option></select></label><label>Familia<select data-replenishment-filter="family"><option value="">Todas</option>${families.map((family) => `<option ${family === replenishmentFilters.family ? "selected" : ""}>${text(family)}</option>`).join("")}</select></label><label>Ordenar por<select data-replenishment-filter="sort"><option value="risk_desc" ${replenishmentFilters.sort === "risk_desc" ? "selected" : ""}>Riesgo</option><option value="cost_desc" ${replenishmentFilters.sort === "cost_desc" ? "selected" : ""}>Mayor inversion</option><option value="demand_desc" ${replenishmentFilters.sort === "demand_desc" ? "selected" : ""}>Mayor demanda</option><option value="name_asc" ${replenishmentFilters.sort === "name_asc" ? "selected" : ""}>Nombre A-Z</option></select></label></div></div>
      <div class="next-selection-bar"><button type="button" class="ghost" data-select-reliable-replenishment>Seleccionar recomendaciones fiables</button><div><strong>${selected.length} seleccionados</strong><span>${fmt(selectedSpend)} estimados</span></div><button id="createPurchasePlan" type="button" class="button-with-icon" ${selected.length ? "" : "disabled"}><svg><use href="#icon-plus"></use></svg><span>Preparar plan de compra</span></button></div>`;

    const listHead = `<div class="replenishment-list-head"><span></span><span>Material</span><span>Stock</span><span>Demanda</span><span>Cobertura</span><span>Sugerido</span><span>Confianza</span><span>Motivo</span><span></span></div>`;
    const listRows = pageRows.map((row) => {
      const id = Number(row.id);
      const quantity = number(replenishmentQuantities.get(id));
      const coverage = row.coverage_days === null ? "Sin calcular" : `${number(row.coverage_days).toFixed(row.coverage_days < 10 ? 1 : 0)} dias`;
      const blocker = row.blockers?.includes("supplier") ? "Falta proveedor" : row.blockers?.includes("stock") ? "Falta stock" : "";
      const trend = replenishmentTrendMeta(row.trend);
      const expanded = expandedReplenishmentId === id;
      const stockGoal = Math.ceil(number(row.calculated_target_stock));
      const deficit = Math.max(0, number(row.calculated_target_stock) - number(row.effective_stock));
      const projectedCoverage = replenishmentCoverageDays(row, quantity);
      const supplierIcon = row.supplier_name ? entityIconMarkup(row.supplier_name, { type: "supplier", className: "supplier-avatar compact", label: row.supplier_name }) : "";
      const weeklyDemand = replenishmentWeeklyDemand(row);
      const demandLabel = weeklyDemand > 0 ? `${weeklyDemand.toFixed(1)} ud/sem` : "Sin demanda";
      const reasonText = replenishmentReasonText(row, quantity);
      const detailTitle = replenishmentDetailTitle(row, quantity);
      const detailExplanation = replenishmentDetailExplanation(row, quantity);
      return `<article class="next-replenishment-row-v2 priority-${row.priority} ${expanded ? "is-expanded" : ""}">
        <label class="next-replenishment-check"><input type="checkbox" data-replenishment-select="${row.id}" ${selectedReplenishmentIds.has(id) ? "checked" : ""} ${row.can_plan ? "" : "disabled"}><span></span></label>
        <div class="replenishment-material-cell"><div class="replenishment-material-thumb">${replenishmentMaterialThumb(row)}</div><span><strong>${text(row.name)}</strong><small>${supplierIcon}${text(row.supplier_name || "Sin proveedor")}</small><em>${text(row.family || row.category || "material")}${row.subfamily ? ` · ${text(row.subfamily)}` : ""}</em></span></div>
        <div class="replenishment-stock-cell"><small>Stock disponible</small><strong>${row.stock_known ? `${number(row.effective_stock)} ${text(row.unit_label)}` : "Sin stock"}</strong><span>Objetivo ${stockGoal}</span></div>
        <div class="replenishment-demand-cell"><small>Media semanal</small><strong>${text(demandLabel)}</strong><span class="next-trend trend-${trend.className}" title="${text(trend.label)}"><svg><use href="#icon-${trend.icon}"></use></svg></span><em>30d ${number(row.consumption_30).toFixed(0)} / 90d ${number(row.consumption_90).toFixed(0)}</em></div>
        <div class="replenishment-coverage-cell"><small>Cobertura / llegada</small><strong>${coverage}</strong><span>Llega en ${number(row.lead_days)} dias</span></div>
        <div class="next-replenishment-quantity"><small>Cantidad sugerida</small><div class="replenishment-quantity-inline"><input type="number" min="0" step="${number(row.purchase_pack_size) || 1}" value="${quantity}" data-replenishment-quantity="${row.id}" ${row.decision === "buy" ? "" : "disabled"}><strong>${text(row.unit_label)}</strong></div><span>${row.cost_known ? `${fmt(quantity * number(row.unit_cost))} · ${fmt(number(row.unit_cost))}/ud` : "Sin coste registrado"}</span></div>
        <div class="replenishment-confidence"><small>Confianza</small><span class="status-pill confidence-${row.confidence || "medium"}">${text(replenishmentConfidenceText(row.confidence))}</span><span>${text(row.cost_known ? "Demanda observada" : "Sin coste")}</span></div>
        <div class="replenishment-reason"><small>Motivo principal</small><strong>${text(blocker || reasonText)}</strong><span class="status-pill tone-${row.priority}">${text(replenishmentPriorityText(row.priority))}</span></div>
        <button type="button" class="ghost icon-button replenishment-expand" data-toggle-replenishment="${row.id}" aria-label="Ver detalle"><svg><use href="#icon-${expanded ? "chevron-up" : "arrow-right"}"></use></svg></button>
        ${expanded ? `<div class="replenishment-detail">
          <div class="replenishment-formula-head"><div><strong>${text(detailTitle)}</strong><span>${text(detailExplanation)}</span></div><button type="button" class="secondary-btn replenishment-material-link" data-open-material="${row.id}"><svg><use href="#icon-eye"></use></svg><span>Ver ficha completa</span></button></div>
          <div class="replenishment-chart-grid">
            <section class="replenishment-chart-card"><div class="replenishment-chart-head"><div><strong>Demanda ultimas 12 semanas</strong><span>Consumo real, sets y media ponderada: ${text(demandLabel)}.</span></div></div><div id="replenishmentDemandChart-${id}" class="replenishment-echart" data-replenishment-demand-chart="${id}"></div></section>
            <section class="replenishment-chart-card"><div class="replenishment-chart-head"><div><strong>Proyeccion de stock</strong><span>Escenario constante con la demanda ponderada actual.</span></div></div><div id="replenishmentProjectionChart-${id}" class="replenishment-echart" data-replenishment-projection-chart="${id}"></div><div class="replenishment-projection-summary"><span><small>Rotura prevista</small><strong>${row.coverage_days === null ? "Sin dato" : `${Math.max(0, Math.round(number(row.coverage_days)))} dias`}</strong></span><span><small>Cobertura tras compra</small><strong>${projectedCoverage} dias</strong></span><span><small>Llegada estimada</small><strong>${number(row.lead_days)} dias</strong></span></div></section>
          </div>
          <div class="replenishment-formula-flow"><span><em>Objetivo calculado</em><strong>${stockGoal}</strong><em>${number(row.formula?.horizon_days || 0) || "Horizonte"} dias de horizonte</em></span><b>-</b><span><em>Stock disponible</em><strong>${number(row.effective_stock)}</strong><em>${row.stock_source ? `Fuente ${text(row.stock_source)}` : "Fuente Shopify"}</em></span><b>=</b><span><em>Deficit neto</em><strong>${deficit.toFixed(1)}</strong><em>Antes de redondear</em></span><b>→</b><span class="is-result"><em>Comprar</em><strong>${quantity}</strong><em>Pack ${number(row.purchase_pack_size) || 1} · minimo ${number(row.minimum_order_quantity) || 1}</em></span></div>
          <div class="replenishment-source-notes"><span>Consumo: pedidos + sets activos</span><span>Plazo: ${number(row.lead_days)} dias</span><span>Seguridad: ${number(replenishmentParameters.safety_days || 7)} dias</span></div>
          <div class="replenishment-simulator"><div><small>Simulador</small><strong>Prueba otra cantidad sin modificar el calculo base.</strong></div><label>Cantidad<input type="number" min="0" step="${number(row.purchase_pack_size) || 1}" value="${quantity}" data-replenishment-simulator="${row.id}"></label><span><small>Cobertura resultante</small><strong>${projectedCoverage} dias</strong></span><button type="button" data-use-replenishment-simulator="${row.id}">Usar esta cantidad</button></div>
        </div>` : ""}
      </article>`;
    }).join("");
    const pagination = visible.length > replenishmentPageSize ? `<div class="replenishment-pagination"><div class="replenishment-pagination-meta"><strong>${visible.length} recomendaciones</strong><span>Pagina ${replenishmentPage} de ${totalPages}</span></div><div class="replenishment-pagination-actions"><button type="button" class="ghost" data-replenishment-page="${Math.max(1, replenishmentPage - 1)}" ${replenishmentPage === 1 ? "disabled" : ""}>Anterior</button>${Array.from({ length: totalPages }, (_, index) => index + 1).filter((page) => page === 1 || page === totalPages || Math.abs(page - replenishmentPage) <= 1).map((page, index, pages) => `${index && page - pages[index - 1] > 1 ? "<span>...</span>" : ""}<button type="button" class="ghost ${page === replenishmentPage ? "is-active" : ""}" data-replenishment-page="${page}">${page}</button>`).join("")}<button type="button" class="ghost" data-replenishment-page="${Math.min(totalPages, replenishmentPage + 1)}" ${replenishmentPage === totalPages ? "disabled" : ""}>Siguiente</button></div></div>` : "";
    $("#replenishmentList").innerHTML = visible.length ? `${listHead}${listRows}${pagination}` : `<div class="empty-state">No hay materiales en esta decision con los filtros aplicados.</div>`;
    requestAnimationFrame(renderReplenishmentCharts);
  }

  async function loadPurchasePlans() {
    const rows = await api("/api/purchase-plans");
    $("#purchasePlanListPanel").classList.remove("hidden");
    $("#purchasePlanDetail").classList.add("hidden");
    $("#purchasePlanList").innerHTML = rows.length ? rows.map((row) => `<article class="next-plan-row"><div><strong>${text(row.name)}</strong><small>${row.order_count} proveedores · ${row.line_count} materiales</small></div><span class="status-pill tone-${text(row.status)}">${text(row.status)}</span><div><small>Pendiente</small><strong>${number(row.pending_units)} uds</strong></div><b>${fmt(row.estimated_total)}</b><button class="ghost" data-open-plan="${row.id}">Abrir plan</button></article>`).join("") : `<div class="empty-state next-plan-empty"><strong>Aún no hay planes de compra</strong><span>Empieza por revisar las recomendaciones y prepara una compra agrupada por proveedor.</span><button type="button" data-materials-section="replenishment">Preparar primera compra</button></div>`;
  }

  async function openPlan(id) {
    const data = await api(`/api/purchase-plans/${id}`);
    currentPurchasePlan = data;
    $("#purchasePlanListPanel").classList.add("hidden");
    $("#purchasePlanDetail").classList.remove("hidden");
    $("#purchasePlanDetail").innerHTML = `<div class="panel-head"><div><p class="eyebrow">Plan de compra</p><h2>${text(data.plan.name)}</h2><p>${data.orders.length} proveedores · ${fmt(data.plan.estimated_total)} estimados · ${text(data.plan.status)}</p></div><button class="ghost button-with-icon" data-close-plan><svg><use href="#icon-arrow-left"></use></svg><span>Volver a planes</span></button></div>
      <div class="next-plan-progress">${data.orders.map((order) => `<span class="is-${order.status}">${text(order.supplier_name || "Sin proveedor")} · ${text(order.status)}</span>`).join("")}</div>
      ${data.orders.map((order) => `<section class="next-order"><div class="panel-head"><div><h3>${text(order.supplier_name || "Sin proveedor")}</h3><p>${order.lines.filter((line) => !line.is_excluded).length} materiales · ${fmt(order.estimated_total)}</p></div><div class="row-actions"><span class="status-pill tone-${order.status}">${text(order.status)}</span>${order.status === "draft" ? `<button class="ghost" data-order-ordered="${order.id}">Marcar como pedido</button>` : ""}</div></div>
        <div class="next-order-lines">${order.lines.map((line) => { const pending = Math.max(0, number(line.ordered_quantity) - number(line.received_quantity)); return `<article class="${line.is_excluded ? "is-excluded" : ""}" data-purchase-line-row="${line.id}"><label class="next-replenishment-check"><input type="checkbox" data-purchase-line-excluded="${line.id}" ${line.is_excluded ? "" : "checked"} ${order.status === "draft" ? "" : "disabled"}><span></span></label><div><strong>${text(line.material_name)}</strong><small>${text(line.reason_snapshot)}</small></div><label>Pedido<input type="number" min="0" step="${number(line.pack_size_snapshot) || 1}" value="${number(line.ordered_quantity)}" data-purchase-line-quantity="${line.id}" ${order.status === "draft" ? "" : "disabled"}></label><div><small>Recibido</small><strong>${number(line.received_quantity)} / ${number(line.ordered_quantity)} ${text(line.unit_label)}</strong></div><div><small>Coste</small><strong>${fmt(number(line.ordered_quantity) * number(line.unit_cost_snapshot))}</strong></div>${["ordered", "partially_received"].includes(order.status) && pending > 0 ? `<label>Recibir ahora<input type="number" min="0" max="${pending}" value="${pending}" data-receipt-quantity="${line.id}"></label>` : ""}</article>`; }).join("")}</div>
        <div class="next-order-footer"><span>La recepción queda trazada, pero el stock solo cambia al sincronizar Shopify.</span>${["ordered", "partially_received"].includes(order.status) ? `<button type="button" data-receive-order="${order.id}">Registrar recepción</button>` : ""}</div></section>`).join("")}`;
  }

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.dataset.documentZoom) {
        const host = button.closest(".document-viewer")?.querySelector("[data-annotated-document-viewer]");
        if (host?.setZoom) {
          const current = Number(host.dataset.zoom || 1);
          const next = button.dataset.documentZoom === "fit" ? Number(host.dataset.fitZoom || 1)
            : button.dataset.documentZoom === "in" ? current + 0.25 : current - 0.25;
          host.setZoom(next);
        }
      }
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
        await Promise.all([loadImports(), refreshRegisteredExpenses()]);
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
      if (button.dataset.discardImport) { await api(`/api/expense-imports/${button.dataset.discardImport}/discard`, { method: "POST" }); await refreshRegisteredExpenses(); showImportList(); }
      if (button.dataset.confirmImport) {
        const nextId = reviewableRows().find((row) => Number(row.id) !== Number(button.dataset.confirmImport))?.id;
        const result = await api(`/api/expense-imports/${button.dataset.confirmImport}/confirm`, { method: "POST", body: JSON.stringify({}) });
        toast(`Factura borrador #${result.invoice_id} creada`);
        await Promise.all([loadImports(), refreshRegisteredExpenses()]);
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
        const packages = number(row.querySelector('[data-line-field="package_count"]').value);
        const unitsPackage = number(row.querySelector('[data-line-field="units_per_package"]').value);
        const pricePackage = number(row.querySelector('[data-line-field="price_per_package"]').value);
        const firstPackages = packages > 1 ? packages / 2 : packages;
        const firstUnitsPackage = packages > 1 ? unitsPackage : unitsPackage / 2;
        const firstPricePackage = packages > 1 ? pricePackage : pricePackage / 2;
        await api(`/api/expense-imports/${button.dataset.importId}/lines/${button.dataset.splitImportLine}`, { method: "PATCH", body: JSON.stringify({ package_count: firstPackages, units_per_package: firstUnitsPackage, price_per_package: firstPricePackage }) });
        const impressions = number(row.querySelector('[data-line-field="impressions"]')?.value);
        await api(`/api/expense-imports/${button.dataset.importId}/lines`, { method: "POST", body: JSON.stringify({ description: row.querySelector('[data-line-field="description"]').value, package_count: packages - firstPackages || firstPackages, units_per_package: firstUnitsPackage, price_per_package: firstPricePackage, line_total: firstPackages * firstPricePackage, impressions: impressions ? impressions / 2 : null, suggested_material_id: row.querySelector('[data-line-field="suggested_material_id"]').value || null, human_decision: "pending" }) });
        if (impressions) await api(`/api/expense-imports/${button.dataset.importId}/lines/${button.dataset.splitImportLine}`, { method: "PATCH", body: JSON.stringify({ impressions: impressions / 2 }) });
        await openImport(button.dataset.importId);
      }
      if (button.dataset.mergeImportLines) {
        const rows = Array.from($("#expenseImportDetail").querySelectorAll("[data-select-import-line]:checked")).map((input) => input.closest("[data-import-line-row]"));
        if (rows.length < 2) throw new Error("Selecciona al menos dos líneas para combinarlas.");
        const first = rows[0];
        const total = rows.reduce((sum, row) => sum + number(row.querySelector('[data-line-field="line_total"]').value), 0);
        const totalUnits = rows.reduce((sum, row) => sum + number(row.querySelector('[data-line-field="package_count"]').value) * number(row.querySelector('[data-line-field="units_per_package"]').value), 0);
        const packages = rows.reduce((sum, row) => sum + number(row.querySelector('[data-line-field="package_count"]').value), 0);
        const impressions = rows.reduce((sum, row) => sum + number(row.querySelector('[data-line-field="impressions"]')?.value), 0);
        const description = rows.map((row) => row.querySelector('[data-line-field="description"]').value).filter(Boolean).join(" + ");
        await api(`/api/expense-imports/${button.dataset.mergeImportLines}/lines/${first.dataset.importLineRow}`, { method: "PATCH", body: JSON.stringify({ description, package_count: packages, units_per_package: packages ? totalUnits / packages : totalUnits, price_per_package: packages ? total / packages : total, impressions: impressions || null, human_decision: "pending" }) });
        for (const row of rows.slice(1)) await api(`/api/expense-imports/${button.dataset.mergeImportLines}/lines/${row.dataset.importLineRow}`, { method: "DELETE" });
        await openImport(button.dataset.mergeImportLines);
      }
      if (button.dataset.saveImportLine) {
        const row = button.closest("[data-import-line-row]");
        const body = Object.fromEntries(Array.from(row.querySelectorAll("[data-line-field]")).map((input) => [input.dataset.lineField, input.value]));
        body.package_count = number(body.package_count);
        body.units_per_package = number(body.units_per_package);
        body.total_units = body.package_count * body.units_per_package;
        body.quantity = body.total_units;
        body.price_per_package = number(body.price_per_package);
        body.unit_price = number(body.unit_price);
        body.line_total = number(body.line_total);
        body.suggested_material_id = body.suggested_material_id || null;
        await api(`/api/expense-imports/${button.dataset.importId}/lines/${button.dataset.saveImportLine}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Línea actualizada");
        await openImport(button.dataset.importId);
      }
      if (button.id === "createPurchasePlan") {
        const lines = Array.from(document.querySelectorAll("[data-replenishment-select]:checked")).map((node) => ({
          material_id: Number(node.dataset.replenishmentSelect),
          ordered_quantity: number(replenishmentQuantities.get(Number(node.dataset.replenishmentSelect)))
        })).filter((line) => line.ordered_quantity > 0);
        await api("/api/purchase-plans", { method: "POST", body: JSON.stringify({ lines }) });
        toast("Plan de compra creado"); switchMaterials("purchases");
      }
      if (button.dataset.replenishmentDecision) {
        replenishmentFilters.decision = button.dataset.replenishmentDecision;
        renderReplenishment();
      }
      if (button.dataset.replenishmentAction) {
        const actionToDecision = { buy: "buy", monitor: "monitor", review: "configure", healthy: "healthy" };
        replenishmentFilters.decision = actionToDecision[button.dataset.replenishmentAction] || "buy";
        expandedReplenishmentId = null;
        replenishmentPage = 1;
        renderReplenishment();
      }
      if (button.dataset.replenishmentPage) {
        replenishmentPage = Number(button.dataset.replenishmentPage);
        renderReplenishment();
      }
      if (button.dataset.toggleReplenishment) {
        const id = Number(button.dataset.toggleReplenishment);
        expandedReplenishmentId = expandedReplenishmentId === id ? null : id;
        renderReplenishment();
      }
      if (Object.prototype.hasOwnProperty.call(button.dataset, "selectReliableReplenishment")) {
        const candidates = replenishmentRows.filter((row) => row.decision === "buy" && row.can_plan && row.cost_known && row.confidence !== "low");
        const allSelected = candidates.length > 0 && candidates.every((row) => selectedReplenishmentIds.has(Number(row.id)));
        candidates.forEach((row) => {
          const id = Number(row.id);
          if (allSelected) selectedReplenishmentIds.delete(id); else selectedReplenishmentIds.add(id);
        });
        renderReplenishment();
      }
      if (button.dataset.useReplenishmentSimulator) {
        const input = document.querySelector(`[data-replenishment-simulator="${button.dataset.useReplenishmentSimulator}"]`);
        if (input) replenishmentQuantities.set(Number(button.dataset.useReplenishmentSimulator), number(input.value));
        renderReplenishment();
      }
      if (button.dataset.openPlan) await openPlan(button.dataset.openPlan);
      if (Object.prototype.hasOwnProperty.call(button.dataset, "closePlan")) loadPurchasePlans();
      if (button.dataset.orderOrdered) {
        await api(`/api/purchase-orders/${button.dataset.orderOrdered}`, { method: "PATCH", body: JSON.stringify({ status: "ordered" }) });
        toast("Pedido marcado como realizado");
        await openPlan(currentPurchasePlan.plan.id);
      }
      if (button.dataset.receiveOrder) {
        const order = currentPurchasePlan?.orders?.find((candidate) => String(candidate.id) === button.dataset.receiveOrder);
        if (order) {
          const lines = order.lines.filter((line) => !line.is_excluded && line.received_quantity < line.ordered_quantity).map((line) => ({
            purchase_order_line_id: line.id,
            quantity: number(document.querySelector(`[data-receipt-quantity="${line.id}"]`)?.value)
          })).filter((line) => line.quantity > 0);
          const result = await api(`/api/purchase-orders/${order.id}/receipts`, { method: "POST", body: JSON.stringify({ lines }) });
          toast(result.warning);
          await openPlan(currentPurchasePlan.plan.id);
        }
      }
    } catch (error) { toast(error.message); }
  });

  document.body.addEventListener("change", async (event) => {
    if (event.target.matches("[data-replenishment-filter]")) {
      replenishmentFilters[event.target.dataset.replenishmentFilter] = event.target.value;
      replenishmentPage = 1;
      renderReplenishment();
      return;
    }
    if (event.target.matches("[data-replenishment-select]")) {
      const id = Number(event.target.dataset.replenishmentSelect);
      if (event.target.checked) selectedReplenishmentIds.add(id); else selectedReplenishmentIds.delete(id);
      renderReplenishment();
      return;
    }
    if (event.target.matches("[data-replenishment-quantity]")) {
      replenishmentQuantities.set(Number(event.target.dataset.replenishmentQuantity), number(event.target.value));
      renderReplenishment();
      return;
    }
    if (event.target.matches("[data-purchase-line-excluded]")) {
      await api(`/api/purchase-order-lines/${event.target.dataset.purchaseLineExcluded}`, { method: "PATCH", body: JSON.stringify({ is_excluded: !event.target.checked }) });
      await openPlan(currentPurchasePlan.plan.id);
      return;
    }
    if (event.target.matches("[data-purchase-line-quantity]")) {
      await api(`/api/purchase-order-lines/${event.target.dataset.purchaseLineQuantity}`, { method: "PATCH", body: JSON.stringify({ ordered_quantity: number(event.target.value) }) });
      await openPlan(currentPurchasePlan.plan.id);
      return;
    }
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
    if (event.target.matches('[data-replenishment-filter="query"]')) {
      replenishmentFilters.query = event.target.value;
      replenishmentPage = 1;
      clearTimeout(importFilterTimer);
      importFilterTimer = setTimeout(renderReplenishment, 180);
      return;
    }
    if (event.target.matches('[data-import-filter="query"]')) {
      importFilters.query = event.target.value;
      clearTimeout(importFilterTimer);
      importFilterTimer = setTimeout(renderImportList, 180);
      return;
    }
    if (!event.target.matches('[data-line-field="package_count"],[data-line-field="units_per_package"],[data-line-field="price_per_package"]')) return;
    const row = event.target.closest("[data-import-line-row]");
    const packages = number(row.querySelector('[data-line-field="package_count"]').value);
    const unitsPackage = number(row.querySelector('[data-line-field="units_per_package"]').value);
    const pricePackage = number(row.querySelector('[data-line-field="price_per_package"]').value);
    const totalUnits = packages * unitsPackage;
    const lineTotal = packages * pricePackage;
    row.querySelector('[data-line-field="unit_price"]').value = Number(number(totalUnits ? lineTotal / totalUnits : 0).toFixed(6)).toString();
    row.querySelector('[data-line-field="line_total"]').value = lineTotal.toFixed(2);
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
    ["subtotal", "discount", "shipping", "tax", "total"].forEach((field) => {
      detected_fields[field] = Number(detected_fields[field] || 0);
    });
    await api(`/api/expense-imports/${event.target.dataset.importId}`, { method: "PATCH", body: JSON.stringify({ detected_fields }) });
    toast("Revisión guardada");
  });
})();
