function registerMaterialRoutes(app, ctx) {
  const {
    query,
    one,
    optionalN,
    insert,
    saveDb,
    audit,
    exec,
    nowPatch,
    softDelete,
    restore,
    notFound,
    materialPayload,
    inferMaterialHierarchy,
    importShopify,
    PRODUCTS_CSV,
    INVENTORY_CSV
  } = ctx;

  app.get("/api/materials", (req, res) => {
    const q = `%${req.query.q || ""}%`;
    const includeDeleted = req.query.include_deleted === "1";
    const rows = query(
      `SELECT m.*, s.name AS preferred_supplier_name,
              COALESCE(NULLIF(m.image_url_override, ''), (
                SELECT sp.image_url
                FROM shopify_products sp
                WHERE sp.material_id = m.id AND sp.image_url != ''
                ORDER BY sp.shopify_available_qty DESC, sp.id
                LIMIT 1
              )) AS image_url,
              COALESCE((
                SELECT SUM(COALESCE(sp.shopify_inventory_qty, 0))
                FROM shopify_products sp
                WHERE sp.material_id = m.id
              ), 0) AS shopify_inventory_qty,
              COALESCE((
                SELECT SUM(COALESCE(sp.shopify_available_qty, 0))
                FROM shopify_products sp
                WHERE sp.material_id = m.id
              ), 0) AS shopify_available_qty,
              COALESCE((
                SELECT SUM(COALESCE(sp.shopify_available_qty, 0))
                FROM shopify_products sp
                WHERE sp.material_id = m.id
              ), 0) AS effective_stock_qty,
              (
                SELECT COUNT(*)
                FROM shopify_products sp2
                WHERE sp2.material_id = m.id
              ) AS linked_product_count
       FROM materials m
       LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
       WHERE ($includeDeleted = 1 OR m.is_deleted = 0)
         AND (
           m.name LIKE $q OR m.category LIKE $q OR m.notes LIKE $q OR
           m.usage_type LIKE $q OR m.family LIKE $q OR m.subfamily LIKE $q OR
           m.variant LIKE $q OR m.base_material LIKE $q OR m.finish LIKE $q
         )
       ORDER BY m.is_deleted, m.category, m.name`,
      { q, includeDeleted: includeDeleted ? 1 : 0 }
    );
    res.json(rows.map(materialPayload));
  });

  app.post("/api/materials", (req, res) => {
    const b = req.body;
    const inferred = inferMaterialHierarchy(b.name, b.category || "material");
    const id = insert(
      `INSERT INTO materials (name, category, unit_label, preferred_supplier_id, manual_stock, is_outlet, reorder_point, target_stock, image_url_override, usage_type, family, subfamily, variant, base_material, finish, notes)
       VALUES ($name, $category, $unit, $supplier, $stock, $is_outlet, $reorder, $target, $imageUrl, $usage_type, $family, $subfamily, $variant, $base_material, $finish, $notes)`,
      {
        name: b.name,
        category: b.category || "material",
        unit: b.unit_label || "ud",
        supplier: optionalN(b.preferred_supplier_id),
        stock: optionalN(b.manual_stock),
        is_outlet: b.is_outlet ? 1 : 0,
        reorder: optionalN(b.reorder_point),
        target: optionalN(b.target_stock),
        imageUrl: b.image_url_override || "",
        usage_type: b.usage_type || inferred.usage_type || "",
        family: b.family || inferred.family || "",
        subfamily: b.subfamily || inferred.subfamily || "",
        variant: b.variant || inferred.variant || "",
        base_material: b.base_material || inferred.base_material || "",
        finish: b.finish || inferred.finish || "",
        notes: b.notes || ""
      }
    );
    const after = materialPayload(one("SELECT * FROM materials WHERE id=$id", { id }));
    audit("material", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/materials/:id", (req, res) => {
    const before = one("SELECT * FROM materials WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res);
    const fields = [
      "name", "category", "unit_label", "preferred_supplier_id", "manual_stock", "is_outlet", "reorder_point", "target_stock",
      "image_url_override", "usage_type", "family", "subfamily", "variant", "base_material", "finish", "notes"
    ].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!fields.length) return res.json(materialPayload(before));
    const params = { id: req.params.id };
    for (const field of fields) {
      if (field === "is_outlet") params[field] = req.body[field] ? 1 : 0;
      else params[field] = req.body[field] === "" ? null : req.body[field];
    }
    exec(`UPDATE materials SET ${nowPatch("materials", fields)} WHERE id=$id`, params);
    const after = materialPayload(one("SELECT * FROM materials WHERE id=$id", { id: req.params.id }));
    audit("material", Number(req.params.id), "update", before, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/materials/:id", (req, res) => softDelete("materials", "material", req.params.id, res));
  app.post("/api/materials/:id/restore", (req, res) => restore("materials", "material", req.params.id, res));

  app.get("/api/shopify-products", (req, res) => {
    const q = `%${req.query.q || ""}%`;
    res.json(query(
      `SELECT sp.*, m.name AS material_name
       FROM shopify_products sp
       LEFT JOIN materials m ON m.id = sp.material_id
       WHERE sp.title LIKE $q OR sp.handle LIKE $q OR sp.sku LIKE $q
       ORDER BY sp.title
       LIMIT 500`,
      { q }
    ));
  });

  app.patch("/api/shopify-products/:id", (req, res) => {
    const before = one("SELECT * FROM shopify_products WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Producto Shopify no encontrado", "SHOPIFY_PRODUCT_NOT_FOUND");
    exec(
      `UPDATE shopify_products SET material_id=$material, notes=$notes, updated_at=CURRENT_TIMESTAMP WHERE id=$id`,
      { id: req.params.id, material: optionalN(req.body.material_id), notes: req.body.notes ?? before.notes }
    );
    const after = one("SELECT * FROM shopify_products WHERE id=$id", { id: req.params.id });
    audit("shopify_product", Number(req.params.id), "update", before, after);
    saveDb();
    res.json(after);
  });

  app.post("/api/import/shopify", (req, res) => res.json(importShopify(PRODUCTS_CSV, INVENTORY_CSV)));
}

module.exports = { registerMaterialRoutes };
