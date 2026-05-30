function registerKitRoutes(app, ctx) {
  const {
    one,
    n,
    optionalN,
    insert,
    saveDb,
    audit,
    badRequest,
    updateEntity,
    softDelete,
    restore,
    kitRecipes
  } = ctx;

  app.get("/api/kit-recipes", (req, res) => res.json(kitRecipes()));

  app.post("/api/kit-recipes", (req, res) => {
    const id = insert(
      `INSERT INTO kit_recipes (name, version, is_complete, notes)
       VALUES ($name, $version, $isComplete, $notes)`,
      {
        name: req.body.name,
        version: req.body.version || "",
        isComplete: req.body.is_complete ? 1 : 0,
        notes: req.body.notes || ""
      }
    );
    const after = one("SELECT * FROM kit_recipes WHERE id=$id", { id });
    audit("kit_recipe", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/kit-recipes/:id", (req, res) => {
    const payload = {
      ...req.body,
      is_complete: req.body.is_complete === undefined ? undefined : (req.body.is_complete ? 1 : 0)
    };
    updateEntity("kit_recipes", "kit_recipe", req.params.id, payload, ["name", "version", "is_complete", "notes"], res);
  });

  app.delete("/api/kit-recipes/:id", (req, res) => softDelete("kit_recipes", "kit_recipe", req.params.id, res));
  app.post("/api/kit-recipes/:id/restore", (req, res) => restore("kit_recipes", "kit_recipe", req.params.id, res));

  app.post("/api/kit-recipes/:id/items", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.id });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const itemId = insert(
      `INSERT INTO kit_recipe_items (recipe_id, material_id, quantity, notes)
       VALUES ($recipe, $material, $quantity, $notes)`,
      {
        recipe: req.params.id,
        material: optionalN(req.body.material_id),
        quantity: n(req.body.quantity, 1),
        notes: req.body.notes || ""
      }
    );
    const after = one("SELECT * FROM kit_recipe_items WHERE id=$id", { id: itemId });
    audit("kit_recipe_item", itemId, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    updateEntity("kit_recipe_items", "kit_recipe_item", req.params.itemId, req.body, ["material_id", "quantity", "notes"], res);
  });

  app.delete("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    softDelete("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });

  app.post("/api/kit-recipes/:recipeId/items/:itemId/restore", (req, res) => {
    restore("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });
}

module.exports = { registerKitRoutes };
