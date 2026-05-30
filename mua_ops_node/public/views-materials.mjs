export function createMaterialViews(ctx) {
  const {
    state,
    $,
    $$,
    api,
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
    img
  } = ctx;

  function refreshMaterialHierarchyFilters() {
    const mappings = [
      ["#materialUsageFilter", "usage_type", "Todos"],
      ["#materialFamilyFilter", "family", "Todas"],
      ["#materialSubfamilyFilter", "subfamily", "Todas"],
      ["#materialVariantFilter", "variant", "Todas"],
      ["#materialBaseFilter", "base_material", "Todos"],
      ["#materialFinishFilter", "finish", "Todos"]
    ];
    mappings.forEach(([selector, key, empty]) => {
      const select = $(selector);
      if (!select) return;
      const current = select.value;
      select.innerHTML = optionList(distinctValues(state.materials.filter((row) => !row.is_deleted), key), current, empty);
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

  function supplierMaterialOptions(selected = "", first = "Sin material") {
    const active = state.materials.filter((material) => !material.is_deleted);
    return `<option value="">${text(first)}</option>${active.map((material) => `
      <option value="${material.id}" ${String(material.id) === String(selected) ? "selected" : ""}>${text(material.name)} · ${text(material.category)}</option>
    `).join("")}`;
  }

  function renderMaterials() {
    let rows = [...state.materials];
    rows = applyTextSearch(rows, $("#materialSearch")?.value, ["name", "category", "notes", "preferred_supplier_name", "usage_type", "family", "subfamily", "variant", "base_material", "finish"]);
    const category = $("#materialCategoryFilter")?.value;
    const supplier = $("#materialSupplierFilter")?.value;
    const usage = $("#materialUsageFilter")?.value;
    const family = $("#materialFamilyFilter")?.value;
    const subfamily = $("#materialSubfamilyFilter")?.value;
    const variant = $("#materialVariantFilter")?.value;
    const baseMaterial = $("#materialBaseFilter")?.value;
    const finish = $("#materialFinishFilter")?.value;
    const outlet = $("#materialOutletFilter")?.value;
    if (category) rows = rows.filter((material) => material.category === category);
    if (supplier) rows = rows.filter((material) => String(material.preferred_supplier_id || "") === String(supplier));
    if (usage) rows = rows.filter((material) => String(material.usage_type || "") === usage);
    if (family) rows = rows.filter((material) => String(material.family || "") === family);
    if (subfamily) rows = rows.filter((material) => String(material.subfamily || "") === subfamily);
    if (variant) rows = rows.filter((material) => String(material.variant || "") === variant);
    if (baseMaterial) rows = rows.filter((material) => String(material.base_material || "") === baseMaterial);
    if (finish) rows = rows.filter((material) => String(material.finish || "") === finish);
    if (outlet === "1") rows = rows.filter((material) => Boolean(material.is_outlet));
    if (outlet === "0") rows = rows.filter((material) => !material.is_outlet);
    rows = sortRows(rows, $("#materialSort")?.value, {
      category_asc: (a, b) => lower(a.category).localeCompare(lower(b.category)) || lower(a.name).localeCompare(lower(b.name)),
      stock_asc: (a, b) => number(a.effective_stock_qty) - number(b.effective_stock_qty),
      stock_desc: (a, b) => number(b.effective_stock_qty) - number(a.effective_stock_qty),
      default: (a, b) => lower(a.name).localeCompare(lower(b.name)),
      name_asc: (a, b) => lower(a.name).localeCompare(lower(b.name))
    });
    const meta = paginateRows("materials", rows);
    $("#materialResultText").textContent = `${meta.total} materiales visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
    $("#materialList").innerHTML = meta.rows.map((material) => `
      <article class="row material-row ${material.is_deleted ? "deleted" : ""}">
        <div class="material-thumb">${img(material.image_url)}</div>
        <div class="row-main">
          <strong>${text(material.name)}</strong>
          <div class="tags">
            ${badge(material.category)}
            ${badge(material.unit_label || "ud")}
            ${badge(material.preferred_supplier_name || "sin proveedor")}
            ${material.linked_product_count ? badge(`${material.linked_product_count} imagen`, "ok") : badge("sin imagen", "warn")}
            ${material.is_outlet ? badge("outlet", "warn") : ""}
            ${material.usage_type ? badge(material.usage_type) : ""}
            ${material.family ? badge(material.family) : ""}
            ${material.subfamily ? badge(material.subfamily) : ""}
            ${material.variant ? badge(material.variant) : ""}
            ${material.base_material ? badge(material.base_material) : ""}
            ${material.finish ? badge(material.finish) : ""}
          </div>
          <div class="meta">Stock Shopify ${material.effective_stock_qty ?? "-"} · Reposición ${material.reorder_point ?? "-"} · Objetivo ${material.target_stock ?? "-"}</div>
          ${material.notes ? `<p>${text(material.notes)}</p>` : ""}
        </div>
        <div class="row-actions">
          <button data-view-material="${material.id}" type="button" class="ghost">Ver</button>
          ${material.is_deleted ? `<button data-restore-material="${material.id}" type="button">Restaurar</button>` : `<button class="ghost" data-delete-material="${material.id}" type="button">Archivar</button>`}
        </div>
      </article>
    `).join("") || `<div class="empty-state">No hay materiales con esos filtros.</div>`;
    renderPagination("#materialPagination", "materials", meta);
  }

  return {
    loadMaterials,
    refreshMaterialSelects,
    refreshMaterialHierarchyFilters,
    renderMaterials
  };
}
