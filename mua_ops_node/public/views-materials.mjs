export function createMaterialViews(ctx) {
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
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination,
    optionList,
    distinctValues,
    img,
    hierarchySummary,
    chartColors,
    dashboardChart
  } = ctx;

  const materialCostDetailCache = new Map();

  const REVIEW_ICONS = {
    noImage: "icon-image",
    noCost: "icon-coin",
    missingSupplier: "icon-users",
    outlet: "icon-alert",
    reorder: "icon-chart"
  };

  const FORM_CATEGORIES = [
    "kit",
    "joya",
    "cadena",
    "topping",
    "packaging",
    "consumible",
    "servicio",
    "material"
  ];

  function activeMaterials({ includeOutlet = true } = {}) {
    return state.materials.filter(
      (material) => !material.is_deleted && (includeOutlet || !material.is_outlet)
    );
  }

  function materialCostMap() {
    return new Map((state.costs || []).map((row) => [Number(row.material_id || row.id), row]));
  }

  function materialKitMap() {
    const map = new Map();
    for (const kit of state.kits || []) {
      for (const item of kit.items || []) {
        const materialId = Number(item.material_id || item.materialId || 0);
        if (!materialId) continue;
        if (!map.has(materialId)) map.set(materialId, []);
        map.get(materialId).push({
          kitId: kit.id,
          kitName: kit.name,
          version: kit.version,
          quantity: number(item.quantity_per_kit || item.quantity || 1),
          role: item.role || "Componente"
        });
      }
    }
    return map;
  }

  function formatEuro(value, fallback = "-") {
    return value == null || value === "" ? fallback : euro.format(number(value));
  }

  function materialThumb(material, className = "") {
    const imageUrl = material?.image_url_override || material?.image_url || "";
    const initials = text(material?.name || "MK")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2) || "MK";
    return imageUrl
      ? `<img src="${text(imageUrl)}" loading="lazy" alt="" onerror="this.outerHTML='&lt;div class=&quot;image-empty material-thumb-fallback ${className}&quot;&gt;${initials}&lt;/div&gt;'">`
      : `<div class="image-empty material-thumb-fallback ${className}">${initials}</div>`;
  }

  function stockNumber(material) {
    return number(material.effective_stock_qty);
  }

  function reorderNumber(material) {
    return number(material.reorder_point);
  }

  function reorderThreshold(material) {
    const reorderPoint = reorderNumber(material);
    const multiplier = number(state.settings?.reorder_alert_multiplier || 1.25) || 1.25;
    return reorderPoint > 0 ? reorderPoint * multiplier : 0;
  }

  function isReorderRisk(material) {
    const reorderPoint = reorderNumber(material);
    if (!reorderPoint) return false;
    return stockNumber(material) <= reorderThreshold(material);
  }

  function hasImage(material) {
    return Boolean(String(material.image_url_override || material.image_url || "").trim());
  }

  function costRow(material, costMap) {
    return costMap.get(Number(material.id)) || null;
  }

  function hasCost(material, costMap) {
    const row = costRow(material, costMap);
    return Boolean(row && (row.weighted_avg_unit_cost_inc_vat != null || row.last_unit_cost_inc_vat != null));
  }

  function unitCost(material, costMap) {
    const row = costRow(material, costMap);
    if (!row) return null;
    if (row.weighted_avg_unit_cost_inc_vat != null) return number(row.weighted_avg_unit_cost_inc_vat);
    if (row.last_unit_cost_inc_vat != null) return number(row.last_unit_cost_inc_vat);
    return null;
  }

  function latestCost(material, costMap) {
    const row = costRow(material, costMap);
    if (!row) return null;
    if (row.last_unit_cost_inc_vat != null) return number(row.last_unit_cost_inc_vat);
    if (row.weighted_avg_unit_cost_inc_vat != null) return number(row.weighted_avg_unit_cost_inc_vat);
    return null;
  }

  function resetMaterialCostChartSurface(messageHtml = "") {
    const chartNode = $("#materialCostChart");
    if (!chartNode) return;
    const existing = window.echarts?.getInstanceByDom?.(chartNode);
    if (existing && !(typeof existing.isDisposed === "function" && existing.isDisposed())) {
      existing.dispose();
    }
    chartNode.innerHTML = messageHtml;
  }

  async function loadMaterialCostDetail(materialId) {
    const numericId = Number(materialId || 0);
    if (!numericId) return null;
    const detail = await api(`/api/costs/materials/${numericId}`);
    materialCostDetailCache.set(numericId, detail);
    return detail;
  }

  function stockHealth(material) {
    const stock = stockNumber(material);
    const minimum = reorderNumber(material);
    const target = number(material.target_stock);
    if (minimum && stock <= minimum) return { label: "Reposición urgente", tone: "warn" };
    if (minimum && stock <= reorderThreshold(material)) return { label: "Vigilar reposición", tone: "pending" };
    if (target && stock >= target) return { label: "Objetivo cubierto", tone: "ok" };
    return { label: "Stock estable", tone: "neutral" };
  }

  function kitUsage(materialId, kitMap) {
    return kitMap.get(Number(materialId)) || [];
  }

  function materialCategoryOptions(current = "") {
    const fromState = distinctValues(state.materials, "category");
    const all = Array.from(new Set([...FORM_CATEGORIES, ...fromState, current].filter(Boolean)));
    return optionList(all, current, "Selecciona categoría");
  }

  function supplierMaterialOptions(selected = "", first = "Sin material") {
    const active = activeMaterials({ includeOutlet: false });
    return `<option value="">${text(first)}</option>${active
      .map(
        (material) => `
      <option value="${material.id}" ${String(material.id) === String(selected) ? "selected" : ""}>${text(material.name)}${
          hierarchySummary(material) ? ` · ${text(hierarchySummary(material))}` : ""
        }</option>
    `
      )
      .join("")}`;
  }

  function currentMaterialFormState(explicitMaterial = null) {
    if (explicitMaterial) return { ...explicitMaterial };
    const form = $("#materialForm");
    if (!form) return null;
    const elements = form.elements;
    const persisted = state.materials.find((item) => String(item.id) === String(elements.id?.value || ""));
    return {
      id: elements.id?.value || "",
      name: elements.name?.value || "",
      preferred_supplier_id: elements.preferred_supplier_id?.value || "",
      preferred_supplier_name:
        state.suppliers.find((supplier) => String(supplier.id) === String(elements.preferred_supplier_id?.value || ""))?.name || "",
      category: elements.category?.value || "",
      unit_label: elements.unit_label?.value || "ud",
      image_url_override: elements.image_url_override?.value || "",
      image_url: persisted?.image_url || "",
      is_outlet: Boolean(elements.is_outlet?.checked),
      is_priority_restock: Boolean(elements.is_priority_restock?.checked),
      usage_type: elements.usage_type?.value || "",
      family: elements.family?.value || "",
      subfamily: elements.subfamily?.value || "",
      variant: elements.variant?.value || "",
      base_material: elements.base_material?.value || "",
      finish: elements.finish?.value || "",
      effective_stock_qty: elements.effective_stock_qty?.value || 0,
      reorder_point: elements.reorder_point?.value || 0,
      target_stock: elements.target_stock?.value || 0,
      notes: elements.notes?.value || ""
    };
  }

  function reviewItems(materials = activeMaterials(), costMap = materialCostMap()) {
    const noImage = materials.filter((row) => !hasImage(row));
    const noCost = materials.filter((row) => !hasCost(row, costMap) && !row.is_outlet);
    const missingSupplier = materials.filter((row) => !number(row.preferred_supplier_id));
    const outlet = materials.filter((row) => row.is_outlet);
    const reorder = materials.filter((row) => isReorderRisk(row));
    const priorityReorder = reorder.filter((row) => row.is_priority_restock);

    return [
      {
        key: "reorder",
        title: "Reposición urgente",
        hint: priorityReorder[0]?.name || "No hay compras prioritarias urgentes.",
        count: priorityReorder.length,
        lane: "priority",
        tone: priorityReorder.length ? "warn" : "ok"
      },
      {
        key: "noCost",
        title: "Falta coste",
        hint: noCost[0]?.name || "Todos los materiales tienen coste.",
        count: noCost.length,
        lane: "noCost",
        tone: noCost.length ? "warn" : "ok"
      },
      {
        key: "noImage",
        title: "Sin imagen",
        hint: noImage[0]?.name || "Todo el catálogo tiene imagen.",
        count: noImage.length,
        lane: "noImage",
        tone: noImage.length ? "warn" : "ok"
      },
      {
        key: "missingSupplier",
        title: "Sin proveedor",
        hint: missingSupplier[0]?.name || "Todos los materiales tienen proveedor.",
        count: missingSupplier.length,
        lane: "missingSupplier",
        tone: missingSupplier.length ? "warn" : "ok"
      },
      {
        key: "outlet",
        title: "Materiales outlet",
        hint: outlet[0]?.name || "No hay materiales outlet.",
        count: outlet.length,
        lane: "outlet",
        tone: outlet.length ? "neutral" : "ok"
      }
    ];
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
    const rows = state.materials.filter((row) => !row.is_deleted);
    mappings.forEach(([selector, key, empty]) => {
      const select = $(selector);
      if (!select) return;
      const current = select.value;
      select.innerHTML = optionList(distinctValues(rows, key), current, empty);
    });
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
      select.innerHTML = supplierMaterialOptions(selected);
    });
  }

  function applyLane(rows, costMap) {
    const lane = state.materialLane || "all";
    if (lane === "reorder") return rows.filter((row) => isReorderRisk(row));
    if (lane === "priority") return rows.filter((row) => row.is_priority_restock);
    if (lane === "noCost") return rows.filter((row) => !hasCost(row, costMap) && !row.is_outlet);
    if (lane === "noImage") return rows.filter((row) => !hasImage(row));
    if (lane === "missingSupplier") return rows.filter((row) => !number(row.preferred_supplier_id));
    if (lane === "outlet") return rows.filter((row) => row.is_outlet);
    if (lane === "kits") return rows.filter((row) => kitUsage(row.id, materialKitMap()).length);
    return rows;
  }

  function renderMaterialsOverview(rows, costMap, kitMap) {
    const active = activeMaterials();
    const reorder = active.filter((row) => isReorderRisk(row));
    const priorityMaterials = active.filter((row) => row.is_priority_restock);
    const withCost = active.filter((row) => hasCost(row, costMap));
    const noImage = active.filter((row) => !hasImage(row));
    const inKits = active.filter((row) => kitUsage(row.id, kitMap).length);
    const outlet = active.filter((row) => row.is_outlet);
    const missingSupplier = active.filter((row) => !number(row.preferred_supplier_id));

    $("#materialSummaryCards").innerHTML = [
      {
        tone: "accent",
        icon: "icon-cube",
        label: "Materiales activos",
        value: active.length,
        detail: `${withCost.length} con coste`
      },
      {
        tone: reorder.length ? "warn" : "ok",
        icon: "icon-alert",
        label: "A reponer",
        value: reorder.length,
        detail: reorder.length ? `${reorder[0].name}` : "Sin urgencias"
      },
      {
        tone: noImage.length ? "warn" : "ok",
        icon: "icon-image",
        label: "Sin imagen",
        value: noImage.length,
        detail: noImage.length ? `${noImage[0].name}` : "Todo con imagen"
      },
      {
        tone: "gold",
        icon: "icon-kit",
        label: "En kits",
        value: inKits.length,
        detail: `${active.length ? Math.round((inKits.length / active.length) * 100) : 0}% del catálogo`
      },
      {
        tone: outlet.length ? "warn" : "ok",
        icon: "icon-archive",
        label: "Outlet",
        value: outlet.length,
        detail: outlet.length ? "Separados del flujo normal" : "Sin outlet"
      },
      {
        tone: missingSupplier.length ? "warn" : "ok",
        icon: "icon-users",
        label: "Sin proveedor",
        value: missingSupplier.length,
        detail: missingSupplier.length ? `${missingSupplier[0].name}` : "Todos asignados"
      }
    ]
      .map(
        (card) => `
      <article class="panel materials-summary-card tone-${card.tone}">
        <span class="materials-summary-icon" aria-hidden="true"><svg><use href="#${card.icon}"></use></svg></span>
        <div class="materials-summary-copy">
          <span>${text(card.label)}</span>
          <strong>${text(String(card.value))}</strong>
          <small>${text(card.detail)}</small>
        </div>
      </article>
    `
      )
      .join("");

    const priorityRows = priorityMaterials
      .slice()
      .sort((a, b) => {
        const riskDelta = Number(isReorderRisk(b)) - Number(isReorderRisk(a));
        if (riskDelta) return riskDelta;
        return stockNumber(a) - stockNumber(b) || reorderNumber(b) - reorderNumber(a) || lower(a.name).localeCompare(lower(b.name));
      });
    $("#materialPriorityCards").className = `materials-priority-cards ${priorityRows.length ? "" : "is-empty"}`.trim();
    $("#materialPriorityCards").innerHTML = priorityRows.length
      ? priorityRows
          .map((material) => {
            const current = stockNumber(material);
            const min = reorderNumber(material);
            const target = number(material.target_stock);
            const fill = min > 0 ? Math.max(0, Math.min(100, (current / Math.max(min, target || min)) * 100)) : 0;
            const risk = isReorderRisk(material);
            return `
              <article class="materials-priority-card">
                <div class="materials-priority-card-head">
                  <div class="materials-priority-thumb">${materialThumb(material, "priority")}</div>
                  <div class="materials-priority-copy">
                    <strong>${text(material.name)}</strong>
                    <small>${text(material.preferred_supplier_name || "Sin proveedor")}</small>
                  </div>
                </div>
                <div class="materials-priority-stats">
                  <span><small>Stock</small><strong>${text(String(current))}</strong></span>
                  <span><small>Mínimo</small><strong>${text(String(min || "-"))}</strong></span>
                  <span><small>Coste</small><strong>${formatEuro(unitCost(material, costMap), "—")}</strong></span>
                </div>
                <div class="materials-priority-meter ${risk ? "is-alert" : "is-healthy"}" aria-hidden="true"><i style="width:${fill}%"></i></div>
                <div class="materials-priority-actions">
                  <span class="status-pill ${risk ? "warn" : "ok"}">${risk ? "Reponer" : "Controlado"}</span>
                  <button type="button" class="ghost button-with-icon" data-view-material="${material.id}"><svg><use href="#icon-eye"></use></svg><span>Ver</span></button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
        <article class="materials-priority-empty">
          <div class="materials-priority-empty-copy">
            <strong>Sin prioridades de reposición</strong>
            <p>Marca las joyas con mayor rotación como prioritarias para vigilarlas aquí desde una sola banda de seguimiento.</p>
          </div>
          <button type="button" class="ghost button-with-icon" data-jump-view="materials">
            <svg><use href="#icon-plus"></use></svg><span>Seleccionar materiales</span>
          </button>
        </article>
      `;

    const queueItems = reviewItems(active, costMap);
    $("#materialReviewQueue").innerHTML = queueItems
      .map((item) => {
        const icon = REVIEW_ICONS[item.key] || "icon-alert";
        const toneClass = item.count ? item.tone : "ok";
        return `
          <button type="button" class="invoice-review-item materials-review-item" data-material-lane="${item.lane}">
            <i class="invoice-check-icon ${toneClass}" aria-hidden="true"><svg><use href="#${icon}"></use></svg></i>
            <div class="invoice-review-copy">
              <strong>${text(item.title)}</strong>
              <small>${text(item.hint)}</small>
            </div>
            <span class="invoice-review-count ${toneClass}">${text(String(item.count))}</span>
          </button>
        `;
      })
      .join("");

    const recentRows = [...active]
      .sort((a, b) => number(b.id) - number(a.id))
      .slice(0, 5);
    $("#materialRecentList").innerHTML = recentRows.length
      ? recentRows
          .map((material) => {
            const kits = kitUsage(material.id, kitMap);
            return `
              <button type="button" class="materials-side-item" data-view-material="${material.id}">
                <span class="materials-side-thumb">${materialThumb(material, "recent")}</span>
                <span>
                  <strong>${text(material.name)}</strong>
                  <small>${text(material.category || "Sin categoría")} · ${text(material.preferred_supplier_name || "Sin proveedor")}</small>
                  <small class="meta">${kits.length ? `${kits.length} kits · ` : ""}Stock ${text(String(stockNumber(material)))}</small>
                  <small class="meta emphasis">${hasCost(material, costMap) ? formatEuro(unitCost(material, costMap)) : "Sin coste"}</small>
                </span>
              </button>
            `;
          })
          .join("")
      : `<div class="empty-state small">Todavía no hay materiales recientes.</div>`;
  }

  function renderMaterialStatusTabs(rows, costMap, kitMap) {
    const tabs = [
      { key: "all", label: "Todos", count: rows.length },
      { key: "priority", label: "Prioritarios", count: rows.filter((row) => row.is_priority_restock).length },
      { key: "reorder", label: "A reponer", count: rows.filter((row) => isReorderRisk(row)).length },
      { key: "noCost", label: "Sin coste", count: rows.filter((row) => !hasCost(row, costMap) && !row.is_outlet).length },
      { key: "outlet", label: "Outlet", count: rows.filter((row) => row.is_outlet).length },
      { key: "kits", label: "En kits", count: rows.filter((row) => kitUsage(row.id, kitMap).length).length }
    ];
    $("#materialStatusTabs").innerHTML = `
      <div class="invoice-status-strip">
        ${tabs
          .map(
            (tab) => `
          <button
            type="button"
            class="invoice-status-tab ${String(state.materialLane || "all") === tab.key ? "is-active" : ""}"
            data-material-lane="${tab.key}"
          >
            ${text(tab.label)} <span>${text(String(tab.count))}</span>
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderMaterialsTable(rows, costMap, kitMap) {
    const currentMaterialId = $("#materialForm")?.elements.id?.value || "";
    $("#materialList").innerHTML = rows.length
      ? rows
          .map((material) => {
            const cost = unitCost(material, costMap);
            const imageMarkup = materialThumb(material, "table");
            const providerName = material.preferred_supplier_name || "Sin proveedor";
            const stock = stockNumber(material);
            const reorder = reorderNumber(material);
            const target = number(material.target_stock);
            const divisor = Math.max(reorderThreshold(material) || 1, target || 1);
            const fill = Math.max(6, Math.min(100, (stock / divisor) * 100));
            const isHealthy = reorder ? stock > reorder : stock > 0;
            return `
              <article class="materials-table-row ${String(currentMaterialId) === String(material.id) ? "active" : ""} ${material.is_deleted ? "deleted" : ""}">
                <div class="materials-cell-main">
                  <div class="materials-cell-thumb">${imageMarkup}</div>
                  <div class="materials-cell-copy">
                    <strong>${text(material.name)}</strong>
                  </div>
                </div>
                <span class="materials-provider-cell">
                  ${entityIconMarkup(providerName, { type: "supplier", className: "materials-provider-avatar", label: providerName })}
                  <span>${text(providerName)}</span>
                </span>
                <div class="materials-stock-cell">
                  <strong>${text(String(stock))}</strong>
                  <div class="materials-stock-meter ${isHealthy ? "is-healthy" : "is-alert"}"><i style="width:${fill}%"></i></div>
                </div>
                <span>${text(reorder ? String(reorder) : "—")}</span>
                <span>${text(target ? String(target) : "—")}</span>
                <span>${cost == null ? "—" : formatEuro(cost)}</span>
                <span>${material.is_priority_restock ? badge("Sí", "accent") : badge("No")}</span>
                <div class="row-actions icon-actions">
                  <button type="button" class="ghost icon-only" data-view-material="${material.id}" aria-label="Ver material" title="Ver material">
                    <svg><use href="#icon-eye"></use></svg>
                  </button>
                  <button type="button" class="ghost icon-only" data-open-cost="${material.id}" aria-label="Ver coste" title="Ver coste">
                    <svg><use href="#icon-coin"></use></svg>
                  </button>
                  ${
                    material.is_deleted
                      ? `<button type="button" class="ghost icon-only" data-restore-material="${material.id}" aria-label="Restaurar material" title="Restaurar material"><svg><use href="#icon-save"></use></svg></button>`
                      : `<button type="button" class="ghost danger-text icon-only" data-delete-material="${material.id}" aria-label="Archivar material" title="Archivar material"><svg><use href="#icon-archive"></use></svg></button>`
                  }
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state"><strong>Sin materiales con esos filtros</strong>Ajusta búsqueda o la cola de revisión para volver a poblar la tabla.</div>`;
  }

  async function renderMaterialCostDetail(material) {
    const summaryNode = $("#materialCostSummary");
    const lotsNode = $("#materialCostLots");
    const lotsMetaNode = $("#materialCostLotsMeta");
    if (!summaryNode || !lotsNode) return;

    if (!material?.id) {
      summaryNode.innerHTML = `
        <article class="material-cost-metric"><small>Coste medio</small><strong>Sin guardar</strong><span>Guárdalo para empezar a registrar lotes.</span></article>
        <article class="material-cost-metric"><small>Último coste</small><strong>—</strong><span>Aún no hay compras asociadas.</span></article>
        <article class="material-cost-metric"><small>Proveedor principal</small><strong>${text(material?.preferred_supplier_name || "Sin proveedor")}</strong><span>Se tomará del registro del material.</span></article>
        <article class="material-cost-metric"><small>Gasto total</small><strong>—</strong><span>Sin histórico de compras todavía.</span></article>
      `;
      resetMaterialCostChartSurface(`<div class="empty-state small"><strong>Sin histórico de coste</strong>Guarda el material y añade su primer lote para ver la evolución.</div>`);
      if (lotsMetaNode) lotsMetaNode.textContent = "Compras vinculadas a este material.";
      lotsNode.innerHTML = "";
      return;
    }

    resetMaterialCostChartSurface("");
    summaryNode.innerHTML = `<div class="inline-note"><strong>Cargando coste...</strong><small>Recuperando lotes y cálculo medio del material.</small></div>`;
    if (lotsMetaNode) lotsMetaNode.textContent = "Recuperando histórico de compras.";
    lotsNode.innerHTML = "";

    const materialId = Number(material.id);
    const detail = await loadMaterialCostDetail(materialId).catch(() => null);
    const currentId = Number($("#materialForm")?.elements?.id?.value || materialId);
    if (currentId !== materialId) return;

    if (!detail) {
      summaryNode.innerHTML = `<div class="inline-note"><strong>Sin datos de coste</strong><small>No hemos podido cargar el histórico todavía.</small></div>`;
      resetMaterialCostChartSurface(`<div class="empty-state small"><strong>Coste no disponible</strong>Revisa el detalle de costes o vuelve a intentarlo.</div>`);
      if (lotsMetaNode) lotsMetaNode.textContent = "No hemos podido recuperar los lotes asociados.";
      return;
    }

    const { summary, lots } = detail;
    const weighted = summary?.weighted_avg_unit_cost_inc_vat == null ? null : number(summary.weighted_avg_unit_cost_inc_vat);
    const latest = summary?.last_unit_cost_inc_vat == null ? null : number(summary.last_unit_cost_inc_vat);
    const totalSpend = summary?.total_spend_inc_vat == null ? lots.reduce((sum, lot) => sum + number(lot.line_total), 0) : number(summary.total_spend_inc_vat);
    const supplier = text(summary?.supplier_name || material.preferred_supplier_name || "Sin proveedor");

    summaryNode.innerHTML = `
      <article class="material-cost-metric"><small>Coste medio</small><strong>${formatEuro(weighted, "Sin coste")}</strong><span>${lots.length} lotes activos</span></article>
      <article class="material-cost-metric"><small>Último coste</small><strong>${formatEuro(latest, "—")}</strong><span>${lots.at(-1)?.invoice_date ? text(lots.at(-1).invoice_date) : "Aún sin fecha"}</span></article>
      <article class="material-cost-metric"><small>Proveedor principal</small><strong class="material-cost-supplier">${entityIconMarkup(supplier, { className: "supplier-avatar compact", label: supplier })}<span>${supplier}</span></strong><span>${lots.length ? `${lots.filter((lot) => lower(lot.supplier_name) === lower(supplier)).length} compras registradas` : "Sin compras todavía"}</span></article>
      <article class="material-cost-metric"><small>Gasto total</small><strong>${formatEuro(totalSpend, "—")}</strong><span>${lots.length ? `${lots.reduce((sum, lot) => sum + number(lot.total_units), 0)} uds compradas` : "Sin unidades registradas"}</span></article>
    `;

    if (!lots.length) {
      resetMaterialCostChartSurface(`<div class="empty-state small"><strong>Sin evolución de coste</strong>Este material todavía no tiene líneas de factura asociadas.</div>`);
      if (lotsMetaNode) lotsMetaNode.textContent = "Aún no hay lotes registrados.";
      lotsNode.innerHTML = `<div class="empty-state small"><strong>Sin lotes asociados</strong>Cuando registres una compra para este material la verás aquí.</div>`;
      return;
    }

    const chart = dashboardChart("materialCostChart");
    if (chart) {
      const colors = chartColors();
      const singleSeries = lots.length <= 2;
      chart.setOption(
        {
          animationDuration: 350,
          grid: { left: 50, right: 18, top: 24, bottom: 46 },
          tooltip: {
            trigger: "axis",
            valueFormatter: (value) => euro.format(Number(value || 0))
          },
          xAxis: {
            type: "category",
            data: lots.map((lot) =>
              singleSeries
                ? `${String(lot.invoice_date || "").slice(2)}`
                : `${String(lot.invoice_date || "").slice(2)} · ${lot.invoice_number || "s/n"}`
            ),
            axisLine: { lineStyle: { color: "#d9cec1" } },
            axisLabel: { color: "#766e68", interval: 0, rotate: singleSeries ? 0 : 18 }
          },
          yAxis: {
            type: "value",
            axisLabel: { color: "#766e68", formatter: (value) => euro.format(value) },
            splitLine: { lineStyle: { color: "#eee6dc" } }
          },
          series: [
            {
              name: "Coste unitario",
              type: "line",
              smooth: true,
              symbol: "circle",
              symbolSize: 7,
              lineStyle: { width: 3, color: colors.materiales },
              itemStyle: { color: colors.materiales },
              areaStyle: {
                color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: `${colors.materiales}26` },
                  { offset: 1, color: `${colors.materiales}06` }
                ])
              },
              data: lots.map((lot) => number(lot.unit_cost))
            }
          ]
        },
        true
      );
      requestAnimationFrame(() => chart.resize());
      setTimeout(() => {
        try {
          chart.resize();
        } catch (_) {}
      }, 80);
    } else {
      resetMaterialCostChartSurface(`<div class="empty-state small"><strong>Gráfica no disponible</strong>El histórico sigue accesible en la lista de lotes.</div>`);
    }

    if (lotsMetaNode) {
      lotsMetaNode.textContent = `${lots.length} compras activas vinculadas al material.`;
    }

    lotsNode.innerHTML = `
      <div class="material-cost-lots-list">
        ${lots
          .slice()
          .reverse()
          .map(
            (lot) => `
          <article class="material-cost-lot">
            <div class="material-cost-lot-copy">
              <strong>${text(lot.invoice_date)} · ${text(lot.supplier_name || "Sin proveedor")}</strong>
              <small>${text(lot.invoice_number || "Sin número")} · ${text(String(lot.package_count))} paquetes · ${text(String(lot.total_units))} uds</small>
              ${lot.description ? `<small>${text(lot.description)}</small>` : ""}
            </div>
            <div class="material-cost-lot-values">
              <strong>${formatEuro(lot.unit_cost, "—")}</strong>
              <small>${formatEuro(lot.line_total, "—")}</small>
              ${lot.invoice_id ? `<button type="button" class="ghost button-with-icon compact" data-view-invoice="${lot.invoice_id}"><svg><use href="#icon-eye"></use></svg><span>Ver factura</span></button>` : ""}
            </div>
          </article>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderMaterialWorkspace(explicitMaterial = null) {
    const form = $("#materialForm");
    if (!form || form.classList.contains("hidden")) return;

    const material = currentMaterialFormState(explicitMaterial) || {};
    const costMap = materialCostMap();
    const cost = material.id ? unitCost(material, costMap) : null;
    const lastCost = material.id ? latestCost(material, costMap) : null;
    const supplierSelect = form.elements.preferred_supplier_id;
    const categorySelect = form.elements.category;

    if (supplierSelect) {
      const selected = String(material.preferred_supplier_id || supplierSelect.value || "");
      supplierSelect.innerHTML = `<option value="">Sin proveedor</option>${state.suppliers
        .filter((supplier) => !supplier.is_deleted)
        .map(
          (supplier) => `
          <option value="${supplier.id}" ${String(supplier.id) === selected ? "selected" : ""}>${text(supplier.name)}</option>
        `
        )
        .join("")}`;
      supplierSelect.value = selected;
    }

    if (categorySelect) {
      categorySelect.innerHTML = materialCategoryOptions(String(material.category || categorySelect.value || ""));
      categorySelect.value = String(material.category || categorySelect.value || "");
    }

    if (!form.elements.unit_label.value) form.elements.unit_label.value = material.unit_label || "ud";
    form.elements.effective_stock_qty.value = String(stockNumber(material));

    const imageUrl = material.image_url_override || material.image_url || "";
    const health = stockHealth(material);
    const supplierName = text(material.preferred_supplier_name || "Sin proveedor");
    const stock = stockNumber(material);
    const reorder = reorderNumber(material);
    const target = number(material.target_stock);

    $("#materialFormTitle").textContent = material.id ? text(material.name || `Material #${material.id}`) : "Nuevo material";
    $("#materialFormStatusBadge").textContent = material.id ? "Catálogo activo" : "Borrador catálogo";
    $("#materialFormStatusBadge").className = `status-pill ${material.id ? "ok" : "warn"}`;
    $("#materialFormSubtitle").textContent = material.id
      ? `${supplierName} · ${material.is_outlet ? "Outlet" : "Catálogo principal"}`
      : "Completa la información principal del material y deja listo su seguimiento económico.";

    $("#materialWorkspaceKpis").innerHTML = `
      <article class="material-workspace-kpi"><small>Stock Shopify</small><strong>${text(String(stock))} ${text(material.unit_label || "ud")}</strong><span>${supplierName}</span></article>
      <article class="material-workspace-kpi"><small>Salud</small><strong>${text(health.label)}</strong><span>${reorder ? `Mínimo ${text(String(reorder))} ${text(material.unit_label || "ud")}` : "Define punto de reposición"}</span></article>
      <article class="material-workspace-kpi"><small>Reposición</small><strong>${reorder ? `${text(String(reorder))} ${text(material.unit_label || "ud")}` : "—"}</strong><span>Punto de reposición</span></article>
      <article class="material-workspace-kpi"><small>Objetivo</small><strong>${target ? `${text(String(target))} ${text(material.unit_label || "ud")}` : "—"}</strong><span>Stock objetivo</span></article>
      <article class="material-workspace-kpi"><small>Coste medio</small><strong>${formatEuro(cost, "Sin coste")}</strong><span>${lastCost != null ? `Último ${formatEuro(lastCost)}` : "Sin histórico de compra"}</span></article>
    `;

    const preview = $("#materialFormPreview");
    preview.classList.toggle("hidden", !material.name && !imageUrl);
    preview.innerHTML = `
      <div class="selected-material-card-media">${materialThumb(material, "preview")}</div>
      <div class="selected-material-card-copy">
        <strong>${text(material.name || "Nuevo material")}</strong>
        <div class="tags">
          ${material.category ? badge(material.category) : ""}
          ${material.family ? badge(material.family) : ""}
          ${material.subfamily ? badge(material.subfamily) : ""}
          ${material.variant ? badge(material.variant) : ""}
          ${material.base_material ? badge(material.base_material) : ""}
          ${material.finish ? badge(material.finish) : ""}
          ${material.is_outlet ? badge("outlet", "warn") : ""}
          ${material.is_priority_restock ? badge("prioritario", "accent") : ""}
        </div>
        <small>${supplierName}</small>
      </div>
    `;

    $("#materialHealthPanel").innerHTML = `
      <div class="material-health-kpi">
        <span><small>Stock Shopify</small><strong>${text(String(stock))} ${text(material.unit_label || "ud")}</strong></span>
        <span class="status-pill ${health.tone === "warn" ? "warn" : health.tone === "ok" ? "ok" : "neutral"}">${text(health.label)}</span>
      </div>
      <div class="material-health-metrics">
        <span><small>Punto reposición</small><strong>${reorder ? `${text(String(reorder))} ${text(material.unit_label || "ud")}` : "Sin mínimo"}</strong></span>
        <span><small>Stock objetivo</small><strong>${target ? `${text(String(target))} ${text(material.unit_label || "ud")}` : "Sin objetivo"}</strong></span>
      </div>
      <div class="material-health-bar">
        <i style="width:${Math.max(6, Math.min(target || reorder || 1, stock) / Math.max(target || reorder || 1, 1) * 100)}%"></i>
      </div>
      <div class="material-health-note ${health.tone}">
        ${isReorderRisk(material)
          ? `<strong>Reponer ahora</strong><small>El stock actual ya está por debajo del umbral esperado.</small>`
          : `<strong>Stock controlado</strong><small>El material mantiene un nivel de inventario razonable.</small>`}
      </div>
    `;

    const review = [
      {
        icon: "icon-image",
        tone: hasImage(material) ? "ok" : "warn",
        title: "Imagen",
        detail: hasImage(material) ? "La vista principal ya está disponible." : "Falta una imagen identificable."
      },
      {
        icon: "icon-coin",
        tone: cost != null ? "ok" : "pending",
        title: "Coste",
        detail: cost != null ? `Coste medio ${formatEuro(cost)}` : "Guárdalo y registra su primer lote."
      },
      {
        icon: "icon-users",
        tone: number(material.preferred_supplier_id) ? "ok" : "warn",
        title: "Proveedor",
        detail: number(material.preferred_supplier_id) ? supplierName : "Conviene asignar un proveedor."
      },
      {
        icon: "icon-chart",
        tone: reorder ? (isReorderRisk(material) ? "warn" : "ok") : "neutral",
        title: "Reposición",
        detail: reorder ? `Punto ${text(String(reorder))} · objetivo ${target ? text(String(target)) : "sin definir"}` : "Aún no tiene mínimo definido."
      },
      {
        icon: "icon-alert",
        tone: material.is_priority_restock ? "ok" : "neutral",
        title: "Prioridad",
        detail: material.is_priority_restock ? "Se vigila como referencia clave de venta." : "Seguimiento estándar."
      }
    ];
    $("#materialFormReviewState").innerHTML = review
      .map(
        (item) => `
      <div class="invoice-review-item static">
        <i class="invoice-check-icon ${item.tone}" aria-hidden="true"><svg><use href="#${item.icon}"></use></svg></i>
        <div class="invoice-review-copy">
          <strong>${text(item.title)}</strong>
          <small>${text(item.detail)}</small>
        </div>
      </div>
    `
      )
      .join("");

    const suggestionTone = !material.name || !material.category
      ? "warn"
      : cost == null
        ? "pending"
        : isReorderRisk(material)
          ? "warn"
          : "ok";
    const suggestionText = !material.name || !material.category
      ? "Completa la identidad básica del material antes de guardarlo."
      : cost == null
        ? "El siguiente paso natural es registrar su primer lote de coste."
        : isReorderRisk(material)
          ? "Conviene lanzar una reposición o revisar stock cuanto antes."
          : "La ficha queda lista para seguimiento de stock y coste.";
    $("#materialFormSuggestion").className = `invoice-inline-status income-suggestion ${suggestionTone}`;
    $("#materialFormSuggestion").innerHTML = `
      <span class="status-dot"></span>
      <strong>${text(suggestionText)}</strong>
    `;

    $("#materialFormRegistryInfo").innerHTML = `
      <div class="income-origin-row"><span>Proveedor</span><strong>${supplierName}</strong></div>
      <div class="income-origin-row"><span>Fuente de imagen</span><strong>${material.image_url_override ? "Personalizada" : hasImage(material) ? "Shopify" : "Pendiente"}</strong></div>
      <div class="income-origin-row"><span>Tipo</span><strong>${material.is_outlet ? "Outlet" : "Catálogo principal"}</strong></div>
      <div class="income-origin-row"><span>Seguimiento</span><strong>${material.is_priority_restock ? "Reposición prioritaria" : "Estándar"}</strong></div>
      <div class="income-origin-row"><span>Coste medio</span><strong>${cost == null ? "Sin coste" : formatEuro(cost)}</strong></div>
    `;

    renderMaterialCostDetail(material);
  }

  function renderMaterials() {
    const costMap = materialCostMap();
    const kitMap = materialKitMap();
    let rows = [...state.materials];
    rows = applyTextSearch(rows, $("#materialSearch")?.value, [
      "name",
      "category",
      "notes",
      "preferred_supplier_name",
      "usage_type",
      "family",
      "subfamily",
      "variant",
      "base_material",
      "finish"
    ]);

    const category = $("#materialCategoryFilter")?.value;
    const supplier = $("#materialSupplierFilter")?.value;
    const usage = $("#materialUsageFilter")?.value;
    const family = $("#materialFamilyFilter")?.value;
    const subfamily = $("#materialSubfamilyFilter")?.value;
    const variant = $("#materialVariantFilter")?.value;
    const baseMaterial = $("#materialBaseFilter")?.value;
    const finish = $("#materialFinishFilter")?.value;
    const outlet = $("#materialOutletFilter")?.value;

    if (category) rows = rows.filter((row) => row.category === category);
    if (supplier) rows = rows.filter((row) => String(row.preferred_supplier_id || "") === String(supplier));
    if (usage) rows = rows.filter((row) => String(row.usage_type || "") === usage);
    if (family) rows = rows.filter((row) => String(row.family || "") === family);
    if (subfamily) rows = rows.filter((row) => String(row.subfamily || "") === subfamily);
    if (variant) rows = rows.filter((row) => String(row.variant || "") === variant);
    if (baseMaterial) rows = rows.filter((row) => String(row.base_material || "") === baseMaterial);
    if (finish) rows = rows.filter((row) => String(row.finish || "") === finish);
    if (outlet === "1") rows = rows.filter((row) => Boolean(row.is_outlet));
    if (outlet === "0") rows = rows.filter((row) => !row.is_outlet);

    const laneRows = applyLane(rows, costMap);
    const sorted = sortRows(laneRows, $("#materialSort")?.value, {
      category_asc: (a, b) => lower(a.category).localeCompare(lower(b.category)) || lower(a.name).localeCompare(lower(b.name)),
      stock_asc: (a, b) => stockNumber(a) - stockNumber(b),
      stock_desc: (a, b) => stockNumber(b) - stockNumber(a),
      default: (a, b) => lower(a.name).localeCompare(lower(b.name)),
      name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name))
    });

    const meta = paginateRows("materials", sorted);
    
    renderMaterialsOverview(rows, costMap, kitMap);
    renderMaterialStatusTabs(rows, costMap, kitMap);
    renderMaterialsTable(meta.rows, costMap, kitMap);
    renderPagination("#materialPagination", "materials", meta);
    renderMaterialWorkspace();
  }

  return {
    loadMaterials,
    refreshMaterialSelects,
    refreshMaterialHierarchyFilters,
    renderMaterials,
    renderMaterialWorkspace
  };
}


