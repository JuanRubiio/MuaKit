(() => {
  const expensePage = document.querySelector("#invoices .invoice-page");
  const materialPage = document.querySelector("#materials .materials-page");
  const expenseDefault = expensePage ? Array.from(expensePage.children).filter((node) => !node.matches(".next-domain-tabs,#expenseImportPanel,.invoice-overview-head")) : [];
  const materialDefault = materialPage ? Array.from(materialPage.children).filter((node) => !node.matches(".next-domain-tabs,#replenishmentPanel,#purchasePlannerPanel,.materials-overview-head")) : [];
  let replenishmentRows = [];
  let currentPurchasePlan = null;
  let expensePoll = null;
  let importUploading = false;

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
  function showImportList() {
    $("#expenseImportListView").classList.remove("hidden");
    $("#expenseImportDetail").classList.add("hidden");
    $("#expenseImportDetail").innerHTML = "";
    loadImports();
  }

  function switchExpense(section) {
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

  async function loadImports() {
    const rows = await api("/api/expense-imports");
    const qualityOrder = { low: 0, medium: 1, processing: 2, high: 3 };
    const visibleRows = rows
      .filter((row) => row.status !== "discarded")
      .sort((a, b) => (qualityOrder[importQuality(a).tone] ?? 4) - (qualityOrder[importQuality(b).tone] ?? 4) || Number(b.id) - Number(a.id));
    const pending = rows.filter((row) => ["pending", "processing"].includes(row.status)).length;
    const review = rows.filter((row) => ["ready", "review"].includes(row.status)).length;
    const reliable = visibleRows.filter((row) => ["ready", "review"].includes(row.status) && importQuality(row).tone === "high").length;
    const attention = visibleRows.filter((row) => ["ready", "review", "error"].includes(row.status) && importQuality(row).tone !== "high").length;
    $("#expenseImportMetrics").innerHTML = metric("En proceso", pending, "Cola local secuencial") + metric("Lectura fiable", reliable, "Listas para validar") + metric("Requieren atención", attention, "Revisar datos detectados");
    $("#expenseImportList").innerHTML = visibleRows.length ? visibleRows.map((row) => `<article class="next-import-row is-${row.status}">
      ${row.detected_fields?.suggested_supplier_name ? entityIconMarkup(row.detected_fields.suggested_supplier_name, { type: "supplier", className: "supplier-avatar compact", label: row.detected_fields.suggested_supplier_name }) : `<span class="next-file-icon"><svg><use href="#icon-file"></use></svg></span>`}
      <div class="next-import-document"><strong>${text(row.original_name)}</strong><small>${row.detected_fields?.suggested_supplier_name ? `${text(row.detected_fields.suggested_supplier_name)} · ` : ""}${Math.round(Number(row.size || 0) / 1024)} KB</small><span class="next-import-facts"><em>${text(expenseCategoryLabel(row.detected_fields?.category))}</em>${row.detected_fields?.invoice_date ? `<em>${text(row.detected_fields.invoice_date)}</em>` : ""}${row.detected_fields?.total !== null && row.detected_fields?.total !== undefined ? `<em>${currencyFormat(row.detected_fields.total, row.detected_fields.currency || "EUR")}</em>` : ""}</span></div>
      <span class="status-pill ${row.status === "error" ? "danger" : row.status === "confirmed" ? "ok" : "warn"}">${statusText(row.status)}</span>
      ${confidenceMarkup(row, true)}
      <button type="button" class="ghost" data-open-expense-import="${row.id}" ${["pending", "processing"].includes(row.status) ? "disabled" : ""}>${row.status === "confirmed" ? "Ver" : "Revisar"}</button>
    </article>`).join("") : `<div class="empty-state">Aún no hay documentos pendientes de validación.</div>`;
    const active = rows.some((row) => ["pending", "processing"].includes(row.status));
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

  async function openImport(id) {
    const data = await api(`/api/expense-imports/${id}`);
    const item = data.import;
    const fields = item.detected_fields || {};
    const quality = importQuality(item);
    const isMaterialExpense = fields.category === "materiales";
    const materialOptionsMarkup = (selected) => `<option value="">${isMaterialExpense ? "Sin material sugerido" : "No aplica a este gasto"}</option>${isMaterialExpense ? (state.materials || []).filter((material) => !material.is_deleted).map((material) => `<option value="${material.id}" ${String(material.id) === String(selected) ? "selected" : ""}>${text(material.name)}</option>`).join("") : ""}`;
    const lineMarkup = (line) => {
      return `<article class="next-editable-line" data-import-line-row="${line.id}">
        <label>Concepto<input data-line-field="description" value="${text(line.description)}"></label>
        <label>Cantidad<input data-line-field="quantity" type="number" min="0" step="0.01" value="${number(line.quantity || 1)}"></label>
        <label>Material<select data-line-field="suggested_material_id" ${isMaterialExpense ? "" : "disabled"}>${materialOptionsMarkup(line.suggested_material_id)}</select></label>
        <label>Precio ud. ${text(fields.currency || "EUR")}<input data-line-field="unit_price" type="number" min="0" step="0.01" value="${number(line.unit_price ?? line.line_total).toFixed(2)}"></label>
        <label>Total ${text(fields.currency || "EUR")}<input data-line-field="line_total" type="number" min="0" step="0.01" value="${number(line.line_total).toFixed(2)}"></label>
        <label>Decisión<select data-line-field="human_decision"><option value="pending" ${line.human_decision === "pending" ? "selected" : ""}>Revisar</option><option value="accepted" ${line.human_decision === "accepted" ? "selected" : ""}>Aceptar</option><option value="rejected" ${line.human_decision === "rejected" ? "selected" : ""}>Excluir</option></select></label>
        <button type="button" class="ghost button-with-icon" data-save-import-line="${line.id}" data-import-id="${item.id}"><svg><use href="#icon-save"></use></svg><span>Guardar</span></button>
      </article>`;
    };
    $("#expenseImportListView").classList.add("hidden");
    $("#expenseImportDetail").classList.remove("hidden");
    $("#expenseImportDetail").innerHTML = `<div class="panel-head"><div><h2>Validación de factura</h2><p>${text(item.original_name)} · ${text(expenseCategoryLabel(fields.category))}</p></div><div class="row-actions"><button class="ghost button-with-icon" data-close-expense-import><svg><use href="#icon-arrow-left"></use></svg><span>Cerrar revisión</span></button><button class="ghost" data-reprocess-import="${item.id}">Reprocesar</button></div></div>
      <div class="next-review-quality quality-${quality.tone}">${confidenceMarkup(item)}<div><strong>${quality.tone === "high" ? "La lectura tiene buena pinta" : "Conviene revisar los datos detectados"}</strong><span>${quality.tone === "high" ? "Proveedor, referencia, fecha, tipo y total detectados." : `${text(quality.hint)}.`} La confirmación siempre requiere supervisión humana.</span></div></div>
      ${data.duplicates.exact ? `<div class="inline-alert danger">Duplicado bloqueante: factura #${data.duplicates.exact.id}</div>` : data.duplicates.warning ? `<div class="inline-alert warn">Posible duplicado: factura #${data.duplicates.warning.id}</div>` : ""}
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
      <div class="next-lines"><div class="next-lines-head"><div><h3>Líneas sugeridas</h3><p>Edita los datos detectados y decide qué líneas pasarán al gasto borrador.</p></div><div class="next-lines-balance"><span>Suma líneas <strong>${currencyFormat(data.lines.reduce((sum, line) => sum + number(line.line_total), 0), fields.currency || "EUR")}</strong></span><span>Total factura <strong>${currencyFormat(fields.total, fields.currency || "EUR")}</strong></span></div></div>${data.lines.length ? data.lines.map(lineMarkup).join("") : `<div class="empty-state">No se detectaron líneas fiables. Puedes crear el gasto y completarlas después.</div>`}</div>
      <div class="row-actions next-import-final-actions"><div class="next-discard-action"><button type="button" class="ghost" data-request-discard-import="${item.id}">Eliminar importación</button><span>El archivo y su lectura se borrarán definitivamente.</span></div><button type="button" ${data.duplicates.exact ? "disabled" : ""} data-confirm-import="${item.id}">Confirmar y crear factura borrador</button></div>`;
    $("#expenseImportDetail").scrollIntoView({ behavior: "smooth", block: "start" });
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
      if (Object.prototype.hasOwnProperty.call(button.dataset, "closeExpenseImport")) showImportList();
      if (button.dataset.openExpenseImport) await openImport(button.dataset.openExpenseImport);
      if (button.dataset.reprocessImport) { await api(`/api/expense-imports/${button.dataset.reprocessImport}/reprocess`, { method: "POST" }); await loadImports(); }
      if (button.dataset.requestDiscardImport) {
        const action = button.closest(".next-discard-action");
        action.classList.add("is-confirming");
        action.innerHTML = `<button type="button" class="danger-button" data-discard-import="${button.dataset.requestDiscardImport}">Sí, eliminar definitivamente</button><button type="button" class="ghost" data-cancel-discard-import="${button.dataset.requestDiscardImport}">Cancelar</button><span>No se podrá recuperar el documento ni su lectura.</span>`;
      }
      if (button.dataset.cancelDiscardImport) await openImport(button.dataset.cancelDiscardImport);
      if (button.dataset.discardImport) { await api(`/api/expense-imports/${button.dataset.discardImport}/discard`, { method: "POST" }); showImportList(); }
      if (button.dataset.confirmImport) { const result = await api(`/api/expense-imports/${button.dataset.confirmImport}/confirm`, { method: "POST", body: JSON.stringify({}) }); toast(`Factura borrador #${result.invoice_id} creada`); switchExpense("registered"); await loadInvoices(); }
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
    const select = event.target.closest("[data-import-line]");
    if (!select) return;
    await api(`/api/expense-imports/${select.dataset.importId}/lines/${select.dataset.importLine}`, { method: "PATCH", body: JSON.stringify({ human_decision: select.value }) }).catch((error) => toast(error.message));
  });

  document.body.addEventListener("input", (event) => {
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

  document.body.addEventListener("submit", async (event) => {
    if (event.target.id !== "expenseImportReviewForm") return;
    event.preventDefault();
    const detected_fields = Object.fromEntries(new FormData(event.target).entries());
    detected_fields.total = Number(detected_fields.total);
    await api(`/api/expense-imports/${event.target.dataset.importId}`, { method: "PATCH", body: JSON.stringify({ detected_fields }) });
    toast("Revisión guardada");
  });
})();
