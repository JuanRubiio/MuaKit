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
    hierarchySummary
  } = ctx;

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
    return {
      id: elements.id?.value || "",
      name: elements.name?.value || "",
      preferred_supplier_id: elements.preferred_supplier_id?.value || "",
      preferred_supplier_name:
        state.suppliers.find((supplier) => String(supplier.id) === String(elements.preferred_supplier_id?.value || ""))?.name || "",
      category: elements.category?.value || "",
      unit_label: elements.unit_label?.value || "ud",
      image_url_override: elements.image_url_override?.value || "",
      image_url: elements.image_url_override?.value || "",
      is_outlet: Boolean(elements.is_outlet?.checked),
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

    return [
      {
        key: "reorder",
        title: "Reposición urgente",
        hint: reorder[0]?.name || "No hay compras urgentes.",
        count: reorder.length,
        lane: "reorder",
        tone: reorder.length ? "warn" : "ok"
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
    const withCost = active.filter((row) => hasCost(row, costMap));
    const noImage = active.filter((row) => !hasImage(row));
    const inKits = active.filter((row) => kitUsage(row.id, kitMap).length);
    const outlet = active.filter((row) => row.is_outlet);
    const missingSupplier = active.filter((row) => !number(row.preferred_supplier_id));

    $("#materialsUpdatedMeta").textContent = active.length
      ? `Actualizado · ${new Date().toLocaleDateString("es-ES")}`
      : "Catálogo listo para revisar";

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

    const priorityRows = reorder
      .sort((a, b) => stockNumber(a) - stockNumber(b) || reorderNumber(b) - reorderNumber(a))
      .slice(0, 4);
    $("#materialPriorityCards").innerHTML = priorityRows.length
      ? priorityRows
          .map((material) => {
            const current = stockNumber(material);
            const min = reorderNumber(material);
            const target = number(material.target_stock);
            const fill = min > 0 ? Math.max(0, Math.min(100, (current / Math.max(min, target || min)) * 100)) : 0;
            return `
              <article class="materials-priority-card">
                <div class="materials-priority-card-head">
                  <div class="materials-priority-thumb">${materialThumb(material, "priority")}</div>
                  <div class="materials-priority-copy">
                    <strong>${text(material.name)}</strong>
                    <small>${text(material.preferred_supplier_name || "Sin proveedor")}</small>
                    <p>${text(hierarchySummary(material) || material.category || "Sin clasificación")}</p>
                  </div>
                </div>
                <div class="materials-priority-stats">
                  <span><small>Stock</small><strong>${text(String(current))}</strong></span>
                  <span><small>Mínimo</small><strong>${text(String(min || "-"))}</strong></span>
                  <span><small>Coste</small><strong>${formatEuro(unitCost(material, costMap), "—")}</strong></span>
                </div>
                <div class="materials-priority-meter" aria-hidden="true"><i style="width:${fill}%"></i></div>
                <div class="materials-priority-actions">
                  <span class="status-pill warn">Reponer</span>
                  <button type="button" class="ghost button-with-icon" data-view-material="${material.id}"><svg><use href="#icon-eye"></use></svg><span>Ver</span></button>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state small"><strong>Sin compras urgentes</strong>Los materiales con stock crítico aparecerán aquí.</div>`;

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
            const kits = kitUsage(material.id, kitMap);
            const cost = unitCost(material, costMap);
            const imageMarkup = materialThumb(material, "table");
            return `
              <article class="materials-table-row ${String(currentMaterialId) === String(material.id) ? "active" : ""} ${material.is_deleted ? "deleted" : ""}">
                <span class="materials-check" aria-hidden="true"></span>
                <div class="materials-cell-main">
                  <div class="materials-cell-thumb">${imageMarkup}</div>
                  <div class="materials-cell-copy">
                    <strong>${text(material.name)}</strong>
                    <small>${text(hierarchySummary(material) || material.category || "Sin clasificación")}</small>
                    <small class="meta">${text(material.notes || "Sin observaciones")}</small>
                  </div>
                </div>
                <span>${text(material.preferred_supplier_name || "Sin proveedor")}</span>
                <div class="materials-stock-cell">
                  <strong>${text(String(stockNumber(material)))}</strong>
                  <div class="materials-stock-meter"><i style="width:${Math.max(6, Math.min(100, (stockNumber(material) / Math.max(reorderThreshold(material) || 1, number(material.target_stock) || 1)) * 100))}%"></i></div>
                </div>
                <span>${text(reorderNumber(material) ? String(reorderNumber(material)) : "—")}</span>
                <span>${text(number(material.target_stock) ? String(number(material.target_stock)) : "—")}</span>
                <span>${cost == null ? "—" : formatEuro(cost)}</span>
                <span>${hasImage(material) ? badge("Sí", "ok") : badge("No", "warn")}</span>
                <span>${kits.length ? badge(`${kits.length}`, "ok") : badge("0")}</span>
                <div class="row-actions icon-actions">
                  <button type="button" class="ghost icon-only" data-view-material="${material.id}" aria-label="Abrir material">
                    <svg><use href="#icon-eye"></use></svg>
                  </button>
                  <button type="button" class="ghost icon-only" data-open-cost="${material.id}" aria-label="Abrir costes">
                    <svg><use href="#icon-coin"></use></svg>
                  </button>
                  ${
                    material.is_deleted
                      ? `<button type="button" class="ghost icon-only" data-restore-material="${material.id}" aria-label="Restaurar material"><svg><use href="#icon-save"></use></svg></button>`
                      : `<button type="button" class="ghost danger-text icon-only" data-delete-material="${material.id}" aria-label="Archivar material"><svg><use href="#icon-archive"></use></svg></button>`
                  }
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state"><strong>Sin materiales con esos filtros</strong>Ajusta búsqueda, jerarquías o la cola de revisión para volver a poblar la tabla.</div>`;
  }

  function renderMaterialWorkspace(explicitMaterial = null) {
    const form = $("#materialForm");
    if (!form || form.classList.contains("hidden")) return;

    const material = currentMaterialFormState(explicitMaterial) || {};
    const costMap = materialCostMap();
    const kitMap = materialKitMap();
    const kits = material.id ? kitUsage(material.id, kitMap) : [];
    const cost = material.id ? unitCost(material, costMap) : null;
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
    if (form.elements.effective_stock_qty && !String(form.elements.effective_stock_qty.value || "").trim()) {
      form.elements.effective_stock_qty.value = String(stockNumber(material));
    }

    const imageUrl = material.image_url_override || material.image_url || "";
    $("#materialFormPreview").classList.toggle("hidden", !material.name && !imageUrl);
    $("#materialFormPreview").innerHTML = `
      <div class="selected-material-card-media">${materialThumb(material, "preview")}</div>
      <div class="selected-material-card-copy">
        <strong>${text(material.name || "Nuevo material")}</strong>
        <div class="tags">
          ${material.category ? badge(material.category) : ""}
          ${material.usage_type ? badge(material.usage_type) : ""}
          ${material.family ? badge(material.family) : ""}
          ${material.subfamily ? badge(material.subfamily) : ""}
          ${material.variant ? badge(material.variant) : ""}
          ${material.base_material ? badge(material.base_material) : ""}
          ${material.finish ? badge(material.finish) : ""}
          ${material.is_outlet ? badge("outlet", "warn") : ""}
        </div>
        <small>${text(material.preferred_supplier_name || "Sin proveedor")} · Stock Shopify ${text(String(stockNumber(material)))}</small>
      </div>
    `;

    $("#materialFormTitle").textContent = material.id ? text(material.name || `Material #${material.id}`) : "Nuevo material";
    $("#materialFormStatusBadge").textContent = material.id ? "Catálogo activo" : "Borrador catálogo";
    $("#materialFormStatusBadge").className = `status-pill ${material.id ? "ok" : "warn"}`;
    $("#materialFormSubtitle").textContent = material.id
      ? `${text(material.category || "Sin categoría")} · ${text(material.preferred_supplier_name || "Sin proveedor")} · ${kits.length} kits vinculados`
      : "Completa la información del material para inventario, costes y kits.";

    $("#materialFormKitUsage").innerHTML = kits.length
      ? kits
          .map(
            (item) => `
        <article class="material-kit-row">
          <div>
            <strong>${text(item.kitName)}${item.version ? ` · ${text(item.version)}` : ""}</strong>
            <small>${text(item.role)} · ${text(String(item.quantity))} por kit</small>
          </div>
          <button type="button" class="ghost button-with-icon" data-open-kit="${item.kitId}">
            <svg><use href="#icon-eye"></use></svg><span>Ver kit</span>
          </button>
        </article>
      `
          )
          .join("")
      : `<div class="empty-state small"><strong>Sin uso en kits</strong>Cuando este material forme parte de una receta aparecerá aquí.</div>`;

    const review = [
      {
        icon: "icon-tag",
        tone: material.name ? "ok" : "warn",
        title: "Identidad",
        detail: material.name ? "Nombre y categoría listos." : "Falta el nombre del material."
      },
      {
        icon: "icon-users",
        tone: number(material.preferred_supplier_id) ? "ok" : "warn",
        title: "Proveedor",
        detail: number(material.preferred_supplier_id)
          ? text(material.preferred_supplier_name || "Proveedor asignado.")
          : "Conviene asignar un proveedor."
      },
      {
        icon: "icon-image",
        tone: hasImage(material) ? "ok" : "warn",
        title: "Imagen",
        detail: hasImage(material) ? "El material ya tiene vista previa." : "Falta una imagen para reconocerlo."
      },
      {
        icon: "icon-coin",
        tone: cost != null ? "ok" : "pending",
        title: "Coste",
        detail: cost != null ? `Coste medio ${formatEuro(cost)}` : "Guárdalo y crea su coste medio."
      },
      {
        icon: "icon-kit",
        tone: kits.length ? "ok" : "neutral",
        title: "Uso en kits",
        detail: kits.length ? `${kits.length} recetas lo están usando.` : "Aún no está vinculado a ningún kit."
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
        : kits.length
          ? "ok"
          : "neutral";
    const suggestionText = !material.name || !material.category
      ? "Completa la identidad básica del material antes de guardarlo."
      : cost == null
        ? "Guárdalo y abre Costes para registrar su primer lote."
        : kits.length
          ? "Ya está listo para inventario, kits y seguimiento económico."
          : "El siguiente paso natural es vincularlo a un kit o receta.";
    $("#materialFormSuggestion").className = `invoice-inline-status income-suggestion ${suggestionTone}`;
    $("#materialFormSuggestion").innerHTML = `
      <span class="status-dot"></span>
      <strong>${text(suggestionText)}</strong>
    `;

    const nextSteps = [
      {
        icon: "icon-coin",
        title: cost == null ? "Crear coste ahora" : "Revisar evolución del coste",
        detail: cost == null ? "Después de guardar podrás abrir su ficha de costes." : "Abre el detalle del coste por lotes.",
        action: material.id ? `<button type="button" class="ghost button-with-icon" data-open-cost="${material.id}"><svg><use href="#icon-eye"></use></svg><span>Ver costes</span></button>` : ""
      },
      {
        icon: "icon-kit",
        title: kits.length ? "Comprobar recetas activas" : "Preparar uso en kits",
        detail: kits.length ? "Este material ya tiene impacto operativo." : "Úsalo en recetas cuando el catálogo esté listo.",
        action: kits[0] ? `<button type="button" class="ghost button-with-icon" data-open-kit="${kits[0].kitId}"><svg><use href="#icon-eye"></use></svg><span>Abrir kit</span></button>` : ""
      },
      {
        icon: "icon-chart",
        title: isReorderRisk(material) ? "Material en zona de reposición" : "Stock estable",
        detail: isReorderRisk(material)
          ? `Stock ${text(String(stockNumber(material)))} frente a mínimo ${text(String(reorderNumber(material)))}.`
          : "Define punto de reposición y objetivo para activar alertas."
      }
    ];
    $("#materialFormNextSteps").innerHTML = nextSteps
      .map(
        (step) => `
      <article class="material-next-step">
        <i class="invoice-check-icon neutral" aria-hidden="true"><svg><use href="#${step.icon}"></use></svg></i>
        <div>
          <strong>${text(step.title)}</strong>
          <small>${text(step.detail)}</small>
        </div>
        ${step.action || ""}
      </article>
    `
      )
      .join("");

    $("#materialFormRegistryInfo").innerHTML = `
      <div class="income-origin-row"><span>Proveedor</span><strong>${text(material.preferred_supplier_name || "Sin asignar")}</strong></div>
      <div class="income-origin-row"><span>Jerarquía</span><strong>${text(hierarchySummary(material) || "Pendiente")}</strong></div>
      <div class="income-origin-row"><span>Tipo</span><strong>${material.is_outlet ? "Outlet" : "Catálogo principal"}</strong></div>
      <div class="income-origin-row"><span>Imagen</span><strong>${hasImage(material) ? "Disponible" : "Pendiente"}</strong></div>
      <div class="income-origin-row"><span>Coste medio</span><strong>${cost == null ? "Sin coste" : formatEuro(cost)}</strong></div>
    `;

    $("#materialFooterStock").textContent = `${text(String(stockNumber(material)))} ud`;
    $("#materialFooterReorder").textContent = reorderNumber(material) ? `${text(String(reorderNumber(material)))} ud` : "Sin mínimo";
    $("#materialFooterTarget").textContent = number(material.target_stock) ? `${text(String(number(material.target_stock)))} ud` : "Sin objetivo";
    $("#materialFooterCost").textContent = cost == null ? "Sin coste" : formatEuro(cost);
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
    $("#materialResultText").textContent = `${meta.total} materiales visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;

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

