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
    hierarchySummary,
    materialPickerMarkup,
    syncMaterialPicker,
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination,
    chartColors,
    dashboardChart
  } = ctx;

  async function loadSuppliers() {
    const includeDeleted = $("#suppliersDeleted")?.checked ? 1 : 0;
    state.suppliers = await api(`/api/suppliers?include_deleted=${includeDeleted}`);
    window.refreshSupplierSelects();
    renderSuppliers();
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
        ${kit.items.map((item) => {
          const summary = hierarchySummary({
            usage_type: item.material_usage_type,
            family: item.material_family,
            subfamily: item.material_subfamily,
            variant: item.material_variant,
            base_material: item.material_base_material,
            finish: item.material_finish
          });
          return `
            <article class="line-card">
              <div class="line-card-main ${item.material_image_url ? "with-image" : ""}">
                ${item.material_image_url ? `<div class="material-mini-thumb">${img(item.material_image_url)}</div>` : ""}
                <div>
                  <strong>${text(item.material_name, "Sin material")}</strong>
                  <div class="meta">${item.quantity} ${text(item.material_category || "")} · coste ud ${item.unit_cost == null ? "-" : euro.format(number(item.unit_cost))} · total ${item.total_cost == null ? "-" : euro.format(number(item.total_cost))}</div>
                  ${summary ? `<div class="meta">${text(summary)}</div>` : ""}
                  ${item.notes ? `<p>${text(item.notes)}</p>` : ""}
                </div>
              </div>
              <div class="row-actions slim">
                ${kit.is_complete ? "" : `<button data-delete-kit-item="${item.id}" data-kit-id="${kit.id}" type="button" class="ghost danger-text">Archivar</button>`}
              </div>
            </article>
          `;
        }).join("") || `<div class="empty-state small">Este kit todavía no tiene materiales.</div>`}
      </div>
    `;
    bindKitItemForm();
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

  return {
    loadSuppliers,
    renderSuppliers,
    loadCosts,
    renderCosts,
    openCostDetail,
    renderCostHistoryChart,
    loadKits,
    renderKits,
    openKit,
    openKitWorkspace,
    bindKitItemForm
  };
}
